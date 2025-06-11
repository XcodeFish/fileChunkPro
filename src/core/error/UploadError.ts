/**
 * 上传错误类
 * 优化版的上传错误类，职责清晰，模块化设计
 */
import {
  UploadErrorType,
  ErrorSeverity,
  ErrorGroup,
  ErrorRecoveryStrategy,
  ErrorContextData,
  ERROR_TYPE_TO_GROUP,
  ERROR_TYPE_TO_SEVERITY,
  ERROR_TYPE_TO_RECOVERY_STRATEGY,
} from '../../types/errors';

// 生成唯一ID的工具函数
const generateUniqueId = (prefix: string): string => {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${randomPart}`;
};

/**
 * 上传错误类
 * 封装所有与上传相关的错误
 */
export class UploadError extends Error {
  /** 错误唯一标识 */
  public readonly errorId: string;

  /** 错误发生时间 */
  public readonly timestamp: number;

  /** 重试次数 */
  public retryCount = 0;

  /** 错误恢复尝试历史记录 */
  public recoveryAttempts: {
    timestamp: number;
    successful: boolean;
    strategy: ErrorRecoveryStrategy;
  }[] = [];

  /** 错误严重程度 */
  public severity: ErrorSeverity;

  /** 错误分组 */
  public group: ErrorGroup;

  /** 错误是否可恢复 */
  public isRecoverable: boolean;

  /** 推荐的解决方案 */
  public recommendedSolutions?: string[];

  /** 最佳恢复策略 */
  public bestRecoveryStrategy: ErrorRecoveryStrategy;

  /** 诊断数据 */
  public diagnosticData: {
    /** 网络诊断信息 */
    networkDiagnosis?: {
      /** 网络状态历史 */
      statusHistory?: Array<{
        timestamp: number;
        online: boolean;
      }>;
      /** 连接质量数据 */
      connectionQuality?: {
        rtt?: number;
        downlink?: number;
        effectiveType?: string;
        quality?: string;
      };
    };
    /** 资源使用状况 */
    resourceStats?: {
      /** 内存使用 */
      memory?: {
        totalJSHeapSize?: number;
        usedJSHeapSize?: number;
        jsHeapSizeLimit?: number;
        availableMemoryPercentage?: number;
      };
      /** CPU使用率 */
      cpuUsage?: number;
    };
    /** 错误发生统计 */
    occurrenceStats: {
      /** 类似错误数量 */
      similarErrorCount: number;
      /** 首次出现时间 */
      firstOccurrence: number;
      /** 会话中错误总数 */
      sessionErrorCount: number;
    };
  };

  /**
   * 上传错误构造函数
   * @param type 错误类型
   * @param message 错误消息
   * @param originalError 原始错误对象
   * @param chunkInfo 分片信息
   * @param context 上下文信息
   */
  constructor(
    public readonly type: UploadErrorType,
    message: string,
    public readonly originalError?: any,
    public readonly chunkInfo?: { index: number; retryCount: number },
    public context?: ErrorContextData
  ) {
    super(message);

    // 设置基本信息
    this.name = 'UploadError';
    this.timestamp = Date.now();
    this.errorId = generateUniqueId(this.type);

    // 从映射表中获取分组、严重度和恢复策略
    this.severity = ERROR_TYPE_TO_SEVERITY[this.type] || ErrorSeverity.LOW;
    this.group = ERROR_TYPE_TO_GROUP[this.type] || ErrorGroup.OTHER;
    this.bestRecoveryStrategy =
      ERROR_TYPE_TO_RECOVERY_STRATEGY[this.type] ||
      ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION;

    // 确定是否可恢复
    this.isRecoverable = this.checkRecoverable();

    // 初始化诊断数据
    this.diagnosticData = {
      occurrenceStats: {
        similarErrorCount: 1,
        firstOccurrence: this.timestamp,
        sessionErrorCount: 1,
      },
    };

    // 如果有分片信息，设置重试次数
    if (chunkInfo?.retryCount) {
      this.retryCount = chunkInfo.retryCount;
    }

    // 捕获错误堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UploadError);
    }

    // 初始化推荐解决方案
    this.recommendedSolutions = this.getPossibleSolutions();
  }

  /**
   * 检查错误是否可恢复（可重试）
   */
  private checkRecoverable(): boolean {
    // 根据恢复策略判断是否可恢复
    return (
      this.bestRecoveryStrategy !== ErrorRecoveryStrategy.ABORT &&
      this.bestRecoveryStrategy !== ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION
    );
  }

  /**
   * 添加上下文信息
   * @param context 上下文信息
   */
  public addContext(context: Partial<ErrorContextData>): this {
    this.context = { ...this.context, ...context } as ErrorContextData;
    return this;
  }

  /**
   * 记录恢复尝试
   * @param successful 是否成功恢复
   * @param strategy 使用的恢复策略
   */
  public recordRecoveryAttempt(
    successful: boolean,
    strategy: ErrorRecoveryStrategy
  ): this {
    this.recoveryAttempts.push({
      timestamp: Date.now(),
      successful,
      strategy,
    });

    // 如果成功恢复，增加重试计数
    if (successful) {
      this.retryCount++;
    }

    return this;
  }

  /**
   * 获取用户友好的错误消息
   */
  public getFriendlyMessage(): string {
    const retryInfo =
      this.retryCount > 0 ? `（已重试${this.retryCount}次）` : '';
    const chunkInfo = this.chunkInfo ? `(分片 ${this.chunkInfo.index})` : '';

    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return `网络连接失败，请检查您的网络设置并重试${retryInfo}。`;
      case UploadErrorType.TIMEOUT_ERROR:
        return `请求超时，服务器响应时间过长，请稍后重试${retryInfo}。`;
      case UploadErrorType.SERVER_ERROR:
        return `服务器错误，请联系管理员或稍后重试${retryInfo}。`;
      case UploadErrorType.FILE_ERROR:
        return `文件处理失败，请确认文件完整且格式正确${retryInfo}。`;
      case UploadErrorType.UPLOAD_ERROR:
        return `上传失败${chunkInfo}${retryInfo}，请重试。`;
      // 可以根据需要添加其他错误类型的友好消息
      default:
        return this.message || `发生未知错误${retryInfo}，请重试。`;
    }
  }

  /**
   * 获取可能的解决方案
   */
  private getPossibleSolutions(): string[] {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return [
          '检查网络连接是否正常',
          '尝试切换网络环境（如从Wi-Fi切换到移动网络）',
          '检查服务器地址是否正确',
          '检查是否有防火墙或代理阻止连接',
        ];
      case UploadErrorType.TIMEOUT_ERROR:
        return [
          '检查网络速度',
          '尝试减小文件大小或分片大小',
          '稍后再试，服务器可能暂时繁忙',
        ];
      case UploadErrorType.SERVER_ERROR:
        return [
          '稍后重试，服务器可能暂时不可用',
          '联系服务提供商或管理员报告问题',
        ];
      // 可以根据需要添加其他错误类型的解决方案
      default:
        return ['刷新页面重试', '检查控制台是否有更详细的错误信息'];
    }
  }

  /**
   * 获取恢复优先级（越高越应该尝试恢复）
   */
  public getRecoveryPriority(): number {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return 4; // 网络错误很可能是暂时的，高优先级恢复
      case UploadErrorType.TIMEOUT_ERROR:
        return 3; // 超时可能是暂时的，较高优先级
      case UploadErrorType.SERVER_ERROR:
        return 2; // 服务器错误可能需要等待，中等优先级
      case UploadErrorType.UPLOAD_ERROR:
        return 3; // 上传错误可能是暂时的，较高优先级
      default:
        return 1; // 其他错误可能不适合自动恢复
    }
  }

  /**
   * 序列化错误对象
   */
  public toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      errorId: this.errorId,
      severity: this.severity,
      group: this.group,
      isRecoverable: this.isRecoverable,
      bestRecoveryStrategy: this.bestRecoveryStrategy,
      chunkInfo: this.chunkInfo,
      timestamp: this.timestamp,
      retryCount: this.retryCount,
      recoveryAttempts: this.recoveryAttempts,
      diagnosticData: this.diagnosticData,
      recommendedSolutions: this.recommendedSolutions,
    };
  }
}
