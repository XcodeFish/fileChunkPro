/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EnvironmentDetectionSystem.ts
 * 全面的环境检测系统，检测当前运行环境的特性和能力
 */

import {
  Environment,
  BrowserFeature,
  MiniProgramFeature,
} from '../types/environment';
import { EnvironmentType, IAdapter } from '../adapters/interfaces';
import { Logger } from './Logger';
import { EnvironmentDetector } from './EnvironmentDetector';
import { EnvUtils } from './EnvUtils';
import WebViewDetector, {
  WebViewInfo,
  WebViewLimitation,
} from './WebViewDetector';
import DeviceCapabilityDetector, {
  DeviceProfile,
} from './DeviceCapabilityDetector';
import EnvironmentFeatureDatabase, {
  EnvironmentFeatureData,
} from './EnvironmentFeatureDatabase';

/**
 * 环境检测结果
 */
export interface EnvDetectionResult {
  environment: Environment;
  environmentType: EnvironmentType;
  runtime?: string;
  version?: string;
  osInfo?: {
    name: string;
    version?: string;
    platform?: string;
  };
  browser?: {
    name: string;
    version?: string;
    engine?: string;
    engineVersion?: string;
  };
  capabilities: Record<string, boolean>;
  features: Record<string, boolean>;
  limitations: Array<{
    type: string;
    description: string;
    value?: number | string;
    workaround?: string;
    criticalityLevel: 'low' | 'medium' | 'high';
  }>;
  deviceProfile?: DeviceProfile;
  webViewInfo?: WebViewInfo;
  recommendedSettings: Record<string, any>;
  environmentData?: EnvironmentFeatureData;
}

/**
 * 环境检测系统 - 增强版
 * 提供全面的环境检测、能力评估和最佳实践推荐
 */
export class EnvironmentDetectionSystem {
  private static instance: EnvironmentDetectionSystem;
  private logger: Logger;
  private envDetector: EnvironmentDetector;
  private webViewDetector: WebViewDetector;
  private deviceCapabilityDetector: DeviceCapabilityDetector;
  private environmentFeatureDatabase: EnvironmentFeatureDatabase;

  // 缓存检测结果
  private cachedDetectionResult: EnvDetectionResult | null = null;

  /**
   * 获取单例实例
   */
  public static getInstance(): EnvironmentDetectionSystem {
    if (!EnvironmentDetectionSystem.instance) {
      EnvironmentDetectionSystem.instance = new EnvironmentDetectionSystem();
    }
    return EnvironmentDetectionSystem.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this.logger = new Logger('EnvironmentDetectionSystem');
    this.envDetector = EnvironmentDetector.getInstance();
    this.webViewDetector = WebViewDetector.getInstance();
    this.deviceCapabilityDetector = DeviceCapabilityDetector.getInstance();
    this.environmentFeatureDatabase = EnvironmentFeatureDatabase.getInstance();

    this.logger.debug('环境检测系统初始化完成');
  }

  /**
   * 执行全面环境检测
   */
  public async detectEnvironment(): Promise<EnvDetectionResult> {
    // 使用缓存结果，避免重复检测
    if (this.cachedDetectionResult) {
      return this.cachedDetectionResult;
    }

    this.logger.debug('开始执行全面环境检测');

    // 基础环境检测
    const environment = this.envDetector.getEnvironment();
    const environmentType = this.envDetector.getEnvironmentType();

    // 初始化检测结果
    const result: EnvDetectionResult = {
      environment,
      environmentType,
      capabilities: {},
      features: {},
      limitations: [],
      recommendedSettings: {},
    };

    try {
      // 填充基础环境信息
      this.fillBasicEnvironmentInfo(result);

      // WebView环境检测
      this.detectWebViewEnvironment(result);

      // 设备能力检测
      await this.detectDeviceCapabilities(result);

      // 从环境特性数据库获取特性和限制信息
      this.applyEnvironmentFeatureData(result);

      // 生成综合推荐设置
      this.generateRecommendedSettings(result);

      this.logger.debug('环境检测完成', {
        env: environment,
        type: environmentType,
      });
    } catch (error) {
      this.logger.error('环境检测过程发生错误', error);
    }

    // 缓存检测结果
    this.cachedDetectionResult = result;
    return result;
  }

  /**
   * 填充基础环境信息
   */
  private fillBasicEnvironmentInfo(result: EnvDetectionResult): void {
    // 运行时信息
    result.runtime = this.envDetector.getRuntime();
    result.version = this.envDetector.getRuntimeVersion();

    // 操作系统信息
    result.osInfo = {
      name: EnvUtils.getOSName(),
      version: EnvUtils.getOSVersion(),
      platform: EnvUtils.getPlatform(),
    };

    // 浏览器信息(如果在浏览器环境中)
    if (result.environment === Environment.Browser) {
      result.browser = {
        name: EnvUtils.getBrowserName(),
        version: EnvUtils.getBrowserVersion(),
        engine: EnvUtils.getBrowserEngine(),
        engineVersion: EnvUtils.getBrowserEngineVersion(),
      };
    }

    // 基础能力检测
    result.capabilities = {
      localStorage: EnvUtils.hasLocalStorage(),
      sessionStorage: EnvUtils.hasSessionStorage(),
      indexedDB: EnvUtils.hasIndexedDB(),
      webWorker: EnvUtils.hasWebWorker(),
      serviceWorker: EnvUtils.hasServiceWorker(),
      webSocket: EnvUtils.hasWebSocket(),
      fetch: EnvUtils.hasFetch(),
      fileSystem: EnvUtils.hasFileSystem(),
      camera: EnvUtils.hasCamera(),
      geolocation: EnvUtils.hasGeolocation(),
      pushNotification: EnvUtils.hasPushNotification(),
    };

    // 特性检测
    this.detectFeatures(result);
  }

  /**
   * 检测特定环境的特性
   */
  private detectFeatures(result: EnvDetectionResult): void {
    // 浏览器环境特性检测
    if (result.environment === Environment.Browser) {
      result.features = {
        [BrowserFeature.FILE_API]: EnvUtils.hasFeature(BrowserFeature.FILE_API),
        [BrowserFeature.BLOB]: EnvUtils.hasFeature(BrowserFeature.BLOB),
        [BrowserFeature.TYPED_ARRAY]: EnvUtils.hasFeature(
          BrowserFeature.TYPED_ARRAY
        ),
        [BrowserFeature.PROMISE]: EnvUtils.hasFeature(BrowserFeature.PROMISE),
        [BrowserFeature.WEB_WORKER]: EnvUtils.hasFeature(
          BrowserFeature.WEB_WORKER
        ),
        [BrowserFeature.SERVICE_WORKER]: EnvUtils.hasFeature(
          BrowserFeature.SERVICE_WORKER
        ),
        [BrowserFeature.INDEXED_DB]: EnvUtils.hasFeature(
          BrowserFeature.INDEXED_DB
        ),
        [BrowserFeature.WEB_CRYPTO]: EnvUtils.hasFeature(
          BrowserFeature.WEB_CRYPTO
        ),
        [BrowserFeature.WEB_SOCKET]: EnvUtils.hasFeature(
          BrowserFeature.WEB_SOCKET
        ),
        [BrowserFeature.FETCH_API]: EnvUtils.hasFeature(
          BrowserFeature.FETCH_API
        ),
        [BrowserFeature.STREAMS_API]: EnvUtils.hasFeature(
          BrowserFeature.STREAMS_API
        ),
        [BrowserFeature.SHARED_ARRAY_BUFFER]: EnvUtils.hasFeature(
          BrowserFeature.SHARED_ARRAY_BUFFER
        ),
      };
    }
    // 小程序环境特性检测
    else if (this.isMiniProgramEnvironment(result.environment)) {
      result.features = {
        [MiniProgramFeature.UPLOAD_FILE]: this.envDetector.supportsFeature(
          MiniProgramFeature.UPLOAD_FILE
        ),
        [MiniProgramFeature.DOWNLOAD_FILE]: this.envDetector.supportsFeature(
          MiniProgramFeature.DOWNLOAD_FILE
        ),
        [MiniProgramFeature.SOCKET]: this.envDetector.supportsFeature(
          MiniProgramFeature.SOCKET
        ),
        [MiniProgramFeature.FILE_SYSTEM]: this.envDetector.supportsFeature(
          MiniProgramFeature.FILE_SYSTEM
        ),
        [MiniProgramFeature.STORAGE]: this.envDetector.supportsFeature(
          MiniProgramFeature.STORAGE
        ),
        [MiniProgramFeature.WORKER]: this.envDetector.supportsFeature(
          MiniProgramFeature.WORKER
        ),
      };
    }
  }

  /**
   * 检测WebView环境
   */
  private detectWebViewEnvironment(result: EnvDetectionResult): void {
    const webViewInfo = this.webViewDetector.detectWebView();

    if (webViewInfo.isWebView) {
      result.webViewInfo = webViewInfo;

      // 添加WebView特有限制
      webViewInfo.limitations.forEach(limitation => {
        this.addLimitation(
          result,
          String(limitation),
          this.getWebViewLimitationDescription(limitation)
        );
      });

      // 应用WebView推荐设置
      const webViewSettings = this.webViewDetector.getRecommendedConfig();
      Object.assign(result.recommendedSettings, webViewSettings);
    }
  }

  /**
   * 获取WebView限制的描述
   */
  private getWebViewLimitationDescription(
    limitation: WebViewLimitation
  ): string {
    const descriptions: Record<WebViewLimitation, string> = {
      [WebViewLimitation.FILE_SIZE_LIMIT]: 'WebView环境对文件大小有限制',
      [WebViewLimitation.NO_SERVICE_WORKER]: '不支持Service Worker',
      [WebViewLimitation.NO_INDEXEDDB]: '不支持或限制IndexedDB',
      [WebViewLimitation.LIMITED_STORAGE]: '存储空间严格限制',
      [WebViewLimitation.FILE_UPLOAD_ISSUES]: '文件上传功能受限',
      [WebViewLimitation.NO_BACKGROUND_PROCESSING]: '不支持后台处理',
      [WebViewLimitation.NO_SHARED_WORKER]: '不支持Shared Worker',
      [WebViewLimitation.COOKIE_LIMITATIONS]: 'Cookie使用受限',
      [WebViewLimitation.CACHING_ISSUES]: '缓存机制受限',
    };

    return descriptions[limitation] || '未知WebView限制';
  }

  /**
   * 检测设备能力
   */
  private async detectDeviceCapabilities(
    result: EnvDetectionResult
  ): Promise<void> {
    try {
      // 获取设备能力配置
      const deviceProfile =
        await this.deviceCapabilityDetector.detectDeviceProfile();
      result.deviceProfile = deviceProfile;

      // 添加设备相关限制
      if (deviceProfile.lowEndDevice) {
        this.addLimitation(
          result,
          'low_end_device',
          '低端设备，性能和资源受限',
          'high'
        );
      }

      if (deviceProfile.memory.isLowMemoryDevice) {
        this.addLimitation(
          result,
          'low_memory_device',
          '设备内存不足，限制大文件处理',
          'high'
        );
      }

      if (deviceProfile.processor.isLowPowerDevice) {
        this.addLimitation(
          result,
          'low_power_device',
          '低性能处理器，限制计算密集操作',
          'medium'
        );
      }

      // 应用设备能力推荐设置
      Object.assign(
        result.recommendedSettings,
        deviceProfile.recommendedSettings
      );
    } catch (error) {
      this.logger.warn('设备能力检测失败', error);
    }
  }

  /**
   * 应用环境特性数据库信息
   */
  private applyEnvironmentFeatureData(result: EnvDetectionResult): void {
    try {
      // 获取环境数据
      let envData: EnvironmentFeatureData | null = null;

      // 尝试通过浏览器名称获取
      if (result.browser?.name) {
        envData = this.environmentFeatureDatabase.getEnvironmentData(
          result.browser.name.toLowerCase()
        );
      }

      // 如果未找到，尝试通过环境类型获取
      if (!envData) {
        envData = this.environmentFeatureDatabase.getEnvironmentData(
          result.environment
        );
      }

      // 如果是WebView，尝试获取WebView特定数据
      if (result.webViewInfo?.isWebView) {
        const type = result.webViewInfo.type.toString().toLowerCase();
        const webViewEnvData =
          this.environmentFeatureDatabase.getEnvironmentData(type);
        if (webViewEnvData) {
          envData = webViewEnvData;
        }
      }

      if (envData) {
        result.environmentData = envData;

        // 添加数据库中的限制信息
        envData.limitations.forEach(limitation => {
          this.addLimitation(
            result,
            limitation.type,
            limitation.description,
            limitation.criticalityLevel,
            limitation.value,
            limitation.workaround
          );
        });

        // 应用数据库中的推荐设置
        const dbRecommendedSettings =
          this.environmentFeatureDatabase.getOptimizedConfig(envData.type);
        Object.assign(result.recommendedSettings, dbRecommendedSettings);
      }
    } catch (error) {
      this.logger.warn('应用环境特性数据失败', error);
    }
  }

  /**
   * 生成综合推荐设置
   */
  private generateRecommendedSettings(result: EnvDetectionResult): void {
    // 基础设置（如果尚未设置）
    if (!result.recommendedSettings.chunkSize) {
      result.recommendedSettings.chunkSize = 2 * 1024 * 1024; // 默认2MB分片
    }

    if (!result.recommendedSettings.maxConcurrentTasks) {
      result.recommendedSettings.maxConcurrentTasks = 3; // 默认最大3个并发任务
    }

    if (result.recommendedSettings.useWorker === undefined) {
      // 默认使用Worker，除非检测到明确不应该使用
      result.recommendedSettings.useWorker =
        result.capabilities.webWorker !== false;
    }

    if (result.recommendedSettings.useServiceWorker === undefined) {
      // 默认不使用ServiceWorker，除非检测到明确支持并且不在WebView中
      const isWebView = result.webViewInfo?.isWebView === true;
      result.recommendedSettings.useServiceWorker =
        result.capabilities.serviceWorker === true && !isWebView;
    }

    // 根据检测到的限制进行设置调整
    this.adjustSettingsBasedOnLimitations(result);
  }

  /**
   * 根据限制调整设置
   */
  private adjustSettingsBasedOnLimitations(result: EnvDetectionResult): void {
    // 遍历所有限制并相应调整设置
    for (const limitation of result.limitations) {
      switch (limitation.type) {
        case 'low_memory_device':
        case 'LIMITED_STORAGE':
          // 低内存设备使用较小的分片和较少的并发
          result.recommendedSettings.chunkSize = Math.min(
            result.recommendedSettings.chunkSize,
            1 * 1024 * 1024
          );
          result.recommendedSettings.maxConcurrentTasks = Math.min(
            result.recommendedSettings.maxConcurrentTasks,
            2
          );
          result.recommendedSettings.useMemoryOptimization = true;
          break;

        case 'low_power_device':
          // 低性能设备减少并发和禁用部分功能
          result.recommendedSettings.maxConcurrentTasks = Math.min(
            result.recommendedSettings.maxConcurrentTasks,
            2
          );
          result.recommendedSettings.useHashVerification = false; // 禁用哈希验证以节省CPU
          break;

        case 'max_file_size':
          // 有文件大小限制时，设置最大文件大小
          if (typeof limitation.value === 'number') {
            result.recommendedSettings.maxFileSize = limitation.value;
          }
          break;

        case 'max_connections':
          // 有连接数限制时，调整并发数
          if (typeof limitation.value === 'number') {
            result.recommendedSettings.maxConcurrentTasks = Math.min(
              result.recommendedSettings.maxConcurrentTasks,
              limitation.value - 1 // 留出一个连接给其他请求
            );
          }
          break;
      }
    }

    // 确保设置合理，避免极端值
    result.recommendedSettings.maxConcurrentTasks = Math.max(
      1,
      Math.min(result.recommendedSettings.maxConcurrentTasks, 10)
    );
    result.recommendedSettings.chunkSize = Math.max(
      256 * 1024,
      Math.min(result.recommendedSettings.chunkSize, 10 * 1024 * 1024)
    );
  }

  /**
   * 添加环境限制
   */
  private addLimitation(
    result: EnvDetectionResult,
    type: string,
    description: string,
    criticalityLevel: 'low' | 'medium' | 'high' = 'medium',
    value?: number | string,
    workaround?: string
  ): void {
    // 避免重复添加同类型限制
    const existing = result.limitations.find(limit => limit.type === type);
    if (!existing) {
      result.limitations.push({
        type,
        description,
        criticalityLevel,
        value,
        workaround,
      });
    }
  }

  /**
   * 检查是否为小程序环境
   */
  private isMiniProgramEnvironment(env: Environment): boolean {
    return [
      Environment.WechatMP,
      Environment.AlipayMP,
      Environment.BytedanceMP,
      Environment.BaiduMP,
      Environment.UniApp,
      Environment.Taro,
    ].includes(env);
  }

  /**
   * 获取指定环境下的最佳适配器
   * @param adapters 可选的适配器列表
   * @returns 最佳适配器
   */
  public async getBestAdapter<T extends IAdapter>(
    adapters: T[]
  ): Promise<T | null> {
    const envResult = await this.detectEnvironment();

    // 首先按照直接匹配环境来找
    for (const adapter of adapters) {
      if (adapter.supportedEnvironments.includes(envResult.environment)) {
        this.logger.debug('找到直接匹配的适配器', {
          adapter: adapter.name,
          env: envResult.environment,
        });
        return adapter;
      }
    }

    // 如果没有直接匹配，尝试通过环境类型匹配
    for (const adapter of adapters) {
      if (
        adapter.supportedEnvironmentTypes.includes(envResult.environmentType)
      ) {
        this.logger.debug('找到匹配环境类型的适配器', {
          adapter: adapter.name,
          envType: envResult.environmentType,
        });
        return adapter;
      }
    }

    // 如果还没有匹配，尝试通过特性检测找到兼容的适配器
    const compatibleAdapters = adapters.filter(adapter => {
      // 检查所有必需特性是否支持
      return adapter.requiredFeatures.every(
        feature =>
          envResult.features[feature] === true ||
          envResult.capabilities[feature] === true
      );
    });

    if (compatibleAdapters.length > 0) {
      // 返回优先级最高的兼容适配器
      compatibleAdapters.sort((a, b) => b.priority - a.priority);
      this.logger.debug('找到兼容的适配器', {
        adapter: compatibleAdapters[0].name,
      });
      return compatibleAdapters[0];
    }

    this.logger.warn('未找到合适的适配器', {
      env: envResult.environment,
      envType: envResult.environmentType,
    });
    return null;
  }

  /**
   * 检查当前环境是否满足指定要求
   * @param requirements 环境要求
   * @returns 是否满足要求
   */
  public async checkEnvironmentRequirements(requirements: {
    environment?: Environment | Environment[];
    environmentType?: EnvironmentType | EnvironmentType[];
    features?: string[];
    capabilities?: string[];
    minMemory?: number; // MB
    minCpu?: number; // 核心数
  }): Promise<{
    satisfied: boolean;
    missing: string[];
    recommendations: string[];
  }> {
    const envResult = await this.detectEnvironment();
    const missing: string[] = [];
    const recommendations: string[] = [];

    // 检查环境类型
    if (requirements.environment) {
      const envs = Array.isArray(requirements.environment)
        ? requirements.environment
        : [requirements.environment];
      if (!envs.includes(envResult.environment)) {
        missing.push(
          `环境类型: 需要 ${envs.join(' 或 ')}, 当前是 ${envResult.environment}`
        );
      }
    }

    // 检查环境子类型
    if (requirements.environmentType) {
      const envTypes = Array.isArray(requirements.environmentType)
        ? requirements.environmentType
        : [requirements.environmentType];
      if (!envTypes.includes(envResult.environmentType)) {
        missing.push(
          `环境子类型: 需要 ${envTypes.join(' 或 ')}, 当前是 ${envResult.environmentType}`
        );
      }
    }

    // 检查特性
    if (requirements.features && requirements.features.length > 0) {
      const missingFeatures = requirements.features.filter(
        feature => !envResult.features[feature]
      );
      if (missingFeatures.length > 0) {
        missing.push(`缺少必需特性: ${missingFeatures.join(', ')}`);

        // 添加特性缺失的建议
        missingFeatures.forEach(feature => {
          const recommendation = this.getFeatureMissingRecommendation(feature);
          if (recommendation) {
            recommendations.push(recommendation);
          }
        });
      }
    }

    // 检查能力
    if (requirements.capabilities && requirements.capabilities.length > 0) {
      const missingCapabilities = requirements.capabilities.filter(
        capability => !envResult.capabilities[capability]
      );
      if (missingCapabilities.length > 0) {
        missing.push(`缺少必需能力: ${missingCapabilities.join(', ')}`);
      }
    }

    // 检查内存要求
    if (
      requirements.minMemory &&
      envResult.deviceProfile?.memory.deviceMemory
    ) {
      const memoryGB = envResult.deviceProfile.memory.deviceMemory;
      const memoryMB = memoryGB * 1024;
      if (memoryMB < requirements.minMemory) {
        missing.push(
          `内存不足: 需要 ${requirements.minMemory}MB, 当前约 ${memoryMB.toFixed(0)}MB`
        );
        recommendations.push(
          '在低内存设备上使用更小的分片大小和更少的并发任务'
        );
      }
    }

    // 检查CPU要求
    if (
      requirements.minCpu &&
      envResult.deviceProfile?.processor.hardwareConcurrency
    ) {
      if (
        envResult.deviceProfile.processor.hardwareConcurrency <
        requirements.minCpu
      ) {
        missing.push(
          `CPU核心不足: 需要 ${requirements.minCpu}核, 当前 ${envResult.deviceProfile.processor.hardwareConcurrency}核`
        );
        recommendations.push(
          '在低性能设备上减少对计算密集型功能的使用，如实时加密和哈希计算'
        );
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
      recommendations: [...new Set(recommendations)], // 去重
    };
  }

  /**
   * 获取特性缺失的建议
   */
  private getFeatureMissingRecommendation(feature: string): string | null {
    const recommendations: Record<string, string> = {
      [BrowserFeature.WEB_WORKER]: '考虑提供非Worker处理方案作为降级策略',
      [BrowserFeature.SERVICE_WORKER]:
        '考虑使用IndexedDB或localStorage作为替代方案处理缓存',
      [BrowserFeature.INDEXED_DB]: '使用localStorage作为存储降级方案',
      [BrowserFeature.STREAMS_API]: '考虑使用传统的分块上传方法作为替代',
      [BrowserFeature.SHARED_ARRAY_BUFFER]: '使用标准Blob或ArrayBuffer作为替代',
      [BrowserFeature.WEB_CRYPTO]: '考虑使用JS实现的加密库作为降级方案',
      [MiniProgramFeature.WORKER]: '在主线程中处理计算任务，但需注意避免UI阻塞',
    };

    return recommendations[feature] || null;
  }

  /**
   * 重置环境检测缓存
   * 当环境可能变化时调用（如切换到不同域名或从App内WebView跳转到系统浏览器）
   */
  public resetCache(): void {
    this.cachedDetectionResult = null;
    this.webViewDetector.resetCache(); // 重置WebView检测缓存
    this.deviceCapabilityDetector.resetCache(); // 重置设备能力检测缓存
    this.logger.debug('环境检测缓存已重置');
  }
}

export default EnvironmentDetectionSystem;
