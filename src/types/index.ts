/**
 * 类型定义
 * 统一导出所有类型
 */

// 导出插件相关类型
export * from './plugin';

// 导出网络相关类型
export * from './network';

// 导出服务相关类型
export * from './services';

// 导出国际化相关类型
export * from './i18n';

// 导出无障碍相关类型
export * from './accessibility';

// 导出调试相关类型
export * from './debug';

// 导出SDK相关类型
export * from './sdk';

// 导出监控相关类型
export * from './monitoring';

// 导出自适应上传相关类型
export * from './AdaptiveUploadTypes';

// 导出重试相关类型
export * from './retry';

// 导出WebAssembly相关类型
export * from './wasm';

// 导出存储相关类型
export * from './storage';

// 导出环境相关类型
export * from './environment';

// 导出错误相关类型
export * from './errors';

/**
 * 文件信息
 */
export interface FileInfo {
  /**
   * 文件名
   */
  name: string;
  
  /**
   * 文件大小
   */
  size: number;
  
  /**
   * MIME类型
   */
  type: string;
  
  /**
   * 文件唯一标识符
   */
  uid?: string;
}

/**
 * 文件处理器选项
 */
export interface FileProcessorOptions {
  /**
   * 默认分片大小（字节）
   */
  defaultChunkSize: number;
  
  /**
   * 最大文件大小（字节）
   */
  maxFileSize: number;
  
  /**
   * 允许的文件类型
   */
  allowedFileTypes: string[];
  
  /**
   * 禁止的文件类型
   */
  disallowedFileTypes: string[];
  
  /**
   * 是否验证文件类型
   */
  validateFileType: boolean;
  
  /**
   * 是否验证文件大小
   */
  validateFileSize: boolean;
  
  /**
   * 默认的哈希算法
   */
  defaultHashAlgorithm: HashAlgorithm;
  
  /**
   * 是否使用Worker计算哈希
   */
  useWorkerForHashing: boolean;
  
  /**
   * 是否允许上传空文件
   * @default false
   */
  allowEmptyFiles: boolean;
  
  /**
   * 是否自动修复文件名中的特殊字符
   * @default false
   */
  autoFixFileNames: boolean;
  
  /**
   * 是否检测浏览器对文件大小的限制
   * @default true
   */
  detectBrowserLimits: boolean;
}

/**
 * 分片选项
 */
export interface ChunkOptions {
  /**
   * 分片大小（字节）
   */
  chunkSize: number;
  
  /**
   * 如果最后一个分片为空，是否跳过
   */
  skipLastChunkIfEmpty: boolean;
  
  /**
   * 是否优先处理第一个分片（通常用于预览）
   */
  prioritizeFirstChunk: boolean;
}

/**
 * 文件分片
 */
export interface FileChunk {
  /**
   * 分片索引
   */
  index: number;
  
  /**
   * 在文件中的起始位置
   */
  start: number;
  
  /**
   * 在文件中的结束位置
   */
  end: number;
  
  /**
   * 分片大小
   */
  size: number;
  
  /**
   * 分片数据
   */
  blob: Blob;
  
  /**
   * 分片总数
   */
  total: number;
  
  /**
   * 分片优先级
   */
  priority: number;
}

/**
 * 哈希算法
 */
export enum HashAlgorithm {
  MD5 = 'md5',
  SHA1 = 'sha1',
  SHA256 = 'sha256',
  SHA512 = 'sha512',
  CRC32 = 'crc32'
}

/**
 * 文件哈希结果
 */
export interface FileHashResult {
  /**
   * 哈希值
   */
  hash: string;
  
  /**
   * 使用的算法
   */
  algorithm: HashAlgorithm;
  
  /**
   * 文件名
   */
  fileName: string;
  
  /**
   * 文件大小
   */
  fileSize: number;
}

/**
 * 文件验证错误
 */
export class FileValidationError extends Error {
  /**
   * 错误代码
   */
  code: string;
  
  /**
   * 错误数据
   */
  data?: Record<string, any>;
  
  /**
   * 构造函数
   * @param code 错误代码
   * @param data 错误数据
   */
  constructor(code: string, data?: Record<string, any>) {
    const message = `文件验证失败: ${code}`;
    super(message);
    this.name = 'FileValidationError';
    this.code = code;
    this.data = data;
  }
}

/**
 * 上传选项
 */
export interface UploadOptions {
  /**
   * 目标URL
   */
  url: string;
  
  /**
   * 请求方法
   */
  method?: string;
  
  /**
   * 额外的请求头
   */
  headers?: Record<string, string>;
  
  /**
   * 额外的表单数据
   */
  formData?: Record<string, any>;
  
  /**
   * 文件字段名
   */
  fileFieldName?: string;
  
  /**
   * 并发数
   */
  concurrency?: number;
  
  /**
   * 分片大小
   */
  chunkSize?: number;
  
  /**
   * 重试次数
   */
  retryCount?: number;
  
  /**
   * 重试延迟（毫秒）
   */
  retryDelay?: number;
  
  /**
   * 超时时间（毫秒）
   */
  timeout?: number;
  
  /**
   * 是否自动开始
   */
  autoStart?: boolean;
  
  /**
   * 使用的上传策略
   */
  strategy?: string;
  
  /**
   * 进度回调
   */
  onProgress?: (progress: number) => void;
  
  /**
   * 成功回调
   */
  onSuccess?: (response: any) => void;
  
  /**
   * 错误回调
   */
  onError?: (error: Error) => void;
  
  /**
   * 是否启用断点续传
   */
  resume?: boolean;
  
  /**
   * 是否启用预检查（用于秒传）
   */
  precheck?: boolean;
  
  /**
   * 环境适配器
   */
  adapter?: string;
}

/**
 * 环境信息
 */
export interface EnvironmentInfo {
  /**
   * 设备类型
   */
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  
  /**
   * 浏览器信息
   */
  browser: {
    name: string;
    version: string;
  };
  
  /**
   * 操作系统信息
   */
  os: {
    name: string;
    version: string;
  };
  
  /**
   * 网络信息
   */
  network: {
    type?: string;
    downlink?: number;
    rtt?: number;
    effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
    saveData?: boolean;
  };
  
  /**
   * 硬件信息
   */
  hardware: {
    memory?: number;
    cores?: number;
    concurrency?: number;
  };
  
  /**
   * 功能支持信息
   */
  features: {
    serviceWorker: boolean;
    webWorker: boolean;
    webCrypto: boolean;
    webSocket: boolean;
    webRTC: boolean;
    indexedDB: boolean;
    webGL: boolean;
    fileSystem: boolean;
    shareAPI: boolean;
  };
  
  /**
   * 环境约束信息
   */
  constraints: {
    maxUploadSize?: number;
    maxConcurrency?: number;
    limitedMemory?: boolean;
    limitedCPU?: boolean;
    limitedNetwork?: boolean;
    isMiniProgram?: boolean;
    isServerSide?: boolean;
  };
  
  /**
   * 是否为生产环境
   */
  isProduction: boolean;
}

/**
 * 上传器选项接口
 * 
 * @remarks
 * UploaderOptions定义了fileChunkPro上传器的所有可配置选项。
 * 配置项按功能领域分组，方便使用和维护。
 */
export interface UploaderOptions {
  /**
   * 上传端点URL（必填）
   */
  endpoint: string;

  /**
   * 分片管理配置
   */
  chunk?: {
    /**
     * 分片大小策略
     * - 数字: 固定分片大小（字节）
     * - 'auto': 根据文件大小和网络状况自动调整
     * @default 'auto'
     */
    size?: number | 'auto';

    /**
     * 分片大小范围（仅当size为'auto'时生效）
     */
    sizeRange?: {
      /**
       * 最小分片大小（字节）
       * @default 256 * 1024 (256KB)
       */
      min?: number;

      /**
       * 最大分片大小（字节）
       * @default 10 * 1024 * 1024 (10MB)
       */
      max?: number;
    };

    /**
     * 是否对第一个分片使用更小的大小（有助于快速预览）
     * @default false
     */
    optimizeFirstChunk?: boolean;
  };

  /**
   * 并发与重试配置
   */
  network?: {
    /**
     * 最大并发上传数
     * @default 3（自动根据设备能力调整）
     */
    concurrency?: number;

    /**
     * 请求超时时间（毫秒）
     * @default 30000
     */
    timeout?: number;

    /**
     * 是否使用自适应网络策略
     * @default true
     */
    adaptive?: boolean;

    /**
     * 请求头
     */
    headers?: Record<string, string>;

    /**
     * 是否携带凭证（cookies）
     * @default false
     */
    withCredentials?: boolean;
  };

  /**
   * 重试策略配置
   */
  retry?: {
    /**
     * 最大重试次数
     * @default 3
     */
    count?: number;

    /**
     * 重试延迟（毫秒）
     * @default 1000
     */
    delay?: number;

    /**
     * 是否使用智能重试策略（根据错误类型和网络状况调整）
     * @default true
     */
    smart?: boolean;

    /**
     * 是否使用指数退避算法
     * @default true
     */
    exponentialBackoff?: boolean;

    /**
     * 可重试的状态码
     * @default [408, 429, 500, 502, 503, 504]
     */
    retryableStatusCodes?: number[];
  };

  /**
   * 文件验证配置
   */
  validation?: {
    /**
     * 允许的最大文件大小（字节）
     * @default 1073741824 (1GB)
     */
    maxFileSize?: number;

    /**
     * 允许上传的文件类型列表
     * 例如：['image/jpeg', 'image/png', '.pdf', '*.docx']
     */
    allowedFileTypes?: string[];

    /**
     * 不允许上传的文件类型列表
     */
    disallowedFileTypes?: string[];

    /**
     * 是否允许上传空文件
     * @default false
     */
    allowEmptyFiles?: boolean;
  };

  /**
   * 性能与资源管理配置
   */
  performance?: {
    /**
     * 是否使用Web Worker处理计算密集型任务
     * @default true (如环境支持)
     */
    useWorker?: boolean;

    /**
     * 最大内存使用率阈值（0-1）
     * @default 0.9
     */
    maxMemoryUsage?: number;

    /**
     * 是否启用性能监控
     * @default true
     */
    enableMonitoring?: boolean;

    /**
     * 性能检查间隔（毫秒）
     * @default 5000
     */
    checkInterval?: number;
  };

  /**
   * 功能开关配置
   */
  features?: {
    /**
     * 是否启用自动开始上传
     * @default true
     */
    autoStart?: boolean;

    /**
     * 是否启用断点续传
     * @default true
     */
    resumable?: boolean;

    /**
     * 是否启用秒传功能（通过文件指纹识别）
     * @default true
     */
    skipDuplicate?: boolean;

    /**
     * 是否启用断线自动重新连接
     * @default true
     */
    autoResume?: boolean;
  };

  /**
   * 安全配置
   */
  security?: {
    /**
     * 安全级别
     * @default 'standard'
     */
    level?: 'basic' | 'standard' | 'advanced';

    /**
     * 是否验证响应数据完整性
     * @default true
     */
    validateResponse?: boolean;

    /**
     * 是否进行内容类型校验
     * @default true
     */
    contentTypeValidation?: boolean;
  };

  /**
   * 调试配置
   */
  debug?: {
    /**
     * 是否启用调试模式
     * @default false
     */
    enabled?: boolean;

    /**
     * 日志级别
     * @default 'error'
     */
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';

    /**
     * 是否启用错误追踪
     * @default true
     */
    errorTracking?: boolean;
  };

  /**
   * 插件配置
   */
  plugins?: Array<any>;

  /**
   * 自定义存储引擎
   */
  storageEngine?: any;

  /**
   * 自定义上传策略
   */
  strategies?: Record<string, UploadStrategy>;

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 network.concurrency 替代
   */
  concurrency?: number;

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 retry.count 替代
   */
  retryCount?: number;

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 retry.delay 替代
   */
  retryDelay?: number;

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 chunk.size 替代
   */
  chunkSize?: number | 'auto';

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 network.timeout 替代
   */
  timeout?: number;

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 network.headers 替代
   */
  headers?: Record<string, string>;

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 performance.useWorker 替代 
   */
  useWorker?: boolean;

  /**
   * 废弃: 请使用新的分组配置
   * @deprecated 使用 features.autoStart 替代
   */
  autoStart?: boolean;

  /**
   * 其他自定义配置
   */
  [key: string]: any;
}

/**
 * 上传状态枚举
 */
export enum UploadStatus {
  /**
   * 等待中
   */
  WAITING = 'waiting',

  /**
   * 准备中
   */
  PREPARING = 'preparing',

  /**
   * 上传中
   */
  UPLOADING = 'uploading',

  /**
   * 暂停中
   */
  PAUSED = 'paused',

  /**
   * 已完成
   */
  COMPLETED = 'completed',

  /**
   * 失败
   */
  FAILED = 'failed',

  /**
   * 已取消
   */
  CANCELLED = 'cancelled',

  /**
   * 已超时
   */
  TIMEOUT = 'timeout'
}

/**
 * 文件元数据接口
 */
export interface FileMetadata {
  /**
   * 文件唯一标识符
   */
  fileId: string;

  /**
   * 创建时间
   */
  created: number;

  /**
   * 文件扩展名（不含点）
   */
  extension: string;

  /**
   * 验证警告
   */
  warnings?: string[];

  /**
   * 其他元数据
   */
  [key: string]: any;
}

/**
 * 分片信息接口
 */
export interface ChunkInfo {
  /**
   * 分片索引
   */
  index: number;

  /**
   * 起始字节
   */
  start: number;

  /**
   * 结束字节
   */
  end: number;

  /**
   * 分片大小
   */
  size: number;

  /**
   * 总分片数
   */
  total: number;

  /**
   * 分片状态
   */
  status?: 'pending' | 'uploading' | 'success' | 'failed' | 'retrying';

  /**
   * 上传进度（0-100）
   */
  progress?: number;

  /**
   * 重试次数
   */
  retries?: number;

  /**
   * 分片ID
   */
  id?: string;

  /**
   * 响应数据
   */
  response?: any;
}

/**
 * 文件验证结果
 */
export interface FileValidationResult {
  /**
   * 是否有效
   */
  valid: boolean;

  /**
   * 错误列表
   */
  errors: string[];

  /**
   * 警告列表
   */
  warnings: string[];
}

/**
 * 上传状态数据
 */
export interface UploadState {
  /**
   * 文件信息
   */
  fileInfo: FileInfo;

  /**
   * 已上传分片索引集合
   */
  uploadedChunks: number[];

  /**
   * 总分片数
   */
  totalChunks: number;

  /**
   * 分片大小
   */
  chunkSize: number;

  /**
   * 上传起始时间
   */
  startTime: number;

  /**
   * 上次更新时间
   */
  lastUpdated: number;

  /**
   * 自定义数据
   */
  [key: string]: any;
}

/**
 * 上传进度信息
 */
export interface UploadProgress {
  /**
   * 上传速度（字节/秒）
   */
  speed: number;

  /**
   * 已上传字节数
   */
  loaded: number;

  /**
   * 总字节数
   */
  total: number;

  /**
   * 百分比进度（0-100）
   */
  percent: number;

  /**
   * 已上传分片数
   */
  uploadedChunks: number;

  /**
   * 总分片数
   */
  totalChunks: number;

  /**
   * 剩余时间（秒）
   */
  timeRemaining: number;

  /**
   * 已用时间（秒）
   */
  timeElapsed: number;
}

/**
 * 上传统计信息
 */
export interface UploadStats {
  /**
   * 平均上传速度（字节/秒）
   */
  averageSpeed: number;

  /**
   * 峰值上传速度（字节/秒）
   */
  peakSpeed: number;

  /**
   * 总上传字节数
   */
  totalBytes: number;

  /**
   * 上传时长（毫秒）
   */
  duration: number;

  /**
   * 重试次数
   */
  retries: number;

  /**
   * 失败分片数
   */
  failedChunks: number;

  /**
   * 成功分片数
   */
  successfulChunks: number;
}

/**
 * 上传结果接口
 */
export interface UploadResult {
  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 文件信息
   */
  fileInfo: FileInfo;

  /**
   * 文件元数据
   */
  metadata: FileMetadata;

  /**
   * 服务器响应数据
   */
  response: any;

  /**
   * 上传统计信息
   */
  stats: UploadStats;

  /**
   * 错误信息（如果有）
   */
  error?: Error;
} 