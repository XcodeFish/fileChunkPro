/**
 * NetworkStabilityAnalyzer - 网络稳定性分析器
 *
 * 功能：
 * 1. 分析网络连接稳定性
 * 2. 检测网络波动和抖动
 * 3. 记录网络变化历史
 * 4. 计算网络质量趋势
 */

import { Logger } from '../utils/Logger';
import { NetworkQuality, NetworkType } from '../types/network';

export interface ConnectionEvent {
  timestamp: number;
  type: 'online' | 'offline' | 'quality_change' | 'type_change';
  previousQuality?: NetworkQuality;
  newQuality?: NetworkQuality;
  previousType?: NetworkType;
  newType?: NetworkType;
  isStable?: boolean;
}

export interface NetworkStabilityMetrics {
  jitter: number; // 网络抖动值，单位ms
  qualityChanges: number; // 最近质量变化次数
  typeChanges: number; // 最近网络类型变化次数
  disconnections: number; // 最近断网次数
  stabilityScore: number; // 稳定性得分(0-100)
  isStable: boolean; // 是否稳定
  trend: 'improving' | 'stable' | 'degrading'; // 趋势
  averageQualityLevel: number; // 平均质量水平
}

export class NetworkStabilityAnalyzer {
  private logger: Logger;

  // 连接事件历史
  private connectionEvents: ConnectionEvent[] = [];

  // 最大事件历史记录数
  private readonly MAX_HISTORY_EVENTS = 100;

  // RTT样本，用于计算抖动
  private rttSamples: number[] = [];
  private readonly MAX_RTT_SAMPLES = 50;

  // 质量变化阈值（超过多少次才认为不稳定）
  private readonly QUALITY_CHANGE_THRESHOLD = 3;

  // 分析窗口时间（毫秒）
  private readonly ANALYSIS_WINDOW_MS = 3 * 60 * 1000; // 3分钟

  constructor() {
    this.logger = new Logger('NetworkStabilityAnalyzer');
  }

  /**
   * 记录连接事件
   * @param event 连接事件
   */
  public recordConnectionEvent(event: ConnectionEvent): void {
    // 添加到历史记录
    this.connectionEvents.push(event);

    // 如果超出最大记录数，移除最早的记录
    if (this.connectionEvents.length > this.MAX_HISTORY_EVENTS) {
      this.connectionEvents.shift();
    }

    this.logger.debug('记录网络连接事件', {
      type: event.type,
      previousQuality: event.previousQuality,
      newQuality: event.newQuality,
      previousType: event.previousType,
      newType: event.newType,
    });

    // 分析稳定性
    const stabilityMetrics = this.analyzeStability();
    if (!stabilityMetrics.isStable) {
      this.logger.warn('网络不稳定', stabilityMetrics);
    }
  }

  /**
   * 记录RTT样本
   * @param rtt RTT值（毫秒）
   */
  public recordRTTSample(rtt: number): void {
    this.rttSamples.push(rtt);

    // 如果超出最大样本数，移除最早的样本
    if (this.rttSamples.length > this.MAX_RTT_SAMPLES) {
      this.rttSamples.shift();
    }
  }

  /**
   * 分析网络稳定性
   * @returns 稳定性指标
   */
  public analyzeStability(): NetworkStabilityMetrics {
    // 获取分析时间窗口内的事件
    const now = Date.now();
    const recentEvents = this.connectionEvents.filter(
      event => event.timestamp > now - this.ANALYSIS_WINDOW_MS
    );

    // 计算各类型事件数量
    const qualityChanges = recentEvents.filter(
      event => event.type === 'quality_change'
    ).length;

    const typeChanges = recentEvents.filter(
      event => event.type === 'type_change'
    ).length;

    const disconnections = recentEvents.filter(
      event => event.type === 'offline'
    ).length;

    // 计算抖动
    const jitter = this.calculateJitter();

    // 计算稳定性得分
    const stabilityScore = this.calculateStabilityScore(
      qualityChanges,
      typeChanges,
      disconnections,
      jitter
    );

    // 判断趋势
    const trend = this.detectNetworkTrend(recentEvents);

    // 计算平均质量水平
    const averageQualityLevel = this.calculateAverageQuality(recentEvents);

    // 判断是否稳定
    const isStable = stabilityScore > 70 && disconnections === 0;

    return {
      jitter,
      qualityChanges,
      typeChanges,
      disconnections,
      stabilityScore,
      isStable,
      trend,
      averageQualityLevel,
    };
  }

  /**
   * 计算网络抖动
   * @returns 抖动值（毫秒）
   */
  private calculateJitter(): number {
    if (this.rttSamples.length < 2) {
      return 0;
    }

    // 计算相邻RTT样本的差值的平均值
    let totalDiff = 0;
    for (let i = 1; i < this.rttSamples.length; i++) {
      totalDiff += Math.abs(this.rttSamples[i] - this.rttSamples[i - 1]);
    }

    return totalDiff / (this.rttSamples.length - 1);
  }

  /**
   * 计算稳定性得分
   * @returns 稳定性得分(0-100)
   */
  private calculateStabilityScore(
    qualityChanges: number,
    typeChanges: number,
    disconnections: number,
    jitter: number
  ): number {
    // 基础分数
    let score = 100;

    // 质量变化扣分
    score -= qualityChanges * 5;

    // 网络类型变化扣分
    score -= typeChanges * 10;

    // 断网扣分（严重惩罚）
    score -= disconnections * 25;

    // 抖动扣分
    if (jitter < 5) {
      score -= 0;
    } else if (jitter < 15) {
      score -= 5;
    } else if (jitter < 30) {
      score -= 10;
    } else if (jitter < 50) {
      score -= 15;
    } else {
      score -= 20;
    }

    // 确保分数在合理范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 检测网络趋势
   * @param events 连接事件
   * @returns 网络趋势
   */
  private detectNetworkTrend(
    events: ConnectionEvent[]
  ): 'improving' | 'stable' | 'degrading' {
    if (events.length < 3) {
      return 'stable';
    }

    // 仅考虑质量变化事件
    const qualityChangeEvents = events
      .filter(event => event.type === 'quality_change')
      .sort((a, b) => a.timestamp - b.timestamp);

    if (qualityChangeEvents.length < 2) {
      return 'stable';
    }

    // 计算质量变化方向
    let improvingCount = 0;
    let degradingCount = 0;

    for (let i = 1; i < qualityChangeEvents.length; i++) {
      const prev = qualityChangeEvents[i - 1];
      const curr = qualityChangeEvents[i];

      if (prev.newQuality !== undefined && curr.newQuality !== undefined) {
        if (curr.newQuality < prev.newQuality) {
          improvingCount++; // 较小的枚举值表示较好的网络质量
        } else if (curr.newQuality > prev.newQuality) {
          degradingCount++;
        }
      }
    }

    // 判断趋势
    const total = improvingCount + degradingCount;
    if (total < 2) {
      return 'stable';
    } else if (improvingCount / total > 0.6) {
      return 'improving';
    } else if (degradingCount / total > 0.6) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  /**
   * 计算平均网络质量
   * @param events 连接事件
   * @returns 平均质量水平
   */
  private calculateAverageQuality(events: ConnectionEvent[]): number {
    const qualityEvents = events.filter(
      event => event.type === 'quality_change' && event.newQuality !== undefined
    );

    if (qualityEvents.length === 0) {
      return 2; // 默认为FAIR
    }

    // 计算平均质量值
    const total = qualityEvents.reduce(
      (sum, event) => sum + (event.newQuality as number),
      0
    );

    return total / qualityEvents.length;
  }

  /**
   * 获取稳定性描述
   * @param metrics 稳定性指标
   * @returns 稳定性描述文本
   */
  public getStabilityDescription(metrics: NetworkStabilityMetrics): string {
    if (metrics.stabilityScore > 90) {
      return '网络非常稳定';
    } else if (metrics.stabilityScore > 75) {
      return '网络稳定';
    } else if (metrics.stabilityScore > 50) {
      return '网络较稳定';
    } else if (metrics.stabilityScore > 30) {
      return '网络不稳定';
    } else {
      return '网络极不稳定';
    }
  }

  /**
   * 判断当前网络是否适合大文件上传
   * @returns 是否适合上传大文件
   */
  public isSuitableForLargeFileUpload(): boolean {
    const metrics = this.analyzeStability();
    return metrics.isStable && metrics.stabilityScore > 60;
  }

  /**
   * 获取连接事件历史
   * @returns 连接事件数组
   */
  public getConnectionHistory(): ConnectionEvent[] {
    return [...this.connectionEvents];
  }

  /**
   * 清除历史记录
   */
  public clearHistory(): void {
    this.connectionEvents = [];
    this.rttSamples = [];
    this.logger.debug('已清除网络稳定性历史记录');
  }
}

export default NetworkStabilityAnalyzer;
