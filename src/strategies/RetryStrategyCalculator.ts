/**
 * RetryStrategyCalculator - 重试策略计算器
 *
 * 功能：
 * 1. 计算指数退避重试间隔
 * 2. 基于网络质量优化重试策略
 * 3. 资源错误率分析与策略调整
 * 4. 自适应重试参数优化
 */

import { NetworkQuality, RetryStrategy } from '../types/network';

export interface AdaptiveRetryParams {
  baseDelay: number; // 基础延迟（毫秒）
  maxDelay: number; // 最大延迟（毫秒）
  factor: number; // 退避因子
  jitter: number; // 抖动系数
  defaultMaxRetries: number; // 默认最大重试次数
}

export class RetryStrategyCalculator {
  /**
   * 计算指数退避重试延迟
   * @param retryCount 当前重试次数
   * @param strategy 重试策略
   * @param adaptiveParams 自适应参数
   * @param multiplier 延迟乘数
   * @returns 计算后的重试延迟（毫秒）
   */
  public static calculateRetryDelay(
    retryCount: number,
    strategy: RetryStrategy,
    adaptiveParams: AdaptiveRetryParams,
    multiplier = 1
  ): number {
    // 使用策略参数或默认参数
    const baseDelay = strategy.retryDelay ?? adaptiveParams.baseDelay;
    const factor = strategy.backoffFactor ?? adaptiveParams.factor;
    const maxDelay = strategy.maxRetryDelay ?? adaptiveParams.maxDelay;
    const jitter = adaptiveParams.jitter;

    // 计算指数延迟
    let delay = baseDelay * Math.pow(factor, retryCount) * multiplier;

    // 添加随机抖动，避免雪崩效应
    const randomFactor = 1 - jitter + Math.random() * jitter * 2;
    delay = delay * randomFactor;

    // 确保不超过最大延迟
    delay = Math.min(delay, maxDelay);

    return Math.round(delay);
  }

  /**
   * 基于网络质量获取延迟乘数
   * @param networkQuality 网络质量
   * @returns 延迟乘数
   */
  public static getDelayMultiplierForNetworkQuality(
    networkQuality: NetworkQuality
  ): number {
    switch (networkQuality) {
      case NetworkQuality.EXCELLENT:
        return 0.8;
      case NetworkQuality.GOOD:
        return 1.0;
      case NetworkQuality.FAIR:
        return 1.2;
      case NetworkQuality.POOR:
        return 1.5;
      case NetworkQuality.VERY_POOR:
        return 2.5;
      case NetworkQuality.UNUSABLE:
        return 3.0;
      default:
        return 1.0;
    }
  }

  /**
   * 根据资源错误率优化重试策略
   * @param baseStrategy 基础重试策略
   * @param errorRate 资源错误率
   * @param networkQuality 网络质量
   * @returns 优化后的重试策略
   */
  public static optimizeStrategyByErrorRate(
    baseStrategy: RetryStrategy,
    errorRate: number,
    networkQuality: NetworkQuality,
    adaptiveParams: AdaptiveRetryParams
  ): RetryStrategy {
    const strategy = { ...baseStrategy };

    // 错误率很高的资源，减少重试
    if (errorRate > 0.8) {
      strategy.maxRetries = 1;
      strategy.retryDelay = adaptiveParams.baseDelay * 2;
    }
    // 错误率高的资源，稍微减少重试
    else if (errorRate > 0.5) {
      strategy.maxRetries = Math.max(
        2,
        (strategy.maxRetries || adaptiveParams.defaultMaxRetries) - 2
      );
      strategy.retryDelay = adaptiveParams.baseDelay * 1.5;
    }
    // 错误率适中的资源，增加延迟
    else if (errorRate > 0.3) {
      strategy.retryDelay = adaptiveParams.baseDelay * 1.2;
    }
    // 错误率低的资源，可以适当增加重试次数
    else if (errorRate < 0.1) {
      strategy.maxRetries = Math.min(
        (strategy.maxRetries || adaptiveParams.defaultMaxRetries) + 2,
        8
      );
    }

    // 根据网络质量调整
    const networkMultiplier =
      this.getDelayMultiplierForNetworkQuality(networkQuality);

    if (
      networkQuality === NetworkQuality.POOR ||
      networkQuality === NetworkQuality.VERY_POOR
    ) {
      // 网络较差时，增加延迟，减少重试次数
      strategy.retryDelay =
        (strategy.retryDelay || adaptiveParams.baseDelay) * networkMultiplier;
      strategy.maxRetries = Math.max(
        1,
        (strategy.maxRetries || adaptiveParams.defaultMaxRetries) - 1
      );
    }

    return strategy;
  }

  /**
   * 根据请求重要性优化重试策略
   * @param baseStrategy 基础重试策略
   * @param importance 请求重要性 (0-1)
   * @returns 优化后的重试策略
   */
  public static optimizeStrategyByImportance(
    baseStrategy: RetryStrategy,
    importance: number,
    adaptiveParams: AdaptiveRetryParams
  ): RetryStrategy {
    const strategy = { ...baseStrategy };

    // 重要性越高，重试次数越多
    if (importance > 0.8) {
      strategy.maxRetries = Math.min(
        (strategy.maxRetries || adaptiveParams.defaultMaxRetries) + 2,
        10
      );
      // 关键请求可以使用更积极的重试策略（较短延迟）
      strategy.backoffFactor = Math.max(
        1.2,
        strategy.backoffFactor || adaptiveParams.factor
      );
    } else if (importance > 0.5) {
      strategy.maxRetries = Math.min(
        (strategy.maxRetries || adaptiveParams.defaultMaxRetries) + 1,
        7
      );
    } else if (importance < 0.3) {
      // 不太重要的请求，减少重试次数
      strategy.maxRetries = Math.max(
        1,
        (strategy.maxRetries || adaptiveParams.defaultMaxRetries) - 1
      );
    }

    return strategy;
  }

  /**
   * 预测重试成功率
   * @param errorType 错误类型
   * @param historicalSuccessRate 历史成功率
   * @param resourceSuccessRate 资源成功率
   * @param networkQuality 网络质量
   * @returns 预测的重试成功率 (0-1)
   */
  public static predictRetrySuccess(
    errorType: string,
    historicalSuccessRate: number | null,
    resourceSuccessRate: number | null,
    networkQuality: NetworkQuality
  ): number {
    // 基础成功率预测
    let basePrediction = 0.5; // 默认50%成功率

    // 根据错误类型调整
    switch (errorType) {
      case 'TIMEOUT':
        basePrediction = 0.7; // 超时错误通常可恢复
        break;
      case 'SERVER_ERROR':
        basePrediction = 0.6; // 服务器错误通常可恢复
        break;
      case 'NETWORK_ERROR':
        basePrediction = 0.5; // 网络错误有一定恢复概率
        break;
      case 'CLIENT_ERROR':
        basePrediction = 0.2; // 客户端错误通常不可恢复
        break;
      case 'SECURITY_ERROR':
        basePrediction = 0.1; // 安全错误通常不可恢复
        break;
      case 'UNKNOWN':
        basePrediction = 0.3; // 未知错误恢复概率低
        break;
    }

    // 根据特定错误历史调整
    if (historicalSuccessRate !== null) {
      // 历史权重随样本量增加
      const historyWeight = 0.6;
      basePrediction =
        basePrediction * (1 - historyWeight) +
        historicalSuccessRate * historyWeight;
    }

    // 根据资源错误率调整
    if (resourceSuccessRate !== null) {
      // 资源历史权重
      const resourceWeight = 0.4;
      basePrediction =
        basePrediction * (1 - resourceWeight) +
        resourceSuccessRate * resourceWeight;
    }

    // 根据网络状态调整
    switch (networkQuality) {
      case NetworkQuality.EXCELLENT:
        basePrediction = Math.min(1, basePrediction * 1.2);
        break;
      case NetworkQuality.GOOD:
        basePrediction = Math.min(1, basePrediction * 1.1);
        break;
      case NetworkQuality.FAIR:
        // 不调整
        break;
      case NetworkQuality.POOR:
        basePrediction = basePrediction * 0.8;
        break;
      case NetworkQuality.VERY_POOR:
        basePrediction = basePrediction * 0.6;
        break;
      case NetworkQuality.UNUSABLE:
        basePrediction = basePrediction * 0.2;
        break;
    }

    // 确保预测在有效范围内
    return Math.max(0, Math.min(1, basePrediction));
  }
}

export default RetryStrategyCalculator;
