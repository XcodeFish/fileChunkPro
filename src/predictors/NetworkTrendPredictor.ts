/**
 * NetworkTrendPredictor - 网络趋势预测器
 *
 * 功能：
 * 1. 预测未来网络质量变化趋势
 * 2. 分析历史网络性能数据
 * 3. 提供网络优化建议
 * 4. 检测周期性网络波动
 */

import { Logger } from '../utils/Logger';
import { NetworkQuality } from '../types/network';
import { ConnectionEvent } from '../analyzers/NetworkStabilityAnalyzer';
import { SpeedSample } from '../monitors/NetworkSpeedMonitor';

export interface NetworkPrediction {
  expectedQuality: NetworkQuality; // 预期网络质量
  confidenceLevel: number; // 置信度 (0-1)
  expectedLatency: number; // 预期延迟(ms)
  expectedSpeed: number; // 预期速度(KB/s)
  predictionTimestamp: number; // 预测生成时间
  forTimePeriod: number; // 预测有效时间(ms)
}

export interface PeriodicalPattern {
  exists: boolean; // 是否存在周期性
  intervalMs?: number; // 周期间隔(ms)
  confidence: number; // 置信度(0-1)
  patternType?: 'daily' | 'hourly' | 'custom'; // 周期类型
}

export class NetworkTrendPredictor {
  private logger: Logger;

  // 网络质量历史
  private qualityHistory: Array<{
    quality: NetworkQuality;
    timestamp: number;
  }> = [];

  // 速度样本历史
  private speedHistory: SpeedSample[] = [];

  // 上次预测结果
  private lastPrediction: NetworkPrediction | null = null;

  // 预测窗口(ms)
  private readonly PREDICTION_WINDOW = 5 * 60 * 1000; // 5分钟

  // 最大历史记录数
  private readonly MAX_HISTORY = 200;

  constructor() {
    this.logger = new Logger('NetworkTrendPredictor');
  }

  /**
   * 记录网络质量变化
   * @param quality 网络质量
   * @param timestamp 时间戳
   */
  public recordNetworkQuality(
    quality: NetworkQuality,
    timestamp = Date.now()
  ): void {
    this.qualityHistory.push({ quality, timestamp });

    // 控制历史记录大小
    if (this.qualityHistory.length > this.MAX_HISTORY) {
      this.qualityHistory.shift();
    }
  }

  /**
   * 记录网络连接事件
   * @param events 连接事件
   */
  public recordConnectionEvents(events: ConnectionEvent[]): void {
    // 提取质量变化事件
    for (const event of events) {
      if (event.type === 'quality_change' && event.newQuality !== undefined) {
        this.recordNetworkQuality(event.newQuality, event.timestamp);
      }
    }
  }

  /**
   * 记录速度样本
   * @param samples 速度样本
   */
  public recordSpeedSamples(samples: SpeedSample[]): void {
    this.speedHistory.push(...samples);

    // 控制历史记录大小
    if (this.speedHistory.length > this.MAX_HISTORY) {
      this.speedHistory = this.speedHistory.slice(-this.MAX_HISTORY);
    }
  }

  /**
   * 预测未来网络质量
   * @param predictionPeriodMs 预测时间长度(ms)
   * @returns 网络预测结果
   */
  public predictNetworkQuality(
    predictionPeriodMs = 5 * 60 * 1000
  ): NetworkPrediction {
    // 如果没有足够的历史数据，返回保守预测
    if (this.qualityHistory.length < 5) {
      const currentQuality = this.getCurrentQuality();
      return {
        expectedQuality: currentQuality,
        confidenceLevel: 0.5,
        expectedLatency: this.predictLatency(),
        expectedSpeed: this.predictSpeed(),
        predictionTimestamp: Date.now(),
        forTimePeriod: predictionPeriodMs,
      };
    }

    // 检测周期性
    const periodicalPattern = this.detectPeriodicalPattern();

    // 如果存在强烈的周期性，使用周期预测
    if (periodicalPattern.exists && periodicalPattern.confidence > 0.7) {
      return this.predictByPeriodicalPattern(
        periodicalPattern,
        predictionPeriodMs
      );
    }

    // 检测趋势
    const trend = this.detectTrend();

    // 获取当前质量
    const currentQuality = this.getCurrentQuality();

    // 根据趋势预测质量
    let expectedQuality = currentQuality;
    let confidenceLevel = 0.6;

    if (trend === 'improving' && currentQuality > NetworkQuality.EXCELLENT) {
      expectedQuality = currentQuality - 1;
      confidenceLevel = 0.65;
    } else if (
      trend === 'degrading' &&
      currentQuality < NetworkQuality.UNUSABLE
    ) {
      expectedQuality = currentQuality + 1;
      confidenceLevel = 0.65;
    } else if (trend === 'stable') {
      confidenceLevel = 0.8;
    }

    // 创建预测结果
    const prediction: NetworkPrediction = {
      expectedQuality,
      confidenceLevel,
      expectedLatency: this.predictLatency(),
      expectedSpeed: this.predictSpeed(),
      predictionTimestamp: Date.now(),
      forTimePeriod: predictionPeriodMs,
    };

    this.lastPrediction = prediction;

    this.logger.debug('网络趋势预测', {
      trend,
      expectedQuality,
      confidenceLevel,
      expectedLatency: Math.round(prediction.expectedLatency) + 'ms',
      expectedSpeed: Math.round(prediction.expectedSpeed) + 'KB/s',
    });

    return prediction;
  }

  /**
   * 根据周期性预测网络质量
   * @param pattern 周期模式
   * @param predictionPeriodMs 预测时间长度
   * @returns 基于周期的预测
   */
  private predictByPeriodicalPattern(
    pattern: PeriodicalPattern,
    predictionPeriodMs: number
  ): NetworkPrediction {
    if (!pattern.intervalMs) {
      return this.predictNetworkQualityByTrend(predictionPeriodMs);
    }

    // 找到最匹配的历史周期
    const now = Date.now();
    const targetTime = now + predictionPeriodMs;
    const timeDiff = targetTime % pattern.intervalMs!;

    // 查找历史上相似时间点的网络质量
    const similarTimePoints = this.qualityHistory
      .filter(
        item =>
          Math.abs((item.timestamp % pattern.intervalMs!) - timeDiff) <
          5 * 60 * 1000
      )
      .sort(
        (a, b) =>
          Math.abs((a.timestamp % pattern.intervalMs!) - timeDiff) -
          Math.abs((b.timestamp % pattern.intervalMs!) - timeDiff)
      );

    if (similarTimePoints.length > 0) {
      // 使用最相似时间点的质量和增强置信度
      return {
        expectedQuality: similarTimePoints[0].quality,
        confidenceLevel: Math.min(0.9, pattern.confidence + 0.1),
        expectedLatency: this.predictLatency(),
        expectedSpeed: this.predictSpeed(),
        predictionTimestamp: now,
        forTimePeriod: predictionPeriodMs,
      };
    } else {
      // 回退到趋势预测
      return this.predictNetworkQualityByTrend(predictionPeriodMs);
    }
  }

  /**
   * 根据趋势预测网络质量
   */
  private predictNetworkQualityByTrend(
    predictionPeriodMs: number
  ): NetworkPrediction {
    // 检测趋势
    const trend = this.detectTrend();

    // 获取当前质量
    const currentQuality = this.getCurrentQuality();

    // 根据趋势预测质量
    let expectedQuality = currentQuality;
    let confidenceLevel = 0.6;

    if (trend === 'improving' && currentQuality > NetworkQuality.EXCELLENT) {
      expectedQuality = currentQuality - 1;
      confidenceLevel = 0.65;
    } else if (
      trend === 'degrading' &&
      currentQuality < NetworkQuality.UNUSABLE
    ) {
      expectedQuality = currentQuality + 1;
      confidenceLevel = 0.65;
    } else if (trend === 'stable') {
      confidenceLevel = 0.8;
    }

    // 创建预测结果
    return {
      expectedQuality,
      confidenceLevel,
      expectedLatency: this.predictLatency(),
      expectedSpeed: this.predictSpeed(),
      predictionTimestamp: Date.now(),
      forTimePeriod: predictionPeriodMs,
    };
  }

  /**
   * 预测延迟
   * @returns 预测的延迟(ms)
   */
  private predictLatency(): number {
    if (this.speedHistory.length === 0) {
      return 200; // 默认值
    }

    // 计算最近的延迟样本平均值
    const latencySamples = this.speedHistory
      .filter(sample => sample.latency !== undefined)
      .slice(-10); // 最近10个样本

    if (latencySamples.length === 0) {
      return 200; // 默认值
    }

    // 计算平均延迟
    const avgLatency =
      latencySamples.reduce((sum, sample) => sum + (sample.latency || 0), 0) /
      latencySamples.length;

    return avgLatency;
  }

  /**
   * 预测速度
   * @returns 预测的速度(KB/s)
   */
  private predictSpeed(): number {
    if (this.speedHistory.length === 0) {
      return 500; // 默认值
    }

    // 计算下载速度样本平均值
    const downloadSamples = this.speedHistory
      .filter(sample => sample.direction === 'download')
      .slice(-10); // 最近10个样本

    if (downloadSamples.length === 0) {
      return 500; // 默认值
    }

    // 计算平均速度
    const avgSpeed =
      downloadSamples.reduce((sum, sample) => sum + sample.speed, 0) /
      downloadSamples.length;

    // 考虑趋势
    const trend = this.detectSpeedTrend();

    if (trend === 'increasing') {
      return avgSpeed * 1.1; // 预期增长10%
    } else if (trend === 'decreasing') {
      return avgSpeed * 0.9; // 预期下降10%
    } else {
      return avgSpeed;
    }
  }

  /**
   * 获取当前网络质量
   * @returns 当前网络质量
   */
  private getCurrentQuality(): NetworkQuality {
    if (this.qualityHistory.length === 0) {
      return NetworkQuality.FAIR; // 默认值
    }

    // 按时间排序
    const sortedHistory = [...this.qualityHistory].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    return sortedHistory[0].quality;
  }

  /**
   * 检测网络趋势
   * @returns 趋势方向
   */
  private detectTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.qualityHistory.length < 3) {
      return 'stable';
    }

    // 按时间排序
    const sortedHistory = [...this.qualityHistory].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // 仅使用最近时间窗口内的数据
    const now = Date.now();
    const recentHistory = sortedHistory.filter(
      item => now - item.timestamp < this.PREDICTION_WINDOW
    );

    if (recentHistory.length < 3) {
      return 'stable';
    }

    // 计算质量方向变化
    let improvingCount = 0;
    let degradingCount = 0;

    for (let i = 1; i < recentHistory.length; i++) {
      const prev = recentHistory[i - 1].quality;
      const curr = recentHistory[i].quality;

      if (curr < prev) {
        improvingCount++; // 较小的枚举值表示较好的质量
      } else if (curr > prev) {
        degradingCount++;
      }
    }

    // 判断趋势
    const total = improvingCount + degradingCount;
    if (total === 0) {
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
   * 检测速度趋势
   * @returns 趋势方向
   */
  private detectSpeedTrend(): 'increasing' | 'stable' | 'decreasing' {
    if (this.speedHistory.length < 6) {
      return 'stable';
    }

    // 按时间排序
    const sortedHistory = [...this.speedHistory]
      .filter(sample => sample.direction === 'download')
      .sort((a, b) => a.timestamp - b.timestamp);

    if (sortedHistory.length < 6) {
      return 'stable';
    }

    // 将历史数据分为前半部分和后半部分
    const midIndex = Math.floor(sortedHistory.length / 2);
    const firstHalf = sortedHistory.slice(0, midIndex);
    const secondHalf = sortedHistory.slice(midIndex);

    // 计算两部分的平均速度
    const firstHalfAvg =
      firstHalf.reduce((sum, sample) => sum + sample.speed, 0) /
      firstHalf.length;
    const secondHalfAvg =
      secondHalf.reduce((sum, sample) => sum + sample.speed, 0) /
      secondHalf.length;

    // 比较两部分的平均速度
    const changeRatio = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;

    if (changeRatio > 0.1) {
      return 'increasing';
    } else if (changeRatio < -0.1) {
      return 'decreasing';
    } else {
      return 'stable';
    }
  }

  /**
   * 检测周期性模式
   * @returns 周期模式信息
   */
  private detectPeriodicalPattern(): PeriodicalPattern {
    if (this.qualityHistory.length < 24) {
      return { exists: false, confidence: 0 };
    }

    // 检查是否有每日周期
    const dailyPattern = this.checkPeriod(24 * 60 * 60 * 1000);
    if (dailyPattern.confidence > 0.7) {
      return {
        exists: true,
        intervalMs: 24 * 60 * 60 * 1000,
        confidence: dailyPattern.confidence,
        patternType: 'daily',
      };
    }

    // 检查是否有每小时周期
    const hourlyPattern = this.checkPeriod(60 * 60 * 1000);
    if (hourlyPattern.confidence > 0.7) {
      return {
        exists: true,
        intervalMs: 60 * 60 * 1000,
        confidence: hourlyPattern.confidence,
        patternType: 'hourly',
      };
    }

    // 检查自定义周期
    // 暂时简化实现

    return { exists: false, confidence: 0 };
  }

  /**
   * 检查特定周期是否存在
   * @param periodMs 周期长度(ms)
   * @returns 置信度信息
   */
  private checkPeriod(periodMs: number): { confidence: number } {
    // 按时间排序
    const sortedHistory = [...this.qualityHistory].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // 将数据分组到周期的不同阶段
    const phaseBuckets: Record<string, NetworkQuality[]> = {};

    for (const item of sortedHistory) {
      const phase = Math.floor((item.timestamp % periodMs) / (periodMs / 24));
      const phaseKey = String(phase);

      if (!phaseBuckets[phaseKey]) {
        phaseBuckets[phaseKey] = [];
      }

      phaseBuckets[phaseKey].push(item.quality);
    }

    // 计算每个阶段内的一致性
    let totalConsistency = 0;
    let bucketCount = 0;

    for (const phaseKey in phaseBuckets) {
      const qualities = phaseBuckets[phaseKey];
      if (qualities.length < 2) continue;

      // 计算该阶段内部一致性
      const mostCommonQuality = this.findMostCommon(qualities);
      const consistencyRatio =
        qualities.filter(q => q === mostCommonQuality).length /
        qualities.length;

      totalConsistency += consistencyRatio;
      bucketCount++;
    }

    // 计算整体置信度
    const confidence = bucketCount > 0 ? totalConsistency / bucketCount : 0;

    return { confidence };
  }

  /**
   * 找出数组中出现最多的元素
   * @param arr 数组
   * @returns 出现最多的元素
   */
  private findMostCommon<T>(arr: T[]): T {
    const counts: Record<string, number> = {};
    let maxItem: T = arr[0];
    let maxCount = 0;

    for (const item of arr) {
      const key = String(item);
      counts[key] = (counts[key] || 0) + 1;

      if (counts[key] > maxCount) {
        maxCount = counts[key];
        maxItem = item;
      }
    }

    return maxItem;
  }

  /**
   * 获取网络优化建议
   * @returns 优化建议数组
   */
  public getNetworkOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    const prediction = this.lastPrediction || this.predictNetworkQuality();

    if (prediction.expectedQuality >= NetworkQuality.FAIR) {
      suggestions.push('当前网络状况不理想，建议降低并发数和分片大小');
    }

    if (prediction.expectedLatency > 300) {
      suggestions.push('网络延迟较高，建议增加请求超时阈值');
    }

    if (prediction.expectedSpeed < 200) {
      suggestions.push('网络速度较慢，建议减小分片大小以提高成功率');
    }

    // 检测周期性
    const periodicalPattern = this.detectPeriodicalPattern();
    if (periodicalPattern.exists && periodicalPattern.confidence > 0.7) {
      if (periodicalPattern.patternType === 'daily') {
        suggestions.push(
          '检测到每日网络波动周期，建议在网络质量较好的时段进行大文件上传'
        );
      } else if (periodicalPattern.patternType === 'hourly') {
        suggestions.push(
          '检测到每小时网络波动周期，建议在网络质量较好的时段进行大文件上传'
        );
      }
    }

    // 网络稳定性建议
    const trend = this.detectTrend();
    if (trend === 'degrading') {
      suggestions.push('网络质量呈下降趋势，建议启用更激进的重试策略');
    } else if (trend === 'improving') {
      suggestions.push('网络质量呈改善趋势，可以适当增加并发数');
    }

    // 如果没有特殊建议，提供一个通用建议
    if (suggestions.length === 0) {
      suggestions.push('当前网络状况稳定，可使用默认上传参数');
    }

    return suggestions;
  }

  /**
   * 清除历史记录
   */
  public clearHistory(): void {
    this.qualityHistory = [];
    this.speedHistory = [];
    this.lastPrediction = null;
    this.logger.debug('已清除网络趋势预测历史数据');
  }
}

export default NetworkTrendPredictor;
