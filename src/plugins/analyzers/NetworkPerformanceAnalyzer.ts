/**
 * NetworkPerformanceAnalyzer - 网络性能分析器
 *
 * 功能：
 * 1. 速度样本收集与分析
 * 2. RTT样本收集与分析
 * 3. 丢包率估算
 * 4. 网络趋势分析
 * 5. 网络抖动检测
 */

import { Logger } from '../../utils/Logger';

// 定义网络速度采样数据结构
export interface SpeedSample {
  timestamp: number;
  bytesTransferred: number;
  duration: number;
  speed: number; // bytes/s
  chunkSize?: number; // 分片大小
  success: boolean; // 上传是否成功
  latency?: number; // 请求延迟时间
}

export interface NetworkPerformanceStats {
  currentSpeed: number; // bytes/s
  avgSpeed: number; // bytes/s
  peakSpeed: number; // bytes/s
  jitterValue: number;
  isNetworkStable: boolean;
  packetLossRate: number;
  rttVariation: number;
  networkTrend: 'improving' | 'degrading' | 'stable';
}

export class NetworkPerformanceAnalyzer {
  private speedSamples: SpeedSample[] = [];
  private maxSpeedSamples: number;
  private rttSamples: number[] = [];
  private maxRttSamples: number;
  private latencyHistory: number[] = [];
  private totalBytesTransferred = 0;
  private samplingStartTime = 0;
  private lastSampleTime = 0;
  private currentSpeed = 0; // bytes/s
  private avgSpeed = 0; // bytes/s
  private peakSpeed = 0; // bytes/s
  private jitterValue = 0;
  private isNetworkStable = false;
  private consecutiveStableReadings = 0;
  private stableReadingsThreshold: number;
  private packetLossRate = 0;
  private rttVariation = 0;
  private networkTrend: 'improving' | 'degrading' | 'stable' = 'stable';
  private logger: Logger;
  private chunkStartTimes = new Map<
    string,
    { startTime: number; chunkId: string; size: number }
  >();

  constructor(options?: {
    maxSpeedSamples?: number;
    maxRttSamples?: number;
    stableReadingsThreshold?: number;
  }) {
    this.maxSpeedSamples = options?.maxSpeedSamples ?? 15;
    this.maxRttSamples = options?.maxRttSamples ?? 10;
    this.stableReadingsThreshold = options?.stableReadingsThreshold ?? 3;
    this.samplingStartTime = Date.now();
    this.lastSampleTime = Date.now();
    this.logger = new Logger('NetworkPerformanceAnalyzer');
  }

  /**
   * 记录传输数据
   */
  public recordTransfer(
    bytes: number,
    success: boolean,
    duration?: number
  ): void {
    const now = Date.now();
    const transferDuration = duration || now - this.lastSampleTime;

    // 更新总传输字节数
    this.totalBytesTransferred += bytes;

    // 计算此次传输速度 (bytes/s)
    const speed = transferDuration > 0 ? (bytes / transferDuration) * 1000 : 0;

    // 添加样本
    this.speedSamples.push({
      timestamp: now,
      bytesTransferred: bytes,
      duration: transferDuration,
      speed,
      success,
    });

    // 限制样本数量
    if (this.speedSamples.length > this.maxSpeedSamples) {
      this.speedSamples.shift();
    }

    // 更新最后采样时间
    this.lastSampleTime = now;
  }

  /**
   * 更新RTT样本
   */
  public updateRTTSample(rtt: number): void {
    // 添加RTT样本
    this.rttSamples.push(rtt);

    // 限制样本数量
    if (this.rttSamples.length > this.maxRttSamples) {
      this.rttSamples.shift();
    }

    // 计算抖动
    if (this.rttSamples.length >= 2) {
      const lastRtt = this.rttSamples[this.rttSamples.length - 2];
      const currentRtt = this.rttSamples[this.rttSamples.length - 1];
      const currentJitter = Math.abs(currentRtt - lastRtt);

      // 指数移动平均更新抖动值
      if (this.jitterValue === 0) {
        this.jitterValue = currentJitter;
      } else {
        this.jitterValue = this.jitterValue * 0.7 + currentJitter * 0.3;
      }
    }

    // 更新RTT变化率
    this.rttVariation = this.calculateRTTVariation();
  }

  /**
   * 计算当前速度
   */
  public calculateCurrentSpeed(): void {
    const now = Date.now();
    const sampleWindow = 5000; // 5秒窗口
    const minTime = now - sampleWindow;

    // 过滤出窗口内的样本
    const recentSamples = this.speedSamples.filter(
      sample => sample.timestamp >= minTime
    );

    // 如果没有足够的样本，保持当前速度
    if (recentSamples.length < 2) return;

    // 计算窗口内的总传输字节数和时间
    const totalBytes = recentSamples.reduce(
      (sum, sample) => sum + sample.bytesTransferred,
      0
    );
    const startTime = Math.min(...recentSamples.map(s => s.timestamp));
    const endTime = Math.max(...recentSamples.map(s => s.timestamp));
    const totalTime = endTime - startTime;

    // 计算平均速度 (bytes/s)
    if (totalTime > 0) {
      this.currentSpeed = (totalBytes / totalTime) * 1000;

      // 更新平均速度 (指数移动平均)
      if (this.avgSpeed === 0) {
        this.avgSpeed = this.currentSpeed;
      } else {
        this.avgSpeed = this.avgSpeed * 0.7 + this.currentSpeed * 0.3;
      }

      // 更新峰值速度
      if (this.currentSpeed > this.peakSpeed) {
        this.peakSpeed = this.currentSpeed;
      }
    }
  }

  /**
   * 检查网络稳定性
   */
  public checkNetworkStability(): boolean {
    if (this.speedSamples.length < this.stableReadingsThreshold) {
      this.isNetworkStable = false;
      return false;
    }

    // 获取最近的几个样本
    const recentSamples = this.speedSamples.slice(
      -this.stableReadingsThreshold
    );
    const speeds = recentSamples.map(s => s.speed);

    // 计算平均速度和标准差
    const avgSpeed =
      speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
    const variance =
      speeds.reduce((sum, speed) => sum + Math.pow(speed - avgSpeed, 2), 0) /
      speeds.length;
    const stdDev = Math.sqrt(variance);

    // 计算变异系数 (标准差/平均值)
    const cv = avgSpeed > 0 ? stdDev / avgSpeed : 1;

    // 如果变异系数小于阈值，则认为网络稳定
    const stable = cv < 0.3; // 30%的变异被认为是稳定的

    // 如果网络稳定状态发生变化，记录连续稳定读数
    if (stable !== this.isNetworkStable) {
      this.consecutiveStableReadings = stable ? 1 : 0;
    } else if (stable) {
      this.consecutiveStableReadings++;
    }

    // 只有在连续多次读数都稳定时才更新状态
    if (this.consecutiveStableReadings >= this.stableReadingsThreshold) {
      if (!this.isNetworkStable) {
        this.isNetworkStable = true;
        this.logger.info('网络已稳定');
      }
    } else if (!stable && this.isNetworkStable) {
      this.isNetworkStable = false;
      this.logger.info('网络不稳定');
    }

    return this.isNetworkStable;
  }

  /**
   * 分析网络趋势
   */
  public analyzeNetworkTrends(): void {
    // 至少需要3个样本才能分析趋势
    if (this.speedSamples.length < 3) return;

    // 获取最近3个样本
    const recentSamples = this.speedSamples.slice(-3);

    // 计算下载速度变化率
    const speedChanges = [];
    for (let i = 1; i < recentSamples.length; i++) {
      const prevSpeed = recentSamples[i - 1].speed;
      const currentSpeed = recentSamples[i].speed;

      if (prevSpeed > 0) {
        speedChanges.push(currentSpeed / prevSpeed);
      }
    }

    // 如果没有有效的变化率，无法分析趋势
    if (speedChanges.length === 0) return;

    // 计算平均变化率
    const avgChangeRate =
      speedChanges.reduce((sum, rate) => sum + rate, 0) / speedChanges.length;

    // 确定趋势
    const previousTrend = this.networkTrend;

    // 判断趋势
    if (avgChangeRate > 1.2) {
      // 速度提升20%以上
      this.networkTrend = 'improving';
    } else if (avgChangeRate < 0.8) {
      // 速度下降20%以上
      this.networkTrend = 'degrading';
    } else {
      this.networkTrend = 'stable';
    }

    // 如果趋势发生变化，记录日志
    if (previousTrend !== this.networkTrend) {
      this.logger.debug('网络趋势变化', {
        from: previousTrend,
        to: this.networkTrend,
        avgChangeRate,
      });
    }
  }

  /**
   * 计算最近失败率
   */
  public calculateRecentFailureRate(): number {
    // 检查是否有足够的样本
    if (this.speedSamples.length < 5) return 0;

    // 获取最近的10个样本或全部样本
    const recentSamples = this.speedSamples.slice(
      -Math.min(10, this.speedSamples.length)
    );

    // 计算失败率
    const totalSamples = recentSamples.length;
    const failedSamples = recentSamples.filter(
      sample => !sample.success
    ).length;

    return totalSamples > 0 ? failedSamples / totalSamples : 0;
  }

  /**
   * 计算成功率
   */
  public calculateSuccessRate(): number {
    return 1 - this.calculateRecentFailureRate();
  }

  /**
   * 估算丢包率
   */
  public estimatePacketLossRate(): void {
    // 简单估算丢包率，与(1-成功率)相关但不完全等同
    // 网络传输通常有重试机制，所以丢包率往往低于失败率
    const successRate = this.calculateSuccessRate();
    this.packetLossRate = Math.max(0, Math.min(1, (1 - successRate) * 0.7));
  }

  /**
   * 计算RTT变化幅度
   */
  private calculateRTTVariation(): number {
    if (this.rttSamples.length < 3) return 0;

    // 计算最近几个样本的变化率
    const recentSamples = this.rttSamples.slice(-3);
    const variation = Math.max(...recentSamples) - Math.min(...recentSamples);

    return variation;
  }

  /**
   * 计算平均RTT
   */
  public calculateAvgRTT(): number {
    if (this.rttSamples.length === 0) return 0;
    return (
      this.rttSamples.reduce((sum, rtt) => sum + rtt, 0) /
      this.rttSamples.length
    );
  }

  /**
   * 计算RTT趋势
   */
  public calculateRTTTrend(): 'stable' | 'increasing' | 'decreasing' {
    if (this.rttSamples.length < 3) return 'stable';

    // 获取最近的几个样本
    const recentSamples = this.rttSamples.slice(-3);
    const diffs = [];

    // 计算相邻样本的差值
    for (let i = 1; i < recentSamples.length; i++) {
      diffs.push(recentSamples[i] - recentSamples[i - 1]);
    }

    // 计算平均差值
    const avgDiff = diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;

    // 根据平均差值判断趋势
    if (avgDiff > 10) {
      return 'increasing';
    } else if (avgDiff < -10) {
      return 'decreasing';
    } else {
      return 'stable';
    }
  }

  /**
   * 获取所有性能指标
   */
  public getPerformanceStats(): NetworkPerformanceStats {
    return {
      currentSpeed: this.currentSpeed,
      avgSpeed: this.avgSpeed,
      peakSpeed: this.peakSpeed,
      jitterValue: this.jitterValue,
      isNetworkStable: this.isNetworkStable,
      packetLossRate: this.packetLossRate,
      rttVariation: this.rttVariation,
      networkTrend: this.networkTrend,
    };
  }

  /**
   * 获取RTT样本列表
   */
  public getRTTSamples(): number[] {
    return [...this.rttSamples];
  }

  /**
   * 获取速度样本
   */
  public getSpeedSamples(): SpeedSample[] {
    return [...this.speedSamples];
  }

  /**
   * 重置所有样本数据
   */
  public reset(): void {
    this.speedSamples = [];
    this.rttSamples = [];
    this.totalBytesTransferred = 0;
    this.samplingStartTime = Date.now();
    this.lastSampleTime = Date.now();
    this.currentSpeed = 0;
    this.avgSpeed = 0;
    this.peakSpeed = 0;
    this.jitterValue = 0;
    this.packetLossRate = 0;
    this.rttVariation = 0;
    this.logger.info('网络性能分析器已重置');
  }

  /**
   * 记录分片开始上传
   * @param data 分片数据
   */
  public recordChunkStart(data: any): void {
    // 存储开始时间，用于后续计算RTT
    if (data.chunkId && typeof data.chunkId === 'string') {
      this.chunkStartTimes.set(data.chunkId, {
        startTime: Date.now(),
        chunkId: data.chunkId,
        size: data.size || 0,
      });
    }
  }

  /**
   * 记录分片上传成功
   * @param data 分片数据
   */
  public recordChunkSuccess(data: any): void {
    if (data.chunkId) {
      const chunkInfo = this.chunkStartTimes.get(data.chunkId);
      if (chunkInfo) {
        const uploadTime = Date.now() - chunkInfo.startTime;
        data.startTime = chunkInfo.startTime;
        data.uploadTime = uploadTime;

        // 更新RTT样本
        this.updateRTTSample(uploadTime);
        this.chunkStartTimes.delete(data.chunkId);
      }
    }
  }

  /**
   * 记录分片上传错误
   * @param data 分片数据
   */
  public recordChunkError(data: any): void {
    if (data.chunkId) {
      this.chunkStartTimes.delete(data.chunkId);
    }
  }

  /**
   * 获取分片上传时间
   * @param data 分片数据
   * @returns 上传时间（毫秒）
   */
  public getChunkUploadTime(data: any): number | null {
    if (data.chunkId) {
      const chunkInfo = this.chunkStartTimes.get(data.chunkId);
      if (chunkInfo) {
        return Date.now() - chunkInfo.startTime;
      }
    }
    return null;
  }

  /**
   * 更新网络性能
   */
  public updateNetworkPerformance(): void {
    this.checkNetworkStability();
    this.analyzeNetworkTrends();
    this.detectExtremeNetworkConditions();
  }

  /**
   * 检测极端网络条件
   */
  public detectExtremeNetworkConditions(): boolean {
    // 检测高丢包率
    const hasHighPacketLoss = this.packetLossRate > 0.15;

    // 检测高延迟变化
    const hasHighLatencyVariation = this.rttVariation > 200;

    // 检测极差网络
    const hasExtremelyPoorConnection =
      this.calculateAvgRTT() > 1000 || this.currentSpeed < 20 * 1024; // 20KB/s以下视为极差网络

    // 检测网络抖动
    const hasHighJitter = this.jitterValue > 100;

    // 如果任一条件满足，则认为是极端网络条件
    return (
      hasHighPacketLoss ||
      hasHighLatencyVariation ||
      hasExtremelyPoorConnection ||
      hasHighJitter
    );
  }

  /**
   * 当前网络是否稳定
   */
  public isNetworkStable(): boolean {
    return this.isNetworkStable;
  }
}
