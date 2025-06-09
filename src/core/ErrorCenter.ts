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
    public chunkInfo?: { index: number; retryCount: number },
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'UploadError';

    // 捕获错误堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UploadError);
    }

    // 如果原始错误有更多信息，保留它
    if (originalError && typeof originalError === 'object') {
      // 复制原始错误的属性
      for (const key in originalError) {
        if (
          key !== 'name' &&
          key !== 'message' &&
          key !== 'stack' &&
          !Object.prototype.hasOwnProperty.call(this, key)
        ) {
          (this as any)[key] = originalError[key];
        }
      }
    }
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      chunkInfo: this.chunkInfo,
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * 为错误添加上下文信息
   * @param context 上下文信息
   */
  addContext(context: Record<string, any>): this {
    this.context = { ...this.context, ...context };
    return this;
  }

  /**
   * 获取用户友好的错误消息
   */
  getFriendlyMessage(): string {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return '网络连接失败，请检查您的网络设置并重试。';
      case UploadErrorType.TIMEOUT_ERROR:
        return '请求超时，服务器响应时间过长，请稍后重试。';
      case UploadErrorType.SERVER_ERROR:
        return '服务器错误，请联系管理员或稍后重试。';
      case UploadErrorType.FILE_ERROR:
        return '文件处理失败，请确认文件完整且格式正确。';
      case UploadErrorType.PERMISSION_ERROR:
        return '权限不足，无法完成请求操作。';
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return '存储空间不足，请清理空间后重试。';
      case UploadErrorType.MEMORY_ERROR:
        return '内存不足，请尝试关闭其他应用或使用更小的文件。';
      case UploadErrorType.WORKER_ERROR:
        return '后台处理失败，已切换到备用模式，请重试。';
      case UploadErrorType.ENVIRONMENT_ERROR:
        return '当前环境不支持此操作，请尝试使用其他浏览器。';
      case UploadErrorType.UPLOAD_ERROR:
        return `上传失败${this.chunkInfo ? `(分片 ${this.chunkInfo.index})` : ''}，请重试。`;
      case UploadErrorType.MERGE_ERROR:
        return '文件合并失败，请重新上传。';
      case UploadErrorType.VALIDATION_ERROR:
        return '文件验证失败，请检查文件类型和大小是否符合要求。';
      case UploadErrorType.CANCEL_ERROR:
        return '上传已取消。';
      default:
        return this.message || '发生未知错误，请重试。';
    }
  }

  /**
   * 获取可能的解决方案
   */
  getPossibleSolutions(): string[] {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return [
          '检查网络连接是否正常',
          '尝试切换网络环境',
          '检查服务器地址是否正确',
          '稍后重试上传',
        ];
      case UploadErrorType.TIMEOUT_ERROR:
        return [
          '检查网络速度',
          '尝试减小文件大小或分片大小',
          '稍后再试，服务器可能暂时繁忙',
        ];
      // 其他错误类型解决方案...
      default:
        return ['刷新页面重试', '联系技术支持'];
    }
  }

  /**
   * 判断错误是否可恢复（可重试）
   */
  isRecoverable(): boolean {
    // 可恢复的错误类型
    const recoverableTypes = [
      UploadErrorType.NETWORK_ERROR,
      UploadErrorType.TIMEOUT_ERROR,
      UploadErrorType.SERVER_ERROR,
      UploadErrorType.UPLOAD_ERROR,
    ];

    return recoverableTypes.includes(this.type);
  }
}

export class ErrorCenter {
  // 错误事件处理器
  private errorHandlers: Array<(error: UploadError) => void | boolean> = [];

  // 错误统计
  private errorStats: Map<UploadErrorType, number> = new Map();

  // 错误恢复策略
  private recoveryStrategies: Map<
    UploadErrorType,
    (error: UploadError) => Promise<boolean>
  > = new Map();

  constructor() {
    // 初始化默认恢复策略
    this.initDefaultRecoveryStrategies();
  }

  /**
   * 初始化默认恢复策略
   */
  private initDefaultRecoveryStrategies(): void {
    // 网络错误恢复策略
    this.recoveryStrategies.set(UploadErrorType.NETWORK_ERROR, async _error => {
      // 等待一段时间后尝试恢复
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true; // 表示可以尝试恢复
    });

    // 超时错误恢复策略
    this.recoveryStrategies.set(UploadErrorType.TIMEOUT_ERROR, async _error => {
      // 等待更长时间
      await new Promise(resolve => setTimeout(resolve, 5000));
      return true;
    });

    // 服务器错误恢复策略
    this.recoveryStrategies.set(UploadErrorType.SERVER_ERROR, async _error => {
      // 服务器错误可能需要更长的等待时间
      await new Promise(resolve => setTimeout(resolve, 10000));
      return true;
    });
  }

  /**
   * 处理并标准化各种错误
   * @param error 原始错误
   * @param context 错误上下文
   * @returns 标准化的上传错误
   */
  public handle(error: any, context?: Record<string, any>): UploadError {
    // 如果已经是UploadError，直接返回并更新上下文
    if (error instanceof UploadError) {
      if (context) {
        error.addContext(context);
      }
      this.trackError(error);
      return error;
    }

    // 处理不同类型的错误
    let uploadError: UploadError;

    // 网络错误处理
    if (
      error.name === 'NetworkError' ||
      error.message?.includes('network') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNABORTED' ||
      (typeof error.status === 'number' && error.status === 0) ||
      (error instanceof DOMException &&
        (error.name === 'NetworkError' || error.code === 19)) ||
      (error.message && /net::ERR_|network|connection/i.test(error.message))
    ) {
      uploadError = new UploadError(
        UploadErrorType.NETWORK_ERROR,
        '网络连接失败，请检查网络设置',
        error,
        undefined,
        context
      );
    }

    // Worker 相关错误处理
    else if (
      error.message?.includes('Worker') ||
      error.name === 'WorkerError' ||
      (error instanceof DOMException &&
        error.name === 'SecurityError' &&
        error.message?.includes('Worker'))
    ) {
      uploadError = new UploadError(
        UploadErrorType.WORKER_ERROR,
        '处理任务时发生错误，已降级为主线程处理',
        error,
        undefined,
        context
      );
    }

    // 超时错误
    else if (
      error.name === 'TimeoutError' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out')
    ) {
      uploadError = new UploadError(
        UploadErrorType.TIMEOUT_ERROR,
        '请求超时，请检查网络状况或服务器响应',
        error,
        undefined,
        context
      );
    }

    // 内存错误处理
    else if (
      error.name === 'OutOfMemoryError' ||
      error.message?.includes('memory') ||
      error.message?.includes('allocation failed') ||
      error.message?.includes('heap') ||
      error.code === 'ENOMEM'
    ) {
      uploadError = new UploadError(
        UploadErrorType.MEMORY_ERROR,
        '内存不足，请尝试使用更小的分片大小',
        error,
        undefined,
        context
      );
    }

    // 权限错误
    else if (
      error.name === 'NotAllowedError' ||
      error.message?.includes('permission') ||
      error.code === 'EPERM' ||
      error.code === 'EACCES' ||
      (error instanceof DOMException &&
        (error.name === 'SecurityError' || error.name === 'NotAllowedError'))
    ) {
      uploadError = new UploadError(
        UploadErrorType.PERMISSION_ERROR,
        '无权限访问文件，请检查文件权限',
        error,
        undefined,
        context
      );
    }

    // 文件错误处理
    else if (
      error.name === 'NotFoundError' ||
      error.name === 'NotReadableError' ||
      error.message?.includes('file') ||
      error.message?.includes('read') ||
      error.code === 'ENOENT' ||
      (error instanceof DOMException &&
        (error.name === 'NotFoundError' || error.name === 'NotReadableError'))
    ) {
      uploadError = new UploadError(
        UploadErrorType.FILE_ERROR,
        '文件访问失败，请确认文件存在且可读',
        error,
        undefined,
        context
      );
    }

    // 存储配额超出错误
    else if (
      error.name === 'QuotaExceededError' ||
      (error instanceof DOMException && error.name === 'QuotaExceededError')
    ) {
      uploadError = new UploadError(
        UploadErrorType.QUOTA_EXCEEDED_ERROR,
        '存储空间不足，无法保存上传进度',
        error,
        undefined,
        context
      );
    }

    // 服务端错误
    else if (error.status >= 500 || error.statusCode >= 500) {
      uploadError = new UploadError(
        UploadErrorType.SERVER_ERROR,
        `服务器错误(${error.status || error.statusCode})，请稍后重试`,
        error,
        undefined,
        context
      );
    }

    // 客户端错误
    else if (
      (error.status >= 400 && error.status < 500) ||
      (error.statusCode >= 400 && error.statusCode < 500)
    ) {
      let message = '请求错误';

      // 常见客户端错误特殊处理
      if (error.status === 401 || error.statusCode === 401) {
        message = '未授权，请重新登录';
      } else if (error.status === 403 || error.statusCode === 403) {
        message = '无权访问该资源';
      } else if (error.status === 404 || error.statusCode === 404) {
        message = '请求的资源不存在';
      } else if (error.status === 413 || error.statusCode === 413) {
        message = '文件过大，超出服务器限制';
      } else {
        message = `请求错误(${error.status || error.statusCode})`;
      }

      uploadError = new UploadError(
        UploadErrorType.SERVER_ERROR,
        message,
        error,
        undefined,
        context
      );
    }

    // 默认为未知错误
    else {
      uploadError = new UploadError(
        UploadErrorType.UNKNOWN_ERROR,
        error.message || '上传过程中发生未知错误',
        error,
        undefined,
        context
      );
    }

    // 跟踪错误
    this.trackError(uploadError);

    // 触发错误处理器
    for (const handler of this.errorHandlers) {
      const result = handler(uploadError);
      // 如果处理器返回 false，中断处理链
      if (result === false) break;
    }

    return uploadError;
  }

  /**
   * 添加错误处理器
   * @param handler 错误处理函数
   */
  public addErrorHandler(
    handler: (error: UploadError) => void | boolean
  ): void {
    this.errorHandlers.push(handler);
  }

  /**
   * 移除错误处理器
   * @param handler 要移除的处理函数
   */
  public removeErrorHandler(
    handler: (error: UploadError) => void | boolean
  ): void {
    const index = this.errorHandlers.indexOf(handler);
    if (index !== -1) {
      this.errorHandlers.splice(index, 1);
    }
  }

  /**
   * 统计错误
   * @param error 上传错误
   */
  private trackError(error: UploadError): void {
    const count = this.errorStats.get(error.type) || 0;
    this.errorStats.set(error.type, count + 1);
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): Record<string, number> {
    const result: Record<string, number> = {};

    this.errorStats.forEach((count, type) => {
      result[UploadErrorType[type]] = count;
    });

    return result;
  }

  /**
   * 清除错误统计
   */
  public clearErrorStats(): void {
    this.errorStats.clear();
  }

  /**
   * 尝试恢复错误
   * @param error 上传错误
   * @returns 是否可以恢复
   */
  public async tryRecover(error: UploadError): Promise<boolean> {
    // 检查错误是否可恢复
    if (!error.isRecoverable()) {
      return false;
    }

    // 获取恢复策略
    const strategy = this.recoveryStrategies.get(error.type);
    if (!strategy) {
      return false;
    }

    // 执行恢复策略
    try {
      return await strategy(error);
    } catch (e) {
      // 恢复过程中出错
      return false;
    }
  }

  /**
   * 添加自定义恢复策略
   * @param errorType 错误类型
   * @param strategy 恢复策略函数
   */
  public addRecoveryStrategy(
    errorType: UploadErrorType,
    strategy: (error: UploadError) => Promise<boolean>
  ): void {
    this.recoveryStrategies.set(errorType, strategy);
  }

  /**
   * 获取错误的严重性级别
   * @param error 上传错误
   * @returns 严重性级别 (1-5，5最严重)
   */
  public getErrorSeverity(error: UploadError): number {
    switch (error.type) {
      case UploadErrorType.NETWORK_ERROR:
      case UploadErrorType.TIMEOUT_ERROR:
        return 2; // 暂时性问题，可能自动恢复

      case UploadErrorType.SERVER_ERROR:
        return 4; // 服务端问题，可能需要服务端修复

      case UploadErrorType.MEMORY_ERROR:
      case UploadErrorType.ENVIRONMENT_ERROR:
        return 5; // 严重问题，可能无法继续

      case UploadErrorType.FILE_ERROR:
      case UploadErrorType.VALIDATION_ERROR:
        return 3; // 需要用户修复的问题

      case UploadErrorType.PERMISSION_ERROR:
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return 3; // 需要用户交互的问题

      case UploadErrorType.UPLOAD_ERROR:
      case UploadErrorType.WORKER_ERROR:
        return 2; // 可能通过重试解决

      case UploadErrorType.CANCEL_ERROR:
        return 1; // 用户主动取消，不是错误

      case UploadErrorType.UNKNOWN_ERROR:
      default:
        return 3; // 未知问题，中等严重性
    }
  }

  /**
   * 获取分组的错误类型
   * @param error 上传错误
   * @returns 错误组
   */
  public getErrorGroup(error: UploadError): string {
    if (
      error.type === UploadErrorType.NETWORK_ERROR ||
      error.type === UploadErrorType.TIMEOUT_ERROR ||
      error.type === UploadErrorType.SERVER_ERROR
    ) {
      return 'network'; // 网络相关错误
    }

    if (
      error.type === UploadErrorType.FILE_ERROR ||
      error.type === UploadErrorType.VALIDATION_ERROR
    ) {
      return 'file'; // 文件相关错误
    }

    if (
      error.type === UploadErrorType.PERMISSION_ERROR ||
      error.type === UploadErrorType.QUOTA_EXCEEDED_ERROR
    ) {
      return 'permission'; // 权限相关错误
    }

    if (
      error.type === UploadErrorType.MEMORY_ERROR ||
      error.type === UploadErrorType.ENVIRONMENT_ERROR ||
      error.type === UploadErrorType.WORKER_ERROR
    ) {
      return 'environment'; // 环境相关错误
    }

    if (
      error.type === UploadErrorType.UPLOAD_ERROR ||
      error.type === UploadErrorType.MERGE_ERROR
    ) {
      return 'upload'; // 上传过程错误
    }

    if (error.type === UploadErrorType.CANCEL_ERROR) {
      return 'user'; // 用户操作错误
    }

    return 'unknown'; // 未知错误组
  }
}

export default ErrorCenter;
