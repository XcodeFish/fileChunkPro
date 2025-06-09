/**
 * SmartConcurrencyPlugin - 智能并发控制插件
 *
 * 功能：
 * 1. 网络状况自适应：根据当前网络状况动态调整上传策略
 * 2. 动态并发调整：基于实时网络性能和设备状态智能调整并发数
 * 3. 优先级队列实现：支持任务优先级，确保重要分片优先上传
 * 4. 带宽监控与优化：监控网络带宽使用情况，优化上传速率
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
} from '../types';

// 定义网络速度采样数据结构
interface SpeedSample {
  timestamp: number;
  bytesTransferred: number;
  duration: number;
  speed: number; // bytes/s
}

// 定义网络质量阈值（单位：kb/s）
const NETWORK_QUALITY_THRESHOLD = {
  [NetworkQuality.POOR]: 50, // 50 KB/s
  [NetworkQuality.LOW]: 200, // 200 KB/s
  [NetworkQuality.MEDIUM]: 500, // 500 KB/s
  [NetworkQuality.GOOD]: 1000, // 1 MB/s
  [NetworkQuality.EXCELLENT]: 2000, // 2 MB/s
};

// 定义优先级配置
const PRIORITY_CONFIG = {
  // 首个分片优先级
  FIRST_CHUNK: TaskPriority.HIGH,
  // 最后一个分片优先级
  LAST_CHUNK: TaskPriority.HIGH,
  // 元数据分片优先级
  METADATA_CHUNK: TaskPriority.CRITICAL,
  // 重试分片优先级增量
  RETRY_PRIORITY_INCREMENT: 1,
  // 最大优先级
  MAX_PRIORITY: TaskPriority.CRITICAL,
};

export class SmartConcurrencyPlugin implements IPlugin {
  public version = '1.0.0';
  private core: UploaderCore | null = null;
  private taskScheduler: TaskScheduler | null = null;
  private eventBus: EventBus | null = null;

  // 网络状态监控
  private networkCondition: NetworkCondition | null = null;
  private currentNetworkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private speedSamples: SpeedSample[] = [];
  private lastSampleTime = 0;
  private totalBytesTransferred = 0;
  private samplingStartTime = 0;
  private isNetworkStable = false;
  private consecutiveStableReadings = 0;

  // 并发控制
  private baseConcurrency = 3; // 默认基础并发数
  private minConcurrency = 1;
  private maxConcurrency = 6;
  private currentConcurrency = 3;
  private adaptationEnabled = true;

  // 监控间隔
  private networkCheckInterval: any = null;
  private concurrencyAdjustInterval: any = null;
  private speedCalculationInterval: any = null;

  // 采样配置
  private readonly SAMPLE_INTERVAL = 2000; // 2秒
  private readonly SAMPLE_HISTORY_SIZE = 15; // 保留15个采样
  private readonly STABLE_READINGS_THRESHOLD = 3; // 3次稳定读数后确认网络稳定
  private readonly CONCURRENCY_ADJUST_INTERVAL = 5000; // 5秒调整一次并发数

  // 带宽使用情况
  private currentSpeed = 0; // bytes/s
  private avgSpeed = 0; // bytes/s
  private peakSpeed = 0; // bytes/s
  private targetUtilization = 0.85; // 目标带宽利用率，避免网络饱和

  constructor(options?: {
    minConcurrency?: number;
    maxConcurrency?: number;
    baseConcurrency?: number;
    adaptationEnabled?: boolean;
    targetUtilization?: number;
    sampleInterval?: number;
  }) {
    if (options) {
      this.minConcurrency = options.minConcurrency ?? this.minConcurrency;
      this.maxConcurrency = options.maxConcurrency ?? this.maxConcurrency;
      this.baseConcurrency = options.baseConcurrency ?? this.baseConcurrency;
      this.currentConcurrency = this.baseConcurrency;
      this.adaptationEnabled =
        options.adaptationEnabled ?? this.adaptationEnabled;
      this.targetUtilization =
        options.targetUtilization ?? this.targetUtilization;

      if (options.sampleInterval) {
        this.SAMPLE_INTERVAL = options.sampleInterval;
      }
    }
  }

  /**
   * 插件安装方法
   * @param core UploaderCore实例
   */
  public install(core: UploaderCore): void {
    this.core = core;
    this.eventBus = core.getEventBus();
    this.taskScheduler = core.getTaskScheduler();

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
  }

  /**
   * 初始化并发设置
   */
  private initializeConcurrency(): void {
    if (!this.taskScheduler) return;

    // 读取当前配置作为基准
    this.baseConcurrency = this.taskScheduler.getConcurrency();
    this.currentConcurrency = this.baseConcurrency;

    // 根据环境确定最大并发数
    this.detectEnvironmentCapabilities();
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
    });

    // 监听上传错误事件
    this.eventBus.on('upload:error', () => {
      this.stopSpeedCalculation();
    });

    // 监听分片上传成功事件，用于计算上传速度
    this.eventBus.on('chunk:uploaded', (data: { size: number }) => {
      this.recordTransfer(data.size);
    });

    // 监听分片上传失败事件
    this.eventBus.on('chunk:error', () => {
      this.handleChunkError();
    });
  }

  /**
   * 注册钩子
   */
  private registerHooks(): void {
    if (!this.core) return;

    // 注册分片创建前钩子，用于设置分片优先级
    this.core
      .getPluginManager()
      ?.registerHook(
        'beforeChunkUpload',
        this.beforeChunkUploadHook.bind(this),
        { plugin: 'SmartConcurrencyPlugin' }
      );

    // 注册上传策略调整钩子
    this.core
      .getPluginManager()
      ?.registerHook(
        'determineUploadStrategy',
        this.determineUploadStrategyHook.bind(this),
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
      priority = PRIORITY_CONFIG.FIRST_CHUNK;
    }
    // 最后一个分片优先级高
    else if (chunk.index === chunk.total - 1) {
      priority = PRIORITY_CONFIG.LAST_CHUNK;
    }

    // 如果是元数据分片，优先级最高
    if (metadata?.isMetadata) {
      priority = PRIORITY_CONFIG.METADATA_CHUNK;
    }

    // 如果是重试分片，提高优先级
    if (metadata?.retryCount && metadata.retryCount > 0) {
      // 提高优先级，但不超过最大优先级
      priority = Math.min(
        priority + PRIORITY_CONFIG.RETRY_PRIORITY_INCREMENT,
        PRIORITY_CONFIG.MAX_PRIORITY
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

    // 在网络极好的情况下，可以增大分片大小提高效率
    if (this.currentNetworkQuality === NetworkQuality.EXCELLENT) {
      // 但也不要过大，以防造成其他问题
      const increasedChunkSize = Math.max(strategy.chunkSize, 2 * 1024 * 1024); // 至少2MB
      optimized.chunkSize = Math.min(increasedChunkSize, 8 * 1024 * 1024); // 最大8MB
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
  }

  /**
   * 记录数据传输
   */
  private recordTransfer(bytes: number): void {
    const now = Date.now();
    this.totalBytesTransferred += bytes;

    // 只有时间间隔大于指定值时才记录采样
    if (now - this.lastSampleTime >= this.SAMPLE_INTERVAL) {
      const duration = now - this.lastSampleTime;
      const speed = (bytes / duration) * 1000; // bytes/s

      // 添加采样
      this.speedSamples.push({
        timestamp: now,
        bytesTransferred: bytes,
        duration,
        speed,
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

      recentSamples.forEach(sample => {
        totalSpeed += sample.speed;
      });

      this.currentSpeed = totalSpeed / recentSamples.length;

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

    // 如果有Network Information API，使用它获取更详细的网络信息
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
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
    const kbps = this.currentSpeed / 1024; // 转换为KB/s

    if (kbps <= 0) {
      // 没有速度数据时保持当前状态
      return;
    }

    let newQuality: NetworkQuality;

    if (kbps < NETWORK_QUALITY_THRESHOLD[NetworkQuality.POOR]) {
      newQuality = NetworkQuality.POOR;
    } else if (kbps < NETWORK_QUALITY_THRESHOLD[NetworkQuality.LOW]) {
      newQuality = NetworkQuality.LOW;
    } else if (kbps < NETWORK_QUALITY_THRESHOLD[NetworkQuality.MEDIUM]) {
      newQuality = NetworkQuality.MEDIUM;
    } else if (kbps < NETWORK_QUALITY_THRESHOLD[NetworkQuality.GOOD]) {
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
      this.adjustConcurrency();
    }
  }

  /**
   * 处理分片错误
   */
  private handleChunkError(): void {
    // 连续错误可能表示网络问题，降低并发数
    if (this.adaptationEnabled) {
      const newConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.currentConcurrency * 0.75)
      );

      if (newConcurrency !== this.currentConcurrency) {
        this.setConcurrency(newConcurrency);

        // 通知事件
        if (this.eventBus) {
          this.eventBus.emit('concurrency:reduced', {
            reason: 'chunk_error',
            from: this.currentConcurrency,
            to: newConcurrency,
          });
        }
      }
    }
  }

  /**
   * 根据网络状况调整并发数
   */
  private adjustConcurrency(): void {
    if (!this.taskScheduler || !this.adaptationEnabled) return;

    let newConcurrency: number;

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

    // 如果网络不稳定，降低并发以提高成功率
    if (!this.isNetworkStable && newConcurrency > this.minConcurrency) {
      newConcurrency = Math.max(
        this.minConcurrency,
        Math.floor(newConcurrency * 0.8)
      );
    }

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
  }

  /**
   * 配置调度器使用优先级队列
   */
  private configureSchedulerPriorityQueue(): void {
    if (!this.taskScheduler) return;

    // 更新任务调度器配置，启用优先级队列
    this.taskScheduler.updateConfig({
      priorityQueue: true,
    });
  }

  /**
   * 检测环境能力，调整最大并发数
   */
  private detectEnvironmentCapabilities(): void {
    // 浏览器环境下检测设备内存和处理能力
    if (typeof navigator !== 'undefined') {
      // 检测设备内存
      if ('deviceMemory' in navigator) {
        const memory = (navigator as any).deviceMemory as number;

        // 根据设备内存调整最大并发数
        if (memory <= 2) {
          // 低内存设备
          this.maxConcurrency = 3;
        } else if (memory <= 4) {
          // 中等内存设备
          this.maxConcurrency = 4;
        } else if (memory <= 8) {
          // 高内存设备
          this.maxConcurrency = 5;
        } else {
          // 超高内存设备
          this.maxConcurrency = 6;
        }
      }

      // 检测硬件并发数
      if ('hardwareConcurrency' in navigator) {
        const cores = navigator.hardwareConcurrency;

        // 考虑CPU核心数，但避免设置过高的并发
        if (cores <= 2) {
          this.maxConcurrency = Math.min(this.maxConcurrency, 3);
        } else if (cores <= 4) {
          this.maxConcurrency = Math.min(this.maxConcurrency, 4);
        }
      }
    }
  }

  /**
   * 公开方法：手动设置基础并发数
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
   */
  public getCurrentNetworkQuality(): NetworkQuality {
    return this.currentNetworkQuality;
  }

  /**
   * 公开方法：获取当前上传速度信息
   */
  public getSpeedInfo(): {
    current: number;
    average: number;
    peak: number;
    quality: NetworkQuality;
  } {
    return {
      current: this.currentSpeed,
      average: this.avgSpeed,
      peak: this.peakSpeed,
      quality: this.currentNetworkQuality,
    };
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

    // 重置数据
    this.speedSamples = [];
    this.currentSpeed = 0;
    this.avgSpeed = 0;
    this.peakSpeed = 0;

    // 取消事件监听
    if (this.eventBus) {
      this.eventBus.off('upload:start');
      this.eventBus.off('upload:complete');
      this.eventBus.off('upload:error');
      this.eventBus.off('chunk:uploaded');
      this.eventBus.off('chunk:error');
    }

    // 移除钩子
    if (this.core && this.core.getPluginManager()) {
      this.core.getPluginManager()?.removePluginHooks('SmartConcurrencyPlugin');
    }

    // 清除引用
    this.core = null;
    this.taskScheduler = null;
    this.eventBus = null;
  }
}
