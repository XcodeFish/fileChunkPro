/**
 * AsyncControl - 异步操作控制器
 * 为异步操作提供超时、并发控制和死锁预防机制
 */

import { Logger } from './Logger';

/**
 * 异步操作超时选项
 */
export interface TimeoutOptions {
  /**
   * 超时时间（毫秒）
   */
  timeout: number;

  /**
   * 超时处理行为
   * abort: 直接中止并抛出错误
   * callback: 调用回调但继续执行
   */
  behavior?: 'abort' | 'callback';

  /**
   * 超时后的回调函数
   */
  onTimeout?: () => void;

  /**
   * 操作完成时的回调函数
   */
  onCompletion?: () => void;

  /**
   * 超时错误消息
   */
  message?: string;
}

/**
 * 异步操作控制器
 * 提供一系列工具方法来增强异步操作的安全性，防止死锁
 */
export class AsyncControl {
  private static logger = new Logger('AsyncControl');

  /**
   * 包装Promise添加超时控制
   * @param promise 原始Promise
   * @param options 超时选项
   * @returns 带超时控制的Promise
   */
  static withTimeout<T>(
    promise: Promise<T>,
    options: TimeoutOptions
  ): Promise<T> {
    const {
      timeout,
      behavior = 'abort',
      message,
      onTimeout,
      onCompletion,
    } = options;

    return new Promise<T>((resolve, reject) => {
      let isTimedOut = false;
      let isCompleted = false;

      // 创建超时定时器
      const timeoutId = setTimeout(() => {
        if (isCompleted) return;

        isTimedOut = true;
        const errorMsg = message || `操作超时(${timeout}ms)`;

        // 调用超时回调
        if (onTimeout) {
          try {
            onTimeout();
          } catch (e) {
            this.logger.error('超时回调执行错误', e);
          }
        }

        // 根据行为选择是否终止Promise
        if (behavior === 'abort') {
          reject(new Error(errorMsg));
        }
      }, timeout);

      // 处理Promise完成
      promise
        .then(result => {
          isCompleted = true;
          if (!isTimedOut) {
            // 如果尚未超时，取消定时器并解析结果
            clearTimeout(timeoutId);

            // 调用完成回调
            if (onCompletion) {
              try {
                onCompletion();
              } catch (e) {
                this.logger.error('完成回调执行错误', e);
              }
            }

            resolve(result);
          }
        })
        .catch(error => {
          isCompleted = true;
          if (!isTimedOut) {
            // 如果尚未超时，取消定时器并传递错误
            clearTimeout(timeoutId);
            reject(error);
          }
        });
    });
  }

  /**
   * 异步操作重试机制
   * @param operation 异步操作函数
   * @param options 重试选项
   * @returns 操作结果Promise
   */
  static async retry<T>(
    operation: () => Promise<T>,
    options: {
      retries?: number;
      delayMs?: number;
      backoffFactor?: number;
      maxDelayMs?: number;
      onRetry?: (attempt: number, error: Error) => void;
    } = {}
  ): Promise<T> {
    const {
      retries = 3,
      delayMs = 1000,
      backoffFactor = 1.5,
      maxDelayMs = 30000,
      onRetry,
    } = options;

    let lastError: Error;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        if (attempt > 0) {
          // 计算延迟时间，应用指数退避策略
          const delay = Math.min(
            delayMs * Math.pow(backoffFactor, attempt - 1),
            maxDelayMs
          );

          // 等待一段时间后再重试
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // 执行操作
        return await operation();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt <= retries && onRetry) {
          try {
            onRetry(attempt, lastError);
          } catch (e) {
            this.logger.error('重试回调执行错误', e);
          }
        }
      }
    }

    // 所有重试都失败
    throw lastError!;
  }

  /**
   * 检测并解决可能的异步死锁
   * @param promises Promise数组
   * @param timeout 超时时间（毫秒）
   * @returns 包含每个Promise结果的数组（出错的位置会保存错误对象）
   */
  static async resolveDeadlock<T>(
    promises: Array<Promise<T>>,
    timeout: number
  ): Promise<Array<T | Error>> {
    // 为每个Promise添加超时控制
    const timeoutPromises = promises.map(promise => {
      return this.withTimeout(
        promise.catch(error => error), // 确保单个Promise失败不会导致整个操作失败
        { timeout, behavior: 'abort' }
      ).catch(error => error); // 捕获超时错误
    });

    // 等待所有Promise解析，包括超时的
    return Promise.all(timeoutPromises);
  }

  /**
   * 安全执行多个并发异步任务，带有并发度控制
   * @param tasks 异步任务列表
   * @param options 控制选项
   * @returns 任务执行结果
   */
  static async parallel<T>(
    tasks: Array<() => Promise<T>>,
    options: {
      concurrency?: number;
      timeout?: number;
      stopOnError?: boolean;
      onProgress?: (
        completed: number,
        total: number,
        result?: T,
        error?: Error
      ) => void;
      abortSignal?: AbortSignal;
    } = {}
  ): Promise<T[]> {
    const {
      concurrency = 3,
      timeout = 30000,
      stopOnError = false,
      onProgress,
      abortSignal,
    } = options;

    // 验证输入参数
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return [];
    }

    if (concurrency <= 0) {
      throw new Error('并发度必须大于0');
    }

    const results: Array<T | Error> = new Array(tasks.length);
    const pending: Array<Promise<void>> = [];
    let index = 0;
    let completed = 0;
    let hasError = false;

    // 创建运行任务的函数
    const runTask = async (taskIndex: number): Promise<void> => {
      const task = tasks[taskIndex];

      try {
        // 检查是否已经中止
        if (abortSignal?.aborted) {
          results[taskIndex] = new Error('操作已中止');
          return;
        }

        // 执行任务，添加超时控制
        const result = await this.withTimeout(task(), { timeout });
        results[taskIndex] = result;

        // 调用进度回调
        if (onProgress) {
          completed++;
          try {
            onProgress(completed, tasks.length, result, undefined);
          } catch (e) {
            this.logger.error('进度回调执行错误', e);
          }
        }
      } catch (error) {
        // 记录错误
        results[taskIndex] = error as Error;
        hasError = true;

        // 调用进度回调
        if (onProgress) {
          completed++;
          try {
            onProgress(completed, tasks.length, undefined, error as Error);
          } catch (e) {
            this.logger.error('进度回调执行错误', e);
          }
        }
      }
    };

    // 处理全部任务
    return new Promise<T[]>((resolve, reject) => {
      // 中止信号处理
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          // 如果中止，返回已完成的部分结果
          resolve(results.filter(r => !(r instanceof Error)).map(r => r as T));
        });
      }

      // 定义处理器
      const processNext = async () => {
        // 如果出错且需要停止，则不再处理新任务
        if (hasError && stopOnError) {
          return;
        }

        // 获取下一个任务索引
        const taskIndex = index++;

        // 如果所有任务已分配，返回
        if (taskIndex >= tasks.length) {
          return;
        }

        // 运行任务并处理完成后继续处理下一个
        try {
          await runTask(taskIndex);

          // 检查中止信号
          if (!abortSignal?.aborted) {
            // 继续处理下一个任务
            processNext();
          }
        } catch (error) {
          this.logger.error(`任务${taskIndex}执行错误`, error);
        }
      };

      // 启动初始并发任务
      for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
        pending.push(processNext());
      }

      // 等待所有任务完成
      Promise.all(pending)
        .then(() => {
          if (hasError && stopOnError) {
            // 找到第一个错误并拒绝Promise
            const firstError = results.find(r => r instanceof Error) as Error;
            reject(firstError);
          } else {
            // 过滤掉可能的错误结果
            const validResults = results
              .filter(r => !(r instanceof Error))
              .map(r => r as T);
            resolve(validResults);
          }
        })
        .catch(reject);
    });
  }

  /**
   * 创建一个AbortController，在指定的超时时间后自动中止
   * @param timeout 超时时间（毫秒）
   * @returns AbortController实例和AbortSignal
   */
  static createTimedAbortController(timeout: number): {
    controller: AbortController;
    signal: AbortSignal;
  } {
    const controller = new AbortController();
    const signal = controller.signal;

    // 设置超时自动中止
    const timerId = setTimeout(() => {
      if (!signal.aborted) {
        controller.abort();
      }
    }, timeout);

    // 扩展原始abort方法，确保清理定时器
    const originalAbort = controller.abort.bind(controller);
    (controller as any).abort = () => {
      clearTimeout(timerId);
      return originalAbort();
    };

    // 监听中止事件，清理定时器
    signal.addEventListener('abort', () => {
      clearTimeout(timerId);
    });

    return { controller, signal };
  }
}
