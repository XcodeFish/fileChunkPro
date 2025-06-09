/**
 * 测试环境配置文件
 * 初始化浏览器环境、模拟小程序API等
 */

import { vi } from 'vitest';

import { NetworkQuality } from '../src/types';

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
  detectNetworkQuality(): Promise<NetworkQuality> {
    return Promise.resolve('good' as NetworkQuality);
  }

  getNetworkStatus() {
    return 'online';
  }

  detectNetworkStatus() {
    return Promise.resolve('online');
  }

  detectNetworkCondition() {
    return Promise.resolve({
      type: 'wifi',
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
    });
  }

  addChangeListener(): void {
    // 空方法实现
  }

  removeChangeListener(): void {
    // 空方法实现
  }

  dispose(): void {
    // 空方法实现
  }
}

// 添加全局模拟
if (typeof global !== 'undefined') {
  (global as any).NetworkDetector = MockNetworkDetector;
  (global as any).MemoryManager = MockMemoryManager;
}
