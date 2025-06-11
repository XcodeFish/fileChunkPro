/**
 * ErrorHandlerStrategy - 错误处理策略模式实现
 * 提供统一的错误处理接口和策略工厂，简化错误处理流程
 */

import { UploadError } from './UploadError';
import {
  UploadErrorType,
  ErrorContextData,
  NetworkQuality,
} from '../../types/errors';

/**
 * 错误处理策略基础接口
 */
export interface IErrorHandler {
  /**
   * 判断错误是否可以由此处理器处理
   * @param error 原始错误对象
   */
  canHandle(error: any): boolean;

  /**
   * 处理错误
   * @param error 原始错误对象
   * @param context 上下文信息
   */
  handle(error: any, context?: ErrorContextData): UploadError;
}

/**
 * 错误处理器选择策略接口
 */
export interface IHandlerSelector {
  /**
   * 选择合适的错误处理器
   * @param error 原始错误对象
   * @param handlers 可用的错误处理器列表
   */
  selectHandler(error: any, handlers: IErrorHandler[]): IErrorHandler | null;
}

/**
 * 基于优先级的错误处理器选择策略
 */
export class PriorityBasedHandlerSelector implements IHandlerSelector {
  /**
   * 选择第一个能处理该错误的处理器
   */
  public selectHandler(
    error: any,
    handlers: IErrorHandler[]
  ): IErrorHandler | null {
    for (const handler of handlers) {
      if (handler.canHandle(error)) {
        return handler;
      }
    }
    return null;
  }
}

/**
 * 抽象错误处理策略基类
 */
export abstract class BaseErrorHandler implements IErrorHandler {
  // 处理器优先级
  protected priority = 0;

  /**
   * 获取处理器优先级
   */
  public getPriority(): number {
    return this.priority;
  }

  /**
   * 子类必须实现的方法，判断是否可以处理特定类型的错误
   */
  abstract canHandle(error: any): boolean;

  /**
   * 处理错误的基本流程
   */
  handle(error: any, context?: ErrorContextData): UploadError {
    // 检查错误是否已经是UploadError类型
    if (error instanceof UploadError) {
      // 如果已经是标准错误类型，添加额外上下文
      if (context) {
        error.addContext(context);
      }
      return error;
    }

    // 提取错误信息
    const errorType = this.getErrorType(error);
    const errorMessage = this.getErrorMessage(error, errorType);

    // 创建标准错误对象
    const uploadError = new UploadError(
      errorType,
      errorMessage,
      error,
      undefined,
      context
    );

    // 增强错误诊断数据
    this.enhanceDiagnosticData(uploadError, error);

    return uploadError;
  }

  /**
   * 获取错误类型
   * 由具体子类实现
   */
  protected abstract getErrorType(error: any): UploadErrorType;

  /**
   * 获取错误消息
   * 可以被子类覆盖以提供更具体的错误消息
   */
  protected getErrorMessage(error: any, type: UploadErrorType): string {
    // 尝试从原始错误中获取消息
    if (error && error.message) {
      return error.message;
    }

    // 根据错误类型返回默认消息
    const defaultMessages: Record<UploadErrorType, string> = {
      [UploadErrorType.NETWORK_ERROR]: '网络连接失败，请检查网络设置',
      [UploadErrorType.TIMEOUT_ERROR]: '请求超时，请稍后重试',
      [UploadErrorType.SERVER_ERROR]: '服务器错误，请联系管理员',
      [UploadErrorType.UPLOAD_ERROR]: '上传过程中发生错误',
      [UploadErrorType.FILE_ERROR]: '文件处理错误',
      [UploadErrorType.INVALID_PARAM_ERROR]: '参数无效',
      [UploadErrorType.QUOTA_EXCEEDED_ERROR]: '超出存储配额',
      [UploadErrorType.CONTENT_ERROR]: '文件内容错误',
      [UploadErrorType.SECURITY_ERROR]: '安全性错误',
      [UploadErrorType.ENVIRONMENT_ERROR]: '环境不支持该上传操作',
      [UploadErrorType.WORKER_ERROR]: 'Worker线程错误',
      [UploadErrorType.API_ERROR]: 'API调用错误',
      [UploadErrorType.MERGE_ERROR]: '文件合并错误',
      [UploadErrorType.UNKNOWN_ERROR]: '发生未知错误',
      [UploadErrorType.ABORT_ERROR]: '上传已被终止',
      [UploadErrorType.CONNECTION_RESET_ERROR]: '连接被重置',
      [UploadErrorType.SERVER_UNREACHABLE_ERROR]: '无法连接到服务器',
      [UploadErrorType.DNS_ERROR]: 'DNS解析错误',
      [UploadErrorType.CONTENT_ENCODING_ERROR]: '内容编码错误',
    };

    return defaultMessages[type] || '发生未知错误';
  }

  /**
   * 增强错误的诊断数据
   * 可以被子类覆盖以提供更详细的诊断信息
   */
  protected enhanceDiagnosticData(
    _uploadError: UploadError,
    _originalError: any
  ): void {
    // 默认实现不添加额外诊断数据
  }
}

/**
 * 网络错误处理策略
 */
export class NetworkErrorHandler extends BaseErrorHandler {
  protected priority = 80;

  canHandle(error: any): boolean {
    return (
      (error instanceof Error && error.name === 'NetworkError') ||
      (error &&
        typeof error === 'object' &&
        (error.message?.includes('network') ||
          error.message?.includes('网络') ||
          error.message?.includes('connection') ||
          error.message?.includes('连接')))
    );
  }

  protected getErrorType(_error: any): UploadErrorType {
    return UploadErrorType.NETWORK_ERROR;
  }

  protected enhanceDiagnosticData(
    uploadError: UploadError,
    _originalError: any
  ): void {
    uploadError.addDiagnosticData({
      networkDiagnosis: {
        connectionQuality: {
          quality: NetworkQuality.POOR,
        },
      },
    });
  }
}

/**
 * 超时错误处理策略
 */
export class TimeoutErrorHandler extends BaseErrorHandler {
  protected priority = 70;

  canHandle(error: any): boolean {
    return (
      (error instanceof Error && error.name === 'TimeoutError') ||
      (error &&
        typeof error === 'object' &&
        (error.message?.includes('timeout') || error.message?.includes('超时')))
    );
  }

  protected getErrorType(_error: any): UploadErrorType {
    return UploadErrorType.TIMEOUT_ERROR;
  }
}

/**
 * 服务器错误处理策略
 */
export class ServerErrorHandler extends BaseErrorHandler {
  protected priority = 60;

  canHandle(error: any): boolean {
    return (
      (error && error.status >= 500 && error.status < 600) ||
      (error &&
        typeof error === 'object' &&
        (error.message?.includes('server error') ||
          error.message?.includes('服务器错误')))
    );
  }

  protected getErrorType(_error: any): UploadErrorType {
    return UploadErrorType.SERVER_ERROR;
  }
}

/**
 * 文件错误处理策略
 */
export class FileErrorHandler extends BaseErrorHandler {
  protected priority = 50;

  canHandle(error: any): boolean {
    return (
      (error instanceof Error && error.name === 'FileError') ||
      (error &&
        typeof error === 'object' &&
        (error.message?.includes('file') || error.message?.includes('文件')))
    );
  }

  protected getErrorType(_error: any): UploadErrorType {
    return UploadErrorType.FILE_ERROR;
  }
}

/**
 * 内容编码错误处理策略
 */
export class ContentEncodingErrorHandler extends BaseErrorHandler {
  protected priority = 45;

  canHandle(error: any): boolean {
    return (
      error &&
      typeof error === 'object' &&
      (error.message?.includes('encoding') ||
        error.message?.includes('编码') ||
        error.name === 'EncodingError')
    );
  }

  protected getErrorType(_error: any): UploadErrorType {
    return UploadErrorType.CONTENT_ENCODING_ERROR;
  }
}

/**
 * DNS错误处理策略
 */
export class DNSErrorHandler extends BaseErrorHandler {
  protected priority = 75;

  canHandle(error: any): boolean {
    return (
      error &&
      typeof error === 'object' &&
      (error.message?.includes('DNS') ||
        error.message?.includes('name not resolved') ||
        error.code === 'ENOTFOUND')
    );
  }

  protected getErrorType(_error: any): UploadErrorType {
    return UploadErrorType.DNS_ERROR;
  }
}

/**
 * 默认错误处理策略
 */
export class DefaultErrorHandler extends BaseErrorHandler {
  protected priority = 0; // 最低优先级

  canHandle(): boolean {
    // 默认处理器可以处理任何错误
    return true;
  }

  protected getErrorType(_error: any): UploadErrorType {
    return UploadErrorType.UNKNOWN_ERROR;
  }
}

/**
 * 错误处理策略工厂
 * 负责创建和管理错误处理策略
 */
export class ErrorHandlerFactory {
  private static handlers: IErrorHandler[] = [];
  private static selector: IHandlerSelector =
    new PriorityBasedHandlerSelector();

  /**
   * 注册错误处理策略
   * @param handler 错误处理器实例
   */
  public static registerHandler(handler: IErrorHandler): void {
    this.handlers.push(handler);
    // 按优先级排序处理器（如果有优先级属性）
    this.sortHandlers();
  }

  /**
   * 设置错误处理器选择策略
   * @param selector 选择器实例
   */
  public static setHandlerSelector(selector: IHandlerSelector): void {
    this.selector = selector;
  }

  /**
   * 按优先级排序处理器
   */
  private static sortHandlers(): void {
    this.handlers.sort((a, b) => {
      const priorityA = (a as BaseErrorHandler).getPriority?.() ?? 0;
      const priorityB = (b as BaseErrorHandler).getPriority?.() ?? 0;
      return priorityB - priorityA; // 高优先级在前
    });
  }

  /**
   * 重置所有策略
   */
  public static reset(): void {
    this.handlers = [];
  }

  /**
   * 初始化默认处理器
   */
  public static initDefaultHandlers(): void {
    this.reset();
    this.registerHandler(new NetworkErrorHandler());
    this.registerHandler(new TimeoutErrorHandler());
    this.registerHandler(new ServerErrorHandler());
    this.registerHandler(new FileErrorHandler());
    this.registerHandler(new ContentEncodingErrorHandler());
    this.registerHandler(new DNSErrorHandler());
    this.registerHandler(new DefaultErrorHandler());
  }

  /**
   * 处理错误
   * @param error 原始错误对象
   * @param context 错误上下文数据
   * @returns 标准化的上传错误对象
   */
  public static handle(error: any, context?: ErrorContextData): UploadError {
    // 确保有默认处理器
    if (this.handlers.length === 0) {
      this.initDefaultHandlers();
    }

    // 选择合适的处理器
    let handler = this.selector.selectHandler(error, this.handlers);

    // 如果没有找到合适的处理器，使用默认处理器
    if (!handler) {
      handler = new DefaultErrorHandler();
    }

    try {
      return handler.handle(error, context);
    } catch (e) {
      // 处理器本身出错，使用默认处理器处理原始错误
      console.error('错误处理器执行失败:', e);
      return new DefaultErrorHandler().handle(error, context);
    }
  }
}

// 默认导出工厂类
export default ErrorHandlerFactory;
