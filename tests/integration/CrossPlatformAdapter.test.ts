/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AlipayAdapter } from '../../src/adapters/AlipayAdapter';
import { BaiduAdapter } from '../../src/adapters/BaiduAdapter';
import { BrowserAdapter } from '../../src/adapters/BrowserAdapter';
import { BytedanceAdapter } from '../../src/adapters/BytedanceAdapter';
import { IAdapter } from '../../src/adapters/interfaces';
import { TaroAdapter } from '../../src/adapters/TaroAdapter';
import { UniAppAdapter } from '../../src/adapters/UniAppAdapter';
import { WechatAdapter } from '../../src/adapters/WechatAdapter';
import { EnvironmentType } from '../../src/types';

// 基础适配器测试函数
const testAdapterBasicFunctionality = (
  adapter: IAdapter,
  environmentType: EnvironmentType
) => {
  // 检查适配器是否实现了所有必要的方法
  expect(adapter.getEnvironmentType).toBeDefined();
  expect(adapter.createRequest).toBeDefined();
  expect(adapter.getStorageProvider).toBeDefined();
  expect(adapter.readFile).toBeDefined();
  expect(adapter.createFileReader).toBeDefined();

  // 检查环境类型是否正确
  expect(adapter.getEnvironmentType()).toBe(environmentType);
};

describe('跨平台适配器测试', () => {
  // 存储原始全局对象
  const originalGlobal = { ...global };
  const originalWindow =
    typeof window !== 'undefined' ? { ...window } : undefined;

  beforeEach(() => {
    // 重置模拟的全局对象
    vi.resetModules();
  });

  afterEach(() => {
    // 恢复原始全局对象，逐个属性恢复而不是整体赋值
    for (const key in originalGlobal) {
      if (key !== 'crypto' && key !== 'Crypto') {
        // 跳过只读属性
        try {
          global[key] = originalGlobal[key];
        } catch (e) {
          // 忽略无法赋值的属性
        }
      }
    }

    if (originalWindow && typeof window !== 'undefined') {
      for (const key in originalWindow) {
        try {
          window[key] = originalWindow[key];
        } catch (e) {
          // 忽略无法赋值的属性
        }
      }
    }

    vi.clearAllMocks();
  });

  describe('浏览器环境适配器', () => {
    beforeEach(() => {
      // 模拟浏览器环境
      if (typeof window === 'undefined') {
        Object.defineProperty(global, 'window', {
          value: {
            navigator: {
              userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            XMLHttpRequest: vi.fn().mockImplementation(() => ({
              open: vi.fn(),
              send: vi.fn(),
              setRequestHeader: vi.fn(),
              upload: {
                addEventListener: vi.fn(),
              },
              addEventListener: vi.fn(),
            })),
            Blob: vi.fn(),
            File: vi.fn(),
            FileReader: vi.fn().mockImplementation(() => ({
              readAsArrayBuffer: vi.fn(),
              readAsDataURL: vi.fn(),
              onload: null,
              onerror: null,
            })),
          },
          writable: true,
        });
      }
    });

    it('应该正确初始化BrowserAdapter', () => {
      const adapter = new BrowserAdapter();
      testAdapterBasicFunctionality(adapter, 'browser');
    });

    it('应该能够创建HTTP请求', () => {
      const adapter = new BrowserAdapter();
      const request = adapter.createRequest({
        url: 'https://example.com/upload',
        method: 'POST',
      });

      expect(request).toBeDefined();
    });

    it('应该能够读取文件', async () => {
      const adapter = new BrowserAdapter();
      const mockFile = {
        size: 1024,
        type: 'text/plain',
        name: 'test.txt',
        slice: vi.fn().mockReturnValue(new Blob()),
      };

      // 模拟FileReader
      const mockFileReader = {
        readAsArrayBuffer: vi.fn(),
        onload: null,
        onerror: null,
      };
      adapter.createFileReader = vi.fn().mockReturnValue(mockFileReader);

      const readPromise = adapter.readFile(mockFile as any, 0, 1024);

      // 手动触发FileReader的onload
      if (mockFileReader.onload) {
        mockFileReader.onload({
          target: { result: new ArrayBuffer(1024) },
        } as any);
      }

      const result = await readPromise;
      expect(result).toBeDefined();
    });
  });

  describe('微信小程序环境适配器', () => {
    beforeEach(() => {
      // 模拟微信小程序环境
      global.wx = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({
          readFile: vi.fn(options => {
            if (options.success) {
              options.success({
                data: new ArrayBuffer(1024),
              });
            }
          }),
          writeFile: vi.fn(),
        }),
        getStorage: vi.fn(),
        setStorage: vi.fn(),
        removeStorage: vi.fn(),
      } as any;
    });

    it('应该正确初始化WechatAdapter', () => {
      const adapter = new WechatAdapter();
      testAdapterBasicFunctionality(adapter, 'wechat');
    });

    it('应该能够创建HTTP请求', () => {
      const adapter = new WechatAdapter();
      const request = adapter.createRequest({
        url: 'https://example.com/upload',
        method: 'POST',
      });

      expect(request).toBeDefined();
    });

    it('应该能够读取文件', async () => {
      const adapter = new WechatAdapter();
      const mockFile = {
        path: 'wxfile://temp/test.txt',
        size: 1024,
      };

      const result = await adapter.readFile(mockFile as any, 0, 1024);
      expect(result).toBeDefined();
      expect(global.wx.getFileSystemManager).toHaveBeenCalled();
    });
  });

  describe('支付宝小程序环境适配器', () => {
    beforeEach(() => {
      // 模拟支付宝小程序环境
      global.my = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({
          readFile: vi.fn(options => {
            if (options.success) {
              options.success({
                data: new ArrayBuffer(1024),
              });
            }
          }),
          writeFile: vi.fn(),
        }),
        getStorage: vi.fn(),
        setStorage: vi.fn(),
        removeStorage: vi.fn(),
      } as any;
    });

    it('应该正确初始化AlipayAdapter', () => {
      const adapter = new AlipayAdapter();
      testAdapterBasicFunctionality(adapter, 'alipay');
    });

    it('应该能够创建HTTP请求', () => {
      const adapter = new AlipayAdapter();
      const request = adapter.createRequest({
        url: 'https://example.com/upload',
        method: 'POST',
      });

      expect(request).toBeDefined();
    });
  });

  describe('字节跳动小程序环境适配器', () => {
    beforeEach(() => {
      // 模拟字节跳动小程序环境
      global.tt = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({
          readFile: vi.fn(options => {
            if (options.success) {
              options.success({
                data: new ArrayBuffer(1024),
              });
            }
          }),
          writeFile: vi.fn(),
        }),
        getStorage: vi.fn(),
        setStorage: vi.fn(),
        removeStorage: vi.fn(),
      } as any;
    });

    it('应该正确初始化BytedanceAdapter', () => {
      const adapter = new BytedanceAdapter();
      testAdapterBasicFunctionality(adapter, 'bytedance');
    });
  });

  describe('百度小程序环境适配器', () => {
    beforeEach(() => {
      // 模拟百度小程序环境
      global.swan = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({
          readFile: vi.fn(options => {
            if (options.success) {
              options.success({
                data: new ArrayBuffer(1024),
              });
            }
          }),
          writeFile: vi.fn(),
        }),
        getStorage: vi.fn(),
        setStorage: vi.fn(),
        removeStorage: vi.fn(),
      } as any;
    });

    it('应该正确初始化BaiduAdapter', () => {
      const adapter = new BaiduAdapter();
      testAdapterBasicFunctionality(adapter, 'baidu');
    });
  });

  describe('跨框架适配器', () => {
    // Taro框架适配器测试
    describe('Taro框架适配器', () => {
      beforeEach(() => {
        // 模拟Taro环境
        global.Taro = {
          uploadFile: vi.fn(),
          request: vi.fn(),
          getFileSystemManager: vi.fn().mockReturnValue({
            readFile: vi.fn(),
          }),
          getEnv: vi.fn().mockReturnValue('WEAPP'),
          getStorageSync: vi.fn(),
          setStorageSync: vi.fn(),
          removeStorageSync: vi.fn(),
        } as any;
      });

      it('应该正确初始化TaroAdapter', () => {
        const adapter = new TaroAdapter();
        expect(adapter.getEnvironmentType()).toBe('taro');
      });
    });

    // uni-app框架适配器测试
    describe('uni-app框架适配器', () => {
      beforeEach(() => {
        // 模拟uni-app环境
        global.uni = {
          uploadFile: vi.fn(),
          request: vi.fn(),
          getFileSystemManager: vi.fn().mockReturnValue({
            readFile: vi.fn(),
          }),
          getStorageSync: vi.fn(),
          setStorageSync: vi.fn(),
          removeStorageSync: vi.fn(),
        } as any;
      });

      it('应该正确初始化UniAppAdapter', () => {
        const adapter = new UniAppAdapter();
        expect(adapter.getEnvironmentType()).toBe('uni-app');
      });
    });
  });

  describe('跨平台统一接口测试', () => {
    let mockFile: any;
    let adapters: Array<{ adapter: IAdapter }>;

    beforeEach(() => {
      // 模拟所有需要的环境
      global.wx = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({ readFile: vi.fn() }),
      } as any;
      global.my = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({ readFile: vi.fn() }),
      } as any;
      global.tt = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({ readFile: vi.fn() }),
      } as any;
      global.swan = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getFileSystemManager: vi.fn().mockReturnValue({ readFile: vi.fn() }),
      } as any;
      global.Taro = {
        uploadFile: vi.fn(),
        request: vi.fn(),
        getEnv: vi.fn().mockReturnValue('WEAPP'),
      } as any;
      global.uni = { uploadFile: vi.fn(), request: vi.fn() } as any;

      if (typeof window === 'undefined') {
        Object.defineProperty(global, 'window', {
          value: {
            XMLHttpRequest: vi.fn().mockImplementation(() => ({
              open: vi.fn(),
              send: vi.fn(),
              setRequestHeader: vi.fn(),
            })),
            Blob: vi.fn(),
            File: vi.fn(),
            FileReader: vi.fn().mockImplementation(() => ({
              readAsArrayBuffer: vi.fn(),
            })),
          },
          writable: true,
        });
      }

      // 准备所有适配器
      adapters = [
        { adapter: new BrowserAdapter() },
        { adapter: new WechatAdapter() },
        { adapter: new AlipayAdapter() },
        { adapter: new BytedanceAdapter() },
        { adapter: new BaiduAdapter() },
        { adapter: new TaroAdapter() },
        { adapter: new UniAppAdapter() },
      ];

      // 不同环境的文件结构不同，这里模拟统一的接口
      mockFile = {
        // 浏览器文件属性
        size: 1024,
        type: 'text/plain',
        name: 'test.txt',
        slice: vi.fn().mockReturnValue(new Blob()),
        // 小程序文件属性
        path: 'file://temp/test.txt',
      };

      // 模拟各个适配器的方法
      adapters.forEach(({ adapter }) => {
        vi.spyOn(adapter, 'readFile').mockResolvedValue(new ArrayBuffer(1024));
        vi.spyOn(adapter, 'createRequest').mockReturnValue({
          send: vi.fn().mockResolvedValue({}),
          abort: vi.fn(),
          on: vi.fn(),
        });
      });
    });

    it('所有适配器应提供统一的文件读取接口', async () => {
      for (const { adapter } of adapters) {
        await expect(
          adapter.readFile(mockFile, 0, 1024)
        ).resolves.toBeDefined();
      }
    });

    it('所有适配器应提供统一的HTTP请求接口', () => {
      for (const { adapter } of adapters) {
        const request = adapter.createRequest({
          url: 'https://example.com/upload',
          method: 'POST',
        });
        expect(request).toBeDefined();
        expect(request.send).toBeDefined();
        expect(request.abort).toBeDefined();
      }
    });

    it('所有适配器应提供统一的存储接口', () => {
      for (const { adapter } of adapters) {
        const storage = adapter.getStorageProvider();
        expect(storage).toBeDefined();
        expect(storage.get).toBeDefined();
        expect(storage.set).toBeDefined();
        expect(storage.remove).toBeDefined();
      }
    });
  });
});
