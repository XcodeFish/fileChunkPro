/**
 * RecursionLimiter - 递归限制器
 * 防止递归函数无限执行，提供深度控制和超时保护
 */

import { Logger } from './Logger';

export interface RecursionOptions {
  /**
   * 最大递归深度
   */
  maxDepth?: number;

  /**
   * 最大执行时间（毫秒）
   */
  timeout?: number;

  /**
   * 操作名称（用于日志）
   */
  operationName?: string;

  /**
   * 当超过限制时的回调函数
   */
  onLimitExceeded?: (reason: 'depth' | 'timeout') => void;
}

/**
 * 递归函数包装器
 * 用于限制递归函数的最大深度和执行时间，防止栈溢出和浏览器卡死
 */
export class RecursionLimiter {
  private static logger = new Logger('RecursionLimiter');

  /**
   * 保护递归函数执行，提供深度限制和超时保护
   * @param fn 要执行的递归函数
   * @param options 递归限制选项
   * @returns 包装后的安全递归函数
   */
  static protect<T extends (...args: any[]) => any>(
    fn: T,
    options: RecursionOptions = {}
  ): T {
    const {
      maxDepth = 100,
      timeout = 10000,
      operationName = '递归操作',
      onLimitExceeded,
    } = options;

    // 当前递归深度和开始时间的引用
    const state = {
      depth: 0,
      startTime: 0,
    };

    // 创建包装函数
    const wrappedFn = function (this: any, ...args: any[]): any {
      // 首次调用时记录开始时间
      if (state.depth === 0) {
        state.startTime = Date.now();
      }

      // 增加深度计数
      state.depth++;

      try {
        // 检查是否超过最大深度
        if (state.depth > maxDepth) {
          const message = `${operationName}超过最大递归深度(${maxDepth})`;
          RecursionLimiter.logger.error(message);

          if (onLimitExceeded) {
            onLimitExceeded('depth');
          }

          throw new Error(message);
        }

        // 检查是否超时
        if (Date.now() - state.startTime > timeout) {
          const message = `${operationName}执行超时(${timeout}ms)`;
          RecursionLimiter.logger.error(message);

          if (onLimitExceeded) {
            onLimitExceeded('timeout');
          }

          throw new Error(message);
        }

        // 调用原始函数
        const result = fn.apply(this, args);

        // 如果结果是Promise，在Promise中减少深度
        if (result instanceof Promise) {
          return result.finally(() => {
            state.depth--;
          });
        }

        // 减少深度计数
        state.depth--;

        return result;
      } catch (error) {
        // 确保即使出错也减少深度计数
        state.depth--;
        throw error;
      }
    };

    // 返回类型转换后的包装函数
    return wrappedFn as T;
  }

  /**
   * 将普通的递归函数转换为迭代方式实现
   * 对于可能导致栈溢出的深度递归特别有用
   * @param iterator 迭代器函数
   * @returns 函数执行结果
   */
  static iterative<T>(iterator: () => Iterator<T, T, undefined>): T {
    const iterator_ = iterator();
    const stack: Array<IteratorResult<T>> = [];

    let current = iterator_.next();
    let result: T;

    // 当current.done为false时，表示迭代尚未完成
    while (!current.done) {
      // 保存当前状态
      stack.push(current);

      // 获取下一个状态
      current = iterator_.next(current.value);

      // 如果栈过大，抛出异常防止无限循环
      if (stack.length > 10000) {
        throw new Error('可能的无限循环检测：迭代器栈大小超过10000');
      }
    }

    // 当迭代完成时，current.value包含最终结果
    result = current.value;

    // 弹出并处理所有保存的状态
    while (stack.length > 0) {
      current = stack.pop()!;

      // 完成迭代器的每个步骤
      try {
        current = iterator_.return!(result)!;
        result = current.value;
      } catch (e) {
        // 如果关闭迭代器失败，我们仍然继续处理
        RecursionLimiter.logger.warn('关闭迭代器时出错', e);
      }
    }

    return result;
  }

  /**
   * 使用蹦床技术(Trampoline)将递归函数转为非递归形式
   * 防止调用栈溢出
   * @param fn 递归函数，返回结果或下一个函数调用
   * @returns 执行结果
   */
  static trampoline<T>(
    fn: (...args: any[]) => T | (() => T | (() => T | any))
  ): T {
    // 首先调用fn获得初始结果
    let result = fn();

    // 当结果是一个函数时，继续调用并更新结果
    let count = 0;
    const MAX_ITERATIONS = 100000; // 设置合理的最大迭代次数，防止无限循环

    while (typeof result === 'function') {
      result = (result as () => any)();
      count++;

      // 检查是否可能存在无限循环
      if (count > MAX_ITERATIONS) {
        throw new Error('可能的无限循环检测：超过最大迭代次数');
      }
    }

    return result as T;
  }
}
