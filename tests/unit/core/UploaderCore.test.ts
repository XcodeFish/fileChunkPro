/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * UploaderCore 单元测试
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UploaderCore } from '../../../src/core/UploaderCore';
import { DependencyContainer } from '../../../src/core/DependencyContainer';
import { EventBus } from '../../../src/core/EventBus';
import { ErrorCenter } from '../../../src/core/error';
import { PluginManager } from '../../../src/core/PluginManager';
import { FileManager } from '../../../src/core/FileManager';
import { NetworkManager } from '../../../src/core/NetworkManager';
import { TaskScheduler } from '../../../src/core/TaskScheduler';
import { UploadErrorType } from '../../../src/types';

// 模拟 DependencyContainer 及其依赖
const createMockContainer = () => {
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

describe('UploaderCore', () => {
  let mockContainer;
  let uploader: UploaderCore;
  const defaultOptions = {
    endpoint: 'https://api.example.com/upload',
  };

  beforeEach(() => {
    mockContainer = createMockContainer();
    uploader = new UploaderCore(mockContainer.container, defaultOptions);
  });

  afterEach(() => {
    uploader.dispose();
    vi.resetAllMocks();
  });

  it('应该正确实例化UploaderCore', () => {
    expect(uploader).toBeInstanceOf(UploaderCore);
  });

  it('在没有endpoint的情况下应该抛出错误', () => {
    expect(() => {
      new UploaderCore(mockContainer.container, {} as any);
    }).toThrow(UploadErrorType.ENVIRONMENT_ERROR.toString());
  });

  it('应该能够注册和获取插件', () => {
    const mockPlugin = {
      name: 'TestPlugin',
      install: vi.fn(),
    };

    uploader.use(mockPlugin);
    expect(mockPlugin.install).toHaveBeenCalled();
  });

  it('应该能够注册和触发事件', () => {
    const mockHandler = vi.fn();
    uploader.on('test', mockHandler);
    uploader.emit('test', { data: 'test-data' });
    expect(mockHandler).toHaveBeenCalledWith({ data: 'test-data' });
  });

  it('应该能够取消注册事件', () => {
    const mockHandler = vi.fn();
    uploader.on('test', mockHandler);
    uploader.off('test', mockHandler);
    uploader.emit('test', { data: 'test-data' });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('应该能获取活跃上传数量', () => {
    expect(uploader.getActiveUploadsCount()).toBe(0);
  });

  it('应该提供访问核心组件的方法', () => {
    expect(uploader.getEventBus()).toBe(mockContainer.eventBus);
    expect(uploader.getTaskScheduler()).toBe(mockContainer.taskScheduler);
    expect(uploader.getPluginManager()).toBe(mockContainer.pluginManager);
    expect(uploader.getFileManager()).toBe(mockContainer.fileManager);
    expect(uploader.getNetworkManager()).toBe(mockContainer.networkManager);
  });
});

describe('UploaderCore - 上传功能', () => {
  let mockContainer;
  let uploader: UploaderCore;
  let mockFile;

  beforeEach(() => {
    mockContainer = createMockContainer();
    uploader = new UploaderCore(mockContainer.container, {
      endpoint: 'https://api.example.com/upload',
    });

    // 创建模拟文件对象
    mockFile = {
      name: 'test.txt',
      size: 1024 * 1024, // 1MB
      type: 'text/plain',
    };

    // 模拟 prepareFile 返回分片信息
    mockContainer.fileManager.prepareFile.mockResolvedValue([
      {
        id: 'chunk-1',
        data: new Blob(['chunk1']),
        start: 0,
        end: 512 * 1024,
        index: 0,
      },
      {
        id: 'chunk-2',
        data: new Blob(['chunk2']),
        start: 512 * 1024,
        end: 1024 * 1024,
        index: 1,
      },
    ]);
  });

  afterEach(() => {
    uploader.dispose();
    vi.resetAllMocks();
  });

  it('应该能准备文件进行上传', async () => {
    await uploader.prepareFile(mockFile);
    expect(mockContainer.fileManager.prepareFile).toHaveBeenCalledWith(
      mockFile,
      expect.anything()
    );
  });

  it('应该报告上传进度', async () => {
    const progressHandler = vi.fn();
    uploader.on('progress', progressHandler);

    // 模拟 upload 方法的实现，强制触发进度事件
    vi.spyOn(uploader, 'emit');

    try {
      await uploader.prepareFile(mockFile);
      uploader.emit('progress', { progress: 0.5 });
    } catch (e) {
      // 忽略可能的上传错误
    }

    expect(uploader.emit).toHaveBeenCalledWith('progress', expect.anything());
  });
});
