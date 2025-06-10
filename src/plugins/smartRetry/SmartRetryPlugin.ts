/**
 * 智能重试插件
 * 提供基于错误分析和网络状态的智能重试策略
 */
import { IPlugin } from '../interfaces';
import {
  SmartRetryPluginOptions,
  RetryHistoryEntry,
  RetryStats,
  RetryStrategyType,
  UploadErrorType,
  NetworkQuality,
} from '../../types';
import { ErrorAnalysisEngine } from './ErrorAnalysisEngine';
import { RetryStrategySelector } from './RetryStrategySelector';
import { BackoffStrategyFactory } from './BackoffStrategies';
import UploaderCore from '../../core/UploaderCore';

/**
 * 智能重试插件
 */
export class SmartRetryPlugin implements IPlugin {
  /**
   * 插件名称
   */
  public name = 'SmartRetryPlugin';

  /**
   * 错误分析引擎
   */
  private errorAnalysisEngine: ErrorAnalysisEngine;

  /**
   * 策略选择器
   */
  private strategySelector: RetryStrategySelector;

  /**
   * 插件配置
   */
  private options: SmartRetryPluginOptions;

  /**
   * UploaderCore实例
   */
  private core: UploaderCore | null = null;

  /**
   * 重试历史记录
   */
  private retryHistory: RetryHistoryEntry[] = [];

  /**
   * 重试统计信息
   */
  private retryStats: RetryStats = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    retriesByErrorType: {} as Record<UploadErrorType, number>,
    retriesByStrategyType: {} as Record<RetryStrategyType, number>,
    avgRetryDelay: 0,
    avgRetrySuccessRate: 0,
  };

  /**
   * 清理历史数据的定时器
   */
  private cleanupTimer: number | null = null;

  /**
   * 创建智能重试插件
   * @param options 插件配置
   */
  constructor(options: SmartRetryPluginOptions = {}) {
    // 默认配置
    const defaultOptions: SmartRetryPluginOptions = {
      enabled: true,
      maxRetries: 5,
      enableHistoricalAnalysis: true,
      historicalDataRetention: 30 * 60 * 1000, // 30分钟
      debug: false,
      exponentialBackoffConfig: {
        initialDelay: 1000,
        maxDelay: 60000,
        factor: 2,
        jitter: 0.2,
      },
      linearBackoffConfig: {
        initialDelay: 1000,
        maxDelay: 30000,
        increment: 1000,
      },
      steppedIntervalConfig: {
        intervals: [1000, 2000, 5000, 10000, 30000, 60000],
      },
      networkAdaptiveConfig: {
        initialDelay: 1000,
        maxDelay: 60000,
        baseFactor: 2,
      },
    };

    // 合并配置
    this.options = {
      ...defaultOptions,
      ...options,
      exponentialBackoffConfig: {
        ...defaultOptions.exponentialBackoffConfig,
        ...options.exponentialBackoffConfig,
      },
      linearBackoffConfig: {
        ...defaultOptions.linearBackoffConfig,
        ...options.linearBackoffConfig,
      },
      steppedIntervalConfig: {
        ...defaultOptions.steppedIntervalConfig,
        ...options.steppedIntervalConfig,
      },
      networkAdaptiveConfig: {
        ...defaultOptions.networkAdaptiveConfig,
        ...options.networkAdaptiveConfig,
      },
    };

    // 初始化错误分析引擎
    this.errorAnalysisEngine = new ErrorAnalysisEngine(
      this.options.errorTypeMaxRetries,
      options.shouldRetryMap
        ? Object.entries(options.shouldRetryMap)
            .filter(([_, shouldRetry]) => !shouldRetry)
            .map(([type]) => type as UploadErrorType)
        : undefined
    );

    // 初始化策略选择器
    this.strategySelector = new RetryStrategySelector(
      this.options.strategySelectorConfig
    );

    // 初始化重试统计
    this.initializeRetryStats();
  }

  /**
   * 安装插件
   * @param core UploaderCore实例
   */
  public install(core: UploaderCore): void {
    if (!this.options.enabled) {
      return;
    }

    this.core = core;

    // 注册钩子
    this.registerHooks();

    // 启动历史数据清理定时器
    if (
      this.options.enableHistoricalAnalysis &&
      this.options.historicalDataRetention
    ) {
      this.startHistoryCleanup();
    }

    // 日志
    if (this.options.debug) {
      console.log('SmartRetryPlugin installed');
    }
  }

  /**
   * 卸载插件
   */
  public uninstall(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.core = null;

    // 日志
    if (this.options.debug) {
      console.log('SmartRetryPlugin uninstalled');
    }
  }

  /**
   * 注册钩子
   */
  private registerHooks(): void {
    if (!this.core) return;

    // 处理分片上传错误
    this.core.hook('chunkUploadError', async data => {
      const { index, fileId, error, attempt } = data;

      // 如果已经达到最大重试次数，不再处理
      if (attempt > (this.options.maxRetries || 5)) {
        return { handled: false };
      }

      // 分析错误
      const analysisResult = this.errorAnalysisEngine.analyzeError(error, {
        fileId,
        chunkIndex: index,
        attempt,
      });

      // 如果错误不可恢复，不再重试
      if (!analysisResult.isRecoverable) {
        return { handled: false };
      }

      // 获取网络质量
      let networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
      try {
        if (this.core?.getNetworkStatus) {
          const networkStatus = this.core.getNetworkStatus();
          networkQuality = networkStatus.quality;
        }
      } catch (e) {
        // 忽略错误
      }

      // 选择重试策略
      const strategyType = this.strategySelector.selectStrategy(
        analysisResult,
        networkQuality,
        attempt
      );

      // 创建对应的退避策略
      const backoffStrategy = BackoffStrategyFactory.createStrategy(
        strategyType,
        this.getBackoffConfig(strategyType)
      );

      // 计算延迟时间
      const delay = backoffStrategy.calculateDelay(attempt, {
        errorType: analysisResult.errorType,
        networkQuality,
        ...analysisResult.context,
      });

      // 记录重试历史
      this.recordRetryAttempt({
        fileId,
        chunkIndex: index,
        attempt,
        errorType: analysisResult.errorType,
        strategyType,
        delay,
        timestamp: Date.now(),
        networkQuality,
      });

      // 发送重试事件
      if (this.core) {
        this.core.emit('smartRetry', {
          fileId,
          chunkIndex: index,
          attempt,
          errorType: analysisResult.errorType,
          strategyType,
          delay,
          analysisResult,
        });
      }

      // 日志
      if (this.options.debug) {
        console.log(
          `SmartRetryPlugin: 重试分片 ${index} (文件 ${fileId}), 尝试 ${attempt}, 策略 ${strategyType}, 延迟 ${delay}ms`
        );
      }

      // 返回处理结果，包含推荐的延迟时间
      return {
        handled: true,
        result: {
          retryDelay: delay,
          shouldRetry: true,
        },
        modified: true,
      };
    });

    // 处理分片上传成功
    this.core.hook('chunkUploadSuccess', async data => {
      const { index, fileId } = data;

      // 检查是否是重试成功
      const latestRetry = this.findLatestRetryAttempt(fileId, index);

      if (latestRetry) {
        // 更新重试记录为成功
        latestRetry.success = true;

        // 更新统计信息
        this.retryStats.successfulRetries += 1;

        // 更新策略选择器的历史数据
        this.strategySelector.recordRetryResult(
          latestRetry.errorType,
          latestRetry.strategyType,
          true
        );

        // 日志
        if (this.options.debug) {
          console.log(
            `SmartRetryPlugin: 分片 ${index} (文件 ${fileId}) 重试成功, 策略 ${latestRetry.strategyType}`
          );
        }
      }

      return { handled: false };
    });
  }

  /**
   * 根据策略类型获取对应的配置
   * @param strategyType 策略类型
   * @returns 配置对象
   */
  private getBackoffConfig(
    strategyType: RetryStrategyType
  ): Record<string, any> {
    switch (strategyType) {
      case RetryStrategyType.EXPONENTIAL_BACKOFF:
        return this.options.exponentialBackoffConfig || {};
      case RetryStrategyType.JITTERED_BACKOFF:
        return {
          ...(this.options.exponentialBackoffConfig || {}),
          jitter: 0.3,
        };
      case RetryStrategyType.LINEAR_BACKOFF:
        return this.options.linearBackoffConfig || {};
      case RetryStrategyType.STEPPED_INTERVAL:
        return this.options.steppedIntervalConfig || {};
      case RetryStrategyType.NETWORK_ADAPTIVE:
        return this.options.networkAdaptiveConfig || {};
      default:
        return {};
    }
  }

  /**
   * 初始化重试统计
   */
  private initializeRetryStats(): void {
    // 初始化错误类型统计
    Object.values(UploadErrorType).forEach(type => {
      this.retryStats.retriesByErrorType[type] = 0;
    });

    // 初始化策略类型统计
    Object.values(RetryStrategyType).forEach(type => {
      this.retryStats.retriesByStrategyType[type] = 0;
    });
  }

  /**
   * 记录重试尝试
   * @param entry 重试记录条目
   */
  private recordRetryAttempt(entry: RetryHistoryEntry): void {
    // 添加到历史记录
    this.retryHistory.push(entry);

    // 更新统计信息
    this.retryStats.totalRetries += 1;

    // 更新错误类型统计
    if (this.retryStats.retriesByErrorType[entry.errorType] !== undefined) {
      this.retryStats.retriesByErrorType[entry.errorType] += 1;
    }

    // 更新策略类型统计
    if (
      this.retryStats.retriesByStrategyType[entry.strategyType] !== undefined
    ) {
      this.retryStats.retriesByStrategyType[entry.strategyType] += 1;
    }

    // 更新平均延迟
    const totalDelay = this.retryHistory.reduce(
      (sum, item) => sum + item.delay,
      0
    );
    this.retryStats.avgRetryDelay =
      this.retryHistory.length > 0 ? totalDelay / this.retryHistory.length : 0;

    // 更新平均成功率
    const successfulRetries = this.retryHistory.filter(
      item => item.success
    ).length;
    this.retryStats.avgRetrySuccessRate =
      this.retryHistory.length > 0
        ? successfulRetries / this.retryHistory.length
        : 0;
  }

  /**
   * 查找最近的重试记录
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   * @returns 重试记录条目或undefined
   */
  private findLatestRetryAttempt(
    fileId: string,
    chunkIndex: number
  ): RetryHistoryEntry | undefined {
    // 倒序查找，获取最近的记录
    return this.retryHistory
      .slice()
      .reverse()
      .find(
        entry => entry.fileId === fileId && entry.chunkIndex === chunkIndex
      );
  }

  /**
   * 启动历史数据清理定时器
   */
  private startHistoryCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    const cleanupInterval = Math.max(
      60000, // 最小1分钟
      (this.options.historicalDataRetention || 30 * 60 * 1000) / 10 // 数据保留时间的1/10
    );

    this.cleanupTimer = window.setInterval(() => {
      this.cleanupHistoryData();
    }, cleanupInterval);
  }

  /**
   * 清理过期的历史数据
   */
  private cleanupHistoryData(): void {
    if (!this.options.historicalDataRetention) return;

    const now = Date.now();
    const cutoffTime = now - this.options.historicalDataRetention;

    // 筛选出未过期的记录
    const newHistory = this.retryHistory.filter(
      entry => entry.timestamp >= cutoffTime
    );

    // 如果有记录被清理，重新计算统计信息
    if (newHistory.length < this.retryHistory.length) {
      this.retryHistory = newHistory;

      // 重置统计信息
      this.initializeRetryStats();

      // 重新计算统计信息
      newHistory.forEach(entry => {
        this.retryStats.totalRetries += 1;

        if (entry.success) {
          this.retryStats.successfulRetries += 1;
        } else {
          this.retryStats.failedRetries += 1;
        }

        if (this.retryStats.retriesByErrorType[entry.errorType] !== undefined) {
          this.retryStats.retriesByErrorType[entry.errorType] += 1;
        }

        if (
          this.retryStats.retriesByStrategyType[entry.strategyType] !==
          undefined
        ) {
          this.retryStats.retriesByStrategyType[entry.strategyType] += 1;
        }
      });

      // 更新平均延迟
      const totalDelay = newHistory.reduce((sum, item) => sum + item.delay, 0);
      this.retryStats.avgRetryDelay =
        newHistory.length > 0 ? totalDelay / newHistory.length : 0;

      // 更新平均成功率
      const successfulRetries = newHistory.filter(item => item.success).length;
      this.retryStats.avgRetrySuccessRate =
        newHistory.length > 0 ? successfulRetries / newHistory.length : 0;

      // 日志
      if (this.options.debug) {
        console.log(
          `SmartRetryPlugin: 清理了 ${this.retryHistory.length - newHistory.length} 条历史记录`
        );
      }
    }
  }

  /**
   * 获取重试统计信息
   * @returns 重试统计信息
   */
  public getRetryStats(): RetryStats {
    return { ...this.retryStats };
  }

  /**
   * 获取重试历史记录
   * @param limit 限制返回的记录数量
   * @returns 重试历史记录
   */
  public getRetryHistory(limit?: number): RetryHistoryEntry[] {
    // 复制一份，并按时间倒序排序
    const sortedHistory = [...this.retryHistory].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    // 如果有限制，返回指定数量
    return limit ? sortedHistory.slice(0, limit) : sortedHistory;
  }

  /**
   * 清除所有历史数据
   */
  public clearHistory(): void {
    this.retryHistory = [];
    this.initializeRetryStats();
    this.strategySelector.resetHistoricalData();

    // 日志
    if (this.options.debug) {
      console.log('SmartRetryPlugin: 已清除所有历史数据');
    }
  }
}
