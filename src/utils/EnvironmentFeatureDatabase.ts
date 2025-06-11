/**
 * EnvironmentFeatureDatabase - 环境特性数据库
 * 提供详细的各环境特性、限制与最佳实践数据
 */

import {
  Environment,
  BrowserFeature,
  MiniProgramFeature,
} from '../types/environment';
import { EnvironmentType } from '../adapters/interfaces';
import { Logger } from './Logger';

/**
 * 环境特性数据结构
 */
export interface EnvironmentFeatureData {
  // 环境基本信息
  type: Environment | EnvironmentType;
  name: string;
  description: string;

  // 特性支持
  features: Record<string, boolean | FeatureSupportInfo>;

  // 限制信息
  limitations: Array<{
    type: string;
    description: string;
    value?: number | string;
    workaround?: string;
    criticalityLevel: 'low' | 'medium' | 'high';
  }>;

  // 最佳实践
  bestPractices: Array<{
    name: string;
    description: string;
    recommendedSetting?: Record<string, any>;
    conflictsWith?: string[];
    requiredFeatures?: string[];
  }>;

  // 版本信息
  versions?: Record<string, VersionFeatureData>;

  // 兼容性信息
  compatibility?: {
    fullySupportedSince?: string;
    partialSupportSince?: string;
    deprecatedSince?: string;
    notes?: string;
  };
}

/**
 * 特性支持信息
 */
export interface FeatureSupportInfo {
  supported: boolean;
  since?: string; // 从哪个版本开始支持
  until?: string; // 到哪个版本为止支持
  partial?: boolean; // 是否部分支持
  notes?: string; // 备注信息
  polyfill?: string; // 可用的polyfill
}

/**
 * 版本特定特性数据
 */
export interface VersionFeatureData {
  versionNumber: string;
  addedFeatures: string[];
  removedFeatures: string[];
  modifiedFeatures: Record<string, FeatureSupportInfo>;
  notes: string;
}

/**
 * 环境特性数据库
 */
export class EnvironmentFeatureDatabase {
  private static instance: EnvironmentFeatureDatabase;
  private logger: Logger;
  private featuresData: Map<string, EnvironmentFeatureData>;
  private userAgentPatterns: Map<RegExp, string>;

  /**
   * 获取EnvironmentFeatureDatabase单例
   */
  public static getInstance(): EnvironmentFeatureDatabase {
    if (!EnvironmentFeatureDatabase.instance) {
      EnvironmentFeatureDatabase.instance = new EnvironmentFeatureDatabase();
    }
    return EnvironmentFeatureDatabase.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this.logger = new Logger('EnvironmentFeatureDatabase');
    this.featuresData = new Map();
    this.userAgentPatterns = new Map();

    this.initializeDatabase();
  }

  /**
   * 初始化环境特性数据库
   */
  private initializeDatabase(): void {
    // 添加浏览器环境数据
    this.addBrowserEnvironmentsData();

    // 添加小程序环境数据
    this.addMiniProgramEnvironmentsData();

    // 添加React Native环境数据
    this.addReactNativeEnvironmentData();

    // 添加Node.js环境数据
    this.addNodeEnvironmentData();

    // 添加WebView环境数据
    this.addWebViewEnvironmentsData();

    // 初始化用户代理匹配模式
    this.initializeUserAgentPatterns();
  }

  /**
   * 添加浏览器环境数据
   */
  private addBrowserEnvironmentsData(): void {
    // Chrome浏览器
    this.addEnvironmentData({
      type: Environment.Browser,
      name: 'Chrome',
      description: 'Google Chrome浏览器',
      features: {
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: {
          supported: true,
          since: '40.0',
          notes: '需要HTTPS环境',
        },
        [BrowserFeature.INDEXED_DB]: true,
        [BrowserFeature.SHARED_ARRAY_BUFFER]: {
          supported: true,
          since: '60.0',
          notes: '需要跨源隔离(COOP/COEP)',
        },
        [BrowserFeature.STREAMS_API]: {
          supported: true,
          since: '52.0',
        },
        [BrowserFeature.WEB_CRYPTO]: true,
        [BrowserFeature.FILE_API]: true,
      },
      limitations: [
        {
          type: 'max_connections',
          description: '最大并发连接数',
          value: 6,
          criticalityLevel: 'medium',
        },
        {
          type: 'indexeddb_quota',
          description: 'IndexedDB存储限制',
          value: '无固定限制，通常为可用磁盘空间的50%',
          criticalityLevel: 'medium',
        },
      ],
      bestPractices: [
        {
          name: 'use_streams',
          description: '使用Streams API处理大文件，减少内存使用',
          requiredFeatures: [BrowserFeature.STREAMS_API],
        },
        {
          name: 'use_workers',
          description: '使用Worker线程进行计算密集型任务，避免阻塞主线程',
          requiredFeatures: [BrowserFeature.WEB_WORKER],
        },
      ],
    });

    // Safari浏览器
    this.addEnvironmentData({
      type: Environment.Browser,
      name: 'Safari',
      description: 'Apple Safari浏览器',
      features: {
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: {
          supported: true,
          since: '11.1',
          notes: '需要HTTPS环境',
        },
        [BrowserFeature.INDEXED_DB]: {
          supported: true,
          since: '10.0',
          partial: true,
          notes: '早期版本实现不完整，建议Safari 11+使用',
        },
        [BrowserFeature.SHARED_ARRAY_BUFFER]: {
          supported: true,
          since: '15.2',
          notes: '需要跨源隔离(COOP/COEP)和HTTPS环境',
        },
        [BrowserFeature.STREAMS_API]: {
          supported: true,
          since: '10.1',
          partial: true,
          notes: '部分API实现不完整',
        },
        [BrowserFeature.WEB_CRYPTO]: true,
        [BrowserFeature.FILE_API]: true,
      },
      limitations: [
        {
          type: 'max_connections',
          description: '最大并发连接数',
          value: 6,
          criticalityLevel: 'medium',
        },
        {
          type: 'indexeddb_quota',
          description: 'IndexedDB存储限制',
          value: '限制较严格，通常为1GB',
          criticalityLevel: 'high',
        },
        {
          type: 'ios_file_upload',
          description: 'iOS Safari文件上传限制',
          value: '不支持多文件上传，部分iOS版本存在文件选择限制',
          criticalityLevel: 'high',
          workaround: '使用单文件上传，提供清晰的用户引导',
        },
      ],
      bestPractices: [
        {
          name: 'avoid_workers_ios',
          description: '在iOS Safari中避免过度使用Web Worker，可能导致内存问题',
          requiredFeatures: [BrowserFeature.WEB_WORKER],
        },
        {
          name: 'test_indexeddb',
          description:
            '在使用IndexedDB前进行功能检测，并提供LocalStorage降级方案',
          requiredFeatures: [BrowserFeature.INDEXED_DB],
        },
      ],
    });

    // Firefox浏览器
    this.addEnvironmentData({
      type: Environment.Browser,
      name: 'Firefox',
      description: 'Mozilla Firefox浏览器',
      features: {
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: {
          supported: true,
          since: '44.0',
          notes: '需要HTTPS环境',
        },
        [BrowserFeature.INDEXED_DB]: true,
        [BrowserFeature.SHARED_ARRAY_BUFFER]: {
          supported: true,
          since: '79.0',
          notes: '需要跨源隔离(COOP/COEP)',
        },
        [BrowserFeature.STREAMS_API]: {
          supported: true,
          since: '65.0',
        },
        [BrowserFeature.WEB_CRYPTO]: true,
        [BrowserFeature.FILE_API]: true,
      },
      limitations: [
        {
          type: 'max_connections',
          description: '最大并发连接数',
          value: 6,
          criticalityLevel: 'medium',
        },
      ],
      bestPractices: [
        {
          name: 'use_workers',
          description: '使用Worker线程进行计算密集型任务',
          requiredFeatures: [BrowserFeature.WEB_WORKER],
        },
      ],
    });

    // Edge浏览器(新版基于Chromium)
    this.addEnvironmentData({
      type: Environment.Browser,
      name: 'Edge',
      description: 'Microsoft Edge浏览器(Chromium版)',
      features: {
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: {
          supported: true,
          since: '79.0',
          notes: '需要HTTPS环境',
        },
        [BrowserFeature.INDEXED_DB]: true,
        [BrowserFeature.SHARED_ARRAY_BUFFER]: {
          supported: true,
          since: '79.0',
          notes: '需要跨源隔离(COOP/COEP)',
        },
        [BrowserFeature.STREAMS_API]: {
          supported: true,
          since: '79.0',
        },
        [BrowserFeature.WEB_CRYPTO]: true,
        [BrowserFeature.FILE_API]: true,
      },
      limitations: [
        {
          type: 'max_connections',
          description: '最大并发连接数',
          value: 6,
          criticalityLevel: 'medium',
        },
      ],
      bestPractices: [
        {
          name: 'use_streams',
          description: '使用Streams API处理大文件',
          requiredFeatures: [BrowserFeature.STREAMS_API],
        },
      ],
    });

    // IE浏览器
    this.addEnvironmentData({
      type: Environment.Browser,
      name: 'IE',
      description: 'Internet Explorer浏览器',
      features: {
        [BrowserFeature.WEB_WORKER]: {
          supported: true,
          since: '10',
          partial: true,
          notes: '支持有限，存在多种兼容性问题',
        },
        [BrowserFeature.SERVICE_WORKER]: false,
        [BrowserFeature.INDEXED_DB]: {
          supported: true,
          since: '10',
          partial: true,
          notes: '实现不完整，存在严重bug',
        },
        [BrowserFeature.SHARED_ARRAY_BUFFER]: false,
        [BrowserFeature.STREAMS_API]: false,
        [BrowserFeature.WEB_CRYPTO]: {
          supported: true,
          since: '11',
          partial: true,
          notes: '仅支持部分算法，接口与标准不同',
        },
        [BrowserFeature.FILE_API]: {
          supported: true,
          partial: true,
          notes: '部分功能不可用',
        },
      },
      limitations: [
        {
          type: 'max_connections',
          description: '最大并发连接数',
          value: 6,
          criticalityLevel: 'medium',
        },
        {
          type: 'file_upload',
          description: '文件上传限制',
          value: '不支持多文件选择，不支持拖放上传',
          criticalityLevel: 'high',
        },
        {
          type: 'legacy_browser',
          description: '已过时的浏览器',
          value: 'Microsoft已停止支持',
          criticalityLevel: 'high',
          workaround: '建议用户更新到现代浏览器',
        },
      ],
      bestPractices: [
        {
          name: 'avoid_modern_features',
          description: '避免使用现代特性，提供基本功能降级方案',
        },
        {
          name: 'simple_chunks',
          description: '使用简单的分片策略，避免复杂的流处理',
        },
      ],
    });
  }

  /**
   * 添加小程序环境数据
   */
  private addMiniProgramEnvironmentsData(): void {
    // 微信小程序
    this.addEnvironmentData({
      type: Environment.WechatMP,
      name: 'WechatMP',
      description: '微信小程序环境',
      features: {
        [MiniProgramFeature.FILE_SYSTEM]: true,
        [MiniProgramFeature.UPLOAD_FILE]: true,
        [MiniProgramFeature.DOWNLOAD_FILE]: true,
        [MiniProgramFeature.SOCKET]: true,
        [MiniProgramFeature.WORKER]: {
          supported: true,
          since: '2.8.0',
          notes: '仅支持一个Worker实例',
        },
        storage: true,
        network_request: true,
        crypto: true,
        background_fetch: false,
      },
      limitations: [
        {
          type: 'max_file_size',
          description: '上传文件大小限制',
          value: 100 * 1024 * 1024, // 100MB
          criticalityLevel: 'high',
          workaround: '使用分片上传',
        },
        {
          type: 'max_connections',
          description: '最大并发请求数',
          value: 10,
          criticalityLevel: 'medium',
        },
        {
          type: 'max_storage',
          description: '本地存储限制',
          value: 10 * 1024 * 1024, // 10MB
          criticalityLevel: 'medium',
        },
        {
          type: 'background_execution',
          description: '后台执行限制',
          value: '小程序切入后台后可能被暂停',
          criticalityLevel: 'high',
          workaround: '使用断点续传，保存上传状态',
        },
      ],
      bestPractices: [
        {
          name: 'use_upload_file',
          description: '使用wx.uploadFile进行上传，比wx.request更高效',
        },
        {
          name: 'session_token',
          description: '使用会话保持，避免频繁重新鉴权',
        },
        {
          name: 'local_storage_state',
          description: '使用本地存储保存上传状态，支持断点续传',
          recommendedSetting: {
            stateTracking: true,
            stateStorage: 'local',
          },
        },
      ],
    });

    // 支付宝小程序
    this.addEnvironmentData({
      type: Environment.AlipayMP,
      name: 'AlipayMP',
      description: '支付宝小程序环境',
      features: {
        [MiniProgramFeature.FILE_SYSTEM]: true,
        [MiniProgramFeature.UPLOAD_FILE]: true,
        [MiniProgramFeature.DOWNLOAD_FILE]: true,
        [MiniProgramFeature.SOCKET]: true,
        [MiniProgramFeature.WORKER]: false,
        storage: true,
        network_request: true,
        crypto: true,
        background_fetch: false,
      },
      limitations: [
        {
          type: 'max_file_size',
          description: '上传文件大小限制',
          value: 50 * 1024 * 1024, // 50MB
          criticalityLevel: 'high',
          workaround: '使用分片上传',
        },
        {
          type: 'max_connections',
          description: '最大并发请求数',
          value: 5,
          criticalityLevel: 'medium',
        },
      ],
      bestPractices: [
        {
          name: 'use_upload_file',
          description: '使用my.uploadFile进行上传',
        },
        {
          name: 'smaller_chunks',
          description: '使用较小的分片大小(1MB以下)',
          recommendedSetting: {
            chunkSize: 1 * 1024 * 1024,
          },
        },
      ],
    });

    // 字节跳动小程序
    this.addEnvironmentData({
      type: Environment.BytedanceMP,
      name: 'BytedanceMP',
      description: '字节跳动小程序环境(抖音/今日头条等)',
      features: {
        [MiniProgramFeature.FILE_SYSTEM]: true,
        [MiniProgramFeature.UPLOAD_FILE]: true,
        [MiniProgramFeature.DOWNLOAD_FILE]: true,
        [MiniProgramFeature.SOCKET]: true,
        [MiniProgramFeature.WORKER]: false,
        storage: true,
        network_request: true,
        crypto: {
          supported: true,
          partial: true,
          notes: '仅支持部分加密算法',
        },
      },
      limitations: [
        {
          type: 'max_file_size',
          description: '上传文件大小限制',
          value: 50 * 1024 * 1024, // 50MB
          criticalityLevel: 'high',
        },
      ],
      bestPractices: [
        {
          name: 'use_upload_file',
          description: '使用tt.uploadFile进行上传',
        },
      ],
    });
  }

  /**
   * 添加React Native环境数据
   */
  private addReactNativeEnvironmentData(): void {
    this.addEnvironmentData({
      type: Environment.ReactNative,
      name: 'ReactNative',
      description: 'React Native环境',
      features: {
        fetch: true,
        xmlHttpRequest: true,
        fileSystem: true,
        webSocket: true,
        crypto: true,
        backgroundTask: {
          supported: true,
          partial: true,
          notes: '需要平台特定实现',
        },
      },
      limitations: [
        {
          type: 'platform_differences',
          description: 'iOS和Android平台差异',
          value: '部分API在不同平台有不同行为',
          criticalityLevel: 'medium',
          workaround: '使用平台特定代码或兼容库',
        },
      ],
      bestPractices: [
        {
          name: 'use_fetch_blob',
          description: '使用react-native-fetch-blob处理文件上传',
          recommendedSetting: {
            useNativeImplementation: true,
          },
        },
        {
          name: 'background_upload',
          description: '对于大文件，使用后台上传服务',
          recommendedSetting: {
            useBackgroundUpload: true,
          },
        },
      ],
    });
  }

  /**
   * 添加Node.js环境数据
   */
  private addNodeEnvironmentData(): void {
    this.addEnvironmentData({
      type: Environment.NodeJS,
      name: 'NodeJS',
      description: 'Node.js服务器环境',
      features: {
        fs: true,
        http: true,
        https: true,
        streams: true,
        worker_threads: {
          supported: true,
          since: '10.5.0',
        },
        crypto: true,
      },
      limitations: [
        {
          type: 'memory_limit',
          description: '默认内存限制',
          value: '默认为1.4GB(64位)，可通过--max-old-space-size调整',
          criticalityLevel: 'medium',
          workaround: '使用流式处理，避免一次加载大文件到内存',
        },
      ],
      bestPractices: [
        {
          name: 'use_streams',
          description: '使用流处理大文件',
          recommendedSetting: {
            highWaterMark: 64 * 1024,
          },
        },
        {
          name: 'worker_threads',
          description: '使用worker_threads处理CPU密集型任务',
          recommendedSetting: {
            threadsCount: 'auto',
          },
        },
      ],
    });
  }

  /**
   * 添加WebView环境数据
   */
  private addWebViewEnvironmentsData(): void {
    // iOS WKWebView
    this.addEnvironmentData({
      type: 'ios_wkwebview',
      name: 'iOS WKWebView',
      description: 'iOS WKWebView环境',
      features: {
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: false,
        [BrowserFeature.INDEXED_DB]: {
          supported: true,
          since: 'iOS 10.0',
          partial: true,
          notes: '存在存储限制和兼容性问题',
        },
        [BrowserFeature.STREAMS_API]: {
          supported: true,
          since: 'iOS 10.3',
          partial: true,
        },
        [BrowserFeature.WEB_CRYPTO]: true,
        [BrowserFeature.FILE_API]: {
          supported: true,
          partial: true,
          notes: '文件上传存在限制',
        },
      },
      limitations: [
        {
          type: 'file_upload',
          description: '文件上传限制',
          value: '内嵌文件上传存在问题，input file可能无法激活',
          criticalityLevel: 'high',
          workaround: '使用自定义UI或原生桥接',
        },
        {
          type: 'storage_limit',
          description: '存储限制',
          value: '更严格的存储限制',
          criticalityLevel: 'medium',
        },
        {
          type: 'cookie_limit',
          description: 'Cookie限制',
          value: 'iOS 13+的ITP会限制第三方Cookie',
          criticalityLevel: 'medium',
        },
      ],
      bestPractices: [
        {
          name: 'native_bridge',
          description: '对于文件上传，使用原生桥接',
        },
        {
          name: 'chunk_optimization',
          description: '使用较小分片和更长超时',
          recommendedSetting: {
            chunkSize: 1 * 1024 * 1024,
            timeout: 60000,
          },
        },
      ],
    });

    // Android WebView
    this.addEnvironmentData({
      type: 'android_webview',
      name: 'Android WebView',
      description: 'Android系统WebView',
      features: {
        [BrowserFeature.WEB_WORKER]: true,
        [BrowserFeature.SERVICE_WORKER]: {
          supported: true,
          since: 'Chrome 40.0',
          notes: '取决于系统WebView版本',
        },
        [BrowserFeature.INDEXED_DB]: {
          supported: true,
          since: 'Chrome 40.0',
        },
        [BrowserFeature.STREAMS_API]: {
          supported: true,
          since: 'Chrome 52.0',
          notes: '取决于系统WebView版本',
        },
        [BrowserFeature.WEB_CRYPTO]: {
          supported: true,
          since: 'Chrome 37.0',
        },
        [BrowserFeature.FILE_API]: true,
      },
      limitations: [
        {
          type: 'version_fragmentation',
          description: 'WebView版本碎片化',
          value: '不同设备可能运行不同版本的WebView',
          criticalityLevel: 'high',
          workaround: '使用特性检测并提供降级方案',
        },
        {
          type: 'memory_limit',
          description: '内存限制',
          value: '低端设备内存限制严格',
          criticalityLevel: 'medium',
        },
      ],
      bestPractices: [
        {
          name: 'feature_detection',
          description: '始终使用特性检测而非版本检测',
        },
        {
          name: 'progressive_enhancement',
          description: '采用渐进增强策略，确保核心功能在旧版WebView上可用',
        },
      ],
    });
  }

  /**
   * 添加环境数据
   */
  private addEnvironmentData(data: EnvironmentFeatureData): void {
    const key =
      typeof data.type === 'string' ? data.type : data.name.toLowerCase();
    this.featuresData.set(key, data);
  }

  /**
   * 初始化用户代理匹配模式
   */
  private initializeUserAgentPatterns(): void {
    // 浏览器匹配模式
    this.userAgentPatterns.set(/Chrome\/([0-9]+)/i, 'chrome');
    this.userAgentPatterns.set(/Firefox\/([0-9]+)/i, 'firefox');
    this.userAgentPatterns.set(/Safari\/([0-9]+)/i, 'safari');
    this.userAgentPatterns.set(/Edge\/([0-9]+)/i, 'edge');
    this.userAgentPatterns.set(/Edg\/([0-9]+)/i, 'edge');
    this.userAgentPatterns.set(/MSIE |Trident\//i, 'ie');

    // WebView匹配模式
    this.userAgentPatterns.set(
      /(iPhone|iPad|iPod).*AppleWebKit(?!.*Safari)/i,
      'ios_wkwebview'
    );
    this.userAgentPatterns.set(/Android.*wv\)/i, 'android_webview');
  }

  /**
   * 获取环境特性数据
   * @param environmentKey 环境键名
   */
  public getEnvironmentData(
    environmentKey: string | Environment | EnvironmentType
  ): EnvironmentFeatureData | null {
    const key =
      typeof environmentKey === 'string'
        ? environmentKey
        : environmentKey.toString().toLowerCase();
    return this.featuresData.get(key) || null;
  }

  /**
   * 获取当前环境的特性数据
   */
  public getCurrentEnvironmentData(): EnvironmentFeatureData | null {
    // 尝试通过用户代理匹配
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      const userAgent = navigator.userAgent;

      for (const [pattern, envKey] of this.userAgentPatterns.entries()) {
        if (pattern.test(userAgent)) {
          const envData = this.getEnvironmentData(envKey);
          if (envData) {
            return envData;
          }
        }
      }
    }

    // 通用特性检测
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return this.getEnvironmentData(Environment.Browser);
    }

    return null;
  }

  /**
   * 检查特定环境是否支持某项特性
   * @param environmentKey 环境键名
   * @param featureKey 特性键名
   */
  public isFeatureSupported(
    environmentKey: string | Environment | EnvironmentType,
    featureKey: string
  ): boolean {
    const envData = this.getEnvironmentData(environmentKey);
    if (!envData) return false;

    const featureSupport = envData.features[featureKey];
    if (typeof featureSupport === 'boolean') {
      return featureSupport;
    } else if (featureSupport) {
      return featureSupport.supported;
    }

    return false;
  }

  /**
   * 获取特定环境的限制信息
   * @param environmentKey 环境键名
   * @param limitationType 限制类型
   */
  public getLimitationInfo(
    environmentKey: string | Environment | EnvironmentType,
    limitationType: string
  ): any {
    const envData = this.getEnvironmentData(environmentKey);
    if (!envData) return null;

    return (
      envData.limitations.find(limit => limit.type === limitationType) || null
    );
  }

  /**
   * 获取特定环境的最佳实践
   * @param environmentKey 环境键名
   */
  public getBestPractices(
    environmentKey: string | Environment | EnvironmentType
  ): any[] {
    const envData = this.getEnvironmentData(environmentKey);
    if (!envData) return [];

    return envData.bestPractices;
  }

  /**
   * 根据环境获取优化配置
   * @param environmentKey 环境键名
   */
  public getOptimizedConfig(
    environmentKey: string | Environment | EnvironmentType
  ): Record<string, any> {
    const envData = this.getEnvironmentData(environmentKey);
    if (!envData) return {};

    // 合并所有最佳实践中的推荐设置
    const config: Record<string, any> = {};

    envData.bestPractices.forEach(practice => {
      if (practice.recommendedSetting) {
        Object.assign(config, practice.recommendedSetting);
      }
    });

    return config;
  }

  /**
   * 查询特定环境的特定限制值
   * @param environmentKey 环境键名
   * @param limitationType 限制类型
   */
  public getLimitationValue(
    environmentKey: string | Environment | EnvironmentType,
    limitationType: string
  ): number | string | undefined {
    const limitation = this.getLimitationInfo(environmentKey, limitationType);
    return limitation ? limitation.value : undefined;
  }

  /**
   * 获取环境的特性详情
   * @param environmentKey 环境键名
   * @param featureKey 特性键名
   */
  public getFeatureDetails(
    environmentKey: string | Environment | EnvironmentType,
    featureKey: string
  ): FeatureSupportInfo | boolean | undefined {
    const envData = this.getEnvironmentData(environmentKey);
    if (!envData) return undefined;

    return envData.features[featureKey];
  }

  /**
   * 更新环境特性数据
   * 用于运行时更新特定环境的特性支持情况
   * @param environmentKey 环境键名
   * @param featureKey 特性键名
   * @param supportInfo 支持信息
   */
  public updateFeatureSupport(
    environmentKey: string | Environment | EnvironmentType,
    featureKey: string,
    supportInfo: boolean | FeatureSupportInfo
  ): void {
    const envData = this.getEnvironmentData(environmentKey);
    if (envData) {
      envData.features[featureKey] = supportInfo;
    }
  }

  /**
   * 获取所有已知环境的键名列表
   */
  public getAllEnvironmentKeys(): string[] {
    return Array.from(this.featuresData.keys());
  }
}

export default EnvironmentFeatureDatabase;
