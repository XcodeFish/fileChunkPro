/**
 * NetworkQualityEvaluator - 网络质量评估器
 *
 * 功能：
 * 1. 基于多维指标评估网络质量
 * 2. 网络质量等级分类
 * 3. 网络质量分数计算
 * 4. 网络连接稳定性评估
 */

import { NetworkQuality, NetworkType } from '../types/network';
import { Logger } from '../utils/Logger';

export interface NetworkQualityMetrics {
  networkType: NetworkType; // 网络类型
  downloadSpeed: number; // 下载速度 (KB/s)
  latency: number; // 延迟 (ms)
  latencyVariation: number; // 延迟变化/抖动 (ms)
  recentConnectionChanges: number; // 最近连接变化次数
  recentDisconnections: number; // 最近断连次数
  packetLoss?: number; // 丢包率 (0-1)
}

export class NetworkQualityEvaluator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('NetworkQualityEvaluator');
  }

  /**
   * 评估网络质量
   * @param metrics 网络质量指标
   * @returns 网络质量枚举值
   */
  public evaluateNetworkQuality(
    metrics: NetworkQualityMetrics
  ): NetworkQuality {
    // 计算综合分数
    const qualityScore = this.calculateQualityScore(metrics);

    this.logger.debug('网络质量得分计算', {
      qualityScore,
      networkType: metrics.networkType,
      downloadSpeed: metrics.downloadSpeed,
      latency: metrics.latency,
    });

    // 根据综合分数返回网络质量级别
    return this.mapScoreToQuality(qualityScore);
  }

  /**
   * 根据分数映射到网络质量枚举
   * @param score 质量分数 (0-100)
   * @returns 网络质量枚举值
   */
  private mapScoreToQuality(score: number): NetworkQuality {
    if (score >= 90) {
      return NetworkQuality.EXCELLENT;
    } else if (score >= 70) {
      return NetworkQuality.GOOD;
    } else if (score >= 50) {
      return NetworkQuality.FAIR;
    } else if (score >= 30) {
      return NetworkQuality.POOR;
    } else if (score > 0) {
      return NetworkQuality.VERY_POOR;
    } else {
      return NetworkQuality.UNUSABLE;
    }
  }

  /**
   * 计算网络质量分数
   * @param metrics 网络质量指标
   * @returns 质量分数 (0-100)
   */
  private calculateQualityScore(metrics: NetworkQualityMetrics): number {
    let qualityScore = 0;

    // 1. 网络类型权重
    const networkTypeScore = this.calculateNetworkTypeScore(
      metrics.networkType
    );
    qualityScore += networkTypeScore;

    // 2. 下载速度权重 (最大30分)
    const speedScore = this.calculateSpeedScore(metrics.downloadSpeed);
    qualityScore += speedScore;

    // 3. 延迟权重 (最大30分)
    const latencyScore = this.calculateLatencyScore(metrics.latency);
    qualityScore += latencyScore;

    // 4. 抖动权重 (最大20分)
    const jitterScore = this.calculateJitterScore(metrics.latencyVariation);
    qualityScore += jitterScore;

    // 5. 连接稳定性 (最大20分，扣分制)
    const stabilityPenalty = this.calculateStabilityPenalty(
      metrics.recentConnectionChanges,
      metrics.recentDisconnections
    );
    qualityScore -= stabilityPenalty;

    // 6. 丢包率权重 (如果有)
    if (metrics.packetLoss !== undefined) {
      const packetLossScore = this.calculatePacketLossScore(metrics.packetLoss);
      qualityScore -= packetLossScore;
    }

    // 确保分数在有效范围内
    return Math.max(0, Math.min(100, qualityScore));
  }

  /**
   * 计算网络类型得分
   * @param networkType 网络类型
   * @returns 网络类型得分
   */
  private calculateNetworkTypeScore(networkType: NetworkType): number {
    switch (networkType) {
      case NetworkType.ETHERNET:
        return 100;
      case NetworkType.WIFI:
        return 90;
      case NetworkType.CELLULAR_5G:
        return 85;
      case NetworkType.CELLULAR_4G:
        return 70;
      case NetworkType.CELLULAR_3G:
        return 50;
      case NetworkType.CELLULAR_2G:
        return 30;
      case NetworkType.NONE:
        return 0;
      default:
        return 40; // 未知类型给予中等权重
    }
  }

  /**
   * 计算下载速度得分
   * @param downloadSpeed 下载速度(KB/s)
   * @returns 速度得分(0-30)
   */
  private calculateSpeedScore(downloadSpeed: number): number {
    if (downloadSpeed >= 10000) {
      // >= 10MB/s
      return 30;
    } else if (downloadSpeed >= 5000) {
      // >= 5MB/s
      return 25;
    } else if (downloadSpeed >= 1000) {
      // >= 1MB/s
      return 20;
    } else if (downloadSpeed >= 500) {
      // >= 500KB/s
      return 15;
    } else if (downloadSpeed >= 100) {
      // >= 100KB/s
      return 10;
    } else if (downloadSpeed >= 50) {
      // >= 50KB/s
      return 5;
    } else {
      return 0;
    }
  }

  /**
   * 计算延迟得分
   * @param latency 延迟时间(ms)
   * @returns 延迟得分(0-30)
   */
  private calculateLatencyScore(latency: number): number {
    if (latency < 50) {
      // < 50ms
      return 30;
    } else if (latency < 100) {
      // < 100ms
      return 25;
    } else if (latency < 200) {
      // < 200ms
      return 20;
    } else if (latency < 300) {
      // < 300ms
      return 15;
    } else if (latency < 500) {
      // < 500ms
      return 10;
    } else if (latency < 1000) {
      // < 1000ms
      return 5;
    } else {
      return 0;
    }
  }

  /**
   * 计算抖动得分
   * @param jitter 抖动值(ms)
   * @returns 抖动得分(0-20)
   */
  private calculateJitterScore(jitter: number): number {
    if (jitter < 10) {
      return 20;
    } else if (jitter < 20) {
      return 15;
    } else if (jitter < 50) {
      return 10;
    } else if (jitter < 100) {
      return 5;
    } else {
      return 0;
    }
  }

  /**
   * 计算稳定性惩罚分数
   * @param connectionChanges 连接变化次数
   * @param disconnections 断连次数
   * @returns 稳定性惩罚分数(0-20)
   */
  private calculateStabilityPenalty(
    connectionChanges: number,
    disconnections: number
  ): number {
    // 网络类型变化惩罚
    const typeChangePenalty = Math.min(connectionChanges * 5, 10);

    // 断连惩罚
    const disconnectionPenalty = Math.min(disconnections * 10, 20);

    return typeChangePenalty + disconnectionPenalty;
  }

  /**
   * 计算丢包率惩罚分数
   * @param packetLoss 丢包率(0-1)
   * @returns 丢包率惩罚分数(0-30)
   */
  private calculatePacketLossScore(packetLoss: number): number {
    if (packetLoss < 0.01) {
      // < 1%
      return 0;
    } else if (packetLoss < 0.05) {
      // < 5%
      return 5;
    } else if (packetLoss < 0.1) {
      // < 10%
      return 10;
    } else if (packetLoss < 0.2) {
      // < 20%
      return 20;
    } else {
      // >= 20%
      return 30;
    }
  }

  /**
   * 判断网络是否可用于上传
   * @param quality 网络质量
   * @returns 是否可用于上传
   */
  public static isNetworkUsableForUpload(quality: NetworkQuality): boolean {
    return quality !== NetworkQuality.UNUSABLE;
  }

  /**
   * 判断网络是否稳定
   * @param quality 网络质量
   * @returns 是否稳定
   */
  public static isNetworkStable(quality: NetworkQuality): boolean {
    return (
      quality === NetworkQuality.EXCELLENT || quality === NetworkQuality.GOOD
    );
  }

  /**
   * 获取网络质量的描述
   * @param quality 网络质量
   * @returns 网络质量描述
   */
  public static getQualityDescription(quality: NetworkQuality): string {
    switch (quality) {
      case NetworkQuality.EXCELLENT:
        return '极佳网络';
      case NetworkQuality.GOOD:
        return '良好网络';
      case NetworkQuality.FAIR:
        return '一般网络';
      case NetworkQuality.POOR:
        return '较差网络';
      case NetworkQuality.VERY_POOR:
        return '非常差的网络';
      case NetworkQuality.UNUSABLE:
        return '无法使用的网络';
      default:
        return '未知网络质量';
    }
  }
}

export default NetworkQualityEvaluator;
