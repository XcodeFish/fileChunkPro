/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * SmartConcurrencyPlugin - 智能并发控制插件 (重构版)
 *
 * 功能：
 * 1. 网络状况自适应：根据当前网络状况动态调整上传策略
 * 2. 动态并发调整：基于实时网络性能和设备状态智能调整并发数
 * 3. 优先级队列实现：支持任务优先级，确保重要分片优先上传
 * 4. 带宽监控与优化：监控网络带宽使用情况，优化上传速率
 * 5. 自适应发送窗口：根据网络延迟动态调整发送窗口大小
 */

import EventBus from '../../core/EventBus';
import { TaskScheduler } from '../../core/TaskScheduler';
import { UploaderCore } from '../../core/UploaderCore';
import { Logger } from '../../utils/Logger';
import { NetworkDetector } from '../../utils/NetworkDetector';
import { StateLockManager } from '../utils/StateLock';

// 导入拆分后的模块
import { ConcurrencyStrategy } from '../strategies/ConcurrencyStrategy';
import {
  DeviceCapabilityEvaluator,
  ExtendedDeviceCapability,
} from '../evaluators/DeviceCapabilityEvaluator';
import {
  NetworkPerformanceAnalyzer,
  SpeedSample,
} from '../analyzers/NetworkPerformanceAnalyzer';
import { AdaptiveFactorManager } from '../adaptive/AdaptiveFactorManager';

import {
  IPlugin,
  TaskPriority,
  NetworkQuality,
  UploadStrategy,
  TaskMetadata,
  PriorityConfig,
} from '../../types';

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
  public version = '3.1.0';
  private core: UploaderCore | null = null;
  private taskScheduler: TaskScheduler | null = null;
  private eventBus: EventBus | null = null;
  private networkDetector: NetworkDetector | null = null;
  private logger: Logger;

  // 网络状态监控
  private currentNetworkQuality: NetworkQuality = NetworkQuality.UNKNOWN;

  // 并发控制
  private baseConcurrency = 3; // 默认基础并发数
  private minConcurrency = 1;
  private maxConcurrency = 6;
  private currentConcurrency = 3;
  private adaptationEnabled = true;
  private initialConcurrencySet = false;
  private concurrencyLockId = 'concurrency-control';

  // 监控间隔
  private networkCheckInterval: any = null;
  private concurrencyAdjustInterval: any = null;
  private performanceAnalysisInterval: any = null;

  // 采样与配置
  private readonly SAMPLE_INTERVAL: number;
  private readonly CONCURRENCY_ADJUST_INTERVAL: number;

  // 配置项
  private concurrencyConfig: ConcurrencyConfig;
  private priorityConfig: PriorityConfig;

  // 文件和进度信息
  private fileSize = 0; // 当前处理的文件大小
  private currentProgress = 0; // 当前上传进度

  // 拆分出的组件
  private performanceAnalyzer: NetworkPerformanceAnalyzer;
  private adaptiveFactorManager: AdaptiveFactorManager;
  private extendedDeviceCapability: ExtendedDeviceCapability | null = null;
  private extremeNetworkDetected = false; // 是否检测到极端网络环境

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
    // 初始化logger
    this.logger = new Logger('SmartConcurrencyPlugin');

    // 初始化采样配置
    this.SAMPLE_INTERVAL = options?.sampleInterval ?? 2000; // 2秒
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

    // 初始化优先级配置
    this.priorityConfig = {
      firstChunk: TaskPriority.HIGH,
      lastChunk: TaskPriority.HIGH,
      metadataChunk: TaskPriority.CRITICAL,
      retryIncrement: 1,
      maxPriority: TaskPriority.CRITICAL,
      ...options?.priorityConfig,
    };

    // 初始化性能分析器
    this.performanceAnalyzer = new NetworkPerformanceAnalyzer({
      maxSpeedSamples: 15,
      maxRttSamples: 10,
      stableReadingsThreshold: options?.stabilityThreshold ?? 3,
    });

    // 初始化自适应因子管理器
    this.adaptiveFactorManager = new AdaptiveFactorManager();
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
      this.logger.warn('TaskScheduler未找到，插件功能将受限');
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

    this.logger.info('SmartConcurrencyPlugin 已安装', {
      version: this.version,
      baseConcurrency: this.baseConcurrency,
      adaptationEnabled: this.adaptationEnabled,
    });
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

    // 根据设备性能调整最大并发数
    this.adjustMaxConcurrencyByDevice();

    // 设置初始并发数
    this.setConcurrency(this.currentConcurrency);
  }

  /**
   * 检测环境能力
   */
  private detectEnvironmentCapabilities(): void {
    // 使用DeviceCapabilityEvaluator检测设备能力
    this.extendedDeviceCapability =
      DeviceCapabilityEvaluator.evaluateDeviceCapabilities(
        this.performanceAnalyzer.getRTTSamples()
      );

    if (this.extendedDeviceCapability) {
      // 计算初始自适应因子
      this.calculateInitialAdaptiveFactors();
    }
  }

  /**
   * 计算初始自适应因子
   */
  private calculateInitialAdaptiveFactors(): void {
    if (!this.extendedDeviceCapability) return;

    // 设置设备性能因子
    const deviceFactor = this.adaptiveFactorManager.calculateDeviceFactor(
      this.extendedDeviceCapability
    );
    this.adaptiveFactorManager.setFactor('device', deviceFactor);

    // 设置网络质量因子
    const networkFactor = this.adaptiveFactorManager.calculateNetworkFactor(
      this.currentNetworkQuality
    );
    this.adaptiveFactorManager.setFactor('network', networkFactor);

    // 设置RTT因子
    const avgRTT = this.performanceAnalyzer.calculateAvgRTT();
    const rttFactor = this.adaptiveFactorManager.calculateRttFactor(avgRTT);
    this.adaptiveFactorManager.setFactor('rtt', rttFactor);
  }

  /**
   * 根据设备性能调整最大并发数
   */
  private adjustMaxConcurrencyByDevice(): void {
    if (!this.extendedDeviceCapability) return;

    const { overallPerformanceScore, isMobile } = this.extendedDeviceCapability;

    // 基于设备性能和移动性调整最大并发数
    if (overallPerformanceScore < 3) {
      // 低性能设备
      this.maxConcurrency = Math.min(this.maxConcurrency, 2);
    } else if (overallPerformanceScore < 5) {
      // 中低性能设备
      this.maxConcurrency = Math.min(this.maxConcurrency, 3);
    } else if (overallPerformanceScore < 7) {
      // 中等性能设备
      this.maxConcurrency = Math.min(this.maxConcurrency, isMobile ? 4 : 5);
    } else {
      // 高性能设备
      this.maxConcurrency = Math.min(this.maxConcurrency, isMobile ? 5 : 8);
    }
  }

  /**
   * 设置并发数
   * @param concurrency 并发数
   */
  private setConcurrency(concurrency: number): void {
    if (!this.taskScheduler) return;

    // 使用状态锁确保设置并发数的原子性
    const lock = StateLockManager.getLock(this.concurrencyLockId);

    lock.withLockSync(() => {
      const actual = Math.max(
        this.minConcurrency,
        Math.min(this.maxConcurrency, concurrency)
      );

      // 在锁保护下更新状态
      this.currentConcurrency = actual;
      this.taskScheduler!.setConcurrency(actual);

      this.eventBus?.emit('concurrency:change', {
        value: actual,
        timestamp: Date.now(),
        previous: this.currentConcurrency,
        reason: 'manual_adjustment',
      });
    });
  }

  /**
   * 注册事件监听
   */
  private registerEventListeners(): void {
    if (!this.eventBus) return;

    // 监听网络质量变化
    this.eventBus.on(
      'network:qualityChange',
      this.handleNetworkQualityChange.bind(this)
    );

    // 监听网络在线/离线状态
    this.eventBus.on('network:online', () => {
      this.logger.info('网络已连接，调整并发策略');
      this.scheduleConcurrencyAdjustment();
    });

    this.eventBus.on('network:offline', () => {
      this.logger.warn('网络已断开，降低并发至最小值');
      this.setConcurrency(this.minConcurrency);
    });

    // 监听分片上传开始
    this.eventBus.on('chunkUploadStart', data => {
      this.handleChunkStart(data);
    });

    // 监听分片上传成功
    this.eventBus.on('chunkSuccess', data => {
      this.handleChunkSuccess(data);
    });

    // 监听分片上传错误
    this.eventBus.on('chunkError', data => {
      this.handleChunkError(data);
    });

    // 监听上传进度
    this.eventBus.on('progress', data => {
      if (data.progress !== undefined) {
        this.currentProgress = data.progress / 100;
        this.checkProgressStageAndAdjust();
      }
    });

    // 监听文件上传开始
    this.eventBus.on('uploadStart', data => {
      if (data.fileSize) {
        this.fileSize = data.fileSize;
        this.adjustConcurrencyByFileSize();
      }
    });
  }

  /**
   * 注册上传流程钩子
   */
  private registerHooks(): void {
    if (!this.core) return;

    // 注册分片上传前的钩子
    this.core.hook('beforeChunkUpload', this.beforeChunkUploadHook.bind(this));

    // 注册上传策略确定前的钩子
    this.core.hook(
      'determineUploadStrategy',
      this.determineUploadStrategyHook.bind(this)
    );

    // 注册任务创建前的钩子
    this.core.hook('beforeTaskCreate', this.beforeTaskCreateHook.bind(this));
  }

  /**
   * 开始网络监控
   */
  private startNetworkMonitoring(): void {
    // 清除旧的定时器
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
    }

    // 创建新的定时器
    this.networkCheckInterval = setInterval(() => {
      this.detectNetworkCondition();
    }, this.SAMPLE_INTERVAL);
  }

  /**
   * 检测网络条件
   */
  private detectNetworkCondition(): void {
    if (!this.networkDetector) return;

    // 获取当前网络状态
    const quality = this.networkDetector.getCurrentNetworkQuality();

    // 更新网络质量
    if (this.currentNetworkQuality !== quality) {
      const previousQuality = this.currentNetworkQuality;
      this.currentNetworkQuality = quality;
      this.handleNetworkQualityChange({
        quality: this.currentNetworkQuality,
        previousQuality,
      });
    }
  }

  /**
   * 配置调度器使用优先级队列
   */
  private configureSchedulerPriorityQueue(): void {
    if (!this.taskScheduler || !this.taskScheduler.usePriorityQueue) return;

    // 配置调度器使用优先级队列
    this.taskScheduler.usePriorityQueue(true);
  }

  /**
   * 启动周期性性能分析
   */
  private startPerformanceAnalysis(): void {
    // 清除旧的定时器
    if (this.performanceAnalysisInterval) {
      clearInterval(this.performanceAnalysisInterval);
    }

    // 创建新的定时器
    this.performanceAnalysisInterval = setInterval(() => {
      this.analyzePerformanceData();
    }, this.CONCURRENCY_ADJUST_INTERVAL * 2);
  }

  /**
   * 分析性能数据
   */
  private analyzePerformanceData(): void {
    // 分析抖动和延迟
    this.extremeNetworkDetected =
      this.performanceAnalyzer.detectExtremeNetworkConditions();

    // 如果应该进行调整，安排一次并发调整
    if (this.adaptationEnabled) {
      this.scheduleConcurrencyAdjustment();
    }
  }

  /**
   * 安排并发调整
   */
  private scheduleConcurrencyAdjustment(): void {
    // 延迟调整，等待网络稳定
    setTimeout(() => {
      if (this.adaptationEnabled) {
        this.adjustConcurrency();
      }
    }, 500); // 短延迟，避免频繁调整
  }

  /**
   * 调整并发数
   */
  private adjustConcurrency(): void {
    // 保留原始并发数用于比较
    const originalConcurrency = this.currentConcurrency;

    // 检查是否是极端网络条件
    if (this.extremeNetworkDetected) {
      // 极端网络条件下的保守策略
      this.adjustConcurrencyForExtremeNetwork();
      return;
    }

    // 根据文件大小确定基础并发数
    let newConcurrency = this.getFileSizeBasedConcurrency();

    // 根据上传进度调整并发因子
    const progressFactor = this.getProgressBasedFactor();
    newConcurrency = Math.round(newConcurrency * progressFactor);

    // 应用所有自适应因子
    newConcurrency = this.applyAdaptiveFactors(newConcurrency);

    // 确保不超出限制
    newConcurrency = Math.max(
      this.minConcurrency,
      Math.min(this.maxConcurrency, newConcurrency)
    );

    // 如果当前并发数不同，更新它
    if (newConcurrency !== originalConcurrency) {
      this.setConcurrency(newConcurrency);

      // 通知事件
      if (this.eventBus) {
        this.eventBus.emit('concurrency:adjusted', {
          reason: 'adaptive_algorithm',
          quality: this.currentNetworkQuality,
          from: originalConcurrency,
          to: newConcurrency,
          stable: this.performanceAnalyzer.isNetworkStable(),
          extremeNetwork: this.extremeNetworkDetected,
        });
      }
    }
  }

  /**
   * 处理网络质量变化
   */
  private handleNetworkQualityChange(data: any): void {
    // 更新网络因子
    const networkFactor = this.adaptiveFactorManager.calculateNetworkFactor(
      this.currentNetworkQuality
    );
    this.adaptiveFactorManager.setFactor('network', networkFactor);

    // 日志记录网络质量变化
    this.logger.info('网络质量变化', {
      from: data.previousQuality,
      to: data.quality,
    });

    // 触发并发数调整
    this.scheduleConcurrencyAdjustment();

    // 更新优化的上传策略
    this.updateOptimalStrategy();
  }

  /**
   * 处理分片开始上传
   */
  private handleChunkStart(data: any): void {
    // 记录开始时间，用于后续计算RTT
    this.performanceAnalyzer.recordChunkStart(data);
  }

  /**
   * 处理分片上传成功
   */
  private handleChunkSuccess(data: any): void {
    // 记录成功上传的数据
    this.performanceAnalyzer.recordChunkSuccess(data);

    // 获取RTT数据并更新
    const uploadTime =
      data.uploadTime || this.performanceAnalyzer.getChunkUploadTime(data);
    if (uploadTime && data.size) {
      const speedSample = {
        timestamp: Date.now(),
        bytesTransferred: data.size,
        duration: uploadTime,
        speed: (data.size / uploadTime) * 1000, // bytes/s
        success: true,
        latency: uploadTime,
      };

      this.performanceAnalyzer.addSpeedSample(speedSample);
    }
  }

  /**
   * 处理分片上传错误
   */
  private handleChunkError(data: any): void {
    // 记录失败上传的数据
    this.performanceAnalyzer.recordChunkError(data);

    if (data.size) {
      const speedSample = {
        timestamp: Date.now(),
        bytesTransferred: data.size,
        duration: 0,
        speed: 0,
        success: false,
      };

      this.performanceAnalyzer.addSpeedSample(speedSample);
    }

    // 收集错误信息
    const errorType = data.error?.type || 'UNKNOWN';
    const isNetworkError =
      errorType.includes('NETWORK') ||
      errorType.includes('TIMEOUT') ||
      errorType.includes('CONNECTION');

    // 网络相关错误可能需要调整并发
    if (isNetworkError && this.adaptationEnabled) {
      this.scheduleConcurrencyAdjustment();
    }
  }

  /**
   * 分片上传前的钩子
   */
  private async beforeChunkUploadHook(args: {
    chunk: { index: number; size: number; total: number };
    metadata?: TaskMetadata;
  }): Promise<any> {
    const { chunk, metadata } = args;

    // 检查是否应该调整分片的优先级
    let priority = TaskPriority.NORMAL;

    // 如果是第一个分片，给予高优先级
    if (chunk.index === 0) {
      priority = this.priorityConfig.firstChunk;
    }
    // 如果是最后一个分片，给予高优先级
    else if (chunk.index === chunk.total - 1) {
      priority = this.priorityConfig.lastChunk;
    }
    // 如果是元数据分片，给予最高优先级
    else if (metadata?.isMetadata) {
      priority = this.priorityConfig.metadataChunk;
    }
    // 如果是重试分片，提高优先级
    else if (metadata?.retryCount && metadata.retryCount > 0) {
      // 根据重试次数提高优先级，但不超过最大优先级
      priority = Math.min(
        TaskPriority.NORMAL +
          metadata.retryCount * this.priorityConfig.retryIncrement,
        this.priorityConfig.maxPriority
      );
    }

    // 返回修改后的参数
    return {
      ...args,
      metadata: {
        ...metadata,
        priority,
      },
    };
  }

  /**
   * 上传策略确定前的钩子
   */
  private async determineUploadStrategyHook(args: {
    strategy: UploadStrategy;
    fileSize: number;
  }): Promise<any> {
    const { strategy, fileSize } = args;

    // 优化上传策略
    const optimizedStrategy = this.optimizeStrategy(strategy, fileSize);

    return {
      ...args,
      strategy: optimizedStrategy,
    };
  }

  /**
   * 任务创建前的钩子
   */
  private async beforeTaskCreateHook(args: {
    task: any;
    metadata?: TaskMetadata;
  }): Promise<any> {
    const { task, metadata } = args;

    // 如果没有设置优先级，使用默认优先级
    if (!metadata?.priority) {
      return {
        ...args,
        metadata: {
          ...metadata,
          priority: TaskPriority.NORMAL,
        },
      };
    }

    return args;
  }

  /**
   * 根据文件大小调整并发数
   */
  private adjustConcurrencyByFileSize(): void {
    // 根据文件大小确定基础并发数
    const newConcurrency = this.getFileSizeBasedConcurrency();

    // 设置新的并发数
    if (newConcurrency !== this.currentConcurrency) {
      this.setConcurrency(newConcurrency);

      if (this.eventBus) {
        this.eventBus.emit('concurrency:adjusted', {
          reason: 'file_size',
          from: this.currentConcurrency,
          to: newConcurrency,
          fileSize: this.fileSize,
        });
      }
    }
  }

  /**
   * 检查进度阶段并调整并发数
   */
  private checkProgressStageAndAdjust(): void {
    // 获取基于进度的调整因子
    const progressFactor = this.getProgressBasedFactor();

    // 设置进度因子到自适应管理器
    this.adaptiveFactorManager.setFactor('progress', progressFactor);

    // 仅在特定进度节点触发调整
    const progressMilestones = [0.25, 0.5, 0.75, 0.9, 0.95];
    const isAtMilestone = progressMilestones.some(
      milestone => Math.abs(this.currentProgress - milestone) < 0.02 // 2%误差范围内
    );

    if (isAtMilestone) {
      this.scheduleConcurrencyAdjustment();
    }
  }

  /**
   * 销毁插件
   */
  public destroy(): void {
    // 清除所有定时器
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }

    if (this.concurrencyAdjustInterval) {
      clearInterval(this.concurrencyAdjustInterval);
      this.concurrencyAdjustInterval = null;
    }

    if (this.performanceAnalysisInterval) {
      clearInterval(this.performanceAnalysisInterval);
      this.performanceAnalysisInterval = null;
    }

    // 移除事件监听
    if (this.eventBus) {
      this.eventBus.off('network:qualityChange');
      this.eventBus.off('network:online');
      this.eventBus.off('network:offline');
      this.eventBus.off('chunkUploadStart');
      this.eventBus.off('chunkSuccess');
      this.eventBus.off('chunkError');
      this.eventBus.off('progress');
      this.eventBus.off('uploadStart');
    }

    // 重置性能分析器
    this.performanceAnalyzer.reset();
    // 重置自适应因子管理器
    this.adaptiveFactorManager.resetFactors();

    this.logger.info('SmartConcurrencyPlugin 已销毁');
  }

  /**
   * 应用所有自适应因子
   */
  private applyAdaptiveFactors(concurrency: number): number {
    return this.adaptiveFactorManager.applyFactors(concurrency);
  }

  /**
   * 极端网络条件下的并发调整
   */
  private adjustConcurrencyForExtremeNetwork(): void {
    // 极端网络条件下使用更保守的策略
    const extremeNetworkConcurrency = Math.max(
      1,
      Math.floor(this.minConcurrency * 1.5)
    );

    // 如果当前并发数较高，则迅速降低
    if (this.currentConcurrency > extremeNetworkConcurrency) {
      const newConcurrency = Math.max(1, extremeNetworkConcurrency);

      this.setConcurrency(newConcurrency);

      if (this.eventBus) {
        this.eventBus.emit('concurrency:adjusted', {
          reason: 'extreme_network',
          quality: this.currentNetworkQuality,
          from: this.currentConcurrency,
          to: newConcurrency,
          stable: false,
          extremeNetwork: true,
        });
      }
    }
  }

  /**
   * 根据文件大小获取基础并发数
   */
  private getFileSizeBasedConcurrency(): number {
    if (this.fileSize <= 0) return this.baseConcurrency;

    return ConcurrencyStrategy.getFileSizeConcurrency(
      this.fileSize,
      this.baseConcurrency,
      this.minConcurrency,
      this.maxConcurrency
    );
  }

  /**
   * 根据上传进度获取调整因子
   */
  private getProgressBasedFactor(): number {
    if (this.currentProgress <= 0) return 1.0;

    return ConcurrencyStrategy.getProgressConcurrencyFactor(
      this.currentProgress
    );
  }

  /**
   * 优化上传策略
   */
  private optimizeStrategy(
    strategy: UploadStrategy,
    fileSize: number
  ): UploadStrategy {
    // 优化上传策略
    return ConcurrencyStrategy.optimizeUploadStrategy({
      baseStrategy: strategy,
      fileSize,
      networkQuality: this.currentNetworkQuality,
      concurrency: this.currentConcurrency,
      extremeNetwork: this.extremeNetworkDetected,
    });
  }

  /**
   * 更新最佳上传策略
   */
  private updateOptimalStrategy(): void {
    if (!this.core) return;

    // 获取当前文件大小
    const currentFileSize = this.fileSize;
    if (currentFileSize <= 0) return;

    // 根据网络质量和文件大小优化策略
    const strategy = ConcurrencyStrategy.determineOptimalStrategy(
      currentFileSize,
      this.currentNetworkQuality,
      this.currentConcurrency,
      this.extremeNetworkDetected
    );

    // 应用策略
    if (this.core.setUploadStrategy) {
      this.core.setUploadStrategy(strategy);
    }
  }

  /**
   * 获取当前网络质量
   */
  public getCurrentNetworkQuality(): NetworkQuality {
    return this.currentNetworkQuality;
  }

  /**
   * 获取速度信息
   */
  public getSpeedInfo(): {
    current: number;
    average: number;
    peak: number;
    quality: NetworkQuality;
    jitter?: number;
    stable: boolean;
  } {
    const performanceStats = this.performanceAnalyzer.getPerformanceStats();

    return {
      current: performanceStats.currentSpeed,
      average: performanceStats.avgSpeed,
      peak: performanceStats.peakSpeed,
      quality: this.currentNetworkQuality,
      jitter: performanceStats.jitterValue,
      stable: performanceStats.isNetworkStable,
    };
  }

  /**
   * 获取设备能力
   */
  public getDeviceCapabilities(): ExtendedDeviceCapability | null {
    return this.extendedDeviceCapability;
  }

  /**
   * 强制进行网络检测
   */
  public forceNetworkDetection(): void {
    this.detectNetworkCondition();
    this.performanceAnalyzer.updateNetworkPerformance();
  }

  /**
   * 设置基础并发数
   */
  public setBaseConcurrency(concurrency: number): void {
    if (
      concurrency >= this.minConcurrency &&
      concurrency <= this.maxConcurrency
    ) {
      this.baseConcurrency = concurrency;
      this.logger.info(`基础并发数已设置为: ${concurrency}`);

      // 如果适应性未启用，直接应用新的并发数
      if (!this.adaptationEnabled) {
        this.setConcurrency(concurrency);
      }
    } else {
      this.logger.warn(
        `并发数 ${concurrency} 超出范围 [${this.minConcurrency}-${this.maxConcurrency}]`
      );
    }
  }

  /**
   * 设置是否启用自适应
   */
  public setAdaptationEnabled(enabled: boolean): void {
    this.adaptationEnabled = enabled;
    this.logger.info(`自适应并发调整已${enabled ? '启用' : '禁用'}`);

    // 如果禁用，则重置为基础并发数
    if (!enabled) {
      this.setConcurrency(this.baseConcurrency);
    }
  }
}
