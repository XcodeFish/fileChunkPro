/**
 * 事务性操作工具函数
 * 提供批量操作的部分失败处理机制
 */

import { safeAsync } from '../core/error/ErrorHandlingSystem';
import { Logger } from './Logger';

const logger = new Logger('TransactionalOperations');

/**
 * 事务性操作选项
 */
export interface TransactionalOptions<T> {
  /** 是否允许部分失败继续执行 */
  continueOnError?: boolean;
  /** 最大允许的错误数量 */
  maxErrors?: number;
  /** 失败时是否回滚 */
  rollbackOnFailure?: boolean;
  /** 回滚函数 */
  rollbackFn?: (results: T[], errors: Error[]) => Promise<void>;
  /** 每个操作的超时时间(毫秒) */
  operationTimeout?: number;
  /** 并行执行的最大操作数 */
  concurrency?: number;
  /** 操作之间的延迟(毫秒) */
  delayBetweenOperations?: number;
  /** 操作标识前缀，用于日志 */
  operationPrefix?: string;
  /** 详细日志模式 */
  verbose?: boolean;
}

/**
 * 事务性操作结果
 */
export interface TransactionalResult<T> {
  /** 成功的结果 */
  success: T[];
  /** 失败的错误 */
  failed: { index: number; error: Error }[];
  /** 是否完全成功(没有错误) */
  completeSuccess: boolean;
  /** 是否部分成功(有一些成功结果) */
  partialSuccess: boolean;
  /** 已回滚标志 */
  rolledBack: boolean;
}

/**
 * 执行事务性批量操作
 * 支持部分失败处理、回滚、重试等机制
 * @param operations 待执行的操作数组
 * @param options 操作选项
 * @returns 操作结果
 */
export async function transactionalOperation<T>(
  operations: Array<() => Promise<T>>,
  options: TransactionalOptions<T> = {}
): Promise<TransactionalResult<T>> {
  // 默认选项
  const opts = {
    continueOnError: true,
    maxErrors: Number.MAX_SAFE_INTEGER,
    rollbackOnFailure: false,
    operationTimeout: 30000, // 30秒
    concurrency: 1, // 默认串行执行
    delayBetweenOperations: 0,
    operationPrefix: 'Op',
    verbose: false,
    ...options,
  };

  // 结果收集
  const results: T[] = [];
  const errors: { index: number; error: Error }[] = [];
  let rolledBack = false;

  // 操作分组(用于并行处理)
  const chunks =
    opts.concurrency > 1
      ? chunkArray(operations, opts.concurrency)
      : [operations];

  try {
    // 处理每一组操作
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const chunkOffset = chunkIndex * opts.concurrency;

      // 如果有延迟且不是第一组，则等待
      if (opts.delayBetweenOperations > 0 && chunkIndex > 0) {
        await delay(opts.delayBetweenOperations);
      }

      // 并行执行当前组的操作
      const chunkPromises = chunk.map(async (operation, innerIndex) => {
        const operationIndex = chunkOffset + innerIndex;
        const opName = `${opts.operationPrefix}-${operationIndex}`;

        try {
          if (opts.verbose) {
            logger.debug(`开始执行操作 ${opName}`);
          }

          // 使用超时和安全执行
          const result = await safeAsync(
            () => operation(),
            { source: opName },
            opts.operationTimeout
          );

          // 存储成功结果
          results[operationIndex] = result;

          if (opts.verbose) {
            logger.debug(`操作 ${opName} 成功完成`);
          }

          return result;
        } catch (error) {
          // 记录错误
          const normalizedError =
            error instanceof Error ? error : new Error(String(error));
          errors.push({ index: operationIndex, error: normalizedError });

          logger.warn(`操作 ${opName} 失败:`, normalizedError);

          // 如果不允许继续，抛出错误中断整个事务
          if (!opts.continueOnError || errors.length > opts.maxErrors) {
            throw new Error(
              `事务中止: 操作 ${opName} 失败: ${normalizedError.message}`
            );
          }

          // 返回undefined表示此操作失败
          return undefined as any;
        }
      });

      // 等待当前组所有操作完成
      await Promise.all(chunkPromises);

      // 如果错误数量超过上限，中断后续组的执行
      if (errors.length > opts.maxErrors) {
        logger.warn(
          `错误数量(${errors.length})超过上限(${opts.maxErrors})，中止后续操作`
        );
        break;
      }
    }

    // 判断是否需要回滚
    const needsRollback = errors.length > 0 && opts.rollbackOnFailure;

    // 执行回滚
    if (needsRollback && typeof opts.rollbackFn === 'function') {
      try {
        logger.info(
          `开始执行回滚，共 ${errors.length} 个错误，${results.length} 个成功结果`
        );
        await opts.rollbackFn(
          results.filter(r => r !== undefined),
          errors.map(e => e.error)
        );
        rolledBack = true;
        logger.info('回滚成功完成');
      } catch (rollbackError) {
        logger.error('回滚失败:', rollbackError);
        errors.push({
          index: -1,
          error: new Error(
            `回滚失败: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
          ),
        });
      }
    }
  } catch (error) {
    // 处理事务整体失败
    logger.error('事务执行失败:', error);

    // 尝试回滚
    if (opts.rollbackOnFailure && typeof opts.rollbackFn === 'function') {
      try {
        logger.info('开始执行回滚 (事务失败)');
        await opts.rollbackFn(
          results.filter(r => r !== undefined),
          [
            ...errors.map(e => e.error),
            error instanceof Error ? error : new Error(String(error)),
          ]
        );
        rolledBack = true;
        logger.info('回滚成功完成');
      } catch (rollbackError) {
        logger.error('回滚失败:', rollbackError);
        errors.push({
          index: -1,
          error: new Error(
            `回滚失败: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
          ),
        });
      }
    }
  }

  // 返回事务结果
  const successResults = results.filter(r => r !== undefined);

  return {
    success: successResults,
    failed: errors,
    completeSuccess: errors.length === 0,
    partialSuccess: successResults.length > 0,
    rolledBack,
  };
}

/**
 * 批处理函数
 * 对大量操作进行分批处理
 * @param items 要处理的项目
 * @param processFn 处理函数
 * @param options 批处理选项
 * @returns 批处理结果
 */
export async function batchProcess<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  options: TransactionalOptions<R> = {}
): Promise<TransactionalResult<R>> {
  // 将项目转换为操作函数
  const operations = items.map((item, index) => {
    return () => processFn(item, index);
  });

  // 执行事务性操作
  return transactionalOperation(operations, options);
}

/**
 * 将数组分块
 * @param array 原数组
 * @param size 块大小
 * @returns 分块后的数组
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  let index = 0;

  while (index < array.length) {
    chunked.push(array.slice(index, index + size));
    index += size;
  }

  return chunked;
}

/**
 * 延迟函数
 * @param ms 延迟毫秒数
 * @returns Promise
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的操作函数
 * @param operation 要执行的操作
 * @param options 重试选项
 * @returns 操作结果
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    exponentialBackoff?: boolean;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const opts = {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
    shouldRetry: () => true,
    ...options,
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // 第一次尝试或重试
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 判断是否应该重试
      if (attempt >= opts.maxRetries || !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // 计算重试延迟
      const retryDelay = opts.exponentialBackoff
        ? opts.retryDelay * Math.pow(2, attempt)
        : opts.retryDelay;

      logger.debug(
        `操作失败，${attempt + 1}/${opts.maxRetries + 1} 次尝试，等待 ${retryDelay}ms 后重试: ${lastError.message}`
      );

      // 等待后重试
      await delay(retryDelay);
    }
  }

  // 不应该到达这里
  throw lastError || new Error('所有重试失败');
}
