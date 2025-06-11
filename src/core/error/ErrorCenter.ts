/**
 * 错误中心
 * 统一处理、分类、记录和诊断所有上传错误
 * 重构版：使用组合模式整合多个专有模块
 */
import { EventBus } from '../EventBus';
import { UploadError } from './UploadError';
import { ErrorHandlerFactory } from './ErrorHandlerStrategy';
import { ErrorRecoveryManager } from './ErrorRecoveryManager';
import { ErrorContext, ErrorContextOptions } from './ErrorContext';
import {
  ErrorStorage,
  ErrorStorageOptions,
  ErrorQueryOptions,
} from './ErrorStorage';
import { ErrorTelemetry, ErrorTelemetryOptions } from './ErrorTelemetry';
import {
  UploadErrorType,
  ErrorContextData,
  NetworkQuality,
} from '../../types/errors';
import { Logger } from '../../utils/Logger';

/**
 * 错误中心配置选项
 */
export interface ErrorCenterOptions {
  /** 是否自动恢复错误 */
  autoRecover: boolean;
  /** 记录错误到控制台 */
  logToConsole: boolean;
  /** 上下文收集配置 */
  contextOptions?: Partial<ErrorContextOptions>;
  /** 错误存储配置 */
  storageOptions?: Partial<ErrorStorageOptions>;
  /** 遥测配置 */
  telemetryOptions?: Partial<ErrorTelemetryOptions>;
}

/**
 * 错误中心类
 * 负责错误的统一处理、分类、记录和诊断
 */
export class ErrorCenter {
  /** 单例实例 */
  private static instance: ErrorCenter;

  /** 错误事件总线 */
  private eventBus: EventBus;

  /** 错误恢复管理器 */
  private recoveryManager: ErrorRecoveryManager;

  /** 错误上下文管理器 */
  private errorContext: ErrorContext;

  /** 错误存储管理器 */
  private errorStorage: ErrorStorage;

  /** 错误遥测管理器 */
  private errorTelemetry: ErrorTelemetry;

  /** 日志记录器 */
  private logger: Logger;

  /** 配置选项 */
  private options: ErrorCenterOptions;

  /** 默认配置 */
  private static readonly DEFAULT_OPTIONS: ErrorCenterOptions = {
    autoRecover: true,
    logToConsole: true,
  };

  /**
   * 获取单例实例
   * @param options 配置选项
   */
  public static getInstance(
    options?: Partial<ErrorCenterOptions>
  ): ErrorCenter {
    if (!ErrorCenter.instance) {
      ErrorCenter.instance = new ErrorCenter(options);
    } else if (options) {
      // 更新现有实例的选项
      ErrorCenter.instance.configure(options);
    }
    return ErrorCenter.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor(options?: Partial<ErrorCenterOptions>) {
    this.options = { ...ErrorCenter.DEFAULT_OPTIONS, ...options };
    this.eventBus = EventBus.getInstance();
    this.logger = new Logger('ErrorCenter');

    // 初始化组件
    this.errorContext = new ErrorContext(this.options.contextOptions);
    this.errorStorage = new ErrorStorage(this.options.storageOptions);
    this.errorTelemetry = new ErrorTelemetry(this.options.telemetryOptions);
    this.recoveryManager = new ErrorRecoveryManager();

    // 初始化错误处理策略
    ErrorHandlerFactory.initDefaultHandlers();

    // 设置事件监听器
    this.setupEventListeners();

    this.logger.info('错误中心初始化完成');
  }

  /**
   * 重新配置错误中心
   * @param options 新的配置选项
   */
  public configure(options: Partial<ErrorCenterOptions>): void {
    this.options = { ...this.options, ...options };

    // 更新各组件配置
    if (options.contextOptions) {
      // 重建上下文组件
      this.errorContext.destroy();
      this.errorContext = new ErrorContext(options.contextOptions);
    }

    if (options.storageOptions) {
      // 重建存储组件
      this.errorStorage.destroy();
      this.errorStorage = new ErrorStorage(options.storageOptions);
    }

    if (options.telemetryOptions) {
      // 更新遥测配置
      if (options.telemetryOptions.endpoint) {
        this.errorTelemetry.setEndpoint(options.telemetryOptions.endpoint);
      }
      // 其他遥测选项需要重建组件才能生效
    }

    this.logger.info('错误中心配置已更新');
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.eventBus.on('error:occurred', this.handleError.bind(this));
    this.eventBus.on('error:recovered', this.handleErrorRecovered.bind(this));
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
        // 创建错误上下文
        const context = this.errorContext.createContext();

        // 使用错误处理器工厂处理错误
        uploadError = ErrorHandlerFactory.handle(error, context);
      }

      // 记录错误
      this.errorStorage.store(uploadError);

      // 发出错误事件
      this.eventBus.emit('error:processed', uploadError);

      // 根据错误严重性发出不同级别的事件
      this.eventBus.emit(
        `error:${uploadError.severity.toLowerCase()}`,
        uploadError
      );

      // 如果配置了自动恢复且错误可恢复，尝试恢复
      if (this.options.autoRecover && uploadError.isRecoverable) {
        await this.attemptRecovery(uploadError);
      }

      // 如果配置了日志记录到控制台，则记录
      if (this.options.logToConsole) {
        this.logErrorToConsole(uploadError);
      }

      // 添加到遥测队列
      this.errorTelemetry.addError(uploadError);
    } catch (handlerError) {
      this.logger.error('处理错误时出错:', handlerError);
    }
  }

  /**
   * 处理错误恢复事件
   * @param data 恢复事件数据
   */
  private handleErrorRecovered(data: {
    error: UploadError;
    recoveryAttempts: number;
  }): void {
    this.logger.debug(
      `错误 ${data.error.errorId} 已恢复，尝试次数: ${data.recoveryAttempts}`
    );
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
          recoveryAttempts: error.recoveryAttempts.length,
        });
      }

      return recovered;
    } catch (recoveryError) {
      this.logger.error('尝试恢复错误时出错:', recoveryError);
      return false;
    }
  }

  /**
   * 尝试批量恢复错误
   * @returns 恢复的错误数量
   */
  public async attemptBatchRecovery(): Promise<number> {
    // 获取所有可恢复的错误
    const recoverableErrors = this.errorStorage
      .query({
        includeRecovered: false,
      })
      .filter(error => error.isRecoverable);

    if (recoverableErrors.length === 0) return 0;

    let recoveredCount = 0;

    // 按照恢复优先级排序
    const sortedErrors = recoverableErrors.sort(
      (a, b) => b.getRecoveryPriority() - a.getRecoveryPriority()
    );

    for (const error of sortedErrors) {
      const recovered = await this.attemptRecovery(error);
      if (recovered) recoveredCount++;
    }

    return recoveredCount;
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
   * 查询错误
   * @param options 查询选项
   * @returns 符合条件的错误数组
   */
  public queryErrors(options?: ErrorQueryOptions): UploadError[] {
    return this.errorStorage.query(options);
  }

  /**
   * 获取错误统计信息
   */
  public getErrorStats() {
    return this.errorStorage.getStats();
  }

  /**
   * 清除错误缓存
   */
  public clearErrorCache(): void {
    this.errorStorage.clearCache();
  }

  /**
   * 诊断特定错误类型
   * @param type 错误类型
   * @returns 诊断信息
   */
  public diagnoseErrorType(type: UploadErrorType) {
    return this.errorStorage.diagnoseErrorType(type);
  }

  /**
   * 获取当前网络质量
   */
  public getCurrentNetworkQuality(): NetworkQuality {
    return this.errorContext.getCurrentNetworkQuality();
  }

  /**
   * 设置遥测端点
   * @param url 遥测服务端点URL
   */
  public setTelemetryEndpoint(url: string): void {
    this.errorTelemetry.setEndpoint(url);
  }

  /**
   * 设置应用ID
   * @param appId 应用标识符
   */
  public setAppId(appId: string): void {
    this.errorTelemetry.setAppId(appId);
  }

  /**
   * 提供一个创建错误上下文的便捷方法
   * @returns 错误上下文数据
   */
  public createErrorContext(): ErrorContextData {
    return this.errorContext.createContext();
  }

  /**
   * 注册自定义错误处理器
   * @param handler 处理器实现
   */
  public registerCustomErrorHandler(handler: any): void {
    ErrorHandlerFactory.registerHandler(handler);
  }

  /**
   * 销毁并清理资源
   */
  public destroy(): void {
    // 移除事件监听
    this.eventBus.off('error:occurred', this.handleError);
    this.eventBus.off('error:recovered', this.handleErrorRecovered);

    // 销毁各子模块
    this.errorContext.destroy();
    this.errorStorage.destroy();
    this.errorTelemetry.destroy();

    // 清除单例实例
    ErrorCenter.instance = undefined as any;

    this.logger.info('错误中心已销毁');
  }
}
