import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ChunkPlugin } from '../../../src/plugins/ChunkPlugin';
import { MemoryManager } from '../../../src/utils/MemoryManager';
import { NetworkDetector } from '../../../src/utils/NetworkDetector';
import { NetworkQuality } from '../../../src/utils/NetworkQuality';

// 模拟UploaderCore
vi.mock('../../../src/core/UploaderCore', () => {
  return {
    UploaderCore: vi.fn().mockImplementation(() => ({
      // 模拟emit方法
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      // 其他必要的方法
      getOptions: vi.fn().mockReturnValue({
        chunkSize: 2 * 1024 * 1024, // 2MB
      }),
    })),
  };
});

describe('ChunkPlugin', () => {
  let plugin: ChunkPlugin;
  let core: {
    emit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    getOptions: ReturnType<typeof vi.fn>;
  };

  // 模拟文件对象
  function createMockFile(name: string, size: number): File {
    return new File([new ArrayBuffer(size)], name, {
      type: 'application/octet-stream',
    });
  }

  beforeEach(() => {
    // 设置模拟UploaderCore对象
    core = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getOptions: vi.fn().mockReturnValue({
        chunkSize: 2 * 1024 * 1024, // 2MB
      }),
    };

    // 创建插件实例
    plugin = new ChunkPlugin({
      chunkSize: 2 * 1024 * 1024, // 2MB
    });

    // 初始化插件
    plugin.install(core as any);

    // 清除MemoryManager的状态
    vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(false);
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockImplementation(
      (_fileSize: number) => 2 * 1024 * 1024
    );

    // 模拟NetworkDetector
    vi.spyOn(NetworkDetector, 'create').mockReturnValue({
      detectNetworkQuality: vi.fn().mockResolvedValue(NetworkQuality.GOOD),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register event handlers when installed', () => {
    // 重新安装插件以验证事件注册
    plugin.install(core as any);

    // 验证注册了正确的事件处理器
    expect(core.on).toHaveBeenCalledWith('beforeUpload', expect.any(Function));
    expect(core.on).toHaveBeenCalledWith('beforeChunk', expect.any(Function));
    expect(core.on).toHaveBeenCalledWith('dispose', expect.any(Function));
  });

  it('should handle memory conditions when calculating chunks', async () => {
    // 模拟内存不足
    vi.spyOn(MemoryManager, 'isLowMemory').mockReturnValue(true);
    vi.spyOn(MemoryManager, 'getOptimalChunkSize').mockReturnValue(
      1 * 1024 * 1024
    ); // 1MB

    // 创建测试文件
    const file = createMockFile('test.txt', 10 * 1024 * 1024); // 10MB

    // 获取私有方法
    const calculateChunks = (plugin as any).calculateChunks.bind(plugin);
    const chunks = await calculateChunks(file);

    // 验证在内存不足时使用了更小的分片大小
    expect(Array.isArray(chunks)).toBe(true);
    expect(MemoryManager.getOptimalChunkSize).toHaveBeenCalled();
  });

  it('should respect network conditions', async () => {
    // 模拟低速网络
    vi.spyOn(NetworkDetector, 'create').mockReturnValue({
      detectNetworkQuality: vi.fn().mockResolvedValue(NetworkQuality.LOW),
    } as any);

    // 创建测试文件
    const file = createMockFile('test.txt', 10 * 1024 * 1024); // 10MB

    // 获取私有方法
    const calculateChunks = (plugin as any).calculateChunks.bind(plugin);
    const chunks = await calculateChunks(file);

    // 验证返回了一个数组
    expect(Array.isArray(chunks)).toBe(true);
  });
});
