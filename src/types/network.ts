/**
 * network.ts - 网络相关类型定义
 * 定义网络请求、响应和配置的类型
 */

/**
 * HTTP请求方法
 */
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * 响应数据类型
 */
export type ResponseType = 'json' | 'text' | 'blob' | 'arraybuffer' | 'document';

/**
 * 进度回调函数
 */
export type ProgressCallback = (progress: number) => void;

/**
 * 网络质量枚举
 */
export enum NetworkQuality {
  UNKNOWN = 'unknown',
  POOR = 'poor',
  MODERATE = 'moderate',
  GOOD = 'good',
  EXCELLENT = 'excellent',
  OFFLINE = 'offline'
}

/**
 * 网络错误类型
 */
export enum NetworkErrorType {
  // 请求类错误
  REQUEST_ABORTED = 'request_aborted',
  REQUEST_TIMEOUT = 'request_timeout',
  REQUEST_ERROR = 'request_error',
  INVALID_URL = 'invalid_url',
  
  // 响应类错误
  HTTP_ERROR = 'http_error',
  RESPONSE_PARSE_ERROR = 'response_parse_error',
  SERVER_ERROR = 'server_error',
  UNAUTHORIZED = 'unauthorized',
  FORBIDDEN = 'forbidden',
  NOT_FOUND = 'not_found',
  
  // 网络状态错误
  NETWORK_ERROR = 'network_error',
  OFFLINE = 'offline',
  CONNECTION_RESET = 'connection_reset',
  
  // 适配器错误
  ADAPTER_NOT_FOUND = 'adapter_not_found',
  ADAPTER_ERROR = 'adapter_error',
  
  // 其他错误
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * 网络事件类型
 */
export enum NetworkEvent {
  REQUEST_START = 'network:requestStart',
  REQUEST_END = 'network:requestEnd',
  REQUEST_ERROR = 'network:requestError',
  REQUEST_ABORT = 'network:requestAbort',
  REQUEST_RETRY = 'network:requestRetry',
  PROGRESS = 'network:progress',
  ONLINE = 'network:online',
  OFFLINE = 'network:offline',
  QUALITY_CHANGE = 'network:qualityChange'
}

/**
 * 请求配置选项
 */
export interface RequestOptions {
  /**
   * 请求方法
   * @default 'GET'
   */
  method?: RequestMethod;
  
  /**
   * 请求头
   */
  headers?: Record<string, string>;
  
  /**
   * 请求体
   */
  body?: any;
  
  /**
   * 请求超时时间（毫秒）
   * @default 30000
   */
  timeout?: number;
  
  /**
   * 最大重试次数
   * @default 3
   */
  retries?: number;
  
  /**
   * 重试延迟时间（毫秒）
   * @default 1000
   */
  retryDelay?: number;
  
  /**
   * 响应数据类型
   * @default 'json'
   */
  responseType?: ResponseType;
  
  /**
   * 是否携带凭证（cookies）
   * @default false
   */
  withCredentials?: boolean;
  
  /**
   * 中止信号
   */
  signal?: AbortSignal;
  
  /**
   * 进度回调
   */
  onProgress?: ProgressCallback;
  
  /**
   * 表单数据
   */
  formData?: Record<string, any>;
  
  /**
   * 文件字段名
   * @default 'file'
   */
  fileFieldName?: string;
  
  /**
   * 文件名
   */
  fileName?: string;
  
  /**
   * 是否为关键请求（离线时不会被自动中止）
   * @default false
   */
  critical?: boolean;
  
  /**
   * 是否直接上传二进制数据而不使用FormData
   * @default false
   */
  isDirectUpload?: boolean;
  
  /**
   * 内容类型（直接上传时使用）
   */
  contentType?: string;
  
  /**
   * 自定义选项扩展
   */
  [key: string]: any;
}

/**
 * 网络响应接口
 */
export interface NetworkResponse<T = unknown> {
  /**
   * 是否成功（HTTP状态码2xx）
   */
  ok: boolean;
  
  /**
   * HTTP状态码
   */
  status: number;
  
  /**
   * HTTP状态文本
   */
  statusText: string;
  
  /**
   * 响应数据
   */
  data: T;
  
  /**
   * 响应头
   */
  headers: Record<string, string>;
  
  /**
   * 请求ID
   */
  requestId: string;
  
  /**
   * 请求URL
   */
  url: string;
  
  /**
   * 请求方法
   */
  method: RequestMethod;
  
  /**
   * 请求持续时间（毫秒）
   */
  duration: number;
}

/**
 * 重试策略配置
 */
export interface RetryStrategy {
  /**
   * 最大重试次数
   * @default 3
   */
  maxRetries: number;
  
  /**
   * 基础重试延迟（毫秒）
   * @default 1000
   */
  retryDelay: number;
  
  /**
   * 是否使用指数退避算法
   * @default true
   */
  exponentialBackoff: boolean;
  
  /**
   * 可重试的HTTP状态码
   * @default [408, 500, 502, 503, 504, 429]
   */
  retryableStatusCodes: number[];
  
  /**
   * 是否重试网络错误
   * @default true
   */
  retryableNetworkErrors: boolean;
  
  /**
   * 是否重试超时错误
   * @default true
   */
  retryOnTimeout: boolean;
}

/**
 * 网络监控数据
 */
export interface NetworkMonitoringData {
  /**
   * 当前网络类型
   */
  type?: string;
  
  /**
   * 下行带宽（MB/s）
   */
  downlink?: number;
  
  /**
   * 延迟（毫秒）
   */
  rtt?: number;
  
  /**
   * 有效网络类型
   */
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | '5g';
  
  /**
   * 是否启用节省数据模式
   */
  saveData?: boolean;
  
  /**
   * 网络质量
   */
  quality: NetworkQuality;
  
  /**
   * 是否在线
   */
  online: boolean;
  
  /**
   * 最近的网络日志
   */
  recentLogs?: Array<{
    timestamp: number;
    event: string;
    data?: any;
  }>;
  
  /**
   * 平均请求耗时（毫秒）
   */
  averageRequestTime?: number;
}

/**
 * 批量请求配置
 */
export interface BatchRequestOptions {
  /**
   * 请求列表
   */
  requests: Array<{
    url: string;
    options?: RequestOptions;
  }>;
  
  /**
   * 并发数
   * @default 3
   */
  concurrency?: number;
  
  /**
   * 全部请求完成回调
   */
  onComplete?: (responses: NetworkResponse[]) => void;
  
  /**
   * 失败处理策略
   * 'continue' - 继续执行其他请求
   * 'abort' - 中止所有剩余请求
   * @default 'continue'
   */
  failStrategy?: 'continue' | 'abort';
}

/**
 * 下载进度信息
 */
export interface DownloadProgress {
  /**
   * 已下载字节数
   */
  loaded: number;
  
  /**
   * 总字节数
   */
  total: number;
  
  /**
   * 进度百分比（0-100）
   */
  percent: number;
  
  /**
   * 传输速度（字节/秒）
   */
  speed: number;
  
  /**
   * 预计剩余时间（秒）
   */
  estimatedTime: number;
}

/**
 * 上传进度信息
 */
export interface UploadProgress {
  /**
   * 已上传字节数
   */
  loaded: number;
  
  /**
   * 总字节数
   */
  total: number;
  
  /**
   * 进度百分比（0-100）
   */
  percent: number;
  
  /**
   * 传输速度（字节/秒）
   */
  speed: number;
  
  /**
   * 预计剩余时间（秒）
   */
  estimatedTime: number;
  
  /**
   * 已完成分片数
   */
  chunksCompleted?: number;
  
  /**
   * 总分片数
   */
  chunksTotal?: number;
}

/**
 * 网络选项
 */
export interface NetworkOptions {
  /**
   * 最大并发请求数
   * @default 6
   */
  maxConcurrent?: number;
  
  /**
   * 默认请求头
   */
  headers?: Record<string, string>;
  
  /**
   * 默认超时时间（毫秒）
   * @default 30000
   */
  timeout?: number;
  
  /**
   * 默认是否发送凭证
   * @default false
   */
  withCredentials?: boolean;
  
  /**
   * 重试策略
   */
  retryStrategy?: RetryStrategy;
  
  /**
   * 网络检测间隔（毫秒）
   * @default 5000
   */
  monitoringInterval?: number;
  
  /**
   * 是否启用网络质量自适应
   * @default true
   */
  enableQualityAdaptation?: boolean;
  
  /**
   * 是否启用带宽监控
   * @default true
   */
  enableBandwidthMonitoring?: boolean;
  
  /**
   * 是否启用队列优先级
   * @default true
   */
  enablePriorityQueue?: boolean;
}

/**
 * 网络请求结果
 */
export interface RequestResult<T = any> {
  /**
   * 响应数据
   */
  data: T;
  
  /**
   * HTTP状态码
   */
  status: number;
  
  /**
   * HTTP状态文本
   */
  statusText: string;
  
  /**
   * 响应头
   */
  headers: Record<string, string>;
  
  /**
   * 请求配置
   */
  config: RequestOptions;
  
  /**
   * 重试次数
   */
  retryCount: number;
  
  /**
   * 请求耗时（毫秒）
   */
  timeElapsed: number;
}

/**
 * 网络状态信息
 */
export interface NetworkStatusInfo {
  /**
   * 是否在线
   */
  online: boolean;
  
  /**
   * 连接类型（如wifi, cellular, ethernet等）
   */
  connectionType?: string;
  
  /**
   * 有效连接类型（如4g, 3g, 2g, slow-2g）
   */
  effectiveType?: string;
  
  /**
   * 下行速度（Mbps）
   */
  downlink?: number;
  
  /**
   * 往返时间（ms）
   */
  rtt?: number;
  
  /**
   * 网络质量
   */
  quality: NetworkQuality;
  
  /**
   * 带宽估计（bytes/s）
   */
  bandwidth?: number;
  
  /**
   * 是否为计费网络
   */
  metered?: boolean;
  
  /**
   * 是否为省流量模式
   */
  saveData?: boolean;
}

/**
 * 网络管理器状态
 */
export interface NetworkManagerStatus {
  /**
   * 队列中的请求数
   */
  queued: number;
  
  /**
   * 运行中的请求数
   */
  running: number;
  
  /**
   * 最大并发数
   */
  maxConcurrent: number;
  
  /**
   * 是否已暂停
   */
  paused: boolean;
  
  /**
   * 网络状态
   */
  networkStatus: NetworkStatusInfo;
  
  /**
   * 总请求数
   */
  totalRequests: number;
  
  /**
   * 成功请求数
   */
  successfulRequests: number;
  
  /**
   * 失败请求数
   */
  failedRequests: number;
  
  /**
   * 当前上传速度（bytes/s）
   */
  currentSpeed: number;
}

/**
 * 队列项接口（内部使用）
 */
export interface QueueItem {
  /**
   * 请求ID
   */
  id: string;
  
  /**
   * 请求选项
   */
  options: RequestOptions;
  
  /**
   * 控制器
   */
  controller: AbortController;
  
  /**
   * 优先级
   */
  priority: number;
  
  /**
   * 时间戳
   */
  timestamp: number;
  
  /**
   * 成功回调
   */
  resolve: (value: RequestResult) => void;
  
  /**
   * 失败回调
   */
  reject: (reason: any) => void;
  
  /**
   * 是否正在运行
   */
  isRunning: boolean;
  
  /**
   * 重试次数
   */
  retryCount: number;
  
  /**
   * 最后错误
   */
  lastError?: Error;
}

/**
 * 请求优先级
 */
export enum RequestPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20
}

/**
 * 请求配置
 */
export interface RequestConfig {
  /**
   * 请求URL
   */
  url: string;

  /**
   * 请求方法
   */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

  /**
   * 请求头
   */
  headers?: Record<string, string>;

  /**
   * 请求体
   */
  data?: any;

  /**
   * 请求超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 是否携带凭证（cookies等）
   */
  withCredentials?: boolean;

  /**
   * 响应类型
   */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';

  /**
   * 请求ID（用于取消请求）
   */
  requestId?: string;

  /**
   * 其他配置选项
   */
  [key: string]: any;
}

/**
 * 重试选项
 */
export interface RetryOptions {
  /**
   * 最大重试次数
   */
  count?: number;

  /**
   * 重试延迟（毫秒）
   */
  delay?: number;

  /**
   * 是否使用指数退避策略
   */
  exponentialBackoff?: boolean;

  /**
   * 最大重试延迟（毫秒）
   */
  maxDelay?: number;

  /**
   * 自定义重试条件判断函数
   */
  shouldRetry?: (
    error: any,
    retryCount: number,
    config?: RequestConfig
  ) => boolean | Promise<boolean>;
}

/**
 * 响应数据
 */
export interface ResponseData<T = any> {
  /**
   * 响应数据
   */
  data: T;

  /**
   * 状态码
   */
  status: number;

  /**
   * 状态消息
   */
  statusText: string;

  /**
   * 响应头
   */
  headers: Record<string, string>;

  /**
   * 元数据（内部使用）
   */
  _meta?: {
    /**
     * 请求持续时间（毫秒）
     */
    duration: number;

    /**
     * 响应时间戳
     */
    timestamp: number;

    /**
     * 请求配置
     */
    config: RequestConfig;

    /**
     * 重试次数
     */
    retries: number;
  };
}

/**
 * 网络错误
 */
export class NetworkError extends Error {
  /**
   * 错误类型
   */
  public type: NetworkErrorType;

  /**
   * 相关数据
   */
  public data: any;

  /**
   * 创建网络错误
   * @param type 错误类型
   * @param message 错误消息
   * @param data 相关数据
   */
  constructor(type: NetworkErrorType, message: string, data?: any) {
    super(message);
    this.name = 'NetworkError';
    this.type = type;
    this.data = data;
  }
}

/**
 * 网络适配器接口
 */
export interface NetworkAdapter {
  /**
   * 发送请求
   * @param config 请求配置
   * @returns 响应数据
   */
  request<T = any>(config: RequestConfig): Promise<ResponseData<T>>;

  /**
   * 取消请求
   * @param requestId 请求ID
   * @returns 是否成功取消
   */
  cancelRequest?(requestId: string): boolean;

  /**
   * 取消所有请求
   * @param reason 取消原因
   */
  cancelAllRequests?(reason?: string): void;
}

/**
 * 网络管理器配置选项
 */
export interface NetworkManagerOptions {
  /**
   * 最大并发请求数
   */
  maxConcurrentRequests: number;

  /**
   * 默认请求超时时间（毫秒）
   */
  defaultTimeout: number;

  /**
   * 默认重试次数
   */
  defaultRetryCount: number;

  /**
   * 默认重试延迟（毫秒）
   */
  defaultRetryDelay: number;

  /**
   * 默认请求优先级
   */
  defaultPriority: RequestPriority;

  /**
   * 是否启用请求队列
   */
  enableQueue: boolean;
} 