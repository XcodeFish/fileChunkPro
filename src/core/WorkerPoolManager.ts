/**
 * WorkerPoolManager.ts
 * Worker池管理系统 - 实现动态Worker分配、负载均衡、健康监控和资源优化
 */

import { EventBus } from './EventBus';
import { Logger } from '../utils/Logger';
import { EnvUtils } from '../utils/EnvUtils';
import { MemoryManager } from '../utils/MemoryManager';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { TaskPriority } from '../types';

/**
 * Worker池管理器配置选项
 */
export interface WorkerPoolOptions {
  /** 各类型Worker的初始池大小 */
  initialPoolSizes?: Record<string, number>;
  /** 各类型Worker的最大池大小 */
  maxPoolSizes?: Record<string, number>;
  /** 各类型Worker的最小池大小 */
  minPoolSizes?: Record<string, number>;
  /** 是否启用动态池大小调整 */
  enableDynamicPoolSize?: boolean;
  /** 池大小调整检查间隔(毫秒) */
  poolSizeCheckInterval?: number;
  /** 健康检查间隔(毫秒) */
  healthCheckInterval?: number;
  /** Worker脚本路径 */
  workerScripts?: Record<string, string>;
  /** Worker失败重启阈值 */
  workerRestartThreshold?: number;
  /** Worker空闲超时(毫秒) - 超过此时间的空闲Worker可能被终止 */
  idleTimeout?: number;
  /** 负载目标水平(0-1) - 理想的Worker负载率 */
  targetLoadLevel?: number;
  /** 扩展池大小的负载阈值 */
  expandThreshold?: number;
  /** 收缩池大小的负载阈值 */
  shrinkThreshold?: number;
  /** 是否记录详细性能指标 */
  collectDetailedMetrics?: boolean;
  /** 性能指标收集间隔(毫秒) */
  metricsInterval?: number;
  /** 是否使用内联Worker定义 */
  useInlineWorkers?: boolean;
  /** 事件总线实例 */
  eventBus?: EventBus;
  /** 是否在高负载时自动调整任务优先级 */
  enableDynamicPrioritization?: boolean;
  /** Worker初始化超时时间(毫秒) */
  workerInitTimeout?: number;
  /** Worker任务处理超时时间(毫秒) */
  taskTimeout?: number;
  /** 是否在低内存情况下缩减池大小 */
  shrinkOnLowMemory?: boolean;
  /** 是否在网络条件变差时调整池大小 */
  adjustForNetworkConditions?: boolean;
}

/**
 * Worker健康状态
 */
export type WorkerHealth =
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'recovering'
  | 'unknown';

/**
 * Worker负载级别
 */
export enum WorkerLoadLevel {
  IDLE = 'idle', // 空闲 (0-0.2)
  LOW = 'low', // 低负载 (0.2-0.4)
  MODERATE = 'moderate', // 中等负载 (0.4-0.6)
  HIGH = 'high', // 高负载 (0.6-0.8)
  OVERLOADED = 'overloaded', // 过载 (0.8-1.0)
  CRITICAL = 'critical', // 临界 (>1.0)
}

/**
 * Worker实例信息
 */
export interface WorkerInstance {
  /** Worker实例 */
  worker: Worker;
  /** Worker ID */
  id: string;
  /** Worker类型 */
  type: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动时间 */
  lastActivityTime: number;
  /** 健康状态 */
  health: WorkerHealth;
  /** 已处理任务数 */
  completedTasks: number;
  /** 处理失败任务数 */
  failedTasks: number;
  /** 内存使用情况 */
  memoryUsage?: {
    used: number;
    total: number;
    usageRatio: number;
  };
  /** 响应时间历史(ms) */
  responseTimeHistory: number[];
  /** 平均响应时间(ms) */
  avgResponseTime: number;
  /** 当前负载水平(0-1) */
  loadFactor: number;
  /** 是否正在处理任务 */
  isBusy: boolean;
  /** 当前处理中的任务ID */
  activeTaskIds: string[];
  /** 健康检查失败次数 */
  healthCheckFailures: number;
  /** 连续错误计数 */
  consecutiveErrors: number;
  /** 处理能力评分(每秒可处理的任务数) */
  performanceScore: number;
  /** 是否准备好接收任务 */
  isReady: boolean;
  /** 专业化标签 - 该Worker特别善于处理的任务类型 */
  specializations?: string[];
}

/**
 * Worker池指标
 */
export interface WorkerPoolMetrics {
  /** 时间戳 */
  timestamp: number;
  /** 总Worker数量 */
  totalWorkers: number;
  /** 各类型Worker数量 */
  workersByType: Record<string, number>;
  /** 忙碌Worker数量 */
  busyWorkers: number;
  /** 空闲Worker数量 */
  idleWorkers: number;
  /** 池利用率(0-1) */
  poolUtilization: number;
  /** 平均任务等待时间(ms) */
  avgWaitTime: number;
  /** 平均任务处理时间(ms) */
  avgProcessingTime: number;
  /** 任务队列长度 */
  queuedTasks: number;
  /** 任务成功率(0-1) */
  successRate: number;
  /** 平均Worker内存使用率(0-1) */
  avgMemoryUsage: number;
  /** Worker健康状况分布 */
  healthDistribution: Record<WorkerHealth, number>;
  /** 每秒处理任务数 */
  tasksPerSecond: number;
  /** 内存压力水平(0-1) */
  memoryPressure: number;
}

/**
 * Worker任务信息
 */
interface WorkerTask {
  /** 任务ID */
  id: string;
  /** 任务类型 */
  type: string;
  /** 任务数据 */
  data: any;
  /** 任务优先级 */
  priority: TaskPriority;
  /** 任务超时时间(ms) */
  timeout?: number;
  /** 添加时间 */
  addedTime: number;
  /** 开始处理时间 */
  startTime?: number;
  /** 处理Worker的ID */
  workerId?: string;
  /** 完成回调 */
  resolve: (result: any) => void;
  /** 失败回调 */
  reject: (error: any) => void;
  /** 任务重试次数 */
  retries: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 任务元数据 */
  metadata?: Record<string, any>;
}

/**
 * Worker池负载均衡策略
 */
export enum LoadBalancingStrategy {
  /** 轮询策略 - 依次分配任务 */
  ROUND_ROBIN = 'round_robin',

  /** 最少连接策略 - 分配给负载最小的Worker */
  LEAST_CONNECTIONS = 'least_connections',

  /** 加权响应时间策略 - 考虑Worker的响应时间和当前负载 */
  WEIGHTED_RESPONSE_TIME = 'weighted_response_time',

  /** 一致性哈希策略 - 相似任务分配给相同Worker */
  CONSISTENT_HASH = 'consistent_hash',

  /** 性能感知策略 - 基于Worker的历史性能分配任务 */
  PERFORMANCE_AWARE = 'performance_aware',

  /** 适应性策略 - 动态切换最佳策略 */
  ADAPTIVE = 'adaptive',
}

/**
 * 池扩展决策原因
 */
export enum PoolScalingReason {
  /** 高负载触发扩展 */
  HIGH_LOAD = 'high_load',

  /** 任务队列增长触发扩展 */
  QUEUE_GROWTH = 'queue_growth',

  /** 响应时间增加触发扩展 */
  INCREASED_LATENCY = 'increased_latency',

  /** 内存压力触发缩减 */
  MEMORY_PRESSURE = 'memory_pressure',

  /** 空闲资源触发缩减 */
  LOW_UTILIZATION = 'low_utilization',

  /** 系统启动初始化 */
  INITIALIZATION = 'initialization',

  /** 手动触发调整 */
  MANUAL = 'manual',

  /** 错误恢复 */
  ERROR_RECOVERY = 'error_recovery',

  /** 性能优化 */
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',

  /** 网络条件变化 */
  NETWORK_CONDITION_CHANGE = 'network_condition_change',
}

/**
 * 池扩展事件
 */
export interface PoolScalingEvent {
  /** 时间戳 */
  timestamp: number;
  /** Worker类型 */
  workerType: string;
  /** 操作类型: 'expand' | 'shrink' */
  operation: 'expand' | 'shrink';
  /** 扩展/缩减前的池大小 */
  previousSize: number;
  /** 扩展/缩减后的池大小 */
  newSize: number;
  /** 扩展/缩减的Worker数量 */
  delta: number;
  /** 扩展/缩减的原因 */
  reason: PoolScalingReason;
  /** 决策指标数据 */
  metrics?: {
    poolUtilization?: number;
    queueLength?: number;
    avgResponseTime?: number;
    memoryPressure?: number;
    errorRate?: number;
  };
}

/**
 * Worker池管理器
 * 实现动态Worker分配、负载均衡、健康监控和资源优化
 */
export class WorkerPoolManager {
  /** Worker实例集合 (按类型分组) */
  private workers: Map<string, Map<string, WorkerInstance>> = new Map();

  /** 任务队列 (按类型分组) */
  private taskQueues: Map<string, WorkerTask[]> = new Map();

  /** 任务回调映射 */
  private taskCallbacks: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timer: NodeJS.Timeout | null;
    }
  > = new Map();

  /** 任务计数器 (用于生成任务ID) */
  private taskCounter = 0;

  /** 轮询计数器 (用于轮询策略) */
  private roundRobinCounters: Map<string, number> = new Map();

  /** 池指标历史 */
  private metricsHistory: WorkerPoolMetrics[] = [];

  /** 事件总线实例 */
  private eventBus?: EventBus;

  /** 日志记录器 */
  private logger: Logger;

  /** 健康检查定时器 */
  private healthCheckTimer: NodeJS.Timeout | null = null;

  /** 池大小调整定时器 */
  private poolSizeAdjustmentTimer: NodeJS.Timeout | null = null;

  /** 指标收集定时器 */
  private metricsCollectionTimer: NodeJS.Timeout | null = null;

  /** 当前负载均衡策略 */
  private loadBalancingStrategy: LoadBalancingStrategy;

  /** 配置项 */
  private options: Required<WorkerPoolOptions>;

  /** 是否已初始化 */
  private initialized = false;

  /** 是否支持Worker */
  private isWorkerSupported: boolean;

  /** 池性能历史 */
  private poolPerformanceHistory: {
    timestamp: number;
    throughput: number;
    avgResponseTime: number;
    successRate: number;
  }[] = [];

  /** 近期扩展/缩减事件 */
  private recentScalingEvents: PoolScalingEvent[] = [];

  /** 是否正在进行扩展/缩减操作 */
  private isScalingOperation = false;

  /** 性能监控器 */
  private performanceMonitor: PerformanceMonitor;

  /** 默认Worker脚本路径 */
  private static readonly DEFAULT_WORKER_SCRIPTS: Record<string, string> = {
    chunk: '/workers/ChunkWorker.js',
    hash: '/workers/HashWorker.js',
    default: '/workers/worker.js',
  };

  /** 默认配置 */
  private static readonly DEFAULT_OPTIONS: Required<WorkerPoolOptions> = {
    initialPoolSizes: { chunk: 2, hash: 1, default: 1 },
    maxPoolSizes: { chunk: 4, hash: 2, default: 2 },
    minPoolSizes: { chunk: 1, hash: 1, default: 1 },
    enableDynamicPoolSize: true,
    poolSizeCheckInterval: 30000,
    healthCheckInterval: 15000,
    workerScripts: WorkerPoolManager.DEFAULT_WORKER_SCRIPTS,
    workerRestartThreshold: 3,
    idleTimeout: 60000,
    targetLoadLevel: 0.6,
    expandThreshold: 0.75,
    shrinkThreshold: 0.3,
    collectDetailedMetrics: true,
    metricsInterval: 10000,
    useInlineWorkers: false,
    eventBus: undefined,
    enableDynamicPrioritization: true,
    workerInitTimeout: 5000,
    taskTimeout: 30000,
    shrinkOnLowMemory: true,
    adjustForNetworkConditions: true,
  };

  /**
   * 构造函数
   * @param options Worker池管理器配置选项
   */
  constructor(options: WorkerPoolOptions = {}) {
    // 合并默认配置与用户配置
    this.options = {
      ...WorkerPoolManager.DEFAULT_OPTIONS,
      ...options,
      initialPoolSizes: {
        ...WorkerPoolManager.DEFAULT_OPTIONS.initialPoolSizes,
        ...options.initialPoolSizes,
      },
      maxPoolSizes: {
        ...WorkerPoolManager.DEFAULT_OPTIONS.maxPoolSizes,
        ...options.maxPoolSizes,
      },
      minPoolSizes: {
        ...WorkerPoolManager.DEFAULT_OPTIONS.minPoolSizes,
        ...options.minPoolSizes,
      },
      workerScripts: {
        ...WorkerPoolManager.DEFAULT_OPTIONS.workerScripts,
        ...options.workerScripts,
      },
    };

    // 保存事件总线引用
    this.eventBus = this.options.eventBus;

    // 初始化日志记录器
    this.logger = new Logger('WorkerPoolManager');

    // 检测环境是否支持Worker
    this.isWorkerSupported = EnvUtils.isWorkerSupported();

    // 设置初始负载均衡策略
    this.loadBalancingStrategy = LoadBalancingStrategy.ADAPTIVE;

    // 初始化性能监控器
    this.performanceMonitor = new PerformanceMonitor();

    // 为每种Worker类型初始化任务队列
    Object.keys(this.options.initialPoolSizes).forEach(type => {
      this.workers.set(type, new Map());
      this.taskQueues.set(type, []);
      this.roundRobinCounters.set(type, 0);
    });

    // 注册事件监听
    this.registerEventListeners();

    // 初始化内存监控
    if (!MemoryManager.isInitialized) {
      MemoryManager.initialize();
    }

    this.logger.info('WorkerPoolManager已创建，准备就绪');
  }

  /**
   * 注册事件监听器
   */
  private registerEventListeners(): void {
    if (this.eventBus) {
      // 监听内存警告事件
      this.eventBus.on('memory:warning', event => {
        if (event.level === 'critical' && this.options.shrinkOnLowMemory) {
          this.handleCriticalMemoryWarning(event);
        }
      });

      // 监听网络状态变化
      this.eventBus.on('network:quality_change', _event => {
        if (this.options.adjustForNetworkConditions) {
          this.handleNetworkQualityChange();
        }
      });
    }
  }

  /**
   * 处理严重内存警告
   * @param event 内存警告事件
   */
  private handleCriticalMemoryWarning(event: any): void {
    this.logger.warn('收到严重内存警告，正在缩减Worker池大小', event);

    // 记录缩减原因
    const reason = PoolScalingReason.MEMORY_PRESSURE;

    // 对每种类型的Worker进行缩减
    Object.keys(this.options.initialPoolSizes).forEach(type => {
      const currentPoolSize = this.getWorkerCount(type);
      const minPoolSize = this.options.minPoolSizes[type];

      // 只缩减到最小池大小
      if (currentPoolSize > minPoolSize) {
        // 计算需要缩减的数量，只缩减一半或至最小值
        const targetSize = Math.max(
          minPoolSize,
          Math.floor(currentPoolSize / 2)
        );
        const reduceCount = currentPoolSize - targetSize;

        if (reduceCount > 0) {
          this.shrinkWorkerPool(type, reduceCount, reason);
        }
      }
    });

    // 尝试回收内存
    MemoryManager.suggestGarbageCollection();
  }

  /**
   * 处理网络质量变化
   */
  private handleNetworkQualityChange(): void {
    // 根据网络质量调整并发和池大小策略
    // 这将在后续方法中实现
  }

  /**
   * 获取指定类型的Worker数量
   * @param type Worker类型
   * @returns Worker数量
   */
  private getWorkerCount(type: string): number {
    return this.workers.get(type)?.size || 0;
  }

  /**
   * 初始化Worker池
   * @returns 是否成功初始化
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    if (!this.isWorkerSupported) {
      this.logger.warn('当前环境不支持Web Worker，无法初始化Worker池');
      return false;
    }

    this.logger.info('开始初始化Worker池...');

    try {
      // 为每种类型初始化Worker池
      for (const [type, size] of Object.entries(
        this.options.initialPoolSizes
      )) {
        // 创建初始数量的Worker
        for (let i = 0; i < size; i++) {
          await this.createWorker(type);
        }
      }

      // 启动健康检查
      this.startHealthCheck();

      // 启动池大小自动调整
      if (this.options.enableDynamicPoolSize) {
        this.startPoolSizeAdjustment();
      }

      // 启动指标收集
      if (this.options.collectDetailedMetrics) {
        this.startMetricsCollection();
      }

      this.initialized = true;
      this.logger.info('Worker池初始化完成');

      // 通知事件
      this.eventBus?.emit('worker_pool:initialized', {
        timestamp: Date.now(),
        poolSizes: this.getPoolSizes(),
      });

      return true;
    } catch (error) {
      this.logger.error('Worker池初始化失败', error);
      return false;
    }
  }

  /**
   * 获取各类型Worker池大小
   */
  private getPoolSizes(): Record<string, number> {
    const sizes: Record<string, number> = {};

    for (const [type, workersMap] of this.workers.entries()) {
      sizes[type] = workersMap.size;
    }

    return sizes;
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.checkWorkersHealth();
    }, this.options.healthCheckInterval);
  }

  /**
   * 启动池大小自动调整
   */
  private startPoolSizeAdjustment(): void {
    if (this.poolSizeAdjustmentTimer) {
      clearInterval(this.poolSizeAdjustmentTimer);
    }

    this.poolSizeAdjustmentTimer = setInterval(() => {
      this.adjustPoolSize();
    }, this.options.poolSizeCheckInterval);
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    if (this.metricsCollectionTimer) {
      clearInterval(this.metricsCollectionTimer);
    }

    this.metricsCollectionTimer = setInterval(() => {
      this.collectMetrics();
    }, this.options.metricsInterval);
  }

  /**
   * 停止所有定时器
   */
  private stopTimers(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.poolSizeAdjustmentTimer) {
      clearInterval(this.poolSizeAdjustmentTimer);
      this.poolSizeAdjustmentTimer = null;
    }

    if (this.metricsCollectionTimer) {
      clearInterval(this.metricsCollectionTimer);
      this.metricsCollectionTimer = null;
    }
  }

  /**
   * 创建Worker实例
   * @param type Worker类型
   * @returns 创建的Worker实例或null(如果创建失败)
   */
  private async createWorker(type: string): Promise<WorkerInstance | null> {
    if (!this.isWorkerSupported) {
      return null;
    }

    try {
      const workerId = `${type}:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
      const scriptPath =
        this.options.workerScripts[type] || this.options.workerScripts.default;

      let worker: Worker;

      if (this.options.useInlineWorkers && scriptPath) {
        // 内联Worker创建将在下一部分实现
        worker = new Worker(scriptPath);
      } else {
        worker = new Worker(scriptPath);
      }

      // 创建Worker实例
      const workerInstance: WorkerInstance = {
        worker,
        id: workerId,
        type,
        createdAt: Date.now(),
        lastActivityTime: Date.now(),
        health: 'unknown',
        completedTasks: 0,
        failedTasks: 0,
        responseTimeHistory: [],
        avgResponseTime: 0,
        loadFactor: 0,
        isBusy: false,
        activeTaskIds: [],
        healthCheckFailures: 0,
        consecutiveErrors: 0,
        performanceScore: 1.0, // 初始性能评分
        isReady: false,
      };

      // 设置Worker消息处理器
      worker.onmessage = event =>
        this.handleWorkerMessage(event, workerInstance);
      worker.onerror = event => this.handleWorkerError(event, workerInstance);

      // 将Worker添加到池中
      this.workers.get(type)?.set(workerId, workerInstance);

      // 发送初始化消息到Worker
      worker.postMessage({
        action: 'initialize',
        workerId,
        config: {
          logLevel: 'info',
          maxTasks: 50,
        },
      });

      // 等待Worker就绪
      const isReady = await this.waitForWorkerReady(workerInstance);

      if (!isReady) {
        this.logger.warn(`Worker ${workerId} 初始化超时`);
        this.workers.get(type)?.delete(workerId);
        worker.terminate();
        return null;
      }

      this.logger.debug(`Worker ${workerId} (${type}) 创建成功`);

      // 通知事件
      this.eventBus?.emit('worker_pool:worker_created', {
        timestamp: Date.now(),
        workerId,
        type,
      });

      return workerInstance;
    } catch (error) {
      this.logger.error(`创建Worker (${type}) 失败`, error);
      return null;
    }
  }

  /**
   * 等待Worker就绪
   * @param workerInstance Worker实例
   * @param timeout 超时时间(ms)
   * @returns 是否成功就绪
   */
  private waitForWorkerReady(
    workerInstance: WorkerInstance,
    timeout = 5000
  ): Promise<boolean> {
    return new Promise(resolve => {
      const startTime = Date.now();

      // 检查函数
      const checkReady = () => {
        if (workerInstance.isReady) {
          resolve(true);
          return;
        }

        // 检查是否超时
        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }

        // 继续等待
        setTimeout(checkReady, 100);
      };

      checkReady();
    });
  }

  /**
   * 处理Worker消息
   * @param event MessageEvent
   * @param workerInstance Worker实例
   */
  private handleWorkerMessage(
    _event: MessageEvent,
    workerInstance: WorkerInstance
  ): void {
    const event = _event;
    const message = event.data;
    const workerId = workerInstance.id;

    workerInstance.lastActivityTime = Date.now();

    // 处理不同类型的消息
    switch (message.type) {
      case 'READY':
        this.handleWorkerReady(workerInstance);
        break;

      case 'PONG':
        this.handleWorkerPong(workerInstance, message);
        break;

      case 'STATUS':
        this.handleWorkerStatus(workerInstance, message);
        break;

      case 'ERROR':
        this.handleWorkerError(
          new ErrorEvent('error', {
            message: message.error,
            error: new Error(message.error),
          }),
          workerInstance
        );
        break;

      case 'WARNING':
        this.handleWorkerWarning(workerInstance, message);
        break;

      case 'TERMINATE_ACK':
        this.handleWorkerTerminateAck(workerInstance);
        break;

      default:
        // 处理任务响应
        if (message.taskId) {
          this.handleTaskResponse(message, workerInstance);
        } else {
          this.logger.warn(
            `Worker ${workerId} 发送了未知消息类型: ${message.type}`
          );
        }
    }
  }

  /**
   * 处理Worker就绪消息
   * @param workerInstance Worker实例
   */
  private handleWorkerReady(workerInstance: WorkerInstance): void {
    workerInstance.isReady = true;
    workerInstance.health = 'healthy';

    this.logger.debug(`Worker ${workerInstance.id} 就绪`);

    // 处理该Worker类型的等待队列中的任务
    this.processTaskQueue(workerInstance.type);
  }

  /**
   * 处理Worker PONG响应
   * @param workerInstance Worker实例
   * @param message 消息内容
   */
  private handleWorkerPong(workerInstance: WorkerInstance, message: any): void {
    // 更新Worker内存使用情况
    if (message.memory) {
      workerInstance.memoryUsage = {
        used: message.memory.used || 0,
        total: message.memory.total || 0,
        usageRatio: message.memory.usageRatio || 0,
      };
    }

    // 更新Worker健康状态
    if (
      workerInstance.health === 'unknown' ||
      workerInstance.health === 'recovering'
    ) {
      workerInstance.health = 'healthy';
    }

    // 重置健康检查失败计数
    workerInstance.healthCheckFailures = 0;
  }

  /**
   * 处理Worker状态消息
   * @param workerInstance Worker实例
   * @param message 消息内容
   */
  private handleWorkerStatus(
    workerInstance: WorkerInstance,
    message: any
  ): void {
    const stats = message.stats || {};

    // 更新Worker内存使用情况
    if (message.memory) {
      workerInstance.memoryUsage = {
        used: message.memory.used || 0,
        total: message.memory.total || 0,
        usageRatio: message.memory.usageRatio || 0,
      };
    }

    // 更新Worker负载因子(0-1)
    // 考虑任务数量和内存使用率
    const taskLoad = Math.min(
      1,
      (workerInstance.activeTaskIds.length || 0) / 5
    );
    const memoryLoad = workerInstance.memoryUsage?.usageRatio || 0;

    // 综合负载计算 (70% 任务负载 + 30% 内存负载)
    workerInstance.loadFactor = taskLoad * 0.7 + memoryLoad * 0.3;

    // 向事件总线发送详细监控事件
    if (this.options.collectDetailedMetrics && this.eventBus) {
      this.eventBus.emit('worker_pool:worker_status', {
        timestamp: Date.now(),
        workerId: workerInstance.id,
        type: workerInstance.type,
        status: {
          health: workerInstance.health,
          loadFactor: workerInstance.loadFactor,
          memoryUsage: workerInstance.memoryUsage,
          activeTaskCount: workerInstance.activeTaskIds.length,
          completedTasks: workerInstance.completedTasks,
          failedTasks: workerInstance.failedTasks,
          uptime: stats.uptime || Date.now() - workerInstance.createdAt,
        },
      });
    }
  }

  /**
   * 处理Worker警告消息
   * @param workerInstance Worker实例
   * @param message 消息内容
   */
  private handleWorkerWarning(
    workerInstance: WorkerInstance,
    message: any
  ): void {
    this.logger.warn(
      `Worker ${workerInstance.id} 警告: ${message.warning}`,
      message.details || {}
    );

    // 如果是内存相关警告且启用了自动调整，则考虑缩减该Worker的任务量
    if (
      message.warning === 'memory_pressure' &&
      this.options.shrinkOnLowMemory
    ) {
      workerInstance.performanceScore = Math.max(
        0.5,
        workerInstance.performanceScore * 0.8
      );
    }
  }

  /**
   * 处理Worker终止确认
   * @param workerInstance Worker实例
   */
  private handleWorkerTerminateAck(workerInstance: WorkerInstance): void {
    // 安全终止Worker
    setTimeout(() => {
      try {
        workerInstance.worker.terminate();
      } catch (error) {
        this.logger.debug(`终止Worker ${workerInstance.id} 时出错`, error);
      }

      // 从池中移除
      this.workers.get(workerInstance.type)?.delete(workerInstance.id);

      this.logger.debug(`Worker ${workerInstance.id} 已安全终止`);
    }, 100);
  }

  /**
   * 处理任务响应
   * @param response 响应消息
   * @param workerInstance Worker实例
   */
  private handleTaskResponse(
    response: any,
    workerInstance: WorkerInstance
  ): void {
    const taskId = response.taskId;
    const success = response.success;
    const startTime = workerInstance.startTime || Date.now();
    const endTime = Date.now();
    const duration = endTime - startTime;

    // 处理任务完成
    if (success) {
      workerInstance.completedTasks += 1;

      // 更新响应时间历史
      if (duration > 0) {
        workerInstance.responseTimeHistory.push(duration);

        // 只保留最近20条记录
        if (workerInstance.responseTimeHistory.length > 20) {
          workerInstance.responseTimeHistory.shift();
        }

        // 更新平均响应时间
        workerInstance.avgResponseTime =
          workerInstance.responseTimeHistory.reduce(
            (sum, time) => sum + time,
            0
          ) / workerInstance.responseTimeHistory.length;

        // 更新性能评分 (基于平均响应时间动态调整)
        this.updateWorkerPerformanceScore(workerInstance);
      }

      // 重置连续错误计数
      workerInstance.consecutiveErrors = 0;
    } else {
      workerInstance.failedTasks += 1;
      workerInstance.consecutiveErrors += 1;

      // 连续错误过多，标记为不健康
      if (
        workerInstance.consecutiveErrors >= this.options.workerRestartThreshold
      ) {
        workerInstance.health = 'unhealthy';
        this.logger.warn(
          `Worker ${workerInstance.id} 连续失败次数过多，标记为不健康`
        );

        // 尝试重启Worker
        this.handleUnhealthyWorker(workerInstance);
      }
    }

    // 从活动任务列表中移除
    const taskIndex = workerInstance.activeTaskIds.indexOf(taskId);
    if (taskIndex !== -1) {
      workerInstance.activeTaskIds.splice(taskIndex, 1);
    }

    // 更新Worker忙碌状态
    workerInstance.isBusy = workerInstance.activeTaskIds.length > 0;

    // 查找任务回调
    const callbackInfo = this.taskCallbacks.get(taskId);
    if (callbackInfo) {
      // 清除超时定时器
      if (callbackInfo.timer) {
        clearTimeout(callbackInfo.timer);
      }

      // 调用回调
      if (success) {
        callbackInfo.resolve(response.result);
      } else {
        callbackInfo.reject(new Error(response.error || '任务执行失败'));
      }

      // 移除回调
      this.taskCallbacks.delete(taskId);
    }

    // 如果Worker空闲，处理队列中的下一个任务
    if (!workerInstance.isBusy) {
      this.processTaskQueue(workerInstance.type);
    }

    // 记录任务完成事件
    this.eventBus?.emit('worker_pool:task_completed', {
      timestamp: Date.now(),
      taskId,
      workerId: workerInstance.id,
      success,
      duration,
      error: success ? undefined : response.error,
    });
  }

  /**
   * 更新Worker性能评分
   * @param workerInstance Worker实例
   */
  private updateWorkerPerformanceScore(workerInstance: WorkerInstance): void {
    // 计算Worker处理能力 (任务数/秒)
    const elapsedTimeMinutes = (Date.now() - workerInstance.createdAt) / 60000;
    if (elapsedTimeMinutes <= 0) return;

    // 计算每分钟完成的任务数
    const tasksPerMinute = workerInstance.completedTasks / elapsedTimeMinutes;

    // 计算成功率
    const totalTasks =
      workerInstance.completedTasks + workerInstance.failedTasks;
    const successRate =
      totalTasks > 0 ? workerInstance.completedTasks / totalTasks : 1;

    // 考虑平均响应时间
    // 较低的响应时间 = 较高的性能分数
    const avgResponseFactor =
      workerInstance.avgResponseTime > 0
        ? Math.min(1, 2000 / workerInstance.avgResponseTime)
        : 1;

    // 综合计算性能评分 (0.0-2.0)
    // 正常范围在0.5-1.5之间，1.0为基准水平
    const rawScore = (tasksPerMinute / 10) * successRate * avgResponseFactor;

    // 将评分限制在合理范围内，防止极端值
    workerInstance.performanceScore = Math.max(0.5, Math.min(2.0, rawScore));
  }

  /**
   * 处理Worker错误
   * @param event 错误事件
   * @param workerInstance Worker实例
   */
  private handleWorkerError(
    _event: ErrorEvent,
    workerInstance: WorkerInstance
  ): void {
    const event = _event;
    workerInstance.consecutiveErrors += 1;
    workerInstance.failedTasks += 1;

    this.logger.error(`Worker ${workerInstance.id} 错误: ${event.message}`);

    // 连续错误过多，标记为不健康
    if (
      workerInstance.consecutiveErrors >= this.options.workerRestartThreshold
    ) {
      workerInstance.health = 'unhealthy';
      this.handleUnhealthyWorker(workerInstance);
    } else if (workerInstance.health === 'healthy') {
      // 标记为降级但仍可用
      workerInstance.health = 'degraded';
    }

    // 记录错误事件
    this.eventBus?.emit('worker_pool:worker_error', {
      timestamp: Date.now(),
      workerId: workerInstance.id,
      error: event.message,
      consecutiveErrors: workerInstance.consecutiveErrors,
    });
  }

  /**
   * 处理不健康的Worker
   * @param workerInstance Worker实例
   */
  private async handleUnhealthyWorker(
    workerInstance: WorkerInstance
  ): Promise<void> {
    const workerId = workerInstance.id;
    const type = workerInstance.type;

    this.logger.warn(`正在重启不健康的Worker: ${workerId}`);

    try {
      // 尝试安全终止 - 发送终止请求
      workerInstance.worker.postMessage({ action: 'terminate' });

      // 设置超时，如果Worker没有确认终止
      setTimeout(() => {
        try {
          // 强制终止Worker
          workerInstance.worker.terminate();
        } catch (error) {
          this.logger.debug(`终止Worker ${workerId} 时出错`, error);
        }

        // 从池中移除
        this.workers.get(type)?.delete(workerId);

        // 创建新的Worker替代
        this.createWorker(type).then(() => {
          this.logger.info(
            `已重新创建类型为 ${type} 的Worker替代不健康Worker ${workerId}`
          );

          // 处理可能积压的任务
          this.processTaskQueue(type);
        });
      }, 1000);
    } catch (error) {
      this.logger.error(`重启Worker ${workerId} 失败`, error);

      // 强制移除并创建新Worker
      try {
        this.workers.get(type)?.delete(workerId);
      } catch (e) {
        // 忽略错误
      }

      // 创建新的Worker替代
      this.createWorker(type).then(() => {
        this.logger.info(
          `已重新创建类型为 ${type} 的Worker替代不健康Worker ${workerId}`
        );

        // 处理可能积压的任务
        this.processTaskQueue(type);
      });
    }
  }

  /**
   * 处理Worker健康检查
   */
  private checkWorkersHealth(): void {
    // 检查每个Worker的健康状态
    for (const [type, workersMap] of this.workers.entries()) {
      for (const [id, worker] of workersMap.entries()) {
        // 发送ping检查响应性
        try {
          worker.worker.postMessage({ action: 'ping' });

          // 检查最后活动时间，如果太久没响应则标记为无响应
          const idleTime = Date.now() - worker.lastActivityTime;
          if (idleTime > this.options.healthCheckInterval * 2) {
            worker.healthCheckFailures += 1;
            this.logger.warn(`Worker ${id} 响应超时 (${idleTime}ms)`);

            if (worker.healthCheckFailures >= 3) {
              worker.health = 'unhealthy';
              this.handleUnhealthyWorker(worker);
            }
          }

          // 检查是否超过空闲超时
          if (!worker.isBusy && this.options.idleTimeout > 0) {
            const idleTimeout = this.options.idleTimeout;

            // 只有在Worker数量超过最小池大小时才考虑终止空闲Worker
            if (
              idleTime > idleTimeout &&
              this.getWorkerCount(type) > this.options.minPoolSizes[type] &&
              this.getIdleWorkerCount(type) > 1 // 至少保留一个空闲Worker
            ) {
              // 终止超时的空闲Worker
              this.logger.debug(
                `终止空闲Worker ${id} (空闲时间: ${idleTime}ms)`
              );
              this.terminateWorker(worker, PoolScalingReason.LOW_UTILIZATION);
            }
          }
        } catch (error) {
          this.logger.warn(`向Worker ${id} 发送健康检查消息时出错`, error);
          worker.healthCheckFailures += 1;

          if (worker.healthCheckFailures >= 3) {
            worker.health = 'unhealthy';
            this.handleUnhealthyWorker(worker);
          }
        }
      }
    }
  }

  /**
   * 获取指定类型的空闲Worker数量
   * @param type Worker类型
   * @returns 空闲Worker数量
   */
  private getIdleWorkerCount(type: string): number {
    let count = 0;
    const workersMap = this.workers.get(type);

    if (workersMap) {
      for (const worker of workersMap.values()) {
        if (!worker.isBusy) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 安全终止Worker
   * @param workerInstance Worker实例
   * @param reason 终止原因
   */
  private terminateWorker(
    workerInstance: WorkerInstance,
    reason: PoolScalingReason
  ): void {
    try {
      // 发送终止消息
      workerInstance.worker.postMessage({ action: 'terminate' });

      // 记录事件
      this.eventBus?.emit('worker_pool:worker_terminated', {
        timestamp: Date.now(),
        workerId: workerInstance.id,
        reason,
      });

      // 设置超时，如果Worker没有确认终止
      setTimeout(() => {
        try {
          workerInstance.worker.terminate();
          this.workers.get(workerInstance.type)?.delete(workerInstance.id);
          this.logger.debug(`Worker ${workerInstance.id} 已强制终止`);
        } catch (error) {
          // 忽略错误
        }
      }, 1000);
    } catch (error) {
      this.logger.warn(`终止Worker ${workerInstance.id} 时出错`, error);

      // 强制终止
      try {
        workerInstance.worker.terminate();
        this.workers.get(workerInstance.type)?.delete(workerInstance.id);
      } catch (e) {
        // 忽略错误
      }
    }
  }

  /**
   * 调整Worker池大小
   */
  private adjustPoolSize(): void {
    if (this.isScalingOperation) {
      return; // 避免并发缩放操作
    }

    this.isScalingOperation = true;

    try {
      // 检查当前内存压力
      const memoryStats = MemoryManager.getMemoryStats();
      const isMemoryPressure = memoryStats.usageRatio > 0.8;

      for (const [type, workersMap] of this.workers.entries()) {
        // 获取当前配置
        const currentPoolSize = workersMap.size;
        const minPoolSize = this.options.minPoolSizes[type];
        const maxPoolSize = this.options.maxPoolSizes[type];

        // 计算池利用率 (忙碌Worker数量 / 总Worker数量)
        const busyWorkers = Array.from(workersMap.values()).filter(
          w => w.isBusy
        ).length;
        const poolUtilization =
          currentPoolSize > 0 ? busyWorkers / currentPoolSize : 0;

        // 获取任务队列长度
        const queueLength = this.taskQueues.get(type)?.length || 0;

        // 检查是否需要扩展池
        if (
          !isMemoryPressure &&
          currentPoolSize < maxPoolSize &&
          (poolUtilization > this.options.expandThreshold ||
            queueLength > currentPoolSize)
        ) {
          // 计算需要增加的Worker数量
          const toAdd = Math.min(
            maxPoolSize - currentPoolSize,
            Math.max(1, Math.ceil(queueLength / 3)) // 根据队列长度扩展
          );

          if (toAdd > 0) {
            await this.expandWorkerPool(
              type,
              toAdd,
              poolUtilization > this.options.expandThreshold
                ? PoolScalingReason.HIGH_LOAD
                : PoolScalingReason.QUEUE_GROWTH
            );
          }
        }
        // 检查是否需要缩减池
        else if (
          currentPoolSize > minPoolSize &&
          poolUtilization < this.options.shrinkThreshold &&
          queueLength === 0
        ) {
          // 计算需要减少的Worker数量 (最多减少超过最小池大小的50%)
          const maxToRemove =
            Math.floor((currentPoolSize - minPoolSize) / 2) + 1;
          const toRemove = Math.min(
            maxToRemove,
            Math.max(1, currentPoolSize - minPoolSize - 1)
          );

          if (toRemove > 0) {
            this.shrinkWorkerPool(
              type,
              toRemove,
              PoolScalingReason.LOW_UTILIZATION
            );
          }
        }
        // 内存压力较大时考虑缩减池大小
        else if (isMemoryPressure && currentPoolSize > minPoolSize) {
          const toRemove = Math.max(
            1,
            Math.floor((currentPoolSize - minPoolSize) / 2)
          );

          if (toRemove > 0) {
            this.shrinkWorkerPool(
              type,
              toRemove,
              PoolScalingReason.MEMORY_PRESSURE
            );
          }
        }
      }
    } finally {
      this.isScalingOperation = false;
    }
  }

  /**
   * 扩展Worker池
   * @param type Worker类型
   * @param count 要添加的Worker数量
   * @param reason 扩展原因
   */
  private async expandWorkerPool(
    type: string,
    count: number,
    reason: PoolScalingReason
  ): Promise<void> {
    if (count <= 0) return;

    const previousSize = this.getWorkerCount(type);

    this.logger.info(
      `扩展类型为 ${type} 的Worker池 +${count} (当前: ${previousSize})`
    );

    // 记录池扩展事件
    const scalingEvent: PoolScalingEvent = {
      timestamp: Date.now(),
      workerType: type,
      operation: 'expand',
      previousSize,
      newSize: previousSize + count,
      delta: count,
      reason,
      metrics: {
        poolUtilization: this.getPoolUtilization(type),
        queueLength: this.getQueueLength(type),
      },
    };

    this.recentScalingEvents.push(scalingEvent);

    // 限制历史记录长度
    if (this.recentScalingEvents.length > 20) {
      this.recentScalingEvents.shift();
    }

    // 发送事件
    this.eventBus?.emit('worker_pool:scaling', scalingEvent);

    // 创建新Worker
    const creationPromises: Promise<WorkerInstance | null>[] = [];

    for (let i = 0; i < count; i++) {
      creationPromises.push(this.createWorker(type));
    }

    // 等待所有Worker创建完成
    const results = await Promise.all(creationPromises);
    const successCount = results.filter(r => r !== null).length;

    if (successCount < count) {
      this.logger.warn(`只成功创建了 ${successCount}/${count} 个Worker`);
    }

    // 处理可能积压的任务
    this.processTaskQueue(type);
  }

  /**
   * 缩减Worker池
   * @param type Worker类型
   * @param count 要移除的Worker数量
   * @param reason 缩减原因
   */
  private shrinkWorkerPool(
    type: string,
    count: number,
    reason: PoolScalingReason
  ): void {
    if (count <= 0) return;

    const workersMap = this.workers.get(type);
    if (!workersMap) return;

    const previousSize = workersMap.size;
    const minPoolSize = this.options.minPoolSizes[type];

    // 确保不会缩减到低于最小池大小
    const actualCount = Math.min(
      count,
      Math.max(0, previousSize - minPoolSize)
    );

    if (actualCount <= 0) return;

    this.logger.info(
      `缩减类型为 ${type} 的Worker池 -${actualCount} (当前: ${previousSize})`
    );

    // 记录池缩减事件
    const scalingEvent: PoolScalingEvent = {
      timestamp: Date.now(),
      workerType: type,
      operation: 'shrink',
      previousSize,
      newSize: previousSize - actualCount,
      delta: actualCount,
      reason,
      metrics: {
        poolUtilization: this.getPoolUtilization(type),
        queueLength: this.getQueueLength(type),
      },
    };

    this.recentScalingEvents.push(scalingEvent);

    // 限制历史记录长度
    if (this.recentScalingEvents.length > 20) {
      this.recentScalingEvents.shift();
    }

    // 发送事件
    this.eventBus?.emit('worker_pool:scaling', scalingEvent);

    // 选择要终止的Worker (优先选择空闲Worker)
    const idleWorkers = Array.from(workersMap.values())
      .filter(w => !w.isBusy)
      .sort((a, b) => a.performanceScore - b.performanceScore); // 优先终止性能较差的

    let remainingCount = actualCount;

    // 优先终止空闲Worker
    if (idleWorkers.length > 0) {
      const toTerminate = idleWorkers.slice(0, remainingCount);

      for (const worker of toTerminate) {
        this.terminateWorker(worker, reason);
        remainingCount--;
      }
    }

    // 如果仍然需要终止更多Worker (正常情况下不应发生)
    if (remainingCount > 0 && reason === PoolScalingReason.MEMORY_PRESSURE) {
      // 在内存压力高的情况下，可能需要强制终止忙碌Worker
      const busyWorkers = Array.from(workersMap.values())
        .filter(w => w.isBusy)
        .sort((a, b) => b.loadFactor - a.loadFactor); // 按负载降序，优先保留负载高的

      const toTerminate = busyWorkers.slice(-remainingCount);

      for (const worker of toTerminate) {
        this.logger.warn(`由于内存压力，正在终止忙碌Worker ${worker.id}`);
        this.terminateWorker(worker, reason);
      }
    }
  }

  /**
   * 获取池利用率
   * @param type Worker类型
   * @returns 池利用率(0-1)
   */
  private getPoolUtilization(type: string): number {
    const workersMap = this.workers.get(type);
    if (!workersMap || workersMap.size === 0) return 0;

    const busyWorkers = Array.from(workersMap.values()).filter(
      w => w.isBusy
    ).length;
    return busyWorkers / workersMap.size;
  }

  /**
   * 获取任务队列长度
   * @param type Worker类型
   * @returns 队列长度
   */
  private getQueueLength(type: string): number {
    return this.taskQueues.get(type)?.length || 0;
  }

  // 其余方法将在下一部分实现
}
