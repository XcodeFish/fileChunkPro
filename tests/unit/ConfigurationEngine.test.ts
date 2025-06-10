/**
 * ConfigurationEngine 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Environment, BrowserFeature, NetworkQuality } from '../../src/types';
import { ConfigurationEngine } from '../../src/utils/ConfigurationEngine';
import { EnvironmentDetectionSystem } from '../../src/utils/EnvironmentDetectionSystem';

describe('ConfigurationEngine', () => {
  let configEngine: ConfigurationEngine;
  let mockEnvSystem: EnvironmentDetectionSystem;

  beforeEach(() => {
    // 创建环境检测系统的模拟对象
    mockEnvSystem = {
      getEnvironment: vi.fn().mockReturnValue(Environment.Browser),
      getEnvironmentName: vi.fn().mockReturnValue('浏览器'),
      detectAllFeatures: vi.fn().mockReturnValue({
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: false,
        [BrowserFeature.INDEXED_DB]: true,
        [BrowserFeature.STREAMS_API]: true,
        [BrowserFeature.HARDWARE_CONCURRENCY]: true,
        [BrowserFeature.WEB_CRYPTO]: true,
      }),
      getDeviceCapabilities: vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'normal',
        network: 'normal',
        storage: 'normal',
        battery: 'normal',
      }),
      getCapabilityScore: vi.fn().mockReturnValue({
        overall: 80,
        fileProcessing: 85,
        networking: 80,
        concurrency: 75,
        storage: 75,
        reliability: 85,
      }),
      getFallbackStrategies: vi.fn().mockReturnValue([]),
      hasFeature: vi.fn().mockImplementation(feature => {
        const features = {
          [BrowserFeature.WEB_WORKER]: true,
          [BrowserFeature.SERVICE_WORKER]: false,
          [BrowserFeature.INDEXED_DB]: true,
          [BrowserFeature.STREAMS_API]: true,
          [BrowserFeature.HARDWARE_CONCURRENCY]: true,
          [BrowserFeature.WEB_CRYPTO]: true,
        };
        return !!features[feature];
      }),
      getDetectionResult: vi.fn(),
    } as unknown as EnvironmentDetectionSystem;

    // 创建配置推荐引擎实例
    configEngine = new ConfigurationEngine(mockEnvSystem);
  });

  describe('generateRecommendedConfig', () => {
    it('应该根据文件大小生成合适的配置', () => {
      // 小文件配置
      const smallFileConfig = configEngine.generateRecommendedConfig(
        2 * 1024 * 1024
      ); // 2MB

      // 中等文件配置
      const mediumFileConfig = configEngine.generateRecommendedConfig(
        50 * 1024 * 1024
      ); // 50MB

      // 大文件配置
      const largeFileConfig = configEngine.generateRecommendedConfig(
        500 * 1024 * 1024
      ); // 500MB

      // 小文件应该使用较小的分片大小
      expect(smallFileConfig.chunkSize).toBeLessThan(
        mediumFileConfig.chunkSize
      );

      // 大文件应该使用较大的分片大小
      expect(largeFileConfig.chunkSize).toBeGreaterThan(
        mediumFileConfig.chunkSize
      );

      // 大文件应该使用Worker
      expect(largeFileConfig.useWorker).toBe(true);
    });

    it('应该根据环境调整配置参数', () => {
      // 浏览器环境配置
      mockEnvSystem.getEnvironment = vi
        .fn()
        .mockReturnValue(Environment.Browser);
      const browserConfig = configEngine.generateRecommendedConfig(0);

      // 小程序环境配置
      mockEnvSystem.getEnvironment = vi
        .fn()
        .mockReturnValue(Environment.WechatMP);
      const mpConfig = configEngine.generateRecommendedConfig(0);

      // Node.js环境配置
      mockEnvSystem.getEnvironment = vi
        .fn()
        .mockReturnValue(Environment.NodeJS);
      const nodeConfig = configEngine.generateRecommendedConfig(0);

      // 浏览器环境应该启用自适应上传
      expect(browserConfig.enableAdaptiveUploads).toBe(true);

      // 小程序环境应该限制并发数
      expect(mpConfig.maxConcurrency).toBe(2);
      expect(mpConfig.useWorker).toBe(false);
      expect(mpConfig.enableAdaptiveUploads).toBe(false);

      // Node.js环境应该支持更高并发
      expect(nodeConfig.maxConcurrency).toBeGreaterThan(
        browserConfig.concurrency
      );
      expect(nodeConfig.useStreams).toBe(true);
    });

    it('应该尊重用户自定义配置', () => {
      const userOptions = {
        chunkSize: 1024 * 1024, // 1MB
        concurrency: 2,
        timeout: 10000,
        useWorker: false,
        customOption: 'value',
      };

      const config = configEngine.generateRecommendedConfig(
        50 * 1024 * 1024,
        userOptions
      );

      // 用户配置应该覆盖推荐配置
      expect(config.chunkSize).toBe(1024 * 1024);
      expect(config.concurrency).toBe(2);
      expect(config.timeout).toBe(10000);
      expect(config.useWorker).toBe(false);

      // 自定义选项应该保留
      expect(config.customOption).toBe('value');
    });
  });

  describe('getRecommendedChunkSize', () => {
    it('应该根据文件大小返回合适的分片大小', () => {
      // 小文件分片大小
      const smallChunkSize = configEngine.getRecommendedChunkSize(
        2 * 1024 * 1024
      ); // 2MB文件

      // 中等文件分片大小
      const mediumChunkSize = configEngine.getRecommendedChunkSize(
        50 * 1024 * 1024
      ); // 50MB文件

      // 大文件分片大小
      const largeChunkSize = configEngine.getRecommendedChunkSize(
        500 * 1024 * 1024
      ); // 500MB文件

      // 验证分片大小与文件大小的关系
      expect(smallChunkSize).toBeLessThan(mediumChunkSize);
      expect(largeChunkSize).toBeGreaterThan(mediumChunkSize);
    });

    it('应该根据设备能力调整分片大小', () => {
      // 低内存设备
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'low',
        processor: 'normal',
        network: 'normal',
        storage: 'normal',
        battery: 'normal',
      });
      const lowMemoryChunkSize = configEngine.getRecommendedChunkSize(
        50 * 1024 * 1024
      );

      // 高内存设备
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'high',
        processor: 'normal',
        network: 'normal',
        storage: 'normal',
        battery: 'normal',
      });
      const highMemoryChunkSize = configEngine.getRecommendedChunkSize(
        50 * 1024 * 1024
      );

      // 低性能处理器设备
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'low',
        network: 'normal',
        storage: 'normal',
        battery: 'normal',
      });
      const lowProcessorChunkSize = configEngine.getRecommendedChunkSize(
        50 * 1024 * 1024
      );

      // 低内存设备应该使用较小的分片
      expect(lowMemoryChunkSize).toBeLessThan(highMemoryChunkSize);

      // 低性能处理器设备应该使用较小的分片
      expect(lowProcessorChunkSize).toBeLessThan(highMemoryChunkSize);
    });
  });

  describe('getRecommendedConcurrency', () => {
    it('应该根据处理器能力调整并发数', () => {
      // 低性能处理器
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'low',
        network: 'normal',
        storage: 'normal',
        battery: 'normal',
      });
      const lowProcessorConcurrency = configEngine.getRecommendedConcurrency();

      // 高性能处理器
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'high',
        network: 'normal',
        storage: 'normal',
        battery: 'normal',
      });
      const highProcessorConcurrency = configEngine.getRecommendedConcurrency();

      // 高性能处理器应该使用更高的并发数
      expect(highProcessorConcurrency).toBeGreaterThan(lowProcessorConcurrency);
    });

    it('应该根据网络能力调整并发数', () => {
      // 低网络能力
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'normal',
        network: 'low',
        storage: 'normal',
        battery: 'normal',
      });
      const lowNetworkConcurrency = configEngine.getRecommendedConcurrency();

      // 高网络能力
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'normal',
        network: 'high',
        storage: 'normal',
        battery: 'normal',
      });
      const highNetworkConcurrency = configEngine.getRecommendedConcurrency();

      // 高网络能力应该使用更高的并发数
      expect(highNetworkConcurrency).toBeGreaterThan(lowNetworkConcurrency);
    });

    it('应该根据环境类型调整并发数', () => {
      // 浏览器环境
      mockEnvSystem.getEnvironment = vi
        .fn()
        .mockReturnValue(Environment.Browser);
      const browserConcurrency = configEngine.getRecommendedConcurrency();

      // 小程序环境
      mockEnvSystem.getEnvironment = vi
        .fn()
        .mockReturnValue(Environment.WechatMP);
      const mpConcurrency = configEngine.getRecommendedConcurrency();

      // Node.js环境
      mockEnvSystem.getEnvironment = vi
        .fn()
        .mockReturnValue(Environment.NodeJS);
      const nodeConcurrency = configEngine.getRecommendedConcurrency();

      // 小程序环境应该限制并发数
      expect(mpConcurrency).toBeLessThanOrEqual(2);

      // Node.js环境应该使用更高的并发数
      expect(nodeConcurrency).toBeGreaterThan(browserConcurrency);
    });
  });

  describe('getRecommendedTimeout', () => {
    it('应该根据网络能力调整超时时间', () => {
      // 低网络能力
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'normal',
        network: 'low',
        storage: 'normal',
        battery: 'normal',
      });
      const lowNetworkTimeout = configEngine.getRecommendedTimeout();

      // 高网络能力
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'normal',
        network: 'high',
        storage: 'normal',
        battery: 'normal',
      });
      const highNetworkTimeout = configEngine.getRecommendedTimeout();

      // 低网络能力应该使用更长的超时时间
      expect(lowNetworkTimeout).toBeGreaterThan(highNetworkTimeout);
    });
  });

  describe('getRecommendedRetryStrategy', () => {
    it('应该根据网络能力调整重试策略', () => {
      // 低网络能力
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'normal',
        network: 'low',
        storage: 'normal',
        battery: 'normal',
      });
      const lowNetworkStrategy = configEngine.getRecommendedRetryStrategy();

      // 高网络能力
      mockEnvSystem.getDeviceCapabilities = vi.fn().mockReturnValue({
        memory: 'normal',
        processor: 'normal',
        network: 'high',
        storage: 'normal',
        battery: 'normal',
      });
      const highNetworkStrategy = configEngine.getRecommendedRetryStrategy();

      // 低网络能力应该使用更多的重试次数
      expect(lowNetworkStrategy.maxRetries).toBeGreaterThan(
        highNetworkStrategy.maxRetries
      );

      // 低网络能力应该使用更长的初始延迟
      expect(lowNetworkStrategy.initialDelay).toBeGreaterThan(
        highNetworkStrategy.initialDelay
      );
    });
  });

  describe('getNetworkQualityBasedConfig', () => {
    it('应该为不同网络质量返回合适的配置', () => {
      const fileSize = 50 * 1024 * 1024; // 50MB

      // 极差网络配置
      const poorConfig = configEngine.getNetworkQualityBasedConfig(
        NetworkQuality.POOR,
        fileSize
      );

      // 中等网络配置
      const mediumConfig = configEngine.getNetworkQualityBasedConfig(
        NetworkQuality.MEDIUM,
        fileSize
      );

      // 优秀网络配置
      const excellentConfig = configEngine.getNetworkQualityBasedConfig(
        NetworkQuality.EXCELLENT,
        fileSize
      );

      // 离线配置
      const offlineConfig = configEngine.getNetworkQualityBasedConfig(
        NetworkQuality.OFFLINE,
        fileSize
      );

      // 验证网络质量对配置的影响

      // 较差网络应该使用较小的分片和较少的并发
      expect(poorConfig.chunkSize).toBeLessThan(mediumConfig.chunkSize);
      expect(poorConfig.concurrency).toBeLessThan(mediumConfig.concurrency);

      // 较差网络应该使用较长的超时时间和更多的重试
      expect(poorConfig.timeout).toBeGreaterThan(mediumConfig.timeout);
      expect(poorConfig.retryCount).toBeGreaterThan(mediumConfig.retryCount);

      // 优秀网络应该使用较大的分片和较多的并发
      expect(excellentConfig.chunkSize).toBeGreaterThan(mediumConfig.chunkSize);
      expect(excellentConfig.concurrency).toBeGreaterThan(
        mediumConfig.concurrency
      );

      // 优秀网络应该使用较短的超时时间和较少的重试
      expect(excellentConfig.timeout).toBeLessThan(mediumConfig.timeout);
      expect(excellentConfig.retryCount).toBeLessThan(mediumConfig.retryCount);

      // 离线配置应该禁用上传
      expect(offlineConfig.concurrency).toBe(0);
      expect(offlineConfig.autoRetry).toBe(false);
    });
  });

  describe('generateCapabilityReport', () => {
    it('应该生成完整的能力报告', () => {
      // 配置模拟对象返回值
      mockEnvSystem.getEnvironment = vi
        .fn()
        .mockReturnValue(Environment.Browser);
      mockEnvSystem.getEnvironmentName = vi.fn().mockReturnValue('浏览器');
      mockEnvSystem.getCapabilityScore = vi.fn().mockReturnValue({
        overall: 85,
        fileProcessing: 90,
        networking: 80,
        concurrency: 85,
        storage: 80,
        reliability: 90,
      });

      const report = configEngine.generateCapabilityReport();

      // 验证报告结构
      expect(report.environment).toBeDefined();
      expect(report.capabilities).toBeDefined();
      expect(report.features).toBeDefined();
      expect(report.performance).toBeDefined();
      expect(report.recommendations).toBeDefined();

      // 验证报告内容
      expect(report.environment.type).toBe('浏览器');
      expect(report.performance.scores.overall).toBe(85);
      expect(report.performance.rating).toBe('良好');
    });
  });

  describe('generateTieredConfigurations', () => {
    it('应该为同一文件大小生成不同优化级别的配置', () => {
      const fileSize = 50 * 1024 * 1024; // 50MB

      const configs = configEngine.generateTieredConfigurations(fileSize);

      // 验证配置套餐结构
      expect(configs.balanced).toBeDefined();
      expect(configs.performance).toBeDefined();
      expect(configs.stability).toBeDefined();
      expect(configs.powerSaving).toBeDefined();
      expect(configs.dataSaving).toBeDefined();

      // 性能优先配置应该使用更大的分片和更多的并发
      expect(configs.performance.chunkSize).toBeGreaterThanOrEqual(
        configs.balanced.chunkSize
      );
      expect(configs.performance.concurrency).toBeGreaterThanOrEqual(
        configs.balanced.concurrency
      );

      // 稳定性优先配置应该使用更多的重试
      expect(configs.stability.retryCount).toBeGreaterThan(
        configs.balanced.retryCount
      );

      // 省电模式应该禁用Worker和自适应上传
      expect(configs.powerSaving.useWorker).toBe(false);
      expect(configs.powerSaving.enableAdaptiveUploads).toBe(false);

      // 流量节省模式应该使用较大的分片减少请求数
      expect(configs.dataSaving.chunkSize).toBeGreaterThanOrEqual(
        configs.balanced.chunkSize
      );
      expect(configs.dataSaving.concurrency).toBeLessThanOrEqual(
        configs.balanced.concurrency
      );
    });
  });
});
