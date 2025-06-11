/**
 * 错误中心
 * 统一处理、分类、记录和诊断所有上传错误
 */
import { EventBus } from '../EventBus';
import { UploadError } from './UploadError';
import { ErrorDetectorFactory } from './ErrorDetectors';
import { ErrorRecoveryManager } from './ErrorRecoveryManager';
import {
  UploadErrorType,
  ErrorSeverity,
  ErrorContextData,
  NetworkQuality,
} from '../../types/errors';

/**
 * 错误中心配置选项
 */
export interface ErrorCenterOptions {
  /** 是否自动恢复错误 */
  autoRecover: boolean;
  /** 记录错误到控制台 */
  logToConsole: boolean;
  /** 遥测URL，用于远程错误收集 */
  telemetryUrl?: string;
  /** 错误缓存最大条数 */
  maxCachedErrors: number;
  /** 自定义网络质量评估器 */
  networkQualityEvaluator?: () => Promise<NetworkQuality>;
}

/**
 * 错误中心类
 * 负责错误的统一处理、分类、记录和诊断
 */
export class ErrorCenter {
  /** 错误事件总线 */
  private eventBus: EventBus;

  /** 错误恢复管理器 */
  private recoveryManager: ErrorRecoveryManager;

  /** 错误缓存 */
  private errorCache: UploadError[] = [];

  /** 错误统计信息 */
  private errorStats: Record<UploadErrorType, number> = {} as Record<
    UploadErrorType,
    number
  >;

  /** 配置选项 */
  private options: ErrorCenterOptions;

  /** 当前网络质量 */
  private currentNetworkQuality: NetworkQuality = NetworkQuality.GOOD;

  /** 默认配置 */
  private static readonly DEFAULT_OPTIONS: ErrorCenterOptions = {
    autoRecover: true,
    logToConsole: true,
    maxCachedErrors: 100,
    telemetryUrl: undefined,
  };

  /**
   * 构造函数
   * @param eventBus 事件总线实例
   * @param options 配置选项
   */
  constructor(eventBus: EventBus, options?: Partial<ErrorCenterOptions>) {
    this.eventBus = eventBus;
    this.options = { ...ErrorCenter.DEFAULT_OPTIONS, ...options };
    this.recoveryManager = new ErrorRecoveryManager();

    this.setupNetworkMonitoring();
    this.setupEventListeners();
  }

  /**
   * 设置网络监控
   */
  private setupNetworkMonitoring(): void {
    // 监听网络在线状态
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'online',
        this.handleOnlineStatusChange.bind(this)
      );
      window.addEventListener(
        'offline',
        this.handleOnlineStatusChange.bind(this)
      );
    }

    // 定期评估网络质量
    this.scheduleNetworkQualityCheck();
  }

  /**
   * 定期评估网络质量
   */
  private scheduleNetworkQualityCheck(): void {
    const checkNetworkQuality = async (): Promise<void> => {
      try {
        this.currentNetworkQuality = await this.evaluateNetworkQuality();

        // 根据网络质量动态调整恢复策略
        this.recoveryManager.adaptRetryStrategy(
          this.errorStats,
          this.currentNetworkQuality
        );
      } catch (error) {
        // 评估失败，假设网络质量一般
        this.currentNetworkQuality = NetworkQuality.FAIR;
      }

      // 定期再次评估
      setTimeout(checkNetworkQuality, 30000);
    };

    // 启动首次评估
    checkNetworkQuality();
  }

  /**
   * 评估网络质量
   * @returns 网络质量等级
   */
  private async evaluateNetworkQuality(): Promise<NetworkQuality> {
    // 如果有自定义评估器，优先使用
    if (this.options.networkQualityEvaluator) {
      return this.options.networkQualityEvaluator();
    }

    // 使用默认评估逻辑
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const conn = (navigator as any).connection;

      if (conn) {
        // 先判断是否在线
        if (!navigator.onLine) {
          return NetworkQuality.POOR;
        }

        // 根据下行速率评估
        if (conn.downlink !== undefined) {
          if (conn.downlink >= 10) {
            return NetworkQuality.EXCELLENT;
          } else if (conn.downlink >= 5) {
            return NetworkQuality.GOOD;
          } else if (conn.downlink >= 1) {
            return NetworkQuality.FAIR;
          } else {
            return NetworkQuality.POOR;
          }
        }

        // 根据有效连接类型评估
        if (conn.effectiveType !== undefined) {
          switch (conn.effectiveType) {
            case '4g':
              return NetworkQuality.EXCELLENT;
            case '3g':
              return NetworkQuality.GOOD;
            case '2g':
              return NetworkQuality.FAIR;
            case 'slow-2g':
              return NetworkQuality.POOR;
            default:
              return NetworkQuality.GOOD;
          }
        }
      }
    }

    // 无法评估，默认为良好
    return NetworkQuality.GOOD;
  }

  /**
   * 处理网络在线状态变化
   */
  private handleOnlineStatusChange(): void {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    this.eventBus.emit('network:statusChange', { online: isOnline });

    if (isOnline) {
      // 网络恢复，尝试自动恢复错误
      this.attemptBatchRecovery();
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.eventBus.on('error:occurred', this.handleError.bind(this));
  }

  /**
   * 处理错误
   * @param error 错误对象
   */
  public async handleError(error: any): Promise<void> {
    try {
      // 如果已经是UploadError实例则直接使用
      let uploadError: UploadError;

      if (error instanceof UploadError) {
        uploadError = error;
      } else {
        // 使用错误检测器工厂检测错误类型并转换为UploadError
        const detectionResult = ErrorDetectorFactory.detect(error);
        uploadError = new UploadError(
          detectionResult.type,
          detectionResult.message,
          error,
          undefined,
          this.createErrorContext()
        );
      }

      // 记录错误
      this.recordError(uploadError);

      // 发出错误事件
      this.eventBus.emit('error:processed', uploadError);

      // 根据错误严重性发出不同级别的事件
      switch (uploadError.severity) {
        case ErrorSeverity.CRITICAL:
          this.eventBus.emit('error:critical', uploadError);
          break;
        case ErrorSeverity.HIGH:
          this.eventBus.emit('error:high', uploadError);
          break;
        case ErrorSeverity.MEDIUM:
          this.eventBus.emit('error:medium', uploadError);
          break;
        case ErrorSeverity.LOW:
          this.eventBus.emit('error:low', uploadError);
          break;
      }

      // 如果配置了自动恢复且错误可恢复，尝试恢复
      if (this.options.autoRecover && uploadError.isRecoverable) {
        await this.attemptRecovery(uploadError);
      }

      // 如果配置了日志记录到控制台，则记录
      if (this.options.logToConsole) {
        this.logErrorToConsole(uploadError);
      }

      // 如果配置了遥测URL，则发送错误信息
      if (this.options.telemetryUrl) {
        this.sendErrorTelemetry(uploadError);
      }
    } catch (handlerError) {
      console.error('处理错误时出错:', handlerError);
    }
  }

  /**
   * 创建错误上下文
   * @returns 错误上下文数据
   */
  private createErrorContext(): ErrorContextData {
    return {
      timestamp: Date.now(),
      network: {
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        type: this.getNetworkType(),
        downlink: this.getNetworkDownlink(),
        rtt: this.getNetworkRtt(),
      },
      environment: {
        runtime: this.getRuntimeEnvironment(),
        browser: this.getBrowserInfo(),
        os: this.getOSInfo(),
        memory: this.getMemoryStats(),
      },
    };
  }

  /**
   * 获取网络类型
   */
  private getNetworkType(): string | undefined {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return undefined;
    }

    const conn = (navigator as any).connection;
    return conn?.type || conn?.effectiveType;
  }

  /**
   * 获取网络下行速率
   */
  private getNetworkDownlink(): number | undefined {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return undefined;
    }

    const conn = (navigator as any).connection;
    return conn?.downlink;
  }

  /**
   * 获取网络往返时间
   */
  private getNetworkRtt(): number | undefined {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return undefined;
    }

    const conn = (navigator as any).connection;
    return conn?.rtt;
  }

  /**
   * 获取运行环境
   */
  private getRuntimeEnvironment(): string | undefined {
    if (typeof window === 'undefined') {
      return 'node';
    }

    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      return 'wechat';
    }

    if (typeof my !== 'undefined' && my.getSystemInfoSync) {
      return 'alipay';
    }

    return 'browser';
  }

  /**
   * 获取浏览器信息
   */
  private getBrowserInfo(): { name: string; version: string } | undefined {
    if (typeof window === 'undefined' || !('navigator' in window)) {
      return undefined;
    }

    const ua = navigator.userAgent;
    let browserName = 'unknown';
    let version = 'unknown';

    if (/Edge/.test(ua)) {
      browserName = 'Edge';
      version = ua.match(/Edge\/(\d+)/)?.[1] || 'unknown';
    } else if (/Chrome/.test(ua)) {
      browserName = 'Chrome';
      version = ua.match(/Chrome\/(\d+)/)?.[1] || 'unknown';
    } else if (/Firefox/.test(ua)) {
      browserName = 'Firefox';
      version = ua.match(/Firefox\/(\d+)/)?.[1] || 'unknown';
    } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
      browserName = 'Safari';
      version = ua.match(/Version\/(\d+)/)?.[1] || 'unknown';
    } else if (/MSIE/.test(ua) || /Trident/.test(ua)) {
      browserName = 'IE';
      version = ua.match(/(MSIE |rv:)(\d+)/)?.[2] || 'unknown';
    }

    return { name: browserName, version };
  }

  /**
   * 获取操作系统信息
   */
  private getOSInfo(): { name: string; version: string } | undefined {
    if (typeof window === 'undefined' || !('navigator' in window)) {
      return undefined;
    }

    const ua = navigator.userAgent;
    let osName = 'unknown';
    let version = 'unknown';

    if (/(iPhone|iPad|iPod)/.test(ua)) {
      osName = 'iOS';
      version = ua.match(/OS (\d+)_/)?.[1] || 'unknown';
    } else if (/Android/.test(ua)) {
      osName = 'Android';
      version = ua.match(/Android (\d+)/)?.[1] || 'unknown';
    } else if (/Win/.test(ua)) {
      osName = 'Windows';
      if (/Windows NT 10.0/.test(ua)) {
        version = '10';
      } else if (/Windows NT 6.3/.test(ua)) {
        version = '8.1';
      } else if (/Windows NT 6.2/.test(ua)) {
        version = '8';
      } else if (/Windows NT 6.1/.test(ua)) {
        version = '7';
      }
    } else if (/Mac/.test(ua)) {
      osName = 'macOS';
      version = ua.match(/Mac OS X (\d+)[._](\d+)/)?.[1] || 'unknown';
    } else if (/Linux/.test(ua)) {
      osName = 'Linux';
    }

    return { name: osName, version };
  }

  /**
   * 获取内存统计信息
   */
  private getMemoryStats():
    | {
        totalJSHeapSize?: number;
        usedJSHeapSize?: number;
        jsHeapSizeLimit?: number;
        availableMemoryPercentage?: number;
      }
    | undefined {
    if (
      typeof window === 'undefined' ||
      !('performance' in window) ||
      !('memory' in performance)
    ) {
      return undefined;
    }

    const memory = (performance as any).memory;
    if (!memory) {
      return undefined;
    }

    return {
      totalJSHeapSize: memory.totalJSHeapSize,
      usedJSHeapSize: memory.usedJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      availableMemoryPercentage:
        memory.jsHeapSizeLimit > 0
          ? (1 - memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
          : undefined,
    };
  }

  /**
   * 记录错误
   * @param error 上传错误对象
   */
  private recordError(error: UploadError): void {
    // 更新错误统计
    this.errorStats[error.type] = (this.errorStats[error.type] || 0) + 1;

    // 将错误添加到缓存
    this.errorCache.push(error);

    // 如果缓存超过最大限制，则移除最旧的
    if (this.errorCache.length > this.options.maxCachedErrors) {
      this.errorCache.shift();
    }
  }

  /**
   * 尝试恢复错误
   * @param error 上传错误对象
   * @returns 是否成功恢复
   */
  private async attemptRecovery(error: UploadError): Promise<boolean> {
    try {
      const recovered = await this.recoveryManager.tryRecover(error);

      // 如果恢复成功，发送恢复事件
      if (recovered) {
        this.eventBus.emit('error:recovered', {
          error,
          recoveryAttempts: error.recoveryAttempts,
        });
      }

      return recovered;
    } catch (recoveryError) {
      console.error('尝试恢复错误时出错:', recoveryError);
      return false;
    }
  }

  /**
   * 尝试批量恢复错误
   */
  private async attemptBatchRecovery(): Promise<void> {
    // 获取所有可恢复的错误，并按照恢复优先级排序
    const recoverableErrors = this.errorCache
      .filter(error => error.isRecoverable)
      .sort((a, b) => b.getRecoveryPriority() - a.getRecoveryPriority());

    for (const error of recoverableErrors) {
      await this.attemptRecovery(error);
    }
  }

  /**
   * 将错误记录到控制台
   * @param error 上传错误对象
   */
  private logErrorToConsole(error: UploadError): void {
    console.group(`[FileChunkPro Error] ${error.type}`);
    console.error(error.message);
    console.log('Error ID:', error.errorId);
    console.log('Severity:', error.severity);
    console.log('Recoverable:', error.isRecoverable);
    console.log('Retry Count:', error.retryCount);

    if (error.recommendedSolutions && error.recommendedSolutions.length > 0) {
      console.log('建议解决方案:', error.recommendedSolutions);
    }

    if (error.originalError) {
      console.log('Original Error:', error.originalError);
    }

    console.groupEnd();
  }

  /**
   * 发送错误遥测信息
   * @param error 上传错误对象
   */
  private async sendErrorTelemetry(error: UploadError): Promise<void> {
    if (!this.options.telemetryUrl) return;

    try {
      // 只发送必要信息，避免敏感数据
      const telemetryData = {
        errorId: error.errorId,
        type: error.type,
        message: error.message,
        timestamp: error.timestamp,
        severity: error.severity,
        group: error.group,
        retryCount: error.retryCount,
        recoveryAttempts: error.recoveryAttempts.length,
        browser: error.context?.environment?.browser,
        os: error.context?.environment?.os,
        runtime: error.context?.environment?.runtime,
      };

      // 使用Beacon API发送，不阻塞页面卸载
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          this.options.telemetryUrl,
          JSON.stringify(telemetryData)
        );
      } else {
        // 回退到fetch
        await fetch(this.options.telemetryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telemetryData),
          keepalive: true,
        });
      }
    } catch (telemetryError) {
      // 遥测发送失败不应影响主要功能
      console.warn('发送错误遥测失败:', telemetryError);
    }
  }

  /**
   * 获取错误统计信息
   */
  public getErrorStats(): Record<UploadErrorType, number> {
    return { ...this.errorStats };
  }

  /**
   * 获取错误缓存
   */
  public getErrorCache(): UploadError[] {
    return [...this.errorCache];
  }

  /**
   * 清除错误缓存
   */
  public clearErrorCache(): void {
    this.errorCache = [];
  }

  /**
   * 诊断特定错误类型
   * @param type 错误类型
   * @returns 诊断信息
   */
  public diagnoseErrorType(type: UploadErrorType): {
    count: number;
    firstOccurrence?: Date;
    lastOccurrence?: Date;
    relatedErrors: UploadError[];
  } {
    const relatedErrors = this.errorCache.filter(err => err.type === type);

    return {
      count: this.errorStats[type] || 0,
      firstOccurrence:
        relatedErrors.length > 0
          ? new Date(relatedErrors[0].timestamp)
          : undefined,
      lastOccurrence:
        relatedErrors.length > 0
          ? new Date(relatedErrors[relatedErrors.length - 1].timestamp)
          : undefined,
      relatedErrors,
    };
  }

  /**
   * 销毁并清理资源
   */
  public destroy(): void {
    // 移除事件监听
    this.eventBus.off('error:occurred', this.handleError);

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnlineStatusChange);
      window.removeEventListener('offline', this.handleOnlineStatusChange);
    }

    // 清除缓存
    this.clearErrorCache();
  }
}
