/**
 * PerformanceMonitor - 性能监控工具
 * 用于监控和分析上传过程中的系统性能
 */

export interface PerformanceStats {
  cpu: {
    usage: number; // CPU使用率 (0-100)
    cores: number; // CPU核心数
  };
  memory: {
    usage: number; // 内存使用量 (字节)
    usageRatio: number; // 内存使用率 (0-1)
    total: number; // 总内存 (字节)
  };
  timestamps: {
    current: number; // 当前时间戳
    start: number; // 监控开始时间戳
  };
}

type PerformanceChangeCallback = (stats: PerformanceStats) => void;

/**
 * 性能监控器
 * 用于监控和分析上传过程中的系统性能
 */
export class PerformanceMonitor {
  private interval = 5000; // 默认5秒监控一次
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private startTime = 0;
  private lastStats: PerformanceStats | null = null;
  private changeCallbacks: PerformanceChangeCallback[] = [];

  // 性能采样历史记录
  private cpuUsageHistory: number[] = [];
  private memoryUsageHistory: number[] = [];
  private readonly MAX_HISTORY_SAMPLES = 20;

  /**
   * 创建性能监控器实例
   * @param interval 监控间隔 (毫秒)
   */
  constructor(interval?: number) {
    if (interval) {
      this.interval = interval;
    }
  }

  /**
   * 启动性能监控
   */
  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();

    // 立即执行一次收集
    this.collectPerformanceData();

    // 设置定时收集
    this.timer = setInterval(() => {
      this.collectPerformanceData();
    }, this.interval);
  }

  /**
   * 停止性能监控
   */
  public stop(): void {
    if (!this.isRunning || !this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
    this.isRunning = false;
  }

  /**
   * 添加性能变化回调
   * @param callback 回调函数
   */
  public onPerformanceChange(callback: PerformanceChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * 移除性能变化回调
   * @param callback 回调函数
   */
  public removePerformanceChangeCallback(
    callback: PerformanceChangeCallback
  ): void {
    this.changeCallbacks = this.changeCallbacks.filter(cb => cb !== callback);
  }

  /**
   * 获取当前性能统计
   */
  public getCurrentStats(): PerformanceStats | null {
    return this.lastStats;
  }

  /**
   * 收集性能数据
   */
  private collectPerformanceData(): void {
    // 创建性能统计对象
    const stats: PerformanceStats = {
      cpu: {
        usage: this.getCpuUsage(),
        cores: this.getCpuCores(),
      },
      memory: {
        usage: this.getMemoryUsage(),
        usageRatio: this.getMemoryUsageRatio(),
        total: this.getTotalMemory(),
      },
      timestamps: {
        current: Date.now(),
        start: this.startTime,
      },
    };

    // 保存历史记录
    this.cpuUsageHistory.push(stats.cpu.usage);
    this.memoryUsageHistory.push(stats.memory.usageRatio);

    // 限制历史记录大小
    if (this.cpuUsageHistory.length > this.MAX_HISTORY_SAMPLES) {
      this.cpuUsageHistory.shift();
    }
    if (this.memoryUsageHistory.length > this.MAX_HISTORY_SAMPLES) {
      this.memoryUsageHistory.shift();
    }

    // 保存当前统计
    this.lastStats = stats;

    // 通知回调
    this.notifyCallbacks(stats);
  }

  /**
   * 通知所有回调
   */
  private notifyCallbacks(stats: PerformanceStats): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(stats);
      } catch (error) {
        console.error('性能监控回调执行错误:', error);
      }
    }
  }

  /**
   * 获取CPU使用率
   * 由于浏览器限制，无法直接获取，使用估算方法
   */
  private getCpuUsage(): number {
    // 浏览器环境中，无法直接获取CPU使用率
    // 这里使用一个基于内存使用变化和动画帧速率的估算方法

    if (this.memoryUsageHistory.length < 2) {
      return 0; // 没有足够的历史数据
    }

    // 基于内存变化率估算CPU压力
    const memoryChanges = [];
    for (let i = 1; i < this.memoryUsageHistory.length; i++) {
      memoryChanges.push(
        Math.abs(this.memoryUsageHistory[i] - this.memoryUsageHistory[i - 1])
      );
    }

    // 计算平均内存变化率
    const avgChange =
      memoryChanges.reduce((sum, val) => sum + val, 0) / memoryChanges.length;

    // 将变化率映射到CPU使用率 (0-100)
    // 这是一个粗略估算，实际应用中可能需要更复杂的算法
    let estimatedCpuUsage = avgChange * 1000; // 调整因子

    // 如果有requestAnimationFrame API，可以尝试测量帧率变化
    // 这里简化处理

    // 限制在合理范围内
    estimatedCpuUsage = Math.max(0, Math.min(100, estimatedCpuUsage));

    return estimatedCpuUsage;
  }

  /**
   * 获取CPU核心数
   */
  private getCpuCores(): number {
    return typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4; // 默认假设4核
  }

  /**
   * 获取内存使用量 (字节)
   */
  private getMemoryUsage(): number {
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory
    ) {
      return (window.performance as any).memory.usedJSHeapSize || 0;
    }

    // 在Node.js环境
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }

    return 0;
  }

  /**
   * 获取内存使用率 (0-1)
   */
  private getMemoryUsageRatio(): number {
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory
    ) {
      const memory = (window.performance as any).memory;
      return memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    }

    // 在Node.js环境
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      return memory.heapUsed / memory.heapTotal;
    }

    return 0;
  }

  /**
   * 获取总内存 (字节)
   */
  private getTotalMemory(): number {
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory
    ) {
      return (window.performance as any).memory.jsHeapSizeLimit || 0;
    }

    // 在Node.js环境
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapTotal;
    }

    return 0;
  }
}

export default PerformanceMonitor;
