/**
 * 测试环境配置文件
 * 初始化浏览器环境、模拟小程序API等
 */

import { vi } from 'vitest';

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
