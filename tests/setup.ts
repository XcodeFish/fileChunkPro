/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 测试环境配置文件
 * 初始化浏览器环境、模拟小程序API等
 */

import { vi } from 'vitest';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { NetworkQuality } from '../src/types';
import FakeIndexedDB from 'fake-indexeddb';
import { DependencyContainer } from '../src/core/DependencyContainer';

// 设置MSW服务器
export const mswServer = setupServer();
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

// 模拟深度依赖的类和模块
vi.mock('../src/utils/NetworkDetector', () => {
  return {
    default: {
      create: vi.fn().mockReturnValue({
        detectNetworkQuality: vi.fn().mockResolvedValue(NetworkQuality.NORMAL),
        getNetworkQuality: vi.fn().mockReturnValue(NetworkQuality.NORMAL),
        addChangeListener: vi.fn(),
        removeChangeListener: vi.fn(),
        registerWithContainer: vi.fn(),
      }),
      getInstance: vi.fn().mockReturnValue({
        detectNetworkQuality: vi.fn().mockResolvedValue(NetworkQuality.NORMAL),
        getNetworkQuality: vi.fn().mockReturnValue(NetworkQuality.NORMAL),
        addChangeListener: vi.fn(),
        removeChangeListener: vi.fn(),
        registerWithContainer: vi.fn(),
      }),
    },
  };
});

vi.mock('../src/utils/EnvironmentDetector', () => {
  return {
    default: {
      getInstance: vi.fn().mockReturnValue({
        detectEnvironment: vi.fn().mockReturnValue('browser'),
        getDeviceCapabilities: vi.fn().mockReturnValue({
          cpuCores: 4,
          memorySize: 8 * 1024 * 1024 * 1024,
          isLowEndDevice: false,
          isHighEndDevice: true,
          deviceScore: 8,
        }),
        isSupported: vi.fn().mockReturnValue(true),
      }),
    },
  };
});

vi.mock('../src/utils/EnvironmentDetectionSystem', () => {
  return {
    default: {
      getInstance: vi.fn().mockReturnValue({
        detectEnvironment: vi.fn().mockReturnValue('browser'),
      }),
    },
  };
});

vi.mock('../src/utils/EnvUtils', () => {
  return {
    default: {
      detectEnvironment: vi.fn().mockReturnValue('browser'),
      isBrowser: vi.fn().mockReturnValue(true),
      isNode: vi.fn().mockReturnValue(false),
      isReactNative: vi.fn().mockReturnValue(false),
      isWechat: vi.fn().mockReturnValue(false),
    },
  };
});

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

  getNetworkQuality(): NetworkQuality {
    return this._quality;
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
      view[i] = Math.floor(Math.random() * 256);
    }
    return new File([buffer], name, { type: 'application/octet-stream' });
  }

  static async createImageFile(size = 300, name = 'test.png'): Promise<File> {
    // 创建一个简单的Canvas图像
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(size / 4, size / 4, size / 2, size / 2);

      // 转换为Blob
      return new Promise<File>((resolve, reject) => {
        canvas.toBlob(
          blob => {
            if (blob) {
              resolve(new File([blob], name, { type: 'image/png' }));
            } else {
              reject(new Error('无法创建图像文件'));
            }
          },
          'image/png',
          0.95
        );
      });
    } else {
      throw new Error('无法获取画布上下文');
    }
  }
}

// 添加全局模拟
if (typeof global !== 'undefined') {
  (global as any).NetworkDetector = MockNetworkDetector;
  (global as any).MemoryManager = MockMemoryManager;
  (global as any).TestFileGenerator = TestFileGenerator;

  // 创建可用于测试的全局依赖容器
  (global as any).TestDependencyContainer = new DependencyContainer();
}

// 导出模拟类，以便在测试中直接使用
export { MockMemoryManager, MockNetworkDetector };

/**
 * 测试环境全局设置
 */

// 模拟全局环境
globalThis.window = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as any;
globalThis.document = {} as any;

// 模拟 navigator
Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'test-user-agent',
    onLine: true,
    connection: {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  },
  writable: true,
});

// 模拟浏览器性能API
Object.defineProperty(window, 'performance', {
  value: {
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
    memory: {
      jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
      totalJSHeapSize: 1 * 1024 * 1024 * 1024,
      usedJSHeapSize: 0.5 * 1024 * 1024 * 1024,
    },
    timing: {
      navigationStart: Date.now() - 5000,
      connectStart: Date.now() - 4000,
      connectEnd: Date.now() - 3900,
      requestStart: Date.now() - 3800,
      responseStart: Date.now() - 1000,
      responseEnd: Date.now() - 800,
      domComplete: Date.now() - 100,
      loadEventEnd: Date.now(),
    },
  },
  writable: true,
});

// 模拟网络类型
import {
  NetworkType,
  NetworkQuality,
  EnvironmentType,
} from '../src/types/network';

// 注册环境类型模拟
if (!globalThis.EnvironmentType) {
  globalThis.EnvironmentType = EnvironmentType;
}

// 注册网络类型模拟
if (!globalThis.NetworkType) {
  globalThis.NetworkType = NetworkType;
}

// 注册网络质量模拟
if (!globalThis.NetworkQuality) {
  globalThis.NetworkQuality = NetworkQuality;
}

// 模拟上传组件
vi.mock('../src/core/UploaderCore', () => {
  return {
    UploaderCore: vi.fn().mockImplementation(() => ({
      addPlugin: vi.fn(),
      removePlugin: vi.fn(),
      upload: vi.fn().mockResolvedValue({ success: true }),
    })),
  };
});

// 模拟事件总线
vi.mock('../src/core/EventBus', () => {
  const listeners = new Map();

  return {
    EventBus: vi.fn().mockImplementation(() => ({
      on: vi.fn((event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(callback);
      }),
      off: vi.fn((event, callback) => {
        if (listeners.has(event)) {
          const callbacks = listeners.get(event);
          const index = callbacks.indexOf(callback);
          if (index !== -1) {
            callbacks.splice(index, 1);
          }
        }
      }),
      emit: vi.fn((event, data) => {
        if (listeners.has(event)) {
          listeners
            .get(event)
            .forEach((callback: (data: any) => void) => callback(data));
        }
      }),
      getListeners: vi.fn(event => listeners.get(event) || []),
    })),
    getInstance: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    })),
  };
});

// 模拟依赖容器
vi.mock('../src/core/DependencyContainer', () => {
  const services = new Map();

  return {
    DependencyContainer: vi.fn().mockImplementation(() => ({
      register: vi.fn((key, instance) => {
        services.set(key, instance);
      }),
      registerFactory: vi.fn((key, factory) => {
        services.set(key, factory);
      }),
      get: vi.fn(key => {
        const service = services.get(key);
        if (typeof service === 'function') {
          return service();
        }
        return service;
      }),
      has: vi.fn(key => services.has(key)),
      remove: vi.fn(key => services.delete(key)),
      clear: vi.fn(() => services.clear()),
    })),
    getInstance: vi.fn().mockImplementation(() => ({
      register: vi.fn(),
      registerFactory: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    })),
  };
});
