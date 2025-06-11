import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { UploadError } from '../../../src/core/error';
import { UploaderCore } from '../../../src/core/UploaderCore';
import { NetworkQuality } from '../../../src/types';

// 模拟文件对象
const createMockFile = (name: string, size: number, type: string) => {
  return {
    name,
    size,
    type,
    slice: vi.fn((start, end) => ({
      size: end - start,
    })),
  };
};

describe('UploaderCore', () => {
  let uploader: UploaderCore;

  beforeEach(() => {
    uploader = new UploaderCore({
      endpoint: 'https://example.com/upload',
      chunkSize: 1024 * 1024, // 1MB
      concurrency: 3,
      timeout: 5000,
    });
  });

  afterEach(() => {
    uploader.dispose();
    vi.clearAllMocks();
  });

  it('should create an instance with default options', () => {
    expect(uploader).toBeInstanceOf(UploaderCore);
  });

  it('should throw error when endpoint is not provided', () => {
    expect(() => new UploaderCore({} as any)).toThrow(UploadError);
  });

  it('should register and call event handlers', () => {
    const mockHandler = vi.fn();
    uploader.on('test', mockHandler);
    uploader.emit('test', { data: 'test' });

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { data: 'test' },
      })
    );
  });

  it('should register and use plugins', () => {
    const mockPlugin = {
      install: vi.fn(),
    };

    uploader.registerPlugin('testPlugin', mockPlugin);

    expect(mockPlugin.install).toHaveBeenCalledWith(uploader);
  });

  it('should cancel upload', async () => {
    const cancelSpy = vi.spyOn(uploader, 'cancel');
    const emitSpy = vi.spyOn(uploader, 'emit');

    // 模拟上传过程
    const uploadPromise = uploader
      .upload(createMockFile('test.txt', 1024 * 1024, 'text/plain'))
      .catch(e => e); // 捕获取消错误

    // 立即取消
    uploader.cancel();

    const result = await uploadPromise;

    expect(cancelSpy).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('cancel', expect.anything());
    expect(result).toBeInstanceOf(UploadError);
  });

  // 新增测试用例 - 大文件处理
  it('should handle large file uploads correctly', async () => {
    const largeFile = createMockFile(
      'large.txt',
      100 * 1024 * 1024,
      'text/plain'
    ); // 100MB

    // 模拟分片上传方法
    const uploadChunkSpy = vi.spyOn(uploader, 'uploadChunk').mockResolvedValue({
      chunkIndex: 0,
      success: true,
    } as any);

    // 模拟任务创建
    vi.spyOn(uploader, 'createTask').mockReturnValue({
      id: 'task-1',
      file: largeFile,
      status: 'pending',
    } as any);

    const promise = uploader.upload(largeFile);
    await expect(promise).resolves.not.toThrow();

    // 验证分片上传被调用
    expect(uploadChunkSpy).toHaveBeenCalled();
  });

  // 新增测试用例 - 网络错误处理和重试机制
  it('should handle network errors and retry', async () => {
    const file = createMockFile('test.txt', 1024 * 1024, 'text/plain');
    let attempts = 0;

    // 模拟网络错误和重试
    vi.spyOn(uploader, 'uploadChunk').mockImplementation(() => {
      attempts++;
      if (attempts <= 2) {
        return Promise.reject(new UploadError('network', 'Network error'));
      }
      return Promise.resolve({
        chunkIndex: 0,
        success: true,
      } as any);
    });

    // 模拟任务创建
    vi.spyOn(uploader, 'createTask').mockReturnValue({
      id: 'task-1',
      file: file,
      status: 'pending',
    } as any);

    const promise = uploader.upload(file);
    await expect(promise).resolves.not.toThrow();

    // 验证重试次数
    expect(attempts).toBeGreaterThan(1);
  });

  // 新增测试用例 - 测试暂停和恢复功能
  it('should pause and resume upload', async () => {
    const file = createMockFile('test.txt', 5 * 1024 * 1024, 'text/plain');

    // 模拟上传状态
    const mockTaskId = 'task-123';
    vi.spyOn(uploader, 'getTaskById').mockImplementation(id => {
      if (id === mockTaskId) {
        return {
          id: mockTaskId,
          file,
          status: 'uploading',
          progress: 0.5,
          pause: vi.fn(),
          resume: vi.fn(),
        } as any;
      }
      return null;
    });

    // 模拟创建任务
    vi.spyOn(uploader, 'createTask').mockReturnValue({
      id: mockTaskId,
      file,
      status: 'pending',
    } as any);

    // 启动上传但不等待完成
    uploader.upload(file);

    // 暂停上传
    uploader.pause(mockTaskId);
    const pausedTask = uploader.getTaskById(mockTaskId);
    expect(pausedTask?.pause).toHaveBeenCalled();

    // 恢复上传
    uploader.resume(mockTaskId);
    const resumedTask = uploader.getTaskById(mockTaskId);
    expect(resumedTask?.resume).toHaveBeenCalled();
  });

  // 新增测试用例 - 并发控制
  it('should respect concurrency limits', async () => {
    // 创建限制并发为2的上传器
    const concurrentUploader = new UploaderCore({
      endpoint: 'https://example.com/upload',
      concurrency: 2,
      chunkSize: 1024 * 1024,
    });

    // 模拟处理任务的方法
    vi.spyOn(concurrentUploader as any, 'processTasks').mockImplementation(() =>
      Promise.resolve()
    );

    // 模拟三个文件
    const files = [
      createMockFile('file1.txt', 1024 * 1024, 'text/plain'),
      createMockFile('file2.txt', 1024 * 1024, 'text/plain'),
      createMockFile('file3.txt', 1024 * 1024, 'text/plain'),
    ];

    // 添加三个任务
    files.forEach(file => {
      concurrentUploader.addFile(file);
    });

    // 验证同时处理的任务数量
    expect(concurrentUploader.getActiveTaskCount()).toBeLessThanOrEqual(2);

    // 清理
    concurrentUploader.dispose();
  });

  // 新增测试用例 - 自适应分片大小
  it('should adapt chunk size based on network conditions', async () => {
    // 创建启用自适应分片大小的上传器
    const adaptiveUploader = new UploaderCore({
      endpoint: 'https://example.com/upload',
      adaptiveChunkSize: true,
      chunkSize: 1024 * 1024,
    });

    // 模拟网络检测
    vi.spyOn(adaptiveUploader as any, 'detectNetworkQuality').mockResolvedValue(
      NetworkQuality.LOW
    );

    // 模拟调整分片大小的方法
    const adjustChunkSizeSpy = vi.spyOn(
      adaptiveUploader as any,
      'adjustChunkSize'
    );

    // 触发网络状态变化
    adaptiveUploader.emit('networkStatusChange', {
      quality: NetworkQuality.LOW,
    });

    // 验证是否调整了分片大小
    expect(adjustChunkSizeSpy).toHaveBeenCalled();

    // 清理
    adaptiveUploader.dispose();
  });

  // 新增测试用例 - 文件类型验证
  it('should validate file types correctly', async () => {
    // 创建带有文件类型限制的上传器
    const validatingUploader = new UploaderCore({
      endpoint: 'https://example.com/upload',
      allowedFileTypes: ['image/jpeg', 'image/png'],
    });

    // 合法文件类型
    const validFile = createMockFile('image.jpg', 1024 * 1024, 'image/jpeg');

    // 不合法文件类型
    const invalidFile = createMockFile(
      'document.pdf',
      1024 * 1024,
      'application/pdf'
    );

    // 测试合法文件
    expect(() => validatingUploader.validateFile(validFile)).not.toThrow();

    // 测试不合法文件
    expect(() => validatingUploader.validateFile(invalidFile)).toThrow(
      UploadError
    );

    // 清理
    validatingUploader.dispose();
  });
});
