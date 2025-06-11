/**
 * 插件系统类型定义
 */

import { UploaderCore } from '../core/UploaderCore';
import { UploadFile } from './core';
import { IUploadAdapter } from './adapters';
import { UploadErrorType } from './errors';

/**
 * 插件接口定义
 * 所有插件必须实现此接口
 */
export interface IPlugin {
  /**
   * 插件名称
   */
  readonly name: string;

  /**
   * 插件版本
   */
  readonly version: string;

  /**
   * 插件安装方法
   * @param core 上传核心实例
   * @param options 插件配置项
   */
  install(core: UploaderCore, options?: Record<string, any>): void;

  /**
   * 插件卸载方法
   * @param core 上传核心实例
   */
  uninstall?(core: UploaderCore): void;
}

/**
 * 插件生命周期钩子类型
 */
export enum PluginHookType {
  // 文件处理相关钩子
  BEFORE_FILE_PROCESS = 'beforeFileProcess',
  AFTER_FILE_PROCESS = 'afterFileProcess',
  
  // 分片处理相关钩子
  BEFORE_CHUNK_PROCESS = 'beforeChunkProcess',
  AFTER_CHUNK_PROCESS = 'afterChunkProcess',
  
  // 上传流程相关钩子
  BEFORE_UPLOAD = 'beforeUpload',
  AFTER_UPLOAD = 'afterUpload',
  BEFORE_RESUME = 'beforeResume',
  AFTER_RESUME = 'afterResume',
  
  // 错误处理相关钩子
  ON_ERROR = 'onError',
  
  // 状态变更相关钩子
  ON_PROGRESS_CHANGE = 'onProgressChange',
  ON_STATUS_CHANGE = 'onStatusChange',
  
  // 配置变更相关钩子
  ON_CONFIG_CHANGE = 'onConfigChange'
}

/**
 * 插件钩子函数定义
 */
export type PluginHook<T = any> = (data: T) => Promise<T> | T;

/**
 * 插件上下文接口
 */
export interface IPluginContext {
  /**
   * 获取指定名称的插件实例
   * @param name 插件名称
   */
  getPlugin(name: string): IPlugin | null;
  
  /**
   * 注册插件钩子
   * @param type 钩子类型
   * @param hook 钩子函数
   */
  registerHook(type: PluginHookType, hook: PluginHook): void;
  
  /**
   * 移除指定的插件钩子
   * @param type 钩子类型
   * @param hook 钩子函数
   */
  unregisterHook(type: PluginHookType, hook: PluginHook): void;
  
  /**
   * 获取当前上传适配器
   */
  getAdapter(): IUploadAdapter;
  
  /**
   * 获取当前配置
   */
  getConfig(): Record<string, any>;
}

/**
 * 分片插件配置
 */
export interface IChunkPluginOptions {
  /**
   * 分片大小（以字节为单位）
   * @default 2097152 (2MB)
   */
  chunkSize?: number;
  
  /**
   * 分片策略
   * 'fixed' - 固定大小分片
   * 'dynamic' - 根据网络状况动态调整分片大小
   * @default 'fixed'
   */
  chunkStrategy?: 'fixed' | 'dynamic';
  
  /**
   * 动态分片大小的最小值（以字节为单位）
   * @default 524288 (512KB)
   */
  minChunkSize?: number;
  
  /**
   * 动态分片大小的最大值（以字节为单位）
   * @default 8388608 (8MB)
   */
  maxChunkSize?: number;
  
  /**
   * 分片处理并行度
   * @default 1
   */
  parallelProcessing?: number;
  
  /**
   * 是否使用Worker线程处理分片
   * @default true
   */
  useWorker?: boolean;
}

/**
 * 并发控制插件配置
 */
export interface IConcurrencyPluginOptions {
  /**
   * 最大并发上传数
   * @default 3
   */
  maxConcurrentUploads?: number;
  
  /**
   * 单文件最大并发分片上传数
   * @default 3
   */
  maxConcurrentChunks?: number;
  
  /**
   * 分片上传超时时间（毫秒）
   * @default 30000 (30s)
   */
  chunkUploadTimeout?: number;
  
  /**
   * 上传失败重试次数
   * @default 3
   */
  retries?: number;
  
  /**
   * 重试延迟（毫秒）
   * @default 1000 (1s)
   */
  retryDelay?: number;
  
  /**
   * 是否使用指数退避算法进行重试延迟
   * @default true
   */
  useExponentialBackoff?: boolean;
  
  /**
   * 网络状况检测间隔（毫秒）
   * @default 5000 (5s)
   */
  networkDetectionInterval?: number;
  
  /**
   * 重试策略
   * 'immediate' - 立即重试
   * 'delayed' - 延迟重试
   * 'conditional' - 根据错误类型决定重试策略
   * @default 'conditional'
   */
  retryStrategy?: 'immediate' | 'delayed' | 'conditional';
}

/**
 * 断点续传插件配置
 */
export interface IResumePluginOptions {
  /**
   * 是否启用断点续传
   * @default true
   */
  enabled?: boolean;
  
  /**
   * 存储方式
   * 'localStorage' - 使用localStorage存储断点信息
   * 'indexedDB' - 使用indexedDB存储断点信息
   * 'memory' - 仅在内存中存储断点信息（页面刷新后丢失）
   * 'custom' - 使用自定义存储方式
   * @default 'localStorage'
   */
  storageType?: 'localStorage' | 'indexedDB' | 'memory' | 'custom';
  
  /**
   * 自定义存储实现（当storageType为custom时使用）
   */
  customStorage?: {
    getItem(key: string): Promise<any> | any;
    setItem(key: string, value: any): Promise<void> | void;
    removeItem(key: string): Promise<void> | void;
  };
  
  /**
   * 存储键名前缀
   * @default 'filechunkpro_resume_'
   */
  keyPrefix?: string;
  
  /**
   * 断点信息过期时间（毫秒）
   * @default 7 * 24 * 60 * 60 * 1000 (7天)
   */
  expiration?: number;
  
  /**
   * 是否在上传完成后自动清理断点信息
   * @default true
   */
  autoCleanup?: boolean;
  
  /**
   * 是否在验证失败后重新上传整个文件
   * @default false
   */
  reuploadOnVerificationFailure?: boolean;
  
  /**
   * 存储空间超限处理策略
   * 'error' - 抛出错误
   * 'lru' - 使用LRU算法移除最久未使用的记录
   * 'size' - 移除最大的记录
   * @default 'lru'
   */
  storageLimitStrategy?: 'error' | 'lru' | 'size';
}

/**
 * 文件校验插件配置
 */
export interface IValidatorPluginOptions {
  /**
   * 文件大小限制（以字节为单位）
   */
  maxSize?: number;
  
  /**
   * 文件大小下限（以字节为单位）
   */
  minSize?: number;
  
  /**
   * 允许的文件类型列表（MIME类型）
   */
  allowedTypes?: string[];
  
  /**
   * 禁止的文件类型列表（MIME类型）
   */
  forbiddenTypes?: string[];
  
  /**
   * 文件扩展名白名单
   */
  allowedExtensions?: string[];
  
  /**
   * 文件扩展名黑名单
   */
  forbiddenExtensions?: string[];
  
  /**
   * 是否在上传前进行文件内容校验（如检查文件签名）
   * @default false
   */
  validateContent?: boolean;
  
  /**
   * 文件内容验证函数
   * @param file 待验证的文件
   * @returns 验证结果，true表示验证通过，false表示验证失败
   */
  contentValidator?: (file: UploadFile) => Promise<boolean> | boolean;
  
  /**
   * 是否在上传前检查文件是否损坏
   * @default false
   */
  checkFileIntegrity?: boolean;
  
  /**
   * 验证失败时的错误类型
   * @default UploadErrorType.VALIDATION_ERROR
   */
  errorType?: UploadErrorType;
}

/**
 * 进度监控插件配置
 */
export interface IProgressPluginOptions {
  /**
   * 进度更新频率（毫秒）
   * @default 200
   */
  throttleTime?: number;
  
  /**
   * 是否启用精确计算进度（考虑不同大小分片权重）
   * @default true
   */
  preciseProgress?: boolean;
  
  /**
   * 是否在上传开始时立即触发进度事件
   * @default true
   */
  emitStartProgress?: boolean;
  
  /**
   * 是否在上传完成时立即触发100%进度事件
   * @default true
   */
  emitCompleteProgress?: boolean;
  
  /**
   * 是否启用速率计算
   * @default true
   */
  calculateSpeed?: boolean;
  
  /**
   * 速率计算窗口大小（数据点数量）
   * @default 10
   */
  speedCalculationWindow?: number;
  
  /**
   * 是否启用剩余时间估计
   * @default true
   */
  estimateRemainingTime?: boolean;
}

/**
 * 预检插件配置（秒传插件）
 */
export interface IPrecheckPluginOptions {
  /**
   * 是否启用文件预检（秒传功能）
   * @default true
   */
  enabled?: boolean;
  
  /**
   * 文件指纹算法
   * 'md5' - 使用MD5算法
   * 'sha1' - 使用SHA1算法
   * 'sha256' - 使用SHA256算法
   * @default 'md5'
   */
  fingerprintAlgorithm?: 'md5' | 'sha1' | 'sha256';
  
  /**
   * 是否使用Worker线程计算文件指纹
   * @default true
   */
  useWorker?: boolean;
  
  /**
   * 文件大小阈值，超过该大小将使用采样指纹（以字节为单位）
   * @default 52428800 (50MB)
   */
  sampleThreshold?: number;
  
  /**
   * 采样指纹采样点数量
   * @default 20
   */
  sampleCount?: number;
  
  /**
   * 采样指纹采样块大小（以字节为单位）
   * @default 16384 (16KB)
   */
  sampleSize?: number;
  
  /**
   * 用于匹配服务端的自定义指纹函数
   * @param file 要计算指纹的文件
   * @returns 文件指纹
   */
  customFingerprint?: (file: UploadFile) => Promise<string> | string;
  
  /**
   * 预检超时时间（毫秒）
   * @default 10000 (10s)
   */
  timeout?: number;
}

/**
 * 安全插件基础配置
 */
export interface IBasicSecurityPluginOptions {
  /**
   * 是否启用请求签名
   * @default true
   */
  enableSignature?: boolean;
  
  /**
   * 签名算法
   * 'hmac-sha1' - HMAC-SHA1
   * 'hmac-sha256' - HMAC-SHA256
   * 'custom' - 自定义签名算法
   * @default 'hmac-sha256'
   */
  signatureAlgorithm?: 'hmac-sha1' | 'hmac-sha256' | 'custom';
  
  /**
   * 自定义签名函数
   * @param data 要签名的数据
   * @param secret 签名密钥
   * @returns 签名结果
   */
  customSign?: (data: any, secret: string) => Promise<string> | string;
  
  /**
   * 是否在请求中携带令牌
   * @default true
   */
  enableToken?: boolean;
  
  /**
   * 令牌获取函数
   * @returns 认证令牌
   */
  getToken?: () => Promise<string> | string;
  
  /**
   * 令牌刷新函数
   * @param oldToken 旧令牌
   * @returns 新令牌
   */
  refreshToken?: (oldToken: string) => Promise<string> | string;
  
  /**
   * 令牌过期检测函数
   * @param response 服务器响应
   * @returns 令牌是否已过期
   */
  isTokenExpired?: (response: any) => boolean;
}

/**
 * 标准安全插件配置，扩展基础安全插件配置
 */
export interface IStandardSecurityPluginOptions extends IBasicSecurityPluginOptions {
  /**
   * 是否启用参数加密
   * @default false
   */
  enableParameterEncryption?: boolean;
  
  /**
   * 参数加密算法
   * 'aes-cbc' - AES-CBC
   * 'aes-gcm' - AES-GCM
   * 'custom' - 自定义加密算法
   * @default 'aes-cbc'
   */
  parameterEncryptionAlgorithm?: 'aes-cbc' | 'aes-gcm' | 'custom';
  
  /**
   * 自定义参数加密函数
   * @param data 要加密的数据
   * @param key 加密密钥
   * @returns 加密结果
   */
  customParameterEncrypt?: (data: any, key: string) => Promise<string> | string;
  
  /**
   * 是否启用请求防重放
   * @default true
   */
  enableAntiReplay?: boolean;
  
  /**
   * 请求时间戳有效期（毫秒）
   * @default 60000 (1分钟)
   */
  timestampValidityPeriod?: number;
  
  /**
   * 请求唯一标识生成函数
   * @returns 唯一标识
   */
  generateNonce?: () => string;
}

/**
 * 高级安全插件配置，扩展标准安全插件配置
 */
export interface IAdvancedSecurityPluginOptions extends IStandardSecurityPluginOptions {
  /**
   * 是否启用文件内容加密
   * @default false
   */
  enableContentEncryption?: boolean;
  
  /**
   * 文件内容加密算法
   * 'aes-cbc' - AES-CBC
   * 'aes-gcm' - AES-GCM
   * 'custom' - 自定义加密算法
   * @default 'aes-cbc'
   */
  contentEncryptionAlgorithm?: 'aes-cbc' | 'aes-gcm' | 'custom';
  
  /**
   * 自定义文件内容加密函数
   * @param data 要加密的数据
   * @param key 加密密钥
   * @returns 加密结果和必要的加密参数
   */
  customContentEncrypt?: (data: ArrayBuffer, key: string) => Promise<{
    data: ArrayBuffer;
    iv: string;
    additionalData?: any;
  }> | {
    data: ArrayBuffer;
    iv: string;
    additionalData?: any;
  };
  
  /**
   * 加密密钥获取函数
   * @returns 加密密钥
   */
  getEncryptionKey?: () => Promise<string> | string;
  
  /**
   * 是否启用文件水印
   * @default false
   */
  enableWatermark?: boolean;
  
  /**
   * 水印配置
   */
  watermarkOptions?: {
    /**
     * 水印类型
     * 'text' - 文本水印
     * 'image' - 图像水印
     * @default 'text'
     */
    type?: 'text' | 'image';
    
    /**
     * 水印文本（type为text时有效）
     */
    text?: string;
    
    /**
     * 水印图片URL（type为image时有效）
     */
    imageUrl?: string;
    
    /**
     * 水印位置
     * 可以是数组形式的坐标 [x, y]
     * 或者预设位置 'top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'
     * @default 'center'
     */
    position?: [number, number] | 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
    
    /**
     * 水印不透明度
     * @default 0.3
     */
    opacity?: number;
  };
  
  /**
   * 是否启用上传审计日志
   * @default false
   */
  enableAuditLog?: boolean;
  
  /**
   * 审计日志配置
   */
  auditLogOptions?: {
    /**
     * 日志级别
     * 'basic' - 基本信息
     * 'detailed' - 详细信息
     * 'verbose' - 详尽信息
     * @default 'basic'
     */
    level?: 'basic' | 'detailed' | 'verbose';
    
    /**
     * 日志上报URL
     */
    reportUrl?: string;
    
    /**
     * 日志上报频率
     * 'realtime' - 实时上报
     * 'batch' - 批量上报
     * @default 'batch'
     */
    reportFrequency?: 'realtime' | 'batch';
    
    /**
     * 批量上报间隔（毫秒，reportFrequency为batch时有效）
     * @default 5000 (5s)
     */
    batchInterval?: number;
    
    /**
     * 是否在控制台输出日志（仅开发模式）
     * @default false
     */
    consoleOutput?: boolean;
  };
} 