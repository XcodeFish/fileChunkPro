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