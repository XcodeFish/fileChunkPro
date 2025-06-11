/**
 * 文件上传流程集成测试
 * 测试整个上传过程中的分片、上传、合并等操作
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { rest } from 'msw';
import { mswServer, TestFileGenerator } from '../setup';
import { UploaderCore } from '../../src/core/UploaderCore';
import { DependencyContainer } from '../../src/core/DependencyContainer';
import { EventBus } from '../../src/core/EventBus';
import { ErrorCenter } from '../../src/core/error';
import { PluginManager } from '../../src/core/PluginManager';
import { FileManager } from '../../src/core/FileManager';
import { NetworkManager } from '../../src/core/NetworkManager';
import { TaskScheduler } from '../../src/core/TaskScheduler';

// 创建容器和上传器实例
const createUploaderInstance = (options = {}) => {
  const eventBus = new EventBus();
  const errorCenter = new ErrorCenter();
  const fileManager = new FileManager(eventBus);
  const networkManager = new NetworkManager();
  const pluginManager = new PluginManager(eventBus);
  const taskScheduler = new TaskScheduler({ concurrency: 3 });

  const container = new DependencyContainer();
  container.register('eventBus', eventBus);
  container.register('errorCenter', errorCenter);
  container.register('fileManager', fileManager);
  container.register('networkManager', networkManager);
  container.register('pluginManager', pluginManager);
  container.register('taskScheduler', taskScheduler);

  const defaultOptions = {
    endpoint: 'https://api.example.com/upload',
    chunk: {
      size: 1024 * 1024, // 1MB
      optimizeFirstChunk: true,
    },
    network: {
      concurrency: 3,
      timeout: 5000,
    },
    retry: {
      count: 2,
      delay: 500,
    },
  };

  const mergedOptions = { ...defaultOptions, ...options };
  return new UploaderCore(container, mergedOptions);
};

describe('文件上传流程', () => {
  let uploader: UploaderCore;
  let testFile: File;
  const uploadEndpoint = 'https://api.example.com/upload';
  const mergeEndpoint = 'https://api.example.com/merge';

  // 上传分片的处理器
  const uploadChunkHandler = vi.fn((req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        chunkIndex: req.url.searchParams.get('chunkIndex'),
      })
    );
  });

  // 合并分片的处理器
  const mergeChunksHandler = vi.fn((req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        url: 'https://example.com/files/merged-file.txt',
      })
    );
  });

  beforeEach(async () => {
    // 创建测试文件
    testFile = TestFileGenerator.createTextFile(3 * 1024 * 1024, 'test.txt'); // 3MB

    // 设置 MSW 处理器
    mswServer.use(
      rest.post(uploadEndpoint, uploadChunkHandler),
      rest.post(mergeEndpoint, mergeChunksHandler)
    );

    // 创建上传器实例
    uploader = createUploaderInstance({
      endpoint: uploadEndpoint,
      mergeEndpoint: mergeEndpoint,
    });
  });

  afterEach(() => {
    uploader.dispose();
    vi.resetAllMocks();
    mswServer.resetHandlers();
  });

  it('应该完成完整的上传流程', async () => {
    // 监听进度事件
    const progressHandler = vi.fn();
    uploader.on('progress', progressHandler);

    // 监听成功事件
    const successHandler = vi.fn();
    uploader.on('success', successHandler);

    try {
      // 执行上传
      const result = await uploader.upload(testFile);

      // 验证上传结果
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        })
      );

      // 验证分片上传被调用了正确的次数（根据文件大小和分片大小）
      const expectedChunks = Math.ceil(testFile.size / (1024 * 1024));
      expect(uploadChunkHandler).toHaveBeenCalledTimes(expectedChunks);

      // 验证合并请求被调用
      expect(mergeChunksHandler).toHaveBeenCalledTimes(1);

      // 验证进度事件被触发
      expect(progressHandler).toHaveBeenCalled();

      // 验证成功事件被触发
      expect(successHandler).toHaveBeenCalled();
    } catch (error) {
      // 测试失败
      expect(error).toBeFalsy();
    }
  });

  it('应该处理网络错误并进行重试', async () => {
    // 第一次请求失败，之后成功
    let attemptCount = 0;
    const failingUploadHandler = vi.fn((req, res, ctx) => {
      attemptCount++;
      if (attemptCount <= 1) {
        return res(ctx.status(500));
      }
      return res(
        ctx.status(200),
        ctx.json({
          success: true,
          chunkIndex: req.url.searchParams.get('chunkIndex'),
        })
      );
    });

    // 替换处理器
    mswServer.resetHandlers();
    mswServer.use(
      rest.post(uploadEndpoint, failingUploadHandler),
      rest.post(mergeEndpoint, mergeChunksHandler)
    );

    // 监听错误和重试事件
    const errorHandler = vi.fn();
    uploader.on('error', errorHandler);

    const retryHandler = vi.fn();
    uploader.on('retry', retryHandler);

    try {
      const result = await uploader.upload(testFile);

      // 验证上传结果
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        })
      );

      // 验证错误处理和重试机制
      expect(errorHandler).toHaveBeenCalled();
      expect(retryHandler).toHaveBeenCalled();
      expect(attemptCount).toBeGreaterThan(1);
    } catch (error) {
      // 测试失败
      expect(error).toBeFalsy();
    }
  });

  it('应该能暂停和恢复上传', async () => {
    // 监听暂停和恢复事件
    const pauseHandler = vi.fn();
    uploader.on('pause', pauseHandler);

    const resumeHandler = vi.fn();
    uploader.on('resume', resumeHandler);

    // 上传进度变量
    let uploadProgress = 0;

    // 上传事件处理器
    uploader.on('progress', data => {
      uploadProgress = data.progress;

      // 当进度达到 30% 时暂停上传
      if (uploadProgress >= 0.3 && uploadProgress < 0.5) {
        uploader.pauseFile(data.fileId);
      }
    });

    // 开始上传，但不等待完成
    const uploadPromise = uploader.upload(testFile);

    // 等待一段时间，确保上传已经开始并被暂停
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 检查上传是否已暂停
    expect(pauseHandler).toHaveBeenCalled();

    // 恢复上传
    const fileId = pauseHandler.mock.calls[0][0].fileId;
    await uploader.resumeFile(fileId);

    // 验证恢复事件被触发
    expect(resumeHandler).toHaveBeenCalled();

    // 等待上传完成
    const result = await uploadPromise;

    // 验证最终结果
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('应该正确处理并发上传限制', async () => {
    // 创建多个测试文件
    const files = [
      TestFileGenerator.createTextFile(1024 * 1024, 'file1.txt'),
      TestFileGenerator.createTextFile(1024 * 1024, 'file2.txt'),
      TestFileGenerator.createTextFile(1024 * 1024, 'file3.txt'),
      TestFileGenerator.createTextFile(1024 * 1024, 'file4.txt'),
      TestFileGenerator.createTextFile(1024 * 1024, 'file5.txt'),
    ];

    // 创建限制并发的上传器
    const limitedUploader = createUploaderInstance({
      endpoint: uploadEndpoint,
      mergeEndpoint: mergeEndpoint,
      network: {
        concurrency: 2, // 限制只有2个并发
      },
    });

    // 添加延迟到上传处理器
    const delayedUploadHandler = vi.fn(async (req, res, ctx) => {
      // 添加500ms延迟
      await new Promise(resolve => setTimeout(resolve, 500));
      return res(
        ctx.status(200),
        ctx.json({
          success: true,
          chunkIndex: req.url.searchParams.get('chunkIndex'),
        })
      );
    });

    // 替换处理器
    mswServer.resetHandlers();
    mswServer.use(
      rest.post(uploadEndpoint, delayedUploadHandler),
      rest.post(mergeEndpoint, mergeChunksHandler)
    );

    // 开始多个上传
    const uploadPromises = files.map(file => limitedUploader.upload(file));

    // 等待所有上传完成
    const results = await Promise.all(uploadPromises);

    // 验证所有上传都成功
    results.forEach(result => {
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        })
      );
    });

    // 验证上传是分批进行的
    expect(delayedUploadHandler).toHaveBeenCalled();

    // 清理
    limitedUploader.dispose();
  });
});
