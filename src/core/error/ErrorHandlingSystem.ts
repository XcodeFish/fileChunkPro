/**
 * 统一错误处理系统
 * 提供全局错误处理、监控和恢复机制的中心枢纽
 */

import { EventBus } from '../EventBus';
import { UploadError } from './UploadError';
import { ErrorRecoveryManager } from './ErrorRecoveryManager';
import {
  ErrorSeverity,
  UploadErrorType,
  ErrorContextData,
  ErrorRecoveryStrategy,
} from '../../types';
import { Logger } from '../../utils/Logger';

/**
 * 错误处理选项
 */
export interface ErrorHandlingOptions {
  /** 是否启用全局未捕获错误处理 */
  catchGlobalErrors?: boolean;
  /** 是否在控制台显示错误 */
  consoleOutput?: boolean;
  /** 错误重试最大次数 */
  defaultMaxRetries?: number;
  /** 调试模式 */
  debug?: boolean;
  /** 错误日志最大条数 */
  maxErrorLogSize?: number;
}

/**
 * 全局错误处理系统
 * 负责捕获、处理和恢复所有系统错误
 */
export class ErrorHandlingSystem {
  private static instance: ErrorHandlingSystem;
  private eventBus: EventBus;
  private logger: Logger;
  private recoveryManager: ErrorRecoveryManager;
  private options: ErrorHandlingOptions;

  /** 错误处理器列表 */
  private errorHandlers: Array<
    (error: UploadError) => boolean | void | Promise<boolean | void>
  > = [];

  /** 错误统计信息 */
  private errorStats: Map<UploadErrorType, number> = new Map();

  /** 错误日志 */
  private errorLogs: UploadError[] = [];

  /**
   * 获取单例实例
   */
  public static getInstance(
    options?: ErrorHandlingOptions
  ): ErrorHandlingSystem {
    if (!ErrorHandlingSystem.instance) {
      ErrorHandlingSystem.instance = new ErrorHandlingSystem(options);
    }
    return ErrorHandlingSystem.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor(options: ErrorHandlingOptions = {}) {
    this.options = {
      catchGlobalErrors: true,
      consoleOutput: true,
      defaultMaxRetries: 3,
      debug: false,
      maxErrorLogSize: 50,
      ...options,
    };

    this.eventBus = EventBus.getInstance();
    this.logger = new Logger('ErrorHandlingSystem');
    this.recoveryManager = new ErrorRecoveryManager({
      maxRetries: {
        default: this.options.defaultMaxRetries!,
      },
    });

    // 初始化全局错误处理
    if (this.options.catchGlobalErrors) {
      this.setupGlobalErrorHandlers();
    }
  }

  /**
   * 设置全局错误处理器
   */
  private setupGlobalErrorHandlers(): void {
    if (typeof window !== 'undefined') {
      // 处理未捕获的Promise错误
      window.addEventListener('unhandledrejection', event => {
        this.handle(event.reason, {
          context: { source: 'unhandled-promise-rejection' },
        });

        // 防止错误继续传播
        event.preventDefault();
      });

      // 处理未捕获的全局错误
      window.addEventListener('error', event => {
        // 避免处理资源加载错误(如图片、脚本等)
        if (event.error) {
          this.handle(event.error, {
            context: {
              source: 'global-error-event',
              url: event.filename,
              line: event.lineno,
              column: event.colno,
            },
          });

          // 防止错误继续传播
          event.preventDefault();
        }
      });

      this.logger.info('全局错误处理器已设置');
    }

    // 处理Node.js环境下的未捕获错误
    if (typeof process !== 'undefined' && process.on) {
      process.on('uncaughtException', error => {
        this.handle(error, { context: { source: 'node-uncaught-exception' } });
      });

      process.on('unhandledRejection', reason => {
        this.handle(reason, {
          context: { source: 'node-unhandled-rejection' },
        });
      });
    }
  }

  /**
   * 注册错误处理器
   * @param handler 错误处理函数，返回true表示错误已处理，不再传递
   * @param priority 处理器优先级，数字越大优先级越高
   * @returns 处理器ID，用于后续移除
   */
  public registerErrorHandler(
    handler: (error: UploadError) => boolean | void | Promise<boolean | void>,
    priority = 0
  ): string {
    const handlerId = `handler_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 包装处理器，添加ID和优先级
    const wrappedHandler = Object.assign(handler, {
      id: handlerId,
      priority,
    });

    // 按优先级插入
    let inserted = false;
    for (let i = 0; i < this.errorHandlers.length; i++) {
      if ((this.errorHandlers[i] as any).priority < priority) {
        this.errorHandlers.splice(i, 0, wrappedHandler as any);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.errorHandlers.push(wrappedHandler as any);
    }

    return handlerId;
  }

  /**
   * 移除错误处理器
   * @param handlerId 处理器ID
   * @returns 是否成功移除
   */
  public removeErrorHandler(handlerId: string): boolean {
    const index = this.errorHandlers.findIndex(
      handler => (handler as any).id === handlerId
    );

    if (index !== -1) {
      this.errorHandlers.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * 处理错误
   * @param error 错误对象
   * @param contextData 错误上下文数据
   * @returns 处理后的上传错误对象
   */
  public handle(
    error: any,
    contextData?: Partial<ErrorContextData>
  ): UploadError {
    // 转换为UploadError
    const uploadError = this.normalizeError(error, contextData);

    // 记录错误
    this.trackError(uploadError);

    // 如果启用控制台输出，记录到控制台
    if (this.options.consoleOutput) {
      this.logToConsole(uploadError);
    }

    // 发送错误事件
    this.eventBus.emit('error', uploadError);

    // 调用错误处理器链
    this.callErrorHandlers(uploadError);

    return uploadError;
  }

  /**
   * 调用所有注册的错误处理器
   * @param error 上传错误对象
   */
  private async callErrorHandlers(error: UploadError): Promise<void> {
    for (const handler of this.errorHandlers) {
      try {
        const result = handler(error);

        // 如果是Promise，等待完成
        if (result instanceof Promise) {
          const handled = await result;
          if (handled === true) {
            break;
          }
        } else if (result === true) {
          // 非Promise，直接判断返回值
          break;
        }
      } catch (handlerError) {
        // 处理器本身出错，记录但继续处理链
        this.logger.error('错误处理器执行失败:', handlerError);
      }
    }
  }

  /**
   * 将任意错误对象标准化为UploadError
   * @param error 原始错误
   * @param contextData 错误上下文
   * @returns 标准化的上传错误
   */
  private normalizeError(
    error: any,
    contextData?: Partial<ErrorContextData>
  ): UploadError {
    // 如果已经是UploadError，直接添加上下文
    if (error instanceof UploadError) {
      if (contextData) {
        error.addContext(contextData as any);
      }
      return error;
    }

    // 根据错误类型推断错误类别
    let errorType = UploadErrorType.UNKNOWN_ERROR;
    let errorMessage = '未知错误';

    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message;

      // 尝试根据错误名称和消息判断类型
      if (error.name === 'NetworkError' || error.message.includes('network')) {
        errorType = UploadErrorType.NETWORK_ERROR;
      } else if (
        error.name === 'TimeoutError' ||
        error.message.includes('timeout')
      ) {
        errorType = UploadErrorType.TIMEOUT_ERROR;
      } else if (
        error.name === 'SecurityError' ||
        error.message.includes('security')
      ) {
        errorType = UploadErrorType.SECURITY_ERROR;
      }
      // 可以添加更多类型判断...
    } else if (error && typeof error === 'object') {
      errorMessage = error.message || JSON.stringify(error);
    }

    // 创建标准化的错误对象
    return new UploadError(
      errorType,
      errorMessage,
      error, // 原始错误
      undefined, // 分片信息
      contextData as any
    );
  }

  /**
   * 记录错误统计
   * @param error 上传错误
   */
  private trackError(error: UploadError): void {
    // 更新错误统计
    const currentCount = this.errorStats.get(error.type) || 0;
    this.errorStats.set(error.type, currentCount + 1);

    // 添加到错误日志
    this.errorLogs.push(error);

    // 如果超出最大记录数，删除最早的记录
    if (this.errorLogs.length > this.options.maxErrorLogSize!) {
      this.errorLogs.shift();
    }
  }

  /**
   * 记录错误到控制台
   * @param error 上传错误
   */
  private logToConsole(error: UploadError): void {
    const { severity } = error;
    const prefix = `[${new Date().toISOString()}] [${error.type}]`;

    if (severity === ErrorSeverity.HIGH) {
      console.error(`${prefix} ${error.message}`, error);
    } else if (severity === ErrorSeverity.MEDIUM) {
      console.warn(`${prefix} ${error.message}`, error);
    } else {
      if (this.options.debug) {
        console.info(`${prefix} ${error.message}`, error);
      }
    }
  }

  /**
   * 尝试恢复错误
   * @param error 上传错误
   * @returns 是否成功恢复
   */
  public async tryRecover(error: UploadError): Promise<boolean> {
    // 使用恢复管理器尝试恢复
    const recovered = await this.recoveryManager.tryRecover(error);

    if (recovered) {
      // 记录成功恢复
      error.recordRecoveryAttempt(
        true,
        error.bestRecoveryStrategy || ErrorRecoveryStrategy.DEFAULT
      );

      // 发出恢复成功事件
      this.eventBus.emit('error:recovered', {
        error,
        recoveryStrategy: error.bestRecoveryStrategy,
      });
    } else {
      // 记录恢复失败
      error.recordRecoveryAttempt(
        false,
        error.bestRecoveryStrategy || ErrorRecoveryStrategy.DEFAULT
      );

      // 发出恢复失败事件
      this.eventBus.emit('error:recovery-failed', { error });
    }

    return recovered;
  }

  /**
   * 获取错误统计信息
   */
  public getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [type, count] of this.errorStats.entries()) {
      stats[type] = count;
    }
    return stats;
  }

  /**
   * 获取错误日志
   * @param limit 限制返回的日志条数
   */
  public getErrorLogs(limit?: number): UploadError[] {
    if (limit) {
      return this.errorLogs.slice(-limit);
    }
    return [...this.errorLogs];
  }

  /**
   * 清除错误统计和日志
   */
  public clearErrorStats(): void {
    this.errorStats.clear();
    this.errorLogs = [];
  }

  /**
   * 安全异步执行函数包装器
   * @param operation 异步操作
   * @param errorContext 错误上下文
   * @param timeoutMs 超时时间(毫秒)
   * @returns 操作结果
   */
  public async safeAsync<T>(
    operation: () => Promise<T>,
    errorContext?: Partial<ErrorContextData>,
    timeoutMs?: number
  ): Promise<T> {
    try {
      // 带超时控制的执行
      if (timeoutMs) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timeoutId = setTimeout(() => {
            clearTimeout(timeoutId);
            reject(new Error(`操作超时 (${timeoutMs}ms)`));
          }, timeoutMs);
        });

        return await Promise.race([operation(), timeoutPromise]);
      }

      // 无超时控制的执行
      return await operation();
    } catch (error) {
      // 统一处理错误
      const handledError = this.handle(error, errorContext);

      // 重新抛出处理后的错误
      throw handledError;
    }
  }

  /**
   * 创建安全的回调函数包装器
   * @param callback 回调函数
   * @param errorContext 错误上下文
   * @returns 安全包装后的回调
   */
  public safeCallback<T extends (...args: any[]) => any>(
    callback: T,
    errorContext?: Partial<ErrorContextData>
  ): (...args: Parameters<T>) => ReturnType<T> | undefined {
    return (...args: Parameters<T>): ReturnType<T> | undefined => {
      try {
        return callback(...args);
      } catch (error) {
        // 捕获并处理错误，但不重新抛出
        this.handle(error, errorContext);
        return undefined;
      }
    };
  }

  /**
   * 获取错误恢复管理器
   */
  public getRecoveryManager(): ErrorRecoveryManager {
    return this.recoveryManager;
  }

  /**
   * 销毁系统，移除全局事件监听
   */
  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('unhandledrejection', this.handle);
      window.removeEventListener('error', this.handle);
    }

    this.errorHandlers = [];
    this.clearErrorStats();
  }
}

// 导出单例实例，方便直接使用
export const errorHandlingSystem = ErrorHandlingSystem.getInstance();

/**
 * 全局安全异步执行函数
 * 简化在任何地方使用错误系统的安全异步执行
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  errorContext?: Partial<ErrorContextData>,
  timeoutMs?: number
): Promise<T> {
  return errorHandlingSystem.safeAsync(operation, errorContext, timeoutMs);
}

/**
 * 全局安全回调包装函数
 */
export function safeCallback<T extends (...args: any[]) => any>(
  callback: T,
  errorContext?: Partial<ErrorContextData>
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  return errorHandlingSystem.safeCallback(callback, errorContext);
}
