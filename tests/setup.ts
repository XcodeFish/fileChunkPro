/**
 * 测试环境配置文件
 * 初始化浏览器环境、模拟小程序API等
 */

import { vi } from 'vitest';
import { setupServer } from 'msw/node';
import { NetworkQuality } from '../src/types';
// 只在需要时导入 rest
// import { rest } from 'msw';
import FakeIndexedDB from 'fake-indexeddb';

// 设置MSW服务器
export const mswServer = setupServer();
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

// 网络条件模拟
export const mockNetworkCondition = (options: {
  latency?: number;
  status?: number;
  errorProbability?: number;
  throttle?: boolean;
  offline?: boolean;
}) => {
  const {
    latency = 0,
    status = 200,
    errorProbability = 0,
    throttle = false,
    offline = false,
  } = options;

  return (req: any, res: any, ctx: any) => {
    // 模拟离线状态
    if (offline) {
      return res(ctx.status(0), ctx.json({ error: 'Network disconnected' }));
    }

    // 模拟随机错误
    if (Math.random() < errorProbability) {
      return res(ctx.status(500), ctx.json({ error: 'Random server error' }));
    }

    // 添加延迟
    const delay = throttle ? latency * (0.5 + Math.random()) : latency;

    // 返回请求
    return res(ctx.delay(delay), ctx.status(status));
  };
};

// 为小程序环境模拟API
if (typeof global !== 'undefined') {
  // 模拟微信小程序API
  (global as any).wx = {
    getFileSystemManager: () => ({
      readFile: vi.fn(),
      writeFile: vi.fn(),
    }),
    request: vi.fn(),
    uploadFile: vi.fn(),
  };

  // 模拟支付宝小程序API
  (global as any).my = {
    getFileSystemManager: () => ({
      readFile: vi.fn(),
      writeFile: vi.fn(),
    }),
    request: vi.fn(),
    uploadFile: vi.fn(),
  };

  // 模拟字节跳动小程序API
  (global as any).tt = {
    getFileSystemManager: vi.fn(),
    request: vi.fn(),
    uploadFile: vi.fn(),
  };
}

// 浏览器环境模拟
if (typeof window !== 'undefined') {
  // 模拟 Worker
  if (!('Worker' in window)) {
    Object.defineProperty(window, 'Worker', {
      value: class MockWorker {
        onmessage: any;
        constructor() {
          setTimeout(() => {
            this.onmessage && this.onmessage({ data: 'mock response' });
          }, 0);
        }
        postMessage() {
          /* empty */
        }
        terminate() {
          /* empty */
        }
      },
    });
  }

  // 模拟IndexedDB
  if (!('indexedDB' in window)) {
    Object.defineProperty(window, 'indexedDB', {
      value: FakeIndexedDB,
      writable: true,
    });
  }
}

// 模拟MemoryManager
class MockMemoryManager {
  static isLowMemoryDevice(): boolean {
    return false;
  }

  static isLowPowerDevice(): boolean {
    return false;
  }

  static getOptimalChunkSize(fileSize: number): number {
    return Math.min(fileSize / 10, 5 * 1024 * 1024);
  }

  static isLowMemory(): boolean {
    return false;
  }

  static isCriticalMemory(): boolean {
    return false;
  }

  static suggestGarbageCollection(): void {
    // 空方法实现
  }

  static getMemoryStats(): any {
    return {
      usage: 100 * 1024 * 1024,
      limit: 1024 * 1024 * 1024,
      usageRatio: 0.1,
      growthRate: 0,
      trend: 'stable',
    };
  }
}

// 模拟NetworkDetector
class MockNetworkDetector {
  private _quality: NetworkQuality = 'good';
  private _type = 'wifi';

  constructor(options?: {
    initialQuality?: NetworkQuality;
    initialType?: string;
  }) {
    if (options?.initialQuality) {
      this._quality = options.initialQuality;
    }
    if (options?.initialType) {
      this._type = options.initialType;
    }
  }

  detectNetworkQuality(): Promise<NetworkQuality> {
    return Promise.resolve(this._quality);
  }

  getNetworkStatus() {
    return this._type === 'none' ? 'offline' : 'online';
  }

  detectNetworkStatus() {
    return Promise.resolve(this.getNetworkStatus());
  }

  detectNetworkCondition() {
    const conditions = {
      wifi: { downlink: 10, rtt: 50 },
      '4g': { downlink: 5, rtt: 100 },
      '3g': { downlink: 2, rtt: 300 },
      '2g': { downlink: 0.5, rtt: 600 },
      'slow-2g': { downlink: 0.1, rtt: 2000 },
      none: { downlink: 0, rtt: Infinity },
    };

    const condition = conditions[this._type] || conditions['wifi'];

    return Promise.resolve({
      type: this._type,
      effectiveType: this._type === 'wifi' ? '4g' : this._type,
      downlink: condition.downlink,
      rtt: condition.rtt,
    });
  }

  // 用于测试的方法：模拟网络状态变化
  mockNetworkChange(quality: NetworkQuality, type: string) {
    this._quality = quality;
    this._type = type;
    if (this._listeners.change) {
      this._listeners.change.forEach(listener =>
        listener({
          type: 'change',
          quality: this._quality,
          networkType: this._type,
        })
      );
    }
  }

  private _listeners: Record<string, Array<(event: any) => void>> = {
    change: [],
  };

  addChangeListener(listener: (event: any) => void): void {
    if (!this._listeners.change) {
      this._listeners.change = [];
    }
    this._listeners.change.push(listener);
  }

  removeChangeListener(listener: (event: any) => void): void {
    if (this._listeners.change) {
      const index = this._listeners.change.indexOf(listener);
      if (index !== -1) {
        this._listeners.change.splice(index, 1);
      }
    }
  }

  dispose(): void {
    this._listeners = { change: [] };
  }
}

// 测试文件生成器
export class TestFileGenerator {
  static createTextFile(sizeInBytes: number, name = 'test.txt'): File {
    const content = 'A'.repeat(sizeInBytes);
    return new File([content], name, { type: 'text/plain' });
  }

  static createBinaryFile(sizeInBytes: number, name = 'test.bin'): File {
    const buffer = new ArrayBuffer(sizeInBytes);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < sizeInBytes; i++) {
      view[i] = i % 256;
    }
    return new File([buffer], name, { type: 'application/octet-stream' });
  }

  static createImageFile(size = 300, name = 'test.png'): Promise<File> {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 创建一个简单的图像
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(size / 4, size / 4, size / 2, size / 2);
      }

      canvas.toBlob(blob => {
        if (blob) {
          resolve(new File([blob], name, { type: 'image/png' }));
        } else {
          // 回退方案
          resolve(this.createBinaryFile(size * size * 4, name));
        }
      }, 'image/png');
    });
  }
}

// 添加全局模拟
if (typeof global !== 'undefined') {
  (global as any).NetworkDetector = MockNetworkDetector;
  (global as any).MemoryManager = MockMemoryManager;
  (global as any).TestFileGenerator = TestFileGenerator;
}
