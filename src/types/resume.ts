/**
 * resume.ts - 断点续传相关类型定义
 */

/**
 * 分片状态枚举
 */
export enum ChunkStatus {
  /** 待上传 */
  PENDING = 'pending',
  /** 上传中 */
  UPLOADING = 'uploading',
  /** 已上传 */
  UPLOADED = 'uploaded',
  /** 上传失败 */
  FAILED = 'failed',
  /** 已忽略 */
  SKIPPED = 'skipped'
}

/**
 * 上传状态枚举
 */
export enum UploadStatus {
  /** 等待中 */
  PENDING = 'pending',
  /** 上传中 */
  UPLOADING = 'uploading',
  /** 已暂停 */
  PAUSED = 'paused',
  /** 已完成 */
  COMPLETED = 'completed',
  /** 已取消 */
  CANCELLED = 'cancelled',
  /** 错误 */
  ERROR = 'error'
}

/**
 * 存储引擎类型枚举
 */
export enum StorageEngine {
  /** 本地存储 */
  LOCAL_STORAGE = 'localStorage',
  /** 会话存储 */
  SESSION_STORAGE = 'sessionStorage',
  /** 索引数据库 */
  INDEXED_DB = 'indexedDB',
  /** 内存存储 */
  MEMORY = 'memory',
  /** 自定义存储 */
  CUSTOM = 'custom'
}

/**
 * 分片元数据接口
 */
export interface ChunkMeta {
  /** 分片索引 */
  index: number;
  /** 起始字节位置 */
  start: number;
  /** 结束字节位置 */
  end: number;
  /** 分片大小 */
  size: number;
  /** 分片MD5（可选） */
  md5?: string;
  /** 其他元数据 */
  [key: string]: any;
}

/**
 * 已上传分片信息
 */
export interface UploadedChunkInfo {
  /** 分片索引 */
  index: number;
  /** 分片状态 */
  status: ChunkStatus;
  /** 上传时间 */
  uploadedAt: number;
  /** 服务器响应数据 */
  responseData?: any;
}

/**
 * 错误信息
 */
export interface ErrorInfo {
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string | number;
  /** 错误时间戳 */
  timestamp: number;
}

/**
 * 断点续传数据接口
 */
export interface ResumeData {
  /** 文件ID */
  fileId: string;
  /** 文件名 */
  fileName: string;
  /** 文件大小 */
  fileSize: number;
  /** 文件最后修改时间 */
  lastModified: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 总分片数 */
  totalChunks: number;
  /** 已上传分片 */
  uploadedChunks: UploadedChunkInfo[];
  /** 分片元数据 */
  chunkMeta: ChunkMeta[];
  /** 当前状态 */
  status: UploadStatus;
  /** 上传进度(0-1) */
  progress: number;
  /** 已上传字节数 */
  uploadedSize: number;
  /** 会话ID */
  sessionId: string;
  /** 错误信息 */
  error?: ErrorInfo;
  /** 服务器响应 */
  responseData?: any;
  /** 自定义数据 */
  customData?: Record<string, any>;
}

/**
 * 文件记录接口
 */
export interface FileRecord {
  /** 文件ID */
  fileId: string;
  /** 文件名 */
  fileName: string;
  /** 文件大小 */
  fileSize: number;
  /** 文件最后修改时间 */
  lastModified: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 上传状态 */
  status: UploadStatus;
  /** 上传进度(0-1) */
  progress: number;
  /** 已上传字节数 */
  uploadedSize: number;
}

/**
 * 存储选项接口
 */
export interface StorageOptions {
  /** 存储引擎 */
  engine: StorageEngine;
  /** 存储路径 */
  path: string;
  /** 存储命名空间 */
  namespace: string;
  /** 自定义存储实现(仅当engine为CUSTOM时使用) */
  customStorage?: any;
}

/**
 * 断点续传选项接口
 */
export interface ResumeOptions {
  /** 是否启用断点续传 */
  enabled?: boolean;
  /** 存储选项 */
  storage?: Partial<StorageOptions>;
  /** 最大文件记录数量 */
  maxFileRecords?: number;
  /** 分片校验字段 */
  chunkMetaFields?: string[];
  /** 自动保存间隔(毫秒) */
  checkpointInterval?: number;
  /** 过期时间(毫秒) */
  expirationTime?: number;
  /** 页面卸载前自动保存 */
  autoSaveOnUnload?: boolean;
} 