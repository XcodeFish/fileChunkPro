/**
 * MemoryManager - 内存管理工具
 * 用于估计可用内存和优化分片大小
 */

// 可以尝试导入EnvUtils，但为了避免循环依赖风险，复制了简单版本的环境检测
enum SimpleEnvironment {
  Browser,
  WechatMP,
  AlipayMP,
  BytedanceMP,
  BaiduMP,
  Other,
}

export interface MemoryStats {
  usage: number; // 已使用内存 (bytes)
  limit: number; // 内存限制 (bytes)
  usageRatio: number; // 内存使用率 (0-1)
  growthRate: number; // 内存增长率 (bytes/s)
  trend: 'stable' | 'growing' | 'decreasing'; // 内存趋势
}

/**
 * 内存管理工具类
 * 用于优化上传过程中的内存使用
 */
export class MemoryManager {
  // 内存使用量追踪
  private static memoryUsageHistory: number[] = [];
  private static memoryTimestampHistory: number[] = [];
  private static memoryWatcher: NodeJS.Timeout | null = null;
  private static readonly MAX_MEMORY_SAMPLES = 10;
  private static readonly CRITICAL_MEMORY_THRESHOLD = 0.85; // 85%
  private static readonly HIGH_MEMORY_THRESHOLD = 0.7; // 70%
  private static readonly NORMAL_MEMORY_THRESHOLD = 0.5; // 50%
  private static lastGarbageCollectionTime = 0;
  private static readonly MIN_GC_INTERVAL = 30000; // 最小GC间隔30秒
  private static lastRecommendationTime = 0;
  private static readonly MIN_RECOMMENDATION_INTERVAL = 5000; // 最小推荐间隔5秒
  private static lastMemoryWarning = 0;
  private static readonly MIN_WARNING_INTERVAL = 10000; // 最小警告间隔10秒

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
   */
  static startMonitoring(): void {
    // 如果已经在监控，则不再创建
    if (this.memoryWatcher) return;

    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (
        window.performance as {
          memory?: {
            usedJSHeapSize: number;
            jsHeapSizeLimit: number;
            totalJSHeapSize: number;
          };
        }
      ).memory
    ) {
      this.memoryWatcher = setInterval(() => {
        const memory = (
          window.performance as {
            memory: {
              usedJSHeapSize: number;
              jsHeapSizeLimit: number;
              totalJSHeapSize: number;
            };
          }
        ).memory;

        const now = Date.now();
        this.memoryUsageHistory.push(memory.usedJSHeapSize);
        this.memoryTimestampHistory.push(now);

        // 保留最近的样本
        if (this.memoryUsageHistory.length > this.MAX_MEMORY_SAMPLES) {
          this.memoryUsageHistory.shift();
          this.memoryTimestampHistory.shift();
        }

        // 自动检测严重内存问题并触发垃圾回收
        this.autoCheckMemory();
      }, 1000);
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
    // 清空历史数据
    this._clearMemoryData();
  }

  /**
   * 自动检测内存状况
   */
  private static autoCheckMemory(): void {
    const now = Date.now();
    const stats = this.getMemoryStats();

    // 内存超过临界值，尝试垃圾回收
    if (
      stats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD &&
      now - this.lastGarbageCollectionTime > this.MIN_GC_INTERVAL
    ) {
      this.suggestGarbageCollection();
      this.lastGarbageCollectionTime = now;

      // 发布内存警告事件
      if (now - this.lastMemoryWarning > this.MIN_WARNING_INTERVAL) {
        this.dispatchMemoryEvent('memoryWarning', stats);
        this.lastMemoryWarning = now;
      }
    }

    // 根据内存增长趋势给出建议
    if (
      stats.trend === 'growing' &&
      stats.growthRate > 2 * 1024 * 1024 &&
      now - this.lastRecommendationTime > this.MIN_RECOMMENDATION_INTERVAL
    ) {
      this.dispatchMemoryEvent('memoryRecommendation', {
        ...stats,
        recommendation: '内存增长迅速，建议减少并发任务数或降低分片大小',
      });
      this.lastRecommendationTime = now;
    }
  }

  /**
   * 分发内存相关事件
   */
  private static dispatchMemoryEvent(eventName: string, detail: unknown): void {
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
   */
  static getMemoryStats(): MemoryStats {
    const memory = this.getMemoryInfo();
    const usage = memory.used;
    const limit = memory.limit;
    const usageRatio = usage / limit;
    const growthRate = this.getMemoryGrowthRate();

    // 确定内存趋势
    let trend: 'stable' | 'growing' | 'decreasing' = 'stable';
    if (growthRate > 100 * 1024) {
      // 增长超过100KB/s
      trend = 'growing';
    } else if (growthRate < -100 * 1024) {
      // 减少超过100KB/s
      trend = 'decreasing';
    }

    return { usage, limit, usageRatio, growthRate, trend };
  }

  /**
   * 获取内存信息
   */
  private static getMemoryInfo(): { used: number; limit: number } {
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (
        window.performance as {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory
    ) {
      const memory = (
        window.performance as {
          memory: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory;
      return { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit };
    }

    // 默认假设值
    return { used: 256 * 1024 * 1024, limit: 1024 * 1024 * 1024 };
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
   * 获取最优分片大小
   * @param fileSize 文件大小
   * @param preferredSize 用户指定的分片大小（可选）
   * @returns 计算后的最优分片大小
   */
  static getOptimalChunkSize(
    fileSize: number,
    preferredSize: number | string = 0
  ): number {
    // 如果preferredSize是"auto"或0，则自动计算
    if (preferredSize === 'auto' || preferredSize === 0) {
      return this.calculateAdaptiveChunkSize(fileSize);
    }

    // 如果是数字，直接使用
    if (typeof preferredSize === 'number' && preferredSize > 0) {
      return preferredSize;
    }

    // 默认自动计算
    return this.calculateAdaptiveChunkSize(fileSize);
  }

  /**
   * 计算自适应分片大小
   */
  private static calculateAdaptiveChunkSize(fileSize: number): number {
    // 获取内存统计
    const memoryStats = this.getMemoryStats();

    // 获取可用内存
    const availableMemory = memoryStats.limit - memoryStats.usage;

    // 计算基础分片大小
    let baseSize: number;

    // 根据文件大小动态调整基础分片大小
    if (fileSize < 10 * 1024 * 1024) {
      baseSize = 1 * 1024 * 1024; // <10MB: 使用1MB分片
    } else if (fileSize < 100 * 1024 * 1024) {
      baseSize = 5 * 1024 * 1024; // <100MB: 使用5MB分片
    } else if (fileSize < 1024 * 1024 * 1024) {
      baseSize = 10 * 1024 * 1024; // <1GB: 使用10MB分片
    } else {
      baseSize = 20 * 1024 * 1024; // >1GB: 使用20MB分片
    }

    // 根据内存使用率调整
    let memoryFactor = 1.0;
    if (memoryStats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      // 内存使用率高，减少分片大小
      memoryFactor = 0.5;
    } else if (memoryStats.usageRatio < this.NORMAL_MEMORY_THRESHOLD) {
      // 内存充足，可以适当增加分片大小
      memoryFactor = 1.5;
    }

    // 根据内存增长趋势调整
    let trendFactor = 1.0;
    if (
      memoryStats.trend === 'growing' &&
      memoryStats.growthRate > 1 * 1024 * 1024
    ) {
      // 内存增长迅速，减少分片大小
      trendFactor = 0.7;
    } else if (memoryStats.trend === 'decreasing') {
      // 内存在释放，可以适当增加分片大小
      trendFactor = 1.2;
    }

    // 限制最大分片不超过可用内存的20%
    const maxChunkByMemory = Math.max(availableMemory * 0.2, 1 * 1024 * 1024);

    // 综合计算最终分片大小
    const finalSize = Math.min(
      baseSize * memoryFactor * trendFactor,
      maxChunkByMemory
    );

    // 确保分片至少1MB，最大不超过50MB
    return Math.max(Math.min(finalSize, 50 * 1024 * 1024), 1 * 1024 * 1024);
  }

  /**
   * 估算可用内存
   */
  static getAvailableMemory(): number {
    const memoryInfo = this.getMemoryInfo();
    return memoryInfo.limit - memoryInfo.used;
  }

  /**
   * 检测是否在低内存状态
   * @returns 是否处于低内存状态
   */
  static isLowMemory(): boolean {
    const stats = this.getMemoryStats();
    return stats.usageRatio > this.HIGH_MEMORY_THRESHOLD;
  }

  /**
   * 检测是否在危急内存状态
   * @returns 是否处于危急内存状态
   */
  static isCriticalMemory(): boolean {
    const stats = this.getMemoryStats();
    return stats.usageRatio > this.CRITICAL_MEMORY_THRESHOLD;
  }

  /**
   * 垃圾回收建议
   * 在关键操作前调用，建议浏览器进行垃圾回收
   */
  static suggestGarbageCollection(): void {
    if (typeof window !== 'undefined') {
      try {
        // 直接调用浏览器GC（仅开发环境可用，并不总是有效）
        if (typeof window.gc === 'function') {
          (window as unknown).gc();
        } else {
          // 创建大量临时对象然后清除引用，触发垃圾回收
          const size = 10000;
          const temp = new Array(100)
            .fill(0)
            .map(() => new Array(size).fill(Math.random()));

          // 清除引用
          for (let i = 0; i < temp.length; i++) {
            temp[i] = null;
          }

          // 分发GC事件
          this.dispatchMemoryEvent('garbageCollection', {
            timestamp: Date.now(),
            memoryBefore:
              this.memoryUsageHistory[this.memoryUsageHistory.length - 1] || 0,
          });
        }
      } catch (e) {
        console.warn('尝试触发垃圾回收失败', e);
      }
    }
  }

  /**
   * 检查是否需要释放内存
   * @returns 是否需要进行内存清理
   */
  static needsMemoryCleanup(): boolean {
    const stats = this.getMemoryStats();
    return (
      stats.usageRatio > 0.8 ||
      (stats.trend === 'growing' && stats.growthRate > 5 * 1024 * 1024)
    );
  }

  /**
   * 获取分片数量推荐
   * @param fileSize 文件大小
   * @param maxConcurrent 最大并发数
   * @returns 推荐的分片数量
   */
  static getRecommendedChunkCount(fileSize: number, maxConcurrent = 3): number {
    // 获取最优分片大小
    const chunkSize = this.getOptimalChunkSize(fileSize);

    // 计算总分片数
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // 如果分片数量太少，至少保证有一定数量的分片
    if (totalChunks < maxConcurrent) {
      return Math.min(
        Math.max(totalChunks, maxConcurrent),
        Math.ceil(fileSize / (1 * 1024 * 1024))
      );
    }

    return totalChunks;
  }

  /**
   * 获取推荐的并发数
   * @param defaultConcurrent 默认并发数
   * @returns 推荐的并发数
   */
  static getRecommendedConcurrency(defaultConcurrent = 3): number {
    const stats = this.getMemoryStats();

    // 根据内存使用率调整并发数
    if (stats.usageRatio > this.HIGH_MEMORY_THRESHOLD) {
      return Math.max(1, Math.floor(defaultConcurrent / 2));
    } else if (stats.usageRatio > this.NORMAL_MEMORY_THRESHOLD) {
      return Math.max(1, Math.floor(defaultConcurrent * 0.75));
    } else if (stats.usageRatio < 0.3) {
      return Math.min(8, Math.ceil(defaultConcurrent * 1.5));
    }

    return defaultConcurrent;
  }

  /**
   * 简易环境检测
   * @returns 检测到的环境类型
   */
  private static detectSimpleEnvironment(): SimpleEnvironment {
    // 浏览器环境
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return SimpleEnvironment.Browser;
    }

    // 微信小程序
    if (
      typeof wx !== 'undefined' &&
      typeof wx.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.WechatMP;
    }

    // 支付宝小程序
    if (
      typeof my !== 'undefined' &&
      typeof my.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.AlipayMP;
    }

    // 字节跳动小程序
    if (
      typeof tt !== 'undefined' &&
      typeof tt.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.BytedanceMP;
    }

    // 百度小程序
    if (
      typeof swan !== 'undefined' &&
      typeof swan.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.BaiduMP;
    }

    return SimpleEnvironment.Other;
  }
}

export default MemoryManager;
