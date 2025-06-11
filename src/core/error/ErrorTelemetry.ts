/**
 * 错误遥测模块
 * 负责错误数据的收集、脱敏和远程上报
 */

import { UploadError } from './UploadError';
import { Logger } from '../../utils/Logger';

/**
 * 错误遥测配置选项
 */
export interface ErrorTelemetryOptions {
  /** 遥测服务端点URL */
  endpoint?: string;
  /** 批量上报的最大错误数 */
  batchSize: number;
  /** 上报间隔(毫秒) */
  reportInterval: number;
  /** 是否在上传日志时使用压缩 */
  useCompression: boolean;
  /** 数据脱敏级别 (0-不脱敏, 1-基础脱敏, 2-高级脱敏) */
  sanitizationLevel: number;
  /** 采样率 (0-1之间，1表示100%上报) */
  samplingRate: number;
  /** 应用ID */
  appId?: string;
  /** 用户ID (可选) */
  userId?: string;
  /** 是否使用非阻塞上报 */
  nonBlocking: boolean;
  /** 自定义标签 */
  tags?: Record<string, string>;
}

/**
 * 遥测状态类型
 */
interface TelemetryStats {
  /** 已上报错误数 */
  reportedCount: number;
  /** 队列中错误数 */
  queuedCount: number;
  /** 上报失败次数 */
  failedAttempts: number;
  /** 最后上报时间 */
  lastReportTime?: number;
}

/**
 * 错误遥测管理器
 * 提供错误的数据采集、隐私保护和远程上报功能
 */
export class ErrorTelemetry {
  /** 待上报的错误队列 */
  private reportQueue: UploadError[] = [];

  /** 定时上报计时器 */
  private reportTimer: any;

  /** 配置选项 */
  private options: ErrorTelemetryOptions;

  /** 统计数据 */
  private stats: TelemetryStats = {
    reportedCount: 0,
    queuedCount: 0,
    failedAttempts: 0,
  };

  /** 日志记录器 */
  private logger: Logger;

  /** 默认配置 */
  private static readonly DEFAULT_OPTIONS: ErrorTelemetryOptions = {
    batchSize: 10,
    reportInterval: 60000,
    useCompression: true,
    sanitizationLevel: 1,
    samplingRate: 1.0,
    nonBlocking: true,
  };

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options?: Partial<ErrorTelemetryOptions>) {
    this.options = { ...ErrorTelemetry.DEFAULT_OPTIONS, ...options };
    this.logger = new Logger('ErrorTelemetry');

    if (!this.options.endpoint) {
      this.logger.warn('未配置遥测端点URL，错误遥测将被禁用');
    } else {
      this.startReportTimer();
    }
  }

  /**
   * 添加错误到上报队列
   * @param error 上传错误对象
   */
  public addError(error: UploadError): void {
    if (!this.options.endpoint) return;

    // 应用采样率过滤
    if (Math.random() > this.options.samplingRate) return;

    this.reportQueue.push(error);
    this.stats.queuedCount++;

    // 如果达到批量上报阈值，立即触发上报
    if (this.reportQueue.length >= this.options.batchSize) {
      this.reportErrors();
    }
  }

  /**
   * 设置遥测端点
   * @param endpoint 遥测服务端点URL
   */
  public setEndpoint(endpoint: string): void {
    this.options.endpoint = endpoint;

    if (!this.reportTimer && endpoint) {
      this.startReportTimer();
    }
  }

  /**
   * 设置应用ID
   * @param appId 应用标识符
   */
  public setAppId(appId: string): void {
    this.options.appId = appId;
  }

  /**
   * 设置用户ID
   * @param userId 用户标识符
   */
  public setUserId(userId: string): void {
    this.options.userId = userId;
  }

  /**
   * 设置自定义标签
   * @param tags 标签键值对
   */
  public setTags(tags: Record<string, string>): void {
    this.options.tags = { ...this.options.tags, ...tags };
  }

  /**
   * 获取遥测统计数据
   */
  public getStats(): TelemetryStats {
    return { ...this.stats };
  }

  /**
   * 清空上报队列
   */
  public clearQueue(): void {
    this.reportQueue = [];
    this.stats.queuedCount = 0;
  }

  /**
   * 开始定时上报
   */
  private startReportTimer(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }

    this.reportTimer = setInterval(() => {
      if (this.reportQueue.length > 0) {
        this.reportErrors();
      }
    }, this.options.reportInterval);
  }

  /**
   * 上报错误数据
   */
  private async reportErrors(): Promise<void> {
    if (!this.options.endpoint || this.reportQueue.length === 0) return;

    const errorsToReport = [...this.reportQueue];
    this.reportQueue = [];

    try {
      // 准备上报数据
      const telemetryData = errorsToReport.map(error =>
        this.sanitizeErrorData(error)
      );

      const payload = {
        timestamp: Date.now(),
        appId: this.options.appId,
        userId: this.options.userId,
        tags: this.options.tags,
        environment: this.getEnvironmentInfo(),
        errors: telemetryData,
      };

      // 执行上报
      if (
        this.options.nonBlocking &&
        typeof navigator !== 'undefined' &&
        navigator.sendBeacon
      ) {
        // 使用Beacon API实现非阻塞上报
        const blob = new Blob(
          [
            this.options.useCompression
              ? await this.compressData(payload)
              : JSON.stringify(payload),
          ],
          { type: 'application/json' }
        );

        const success = navigator.sendBeacon(this.options.endpoint, blob);
        if (success) {
          this.handleReportSuccess(errorsToReport.length);
        } else {
          this.handleReportFailure(new Error('Beacon发送失败'), errorsToReport);
        }
      } else {
        // 使用fetch API
        const response = await fetch(this.options.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.options.useCompression
              ? { 'Content-Encoding': 'gzip' }
              : {}),
          },
          body: this.options.useCompression
            ? await this.compressData(payload)
            : JSON.stringify(payload),
          keepalive: true,
        });

        if (response.ok) {
          this.handleReportSuccess(errorsToReport.length);
        } else {
          throw new Error(`HTTP错误: ${response.status}`);
        }
      }
    } catch (error) {
      this.handleReportFailure(error, errorsToReport);
    }
  }

  /**
   * 处理上报成功
   * @param count 成功上报的错误数量
   */
  private handleReportSuccess(count: number): void {
    this.stats.reportedCount += count;
    this.stats.lastReportTime = Date.now();
    this.logger.debug(`成功上报了${count}个错误`);
  }

  /**
   * 处理上报失败
   * @param error 失败原因
   * @param failedErrors 上报失败的错误
   */
  private handleReportFailure(error: any, failedErrors: UploadError[]): void {
    this.stats.failedAttempts++;
    this.logger.warn('错误上报失败:', error);

    // 将失败的错误重新加入队列，但仅保留最新的
    const maxRetryErrors = Math.min(this.options.batchSize * 2, 50);
    this.reportQueue = [...failedErrors, ...this.reportQueue].slice(
      -maxRetryErrors
    );

    this.stats.queuedCount = this.reportQueue.length;
  }

  /**
   * 获取环境信息
   */
  private getEnvironmentInfo(): Record<string, any> {
    return {
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      language:
        typeof navigator !== 'undefined' ? navigator.language : undefined,
      platform:
        typeof navigator !== 'undefined' ? navigator.platform : undefined,
      screenSize:
        typeof window !== 'undefined'
          ? `${window.screen.width}x${window.screen.height}`
          : undefined,
    };
  }

  /**
   * 数据脱敏处理
   * @param error 错误对象
   * @returns 脱敏后的错误数据
   */
  private sanitizeErrorData(error: UploadError): Record<string, any> {
    // 基础信息(总是包含)
    const sanitized: Record<string, any> = {
      errorId: error.errorId,
      type: error.type,
      timestamp: error.timestamp,
      severity: error.severity,
      group: error.group,
    };

    // 级别1: 添加基本上下文
    if (this.options.sanitizationLevel <= 1) {
      sanitized.message = error.message;
      sanitized.retryCount = error.retryCount;
      sanitized.recoveryAttempts = error.recoveryAttempts.length;

      if (error.context?.environment) {
        sanitized.environment = {
          runtime: error.context.environment.runtime,
          browser: error.context.environment.browser,
          os: error.context.environment.os,
        };
      }

      if (error.context?.network) {
        sanitized.network = {
          online: error.context.network.online,
          type: error.context.network.type,
          quality: error.context.network.quality,
        };
      }
    }

    // 级别0: 添加完整诊断数据(可能包含敏感信息)
    if (this.options.sanitizationLevel === 0) {
      sanitized.diagnosticData = error.diagnosticData;
      sanitized.isRecoverable = error.isRecoverable;
      sanitized.recommendedSolutions = error.recommendedSolutions;
      sanitized.bestRecoveryStrategy = error.bestRecoveryStrategy;

      // 包含原始错误的基本信息
      if (error.originalError) {
        if (error.originalError instanceof Error) {
          sanitized.originalError = {
            name: error.originalError.name,
            message: error.originalError.message,
            stack: error.originalError.stack,
          };
        } else {
          sanitized.originalError = String(error.originalError);
        }
      }
    }

    return sanitized;
  }

  /**
   * 压缩数据
   * @param data 要压缩的数据对象
   * @returns 压缩后的数据
   */
  private async compressData(data: any): Promise<Blob> {
    // 实际项目中可以使用CompressionStream API或第三方库实现
    // 这里返回JSON字符串的Blob作为演示
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  }

  /**
   * 强制立即上报所有错误
   * @returns 是否成功上报
   */
  public async flushQueue(): Promise<boolean> {
    if (this.reportQueue.length === 0) return true;

    try {
      await this.reportErrors();
      return true;
    } catch (e) {
      this.logger.error('强制上报错误失败:', e);
      return false;
    }
  }

  /**
   * 销毁并清理资源
   */
  public destroy(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    // 尝试上报剩余错误
    if (this.reportQueue.length > 0) {
      this.flushQueue().catch(() => {
        this.logger.warn(`销毁时仍有${this.reportQueue.length}个错误未上报`);
      });
    }
  }
}
