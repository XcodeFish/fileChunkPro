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
  private static logger: any = null; // 记录器，可选使用
  private static _sampleCount = 0; // 采样计数器
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

    // 检测是否为小程序环境，若是则应用更严格的优化策略
    if (this.isInMiniProgramEnv()) {
      this.applyMiniProgramOptimizations();
    }

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

    // 设置初始采样率，根据设备能力进行差异化配置
    let samplingInterval = this.memorySamplingRate;
    let analysisInterval = 3; // 每采样3次进行一次分析，减少分析频率

    // 根据设备容量调整采样间隔和分析频率
    if (this.detectedCapacity === DeviceMemoryCapacity.VERY_LOW) {
      samplingInterval = 3000; // 极低内存设备显著降低采样频率
      analysisInterval = 5; // 极低内存设备降低分析频率
    } else if (this.detectedCapacity === DeviceMemoryCapacity.LOW) {
      samplingInterval = 2000; // 低内存设备降低采样频率
      analysisInterval = 4; // 低内存设备降低分析频率
    } else if (this.detectedCapacity === DeviceMemoryCapacity.MEDIUM) {
      samplingInterval = 1500; // 中等内存设备适中采样频率
    }

    // 更新采样率
    this.memorySamplingRate = samplingInterval;

    // 采样计数器
    let sampleCount = 0;

    // 初始采样
    this.updateMemorySample();

    // 开始定时采样
    this.memoryWatcher = setInterval(() => {
      try {
        // 更新内存样本
        this.updateMemorySample();

        // 增加采样计数
        sampleCount++;

        // 只在特定频率进行内存分析，减少CPU占用
        if (sampleCount >= analysisInterval) {
          // 分析内存使用情况
          this.analyzeMemoryUsage();
          sampleCount = 0;

          // 动态调整采样间隔 (减少调整频率)
          if (this.dynamicSamplingEnabled) {
            this.adjustSamplingRate();
          }
        }
      } catch (e) {
        console.error('内存监控异常', e);
      }
    }, samplingInterval);

    // 周期性清理过多的历史数据，避免长时间运行导致的内存增长
    const cleanupInterval = Math.max(30000, samplingInterval * 20); // 至少30秒
    setInterval(() => {
      if (this.memoryUsageHistory.length > this.MAX_MEMORY_SAMPLES * 0.8) {
        const keepCount = Math.ceil(this.MAX_MEMORY_SAMPLES * 0.6); // 保留60%最新数据
        this.memoryUsageHistory = this.memoryUsageHistory.slice(-keepCount);
        this.memoryTimestampHistory = this.memoryTimestampHistory.slice(
          -keepCount
        );
      }
    }, cleanupInterval);
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
   * 根据内存使用趋势调整采样频率，避免过度调整
   */
  private static adjustSamplingRate(): void {
    // 如果采样数不足，不进行调整
    if (this.memoryUsageHistory.length < 5) {
      return;
    }

    const trend = this.determineMemoryTrend();
    const memStats = this.getMemoryStats();

    // 初始采样间隔
    let newInterval = this.memorySamplingRate;

    // 设备类型基本采样率限制
    const minInterval = this.isLowMemoryDevice() ? 1000 : 500;
    const maxInterval = this.isLowMemoryDevice() ? 5000 : 3000;

    // 根据趋势和使用率调整（更保守的调整策略）
    if (trend === MemoryTrend.GROWING && memStats.usageRatio > 0.6) {
      // 内存增长且接近警告阈值，提高采样频率，但限制变化幅度
      newInterval = Math.max(minInterval, this.memorySamplingRate - 100);
    } else if (trend === MemoryTrend.STABLE && memStats.usageRatio < 0.5) {
      // 内存稳定且使用率较低，适度降低采样频率
      newInterval = Math.min(maxInterval, this.memorySamplingRate + 200);
    } else if (trend === MemoryTrend.DECREASING) {
      // 内存减少，可以适度降低采样频率
      newInterval = Math.min(maxInterval, this.memorySamplingRate + 50);
    }

    // 防止微小变化导致频繁重设定时器
    const significantChange =
      Math.abs(newInterval - this.memorySamplingRate) > 300;

    // 只在采样率显著变化时更新
    if (significantChange && newInterval !== this.memorySamplingRate) {
      this.memorySamplingRate = newInterval;

      // 重新启动监控器
      if (this.memoryWatcher) {
        clearInterval(this.memoryWatcher);

        // 创建新的定时器并记录ID
        this.memoryWatcher = setInterval(() => {
          try {
            this.updateMemorySample();

            // 静态变量用于记录采样数
            if (!this._sampleCount) this._sampleCount = 0;
            this._sampleCount++;

            // 降低分析频率，减少性能开销
            if (this._sampleCount % 3 === 0) {
              this.analyzeMemoryUsage();
              if (this.dynamicSamplingEnabled) {
                this.adjustSamplingRate();
              }
            }
          } catch (e) {
            console.error('内存采样错误:', e);
          }
        }, this.memorySamplingRate);

        // 记录定时器ID用于后续清理
        if (typeof window !== 'undefined') {
          if (!(window as any).__memoryManagerTimers) {
            (window as any).__memoryManagerTimers = [];
          }
          (window as any).__memoryManagerTimers.push(this.memoryWatcher);
        }
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
   * 释放所有资源和监听器
   */
  static stopMonitoring(): void {
    // 清理定时器
    if (this.memoryWatcher) {
      clearInterval(this.memoryWatcher);
      this.memoryWatcher = null;
    }

    // 检查并清除所有定时器
    if (typeof window !== 'undefined') {
      // 由于无法直接访问已创建的所有定时器，我们记录最后一次定时器操作的ID
      const timers = (window as any).__memoryManagerTimers;
      if (timers && Array.isArray(timers)) {
        timers.forEach(timerId => {
          clearInterval(timerId);
          clearTimeout(timerId);
        });
        (window as any).__memoryManagerTimers = [];
      }
    }

    // 清除小程序特定的监听器
    this.clearPlatformSpecificListeners();

    // 清除所有事件监听器
    this.eventListeners.clear();

    // 清除内存样本数据，减少内存占用
    this._clearMemoryData();

    // 记录停止监控时间
    const stopTime = Date.now();
    this.memoryPeakUsage = 0; // 重置峰值

    if (this.logger) {
      this.logger.info('内存监控已停止，资源已释放', {
        stopTime,
        runningTime: stopTime - (this.memoryTimestampHistory[0] || stopTime),
      });
    }
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
   * 基于内存状态、文件大小和设备能力综合计算，增强稳定性
   */
  private static calculateAdaptiveChunkSize(
    fileSize: number,
    memStats: MemoryStats,
    concurrency = 3
  ): number {
    // 分片大小范围常量 (确保与validateChunkSize方法一致)
    const MIN_CHUNK_SIZE = 256 * 1024; // 256KB
    const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB

    // 基础分片大小计算
    let baseChunkSize: number;

    // 根据设备内存容量确定基础分片大小，保守策略
    switch (memStats.capacity) {
      case DeviceMemoryCapacity.VERY_LOW:
        baseChunkSize = 384 * 1024; // 384KB (更保守)
        break;
      case DeviceMemoryCapacity.LOW:
        baseChunkSize = 768 * 1024; // 768KB
        break;
      case DeviceMemoryCapacity.MEDIUM:
        baseChunkSize = 1.5 * 1024 * 1024; // 1.5MB
        break;
      case DeviceMemoryCapacity.HIGH:
        baseChunkSize = 3 * 1024 * 1024; // 3MB
        break;
      case DeviceMemoryCapacity.VERY_HIGH:
        baseChunkSize = 6 * 1024 * 1024; // 6MB
        break;
      default:
        baseChunkSize = 1 * 1024 * 1024; // 默认1MB (更保守)
    }

    // 调整因子，基于内存使用率 (使用更线性的调整)
    let memoryUsageAdjustment: number;

    // 根据内存使用率线性插值调整，避免突变
    if (memStats.usageRatio >= this.CRITICAL_MEMORY_THRESHOLD) {
      memoryUsageAdjustment = 0.3; // 70%降低
    } else if (memStats.usageRatio >= this.HIGH_MEMORY_THRESHOLD) {
      // 线性插值: 在HIGH和CRITICAL之间平滑过渡
      const ratio =
        (memStats.usageRatio - this.HIGH_MEMORY_THRESHOLD) /
        (this.CRITICAL_MEMORY_THRESHOLD - this.HIGH_MEMORY_THRESHOLD);
      memoryUsageAdjustment = 0.6 - ratio * 0.3; // 从0.6降到0.3
    } else if (memStats.usageRatio >= this.NORMAL_MEMORY_THRESHOLD) {
      // 线性插值: 在NORMAL和HIGH之间平滑过渡
      const ratio =
        (memStats.usageRatio - this.NORMAL_MEMORY_THRESHOLD) /
        (this.HIGH_MEMORY_THRESHOLD - this.NORMAL_MEMORY_THRESHOLD);
      memoryUsageAdjustment = 1.0 - ratio * 0.4; // 从1.0降到0.6
    } else {
      // 低于NORMAL阈值时，可以适度增加
      memoryUsageAdjustment = 1.1; // 仅增加10%，更保守
    }

    // 考虑内存增长趋势 (更保守的调整)
    let trendAdjustment = 1.0;
    if (memStats.trend === MemoryTrend.GROWING) {
      if (memStats.growthRate && memStats.growthRate > 5 * 1024 * 1024) {
        // 增长非常快 (>5MB/s)
        trendAdjustment = 0.5; // 减半
      } else if (memStats.growthRate && memStats.growthRate > 1 * 1024 * 1024) {
        // 增长较快 (>1MB/s)
        trendAdjustment = 0.7; // 降低30%
      } else {
        // 增长缓慢
        trendAdjustment = 0.9; // 轻微降低10%
      }
    } else if (memStats.trend === MemoryTrend.DECREASING) {
      trendAdjustment = 1.05; // 轻微增加5%
    }

    // 考虑文件大小，更细粒度的调整
    let fileSizeAdjustment: number;
    if (fileSize >= 2 * 1024 * 1024 * 1024) {
      // >= 2GB
      fileSizeAdjustment = 0.5;
    } else if (fileSize >= 1 * 1024 * 1024 * 1024) {
      // >= 1GB
      fileSizeAdjustment = 0.6;
    } else if (fileSize >= 500 * 1024 * 1024) {
      // >= 500MB
      fileSizeAdjustment = 0.7;
    } else if (fileSize >= 100 * 1024 * 1024) {
      // >= 100MB
      fileSizeAdjustment = 0.8;
    } else if (fileSize >= 50 * 1024 * 1024) {
      // >= 50MB
      fileSizeAdjustment = 0.9;
    } else if (fileSize >= 10 * 1024 * 1024) {
      // >= 10MB
      fileSizeAdjustment = 1.0;
    } else if (fileSize >= 1 * 1024 * 1024) {
      // >= 1MB
      fileSizeAdjustment = 1.1;
    } else {
      // < 1MB
      fileSizeAdjustment = 1.2;
    }

    // 考虑并发数 (使用更平缓的调整)
    // 并发数越高，每个分片应该越小
    const concurrencyAdjustment = Math.max(
      0.5,
      1.0 / (0.5 + concurrency * 0.15)
    );

    // 计算调整后的分片大小，将调整幅度限制在合理范围内
    let adaptiveChunkSize =
      baseChunkSize *
      memoryUsageAdjustment *
      trendAdjustment *
      fileSizeAdjustment *
      concurrencyAdjustment;

    // 确保计算结果在合理范围内 (增加的最后安全措施)
    adaptiveChunkSize = Math.min(
      MAX_CHUNK_SIZE,
      Math.max(MIN_CHUNK_SIZE, adaptiveChunkSize)
    );

    // 对极端值进行额外检查
    if (adaptiveChunkSize <= MIN_CHUNK_SIZE * 1.1) {
      adaptiveChunkSize = MIN_CHUNK_SIZE; // 接近最小值时，直接使用最小值
    } else if (adaptiveChunkSize >= MAX_CHUNK_SIZE * 0.9) {
      adaptiveChunkSize = MAX_CHUNK_SIZE; // 接近最大值时，直接使用最大值
    }

    // 对于小文件，确保分片大小不会超过文件大小
    if (adaptiveChunkSize > fileSize) {
      adaptiveChunkSize = fileSize;
    }

    // 返回整数值
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
    // 避免频繁触发GC
    const now = Date.now();
    if (now - this.lastGarbageCollectionTime < this.MIN_GC_INTERVAL) {
      return;
    }

    this.lastGarbageCollectionTime = now;

    if (typeof window !== 'undefined') {
      // 不再尝试强制GC，而是通过事件通知应用层可以释放资源
      this.dispatchEvent('suggestMemoryCleanup', {
        timestamp: now,
        currentUsage: this.getMemoryInfo().used,
        peakUsage: this.memoryPeakUsage,
        reason: 'memoryPressure',
      });

      // 尝试一些基本的内存释放措施
      if (this.memoryUsageHistory.length > this.MAX_MEMORY_SAMPLES / 2) {
        // 保留一半的历史数据，减少内存占用
        const keepCount = Math.ceil(this.MAX_MEMORY_SAMPLES / 2);
        this.memoryUsageHistory = this.memoryUsageHistory.slice(-keepCount);
        this.memoryTimestampHistory = this.memoryTimestampHistory.slice(
          -keepCount
        );
      }

      // 更新内存状态 (延迟执行，给应用一些时间进行清理)
      setTimeout(() => {
        if (this.memoryWatcher) {
          this.updateMemorySample();
        }
      }, 300);
    }
  }

  /**
   * 检查是否需要清理内存
   * 根据内存增长率和当前使用率判断
   * @returns 是否需要清理
   */
  static needsMemoryCleanup(): boolean {
    // 获取当前内存状态
    const memStats = this.getMemoryStats();

    // 内存使用率高于70%，建议清理
    if (memStats.usageRatio > 0.7) {
      return true;
    }

    // 内存增长率很快(每秒超过50MB)，建议清理
    if (memStats.growthRate && memStats.growthRate > 50 * 1024 * 1024) {
      return true;
    }

    // 内存趋势持续增长且使用率超过50%，建议清理
    if (memStats.trend === MemoryTrend.GROWING && memStats.usageRatio > 0.5) {
      return true;
    }

    // 否则不需要特别清理
    return false;
  }

  /**
   * 获取推荐的并发上传数量
   * 根据当前内存使用情况动态调整并发数
   * @param defaultConcurrency 默认并发数
   * @returns 推荐的并发数
   */
  static getRecommendedConcurrency(defaultConcurrency: number): number {
    // 获取当前内存状态
    const memStats = this.getMemoryStats();

    // 内存使用率 > 70%，减少并发数
    if (memStats.usageRatio > 0.7) {
      // 内存使用率高时，减半并发数，但至少为1
      return Math.max(1, Math.floor(defaultConcurrency / 2));
    }

    // 内存使用率 < 30%，增加并发数
    else if (memStats.usageRatio < 0.3) {
      // 内存使用率低时，增加50%并发数，但不超过8
      return Math.min(8, Math.floor(defaultConcurrency * 1.5));
    }

    // 内存使用率在正常范围内，保持默认并发数
    else {
      return defaultConcurrency;
    }
  }

  /**
   * 检测是否为低内存设备
   * 用于判断应用是否应该采用更保守的策略
   */
  public static isLowMemoryDevice(): boolean {
    if (!this.isInitialized) {
      this.initialize();
    }

    // 小程序环境一律视为低内存设备，采用保守策略
    if (this.isInMiniProgramEnv()) {
      return true;
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
   * 检测是否在小程序环境中运行
   * 用于应用更严格的内存管理策略
   */
  private static isInMiniProgramEnv(): boolean {
    return (
      typeof wx !== 'undefined' ||
      typeof my !== 'undefined' ||
      typeof tt !== 'undefined' ||
      typeof swan !== 'undefined'
    );
  }

  /**
   * 小程序环境专用内存优化
   * 应用更激进的内存释放策略
   */
  public static applyMiniProgramOptimizations(): void {
    if (!this.isInMiniProgramEnv()) {
      return; // 非小程序环境不应用这些优化
    }

    // 更严格的内存阈值
    this.CRITICAL_MEMORY_THRESHOLD = 0.8; // 从85%降至80%
    this.HIGH_MEMORY_THRESHOLD = 0.65; // 从70%降至65%
    this.NORMAL_MEMORY_THRESHOLD = 0.45; // 从50%降至45%

    // 更保守的小程序环境基础值
    this.memorySamplingRate = Math.max(1500, this.memorySamplingRate); // 至少1.5秒
    this.MIN_GC_INTERVAL = 15000; // 垃圾回收间隔降至15秒
    this.MAX_MEMORY_SAMPLES = 10; // 减少样本数量，节省内存

    // 更主动的内存清理策略
    this.dispatchEvent('miniProgramOptimizationsApplied', {
      timestamp: Date.now(),
      optimizations: [
        'reducedThresholds',
        'increasedSamplingInterval',
        'reducedSamples',
        'reducedGCInterval',
      ],
    });

    // 记录日志
    if (typeof console !== 'undefined') {
      console.info('[MemoryManager] 已应用小程序环境的内存优化策略');
    }
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

  /**
   * 获取当前内存使用率
   * @returns 内存使用率（0-1之间的数值）
   */
  static getMemoryUsage(): number {
    const stats = this.getMemoryStats();
    return stats.usageRatio;
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
