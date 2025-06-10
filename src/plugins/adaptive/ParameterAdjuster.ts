import {
  IParameterAdjuster,
  INetworkQualityResult,
  IUploadParameters,
  NetworkQualityLevel,
  ParameterAdjusterOptions,
} from '../../types/AdaptiveUploadTypes';

/**
 * 参数调整器
 * 根据网络质量动态调整上传参数
 */
export class ParameterAdjuster implements IParameterAdjuster {
  private options: Required<ParameterAdjusterOptions>;
  private historicalData: Array<{
    networkQuality: INetworkQualityResult;
    parameters: IUploadParameters;
    success: boolean;
    transferRate?: number;
  }> = [];
  private readonly MAX_HISTORY_SIZE = 20;
  private presetParameters: Record<NetworkQualityLevel, IUploadParameters>;

  /**
   * 参数调整器构造函数
   * @param options 配置选项
   */
  constructor(options: ParameterAdjusterOptions) {
    // 合并默认配置
    this.options = {
      minChunkSize: 128 * 1024, // 128KB
      maxChunkSize: 4 * 1024 * 1024, // 4MB
      minConcurrency: 1,
      maxConcurrency: 6,
      presetParameters: {},
      enableAdaptiveLearning: true,
      ...options,
    };

    // 初始化默认参数预设
    this.presetParameters = this.initPresetParameters();

    // 用用户自定义预设覆盖默认预设
    if (options.presetParameters) {
      Object.keys(options.presetParameters).forEach(key => {
        const qualityLevel = key as NetworkQualityLevel;
        this.presetParameters[qualityLevel] = {
          ...this.presetParameters[qualityLevel],
          ...options.presetParameters![qualityLevel],
        };
      });
    }
  }

  /**
   * 根据网络质量调整上传参数
   * @param networkQuality 网络质量结果
   * @param currentParameters 当前参数
   * @returns 调整后的参数
   */
  public adjustParameters(
    networkQuality: INetworkQualityResult,
    currentParameters: IUploadParameters
  ): IUploadParameters {
    // 获取该网络质量等级的推荐参数
    const recommendedParams = this.getRecommendedParameters(networkQuality);

    // 对网络不稳定情况进行特殊处理
    if (networkQuality.isUnstable) {
      return this.adjustForUnstableNetwork(
        recommendedParams,
        currentParameters
      );
    }

    // 根据当前参数和推荐参数进行平滑过渡
    const adjustedParams = this.smoothTransition(
      currentParameters,
      recommendedParams
    );

    // 验证参数是否在安全范围内
    return this.validateParameters(adjustedParams);
  }

  /**
   * 获取特定网络质量的推荐参数
   * @param networkQuality 网络质量结果
   * @returns 推荐参数
   */
  public getRecommendedParameters(
    networkQuality: INetworkQualityResult
  ): IUploadParameters {
    const { qualityLevel } = networkQuality;

    // 获取该质量等级的预设参数
    const baseParams = this.presetParameters[qualityLevel];

    // 如果启用了自适应学习，根据历史数据微调参数
    if (this.options.enableAdaptiveLearning && this.historicalData.length > 5) {
      return this.applyAdaptiveLearning(baseParams, qualityLevel);
    }

    return { ...baseParams };
  }

  /**
   * 应用最小安全参数（降级策略）
   * @returns 最小安全参数
   */
  public getMinimumSafeParameters(): IUploadParameters {
    return {
      chunkSize: this.options.minChunkSize,
      concurrency: this.options.minConcurrency,
      retryCount: 5,
      retryDelay: 1000,
      timeout: 60000,
      precheckEnabled: true,
      useWorker: false,
    };
  }

  /**
   * 记录上传结果
   * 用于自适应学习
   * @param networkQuality 网络质量
   * @param parameters 使用的参数
   * @param success 是否成功
   * @param transferRate 传输速率(KB/s)
   */
  public recordUploadResult(
    networkQuality: INetworkQualityResult,
    parameters: IUploadParameters,
    success: boolean,
    transferRate?: number
  ): void {
    this.historicalData.push({
      networkQuality,
      parameters,
      success,
      transferRate,
    });

    // 保持历史记录大小限制
    if (this.historicalData.length > this.MAX_HISTORY_SIZE) {
      this.historicalData.shift();
    }
  }

  /**
   * 重置历史数据
   */
  public resetHistory(): void {
    this.historicalData = [];
  }

  /**
   * 初始化默认参数预设
   * @returns 参数预设映射
   * @private
   */
  private initPresetParameters(): Record<
    NetworkQualityLevel,
    IUploadParameters
  > {
    return {
      [NetworkQualityLevel.VERY_POOR]: {
        chunkSize: 128 * 1024, // 128KB
        concurrency: 1,
        retryCount: 5,
        retryDelay: 2000,
        timeout: 60000,
        precheckEnabled: true,
        useWorker: false,
      },
      [NetworkQualityLevel.POOR]: {
        chunkSize: 256 * 1024, // 256KB
        concurrency: 2,
        retryCount: 4,
        retryDelay: 1500,
        timeout: 45000,
        precheckEnabled: true,
        useWorker: true,
      },
      [NetworkQualityLevel.MODERATE]: {
        chunkSize: 512 * 1024, // 512KB
        concurrency: 3,
        retryCount: 3,
        retryDelay: 1000,
        timeout: 30000,
        precheckEnabled: true,
        useWorker: true,
      },
      [NetworkQualityLevel.GOOD]: {
        chunkSize: 1 * 1024 * 1024, // 1MB
        concurrency: 4,
        retryCount: 2,
        retryDelay: 800,
        timeout: 20000,
        precheckEnabled: true,
        useWorker: true,
      },
      [NetworkQualityLevel.EXCELLENT]: {
        chunkSize: 2 * 1024 * 1024, // 2MB
        concurrency: 6,
        retryCount: 1,
        retryDelay: 500,
        timeout: 15000,
        precheckEnabled: true,
        useWorker: true,
      },
    };
  }

  /**
   * 对不稳定网络进行参数调整
   * @param recommendedParams 推荐参数
   * @param currentParameters 当前参数
   * @returns 调整后的参数
   * @private
   */
  private adjustForUnstableNetwork(
    recommendedParams: IUploadParameters,
    currentParameters: IUploadParameters
  ): IUploadParameters {
    // 对不稳定网络，我们需要更保守的策略
    // 减小分片大小，降低并发，增加重试次数和超时时间

    // 计算更保守的分片大小 (当前和推荐的较小值的75%)
    const chunkSize =
      Math.min(currentParameters.chunkSize, recommendedParams.chunkSize) * 0.75;

    // 降低并发数 (当前和推荐的较小值)
    const concurrency = Math.min(
      currentParameters.concurrency,
      recommendedParams.concurrency,
      2 // 不稳定网络最多2个并发
    );

    // 增加重试次数
    const retryCount = Math.max(
      currentParameters.retryCount,
      recommendedParams.retryCount,
      4 // 至少4次重试
    );

    // 增加重试延迟
    const retryDelay = Math.max(
      currentParameters.retryDelay,
      recommendedParams.retryDelay,
      1500 // 至少1.5秒延迟
    );

    // 增加超时时间
    const timeout = Math.max(
      currentParameters.timeout,
      recommendedParams.timeout,
      45000 // 至少45秒超时
    );

    return this.validateParameters({
      chunkSize: Math.round(chunkSize),
      concurrency,
      retryCount,
      retryDelay,
      timeout,
      precheckEnabled: true, // 不稳定网络强制启用预检
      useWorker: currentParameters.useWorker, // 保持当前Worker设置
    });
  }

  /**
   * 参数平滑过渡
   * 避免参数突变导致的性能波动
   * @param currentParams 当前参数
   * @param targetParams 目标参数
   * @returns 平滑过渡后的参数
   * @private
   */
  private smoothTransition(
    currentParams: IUploadParameters,
    targetParams: IUploadParameters
  ): IUploadParameters {
    // 对连续性数值进行渐进调整
    // 分片大小最多一次调整50%
    const chunkSizeRatio = targetParams.chunkSize / currentParams.chunkSize;
    const adjustedChunkSize =
      chunkSizeRatio > 1.5
        ? currentParams.chunkSize * 1.5
        : chunkSizeRatio < 0.5
          ? currentParams.chunkSize * 0.5
          : targetParams.chunkSize;

    // 并发数最多一次增减2
    const concurrencyDiff =
      targetParams.concurrency - currentParams.concurrency;
    const adjustedConcurrency =
      concurrencyDiff > 2
        ? currentParams.concurrency + 2
        : concurrencyDiff < -2
          ? currentParams.concurrency - 2
          : targetParams.concurrency;

    // 其他参数可以直接替换
    return {
      chunkSize: Math.round(adjustedChunkSize),
      concurrency: adjustedConcurrency,
      retryCount: targetParams.retryCount,
      retryDelay: targetParams.retryDelay,
      timeout: targetParams.timeout,
      precheckEnabled: targetParams.precheckEnabled,
      useWorker: targetParams.useWorker,
    };
  }

  /**
   * 验证参数是否在安全范围内
   * @param params 参数
   * @returns 验证后的参数
   * @private
   */
  private validateParameters(params: IUploadParameters): IUploadParameters {
    // 确保分片大小在安全范围内
    const chunkSize = Math.max(
      this.options.minChunkSize,
      Math.min(params.chunkSize, this.options.maxChunkSize)
    );

    // 确保并发数在安全范围内
    const concurrency = Math.max(
      this.options.minConcurrency,
      Math.min(params.concurrency, this.options.maxConcurrency)
    );

    // 确保重试次数不为负
    const retryCount = Math.max(0, params.retryCount);

    // 确保重试延迟不为负
    const retryDelay = Math.max(200, params.retryDelay);

    // 确保超时时间合理
    const timeout = Math.max(5000, params.timeout);

    return {
      ...params,
      chunkSize,
      concurrency,
      retryCount,
      retryDelay,
      timeout,
    };
  }

  /**
   * 应用自适应学习
   * 根据历史上传结果优化参数
   * @param baseParams 基础参数
   * @param qualityLevel 网络质量等级
   * @returns 优化后的参数
   * @private
   */
  private applyAdaptiveLearning(
    baseParams: IUploadParameters,
    qualityLevel: NetworkQualityLevel
  ): IUploadParameters {
    // 筛选相同网络质量等级的历史数据
    const relevantHistory = this.historicalData.filter(
      item => item.networkQuality.qualityLevel === qualityLevel && item.success
    );

    if (relevantHistory.length < 3) {
      return { ...baseParams };
    }

    // 找出传输速率最高的参数配置
    let bestConfig = relevantHistory[0];
    relevantHistory.forEach(item => {
      if ((item.transferRate || 0) > (bestConfig.transferRate || 0)) {
        bestConfig = item;
      }
    });

    // 如果最佳配置比基础配置的传输速率提升超过20%，采用最佳配置的参数
    if (bestConfig.transferRate && bestConfig.transferRate > 0) {
      // 计算平均传输速率
      const avgTransferRate =
        relevantHistory.reduce(
          (sum, item) => sum + (item.transferRate || 0),
          0
        ) / relevantHistory.length;

      if (bestConfig.transferRate > avgTransferRate * 1.2) {
        // 合并最佳配置与基础配置
        return {
          ...baseParams,
          chunkSize: bestConfig.parameters.chunkSize,
          concurrency: bestConfig.parameters.concurrency,
        };
      }
    }

    // 没有显著优化则返回基础参数
    return { ...baseParams };
  }
}
