/**
 * MemoryManager - 智能内存管理工具
 * 用于估计可用内存、优化分片大小、监控内存使用和优化处理策略
 */

// 为小程序全局对象添加类型声明
declare global {
  const wx: any | undefined;
  const my: any | undefined;
  const tt: any | undefined;
  const swan: any | undefined;

  // 扩展Performance接口以支持Chrome特有的memory属性
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
    };
  }
}

// 设备内存能力枚举
export enum DeviceMemoryCapacity {
  VERY_LOW = 'very_low', // <1GB
  LOW = 'low', // 1-2GB
  MEDIUM = 'medium', // 2-4GB
  HIGH = 'high', // 4-8GB
  VERY_HIGH = 'very_high', // >8GB
}

// 内存使用趋势枚举
export enum MemoryTrend {
  STABLE = 'stable',
  GROWING = 'growing',
  DECREASING = 'decreasing',
}

export interface MemoryStats {
  used: number; // 已使用内存 (bytes)
  total: number; // 总内存 (bytes)
  limit: number; // 内存限制 (bytes)
  usageRatio: number; // 内存使用率 (0-1)
  growthRate?: number; // 内存增长率 (bytes/s)
  trend?: MemoryTrend; // 内存趋势
  capacity?: DeviceMemoryCapacity; // 设备内存容量级别
  availableForUploading?: number; // 可用于上传的内存估计值 (bytes)
  isLowMemoryEnvironment?: boolean; // 是否为低内存环境
}

// 内存警告级别枚举
export enum MemoryWarningLevel {
  NORMAL = 'normal', // 正常内存使用
  WARNING = 'warning', // 警告级别
  CRITICAL = 'critical', // 临界级别
}

// 内存预警事件详情
export interface MemoryWarningEvent {
  level: MemoryWarningLevel;
  stats: MemoryStats;
  recommendations: {
    chunkSize?: number; // 推荐的分片大小
    concurrency?: number; // 推荐的并发数
    shouldPause?: boolean; // 是否应该暂停上传
    shouldReleaseMemory?: boolean; // 是否应该释放内存
  };
}

// 分片处理策略
export interface ChunkProcessingStrategy {
  chunkSize: number; // 推荐的分片大小
  concurrency: number; // 推荐的并发数
  processingMode: 'sequential' | 'parallel' | 'hybrid'; // 处理模式
  useStreaming: boolean; // 是否使用流式处理
  prioritizeMetadata: boolean; // 是否优先处理元数据
  preloadChunks: number; // 预加载分片数量
}

/**
 * 智能内存管理工具类
 * 用于优化上传过程中的内存使用
 */
export class MemoryManager {
  // 内存使用量追踪
  private static memoryUsageHistory: number[] = [];
  private static memoryTimestampHistory: number[] = [];
  private static memoryWatcher: NodeJS.Timeout | null = null;
  private static readonly MAX_MEMORY_SAMPLES = 20; // 增加采样数量以提高准确性
  private static readonly CRITICAL_MEMORY_THRESHOLD = 0.85; // 85%
  private static readonly HIGH_MEMORY_THRESHOLD = 0.7; // 70%
  private static readonly NORMAL_MEMORY_THRESHOLD = 0.5; // 50%
  private static lastGarbageCollectionTime = 0;
  private static readonly MIN_GC_INTERVAL = 30000; // 最小GC间隔30秒
  private static lastRecommendationTime = 0;
  private static readonly MIN_RECOMMENDATION_INTERVAL = 5000; // 最小推荐间隔5秒
  private static lastMemoryWarning = 0;
  private static readonly MIN_WARNING_INTERVAL = 10000; // 最小警告间隔10秒
  private static deviceMemory: number | null = null; // 设备内存缓存
  private static detectedCapacity: DeviceMemoryCapacity | null = null; // 检测到的设备容量级别
  private static memoryAllocationLimit: number | null = null; // 上传任务可分配内存上限
  private static eventListeners: Map<string, Array<(event: any) => void>> =
    new Map(); // 事件监听器
  private static isInitialized = false; // 是否已初始化
  private static usePreciseMemoryInfo = false; // 是否使用精确内存信息
  private static memorySamplingRate = 1000; // 内存采样率(ms)
  private static dynamicSamplingEnabled = true; // 是否启用动态采样
  private static memoryPeakUsage = 0; // 峰值内存使用量
  private static memoryBaselineUsage = 0; // 基准内存使用量
  private static memoryWarningThresholds = {
    warning: 0.7, // 70%
    critical: 0.85, // 85%
  };

  /**
   * 初始化内存管理器
   * 检测设备能力并设置适当的阈值
   */
  public static initialize(): void {
    if (this.isInitialized) return;

    this.detectDeviceMemory();
    this.calculateMemoryAllocationLimit();
    this.checkPreciseMemoryInfo();
    this.setupMemoryWarningListeners();
    this.isInitialized = true;

    // 在初始化后自动开始监控
    this.startMonitoring();
  }

  /**
   * 检测设备内存
   * 尝试通过多种方式获取设备内存信息
   */
  private static detectDeviceMemory(): void {
    // 首先尝试使用navigator.deviceMemory (部分浏览器支持)
    if (
      typeof navigator !== 'undefined' &&
      'deviceMemory' in navigator &&
      typeof (navigator as any).deviceMemory === 'number'
    ) {
      this.deviceMemory = (navigator as any).deviceMemory * 1024 * 1024 * 1024; // 转换为字节
    }

    // 尝试通过performance.memory估计
    else if (
      typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory
    ) {
      this.deviceMemory = (window.performance as any).memory.jsHeapSizeLimit;
    }

    // 小程序环境检测
    else if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        const sysInfo = wx.getSystemInfoSync();
        // 微信小程序没有直接提供内存信息，根据平台和设备型号估计
        if (sysInfo.platform && sysInfo.model) {
          this.estimateMemoryFromDevice(sysInfo.platform, sysInfo.model);
        }
      } catch (e) {
        console.warn('获取微信小程序系统信息失败', e);
      }
    }
    // 支付宝小程序环境检测
    else if (typeof my !== 'undefined' && my.getSystemInfoSync) {
      try {
        const sysInfo = my.getSystemInfoSync();
        if (sysInfo.platform && sysInfo.model) {
          this.estimateMemoryFromDevice(sysInfo.platform, sysInfo.model);
        }
      } catch (e) {
        console.warn('获取支付宝小程序系统信息失败', e);
      }
    }
    // 字节跳动小程序环境检测
    else if (typeof tt !== 'undefined' && tt.getSystemInfoSync) {
      try {
        const sysInfo = tt.getSystemInfoSync();
        if (sysInfo.platform && sysInfo.model) {
          this.estimateMemoryFromDevice(sysInfo.platform, sysInfo.model);
        }
      } catch (e) {
        console.warn('获取字节跳动小程序系统信息失败', e);
      }
    }
    // 百度小程序环境检测
    else if (typeof swan !== 'undefined' && swan.getSystemInfoSync) {
      try {
        const sysInfo = swan.getSystemInfoSync();
        if (sysInfo.platform && sysInfo.model) {
          this.estimateMemoryFromDevice(sysInfo.platform, sysInfo.model);
        }
      } catch (e) {
        console.warn('获取百度小程序系统信息失败', e);
      }
    }

    // 如果无法检测，给予保守估计
    if (!this.deviceMemory) {
      this.deviceMemory = 1 * 1024 * 1024 * 1024; // 假设1GB
    }

    // 确定设备内存容量级别
    this.detectedCapacity = this.determineDeviceCapacity(this.deviceMemory);

    // 记录基准内存使用情况
    this.recordBaselineMemoryUsage();
  }

  /**
   * 记录基准内存使用情况
   * 用于后续监控对比
   */
  private static recordBaselineMemoryUsage(): void {
    const memInfo = this.getMemoryInfo();
    this.memoryBaselineUsage = memInfo.used;
  }

  /**
   * 检查是否可以获取精确内存信息
   */
  private static checkPreciseMemoryInfo(): void {
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory
    ) {
      try {
        const before = (window.performance as any).memory.usedJSHeapSize;
        // 尝试分配一个大数组
        const testArray = new Array(1000000).fill(0);
        const after = (window.performance as any).memory.usedJSHeapSize;

        // 如果内存使用量变化，则认为可以获取精确内存信息
        this.usePreciseMemoryInfo = after > before;

        // 释放测试数组
        testArray.length = 0;
      } catch (e) {
        this.usePreciseMemoryInfo = false;
      }
    } else {
      this.usePreciseMemoryInfo = false;
    }
  }

  /**
   * 设置内存警告监听器
   * 针对不同环境添加相应的内存警告监听
   */
  private static setupMemoryWarningListeners(): void {
    // 微信小程序内存警告
    if (typeof wx !== 'undefined' && wx.onMemoryWarning) {
      wx.onMemoryWarning(this.handleExternalMemoryWarning.bind(this));
    }

    // 支付宝小程序内存警告
    if (typeof my !== 'undefined' && my.onMemoryWarning) {
      my.onMemoryWarning(this.handleExternalMemoryWarning.bind(this));
    }

    // 字节跳动小程序内存警告
    if (typeof tt !== 'undefined' && tt.onMemoryWarning) {
      tt.onMemoryWarning(this.handleExternalMemoryWarning.bind(this));
    }

    // 浏览器内存警告 (未标准化，但某些平台可能支持)
    if (typeof window !== 'undefined') {
      try {
        window.addEventListener(
          'memorywarning',
          this.handleExternalMemoryWarning.bind(this)
        );
      } catch (e) {
        // 忽略不支持的浏览器错误
      }
    }
  }

  /**
   * 处理外部内存警告事件
   * @param event 内存警告事件
   */
  private static handleExternalMemoryWarning(event: any): void {
    let level = MemoryWarningLevel.WARNING;

    // 微信小程序特定的级别
    if (event && event.level) {
      if (event.level === 10 || event.level === 'warn') {
        level = MemoryWarningLevel.WARNING;
      } else if (event.level >= 15 || event.level === 'critical') {
        level = MemoryWarningLevel.CRITICAL;
      }
    }

    // 获取当前内存状态
    const stats = this.getMemoryStats();

    // 生成建议
    const recommendations = this.getMemoryRecommendations(stats);

    // 触发内存警告事件
    this.dispatchEvent('memoryWarning', {
      level,
      stats,
      recommendations,
    });
  }

  /**
   * 计算上传任务可分配的内存上限
   * 基于设备内存容量动态计算
   */
  private static calculateMemoryAllocationLimit(): void {
    if (!this.deviceMemory) {
      this.detectDeviceMemory();
    }

    // 根据设备内存级别分配不同比例的内存给上传任务
    switch (this.detectedCapacity) {
      case DeviceMemoryCapacity.VERY_LOW:
        this.memoryAllocationLimit = this.deviceMemory * 0.1; // 10%
        break;
      case DeviceMemoryCapacity.LOW:
        this.memoryAllocationLimit = this.deviceMemory * 0.15; // 15%
        break;
      case DeviceMemoryCapacity.MEDIUM:
        this.memoryAllocationLimit = this.deviceMemory * 0.2; // 20%
        break;
      case DeviceMemoryCapacity.HIGH:
        this.memoryAllocationLimit = this.deviceMemory * 0.25; // 25%
        break;
      case DeviceMemoryCapacity.VERY_HIGH:
        this.memoryAllocationLimit = this.deviceMemory * 0.3; // 30%
        break;
      default:
        this.memoryAllocationLimit = this.deviceMemory * 0.15; // 默认15%
    }
  }

  /**
   * 根据内存大小确定设备容量级别
   */
  private static determineDeviceCapacity(
    memoryBytes: number
  ): DeviceMemoryCapacity {
    const memoryGB = memoryBytes / (1024 * 1024 * 1024);

    if (memoryGB < 1) return DeviceMemoryCapacity.VERY_LOW;
    if (memoryGB < 2) return DeviceMemoryCapacity.LOW;
    if (memoryGB < 4) return DeviceMemoryCapacity.MEDIUM;
    if (memoryGB < 8) return DeviceMemoryCapacity.HIGH;
    return DeviceMemoryCapacity.VERY_HIGH;
  }

  /**
   * 根据设备平台和型号估计内存
   * 用于无法直接获取内存信息的环境
   */
  private static estimateMemoryFromDevice(
    platform: string,
    model: string
  ): void {
    // 简单估计，实际应用中可以建立更完善的设备数据库
    const lowerModel = model.toLowerCase();

    if (platform === 'ios') {
      if (
        lowerModel.includes('iphone 13') ||
        lowerModel.includes('iphone 14')
      ) {
        this.deviceMemory = 6 * 1024 * 1024 * 1024; // 6GB
      } else if (
        lowerModel.includes('iphone 11') ||
        lowerModel.includes('iphone 12')
      ) {
        this.deviceMemory = 4 * 1024 * 1024 * 1024; // 4GB
      } else if (
        lowerModel.includes('iphone x') ||
        lowerModel.includes('iphone 8')
      ) {
        this.deviceMemory = 3 * 1024 * 1024 * 1024; // 3GB
      } else {
        this.deviceMemory = 2 * 1024 * 1024 * 1024; // 2GB
      }
    } else if (platform === 'android') {
      if (
        lowerModel.includes('samsung') &&
        (lowerModel.includes('s21') || lowerModel.includes('s22'))
      ) {
        this.deviceMemory = 12 * 1024 * 1024 * 1024; // 12GB (高端型号)
      } else if (
        lowerModel.includes('samsung') &&
        (lowerModel.includes('s20') || lowerModel.includes('note 20'))
      ) {
        this.deviceMemory = 8 * 1024 * 1024 * 1024; // 8GB
      } else if (
        lowerModel.includes('xiaomi') ||
        lowerModel.includes('huawei') ||
        lowerModel.includes('honor')
      ) {
        this.deviceMemory = 6 * 1024 * 1024 * 1024; // 6GB
      } else {
        this.deviceMemory = 4 * 1024 * 1024 * 1024; // 4GB
      }
    } else {
      this.deviceMemory = 2 * 1024 * 1024 * 1024; // 默认2GB
    }
  }

  /**
   * 获取/设置内存使用历史数据
   */
  static get memoryUsage(): number[] {
    return this.memoryUsageHistory;
  }

  static set memoryUsage(data: number[]) {
    this.memoryUsageHistory = data;
  }

  static get memoryTimestamps(): number[] {
    return this.memoryTimestampHistory;
  }

  static set memoryTimestamps(data: number[]) {
    this.memoryTimestampHistory = data;
  }

  /**
   * 清除内存监控数据
   * 用于长时间运行或重置监控状态
   */
  static _clearMemoryData(): void {
    this.memoryUsageHistory = [];
    this.memoryTimestampHistory = [];
    this.memoryPeakUsage = 0;

    // 重新记录基准内存
    if (this.isInitialized) {
      this.recordBaselineMemoryUsage();
    }
  }

  /**
   * 开始内存监控
   * 定期采样内存使用情况并分析趋势
   */
  static startMonitoring(): void {
    if (this.memoryWatcher) {
      return; // 已经在监控中
    }

    if (!this.isInitialized) {
      this.initialize();
    }

    // 清空历史数据
    this._clearMemoryData();

    // 添加小程序平台的内存警告监听
    this.setupPlatformSpecificMonitoring();

    // 设置动态采样率
    let samplingInterval = this.memorySamplingRate;

    // 根据设备容量调整采样间隔
    if (this.detectedCapacity === DeviceMemoryCapacity.VERY_LOW) {
      samplingInterval = 2000; // 降低采样频率以减少资源消耗
    } else if (this.detectedCapacity === DeviceMemoryCapacity.LOW) {
      samplingInterval = 1500;
    }

    // 初始采样
    this.updateMemorySample();

    // 开始定时采样
    this.memoryWatcher = setInterval(() => {
      try {
        // 更新内存样本
        this.updateMemorySample();

        // 分析内存使用情况
        this.analyzeMemoryUsage();

        // 动态调整采样间隔
        if (this.dynamicSamplingEnabled) {
          this.adjustSamplingRate();
        }
      } catch (e) {
        console.error('内存监控异常', e);
      }
    }, samplingInterval);
  }

  /**
   * 更新内存样本
   * 获取当前内存使用情况并记录到历史数据中
   */
  private static updateMemorySample(): void {
    const memInfo = this.getMemoryInfo();

    // 记录使用量
    this.memoryUsageHistory.push(memInfo.used);
    this.memoryTimestampHistory.push(Date.now());

    // 更新峰值
    if (memInfo.used > this.memoryPeakUsage) {
      this.memoryPeakUsage = memInfo.used;
    }

    // 限制样本数量
    if (this.memoryUsageHistory.length > this.MAX_MEMORY_SAMPLES) {
      this.memoryUsageHistory.shift();
      this.memoryTimestampHistory.shift();
    }
  }

  /**
   * 动态调整内存采样率
   * 根据内存使用趋势调整采样频率
   */
  private static adjustSamplingRate(): void {
    const trend = this.determineMemoryTrend();
    const memStats = this.getMemoryStats();

    // 初始采样间隔
    let newInterval = this.memorySamplingRate;

    // 根据趋势和使用率调整
    if (trend === MemoryTrend.GROWING && memStats.usageRatio > 0.6) {
      // 内存增长且接近警告阈值，提高采样频率
      newInterval = Math.max(500, this.memorySamplingRate - 200);
    } else if (trend === MemoryTrend.STABLE && memStats.usageRatio < 0.5) {
      // 内存稳定且使用率较低，降低采样频率
      newInterval = Math.min(2000, this.memorySamplingRate + 300);
    } else if (trend === MemoryTrend.DECREASING) {
      // 内存减少，可以适度降低采样频率
      newInterval = Math.min(1500, this.memorySamplingRate + 100);
    }

    // 如果需要更新采样间隔
    if (newInterval !== this.memorySamplingRate) {
      this.memorySamplingRate = newInterval;

      // 重新启动监控器
      if (this.memoryWatcher) {
        clearInterval(this.memoryWatcher);

        this.memoryWatcher = setInterval(() => {
          this.updateMemorySample();
          this.analyzeMemoryUsage();
          if (this.dynamicSamplingEnabled) {
            this.adjustSamplingRate();
          }
        }, this.memorySamplingRate);
      }
    }
  }

  /**
   * 设置平台特定的内存监控
   */
  private static setupPlatformSpecificMonitoring(): void {
    // 微信小程序特有的内存警告监听
    if (typeof wx !== 'undefined' && wx.onMemoryWarning) {
      wx.onMemoryWarning(({ level }) => {
        const warningLevel =
          level === 10
            ? MemoryWarningLevel.WARNING
            : MemoryWarningLevel.CRITICAL;
        const stats = this.getMemoryStats();
        const recommendations = this.getMemoryRecommendations(stats);

        this.dispatchEvent('memoryWarning', {
          level: warningLevel,
          stats,
          recommendations,
        });
      });
    }

    // 其他平台的内存警告监听可以类似实现
  }

  /**
   * 停止内存监控
   */
  static stopMonitoring(): void {
    if (this.memoryWatcher) {
      clearInterval(this.memoryWatcher);
      this.memoryWatcher = null;
    }

    // 清除小程序特定的监听器
    this.clearPlatformSpecificListeners();
  }

  /**
   * 清除平台特定的监听器
   */
  private static clearPlatformSpecificListeners(): void {
    // 目前小程序平台不提供移除内存警告监听的方法
    // 如果将来提供，可以在此处实现
  }

  /**
   * 分析内存使用情况
   * 基于当前内存使用趋势和级别触发相关事件
   */
  private static analyzeMemoryUsage(): void {
    // 获取当前内存统计信息
    const memStats = this.getMemoryStats();
    const now = Date.now();
    const currentTrend = this.determineMemoryTrend();
    memStats.trend = currentTrend;

    // 检查是否需要发出警告
    if (
      memStats.usageRatio >= this.CRITICAL_MEMORY_THRESHOLD &&
      now - this.lastMemoryWarning >= this.MIN_WARNING_INTERVAL
    ) {
      // 临界内存警告
      this.lastMemoryWarning = now;

      const recommendations = this.getMemoryRecommendations(memStats);

      // 派发内存临界事件
      this.dispatchEvent('memoryWarning', {
        level: MemoryWarningLevel.CRITICAL,
        stats: memStats,
        recommendations,
      });

      // 紧急情况，建议执行垃圾回收
      if (recommendations.shouldReleaseMemory) {
        this.suggestGarbageCollection();
      }
    } else if (
      memStats.usageRatio >= this.HIGH_MEMORY_THRESHOLD &&
      now - this.lastMemoryWarning >= this.MIN_WARNING_INTERVAL
    ) {
      // 高级内存警告
      this.lastMemoryWarning = now;

      // 派发内存警告事件
      this.dispatchEvent('memoryWarning', {
        level: MemoryWarningLevel.WARNING,
        stats: memStats,
        recommendations: this.getMemoryRecommendations(memStats),
      });
    }

    // 当内存持续增长且使用率较高时，提供建议
    if (
      currentTrend === MemoryTrend.GROWING &&
      memStats.usageRatio > this.NORMAL_MEMORY_THRESHOLD &&
      now - this.lastRecommendationTime >= this.MIN_RECOMMENDATION_INTERVAL
    ) {
      this.lastRecommendationTime = now;

      const recommendations = this.getMemoryRecommendations(memStats);

      // 派发内存建议事件
      this.dispatchEvent('memoryRecommendation', {
        ...memStats,
        recommendations,
      });

      // 检查是否应该暂停上传
      if (
        memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD &&
        recommendations.shouldPause
      ) {
        // 派发暂停建议事件
        this.dispatchEvent('memoryPressurePause', {
          reason: '内存压力过大',
          shouldPause: true,
        });
      }
    }
  }

  /**
   * 根据内存状态生成内存使用建议
   */
  private static getMemoryRecommendations(stats: MemoryStats): {
    chunkSize?: number;
    concurrency?: number;
    shouldPause?: boolean;
    shouldReleaseMemory?: boolean;
  } {
    const recommendations: {
      chunkSize?: number;
      concurrency?: number;
      shouldPause?: boolean;
      shouldReleaseMemory?: boolean;
    } = {};

    // 根据内存使用比例调整建议
    if (stats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD) {
      // 严重内存不足情况
      recommendations.chunkSize = Math.max(
        524288, // 最小分片 512KB
        this.getOptimalChunkSize(10 * 1024 * 1024) / 2 // 当前推荐的一半
      );
      recommendations.concurrency = 1; // 最小并发
      recommendations.shouldPause = true;
      recommendations.shouldReleaseMemory = true;
    } else if (stats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      // 内存紧张情况
      recommendations.chunkSize = Math.max(
        1048576, // 最小分片 1MB
        this.getOptimalChunkSize(10 * 1024 * 1024) * 0.7 // 当前推荐的70%
      );
      recommendations.concurrency = Math.max(
        1,
        this.getRecommendedConcurrency() - 1
      );
      recommendations.shouldPause = stats.trend === MemoryTrend.GROWING;
      recommendations.shouldReleaseMemory = true;
    } else if (stats.usageRatio > this.NORMAL_MEMORY_THRESHOLD) {
      // 内存偏高情况
      const currentConcurrency = this.getRecommendedConcurrency();
      recommendations.concurrency = Math.max(1, currentConcurrency - 1);
      recommendations.shouldReleaseMemory = stats.trend === MemoryTrend.GROWING;
    }

    return recommendations;
  }

  /**
   * 监听内存相关事件
   */
  public static addEventListener(
    event: string,
    callback: (event: any) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    const callbacks = this.eventListeners.get(event) || [];
    if (!callbacks.includes(callback)) {
      callbacks.push(callback);
    }
  }

  /**
   * 移除内存相关事件监听
   */
  public static removeEventListener(
    event: string,
    callback: (event: any) => void
  ): void {
    if (!this.eventListeners.has(event)) return;

    const callbacks = this.eventListeners.get(event) || [];
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }

    // 如果没有监听器了，删除整个事件
    if (callbacks.length === 0) {
      this.eventListeners.delete(event);
    }
  }

  /**
   * 触发内存相关事件
   */
  private static dispatchEvent(eventName: string, detail: unknown): void {
    // 如果有注册的内部监听器，调用它们
    if (this.eventListeners.has(eventName)) {
      const callbacks = this.eventListeners.get(eventName) || [];
      callbacks.forEach(cb => {
        try {
          cb({ type: eventName, detail });
        } catch (err) {
          console.error(`[MemoryManager] 事件监听器执行错误:`, err);
        }
      });
    }

    // 同时在window上触发事件(浏览器环境)
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      try {
        const event = new CustomEvent(eventName, { detail });
        window.dispatchEvent(event);
      } catch (err) {
        console.error(`[MemoryManager] 触发window事件错误:`, err);
      }
    }

    // 在各种小程序环境中，通过特定的事件系统触发
    this.dispatchPlatformSpecificEvent(eventName, detail);
  }

  /**
   * 在特定平台触发事件
   */
  private static dispatchPlatformSpecificEvent(
    eventName: string,
    detail: unknown
  ): void {
    // 微信小程序，通过全局事件总线触发
    if (typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync) {
      try {
        // 使用存储API作为事件通信通道
        const eventKey = `mem_event_${eventName}`;
        wx.setStorageSync(eventKey, {
          timestamp: Date.now(),
          detail,
        });
      } catch (err) {
        // 忽略错误
      }
    }

    // 其他小程序环境类似实现
    // ...
  }

  /**
   * 获取当前内存统计信息
   */
  public static getMemoryStats(): MemoryStats {
    // 获取基本内存信息
    const memInfo = this.getMemoryInfo();
    let growthRate = 0;
    let trend: MemoryTrend | undefined;

    // 如果有足够的样本，计算内存增长率和趋势
    if (this.memoryUsageHistory.length >= 2) {
      // 计算过去5秒或可用样本的平均增长率
      const sampleCount = Math.min(5, this.memoryUsageHistory.length);
      const recentUsage = this.memoryUsageHistory.slice(-sampleCount);
      const recentTimestamps = this.memoryTimestampHistory.slice(-sampleCount);

      if (sampleCount >= 2) {
        const timeDiff =
          recentTimestamps[recentTimestamps.length - 1] - recentTimestamps[0]; // 毫秒
        const memDiff = recentUsage[recentUsage.length - 1] - recentUsage[0]; // 字节

        if (timeDiff > 0) {
          // 计算每秒内存增长率
          growthRate = (memDiff / timeDiff) * 1000;
        }
      }

      // 确定内存使用趋势
      trend = this.determineMemoryTrend();
    }

    // 确定设备内存容量级别
    const capacity =
      this.detectedCapacity || this.determineDeviceCapacity(memInfo.limit);

    // 计算可用于上传的内存估计值
    const availableForUploading = this.getAvailableMemoryForUploading();

    // 是否为低内存环境
    const isLowMemoryEnvironment = this.isLowMemoryDevice();

    return {
      used: memInfo.used,
      total: memInfo.total,
      limit: memInfo.limit,
      usageRatio: memInfo.usageRatio,
      growthRate,
      trend,
      capacity,
      availableForUploading,
      isLowMemoryEnvironment,
    };
  }

  /**
   * 确定内存使用趋势
   */
  private static determineMemoryTrend(): MemoryTrend {
    // 需要至少3个样本来确定趋势
    if (this.memoryUsageHistory.length < 3) {
      return MemoryTrend.STABLE;
    }

    // 使用线性回归斜率来确定趋势
    const recentSamples = Math.min(8, this.memoryUsageHistory.length);
    const samples = this.memoryUsageHistory.slice(-recentSamples);
    const timestamps = this.memoryTimestampHistory.slice(-recentSamples);

    // 计算趋势系数 (简化的线性回归)
    let sumXY = 0;
    let sumX = 0;
    let sumY = 0;
    let sumX2 = 0;

    for (let i = 0; i < samples.length; i++) {
      const x = timestamps[i] - timestamps[0]; // 时间偏移
      const y = samples[i];
      sumXY += x * y;
      sumX += x;
      sumY += y;
      sumX2 += x * x;
    }

    const n = samples.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // 根据斜率确定趋势
    // 考虑内存使用量的规模，使用相对阈值
    const baseMemory = Math.max(1, samples[0]);
    const relativeThreshold = baseMemory * 0.001; // 千分之一的相对变化

    if (slope > relativeThreshold) {
      return MemoryTrend.GROWING;
    } else if (slope < -relativeThreshold) {
      return MemoryTrend.DECREASING;
    } else {
      return MemoryTrend.STABLE;
    }
  }

  /**
   * 获取可用于上传的内存估计值
   */
  private static getAvailableMemoryForUploading(): number {
    const memInfo = this.getMemoryInfo();
    const availableTotal = memInfo.limit - memInfo.used;

    // 分配一部分可用内存给上传任务
    // 根据设备容量级别调整分配比例
    let allocationRatio = 0.5; // 默认分配50%的可用内存

    switch (this.detectedCapacity) {
      case DeviceMemoryCapacity.VERY_LOW:
        allocationRatio = 0.25; // 低内存设备只分配25%的可用内存
        break;
      case DeviceMemoryCapacity.LOW:
        allocationRatio = 0.4;
        break;
      case DeviceMemoryCapacity.MEDIUM:
        allocationRatio = 0.5;
        break;
      case DeviceMemoryCapacity.HIGH:
        allocationRatio = 0.6;
        break;
      case DeviceMemoryCapacity.VERY_HIGH:
        allocationRatio = 0.7; // 高内存设备可以分配更多
        break;
    }

    return availableTotal * allocationRatio;
  }

  /**
   * 获取内存信息
   * 综合各种环境和API获取内存使用情况
   */
  public static getMemoryInfo(): {
    usageRatio: number;
    used: number;
    limit: number;
    total: number;
  } {
    let used = 0;
    let total = 0;
    let limit = 0;

    // 浏览器环境
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory
    ) {
      try {
        const memory = (window.performance as any).memory;
        used = memory.usedJSHeapSize;
        total = memory.totalJSHeapSize;
        limit = memory.jsHeapSizeLimit;
      } catch (e) {
        // 忽略错误，使用后备方法
      }
    }

    // 小程序环境 - 微信（无精确内存API）
    if (
      typeof wx !== 'undefined' &&
      typeof used === 'undefined' &&
      this.deviceMemory
    ) {
      // 微信小程序目前没有获取内存使用量的API，只能使用预估值
      limit = this.deviceMemory;
      total = this.deviceMemory * 0.8; // 保守假设能用到总内存的80%
      used = this.memoryBaselineUsage; // 使用基线内存使用量

      // 如果有使用历史，用最新值
      if (this.memoryUsageHistory.length > 0) {
        used = this.memoryUsageHistory[this.memoryUsageHistory.length - 1];
      }
    }

    // 支付宝小程序环境 - 类似处理
    if (
      typeof my !== 'undefined' &&
      typeof used === 'undefined' &&
      this.deviceMemory
    ) {
      limit = this.deviceMemory;
      total = this.deviceMemory * 0.8;
      used = this.memoryBaselineUsage;

      if (this.memoryUsageHistory.length > 0) {
        used = this.memoryUsageHistory[this.memoryUsageHistory.length - 1];
      }
    }

    // 如果都没有获取到，使用保守估计
    if (limit === 0) {
      limit = 512 * 1024 * 1024; // 假设512MB的堆限制
      total = limit * 0.8;
      used = total * 0.5; // 假设使用了50%
    }

    // 计算使用率
    const usageRatio = Math.min(1, Math.max(0, used / limit));

    return { usageRatio, used, total, limit };
  }

  /**
   * 计算内存增长率
   */
  static getMemoryGrowthRate(): number {
    if (this.memoryUsageHistory.length < 2) {
      return 0; // 样本不足，无法计算
    }

    // 使用最近的样本计算平均增长率
    const samples = Math.min(5, this.memoryUsageHistory.length);
    const recentUsage = this.memoryUsageHistory.slice(-samples);
    const recentTimestamps = this.memoryTimestampHistory.slice(-samples);

    if (recentUsage.length < 2) {
      return 0;
    }

    // 计算最早和最新样本的差值
    const memoryDiff = recentUsage[recentUsage.length - 1] - recentUsage[0];
    const timeDiff =
      recentTimestamps[recentTimestamps.length - 1] - recentTimestamps[0];

    if (timeDiff <= 0) {
      return 0;
    }

    // 计算每秒增长字节数
    return (memoryDiff / timeDiff) * 1000;
  }

  /**
   * 计算动态最优分片大小
   * 基于文件大小、可用内存、设备能力综合计算
   */
  public static getOptimalChunkSize(
    fileSize: number,
    preferredSize: number | 'auto' = 'auto',
    concurrency = 3
  ): number {
    // 如果指定了固定分片大小且不是'auto'，则使用指定的值
    if (
      preferredSize !== 'auto' &&
      typeof preferredSize === 'number' &&
      preferredSize > 0
    ) {
      return this.validateChunkSize(preferredSize, fileSize);
    }

    // 如果MemoryManager未初始化，先初始化
    if (!this.isInitialized) {
      this.initialize();
    }

    // 获取当前内存状态
    const memStats = this.getMemoryStats();

    // 基于内存状态的动态分片大小策略
    const optimalSize = this.calculateAdaptiveChunkSize(
      fileSize,
      memStats,
      concurrency
    );

    // 确保分片大小在合理范围内
    return this.validateChunkSize(optimalSize, fileSize);
  }

  /**
   * 验证并调整分片大小确保在有效范围内
   */
  private static validateChunkSize(size: number, fileSize: number): number {
    const MIN_CHUNK_SIZE = 256 * 1024; // 256KB
    const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB

    // 确保分片大小不小于最小值
    let validatedSize = Math.max(size, MIN_CHUNK_SIZE);

    // 确保分片大小不大于最大值
    validatedSize = Math.min(validatedSize, MAX_CHUNK_SIZE);

    // 确保分片大小不大于文件大小
    validatedSize = Math.min(validatedSize, fileSize);

    return validatedSize;
  }

  /**
   * 计算自适应分片大小
   * 基于内存状态、文件大小和设备能力综合计算
   */
  private static calculateAdaptiveChunkSize(
    fileSize: number,
    memStats: MemoryStats,
    concurrency = 3
  ): number {
    // 基础分片大小计算
    let baseChunkSize: number;

    // 根据设备内存容量确定基础分片大小
    switch (memStats.capacity) {
      case DeviceMemoryCapacity.VERY_LOW:
        baseChunkSize = 512 * 1024; // 512KB
        break;
      case DeviceMemoryCapacity.LOW:
        baseChunkSize = 1 * 1024 * 1024; // 1MB
        break;
      case DeviceMemoryCapacity.MEDIUM:
        baseChunkSize = 2 * 1024 * 1024; // 2MB
        break;
      case DeviceMemoryCapacity.HIGH:
        baseChunkSize = 4 * 1024 * 1024; // 4MB
        break;
      case DeviceMemoryCapacity.VERY_HIGH:
        baseChunkSize = 8 * 1024 * 1024; // 8MB
        break;
      default:
        baseChunkSize = 2 * 1024 * 1024; // 默认2MB
    }

    // 调整因子，基于内存使用率
    let adjustmentFactor = 1.0;

    // 根据内存使用率调整
    if (memStats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD) {
      adjustmentFactor = 0.25; // 严重降低分片大小
    } else if (memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      adjustmentFactor = 0.5; // 适度降低分片大小
    } else if (memStats.usageRatio < this.NORMAL_MEMORY_THRESHOLD) {
      adjustmentFactor = 1.5; // 可以增加分片大小
    }

    // 考虑内存增长趋势
    if (
      memStats.trend === MemoryTrend.GROWING &&
      memStats.growthRate &&
      memStats.growthRate > 1 * 1024 * 1024
    ) {
      adjustmentFactor *= 0.7; // 内存增长快，降低分片大小
    }

    // 考虑文件大小
    // 大文件使用相对小的分片，小文件可以使用相对大的分片
    let fileSizeFactor: number;

    if (fileSize > 1 * 1024 * 1024 * 1024) {
      // 1GB以上
      fileSizeFactor = 0.8;
    } else if (fileSize > 100 * 1024 * 1024) {
      // 100MB以上
      fileSizeFactor = 1.0;
    } else if (fileSize > 10 * 1024 * 1024) {
      // 10MB以上
      fileSizeFactor = 1.2;
    } else {
      fileSizeFactor = 1.5; // 小文件
    }

    // 考虑并发数
    // 并发数越高，每个分片应该越小
    const concurrencyFactor = 1 / Math.sqrt(concurrency);

    // 计算最终分片大小
    const adaptiveChunkSize =
      baseChunkSize * adjustmentFactor * fileSizeFactor * concurrencyFactor;

    return Math.round(adaptiveChunkSize);
  }

  /**
   * 获取分片处理策略
   * 根据文件大小和当前内存状态提供最优的处理策略
   */
  public static getChunkProcessingStrategy(
    fileSize: number,
    currentStrategy?: Partial<ChunkProcessingStrategy>
  ): ChunkProcessingStrategy {
    if (!this.isInitialized) {
      this.initialize();
    }

    // 获取内存状态
    const memStats = this.getMemoryStats();

    // 优化的分片大小
    const chunkSize = this.getOptimalChunkSize(fileSize);

    // 优化的并发数
    const concurrency = this.getRecommendedConcurrency();

    // 默认处理模式
    let processingMode: 'sequential' | 'parallel' | 'hybrid' = 'parallel';
    let useStreaming = false;
    const prioritizeMetadata = true;
    let preloadChunks = 2;

    // 大文件处理策略调整
    if (fileSize > 200 * 1024 * 1024) {
      // 200MB
      // 对于大文件，考虑特殊处理策略
      const largeFileStrategy = this.getLargeFileStrategy(fileSize);

      // 应用大文件策略
      useStreaming = largeFileStrategy.shouldUseStreaming;

      // 内存不足时使用顺序处理
      if (
        memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD ||
        this.isLowMemoryDevice()
      ) {
        processingMode = 'sequential';
        preloadChunks = 1;
      } else {
        processingMode = largeFileStrategy.processingMode;
        preloadChunks = largeFileStrategy.maxPartsInMemory;
      }
    } else if (fileSize > 50 * 1024 * 1024) {
      // 50MB
      // 中等文件
      if (memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
        processingMode = 'hybrid';
        preloadChunks = 1;
      } else {
        processingMode = 'parallel';
        preloadChunks = Math.min(3, concurrency);
      }
    }

    // 合并当前策略(如果有)
    if (currentStrategy) {
      return {
        chunkSize: currentStrategy.chunkSize ?? chunkSize,
        concurrency: currentStrategy.concurrency ?? concurrency,
        processingMode: currentStrategy.processingMode ?? processingMode,
        useStreaming: currentStrategy.useStreaming ?? useStreaming,
        prioritizeMetadata:
          currentStrategy.prioritizeMetadata ?? prioritizeMetadata,
        preloadChunks: currentStrategy.preloadChunks ?? preloadChunks,
      };
    }

    return {
      chunkSize,
      concurrency,
      processingMode,
      useStreaming,
      prioritizeMetadata,
      preloadChunks,
    };
  }

  /**
   * 获取可用内存估计值
   */
  static getAvailableMemory(): number {
    const memInfo = this.getMemoryInfo();
    return Math.max(0, memInfo.limit - memInfo.used);
  }

  /**
   * 检测是否处于低内存状态
   */
  static isLowMemory(): boolean {
    const memInfo = this.getMemoryInfo();
    return memInfo.usageRatio >= this.HIGH_MEMORY_THRESHOLD;
  }

  /**
   * 检测是否处于临界内存状态
   */
  static isCriticalMemory(): boolean {
    const memInfo = this.getMemoryInfo();
    return memInfo.usageRatio >= this.CRITICAL_MEMORY_THRESHOLD;
  }

  /**
   * 建议进行垃圾回收
   * 尝试释放内存并更新内存使用情况
   */
  public static suggestGarbageCollection(): void {
    if (typeof window !== 'undefined') {
      // 尝试强制回收内存
      // 注意：这是一种启发式方法，并非所有浏览器都支持
      try {
        (function forceGC() {
          // 尝试创建一些临时对象并立即释放
          if (!this.isInitialized) {
            return;
          }

          // 清除所有引用以辅助垃圾回收
          const tempArr = [];
          for (let i = 0; i < 10000; i++) {
            tempArr.push(new Array(10000).fill(0));
            tempArr.pop();
          }

          // 更新内存状态
          setTimeout(() => {
            // 更新内存样本
            if (this.memoryWatcher) {
              this.updateMemorySample();
            }
          }, 100);
        }).call(this);
      } catch (e) {
        // 忽略错误
      }
    }

    // 记录垃圾收集时间
    this.lastGarbageCollectionTime = Date.now();
  }

  /**
   * 检查是否需要进行内存清理
   */
  static needsMemoryCleanup(): boolean {
    // 如果最近已经建议过垃圾回收，避免频繁调用
    if (Date.now() - this.lastGarbageCollectionTime < this.MIN_GC_INTERVAL) {
      return false;
    }

    // 检查内存使用情况
    const memStats = this.getMemoryStats();

    // 内存使用率高且内存增长趋势
    if (
      memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD &&
      memStats.trend === MemoryTrend.GROWING
    ) {
      return true;
    }

    // 内存严重不足
    if (memStats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD) {
      return true;
    }

    // 内存增长速度异常快
    if (memStats.growthRate && memStats.growthRate > 10 * 1024 * 1024) {
      // 10MB/s
      return true;
    }

    return false;
  }

  /**
   * 获取推荐的分片数量
   * 根据文件大小和当前内存状态计算
   */
  static getRecommendedChunkCount(fileSize: number, maxConcurrent = 3): number {
    // 获取最优分片大小
    const chunkSize = this.getOptimalChunkSize(fileSize);

    // 计算分片总数 (向上取整)
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // 考虑并发限制和最小分片数
    const minChunks = 1;
    const maxChunks = Math.max(100, maxConcurrent * 10); // 避免过多分片

    // 确保分片数在合理范围内
    return Math.min(maxChunks, Math.max(minChunks, totalChunks));
  }

  /**
   * 获取推荐的并发数
   * 根据设备能力和内存状态计算
   */
  static getRecommendedConcurrency(defaultConcurrent = 3): number {
    // 如果未初始化，使用默认并发数
    if (!this.isInitialized) {
      return defaultConcurrent;
    }

    // 获取内存状态
    const memStats = this.getMemoryStats();

    // 基于设备内存容量确定基础并发数
    let baseConcurrency: number;

    switch (memStats.capacity) {
      case DeviceMemoryCapacity.VERY_LOW:
        baseConcurrency = 1; // 极低内存设备
        break;
      case DeviceMemoryCapacity.LOW:
        baseConcurrency = 2; // 低内存设备
        break;
      case DeviceMemoryCapacity.MEDIUM:
        baseConcurrency = 3; // 中等设备
        break;
      case DeviceMemoryCapacity.HIGH:
        baseConcurrency = 4; // 高内存设备
        break;
      case DeviceMemoryCapacity.VERY_HIGH:
        baseConcurrency = 6; // 极高内存设备
        break;
      default:
        baseConcurrency = defaultConcurrent; // 默认
    }

    // 根据内存使用率调整
    if (memStats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD) {
      return 1; // 内存严重不足，只允许1个并发
    } else if (memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      return Math.max(1, baseConcurrency - 1); // 减少1个并发
    } else if (
      memStats.usageRatio < this.NORMAL_MEMORY_THRESHOLD &&
      memStats.trend !== MemoryTrend.GROWING
    ) {
      return Math.min(8, baseConcurrency + 1); // 内存充足且不在增长，可增加1个并发
    }

    return baseConcurrency;
  }

  /**
   * 检测是否为低内存设备
   * 用于判断应用是否应该采用更保守的策略
   */
  public static isLowMemoryDevice(): boolean {
    if (!this.isInitialized) {
      this.initialize();
    }

    // 检测设备内存容量
    if (this.detectedCapacity) {
      return (
        this.detectedCapacity === DeviceMemoryCapacity.VERY_LOW ||
        this.detectedCapacity === DeviceMemoryCapacity.LOW
      );
    }

    // 如果无法检测准确的内存容量，使用deviceMemory判断
    if (this.deviceMemory) {
      return this.deviceMemory < 2 * 1024 * 1024 * 1024; // 小于2GB
    }

    // 无法判断，保守返回true
    return true;
  }

  /**
   * 检测是否为低功耗设备
   * 用于判断是否需要避免计算密集型操作
   */
  public static isLowPowerDevice(): boolean {
    // 获取CPU核心数作为参考
    let cpuCores = 1;

    try {
      if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
        cpuCores = navigator.hardwareConcurrency;
      }
    } catch (e) {
      // 忽略错误
    }

    // 简单判断：双核或更低视为低功耗设备
    const isLowCoreCount = cpuCores <= 2;

    // 结合内存判断：低内存设备通常也是低功耗设备
    const isLowMemory = this.isLowMemoryDevice();

    return isLowMemory || isLowCoreCount;
  }

  /**
   * 获取大文件处理策略
   * 针对大文件（>100MB）的特殊处理方案
   */
  public static getLargeFileStrategy(fileSize: number): {
    shouldUseParts: boolean; // 是否应该使用分部处理
    partSize: number; // 每部分大小
    maxPartsInMemory: number; // 最大内存中保留的部分数
    shouldUseStreaming: boolean; // 是否应该使用流式处理
    shouldOffloadCalculation: boolean; // 是否应该卸载计算任务到Worker
    processingMode: 'sequential' | 'parallel' | 'hybrid'; // 处理模式
  } {
    if (!this.isInitialized) {
      this.initialize();
    }

    // 默认值
    const strategy = {
      shouldUseParts: false,
      partSize: 50 * 1024 * 1024, // 50MB
      maxPartsInMemory: 2,
      shouldUseStreaming: false,
      shouldOffloadCalculation: false,
      processingMode: 'hybrid' as 'sequential' | 'parallel' | 'hybrid',
    };

    // 小于100MB的文件不需要特殊处理
    if (fileSize <= 100 * 1024 * 1024) {
      return strategy;
    }

    // 获取内存状态
    const memStats = this.getMemoryStats();
    const isLowMemory = this.isLowMemoryDevice();
    const isLowPower = this.isLowPowerDevice();

    // 针对不同大小的文件调整策略
    if (fileSize > 1 * 1024 * 1024 * 1024) {
      // >1GB
      strategy.shouldUseParts = true;
      strategy.partSize = 100 * 1024 * 1024; // 100MB
      strategy.maxPartsInMemory = isLowMemory ? 1 : 2;
      strategy.shouldUseStreaming = true;
      strategy.shouldOffloadCalculation = true;
      strategy.processingMode = isLowMemory ? 'sequential' : 'hybrid';
    } else if (fileSize > 500 * 1024 * 1024) {
      // >500MB
      strategy.shouldUseParts = true;
      strategy.partSize = 50 * 1024 * 1024; // 50MB
      strategy.maxPartsInMemory = isLowMemory ? 1 : 3;
      strategy.shouldUseStreaming =
        memStats.usageRatio > this.NORMAL_MEMORY_THRESHOLD;
      strategy.shouldOffloadCalculation = !isLowPower;
      strategy.processingMode = isLowMemory ? 'sequential' : 'hybrid';
    } else if (fileSize > 200 * 1024 * 1024) {
      // >200MB
      strategy.shouldUseParts =
        memStats.usageRatio > this.NORMAL_MEMORY_THRESHOLD;
      strategy.partSize = 25 * 1024 * 1024; // 25MB
      strategy.maxPartsInMemory = isLowMemory ? 2 : 4;
      strategy.shouldUseStreaming =
        memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD;
      strategy.shouldOffloadCalculation = !isLowPower;
      strategy.processingMode = isLowMemory ? 'sequential' : 'parallel';
    } else {
      // 100MB-200MB
      strategy.shouldUseParts = false;
      strategy.maxPartsInMemory = isLowMemory ? 2 : 5;
      strategy.shouldUseStreaming =
        memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD;
      strategy.shouldOffloadCalculation = false;
      strategy.processingMode = 'parallel';
    }

    // 如果内存严重不足，始终使用顺序处理并限制在内存中的部分数
    if (memStats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD) {
      strategy.shouldUseParts = true;
      strategy.maxPartsInMemory = 1;
      strategy.shouldUseStreaming = true;
      strategy.processingMode = 'sequential';
    }

    return strategy;
  }

  /**
   * 获取内存效率最优的分片计划
   * 为大文件创建优化的分片处理方案
   */
  public static getMemoryEfficientChunkPlan(
    fileSize: number,
    initialChunkSize?: number
  ): {
    chunks: ChunkPlan[];
    totalChunks: number;
    estimatedMemoryUsage: number;
    processingOrder: number[];
  } {
    // 获取最优分片大小
    const chunkSize = initialChunkSize || this.getOptimalChunkSize(fileSize);

    // 计算分片数 (向上取整)
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // 创建分片计划
    const chunks: ChunkPlan[] = [];

    // 估算所有分片的总内存使用量
    let remainingSize = fileSize;
    let currentPos = 0;
    let estimatedMemoryUsage = 0;

    for (let i = 0; i < totalChunks; i++) {
      // 最后一个分片可能小于chunkSize
      const currentChunkSize = Math.min(chunkSize, remainingSize);

      // 创建分片信息
      const chunk: ChunkPlan = {
        index: i,
        start: currentPos,
        end: currentPos + currentChunkSize - 1,
        size: currentChunkSize,
        priority: this.getChunkPriority(i, totalChunks),
      };

      chunks.push(chunk);

      // 更新位置和剩余大小
      currentPos += currentChunkSize;
      remainingSize -= currentChunkSize;

      // 估算内存使用 (考虑额外开销)
      const estimatedOverhead = 500; // 分片元数据开销大约500字节
      estimatedMemoryUsage += currentChunkSize + estimatedOverhead;
    }

    // 根据优先级创建处理顺序
    const processingOrder = chunks
      .map((chunk, index) => index)
      .sort((a, b) => chunks[b].priority - chunks[a].priority);

    return {
      chunks,
      totalChunks,
      estimatedMemoryUsage,
      processingOrder,
    };
  }

  /**
   * 获取分片处理优先级
   * 用于确定分片处理顺序
   */
  private static getChunkPriority(index: number, totalChunks: number): number {
    // 首片和尾片优先级最高，中间部分按顺序递减
    if (index === 0) {
      return 100; // 第一片优先级最高
    } else if (index === totalChunks - 1) {
      return 90; // 最后一片次高优先级
    } else {
      // 中间分片优先级从80递减到20
      return Math.max(20, 80 - Math.floor(60 * (index / totalChunks)));
    }
  }
}

/**
 * 分片计划
 */
interface ChunkPlan {
  index: number; // 分片索引
  start: number; // 起始位置
  end: number; // 结束位置
  size: number; // 分片大小
  priority: number; // 优先级 (0-100)
}

// 设置默认导出
export default MemoryManager;
