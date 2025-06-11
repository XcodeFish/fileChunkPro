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
  DEBUG_EVENT = 'debug_event', // 调试事件监控点
  LOG_ASSOCIATION = 'log_association', // 日志关联监控点
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
  priority?: number; // 监控点优先级，值越大优先级越高
}

/**
 * 采样策略类型
 */
export enum SamplingStrategy {
  ALWAYS = 'always', // 始终采集
  RANDOM = 'random', // 随机采样
  PRIORITY = 'priority', // 基于优先级
  ADAPTIVE = 'adaptive', // 自适应采样
  ERROR_BIASED = 'error_biased', // 错误偏好采样
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
  /** 采样策略 */
  samplingStrategy?: SamplingStrategy;
  /** 高优先级类型列表，这些类型始终采样 */
  highPriorityTypes?: PerformanceMetricType[];
  /** 系统资源阈值，达到阈值时降低采样率 */
  resourceThreshold?: {
    cpu?: number; // CPU使用率阈值，如0.8表示80%
    memory?: number; // 内存使用率阈值，如0.8表示80%
  };
  /** 自适应采样配置 */
  adaptiveSamplingConfig?: {
    minSamplingRate: number; // 最小采样率
    maxSamplingRate: number; // 最大采样率
    samplingAdjustInterval: number; // 采样率调整间隔(ms)
    cpuLoadWeight: number; // CPU负载权重 (0-1)
    memoryLoadWeight: number; // 内存负载权重 (0-1)
    eventRateWeight: number; // 事件频率权重 (0-1)
    eventRateThreshold: number; // 每秒事件阈值，超过此值进行调整
    gradualAdjustment: boolean; // 是否渐进式调整采样率
  };
  /** 监控点优先级映射，为每种类型指定优先级 */
  metricPriorities?: Partial<Record<PerformanceMetricType, number>>;
}

/**
 * 性能监控点索引接口
 * 用于高效查询和检索性能数据
 */
interface PerformanceMetricIndex {
  byId: Map<string, number>; // ID到数组索引的映射
  byType: Map<PerformanceMetricType, number[]>; // 类型到索引数组的映射
  byTimeRange: Map<string, number[]>; // 时间范围到索引数组的映射
  byFileId: Map<string, number[]>; // 文件ID到索引数组的映射
}

/**
 * 性能监控点收集器
 * 负责收集、存储和上报性能数据
 */
export class PerformanceCollector {
  private static instance: PerformanceCollector;
  private options: Required<PerformanceCollectorOptions>;
  private metrics: PerformanceMetric[] = [];
  private metricIndex: PerformanceMetricIndex = {
    byId: new Map(),
    byType: new Map(),
    byTimeRange: new Map(),
    byFileId: new Map(),
  };
  private performanceMonitor: PerformanceMonitor | null = null;
  private reportTimer: any = null;
  private environment: string;
  private currentSamplingRate: number;
  private adaptiveTimer: any = null;
  private lastResourceCheck = 0;
  private consecutiveHighResourceCount = 0;
  private eventCountPerSecond = 0; // 每秒事件数量
  private lastEventCountTime = 0; // 上次事件计数重置时间
  private lastEventTimestamps: number[] = []; // 最近事件时间戳，用于计算频率
  private adaptiveMaxTimeWindow = 5000; // 自适应最大时间窗口(ms)
  private priorityThresholds: Record<number, number> = {}; // 优先级阈值缓存

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
    const defaultAdaptiveSamplingConfig = {
      minSamplingRate: 0.1,
      maxSamplingRate: 1.0,
      samplingAdjustInterval: 30000,
      cpuLoadWeight: 0.4,
      memoryLoadWeight: 0.3,
      eventRateWeight: 0.3,
      eventRateThreshold: 50, // 每秒50个事件为阈值
      gradualAdjustment: true,
    };

    this.options = {
      enabled: options?.enabled ?? true,
      samplingRate: options?.samplingRate ?? 1,
      maxMetrics: options?.maxMetrics ?? 1000,
      reportInterval: options?.reportInterval ?? 0,
      onReport: options?.onReport ?? (() => {}),
      samplingStrategy: options?.samplingStrategy ?? SamplingStrategy.RANDOM,
      highPriorityTypes: options?.highPriorityTypes ?? [
        PerformanceMetricType.ERROR_OCCUR,
        PerformanceMetricType.MEMORY_PRESSURE,
        PerformanceMetricType.RECOVERY_ATTEMPT,
      ],
      resourceThreshold: options?.resourceThreshold ?? {
        cpu: 0.8,
        memory: 0.8,
      },
      adaptiveSamplingConfig:
        options?.adaptiveSamplingConfig ?? defaultAdaptiveSamplingConfig,
      metricPriorities: options?.metricPriorities ?? {
        [PerformanceMetricType.ERROR_OCCUR]: 100,
        [PerformanceMetricType.MEMORY_PRESSURE]: 90,
        [PerformanceMetricType.RECOVERY_ATTEMPT]: 80,
        [PerformanceMetricType.NETWORK_CHANGE]: 70,
        [PerformanceMetricType.UPLOAD_START]: 60,
        [PerformanceMetricType.UPLOAD_END]: 60,
        [PerformanceMetricType.CHUNK_START]: 40,
        [PerformanceMetricType.CHUNK_END]: 40,
        [PerformanceMetricType.CHUNK_PREPARE]: 30,
        [PerformanceMetricType.DEBUG_EVENT]: 20,
        [PerformanceMetricType.LOG_ASSOCIATION]: 10,
      },
    };

    this.currentSamplingRate = this.options.samplingRate;
    this.environment = getEnvironment();
    this.lastEventCountTime = Date.now();

    // 初始化索引
    Object.values(PerformanceMetricType).forEach(type => {
      if (typeof type === 'string') {
        this.metricIndex.byType.set(type as PerformanceMetricType, []);
      }
    });

    // 浏览器环境初始化性能监控器
    if (typeof window !== 'undefined') {
      this.performanceMonitor = new PerformanceMonitor();
      this.performanceMonitor.start();

      // 设置自适应采样
      if (this.options.samplingStrategy === SamplingStrategy.ADAPTIVE) {
        this.setupAdaptiveSampling();
      }
    }

    this.setupAutoReporting();
  }

  /**
   * 更新配置选项
   */
  public updateOptions(options: Partial<PerformanceCollectorOptions>): void {
    // 保存当前值以比较变化
    const prevStrategy = this.options.samplingStrategy;
    const prevInterval = this.options.reportInterval;

    // 更新选项
    this.options = {
      ...this.options,
      ...options,
      resourceThreshold: {
        ...this.options.resourceThreshold,
        ...(options.resourceThreshold || {}),
      },
      adaptiveSamplingConfig: {
        ...this.options.adaptiveSamplingConfig,
        ...(options.adaptiveSamplingConfig || {}),
      },
      metricPriorities: {
        ...this.options.metricPriorities,
        ...(options.metricPriorities || {}),
      },
    };

    // 如果采样策略或上报间隔发生变化，重新设置计时器
    if (
      prevStrategy !== this.options.samplingStrategy ||
      prevInterval !== this.options.reportInterval
    ) {
      this.setupAutoReporting();

      if (this.options.samplingStrategy === SamplingStrategy.ADAPTIVE) {
        this.setupAdaptiveSampling();
      } else if (
        prevStrategy === SamplingStrategy.ADAPTIVE &&
        this.adaptiveTimer
      ) {
        clearInterval(this.adaptiveTimer);
        this.adaptiveTimer = null;
      }
    }

    // 如果采样率改变，更新当前采样率
    if (options.samplingRate !== undefined) {
      this.currentSamplingRate = options.samplingRate;
    }
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
   * 设置自适应采样
   */
  private setupAdaptiveSampling(): void {
    if (this.adaptiveTimer) {
      clearInterval(this.adaptiveTimer);
    }

    this.adaptiveTimer = setInterval(() => {
      this.adjustSamplingRate();
    }, this.options.adaptiveSamplingConfig.samplingAdjustInterval);
  }

  /**
   * 根据系统资源使用情况调整采样率
   */
  private adjustSamplingRate(): void {
    if (!this.performanceMonitor) return;

    const stats = this.performanceMonitor.getCurrentStats();
    if (!stats) return;

    const { cpu, memory } = stats;
    const cpuUsage = cpu.usage / 100; // 转换为0-1范围
    const memoryUsage = memory.usageRatio;
    const config = this.options.adaptiveSamplingConfig;

    // 计算事件频率分数 (0-1)，值越高表示事件频率越高
    const eventCount = this.lastEventTimestamps.length;
    const timeWindow = Math.min(
      config.samplingAdjustInterval,
      this.adaptiveMaxTimeWindow
    );
    const eventRateScore = Math.min(
      1.0,
      eventCount / (config.eventRateThreshold * (timeWindow / 1000))
    );

    // 清除超出时间窗口的事件时间戳
    const now = Date.now();
    this.lastEventTimestamps = this.lastEventTimestamps.filter(
      ts => now - ts <= timeWindow
    );

    // 计算综合负载分数 (0-1)，值越高表示负载越高
    const loadScore =
      cpuUsage * config.cpuLoadWeight +
      memoryUsage * config.memoryLoadWeight +
      eventRateScore * config.eventRateWeight;

    // 重新计算采样率
    let targetSamplingRate = config.maxSamplingRate * (1 - loadScore);

    // 确保采样率在配置的范围内
    targetSamplingRate = Math.max(
      config.minSamplingRate,
      Math.min(config.maxSamplingRate, targetSamplingRate)
    );

    // 是否使用渐进调整
    if (config.gradualAdjustment) {
      // 渐进调整，每次最多变动20%
      const maxChange = 0.2;
      const change = targetSamplingRate - this.currentSamplingRate;
      const adjustedChange =
        Math.sign(change) * Math.min(Math.abs(change), maxChange);
      this.currentSamplingRate += adjustedChange;
    } else {
      this.currentSamplingRate = targetSamplingRate;
    }

    // 更新优先级阈值缓存 - 基于新的采样率
    this.updatePriorityThresholds();

    console.debug(
      `[PerformanceCollector] 采样率调整: ${this.currentSamplingRate.toFixed(2)}, 负载分数: ${loadScore.toFixed(2)}, CPU: ${cpuUsage.toFixed(2)}, 内存: ${memoryUsage.toFixed(2)}, 事件频率: ${eventRateScore.toFixed(2)}`
    );
  }

  /**
   * 更新优先级阈值缓存
   * 根据当前采样率计算不同优先级的采样阈值
   */
  private updatePriorityThresholds(): void {
    const priorities = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    priorities.forEach(priority => {
      // 优先级越高，采样阈值越低（更容易采样）
      // 采样率越低，阈值越高（更难采样）
      // 优先级100时，阈值为0（始终采样）
      if (priority >= 100) {
        this.priorityThresholds[priority] = 0; // 始终采样
      } else {
        // 根据优先级与采样率的组合计算阈值
        // 优先级比例: (100 - priority) / 100 -> 值越小越优先
        // 采样阈值: 优先级比例 * (1 - 当前采样率)
        const priorityRatio = (100 - priority) / 100;
        this.priorityThresholds[priority] =
          priorityRatio * (1 - this.currentSamplingRate);
      }
    });
  }

  /**
   * 收集性能监控点
   * @param type 监控点类型
   * @param value 监控点值
   * @param metadata 额外元数据
   */
  public collect(
    type: PerformanceMetricType,
    value?: number,
    metadata?: Record<string, any>
  ): void {
    if (!this.options.enabled) return;

    // 记录事件发生，用于事件频率计算
    const now = Date.now();
    this.lastEventTimestamps.push(now);

    // 定期清理过旧的事件记录
    if (this.lastEventTimestamps.length > 1000) {
      const cutoff = now - this.adaptiveMaxTimeWindow;
      this.lastEventTimestamps = this.lastEventTimestamps.filter(
        ts => ts > cutoff
      );
    }

    // 是否应该采样这个监控点
    if (!this.shouldSample(type)) {
      return;
    }

    // 创建监控点
    const metricId =
      metadata?.metricId ||
      `metric_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    if (!metadata) metadata = {};
    if (!metadata.metricId) metadata.metricId = metricId;

    // 收集性能快照（仅在浏览器环境）
    let perfSnapshot: Partial<PerformanceStats> | undefined;
    if (this.performanceMonitor) {
      perfSnapshot = this.performanceMonitor.getSnapshot();
    }

    // 确定优先级
    const priority = metadata?.priority || this.getMetricPriority(type);

    const metric: PerformanceMetric = {
      type,
      timestamp: now,
      value,
      fileId: metadata?.fileId,
      chunkIndex: metadata?.chunkIndex,
      metadata,
      environment: this.environment,
      performanceSnapshot: perfSnapshot,
      priority,
    };

    // 添加到存储
    this.addMetric(metric);
  }

  /**
   * 添加监控点到存储
   */
  private addMetric(metric: PerformanceMetric): void {
    // 检查并清理超量数据
    this.pruneMetricsIfNeeded();

    // 获取当前索引
    const index = this.metrics.length;

    // 添加到数组
    this.metrics.push(metric);

    // 更新索引
    const metricId = metric.metadata?.metricId;
    if (metricId) {
      this.metricIndex.byId.set(metricId, index);
    }

    // 类型索引
    if (!this.metricIndex.byType.has(metric.type)) {
      this.metricIndex.byType.set(metric.type, []);
    }
    this.metricIndex.byType.get(metric.type)!.push(index);

    // 时间范围索引
    const timeKey = this.getTimeRangeKey(metric.timestamp);
    if (!this.metricIndex.byTimeRange.has(timeKey)) {
      this.metricIndex.byTimeRange.set(timeKey, []);
    }
    this.metricIndex.byTimeRange.get(timeKey)!.push(index);

    // 文件ID索引
    if (metric.fileId) {
      if (!this.metricIndex.byFileId.has(metric.fileId)) {
        this.metricIndex.byFileId.set(metric.fileId, []);
      }
      this.metricIndex.byFileId.get(metric.fileId)!.push(index);
    }
  }

  /**
   * 获取时间范围键
   * 将时间戳按小时分组，便于基于时间查询
   */
  private getTimeRangeKey(timestamp: number): string {
    // 按小时分组
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
  }

  /**
   * 如果性能监控点数量超过限制，清理旧数据
   */
  private pruneMetricsIfNeeded(): void {
    if (this.metrics.length >= this.options.maxMetrics) {
      // 保留最新的80%
      const keepCount = Math.floor(this.options.maxMetrics * 0.8);
      const removeCount = this.metrics.length - keepCount;

      // 移除旧的监控点
      for (let i = 0; i < removeCount; i++) {
        const metric = this.metrics[i];
        this.removeFromIndices(metric, i);
      }

      // 更新指标数组
      this.metrics = this.metrics.slice(removeCount);

      // 更新索引 - 调整剩余项的索引
      this.updateIndicesAfterRemoval(removeCount);
    }
  }

  /**
   * 从索引中移除监控点
   */
  private removeFromIndices(metric: PerformanceMetric, index: number): void {
    // ID索引
    const metricId = metric.metadata?.metricId;
    if (metricId) {
      this.metricIndex.byId.delete(metricId);
    }

    // 类型索引
    const typeIndices = this.metricIndex.byType.get(metric.type);
    if (typeIndices) {
      const typeIdx = typeIndices.indexOf(index);
      if (typeIdx > -1) {
        typeIndices.splice(typeIdx, 1);
      }
    }

    // 时间索引
    const timeKey = this.getTimeRangeKey(metric.timestamp);
    const timeIndices = this.metricIndex.byTimeRange.get(timeKey);
    if (timeIndices) {
      const timeIdx = timeIndices.indexOf(index);
      if (timeIdx > -1) {
        timeIndices.splice(timeIdx, 1);
      }
    }

    // 文件ID索引
    if (metric.fileId) {
      const fileIndices = this.metricIndex.byFileId.get(metric.fileId);
      if (fileIndices) {
        const fileIdx = fileIndices.indexOf(index);
        if (fileIdx > -1) {
          fileIndices.splice(fileIdx, 1);
        }
      }
    }
  }

  /**
   * 在移除一些监控点后，更新剩余监控点的索引
   */
  private updateIndicesAfterRemoval(removedCount: number): void {
    // 更新ID索引
    for (const [id, index] of this.metricIndex.byId.entries()) {
      if (index >= removedCount) {
        this.metricIndex.byId.set(id, index - removedCount);
      }
    }

    // 更新类型索引
    for (const indices of this.metricIndex.byType.values()) {
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= removedCount) {
          indices[i] -= removedCount;
        }
      }
    }

    // 更新时间索引
    for (const indices of this.metricIndex.byTimeRange.values()) {
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= removedCount) {
          indices[i] -= removedCount;
        }
      }
    }

    // 更新文件ID索引
    for (const indices of this.metricIndex.byFileId.values()) {
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= removedCount) {
          indices[i] -= removedCount;
        }
      }
    }
  }

  /**
   * 根据ID查找监控点
   */
  public findById(id: string): PerformanceMetric | null {
    const index = this.metricIndex.byId.get(id);
    if (index !== undefined) {
      return this.metrics[index];
    }
    return null;
  }

  /**
   * 根据类型查找监控点
   */
  public findByType(type: PerformanceMetricType): PerformanceMetric[] {
    const indices = this.metricIndex.byType.get(type) || [];
    return indices.map(i => this.metrics[i]);
  }

  /**
   * 根据时间范围查找监控点
   * 使用二分查找加速时间范围查询
   */
  public findByTimeRange(
    startTime: number,
    endTime: number
  ): PerformanceMetric[] {
    // 基于时间戳排序的监控点索引
    const sortedIndices = [...this.metrics.keys()].sort(
      (a, b) => this.metrics[a].timestamp - this.metrics[b].timestamp
    );

    // 二分查找找出开始边界
    let start = 0;
    let end = sortedIndices.length - 1;
    let startIndex = -1;

    while (start <= end) {
      const mid = Math.floor((start + end) / 2);
      const timestamp = this.metrics[sortedIndices[mid]].timestamp;

      if (timestamp >= startTime) {
        startIndex = mid;
        end = mid - 1;
      } else {
        start = mid + 1;
      }
    }

    if (startIndex === -1) return [];

    // 从开始位置找到所有满足条件的指标
    const result: PerformanceMetric[] = [];
    for (let i = startIndex; i < sortedIndices.length; i++) {
      const index = sortedIndices[i];
      const timestamp = this.metrics[index].timestamp;
      if (timestamp > endTime) break;
      result.push(this.metrics[index]);
    }

    return result;
  }

  /**
   * 判断是否应该采样当前监控点
   * @param type 监控点类型
   * @returns 是否应该采样
   */
  private shouldSample(type: PerformanceMetricType): boolean {
    // 策略1: 总是采样
    if (this.options.samplingStrategy === SamplingStrategy.ALWAYS) {
      return true;
    }

    // 策略2: 高优先级类型总是采样
    if (this.options.highPriorityTypes.includes(type)) {
      return true;
    }

    // 策略3: 错误偏好采样，错误和警告类型总是采样
    if (
      this.options.samplingStrategy === SamplingStrategy.ERROR_BIASED &&
      (type === PerformanceMetricType.ERROR_OCCUR ||
        type === PerformanceMetricType.RECOVERY_ATTEMPT ||
        type === PerformanceMetricType.MEMORY_PRESSURE)
    ) {
      return true;
    }

    // 策略4: 优先级采样
    if (this.options.samplingStrategy === SamplingStrategy.PRIORITY) {
      const priority = this.getMetricPriority(type);

      // 初始化或更新阈值
      if (Object.keys(this.priorityThresholds).length === 0) {
        this.updatePriorityThresholds();
      }

      // 获取此优先级的阈值
      const threshold =
        this.priorityThresholds[priority] || 1 - this.currentSamplingRate;

      // 随机数小于阈值则采样
      return Math.random() <= 1 - threshold;
    }

    // 策略5: 自适应采样 - 优先级 + 系统资源结合
    if (this.options.samplingStrategy === SamplingStrategy.ADAPTIVE) {
      const priority = this.getMetricPriority(type);

      // 高优先级直接采样
      if (priority >= 80) return true;

      // 初始化或更新阈值
      if (Object.keys(this.priorityThresholds).length === 0) {
        this.updatePriorityThresholds();
      }

      // 获取此优先级的阈值
      const threshold =
        this.priorityThresholds[priority] || 1 - this.currentSamplingRate;

      // 随机数小于阈值则采样
      return Math.random() <= 1 - threshold;
    }

    // 默认：随机采样
    return Math.random() <= this.currentSamplingRate;
  }

  /**
   * 获取监控点的优先级
   * @param type 监控点类型
   * @returns 优先级，1-100，数值越大优先级越高
   */
  private getMetricPriority(type: PerformanceMetricType): number {
    // 从配置中获取预定义的优先级
    const preDefinedPriority = this.options.metricPriorities[type];
    if (preDefinedPriority !== undefined) {
      return preDefinedPriority;
    }

    // 默认优先级
    switch (type) {
      case PerformanceMetricType.ERROR_OCCUR:
      case PerformanceMetricType.MEMORY_PRESSURE:
        return 100; // 最高优先级

      case PerformanceMetricType.RECOVERY_ATTEMPT:
      case PerformanceMetricType.NETWORK_CHANGE:
        return 80; // 高优先级

      case PerformanceMetricType.UPLOAD_START:
      case PerformanceMetricType.UPLOAD_END:
        return 60; // 中高优先级

      case PerformanceMetricType.CHUNK_START:
      case PerformanceMetricType.CHUNK_END:
        return 40; // 中优先级

      case PerformanceMetricType.CHUNK_PREPARE:
        return 30; // 中低优先级

      case PerformanceMetricType.DEBUG_EVENT:
        return 20; // 低优先级

      case PerformanceMetricType.LOG_ASSOCIATION:
        return 10; // 最低优先级

      default:
        return 50; // 默认优先级
    }
  }

  /**
   * 上报性能数据
   */
  public report(): void {
    if (!this.options.enabled || !this.options.onReport) return;

    // 复制当前数据
    const dataToReport = [...this.metrics];

    try {
      // 调用上报回调
      this.options.onReport(dataToReport);

      // 记录上报信息
      console.debug(
        `[PerformanceCollector] 已上报 ${dataToReport.length} 项性能数据`
      );
    } catch (error) {
      console.error('[PerformanceCollector] 上报性能数据失败:', error);
    }
  }

  /**
   * 获取所有监控点数据
   */
  public getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * 清空所有监控点数据
   */
  public clear(): void {
    this.metrics = [];
    this.metricIndex = {
      byId: new Map(),
      byType: new Map(),
      byTimeRange: new Map(),
      byFileId: new Map(),
    };

    // 重新初始化类型索引
    Object.values(PerformanceMetricType).forEach(type => {
      if (typeof type === 'string') {
        this.metricIndex.byType.set(type as PerformanceMetricType, []);
      }
    });
  }

  /**
   * 销毁收集器
   */
  public destroy(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    if (this.adaptiveTimer) {
      clearInterval(this.adaptiveTimer);
      this.adaptiveTimer = null;
    }

    if (this.performanceMonitor) {
      this.performanceMonitor.stop();
      this.performanceMonitor = null;
    }

    this.clear();
  }
}

export default PerformanceCollector;
