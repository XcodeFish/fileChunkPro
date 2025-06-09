/**
 * ProgressPlugin 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import EventBus from '../../../src/core/EventBus';
import ProgressPlugin from '../../../src/plugins/ProgressPlugin';

// 模拟UploaderCore
vi.mock('../../../src/core/UploaderCore');

// 定义回调函数类型
type ProgressCallback = (data: Record<string, any>) => void;

describe('ProgressPlugin', () => {
  let plugin: ProgressPlugin;
  let mockUploader: any;
  let mockEventBus: EventBus;
  let mockPluginManager: any;
  let mockTaskScheduler: any;
  let progressCallbacks: Record<string, ProgressCallback> = {};

  beforeEach(() => {
    // 重置进度回调
    progressCallbacks = {};

    // 创建模拟对象
    mockEventBus = new EventBus();

    mockTaskScheduler = {
      getTotalTasks: vi.fn().mockReturnValue(10),
      getCompletedTasks: vi.fn().mockReturnValue(0),
    };

    mockPluginManager = {
      registerHook: vi.fn(),
      removePluginHooks: vi.fn(),
    };

    mockUploader = {
      getEventBus: vi.fn().mockReturnValue(mockEventBus),
      getPluginManager: vi.fn().mockReturnValue(mockPluginManager),
      getTaskScheduler: vi.fn().mockReturnValue(mockTaskScheduler),
      on: vi.fn((event, callback) => {
        progressCallbacks[event] = callback;
      }),
      off: vi.fn(),
    };

    // 创建插件实例
    plugin = new ProgressPlugin({
      throttleTime: 100,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基本功能', () => {
    it('应该能正确注册和安装', () => {
      // 安装插件
      plugin.install(mockUploader);

      // 验证事件总线和插件管理器被正确获取
      expect(mockUploader.getEventBus).toHaveBeenCalled();
      expect(mockUploader.getPluginManager).toHaveBeenCalled();
      expect(mockUploader.getTaskScheduler).toHaveBeenCalled();

      // 验证事件监听已注册
      expect(mockUploader.on).toHaveBeenCalledWith(
        'upload:start',
        expect.any(Function)
      );
      expect(mockUploader.on).toHaveBeenCalledWith(
        'upload:progress',
        expect.any(Function)
      );
      expect(mockUploader.on).toHaveBeenCalledWith(
        'upload:complete',
        expect.any(Function)
      );
      expect(mockUploader.on).toHaveBeenCalledWith(
        'upload:error',
        expect.any(Function)
      );
      expect(mockUploader.on).toHaveBeenCalledWith(
        'chunk:progress',
        expect.any(Function)
      );
    });

    it('应该能正确销毁插件', () => {
      // 先安装插件
      plugin.install(mockUploader);

      // 创建定时器间谍
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      // 调用销毁方法
      plugin.destroy();

      // 验证清理工作
      expect(mockUploader.off).toHaveBeenCalledWith(
        'upload:start',
        expect.any(Function)
      );
      expect(mockUploader.off).toHaveBeenCalledWith(
        'upload:progress',
        expect.any(Function)
      );
      expect(mockUploader.off).toHaveBeenCalledWith(
        'upload:complete',
        expect.any(Function)
      );
      expect(mockUploader.off).toHaveBeenCalledWith(
        'upload:error',
        expect.any(Function)
      );
      expect(mockUploader.off).toHaveBeenCalledWith(
        'chunk:progress',
        expect.any(Function)
      );

      // 验证定时器被清除
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('进度跟踪', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);

      // 模拟定时器
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应该跟踪上传开始', () => {
      // 模拟文件
      const mockFile = new File([new ArrayBuffer(1024 * 1024)], 'test.jpg', {
        type: 'image/jpeg',
      });

      // 设置进度发送间谍
      const progressSpy = vi.spyOn(mockEventBus, 'emit');

      // 触发上传开始事件
      const startCallback = progressCallbacks['upload:start'];
      startCallback && startCallback({ file: mockFile, fileId: '123' });

      // 验证进度状态
      expect(progressSpy).toHaveBeenCalledWith('progress:start', {
        fileId: '123',
        file: mockFile,
        progress: 0,
      });
    });

    it('应该跟踪上传进度', () => {
      // 设置进度发送间谍
      const progressSpy = vi.spyOn(mockEventBus, 'emit');

      // 先触发上传开始
      const startCallback = progressCallbacks['upload:start'];
      startCallback && startCallback({ fileId: '123' });

      // 触发进度事件
      const progressCallback = progressCallbacks['upload:progress'];
      progressCallback &&
        progressCallback({ fileId: '123', loaded: 50, total: 100 });

      // 等待节流时间
      vi.advanceTimersByTime(100);

      // 验证进度更新
      expect(progressSpy).toHaveBeenCalledWith('progress:update', {
        fileId: '123',
        progress: 50,
        loaded: 50,
        total: 100,
        speed: expect.any(Number),
        remaining: expect.any(Number),
      });
    });

    it('应该跟踪分片进度', () => {
      // 设置进度发送间谍
      const progressSpy = vi.spyOn(mockEventBus, 'emit');

      // 先触发上传开始
      const startCallback = progressCallbacks['upload:start'];
      startCallback && startCallback({ fileId: '123' });

      // 模拟任务调度器状态
      mockTaskScheduler.getTotalTasks.mockReturnValue(10);
      mockTaskScheduler.getCompletedTasks.mockReturnValue(3);

      // 触发分片进度事件
      const chunkProgressCallback = progressCallbacks['chunk:progress'];
      chunkProgressCallback &&
        chunkProgressCallback({
          fileId: '123',
          chunkIndex: 2,
          loaded: 512 * 1024,
          total: 1024 * 1024,
        });

      // 等待节流时间
      vi.advanceTimersByTime(100);

      // 验证进度更新
      expect(progressSpy).toHaveBeenCalledWith(
        'progress:update',
        expect.objectContaining({
          fileId: '123',
          progress: expect.any(Number),
        })
      );
    });

    it('应该跟踪上传完成', () => {
      // 设置进度发送间谍
      const progressSpy = vi.spyOn(mockEventBus, 'emit');

      // 先触发上传开始
      const startCallback = progressCallbacks['upload:start'];
      startCallback && startCallback({ fileId: '123' });

      // 触发完成事件
      const completeCallback = progressCallbacks['upload:complete'];
      completeCallback &&
        completeCallback({
          fileId: '123',
          result: { url: 'https://example.com/test.jpg' },
        });

      // 验证完成事件
      expect(progressSpy).toHaveBeenCalledWith('progress:complete', {
        fileId: '123',
        progress: 100,
        result: { url: 'https://example.com/test.jpg' },
      });
    });

    it('应该跟踪上传错误', () => {
      // 设置进度发送间谍
      const progressSpy = vi.spyOn(mockEventBus, 'emit');

      // 先触发上传开始
      const startCallback = progressCallbacks['upload:start'];
      startCallback && startCallback({ fileId: '123' });

      // 触发错误事件
      const errorCallback = progressCallbacks['upload:error'];
      const error = new Error('上传失败');
      errorCallback && errorCallback({ fileId: '123', error });

      // 验证错误事件
      expect(progressSpy).toHaveBeenCalledWith('progress:error', {
        fileId: '123',
        error,
      });
    });
  });

  describe('配置选项', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应该根据配置应用节流时间', () => {
      // 创建使用较长节流时间的插件
      const slowPlugin = new ProgressPlugin({
        throttleTime: 500, // 500ms 节流
      });
      slowPlugin.install(mockUploader);

      // 设置进度发送间谍
      const progressSpy = vi.spyOn(mockEventBus, 'emit');

      // 先触发上传开始
      const startCallback = progressCallbacks['upload:start'];
      startCallback && startCallback({ fileId: '123' });

      // 触发多个进度事件
      const progressCallback = progressCallbacks['upload:progress'];
      progressCallback &&
        progressCallback({ fileId: '123', loaded: 10, total: 100 });

      // 等待 100ms，不应该发送更新
      vi.advanceTimersByTime(100);
      expect(progressSpy).not.toHaveBeenCalledWith(
        'progress:update',
        expect.anything()
      );

      // 再触发一个进度事件
      progressCallback &&
        progressCallback({ fileId: '123', loaded: 20, total: 100 });

      // 等待足够的时间
      vi.advanceTimersByTime(400); // 总共500ms

      // 验证进度更新已发送，并且使用了最新值
      expect(progressSpy).toHaveBeenCalledWith(
        'progress:update',
        expect.objectContaining({
          fileId: '123',
          progress: 20,
        })
      );
    });
  });

  describe('速度和剩余时间计算', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);

      // 模拟定时器和性能API
      vi.useFakeTimers();
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(1000) // 开始时间
        .mockReturnValueOnce(2000); // 进度更新时间
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应该计算上传速度和剩余时间', () => {
      // 设置进度发送间谍
      const progressSpy = vi.spyOn(mockEventBus, 'emit');

      // 触发上传开始
      const startCallback = progressCallbacks['upload:start'];
      startCallback && startCallback({ fileId: '123', total: 1024 * 1024 }); // 1MB文件

      // 触发进度事件，已上传256KB
      const progressCallback = progressCallbacks['upload:progress'];
      progressCallback &&
        progressCallback({
          fileId: '123',
          loaded: 256 * 1024,
          total: 1024 * 1024,
        });

      // 等待节流时间
      vi.advanceTimersByTime(100);

      // 验证速度计算 (256KB / 1秒 = 256KB/s)
      const progressCall = progressSpy.mock.calls.find(
        call => call[0] === 'progress:update'
      );

      expect(progressCall).toBeDefined();
      if (progressCall) {
        const progressData = progressCall[1];
        expect(progressData.speed).toBeCloseTo(256 * 1024); // 约256KB/s

        // 剩余时间：(总大小 - 已上传) / 速度 = (1MB - 256KB) / 256KB/s = 3秒
        expect(progressData.remaining).toBeCloseTo(3);
      }
    });
  });
});
