/**
 * 重试策略选择器
 * 负责根据错误分析结果选择最佳重试策略
 */
import {
  RetryStrategyType,
  RetryStrategySelectorConfig,
  ErrorAnalysisResult,
  UploadErrorType,
  ErrorGroup,
  NetworkQuality,
} from '../../types';

/**
 * 重试策略选择器
 */
export class RetryStrategySelector {
  /**
   * 策略选择器配置
   */
  private config: RetryStrategySelectorConfig;

  /**
   * 历史数据
   */
  private historicalData: {
    successRateByStrategy: Record<
      RetryStrategyType,
      { success: number; total: number }
    >;
    errorTypeStrategySuccess: Record<
      UploadErrorType,
      Record<RetryStrategyType, number>
    >;
  };

  /**
   * 创建策略选择器
   * @param config 配置选项
   */
  constructor(config?: Partial<RetryStrategySelectorConfig>) {
    // 默认配置
    const defaultConfig: RetryStrategySelectorConfig = {
      defaultStrategyType: RetryStrategyType.EXPONENTIAL_BACKOFF,
      errorTypeStrategies: {
        [UploadErrorType.NETWORK_ERROR]: RetryStrategyType.JITTERED_BACKOFF,
        [UploadErrorType.TIMEOUT_ERROR]: RetryStrategyType.EXPONENTIAL_BACKOFF,
        [UploadErrorType.SERVER_ERROR]: RetryStrategyType.LINEAR_BACKOFF,
        [UploadErrorType.UPLOAD_ERROR]: RetryStrategyType.EXPONENTIAL_BACKOFF,
        [UploadErrorType.RATE_LIMIT_ERROR]: RetryStrategyType.STEPPED_INTERVAL,
        [UploadErrorType.CONNECTION_RESET_ERROR]:
          RetryStrategyType.JITTERED_BACKOFF,
      },
      errorGroupStrategies: {
        [ErrorGroup.NETWORK]: RetryStrategyType.JITTERED_BACKOFF,
        [ErrorGroup.SERVER]: RetryStrategyType.LINEAR_BACKOFF,
        [ErrorGroup.RESOURCE]: RetryStrategyType.STEPPED_INTERVAL,
        [ErrorGroup.DATA]: RetryStrategyType.EXPONENTIAL_BACKOFF,
      },
      enableAdaptiveSelection: true,
      useHistoricalData: true,
    };

    // 合并配置
    this.config = {
      ...defaultConfig,
      ...config,
      errorTypeStrategies: {
        ...defaultConfig.errorTypeStrategies,
        ...(config?.errorTypeStrategies || {}),
      },
      errorGroupStrategies: {
        ...defaultConfig.errorGroupStrategies,
        ...(config?.errorGroupStrategies || {}),
      },
    };

    // 初始化历史数据
    this.historicalData = {
      successRateByStrategy: {
        [RetryStrategyType.FIXED_INTERVAL]: { success: 0, total: 0 },
        [RetryStrategyType.EXPONENTIAL_BACKOFF]: { success: 0, total: 0 },
        [RetryStrategyType.JITTERED_BACKOFF]: { success: 0, total: 0 },
        [RetryStrategyType.LINEAR_BACKOFF]: { success: 0, total: 0 },
        [RetryStrategyType.NETWORK_ADAPTIVE]: { success: 0, total: 0 },
        [RetryStrategyType.ERROR_ADAPTIVE]: { success: 0, total: 0 },
        [RetryStrategyType.STEPPED_INTERVAL]: { success: 0, total: 0 },
        [RetryStrategyType.CUSTOM]: { success: 0, total: 0 },
      },
      errorTypeStrategySuccess: Object.values(UploadErrorType).reduce(
        (acc, type) => {
          acc[type] = Object.values(RetryStrategyType).reduce(
            (stratAcc, strat) => {
              stratAcc[strat] = 0;
              return stratAcc;
            },
            {} as Record<RetryStrategyType, number>
          );
          return acc;
        },
        {} as Record<UploadErrorType, Record<RetryStrategyType, number>>
      ),
    };
  }

  /**
   * 选择重试策略
   * @param analysisResult 错误分析结果
   * @param networkQuality 当前网络质量
   * @param attempt 当前尝试次数
   * @returns 重试策略类型
   */
  public selectStrategy(
    analysisResult: ErrorAnalysisResult,
    networkQuality?: NetworkQuality,
    attempt = 1
  ): RetryStrategyType {
    // 如果有自定义选择函数，优先使用
    if (this.config.customSelector) {
      const errorContext = analysisResult.context || {};
      const error = new Error('Retry error');
      Object.defineProperty(error, 'type', { value: analysisResult.errorType });

      const customStrategy = this.config.customSelector(error, {
        ...errorContext,
        networkQuality,
        attempt,
      });

      if (customStrategy) {
        return customStrategy;
      }
    }

    // 根据错误类型映射获取策略
    if (
      this.config.errorTypeStrategies &&
      this.config.errorTypeStrategies[analysisResult.errorType]
    ) {
      return this.config.errorTypeStrategies[analysisResult.errorType];
    }

    // 根据错误组映射获取策略
    if (
      this.config.errorGroupStrategies &&
      this.config.errorGroupStrategies[analysisResult.errorGroup]
    ) {
      return this.config.errorGroupStrategies[analysisResult.errorGroup];
    }

    // 如果启用自适应选择，基于网络质量选择策略
    if (this.config.enableAdaptiveSelection && networkQuality) {
      return this.selectAdaptiveStrategy(
        networkQuality,
        analysisResult.errorType,
        attempt
      );
    }

    // 如果启用历史数据，基于历史成功率选择策略
    if (this.config.useHistoricalData && attempt > 1) {
      return this.selectStrategyFromHistory(analysisResult.errorType);
    }

    // 使用默认策略
    return this.config.defaultStrategyType;
  }

  /**
   * 基于网络质量选择自适应策略
   * @param networkQuality 网络质量
   * @param errorType 错误类型
   * @param attempt 尝试次数
   * @returns 重试策略类型
   */
  private selectAdaptiveStrategy(
    networkQuality: NetworkQuality,
    errorType: UploadErrorType,
    attempt: number
  ): RetryStrategyType {
    // 网络错误相关的类型
    const networkErrorTypes = [
      UploadErrorType.NETWORK_ERROR,
      UploadErrorType.TIMEOUT_ERROR,
      UploadErrorType.CONNECTION_RESET_ERROR,
      UploadErrorType.SERVER_UNREACHABLE_ERROR,
      UploadErrorType.DNS_RESOLUTION_ERROR,
    ];

    // 服务器错误相关的类型
    const serverErrorTypes = [
      UploadErrorType.SERVER_ERROR,
      UploadErrorType.API_ERROR,
      UploadErrorType.RATE_LIMIT_ERROR,
    ];

    // 根据网络质量和错误类型选择策略
    if (networkErrorTypes.includes(errorType)) {
      switch (networkQuality) {
        case NetworkQuality.POOR:
          return attempt > 2
            ? RetryStrategyType.STEPPED_INTERVAL
            : RetryStrategyType.JITTERED_BACKOFF;
        case NetworkQuality.LOW:
        case NetworkQuality.MEDIUM:
          return RetryStrategyType.JITTERED_BACKOFF;
        case NetworkQuality.GOOD:
        case NetworkQuality.EXCELLENT:
          return RetryStrategyType.EXPONENTIAL_BACKOFF;
        default:
          return RetryStrategyType.JITTERED_BACKOFF;
      }
    }

    if (serverErrorTypes.includes(errorType)) {
      switch (networkQuality) {
        case NetworkQuality.POOR:
        case NetworkQuality.LOW:
          return RetryStrategyType.STEPPED_INTERVAL;
        default:
          return errorType === UploadErrorType.RATE_LIMIT_ERROR
            ? RetryStrategyType.STEPPED_INTERVAL
            : RetryStrategyType.LINEAR_BACKOFF;
      }
    }

    // 根据尝试次数动态调整策略
    if (attempt > 3) {
      return RetryStrategyType.STEPPED_INTERVAL;
    } else if (attempt > 1) {
      return RetryStrategyType.EXPONENTIAL_BACKOFF;
    }

    return RetryStrategyType.JITTERED_BACKOFF;
  }

  /**
   * 基于历史数据选择策略
   * @param errorType 错误类型
   * @returns 重试策略类型
   */
  private selectStrategyFromHistory(
    errorType: UploadErrorType
  ): RetryStrategyType {
    // 获取针对该错误类型成功率最高的策略
    const errorTypeStrategies =
      this.historicalData.errorTypeStrategySuccess[errorType];

    if (errorTypeStrategies) {
      const bestStrategy = Object.entries(errorTypeStrategies).reduce(
        (best, [strategy, successCount]) => {
          return successCount > best.successCount
            ? { strategy: strategy as RetryStrategyType, successCount }
            : best;
        },
        { strategy: this.config.defaultStrategyType, successCount: -1 }
      );

      if (bestStrategy.successCount > 0) {
        return bestStrategy.strategy;
      }
    }

    // 获取总体成功率最高的策略
    const successRates = Object.entries(
      this.historicalData.successRateByStrategy
    ).map(([strategy, { success, total }]) => ({
      strategy: strategy as RetryStrategyType,
      rate: total > 0 ? success / total : 0,
      total,
    }));

    // 过滤至少有3次尝试的策略
    const validStrategies = successRates.filter(s => s.total >= 3);

    if (validStrategies.length > 0) {
      const bestStrategy = validStrategies.reduce((best, current) => {
        return current.rate > best.rate ? current : best;
      });

      if (bestStrategy.rate > 0) {
        return bestStrategy.strategy;
      }
    }

    return this.config.defaultStrategyType;
  }

  /**
   * 记录重试结果
   * @param errorType 错误类型
   * @param strategyType 策略类型
   * @param success 是否成功
   */
  public recordRetryResult(
    errorType: UploadErrorType,
    strategyType: RetryStrategyType,
    success: boolean
  ): void {
    // 更新策略成功率统计
    const strategyStats =
      this.historicalData.successRateByStrategy[strategyType];
    if (strategyStats) {
      strategyStats.total += 1;
      if (success) {
        strategyStats.success += 1;

        // 更新错误类型策略成功计数
        if (this.historicalData.errorTypeStrategySuccess[errorType]) {
          this.historicalData.errorTypeStrategySuccess[errorType][
            strategyType
          ] += 1;
        }
      }
    }
  }

  /**
   * 获取历史成功率数据
   * @returns 历史成功率数据
   */
  public getSuccessRateData(): Record<RetryStrategyType, number> {
    return Object.entries(this.historicalData.successRateByStrategy).reduce(
      (acc, [strategy, { success, total }]) => {
        acc[strategy as RetryStrategyType] = total > 0 ? success / total : 0;
        return acc;
      },
      {} as Record<RetryStrategyType, number>
    );
  }

  /**
   * 重置历史数据
   */
  public resetHistoricalData(): void {
    Object.values(RetryStrategyType).forEach(strategy => {
      this.historicalData.successRateByStrategy[strategy] = {
        success: 0,
        total: 0,
      };
    });

    Object.values(UploadErrorType).forEach(errorType => {
      Object.values(RetryStrategyType).forEach(strategy => {
        this.historicalData.errorTypeStrategySuccess[errorType][strategy] = 0;
      });
    });
  }
}
