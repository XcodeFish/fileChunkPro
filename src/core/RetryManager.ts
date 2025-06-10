/**
 * RetryManager - 智能重试管理器 (重构版)
 *
 * 功能:
 * 1. 智能化重试策略管理
 * 2. 差异化的错误处理
 * 3. 上下文感知的重试决策
 * 4. 自适应重试间隔计算
 * 5. 重试历史统计与分析
 */

import { EventBus } from './EventBus';
import { Logger } from '../utils/Logger';
import { NetworkDetector } from '../utils/NetworkDetector';
import { DependencyContainer } from './DependencyContainer';
import { ErrorUtils } from '../utils/ErrorUtils';
import { ErrorAnalyzer } from '../analyzers/ErrorAnalyzer';
import {
  RetryStrategyCalculator,
  AdaptiveRetryParams,
} from '../strategies/RetryStrategyCalculator';

import {
  RetryStrategy,
  RetryHistoryItem,
  RetryDecision,
  ErrorType,
} from '../types/network';

export class RetryManager {
  private static instance: RetryManager;
  private eventBus: EventBus;
  private logger: Logger;
  private networkDetector: NetworkDetector;
  private errorAnalyzer: ErrorAnalyzer;

  // 自适应参数
  private adaptiveParams: AdaptiveRetryParams = {
    baseDelay: 1000,
    maxDelay: 30000,
    factor: 2,
    jitter: 0.1,
    defaultMaxRetries: 5,
  };

  constructor() {
    this.eventBus = EventBus.getInstance();
    this.logger = new Logger('RetryManager');

    // 获取网络检测器
    this.networkDetector =
      DependencyContainer.resolve<NetworkDetector>('NetworkDetector');
    if (!this.networkDetector) {
      this.networkDetector = NetworkDetector.getInstance();
    }

    // 初始化错误分析器
    this.errorAnalyzer = new ErrorAnalyzer();

    // 注册事件监听
    this.eventBus.on('request:retry', this.recordRetryAttempt.bind(this));
    this.eventBus.on('request:success', this.recordRequestSuccess.bind(this));
    this.eventBus.on('request:error', this.recordRequestError.bind(this));
  }

  public static getInstance(): RetryManager {
    if (!RetryManager.instance) {
      RetryManager.instance = new RetryManager();
    }
    return RetryManager.instance;
  }

  /**
   * 决定是否应该重试请求
   * @param url 请求URL
   * @param error 错误信息
   * @param retryCount 当前重试次数
   * @param strategy 重试策略
   * @returns 重试决策
   */
  public shouldRetry(
    url: string,
    error: any,
    retryCount: number,
    strategy: RetryStrategy
  ): RetryDecision {
    // 获取最大重试次数
    const maxRetries =
      strategy.maxRetries ?? this.adaptiveParams.defaultMaxRetries;

    // 超过最大重试次数则不再重试
    if (retryCount >= maxRetries) {
      return {
        shouldRetry: false,
        reason: 'MAX_RETRIES_EXCEEDED',
        retryDelay: 0,
      };
    }

    // 检查网络是否在线
    if (!this.networkDetector.isNetworkOnline()) {
      return {
        shouldRetry: false,
        reason: 'NETWORK_OFFLINE',
        retryDelay: 0,
      };
    }

    // 解析错误类型
    const errorType = ErrorUtils.getErrorType(error);

    // 特定错误类型分析
    switch (errorType) {
      case ErrorType.TIMEOUT:
        // 超时错误通常可重试
        return this.handleTimeoutError(url, retryCount, strategy);

      case ErrorType.SERVER_ERROR:
        // 服务器错误可重试
        return this.handleServerError(url, error, retryCount, strategy);

      case ErrorType.NETWORK_ERROR:
        // 网络错误视情况可重试
        return this.handleNetworkError(url, error, retryCount, strategy);

      case ErrorType.CLIENT_ERROR:
        // 客户端错误通常不可重试，除非特定状态码
        return this.handleClientError(url, error, retryCount, strategy);

      case ErrorType.SECURITY_ERROR:
        // 安全错误通常不可重试
        return {
          shouldRetry: false,
          reason: 'SECURITY_ERROR',
          retryDelay: 0,
        };

      case ErrorType.UNKNOWN:
      default:
        // 未知错误，基于历史统计判断
        return this.handleUnknownError(url, error, retryCount, strategy);
    }
  }

  /**
   * 处理超时错误
   */
  private handleTimeoutError(
    url: string,
    retryCount: number,
    strategy: RetryStrategy
  ): RetryDecision {
    // 检查网络质量
    const networkQuality = this.networkDetector.getCurrentNetworkQuality();

    // 差网络下增加重试延迟
    const delayMultiplier =
      RetryStrategyCalculator.getDelayMultiplierForNetworkQuality(
        networkQuality
      );

    // 计算重试延迟
    const retryDelay = RetryStrategyCalculator.calculateRetryDelay(
      retryCount,
      strategy,
      this.adaptiveParams,
      delayMultiplier
    );

    // 检查资源错误率
    const resourceKey = ErrorUtils.getResourceKey(url);
    const errorRate = this.errorAnalyzer.getResourceErrorRate(resourceKey);

    // 如果资源错误率过高，可能是服务端问题，减少重试次数
    if (errorRate > 0.7 && retryCount >= 2) {
      return {
        shouldRetry: false,
        reason: 'HIGH_ERROR_RATE',
        retryDelay: 0,
      };
    }

    return {
      shouldRetry: true,
      reason: 'TIMEOUT_RECOVERABLE',
      retryDelay,
    };
  }

  /**
   * 处理服务器错误
   */
  private handleServerError(
    url: string,
    error: any,
    retryCount: number,
    strategy: RetryStrategy
  ): RetryDecision {
    // 获取HTTP状态码
    const statusCode = ErrorUtils.getStatusCode(error);

    // 检查是否在可重试状态码列表中
    const retryableStatusCodes = strategy.retryableStatusCodes || [
      500, 502, 503, 504, 507, 429,
    ];

    if (
      !ErrorUtils.isRetryableStatusCode(statusCode, retryableStatusCodes) &&
      statusCode !== 0
    ) {
      return {
        shouldRetry: false,
        reason: 'NON_RETRYABLE_STATUS',
        retryDelay: 0,
      };
    }

    // 计算重试延迟
    let delayMultiplier = 1;

    // 对于429 (Too Many Requests)，增加延迟
    if (statusCode === 429) {
      delayMultiplier = 3;

      // 如果有Retry-After头，优先使用
      const retryAfterMs = ErrorUtils.getRetryAfterTime(error);
      if (retryAfterMs) {
        return {
          shouldRetry: true,
          reason: 'RATE_LIMITED',
          retryDelay: retryAfterMs,
        };
      }
    }

    const retryDelay = RetryStrategyCalculator.calculateRetryDelay(
      retryCount,
      strategy,
      this.adaptiveParams,
      delayMultiplier
    );

    return {
      shouldRetry: true,
      reason: `SERVER_ERROR_${statusCode}`,
      retryDelay,
    };
  }

  /**
   * 处理网络错误
   */
  private handleNetworkError(
    url: string,
    error: any,
    retryCount: number,
    strategy: RetryStrategy
  ): RetryDecision {
    // 检查网络质量
    const networkQuality = this.networkDetector.getCurrentNetworkQuality();
    const isOnline = this.networkDetector.isNetworkOnline();

    // 如果网络已断开，不重试
    if (!isOnline) {
      return {
        shouldRetry: false,
        reason: 'NETWORK_OFFLINE',
        retryDelay: 0,
      };
    }

    // 使用计算器获取基于网络质量的延迟乘数
    const delayMultiplier =
      RetryStrategyCalculator.getDelayMultiplierForNetworkQuality(
        networkQuality
      );

    // 计算重试延迟
    const retryDelay = RetryStrategyCalculator.calculateRetryDelay(
      retryCount,
      strategy,
      this.adaptiveParams,
      delayMultiplier
    );

    return {
      shouldRetry: true,
      reason: 'NETWORK_ERROR_RECOVERABLE',
      retryDelay,
    };
  }

  /**
   * 处理客户端错误
   */
  private handleClientError(
    url: string,
    error: any,
    retryCount: number,
    strategy: RetryStrategy
  ): RetryDecision {
    // 获取HTTP状态码
    const statusCode = ErrorUtils.getStatusCode(error);

    // 大多数客户端错误不可重试，但有例外
    const retryableClientCodes = strategy.retryableStatusCodes || [408, 429];

    if (!ErrorUtils.isRetryableStatusCode(statusCode, retryableClientCodes)) {
      return {
        shouldRetry: false,
        reason: 'CLIENT_ERROR_NON_RETRYABLE',
        retryDelay: 0,
      };
    }

    // 对于可重试的客户端错误，计算延迟
    let delayMultiplier = 1;

    // 对于429 (Too Many Requests)，增加延迟
    if (statusCode === 429) {
      delayMultiplier = 3;

      // 如果有Retry-After头，优先使用
      const retryAfterMs = ErrorUtils.getRetryAfterTime(error);
      if (retryAfterMs) {
        return {
          shouldRetry: true,
          reason: 'RATE_LIMITED',
          retryDelay: retryAfterMs,
        };
      }
    }

    const retryDelay = RetryStrategyCalculator.calculateRetryDelay(
      retryCount,
      strategy,
      this.adaptiveParams,
      delayMultiplier
    );

    return {
      shouldRetry: true,
      reason: `CLIENT_ERROR_${statusCode}_RETRYABLE`,
      retryDelay,
    };
  }

  /**
   * 处理未知错误
   */
  private handleUnknownError(
    url: string,
    error: any,
    retryCount: number,
    strategy: RetryStrategy
  ): RetryDecision {
    // 对于未知错误，查看历史统计来决定是否值得重试
    const errorKey = ErrorUtils.getErrorKey(error);
    const successRate = this.errorAnalyzer.getErrorSuccessRate(errorKey);

    // 如果没有历史数据，保守地重试一次
    if (successRate === null && retryCount === 0) {
      const retryDelay = RetryStrategyCalculator.calculateRetryDelay(
        retryCount,
        strategy,
        this.adaptiveParams,
        1
      );

      return {
        shouldRetry: true,
        reason: 'UNKNOWN_ERROR_FIRST_RETRY',
        retryDelay,
      };
    }

    // 如果有历史数据，基于成功率决定
    if (successRate !== null) {
      // 如果重试成功率较高，则重试
      if (successRate > 0.3) {
        const retryDelay = RetryStrategyCalculator.calculateRetryDelay(
          retryCount,
          strategy,
          this.adaptiveParams,
          1
        );

        return {
          shouldRetry: true,
          reason: 'UNKNOWN_ERROR_HISTORY_POSITIVE',
          retryDelay,
        };
      }
    }

    return {
      shouldRetry: false,
      reason: 'UNKNOWN_ERROR_LIKELY_UNRECOVERABLE',
      retryDelay: 0,
    };
  }

  /**
   * 记录重试尝试
   */
  private recordRetryAttempt(data: {
    url: string;
    error: any;
    retryCount: number;
    retryDelay: number;
  }): void {
    // 使用错误分析器记录重试尝试
    this.errorAnalyzer.recordRetryAttempt(data);
  }

  /**
   * 记录请求成功
   */
  private recordRequestSuccess(data: {
    url: string;
    retryCount: number;
  }): void {
    // 使用错误分析器记录请求成功
    this.errorAnalyzer.recordRequestSuccess(data);
  }

  /**
   * 记录请求错误
   */
  private recordRequestError(data: {
    url: string;
    error: any;
    retryCount: number;
    willRetry: boolean;
  }): void {
    // 使用错误分析器记录请求错误
    this.errorAnalyzer.recordRequestError(data);
  }

  /**
   * 获取重试历史
   */
  public getRetryHistory(): RetryHistoryItem[] {
    return this.errorAnalyzer.getRetryHistory();
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): any {
    return this.errorAnalyzer.getErrorStats();
  }

  /**
   * 获取资源错误率
   */
  public getResourceErrorRates(): any {
    return this.errorAnalyzer.getResourceErrorRates();
  }

  /**
   * 清除历史数据
   */
  public clearHistory(): void {
    this.errorAnalyzer.clearHistory();
  }

  /**
   * 重置错误统计
   */
  public resetErrorStats(): void {
    this.errorAnalyzer.resetErrorStats();
  }

  /**
   * 调整自适应参数
   */
  public setAdaptiveParams(params: Partial<AdaptiveRetryParams>): void {
    this.adaptiveParams = {
      ...this.adaptiveParams,
      ...params,
    };

    this.logger.info('已更新自适应重试参数', this.adaptiveParams);
  }

  /**
   * 分析重试效果
   */
  public analyzeRetryEffectiveness(): {
    overallSuccessRate: number;
    byErrorType: Record<
      string,
      {
        count: number;
        successRate: number;
      }
    >;
    recommendations: string[];
  } {
    return this.errorAnalyzer.analyzeRetryEffectiveness();
  }

  /**
   * 优化特定URL的重试策略
   */
  public optimizeStrategyForUrl(url: string): RetryStrategy {
    const resourceKey = ErrorUtils.getResourceKey(url);
    const errorRate = this.errorAnalyzer.getResourceErrorRate(resourceKey);

    // 获取网络质量进行策略优化
    const networkQuality = this.networkDetector.getCurrentNetworkQuality();

    // 默认策略
    const defaultStrategy: RetryStrategy = {
      maxRetries: this.adaptiveParams.defaultMaxRetries,
      retryDelay: this.adaptiveParams.baseDelay,
      backoffFactor: this.adaptiveParams.factor,
      maxRetryDelay: this.adaptiveParams.maxDelay,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504, 507],
    };

    // 使用RetryStrategyCalculator优化策略
    return RetryStrategyCalculator.optimizeStrategyByErrorRate(
      defaultStrategy,
      errorRate,
      networkQuality,
      this.adaptiveParams
    );
  }

  /**
   * 预测重试成功率
   */
  public predictRetrySuccess(url: string, error: any): number {
    const errorType = ErrorUtils.getErrorType(error);
    const errorKey = ErrorUtils.getErrorKey(error);
    const resourceKey = ErrorUtils.getResourceKey(url);

    // 获取历史成功率数据
    const historicalSuccessRate =
      this.errorAnalyzer.getErrorSuccessRate(errorKey);

    // 计算资源成功率
    const resourceErrorRate =
      this.errorAnalyzer.getResourceErrorRate(resourceKey);
    const resourceSuccessRate =
      resourceErrorRate > 0 ? 1 - resourceErrorRate : null;

    // 获取网络质量
    const networkQuality = this.networkDetector.getCurrentNetworkQuality();

    // 使用RetryStrategyCalculator预测成功率
    return RetryStrategyCalculator.predictRetrySuccess(
      errorType,
      historicalSuccessRate,
      resourceSuccessRate,
      networkQuality
    );
  }

  /**
   * 销毁实例，清理资源
   */
  public destroy(): void {
    // 解除事件监听
    this.eventBus.off('request:retry', this.recordRetryAttempt);
    this.eventBus.off('request:success', this.recordRequestSuccess);
    this.eventBus.off('request:error', this.recordRequestError);

    this.logger.info('RetryManager已销毁');
    RetryManager.instance = undefined as unknown as RetryManager;
  }
}

export default RetryManager;
