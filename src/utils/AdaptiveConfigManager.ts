/**
 * 自适应配置管理器
 * 根据环境检测结果动态生成最优配置，支持运行时调整和配置记忆功能
 */

import { Logger } from './Logger';
import { EnvironmentDetectionSystem } from './EnvironmentDetectionSystem';
import { NetworkDetector } from './NetworkDetector';
import {
  IUploadParameters,
  NetworkQualityLevel,
  INetworkQualityResult,
} from '../types/AdaptiveUploadTypes';
import { EnvironmentType, Environment } from '../types/environment';
import { StorageUtils } from './StorageUtils';

// 配置调整历史记录类型
interface ConfigAdjustmentHistory {
  timestamp: number;
  networkQuality: NetworkQualityLevel;
  parameters: IUploadParameters;
  performance: {
    successRate: number;
    avgSpeed: number;
    timeToFirstByte: number;
  };
  environment: string;
}

// 环境指纹，用于标识特定环境
interface EnvironmentFingerprint {
  environmentType: EnvironmentType;
  browser?: string;
  browserVersion?: string;
  os?: string;
  deviceType?: string;
  connectionType?: string;
  webViewInfo?: string;
  isLowEndDevice?: boolean;
}

/**
 * 自适应配置管理器类
 * 根据环境检测和实时网络状况动态调整配置
 */
export class AdaptiveConfigManager {
  private static instance: AdaptiveConfigManager;
  private logger: Logger;
  private envDetectionSystem: EnvironmentDetectionSystem;
  private networkDetector: NetworkDetector;
  private configHistoryKey = 'fileChunkPro_configHistory';
  private configCache: Map<string, IUploadParameters> = new Map();
  private currentConfig: IUploadParameters;
  private configAdjustmentHistory: ConfigAdjustmentHistory[] = [];
  private isMonitoring = false;
  private performanceTrackingEnabled = false;
  private adaptiveLearningEnabled = false;

  // 基础配置限制
  private configLimits = {
    minChunkSize: 256 * 1024, // 256KB
    maxChunkSize: 10 * 1024 * 1024, // 10MB
    minConcurrency: 1,
    maxConcurrency: 6,
    minTimeout: 10000, // 10秒
    maxTimeout: 120000, // 2分钟
    minRetryCount: 0,
    maxRetryCount: 5,
  };

  // 默认配置
  private defaultConfig: IUploadParameters = {
    chunkSize: 2 * 1024 * 1024, // 2MB
    concurrency: 3,
    retryCount: 3,
    retryDelay: 1000,
    timeout: 30000,
    precheckEnabled: true,
    useWorker: true,
  };

  /**
   * 获取单例实例
   */
  public static getInstance(): AdaptiveConfigManager {
    if (!AdaptiveConfigManager.instance) {
      AdaptiveConfigManager.instance = new AdaptiveConfigManager();
    }
    return AdaptiveConfigManager.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this.logger = new Logger('AdaptiveConfigManager');
    this.envDetectionSystem = EnvironmentDetectionSystem.getInstance();
    this.networkDetector = NetworkDetector.getInstance();
    this.currentConfig = { ...this.defaultConfig };
    this.loadConfigHistory();
  }

  /**
   * 初始化配置管理器
   * @param options 初始化选项
   */
  public async initialize(
    options: {
      enablePerformanceTracking?: boolean;
      enableAdaptiveLearning?: boolean;
      initialConfig?: Partial<IUploadParameters>;
      enableNetworkMonitoring?: boolean;
      monitoringInterval?: number;
    } = {}
  ): Promise<IUploadParameters> {
    this.logger.debug('初始化自适应配置管理器');

    // 设置选项
    this.performanceTrackingEnabled = options.enablePerformanceTracking ?? true;
    this.adaptiveLearningEnabled = options.enableAdaptiveLearning ?? true;

    // 合并初始配置
    if (options.initialConfig) {
      this.currentConfig = {
        ...this.defaultConfig,
        ...options.initialConfig,
      };
    }

    // 根据环境生成优化配置
    const optimizedConfig = await this.generateOptimalConfig();
    this.currentConfig = optimizedConfig;

    // 启动网络监控
    if (options.enableNetworkMonitoring !== false) {
      const interval = options.monitoringInterval || 30000; // 默认30秒
      this.startNetworkMonitoring(interval);
    }

    this.logger.debug('自适应配置管理器初始化完成', {
      config: this.currentConfig,
    });
    return this.currentConfig;
  }

  /**
   * 生成最佳配置
   * 综合考虑环境检测结果、历史表现和网络状况
   */
  public async generateOptimalConfig(): Promise<IUploadParameters> {
    try {
      // 1. 获取环境检测结果
      const envDetection = await this.envDetectionSystem.detectEnvironment();

      // 2. 生成环境指纹
      const fingerprint = this.generateEnvironmentFingerprint(envDetection);

      // 3. 尝试从缓存中获取该环境的配置
      const cachedConfig = this.getConfigFromCache(fingerprint);
      if (cachedConfig) {
        this.logger.debug('使用缓存的环境配置', {
          fingerprint,
          config: cachedConfig,
        });
        return this.validateConfig(cachedConfig);
      }

      // 4. 从环境检测结果中获取推荐配置
      let config = this.getConfigFromDetectionResult(envDetection);

      // 5. 根据网络状况调整配置
      const networkQuality = await this.getCurrentNetworkQuality();
      if (networkQuality) {
        config = this.adjustConfigByNetworkQuality(config, networkQuality);
      }

      // 6. 应用特定环境调优
      config = this.applyEnvironmentSpecificTuning(
        config,
        envDetection.environment
      );

      // 7. 验证并规范化配置
      config = this.validateConfig(config);

      // 8. 缓存配置
      this.saveConfigToCache(fingerprint, config);

      this.logger.debug('生成最佳配置完成', { config });
      return config;
    } catch (error) {
      this.logger.warn('生成最佳配置失败，使用默认配置', error);
      return { ...this.defaultConfig };
    }
  }

  /**
   * 实时调整配置
   * 根据当前网络状况、上传性能等因素动态调整
   */
  public async adjustConfigInRealtime(performanceData?: {
    successRate?: number;
    avgSpeed?: number;
    timeToFirstByte?: number;
  }): Promise<IUploadParameters> {
    // 获取当前网络质量
    const networkQuality = await this.getCurrentNetworkQuality();
    if (!networkQuality) {
      return this.currentConfig;
    }

    let adjustedConfig = { ...this.currentConfig };

    // 根据网络质量调整配置
    adjustedConfig = this.adjustConfigByNetworkQuality(
      adjustedConfig,
      networkQuality
    );

    // 如果提供了性能数据，进一步优化配置
    if (performanceData) {
      adjustedConfig = this.optimizeConfigByPerformance(
        adjustedConfig,
        networkQuality.qualityLevel,
        performanceData
      );

      // 记录调整历史
      if (this.performanceTrackingEnabled) {
        this.recordConfigAdjustment(
          adjustedConfig,
          networkQuality.qualityLevel,
          performanceData
        );
      }
    }

    // 验证并规范化配置
    adjustedConfig = this.validateConfig(adjustedConfig);

    // 更新当前配置
    this.currentConfig = adjustedConfig;

    this.logger.debug('实时调整配置完成', {
      networkQuality: networkQuality.qualityLevel,
      config: adjustedConfig,
      performanceData,
    });

    return adjustedConfig;
  }

  /**
   * 根据文件特性获取针对性配置
   * @param fileSize 文件大小(字节)
   * @param fileType 文件类型
   * @param priority 优先级(0-1)
   */
  public async getFileSpecificConfig(
    fileSize: number,
    fileType?: string,
    priority?: number
  ): Promise<IUploadParameters> {
    const config = { ...this.currentConfig };

    // 根据文件大小调整分片大小
    if (fileSize < 5 * 1024 * 1024) {
      // 5MB以下的小文件
      config.chunkSize = Math.min(fileSize, 1024 * 1024); // 最大1MB分片或文件大小
      config.concurrency = Math.max(2, config.concurrency); // 至少2并发
    } else if (fileSize > 100 * 1024 * 1024) {
      // 100MB以上的大文件
      config.chunkSize = Math.min(5 * 1024 * 1024, config.chunkSize); // 不超过5MB的分片
      config.useWorker = true; // 大文件强制使用Worker
    }

    // 根据文件类型调整配置
    if (fileType) {
      // 图片类型，通常较小，可以一次性上传
      if (/^image\//.test(fileType) && fileSize < 10 * 1024 * 1024) {
        config.chunkSize = fileSize;
        config.concurrency = 1;
      }
      // 视频和音频类型，通常较大，使用较大分片和多并发
      else if (/^(video|audio)\//.test(fileType)) {
        config.concurrency = Math.min(
          config.concurrency + 1,
          this.configLimits.maxConcurrency
        );
      }
    }

    // 根据优先级调整配置
    if (typeof priority === 'number') {
      if (priority > 0.8) {
        // 高优先级
        config.concurrency = Math.min(
          config.concurrency + 1,
          this.configLimits.maxConcurrency
        );
        config.timeout = Math.max(
          config.timeout * 1.5,
          this.configLimits.maxTimeout
        );
      } else if (priority < 0.3) {
        // 低优先级
        config.concurrency = Math.max(config.concurrency - 1, 1);
      }
    }

    return this.validateConfig(config);
  }

  /**
   * 获取小程序环境优化配置
   * @param miniProgramType 小程序类型
   */
  public getMiniProgramOptimizedConfig(
    miniProgramType: Environment
  ): IUploadParameters {
    const config = { ...this.currentConfig };

    // 小程序通用优化
    config.useWorker = false; // 大多数小程序不支持或限制Worker

    // 微信小程序特定优化
    if (miniProgramType === Environment.WechatMP) {
      config.chunkSize = 1 * 1024 * 1024; // 1MB分片大小
      config.concurrency = 3;
      config.timeout = 60000; // 60秒超时
    }
    // 支付宝小程序特定优化
    else if (miniProgramType === Environment.AlipayMP) {
      config.chunkSize = 2 * 1024 * 1024; // 2MB分片大小
      config.concurrency = 2;
      config.timeout = 45000; // 45秒超时
    }
    // 字节跳动小程序特定优化
    else if (miniProgramType === Environment.BytedanceMP) {
      config.chunkSize = 4 * 1024 * 1024; // 4MB分片大小
      config.concurrency = 1;
      config.timeout = 60000; // 60秒超时
    }
    // 百度小程序特定优化
    else if (miniProgramType === Environment.BaiduMP) {
      config.chunkSize = 1 * 1024 * 1024; // 1MB分片大小
      config.concurrency = 2;
      config.timeout = 30000; // 30秒超时
    }
    // Uni-App框架
    else if (miniProgramType === Environment.UniApp) {
      config.chunkSize = 2 * 1024 * 1024;
      config.concurrency = 2;
    }
    // Taro框架
    else if (miniProgramType === Environment.Taro) {
      config.chunkSize = 2 * 1024 * 1024;
      config.concurrency = 2;
    }

    return this.validateConfig(config);
  }

  /**
   * 获取WebView优化配置
   * @param webViewType WebView类型
   * @param isLowMemoryDevice 是否低内存设备
   */
  public getWebViewOptimizedConfig(
    webViewType: string,
    isLowMemoryDevice = false
  ): IUploadParameters {
    const config = { ...this.currentConfig };

    // WebView通用优化
    config.useWorker = true; // WebView通常支持Worker

    // 特定WebView优化
    if (webViewType.includes('WKWebView')) {
      // iOS WebView
      config.chunkSize = 2 * 1024 * 1024;
      config.concurrency = 3;
    } else if (webViewType.includes('Android')) {
      // Android WebView
      config.chunkSize = 1 * 1024 * 1024;
      config.concurrency = 2;
    }

    // 低内存设备优化
    if (isLowMemoryDevice) {
      config.chunkSize = Math.min(config.chunkSize, 512 * 1024);
      config.concurrency = Math.min(config.concurrency, 2);
      config.useWorker = false; // 低内存设备避免使用Worker
    }

    return this.validateConfig(config);
  }

  /**
   * 获取降级配置
   * 在环境不支持或遇到问题时使用的安全配置
   */
  public getFallbackConfig(): IUploadParameters {
    return this.validateConfig({
      chunkSize: 512 * 1024, // 512KB分片
      concurrency: 1, // 单线程上传
      retryCount: 5,
      retryDelay: 2000,
      timeout: 60000, // 60秒超时
      precheckEnabled: false, // 禁用预检查
      useWorker: false, // 禁用Worker
    });
  }

  /**
   * 保存配置到存储
   */
  public async saveConfigs(): Promise<void> {
    try {
      await StorageUtils.setItem(
        this.configHistoryKey,
        JSON.stringify(this.configAdjustmentHistory)
      );
    } catch (error) {
      this.logger.warn('保存配置历史失败', error);
    }
  }

  /**
   * 重置配置为默认值
   */
  public resetToDefault(): IUploadParameters {
    this.currentConfig = { ...this.defaultConfig };
    return this.currentConfig;
  }

  /**
   * 启动网络监控
   * @param interval 监控间隔(毫秒)
   */
  private startNetworkMonitoring(interval: number): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.networkDetector.startMonitoring(interval);
    this.networkDetector.onNetworkChange(async result => {
      this.logger.debug('检测到网络状况变化', {
        qualityLevel: result.qualityLevel,
        uploadSpeed: result.uploadSpeed,
      });

      // 当网络状况显著变化时调整配置
      if (this.shouldAdjustForNetworkChange(result)) {
        await this.adjustConfigInRealtime();
      }
    });

    this.logger.debug('网络监控已启动', { interval });
  }

  /**
   * 停止网络监控
   */
  public stopNetworkMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.networkDetector.stopMonitoring();
    this.isMonitoring = false;
    this.logger.debug('网络监控已停止');
  }

  /**
   * 判断是否应该因为网络变化调整配置
   */
  private shouldAdjustForNetworkChange(result: INetworkQualityResult): boolean {
    // 网络不稳定时总是调整
    if (result.isUnstable) {
      return true;
    }

    // 之前没有网络质量记录
    const previousResult = this.networkDetector.getLatestResult();
    if (!previousResult) {
      return true;
    }

    // 网络质量等级变化
    if (previousResult.qualityLevel !== result.qualityLevel) {
      return true;
    }

    // 上传速度变化显著 (变化超过30%)
    const speedChange =
      Math.abs(result.uploadSpeed - previousResult.uploadSpeed) /
      previousResult.uploadSpeed;
    if (speedChange > 0.3) {
      return true;
    }

    return false;
  }

  /**
   * 从环境检测结果获取配置
   */
  private getConfigFromDetectionResult(envDetection: any): IUploadParameters {
    const recommendedSettings = envDetection.recommendedSettings;

    const config: IUploadParameters = {
      ...this.defaultConfig,
      chunkSize: recommendedSettings.chunkSize || this.defaultConfig.chunkSize,
      concurrency:
        recommendedSettings.maxConcurrentTasks ||
        this.defaultConfig.concurrency,
      useWorker:
        recommendedSettings.useWorker !== undefined
          ? recommendedSettings.useWorker
          : this.defaultConfig.useWorker,
      retryCount:
        recommendedSettings.maxRetries || this.defaultConfig.retryCount,
      retryDelay:
        recommendedSettings.initialDelay || this.defaultConfig.retryDelay,
      timeout: recommendedSettings.timeout || this.defaultConfig.timeout,
      precheckEnabled: true,
    };

    return config;
  }

  /**
   * 根据网络质量调整配置
   */
  private adjustConfigByNetworkQuality(
    config: IUploadParameters,
    networkQuality: INetworkQualityResult
  ): IUploadParameters {
    const quality = networkQuality.qualityLevel;
    const updatedConfig = { ...config };

    switch (quality) {
      case NetworkQualityLevel.EXCELLENT:
        updatedConfig.chunkSize = Math.min(
          5 * 1024 * 1024,
          config.chunkSize * 1.5
        );
        updatedConfig.concurrency = Math.min(
          this.configLimits.maxConcurrency,
          config.concurrency + 1
        );
        updatedConfig.timeout = Math.max(
          this.configLimits.minTimeout,
          config.timeout * 0.8
        );
        break;

      case NetworkQualityLevel.GOOD:
        // 保持当前配置或轻微调整
        updatedConfig.chunkSize = Math.min(
          4 * 1024 * 1024,
          config.chunkSize * 1.2
        );
        break;

      case NetworkQualityLevel.MODERATE:
        // 默认配置基本合适
        break;

      case NetworkQualityLevel.POOR:
        updatedConfig.chunkSize = Math.max(
          this.configLimits.minChunkSize,
          config.chunkSize * 0.7
        );
        updatedConfig.concurrency = Math.max(1, config.concurrency - 1);
        updatedConfig.timeout = Math.min(
          this.configLimits.maxTimeout,
          config.timeout * 1.5
        );
        updatedConfig.retryCount = Math.min(5, config.retryCount + 1);
        break;

      case NetworkQualityLevel.VERY_POOR:
        updatedConfig.chunkSize = Math.max(
          this.configLimits.minChunkSize,
          config.chunkSize * 0.5
        );
        updatedConfig.concurrency = 1;
        updatedConfig.timeout = Math.min(
          this.configLimits.maxTimeout,
          config.timeout * 2
        );
        updatedConfig.retryCount = Math.min(5, config.retryCount + 2);
        updatedConfig.retryDelay = Math.min(5000, config.retryDelay * 1.5);
        break;
    }

    return updatedConfig;
  }

  /**
   * 根据性能数据优化配置
   */
  private optimizeConfigByPerformance(
    config: IUploadParameters,
    networkQuality: NetworkQualityLevel,
    performanceData: {
      successRate?: number;
      avgSpeed?: number;
      timeToFirstByte?: number;
    }
  ): IUploadParameters {
    const updatedConfig = { ...config };

    // 成功率低于80%时，增加重试和超时
    if (
      performanceData.successRate !== undefined &&
      performanceData.successRate < 0.8
    ) {
      updatedConfig.retryCount = Math.min(
        this.configLimits.maxRetryCount,
        config.retryCount + 1
      );
      updatedConfig.timeout = Math.min(
        this.configLimits.maxTimeout,
        config.timeout * 1.2
      );
    }

    // 速度较慢时，尝试调整分片大小和并发
    if (performanceData.avgSpeed !== undefined) {
      // 低速网络尝试减小分片，提高并发
      if (performanceData.avgSpeed < 50 * 1024) {
        // 低于50KB/s
        updatedConfig.chunkSize = Math.max(
          this.configLimits.minChunkSize,
          config.chunkSize * 0.7
        );
        // 保持低并发
      }
      // 高速网络增加分片大小
      else if (performanceData.avgSpeed > 1024 * 1024) {
        // 大于1MB/s
        updatedConfig.chunkSize = Math.min(
          this.configLimits.maxChunkSize,
          config.chunkSize * 1.3
        );
      }
    }

    // 首字节时间过长，可能需要调整重试策略
    if (
      performanceData.timeToFirstByte !== undefined &&
      performanceData.timeToFirstByte > 2000
    ) {
      updatedConfig.retryDelay = Math.max(
        1000,
        Math.min(config.retryDelay * 0.8, 5000)
      );
    }

    return updatedConfig;
  }

  /**
   * 特定环境的配置微调
   */
  private applyEnvironmentSpecificTuning(
    config: IUploadParameters,
    environment: Environment
  ): IUploadParameters {
    const updatedConfig = { ...config };

    // 针对不同环境的调优
    switch (environment) {
      case Environment.WechatMP:
      case Environment.AlipayMP:
      case Environment.BytedanceMP:
      case Environment.BaiduMP:
        // 小程序环境通用调优
        updatedConfig.useWorker = false;
        updatedConfig.chunkSize = Math.min(
          updatedConfig.chunkSize,
          2 * 1024 * 1024
        );
        break;

      case Environment.Taro:
      case Environment.UniApp:
        // 跨平台框架调优
        updatedConfig.chunkSize = Math.min(
          updatedConfig.chunkSize,
          4 * 1024 * 1024
        );
        break;
    }

    return updatedConfig;
  }

  /**
   * 验证配置并规范化到有效范围
   */
  private validateConfig(config: IUploadParameters): IUploadParameters {
    return {
      ...config,
      chunkSize: Math.max(
        this.configLimits.minChunkSize,
        Math.min(this.configLimits.maxChunkSize, config.chunkSize)
      ),
      concurrency: Math.max(
        this.configLimits.minConcurrency,
        Math.min(this.configLimits.maxConcurrency, config.concurrency)
      ),
      retryCount: Math.max(
        this.configLimits.minRetryCount,
        Math.min(this.configLimits.maxRetryCount, config.retryCount)
      ),
      timeout: Math.max(
        this.configLimits.minTimeout,
        Math.min(this.configLimits.maxTimeout, config.timeout)
      ),
    };
  }

  /**
   * 生成环境指纹
   */
  private generateEnvironmentFingerprint(
    envDetection: any
  ): EnvironmentFingerprint {
    return {
      environmentType: envDetection.environmentType,
      browser: envDetection.browser?.name,
      browserVersion: envDetection.browser?.version,
      os: envDetection.osInfo?.name,
      deviceType: envDetection.deviceProfile?.deviceType,
      connectionType: envDetection.deviceProfile?.network?.connectionType,
      webViewInfo: envDetection.webViewInfo?.type,
      isLowEndDevice: envDetection.deviceProfile?.lowEndDevice,
    };
  }

  /**
   * 从缓存获取配置
   */
  private getConfigFromCache(
    fingerprint: EnvironmentFingerprint
  ): IUploadParameters | null {
    const key = this.fingerprintToString(fingerprint);
    return this.configCache.get(key) || null;
  }

  /**
   * 保存配置到缓存
   */
  private saveConfigToCache(
    fingerprint: EnvironmentFingerprint,
    config: IUploadParameters
  ): void {
    const key = this.fingerprintToString(fingerprint);
    this.configCache.set(key, config);
  }

  /**
   * 将环境指纹转换为字符串
   */
  private fingerprintToString(fingerprint: EnvironmentFingerprint): string {
    return JSON.stringify(fingerprint);
  }

  /**
   * 加载配置历史记录
   */
  private async loadConfigHistory(): Promise<void> {
    try {
      const historyStr = await StorageUtils.getItem(this.configHistoryKey);
      if (historyStr) {
        this.configAdjustmentHistory = JSON.parse(historyStr);
      }
    } catch (error) {
      this.logger.warn('加载配置历史失败', error);
    }
  }

  /**
   * 记录配置调整历史
   */
  private recordConfigAdjustment(
    config: IUploadParameters,
    networkQuality: NetworkQualityLevel,
    performanceData: {
      successRate?: number;
      avgSpeed?: number;
      timeToFirstByte?: number;
    }
  ): void {
    const history: ConfigAdjustmentHistory = {
      timestamp: Date.now(),
      networkQuality,
      parameters: { ...config },
      performance: {
        successRate: performanceData.successRate || 0,
        avgSpeed: performanceData.avgSpeed || 0,
        timeToFirstByte: performanceData.timeToFirstByte || 0,
      },
      environment: this.envDetectionSystem
        .detectEnvironment()
        .then(result => result.environment)
        .catch(() => 'unknown'),
    };

    this.configAdjustmentHistory.push(history);

    // 限制历史记录长度
    if (this.configAdjustmentHistory.length > 50) {
      this.configAdjustmentHistory = this.configAdjustmentHistory.slice(-50);
    }

    // 自动保存历史记录
    this.saveConfigs().catch(e => {
      this.logger.warn('自动保存配置历史失败', e);
    });
  }

  /**
   * 获取当前网络质量
   */
  private async getCurrentNetworkQuality(): Promise<INetworkQualityResult | null> {
    try {
      return await this.networkDetector.detectNetworkQuality();
    } catch (error) {
      this.logger.warn('获取网络质量失败', error);
      return null;
    }
  }

  /**
   * 获取当前配置
   */
  public getCurrentConfig(): IUploadParameters {
    return { ...this.currentConfig };
  }
}

export default AdaptiveConfigManager;
