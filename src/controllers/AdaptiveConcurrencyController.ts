/**
 * AdaptiveConcurrencyController - 自适应并发控制器
 *
 * 功能：
 * 1. 根据网络质量动态调整并发数
 * 2. 监控上传性能，自动优化请求并发
 * 3. 防止过度并发导致的网络拥塞
 * 4. 提供历史性能数据分析
 */

import { NetworkQuality } from '../types/network';
import { Logger } from '../utils/Logger';
import { EventEmitter } from '../utils/EventEmitter';

export interface ConcurrencyConfig {
  minConcurrent: number; // 最小并发数
  maxConcurrent: number; // 最大并发数
  initialConcurrent: number; // 初始并发数
  uploadSpeedSampleSize: number; // 速度样本大小
  adaptationInterval: number; // 调整间隔(ms)
  aggressiveness: number; // 调整激进度(0-1)
  rampUpStep: number; // 递增步长
  rampDownStep: number; // 递减步长
  stabilityThreshold: number; // 稳定阈值(ms)
}

export interface PerformanceSample {
  timestamp: number; // 采样时间
  concurrency: number; // 当前并发数
  activeRequests: number; // 活跃请求数
  throughput: number; // 吞吐量(bytes/s)
  latency: number; // 延迟(ms)
  successRate: number; // 成功率(0-1)
  networkQuality: NetworkQuality; // 网络质量
}

export interface ConcurrencyStats {
  currentConcurrency: number; // 当前并发数
  recommendedConcurrency: number; // 推荐并发数
  maxAchievedThroughput: number; // 最大达到的吞吐量
  averageLatency: number; // 平均延迟
  failureRate: number; // 失败率
  adaptationCount: number; // 调整次数
  lastAdaptationTime: number | null; // 上次调整时间
  stabilityScore: number; // 稳定性评分(0-1)
}

export class AdaptiveConcurrencyController extends EventEmitter {
  private logger: Logger;
  private config: ConcurrencyConfig;
  private currentConcurrency: number; // 当前并发数
  private performanceSamples: PerformanceSample[] = [];
  private adaptationCount = 0;
  private lastAdaptationTime: number | null = null;
  private maxAchievedThroughput = 0;
  private activeRequests = 0;
  private completedRequests = 0;
  private failedRequests = 0;
  private latencySum = 0;
  private stabilityScore = 1.0;
  private isAdapting = false;
  private adaptationTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNetworkQuality: NetworkQuality = NetworkQuality.GOOD;
  private consecutiveUnchangedRounds = 0;

  /**
   * 创建自适应并发控制器
   * @param config 控制器配置
   */
  constructor(config?: Partial<ConcurrencyConfig>) {
    super();

    this.logger = new Logger('AdaptiveConcurrencyController');

    // 默认配置
    this.config = {
      minConcurrent: 1,
      maxConcurrent: 8,
      initialConcurrent: 3,
      uploadSpeedSampleSize: 5,
      adaptationInterval: 5000, // 5秒
      aggressiveness: 0.5, // 中等激进度
      rampUpStep: 1, // 每次增加1个并发
      rampDownStep: 2, // 每次减少2个并发
      stabilityThreshold: 100, // 100ms稳定性阈值
      ...config,
    };

    // 确保配置有效
    this.validateAndSanitizeConfig();

    // 初始化并发数
    this.currentConcurrency = this.config.initialConcurrent;

    // 开始自适应
    this.startAdaptation();
  }

  /**
   * 验证并修正配置
   */
  private validateAndSanitizeConfig(): void {
    // 确保最小并发数至少为1
    this.config.minConcurrent = Math.max(1, this.config.minConcurrent);

    // 确保最大并发数有合理限制
    this.config.maxConcurrent = Math.max(
      this.config.minConcurrent,
      Math.min(20, this.config.maxConcurrent)
    );

    // 确保初始并发数在有效范围内
    this.config.initialConcurrent = Math.max(
      this.config.minConcurrent,
      Math.min(this.config.maxConcurrent, this.config.initialConcurrent)
    );

    // 确保激进度在0-1范围内
    this.config.aggressiveness = Math.max(
      0,
      Math.min(1, this.config.aggressiveness)
    );

    // 确保步长有效
    this.config.rampUpStep = Math.max(1, this.config.rampUpStep);
    this.config.rampDownStep = Math.max(1, this.config.rampDownStep);
  }

  /**
   * 开始自适应控制
   */
  public startAdaptation(): void {
    if (this.isAdapting) return;

    this.isAdapting = true;
    this.scheduleNextAdaptation();
    this.logger.debug('已启动自适应并发控制');
  }

  /**
   * 停止自适应控制
   */
  public stopAdaptation(): void {
    if (!this.isAdapting) return;

    this.isAdapting = false;
    if (this.adaptationTimer) {
      clearTimeout(this.adaptationTimer);
      this.adaptationTimer = null;
    }
    this.logger.debug('已停止自适应并发控制');
  }

  /**
   * 安排下一次适应性调整
   */
  private scheduleNextAdaptation(): void {
    if (!this.isAdapting) return;

    if (this.adaptationTimer) {
      clearTimeout(this.adaptationTimer);
    }

    this.adaptationTimer = setTimeout(() => {
      this.adapt();
      this.scheduleNextAdaptation();
    }, this.config.adaptationInterval);
  }

  /**
   * 执行并发度自适应调整
   */
  private adapt(): void {
    // 检查是否有足够的样本
    if (this.performanceSamples.length === 0) {
      return;
    }

    const latestSample =
      this.performanceSamples[this.performanceSamples.length - 1];

    // 记录当前网络质量
    const currentNetworkQuality = latestSample.networkQuality;

    // 检查网络质量是否显著变化
    const qualityChanged = this.detectSignificantQualityChange(
      currentNetworkQuality
    );

    // 获取推荐的并发数
    let recommendedConcurrency = this.calculateRecommendedConcurrency(
      currentNetworkQuality
    );

    // 如果网络质量急剧恶化，更积极地降低并发度
    if (
      qualityChanged &&
      currentNetworkQuality > this.lastNetworkQuality &&
      currentNetworkQuality >= NetworkQuality.POOR
    ) {
      const reduction = Math.min(
        this.config.rampDownStep * 2,
        this.currentConcurrency - this.config.minConcurrent
      );

      if (reduction > 0) {
        recommendedConcurrency = Math.max(
          this.config.minConcurrent,
          this.currentConcurrency - reduction
        );
        this.logger.debug('网络质量恶化，急速降低并发数', {
          from: this.currentConcurrency,
          to: recommendedConcurrency,
          quality: NetworkQuality[currentNetworkQuality],
        });
      }
    }

    // 计算稳定性评分
    this.updateStabilityScore();

    // 决定是否调整并发数
    const shouldAdjust = this.shouldAdjustConcurrency(recommendedConcurrency);

    if (shouldAdjust) {
      const previousConcurrency = this.currentConcurrency;
      this.currentConcurrency = recommendedConcurrency;
      this.lastAdaptationTime = Date.now();
      this.adaptationCount++;
      this.lastNetworkQuality = currentNetworkQuality;
      this.consecutiveUnchangedRounds = 0;

      // 触发并发更新事件
      this.emit('concurrency:update', {
        currentConcurrency: this.currentConcurrency,
        previousConcurrency,
        reason: qualityChanged
          ? 'network_quality_change'
          : 'performance_optimization',
        networkQuality: currentNetworkQuality,
      });

      this.logger.debug('已调整并发数', {
        from: previousConcurrency,
        to: this.currentConcurrency,
        quality: NetworkQuality[currentNetworkQuality],
        stabilityScore: this.stabilityScore.toFixed(2),
        adaptationCount: this.adaptationCount,
      });
    } else {
      this.consecutiveUnchangedRounds++;

      // 如果长时间未变化，考虑小幅度探索性调整
      if (this.consecutiveUnchangedRounds > 5 && this.stabilityScore > 0.8) {
        this.exploreOptimalConcurrency();
      }
    }
  }

  /**
   * 探索最佳并发数
   * 在系统长期稳定后，进行小幅度探索以寻找最优并发数
   */
  private exploreOptimalConcurrency(): void {
    // 只在网络状况良好时进行探索
    if (this.lastNetworkQuality > NetworkQuality.FAIR) {
      return;
    }

    const isIncreaseExploration = Math.random() > 0.3; // 70%几率增加并发，30%几率减少

    if (
      isIncreaseExploration &&
      this.currentConcurrency < this.config.maxConcurrent
    ) {
      // 小幅增加并发
      const previousConcurrency = this.currentConcurrency;
      this.currentConcurrency = Math.min(
        this.config.maxConcurrent,
        this.currentConcurrency + 1
      );

      this.logger.debug('探索性增加并发数', {
        from: previousConcurrency,
        to: this.currentConcurrency,
      });

      this.emit('concurrency:update', {
        currentConcurrency: this.currentConcurrency,
        previousConcurrency,
        reason: 'exploration',
        networkQuality: this.lastNetworkQuality,
      });
    } else if (
      !isIncreaseExploration &&
      this.currentConcurrency > this.config.minConcurrent
    ) {
      // 小幅减少并发
      const previousConcurrency = this.currentConcurrency;
      this.currentConcurrency = Math.max(
        this.config.minConcurrent,
        this.currentConcurrency - 1
      );

      this.logger.debug('探索性减少并发数', {
        from: previousConcurrency,
        to: this.currentConcurrency,
      });

      this.emit('concurrency:update', {
        currentConcurrency: this.currentConcurrency,
        previousConcurrency,
        reason: 'exploration',
        networkQuality: this.lastNetworkQuality,
      });
    }

    // 重置连续未变化计数
    this.consecutiveUnchangedRounds = 0;
  }

  /**
   * 检测网络质量是否有显著变化
   */
  private detectSignificantQualityChange(
    currentQuality: NetworkQuality
  ): boolean {
    // 如果没有之前的质量记录，则视为显著变化
    if (this.lastNetworkQuality === undefined) {
      return true;
    }

    // 计算质量差距
    const qualityDifference = Math.abs(
      currentQuality - this.lastNetworkQuality
    );

    // 差距超过1级，视为显著变化
    return qualityDifference > 1;
  }

  /**
   * 计算推荐的并发数
   * @param networkQuality 当前网络质量
   * @returns 推荐的并发数
   */
  private calculateRecommendedConcurrency(
    networkQuality: NetworkQuality
  ): number {
    // 基于网络质量的基础并发数
    let baseConcurrency: number;

    switch (networkQuality) {
      case NetworkQuality.EXCELLENT:
        baseConcurrency = this.config.maxConcurrent;
        break;
      case NetworkQuality.GOOD:
        baseConcurrency = Math.floor(this.config.maxConcurrent * 0.8);
        break;
      case NetworkQuality.FAIR:
        baseConcurrency = Math.floor(this.config.maxConcurrent * 0.6);
        break;
      case NetworkQuality.POOR:
        baseConcurrency = Math.floor(this.config.maxConcurrent * 0.4);
        break;
      case NetworkQuality.VERY_POOR:
        baseConcurrency = Math.floor(this.config.maxConcurrent * 0.25);
        break;
      case NetworkQuality.UNUSABLE:
        baseConcurrency = this.config.minConcurrent;
        break;
      default:
        baseConcurrency = this.config.initialConcurrent;
    }

    // 确保在有效范围内
    baseConcurrency = Math.max(
      this.config.minConcurrent,
      Math.min(this.config.maxConcurrent, baseConcurrency)
    );

    // 根据历史性能调整
    const perfAdjustment = this.calculatePerformanceAdjustment();

    // 计算最终推荐并发度
    const recommendedConcurrency = Math.round(baseConcurrency + perfAdjustment);

    // 确保在有效范围内
    return Math.max(
      this.config.minConcurrent,
      Math.min(this.config.maxConcurrent, recommendedConcurrency)
    );
  }

  /**
   * 计算基于性能的调整量
   * @returns 调整量
   */
  private calculatePerformanceAdjustment(): number {
    if (this.performanceSamples.length < 2) {
      return 0;
    }

    // 计算最近几个样本的吞吐量趋势
    const recentSamples = this.performanceSamples.slice(
      -Math.min(5, this.performanceSamples.length)
    );

    // 检查吞吐量是否随着并发度增加而增加
    let throughputIncreasing = false;
    let latencyIncreasing = false;

    // 计算趋势
    if (recentSamples.length >= 2) {
      const firstSample = recentSamples[0];
      const lastSample = recentSamples[recentSamples.length - 1];

      // 并发度是否增加
      const concurrencyIncreased =
        lastSample.concurrency > firstSample.concurrency;

      // 吞吐量是否随并发度增加而增加
      throughputIncreasing =
        concurrencyIncreased &&
        lastSample.throughput > firstSample.throughput * 1.1;

      // 延迟是否随并发度增加而显著增加
      latencyIncreasing =
        concurrencyIncreased && lastSample.latency > firstSample.latency * 1.5;
    }

    // 计算基于性能的调整量
    let adjustment = 0;

    // 如果吞吐量随并发度增加而增加，且延迟未显著增加，继续增加并发度
    if (throughputIncreasing && !latencyIncreasing) {
      adjustment = this.config.rampUpStep * this.config.aggressiveness;
    }
    // 如果延迟显著增加，减少并发度
    else if (latencyIncreasing) {
      adjustment = -this.config.rampDownStep * this.config.aggressiveness;
    }

    return adjustment;
  }

  /**
   * 更新稳定性评分
   */
  private updateStabilityScore(): void {
    if (this.performanceSamples.length < 3) {
      return;
    }

    // 计算最近几个样本的延迟波动
    const recentSamples = this.performanceSamples.slice(
      -Math.min(5, this.performanceSamples.length)
    );
    const latencies = recentSamples.map(sample => sample.latency);

    // 计算延迟标准差
    const avgLatency =
      latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
    const variance =
      latencies.reduce((sum, val) => sum + Math.pow(val - avgLatency, 2), 0) /
      latencies.length;
    const stdDev = Math.sqrt(variance);

    // 计算延迟变异系数 (CV = StdDev / Mean)
    const latencyCV = avgLatency > 0 ? stdDev / avgLatency : 0;

    // 将变异系数转换为稳定性评分 (CV越小，稳定性越高)
    const rawStabilityScore = Math.max(0, 1 - latencyCV * 2); // CV=0.5时稳定性为0

    // 平滑稳定性评分，避免过度波动
    this.stabilityScore = this.stabilityScore * 0.7 + rawStabilityScore * 0.3;

    // 确保评分在0-1范围内
    this.stabilityScore = Math.max(0, Math.min(1, this.stabilityScore));
  }

  /**
   * 判断是否应该调整并发数
   * @param recommendedConcurrency 推荐的并发数
   * @returns 是否应该调整
   */
  private shouldAdjustConcurrency(recommendedConcurrency: number): boolean {
    // 如果首次运行，应该直接设置初始并发数
    if (this.lastAdaptationTime === null) {
      return true;
    }

    // 与当前并发数相同，不需要调整
    if (recommendedConcurrency === this.currentConcurrency) {
      return false;
    }

    // 计算自上次调整以来的时间
    const timeSinceLastAdaptation = Date.now() - this.lastAdaptationTime;

    // 避免过于频繁的调整
    if (timeSinceLastAdaptation < this.config.adaptationInterval) {
      return false;
    }

    // 如果推荐的变化很大，或者网络质量差，更积极地调整
    if (Math.abs(recommendedConcurrency - this.currentConcurrency) >= 2) {
      return true;
    }

    // 在稳定状态下，只有达到一定阈值才调整，避免频繁微调
    const adjustmentThreshold = this.stabilityScore > 0.7 ? 0 : 1;
    return (
      Math.abs(recommendedConcurrency - this.currentConcurrency) >
      adjustmentThreshold
    );
  }

  /**
   * 记录请求开始
   */
  public recordRequestStart(): void {
    this.activeRequests++;
  }

  /**
   * 记录请求完成
   * @param latency 请求延迟
   * @param success 是否成功
   * @param throughput 吞吐量
   * @param networkQuality 网络质量
   */
  public recordRequestComplete(
    latency: number,
    success: boolean,
    throughput: number,
    networkQuality: NetworkQuality
  ): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    if (success) {
      this.completedRequests++;
      this.latencySum += latency;

      // 更新最大吞吐量
      this.maxAchievedThroughput = Math.max(
        this.maxAchievedThroughput,
        throughput
      );
    } else {
      this.failedRequests++;
    }

    // 添加性能样本
    this.addPerformanceSample({
      timestamp: Date.now(),
      concurrency: this.currentConcurrency,
      activeRequests: this.activeRequests,
      throughput,
      latency,
      successRate: success ? 1 : 0,
      networkQuality,
    });
  }

  /**
   * 添加性能样本
   * @param sample 性能样本
   */
  private addPerformanceSample(sample: PerformanceSample): void {
    this.performanceSamples.push(sample);

    // 控制样本数量
    const maxSamples = Math.max(50, this.config.uploadSpeedSampleSize * 3);
    if (this.performanceSamples.length > maxSamples) {
      this.performanceSamples.shift();
    }
  }

  /**
   * 获取当前并发统计信息
   * @returns 统计信息
   */
  public getStats(): ConcurrencyStats {
    // 计算平均延迟
    const avgLatency =
      this.completedRequests > 0 ? this.latencySum / this.completedRequests : 0;

    // 计算失败率
    const totalRequests = this.completedRequests + this.failedRequests;
    const failureRate =
      totalRequests > 0 ? this.failedRequests / totalRequests : 0;

    // 获取推荐并发度
    const recommendedConcurrency =
      this.lastNetworkQuality !== undefined
        ? this.calculateRecommendedConcurrency(this.lastNetworkQuality)
        : this.currentConcurrency;

    return {
      currentConcurrency: this.currentConcurrency,
      recommendedConcurrency,
      maxAchievedThroughput: this.maxAchievedThroughput,
      averageLatency: avgLatency,
      failureRate,
      adaptationCount: this.adaptationCount,
      lastAdaptationTime: this.lastAdaptationTime,
      stabilityScore: this.stabilityScore,
    };
  }

  /**
   * 手动设置并发数，覆盖自动调整
   * @param concurrency 目标并发数
   * @param temporary 是否临时覆盖（仅当前批次）
   */
  public setConcurrency(concurrency: number, temporary = false): void {
    const validConcurrency = Math.max(
      this.config.minConcurrent,
      Math.min(this.config.maxConcurrent, concurrency)
    );

    const previousConcurrency = this.currentConcurrency;
    this.currentConcurrency = validConcurrency;

    if (!temporary) {
      // 非临时覆盖，调整初始配置
      this.config.initialConcurrent = validConcurrency;
    }

    this.logger.debug('手动设置并发数', {
      from: previousConcurrency,
      to: this.currentConcurrency,
      temporary,
    });

    // 触发并发更新事件
    this.emit('concurrency:update', {
      currentConcurrency: this.currentConcurrency,
      previousConcurrency,
      reason: 'manual',
      networkQuality: this.lastNetworkQuality,
    });
  }

  /**
   * 根据网络质量立即调整并发数
   * @param networkQuality 当前网络质量
   */
  public adjustForNetworkQuality(networkQuality: NetworkQuality): void {
    const previousConcurrency = this.currentConcurrency;
    const previousQuality = this.lastNetworkQuality;
    this.lastNetworkQuality = networkQuality;

    // 计算新的并发数
    const newConcurrency = this.calculateRecommendedConcurrency(networkQuality);

    // 避免微小调整
    if (Math.abs(newConcurrency - this.currentConcurrency) >= 1) {
      this.currentConcurrency = newConcurrency;
      this.lastAdaptationTime = Date.now();
      this.adaptationCount++;

      this.logger.debug('网络质量变化，调整并发数', {
        from: previousConcurrency,
        to: this.currentConcurrency,
        previousQuality: NetworkQuality[previousQuality],
        newQuality: NetworkQuality[networkQuality],
      });

      // 触发并发更新事件
      this.emit('concurrency:update', {
        currentConcurrency: this.currentConcurrency,
        previousConcurrency,
        reason: 'network_quality_change',
        networkQuality,
      });
    }
  }

  /**
   * 获取当前并发数
   * @returns 当前并发数
   */
  public getConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * 重置控制器状态
   */
  public reset(): void {
    this.stopAdaptation();

    this.currentConcurrency = this.config.initialConcurrent;
    this.performanceSamples = [];
    this.adaptationCount = 0;
    this.lastAdaptationTime = null;
    this.maxAchievedThroughput = 0;
    this.activeRequests = 0;
    this.completedRequests = 0;
    this.failedRequests = 0;
    this.latencySum = 0;
    this.stabilityScore = 1.0;
    this.lastNetworkQuality = NetworkQuality.GOOD;
    this.consecutiveUnchangedRounds = 0;

    this.logger.debug('已重置并发控制器');

    this.startAdaptation();
  }

  /**
   * 销毁控制器
   */
  public destroy(): void {
    this.stopAdaptation();
    this.removeAllListeners();
    this.logger.debug('已销毁并发控制器');
  }
}

export default AdaptiveConcurrencyController;
