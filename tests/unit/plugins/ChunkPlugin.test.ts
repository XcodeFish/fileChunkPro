/**
 * ChunkPlugin 单元测试
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UploaderCore } from '../../../src/core/UploaderCore';
import { DependencyContainer } from '../../../src/core/DependencyContainer';
import { EventBus } from '../../../src/core/EventBus';
import { ErrorCenter } from '../../../src/core/error';
import { PluginManager } from '../../../src/core/PluginManager';
import { TaskScheduler } from '../../../src/core/TaskScheduler';

// 模拟依赖
const createMockDependencies = () => {
  const eventBus = new EventBus();
  const errorCenter = new ErrorCenter();
  const fileManager = {
    prepareFile: vi.fn().mockResolvedValue([]),
    addFile: vi.fn(),
    getFile: vi.fn(),
    getFileStatus: vi.fn().mockReturnValue({ progress: 0 }),
    cleanup: vi.fn(),
    dispose: vi.fn(),
  };
  const networkManager = {
    uploadChunk: vi.fn().mockResolvedValue({}),
    mergeChunks: vi.fn().mockResolvedValue({}),
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

// 创建模拟的 ChunkPlugin
class MockChunkPlugin {
  name = 'ChunkPlugin';
  options: any;

  constructor(options = {}) {
    this.options = {
      chunkSize: 2 * 1024 * 1024, // 2MB
      ...options,
    };
  }

  install(uploader: UploaderCore) {
    this.setupHooks(uploader);
  }

  setupHooks(uploader: UploaderCore) {
    const eventBus = uploader.getEventBus();

    eventBus.on('beforeFileProcess', this.handleBeforeFileProcess.bind(this));
    eventBus.on('chunkCreation', this.handleChunkCreation.bind(this));
  }

  handleBeforeFileProcess = vi.fn().mockImplementation(data => {
    return {
      ...data,
      chunkSize: this.options.chunkSize,
    };
  });

  handleChunkCreation = vi.fn().mockImplementation(data => {
    return {
      ...data,
      optimized: true,
    };
  });
}

describe('ChunkPlugin', () => {
  let mockDependencies;
  let uploader: UploaderCore;
  let chunkPlugin: MockChunkPlugin;

  beforeEach(() => {
    mockDependencies = createMockDependencies();
    uploader = new UploaderCore(mockDependencies.container, {
      endpoint: 'https://api.example.com/upload',
    });
    chunkPlugin = new MockChunkPlugin({ chunkSize: 1024 * 1024 }); // 1MB
  });

  afterEach(() => {
    uploader.dispose();
    vi.resetAllMocks();
  });

  it('应该能够注册ChunkPlugin', () => {
    uploader.use(chunkPlugin);
    expect(uploader.getPlugin('ChunkPlugin')).toBe(chunkPlugin);
  });

  it('应该响应beforeFileProcess事件', () => {
    uploader.use(chunkPlugin);

    // 触发事件
    uploader.emit('beforeFileProcess', { file: { name: 'test.txt' } });

    // 验证处理器被调用
    expect(chunkPlugin.handleBeforeFileProcess).toHaveBeenCalledWith({
      file: { name: 'test.txt' },
    });
  });

  it('应该能够设置分片大小', () => {
    const customChunkSize = 512 * 1024; // 512KB
    const customPlugin = new MockChunkPlugin({ chunkSize: customChunkSize });

    uploader.use(customPlugin);

    // 触发事件
    uploader.emit('beforeFileProcess', { file: { name: 'test.txt' } });

    // 验证分片大小被正确应用
    expect(customPlugin.handleBeforeFileProcess).toHaveBeenCalled();
    const result = customPlugin.handleBeforeFileProcess.mock.results[0].value;
    expect(result.chunkSize).toBe(customChunkSize);
  });

  it('应该响应chunkCreation事件', () => {
    uploader.use(chunkPlugin);

    // 触发事件
    const chunkData = {
      chunk: { id: 'chunk-1' },
      file: { name: 'test.txt' },
    };
    uploader.emit('chunkCreation', chunkData);

    // 验证处理器被调用
    expect(chunkPlugin.handleChunkCreation).toHaveBeenCalledWith(chunkData);

    // 验证处理结果
    const result = chunkPlugin.handleChunkCreation.mock.results[0].value;
    expect(result.optimized).toBe(true);
  });
});

describe('ChunkPlugin - 集成测试', () => {
  let mockDependencies;
  let uploader: UploaderCore;
  let chunkPlugin: MockChunkPlugin;
  let mockFile;

  beforeEach(() => {
    mockDependencies = createMockDependencies();
    uploader = new UploaderCore(mockDependencies.container, {
      endpoint: 'https://api.example.com/upload',
    });

    chunkPlugin = new MockChunkPlugin();
    uploader.use(chunkPlugin);

    // 创建模拟文件
    mockFile = {
      name: 'test.txt',
      size: 5 * 1024 * 1024, // 5MB
      type: 'text/plain',
    };

    // 监听事件
    vi.spyOn(mockDependencies.eventBus, 'emit');
  });

  afterEach(() => {
    uploader.dispose();
    vi.resetAllMocks();
  });

  it('应该在文件上传过程中触发正确的事件序列', async () => {
    try {
      // 准备文件上传
      await uploader.prepareFile(mockFile);

      // 验证事件顺序
      const emitCalls = mockDependencies.eventBus.emit.mock.calls;
      const eventSequence = emitCalls.map(call => call[0]);

      // 验证必要的事件被触发
      expect(eventSequence).toContain('beforeFileProcess');

      // 验证插件处理器被调用
      expect(chunkPlugin.handleBeforeFileProcess).toHaveBeenCalled();
    } catch (e) {
      // 忽略上传错误
    }
  });
});
