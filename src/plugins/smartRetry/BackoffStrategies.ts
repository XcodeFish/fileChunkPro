/**
 * 退避策略实现
 * 提供各种重试延迟计算策略
 */
import {
  BackoffConfig,
  ExponentialBackoffConfig,
  LinearBackoffConfig,
  SteppedIntervalConfig,
  NetworkAdaptiveConfig,
  NetworkQuality,
} from '../../types';

/**
 * 基础退避策略类
 */
export abstract class BackoffStrategy {
  /**
   * 计算延迟时间
   * @param attempt 当前尝试次数（从1开始）
   * @param context 上下文信息
   * @returns 延迟时间（毫秒）
   */
  abstract calculateDelay(
    attempt: number,
    context?: Record<string, any>
  ): number;
}

/**
 * 固定间隔退避策略
 */
export class FixedIntervalBackoff extends BackoffStrategy {
  private config: BackoffConfig;

  constructor(config: Partial<BackoffConfig> = {}) {
    super();
    this.config = {
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 30000,
    };
  }

  calculateDelay(_attempt: number): number {
    return Math.min(this.config.initialDelay, this.config.maxDelay);
  }
}

/**
 * 指数退避策略
 * 延迟时间随着重试次数呈指数增长
 */
export class ExponentialBackoff extends BackoffStrategy {
  private config: ExponentialBackoffConfig;

  constructor(config: Partial<ExponentialBackoffConfig> = {}) {
    super();
    this.config = {
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      factor: config.factor || 2,
      jitter: config.jitter || 0,
    };
  }

  calculateDelay(attempt: number): number {
    // 计算基础指数延迟
    const baseDelay =
      this.config.initialDelay * Math.pow(this.config.factor, attempt - 1);

    // 应用最大延迟限制
    const cappedDelay = Math.min(baseDelay, this.config.maxDelay);

    return cappedDelay;
  }
}

/**
 * 随机指数退避策略
 * 在指数退避的基础上增加随机抖动，避免同时重试风暴
 */
export class JitteredBackoff extends BackoffStrategy {
  private config: ExponentialBackoffConfig;

  constructor(config: Partial<ExponentialBackoffConfig> = {}) {
    super();
    this.config = {
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      factor: config.factor || 2,
      jitter: config.jitter !== undefined ? config.jitter : 0.3,
    };
  }

  calculateDelay(attempt: number): number {
    // 计算基础指数延迟
    const baseDelay =
      this.config.initialDelay * Math.pow(this.config.factor, attempt - 1);

    // 计算抖动范围
    const jitterRange = baseDelay * this.config.jitter;

    // 应用随机抖动 (-jitterRange/2 to +jitterRange/2)
    const jitter = (Math.random() - 0.5) * jitterRange;

    // 应用最大延迟限制
    const cappedDelay = Math.min(baseDelay + jitter, this.config.maxDelay);

    return Math.max(0, cappedDelay);
  }
}

/**
 * 线性退避策略
 * 延迟时间随着重试次数线性增长
 */
export class LinearBackoff extends BackoffStrategy {
  private config: LinearBackoffConfig;

  constructor(config: Partial<LinearBackoffConfig> = {}) {
    super();
    this.config = {
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      increment: config.increment || 1000,
    };
  }

  calculateDelay(attempt: number): number {
    // 计算线性增长延迟
    const delay =
      this.config.initialDelay + (attempt - 1) * this.config.increment;

    // 应用最大延迟限制
    return Math.min(delay, this.config.maxDelay);
  }
}

/**
 * 阶梯间隔退避策略
 * 使用预定义的延迟时间数组
 */
export class SteppedIntervalBackoff extends BackoffStrategy {
  private config: SteppedIntervalConfig;

  constructor(config: Partial<SteppedIntervalConfig> = {}) {
    super();
    this.config = {
      intervals: config.intervals || [1000, 2000, 5000, 10000, 30000],
    };
  }

  calculateDelay(attempt: number): number {
    // 获取对应的阶梯延迟，如果超出范围则使用最后一个值
    const index = Math.min(attempt - 1, this.config.intervals.length - 1);
    return this.config.intervals[index];
  }
}

/**
 * 网络自适应退避策略
 * 根据网络质量动态调整退避延迟
 */
export class NetworkAdaptiveBackoff extends BackoffStrategy {
  private config: NetworkAdaptiveConfig;

  constructor(config: Partial<NetworkAdaptiveConfig> = {}) {
    super();

    // 默认网络质量因子
    const defaultQualityFactors: Record<string, number> = {
      [NetworkQuality.EXCELLENT]: 0.5,
      [NetworkQuality.GOOD]: 0.75,
      [NetworkQuality.MEDIUM]: 1,
      [NetworkQuality.LOW]: 1.5,
      [NetworkQuality.POOR]: 2,
      [NetworkQuality.OFFLINE]: 3,
      [NetworkQuality.UNKNOWN]: 1,
    };

    this.config = {
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 60000,
      baseFactor: config.baseFactor || 2,
      qualityFactors: config.qualityFactors || defaultQualityFactors,
    };
  }

  calculateDelay(attempt: number, context?: Record<string, any>): number {
    // 获取网络质量，如果没有则使用UNKNOWN
    const networkQuality =
      (context?.networkQuality as NetworkQuality) || NetworkQuality.UNKNOWN;

    // 获取网络质量因子，如果没有则使用1
    const qualityFactor = this.config.qualityFactors[networkQuality] || 1;

    // 计算自适应因子
    const adaptiveFactor = this.config.baseFactor * qualityFactor;

    // 计算自适应延迟
    const delay =
      this.config.initialDelay * Math.pow(adaptiveFactor, attempt - 1);

    // 应用最大延迟限制
    return Math.min(delay, this.config.maxDelay);
  }
}

/**
 * 错误类型自适应退避策略
 * 根据错误类型动态调整退避延迟
 */
export class ErrorAdaptiveBackoff extends BackoffStrategy {
  private config: {
    initialDelay: number;
    maxDelay: number;
    errorFactors: Record<string, number>;
    defaultFactor: number;
  };

  constructor(
    config: Partial<{
      initialDelay: number;
      maxDelay: number;
      errorFactors: Record<string, number>;
      defaultFactor: number;
    }> = {}
  ) {
    super();

    // 默认错误类型因子
    const defaultErrorFactors: Record<string, number> = {
      NETWORK_ERROR: 1.5,
      TIMEOUT_ERROR: 2,
      SERVER_ERROR: 1.3,
      RATE_LIMIT_ERROR: 2.5,
      CONNECTION_RESET_ERROR: 1.8,
      UPLOAD_ERROR: 1.2,
      DEFAULT: 1.5,
    };

    this.config = {
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 60000,
      defaultFactor: config.defaultFactor || 1.5,
      errorFactors: config.errorFactors || defaultErrorFactors,
    };
  }

  calculateDelay(attempt: number, context?: Record<string, any>): number {
    // 获取错误类型，如果没有则使用DEFAULT
    const errorType = (context?.errorType as string) || 'DEFAULT';

    // 获取错误类型因子，如果没有则使用默认因子
    const errorFactor =
      this.config.errorFactors[errorType] || this.config.defaultFactor;

    // 计算自适应延迟
    const delay = this.config.initialDelay * Math.pow(errorFactor, attempt - 1);

    // 应用最大延迟限制
    return Math.min(delay, this.config.maxDelay);
  }
}

/**
 * 退避策略工厂
 * 根据配置创建对应的退避策略实例
 */
export class BackoffStrategyFactory {
  /**
   * 创建退避策略
   * @param type 策略类型
   * @param config 配置参数
   * @returns 退避策略实例
   */
  static createStrategy(
    type: string,
    config?: Record<string, any>
  ): BackoffStrategy {
    switch (type) {
      case 'fixed_interval':
        return new FixedIntervalBackoff(config);
      case 'exponential_backoff':
        return new ExponentialBackoff(config);
      case 'jittered_backoff':
        return new JitteredBackoff(config);
      case 'linear_backoff':
        return new LinearBackoff(config);
      case 'stepped_interval':
        return new SteppedIntervalBackoff(config);
      case 'network_adaptive':
        return new NetworkAdaptiveBackoff(config);
      case 'error_adaptive':
        return new ErrorAdaptiveBackoff(config);
      default:
        return new ExponentialBackoff(config);
    }
  }
}
