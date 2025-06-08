/**
 * ErrorCenter - 统一错误处理中心
 * 负责错误的分类、封装与处理
 */

import { UploadErrorType } from '../types';

export class UploadError extends Error {
  constructor(
    public type: UploadErrorType,
    public message: string,
    public originalError?: any,
    public chunkInfo?: { index: number; retryCount: number }
  ) {
    super(message);
    this.name = 'UploadError';
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      chunkInfo: this.chunkInfo,
    };
  }
}

export class ErrorCenter {
  /**
   * 处理并标准化各种错误
   * @param error 原始错误
   * @returns 标准化的上传错误
   */
  public handle(error: any): UploadError {
    if (error instanceof UploadError) return error;

    // 网络错误处理
    if (
      error.name === 'NetworkError' ||
      error.message?.includes('network') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNABORTED' ||
      (typeof error.status === 'number' && error.status === 0)
    ) {
      return new UploadError(
        UploadErrorType.NETWORK_ERROR,
        '网络连接失败，请检查网络设置',
        error
      );
    }

    // Worker 相关错误处理
    if (error.message?.includes('Worker') || error.name === 'WorkerError') {
      return new UploadError(
        UploadErrorType.WORKER_ERROR,
        '处理任务时发生错误，已降级为主线程处理',
        error
      );
    }

    // 超时错误
    if (
      error.name === 'TimeoutError' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('timeout')
    ) {
      return new UploadError(
        UploadErrorType.TIMEOUT_ERROR,
        '请求超时，请检查网络状况或服务器响应',
        error
      );
    }

    // 内存错误处理
    if (
      error.name === 'OutOfMemoryError' ||
      error.message?.includes('memory') ||
      error.message?.includes('allocation failed')
    ) {
      return new UploadError(
        UploadErrorType.MEMORY_ERROR,
        '内存不足，请尝试使用更小的分片大小',
        error
      );
    }

    // 权限错误
    if (
      error.name === 'NotAllowedError' ||
      error.message?.includes('permission')
    ) {
      return new UploadError(
        UploadErrorType.PERMISSION_ERROR,
        '无权限访问文件，请检查文件权限',
        error
      );
    }

    // 文件错误处理
    if (
      error.name === 'NotFoundError' ||
      error.name === 'NotReadableError' ||
      error.message?.includes('file') ||
      error.message?.includes('read')
    ) {
      return new UploadError(
        UploadErrorType.FILE_ERROR,
        '文件访问失败，请确认文件存在且可读',
        error
      );
    }

    // 存储配额超出错误
    if (error.name === 'QuotaExceededError') {
      return new UploadError(
        UploadErrorType.QUOTA_EXCEEDED_ERROR,
        '存储空间不足，无法保存上传进度',
        error
      );
    }

    // 服务端错误
    if (error.status >= 500 || error.statusCode >= 500) {
      return new UploadError(
        UploadErrorType.SERVER_ERROR,
        `服务器错误(${error.status || error.statusCode})，请稍后重试`,
        error
      );
    }

    // 默认为未知错误
    return new UploadError(
      UploadErrorType.UNKNOWN_ERROR,
      error.message || '上传过程中发生未知错误',
      error
    );
  }
}

export default ErrorCenter;
