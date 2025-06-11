/**
 * ErrorUtils - 错误类型识别与处理工具类
 *
 * 功能：
 * 1. 根据错误对象识别错误类型
 * 2. 提取错误关键信息
 * 3. 生成错误唯一标识
 * 4. 提取资源标识
 */

import { UploadErrorType } from '../core/error';
import { ErrorCenter } from '../core/error/ErrorCenter';

export class ErrorUtils {
  private static errorCenter: ErrorCenter | null = null;

  /**
   * 设置错误中心实例
   * @param errorCenter 错误中心实例
   */
  public static setErrorCenter(errorCenter: ErrorCenter): void {
    ErrorUtils.errorCenter = errorCenter;
  }

  /**
   * 安全执行异步函数
   * @param fn 异步函数
   * @param fallback 出错时的回退值
   * @returns 函数执行结果或回退值
   */
  public static async safeExecuteAsync<T>(
    fn: () => Promise<T>,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      ErrorUtils.handleError(error);
      return fallback;
    }
  }

  /**
   * 安全执行同步函数
   * @param fn 同步函数
   * @param fallback 出错时的回退值
   * @returns 函数执行结果或回退值
   */
  public static safeExecute<T>(fn: () => T, fallback?: T): T | undefined {
    try {
      return fn();
    } catch (error) {
      ErrorUtils.handleError(error);
      return fallback;
    }
  }

  /**
   * 处理错误
   * @param error 错误对象
   */
  public static handleError(error: any): void {
    // 首先尝试使用错误中心处理
    if (ErrorUtils.errorCenter) {
      ErrorUtils.errorCenter.handleError(error);
    } else {
      // 错误中心不可用时的备用处理
      console.error('[ErrorUtils] 未配置错误中心，错误详情:', error);

      // 触发全局错误事件
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fileChunkPro:error', { detail: error })
        );
      }
    }
  }

  /**
   * 创建Promise错误处理包装器
   * 自动为Promise添加错误处理
   * @param promise 原始Promise
   * @returns 带错误处理的Promise
   */
  public static wrapPromise<T>(promise: Promise<T>): Promise<T> {
    return promise.catch(error => {
      ErrorUtils.handleError(error);
      throw error; // 重新抛出以保持Promise拒绝状态
    });
  }

  /**
   * 根据错误对象获取错误类型
   * @param error 错误对象
   * @returns 错误类型枚举值
   */
  public static getErrorType(error: any): UploadErrorType {
    // 如果错误对象已经有类型，直接返回
    if (
      error &&
      error.type &&
      Object.values(UploadErrorType).includes(error.type)
    ) {
      return error.type;
    }

    // 超时错误
    if (
      error &&
      (error.code === 'ETIMEDOUT' ||
        error.code === 'TIMEOUT' ||
        error.message?.includes('timeout') ||
        error.name === 'TimeoutError')
    ) {
      return UploadErrorType.TIMEOUT;
    }

    // HTTP错误
    if (error && error.status) {
      const status = error.status;
      if (status >= 500) {
        return UploadErrorType.SERVER_ERROR;
      } else if (status >= 400) {
        return UploadErrorType.CLIENT_ERROR;
      }
    }

    // 网络错误
    if (
      error &&
      (error.code === 'ENETUNREACH' ||
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('network') ||
        error.name === 'NetworkError')
    ) {
      return UploadErrorType.NETWORK_ERROR;
    }

    // 安全错误
    if (
      error &&
      (error.code === 'CERT_HAS_EXPIRED' ||
        error.name === 'SecurityError' ||
        error.message?.includes('security') ||
        error.message?.includes('certificate'))
    ) {
      return UploadErrorType.SECURITY_ERROR;
    }

    return UploadErrorType.UNKNOWN;
  }

  /**
   * 获取错误的唯一键
   * @param error 错误对象
   * @returns 错误唯一键
   */
  public static getErrorKey(error: any): string {
    if (!error) return 'null';

    if (error.status) {
      return `status_${error.status}`;
    }

    if (error.code) {
      return `code_${error.code}`;
    }

    if (error.name) {
      return `name_${error.name}`;
    }

    if (error.message) {
      // 使用消息的前50个字符
      return `message_${error.message.substring(0, 50)}`;
    }

    return 'unknown';
  }

  /**
   * 获取资源的唯一键
   * @param url 资源URL
   * @returns 资源唯一键
   */
  public static getResourceKey(url: string): string {
    try {
      // 提取URL的基本部分（不含查询参数和片段）
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch (e) {
      // 如果URL解析失败，使用原始URL
      return url;
    }
  }

  /**
   * 从错误中提取状态码
   * @param error 错误对象
   * @returns HTTP状态码，如果没有则返回0
   */
  public static getStatusCode(error: any): number {
    return error && error.status ? error.status : 0;
  }

  /**
   * 判断状态码是否可以重试
   * @param statusCode HTTP状态码
   * @param retryableStatusCodes 可重试的状态码列表
   * @returns 是否可重试
   */
  public static isRetryableStatusCode(
    statusCode: number,
    retryableStatusCodes: number[] = [408, 429, 500, 502, 503, 504, 507]
  ): boolean {
    return retryableStatusCodes.includes(statusCode);
  }

  /**
   * 从错误中提取重试时间
   * @param error 错误对象
   * @returns 重试时间（毫秒），如果没有则返回null
   */
  public static getRetryAfterTime(error: any): number | null {
    if (!error || !error.headers) return null;

    const retryAfter = error.headers['retry-after'];
    if (!retryAfter) return null;

    const retryAfterMs = parseInt(retryAfter, 10) * 1000;
    return !isNaN(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : null;
  }

  /**
   * 格式化错误信息
   * @param error 错误对象
   * @returns 格式化的错误对象
   */
  public static formatError(error: any): {
    type: UploadErrorType;
    message: string;
    code?: string;
    status?: number;
    key: string;
  } {
    const errorType = this.getErrorType(error);
    const errorKey = this.getErrorKey(error);
    const statusCode = this.getStatusCode(error);

    return {
      type: errorType,
      message: error?.message || '未知错误',
      code: error?.code,
      status: statusCode || undefined,
      key: errorKey,
    };
  }
}

export default ErrorUtils;
