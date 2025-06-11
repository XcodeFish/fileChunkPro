/**
 * Core模块相关类型定义
 */

import { UploadStrategy } from '../AdaptiveUploadTypes';

/**
 * 依赖容器服务键名
 */
export type ServiceKey = string;

/**
 * 依赖容器服务实例
 */
export type ServiceInstance = any;

/**
 * 依赖容器工厂函数
 */
export type ServiceFactory = () => ServiceInstance;

/**
 * 任务调度器配置
 */
export interface TaskSchedulerOptions {
  /**
   * 最大并发数
   */
  concurrency: number;

  /**
   * 最大重试次数
   */
  retryCount?: number;

  /**
   * 重试延迟（毫秒）
   */
  retryDelay?: number;

  /**
   * 请求超时（毫秒）
   */
  timeout?: number;
}

/**
 * 任务状态（用于内部状态管理）
 */
export enum TaskState {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
  ABORTED = 'aborted'
}

/**
 * 上传任务状态
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

/**
 * 上传任务
 */
export interface UploadTask {
  /**
   * 任务ID
   */
  id: string;

  /**
   * 文件ID
   */
  fileId: string;

  /**
   * 分片索引
   */
  chunkIndex: number;

  /**
   * 任务状态
   */
  status: TaskStatus;

  /**
   * 重试次数
   */
  retries: number;

  /**
   * 上传进度
   */
  progress: number;

  /**
   * 上传开始时间
   */
  startTime?: number;

  /**
   * 上传结束时间
   */
  endTime?: number;

  /**
   * 执行函数
   */
  execute: () => Promise<any>;

  /**
   * 取消函数
   */
  cancel: () => void;

  /**
   * 暂停函数
   */
  pause: () => void;

  /**
   * 恢复函数
   */
  resume: () => void;

  /**
   * 优先级（值越小，优先级越高）
   */
  priority: number;
}

/**
 * 上传性能统计数据
 */
export interface UploadPerformanceStats {
  /**
   * 平均上传速度（字节/秒）
   */
  averageSpeed: number;

  /**
   * 峰值上传速度（字节/秒）
   */
  peakSpeed: number;

  /**
   * 已上传字节数
   */
  uploadedBytes: number;

  /**
   * 总字节数
   */
  totalBytes: number;

  /**
   * 上传开始时间戳
   */
  startTime: number;

  /**
   * 上传结束时间戳（如果尚未完成则为null）
   */
  endTime: number | null;

  /**
   * 累计暂停时间（毫秒）
   */
  pauseDuration: number;

  /**
   * 网络连接丢失次数
   */
  connectionLostCount: number;

  /**
   * 重试次数
   */
  retriesCount: number;

  /**
   * 处理器使用率（如果可用）
   */
  cpuUsage?: number;

  /**
   * 内存使用情况（如果可用）
   */
  memoryUsage?: number;

  /**
   * 网络吞吐量历史数据（时间戳 -> 速度）
   */
  throughputHistory?: Record<number, number>;
}

/**
 * 设备能力信息
 */
export interface DeviceCapability {
  /**
   * CPU核心数
   */
  cpuCores: number;

  /**
   * 内存大小（字节）
   */
  memorySize?: number;

  /**
   * 处理器类型
   */
  processorType?: string;

  /**
   * 是否为低端设备
   */
  isLowEndDevice: boolean;

  /**
   * 是否为高端设备
   */
  isHighEndDevice: boolean;

  /**
   * 设备得分（1-10，用于性能评估）
   */
  deviceScore: number;

  /**
   * 最大并发连接数建议
   */
  recommendedConcurrency: number;

  /**
   * 最大分片大小建议（字节）
   */
  recommendedChunkSize: number;

  /**
   * 是否支持Web Worker
   */
  supportsWebWorker: boolean;

  /**
   * 是否支持ServiceWorker
   */
  supportsServiceWorker: boolean;

  /**
   * 是否支持WebCrypto API
   */
  supportsWebCrypto: boolean;

  /**
   * 是否支持IndexedDB
   */
  supportsIndexedDB: boolean;

  /**
   * 是否支持WebSocket
   */
  supportsWebSocket: boolean;
} 