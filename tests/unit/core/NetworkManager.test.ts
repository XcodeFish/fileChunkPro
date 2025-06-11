/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkManager } from '../../../src/core/NetworkManager';
import { EventBus } from '../../../src/core/EventBus';
import { DependencyContainer } from '../../../src/core/DependencyContainer';
import { NetworkDetector } from '../../../src/utils/NetworkDetector';
import {
  NetworkQuality,
  RequestMethod,
  ResponseType,
} from '../../../src/types/network';
import { TestFileGenerator } from '../../setup';

describe('NetworkManager', () => {
  let networkManager: NetworkManager;
  let mockContainer: DependencyContainer;
  let mockEventBus: EventBus;
  let mockNetworkDetector: any;

  // 模拟全局fetch
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    // 设置模拟fetch
    global.fetch = mockFetch;

    // 重置fetch模拟
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
        }),
      })
    );

    // 模拟依赖
    mockEventBus = new EventBus();

    mockNetworkDetector = {
      on: vi.fn(),
      off: vi.fn(),
      getNetworkQuality: vi.fn().mockReturnValue('good'),
      isOnline: vi.fn().mockReturnValue(true),
      dispose: vi.fn(),
    };

    mockContainer = {
      resolve: vi.fn((token: string) => {
        if (token === 'eventBus') return mockEventBus;
        if (token === 'networkDetector') return mockNetworkDetector;
        return null;
      }),
    } as unknown as DependencyContainer;

    // 创建NetworkManager实例
    networkManager = new NetworkManager(mockContainer);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    networkManager.dispose();
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该注册网络事件监听器', () => {
      expect(mockNetworkDetector.on).toHaveBeenCalledWith(
        'qualityChange',
        expect.any(Function)
      );
      expect(mockNetworkDetector.on).toHaveBeenCalledWith(
        'offline',
        expect.any(Function)
      );
      expect(mockNetworkDetector.on).toHaveBeenCalledWith(
        'online',
        expect.any(Function)
      );
    });

    it('应该使用自定义默认选项', () => {
      const customOptions = {
        defaultOptions: {
          timeout: 5000,
          retries: 5,
          method: 'POST' as RequestMethod,
        },
      };

      const customNetworkManager = new NetworkManager(
        mockContainer,
        customOptions
      );

      // 测试是否采用了自定义选项
      // 注意：由于defaultOptions是私有属性，我们通过发送请求间接验证
      mockFetch.mockResolvedValueOnce(new Response());

      customNetworkManager.request('https://example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          method: 'POST',
          signal: expect.any(AbortSignal),
        })
      );

      customNetworkManager.dispose();
    });
  });

  describe('request方法', () => {
    it('应该成功发送GET请求', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), { status: 200 })
      );

      const response = await networkManager.request('https://example.com/api');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal),
        })
      );

      expect(response.success).toBe(true);
      expect(response.statusCode).toBe(200);
      expect(response.data).toEqual({ data: 'success' });
    });

    it('应该处理网络错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // 设置不重试
      networkManager.setRetryStrategy({
        maxRetries: 0,
      });

      await expect(
        networkManager.request('https://example.com/api')
      ).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('应该根据responseType解析响应', async () => {
      const textResponse = new Response('Plain text response', { status: 200 });
      mockFetch.mockResolvedValueOnce(textResponse);

      const response = await networkManager.request(
        'https://example.com/text',
        {
          responseType: ResponseType.TEXT,
        }
      );

      expect(response.data).toBe('Plain text response');
    });

    it('应该尊重请求超时设置', async () => {
      vi.useFakeTimers();

      // 使用未解决的Promise模拟一个永不解决的请求
      // 在空函数中添加注释说明用途
      mockFetch.mockReturnValueOnce(
        new Promise(() => {
          /* 用于测试超时的挂起Promise */
        })
      );

      // 设置超时时间为2秒，禁用重试
      const promise = networkManager.request('https://example.com/slow', {
        timeout: 2000,
        retries: 0,
      });

      // 前进2.1秒
      vi.advanceTimersByTime(2100);

      // 验证请求因超时而失败
      await expect(promise).rejects.toThrow(/timeout/i);

      vi.useRealTimers();
    });
  });

  describe('重试机制', () => {
    it('应该自动重试失败的请求', async () => {
      // 第一次请求失败，第二次成功
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      // 设置重试策略
      networkManager.setRetryStrategy({
        maxRetries: 1,
        retryDelay: 100,
        exponentialBackoff: false,
      });

      const response = await networkManager.request(
        'https://example.com/retry'
      );

      // 验证请求发送了两次
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.success).toBe(true);
    });

    it('应该根据状态码重试请求', async () => {
      // 第一次请求返回服务器错误，第二次成功
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      // 设置重试策略
      networkManager.setRetryStrategy({
        maxRetries: 1,
        retryDelay: 100,
        exponentialBackoff: false,
        retryableStatusCodes: [500],
      });

      const response = await networkManager.request(
        'https://example.com/retry-status'
      );

      // 验证请求发送了两次
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(response.success).toBe(true);
    });

    it('应该使用指数退避策略增加重试等待时间', async () => {
      vi.useFakeTimers();

      // 连续模拟3次失败
      mockFetch.mockRejectedValueOnce(new Error('Network error 1'));
      mockFetch.mockRejectedValueOnce(new Error('Network error 2'));
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      // 设置重试策略
      networkManager.setRetryStrategy({
        maxRetries: 2,
        retryDelay: 1000,
        exponentialBackoff: true,
      });

      // 开始请求
      const requestPromise = networkManager.request(
        'https://example.com/exponential'
      );

      // 等待第一次请求完成和第一次重试延迟
      await vi.advanceTimersByTimeAsync(1000);

      // 等待第二次请求完成和第二次重试延迟（指数增长）
      await vi.advanceTimersByTimeAsync(2000);

      // 等待第三次请求完成
      await vi.advanceTimersByTimeAsync(100);

      const response = await requestPromise;

      // 验证请求发送了三次
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(response.success).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('文件上传', () => {
    it('应该正确上传文件', async () => {
      const file = TestFileGenerator.createTextFile(1024, 'test.txt');

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ fileId: '12345' }), { status: 200 })
      );

      const response = await networkManager.uploadFile(
        'https://example.com/upload',
        file
      );

      // 验证请求包含文件
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/upload',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ fileId: '12345' });

      // 验证FormData正确包含文件
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = fetchCall[1].body;
      expect(requestBody instanceof FormData).toBe(true);

      // 注意：FormData内容无法直接测试，因为它是不可枚举的
    });

    it('应该上传文件分片', async () => {
      const chunk = new Blob(['chunk data'], {
        type: 'application/octet-stream',
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ chunkId: 'chunk-1' }), { status: 200 })
      );

      const response = await networkManager.uploadChunk(
        'https://example.com/upload-chunk',
        chunk,
        {
          headers: {
            'X-File-Id': 'file-123',
            'X-Chunk-Index': '0',
          },
        }
      );

      // 验证请求包含分片
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/upload-chunk',
        expect.objectContaining({
          method: 'POST',
          body: chunk,
          headers: expect.objectContaining({
            'X-File-Id': 'file-123',
            'X-Chunk-Index': '0',
          }),
        })
      );

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ chunkId: 'chunk-1' });
    });
  });

  describe('请求中止', () => {
    it('应该中止单个请求', async () => {
      // 使用真实的AbortController进行测试
      mockFetch.mockImplementationOnce((_url, options) => {
        return new Promise((resolve, reject) => {
          // 监听abort信号
          options.signal.addEventListener('abort', () => {
            const error = new Error('请求被中止');
            error.name = 'AbortError';
            reject(error);
          });

          // 延迟响应，确保有时间中止
          setTimeout(() => resolve(new Response('{}', { status: 200 })), 1000);
        });
      });

      // 开始请求但不等待
      const requestPromise = networkManager.request(
        'https://example.com/to-be-aborted'
      );

      // 让请求有时间启动
      await new Promise(resolve => setTimeout(resolve, 10));

      // 获取正在进行的请求ID - 虽然这不是公开API的一部分，但为了测试我们需要获取请求ID
      // 这里使用一个变通方法：尝试中止所有请求并监视事件总线
      const abortedIds: string[] = [];
      const listener = vi.fn((event: any) => {
        abortedIds.push(event.data.requestId);
      });
      mockEventBus.on('network:aborted', listener);

      networkManager.abortAll();

      // 确保有一个被中止的请求ID
      expect(abortedIds.length).toBeGreaterThan(0);
      const requestId = abortedIds[0];

      // 清理
      mockEventBus.off('network:aborted', listener);

      // 验证请求被中止
      await expect(requestPromise).rejects.toThrow(/abort/i);

      // 测试针对特定ID的中止
      mockFetch.mockImplementationOnce((_url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('请求被中止');
            error.name = 'AbortError';
            reject(error);
          });

          setTimeout(() => resolve(new Response('{}', { status: 200 })), 1000);
        });
      });

      const newRequestPromise = networkManager.request(
        'https://example.com/to-be-aborted-2'
      );

      // 给请求一点时间启动
      await new Promise(resolve => setTimeout(resolve, 10));

      // 现在我们有工作方法来测试abort方法
      mockEventBus.on('network:aborted', listener);
      abortedIds.length = 0; // 清空数组

      // 假设这个直接调用会失败，因为我们没有正确的新ID
      // 这仅仅是为了测试单个请求中止的功能
      networkManager.abortAll();

      expect(abortedIds.length).toBeGreaterThan(0);
      const newRequestId = abortedIds[0];

      const aborted = networkManager.abort(newRequestId);
      expect(aborted).toBe(true);

      await expect(newRequestPromise).rejects.toThrow(/abort/i);

      // 清理
      mockEventBus.off('network:aborted', listener);
    });

    it('应该中止所有请求', async () => {
      // 设置多个永不解决的请求
      mockFetch.mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('请求被中止');
            error.name = 'AbortError';
            reject(error);
          });
          // 这个请求永远不会自己解决
        });
      });

      // 发起多个请求
      const promise1 = networkManager.request('https://example.com/request1');
      const promise2 = networkManager.request('https://example.com/request2');

      // 确保请求有时间启动
      await new Promise(resolve => setTimeout(resolve, 10));

      // 中止所有请求
      networkManager.abortAll();

      // 所有请求都应该被中止
      await expect(promise1).rejects.toThrow(/abort/i);
      await expect(promise2).rejects.toThrow(/abort/i);
    });
  });

  describe('网络状态处理', () => {
    it('应该检测网络质量', () => {
      mockNetworkDetector.getNetworkQuality.mockReturnValue('poor');

      const quality = networkManager.getNetworkQuality();
      expect(quality).toBe('poor');
    });

    it('应该验证URL有效性', () => {
      expect(networkManager.isValidUrl('https://example.com')).toBe(true);
      expect(networkManager.isValidUrl('http://localhost:3000')).toBe(true);
      expect(networkManager.isValidUrl('ftp://example.com')).toBe(false);
      expect(networkManager.isValidUrl('invalid-url')).toBe(false);
    });

    it('应该正确处理资源释放', () => {
      networkManager.dispose();

      expect(mockNetworkDetector.off).toHaveBeenCalled();
      expect(mockNetworkDetector.dispose).toHaveBeenCalled();
    });
  });

  describe('统计和监控', () => {
    it('应该返回活跃请求数', async () => {
      // 模拟长时间运行的请求
      mockFetch.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve(new Response('{}')), 1000);
          })
      );

      // 开始一个请求，但不等待它完成
      networkManager.request('https://example.com/long-request');

      // 验证活跃请求数
      expect(networkManager.getActiveRequestCount()).toBe(1);

      // 中止所有请求以清理
      networkManager.abortAll();
    });
  });
});
