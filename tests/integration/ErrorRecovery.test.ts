import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  UploadError,
  ErrorCenter,
  UploadErrorType as ErrorType,
} from '../../src/core/error';
import { UploaderCore } from '../../src/core/UploaderCore';
import ChunkPlugin from '../../src/plugins/ChunkPlugin';
import ResumePlugin from '../../src/plugins/ResumePlugin';
import SmartConcurrencyPlugin from '../../src/plugins/SmartConcurrencyPlugin';
import { NetworkQuality } from '../../src/types';

// 创建模拟文件
function createMockFile(
  size = 1024 * 1024,
  name = 'test.txt',
  type = 'text/plain'
) {
  const buffer = new ArrayBuffer(size);
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

describe('错误恢复测试', () => {
  let uploader: UploaderCore;
  let mockXhr: any;

  beforeEach(() => {
    // 初始化计时器
    vi.useFakeTimers();

    // 模拟XMLHttpRequest
    mockXhr = {
      open: vi.fn(),
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      readyState: 4,
      status: 200,
      responseText: JSON.stringify({ success: true }),
      abort: vi.fn(),
    };

    // 替换全局XMLHttpRequest
    global.XMLHttpRequest = vi.fn(() => mockXhr);

    // 创建上传实例
    uploader = new UploaderCore({
      endpoint: 'https://example.com/upload',
      chunkSize: 256 * 1024, // 256KB分片
      concurrency: 2,
      retries: 3,
      retryDelay: 1000,
    });

    // 添加插件
    uploader.use(new ChunkPlugin());
    uploader.use(new ResumePlugin());
    uploader.use(
      new SmartConcurrencyPlugin({
        minConcurrency: 1,
        maxConcurrency: 4,
        adaptationEnabled: true,
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    uploader.dispose();
  });

  describe('网络错误恢复', () => {
    it('应在网络暂时中断后自动重试', async () => {
      const file = createMockFile(512 * 1024);

      // 监听错误和重试事件
      const errorSpy = vi.fn();
      const retrySpy = vi.fn();
      uploader.on('error', errorSpy);
      uploader.on('retry', retrySpy);

      // 初始化上传，但不等待完成
      const uploadPromise = uploader.upload(file);

      // 等待上传任务开始
      await vi.advanceTimersByTimeAsync(100);

      // 模拟第一次请求时网络错误
      const firstErrorEvent = new ErrorEvent('error', {
        message: 'Network error',
      });
      mockXhr.status = 0;
      mockXhr.onerror && mockXhr.onerror(firstErrorEvent);

      // 等待重试延迟
      await vi.advanceTimersByTimeAsync(1000);

      // 第二次请求成功
      mockXhr.status = 200;
      mockXhr.responseText = JSON.stringify({ success: true });
      mockXhr.onload && mockXhr.onload({});

      // 继续剩余上传过程
      await vi.advanceTimersByTimeAsync(5000);

      // 验证错误被捕获且触发了重试
      expect(errorSpy).toHaveBeenCalled();
      expect(retrySpy).toHaveBeenCalled();

      // 上传应该最终完成
      await expect(uploadPromise).resolves.toBeDefined();
    });

    it('应在达到最大重试次数后放弃', async () => {
      const file = createMockFile(256 * 1024);

      // 监听错误事件
      const errorSpy = vi.fn();
      uploader.on('error', errorSpy);

      // 设置所有请求都失败
      mockXhr.onerror = () => {
        const errorEvent = new ErrorEvent('error', {
          message: 'Persistent network error',
        });
        mockXhr.dispatchEvent(errorEvent);
      };
      mockXhr.status = 0;

      // 启动上传
      const uploadPromise = uploader.upload(file).catch(e => e);

      // 等待所有重试完成 (3次重试，每次1秒延迟)
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      // 验证上传失败，并返回错误
      const result = await uploadPromise;
      expect(result).toBeInstanceOf(UploadError);
      expect(errorSpy).toHaveBeenCalledTimes(4); // 初始尝试 + 3次重试
    });

    it('应处理服务器返回的错误状态码', async () => {
      const file = createMockFile(128 * 1024);

      // 监听错误事件
      const errorSpy = vi.fn();
      uploader.on('error', errorSpy);

      // 初始化上传，但不等待完成
      const uploadPromise = uploader.upload(file).catch(e => e);

      // 等待上传任务开始
      await vi.advanceTimersByTimeAsync(100);

      // 模拟服务器返回500错误
      mockXhr.status = 500;
      mockXhr.statusText = 'Internal Server Error';
      mockXhr.responseText = JSON.stringify({ error: 'Server error' });
      mockXhr.onload && mockXhr.onload({});

      // 等待所有重试完成 (每次1秒延迟)
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const result = await uploadPromise;
      expect(result).toBeInstanceOf(UploadError);
      expect((result as UploadError).code).toContain('HTTP_ERROR');
    });
  });

  describe('断点续传恢复', () => {
    it('应能从中断点恢复上传', async () => {
      const file = createMockFile(1024 * 1024); // 1MB

      // 模拟本地存储
      const mockStorage: Record<string, any> = {};
      vi.spyOn(localStorage, 'getItem').mockImplementation(
        key => mockStorage[key] || null
      );
      vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        mockStorage[key] = value.toString();
      });

      // 开始上传但不等待完成
      uploader.upload(file);

      // 等待一些分片上传完成
      await vi.advanceTimersByTimeAsync(500);

      // 模拟上传中断
      uploader.cancel();

      // 创建新的上传实例(模拟页面刷新后重新创建)
      const newUploader = new UploaderCore({
        endpoint: 'https://example.com/upload',
        chunkSize: 256 * 1024,
        concurrency: 2,
        retries: 3,
      });

      // 添加相同的插件
      newUploader.use(new ChunkPlugin());
      newUploader.use(new ResumePlugin());

      // 监听恢复事件
      const resumeSpy = vi.fn();
      newUploader.on('resume', resumeSpy);

      // 尝试上传同一个文件
      const resumePromise = newUploader.upload(file);

      // 等待上传完成
      await vi.advanceTimersByTimeAsync(5000);

      // 验证触发了恢复事件
      expect(resumeSpy).toHaveBeenCalled();

      // 验证上传完成
      await expect(resumePromise).resolves.toBeDefined();

      // 清理
      newUploader.dispose();
    });
  });

  describe('动态适应与错误恢复', () => {
    it('应在网络质量变差时降低并发数', async () => {
      const file = createMockFile(1024 * 1024); // 1MB

      // 监控并发数变化
      const setConcurrencySpy = vi.spyOn(
        uploader['_taskScheduler'],
        'setConcurrency'
      );

      // 开始上传
      const uploadPromise = uploader.upload(file);

      // 等待上传开始
      await vi.advanceTimersByTimeAsync(200);

      // 模拟网络质量变差事件
      uploader.emit('network:quality', {
        quality: NetworkQuality.POOR,
        condition: {
          type: 'cellular',
          effectiveType: '2g',
          downlink: 0.3,
          rtt: 1500,
        },
        stable: true,
      });

      // 等待处理完成
      await vi.advanceTimersByTimeAsync(100);

      // 验证并发数被降低
      expect(setConcurrencySpy).toHaveBeenCalledWith(1);

      // 模拟网络恢复
      uploader.emit('network:quality', {
        quality: NetworkQuality.GOOD,
        condition: {
          type: 'wifi',
          effectiveType: '4g',
          downlink: 10,
          rtt: 50,
        },
        stable: true,
      });

      // 等待处理完成
      await vi.advanceTimersByTimeAsync(100);

      // 验证并发数被提高
      expect(setConcurrencySpy).toHaveBeenCalledWith(expect.any(Number));
      expect(
        setConcurrencySpy.mock.calls[setConcurrencySpy.mock.calls.length - 1][0]
      ).toBeGreaterThan(1);

      // 完成上传
      await vi.advanceTimersByTimeAsync(5000);
      await uploadPromise;
    });
  });

  describe('错误分类与处理', () => {
    it('应正确分类和处理不同类型的错误', async () => {
      // 测试不同类型的错误对象创建
      const networkError = ErrorCenter.createError(
        ErrorType.NETWORK,
        'Network connection lost'
      );
      const serverError = ErrorCenter.createError(
        ErrorType.SERVER,
        'Internal server error',
        { statusCode: 500 }
      );
      const fileError = ErrorCenter.createError(
        ErrorType.FILE,
        'File is too large'
      );

      // 验证错误类型和信息是否正确
      expect(networkError.type).toBe(ErrorType.NETWORK);
      expect(networkError.message).toContain('Network connection lost');

      expect(serverError.type).toBe(ErrorType.SERVER);
      expect(serverError.details).toHaveProperty('statusCode', 500);

      expect(fileError.type).toBe(ErrorType.FILE);

      // 测试错误处理器
      let handlerCalled = false;
      ErrorCenter.registerErrorHandler(ErrorType.NETWORK, () => {
        handlerCalled = true;
        return true; // 表示错误已处理
      });

      // 触发错误处理
      const isHandled = ErrorCenter.handleError(networkError);
      expect(handlerCalled).toBe(true);
      expect(isHandled).toBe(true);
    });

    it('应按照优先级处理错误', () => {
      // 模拟不同优先级的错误处理器
      const highPriority = vi.fn().mockReturnValue(true);
      const lowPriority = vi.fn().mockReturnValue(true);

      // 注册不同优先级的处理器
      ErrorCenter.registerErrorHandler(ErrorType.NETWORK, lowPriority, {
        priority: 1,
      });
      ErrorCenter.registerErrorHandler(ErrorType.NETWORK, highPriority, {
        priority: 10,
      });

      // 创建网络错误
      const error = ErrorCenter.createError(
        ErrorType.NETWORK,
        'Connection error'
      );

      // 处理错误
      ErrorCenter.handleError(error);

      // 验证高优先级处理器先调用
      expect(highPriority).toHaveBeenCalled();
      expect(lowPriority).not.toHaveBeenCalled(); // 错误已由高优先级处理器处理
    });
  });

  describe('超时处理与恢复', () => {
    it('应正确处理请求超时', async () => {
      const file = createMockFile(512 * 1024);

      // 设置短超时时间
      uploader = new UploaderCore({
        endpoint: 'https://example.com/upload',
        chunkSize: 256 * 1024,
        concurrency: 1,
        timeout: 500, // 500ms超时
        retries: 2,
        retryDelay: 1000,
      });

      uploader.use(new ChunkPlugin());

      // 监听超时错误
      const errorSpy = vi.fn();
      uploader.on('error', errorSpy);

      // 模拟请求超时(请求发出但没有响应)
      mockXhr.send = vi.fn(() => {
        // 不调用onload或onerror，模拟请求挂起
      });

      // 开始上传
      const uploadPromise = uploader.upload(file).catch(e => e);

      // 等待超时发生
      await vi.advanceTimersByTimeAsync(600);

      // 验证错误被触发
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: ErrorType.TIMEOUT,
          }),
        })
      );

      // 等待重试
      await vi.advanceTimersByTimeAsync(1000);

      // 第二次请求仍超时
      await vi.advanceTimersByTimeAsync(600);

      // 等待最后一次重试
      await vi.advanceTimersByTimeAsync(1000);

      // 最后一次重试也超时
      await vi.advanceTimersByTimeAsync(600);

      // 验证上传最终失败
      const error = await uploadPromise;
      expect(error).toBeInstanceOf(UploadError);
      expect((error as UploadError).type).toBe(ErrorType.TIMEOUT);
    });
  });
});
