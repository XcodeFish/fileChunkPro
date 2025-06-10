/**
 * ErrorAnalyzer - 错误分析与统计
 *
 * 功能：
 * 1. 错误历史记录与分析
 * 2. 资源错误率计算
 * 3. 重试效果统计
 * 4. 重试优化建议生成
 */

import { RetryHistoryItem } from '../types/network';
import { ErrorUtils } from '../utils/ErrorUtils';
import { Logger } from '../utils/Logger';

export interface ErrorStats {
  count: number; // 错误总次数
  successfulRetries: number; // 成功的重试次数
  lastSeen: number; // 上次出现时间
}

export interface ResourceErrorStats {
  attempts: number; // 总尝试次数
  failures: number; // 失败次数
  rate: number; // 错误率
}

export class ErrorAnalyzer {
  private logger: Logger;

  // 错误统计
  private errorStats: Map<string, ErrorStats> = new Map();

  // 资源错误率
  private resourceErrorRates: Map<string, ResourceErrorStats> = new Map();

  // 重试历史
  private retryHistory: RetryHistoryItem[] = [];
  private maxHistoryItems = 100;

  constructor() {
    this.logger = new Logger('ErrorAnalyzer');
  }

  /**
   * 记录重试尝试
   */
  public recordRetryAttempt(data: {
    url: string;
    error: any;
    retryCount: number;
    retryDelay: number;
  }): void {
    const { url, error, retryCount, retryDelay } = data;

    // 提取错误类型和关键信息
    const errorType = ErrorUtils.getErrorType(error);
    const errorKey = ErrorUtils.getErrorKey(error);

    // 记录到历史
    this.retryHistory.push({
      timestamp: Date.now(),
      url,
      errorType,
      errorDetails: errorKey,
      retryCount,
      retryDelay,
      success: false, // 暂时标记为失败，如果后续成功会更新
    });

    // 限制历史记录大小
    if (this.retryHistory.length > this.maxHistoryItems) {
      this.retryHistory.shift();
    }

    this.logger.debug('尝试重试请求', {
      url,
      retryCount,
      retryDelay,
      errorType,
    });
  }

  /**
   * 记录请求成功
   */
  public recordRequestSuccess(data: { url: string; retryCount: number }): void {
    const { url, retryCount } = data;

    // 如果是重试成功的请求
    if (retryCount > 0) {
      // 更新重试历史
      for (let i = this.retryHistory.length - 1; i >= 0; i--) {
        const item = this.retryHistory[i];
        if (item.url === url && item.retryCount < retryCount) {
          // 找到相关的重试记录，标记为成功
          this.retryHistory[i].success = true;
          break;
        }
      }

      // 更新错误统计
      const recentItem = this.retryHistory.find(item => item.url === url);
      if (recentItem) {
        const errorKey = recentItem.errorDetails;
        const errorData = this.errorStats.get(errorKey) || {
          count: 0,
          successfulRetries: 0,
          lastSeen: 0,
        };

        errorData.count++;
        errorData.successfulRetries++;
        errorData.lastSeen = Date.now();

        this.errorStats.set(errorKey, errorData);
      }

      this.logger.debug('重试请求成功', {
        url,
        retryCount,
      });
    }

    // 更新资源成功率
    const resourceKey = ErrorUtils.getResourceKey(url);
    const resourceData = this.resourceErrorRates.get(resourceKey) || {
      attempts: 0,
      failures: 0,
      rate: 0,
    };

    resourceData.attempts++;
    resourceData.rate = resourceData.failures / resourceData.attempts;

    this.resourceErrorRates.set(resourceKey, resourceData);
  }

  /**
   * 记录请求错误
   */
  public recordRequestError(data: {
    url: string;
    error: any;
    retryCount: number;
    willRetry: boolean;
  }): void {
    const { url, error, retryCount, willRetry } = data;

    // 如果不会重试，这是最终失败
    if (!willRetry) {
      // 更新错误统计
      const errorKey = ErrorUtils.getErrorKey(error);
      const errorData = this.errorStats.get(errorKey) || {
        count: 0,
        successfulRetries: 0,
        lastSeen: 0,
      };

      errorData.count++;
      errorData.lastSeen = Date.now();

      this.errorStats.set(errorKey, errorData);

      // 更新资源错误率
      const resourceKey = ErrorUtils.getResourceKey(url);
      const resourceData = this.resourceErrorRates.get(resourceKey) || {
        attempts: 0,
        failures: 0,
        rate: 0,
      };

      resourceData.attempts++;
      resourceData.failures++;
      resourceData.rate = resourceData.failures / resourceData.attempts;

      this.resourceErrorRates.set(resourceKey, resourceData);

      this.logger.debug('请求失败且不再重试', {
        url,
        retryCount,
        errorType: ErrorUtils.getErrorType(error),
      });
    }
  }

  /**
   * 获取重试历史
   */
  public getRetryHistory(): RetryHistoryItem[] {
    return [...this.retryHistory];
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): Map<string, ErrorStats> {
    return new Map(this.errorStats);
  }

  /**
   * 获取资源错误率
   */
  public getResourceErrorRates(): Map<string, ResourceErrorStats> {
    return new Map(this.resourceErrorRates);
  }

  /**
   * 获取特定资源的错误率
   */
  public getResourceErrorRate(resourceKey: string): number {
    const data = this.resourceErrorRates.get(resourceKey);
    if (!data || data.attempts === 0) {
      return 0;
    }

    return data.rate;
  }

  /**
   * 获取特定错误的历史成功率
   */
  public getErrorSuccessRate(errorKey: string): number | null {
    const data = this.errorStats.get(errorKey);
    if (!data || data.count === 0) {
      return null;
    }

    return data.successfulRetries / data.count;
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
    // 如果没有历史数据，返回空分析
    if (this.retryHistory.length === 0) {
      return {
        overallSuccessRate: 0,
        byErrorType: {},
        recommendations: ['暂无足够的重试数据进行分析'],
      };
    }

    // 统计总体重试成功率
    const totalRetries = this.retryHistory.length;
    const successfulRetries = this.retryHistory.filter(
      item => item.success
    ).length;
    const overallSuccessRate =
      totalRetries > 0 ? successfulRetries / totalRetries : 0;

    // 按错误类型分组
    const byErrorType: Record<
      string,
      {
        count: number;
        successCount: number;
        successRate: number;
      }
    > = {};

    for (const item of this.retryHistory) {
      const errorType = item.errorType;
      if (!byErrorType[errorType]) {
        byErrorType[errorType] = {
          count: 0,
          successCount: 0,
          successRate: 0,
        };
      }

      byErrorType[errorType].count++;
      if (item.success) {
        byErrorType[errorType].successCount++;
      }
    }

    // 计算每种错误类型的成功率
    for (const [, data] of Object.entries(byErrorType)) {
      data.successRate = data.count > 0 ? data.successCount / data.count : 0;
    }

    // 生成优化建议
    const recommendations: string[] = [];

    if (overallSuccessRate < 0.3) {
      recommendations.push(
        '整体重试成功率较低，考虑减少重试次数或增加重试延迟'
      );
    }

    // 针对不同错误类型生成建议
    for (const [errorType, data] of Object.entries(byErrorType)) {
      if (data.count >= 5) {
        // 只对有足够样本的错误类型提建议
        if (data.successRate < 0.2) {
          recommendations.push(
            `${errorType}类型错误重试成功率极低，考虑不重试此类错误`
          );
        } else if (data.successRate < 0.5) {
          recommendations.push(
            `${errorType}类型错误重试成功率较低，考虑增加重试延迟`
          );
        } else if (data.successRate > 0.8) {
          recommendations.push(
            `${errorType}类型错误重试成功率高，当前策略有效`
          );
        }
      }
    }

    // 转换格式以符合返回类型
    const result: Record<string, { count: number; successRate: number }> = {};
    for (const [errorType, data] of Object.entries(byErrorType)) {
      result[errorType] = {
        count: data.count,
        successRate: data.successRate,
      };
    }

    return {
      overallSuccessRate,
      byErrorType: result,
      recommendations,
    };
  }

  /**
   * 清除历史数据
   */
  public clearHistory(): void {
    this.retryHistory = [];
    this.logger.info('重试历史记录已清除');
  }

  /**
   * 重置错误统计
   */
  public resetErrorStats(): void {
    this.errorStats.clear();
    this.resourceErrorRates.clear();
    this.logger.info('错误统计数据已重置');
  }
}

export default ErrorAnalyzer;
