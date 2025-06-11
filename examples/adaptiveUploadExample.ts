/**
 * 自适应上传策略使用示例
 * 展示如何利用自适应配置、降级策略和小程序环境优化功能
 */

import {
  AdaptiveConfigManager,
  FallbackStrategyManager,
  MiniProgramOptimizer,
  EnvironmentDetectionSystem,
  Logger,
  NetworkDetector,
} from '../src/utils';
import {
  FeatureType,
  DegradationReason,
} from '../src/utils/FallbackStrategyManager';
import { Environment } from '../src/types/environment';

class AdaptiveUploadExample {
  private logger = new Logger('AdaptiveUploadExample');
  private envSystem = EnvironmentDetectionSystem.getInstance();
  private adaptiveConfig = AdaptiveConfigManager.getInstance();
  private fallbackStrategy = FallbackStrategyManager.getInstance();
  private miniProgramOptimizer = MiniProgramOptimizer.getInstance();
  private networkDetector = NetworkDetector.getInstance();

  /**
   * 初始化示例
   */
  public async initialize(): Promise<void> {
    this.logger.info('初始化自适应上传示例');

    // 1. 初始化环境检测系统
    const envResult = await this.envSystem.detectEnvironment();
    this.logger.info('环境检测结果', {
      environment: envResult.environment,
      type: envResult.environmentType,
      capabilities: envResult.capabilities,
    });

    // 2. 初始化自适应配置管理器
    await this.adaptiveConfig.initialize({
      enablePerformanceTracking: true,
      enableAdaptiveLearning: true,
      enableNetworkMonitoring: true,
      monitoringInterval: 30000, // 30秒
    });

    // 3. 初始化降级策略管理器
    await this.fallbackStrategy.initialize({
      autoRecoveryEnabled: true,
      recoveryInterval: 5 * 60 * 1000, // 5分钟
    });

    // 4. 如果在小程序环境中，初始化小程序优化器
    if (this.isInMiniProgramEnvironment(envResult.environment)) {
      await this.miniProgramOptimizer.initialize({
        enableCompatibilityMode: true,
      });
    }

    this.logger.info('自适应上传示例初始化完成');
  }

  /**
   * 准备上传配置
   */
  public async prepareUploadConfig(options: {
    fileSize: number;
    fileType?: string;
    priority?: number;
  }): Promise<Record<string, any>> {
    this.logger.info('准备上传配置', options);

    const envResult = await this.envSystem.detectEnvironment();
    let config: Record<string, any>;

    // 判断是否在小程序环境
    if (this.isInMiniProgramEnvironment(envResult.environment)) {
      this.logger.debug('检测到小程序环境，应用小程序优化配置');

      // 获取小程序优化配置
      const miniProgramConfig =
        this.miniProgramOptimizer.getOptimizedUploadParameters();

      // 根据文件大小进一步优化分片配置
      const chunkConfig = this.miniProgramOptimizer.getOptimizedChunkConfig(
        options.fileSize
      );

      config = {
        ...miniProgramConfig,
        ...chunkConfig,
      };

      // 获取平台限制
      const limitations = this.miniProgramOptimizer.getPlatformLimitations();
      this.logger.debug('小程序平台限制', { limitations });
    } else {
      // 获取基于环境和文件特性的优化配置
      config = await this.adaptiveConfig.getFileSpecificConfig(
        options.fileSize,
        options.fileType,
        options.priority
      );

      // 检查是否在WebView环境，如果是则进一步优化
      if (envResult.webViewInfo?.isWebView) {
        this.logger.debug('检测到WebView环境，调整配置');
        const webViewConfig = this.adaptiveConfig.getWebViewOptimizedConfig(
          envResult.webViewInfo.type,
          envResult.deviceProfile?.memory.isLowMemoryDevice
        );

        // 合并配置
        config = {
          ...config,
          ...webViewConfig,
        };
      }
    }

    // 应用降级策略配置
    this.applyFallbackStrategies(config);

    // 根据当前网络状况调整配置
    const networkQuality = await this.networkDetector.detectNetworkQuality();
    if (networkQuality) {
      this.logger.debug('根据网络质量调整配置', {
        quality: networkQuality.qualityLevel,
        uploadSpeed: networkQuality.uploadSpeed,
      });
      config = await this.adaptiveConfig.adjustConfigInRealtime();
    }

    this.logger.info('最终上传配置', config);
    return config;
  }

  /**
   * 处理上传错误
   */
  public async handleUploadError(error: any): Promise<Record<string, any>> {
    this.logger.warn('处理上传错误', error);

    // 根据错误类型决定降级策略
    if (error.name === 'NetworkError' || error.message.includes('timeout')) {
      // 网络错误，降级并发
      await this.fallbackStrategy.degrade(
        FeatureType.CONCURRENCY,
        DegradationReason.ERROR_OCCURRED,
        error
      );
    } else if (
      error.name === 'OutOfMemoryError' ||
      error.message.includes('memory')
    ) {
      // 内存错误，降级分片策略
      await this.fallbackStrategy.degrade(
        FeatureType.CHUNK,
        DegradationReason.ERROR_OCCURRED,
        error
      );

      // 同时降级Worker使用
      await this.fallbackStrategy.degrade(
        FeatureType.WORKER,
        DegradationReason.ERROR_OCCURRED,
        error
      );
    } else if (
      error.name === 'SecurityError' ||
      error.message.includes('security')
    ) {
      // 安全错误，降级哈希策略
      await this.fallbackStrategy.degrade(
        FeatureType.HASH,
        DegradationReason.ERROR_OCCURRED,
        error
      );
    } else if (
      error.message.includes('storage') ||
      error.name === 'QuotaExceededError'
    ) {
      // 存储错误，降级存储策略
      await this.fallbackStrategy.degrade(
        FeatureType.STORAGE,
        DegradationReason.ERROR_OCCURRED,
        error
      );
    }

    // 获取最新配置
    return this.adaptiveConfig.getCurrentConfig();
  }

  /**
   * 上传性能反馈
   */
  public async provideFeedback(performanceData: {
    successRate: number;
    avgSpeed: number;
    timeToFirstByte: number;
  }): Promise<void> {
    this.logger.info('提供上传性能反馈', performanceData);

    // 将性能数据反馈给自适应配置系统，优化未来配置
    await this.adaptiveConfig.adjustConfigInRealtime(performanceData);

    // 如果性能不佳，考虑恢复之前的降级
    if (performanceData.successRate > 0.95) {
      // 尝试恢复并发策略
      await this.fallbackStrategy.recover(FeatureType.CONCURRENCY);
      // 尝试恢复分片策略
      await this.fallbackStrategy.recover(FeatureType.CHUNK);
    }
  }

  /**
   * 应用降级策略配置
   */
  private applyFallbackStrategies(config: Record<string, any>): void {
    // 检查各功能的降级状态并应用配置

    // Worker降级
    const workerState = this.fallbackStrategy.getState(FeatureType.WORKER);
    if (workerState && workerState.currentLevel > 0) {
      const workerConfig = this.fallbackStrategy.getConfigRecommendation(
        FeatureType.WORKER
      );
      if (workerConfig) {
        Object.assign(config, workerConfig);
      }
    }

    // 存储降级
    const storageState = this.fallbackStrategy.getState(FeatureType.STORAGE);
    if (storageState && storageState.currentLevel > 0) {
      const storageConfig = this.fallbackStrategy.getConfigRecommendation(
        FeatureType.STORAGE
      );
      if (storageConfig) {
        Object.assign(config, storageConfig);
      }
    }

    // 并发降级
    const concurrencyState = this.fallbackStrategy.getState(
      FeatureType.CONCURRENCY
    );
    if (concurrencyState && concurrencyState.currentLevel > 0) {
      const concurrencyConfig = this.fallbackStrategy.getConfigRecommendation(
        FeatureType.CONCURRENCY
      );
      if (concurrencyConfig) {
        Object.assign(config, concurrencyConfig);
      }
    }

    // 哈希降级
    const hashState = this.fallbackStrategy.getState(FeatureType.HASH);
    if (hashState && hashState.currentLevel > 0) {
      const hashConfig = this.fallbackStrategy.getConfigRecommendation(
        FeatureType.HASH
      );
      if (hashConfig) {
        Object.assign(config, hashConfig);
      }
    }
  }

  /**
   * 检查是否处于小程序环境
   */
  private isInMiniProgramEnvironment(env: Environment): boolean {
    return [
      Environment.WechatMP,
      Environment.AlipayMP,
      Environment.BytedanceMP,
      Environment.BaiduMP,
      Environment.Taro,
      Environment.UniApp,
    ].includes(env);
  }

  /**
   * 重置所有配置到默认状态
   */
  public async resetToDefault(): Promise<void> {
    this.logger.info('重置所有配置到默认状态');

    // 重置自适应配置
    this.adaptiveConfig.resetToDefault();

    // 重置降级状态
    await this.fallbackStrategy.resetAll();

    this.logger.info('配置已重置');
  }
}

// 使用示例
async function runExample(): Promise<void> {
  const example = new AdaptiveUploadExample();

  // 初始化
  await example.initialize();

  // 获取大文件的上传配置
  const largeFileConfig = await example.prepareUploadConfig({
    fileSize: 100 * 1024 * 1024, // 100MB
    fileType: 'video/mp4',
    priority: 0.8, // 高优先级
  });
  console.log('大文件上传配置:', largeFileConfig);

  // 获取小文件的上传配置
  const smallFileConfig = await example.prepareUploadConfig({
    fileSize: 500 * 1024, // 500KB
    fileType: 'image/jpeg',
    priority: 0.5, // 中等优先级
  });
  console.log('小文件上传配置:', smallFileConfig);

  // 模拟错误处理
  const newConfig = await example.handleUploadError({
    name: 'NetworkError',
    message: 'Upload timeout after 30000ms',
  });
  console.log('错误处理后的新配置:', newConfig);

  // 提供性能反馈
  await example.provideFeedback({
    successRate: 0.98,
    avgSpeed: 1.5 * 1024 * 1024, // 1.5MB/s
    timeToFirstByte: 800, // 800ms
  });

  // 最后重置配置
  await example.resetToDefault();
}

// 如果直接运行此文件，则执行示例
if (require.main === module) {
  runExample().catch(error => {
    console.error('运行示例时出错:', error);
  });
}

export { AdaptiveUploadExample };
