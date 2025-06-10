/**
 * EnvironmentDetectionSystem.test.ts
 * 环境检测系统单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  Environment,
  BrowserFeature,
  CapabilityLevel,
  NetworkQuality,
  DeviceMemoryCapacity,
} from '../../src/types';
import ConfigurationEngine from '../../src/utils/ConfigurationEngine';
import { EnvironmentDetectionSystem } from '../../src/utils/EnvironmentDetectionSystem';

describe('EnvironmentDetectionSystem', () => {
  let envSystem: EnvironmentDetectionSystem;

  // 保存原始全局对象以便后续恢复
  const originalWindow = global.window;
  const originalNavigator = global.navigator;
  const originalDocument = global.document;
  const originalLocation = global.location;
  const originalPerformance = global.performance;

  beforeEach(() => {
    // 重置 mock
    vi.resetAllMocks();

    // 创建环境检测系统实例
    envSystem = new EnvironmentDetectionSystem();

    // Mock 浏览器环境
    global.window = {} as any;
    global.document = {} as any;
    global.navigator = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    } as any;
    global.location = { protocol: 'https:' } as any;
    global.performance = {} as any;
  });

  afterEach(() => {
    // 恢复原始全局对象
    global.window = originalWindow;
    global.navigator = originalNavigator;
    global.document = originalDocument;
    global.location = originalLocation;
    global.performance = originalPerformance;
  });

  describe('getEnvironment', () => {
    it('应该检测到浏览器环境', () => {
      expect(envSystem.getEnvironment()).toBe(Environment.Browser);
    });

    it('应该检测到微信小程序环境', () => {
      global.window.wx = { getFileSystemManager: () => ({}) } as any;
      expect(envSystem.getEnvironment()).toBe(Environment.WechatMP);
    });

    it('应该检测到支付宝小程序环境', () => {
      global.window.my = { getFileSystemManager: () => ({}) } as any;
      expect(envSystem.getEnvironment()).toBe(Environment.AlipayMP);
    });

    it('应该检测到字节跳动小程序环境', () => {
      global.window.tt = { getFileSystemManager: () => ({}) } as any;
      expect(envSystem.getEnvironment()).toBe(Environment.BytedanceMP);
    });

    it('应该检测到百度小程序环境', () => {
      global.window.swan = { getFileSystemManager: () => ({}) } as any;
      expect(envSystem.getEnvironment()).toBe(Environment.BaiduMP);
    });

    it('应该检测到React Native环境', () => {
      global.navigator.product = 'ReactNative';
      expect(envSystem.getEnvironment()).toBe(Environment.ReactNative);
    });

    it('应该缓存环境检测结果', () => {
      const spy = vi.spyOn(envSystem as any, 'detectBrowserFeatures');

      // 第一次调用会执行检测逻辑
      envSystem.detectAllFeatures();
      expect(spy).toHaveBeenCalledTimes(1);

      // 第二次调用应该使用缓存结果
      envSystem.detectAllFeatures();
      expect(spy).toHaveBeenCalledTimes(1);

      // 重置缓存后应该重新执行检测
      envSystem.resetCache();
      envSystem.detectAllFeatures();
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getEnvironmentName', () => {
    it('应该返回正确的环境名称', () => {
      const envSpy = vi.spyOn(envSystem, 'getEnvironment');

      // 模拟浏览器环境
      envSpy.mockReturnValue(Environment.Browser);
      expect(envSystem.getEnvironmentName()).toBe('浏览器');

      // 模拟微信小程序环境
      envSpy.mockReturnValue(Environment.WechatMP);
      expect(envSystem.getEnvironmentName()).toBe('微信小程序');

      // 模拟React Native环境
      envSpy.mockReturnValue(Environment.ReactNative);
      expect(envSystem.getEnvironmentName()).toBe('React Native');

      // 模拟Node.js环境
      envSpy.mockReturnValue(Environment.NodeJS);
      expect(envSystem.getEnvironmentName()).toBe('Node.js');

      // 模拟未知环境
      envSpy.mockReturnValue(Environment.Unknown);
      expect(envSystem.getEnvironmentName()).toBe('未知环境');
    });
  });

  describe('detectAllFeatures', () => {
    it('应该根据环境调用正确的特性检测方法', () => {
      const browserSpy = vi
        .spyOn(envSystem as any, 'detectBrowserFeatures')
        .mockReturnValue({});
      const rnSpy = vi
        .spyOn(envSystem as any, 'detectReactNativeFeatures')
        .mockReturnValue({});
      const mpSpy = vi
        .spyOn(envSystem as any, 'detectMiniProgramFeatures')
        .mockReturnValue({});
      const nodeSpy = vi
        .spyOn(envSystem as any, 'detectNodeFeatures')
        .mockReturnValue({});

      // 模拟浏览器环境
      vi.spyOn(envSystem, 'getEnvironment').mockReturnValue(
        Environment.Browser
      );
      envSystem.detectAllFeatures();
      expect(browserSpy).toHaveBeenCalledTimes(1);

      // 重置缓存
      envSystem.resetCache();

      // 模拟React Native环境
      vi.spyOn(envSystem, 'getEnvironment').mockReturnValue(
        Environment.ReactNative
      );
      envSystem.detectAllFeatures();
      expect(rnSpy).toHaveBeenCalledTimes(1);

      // 重置缓存
      envSystem.resetCache();

      // 模拟小程序环境
      vi.spyOn(envSystem, 'getEnvironment').mockReturnValue(
        Environment.WechatMP
      );
      envSystem.detectAllFeatures();
      expect(mpSpy).toHaveBeenCalledTimes(1);

      // 重置缓存
      envSystem.resetCache();

      // 模拟Node.js环境
      vi.spyOn(envSystem, 'getEnvironment').mockReturnValue(Environment.NodeJS);
      envSystem.detectAllFeatures();
      expect(nodeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasFeature', () => {
    it('应该正确检测特性支持情况', () => {
      vi.spyOn(envSystem, 'detectAllFeatures').mockReturnValue({
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: false,
        [BrowserFeature.INDEXED_DB]: true,
      });

      expect(envSystem.hasFeature(BrowserFeature.WEB_WORKER)).toBe(true);
      expect(envSystem.hasFeature(BrowserFeature.SERVICE_WORKER)).toBe(false);
      expect(envSystem.hasFeature(BrowserFeature.INDEXED_DB)).toBe(true);
      expect(envSystem.hasFeature('non_existent_feature')).toBe(false);
    });
  });

  describe('getDeviceCapabilities', () => {
    it('应该返回正确的设备能力评级', () => {
      // 模拟浏览器环境
      vi.spyOn(envSystem, 'getEnvironment').mockReturnValue(
        Environment.Browser
      );

      // 模拟能力评估方法
      vi.spyOn(envSystem as any, 'evaluateMemoryCapability').mockReturnValue(
        'high'
      );
      vi.spyOn(envSystem as any, 'evaluateProcessorCapability').mockReturnValue(
        'normal'
      );
      vi.spyOn(envSystem as any, 'evaluateNetworkCapability').mockReturnValue(
        'low'
      );
      vi.spyOn(envSystem as any, 'evaluateStorageCapability').mockReturnValue(
        'normal'
      );
      vi.spyOn(envSystem as any, 'evaluateBatteryStatus').mockReturnValue(
        'high'
      );

      const capabilities = envSystem.getDeviceCapabilities();

      expect(capabilities).toEqual({
        memory: 'high',
        processor: 'normal',
        network: 'low',
        storage: 'normal',
        battery: 'high',
      });
    });

    it('应该为小程序环境返回保守的能力评级', () => {
      // 模拟微信小程序环境
      vi.spyOn(envSystem, 'getEnvironment').mockReturnValue(
        Environment.WechatMP
      );

      const capabilities = envSystem.getDeviceCapabilities();

      expect(capabilities).toEqual({
        memory: 'low',
        processor: 'low',
        network: 'normal',
        storage: 'low',
        battery: 'normal',
      });
    });

    it('应该为Node.js环境返回较高的能力评级', () => {
      // 模拟Node.js环境
      vi.spyOn(envSystem, 'getEnvironment').mockReturnValue(Environment.NodeJS);

      const capabilities = envSystem.getDeviceCapabilities();

      expect(capabilities).toEqual({
        memory: 'high',
        processor: 'high',
        network: 'high',
        storage: 'high',
        battery: 'high',
      });
    });
  });

  describe('getFallbackStrategies', () => {
    it('应该为不支持的特性提供降级策略', () => {
      // 模拟特性支持情况
      vi.spyOn(envSystem, 'detectAllFeatures').mockReturnValue({
        [BrowserFeature.WEB_WORKER]: false,
        [BrowserFeature.INDEXED_DB]: false,
        [BrowserFeature.STREAMS_API]: true,
        [BrowserFeature.WEB_CRYPTO]: false,
      });

      const strategies = envSystem.getFallbackStrategies();

      // 应该包含三个降级策略
      expect(strategies.length).toBe(3);

      // 检查Worker降级策略
      const workerStrategy = strategies.find(
        s => s.feature === BrowserFeature.WEB_WORKER
      );
      expect(workerStrategy).toBeDefined();
      expect(workerStrategy?.fallbackMethod).toBe('main_thread_processing');

      // 检查IndexedDB降级策略
      const indexedDBStrategy = strategies.find(
        s => s.feature === BrowserFeature.INDEXED_DB
      );
      expect(indexedDBStrategy).toBeDefined();
      expect(indexedDBStrategy?.fallbackMethod).toBe('memory_storage');

      // 检查WebCrypto降级策略
      const webCryptoStrategy = strategies.find(
        s => s.feature === BrowserFeature.WEB_CRYPTO
      );
      expect(webCryptoStrategy).toBeDefined();
      expect(webCryptoStrategy?.fallbackMethod).toBe(
        'js_crypto_implementation'
      );

      // 不应该包含已支持特性的降级策略
      const streamsStrategy = strategies.find(
        s => s.feature === BrowserFeature.STREAMS_API
      );
      expect(streamsStrategy).toBeUndefined();
    });
  });

  describe('getCapabilityScore', () => {
    it('应该计算正确的能力评分', () => {
      // 模拟特性支持情况
      vi.spyOn(envSystem, 'detectAllFeatures').mockReturnValue({
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: false,
        [BrowserFeature.INDEXED_DB]: true,
        [BrowserFeature.STREAMS_API]: true,
        [BrowserFeature.FETCH_API]: true,
        [BrowserFeature.PROMISE]: true,
        [BrowserFeature.ASYNC_AWAIT]: true,
        [BrowserFeature.HARDWARE_CONCURRENCY]: true,
        [BrowserFeature.SHARED_ARRAY_BUFFER]: false,
        [BrowserFeature.PERFORMANCE_API]: true,
        [BrowserFeature.WEB_CRYPTO]: true,
      });

      // 模拟设备能力
      vi.spyOn(envSystem, 'getDeviceCapabilities').mockReturnValue({
        memory: 'high',
        processor: 'normal',
        network: 'high',
        storage: 'normal',
        battery: 'normal',
      });

      const scores = envSystem.getCapabilityScore();

      // 所有分数应在0-100范围内
      expect(scores.overall).toBeGreaterThan(0);
      expect(scores.overall).toBeLessThanOrEqual(100);
      expect(scores.fileProcessing).toBeGreaterThan(0);
      expect(scores.fileProcessing).toBeLessThanOrEqual(100);
      expect(scores.networking).toBeGreaterThan(0);
      expect(scores.networking).toBeLessThanOrEqual(100);
      expect(scores.concurrency).toBeGreaterThan(0);
      expect(scores.concurrency).toBeLessThanOrEqual(100);
      expect(scores.storage).toBeGreaterThan(0);
      expect(scores.storage).toBeLessThanOrEqual(100);
      expect(scores.reliability).toBeGreaterThan(0);
      expect(scores.reliability).toBeLessThanOrEqual(100);

      // 能力良好的环境应该有较高的总分
      expect(scores.overall).toBeGreaterThan(70);
    });
  });

  describe('getDetectionResult', () => {
    it('应该返回完整的环境检测结果', () => {
      // 模拟环境名称
      vi.spyOn(envSystem, 'getEnvironmentName').mockReturnValue('浏览器');

      // 模拟特性支持情况
      vi.spyOn(envSystem, 'detectAllFeatures').mockReturnValue({
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: false,
      });

      // 模拟设备能力
      vi.spyOn(envSystem, 'getDeviceCapabilities').mockReturnValue({
        memory: 'high',
        processor: 'normal',
        network: 'high',
        storage: 'normal',
        battery: 'normal',
      });

      // 模拟能力评分
      vi.spyOn(envSystem, 'getCapabilityScore').mockReturnValue({
        overall: 85,
        fileProcessing: 90,
        networking: 85,
        concurrency: 80,
        storage: 75,
        reliability: 90,
      });

      // 模拟降级策略
      vi.spyOn(envSystem, 'getFallbackStrategies').mockReturnValue([
        {
          feature: BrowserFeature.SERVICE_WORKER,
          fallbackMethod: 'online_only',
          performance: 'high',
          limitations: ['无法离线上传'],
          enabled: true,
        },
      ]);

      const result = envSystem.getDetectionResult();

      // 检查结果结构
      expect(result.environment).toBe('浏览器');
      expect(result.features).toBeDefined();
      expect(result.capabilities).toBeDefined();
      expect(result.scores).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.fallbacks).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.limitations).toBeDefined();

      // 检查警告和限制是否正确生成
      expect(result.limitations).toContain(
        '不支持Service Worker，无法离线上传'
      );
    });
  });

  describe('resetCache', () => {
    it('应该清除所有缓存的检测结果', () => {
      // 先进行一次检测来填充缓存
      envSystem.getEnvironment();
      envSystem.detectAllFeatures();
      envSystem.getDeviceCapabilities();
      envSystem.getCapabilityScore();
      envSystem.getDetectionResult();

      // 重置缓存
      envSystem.resetCache();

      // 验证所有缓存已清除
      expect((envSystem as any).cachedEnvironment).toBeNull();
      expect((envSystem as any).cachedFeatures).toBeNull();
      expect((envSystem as any).cachedCapabilities).toBeNull();
      expect((envSystem as any).cachedDetectionResult).toBeNull();
    });
  });

  test('应该正确检测当前环境', () => {
    // 验证环境检测
    expect(envSystem.getEnvironment()).toBeDefined();
    expect(Object.values(Environment)).toContain(envSystem.getEnvironment());
  });

  test('应该返回正确的环境名称', () => {
    // 获取环境名称
    const envName = envSystem.getEnvironmentName();

    // 验证名称不为空
    expect(envName).toBeDefined();
    expect(typeof envName).toBe('string');
    expect(envName.length).toBeGreaterThan(0);
  });

  test('应该返回设备能力评估', () => {
    // 获取设备能力
    const capabilities = envSystem.getDeviceCapabilities();

    // 验证能力评估结果
    expect(capabilities).toBeDefined();
    expect(capabilities).toHaveProperty('memory');
    expect(capabilities).toHaveProperty('processor');
    expect(capabilities).toHaveProperty('network');
    expect(capabilities).toHaveProperty('storage');
    expect(capabilities).toHaveProperty('battery');

    // 验证值是否在预期范围内
    const validLevels: CapabilityLevel[] = ['low', 'normal', 'high'];
    expect(validLevels).toContain(capabilities.memory);
    expect(validLevels).toContain(capabilities.processor);
    expect(validLevels).toContain(capabilities.network);
    expect(validLevels).toContain(capabilities.storage);
    expect(validLevels).toContain(capabilities.battery);
  });

  test('应该检测浏览器特性', () => {
    // 在浏览器环境中测试特性检测
    // 注：这些测试在Node环境中运行，所以需要模拟浏览器对象

    // 获取所有特性
    const features = envSystem.getAllFeatures();

    // 验证特性对象
    expect(features).toBeDefined();
    expect(typeof features).toBe('object');

    // 验证特定特性的检测结果类型
    Object.values(features).forEach(value => {
      expect(typeof value).toBe('boolean');
    });
  });

  test('hasFeature方法应该返回正确的布尔值', () => {
    // 测试已知特性的检测结果
    expect(typeof envSystem.hasFeature(BrowserFeature.WEB_WORKER)).toBe(
      'boolean'
    );
    expect(typeof envSystem.hasFeature(BrowserFeature.FILE_API)).toBe(
      'boolean'
    );

    // 测试未知特性
    expect(envSystem.hasFeature('non_existent_feature')).toBe(false);
  });

  test('应该返回网络质量评估', () => {
    // 获取网络质量
    const quality = envSystem.getNetworkQuality();

    // 验证网络质量在预期范围内
    expect(Object.values(NetworkQuality)).toContain(quality);
  });

  test('应该返回内存容量评估', () => {
    // 获取内存容量
    const memoryCapacity = envSystem.getMemoryCapacity();

    // 验证内存容量在预期范围内
    expect(Object.values(DeviceMemoryCapacity)).toContain(memoryCapacity);
  });

  test('应该返回有效的推荐上传策略', () => {
    // 获取不同文件大小的推荐策略
    const smallFileStrategy = envSystem.getRecommendedUploadStrategy(
      1024 * 1024
    ); // 1MB
    const largeFileStrategy = envSystem.getRecommendedUploadStrategy(
      500 * 1024 * 1024
    ); // 500MB

    // 验证策略格式
    expect(smallFileStrategy).toHaveProperty('chunkSize');
    expect(smallFileStrategy).toHaveProperty('concurrency');
    expect(smallFileStrategy).toHaveProperty('retryCount');
    expect(smallFileStrategy).toHaveProperty('retryDelay');
    expect(smallFileStrategy).toHaveProperty('timeout');

    // 验证大文件策略的分片大小大于小文件
    expect(largeFileStrategy.chunkSize).toBeGreaterThanOrEqual(
      smallFileStrategy.chunkSize
    );
  });

  test('应该返回降级策略', () => {
    // 获取降级策略
    const fallbacks = envSystem.getFallbackStrategies();

    // 验证降级策略对象
    expect(fallbacks).toBeDefined();
    expect(typeof fallbacks).toBe('object');
  });
});

describe('ConfigurationEngine', () => {
  let configEngine: ConfigurationEngine;

  beforeEach(() => {
    // 创建一个新的配置引擎实例
    configEngine = new ConfigurationEngine();
  });

  test('应该为不同文件大小生成不同的配置', () => {
    // 生成配置
    const smallConfig = configEngine.generateRecommendedConfig(1024 * 1024); // 1MB
    const mediumConfig = configEngine.generateRecommendedConfig(
      50 * 1024 * 1024
    ); // 50MB
    const largeConfig = configEngine.generateRecommendedConfig(
      500 * 1024 * 1024
    ); // 500MB

    // 验证配置格式
    expect(smallConfig).toHaveProperty('chunkSize');
    expect(smallConfig).toHaveProperty('concurrency');
    expect(smallConfig).toHaveProperty('timeout');
    expect(smallConfig).toHaveProperty('retryCount');

    // 验证分片大小随文件大小增加
    expect(mediumConfig.chunkSize).toBeGreaterThanOrEqual(
      smallConfig.chunkSize
    );
    expect(largeConfig.chunkSize).toBeGreaterThanOrEqual(
      mediumConfig.chunkSize
    );
  });

  test('应该尊重用户自定义配置', () => {
    // 用户自定义配置
    const customPreferences = {
      chunkSize: 1024 * 1024, // 1MB
      concurrency: 2,
      retryCount: 10,
    };

    // 生成配置
    const config = configEngine.generateRecommendedConfig(
      50 * 1024 * 1024,
      customPreferences
    );

    // 验证用户配置被应用
    expect(config.chunkSize).toBe(customPreferences.chunkSize);
    expect(config.concurrency).toBe(customPreferences.concurrency);
    expect(config.retryCount).toBe(customPreferences.retryCount);
  });

  test('应该生成环境能力报告', () => {
    // 生成报告
    const report = configEngine.generateCapabilityReport();

    // 验证报告格式
    expect(report).toHaveProperty('environment');
    expect(report).toHaveProperty('capabilities');
    expect(report).toHaveProperty('networkQuality');
    expect(report).toHaveProperty('memoryCapacity');
    expect(report).toHaveProperty('featureSummary');
    expect(report).toHaveProperty('configComparison');
    expect(report).toHaveProperty('limitations');
    expect(report).toHaveProperty('warnings');
  });
});
