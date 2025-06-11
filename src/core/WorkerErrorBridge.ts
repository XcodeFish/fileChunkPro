/**
 * Worker错误处理桥接器
 * 专门用于处理Worker线程与主线程之间的错误传递与恢复
 */

import { errorHandlingSystem } from './error/ErrorHandlingSystem';
import { UploadErrorType, ErrorContextData } from '../types';
import { Logger } from '../utils/Logger';

/**
 * Worker错误信息结构
 */
export interface WorkerErrorData {
  /** 错误类型标识 */
  type: string;
  /** 错误消息 */
  message: string;
  /** 错误堆栈 */
  stack?: string;
  /** 错误详情 */
  details?: Record<string, any>;
  /** 任务ID */
  taskId?: string;
  /** Worker ID */
  workerId?: string;
  /** Worker类型 */
  workerType?: string;
  /** 是否可能恢复 */
  recoverable?: boolean;
}

/**
 * Worker错误恢复选项
 */
export interface WorkerRecoveryOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试前延迟 (ms) */
  retryDelay?: number;
  /** 是否允许降级到主线程 */
  allowFallbackToMainThread?: boolean;
  /** 是否允许重启Worker */
  allowWorkerRestart?: boolean;
}

/**
 * Worker错误处理桥接器
 * 负责Worker与主线程间的错误传递与恢复策略
 */
export class WorkerErrorBridge {
  private static instance: WorkerErrorBridge;
  private logger: Logger;

  // 错误计数器，用于记录每种错误类型的出现次数
  private errorCounts: Map<string, number> = new Map();

  // Worker状态追踪
  private workerStatus: Map<
    string,
    {
      errorCount: number;
      lastError: Date;
      restartCount: number;
      healthy: boolean;
    }
  > = new Map();

  // 默认恢复选项
  private defaultRecoveryOptions: WorkerRecoveryOptions = {
    maxRetries: 3,
    retryDelay: 1000,
    allowFallbackToMainThread: true,
    allowWorkerRestart: true,
  };

  /**
   * 获取单例实例
   */
  public static getInstance(): WorkerErrorBridge {
    if (!WorkerErrorBridge.instance) {
      WorkerErrorBridge.instance = new WorkerErrorBridge();
    }
    return WorkerErrorBridge.instance;
  }

  private constructor() {
    this.logger = new Logger('WorkerErrorBridge');

    // 注册到错误系统
    this.registerErrorHandlers();
  }

  /**
   * 注册错误处理器
   */
  private registerErrorHandlers(): void {
    // 注册Worker特定错误处理器
    errorHandlingSystem.registerErrorHandler(error => {
      if (error.type === UploadErrorType.WORKER_ERROR) {
        // 记录Worker错误
        this.trackWorkerError(error);
        return false; // 继续传播错误
      }
      return false;
    }, 10); // 较高优先级
  }

  /**
   * 跟踪Worker错误
   * @param error Worker错误
   */
  private trackWorkerError(error: any): void {
    // 提取Worker ID
    const workerId = error.context?.workerId;
    if (!workerId) return;

    // 更新Worker状态
    const status = this.workerStatus.get(workerId) || {
      errorCount: 0,
      lastError: new Date(),
      restartCount: 0,
      healthy: true,
    };

    status.errorCount++;
    status.lastError = new Date();

    // 如果短时间内错误过多，标记为不健康
    if (status.errorCount >= 3) {
      status.healthy = false;
    }

    this.workerStatus.set(workerId, status);

    // 全局错误计数
    const errorType = error.type || UploadErrorType.WORKER_ERROR;
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);

    // 记录错误
    this.logger.warn(`Worker错误 (${workerId}): ${error.message}`, error);
  }

  /**
   * 处理从Worker接收到的错误
   * @param errorData Worker错误数据
   * @param recoveryOptions 恢复选项
   * @returns 处理后的错误与恢复决策
   */
  public handleWorkerError(
    errorData: WorkerErrorData,
    recoveryOptions?: WorkerRecoveryOptions
  ): {
    error: any;
    shouldRetry: boolean;
    shouldRestart: boolean;
    shouldFallback: boolean;
    retryDelay: number;
  } {
    // 合并恢复选项
    const options = {
      ...this.defaultRecoveryOptions,
      ...recoveryOptions,
    };

    // 创建错误上下文
    const errorContext: Partial<ErrorContextData> = {
      source: 'worker',
      workerId: errorData.workerId,
      workerType: errorData.workerType,
      taskId: errorData.taskId,
      details: errorData.details,
    };

    // 确定错误类型
    let errorType = UploadErrorType.WORKER_ERROR;
    if (errorData.message?.includes('memory')) {
      errorType = UploadErrorType.MEMORY_ERROR;
    } else if (errorData.message?.includes('timeout')) {
      errorType = UploadErrorType.TIMEOUT_ERROR;
    }

    // 通过统一错误处理系统处理错误
    const error = errorHandlingSystem.handle(
      errorData.message || 'Worker错误',
      {
        type: errorType,
        context: errorContext,
        originalError: {
          stack: errorData.stack,
          ...errorData.details,
        },
      }
    );

    // 获取Worker状态
    const workerId = errorData.workerId || 'unknown';
    const workerInfo = this.workerStatus.get(workerId) || {
      errorCount: 1,
      lastError: new Date(),
      restartCount: 0,
      healthy: true,
    };

    // 决定恢复策略
    let shouldRetry = false;
    let shouldRestart = false;
    let shouldFallback = false;
    let retryDelay = options.retryDelay || 1000;

    // 根据错误次数和类型决定策略
    const errorCount = workerInfo.errorCount;

    // 1. 如果可能是临时错误且次数少，尝试重试
    if (
      error.isRecoverable !== false &&
      errorCount <= (options.maxRetries || 3)
    ) {
      shouldRetry = true;

      // 使用指数退避算法
      retryDelay = Math.min(
        options.retryDelay! * Math.pow(1.5, errorCount - 1),
        10000 // 最大10秒
      );
    }

    // 2. 如果是严重错误或多次重试失败，考虑重启Worker
    if (
      !shouldRetry ||
      errorCount >= 3 ||
      error.type === UploadErrorType.MEMORY_ERROR
    ) {
      if (options.allowWorkerRestart && workerInfo.restartCount < 2) {
        shouldRestart = true;
        workerInfo.restartCount++;
      } else {
        // 3. 如果重启Worker无效或不允许重启，降级到主线程
        shouldFallback = options.allowFallbackToMainThread || false;
      }
    }

    // 更新Worker状态
    this.workerStatus.set(workerId, workerInfo);

    return {
      error,
      shouldRetry,
      shouldRestart,
      shouldFallback,
      retryDelay,
    };
  }

  /**
   * 格式化Worker错误以便在Worker内部使用
   * @param error 原始错误
   * @param taskId 相关任务ID
   * @param workerType Worker类型
   * @returns 格式化的错误数据
   */
  public static formatWorkerError(
    error: any,
    taskId?: string,
    workerType?: string
  ): WorkerErrorData {
    // 基本错误信息
    const errorData: WorkerErrorData = {
      type: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack,
      taskId,
      workerType,
      recoverable: true, // 默认假设可恢复
    };

    // 补充详情
    if (error && typeof error === 'object') {
      errorData.details = {};

      // 复制非标准错误属性
      for (const key of Object.keys(error)) {
        if (
          !['name', 'message', 'stack'].includes(key) &&
          typeof error[key] !== 'function'
        ) {
          try {
            errorData.details[key] = error[key];
          } catch (e) {
            // 忽略不可序列化属性
          }
        }
      }

      // 识别不可恢复错误类型
      if (
        error instanceof TypeError ||
        error instanceof ReferenceError ||
        error instanceof SyntaxError
      ) {
        errorData.recoverable = false;
      }

      // 分析错误内容判断可恢复性
      const errorMsg = errorData.message.toLowerCase();
      if (
        errorMsg.includes('out of memory') ||
        errorMsg.includes('heap limit') ||
        errorMsg.includes('maximum call stack')
      ) {
        errorData.recoverable = false;
      }
    }

    return errorData;
  }

  /**
   * 为Worker创建错误处理函数
   * 在Worker内部使用，捕获错误并发回主线程
   * @returns Worker内部使用的错误处理器
   */
  public static createWorkerErrorHandler(workerType: string) {
    return function handleWorkerError(error: any, taskId?: string) {
      // 格式化错误
      const errorData = WorkerErrorBridge.formatWorkerError(
        error,
        taskId,
        workerType
      );

      try {
        // 向主线程发送错误
        self.postMessage({
          action: 'error',
          taskId: errorData.taskId,
          error: errorData,
        });

        // 如果是不可恢复的严重错误，终止Worker
        if (!errorData.recoverable) {
          console.error('[Worker] 不可恢复错误，自动终止:', errorData.message);
          setTimeout(() => {
            try {
              // @ts-ignore 某些环境可能不支持close
              if (typeof self.close === 'function') {
                self.close();
              }
            } catch (e) {
              // 忽略关闭错误
            }
          }, 100);
        }
      } catch (postError) {
        // 如果连发送错误消息都失败，记录到Worker内部并尝试终止
        console.error('[Worker] 错误发送失败:', postError);
        setTimeout(() => self.close(), 100);
      }

      // 返回错误数据，方便调用方进一步处理
      return errorData;
    };
  }

  /**
   * 记录Worker恢复成功
   * @param workerId Worker标识
   */
  public recordWorkerRecovery(workerId: string): void {
    const status = this.workerStatus.get(workerId);
    if (status) {
      status.errorCount = Math.max(0, status.errorCount - 1);
      status.healthy = true;
      this.workerStatus.set(workerId, status);
    }
  }

  /**
   * 重置Worker状态
   * @param workerId Worker标识
   */
  public resetWorkerStatus(workerId: string): void {
    this.workerStatus.set(workerId, {
      errorCount: 0,
      lastError: new Date(),
      restartCount: 0,
      healthy: true,
    });
  }

  /**
   * 判断Worker是否健康
   * @param workerId Worker标识
   * @returns 是否健康
   */
  public isWorkerHealthy(workerId: string): boolean {
    const status = this.workerStatus.get(workerId);
    return !status || status.healthy;
  }

  /**
   * 获取Worker错误统计
   */
  public getWorkerErrorStats(): Record<string, any> {
    const stats: Record<string, any> = {
      totalErrors: 0,
      byType: {},
      byWorker: {},
    };

    // 按错误类型统计
    for (const [type, count] of this.errorCounts.entries()) {
      stats.totalErrors += count;
      stats.byType[type] = count;
    }

    // 按Worker统计
    for (const [workerId, status] of this.workerStatus.entries()) {
      stats.byWorker[workerId] = {
        errors: status.errorCount,
        lastError: status.lastError.toISOString(),
        restarts: status.restartCount,
        healthy: status.healthy,
      };
    }

    return stats;
  }

  /**
   * 清除错误统计
   */
  public clearErrorStats(): void {
    this.errorCounts.clear();
  }
}

// 导出单例实例，方便直接使用
export const workerErrorBridge = WorkerErrorBridge.getInstance();

/**
 * Worker专用安全执行函数
 * 用在Worker内部捕获执行错误
 */
export function safeWorkerExec<T>(
  fn: () => T,
  taskId?: string,
  workerType = 'generic'
): T {
  try {
    return fn();
  } catch (error) {
    // 使用Worker错误桥接处理错误
    WorkerErrorBridge.createWorkerErrorHandler(workerType)(error, taskId);
    throw error; // 重新抛出，让调用方可以进一步处理
  }
}

/**
 * Worker专用异步安全执行函数
 */
export async function safeWorkerExecAsync<T>(
  fn: () => Promise<T>,
  taskId?: string,
  workerType = 'generic'
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // 使用Worker错误桥接处理错误
    WorkerErrorBridge.createWorkerErrorHandler(workerType)(error, taskId);
    throw error; // 重新抛出
  }
}
