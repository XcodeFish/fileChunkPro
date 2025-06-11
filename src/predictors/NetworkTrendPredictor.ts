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
import TimeSeriesPredictor, {
  DataPoint,
  PredictionOptions,
  PredictionResult,
} from './TimeSeriesPredictor';

export interface NetworkPrediction {
  expectedQuality: NetworkQuality; // 预期网络质量
  confidenceLevel: number; // 置信度 (0-1)
  expectedLatency: number; // 预期延迟(ms)
  expectedSpeed: number; // 预期速度(KB/s)
  predictionTimestamp: number; // 预测生成时间
  forTimePeriod: number; // 预测有效时间(ms)
  predictionMethod?: string; // 使用的预测方法
  seasonalityDetected?: boolean; // 是否检测到季节性
  confidenceInterval?: {
    // 置信区间
    latency: { low: number; high: number };
    speed: { low: number; high: number };
  };
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

  // 时间序列预测器
  private timeSeriesPredictor: TimeSeriesPredictor;

  constructor() {
    this.logger = new Logger('NetworkTrendPredictor');
    this.timeSeriesPredictor = new TimeSeriesPredictor();
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

    // 使用高级时间序列分析检测周期性
    const periodicalPattern = this.detectPeriodicalPattern();

    // 如果存在强烈的周期性，使用周期预测
    if (periodicalPattern.exists && periodicalPattern.confidence > 0.7) {
      return this.predictByPeriodicalPattern(
        periodicalPattern,
        predictionPeriodMs
      );
    }

    // 使用增强的时间序列预测
    return this.predictUsingTimeSeries(predictionPeriodMs);
  }

  /**
   * 使用高级时间序列分析进行网络预测
   * @param predictionPeriodMs 预测时间长度(ms)
   * @returns 网络预测结果
   */
  private predictUsingTimeSeries(
    predictionPeriodMs: number
  ): NetworkPrediction {
    // 准备网络质量数据点
    // 注意：NetworkQuality是枚举，为了数值分析，我们需要将其转换为数值
    const qualityDataPoints: DataPoint[] = this.qualityHistory.map(item => ({
      value: this.qualityToNumber(item.quality),
      timestamp: item.timestamp,
    }));

    // 准备延迟数据点
    const latencyDataPoints: DataPoint[] = this.speedHistory
      .filter(sample => sample.latency !== undefined)
      .map(sample => ({
        value: sample.latency || 0,
        timestamp: sample.timestamp,
      }));

    // 准备下载速度数据点
    const speedDataPoints: DataPoint[] = this.speedHistory
      .filter(sample => sample.direction === 'download')
      .map(sample => ({
        value: sample.speed,
        timestamp: sample.timestamp,
      }));

    // 计算预测点数量
    const avgTimeDiff = this.getAverageTimeDiff();
    const predictionPoints = Math.max(
      1,
      Math.ceil(predictionPeriodMs / avgTimeDiff)
    );

    // 预测网络质量
    const qualityPrediction = this.predictTimeSeriesValue(
      qualityDataPoints,
      predictionPoints,
      true // 检查季节性
    );

    // 预测延迟
    const latencyPrediction = this.predictTimeSeriesValue(
      latencyDataPoints,
      predictionPoints
    );

    // 预测速度
    const speedPrediction = this.predictTimeSeriesValue(
      speedDataPoints,
      predictionPoints
    );

    // 取预测点中的第一个作为主要预测结果
    const predictedQualityValue =
      qualityPrediction.predictions[0]?.value ||
      this.qualityToNumber(this.getCurrentQuality());

    // 将数值转换回网络质量枚举
    const expectedQuality = this.numberToQuality(predictedQualityValue);

    // 获取预测的延迟和速度
    const expectedLatency =
      latencyPrediction.predictions[0]?.value || this.predictLatency();
    const expectedSpeed =
      speedPrediction.predictions[0]?.value || this.predictSpeed();

    // 计算综合置信度
    // 我们可以基于预测方法和准确性来估计置信度
    const qualityConfidence =
      this.calculateConfidenceFromPrediction(qualityPrediction);
    const latencyConfidence =
      this.calculateConfidenceFromPrediction(latencyPrediction);
    const speedConfidence =
      this.calculateConfidenceFromPrediction(speedPrediction);

    // 计算整体置信度（三种预测的加权平均）
    const confidenceLevel =
      qualityConfidence * 0.5 +
      latencyConfidence * 0.25 +
      speedConfidence * 0.25;

    // 创建预测结果
    const prediction: NetworkPrediction = {
      expectedQuality,
      confidenceLevel,
      expectedLatency,
      expectedSpeed,
      predictionTimestamp: Date.now(),
      forTimePeriod: predictionPeriodMs,
      predictionMethod: qualityPrediction.method,
      seasonalityDetected:
        qualityPrediction.seasonalityDetected ||
        latencyPrediction.seasonalityDetected ||
        speedPrediction.seasonalityDetected,
      confidenceInterval: {
        latency: {
          low:
            latencyPrediction.predictions[0]?.confidenceLow ||
            expectedLatency * 0.8,
          high:
            latencyPrediction.predictions[0]?.confidenceHigh ||
            expectedLatency * 1.2,
        },
        speed: {
          low:
            speedPrediction.predictions[0]?.confidenceLow ||
            expectedSpeed * 0.8,
          high:
            speedPrediction.predictions[0]?.confidenceHigh ||
            expectedSpeed * 1.2,
        },
      },
    };

    this.lastPrediction = prediction;

    this.logger.debug('高级网络趋势预测', {
      expectedQuality,
      confidenceLevel,
      expectedLatency: Math.round(prediction.expectedLatency) + 'ms',
      expectedSpeed: Math.round(prediction.expectedSpeed) + 'KB/s',
      method: prediction.predictionMethod,
      seasonality: prediction.seasonalityDetected,
    });

    return prediction;
  }

  /**
   * 预测时间序列数据
   */
  private predictTimeSeriesValue(
    dataPoints: DataPoint[],
    horizon: number,
    detectSeasonality = false
  ): PredictionResult {
    if (dataPoints.length < 3) {
      // 数据不足，返回空预测结果
      return {
        predictions: [],
        method: 'insufficient_data',
        accuracy: {},
        seasonalityDetected: false,
      };
    }

    // 设置预测选项
    const options: PredictionOptions = {
      method: 'auto', // 自动选择最佳方法
      horizon,
      confidenceInterval: true,
    };

    // 如果要检测季节性，添加季节性选项
    if (detectSeasonality) {
      // 检查常见周期（小时、半天、天、周）
      const potentialPeriods = [24, 12, 7, 31]; // 小时为单位的常见周期

      // 找出最匹配的周期
      let bestPeriod = 0;
      let bestAutocorrelation = 0;

      for (const period of potentialPeriods) {
        // 转换数据点为纯数值数组
        const values = dataPoints.map(p => p.value);
        const autocorrelation = this.calculateAutocorrelation(values, period);

        if (autocorrelation > 0.4 && autocorrelation > bestAutocorrelation) {
          bestAutocorrelation = autocorrelation;
          bestPeriod = period;
        }
      }

      // 如果检测到明显周期，设置季节性参数
      if (bestPeriod > 0) {
        options.seasonalPeriod = bestPeriod;
      }
    }

    // 执行时间序列预测
    return this.timeSeriesPredictor.predict(dataPoints, options);
  }

  /**
   * 计算自相关系数
   */
  private calculateAutocorrelation(values: number[], lag: number): number {
    if (values.length <= lag) return 0;

    // 计算均值
    let sum = 0;
    for (const val of values) {
      sum += val;
    }
    const mean = sum / values.length;

    // 计算分母（方差）
    let denominator = 0;
    for (const val of values) {
      denominator += Math.pow(val - mean, 2);
    }

    if (denominator === 0) return 0;

    // 计算自相关
    let numerator = 0;
    for (let i = 0; i < values.length - lag; i++) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }

    return numerator / denominator;
  }

  /**
   * 基于预测结果计算置信度
   */
  private calculateConfidenceFromPrediction(
    prediction: PredictionResult
  ): number {
    // 如果无法进行预测，返回低置信度
    if (prediction.predictions.length === 0) return 0.5;

    // 基于预测方法调整基础置信度
    let baseConfidence = 0;
    switch (prediction.method) {
      case 'exponential_smoothing':
        baseConfidence = 0.8;
        break;
      case 'moving_average':
        baseConfidence = 0.7;
        break;
      case 'arima_simplified':
        baseConfidence = 0.75;
        break;
      default:
        baseConfidence = 0.6;
    }

    // 如果检测到季节性，略微提高置信度
    if (prediction.seasonalityDetected) {
      baseConfidence += 0.05;
    }

    // 如果有误差指标，基于误差调整置信度
    if (prediction.accuracy.mape !== undefined) {
      // 较低的MAPE表示更高的准确性
      const mapeAdjustment = Math.max(
        0,
        Math.min(0.2, 0.2 - prediction.accuracy.mape / 100)
      );
      baseConfidence += mapeAdjustment;
    }

    // 确保置信度在有效范围内
    return Math.max(0.1, Math.min(0.95, baseConfidence));
  }

  /**
   * 获取数据点的平均时间间隔
   */
  private getAverageTimeDiff(): number {
    // 首选使用网络质量历史数据计算时间间隔
    if (this.qualityHistory.length > 1) {
      let totalDiff = 0;
      for (let i = 1; i < this.qualityHistory.length; i++) {
        totalDiff +=
          this.qualityHistory[i].timestamp -
          this.qualityHistory[i - 1].timestamp;
      }
      return totalDiff / (this.qualityHistory.length - 1);
    }

    // 如果质量历史不足，使用速度样本
    if (this.speedHistory.length > 1) {
      let totalDiff = 0;
      const sortedSamples = [...this.speedHistory].sort(
        (a, b) => a.timestamp - b.timestamp
      );
      for (let i = 1; i < sortedSamples.length; i++) {
        totalDiff +=
          sortedSamples[i].timestamp - sortedSamples[i - 1].timestamp;
      }
      return totalDiff / (sortedSamples.length - 1);
    }

    // 默认值：1分钟
    return 60 * 1000;
  }

  /**
   * 将网络质量枚举转换为数值
   * 较小的值表示更好的质量
   */
  private qualityToNumber(quality: NetworkQuality): number {
    switch (quality) {
      case NetworkQuality.EXCELLENT:
        return 1;
      case NetworkQuality.GOOD:
        return 2;
      case NetworkQuality.FAIR:
        return 3;
      case NetworkQuality.POOR:
        return 4;
      case NetworkQuality.VERY_POOR:
        return 5;
      case NetworkQuality.UNUSABLE:
        return 6;
      default:
        return 3; // 默认为FAIR
    }
  }

  /**
   * 将数值转换回网络质量枚举
   */
  private numberToQuality(value: number): NetworkQuality {
    // 四舍五入到最接近的整数
    const rounded = Math.round(value);

    switch (rounded) {
      case 1:
        return NetworkQuality.EXCELLENT;
      case 2:
        return NetworkQuality.GOOD;
      case 3:
        return NetworkQuality.FAIR;
      case 4:
        return NetworkQuality.POOR;
      case 5:
        return NetworkQuality.VERY_POOR;
      case 6:
        return NetworkQuality.UNUSABLE;
      default:
        // 对于范围外的值，限制在有效范围内
        if (rounded < 1) return NetworkQuality.EXCELLENT;
        if (rounded > 6) return NetworkQuality.UNUSABLE;
        return NetworkQuality.FAIR;
    }
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
      return this.predictUsingTimeSeries(predictionPeriodMs);
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
        expectedLatency: this.predictLatencyWithTimeSeries(),
        expectedSpeed: this.predictSpeedWithTimeSeries(),
        predictionTimestamp: now,
        forTimePeriod: predictionPeriodMs,
        seasonalityDetected: true,
        predictionMethod: `cyclical_pattern_${pattern.patternType || 'custom'}`,
      };
    } else {
      // 回退到时间序列预测
      return this.predictUsingTimeSeries(predictionPeriodMs);
    }
  }

  /**
   * 预测延迟（使用时间序列分析）
   * @returns 预测的延迟(ms)
   */
  private predictLatencyWithTimeSeries(): number {
    // 提取延迟数据
    const latencyDataPoints: DataPoint[] = this.speedHistory
      .filter(sample => sample.latency !== undefined)
      .map(sample => ({
        value: sample.latency || 0,
        timestamp: sample.timestamp,
      }));

    if (latencyDataPoints.length < 3) {
      // 数据不足，回退到简单预测
      return this.predictLatency();
    }

    // 使用时间序列预测
    const prediction = this.predictTimeSeriesValue(latencyDataPoints, 1);

    if (prediction.predictions.length > 0) {
      return prediction.predictions[0].value;
    } else {
      return this.predictLatency(); // 回退到简单预测
    }
  }

  /**
   * 预测速度（使用时间序列分析）
   * @returns 预测的速度(KB/s)
   */
  private predictSpeedWithTimeSeries(): number {
    // 提取下载速度数据
    const speedDataPoints: DataPoint[] = this.speedHistory
      .filter(sample => sample.direction === 'download')
      .map(sample => ({
        value: sample.speed,
        timestamp: sample.timestamp,
      }));

    if (speedDataPoints.length < 3) {
      // 数据不足，回退到简单预测
      return this.predictSpeed();
    }

    // 使用时间序列预测
    const prediction = this.predictTimeSeriesValue(speedDataPoints, 1);

    if (prediction.predictions.length > 0) {
      return prediction.predictions[0].value;
    } else {
      return this.predictSpeed(); // 回退到简单预测
    }
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

    // 使用时间序列分析更精确地检测周期
    const qualityDataPoints: DataPoint[] = this.qualityHistory.map(item => ({
      value: this.qualityToNumber(item.quality),
      timestamp: item.timestamp,
    }));

    // 准备预测选项，指定检测季节性
    const options: PredictionOptions = {
      method: 'auto',
      horizon: 1,
      confidenceInterval: true,
    };

    // 执行预测（主要是为了获取季节性检测结果）
    const prediction = this.timeSeriesPredictor.predict(
      qualityDataPoints,
      options
    );

    // 如果检测到季节性
    if (prediction.seasonalityDetected && prediction.dominantPeriod) {
      // 根据主周期长度确定周期类型
      let patternType: 'daily' | 'hourly' | 'custom' = 'custom';

      // 计算周期时长（毫秒）
      const periodMs = prediction.dominantPeriod * this.getAverageTimeDiff();

      // 确定周期类型
      if (Math.abs(periodMs - 24 * 60 * 60 * 1000) < 2 * 60 * 60 * 1000) {
        patternType = 'daily';
      } else if (Math.abs(periodMs - 60 * 60 * 1000) < 15 * 60 * 1000) {
        patternType = 'hourly';
      }

      return {
        exists: true,
        intervalMs: periodMs,
        confidence: 0.7 + Math.min(0.2, (qualityDataPoints.length / 100) * 0.2), // 样本量越大，置信度越高
        patternType,
      };
    }

    // 传统周期检测（作为后备）
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

    // 使用时间序列分析检测周期性
    if (prediction.seasonalityDetected) {
      suggestions.push(
        '检测到网络波动周期，建议在网络质量较好的时段进行大文件上传'
      );
    }

    // 检查置信区间范围
    if (prediction.confidenceInterval) {
      const latencyRange =
        prediction.confidenceInterval.latency.high -
        prediction.confidenceInterval.latency.low;
      const speedRange =
        prediction.confidenceInterval.speed.high -
        prediction.confidenceInterval.speed.low;

      // 如果范围较宽，表示网络不稳定
      if (
        latencyRange > prediction.expectedLatency * 0.5 ||
        speedRange > prediction.expectedSpeed * 0.5
      ) {
        suggestions.push('网络状况预测波动范围较大，建议使用更保守的上传策略');
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
