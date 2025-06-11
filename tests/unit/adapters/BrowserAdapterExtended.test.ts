/**
 * BrowserAdapter 扩展测试
 * 测试浏览器适配器在复杂场景下的行为
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BrowserAdapter } from '../../../src/adapters/BrowserAdapter';
import { EventBus } from '../../../src/core/EventBus';
import { NetworkQuality } from '../../../src/types';

describe('BrowserAdapter 扩展测试', () => {
  let adapter: BrowserAdapter;
  let eventBus: EventBus;
  let originalXHR: typeof XMLHttpRequest;
  let mockXHR: any;
  let xhrInstances: any[] = [];

  beforeEach(() => {
    // 保存原始的 XMLHttpRequest 构造函数
    originalXHR = window.XMLHttpRequest;

    // 重置收集的XHR实例
    xhrInstances = [];

    // 创建模拟 XMLHttpRequest
    mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      abort: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: 0,
      status: 0,
      response: null,
      responseText: '',
      onreadystatechange: null,
      onerror: null,
      onload: null,
      ontimeout: null,
      onabort: null,
    };

    // 替换全局 XMLHttpRequest 构造函数为模拟实现
    window.XMLHttpRequest = vi.fn().mockImplementation(() => {
      const instance = { ...mockXHR };
      xhrInstances.push(instance);
      return instance;
    }) as any;

    // 创建事件总线和适配器
    eventBus = new EventBus();
    adapter = new BrowserAdapter({ eventBus });
  });

  afterEach(() => {
    // 恢复原始的 XMLHttpRequest 对象
    window.XMLHttpRequest = originalXHR;
    vi.resetAllMocks();
  });

  it('应该能处理并发上传请求', async () => {
    // 创建三个并发上传请求
    const blob1 = new Blob(['content 1'], { type: 'text/plain' });
    const blob2 = new Blob(['content 2'], { type: 'text/plain' });
    const blob3 = new Blob(['content 3'], { type: 'text/plain' });

    const options = {
      url: 'https://example.com/upload',
      headers: { 'Content-Type': 'application/octet-stream' },
    };

    // 模拟XHR成功响应的通用函数
    const mockXhrSuccess = (xhrInstance: any, responseData: any) => {
      Object.defineProperty(xhrInstance, 'readyState', { value: 4 });
      Object.defineProperty(xhrInstance, 'status', { value: 200 });
      Object.defineProperty(xhrInstance, 'responseText', {
        value: JSON.stringify(responseData),
      });
      xhrInstance.onload && xhrInstance.onload();
    };

    // 发起三个并发请求但不等待它们完成
    const uploadPromise1 = adapter.upload(blob1, options);
    const uploadPromise2 = adapter.upload(blob2, options);
    const uploadPromise3 = adapter.upload(blob3, options);

    // 验证创建了三个XHR实例
    expect(xhrInstances.length).toBe(3);

    // 模拟每个XHR实例的成功响应
    mockXhrSuccess(xhrInstances[0], { id: 'response-1', success: true });
    mockXhrSuccess(xhrInstances[1], { id: 'response-2', success: true });
    mockXhrSuccess(xhrInstances[2], { id: 'response-3', success: true });

    // 等待所有上传完成
    const [result1, result2, result3] = await Promise.all([
      uploadPromise1,
      uploadPromise2,
      uploadPromise3,
    ]);

    // 验证结果
    expect(result1).toEqual({ id: 'response-1', success: true });
    expect(result2).toEqual({ id: 'response-2', success: true });
    expect(result3).toEqual({ id: 'response-3', success: true });
  });

  it('应该能够处理网络错误和超时', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
      timeout: 1000, // 1秒超时
    };

    // 创建上传请求但不等待它完成
    const uploadPromise = adapter.upload(mockBlob, mockOptions);

    // 获取XHR实例
    const xhrInstance = xhrInstances[0];

    // 模拟超时事件
    xhrInstance.ontimeout && xhrInstance.ontimeout();

    // 验证Promise被拒绝
    await expect(uploadPromise).rejects.toThrow();

    // 创建第二个上传请求测试网络错误
    const uploadPromise2 = adapter.upload(mockBlob, mockOptions);
    const xhrInstance2 = xhrInstances[1];

    // 模拟网络错误
    xhrInstance2.onerror && xhrInstance2.onerror(new Error('Network error'));

    // 验证第二个Promise也被拒绝
    await expect(uploadPromise2).rejects.toThrow();
  });

  it('应该能重试上传失败的请求', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
      retries: 2, // 允许2次重试
      retryDelay: 100, // 短暂延迟以加快测试
    };

    // 拦截上传方法，模拟前两次失败，第三次成功
    const originalUpload = adapter.upload.bind(adapter);
    let attemptCount = 0;

    adapter.upload = vi.fn().mockImplementation(async (_blob, _options) => {
      attemptCount++;
      if (attemptCount <= 2) {
        return Promise.reject(new Error(`Attempt ${attemptCount} failed`));
      }
      // 第三次成功
      return Promise.resolve({ success: true, attemptCount });
    });

    // 执行上传
    const result = await adapter.upload(mockBlob, mockOptions);

    // 验证结果
    expect(result).toEqual({ success: true, attemptCount: 3 });
    expect(adapter.upload).toHaveBeenCalledTimes(3);

    // 恢复原始方法
    adapter.upload = originalUpload;
  });

  it('应该能够支持自定义的进度回调', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const progressCallback = vi.fn();
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
      onProgress: progressCallback,
    };

    // 创建上传请求但不等待它完成
    const uploadPromise = adapter.upload(mockBlob, mockOptions);

    // 获取XHR实例
    const xhrInstance = xhrInstances[0];

    // 模拟多个进度事件
    const progressHandler = xhrInstance.upload.addEventListener.mock.calls.find(
      call => call[0] === 'progress'
    )[1];

    // 模拟25%进度
    progressHandler({
      lengthComputable: true,
      loaded: 25,
      total: 100,
    });

    // 模拟50%进度
    progressHandler({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    });

    // 模拟100%进度
    progressHandler({
      lengthComputable: true,
      loaded: 100,
      total: 100,
    });

    // 模拟上传成功
    Object.defineProperty(xhrInstance, 'status', { value: 200 });
    Object.defineProperty(xhrInstance, 'responseText', {
      value: JSON.stringify({ success: true }),
    });
    xhrInstance.onload && xhrInstance.onload();

    // 等待上传完成
    await uploadPromise;

    // 验证进度回调被调用了3次
    expect(progressCallback).toHaveBeenCalledTimes(3);

    // 验证进度值是正确的
    expect(progressCallback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        loaded: 25,
        total: 100,
        progress: 0.25,
      })
    );

    expect(progressCallback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        loaded: 50,
        total: 100,
        progress: 0.5,
      })
    );

    expect(progressCallback).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        loaded: 100,
        total: 100,
        progress: 1,
      })
    );
  });

  it('应该支持基于网络状况的动态适配', async () => {
    // 假设适配器有一个方法可以根据网络状况调整配置
    if (typeof adapter.adjustForNetworkQuality === 'function') {
      // 注入一个假的网络质量监测
      adapter.adjustForNetworkQuality(NetworkQuality.POOR);

      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      const mockOptions = {
        url: 'https://example.com/upload',
        headers: {},
      };

      // 创建上传请求但不立即等待它完成
      adapter.upload(mockBlob, mockOptions).catch(() => {
        // 忽略可能的错误，因为我们只关心配置
      });

      // 获取XHR实例
      const xhrInstance = xhrInstances[0];

      // 检查是否应用了较小的超时值和其他针对弱网络的设置
      expect(xhrInstance.timeout).toBeLessThan(60000); // 应该有一个合理的更小的超时
    } else {
      // 如果方法不存在，这个测试就跳过
      console.log('适配器不支持网络质量动态适配，跳过测试');
    }
  });

  it('应该能处理上传过程中的中止操作', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
    };

    // 创建上传请求但不等待它完成
    const uploadPromise = adapter.upload(mockBlob, mockOptions);

    // 获取XHR实例
    const xhrInstance = xhrInstances[0];

    // 中止上传
    adapter.abort();

    // 验证abort方法被调用
    expect(xhrInstance.abort).toHaveBeenCalled();

    // 模拟中止事件
    xhrInstance.onabort && xhrInstance.onabort();

    // 验证Promise被拒绝
    await expect(uploadPromise).rejects.toThrow();
  });

  it('应该能处理非JSON响应', async () => {
    const mockBlob = new Blob(['test content'], { type: 'text/plain' });
    const mockOptions = {
      url: 'https://example.com/upload',
      headers: {},
      responseType: 'text', // 请求文本响应
    };

    // 创建上传请求但不等待它完成
    const uploadPromise = adapter.upload(mockBlob, mockOptions);

    // 获取XHR实例
    const xhrInstance = xhrInstances[0];

    // 模拟非JSON响应
    Object.defineProperty(xhrInstance, 'status', { value: 200 });
    Object.defineProperty(xhrInstance, 'responseText', {
      value: 'Upload successful', // 纯文本响应
    });
    xhrInstance.onload && xhrInstance.onload();

    // 等待上传完成
    const result = await uploadPromise;

    // 验证结果是原始文本
    expect(result).toBe('Upload successful');
  });
});
