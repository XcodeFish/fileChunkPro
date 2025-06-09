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

  /**
   * 初始化内存管理器
   * 检测设备能力并设置适当的阈值
   */
  public static initialize(): void {
    if (this.isInitialized) return;

    this.detectDeviceMemory();
    this.calculateMemoryAllocationLimit();
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

    // 如果无法检测，给予保守估计
    if (!this.deviceMemory) {
      this.deviceMemory = 1 * 1024 * 1024 * 1024; // 假设1GB
    }

    // 确定设备内存容量级别
    this.detectedCapacity = this.determineDeviceCapacity(this.deviceMemory);
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
        (lowerModel.includes('s20') || lowerModel.includes('s21'))
      ) {
        this.deviceMemory = 8 * 1024 * 1024 * 1024; // 8GB
      } else if (
        lowerModel.includes('xiaomi') ||
        lowerModel.includes('huawei')
      ) {
        this.deviceMemory = 6 * 1024 * 1024 * 1024; // 6GB
      } else {
        this.deviceMemory = 4 * 1024 * 1024 * 1024; // 4GB
      }
    } else {
      this.deviceMemory = 2 * 1024 * 1024 * 1024; // 默认2GB
    }
  }

  // 为测试提供访问内部数据
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
   * 仅供测试使用
   */
  static _clearMemoryData(): void {
    this.memoryUsageHistory = [];
    this.memoryTimestampHistory = [];
  }

  /**
   * 启动内存使用监控
   * 增强版监控更多指标并提供更精确的数据
   */
  static startMonitoring(): void {
    // 确保MemoryManager已初始化
    if (!this.isInitialized) {
      this.initialize();
    }

    // 如果已经在监控，则不再创建
    if (this.memoryWatcher) return;

    // 浏览器环境监控
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory
    ) {
      this.memoryWatcher = setInterval(() => {
        const memory = (window.performance as any).memory;
        const now = Date.now();

        // 记录内存使用情况
        this.memoryUsageHistory.push(memory.usedJSHeapSize);
        this.memoryTimestampHistory.push(now);

        // 保留最近的样本
        if (this.memoryUsageHistory.length > this.MAX_MEMORY_SAMPLES) {
          this.memoryUsageHistory.shift();
          this.memoryTimestampHistory.shift();
        }

        // 分析内存使用情况并检查是否需要触发警告
        this.analyzeMemoryUsage();
      }, 1000);
    }
    // 小程序环境监控
    else if (typeof wx !== 'undefined' && wx.onMemoryWarning) {
      // 微信小程序内存告警监听
      wx.onMemoryWarning(_res => {
        // 微信小程序的内存告警，忽略level参数，统一按警告级别处理
        const stats = this.getMemoryStats();

        // 分发内存警告事件
        this.dispatchEvent('memoryWarning', {
          level: MemoryWarningLevel.WARNING,
          stats,
          recommendations: this.getMemoryRecommendations(stats),
        });
      });
    }
  }

  /**
   * 停止内存监控
   */
  static stopMonitoring(): void {
    if (this.memoryWatcher) {
      clearInterval(this.memoryWatcher);
      this.memoryWatcher = null;
    }

    // 移除小程序环境的监听器
    if (typeof wx !== 'undefined' && wx.offMemoryWarning) {
      wx.offMemoryWarning();
    }

    // 清空历史数据
    this._clearMemoryData();
  }

  /**
   * 分析内存使用情况并根据需要触发事件
   */
  private static analyzeMemoryUsage(): void {
    const now = Date.now();
    const stats = this.getMemoryStats();
    let warningLevel = MemoryWarningLevel.NORMAL;

    // 确定警告级别
    if (stats.usageRatio >= this.CRITICAL_MEMORY_THRESHOLD) {
      warningLevel = MemoryWarningLevel.CRITICAL;
    } else if (stats.usageRatio >= this.HIGH_MEMORY_THRESHOLD) {
      warningLevel = MemoryWarningLevel.WARNING;
    }

    // 临界内存状态，发出警告并建议垃圾回收
    if (
      warningLevel === MemoryWarningLevel.CRITICAL &&
      now - this.lastGarbageCollectionTime > this.MIN_GC_INTERVAL
    ) {
      this.suggestGarbageCollection();
      this.lastGarbageCollectionTime = now;

      // 发布内存警告事件
      if (now - this.lastMemoryWarning > this.MIN_WARNING_INTERVAL) {
        this.dispatchEvent('memoryWarning', {
          level: warningLevel,
          stats,
          recommendations: this.getMemoryRecommendations(stats),
        });
        this.lastMemoryWarning = now;
      }
    }
    // 内存处于警告级别
    else if (
      warningLevel === MemoryWarningLevel.WARNING &&
      now - this.lastMemoryWarning > this.MIN_WARNING_INTERVAL * 2 // 降低警告频率
    ) {
      this.dispatchEvent('memoryWarning', {
        level: warningLevel,
        stats,
        recommendations: this.getMemoryRecommendations(stats),
      });
      this.lastMemoryWarning = now;
    }

    // 根据内存增长趋势给出建议
    if (
      stats.trend === MemoryTrend.GROWING &&
      stats.growthRate &&
      stats.growthRate > 2 * 1024 * 1024 && // 内存增长率超过2MB/秒
      now - this.lastRecommendationTime > this.MIN_RECOMMENDATION_INTERVAL
    ) {
      this.dispatchEvent('memoryRecommendation', {
        ...stats,
        recommendations: this.getMemoryRecommendations(stats),
      });
      this.lastRecommendationTime = now;
    }
  }

  /**
   * 根据内存状况生成推荐设置
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

    // 基于内存使用率和趋势给出不同推荐
    if (stats.usageRatio >= this.CRITICAL_MEMORY_THRESHOLD) {
      // 内存使用率临界
      recommendations.chunkSize = 512 * 1024; // 512KB
      recommendations.concurrency = 1;
      recommendations.shouldPause = true;
      recommendations.shouldReleaseMemory = true;
    } else if (stats.usageRatio >= this.HIGH_MEMORY_THRESHOLD) {
      // 内存使用率较高
      recommendations.chunkSize = 1 * 1024 * 1024; // 1MB
      recommendations.concurrency = 2;
      recommendations.shouldReleaseMemory = true;
    } else if (
      stats.trend === MemoryTrend.GROWING &&
      stats.growthRate &&
      stats.growthRate > 3 * 1024 * 1024
    ) {
      // 内存增长快
      recommendations.chunkSize = 2 * 1024 * 1024; // 2MB
      recommendations.concurrency = Math.max(
        2,
        this.getRecommendedConcurrency() - 1
      );
    }

    return recommendations;
  }

  /**
   * 注册事件监听器
   */
  public static addEventListener(
    event: string,
    callback: (event: any) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  /**
   * 移除事件监听器
   */
  public static removeEventListener(
    event: string,
    callback: (event: any) => void
  ): void {
    if (!this.eventListeners.has(event)) return;

    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   */
  private static dispatchEvent(eventName: string, detail: unknown): void {
    // 触发内部事件监听器
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(detail);
        } catch (error) {
          console.error(`执行${eventName}事件监听器出错:`, error);
        }
      });
    }

    // 兼容浏览器CustomEvent
    if (
      typeof window !== 'undefined' &&
      typeof window.dispatchEvent === 'function' &&
      typeof CustomEvent === 'function'
    ) {
      try {
        const event = new CustomEvent(eventName, { detail });
        window.dispatchEvent(event);
      } catch (e) {
        // 忽略事件分发错误
        console.warn('分发内存事件失败:', e);
      }
    }
  }

  /**
   * 获取内存统计信息
   * 增强版提供更完整的内存统计数据
   */
  public static getMemoryStats(): MemoryStats {
    try {
      // 获取基本内存信息
      const memInfo = this.getMemoryInfo();
      const { usageRatio, used, limit } = memInfo;

      // 计算内存增长率和趋势
      const growthRate = this.getMemoryGrowthRate();
      const trend = this.determineMemoryTrend();

      // 设备容量和可用内存
      if (!this.detectedCapacity) {
        this.detectDeviceMemory();
      }

      const availableForUploading = this.getAvailableMemoryForUploading();
      const isLowMemoryEnvironment = this.isLowMemoryDevice();

      return {
        used,
        total: limit,
        limit,
        usageRatio,
        growthRate,
        trend,
        capacity: this.detectedCapacity || DeviceMemoryCapacity.MEDIUM,
        availableForUploading,
        isLowMemoryEnvironment,
      };
    } catch (e) {
      // 出错时返回保守估计
      console.warn('获取内存统计信息失败', e);
      return {
        used: 0,
        total: 0,
        limit: 0,
        usageRatio: 0.5, // 保守估计为50%
        trend: MemoryTrend.STABLE,
      };
    }
  }

  /**
   * 判断内存使用趋势
   */
  private static determineMemoryTrend(): MemoryTrend {
    if (this.memoryUsageHistory.length < 5) {
      return MemoryTrend.STABLE; // 样本不足，视为稳定
    }

    // 使用最近的5个样本计算趋势
    const recentSamples = this.memoryUsageHistory.slice(-5);
    const firstSample = recentSamples[0];
    const lastSample = recentSamples[recentSamples.length - 1];

    // 计算变化百分比
    const changePercent = (lastSample - firstSample) / firstSample;

    if (changePercent > 0.05) {
      // 增长超过5%
      return MemoryTrend.GROWING;
    } else if (changePercent < -0.05) {
      // 减少超过5%
      return MemoryTrend.DECREASING;
    } else {
      return MemoryTrend.STABLE;
    }
  }

  /**
   * 获取可用于上传任务的内存估计值
   */
  private static getAvailableMemoryForUploading(): number {
    if (!this.memoryAllocationLimit) {
      this.calculateMemoryAllocationLimit();
    }

    const memInfo = this.getMemoryInfo();
    // 可用内存 = 分配上限 * (1 - 当前使用率)
    return this.memoryAllocationLimit! * (1 - memInfo.usageRatio);
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
   * 获取内存信息
   * 尝试通过多种方式获取当前内存使用情况
   */
  public static getMemoryInfo(): {
    usageRatio: number;
    used: number;
    limit: number;
  } {
    try {
      // 浏览器环境
      if (typeof window !== 'undefined' && window.performance) {
        // Chrome浏览器
        if (
          typeof (window.performance as any).memory !== 'undefined' &&
          (window.performance as any).memory.usedJSHeapSize !== undefined
        ) {
          const memoryInfo = (window.performance as any).memory;
          const used = memoryInfo.usedJSHeapSize;
          const limit = memoryInfo.jsHeapSizeLimit;
          const usageRatio = limit > 0 ? used / limit : 0;

          return { usageRatio, used, limit };
        }
      }

      // Node.js环境
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memoryUsage = process.memoryUsage();
        const used = memoryUsage.heapUsed;
        const limit = memoryUsage.rss;
        const usageRatio = limit > 0 ? used / limit : 0;

        return { usageRatio, used, limit };
      }

      // 无法获取精确信息时返回保守估计
      return {
        usageRatio: 0.5, // 假设50%使用率
        used: 0,
        limit: 0,
      };
    } catch (e) {
      console.warn('获取内存信息失败', e);
      return {
        usageRatio: 0.5, // 假设50%使用率
        used: 0,
        limit: 0,
      };
    }
  }

  /**
   * 获取当前内存使用趋势
   * @returns 内存使用增长率 (bytes/s)
   */
  static getMemoryGrowthRate(): number {
    // 如果样本不足，无法计算趋势
    if (
      this.memoryUsageHistory.length < 2 ||
      this.memoryTimestampHistory.length < 2
    ) {
      return 0;
    }

    // 使用最新和最旧样本计算增长率
    const firstUsage = this.memoryUsageHistory[0];
    const lastUsage =
      this.memoryUsageHistory[this.memoryUsageHistory.length - 1];
    const firstTime = this.memoryTimestampHistory[0];
    const lastTime =
      this.memoryTimestampHistory[this.memoryTimestampHistory.length - 1];

    // 计算时间间隔(秒)
    const timeElapsed = (lastTime - firstTime) / 1000;
    if (timeElapsed === 0) return 0;

    // 计算每秒增长字节数
    return (lastUsage - firstUsage) / timeElapsed;
  }

  /**
   * 获取分片处理策略
   * 根据文件大小和当前内存状况提供完整的处理策略
   */
  public static getChunkProcessingStrategy(
    fileSize: number,
    currentStrategy?: Partial<ChunkProcessingStrategy>
  ): ChunkProcessingStrategy {
    // 默认策略
    const defaultStrategy: ChunkProcessingStrategy = {
      chunkSize: 2 * 1024 * 1024, // 2MB
      concurrency: 3,
      processingMode: 'parallel',
      useStreaming: fileSize > 100 * 1024 * 1024, // 100MB以上文件默认使用流式处理
      prioritizeMetadata: true,
      preloadChunks: 2,
    };

    // 合并当前策略
    const strategy = {
      ...defaultStrategy,
      ...currentStrategy,
    };

    // 获取内存状态
    const memStats = this.getMemoryStats();

    // 内存紧张情况下的调整
    if (memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      // 降低并发数和分片大小
      strategy.chunkSize = this.getOptimalChunkSize(
        fileSize,
        strategy.chunkSize,
        2
      );
      strategy.concurrency = Math.min(strategy.concurrency, 2);
      strategy.preloadChunks = 1;

      // 对于大文件，强制使用流式处理
      if (fileSize > 50 * 1024 * 1024) {
        // 50MB
        strategy.useStreaming = true;
      }

      // 内存极度紧张时切换到顺序处理
      if (memStats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD) {
        strategy.processingMode = 'sequential';
        strategy.concurrency = 1;
        strategy.preloadChunks = 0;
      }
    }
    // 内存充足情况下的调整
    else if (memStats.usageRatio < this.NORMAL_MEMORY_THRESHOLD) {
      // 可以适当增加分片大小和并发数
      strategy.chunkSize = this.getOptimalChunkSize(
        fileSize,
        strategy.chunkSize,
        strategy.concurrency
      );
      strategy.preloadChunks = Math.min(3, strategy.concurrency);

      // 小文件不需要流式处理
      if (fileSize < 20 * 1024 * 1024) {
        // 20MB
        strategy.useStreaming = false;
      }
    }

    // 大文件特殊处理策略
    if (fileSize > 500 * 1024 * 1024) {
      // 500MB
      strategy.processingMode = 'hybrid'; // 使用混合处理模式
      strategy.useStreaming = true; // 强制使用流式处理
    }

    return strategy;
  }

  /**
   * 获取当前可用内存
   * 用于估算可用于上传的内存量
   */
  static getAvailableMemory(): number {
    const memInfo = this.getMemoryInfo();
    if (!memInfo.limit) {
      // 无法获取精确信息时，使用保守估计
      return 100 * 1024 * 1024; // 假设100MB可用
    }
    return memInfo.limit - memInfo.used;
  }

  /**
   * 检测是否为低内存状态
   */
  static isLowMemory(): boolean {
    const memInfo = this.getMemoryInfo();
    return memInfo.usageRatio > this.HIGH_MEMORY_THRESHOLD;
  }

  /**
   * 检测是否为临界内存状态
   */
  static isCriticalMemory(): boolean {
    const memInfo = this.getMemoryInfo();
    return memInfo.usageRatio > this.CRITICAL_MEMORY_THRESHOLD;
  }

  /**
   * 建议进行垃圾回收
   * 尝试通过各种手段释放内存
   */
  public static suggestGarbageCollection(): void {
    // 发出内存不足警告
    console.warn('内存使用率较高，建议进行垃圾回收');

    try {
      // 使用闭包触发V8垃圾回收
      // 这不是强制垃圾回收，但可能会提示V8进行回收
      (function forceGC() {
        const arr = [];
        for (let i = 0; i < 1000; i++) {
          arr.push(new Array(10000).fill(0));
        }
        // 释放arr
        arr.length = 0;
      })();

      // 尝试在Node.js环境中强制垃圾回收
      if (typeof global !== 'undefined' && typeof global.gc === 'function') {
        global.gc();
      }
    } catch (e) {
      // 忽略错误
    }
  }

  /**
   * 判断是否需要清理内存
   * 基于内存使用趋势和当前使用率
   */
  static needsMemoryCleanup(): boolean {
    const stats = this.getMemoryStats();

    // 内存使用率高
    if (stats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      return true;
    }

    // 内存增长快
    if (
      stats.trend === MemoryTrend.GROWING &&
      stats.growthRate &&
      stats.growthRate > 2 * 1024 * 1024 && // 增长率超过2MB/s
      stats.usageRatio > 0.5 // 使用率超过50%
    ) {
      return true;
    }

    return false;
  }

  /**
   * 获取推荐的分片数量
   * 根据文件大小和可用内存动态计算
   */
  static getRecommendedChunkCount(fileSize: number, maxConcurrent = 3): number {
    // 获取可用内存
    const availableMem = this.getAvailableMemory();

    // 确保文件至少分为10个分片
    const minChunks = 10;

    // 计算理想分片大小
    const idealChunkSize = this.getOptimalChunkSize(fileSize);

    // 计算理想分片数
    const idealChunkCount = Math.ceil(fileSize / idealChunkSize);

    // 考虑内存限制，计算基于内存的最大分片数
    // 假设每个分片需要比其实际大小多30%的内存
    const memoryBasedMaxChunks = Math.floor(
      availableMem / (idealChunkSize * 1.3)
    );

    // 取理想分片数与内存限制中的较小值，确保至少分为minChunks个分片
    return Math.max(
      Math.min(idealChunkCount, memoryBasedMaxChunks, maxConcurrent * 5),
      minChunks
    );
  }

  /**
   * 获取推荐的并发数
   * 根据内存状况和设备能力动态计算
   */
  static getRecommendedConcurrency(defaultConcurrent = 3): number {
    // 根据内存使用率调整并发数
    const memInfo = this.getMemoryInfo();

    if (memInfo.usageRatio > this.CRITICAL_MEMORY_THRESHOLD) {
      return 1; // 内存极度紧张，单线程处理
    }

    if (memInfo.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      return 2; // 内存紧张，降低并发
    }

    if (this.isLowMemoryDevice()) {
      return Math.min(defaultConcurrent, 2); // 低内存设备限制并发
    }

    return defaultConcurrent; // 默认并发数
  }

  /**
   * 判断是否为低内存设备
   */
  public static isLowMemoryDevice(): boolean {
    // 确保已初始化
    if (!this.isInitialized) {
      this.initialize();
    }

    // 根据检测到的设备内存容量判断
    return (
      this.detectedCapacity === DeviceMemoryCapacity.VERY_LOW ||
      this.detectedCapacity === DeviceMemoryCapacity.LOW
    );
  }

  /**
   * 判断是否为低性能设备
   * 基于内存和其他指标综合判断
   */
  public static isLowPowerDevice(): boolean {
    // 低内存通常意味着低性能
    if (this.isLowMemoryDevice()) {
      return true;
    }

    // 尝试检测处理器核心数
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      if (navigator.hardwareConcurrency <= 2) {
        return true; // 双核或单核设备视为低性能
      }
    }

    return false;
  }

  /**
   * 获取大文件处理优化策略
   * 针对大文件提供特殊的处理策略
   */
  public static getLargeFileStrategy(fileSize: number): {
    shouldUseParts: boolean; // 是否应该使用分部处理
    partSize: number; // 每部分大小
    maxPartsInMemory: number; // 最大内存中保留的部分数
    shouldUseStreaming: boolean; // 是否应该使用流式处理
    shouldOffloadCalculation: boolean; // 是否应该卸载计算任务到Worker
    processingMode: 'sequential' | 'parallel' | 'hybrid'; // 处理模式
  } {
    // 默认策略
    const defaultStrategy = {
      shouldUseParts: false,
      partSize: 100 * 1024 * 1024, // 100MB
      maxPartsInMemory: 2,
      shouldUseStreaming: false,
      shouldOffloadCalculation: false,
      processingMode: 'parallel' as const,
    };

    // 不是大文件，使用默认策略
    if (fileSize < 200 * 1024 * 1024) {
      // 小于200MB
      return defaultStrategy;
    }

    // 获取内存状态
    const memStats = this.getMemoryStats();

    // 大文件策略
    const largeFileStrategy = {
      ...defaultStrategy,
      shouldUseParts: true,
      shouldUseStreaming: true,
      shouldOffloadCalculation: true,
    };

    // 根据文件大小进一步调整
    if (fileSize > 1 * 1024 * 1024 * 1024) {
      // 大于1GB
      largeFileStrategy.partSize = 50 * 1024 * 1024; // 50MB
      largeFileStrategy.maxPartsInMemory = 1;
      largeFileStrategy.processingMode = 'sequential' as const;
    } else if (fileSize > 500 * 1024 * 1024) {
      // 大于500MB
      largeFileStrategy.partSize = 100 * 1024 * 1024; // 100MB
      largeFileStrategy.maxPartsInMemory = 2;
      largeFileStrategy.processingMode = 'hybrid' as const;
    }

    // 根据内存状态调整
    if (memStats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      largeFileStrategy.maxPartsInMemory = 1;
      largeFileStrategy.partSize = 50 * 1024 * 1024; // 50MB
      largeFileStrategy.processingMode = 'sequential' as const;
    }

    return largeFileStrategy;
  }

  /**
   * 获取内存友好的分片计划
   * 生成一个完整的分片计划，包括大小和处理顺序
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
    // 确定分片大小
    const chunkSize = initialChunkSize || this.getOptimalChunkSize(fileSize);

    // 计算分片数量
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // 创建分片计划
    const chunks: ChunkPlan[] = [];
    let remainingSize = fileSize;

    for (let i = 0; i < totalChunks; i++) {
      const currentChunkSize = Math.min(chunkSize, remainingSize);
      const start = fileSize - remainingSize;
      const end = start + currentChunkSize;

      chunks.push({
        index: i,
        start,
        end,
        size: currentChunkSize,
        priority: this.getChunkPriority(i, totalChunks),
      });

      remainingSize -= currentChunkSize;
    }

    // 估计内存使用
    // 假设处理每个分片需要约分片大小的1.5倍内存
    const estimatedMemoryUsage = chunkSize * 1.5;

    // 确定处理顺序
    // 优先处理第一个和最后一个分片，然后按优先级排序其他分片
    const processingOrder = chunks
      .slice() // 创建副本
      .sort((a, b) => b.priority - a.priority) // 按优先级排序
      .map(chunk => chunk.index); // 提取索引

    return {
      chunks,
      totalChunks,
      estimatedMemoryUsage,
      processingOrder,
    };
  }

  /**
   * 计算分片优先级
   * 第一个和最后一个分片优先级最高，其他均匀分布
   */
  private static getChunkPriority(index: number, totalChunks: number): number {
    if (index === 0) return 100; // 第一个分片
    if (index === totalChunks - 1) return 90; // 最后一个分片

    // 中间分片按位置均匀分布优先级，范围从80到10
    return 80 - (index / totalChunks) * 70;
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
