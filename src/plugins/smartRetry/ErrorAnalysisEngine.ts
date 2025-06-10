/**
 * 错误分析引擎
 * 负责分析错误并提供最佳恢复策略建议
 */
import {
  UploadError,
  UploadErrorType,
  ErrorGroup,
  ErrorRecoveryStrategy,
  ErrorAnalysisResult,
} from '../../types';

/**
 * 错误分析引擎
 */
export class ErrorAnalysisEngine {
  /**
   * 错误类型到错误组的映射
   */
  private errorTypeToGroupMap: Record<UploadErrorType, ErrorGroup> = {
    [UploadErrorType.NETWORK_ERROR]: ErrorGroup.NETWORK,
    [UploadErrorType.FILE_ERROR]: ErrorGroup.FILE,
    [UploadErrorType.SERVER_ERROR]: ErrorGroup.SERVER,
    [UploadErrorType.ENVIRONMENT_ERROR]: ErrorGroup.ENVIRONMENT,
    [UploadErrorType.WORKER_ERROR]: ErrorGroup.RESOURCE,
    [UploadErrorType.TIMEOUT_ERROR]: ErrorGroup.NETWORK,
    [UploadErrorType.MEMORY_ERROR]: ErrorGroup.RESOURCE,
    [UploadErrorType.PERMISSION_ERROR]: ErrorGroup.PERMISSION,
    [UploadErrorType.QUOTA_EXCEEDED_ERROR]: ErrorGroup.RESOURCE,
    [UploadErrorType.UPLOAD_ERROR]: ErrorGroup.NETWORK,
    [UploadErrorType.MERGE_ERROR]: ErrorGroup.DATA,
    [UploadErrorType.VALIDATION_ERROR]: ErrorGroup.DATA,
    [UploadErrorType.CANCEL_ERROR]: ErrorGroup.USER,
    [UploadErrorType.SECURITY_ERROR]: ErrorGroup.SECURITY,
    [UploadErrorType.DATA_CORRUPTION_ERROR]: ErrorGroup.DATA,
    [UploadErrorType.API_ERROR]: ErrorGroup.SERVER,
    [UploadErrorType.UNKNOWN_ERROR]: ErrorGroup.OTHER,
    [UploadErrorType.RATE_LIMIT_ERROR]: ErrorGroup.SERVER,
    [UploadErrorType.CONNECTION_RESET_ERROR]: ErrorGroup.NETWORK,
    [UploadErrorType.SERVER_UNREACHABLE_ERROR]: ErrorGroup.NETWORK,
    [UploadErrorType.DNS_RESOLUTION_ERROR]: ErrorGroup.NETWORK,
    [UploadErrorType.AUTHENTICATION_ERROR]: ErrorGroup.SECURITY,
    [UploadErrorType.CONTENT_ENCODING_ERROR]: ErrorGroup.DATA,
    [UploadErrorType.DATA_PROCESSING_ERROR]: ErrorGroup.DATA,
  };

  /**
   * 错误类型到优先级的映射
   */
  private errorTypeToPriorityMap: Record<UploadErrorType, number> = {
    [UploadErrorType.NETWORK_ERROR]: 7,
    [UploadErrorType.FILE_ERROR]: 2,
    [UploadErrorType.SERVER_ERROR]: 6,
    [UploadErrorType.ENVIRONMENT_ERROR]: 1,
    [UploadErrorType.WORKER_ERROR]: 4,
    [UploadErrorType.TIMEOUT_ERROR]: 8,
    [UploadErrorType.MEMORY_ERROR]: 3,
    [UploadErrorType.PERMISSION_ERROR]: 1,
    [UploadErrorType.QUOTA_EXCEEDED_ERROR]: 1,
    [UploadErrorType.UPLOAD_ERROR]: 9,
    [UploadErrorType.MERGE_ERROR]: 5,
    [UploadErrorType.VALIDATION_ERROR]: 2,
    [UploadErrorType.CANCEL_ERROR]: 0,
    [UploadErrorType.SECURITY_ERROR]: 1,
    [UploadErrorType.DATA_CORRUPTION_ERROR]: 4,
    [UploadErrorType.API_ERROR]: 6,
    [UploadErrorType.UNKNOWN_ERROR]: 5,
    [UploadErrorType.RATE_LIMIT_ERROR]: 7,
    [UploadErrorType.CONNECTION_RESET_ERROR]: 8,
    [UploadErrorType.SERVER_UNREACHABLE_ERROR]: 6,
    [UploadErrorType.DNS_RESOLUTION_ERROR]: 5,
    [UploadErrorType.AUTHENTICATION_ERROR]: 3,
    [UploadErrorType.CONTENT_ENCODING_ERROR]: 4,
    [UploadErrorType.DATA_PROCESSING_ERROR]: 5,
  };

  /**
   * 错误类型到最大重试次数的映射
   */
  private errorTypeToMaxRetriesMap: Record<UploadErrorType, number> = {
    [UploadErrorType.NETWORK_ERROR]: 5,
    [UploadErrorType.FILE_ERROR]: 2,
    [UploadErrorType.SERVER_ERROR]: 3,
    [UploadErrorType.ENVIRONMENT_ERROR]: 1,
    [UploadErrorType.WORKER_ERROR]: 2,
    [UploadErrorType.TIMEOUT_ERROR]: 4,
    [UploadErrorType.MEMORY_ERROR]: 2,
    [UploadErrorType.PERMISSION_ERROR]: 1,
    [UploadErrorType.QUOTA_EXCEEDED_ERROR]: 0,
    [UploadErrorType.UPLOAD_ERROR]: 5,
    [UploadErrorType.MERGE_ERROR]: 3,
    [UploadErrorType.VALIDATION_ERROR]: 1,
    [UploadErrorType.CANCEL_ERROR]: 0,
    [UploadErrorType.SECURITY_ERROR]: 0,
    [UploadErrorType.DATA_CORRUPTION_ERROR]: 2,
    [UploadErrorType.API_ERROR]: 3,
    [UploadErrorType.UNKNOWN_ERROR]: 3,
    [UploadErrorType.RATE_LIMIT_ERROR]: 4,
    [UploadErrorType.CONNECTION_RESET_ERROR]: 5,
    [UploadErrorType.SERVER_UNREACHABLE_ERROR]: 3,
    [UploadErrorType.DNS_RESOLUTION_ERROR]: 3,
    [UploadErrorType.AUTHENTICATION_ERROR]: 2,
    [UploadErrorType.CONTENT_ENCODING_ERROR]: 2,
    [UploadErrorType.DATA_PROCESSING_ERROR]: 3,
  };

  /**
   * 错误类型到恢复策略的映射
   */
  private errorTypeToRecoveryStrategyMap: Record<
    UploadErrorType,
    ErrorRecoveryStrategy
  > = {
    [UploadErrorType.NETWORK_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_NETWORK,
    [UploadErrorType.FILE_ERROR]: ErrorRecoveryStrategy.ABORT,
    [UploadErrorType.SERVER_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
    [UploadErrorType.ENVIRONMENT_ERROR]: ErrorRecoveryStrategy.ABORT,
    [UploadErrorType.WORKER_ERROR]: ErrorRecoveryStrategy.FALLBACK,
    [UploadErrorType.TIMEOUT_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_BACKOFF,
    [UploadErrorType.MEMORY_ERROR]: ErrorRecoveryStrategy.PAUSE_AND_RETRY,
    [UploadErrorType.PERMISSION_ERROR]:
      ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
    [UploadErrorType.QUOTA_EXCEEDED_ERROR]:
      ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
    [UploadErrorType.UPLOAD_ERROR]: ErrorRecoveryStrategy.RETRY_IMMEDIATELY,
    [UploadErrorType.MERGE_ERROR]: ErrorRecoveryStrategy.REINITIALIZE,
    [UploadErrorType.VALIDATION_ERROR]: ErrorRecoveryStrategy.ABORT,
    [UploadErrorType.CANCEL_ERROR]: ErrorRecoveryStrategy.ABORT,
    [UploadErrorType.SECURITY_ERROR]: ErrorRecoveryStrategy.ABORT,
    [UploadErrorType.DATA_CORRUPTION_ERROR]: ErrorRecoveryStrategy.REINITIALIZE,
    [UploadErrorType.API_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
    [UploadErrorType.UNKNOWN_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_BACKOFF,
    [UploadErrorType.RATE_LIMIT_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
    [UploadErrorType.CONNECTION_RESET_ERROR]:
      ErrorRecoveryStrategy.RETRY_WITH_BACKOFF,
    [UploadErrorType.SERVER_UNREACHABLE_ERROR]:
      ErrorRecoveryStrategy.WAIT_FOR_NETWORK,
    [UploadErrorType.DNS_RESOLUTION_ERROR]:
      ErrorRecoveryStrategy.WAIT_FOR_NETWORK,
    [UploadErrorType.AUTHENTICATION_ERROR]:
      ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
    [UploadErrorType.CONTENT_ENCODING_ERROR]:
      ErrorRecoveryStrategy.RETRY_IMMEDIATELY,
    [UploadErrorType.DATA_PROCESSING_ERROR]:
      ErrorRecoveryStrategy.RETRY_WITH_BACKOFF,
  };

  /**
   * 不可重试的错误类型
   */
  private nonRecoverableErrorTypes: Set<UploadErrorType> = new Set([
    UploadErrorType.SECURITY_ERROR,
    UploadErrorType.CANCEL_ERROR,
    UploadErrorType.VALIDATION_ERROR,
    UploadErrorType.PERMISSION_ERROR,
    UploadErrorType.QUOTA_EXCEEDED_ERROR,
  ]);

  /**
   * 创建实例时可自定义配置
   * @param customErrorTypeToMaxRetries 自定义错误类型到最大重试次数的映射
   * @param customNonRecoverableTypes 自定义不可重试的错误类型
   */
  constructor(
    customErrorTypeToMaxRetries?: Partial<Record<UploadErrorType, number>>,
    customNonRecoverableTypes?: UploadErrorType[]
  ) {
    // 合并自定义最大重试次数映射
    if (customErrorTypeToMaxRetries) {
      this.errorTypeToMaxRetriesMap = {
        ...this.errorTypeToMaxRetriesMap,
        ...customErrorTypeToMaxRetries,
      };
    }

    // 合并自定义不可重试错误类型
    if (customNonRecoverableTypes) {
      customNonRecoverableTypes.forEach(type =>
        this.nonRecoverableErrorTypes.add(type)
      );
    }
  }

  /**
   * 分析错误
   * @param error 错误对象
   * @param context 上下文信息
   * @returns 错误分析结果
   */
  public analyzeError(
    error: Error,
    context?: Record<string, any>
  ): ErrorAnalysisResult {
    // 获取错误类型
    let errorType = UploadErrorType.UNKNOWN_ERROR;
    let errorContext = context || {};

    // 如果是 UploadError 类型，可以直接获取类型
    if (error instanceof UploadError) {
      errorType = error.type;
      if (error.context) {
        errorContext = { ...errorContext, ...error.context };
      }
    } else {
      // 尝试从一般错误中推断类型
      errorType = this.inferErrorType(error);
    }

    // 获取错误组
    const errorGroup = this.getErrorGroup(errorType);

    // 获取恢复策略
    const suggestedStrategy = this.getRecoveryStrategy(errorType);

    // 判断是否可恢复
    const isRecoverable = this.isErrorRecoverable(errorType);

    // 获取最大重试次数
    const suggestedMaxRetries = this.getMaxRetries(errorType);

    // 获取重试优先级
    const retryPriority = this.getRetryPriority(errorType);

    return {
      errorType,
      errorGroup,
      suggestedStrategy,
      isRecoverable,
      suggestedMaxRetries,
      context: errorContext,
      retryPriority,
    };
  }

  /**
   * 推断错误类型
   * @param error 一般错误对象
   * @returns 推断的错误类型
   */
  private inferErrorType(error: Error): UploadErrorType {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // 根据错误信息和名称推断类型
    if (errorName.includes('timeout') || errorMessage.includes('timeout')) {
      return UploadErrorType.TIMEOUT_ERROR;
    }

    if (
      errorMessage.includes('network') ||
      errorName.includes('network') ||
      errorMessage.includes('offline') ||
      errorMessage.includes('internet')
    ) {
      return UploadErrorType.NETWORK_ERROR;
    }

    if (
      errorMessage.includes('memory') ||
      errorName.includes('memory') ||
      errorMessage.includes('allocation') ||
      errorMessage.includes('heap')
    ) {
      return UploadErrorType.MEMORY_ERROR;
    }

    if (
      errorMessage.includes('server') ||
      errorMessage.includes('500') ||
      errorMessage.includes('503')
    ) {
      return UploadErrorType.SERVER_ERROR;
    }

    if (
      errorMessage.includes('permission') ||
      errorMessage.includes('denied')
    ) {
      return UploadErrorType.PERMISSION_ERROR;
    }

    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      return UploadErrorType.API_ERROR;
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return UploadErrorType.RATE_LIMIT_ERROR;
    }

    if (
      errorMessage.includes('connection reset') ||
      errorMessage.includes('connection closed')
    ) {
      return UploadErrorType.CONNECTION_RESET_ERROR;
    }

    if (errorMessage.includes('dns') || errorMessage.includes('resolve')) {
      return UploadErrorType.DNS_RESOLUTION_ERROR;
    }

    return UploadErrorType.UNKNOWN_ERROR;
  }

  /**
   * 获取错误组
   * @param errorType 错误类型
   * @returns 错误组
   */
  private getErrorGroup(errorType: UploadErrorType): ErrorGroup {
    return this.errorTypeToGroupMap[errorType] || ErrorGroup.OTHER;
  }

  /**
   * 获取恢复策略
   * @param errorType 错误类型
   * @returns 恢复策略
   */
  private getRecoveryStrategy(
    errorType: UploadErrorType
  ): ErrorRecoveryStrategy {
    return (
      this.errorTypeToRecoveryStrategyMap[errorType] ||
      ErrorRecoveryStrategy.ABORT
    );
  }

  /**
   * 判断错误是否可恢复
   * @param errorType 错误类型
   * @returns 是否可恢复
   */
  private isErrorRecoverable(errorType: UploadErrorType): boolean {
    return !this.nonRecoverableErrorTypes.has(errorType);
  }

  /**
   * 获取最大重试次数
   * @param errorType 错误类型
   * @returns 最大重试次数
   */
  private getMaxRetries(errorType: UploadErrorType): number {
    return this.errorTypeToMaxRetriesMap[errorType] || 0;
  }

  /**
   * 获取重试优先级
   * @param errorType 错误类型
   * @returns 重试优先级
   */
  private getRetryPriority(errorType: UploadErrorType): number {
    return this.errorTypeToPriorityMap[errorType] || 5;
  }
}
