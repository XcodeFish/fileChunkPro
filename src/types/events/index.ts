/**
 * 事件系统相关类型定义
 */

import { FileInfo, ChunkInfo } from '..';

/**
 * 事件处理函数类型
 */
export type EventHandler<T = any> = (data: T) => void;

/**
 * 事件订阅信息
 */
export interface EventSubscription {
  /**
   * 取消订阅函数
   */
  unsubscribe: () => void;
}

/**
 * 事件总线选项
 */
export interface EventBusOptions {
  /**
   * 是否启用调试模式
   */
  debug?: boolean;
  
  /**
   * 是否允许异步处理事件
   */
  allowAsync?: boolean;
  
  /**
   * 最大缓存的事件历史数量
   */
  maxHistorySize?: number;
  
  /**
   * 错误处理函数
   */
  onError?: (error: Error, eventName: string, data: any) => void;
}

/**
 * 公共上传事件数据结构
 */

/**
 * 上传开始事件数据
 */
export interface UploadStartEventData {
  /**
   * 文件ID
   */
  fileId: string;
  
  /**
   * 文件信息
   */
  fileInfo: FileInfo;
  
  /**
   * 上传选项
   */
  options: Record<string, any>;
  
  /**
   * 时间戳
   */
  timestamp: number;
}

/**
 * 上传进度事件数据
 */
export interface UploadProgressEventData {
  /**
   * 文件ID
   */
  fileId: string;
  
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
   * 已用时间（毫秒）
   */
  timeElapsed: number;
  
  /**
   * 预计剩余时间（毫秒）
   */
  timeRemaining: number;
  
  /**
   * 上传速度（字节/秒）
   */
  speed: number;
  
  /**
   * 时间戳
   */
  timestamp: number;
}

/**
 * 上传成功事件数据
 */
export interface UploadSuccessEventData {
  /**
   * 文件ID
   */
  fileId: string;
  
  /**
   * 文件信息
   */
  fileInfo: FileInfo;
  
  /**
   * 服务器响应
   */
  response: any;
  
  /**
   * 上传统计信息
   */
  stats: {
    /**
     * 总上传时间（毫秒）
     */
    totalTime: number;
    
    /**
     * 平均上传速度（字节/秒）
     */
    averageSpeed: number;
    
    /**
     * 总重试次数
     */
    totalRetries: number;
  };
  
  /**
   * 时间戳
   */
  timestamp: number;
}

/**
 * 上传错误事件数据
 */
export interface UploadErrorEventData {
  /**
   * 文件ID
   */
  fileId: string;
  
  /**
   * 错误对象
   */
  error: Error;
  
  /**
   * 错误阶段
   */
  phase: 'preparation' | 'validation' | 'uploading' | 'completing';
  
  /**
   * 失败的分片（如果有）
   */
  chunk?: ChunkInfo;
  
  /**
   * 是否为致命错误（不可恢复）
   */
  fatal: boolean;
  
  /**
   * 重试次数（如果已尝试重试）
   */
  retries?: number;
  
  /**
   * 时间戳
   */
  timestamp: number;
}

/**
 * 上传暂停事件数据
 */
export interface UploadPauseEventData {
  /**
   * 文件ID
   */
  fileId: string;
  
  /**
   * 当前进度（0-1）
   */
  progress: number;
  
  /**
   * 用户发起的暂停还是系统发起的暂停
   */
  initiatedBy: 'user' | 'system';
  
  /**
   * 如果是系统暂停，原因是什么
   */
  reason?: string;
  
  /**
   * 时间戳
   */
  timestamp: number;
}

/**
 * 上传恢复事件数据
 */
export interface UploadResumeEventData {
  /**
   * 文件ID
   */
  fileId: string;
  
  /**
   * 恢复位置（即当前进度，0-1）
   */
  resumeAt: number;
  
  /**
   * 暂停持续时间（毫秒）
   */
  pauseDuration: number;
  
  /**
   * 用户发起的恢复还是系统发起的恢复
   */
  initiatedBy: 'user' | 'system';
  
  /**
   * 时间戳
   */
  timestamp: number;
}

/**
 * 上传取消事件数据
 */
export interface UploadCancelEventData {
  /**
   * 文件ID
   */
  fileId: string;
  
  /**
   * 取消时的进度（0-1）
   */
  progress: number;
  
  /**
   * 用户发起的取消还是系统发起的取消
   */
  initiatedBy: 'user' | 'system';
  
  /**
   * 取消原因
   */
  reason?: string;
  
  /**
   * 时间戳
   */
  timestamp: number;
} 