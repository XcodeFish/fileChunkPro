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

  // CPU使用率估算相关
  private lastCPUUsageMeasurement = 0;
  private lastAnimationFrameTime = 0;
  private frameRateHistory: number[] = [];
  private readonly TARGET_FRAME_RATE = 60; // 目标帧率
  private readonly MAX_FRAME_SAMPLES = 10;

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

    // 如果在浏览器环境，设置帧率监测
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      this.setupFrameRateMonitoring();
    }
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

    // 保存历史记录 (使用数组修改替代创建新数组)
    this.updateHistoryArrays(stats.cpu.usage, stats.memory.usageRatio);

    // 保存当前统计
    this.lastStats = stats;

    // 通知回调
    this.notifyCallbacks(stats);
  }

  /**
   * 更新历史数组，避免创建新数组
   */
  private updateHistoryArrays(
    cpuUsage: number,
    memoryUsageRatio: number
  ): void {
    // CPU使用率历史
    if (this.cpuUsageHistory.length >= this.MAX_HISTORY_SAMPLES) {
      this.cpuUsageHistory.shift();
    }
    this.cpuUsageHistory.push(cpuUsage);

    // 内存使用率历史
    if (this.memoryUsageHistory.length >= this.MAX_HISTORY_SAMPLES) {
      this.memoryUsageHistory.shift();
    }
    this.memoryUsageHistory.push(memoryUsageRatio);
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
   * 设置帧率监测
   */
  private setupFrameRateMonitoring(): void {
    const measureFrameRate = (timestamp: number): void => {
      if (this.lastAnimationFrameTime > 0) {
        const frameTime = timestamp - this.lastAnimationFrameTime;
        const fps = 1000 / frameTime;

        // 更新帧率历史
        if (this.frameRateHistory.length >= this.MAX_FRAME_SAMPLES) {
          this.frameRateHistory.shift();
        }
        this.frameRateHistory.push(fps);
      }

      this.lastAnimationFrameTime = timestamp;

      // 继续请求下一帧测量
      if (this.isRunning) {
        window.requestAnimationFrame(measureFrameRate);
      }
    };

    window.requestAnimationFrame(measureFrameRate);
  }

  /**
   * 获取CPU使用率
   * 使用改进的算法提高准确性
   */
  private getCpuUsage(): number {
    const now = Date.now();

    // 如果并非浏览器环境，回退到Node.js方式
    if (typeof process !== 'undefined' && process.cpuUsage) {
      try {
        const usage = process.cpuUsage();
        const totalUsage = usage.user + usage.system;

        if (this.lastCPUUsageMeasurement > 0) {
          const elapsed = now - this.lastCPUUsageMeasurement;
          // 转换为百分比 (0-100)
          const cpuPercent = (totalUsage / 1000 / elapsed) * 100;
          this.lastCPUUsageMeasurement = now;
          return Math.min(100, Math.max(0, cpuPercent));
        }

        this.lastCPUUsageMeasurement = now;
        return 0;
      } catch (err) {
        // 如果出错，使用估算方法
        return this.estimateCpuUsage();
      }
    }

    // 浏览器环境 - 使用组合估算法
    return this.estimateCpuUsage();
  }

  /**
   * 估算CPU使用率
   * 使用内存变化率、帧率和长任务检测的组合方法
   */
  private estimateCpuUsage(): number {
    let estimatedCpuUsage = 0;

    // 1. 基于内存变化估算部分
    if (this.memoryUsageHistory.length >= 2) {
      const memoryChanges: number[] = [];
      for (let i = 1; i < this.memoryUsageHistory.length; i++) {
        memoryChanges.push(
          Math.abs(this.memoryUsageHistory[i] - this.memoryUsageHistory[i - 1])
        );
      }

      const avgMemoryChange =
        memoryChanges.reduce((sum, val) => sum + val, 0) / memoryChanges.length;
      const memoryBasedEstimate = avgMemoryChange * 500; // 调整系数

      estimatedCpuUsage += memoryBasedEstimate * 0.4; // 40%权重
    }

    // 2. 基于帧率的估算部分
    if (this.frameRateHistory.length > 0) {
      const avgFps =
        this.frameRateHistory.reduce((sum, fps) => sum + fps, 0) /
        this.frameRateHistory.length;
      const fpsRatio = Math.max(
        0,
        Math.min(1, avgFps / this.TARGET_FRAME_RATE)
      );
      const fpsBasedEstimate = (1 - fpsRatio) * 100; // 帧率下降表示CPU压力增加

      estimatedCpuUsage += fpsBasedEstimate * 0.6; // 60%权重
    }

    // 3. 如果浏览器支持PerformanceObserver API，考虑长任务影响
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      // 检测到长任务时适当增加CPU使用率估计
      // 实现略 - 完整实现需要设置PerformanceObserver
    }

    // 确保值在合理范围内
    return Math.max(0, Math.min(100, estimatedCpuUsage));
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
