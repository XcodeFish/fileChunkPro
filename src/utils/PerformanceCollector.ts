/**
 * PerformanceCollector - 性能监控点收集组件
 * 负责收集并上报各环境的性能数据
 */

import { getEnvironment } from './EnvUtils';
import PerformanceMonitor, { PerformanceStats } from './PerformanceMonitor';

/**
 * 性能监控点类型
 */
export enum PerformanceMetricType {
  UPLOAD_START = 'upload_start',
  UPLOAD_END = 'upload_end',
  CHUNK_PREPARE = 'chunk_prepare',
  CHUNK_START = 'chunk_start',
  CHUNK_END = 'chunk_end',
  MEMORY_PRESSURE = 'memory_pressure',
  NETWORK_CHANGE = 'network_change',
  ERROR_OCCUR = 'error_occur',
  RECOVERY_ATTEMPT = 'recovery_attempt',
  RECOVERY_SUCCESS = 'recovery_success',
}

/**
 * 性能监控点数据结构
 */
export interface PerformanceMetric {
  type: PerformanceMetricType;
  timestamp: number;
  value?: number;
  fileId?: string;
  chunkIndex?: number;
  metadata?: Record<string, any>;
  environment: string;
  performanceSnapshot?: Partial<PerformanceStats>;
}

/**
 * 性能数据收集选项
 */
export interface PerformanceCollectorOptions {
  /** 是否启用性能监控 */
  enabled?: boolean;
  /** 采样率(0-1) */
  samplingRate?: number;
  /** 最大存储的监控点数量 */
  maxMetrics?: number;
  /** 自动上报间隔(ms)，0表示不自动上报 */
  reportInterval?: number;
  /** 上报回调函数 */
  onReport?: (metrics: PerformanceMetric[]) => void;
}

/**
 * 性能监控点收集器
 * 负责收集、存储和上报性能数据
 */
export class PerformanceCollector {
  private static instance: PerformanceCollector;
  private options: Required<PerformanceCollectorOptions>;
  private metrics: PerformanceMetric[] = [];
  private performanceMonitor: PerformanceMonitor | null = null;
  private reportTimer: any = null;
  private environment: string;

  /**
   * 获取单例实例
   */
  public static getInstance(
    options?: PerformanceCollectorOptions
  ): PerformanceCollector {
    if (!PerformanceCollector.instance) {
      PerformanceCollector.instance = new PerformanceCollector(options);
    } else if (options) {
      PerformanceCollector.instance.updateOptions(options);
    }
    return PerformanceCollector.instance;
  }

  /**
   * 构造函数
   */
  private constructor(options?: PerformanceCollectorOptions) {
    this.options = {
      enabled: options?.enabled ?? true,
      samplingRate: options?.samplingRate ?? 1,
      maxMetrics: options?.maxMetrics ?? 1000,
      reportInterval: options?.reportInterval ?? 0,
      onReport: options?.onReport ?? (() => {}),
    };

    this.environment = getEnvironment();

    // 浏览器环境初始化性能监控器
    if (typeof window !== 'undefined') {
      this.performanceMonitor = new PerformanceMonitor();
    }

    this.setupAutoReporting();
  }

  /**
   * 更新配置选项
   */
  public updateOptions(options: Partial<PerformanceCollectorOptions>): void {
    this.options = { ...this.options, ...options };
    this.setupAutoReporting();
  }

  /**
   * 设置自动上报
   */
  private setupAutoReporting(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    if (this.options.enabled && this.options.reportInterval > 0) {
      this.reportTimer = setInterval(() => {
        this.report();
      }, this.options.reportInterval);
    }
  }

  /**
   * 采集性能监控点
   */
  public collect(
    type: PerformanceMetricType,
    value?: number,
    metadata?: Record<string, any>
  ): void {
    if (!this.options.enabled || Math.random() > this.options.samplingRate) {
      return;
    }

    const metric: PerformanceMetric = {
      type,
      timestamp: Date.now(),
      value,
      metadata,
      environment: this.environment,
    };

    // 添加性能快照
    if (this.performanceMonitor) {
      const stats = this.performanceMonitor.getCurrentStats();
      if (stats) {
        metric.performanceSnapshot = {
          memoryUsage: stats.memoryUsage,
          cpuUsage: stats.cpuUsage,
          networkLatency: stats.networkLatency,
          availableBandwidth: stats.availableBandwidth,
        };
      }
    }

    this.metrics.push(metric);

    // 超出最大数量时移除最旧的
    if (this.metrics.length > this.options.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * 上传文件开始监控点
   */
  public uploadStart(fileId: string, fileSize: number): void {
    this.collect(PerformanceMetricType.UPLOAD_START, fileSize, { fileId });
  }

  /**
   * 上传文件完成监控点
   */
  public uploadEnd(fileId: string, totalTime: number): void {
    this.collect(PerformanceMetricType.UPLOAD_END, totalTime, { fileId });
  }

  /**
   * 分片准备监控点
   */
  public chunkPrepare(
    fileId: string,
    chunkIndex: number,
    chunkSize: number
  ): void {
    this.collect(PerformanceMetricType.CHUNK_PREPARE, chunkSize, {
      fileId,
      chunkIndex,
    });
  }

  /**
   * 分片上传开始监控点
   */
  public chunkStart(fileId: string, chunkIndex: number): void {
    this.collect(PerformanceMetricType.CHUNK_START, undefined, {
      fileId,
      chunkIndex,
    });
  }

  /**
   * 分片上传完成监控点
   */
  public chunkEnd(
    fileId: string,
    chunkIndex: number,
    uploadTime: number
  ): void {
    this.collect(PerformanceMetricType.CHUNK_END, uploadTime, {
      fileId,
      chunkIndex,
    });
  }

  /**
   * 内存压力监控点
   */
  public memoryPressure(usedMemory: number, availableMemory: number): void {
    this.collect(PerformanceMetricType.MEMORY_PRESSURE, usedMemory, {
      availableMemory,
    });
  }

  /**
   * 网络变化监控点
   */
  public networkChange(latency: number, bandwidth: number): void {
    this.collect(PerformanceMetricType.NETWORK_CHANGE, latency, { bandwidth });
  }

  /**
   * 错误发生监控点
   */
  public errorOccur(errorCode: string, errorMessage: string): void {
    this.collect(PerformanceMetricType.ERROR_OCCUR, undefined, {
      errorCode,
      errorMessage,
    });
  }

  /**
   * 手动上报数据
   */
  public report(): void {
    if (!this.options.enabled || this.metrics.length === 0) {
      return;
    }

    // 复制当前指标，然后清空
    const metricsToReport = [...this.metrics];
    this.metrics = [];

    // 调用上报回调
    if (this.options.onReport) {
      this.options.onReport(metricsToReport);
    }
  }

  /**
   * 获取当前所有监控点
   */
  public getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * 清空所有监控点
   */
  public clear(): void {
    this.metrics = [];
  }

  /**
   * 销毁收集器
   */
  public destroy(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    if (this.performanceMonitor) {
      this.performanceMonitor.stop();
      this.performanceMonitor = null;
    }

    this.metrics = [];
  }
}

export default PerformanceCollector;
