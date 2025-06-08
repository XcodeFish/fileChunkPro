/**
 * fileChunkPro 类型定义
 * 集中定义项目中使用的类型
 */

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
  maxConcurrent: number;      // 最大并发数
  retryCount: number;         // 最大重试次数
  retryDelay: number;         // 重试延迟(毫秒)
  timeout: number;            // 任务超时时间(毫秒)
}

// 任务优先级枚举
export enum TaskPriority {
  LOW = 0,                    // 低优先级
  NORMAL = 1,                 // 正常优先级
  HIGH = 2,                   // 高优先级
  CRITICAL = 3                // 关键优先级
}

// 任务类型定义
export type Task = () => Promise<any>;

// 进度回调函数类型
export type ProgressCallback = (progress: number) => void;

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
  SECURITY_ERROR = 'SECURITY_ERROR',      // 安全错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'         // 未知错误
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
}

// 上传适配器接口
export interface IUploadAdapter {
  readChunk: (filePath: string, start: number, size: number) => Promise<ArrayBuffer>;
  uploadChunk: (url: string, chunk: ArrayBuffer, headers: Record<string, string>) => Promise<any>;
}

// 安全级别枚举
export enum SecurityLevel {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  ADVANCED = 'ADVANCED'
} 