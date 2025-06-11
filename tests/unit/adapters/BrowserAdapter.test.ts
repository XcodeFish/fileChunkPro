import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BrowserAdapter } from '../../../src/adapters/BrowserAdapter';

describe('BrowserAdapter', () => {
  let adapter: BrowserAdapter;

  beforeEach(() => {
    adapter = new BrowserAdapter();

    // 模拟 fetch API
    global.fetch = vi.fn().mockImplementation((url, options) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'Content-Type': 'application/json',
        }),
        json: () =>
          Promise.resolve({ success: true, url, method: options?.method }),
        text: () => Promise.resolve('响应文本'),
        blob: () =>
          Promise.resolve(new Blob(['测试数据'], { type: 'text/plain' })),
        formData: () => Promise.resolve(new FormData()),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
    }) as any;

    // 模拟 XMLHttpRequest
    const xhrMockClass = vi.fn(() => ({
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn((event, handler) => {
        if (event === 'load') {
          setTimeout(() => {
            handler({
              target: {
                status: 200,
                response: { success: true },
              },
            });
          }, 0);
        }
      }),
    }));

    // 替换全局 XMLHttpRequest
    global.XMLHttpRequest = xhrMockClass as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should detect browser environment correctly', () => {
    expect(adapter.isSupported()).toBe(true);
    expect(adapter.getEnvironmentInfo()).toEqual(
      expect.objectContaining({
        type: 'browser',
        features: expect.any(Object),
      })
    );
  });

  it('should detect features available in browser', () => {
    const features = adapter.detectFeatures();

    expect(features).toEqual(
      expect.objectContaining({
        fileReader: expect.any(Boolean),
        fetch: expect.any(Boolean),
        xhr: expect.any(Boolean),
        blob: expect.any(Boolean),
        arrayBuffer: expect.any(Boolean),
      })
    );
  });

  it('should read file chunks correctly', async () => {
    // 创建测试文件
    const fileContent = 'Hello, World!';
    const testFile = new File([fileContent], 'test.txt', {
      type: 'text/plain',
    });

    // 读取整个文件
    const data = await adapter.readFile(testFile, 0, testFile.size);

    // 验证读取结果
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(fileContent.length);
  });

  it('should read partial file chunks', async () => {
    // 创建测试文件
    const fileContent = 'Hello, World!';
    const testFile = new File([fileContent], 'test.txt', {
      type: 'text/plain',
    });

    // 读取部分文件（只读取 "Hello"）
    const partialData = await adapter.readFile(testFile, 0, 5);

    // 验证读取结果
    expect(partialData).toBeInstanceOf(Uint8Array);
    expect(partialData.length).toBe(5);
  });

  it('should handle network requests using fetch', async () => {
    const response = await adapter.request({
      url: 'https://example.com/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        id: 123,
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Object),
        body: expect.any(String),
      })
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        method: 'POST',
      })
    );
  });

  it('should fallback to XMLHttpRequest if fetch is not available', async () => {
    // 模拟 fetch API 不可用
    const originalFetch = global.fetch;
    global.fetch = undefined as any;

    // 重新创建适配器
    const xhrAdapter = new BrowserAdapter();

    // 发送请求
    const promise = xhrAdapter.request({
      url: 'https://example.com/api',
      method: 'GET',
    });

    // 验证请求
    await expect(promise).resolves.toEqual({ success: true });
    expect(XMLHttpRequest).toHaveBeenCalled();

    // 恢复 fetch
    global.fetch = originalFetch;
  });

  it('should upload file using XMLHttpRequest', async () => {
    const testFile = new File(['测试内容'], 'upload.txt', {
      type: 'text/plain',
    });

    const response = await adapter.uploadFile({
      url: 'https://example.com/upload',
      file: testFile,
      fieldName: 'file',
      data: {
        category: 'documents',
      },
      onProgress: vi.fn(),
    });

    expect(XMLHttpRequest).toHaveBeenCalled();
    expect(response).toEqual({ success: true });
  });

  it('should handle storage operations', async () => {
    // 模拟 localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // 存储数据
    await adapter.setStorageItem('testKey', { value: 'testValue' });
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'testKey',
      expect.any(String)
    );

    // 模拟返回数据
    localStorageMock.getItem.mockReturnValue(
      JSON.stringify({ value: 'testValue' })
    );

    // 读取数据
    const data = await adapter.getStorageItem('testKey');
    expect(localStorageMock.getItem).toHaveBeenCalledWith('testKey');
    expect(data).toEqual({ value: 'testValue' });

    // 删除数据
    await adapter.removeStorageItem('testKey');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('testKey');
  });

  it('should handle IndexedDB operations for large data', async () => {
    // 模拟 IndexedDB
    const mockIndexedDB = {
      open: vi.fn().mockReturnValue({
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: {
          transaction: vi.fn().mockReturnValue({
            objectStore: vi.fn().mockReturnValue({
              put: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
              }),
              get: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
              }),
              delete: vi.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
              }),
            }),
          }),
        },
      }),
    };

    Object.defineProperty(window, 'indexedDB', {
      value: mockIndexedDB,
      writable: true,
    });

    // 创建大量数据
    const largeData = new ArrayBuffer(10 * 1024 * 1024); // 10MB

    // 使用 IndexedDB 存储
    const promise = adapter.storeChunk('fileId', 1, largeData);

    // 触发成功回调
    setTimeout(() => {
      const request = mockIndexedDB
        .open()
        .result.transaction()
        .objectStore()
        .put();
      request.onsuccess && request.onsuccess({} as any);
    }, 0);

    await expect(promise).resolves.not.toThrow();
  });

  it('should detect when running in web worker context', () => {
    // 模拟 web worker 环境
    global.self = {} as any;
    global.window = undefined as any;

    // 创建适配器
    const workerAdapter = new BrowserAdapter();

    // 检测 worker 环境
    expect(workerAdapter.isWorkerEnvironment()).toBe(true);

    // 恢复环境
    global.window = window;
  });

  it('should create object URLs from Blob', () => {
    // 模拟 URL.createObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');

    const blob = new Blob(['测试数据']);
    const url = adapter.createObjectURL(blob);

    expect(url).toBe('blob:mock-url');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('should revoke object URLs', () => {
    // 模拟 URL.revokeObjectURL
    global.URL.revokeObjectURL = vi.fn();

    adapter.revokeObjectURL('blob:mock-url');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
