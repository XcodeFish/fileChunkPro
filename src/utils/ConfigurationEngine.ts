/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ConfigurationEngine.ts
 * 配置推荐引擎，基于环境检测结果提供最优配置
 */

import { NetworkQuality } from '../types';
import {
  Environment,
  BrowserFeature,
  EnvironmentRecommendation,
  EnvironmentCapabilityScore,
  FallbackStrategy,
} from '../types/environment.ts';

import { EnvironmentDetectionSystem } from './EnvironmentDetectionSystem';

/**
 * 配置推荐引擎 - 根据环境检测结果和文件大小生成最优配置
 */
export class ConfigurationEngine {
  private envSystem: EnvironmentDetectionSystem;

  /**
   * 构造函数
   * @param envSystem 环境检测系统实例
   */
  constructor(envSystem: EnvironmentDetectionSystem) {
    this.envSystem = envSystem;
  }

  /**
   * 生成推荐配置
   * @param fileSize 文件大小(字节)，0表示通用配置
   * @param userOptions 用户自定义配置选项
   * @returns 推荐配置对象
   */
  public generateRecommendedConfig(
    fileSize: number,
    userOptions: Record<string, any> = {}
  ): Record<string, any> {
    const env = this.envSystem.getEnvironment();
    const features = this.envSystem.detectAllFeatures();
    const capabilities = this.envSystem.getDeviceCapabilities();

    // 获取推荐的分片大小
    const chunkSize = this.getRecommendedChunkSize(fileSize);

    // 获取推荐的并发数
    const concurrency = this.getRecommendedConcurrency();

    // 获取推荐的超时时间
    const timeout = this.getRecommendedTimeout();

    // 获取推荐的重试策略
    const retryStrategy = this.getRecommendedRetryStrategy();

    // 基本配置
    const config: Record<string, any> = {
      chunkSize,
      concurrency,
      timeout,
      retryCount: retryStrategy.maxRetries,
      retryDelay: retryStrategy.initialDelay,
      useWorker:
        features[BrowserFeature.WEB_WORKER] && fileSize > 20 * 1024 * 1024, // 大于20MB时使用Worker
      autoRetry: true,
      maxMemoryUsage: capabilities.memory === 'low' ? 0.5 : 0.8, // 低内存设备限制内存使用
    };

    // 添加环境特定配置
    switch (env) {
      case Environment.Browser:
        config.enableAdaptiveUploads = true;
        config.enableMemoryMonitoring = capabilities.memory === 'low';
        config.enablePerformanceMonitoring = true;
        config.performanceCheckInterval =
          capabilities.processor === 'low' ? 2000 : 1000;
        break;

      case Environment.WechatMP:
      case Environment.AlipayMP:
      case Environment.BytedanceMP:
      case Environment.BaiduMP:
        // 小程序环境配置
        config.enableAdaptiveUploads = false; // 小程序环境中自适应上传支持有限
        config.maxConcurrency = 2; // 限制小程序并发数
        config.useWorker = false; // 某些小程序不支持Worker
        break;

      case Environment.ReactNative:
        // React Native环境配置
        config.enableAdaptiveUploads = true;
        config.useWorker = false; // RN通常不支持标准Worker
        break;

      case Environment.NodeJS:
        // Node.js环境配置
        config.enableAdaptiveUploads = true;
        config.useStreams = true;
        config.maxConcurrency = 8; // Node.js环境可以支持更高并发
        break;
    }

    // 合并用户配置(用户配置优先)
    return { ...config, ...userOptions };
  }

  /**
   * 获取推荐的分片大小
   * @param fileSize 文件大小(字节)
   * @returns 推荐的分片大小(字节)
   */
  public getRecommendedChunkSize(fileSize: number): number {
    const capabilities = this.envSystem.getDeviceCapabilities();
    const env = this.envSystem.getEnvironment();

    // 基础大小根据文件大小调整
    let baseSize: number;

    if (fileSize === 0) {
      // 通用配置，返回一个合理的中等值
      baseSize = 2 * 1024 * 1024; // 2MB
    } else if (fileSize < 5 * 1024 * 1024) {
      // 小文件 (<5MB)
      baseSize = 512 * 1024; // 512KB
    } else if (fileSize < 100 * 1024 * 1024) {
      // 中等文件 (5-100MB)
      baseSize = 2 * 1024 * 1024; // 2MB
    } else {
      // 大文件 (>100MB)
      baseSize = 5 * 1024 * 1024; // 5MB
    }

    // 根据内存能力调整
    if (capabilities.memory === 'low') {
      baseSize = Math.min(baseSize, 1 * 1024 * 1024); // 低内存设备最大1MB
    } else if (capabilities.memory === 'high') {
      baseSize = Math.max(baseSize, 2 * 1024 * 1024); // 高内存设备至少2MB
    }

    // 根据处理器能力调整
    if (capabilities.processor === 'low') {
      baseSize = Math.min(baseSize, 2 * 1024 * 1024); // 低性能设备最大2MB
    }

    // 根据网络能力调整
    if (capabilities.network === 'low') {
      baseSize = Math.min(baseSize, 1 * 1024 * 1024); // 网络差时减小分片
    } else if (capabilities.network === 'high') {
      baseSize = Math.max(baseSize, 4 * 1024 * 1024); // 网络好时增大分片
    }

    // 小程序环境特殊处理
    if (
      env === Environment.WechatMP ||
      env === Environment.AlipayMP ||
      env === Environment.BytedanceMP ||
      env === Environment.BaiduMP
    ) {
      baseSize = Math.min(baseSize, 2 * 1024 * 1024); // 小程序环境限制为最大2MB
    }

    return baseSize;
  }

  /**
   * 获取推荐的并发数
   * @returns 推荐的并发数
   */
  public getRecommendedConcurrency(): number {
    const features = this.envSystem.detectAllFeatures();
    const capabilities = this.envSystem.getDeviceCapabilities();
    const env = this.envSystem.getEnvironment();

    // 基础并发数
    let baseConcurrency: number;

    // 根据处理器能力设置基础并发数
    if (capabilities.processor === 'low') {
      baseConcurrency = 2;
    } else if (capabilities.processor === 'normal') {
      baseConcurrency = 3;
    } else {
      baseConcurrency = 4;
    }

    // 根据硬件并发数调整
    if (features[BrowserFeature.HARDWARE_CONCURRENCY]) {
      const hardwareConcurrency = navigator.hardwareConcurrency || 4;
      baseConcurrency = Math.min(
        Math.max(2, Math.floor(hardwareConcurrency / 2)),
        8
      );
    }

    // 根据网络能力调整
    if (capabilities.network === 'low') {
      baseConcurrency = Math.min(baseConcurrency, 2); // 网络差时减少并发
    } else if (capabilities.network === 'high') {
      baseConcurrency += 1; // 网络好时增加并发
    }

    // 根据内存能力调整
    if (capabilities.memory === 'low') {
      baseConcurrency = Math.min(baseConcurrency, 2); // 低内存设备限制并发
    }

    // 根据电池状态调整
    if (capabilities.battery === 'low') {
      baseConcurrency = Math.min(baseConcurrency, 2); // 电池低时减少并发
    }

    // 小程序环境特殊处理
    if (
      env === Environment.WechatMP ||
      env === Environment.AlipayMP ||
      env === Environment.BytedanceMP ||
      env === Environment.BaiduMP
    ) {
      baseConcurrency = Math.min(baseConcurrency, 2); // 小程序环境限制并发数为最大2
    }

    // Node.js环境特殊处理
    if (env === Environment.NodeJS) {
      baseConcurrency = Math.max(baseConcurrency, 4); // Node.js环境至少4个并发
      baseConcurrency = Math.min(baseConcurrency, 8); // 最大8个并发
    }

    return baseConcurrency;
  }

  /**
   * 获取推荐的超时时间
   * @returns 推荐的超时时间(毫秒)
   */
  public getRecommendedTimeout(): number {
    const capabilities = this.envSystem.getDeviceCapabilities();

    // 基础超时时间
    let baseTimeout = 30000; // 30秒

    // 根据网络能力调整
    if (capabilities.network === 'low') {
      baseTimeout = 60000; // 网络差时增加到60秒
    } else if (capabilities.network === 'high') {
      baseTimeout = 20000; // 网络好时减少到20秒
    }

    return baseTimeout;
  }

  /**
   * 获取推荐的重试策略
   * @returns 重试策略对象
   */
  public getRecommendedRetryStrategy(): {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    factor: number;
  } {
    const capabilities = this.envSystem.getDeviceCapabilities();

    // 基础重试策略
    const strategy = {
      maxRetries: 3,
      initialDelay: 1000, // 初始延迟1秒
      maxDelay: 30000, // 最大延迟30秒
      factor: 2, // 指数退避因子
    };

    // 根据网络能力调整
    if (capabilities.network === 'low') {
      strategy.maxRetries = 5; // 网络差时增加重试次数
      strategy.initialDelay = 2000; // 初始延迟增加到2秒
    } else if (capabilities.network === 'high') {
      strategy.maxRetries = 2; // 网络好时减少重试次数
      strategy.initialDelay = 500; // 初始延迟减少到0.5秒
    }

    return strategy;
  }

  /**
   * 获取针对特定网络质量的推荐配置
   * @param networkQuality 网络质量
   * @param fileSize 文件大小(字节)
   * @returns 推荐配置对象
   */
  public getNetworkQualityBasedConfig(
    networkQuality: NetworkQuality,
    fileSize: number
  ): Record<string, any> {
    const baseConfig = this.generateRecommendedConfig(fileSize);

    switch (networkQuality) {
      case NetworkQuality.POOR:
        return {
          ...baseConfig,
          concurrency: 1,
          chunkSize: 512 * 1024, // 512KB
          timeout: 90000, // 90秒
          retryCount: 5,
          retryDelay: 3000, // 3秒
        };

      case NetworkQuality.LOW:
        return {
          ...baseConfig,
          concurrency: 2,
          chunkSize: 1 * 1024 * 1024, // 1MB
          timeout: 60000, // 60秒
          retryCount: 4,
          retryDelay: 2000, // 2秒
        };

      case NetworkQuality.MEDIUM:
        return {
          ...baseConfig,
          concurrency: 3,
          chunkSize: 2 * 1024 * 1024, // 2MB
          timeout: 30000, // 30秒
          retryCount: 3,
          retryDelay: 1000, // 1秒
        };

      case NetworkQuality.GOOD:
        return {
          ...baseConfig,
          concurrency: 4,
          chunkSize: 4 * 1024 * 1024, // 4MB
          timeout: 20000, // 20秒
          retryCount: 2,
          retryDelay: 1000, // 1秒
        };

      case NetworkQuality.EXCELLENT:
        return {
          ...baseConfig,
          concurrency: 6,
          chunkSize: 8 * 1024 * 1024, // 8MB
          timeout: 15000, // 15秒
          retryCount: 1,
          retryDelay: 500, // 0.5秒
        };

      case NetworkQuality.OFFLINE:
        return {
          ...baseConfig,
          concurrency: 0,
          autoRetry: false,
        };

      default:
        return baseConfig;
    }
  }

  /**
   * 生成环境能力报告
   * @returns 环境能力报告对象
   */
  public generateCapabilityReport(): Record<string, any> {
    const env = this.envSystem.getEnvironment();
    const envName = this.envSystem.getEnvironmentName();
    const features = this.envSystem.detectAllFeatures();
    const capabilities = this.envSystem.getDeviceCapabilities();
    const scores = this.envSystem.getCapabilityScore();
    const fallbacks = this.envSystem.getFallbackStrategies();

    // 获取浏览器信息
    let browserInfo = { name: 'unknown', version: 'unknown' };
    if (env === Environment.Browser && typeof navigator !== 'undefined') {
      const userAgent = navigator.userAgent;

      // 检测Chrome
      const chrome = userAgent.match(/(chrome|chromium)\/(\d+)/i);
      if (chrome) browserInfo = { name: 'chrome', version: chrome[2] };

      // 检测Firefox
      const firefox = userAgent.match(/(firefox|fxios)\/(\d+)/i);
      if (firefox) browserInfo = { name: 'firefox', version: firefox[2] };

      // 检测Safari
      const safari = userAgent.match(/version\/(\d+).*safari/i);
      if (safari) browserInfo = { name: 'safari', version: safari[1] };

      // 检测Edge
      const edge =
        userAgent.match(/edge\/(\d+)/i) || userAgent.match(/edg\/(\d+)/i);
      if (edge) browserInfo = { name: 'edge', version: edge[1] };
    }

    // 生成缺失特性列表
    const missingFeatures: string[] = [];
    if (env === Environment.Browser) {
      if (!features[BrowserFeature.WEB_WORKER])
        missingFeatures.push('Web Worker');
      if (!features[BrowserFeature.SERVICE_WORKER])
        missingFeatures.push('Service Worker');
      if (!features[BrowserFeature.INDEXED_DB])
        missingFeatures.push('IndexedDB');
      if (!features[BrowserFeature.STREAMS_API])
        missingFeatures.push('Streams API');
      if (!features[BrowserFeature.SHARED_ARRAY_BUFFER])
        missingFeatures.push('SharedArrayBuffer');
    }

    // 生成推荐配置
    const recommendedConfig = this.generateRecommendedConfig(0);

    // 生成性能建议
    const performanceTips: string[] = [];

    if (capabilities.memory === 'low') {
      performanceTips.push('设备内存较低，建议减小分片大小和并发数');
    }

    if (capabilities.processor === 'low') {
      performanceTips.push('处理器性能较低，建议减少并发数并禁用Worker');
    }

    if (capabilities.network === 'low') {
      performanceTips.push('网络条件较差，建议增加超时时间和重试次数');
    }

    if (capabilities.storage === 'low') {
      performanceTips.push('存储能力有限，建议谨慎使用断点续传功能');
    }

    if (capabilities.battery === 'low') {
      performanceTips.push('电池电量低，建议减少资源使用');
    }

    // 组装完整报告
    return {
      environment: {
        type: envName,
        browser: env === Environment.Browser ? browserInfo : undefined,
        nodeVersion:
          env === Environment.NodeJS ? process.versions.node : undefined,
      },
      capabilities: {
        memory: capabilities.memory,
        processor: capabilities.processor,
        network: capabilities.network,
        storage: capabilities.storage,
        battery: capabilities.battery,
      },
      features: {
        supported: Object.keys(features).filter(feature => features[feature]),
        missing: missingFeatures,
      },
      performance: {
        scores,
        rating: this.getOverallRating(scores.overall),
        tips: performanceTips,
      },
      recommendations: {
        config: recommendedConfig,
        fallbacks: fallbacks.map(fallback => ({
          feature: fallback.feature,
          method: fallback.fallbackMethod,
          impact: fallback.performance,
        })),
      },
    };
  }

  /**
   * 获取总体评级
   * @param score 总体评分(0-100)
   * @returns 评级字符串
   */
  private getOverallRating(score: number): string {
    if (score >= 90) return '优秀';
    if (score >= 75) return '良好';
    if (score >= 60) return '中等';
    if (score >= 40) return '较差';
    return '非常差';
  }

  /**
   * 生成特定大小文件的多级配置方案
   * 提供不同优化级别的配置选项
   * @param fileSize 文件大小(字节)
   * @returns 不同级别的配置选项
   */
  public generateTieredConfigurations(fileSize: number): Record<string, any> {
    // 基础配置
    const baseConfig = this.generateRecommendedConfig(fileSize);

    // 性能优先配置
    const performanceConfig = {
      ...baseConfig,
      chunkSize: Math.min(
        10 * 1024 * 1024,
        Math.max(baseConfig.chunkSize * 2, 4 * 1024 * 1024)
      ),
      concurrency: Math.min(8, baseConfig.concurrency + 2),
      useWorker: true,
      enableAdaptiveUploads: true,
      enableMemoryMonitoring: true,
    };

    // 稳定性优先配置
    const stabilityConfig = {
      ...baseConfig,
      chunkSize: Math.min(baseConfig.chunkSize, 2 * 1024 * 1024),
      concurrency: Math.max(1, baseConfig.concurrency - 1),
      retryCount: baseConfig.retryCount + 2,
      timeout: baseConfig.timeout * 1.5,
    };

    // 省电模式配置
    const powerSavingConfig = {
      ...baseConfig,
      chunkSize: Math.min(baseConfig.chunkSize, 2 * 1024 * 1024),
      concurrency: Math.max(1, Math.floor(baseConfig.concurrency / 2)),
      useWorker: false,
      enableAdaptiveUploads: false,
      enablePerformanceMonitoring: false,
      performanceCheckInterval: 5000,
    };

    // 流量节省配置
    const dataSavingConfig = {
      ...baseConfig,
      chunkSize: Math.max(4 * 1024 * 1024, baseConfig.chunkSize),
      concurrency: Math.max(1, Math.floor(baseConfig.concurrency / 2)),
      retryCount: Math.max(1, baseConfig.retryCount - 1),
    };

    return {
      balanced: baseConfig, // 平衡配置
      performance: performanceConfig, // 性能优先
      stability: stabilityConfig, // 稳定性优先
      powerSaving: powerSavingConfig, // 省电模式
      dataSaving: dataSavingConfig, // 流量节省
    };
  }
}

export default ConfigurationEngine;
