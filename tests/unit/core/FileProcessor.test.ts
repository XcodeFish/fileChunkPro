import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { FileProcessor } from '../../../src/core/FileProcessor';
import { MemoryManager } from '../../../src/utils/MemoryManager';
import { NetworkDetector } from '../../../src/utils/NetworkDetector';
import { NetworkQuality } from '../../../src/types';

// 模拟文件对象
const createMockFile = (name: string, size: number, type: string) => {
  const file = {
    name,
    size,
    type,
    lastModified: Date.now(),
    slice: vi.fn((start, end) => ({
      size: end - start,
      type,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(end - start)),
    })),
  };
  return file as unknown as File;
};

describe('FileProcessor', () => {
  let fileProcessor: FileProcessor;

  beforeEach(() => {
    // 初始化 FileProcessor 实例
    fileProcessor = new FileProcessor({
      chunkSize: 1024 * 1024, // 1MB
      hash: {
        enabled: true,
        algorithm: 'md5',
      },
      minChunkSize: 256 * 1024, // 256KB
      maxChunkSize: 5 * 1024 * 1024, // 5MB
      adaptiveChunkSize: true,
    });

    // 模拟 MemoryManager
    vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(false);
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockImplementation(
      fileSize => Math.min(fileSize / 10, 2 * 1024 * 1024)
    );

    // 模拟 NetworkDetector
    vi.spyOn(
      NetworkDetector.prototype,
      'detectNetworkQuality'
    ).mockResolvedValue(NetworkQuality.GOOD);
    vi.spyOn(NetworkDetector.prototype, 'getNetworkStatus').mockReturnValue(
      'online'
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    fileProcessor.dispose();
  });

  it('should initialize with default options when not provided', () => {
    // 使用空选项初始化
    const defaultProcessor = new FileProcessor({});

    // 检查是否使用了默认值
    expect(defaultProcessor.getOptions()).toEqual(
      expect.objectContaining({
        chunkSize: expect.any(Number),
        hash: expect.objectContaining({
          enabled: expect.any(Boolean),
        }),
      })
    );

    // 清理
    defaultProcessor.dispose();
  });

  it('should generate file metadata correctly', async () => {
    // 创建测试文件
    const testFile = createMockFile('test.txt', 5 * 1024 * 1024, 'text/plain');

    // 生成元数据
    const metadata = await fileProcessor.generateFileMetadata(testFile);

    // 验证元数据
    expect(metadata).toEqual(
      expect.objectContaining({
        name: 'test.txt',
        size: 5 * 1024 * 1024,
        type: 'text/plain',
        lastModified: expect.any(Number),
      })
    );
  });

  it('should calculate file hash correctly', async () => {
    // 模拟哈希计算函数
    const mockHashValue = 'abc123def456';
    vi.spyOn(fileProcessor as any, 'calculateFileHash').mockResolvedValue(
      mockHashValue
    );

    // 测试文件
    const testFile = createMockFile('test.txt', 1024 * 1024, 'text/plain');

    // 计算哈希
    const hash = await fileProcessor.getFileHash(testFile);

    // 验证结果
    expect(hash).toBe(mockHashValue);
    expect((fileProcessor as any).calculateFileHash).toHaveBeenCalledWith(
      testFile,
      expect.any(String)
    );
  });

  it('should divide file into correct number of chunks', async () => {
    // 设置块大小
    fileProcessor.setChunkSize(1024 * 1024); // 1MB

    // 测试文件（5MB）
    const testFile = createMockFile('test.txt', 5 * 1024 * 1024, 'text/plain');

    // 创建分片
    const chunks = await fileProcessor.createFileChunks(testFile);

    // 验证分片数量
    expect(chunks.length).toBe(5);
    expect(chunks[0].size).toBe(1024 * 1024);
    expect(chunks[0].index).toBe(0);
    expect(chunks[4].index).toBe(4);
  });

  it('should adapt chunk size based on network quality', async () => {
    // 模拟低质量网络
    vi.spyOn(
      NetworkDetector.prototype,
      'detectNetworkQuality'
    ).mockResolvedValue(NetworkQuality.LOW);

    // 获取低质量网络的块大小
    await fileProcessor.updateNetworkBasedChunkSize();
    const lowNetworkChunkSize = fileProcessor.getChunkSize();

    // 模拟高质量网络
    vi.spyOn(
      NetworkDetector.prototype,
      'detectNetworkQuality'
    ).mockResolvedValue(NetworkQuality.EXCELLENT);

    // 获取高质量网络的块大小
    await fileProcessor.updateNetworkBasedChunkSize();
    const highNetworkChunkSize = fileProcessor.getChunkSize();

    // 验证块大小调整
    expect(lowNetworkChunkSize).toBeLessThan(highNetworkChunkSize);
  });

  it('should adapt chunk size based on memory conditions', async () => {
    // 模拟内存不足
    vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(true);
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockReturnValue(512 * 1024); // 512KB

    // 在内存不足情况下更新块大小
    await fileProcessor.updateMemoryBasedChunkSize(10 * 1024 * 1024); // 10MB 文件
    const lowMemoryChunkSize = fileProcessor.getChunkSize();

    // 模拟内存充足
    vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(false);
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockReturnValue(
      2 * 1024 * 1024
    ); // 2MB

    // 在内存充足情况下更新块大小
    await fileProcessor.updateMemoryBasedChunkSize(10 * 1024 * 1024); // 10MB 文件
    const normalMemoryChunkSize = fileProcessor.getChunkSize();

    // 验证块大小调整
    expect(lowMemoryChunkSize).toBeLessThan(normalMemoryChunkSize);
  });

  it('should respect minimum and maximum chunk size limits', async () => {
    // 设置最小值（测试最小值限制）
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockReturnValue(100 * 1024); // 100KB, 低于最小值
    await fileProcessor.updateMemoryBasedChunkSize(1024 * 1024);
    expect(fileProcessor.getChunkSize()).toBe(256 * 1024); // 应该使用设定的最小值

    // 设置最大值（测试最大值限制）
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockReturnValue(
      10 * 1024 * 1024
    ); // 10MB, 高于最大值
    await fileProcessor.updateMemoryBasedChunkSize(100 * 1024 * 1024);
    expect(fileProcessor.getChunkSize()).toBe(5 * 1024 * 1024); // 应该使用设定的最大值
  });

  it('should read file chunks asynchronously', async () => {
    // 创建测试文件
    const testFile = createMockFile('test.txt', 3 * 1024 * 1024, 'text/plain');

    // 设置块大小
    fileProcessor.setChunkSize(1024 * 1024); // 1MB

    // 读取块
    const chunk = await fileProcessor.readChunk(testFile, 1); // 读取第二个块

    // 验证是否使用了正确的参数调用 slice 方法
    expect(testFile.slice).toHaveBeenCalledWith(
      1 * 1024 * 1024, // 起始位置
      2 * 1024 * 1024 // 结束位置
    );

    // 验证返回的块数据
    expect(chunk).toBeInstanceOf(ArrayBuffer);
    expect(chunk.byteLength).toBe(1024 * 1024);
  });

  it('should handle the last chunk correctly when not aligned to chunk size', async () => {
    // 创建文件大小不是块大小整数倍的测试文件
    const testFile = createMockFile(
      'test.txt',
      3.5 * 1024 * 1024,
      'text/plain'
    ); // 3.5MB

    // 设置块大小为 1MB
    fileProcessor.setChunkSize(1024 * 1024);

    // 获取所有块
    const chunks = await fileProcessor.createFileChunks(testFile);

    // 应该有 4 个块
    expect(chunks.length).toBe(4);

    // 前 3 个块应该是完整的
    expect(chunks[0].size).toBe(1024 * 1024);
    expect(chunks[1].size).toBe(1024 * 1024);
    expect(chunks[2].size).toBe(1024 * 1024);

    // 最后一个块应该是 0.5MB
    expect(chunks[3].size).toBe(0.5 * 1024 * 1024);
  });

  it('should release resources on disposal', () => {
    // 模拟内部资源
    const mockCleanup = vi.fn();
    (fileProcessor as any).networkDetector = {
      dispose: mockCleanup,
    };

    // 调用 dispose 方法
    fileProcessor.dispose();

    // 验证清理方法被调用
    expect(mockCleanup).toHaveBeenCalled();
  });

  it('should optimize processing for large files', async () => {
    // 创建大文件
    const largeFile = createMockFile(
      'large.zip',
      500 * 1024 * 1024,
      'application/zip'
    ); // 500MB

    // 模拟大文件优化方法
    const optimizeSpy = vi.spyOn(fileProcessor as any, 'optimizeForLargeFile');

    // 处理文件
    await fileProcessor.processFile(largeFile);

    // 验证优化方法被调用
    expect(optimizeSpy).toHaveBeenCalledWith(largeFile);
  });

  it('should validate file size against limits', () => {
    // 设置大小限制
    fileProcessor.setOptions({
      maxFileSize: 100 * 1024 * 1024, // 100MB
      minFileSize: 1024, // 1KB
    });

    // 测试正常大小的文件
    const normalFile = createMockFile(
      'normal.txt',
      10 * 1024 * 1024,
      'text/plain'
    );
    expect(() => fileProcessor.validateFileSize(normalFile)).not.toThrow();

    // 测试过大的文件
    const tooLargeFile = createMockFile(
      'large.zip',
      200 * 1024 * 1024,
      'application/zip'
    );
    expect(() => fileProcessor.validateFileSize(tooLargeFile)).toThrow(
      /exceeds maximum/
    );

    // 测试过小的文件
    const tooSmallFile = createMockFile('tiny.txt', 500, 'text/plain');
    expect(() => fileProcessor.validateFileSize(tooSmallFile)).toThrow(
      /below minimum/
    );
  });
});
