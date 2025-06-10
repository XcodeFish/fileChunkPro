/**
 * fileChunkPro 类型定义
 * 集中定义项目中使用的类型
 */

// WebAssembly 类型导出
export * from './wasm';

// 智能重试系统类型导出
export * from './retry';

// 监控系统类型导出
export * from './monitoring';

// 插件SDK类型导出
export * from './sdk';

// 上传选项
export interface UploaderOptions {
  endpoint: string;           // 上传端点
  chunkSize?: number | 'auto'; // 分片大小，'auto'表示自动计算
  concurrency?: number;        // 并发数
  timeout?: number;            // 请求超时时间
  retryCount?: number;         // 失败重试次数
  retryDelay?: number;         // 重试延迟时间
  headers?: Record<string, string>; // 自定义请求头
  useWorker?: boolean;         // 是否使用Worker线程
  autoRetry?: boolean;         // 是否自动重试
  maxFileSize?: number;        // 最大文件大小限制
  allowFileTypes?: string[];   // 允许的文件类型
  enableAdaptiveUploads?: boolean; // 是否启用自适应上传
  maxMemoryUsage?: number;     // 最大内存使用率
  smartRetry?: boolean;        // 是否启用智能重试
  autoResume?: boolean;        // 是否自动恢复上传
  enableMemoryMonitoring?: boolean; // 是否启用内存监控
  adaptiveStrategies?: AdaptiveStrategyOptions; // 自适应策略选项
  enablePerformanceMonitoring?: boolean; // 是否启用性能监控
  performanceCheckInterval?: number; // 性能检查间隔
  
  /**
   * ServiceWorker配置
   */
  serviceWorker?: {
    /**
     * 是否启用ServiceWorker功能
     * @default false
     */
    enabled?: boolean;
    
    /**
     * ServiceWorker脚本路径
     * @default '/serviceWorker.js'
     */
    swPath?: string;
    
    /**
     * ServiceWorker控制范围
     * @default '/'
     */
    scope?: string;
    
    /**
     * 是否启用离线上传
     * @default true
     */
    enableOfflineUpload?: boolean;
    
    /**
     * 是否启用后台上传
     * @default true
     */
    enableBackgroundUploads?: boolean;
    
    /**
     * 是否启用请求缓存
     * @default true
     */
    enableRequestCache?: boolean;
  };
  
  [key: string]: any;          // 其他自定义选项
}

// 上传结果
export interface UploadResult {
  success: boolean;            // 上传是否成功
  url?: string;                // 上传后的文件URL
  fileId?: string;             // 文件ID
  fileName?: string;           // 文件名
  fileSize?: number;           // 文件大小
  mimeType?: string;           // 文件类型
  [key: string]: any;          // 其他返回信息
}

// 分片信息
export interface ChunkInfo {
  index: number;               // 分片序号
  start: number;               // 分片起始位置
  end: number;                 // 分片结束位置
  size: number;                // 分片大小
  fileSize?: number;           // 所属文件大小
  [key: string]: any;          // 其他信息
}

// 任务调度器选项
export interface TaskSchedulerOptions {
  concurrency?: number;      // 最大并发数
  maxConcurrent?: number;    // 等同于concurrency，用于向后兼容
  retries?: number;          // 最大重试次数
  retryCount?: number;       // 最大重试次数（与retries作用相同，用于向后兼容）
  retryDelay?: number;       // 重试延迟(毫秒)
  timeout?: number;          // 超时时间
  priorityQueue?: boolean;   // 是否按优先级排序
  autoStart?: boolean;       // 是否自动启动
  memoryOptimization?: boolean; // 是否启用内存优化
  networkOptimization?: boolean; // 是否启用网络状态优化
  maxIdleTime?: number;      // 最大空闲时间(毫秒)
}

// 任务状态枚举
export enum TaskState {
  PENDING = 'pending',       // 等待中
  RUNNING = 'running',       // 执行中
  COMPLETED = 'completed',   // 已完成
  FAILED = 'failed',         // 失败
  ABORTED = 'aborted',       // 已中止
  CANCELLED = 'cancelled'    // 已取消
}

// 任务统计信息
export interface TaskStats {
  executed: number;          // 已执行任务数
  succeeded: number;         // 成功任务数
  failed: number;            // 失败任务数
  retried: number;           // 重试任务数
  aborted: number;           // 中止任务数
  averageExecutionTime: number; // 平均执行时间
  totalExecutionTime: number;   // 总执行时间
  longestExecutionTime: number; // 最长执行时间
  shortestExecutionTime: number; // 最短执行时间
}

// 任务元数据
export interface TaskMetadata {
  fileId?: string;           // 文件ID
  chunkIndex?: number;       // 分片索引
  size?: number;             // 分片/文件大小
  fileName?: string;         // 文件名
  mimeType?: string;         // 文件类型
  speed?: number;            // 预估速度
  [key: string]: any;        // 其他元数据
}

/**
 * 网络状态
 */
export type NetworkStatus = 'online' | 'offline' | 'unknown';

/**
 * 网络质量等级
 */
export enum NetworkQuality {
  /** 未知网络质量 */
  UNKNOWN = 'unknown',
  
  /** 网络断开 */
  OFFLINE = 'offline',
  
  /** 非常差的网络质量 */
  POOR = 'poor',
  
  /** 较差的网络质量 */
  LOW = 'low',
  
  /** 中等网络质量 */
  MEDIUM = 'medium',
  
  /** 良好网络质量 */
  GOOD = 'good',
  
  /** 优秀网络质量 */
  EXCELLENT = 'excellent'
}

/**
 * 内存使用趋势枚举
 */
export enum MemoryTrend {
  /** 内存使用稳定 */
  STABLE = 'stable',
  
  /** 内存使用增长 */
  GROWING = 'growing',
  
  /** 内存使用减少 */
  DECREASING = 'decreasing'
}

/**
 * 设备内存容量级别枚举
 */
export enum DeviceMemoryCapacity {
  /** 极低内存 (<1GB) */
  VERY_LOW = 'very_low',
  
  /** 低内存 (1-2GB) */
  LOW = 'low',
  
  /** 中等内存 (2-4GB) */
  MEDIUM = 'medium',
  
  /** 高内存 (4-8GB) */
  HIGH = 'high',
  
  /** 极高内存 (>8GB) */
  VERY_HIGH = 'very_high'
}

/**
 * 内存警告级别枚举
 */
export enum MemoryWarningLevel {
  /** 正常内存使用 */
  NORMAL = 'normal',
  
  /** 内存警告级别 */
  WARNING = 'warning',
  
  /** 内存临界级别 */
  CRITICAL = 'critical'
}

/**
 * 内存统计信息接口
 */
export interface MemoryStats {
  used: number;          // 已使用内存 (bytes)
  total: number;         // 总内存 (bytes)
  limit: number;         // 内存限制 (bytes)
  usageRatio: number;    // 内存使用率 (0-1)
  growthRate?: number;   // 内存增长率 (bytes/s)
  trend?: MemoryTrend;   // 内存趋势
  capacity?: DeviceMemoryCapacity; // 设备内存容量级别
  availableForUploading?: number;  // 可用于上传的内存估计值 (bytes)
  isLowMemoryEnvironment?: boolean; // 是否为低内存环境
}

/**
 * 内存预警事件详情接口
 */
export interface MemoryWarningEvent {
  level: MemoryWarningLevel;
  stats: MemoryStats;
  recommendations: {
    chunkSize?: number;  // 推荐的分片大小
    concurrency?: number; // 推荐的并发数
    shouldPause?: boolean; // 是否应该暂停上传
    shouldReleaseMemory?: boolean; // 是否应该释放内存
  };
}

/**
 * 带宽统计信息
 */
export interface BandwidthStats {
  currentSpeed: number;       // 当前速度 (bytes/s)
  averageSpeed: number;       // 平均速度 (bytes/s)
  peakSpeed: number;          // 峰值速度 (bytes/s)
  samples: number;            // 样本数量
  networkQuality: NetworkQuality; // 网络质量等级
  timestamp: number;          // 统计时间戳
  isStable: boolean;          // 是否稳定
}

/**
 * 并发调整事件
 */
export interface ConcurrencyAdjustmentEvent {
  from: number;               // 调整前的并发数
  to: number;                 // 调整后的并发数
  reason: string;             // 调整原因
  quality?: NetworkQuality;   // 当前网络质量
  stats?: BandwidthStats;     // 带宽统计
  stable?: boolean;           // 网络是否稳定
}

/**
 * 分片处理策略接口
 */
export interface ChunkProcessingStrategy {
  chunkSize: number;     // 推荐的分片大小
  concurrency: number;   // 推荐的并发数
  processingMode: 'sequential' | 'parallel' | 'hybrid'; // 处理模式
  useStreaming: boolean; // 是否使用流式处理
  prioritizeMetadata: boolean; // 是否优先处理元数据
  preloadChunks: number; // 预加载分片数量
}

// 任务优先级枚举
export enum TaskPriority {
  LOW = 0,                    // 低优先级
  NORMAL = 1,                 // 正常优先级
  HIGH = 2,                   // 高优先级
  CRITICAL = 3                // 关键优先级
}

// 任务接口
export interface ITask {
  id: number;                 // 任务ID
  execute: () => Promise<any>; // 执行任务
  priority: TaskPriority;     // 优先级
  metadata?: TaskMetadata;    // 元数据
}

// 任务类型定义
export type Task = () => Promise<any>;

// 进度回调函数类型
export type ProgressCallback = (progress: any) => void;

// 错误类型枚举
export enum UploadErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',        // 网络错误
  FILE_ERROR = 'FILE_ERROR',              // 文件错误
  SERVER_ERROR = 'SERVER_ERROR',          // 服务端错误
  ENVIRONMENT_ERROR = 'ENVIRONMENT_ERROR', // 环境错误
  WORKER_ERROR = 'WORKER_ERROR',          // Worker错误
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',        // 超时错误
  MEMORY_ERROR = 'MEMORY_ERROR',          // 内存不足错误
  PERMISSION_ERROR = 'PERMISSION_ERROR',  // 权限错误
  QUOTA_EXCEEDED_ERROR = 'QUOTA_EXCEEDED_ERROR', // 存储配额超出
  UPLOAD_ERROR = 'UPLOAD_ERROR',         // 上传错误
  MERGE_ERROR = 'MERGE_ERROR',           // 合并错误
  VALIDATION_ERROR = 'VALIDATION_ERROR', // 验证错误
  CANCEL_ERROR = 'CANCEL_ERROR',         // 取消错误
  SECURITY_ERROR = 'SECURITY_ERROR',      // 安全错误
  DATA_CORRUPTION_ERROR = 'DATA_CORRUPTION_ERROR', // 数据损坏错误
  API_ERROR = 'API_ERROR',               // API错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',         // 未知错误
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',   // 请求速率限制错误
  CONNECTION_RESET_ERROR = 'CONNECTION_RESET_ERROR', // 连接重置错误
  SERVER_UNREACHABLE_ERROR = 'SERVER_UNREACHABLE_ERROR', // 服务器不可达错误
  DNS_RESOLUTION_ERROR = 'DNS_RESOLUTION_ERROR', // DNS解析错误
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR', // 认证失败错误
  CONTENT_ENCODING_ERROR = 'CONTENT_ENCODING_ERROR', // 内容编码错误
  DATA_PROCESSING_ERROR = 'DATA_PROCESSING_ERROR' // 数据处理错误
}

// 环境类型枚举
export enum Environment {
  Browser,
  ReactNative,
  WechatMP,
  AlipayMP,
  BytedanceMP,
  BaiduMP,
  TaroMP,
  UniAppMP,
  NodeJS,
  Unknown
}

// 小程序文件类型
export interface MiniProgramFile {
  path: string;               // 文件路径
  size: number;               // 文件大小
  name: string;               // 文件名
  type?: string;              // 文件类型
}

// 插件接口
export interface IPlugin {
  install: (uploader: any) => void;
  version?: string;           // 插件版本
}

// 上传适配器接口
export interface IUploadAdapter {
  readChunk: (filePath: string | File | Blob | any, start: number, size: number) => Promise<ArrayBuffer>;
  uploadChunk: (url: string, chunk: ArrayBuffer, headers: Record<string, string>, metadata?: Record<string, any>) => Promise<any>;
  getFileInfo?: (file: any) => Promise<{ name: string; size: number; type?: string; path?: string; lastModified?: number }>;
  getStorage?: () => any;
  detectFeatures?: () => Record<string, boolean>;
  setNetworkQuality?: (quality: NetworkQuality) => void;
  getNetworkQuality?: () => NetworkQuality;
  request?: (url: string, options?: any) => Promise<any>;
  supportsFeature?: (feature: string) => boolean;
  calculateFileHash?: (file: any, algorithm: string) => Promise<string>;
  dispose?: () => void;
}

// 安全级别枚举
export enum SecurityLevel {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  ADVANCED = 'ADVANCED'
}

// 插件优先级枚举
export enum PluginPriority {
  LOWEST = 0,
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  HIGHEST = 4
}

// 钩子执行结果
export interface HookResult {
  handled: boolean;          // 是否有处理函数执行
  result: any;               // 执行结果
  modified: boolean;         // 是否修改了参数
  errors?: Error[];          // 执行错误列表
}

// 网络条件接口
export interface NetworkCondition {
  type: string;              // 网络类型
  effectiveType: string;     // 有效网络类型
  downlink: number;          // 下载速度
  rtt: number;               // 往返时间
  saveData?: boolean;        // 是否启用数据节省
}

// 上传策略接口
export interface UploadStrategy {
  chunkSize: number;         // 分片大小
  concurrency: number;       // 并发数
  retryCount: number;        // 重试次数
  retryDelay: number;        // 重试延迟
  timeout: number;           // 超时时间
  prioritizeFirstChunk?: boolean; // 是否优先上传第一个分片
  prioritizeLastChunk?: boolean;  // 是否优先上传最后一个分片
}

// 重试策略接口
export interface RetryStrategy {
  maxRetries: number;        // 最大重试次数
  initialDelay: number;      // 初始延迟
  baseDelay?: number;        // 初始延迟的别名
  maxDelay: number;          // 最大延迟
  factor: number;            // 延迟增长因子
  multiplier?: number;       // 延迟增长因子的别名
  jitter?: number;           // 抖动因子
  shouldRetry: (error: Error) => boolean; // 判断是否应该重试
}

// 文件验证结果
export interface FileValidationResult {
  valid: boolean;            // 是否有效
  errors: string[];          // 错误信息
  warnings: string[];        // 警告信息
}

// 内容验证结果
export interface ContentValidationResult {
  valid: boolean;            // 是否有效
  reason: string;            // 无效原因
}

/**
 * 自适应策略选项
 */
export interface AdaptiveStrategyOptions {
  enabled: boolean;            // 是否启用自适应策略
  adjustChunkSize: boolean;    // 是否调整分片大小
  adjustConcurrency: boolean;  // 是否调整并发数
  adjustRetries: boolean;      // 是否调整重试策略
  minChunkSize: number;        // 最小分片大小 (字节)
  maxChunkSize: number;        // 最大分片大小 (字节)
  minConcurrency: number;      // 最小并发数
  maxConcurrency: number;      // 最大并发数
  samplingInterval: number;    // 采样间隔 (毫秒)
}

/**
 * 设备能力
 */
export interface DeviceCapability {
  memory: 'low' | 'normal' | 'high'; // 内存能力
  processor: 'low' | 'normal' | 'high'; // 处理器能力
  network: 'low' | 'normal' | 'high'; // 网络能力
  storage: 'low' | 'normal' | 'high'; // 存储能力
  battery: 'low' | 'normal' | 'high'; // 电池状态
}

/**
 * 上传性能统计
 */
export interface UploadPerformanceStats {
  fileId: string;              // 文件ID
  fileSize: number;            // 文件大小
  startTime: number;           // 开始时间戳
  endTime: number;             // 结束时间戳
  duration: number;            // 总耗时 (毫秒)
  avgSpeed: number;            // 平均速度 (字节/秒)
  success?: boolean;           // 是否成功上传
  chunks: {
    total: number;             // 总分片数
    completed: number;         // 已完成分片数
    failed: number;            // 失败分片数
    retried: number;           // 重试分片数
  };
  bytesUploaded: number;       // 已上传字节数
}

/**
 * 错误严重程度枚举
 */
export enum ErrorSeverity {
  /** 低严重度，不影响核心功能 */
  LOW = 1,
  
  /** 中等严重度，会影响部分功能但系统仍可运行 */
  MEDIUM = 2,
  
  /** 高严重度，会导致关键功能失败 */
  HIGH = 3,
  
  /** 致命错误，导致整个系统不可用 */
  CRITICAL = 4
}

/**
 * 错误分组枚举，用于对错误进行分类
 */
export enum ErrorGroup {
  /** 网络相关错误 */
  NETWORK = 'network',
  
  /** 文件操作相关错误 */
  FILE = 'file',
  
  /** 服务器响应相关错误 */
  SERVER = 'server',
  
  /** 环境相关错误 */
  ENVIRONMENT = 'environment',
  
  /** 系统资源相关错误 */
  RESOURCE = 'resource',
  
  /** 权限相关错误 */
  PERMISSION = 'permission',
  
  /** 安全相关错误 */
  SECURITY = 'security',
  
  /** 用户操作相关错误 */
  USER = 'user',
  
  /** 数据处理相关错误 */
  DATA = 'data',
  
  /** 其他未分类错误 */
  OTHER = 'other'
}

/**
 * 错误恢复策略枚举
 */
export enum ErrorRecoveryStrategy {
  /** 立即重试 */
  RETRY_IMMEDIATELY = 'retry_immediately',
  
  /** 延迟重试 */
  RETRY_WITH_DELAY = 'retry_with_delay',
  
  /** 增加延迟重试 */
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  
  /** 降级处理 */
  FALLBACK = 'fallback',
  
  /** 暂停后重试 */
  PAUSE_AND_RETRY = 'pause_and_retry',
  
  /** 等待网络连接 */
  WAIT_FOR_NETWORK = 'wait_for_network',
  
  /** 等待用户操作 */
  WAIT_FOR_USER_ACTION = 'wait_for_user_action',
  
  /** 放弃 */
  ABORT = 'abort',
  
  /** 重新初始化 */
  REINITIALIZE = 'reinitialize'
}

/**
 * 错误上下文数据接口
 */
export interface ErrorContextData {
  /** 错误发生时间戳 */
  timestamp: number;
  
  /** 网络状态信息 */
  network?: {
    online: boolean;
    type?: string;
    downlink?: number;
    rtt?: number;
  };
  
  /** 文件信息 */
  file?: {
    name?: string;
    size?: number;
    type?: string;
    lastModified?: number;
  };
  
  /** 分片信息 */
  chunk?: {
    index: number;
    start: number;
    end: number;
    size: number;
    attempts: number;
  };
  
  /** 请求信息 */
  request?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    timeout?: number;
  };
  
  /** 响应信息 */
  response?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: any;
  };
  
  /** 运行环境信息 */
  environment?: {
    type: Environment;
    userAgent?: string;
    platform?: string;
    memory?: MemoryStats;
  };
  
  /** 恢复历史 */
  recoveryHistory?: Array<{
    strategy: ErrorRecoveryStrategy;
    timestamp: number;
    successful: boolean;
  }>;
  
  /** 其他自定义上下文数据 */
  custom?: Record<string, any>;
}

/**
 * 安全错误子类型枚举
 */
export enum SecurityErrorSubType {
  /** 文件类型不允许 */
  FILE_TYPE_NOT_ALLOWED = 'FILE_TYPE_NOT_ALLOWED',
  
  /** 文件大小超过限制 */
  FILE_SIZE_EXCEEDED = 'FILE_SIZE_EXCEEDED',
  
  /** 文件名不合规 */
  INVALID_FILENAME = 'INVALID_FILENAME',
  
  /** 敏感文件类型 */
  SENSITIVE_FILE_TYPE = 'SENSITIVE_FILE_TYPE',
  
  /** 文件扩展名与MIME类型不匹配 */
  EXTENSION_MISMATCH = 'EXTENSION_MISMATCH',
  
  /** 缺少上传权限 */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  /** 文件内容不安全 */
  UNSAFE_CONTENT = 'UNSAFE_CONTENT',
  
  /** 可疑文件特征 */
  SUSPICIOUS_FILE = 'SUSPICIOUS_FILE',
  
  /** 其他安全错误 */
  OTHER = 'OTHER'
}

/**
 * 安全问题严重程度枚举
 */
export enum SecurityIssueSeverity {
  /** 低风险 - 可能存在的安全隐患 */
  LOW = 'LOW',
  
  /** 中风险 - 确定的安全问题，但影响有限 */
  MEDIUM = 'MEDIUM',
  
  /** 高风险 - 严重的安全问题，可能导致系统受损 */
  HIGH = 'HIGH',
  
  /** 紧急风险 - 极其严重的安全问题，必须立即处理 */
  CRITICAL = 'CRITICAL'
}

/**
 * 安全验证结果接口
 */
export interface SecurityValidationResult {
  /** 是否通过验证 */
  valid: boolean;
  
  /** 错误信息 */
  errors: Array<{
    code: SecurityErrorSubType;
    message: string;
    severity: SecurityIssueSeverity;
  }>;
  
  /** 警告信息 */
  warnings: Array<{
    code: string;
    message: string;
  }>;
}

// 导出环境检测相关类型
export * from './environment';
// 导出存储相关类型
export * from './storage';
// 导出监控系统类型
export * from './monitoring';
// 导出debug模块类型
export * from './debug';

// 导出所有类型定义
// 核心类型
export * from './core';
// 适配器类型
export * from './adapters';
// 插件类型
export * from './plugins';
// 工具类型
export * from './utils';
// 无障碍相关类型
export * from './accessibility';
// 国际化相关类型
export * from './i18n'; 