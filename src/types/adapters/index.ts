/**
 * 环境适配器相关类型定义
 */

import { Environment } from '../environment';

/**
 * 适配器配置选项
 */
export interface AdapterOptions {
  /**
   * 是否自动重试失败请求
   */
  autoRetry?: boolean;
  
  /**
   * 最大重试次数
   */
  maxRetries?: number;
  
  /**
   * 重试延迟（毫秒）
   */
  retryDelay?: number;
  
  /**
   * 是否使用指数退避重试策略
   */
  useExponentialBackoff?: boolean;
  
  /**
   * 最大超时时间（毫秒）
   */
  timeout?: number;
  
  /**
   * 是否携带凭证（如cookies等）
   */
  withCredentials?: boolean;
  
  /**
   * 请求/响应拦截器
   */
  interceptors?: {
    request?: Array<(data: any) => any>;
    response?: Array<(data: any) => any>;
  };
  
  /**
   * 适配器特定配置
   */
  [key: string]: any;
}

/**
 * 上传选项
 */
export interface UploadOptions {
  /**
   * 上传URL
   */
  url: string;
  
  /**
   * HTTP方法
   */
  method?: string;
  
  /**
   * 请求头
   */
  headers?: Record<string, string>;
  
  /**
   * 查询参数
   */
  query?: Record<string, string>;
  
  /**
   * 表单数据
   */
  data?: Record<string, any>;
  
  /**
   * 进度回调
   */
  onProgress?: (progress: ProgressInfo) => void;
  
  /**
   * 超时时间（毫秒）
   */
  timeout?: number;
  
  /**
   * 响应类型
   */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  
  /**
   * 最大重试次数
   */
  retries?: number;
  
  /**
   * 重试延迟（毫秒）
   */
  retryDelay?: number;
  
  /**
   * 是否使用批量上传模式
   */
  batch?: boolean;
  
  /**
   * 是否取消之前的上传请求
   */
  cancelPrevious?: boolean;
  
  /**
   * 是否添加禁止缓存参数
   */
  noCache?: boolean;
}

/**
 * 进度信息
 */
export interface ProgressInfo {
  /**
   * 已上传字节数
   */
  loaded: number;
  
  /**
   * 总字节数
   */
  total: number;
  
  /**
   * 进度百分比（0-1）
   */
  progress: number;
  
  /**
   * 当前上传速度（字节/秒）
   */
  speed?: number;
  
  /**
   * 预计剩余时间（秒）
   */
  timeRemaining?: number;
}

/**
 * 上传适配器接口
 * 定义不同环境（浏览器、小程序等）的上传实现
 */
export interface IUploadAdapter {
  /**
   * 获取适配器环境类型
   */
  getEnvironment(): Environment;
  
  /**
   * 上传文件或二进制数据
   * @param blob 要上传的数据
   * @param options 上传选项
   */
  upload(blob: Blob | ArrayBuffer | File, options: UploadOptions): Promise<any>;
  
  /**
   * 中止当前上传
   */
  abort(): void;
  
  /**
   * 获取当前是否正在上传
   */
  isUploading(): boolean;
  
  /**
   * 销毁适配器并释放资源
   */
  dispose(): void;
}

/**
 * 环境检测结果
 */
export interface EnvironmentDetection {
  /**
   * 环境类型
   */
  environment: Environment;
  
  /**
   * 环境版本
   */
  version?: string;
  
  /**
   * 环境细节
   */
  details: Record<string, any>;
  
  /**
   * 环境功能支持
   */
  capabilities: {
    /**
     * 是否支持分片上传
     */
    supportsChunkedUpload: boolean;
    
    /**
     * 是否支持断点续传
     */
    supportsResumableUpload: boolean;
    
    /**
     * 是否支持二进制数据处理
     */
    supportsBinaryProcessing: boolean;
    
    /**
     * 是否支持并行上传
     */
    supportsParallelUploads: boolean;
    
    /**
     * 是否支持上传进度
     */
    supportsProgress: boolean;
    
    /**
     * 是否支持自定义请求头
     */
    supportsCustomHeaders: boolean;
    
    /**
     * 是否支持WebWorker
     */
    supportsWebWorker: boolean;
    
    /**
     * 是否支持ServiceWorker
     */
    supportsServiceWorker: boolean;
  };
} 