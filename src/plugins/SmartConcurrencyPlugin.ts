/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * SmartConcurrencyPlugin - 智能并发控制插件
 *
 * 功能：
 * 1. 网络状况自适应：根据当前网络状况动态调整上传策略
 * 2. 动态并发调整：基于实时网络性能和设备状态智能调整并发数
 * 3. 优先级队列实现：支持任务优先级，确保重要分片优先上传
 * 4. 带宽监控与优化：监控网络带宽使用情况，优化上传速率
 * 5. 自适应发送窗口：根据网络延迟动态调整发送窗口大小
 */

import EventBus from '../core/EventBus';
import { TaskScheduler } from '../core/TaskScheduler';
import { UploaderCore } from '../core/UploaderCore';
import {
  IPlugin,
  TaskPriority,
  NetworkQuality,
  NetworkCondition,
  UploadStrategy,
  TaskMetadata,
  BandwidthStats,
  NetworkStatus,
  DeviceCapability,
  ConcurrencyAdjustmentEvent,
} from '../types';
import MemoryManager from '../utils/MemoryManager';
import { NetworkDetector } from '../utils/NetworkDetector';

// 定义网络速度采样数据结构
interface SpeedSample {
  timestamp: number;
  bytesTransferred: number;
  duration: number;
  speed: number; // bytes/s
  chunkSize?: number; // 分片大小
  success: boolean; // 上传是否成功
  latency?: number; // 请求延迟时间
}

// 网络质量评估配置
interface NetworkQualityConfig {
  thresholds: {
    [key in NetworkQuality]?: number; // 速度阈值(kb/s)
  };
  stabilityThreshold: number; // 网络稳定性阈值
  historySize: number; // 历史记录大小
  latencyWeight: number; // 延迟权重
  speedWeight: number; // 速度权重
  jitterWeight: number; // 抖动权重
  adaptationSpeed: number; // 适应速度(0-1)
}

// 并发配置
interface ConcurrencyConfig {
  min: number; // 最小并发数
  max: number; // 最大并发数
  base: number; // 基础并发数
  adjustInterval: number; // 调整间隔(ms)
  errorReduceFactor: number; // 错误降低因子
  recoveryFactor: number; // 恢复因子
  adaptationEnabled: boolean; // 是否启用自适应
}

// 优先级配置
interface PriorityConfig {
  firstChunk: TaskPriority; // 首个分片优先级
  lastChunk: TaskPriority; // 最后分片优先级
  metadataChunk: TaskPriority; // 元数据分片优先级
  retryIncrement: number; // 重试优先级增量
  maxPriority: TaskPriority; // 最大优先级
}

// 默认网络质量速度阈值（单位：kb/s）
const DEFAULT_NETWORK_QUALITY_THRESHOLD = {
  [NetworkQuality.POOR]: 50, // 50 KB/s
  [NetworkQuality.LOW]: 200, // 200 KB/s
  [NetworkQuality.MEDIUM]: 500, // 500 KB/s
  [NetworkQuality.GOOD]: 1000, // 1 MB/s
  [NetworkQuality.EXCELLENT]: 2000, // 2 MB/s
};

// 默认优先级配置
const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  // 首个分片优先级
  firstChunk: TaskPriority.HIGH,
  // 最后一个分片优先级
  lastChunk: TaskPriority.HIGH,
  // 元数据分片优先级
  metadataChunk: TaskPriority.CRITICAL,
  // 重试分片优先级增量
  retryIncrement: 1,
  // 最大优先级
  maxPriority: TaskPriority.CRITICAL,
};

class SmartConcurrencyPlugin implements IPlugin {
  public version = '2.0.0';
  private core: UploaderCore | null = null;
  private taskScheduler: TaskScheduler | null = null;
  private eventBus: EventBus | null = null;
  private networkDetector: NetworkDetector | null = null;

  // 网络状态监控
  private networkCondition: NetworkCondition | null = null;
  private currentNetworkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private speedSamples: SpeedSample[] = [];
  private lastSampleTime = 0;
  private totalBytesTransferred = 0;
  private samplingStartTime = 0;
  private isNetworkStable = false;
  private consecutiveStableReadings = 0;
  private lastNetworkEvent = 0;
  private networkTrend: 'improving' | 'degrading' | 'stable' = 'stable';
  private latencyHistory: number[] = [];
  private jitterValue = 0;

  // 并发控制
  private baseConcurrency = 3; // 默认基础并发数
  private minConcurrency = 1;
  private maxConcurrency = 6;
  private currentConcurrency = 3;
  private adaptationEnabled = true;
  private initialConcurrencySet = false;
  private concurrencyHistory: Array<{
    concurrency: number;
    timestamp: number;
    quality: NetworkQuality;
  }> = [];
  private optimalConcurrencyMap = new Map<NetworkQuality, number>();

  // 智能窗口控制
  private windowSize = 3; // 默认窗口大小
  private minWindowSize = 1;
  private maxWindowSize = 10;
  private rttSamples: number[] = []; // 往返时间样本
  private congestionWindow = 1.0; // 拥塞窗口

  // 监控间隔
  private networkCheckInterval: any = null;
  private concurrencyAdjustInterval: any = null;
  private speedCalculationInterval: any = null;
  private performanceAnalysisInterval: any = null;

  // 采样与配置
  private readonly SAMPLE_INTERVAL: number;
  private readonly SAMPLE_HISTORY_SIZE: number;
  private readonly STABLE_READINGS_THRESHOLD: number;
  private readonly CONCURRENCY_ADJUST_INTERVAL: number;

  // 网络质量配置
  private networkQualityConfig: NetworkQualityConfig;
  private concurrencyConfig: ConcurrencyConfig;
  private priorityConfig: PriorityConfig;

  // 带宽使用情况
  private currentSpeed = 0; // bytes/s
  private avgSpeed = 0; // bytes/s
  private peakSpeed = 0; // bytes/s
  private targetUtilization = 0.85; // 目标带宽利用率，避免网络饱和

  // 性能监控
  private failureRates = new Map<number, number>(); // 并发数 -> 失败率
  private successRates = new Map<number, number>(); // 并发数 -> 成功率
  private performanceMatrix = new Map<
    NetworkQuality,
    Map<number, { success: number; total: number; avgSpeed: number }>
  >();
  private deviceCapabilities: DeviceCapability | null = null;

  /**
   * 构造函数
   * @param options 插件选项
   */
  constructor(options?: {
    minConcurrency?: number;
    maxConcurrency?: number;
    baseConcurrency?: number;
    adaptationEnabled?: boolean;
    targetUtilization?: number;
    sampleInterval?: number;
    networkQualityThresholds?: Partial<Record<NetworkQuality, number>>;
    stabilityThreshold?: number;
    priorityConfig?: Partial<PriorityConfig>;
  }) {
    // 初始化采样配置
    this.SAMPLE_INTERVAL = options?.sampleInterval ?? 2000; // 2秒
    this.SAMPLE_HISTORY_SIZE = 15; // 保留15个采样
    this.STABLE_READINGS_THRESHOLD = 3; // 3次稳定读数后确认网络稳定
    this.CONCURRENCY_ADJUST_INTERVAL = 5000; // 5秒调整一次并发数

    // 初始化并发配置
    this.concurrencyConfig = {
      min: options?.minConcurrency ?? 1,
      max: options?.maxConcurrency ?? 6,
      base: options?.baseConcurrency ?? 3,
      adjustInterval: this.CONCURRENCY_ADJUST_INTERVAL,
      errorReduceFactor: 0.75, // 错误时降低到75%
      recoveryFactor: 1.1, // 恢复时增加10%
      adaptationEnabled: options?.adaptationEnabled ?? true,
    };

    // 设置初始并发参数
    this.minConcurrency = this.concurrencyConfig.min;
    this.maxConcurrency = this.concurrencyConfig.max;
    this.baseConcurrency = this.concurrencyConfig.base;
    this.currentConcurrency = this.baseConcurrency;
    this.adaptationEnabled = this.concurrencyConfig.adaptationEnabled;
    this.targetUtilization = options?.targetUtilization ?? 0.85;

    // 初始化网络质量配置
    const thresholds = {
      [NetworkQuality.POOR]: 50, // 50 KB/s
      [NetworkQuality.LOW]: 200, // 200 KB/s
      [NetworkQuality.MEDIUM]: 500, // 500 KB/s
      [NetworkQuality.GOOD]: 1000, // 1 MB/s
      [NetworkQuality.EXCELLENT]: 2000, // 2 MB/s
      ...options?.networkQualityThresholds,
    };

    this.networkQualityConfig = {
      thresholds,
      stabilityThreshold: options?.stabilityThreshold ?? 3,
      historySize: 10,
      latencyWeight: 0.3, // 延迟占权重30%
      speedWeight: 0.6, // 速度占权重60%
      jitterWeight: 0.1, // 抖动占权重10%
      adaptationSpeed: 0.2, // 适应速度，较低的值意味着更渐进的变化
    };

    // 初始化优先级配置
    this.priorityConfig = {
      firstChunk: TaskPriority.HIGH,
      lastChunk: TaskPriority.HIGH,
      metadataChunk: TaskPriority.CRITICAL,
      retryIncrement: 1,
      maxPriority: TaskPriority.CRITICAL,
      ...options?.priorityConfig,
    };
  }

  /**
   * 插件安装方法
   * @param core UploaderCore实例
   */
  public install(core: UploaderCore): void {
    this.core = core;
    this.eventBus = core.getEventBus();
    this.taskScheduler = core.getTaskScheduler();

    // 初始化网络检测器
    this.networkDetector = NetworkDetector.getInstance({
      autoRefreshInterval: this.SAMPLE_INTERVAL,
      enableNetworkListener: true,
    });

    // 如果没有任务调度器，则不进行安装
    if (!this.taskScheduler) {
      console.warn(
        'SmartConcurrencyPlugin: TaskScheduler未找到，插件功能将受限'
      );
      return;
    }

    // 初始化并发设置
    this.initializeConcurrency();

    // 注册事件监听
    this.registerEventListeners();

    // 注册钩子
    this.registerHooks();

    // 开始网络监控
    this.startNetworkMonitoring();

    // 配置调度器使用优先级队列
    this.configureSchedulerPriorityQueue();

    // 开始周期性性能分析
    this.startPerformanceAnalysis();
  }

  /**
   * 初始化并发设置
   */
  private initializeConcurrency(): void {
    if (!this.taskScheduler) return;

    if (!this.initialConcurrencySet) {
      // 读取当前配置作为基准
      this.baseConcurrency = this.taskScheduler.getConcurrency();
      this.currentConcurrency = this.baseConcurrency;
      this.initialConcurrencySet = true;
    }

    // 根据环境确定最大并发数
    this.detectEnvironmentCapabilities();

    // 设置初始并发数
    this.setConcurrency(this.currentConcurrency);
  }

  /**
   * 注册事件监听器
   */
  private registerEventListeners(): void {
    if (!this.eventBus) return;

    // 监听上传开始事件
    this.eventBus.on('upload:start', () => {
      this.resetSpeedSamples();
      this.startSpeedCalculation();
    });

    // 监听上传结束事件
    this.eventBus.on('upload:complete', () => {
      this.stopSpeedCalculation();
      // 记录当前网络质量下的最优并发数
      this.recordOptimalConcurrency();
    });

    // 监听上传错误事件
    this.eventBus.on('upload:error', () => {
      this.stopSpeedCalculation();
    });

    // 监听分片上传成功事件，用于计算上传速度和RTT
    this.eventBus.on(
      'chunk:uploaded',
      (data: { size: number; duration?: number }) => {
        this.recordTransfer(data.size, true, data.duration);

        if (data.duration) {
          this.updateRTTSamples(data.duration);
        }
      }
    );

    // 监听分片上传失败事件
    this.eventBus.on(
      'chunk:error',
      (data: { size?: number; retryCount: number }) => {
        // 记录失败的传输（如果有大小信息）
        if (data.size) {
          this.recordTransfer(data.size, false);
        }

        this.handleChunkError();
      }
    );

    // 监听网络状态变化
    this.networkDetector?.addQualityCallback((quality: NetworkQuality) => {
      const previousQuality = this.currentNetworkQuality;

      // 如果网络质量发生变化
      if (previousQuality !== quality) {
        this.currentNetworkQuality = quality;
        this.handleNetworkQualityChange(previousQuality, quality);
      }
    });
  }

  /**
   * 处理网络质量变化
   * @param previousQuality 之前的网络质量
   * @param newQuality 新的网络质量
   */
  private handleNetworkQualityChange(
    previousQuality: NetworkQuality,
    newQuality: NetworkQuality
  ): void {
    // 更新网络趋势
    if (
      this.qualityToLevel(newQuality) > this.qualityToLevel(previousQuality)
    ) {
      this.networkTrend = 'improving';
    } else if (
      this.qualityToLevel(newQuality) < this.qualityToLevel(previousQuality)
    ) {
      this.networkTrend = 'degrading';
    } else {
      this.networkTrend = 'stable';
    }

    // 通知事件
    if (this.eventBus) {
      this.eventBus.emit('network:quality:change', {
        from: previousQuality,
        to: newQuality,
        trend: this.networkTrend,
      });
    }

    // 调整并发
    if (this.adaptationEnabled) {
      // 如果网络质量有显著变化，立即调整并发数
      const levelChange = Math.abs(
        this.qualityToLevel(newQuality) - this.qualityToLevel(previousQuality)
      );

      if (levelChange >= 2) {
        // 网络质量变化超过2个等级
        this.adjustConcurrencyForQuality(newQuality);
      } else {
        // 否则，在下一个调整周期调整
        this.scheduleConcurrencyAdjustment();
      }
    }
  }

  /**
   * 将网络质量转换为数值级别
   * @param quality 网络质量
   * @returns 数值级别
   */
  private qualityToLevel(quality: NetworkQuality): number {
    switch (quality) {
      case NetworkQuality.OFFLINE:
        return 0;
      case NetworkQuality.POOR:
        return 1;
      case NetworkQuality.LOW:
        return 2;
      case NetworkQuality.MEDIUM:
        return 3;
      case NetworkQuality.GOOD:
        return 4;
      case NetworkQuality.EXCELLENT:
        return 5;
      default:
        return 3; // UNKNOWN 默认为中等
    }
  }

  /**
   * 注册钩子
   */
  private registerHooks(): void {
    if (!this.core) return;

    const pluginManager = this.core.getPluginManager();

    if (!pluginManager) {
      console.warn('SmartConcurrencyPlugin: PluginManager未找到，无法注册钩子');
      return;
    }

    // 注册分片创建前钩子，用于设置分片优先级
    pluginManager.registerHook(
      'beforeChunkUpload',
      this.beforeChunkUploadHook.bind(this),
      { plugin: 'SmartConcurrencyPlugin' }
    );

    // 注册上传策略调整钩子
    pluginManager.registerHook(
      'determineUploadStrategy',
      this.determineUploadStrategyHook.bind(this),
      { plugin: 'SmartConcurrencyPlugin' }
    );

    // 注册任务创建前钩子，调整窗口大小
    pluginManager.registerHook(
      'beforeTaskCreate',
      this.beforeTaskCreateHook.bind(this),
      { plugin: 'SmartConcurrencyPlugin' }
    );
  }

  /**
   * 分片上传前钩子，用于调整分片优先级
   */
  private async beforeChunkUploadHook(args: {
    chunk: { index: number; size: number; total: number };
    metadata?: TaskMetadata;
  }): Promise<any> {
    const { chunk, metadata } = args;
    if (!chunk) return args;

    // 确定分片优先级
    let priority = TaskPriority.NORMAL;

    // 首个分片优先级高
    if (chunk.index === 0) {
      priority = this.priorityConfig.firstChunk;
    }
    // 最后一个分片优先级高
    else if (chunk.index === chunk.total - 1) {
      priority = this.priorityConfig.lastChunk;
    }

    // 如果是元数据分片，优先级最高
    if (metadata?.isMetadata) {
      priority = this.priorityConfig.metadataChunk;
    }

    // 如果是重试分片，提高优先级
    if (metadata?.retryCount && metadata.retryCount > 0) {
      // 提高优先级，但不超过最大优先级
      priority = Math.min(
        priority + this.priorityConfig.retryIncrement,
        this.priorityConfig.maxPriority
      );
    }

    // 更新元数据中的优先级
    if (metadata) {
      metadata.priority = priority;
    }

    return { ...args, metadata: { ...metadata, priority } };
  }

  /**
   * 确定上传策略钩子
   */
  private async determineUploadStrategyHook(args: {
    strategy: UploadStrategy;
    fileSize: number;
  }): Promise<any> {
    const { strategy, fileSize } = args;

    // 只有在启用自适应时才修改策略
    if (!this.adaptationEnabled) return args;

    // 根据当前网络质量和文件大小调整策略
    const optimizedStrategy = this.optimizeStrategy(strategy, fileSize);

    return { ...args, strategy: optimizedStrategy };
  }

  /**
   * 优化上传策略
   */
  private optimizeStrategy(
    strategy: UploadStrategy,
    fileSize: number
  ): UploadStrategy {
    const optimized = { ...strategy };

    // 根据网络质量调整并发数
    optimized.concurrency = this.currentConcurrency;

    // 对于大文件，在较差网络下增加重试次数
    if (
      fileSize > 100 * 1024 * 1024 && // 100MB
      (this.currentNetworkQuality === NetworkQuality.POOR ||
        this.currentNetworkQuality === NetworkQuality.LOW)
    ) {
      optimized.retryCount = Math.max(strategy.retryCount, 5);
      optimized.retryDelay = Math.min(strategy.retryDelay, 1000); // 快速重试
    }

    // 在网络很差的情况下，减小分片大小以提高成功率
    if (this.currentNetworkQuality === NetworkQuality.POOR) {
      const reducedChunkSize = Math.min(strategy.chunkSize, 512 * 1024); // 最大512KB
      optimized.chunkSize = reducedChunkSize;
    }

    // 在网络质量好的情况下调整分片大小
    if (this.currentNetworkQuality === NetworkQuality.GOOD) {
      const increasedChunkSize = Math.max(strategy.chunkSize, 1 * 1024 * 1024); // 至少1MB
      optimized.chunkSize = Math.min(increasedChunkSize, 4 * 1024 * 1024); // 最大4MB
    } else if (this.currentNetworkQuality === NetworkQuality.EXCELLENT) {
      // 但也不要过大，以防造成其他问题
      const increasedChunkSize = Math.max(strategy.chunkSize, 2 * 1024 * 1024); // 至少2MB
      optimized.chunkSize = Math.min(increasedChunkSize, 8 * 1024 * 1024); // 最大8MB
    }

    // 根据带宽利用率调整分片大小
    const bandwidthUtilization =
      this.currentSpeed / (this.peakSpeed || this.currentSpeed);

    if (bandwidthUtilization < 0.3 && this.currentSpeed > 0) {
      // 带宽利用率过低，可能需要增加分片大小
      optimized.chunkSize = Math.min(
        optimized.chunkSize * 1.2,
        8 * 1024 * 1024
      );
    }

    // 根据是否网络稳定调整优先级
    if (!this.isNetworkStable) {
      optimized.prioritizeFirstChunk = true; // 不稳定网络下优先完成第一个分片
    }

    // 调整重试延迟，不稳定网络增加延迟
    if (!this.isNetworkStable && this.jitterValue > 50) {
      // 抖动大于50ms
      optimized.retryDelay = Math.max(strategy.retryDelay, 1000); // 至少1秒延迟
    }

    return optimized;
  }

  /**
   * 开始网络监控
   */
  private startNetworkMonitoring(): void {
    // 初始化网络状态
    this.detectNetworkCondition();

    // 定期检查网络状态
    this.networkCheckInterval = setInterval(() => {
      this.detectNetworkCondition();
    }, this.SAMPLE_INTERVAL);

    // 定期调整并发数
    this.concurrencyAdjustInterval = setInterval(() => {
      if (this.adaptationEnabled) {
        this.adjustConcurrency();
      }
    }, this.CONCURRENCY_ADJUST_INTERVAL);
  }

  /**
   * 开始速度计算
   */
  private startSpeedCalculation(): void {
    this.samplingStartTime = Date.now();
    this.totalBytesTransferred = 0;

    // 定期计算速度
    this.speedCalculationInterval = setInterval(() => {
      this.calculateCurrentSpeed();
    }, this.SAMPLE_INTERVAL);
  }

  /**
   * 开始性能分析
   */
  private startPerformanceAnalysis(): void {
    // 每30秒分析一次性能数据
    this.performanceAnalysisInterval = setInterval(() => {
      this.analyzePerformanceData();
    }, 30000); // 30秒
  }

  /**
   * 分析性能数据
   */
  private analyzePerformanceData(): void {
    // 分析历史性能数据，找出每个网络质量下的最佳并发数
    for (const [quality, dataMap] of this.performanceMatrix.entries()) {
      let bestConcurrency = 3; // 默认值
      let bestThroughput = 0;

      for (const [concurrency, data] of dataMap.entries()) {
        // 只考虑有足够样本的数据
        if (data.total < 5) continue;

        const successRate = data.success / data.total;
        const throughput = data.avgSpeed * successRate;

        // 找出吞吐量最高的并发数
        if (throughput > bestThroughput) {
          bestThroughput = throughput;
          bestConcurrency = concurrency;
        }
      }

      // 更新最佳并发数映射
      this.optimalConcurrencyMap.set(quality, bestConcurrency);
    }
  }

  /**
   * 记录当前网络质量下的最优并发数
   */
  private recordOptimalConcurrency(): void {
    if (
      this.currentNetworkQuality === NetworkQuality.UNKNOWN ||
      this.currentNetworkQuality === NetworkQuality.OFFLINE
    ) {
      return;
    }

    // 获取当前网络质量对应的性能数据映射
    let qualityMap = this.performanceMatrix.get(this.currentNetworkQuality);
    if (!qualityMap) {
      qualityMap = new Map();
      this.performanceMatrix.set(this.currentNetworkQuality, qualityMap);
    }

    // 获取当前并发数对应的性能数据
    let concurrencyData = qualityMap.get(this.currentConcurrency);
    if (!concurrencyData) {
      concurrencyData = { success: 0, total: 0, avgSpeed: 0 };
      qualityMap.set(this.currentConcurrency, concurrencyData);
    }

    // 更新性能数据
    const successCount = this.taskScheduler?.getCompletedTaskCount() || 0;
    const totalCount = this.taskScheduler?.getTotalTaskCount() || 0;

    if (totalCount > 0) {
      const newSuccess = successCount - concurrencyData.total;
      const newTotal = totalCount - concurrencyData.total;

      if (newTotal > 0) {
        // 更新成功数和总数
        concurrencyData.success += newSuccess;
        concurrencyData.total += newTotal;

        // 更新平均速度（指数移动平均）
        if (concurrencyData.avgSpeed === 0) {
          concurrencyData.avgSpeed = this.avgSpeed;
        } else {
          concurrencyData.avgSpeed =
            0.7 * concurrencyData.avgSpeed + 0.3 * this.avgSpeed;
        }
      }
    }
  }

  /**
   * 停止速度计算
   */
  private stopSpeedCalculation(): void {
    if (this.speedCalculationInterval) {
      clearInterval(this.speedCalculationInterval);
      this.speedCalculationInterval = null;
    }
  }

  /**
   * 重置速度采样
   */
  private resetSpeedSamples(): void {
    this.speedSamples = [];
    this.lastSampleTime = Date.now();
    this.totalBytesTransferred = 0;
    this.currentSpeed = 0;
    this.avgSpeed = 0;
    this.peakSpeed = 0;
    this.rttSamples = [];
    this.jitterValue = 0;
  }

  /**
   * 记录数据传输
   * @param bytes 传输字节数
   * @param success 是否成功
   * @param duration 传输持续时间(可选)
   */
  private recordTransfer(
    bytes: number,
    success: boolean,
    duration?: number
  ): void {
    const now = Date.now();
    this.totalBytesTransferred += bytes;

    // 只有时间间隔大于指定值时才记录采样
    if (now - this.lastSampleTime >= this.SAMPLE_INTERVAL) {
      const sampleDuration = now - this.lastSampleTime;
      const speed = (bytes / sampleDuration) * 1000; // bytes/s

      // 添加采样
      this.speedSamples.push({
        timestamp: now,
        bytesTransferred: bytes,
        duration: sampleDuration,
        speed,
        success,
        latency: duration,
      });

      // 限制历史记录大小
      if (this.speedSamples.length > this.SAMPLE_HISTORY_SIZE) {
        this.speedSamples.shift();
      }

      this.lastSampleTime = now;
    }
  }

  /**
   * 计算当前速度
   */
  private calculateCurrentSpeed(): void {
    const now = Date.now();
    const elapsedTime = now - this.samplingStartTime;

    if (elapsedTime <= 0 || this.totalBytesTransferred <= 0) {
      return;
    }

    // 计算平均速度 (bytes/s)
    this.avgSpeed = (this.totalBytesTransferred / elapsedTime) * 1000;

    // 计算当前速度 (使用最近的几个采样)
    if (this.speedSamples.length > 0) {
      const recentSamples = this.speedSamples.slice(-3); // 最近3个采样
      let totalSpeed = 0;
      let validSamples = 0;

      recentSamples.forEach(sample => {
        if (sample.success) {
          totalSpeed += sample.speed;
          validSamples++;
        }
      });

      if (validSamples > 0) {
        this.currentSpeed = totalSpeed / validSamples;
      } else {
        // 如果没有成功的样本，保持当前速度不变
        this.currentSpeed = this.currentSpeed * 0.9; // 略微衰减
      }

      // 更新峰值速度
      if (this.currentSpeed > this.peakSpeed) {
        this.peakSpeed = this.currentSpeed;
      }

      // 根据当前速度评估网络质量
      this.evaluateNetworkQuality();

      // 发出速度更新事件
      this.emitSpeedUpdate();
    }
  }

  /**
   * 发出速度更新事件
   */
  private emitSpeedUpdate(): void {
    if (!this.eventBus) return;

    this.eventBus.emit('network:speed', {
      current: this.currentSpeed,
      average: this.avgSpeed,
      peak: this.peakSpeed,
      quality: this.currentNetworkQuality,
      samples: this.speedSamples.length,
      jitter: this.jitterValue,
      windowSize: this.windowSize,
      stable: this.isNetworkStable,
    });
  }

  /**
   * 检测网络状况
   */
  private detectNetworkCondition(): void {
    // 检测网络连接状态
    const isOnline =
      typeof navigator !== 'undefined' && navigator.onLine !== undefined
        ? navigator.onLine
        : true;

    if (!isOnline) {
      this.currentNetworkQuality = NetworkQuality.OFFLINE;
      this.handleNetworkChange();
      return;
    }

    // 使用NetworkDetector获取网络状态
    if (this.networkDetector) {
      this.currentNetworkQuality = this.networkDetector.getNetworkQuality();
      this.networkCondition = this.networkDetector.getNetworkCondition();
    }
    // 兼容旧版检测逻辑
    else if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const connection = (navigator as any).connection;

      if (connection) {
        this.networkCondition = {
          type: connection.type || 'unknown',
          effectiveType: connection.effectiveType || '4g',
          downlink: connection.downlink || 0,
          rtt: connection.rtt || 0,
          saveData: connection.saveData || false,
        };

        // 根据effectiveType估计网络质量
        switch (this.networkCondition.effectiveType) {
          case 'slow-2g':
            this.currentNetworkQuality = NetworkQuality.POOR;
            break;
          case '2g':
            this.currentNetworkQuality = NetworkQuality.LOW;
            break;
          case '3g':
            this.currentNetworkQuality = NetworkQuality.MEDIUM;
            break;
          case '4g':
            this.currentNetworkQuality = NetworkQuality.GOOD;
            break;
          default:
            // 使用速度评估
            this.evaluateNetworkQuality();
        }
      } else {
        // 使用速度评估
        this.evaluateNetworkQuality();
      }
    } else {
      // 没有API，只能通过速度评估
      this.evaluateNetworkQuality();
    }

    this.handleNetworkChange();
  }

  /**
   * 根据测量的速度评估网络质量
   */
  private evaluateNetworkQuality(): void {
    // 如果网络检测器可用，优先使用
    if (this.networkDetector) {
      this.currentNetworkQuality = this.networkDetector.getNetworkQuality();
      return;
    }

    const kbps = this.currentSpeed / 1024; // 转换为KB/s

    // 如果没有速度数据或没有阈值配置，保持当前状态
    if (kbps <= 0 || !this.networkQualityConfig.thresholds) {
      return;
    }

    // 根据阈值配置确定网络质量
    let newQuality: NetworkQuality;

    if (kbps < this.networkQualityConfig.thresholds[NetworkQuality.POOR]!) {
      newQuality = NetworkQuality.POOR;
    } else if (
      kbps < this.networkQualityConfig.thresholds[NetworkQuality.LOW]!
    ) {
      newQuality = NetworkQuality.LOW;
    } else if (
      kbps < this.networkQualityConfig.thresholds[NetworkQuality.MEDIUM]!
    ) {
      newQuality = NetworkQuality.MEDIUM;
    } else if (
      kbps < this.networkQualityConfig.thresholds[NetworkQuality.GOOD]!
    ) {
      newQuality = NetworkQuality.GOOD;
    } else {
      newQuality = NetworkQuality.EXCELLENT;
    }

    // 检测网络稳定性
    if (newQuality === this.currentNetworkQuality) {
      this.consecutiveStableReadings++;
      if (this.consecutiveStableReadings >= this.STABLE_READINGS_THRESHOLD) {
        this.isNetworkStable = true;
      }
    } else {
      this.consecutiveStableReadings = 0;
      this.isNetworkStable = false;
    }

    // 更新当前网络质量
    this.currentNetworkQuality = newQuality;
  }

  /**
   * 处理网络变化
   */
  private handleNetworkChange(): void {
    if (!this.eventBus) return;

    // 发出网络状态变化事件
    this.eventBus.emit('network:quality', {
      quality: this.currentNetworkQuality,
      condition: this.networkCondition,
      stable: this.isNetworkStable,
      trend: this.networkTrend,
      jitter: this.jitterValue,
      rttAvg: this.calculateAvgRTT(),
    });

    // 如果网络离线，暂停任务调度器
    if (this.currentNetworkQuality === NetworkQuality.OFFLINE) {
      if (this.taskScheduler && !this.taskScheduler.isPaused()) {
        this.taskScheduler.pause();
        this.eventBus.emit('network:offline', {
          message: '网络连接已断开，上传已暂停',
        });
      }
    }
    // 如果网络恢复在线，恢复任务调度器
    else if (this.taskScheduler && this.taskScheduler.isPaused()) {
      this.taskScheduler.resume();
      this.eventBus.emit('network:online', {
        message: '网络连接已恢复，上传继续',
      });
    }

    // 根据网络变化调整并发
    if (this.adaptationEnabled) {
      this.scheduleConcurrencyAdjustment();
    }
  }

  /**
   * 处理分片错误
   */
  private handleChunkError(): void {
    // 记录错误发生时的网络质量和并发数
    const quality = this.currentNetworkQuality;
    const concurrency = this.currentConcurrency;

    // 更新失败率统计
    if (!this.failureRates.has(concurrency)) {
      this.failureRates.set(concurrency, 0);
    }

    const newFailureRate = this.failureRates.get(concurrency)! + 0.05; // 增加5%的失败率
    this.failureRates.set(concurrency, Math.min(newFailureRate, 1.0));

    // 连续错误可能表示网络问题，降低并发数
    if (this.adaptationEnabled) {
      const newConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(
          this.currentConcurrency * this.concurrencyConfig.errorReduceFactor
        )
      );

      if (newConcurrency !== this.currentConcurrency) {
        this.setConcurrency(newConcurrency);

        // 通知事件
        if (this.eventBus) {
          this.eventBus.emit('concurrency:reduced', {
            reason: 'chunk_error',
            from: this.currentConcurrency,
            to: newConcurrency,
            quality,
            failureRate: this.failureRates.get(concurrency),
          });
        }
      }

      // 减小发送窗口以应对错误
      if (this.windowSize > this.minWindowSize) {
        this.windowSize = Math.max(
          this.minWindowSize,
          Math.floor(this.windowSize * 0.9)
        );

        // 重置拥塞窗口
        this.congestionWindow = this.windowSize;
      }
    }
  }

  /**
   * 安排并发调整
   */
  private scheduleConcurrencyAdjustment(): void {
    // 如果网络不稳定或者刚刚发生变化，延迟调整
    const now = Date.now();
    if (!this.isNetworkStable || now - this.lastNetworkEvent < 5000) {
      // 记录网络事件时间
      this.lastNetworkEvent = now;

      // 延迟调整，等待网络稳定
      setTimeout(() => {
        if (this.adaptationEnabled) {
          this.adjustConcurrency();
        }
      }, this.CONCURRENCY_ADJUST_INTERVAL);
    } else {
      // 网络稳定，直接调整
      this.adjustConcurrency();
    }
  }

  /**
   * 根据网络状况调整并发数
   */
  private adjustConcurrency(): void {
    if (!this.taskScheduler || !this.adaptationEnabled) return;

    let newConcurrency: number;

    // 首先检查是否有针对当前网络质量的最佳并发数
    if (this.optimalConcurrencyMap.has(this.currentNetworkQuality)) {
      newConcurrency = this.optimalConcurrencyMap.get(
        this.currentNetworkQuality
      )!;
    } else {
      // 根据网络质量确定基础并发数
      switch (this.currentNetworkQuality) {
        case NetworkQuality.OFFLINE:
          newConcurrency = 0; // 离线时不上传
          break;
        case NetworkQuality.POOR:
          newConcurrency = this.minConcurrency; // 网络很差时使用最小并发
          break;
        case NetworkQuality.LOW:
          newConcurrency = Math.max(
            this.minConcurrency,
            Math.floor(this.baseConcurrency * 0.5)
          );
          break;
        case NetworkQuality.MEDIUM:
          newConcurrency = this.baseConcurrency; // 中等网络使用基础并发
          break;
        case NetworkQuality.GOOD:
          newConcurrency = Math.min(
            this.maxConcurrency,
            Math.floor(this.baseConcurrency * 1.5)
          );
          break;
        case NetworkQuality.EXCELLENT:
          newConcurrency = this.maxConcurrency; // 极好网络使用最大并发
          break;
        default:
          newConcurrency = this.baseConcurrency; // 默认使用基础并发
      }
    }

    // 调整因素：网络稳定性
    if (!this.isNetworkStable && newConcurrency > this.minConcurrency) {
      newConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(newConcurrency * 0.8)
      );
    }

    // 调整因素：抖动和延迟
    if (this.jitterValue > 0) {
      const avgRtt = this.calculateAvgRTT();
      const jitterRatio = this.jitterValue / (avgRtt || 100);

      if (jitterRatio > 0.5) {
        // 抖动超过50%
        newConcurrency = Math.max(
          this.minConcurrency,
          Math.floor(newConcurrency * 0.9)
        );
      }
    }

    // 调整因素：失败率
    const failureRate = this.failureRates.get(this.currentConcurrency) || 0;
    if (failureRate > 0.2) {
      // 失败率超过20%
      newConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(newConcurrency * 0.9)
      );
    }

    // 平滑并发变化，避免大幅度波动
    if (newConcurrency > this.currentConcurrency) {
      // 增加并发，缓慢增加
      newConcurrency = Math.min(
        newConcurrency,
        Math.ceil(
          this.currentConcurrency * this.concurrencyConfig.recoveryFactor
        )
      );
    } else if (newConcurrency < this.currentConcurrency) {
      // 降低并发，缓慢降低
      newConcurrency = Math.max(
        newConcurrency,
        Math.floor(this.currentConcurrency * 0.8)
      );
    }

    // 确保不超出限制
    newConcurrency = Math.max(
      this.minConcurrency,
      Math.min(this.maxConcurrency, newConcurrency)
    );

    // 如果当前并发数不同，更新它
    if (newConcurrency !== this.currentConcurrency) {
      this.setConcurrency(newConcurrency);

      // 通知事件
      if (this.eventBus) {
        this.eventBus.emit('concurrency:adjusted', {
          reason: 'network_quality',
          quality: this.currentNetworkQuality,
          from: this.currentConcurrency,
          to: newConcurrency,
          stable: this.isNetworkStable,
          jitter: this.jitterValue,
          failureRate,
        });
      }
    }
  }

  /**
   * 根据特定网络质量调整并发数
   */
  private adjustConcurrencyForQuality(quality: NetworkQuality): void {
    if (!this.taskScheduler || !this.adaptationEnabled) return;

    let newConcurrency: number;

    // 首先检查是否有针对此质量的最佳并发数
    if (this.optimalConcurrencyMap.has(quality)) {
      newConcurrency = this.optimalConcurrencyMap.get(quality)!;
    } else {
      // 根据质量等级设置并发
      switch (quality) {
        case NetworkQuality.OFFLINE:
          newConcurrency = 0;
          break;
        case NetworkQuality.POOR:
          newConcurrency = this.minConcurrency;
          break;
        case NetworkQuality.LOW:
          newConcurrency = Math.max(
            this.minConcurrency,
            Math.round(this.baseConcurrency * 0.5)
          );
          break;
        case NetworkQuality.MEDIUM:
          newConcurrency = this.baseConcurrency;
          break;
        case NetworkQuality.GOOD:
          newConcurrency = Math.min(
            this.maxConcurrency,
            Math.round(this.baseConcurrency * 1.25)
          );
          break;
        case NetworkQuality.EXCELLENT:
          newConcurrency = this.maxConcurrency;
          break;
        default:
          newConcurrency = this.baseConcurrency;
      }
    }

    // 限定范围
    newConcurrency = Math.max(
      this.minConcurrency,
      Math.min(this.maxConcurrency, newConcurrency)
    );

    // 设置并发数
    if (newConcurrency !== this.currentConcurrency) {
      this.setConcurrency(newConcurrency);

      // 通知事件
      if (this.eventBus) {
        this.eventBus.emit('concurrency:adjusted', {
          reason: 'quality_change',
          quality,
          from: this.currentConcurrency,
          to: newConcurrency,
        });
      }
    }
  }

  /**
   * 设置并发数
   */
  private setConcurrency(concurrency: number): void {
    if (!this.taskScheduler) return;

    this.currentConcurrency = concurrency;
    this.taskScheduler.setConcurrency(concurrency);

    // 记录并发历史
    this.concurrencyHistory.push({
      concurrency,
      timestamp: Date.now(),
      quality: this.currentNetworkQuality,
    });

    // 保持历史记录在合理大小
    if (this.concurrencyHistory.length > 50) {
      this.concurrencyHistory.shift();
    }
  }

  /**
   * 配置调度器使用优先级队列
   */
  private configureSchedulerPriorityQueue(): void {
    if (!this.taskScheduler) return;

    // 更新任务调度器配置，启用优先级队列
    this.taskScheduler.updateConfig({
      priorityQueue: true,
      networkOptimization: true,
    });
  }

  /**
   * 检测环境能力，调整最大并发数和窗口限制
   */
  private detectEnvironmentCapabilities(): void {
    // 浏览器环境下检测设备内存和处理能力
    if (typeof navigator !== 'undefined') {
      // 检测设备内存
      if ('deviceMemory' in navigator) {
        const memory = (navigator as any).deviceMemory as number;

        // 记录设备能力信息
        this.deviceCapabilities = {
          memory: memory <= 2 ? 'low' : memory <= 6 ? 'normal' : 'high',
          processor: 'normal', // 默认值
          network: 'normal', // 默认值
          storage: 'normal', // 默认值
          battery: 'normal', // 默认值
        };

        // 根据设备内存调整最大并发数
        if (memory <= 2) {
          // 低内存设备
          this.maxConcurrency = 3;
          this.maxWindowSize = 5;
        } else if (memory <= 4) {
          // 中等内存设备
          this.maxConcurrency = 4;
          this.maxWindowSize = 7;
        } else if (memory <= 8) {
          // 高内存设备
          this.maxConcurrency = 5;
          this.maxWindowSize = 8;
        } else {
          // 超高内存设备
          this.maxConcurrency = 6;
          this.maxWindowSize = 10;
        }
      }

      // 检测硬件并发数（CPU核心数）
      if ('hardwareConcurrency' in navigator) {
        const cores = navigator.hardwareConcurrency;

        // 更新设备处理器能力评估
        if (this.deviceCapabilities) {
          this.deviceCapabilities.processor =
            cores <= 2 ? 'low' : cores <= 6 ? 'normal' : 'high';
        }

        // 考虑CPU核心数，但避免设置过高的并发
        if (cores <= 2) {
          this.maxConcurrency = Math.min(this.maxConcurrency, 3);
          this.windowSize = Math.min(this.windowSize, 4);
          this.maxWindowSize = Math.min(this.maxWindowSize, 5);
        } else if (cores <= 4) {
          this.maxConcurrency = Math.min(this.maxConcurrency, 4);
        }
      }

      // 检测电池状态（如果可用）
      if ('getBattery' in navigator) {
        (navigator as any)
          .getBattery()
          .then((battery: any) => {
            const isCharging = battery.charging;
            const level = battery.level;

            // 更新设备电池评估
            if (this.deviceCapabilities) {
              this.deviceCapabilities.battery = isCharging
                ? 'high'
                : level < 0.3
                  ? 'low'
                  : 'normal';
            }

            // 如果电量低且未充电，减少资源使用
            if (!isCharging && level < 0.3) {
              this.maxConcurrency = Math.min(this.maxConcurrency, 3);
              this.maxWindowSize = Math.min(this.maxWindowSize, 5);
              this.targetUtilization = 0.7; // 降低目标带宽利用率
            }
          })
          .catch(() => {
            // 忽略错误，使用默认值
          });
      }
    }
  }

  /**
   * 公开方法：手动设置基础并发数
   * @param concurrency 并发数
   */
  public setBaseConcurrency(concurrency: number): void {
    this.baseConcurrency = Math.max(
      this.minConcurrency,
      Math.min(this.maxConcurrency, concurrency)
    );

    // 如果适应性调整已禁用，直接设置当前并发数
    if (!this.adaptationEnabled) {
      this.setConcurrency(this.baseConcurrency);
    } else {
      // 触发一次并发调整
      this.adjustConcurrency();
    }
  }

  /**
   * 公开方法：启用/禁用自适应调整
   * @param enabled 是否启用
   */
  public setAdaptationEnabled(enabled: boolean): void {
    this.adaptationEnabled = enabled;

    // 如果禁用了自适应调整，恢复到基础并发数
    if (!enabled) {
      this.setConcurrency(this.baseConcurrency);
    }
  }

  /**
   * 公开方法：获取当前网络质量
   * @returns 当前网络质量
   */
  public getCurrentNetworkQuality(): NetworkQuality {
    return this.currentNetworkQuality;
  }

  /**
   * 公开方法：获取当前上传速度信息
   * @returns 速度信息
   */
  public getSpeedInfo(): {
    current: number;
    average: number;
    peak: number;
    quality: NetworkQuality;
    jitter?: number;
    stable: boolean;
  } {
    return {
      current: this.currentSpeed,
      average: this.avgSpeed,
      peak: this.peakSpeed,
      quality: this.currentNetworkQuality,
      jitter: this.jitterValue,
      stable: this.isNetworkStable,
    };
  }

  /**
   * 公开方法：获取当前设备能力评估
   */
  public getDeviceCapabilities(): DeviceCapability | null {
    return this.deviceCapabilities;
  }

  /**
   * 公开方法：获取当前窗口大小
   */
  public getWindowSize(): number {
    return this.windowSize;
  }

  /**
   * 公开方法：手动触发网络检测
   */
  public forceNetworkDetection(): void {
    this.detectNetworkCondition();
  }

  /**
   * 销毁插件，清理资源
   */
  public destroy(): void {
    // 清除定时器
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }

    if (this.concurrencyAdjustInterval) {
      clearInterval(this.concurrencyAdjustInterval);
      this.concurrencyAdjustInterval = null;
    }

    if (this.speedCalculationInterval) {
      clearInterval(this.speedCalculationInterval);
      this.speedCalculationInterval = null;
    }

    if (this.performanceAnalysisInterval) {
      clearInterval(this.performanceAnalysisInterval);
      this.performanceAnalysisInterval = null;
    }

    // 重置数据
    this.speedSamples = [];
    this.rttSamples = [];
    this.currentSpeed = 0;
    this.avgSpeed = 0;
    this.peakSpeed = 0;
    this.jitterValue = 0;

    // 取消事件监听
    if (this.eventBus) {
      this.eventBus.off('upload:start');
      this.eventBus.off('upload:complete');
      this.eventBus.off('upload:error');
      this.eventBus.off('chunk:uploaded');
      this.eventBus.off('chunk:error');
    }

    // 移除网络检测器回调
    if (this.networkDetector) {
      // 这里假设NetworkDetector有removeQualityCallback方法
      // 需要确认这个方法的签名
      // this.networkDetector.removeQualityCallback(...);
    }

    // 移除钩子
    if (this.core && this.core.getPluginManager()) {
      this.core.getPluginManager()?.removePluginHooks('SmartConcurrencyPlugin');
    }

    // 清除引用
    this.core = null;
    this.taskScheduler = null;
    this.eventBus = null;
    this.networkDetector = null;
  }

  /**
   * 任务创建前钩子，调整窗口大小
   */
  private async beforeTaskCreateHook(args: {
    task: any;
    metadata?: TaskMetadata;
  }): Promise<any> {
    // 根据当前窗口大小和网络状态调整任务
    // 简单实现：如果有窗口大小控制，可以在这里进行任务的过滤或排队
    return args;
  }

  /**
   * 更新RTT样本
   * @param rtt 往返时间(ms)
   */
  private updateRTTSamples(rtt: number): void {
    this.rttSamples.push(rtt);

    // 保留最近的样本
    if (this.rttSamples.length > 20) {
      this.rttSamples.shift();
    }

    // 更新抖动值
    if (this.rttSamples.length > 1) {
      const lastRtt = this.rttSamples[this.rttSamples.length - 2];
      const currentJitter = Math.abs(rtt - lastRtt);

      // 指数移动平均更新抖动值
      this.jitterValue = 0.8 * this.jitterValue + 0.2 * currentJitter;
    }

    // 更新发送窗口大小
    this.updateCongestionWindow();
  }

  /**
   * 更新拥塞窗口大小
   */
  private updateCongestionWindow(): void {
    if (this.rttSamples.length < 3) return;

    // 计算平均RTT
    const avgRtt = this.calculateAvgRTT();

    // 计算RTT变化趋势
    const rttTrend = this.calculateRTTTrend();

    // 拥塞避免算法简单实现
    if (rttTrend === 'decreasing') {
      // RTT减小，可以适当增加窗口
      this.congestionWindow = Math.min(
        this.congestionWindow * 1.05,
        this.maxWindowSize
      );
    } else if (rttTrend === 'increasing') {
      // RTT增加，可能拥塞，减小窗口
      this.congestionWindow = Math.max(
        this.congestionWindow * 0.95,
        this.minWindowSize
      );
    }

    // 更新窗口大小（取整）
    this.windowSize = Math.max(
      this.minWindowSize,
      Math.min(Math.round(this.congestionWindow), this.maxWindowSize)
    );

    // 抖动较大时适当减小窗口
    if (this.jitterValue > avgRtt * 0.5) {
      this.windowSize = Math.max(
        this.minWindowSize,
        Math.floor(this.windowSize * 0.9)
      );
    }

    // 发出窗口变化事件
    if (this.eventBus) {
      this.eventBus.emit('window:size:change', {
        windowSize: this.windowSize,
        congestionWindow: this.congestionWindow,
        avgRtt,
        jitter: this.jitterValue,
        trend: rttTrend,
      });
    }
  }

  /**
   * 计算平均RTT
   */
  private calculateAvgRTT(): number {
    if (this.rttSamples.length === 0) return 0;

    const sum = this.rttSamples.reduce((acc, val) => acc + val, 0);
    return sum / this.rttSamples.length;
  }

  /**
   * 计算RTT变化趋势
   */
  private calculateRTTTrend(): 'stable' | 'increasing' | 'decreasing' {
    if (this.rttSamples.length < 5) return 'stable';

    const recentSamples = this.rttSamples.slice(-5);
    const firstHalf = recentSamples.slice(0, 2);
    const secondHalf = recentSamples.slice(-2);

    const firstAvg =
      firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

    const difference = secondAvg - firstAvg;
    const threshold = firstAvg * 0.1; // 10%的变化视为显著变化

    if (difference > threshold) {
      return 'increasing';
    } else if (difference < -threshold) {
      return 'decreasing';
    } else {
      return 'stable';
    }
  }
}

export default SmartConcurrencyPlugin;
