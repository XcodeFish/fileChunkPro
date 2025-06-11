/**
 * BrowserAdapter 单元测试
 * 测试浏览器环境下的上传适配器
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BrowserAdapter } from '../../../src/adapters/BrowserAdapter';
import { EventBus } from '../../../src/core/EventBus';

describe('BrowserAdapter', () => {
  let adapter: BrowserAdapter;
  let eventBus: EventBus;
  let originalXHR: typeof XMLHttpRequest;
  let mockXHR: {
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    upload: {
      addEventListener: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    // 保存原始的 XMLHttpRequest 构造函数
    originalXHR = window.XMLHttpRequest;

    // 创建模拟 XMLHttpRequest
    mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
    };

    // 替换全局 XMLHttpRequest 构造函数为模拟实现
    window.XMLHttpRequest = vi.fn().mockImplementation(() => mockXHR) as any;

    // 创建事件总线和适配器
    eventBus = new EventBus();
    adapter = new BrowserAdapter({ eventBus });
  });

  afterEach(() => {
    // 恢复原始的 XMLHttpRequest 对象
    window.XMLHttpRequest = originalXHR;
    vi.resetAllMocks();
  });

  it('应该正确初始化', () => {
    expect(adapter).toBeInstanceOf(BrowserAdapter);
    expect(adapter.getEnvironment()).toBe('browser');
  });

  it('应该能够上传一个Blob对象', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: { 'Content-Type': 'application/octet-stream' },
      data: { chunkIndex: '1' },
    };

    // 模拟成功响应
    const mockResponse = { success: true, chunkId: '123' };
    Object.defineProperty(mockXHR, 'status', { value: 200 });
    Object.defineProperty(mockXHR, 'responseText', {
      value: JSON.stringify(mockResponse),
    });

    // 将 send 方法实现为触发 onload 事件
    mockXHR.send = vi.fn().mockImplementation(function (this: any) {
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    });

    // 执行上传
    const uploadPromise = adapter.upload(mockBlob, mockOptions);

    // 验证 XHR 配置
    expect(mockXHR.open).toHaveBeenCalledWith('POST', mockOptions.url, true);
    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith(
      'Content-Type',
      mockOptions.headers['Content-Type']
    );

    // 等待上传完成
    const result = await uploadPromise;

    // 验证结果
    expect(result).toEqual(mockResponse);
    expect(mockXHR.send).toHaveBeenCalled();
  });

  it('应该处理上传错误', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
      data: {},
    };

    // 模拟错误响应
    Object.defineProperty(mockXHR, 'status', { value: 500 });
    Object.defineProperty(mockXHR, 'statusText', {
      value: 'Internal Server Error',
    });
    Object.defineProperty(mockXHR, 'responseText', {
      value: JSON.stringify({ error: 'Server error' }),
    });

    // 将 send 方法实现为触发 onerror 事件
    mockXHR.send = vi.fn().mockImplementation(function (this: any) {
      setTimeout(() => {
        if (this.onerror) this.onerror(new Error('Network error'));
      }, 0);
    });

    // 执行上传并期望它失败
    await expect(adapter.upload(mockBlob, mockOptions)).rejects.toThrow();
  });

  it('应该处理上传进度事件', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
      data: {},
      onProgress: vi.fn(),
    };

    // 模拟上传进度事件
    let progressHandler: ((event: any) => void) | null = null;
    mockXHR.upload.addEventListener = vi
      .fn()
      .mockImplementation((event, handler) => {
        if (event === 'progress') {
          progressHandler = handler;
        }
      });

    // 模拟成功响应
    Object.defineProperty(mockXHR, 'status', { value: 200 });
    Object.defineProperty(mockXHR, 'responseText', {
      value: JSON.stringify({ success: true }),
    });

    // 将 send 方法实现为触发 progress 和 onload 事件
    mockXHR.send = vi.fn().mockImplementation(function (this: any) {
      setTimeout(() => {
        // 触发进度事件
        if (progressHandler) {
          progressHandler({
            loaded: 50,
            total: 100,
            lengthComputable: true,
          });
        }

        // 然后触发完成事件
        if (this.onload) this.onload();
      }, 0);
    });

    // 执行上传
    await adapter.upload(mockBlob, mockOptions);

    // 验证进度回调被调用
    expect(mockOptions.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        loaded: 50,
        total: 100,
        progress: 0.5,
      })
    );
  });

  it('应该支持文件中断/取消上传', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
      data: {},
    };

    // 模拟 XHR abort 方法
    Object.defineProperty(mockXHR, 'abort', { value: vi.fn() });

    // 开始上传但不等待完成
    adapter.upload(mockBlob, mockOptions).catch(() => {
      // 忽略预期的取消错误
    });

    // 取消上传
    adapter.abort();

    // 验证 abort 方法被调用
    expect(mockXHR.abort).toHaveBeenCalled();
  });

  it('应该支持自定义请求配置', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      method: 'PUT', // 使用 PUT 而非默认的 POST
      headers: {
        'X-Custom-Header': 'CustomValue',
        'Content-Type': 'application/octet-stream',
      },
      data: { id: '123' },
      withCredentials: true,
      timeout: 5000,
    };

    // 模拟成功响应
    Object.defineProperty(mockXHR, 'status', { value: 200 });
    Object.defineProperty(mockXHR, 'responseText', {
      value: JSON.stringify({ success: true }),
    });

    // 将 send 方法模拟为异步成功
    mockXHR.send = vi.fn().mockImplementation(function (this: any) {
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    });

    // 执行上传并等待完成
    await adapter.upload(mockBlob, mockOptions);

    // 验证 XHR 配置
    expect(mockXHR.open).toHaveBeenCalledWith(
      mockOptions.method,
      mockOptions.url,
      true
    );

    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith(
      'X-Custom-Header',
      'CustomValue'
    );

    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith(
      'Content-Type',
      mockOptions.headers['Content-Type']
    );

    // 验证 withCredentials 和 timeout 设置
    expect((mockXHR as any).withCredentials).toBe(true);
    expect((mockXHR as any).timeout).toBe(5000);
  });
});
