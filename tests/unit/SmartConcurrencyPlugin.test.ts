/**
 * SmartConcurrencyPlugin 单元测试
 */

import { vi } from 'vitest';

import EventBus from '../../src/core/EventBus';
import SmartConcurrencyPlugin from '../../src/plugins/SmartConcurrencyPlugin';
import { NetworkQuality } from '../../src/types';

// 模拟UploaderCore
vi.mock('../../src/core/UploaderCore');
vi.mock('../../src/core/TaskScheduler');

describe('SmartConcurrencyPlugin', () => {
  let plugin: SmartConcurrencyPlugin;
  let mockUploader: any;
  let mockEventBus: EventBus;
  let mockTaskScheduler: any;
  let mockPluginManager: any;

  beforeEach(() => {
    // 创建模拟对象
    mockEventBus = new EventBus();
    mockTaskScheduler = {
      getConcurrency: vi.fn().mockReturnValue(3),
      setConcurrency: vi.fn(),
      updateConfig: vi.fn(),
      isPaused: vi.fn().mockReturnValue(false),
      pause: vi.fn(),
      resume: vi.fn(),
    };

    mockPluginManager = {
      registerHook: vi.fn(),
      removePluginHooks: vi.fn(),
    };

    mockUploader = {
      getEventBus: vi.fn().mockReturnValue(mockEventBus),
      getTaskScheduler: vi.fn().mockReturnValue(mockTaskScheduler),
      getPluginManager: vi.fn().mockReturnValue(mockPluginManager),
    };

    // 创建插件实例
    plugin = new SmartConcurrencyPlugin({
      minConcurrency: 1,
      maxConcurrency: 5,
      baseConcurrency: 3,
      adaptationEnabled: true,
    });
  });

  describe('基本功能', () => {
    test('插件应该能正确注册和安装', () => {
      // 安装插件
      plugin.install(mockUploader);

      // 验证事件总线和任务调度器被正确获取
      expect(mockUploader.getEventBus).toHaveBeenCalled();
      expect(mockUploader.getTaskScheduler).toHaveBeenCalled();

      // 验证钩子已注册
      expect(mockPluginManager.registerHook).toHaveBeenCalledTimes(2);
      expect(mockPluginManager.registerHook).toHaveBeenCalledWith(
        'beforeChunkUpload',
        expect.any(Function),
        expect.objectContaining({ plugin: 'SmartConcurrencyPlugin' })
      );
      expect(mockPluginManager.registerHook).toHaveBeenCalledWith(
        'determineUploadStrategy',
        expect.any(Function),
        expect.objectContaining({ plugin: 'SmartConcurrencyPlugin' })
      );

      // 验证任务调度器配置已更新
      expect(mockTaskScheduler.updateConfig).toHaveBeenCalledWith({
        priorityQueue: true,
      });
    });

    test('应该能正确销毁插件', () => {
      // 先安装插件
      plugin.install(mockUploader);

      // 模拟设置一些定时器
      const mockClearInterval = vi.spyOn(global, 'clearInterval');

      // 调用销毁方法
      plugin.destroy();

      // 验证清理工作
      expect(mockPluginManager.removePluginHooks).toHaveBeenCalledWith(
        'SmartConcurrencyPlugin'
      );

      // 验证定时器被清除
      expect(mockClearInterval).toHaveBeenCalled();
    });
  });

  describe('网络质量自适应', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    test('网络离线时应暂停上传', () => {
      // 模拟网络离线事件
      mockEventBus.emit('network:quality', {
        quality: NetworkQuality.OFFLINE,
        condition: {
          type: 'unknown',
          effectiveType: 'unknown',
          downlink: 0,
          rtt: 0,
        },
        stable: false,
      });

      // 验证任务调度器被暂停
      expect(mockTaskScheduler.pause).toHaveBeenCalled();
    });

    test('网络恢复时应继续上传', () => {
      // 先设置为已暂停
      mockTaskScheduler.isPaused.mockReturnValue(true);

      // 模拟网络恢复事件
      mockEventBus.emit('network:quality', {
        quality: NetworkQuality.MEDIUM,
        condition: { type: 'wifi', effectiveType: '4g', downlink: 10, rtt: 50 },
        stable: true,
      });

      // 验证任务调度器被恢复
      expect(mockTaskScheduler.resume).toHaveBeenCalled();
    });

    test('较差网络质量应降低并发数', async () => {
      // 模拟较差网络事件
      await mockEventBus.emit('network:quality', {
        quality: NetworkQuality.POOR,
        condition: {
          type: 'cellular',
          effectiveType: '2g',
          downlink: 0.5,
          rtt: 1000,
        },
        stable: true,
      });

      // 验证并发数被调整为最小值
      expect(mockTaskScheduler.setConcurrency).toHaveBeenCalledWith(1);
    });

    test('优质网络质量应提高并发数', async () => {
      // 模拟优质网络事件
      await mockEventBus.emit('network:quality', {
        quality: NetworkQuality.EXCELLENT,
        condition: { type: 'wifi', effectiveType: '4g', downlink: 50, rtt: 10 },
        stable: true,
      });

      // 验证并发数被调整为最大值
      expect(mockTaskScheduler.setConcurrency).toHaveBeenCalledWith(5);
    });
  });

  describe('公开API', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    test('setBaseConcurrency应正确设置基础并发数', () => {
      // 调用方法
      plugin.setBaseConcurrency(4);

      // 验证内部状态变化和并发调整
      expect(mockTaskScheduler.setConcurrency).toHaveBeenCalled();
    });

    test('setAdaptationEnabled应正确切换自适应模式', () => {
      // 关闭自适应
      plugin.setAdaptationEnabled(false);

      // 验证恢复到基础并发数
      expect(mockTaskScheduler.setConcurrency).toHaveBeenCalledWith(3);

      // 清除模拟计数
      vi.resetAllMocks();

      // 重新开启自适应
      plugin.setAdaptationEnabled(true);

      // 验证触发并发调整
      expect(mockTaskScheduler.setConcurrency).toHaveBeenCalled();
    });

    test('getCurrentNetworkQuality应返回当前网络质量', () => {
      // 默认应该是UNKNOWN
      expect(plugin.getCurrentNetworkQuality()).toBe(NetworkQuality.UNKNOWN);

      // 模拟网络质量变化
      mockEventBus.emit('network:quality', {
        quality: NetworkQuality.GOOD,
        condition: { type: 'wifi', effectiveType: '4g', downlink: 10, rtt: 50 },
        stable: true,
      });

      // 验证更新后的网络质量
      expect(plugin.getCurrentNetworkQuality()).toBe(NetworkQuality.GOOD);
    });

    test('getSpeedInfo应返回当前速度信息', () => {
      // 默认应该全是0
      const initialInfo = plugin.getSpeedInfo();
      expect(initialInfo.current).toBe(0);
      expect(initialInfo.average).toBe(0);
      expect(initialInfo.peak).toBe(0);

      // 无法直接测试速度更新，因为它依赖于内部计时器和处理逻辑
    });

    test('forceNetworkDetection应触发网络检测', () => {
      // 创建一个带有Spy的插件实例
      const detectSpy = vi.spyOn(plugin as any, 'detectNetworkCondition');

      // 调用方法
      plugin.forceNetworkDetection();

      // 验证检测方法被调用
      expect(detectSpy).toHaveBeenCalled();
    });
  });
});
