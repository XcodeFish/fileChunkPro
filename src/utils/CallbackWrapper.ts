/**
 * 回调包装工具
 * 为回调函数提供统一的错误处理机制
 */

import { ErrorUtils } from './ErrorUtils';

/**
 * 回调包装器工具类
 * 提供对回调函数的安全包装，确保统一的错误处理
 */
export class CallbackWrapper {
  /**
   * 包装无参数回调函数
   * @param callback 原始回调函数
   * @returns 包装后的回调函数
   */
  public static wrap<T>(callback: () => T): () => T | undefined {
    return () => {
      try {
        return callback();
      } catch (error) {
        ErrorUtils.handleError(error);
        return undefined;
      }
    };
  }

  /**
   * 包装单参数回调函数
   * @param callback 原始回调函数
   * @returns 包装后的回调函数
   */
  public static wrap1<T, R>(
    callback: (arg: T) => R
  ): (arg: T) => R | undefined {
    return (arg: T) => {
      try {
        return callback(arg);
      } catch (error) {
        ErrorUtils.handleError(error);
        return undefined;
      }
    };
  }

  /**
   * 包装双参数回调函数
   * @param callback 原始回调函数
   * @returns 包装后的回调函数
   */
  public static wrap2<T1, T2, R>(
    callback: (arg1: T1, arg2: T2) => R
  ): (arg1: T1, arg2: T2) => R | undefined {
    return (arg1: T1, arg2: T2) => {
      try {
        return callback(arg1, arg2);
      } catch (error) {
        ErrorUtils.handleError(error);
        return undefined;
      }
    };
  }

  /**
   * 包装三参数回调函数
   * @param callback 原始回调函数
   * @returns 包装后的回调函数
   */
  public static wrap3<T1, T2, T3, R>(
    callback: (arg1: T1, arg2: T2, arg3: T3) => R
  ): (arg1: T1, arg2: T2, arg3: T3) => R | undefined {
    return (arg1: T1, arg2: T2, arg3: T3) => {
      try {
        return callback(arg1, arg2, arg3);
      } catch (error) {
        ErrorUtils.handleError(error);
        return undefined;
      }
    };
  }

  /**
   * 包装异步回调函数
   * @param callback 异步回调函数
   * @returns 包装后的异步回调函数
   */
  public static wrapAsync<T>(
    callback: () => Promise<T>
  ): () => Promise<T | undefined> {
    return async () => {
      try {
        return await callback();
      } catch (error) {
        ErrorUtils.handleError(error);
        return undefined;
      }
    };
  }

  /**
   * 包装带参数的异步回调函数
   * @param callback 带参数的异步回调函数
   * @returns 包装后的异步回调函数
   */
  public static wrapAsync1<T, R>(
    callback: (arg: T) => Promise<R>
  ): (arg: T) => Promise<R | undefined> {
    return async (arg: T) => {
      try {
        return await callback(arg);
      } catch (error) {
        ErrorUtils.handleError(error);
        return undefined;
      }
    };
  }

  /**
   * 包装带两个参数的异步回调函数
   * @param callback 带两个参数的异步回调函数
   * @returns 包装后的异步回调函数
   */
  public static wrapAsync2<T1, T2, R>(
    callback: (arg1: T1, arg2: T2) => Promise<R>
  ): (arg1: T1, arg2: T2) => Promise<R | undefined> {
    return async (arg1: T1, arg2: T2) => {
      try {
        return await callback(arg1, arg2);
      } catch (error) {
        ErrorUtils.handleError(error);
        return undefined;
      }
    };
  }

  /**
   * 包装事件监听器
   * @param listener 原始事件监听器
   * @returns 包装后的事件监听器
   */
  public static wrapEventListener<E extends Event>(
    listener: (event: E) => void
  ): (event: E) => void {
    return (event: E) => {
      try {
        listener(event);
      } catch (error) {
        ErrorUtils.handleError(error);
        // 事件监听器不应终止事件传播，所以这里不返回任何值
      }
    };
  }

  /**
   * 包装具有标准回调模式的函数
   * @param fn 带有回调的函数
   * @param callbackArgIndex 回调参数的索引（默认为最后一个参数）
   * @returns 封装后的函数
   */
  public static wrapWithCallback<T extends any[], R>(
    fn: (...args: T) => R,
    callbackArgIndex?: number
  ): (...args: T) => R {
    return (...args: T) => {
      const idx = callbackArgIndex ?? args.length - 1;
      if (typeof args[idx] === 'function') {
        const originalCallback = args[idx] as unknown as (
          ...cbArgs: any[]
        ) => any;
        args[idx] = ((...cbArgs: any[]) => {
          try {
            return originalCallback(...cbArgs);
          } catch (error) {
            ErrorUtils.handleError(error);
            return undefined;
          }
        }) as any;
      }
      return fn(...args);
    };
  }
}
