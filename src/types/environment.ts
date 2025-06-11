/**
 * environment.ts
 * 环境检测系统相关类型定义
 */

/**
 * 特性支持状态映射
 */
export interface FeatureSupport {
  [key: string]: boolean;
}

/**
 * 能力级别枚举
 */
export type CapabilityLevel = 'low' | 'normal' | 'high';

/**
 * 环境类型枚举
 * 代表应用运行的主要环境类型
 */
export enum Environment {
  Browser = 'browser',
  WechatMP = 'wechat_miniprogram',
  AlipayMP = 'alipay_miniprogram',
  BytedanceMP = 'bytedance_miniprogram',
  BaiduMP = 'baidu_miniprogram',
  QQ_MP = 'qq_miniprogram',
  Taro = 'taro',
  UniApp = 'uni_app',
  ReactNative = 'react_native',
  NodeJS = 'node',
  ServiceWorker = 'service_worker',
  WebWorker = 'web_worker',
  Unknown = 'unknown'
}

/**
 * 浏览器类型枚举
 */
export enum BrowserType {
  CHROME = 'chrome',
  FIREFOX = 'firefox',
  SAFARI = 'safari',
  EDGE = 'edge',
  IE = 'ie',
  OPERA = 'opera',
  UC = 'uc',
  QQ = 'qq',
  BAIDU = 'baidu',
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  UNKNOWN = 'unknown'
}

/**
 * 操作系统类型枚举
 */
export enum OSType {
  ANDROID = 'android',
  IOS = 'ios',
  WINDOWS = 'windows',
  MACOS = 'macos',
  LINUX = 'linux',
  UNKNOWN = 'unknown'
}

/**
 * 设备类型枚举
 */
export enum DeviceType {
  MOBILE = 'mobile',
  TABLET = 'tablet',
  DESKTOP = 'desktop',
  TV = 'tv',
  UNKNOWN = 'unknown'
}

/**
 * WebView类型枚举
 */
export enum WebViewType {
  NATIVE_ANDROID = 'android_webview',
  NATIVE_IOS = 'ios_webview',
  WKWEBVIEW = 'wkwebview',
  UIWEBVIEW = 'uiwebview',
  CROSSWALK = 'crosswalk',
  X5 = 'x5',
  NOT_WEBVIEW = 'not_webview',
  UNKNOWN = 'unknown'
}

/**
 * 框架类型枚举
 */
export enum FrameworkType {
  TARO = 'taro',
  UNI_APP = 'uni_app',
  REACT_NATIVE = 'react_native',
  IONIC = 'ionic',
  CORDOVA = 'cordova',
  ELECTRON = 'electron',
  NONE = 'none',
  UNKNOWN = 'unknown'
}

/**
 * 浏览器特性枚举
 */
export enum BrowserFeature {
  WEB_WORKER = 'web_worker',
  SERVICE_WORKER = 'service_worker',
  WEBSOCKET = 'websocket',
  INDEXED_DB = 'indexed_db',
  FILE_API = 'file_api',
  STREAMS_API = 'streams_api',
  SHARED_ARRAY_BUFFER = 'shared_array_buffer',
  NETWORK_INFORMATION_API = 'network_information_api',
  WEB_CRYPTO = 'web_crypto',
  PERFORMANCE_API = 'performance_api',
  MEMORY_API = 'memory_api',
  BATTERY_API = 'battery_api',
  HARDWARE_CONCURRENCY = 'hardware_concurrency',
  DEVICE_MEMORY_API = 'device_memory_api',
  FETCH_API = 'fetch_api',
  PROMISE = 'promise',
  ASYNC_AWAIT = 'async_await',
  WEB_ASSEMBLY = 'web_assembly'
}

/**
 * 小程序特性枚举
 */
export enum MiniProgramFeature {
  FILE_SYSTEM = 'file_system',
  UPLOAD_FILE = 'upload_file',
  DOWNLOAD_FILE = 'download_file',
  SOCKET = 'socket',
  WORKER = 'worker'
}

/**
 * React Native特性枚举
 */
export enum ReactNativeFeature {
  FETCH = 'fetch',
  XMLHTTPREQUEST = 'xmlhttprequest',
  WEBSOCKET = 'websocket',
  FILE_SYSTEM = 'file_system'
}

/**
 * Node.js特性枚举
 */
export enum NodeFeature {
  FS = 'fs',
  HTTP = 'http',
  HTTPS = 'https',
  STREAM = 'stream',
  WORKER_THREADS = 'worker_threads',
  CRYPTO = 'crypto'
}

/**
 * 环境信息接口
 */
export interface EnvironmentInfo {
  /**
   * 运行环境类型
   */
  environment: Environment;

  /**
   * 是否是小程序环境
   */
  isMiniProgram: boolean;

  /**
   * 是否是Worker环境
   */
  isWorker: boolean;

  /**
   * 是否是浏览器环境
   */
  isBrowser: boolean;

  /**
   * 是否是Node环境
   */
  isNode: boolean;

  /**
   * 是否是混合应用环境
   */
  isHybrid: boolean;

  /**
   * 浏览器信息
   */
  browser: {
    /**
     * 浏览器类型
     */
    type: BrowserType;

    /**
     * 浏览器版本
     */
    version: string;

    /**
     * 浏览器引擎
     */
    engine: string;

    /**
     * 是否支持WebView
     */
    isWebView: boolean;

    /**
     * WebView类型
     */
    webViewType: WebViewType;
  };

  /**
   * 操作系统信息
   */
  os: {
    /**
     * 操作系统类型
     */
    type: OSType;

    /**
     * 操作系统版本
     */
    version: string;

    /**
     * 系统平台
     */
    platform: string;
  };

  /**
   * 设备信息
   */
  device: {
    /**
     * 设备类型
     */
    type: DeviceType;

    /**
     * 设备像素比
     */
    pixelRatio: number;

    /**
     * 屏幕尺寸
     */
    screenSize: {
      width: number;
      height: number;
    };

    /**
     * 是否支持触摸
     */
    touchSupport: boolean;
  };

  /**
   * 框架信息
   */
  framework: {
    /**
     * 框架类型
     */
    type: FrameworkType;

    /**
     * 框架版本
     */
    version: string;
  };

  /**
   * 网络信息
   */
  network: {
    /**
     * 网络类型
     */
    type: string;

    /**
     * 是否在线
     */
    online: boolean;

    /**
     * 是否支持网络信息API
     */
    supportsNetworkInfo: boolean;
  };
}

/**
 * 环境配置推荐
 */
export interface EnvironmentRecommendation {
  chunkSize: number;        // 推荐的分片大小
  concurrency: number;      // 推荐的并发数
  useWorker: boolean;       // 是否使用Worker
  storageType: string;      // 推荐的存储类型
  retryStrategy: {          // 重试策略
    maxRetries: number;     // 最大重试次数
    initialDelay: number;   // 初始延迟
    maxDelay: number;       // 最大延迟
  };
  timeout: number;          // 推荐的超时时间
  processingMode: string;   // 推荐的处理模式
  memoryManagement: {       // 内存管理策略
    maxUsage: number;       // 最大内存使用率
    cleanupInterval: number; // 清理间隔
  };
  monitoringFrequency: number; // 监控频率
  optimizations: string[];    // 推荐启用的优化
}

/**
 * 降级策略
 */
export interface FallbackStrategy {
  feature: string;           // 不支持的特性
  fallbackMethod: string;    // 降级方法
  performance: 'high' | 'medium' | 'low'; // 性能影响
  limitations: string[];     // 功能限制
  enabled: boolean;          // 是否启用降级
}

/**
 * 环境能力评分
 */
export interface EnvironmentCapabilityScore {
  overall: number;           // 总体评分 (0-100)
  fileProcessing: number;    // 文件处理能力评分
  networking: number;        // 网络能力评分
  concurrency: number;       // 并发处理能力评分
  storage: number;           // 存储能力评分
  reliability: number;       // 可靠性评分
}

/**
 * 环境检测结果
 */
export interface EnvironmentDetectionResult {
  environment: string;       // 环境名称
  features: FeatureSupport;  // 特性支持情况
  capabilities: {            // 能力评估
    memory: CapabilityLevel;
    processor: CapabilityLevel;
    network: CapabilityLevel;
    storage: CapabilityLevel;
    battery: CapabilityLevel;
  };
  scores: EnvironmentCapabilityScore; // 能力评分
  recommendations: EnvironmentRecommendation; // 配置推荐
  fallbacks: FallbackStrategy[]; // 降级策略
  warnings: string[];        // 警告信息
  limitations: string[];     // 限制信息
}

/**
 * 环境类型定义
 */
export enum EnvironmentType {
  BROWSER = 'browser',
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  BYTEDANCE = 'bytedance',
  BAIDU = 'baidu',
  TARO = 'taro',
  UNIAPP = 'uniapp',
  REACT_NATIVE = 'react-native',
  NODE = 'node',
  UNKNOWN = 'unknown'
} 