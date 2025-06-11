/**
 * 错误恢复策略管理器
 * 负责管理和执行错误恢复策略
 */
import { UploadErrorType } from '../../types/errors';
import { UploadError } from './UploadError';

/**
 * 恢复策略函数类型，返回Promise<boolean>表示恢复是否成功
 */
type RecoveryStrategyFn = (error: UploadError) => Promise<boolean>;

/**
 * 重试设置接口
 */
export interface RetrySettings {
  /** 退避算法系数 */
  backoffFactor: number;
  /** 初始重试延迟（毫秒） */
  initialDelay: number;
  /** 最大重试延迟（毫秒） */
  maxDelay: number;
  /** 抖动因子（0-1）用于避免重试风暴 */
  jitter: number;
  /** 每个错误类型的最大重试次数 */
  maxRetries: Record<string, number>;
}

/**
 * 错误恢复策略管理器
 *
 * 职责：
 * 1. 管理和注册恢复策略
 * 2. 执行错误恢复过程
 * 3. 动态调整重试策略
 */
export class ErrorRecoveryManager {
  /** 恢复策略映射 */
  private recoveryStrategies: Map<
    UploadErrorType | string,
    RecoveryStrategyFn
  > = new Map();

  /** 重试设置 */
  private retrySettings: RetrySettings = {
    backoffFactor: 1.5,
    initialDelay: 1000,
    maxDelay: 30000,
    jitter: 0.2,
    maxRetries: {
      [UploadErrorType.NETWORK_ERROR]: 5,
      [UploadErrorType.TIMEOUT_ERROR]: 3,
      [UploadErrorType.SERVER_ERROR]: 3,
      [UploadErrorType.UPLOAD_ERROR]: 3,
      [UploadErrorType.WORKER_ERROR]: 1,
      [UploadErrorType.MERGE_ERROR]: 2,
      // 默认值
      default: 3,
    },
  };

  /**
   * 构造函数
   * @param customSettings 自定义重试设置
   */
  constructor(customSettings?: Partial<RetrySettings>) {
    // 合并自定义设置
    if (customSettings) {
      this.retrySettings = {
        ...this.retrySettings,
        ...customSettings,
        maxRetries: {
          ...this.retrySettings.maxRetries,
          ...customSettings.maxRetries,
        },
      };
    }

    // 初始化默认恢复策略
    this.initDefaultRecoveryStrategies();
  }

  /**
   * 初始化默认恢复策略
   */
  private initDefaultRecoveryStrategies(): void {
    // 网络错误恢复策略
    this.registerStrategy(UploadErrorType.NETWORK_ERROR, async () => {
      // 等待一段时间后重试，网络可能会自动恢复
      await this.delay(this.retrySettings.initialDelay);
      return typeof navigator !== 'undefined' ? navigator.onLine : true;
    });

    // 超时错误恢复策略
    this.registerStrategy(UploadErrorType.TIMEOUT_ERROR, async error => {
      // 使用指数退避算法计算延迟
      const delay = this.calculateBackoffDelay(error.retryCount);
      await this.delay(delay);
      return true;
    });

    // 服务器错误恢复策略
    this.registerStrategy(UploadErrorType.SERVER_ERROR, async error => {
      // 服务器错误可能需要较长恢复时间
      const delay =
        this.retrySettings.initialDelay * 2 * (error.retryCount + 1);
      await this.delay(delay);
      return true;
    });

    // 连接重置错误恢复策略
    this.registerStrategy(
      UploadErrorType.CONNECTION_RESET_ERROR,
      async error => {
        // 使用指数退避算法
        const delay = this.calculateBackoffDelay(error.retryCount);
        await this.delay(delay);
        return true;
      }
    );

    // 内存错误恢复策略
    this.registerStrategy(UploadErrorType.MEMORY_ERROR, async () => {
      // 尝试触发垃圾回收
      if (typeof window !== 'undefined' && (window as any).gc) {
        try {
          (window as any).gc();
        } catch (e) {
          // 某些环境不允许手动触发GC
        }
      }

      // 派发内存警告事件
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('uploaderMemoryWarning'));
      }

      await this.delay(1000); // 等待资源释放
      return true;
    });

    // Worker错误恢复策略
    this.registerStrategy(UploadErrorType.WORKER_ERROR, async () => {
      // Worker错误通常表明需要降级到主线程处理
      return true; // 返回true允许降级处理
    });

    // 速率限制错误恢复策略
    this.registerStrategy(UploadErrorType.RATE_LIMIT_ERROR, async error => {
      // 速率限制错误需要较长时间等待
      const delay =
        this.retrySettings.initialDelay * 3 * (error.retryCount + 1);
      await this.delay(delay);
      return true;
    });

    // 默认恢复策略
    this.registerStrategy('default', async error => {
      // 使用渐进式重试延迟
      const delay = this.calculateBackoffDelay(error.retryCount);
      await this.delay(delay);
      return error.retryCount < this.getMaxRetries(error.type);
    });
  }

  /**
   * 注册恢复策略
   * @param type 错误类型
   * @param strategyFn 恢复策略函数
   */
  public registerStrategy(
    type: UploadErrorType | string,
    strategyFn: RecoveryStrategyFn
  ): void {
    this.recoveryStrategies.set(type, strategyFn);
  }

  /**
   * 清除所有已注册的策略
   */
  public clearStrategies(): void {
    this.recoveryStrategies.clear();
  }

  /**
   * 设置重试参数
   * @param settings 重试设置
   */
  public configureRetrySettings(settings: Partial<RetrySettings>): void {
    this.retrySettings = {
      ...this.retrySettings,
      ...settings,
      maxRetries: {
        ...this.retrySettings.maxRetries,
        ...settings.maxRetries,
      },
    };
  }

  /**
   * 自适应调整重试策略
   * 基于错误历史和网络状况动态调整重试参数
   * @param errorStats 错误统计信息
   * @param networkQuality 网络质量评估
   */
  public adaptRetryStrategy(
    errorStats: Record<UploadErrorType, number>,
    networkQuality: 'poor' | 'fair' | 'good' | 'excellent'
  ): void {
    // 基于网络质量调整基础延迟
    if (networkQuality === 'poor') {
      this.retrySettings.initialDelay = 2000;
      this.retrySettings.backoffFactor = 2.0;
    } else if (networkQuality === 'excellent') {
      this.retrySettings.initialDelay = 500;
      this.retrySettings.backoffFactor = 1.3;
    }

    // 基于错误统计调整最大重试次数
    const totalErrors = Object.values(errorStats).reduce(
      (sum, count) => sum + count,
      0
    );
    if (totalErrors > 10) {
      // 错误频繁，增加网络错误的重试次数
      const networkErrors = errorStats[UploadErrorType.NETWORK_ERROR] || 0;
      if (networkErrors > totalErrors * 0.5) {
        this.retrySettings.maxRetries[UploadErrorType.NETWORK_ERROR] = Math.min(
          (this.retrySettings.maxRetries[UploadErrorType.NETWORK_ERROR] || 3) +
            2,
          10
        );
      }
    }
  }

  /**
   * 尝试恢复错误
   * @param error 上传错误
   * @returns 是否成功恢复
   */
  public async tryRecover(error: UploadError): Promise<boolean> {
    // 如果错误不可恢复，直接返回失败
    if (!error.isRecoverable) return false;

    // 如果错误已经超过最大重试次数，不再尝试恢复
    if (error.retryCount >= this.getMaxRetries(error.type)) return false;

    // 获取对应的恢复策略
    let strategyFn = this.recoveryStrategies.get(error.type);

    // 如果没有特定策略，使用默认策略
    if (!strategyFn) {
      strategyFn = this.recoveryStrategies.get('default')!;
    }

    try {
      // 执行恢复策略
      const recoveryResult = await strategyFn(error);

      // 记录恢复尝试
      error.recordRecoveryAttempt(recoveryResult, error.bestRecoveryStrategy);

      return recoveryResult;
    } catch (recoveryError) {
      console.error('执行恢复策略时出错:', recoveryError);

      // 记录失败的恢复尝试
      error.recordRecoveryAttempt(false, error.bestRecoveryStrategy);
      return false;
    }
  }

  /**
   * 等待网络恢复
   * @param timeout 最大等待时间（毫秒）
   * @returns 是否成功恢复网络连接
   */
  public async waitForOnline(timeout = 30000): Promise<boolean> {
    // 如果已经在线，直接返回成功
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      return true;
    }

    return new Promise<boolean>(resolve => {
      // 设置超时处理
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout);

      // 在线状态变化处理
      const handleOnline = () => {
        cleanup();
        resolve(true);
      };

      // 清理函数
      const cleanup = () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', handleOnline);
        }
        clearTimeout(timeoutId);
      };

      // 监听在线状态变化
      if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
      }
    });
  }

  /**
   * 延迟执行
   * @param ms 延迟毫秒数
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 使用指数退避算法计算延迟时间
   * @param retryCount 重试次数
   * @returns 计算出的延迟时间（毫秒）
   */
  private calculateBackoffDelay(retryCount: number): number {
    // 基本延迟 * 退避因子^重试次数
    let delay =
      this.retrySettings.initialDelay *
      Math.pow(this.retrySettings.backoffFactor, retryCount);

    // 添加抖动
    if (this.retrySettings.jitter > 0) {
      const jitterRange = delay * this.retrySettings.jitter;
      delay += Math.random() * jitterRange - jitterRange / 2;
    }

    // 确保不超过最大延迟
    return Math.min(delay, this.retrySettings.maxDelay);
  }

  /**
   * 获取错误类型的最大重试次数
   * @param type 错误类型
   * @returns 最大重试次数
   */
  private getMaxRetries(type: UploadErrorType): number {
    return (
      this.retrySettings.maxRetries[type] ||
      this.retrySettings.maxRetries['default'] ||
      3
    );
  }
}
