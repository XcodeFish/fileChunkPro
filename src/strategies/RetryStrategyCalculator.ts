/**
 * RetryStrategyCalculator - 重试策略计算器
 *
 * 功能：
 * 1. 计算指数退避重试间隔
 * 2. 基于网络质量优化重试策略
 * 3. 资源错误率分析与策略调整
 * 4. 自适应重试参数优化
 * 5. 多维度因素综合考量（新增）
 */

import { NetworkQuality, RetryStrategy } from '../types/network';
import { Logger } from '../utils/Logger';

export interface AdaptiveRetryParams {
  baseDelay: number; // 基础延迟（毫秒）
  maxDelay: number; // 最大延迟（毫秒）
  factor: number; // 退避因子
  jitter: number; // 抖动系数
  defaultMaxRetries: number; // 默认最大重试次数
}

// 新增：服务器区域配置
export interface ServerRegionConfig {
  region: string; // 服务器区域代码
  countryCode?: string; // 国家/地区代码
  avgLatency?: number; // 平均延迟
  reliability?: number; // 可靠性评分(0-1)
  throttled?: boolean; // 是否被限流过
}

// 新增：资源类型配置
export interface ResourceTypeConfig {
  type: 'image' | 'video' | 'document' | 'binary' | 'text' | 'other'; // 资源类型
  priority: 'high' | 'normal' | 'low'; // 资源优先级
  retryFactor: number; // 重试系数(0-2)
  timeoutMultiplier: number; // 超时乘数(0.5-3)
}

// 新增：时间窗口配置
export interface TimeWindowConfig {
  peakHours: boolean; // 是否处于高峰时段
  businessHours: boolean; // 是否处于工作时间
  weekend: boolean; // 是否周末
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'; // 一天中的时段
}

// 新增：扩展的重试上下文
export interface RetryContext {
  errorType: string; // 错误类型
  serverRegion?: ServerRegionConfig; // 服务器区域信息
  resourceType?: ResourceTypeConfig; // 资源类型
  timeWindow?: TimeWindowConfig; // 时间窗口
  networkQuality: NetworkQuality; // 网络质量
  errorRate: number; // 错误率
  failureCount: number; // 当前失败次数
  historicalSuccessRate?: number; // 历史成功率
  resourceSuccessRate?: number; // 资源成功率
  fileSize?: number; // 文件大小 (bytes)
  chunkSize?: number; // 分片大小 (bytes)
  endpoint?: string; // 请求端点
  uploadStartTime?: number; // 上传开始时间
  deviceInfo?: {
    isMobile: boolean;
    batteryLevel?: number; // 电量水平 (0-1)
    isBatterySaving?: boolean; // 是否省电模式
    isSlowDevice?: boolean; // 是否性能较低设备
  };
}

export class RetryStrategyCalculator {
  private static logger = new Logger('RetryStrategyCalculator');

  // 内部缓存：记录不同区域的性能数据
  private static regionPerformanceCache: Map<
    string,
    {
      latency: number[]; // 最近的延迟记录
      successRate: number; // 成功率
      lastUpdated: number; // 最后更新时间
    }
  > = new Map();

  // 内部缓存：记录不同端点的性能数据
  private static endpointPerformanceCache: Map<
    string,
    {
      successRate: number; // 成功率
      throttleCount: number; // 限流次数
      lastUpdated: number; // 最后更新时间
    }
  > = new Map();

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
   * 优化重试策略（综合考虑多种因素）
   * @param baseStrategy 基础重试策略
   * @param context 重试上下文
   * @param adaptiveParams 自适应参数
   * @returns 优化后的重试策略
   */
  public static optimizeStrategy(
    baseStrategy: RetryStrategy,
    context: RetryContext,
    adaptiveParams: AdaptiveRetryParams
  ): RetryStrategy {
    // 创建策略副本，避免修改原对象
    const strategy = { ...baseStrategy };

    // 使用核心参数
    strategy.maxRetries =
      strategy.maxRetries || adaptiveParams.defaultMaxRetries;
    strategy.retryDelay = strategy.retryDelay || adaptiveParams.baseDelay;
    strategy.backoffFactor = strategy.backoffFactor || adaptiveParams.factor;

    // 1. 基于错误率优化
    this.optimizeByErrorRate(strategy, context, adaptiveParams);

    // 2. 基于网络质量优化
    this.optimizeByNetworkQuality(strategy, context.networkQuality);

    // 3. 基于服务器区域优化
    if (context.serverRegion) {
      this.optimizeByServerRegion(strategy, context.serverRegion);
    }

    // 4. 基于资源类型优化
    if (context.resourceType) {
      this.optimizeByResourceType(strategy, context.resourceType);
    }

    // 5. 基于时间窗口优化
    if (context.timeWindow) {
      this.optimizeByTimeWindow(strategy, context.timeWindow);
    }

    // 6. 基于设备信息优化
    if (context.deviceInfo) {
      this.optimizeByDeviceInfo(strategy, context.deviceInfo);
    }

    // 7. 基于文件大小优化
    if (context.fileSize !== undefined) {
      this.optimizeByFileSize(strategy, context.fileSize, context.chunkSize);
    }

    // 8. 基于失败次数逐渐增加延迟
    if (context.failureCount > 2) {
      const failureMultiplier = 1 + (context.failureCount - 2) * 0.2; // 每次失败增加20%
      strategy.retryDelay = Math.min(
        adaptiveParams.maxDelay,
        Math.round(strategy.retryDelay * failureMultiplier)
      );
    }

    // 确保重试次数不为负
    strategy.maxRetries = Math.max(1, strategy.maxRetries);

    // 记录策略优化结果
    this.logger.debug('重试策略已优化', {
      maxRetries: strategy.maxRetries,
      retryDelay: strategy.retryDelay,
      backoffFactor: strategy.backoffFactor,
      errorType: context.errorType,
      networkQuality: context.networkQuality,
    });

    return strategy;
  }

  /**
   * 基于错误率优化重试策略
   */
  private static optimizeByErrorRate(
    strategy: RetryStrategy,
    context: RetryContext,
    adaptiveParams: AdaptiveRetryParams
  ): void {
    const { errorRate, networkQuality } = context;

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
      strategy.retryDelay = Math.round(
        (strategy.retryDelay || adaptiveParams.baseDelay) * networkMultiplier
      );
      strategy.maxRetries = Math.max(
        1,
        (strategy.maxRetries || adaptiveParams.defaultMaxRetries) - 1
      );
    }
  }

  /**
   * 基于网络质量优化重试策略
   */
  private static optimizeByNetworkQuality(
    strategy: RetryStrategy,
    networkQuality: NetworkQuality
  ): void {
    // 根据网络质量调整退避因子
    switch (networkQuality) {
      case NetworkQuality.EXCELLENT:
        strategy.backoffFactor = Math.min(strategy.backoffFactor, 1.5);
        break;
      case NetworkQuality.GOOD:
        // 保持默认退避因子
        break;
      case NetworkQuality.FAIR:
        strategy.backoffFactor = Math.max(strategy.backoffFactor, 1.8);
        break;
      case NetworkQuality.POOR:
        strategy.backoffFactor = Math.max(strategy.backoffFactor, 2.0);
        break;
      case NetworkQuality.VERY_POOR:
        strategy.backoffFactor = Math.max(strategy.backoffFactor, 2.5);
        strategy.maxRetries = Math.max(1, Math.min(strategy.maxRetries, 3)); // 限制最大重试次数
        break;
      case NetworkQuality.UNUSABLE:
        strategy.backoffFactor = 3.0;
        strategy.maxRetries = Math.min(strategy.maxRetries, 2); // 极度限制重试次数
        break;
    }
  }

  /**
   * 基于服务器区域优化重试策略
   */
  private static optimizeByServerRegion(
    strategy: RetryStrategy,
    region: ServerRegionConfig
  ): void {
    // 获取区域缓存数据
    const regionData = this.regionPerformanceCache.get(region.region);

    // 如果有历史数据，根据可靠性调整重试策略
    if (regionData) {
      // 计算平均延迟
      const avgLatency =
        regionData.latency.reduce((a, b) => a + b, 0) /
        regionData.latency.length;

      // 如果区域历史延迟高，增加重试延迟
      if (avgLatency > 500) {
        // 500ms阈值
        strategy.retryDelay = Math.round(strategy.retryDelay * 1.5);
      }

      // 如果区域历史成功率低，调整重试次数
      if (regionData.successRate < 0.7) {
        // 70%成功率阈值
        // 不可靠区域减少重试次数，但增加间隔
        strategy.maxRetries = Math.max(1, Math.min(strategy.maxRetries, 3));
        strategy.backoffFactor = Math.max(strategy.backoffFactor, 2.0);
      } else if (regionData.successRate > 0.9) {
        // 90%成功率阈值
        // 可靠区域可以适当增加重试次数
        strategy.maxRetries = Math.min(strategy.maxRetries + 1, 7);
      }
    } else if (region.reliability !== undefined) {
      // 如果没有缓存但有可靠性评分，使用它来调整
      if (region.reliability < 0.7) {
        strategy.maxRetries = Math.max(1, Math.min(strategy.maxRetries, 3));
      } else if (region.reliability > 0.9) {
        strategy.maxRetries = Math.min(strategy.maxRetries + 1, 7);
      }
    }

    // 如果区域被记录为限流，增加延迟和减少重试
    if (region.throttled) {
      strategy.retryDelay = Math.round(strategy.retryDelay * 2);
      strategy.maxRetries = Math.max(1, strategy.maxRetries - 1);
    }
  }

  /**
   * 基于资源类型优化重试策略
   */
  private static optimizeByResourceType(
    strategy: RetryStrategy,
    resourceType: ResourceTypeConfig
  ): void {
    // 根据资源优先级调整重试策略
    switch (resourceType.priority) {
      case 'high':
        // 高优先级资源：更多重试机会，较短延迟
        strategy.maxRetries = Math.min(strategy.maxRetries + 2, 10);
        // 不减少延迟，保持退避效应
        break;
      case 'normal':
        // 普通优先级：保持默认策略
        break;
      case 'low':
        // 低优先级：减少重试次数
        strategy.maxRetries = Math.max(1, strategy.maxRetries - 1);
        break;
    }

    // 应用资源类型的特定乘数
    strategy.retryDelay = Math.round(
      strategy.retryDelay * resourceType.retryFactor
    );

    // 根据资源类型调整超时 (如果存在)
    if (strategy.timeout) {
      strategy.timeout = Math.round(
        strategy.timeout * resourceType.timeoutMultiplier
      );
    }

    // 根据类型调整策略
    switch (resourceType.type) {
      case 'video':
        // 视频文件通常较大，增加重试延迟以避免不必要的重试
        strategy.retryDelay = Math.round(strategy.retryDelay * 1.2);
        break;
      case 'image':
        // 图片通常较重要且体积适中，可以多尝试几次
        strategy.maxRetries = Math.min(strategy.maxRetries + 1, 8);
        break;
      case 'document':
        // 文档通常较重要，增加重试次数
        strategy.maxRetries = Math.min(strategy.maxRetries + 1, 7);
        break;
      case 'text':
        // 文本文件较小，可以更频繁重试
        strategy.retryDelay = Math.round(strategy.retryDelay * 0.8);
        break;
    }
  }

  /**
   * 基于时间窗口优化重试策略
   */
  private static optimizeByTimeWindow(
    strategy: RetryStrategy,
    timeWindow: TimeWindowConfig
  ): void {
    // 高峰时段：增加延迟，减少冲突
    if (timeWindow.peakHours) {
      strategy.retryDelay = Math.round(strategy.retryDelay * 1.3);
      strategy.backoffFactor = Math.max(strategy.backoffFactor, 2.0);
    }

    // 非工作时间：可以更激进地重试
    if (!timeWindow.businessHours) {
      strategy.maxRetries = Math.min(strategy.maxRetries + 1, 8);
      strategy.retryDelay = Math.round(strategy.retryDelay * 0.9);
    }

    // 周末：通常流量不同于工作日
    if (timeWindow.weekend) {
      // 周末可能网络负载较低，可以更积极重试
      strategy.retryDelay = Math.round(strategy.retryDelay * 0.9);
    }

    // 根据一天中的时段优化
    switch (timeWindow.timeOfDay) {
      case 'morning': // 早晨，一般网络较好
        strategy.retryDelay = Math.round(strategy.retryDelay * 0.9);
        break;
      case 'afternoon': // 下午，网络较为繁忙
        strategy.retryDelay = Math.round(strategy.retryDelay * 1.1);
        break;
      case 'evening': // 晚上，高峰期
        strategy.retryDelay = Math.round(strategy.retryDelay * 1.2);
        strategy.backoffFactor = Math.max(strategy.backoffFactor, 1.8);
        break;
      case 'night': // 夜间，网络通常较空闲
        strategy.retryDelay = Math.round(strategy.retryDelay * 0.8);
        strategy.maxRetries = Math.min(strategy.maxRetries + 1, 10);
        break;
    }
  }

  /**
   * 基于设备信息优化重试策略
   */
  private static optimizeByDeviceInfo(
    strategy: RetryStrategy,
    deviceInfo: RetryContext['deviceInfo']
  ): void {
    if (!deviceInfo) return;

    // 移动设备：考虑带宽和电池限制
    if (deviceInfo.isMobile) {
      // 增加延迟，减少重试次数以节省带宽和电池
      strategy.retryDelay = Math.round(strategy.retryDelay * 1.2);
      strategy.maxRetries = Math.max(1, strategy.maxRetries - 1);
    }

    // 低电量：减少重试以节省电池
    if (
      deviceInfo.batteryLevel !== undefined &&
      deviceInfo.batteryLevel < 0.2
    ) {
      strategy.maxRetries = Math.max(1, strategy.maxRetries - 2);
      strategy.retryDelay = Math.round(strategy.retryDelay * 1.5);
    }

    // 省电模式：显著减少重试
    if (deviceInfo.isBatterySaving) {
      strategy.maxRetries = Math.max(1, Math.min(strategy.maxRetries, 2));
      strategy.retryDelay = Math.round(strategy.retryDelay * 1.5);
    }

    // 低性能设备：增加延迟以减轻设备负担
    if (deviceInfo.isSlowDevice) {
      strategy.retryDelay = Math.round(strategy.retryDelay * 1.3);
    }
  }

  /**
   * 基于文件大小优化重试策略
   */
  private static optimizeByFileSize(
    strategy: RetryStrategy,
    fileSize: number,
    chunkSize?: number
  ): void {
    // 文件尺寸阈值（字节）
    const SMALL_FILE = 1024 * 1024; // 1MB
    const MEDIUM_FILE = 10 * 1024 * 1024; // 10MB
    const LARGE_FILE = 100 * 1024 * 1024; // 100MB

    if (fileSize < SMALL_FILE) {
      // 小文件：可以更积极重试
      strategy.maxRetries = Math.min(strategy.maxRetries + 1, 8);
      strategy.retryDelay = Math.round(strategy.retryDelay * 0.8);
    } else if (fileSize < MEDIUM_FILE) {
      // 中等文件：保持默认策略
    } else if (fileSize < LARGE_FILE) {
      // 大文件：增加延迟，减少无效重试
      strategy.retryDelay = Math.round(strategy.retryDelay * 1.2);
    } else {
      // 超大文件：显著增加延迟，限制重试次数
      strategy.retryDelay = Math.round(strategy.retryDelay * 1.5);
      strategy.maxRetries = Math.max(1, Math.min(strategy.maxRetries, 3));
    }

    // 如果是分片上传，根据分片大小优化
    if (chunkSize && chunkSize > 0) {
      const chunksCount = Math.ceil(fileSize / chunkSize);

      // 分片数量很多时，减少每个分片的重试次数以避免总重试次数过多
      if (chunksCount > 50) {
        strategy.maxRetries = Math.max(1, Math.min(strategy.maxRetries, 3));
      } else if (chunksCount > 20) {
        strategy.maxRetries = Math.max(1, Math.min(strategy.maxRetries, 4));
      }
    }
  }

  /**
   * 记录区域性能数据
   * @param region 区域代码
   * @param latency 延迟
   * @param success 是否成功
   */
  public static recordRegionPerformance(
    region: string,
    latency: number,
    success: boolean
  ): void {
    const now = Date.now();
    const regionData = this.regionPerformanceCache.get(region) || {
      latency: [],
      successRate: 1.0,
      lastUpdated: now,
    };

    // 记录新延迟数据
    regionData.latency.push(latency);
    if (regionData.latency.length > 10) {
      regionData.latency.shift(); // 保持最近10个样本
    }

    // 更新成功率（使用指数移动平均）
    const successValue = success ? 1 : 0;
    regionData.successRate = regionData.successRate * 0.8 + successValue * 0.2;

    // 更新最后更新时间
    regionData.lastUpdated = now;

    // 保存回缓存
    this.regionPerformanceCache.set(region, regionData);

    // 记录日志
    this.logger.debug('已记录区域性能数据', {
      region,
      latency,
      success,
      currentSuccessRate: regionData.successRate.toFixed(2),
    });
  }

  /**
   * 记录端点性能数据
   * @param endpoint 端点URL
   * @param success 是否成功
   * @param isThrottled 是否被限流
   */
  public static recordEndpointPerformance(
    endpoint: string,
    success: boolean,
    isThrottled: boolean
  ): void {
    const now = Date.now();
    const endpointData = this.endpointPerformanceCache.get(endpoint) || {
      successRate: 1.0,
      throttleCount: 0,
      lastUpdated: now,
    };

    // 更新成功率（使用指数移动平均）
    const successValue = success ? 1 : 0;
    endpointData.successRate =
      endpointData.successRate * 0.8 + successValue * 0.2;

    // 更新限流计数
    if (isThrottled) {
      endpointData.throttleCount++;
    }

    // 更新最后更新时间
    endpointData.lastUpdated = now;

    // 保存回缓存
    this.endpointPerformanceCache.set(endpoint, endpointData);
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

  /**
   * 清理过期缓存数据
   */
  public static cleanupCache(): void {
    const now = Date.now();
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

    // 清理区域缓存
    for (const [region, data] of this.regionPerformanceCache.entries()) {
      if (now - data.lastUpdated > CACHE_TTL) {
        this.regionPerformanceCache.delete(region);
      }
    }

    // 清理端点缓存
    for (const [endpoint, data] of this.endpointPerformanceCache.entries()) {
      if (now - data.lastUpdated > CACHE_TTL) {
        this.endpointPerformanceCache.delete(endpoint);
      }
    }
  }
}

export default RetryStrategyCalculator;
