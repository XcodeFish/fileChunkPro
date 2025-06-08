import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { UploaderCore } from '../../../src/core/UploaderCore';
import { ChunkPlugin } from '../../../src/plugins/ChunkPlugin';
import { MemoryManager } from '../../../src/utils/MemoryManager';

describe('ChunkPlugin', () => {
  let plugin: ChunkPlugin;
  let core: UploaderCore;

  // 模拟文件对象
  const createMockFile = (size: number, name = 'test.mp4') => {
    const buffer = new ArrayBuffer(size);
    const blob = new Blob([buffer], { type: 'video/mp4' });

    return {
      name,
      size,
      type: 'video/mp4',
      source: blob,
      meta: {},
    };
  };

  beforeEach(() => {
    // 创建插件实例
    plugin = new ChunkPlugin();

    // 创建模拟的UploaderCore
    core = {
      hook: vi.fn(),
      emit: vi.fn(),
      adapter: {
        readChunk: vi.fn().mockResolvedValue(new Blob(['test-chunk'])),
      },
    } as unknown as UploaderCore;

    // 清除MemoryManager的状态
    vi.spyOn(MemoryManager, 'startMonitoring').mockImplementation(() => {});
    vi.spyOn(MemoryManager, 'stopMonitoring').mockImplementation(() => {});
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockImplementation(
      fileSize => {
        if (fileSize < 10 * 1024 * 1024) {
          return 1 * 1024 * 1024; // 1MB
        } else {
          return 5 * 1024 * 1024; // 5MB
        }
      }
    );
    vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('install', () => {
    it('应当注册所需的钩子函数', () => {
      plugin.install(core);

      expect(core.hook).toHaveBeenCalledWith(
        'beforeUpload',
        expect.any(Function)
      );
      expect(core.hook).toHaveBeenCalledWith(
        'beforeChunk',
        expect.any(Function)
      );
      expect(core.hook).toHaveBeenCalledWith('dispose', expect.any(Function));
    });
  });

  describe('handleBeforeUpload', () => {
    it('应当计算最优分片大小并设置文件元数据', async () => {
      plugin.install(core);

      // 提取beforeUpload钩子函数
      const beforeUploadHook = (core.hook as any).mock.calls.find(
        call => call[0] === 'beforeUpload'
      )[1];

      // 创建测试文件
      const file = createMockFile(100 * 1024 * 1024); // 100MB

      // 调用钩子函数
      const result = await beforeUploadHook(file);

      // 验证元数据是否正确设置
      expect(result.meta).toEqual(
        expect.objectContaining({
          chunkSize: 5 * 1024 * 1024, // 应该使用5MB分片
          totalChunks: 20, // 100MB / 5MB = 20
          useStreams: expect.any(Boolean),
        })
      );
    });

    it('应当在文件大小无效时抛出错误', async () => {
      plugin.install(core);

      // 提取beforeUpload钩子函数
      const beforeUploadHook = (core.hook as any).mock.calls.find(
        call => call[0] === 'beforeUpload'
      )[1];

      // 创建无效大小的测试文件
      const file = createMockFile(0);

      // 应该抛出错误
      await expect(beforeUploadHook(file)).rejects.toThrow('文件大小无效');
    });
  });

  describe('handleBeforeChunk', () => {
    it('应当创建正确数量的文件分片', async () => {
      plugin.install(core);

      // 提取beforeChunk钩子函数
      const beforeChunkHook = (core.hook as any).mock.calls.find(
        call => call[0] === 'beforeChunk'
      )[1];

      // 创建测试文件 (10MB)
      const fileSize = 10 * 1024 * 1024;
      const file = createMockFile(fileSize);
      file.meta.chunkSize = 2 * 1024 * 1024; // 2MB分片

      // 调用钩子函数
      const chunks = await beforeChunkHook(file);

      // 验证分片数量 (10MB / 2MB = 5)
      expect(chunks.length).toBe(5);

      // 验证分片属性
      chunks.forEach((chunk, index) => {
        expect(chunk).toEqual(
          expect.objectContaining({
            index,
            status: 'pending',
            progress: 0,
            retries: 0,
          })
        );

        // 验证分片大小（除了最后一个分片）
        if (index < 4) {
          expect(chunk.size).toBe(2 * 1024 * 1024);
        } else {
          expect(chunk.size).toBe(2 * 1024 * 1024); // 最后一个分片也是2MB
        }
      });
    });

    it('在内存不足时应当减小分片大小并建议垃圾回收', async () => {
      // 模拟内存不足状态
      vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(true);
      vi.spyOn(MemoryManager, 'suggestGarbageCollection').mockImplementation(
        () => {}
      );

      plugin.install(core);

      // 提取beforeChunk钩子函数
      const beforeChunkHook = (core.hook as any).mock.calls.find(
        call => call[0] === 'beforeChunk'
      )[1];

      // 创建测试文件 (200MB)
      const fileSize = 200 * 1024 * 1024;
      const file = createMockFile(fileSize);

      // 调用钩子函数
      await beforeChunkHook(file);

      // 验证是否调用了垃圾回收建议
      expect(MemoryManager.suggestGarbageCollection).toHaveBeenCalled();
    });
  });

  describe('流式处理', () => {
    it('对于大文件应当优先使用流式处理', async () => {
      // 模拟ReadableStream支持
      global.ReadableStream = class MockReadableStream {} as any;
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => new ReadableStream(),
        configurable: true,
      });

      // 创建启用流处理的插件
      const streamPlugin = new ChunkPlugin({ useStreams: true });
      streamPlugin.install(core);

      // 提取beforeChunk钩子函数
      const beforeChunkHook = (core.hook as any).mock.calls.find(
        call => call[0] === 'beforeChunk'
      )[1];

      // 创建大文件 (200MB)
      const fileSize = 200 * 1024 * 1024;
      const file = createMockFile(fileSize);
      file.meta.useStreams = true;

      // 调用钩子函数
      const chunks = await beforeChunkHook(file);

      // 验证分片是否使用了流
      expect(chunks[0].isStream).toBe(true);
      expect(typeof chunks[0].getStream).toBe('function');
    });
  });

  describe('大文件策略', () => {
    it('应当基于文件大小选择合适的处理策略', () => {
      const calculateStrategy = (plugin as any).calculateLargeFileStrategy.bind(
        plugin
      );

      // 小文件策略 (50MB)
      const smallFileStrategy = calculateStrategy(50 * 1024 * 1024);
      expect(smallFileStrategy).toEqual(
        expect.objectContaining({
          useStreams: false,
          concurrency: 4,
        })
      );

      // 中等文件策略 (500MB)
      const mediumFileStrategy = calculateStrategy(500 * 1024 * 1024);
      expect(mediumFileStrategy).toEqual(
        expect.objectContaining({
          useStreams: true,
          concurrency: 2,
        })
      );

      // 大文件策略 (2GB)
      const largeFileStrategy = calculateStrategy(2 * 1024 * 1024 * 1024);
      expect(largeFileStrategy).toEqual(
        expect.objectContaining({
          useStreams: true,
          concurrency: 2,
        })
      );
    });

    it('在内存不足时应当降级策略', () => {
      // 模拟内存不足
      vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(true);

      const calculateStrategy = (plugin as any).calculateLargeFileStrategy.bind(
        plugin
      );

      // 大文件在内存不足时的策略
      const lowMemoryStrategy = calculateStrategy(1 * 1024 * 1024 * 1024);

      expect(lowMemoryStrategy).toEqual(
        expect.objectContaining({
          concurrency: 1,
          useWorker: false,
        })
      );

      // 验证分片大小是否合理
      expect(lowMemoryStrategy.chunkSize).toBeLessThanOrEqual(5 * 1024 * 1024); // 不超过5MB
    });
  });
});
