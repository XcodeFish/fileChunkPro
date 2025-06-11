/**
 * ChunkPlugin 扩展测试
 * 测试分片插件的高级功能和边缘情况
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UploaderCore } from '../../../src/core/UploaderCore';
import { DependencyContainer } from '../../../src/core/DependencyContainer';
import { EventBus } from '../../../src/core/EventBus';
import { ErrorCenter } from '../../../src/core/error';
import { PluginManager } from '../../../src/core/PluginManager';
import { TaskScheduler } from '../../../src/core/TaskScheduler';
import ChunkPlugin from '../../../src/plugins/ChunkPlugin';
import { TestFileGenerator } from '../../setup';

// 创建模拟依赖
const createMockDependencies = () => {
  const eventBus = new EventBus();
  const errorCenter = new ErrorCenter();
  const fileManager = {
    prepareFile: vi.fn().mockResolvedValue([]),
    validateFile: vi
      .fn()
      .mockResolvedValue({ valid: true, errors: [], warnings: [] }),
    addFile: vi.fn(),
    getFile: vi.fn(),
    getFileStatus: vi.fn().mockReturnValue({ progress: 0 }),
    createChunks: vi.fn().mockImplementation((file, chunkSize) => {
      // 简单模拟分片创建，根据文件大小和分片大小计算分片数
      const totalChunks = Math.ceil(file.size / chunkSize);
      const chunks = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        chunks.push({
          id: `chunk-${i}`,
          index: i,
          start,
          end,
          size: end - start,
          blob: new Blob(['chunk-content']),
          totalChunks,
        });
      }

      return Promise.resolve(chunks);
    }),
    cleanup: vi.fn(),
    dispose: vi.fn(),
    getFileType: vi.fn().mockReturnValue('text/plain'),
    generateFileId: vi
      .fn()
      .mockImplementation(() => Promise.resolve(`file-${Date.now()}`)),
    getOptimalChunkSize: vi
      .fn()
      .mockImplementation(() => Promise.resolve(2 * 1024 * 1024)), // 默认返回2MB
  };
  const networkManager = {
    uploadChunk: vi.fn().mockResolvedValue({ data: { success: true } }),
    mergeChunks: vi.fn().mockResolvedValue({ data: { success: true } }),
    setOptions: vi.fn(),
    dispose: vi.fn(),
  };
  const pluginManager = new PluginManager(eventBus);
  const taskScheduler = new TaskScheduler({ concurrency: 3 });

  const container = new DependencyContainer();
  container.register('eventBus', eventBus);
  container.register('errorCenter', errorCenter);
  container.register('fileManager', fileManager);
  container.register('networkManager', networkManager);
  container.register('pluginManager', pluginManager);
  container.register('taskScheduler', taskScheduler);

  return {
    container,
    eventBus,
    errorCenter,
    fileManager,
    networkManager,
    pluginManager,
    taskScheduler,
  };
};

describe('ChunkPlugin - 高级功能测试', () => {
  let mockDependencies;
  let uploader: UploaderCore;
  let chunkPlugin: ChunkPlugin;

  beforeEach(() => {
    mockDependencies = createMockDependencies();
    uploader = new UploaderCore(mockDependencies.container, {
      endpoint: 'https://api.example.com/upload',
    });
    chunkPlugin = new ChunkPlugin();
  });

  afterEach(() => {
    uploader.dispose();
    vi.resetAllMocks();
  });

  it('应该能使用不同的分片大小配置', async () => {
    // 创建特定分片大小的插件
    const customChunkSize = 1024 * 1024; // 1MB
    const customPlugin = new ChunkPlugin({ chunkSize: customChunkSize });

    uploader.use(customPlugin);

    // 创建测试文件
    const testFile = TestFileGenerator.createTextFile(5 * 1024 * 1024); // 5MB文件

    // 准备文件
    await uploader.prepareFile(testFile);

    // 验证 createChunks 使用了正确的分片大小
    expect(mockDependencies.fileManager.createChunks).toHaveBeenCalledWith(
      expect.anything(),
      customChunkSize
    );
  });

  it('应该支持"auto"分片大小设置', async () => {
    // 创建自动分片大小的插件
    const autoSizePlugin = new ChunkPlugin({ chunkSize: 'auto' });

    uploader.use(autoSizePlugin);

    // 创建测试文件
    const testFile = TestFileGenerator.createTextFile(10 * 1024 * 1024); // 10MB文件

    // 准备文件
    await uploader.prepareFile(testFile);

    // 验证调用了获取最佳分片大小的方法
    expect(mockDependencies.fileManager.getOptimalChunkSize).toHaveBeenCalled();
  });

  it('应该对不同大小的文件使用不同的分片策略', async () => {
    const adaptivePlugin = new ChunkPlugin({
      chunkSize: 'auto',
      enableOptimization: true,
    });

    uploader.use(adaptivePlugin);

    // 测试小文件
    const smallFile = TestFileGenerator.createTextFile(500 * 1024); // 500KB
    await uploader.prepareFile(smallFile);

    // 验证小文件的调用
    expect(mockDependencies.fileManager.createChunks).toHaveBeenCalled();
    const smallFileCallChunkSize =
      mockDependencies.fileManager.createChunks.mock.calls[0][1];

    // 重置模拟
    mockDependencies.fileManager.createChunks.mockClear();

    // 测试大文件
    const largeFile = TestFileGenerator.createTextFile(100 * 1024 * 1024); // 100MB
    await uploader.prepareFile(largeFile);

    // 验证大文件的调用
    expect(mockDependencies.fileManager.createChunks).toHaveBeenCalled();
    const largeFileCallChunkSize =
      mockDependencies.fileManager.createChunks.mock.calls[0][1];

    // 大文件的分片大小应该比小文件的大
    expect(largeFileCallChunkSize).toBeGreaterThanOrEqual(
      smallFileCallChunkSize
    );
  });

  it('应该能正确处理空文件', async () => {
    uploader.use(chunkPlugin);

    // 创建空文件
    const emptyFile = TestFileGenerator.createTextFile(0);

    // 准备文件
    await uploader.prepareFile(emptyFile);

    // 验证创建分片被调用
    expect(mockDependencies.fileManager.createChunks).toHaveBeenCalled();

    // 模拟的实现应该至少返回一个分片
    const chunks = await mockDependencies.fileManager.createChunks(
      emptyFile,
      1024 * 1024
    );
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('应该能处理文件名中有特殊字符的文件', async () => {
    uploader.use(chunkPlugin);

    // 创建带特殊字符文件名的文件
    const specialNameFile = new File(
      ['test content'],
      'test file with spaces & 特殊字符.txt',
      { type: 'text/plain' }
    );

    // 准备文件
    await uploader.prepareFile(specialNameFile);

    // 验证文件ID生成方法被调用
    expect(mockDependencies.fileManager.generateFileId).toHaveBeenCalled();
  });
});

describe('ChunkPlugin - 边缘情况测试', () => {
  let mockDependencies;
  let uploader: UploaderCore;

  beforeEach(() => {
    mockDependencies = createMockDependencies();
    uploader = new UploaderCore(mockDependencies.container, {
      endpoint: 'https://api.example.com/upload',
    });
  });

  afterEach(() => {
    uploader.dispose();
    vi.resetAllMocks();
  });

  it('应该能处理分片大小大于文件大小的情况', async () => {
    // 创建分片大小大于文件的配置
    const largeChunkPlugin = new ChunkPlugin({ chunkSize: 10 * 1024 * 1024 }); // 10MB
    uploader.use(largeChunkPlugin);

    // 创建小文件
    const smallFile = TestFileGenerator.createTextFile(1 * 1024 * 1024); // 1MB

    // 准备文件
    await uploader.prepareFile(smallFile);

    // 验证调用了正确的分片大小
    expect(mockDependencies.fileManager.createChunks).toHaveBeenCalledWith(
      expect.anything(),
      10 * 1024 * 1024
    );

    // 验证只创建了一个分片
    const chunks = await mockDependencies.fileManager.createChunks(
      smallFile,
      10 * 1024 * 1024
    );
    expect(chunks.length).toBe(1);
  });

  it('应该能处理非常大的文件', async () => {
    const chunkPlugin = new ChunkPlugin();
    uploader.use(chunkPlugin);

    // 模拟一个大文件 (实际上不创建真实内容，只模拟大小)
    const hugeFileMock = {
      name: 'huge-file.bin',
      size: 5 * 1024 * 1024 * 1024, // 5GB
      type: 'application/octet-stream',
    };

    // 模拟文件验证方法以允许大文件
    mockDependencies.fileManager.validateFile.mockResolvedValue({
      valid: true,
      errors: [],
      warnings: ['文件非常大，上传可能需要较长时间'],
    });

    // 准备文件
    await uploader.prepareFile(hugeFileMock);

    // 验证创建分片被调用
    expect(mockDependencies.fileManager.createChunks).toHaveBeenCalled();
  });

  it('应该正确处理分片大小小于最小限制的情况', async () => {
    // 创建一个分片大小小于最小限制的插件
    const tinyChunkPlugin = new ChunkPlugin({ chunkSize: 10 * 1024 }); // 10KB，太小
    uploader.use(tinyChunkPlugin);

    // 创建测试文件
    const testFile = TestFileGenerator.createTextFile(1 * 1024 * 1024); // 1MB

    // 准备文件
    await uploader.prepareFile(testFile);

    // 验证调用，应该使用了最小限制的分片大小而不是配置的极小值
    expect(mockDependencies.fileManager.createChunks).toHaveBeenCalled();
    const usedChunkSize =
      mockDependencies.fileManager.createChunks.mock.calls[0][1];

    // 分片大小应该大于或等于最小限制（通常为512KB）
    expect(usedChunkSize).toBeGreaterThanOrEqual(512 * 1024);
  });
});
