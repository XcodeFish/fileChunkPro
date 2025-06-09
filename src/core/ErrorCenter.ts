/**
 * ErrorCenter - 统一错误处理中心
 * 负责错误的分类、封装与处理
 */

import {
  UploadErrorType,
  ErrorSeverity,
  ErrorGroup,
  ErrorRecoveryStrategy,
  ErrorContextData,
  NetworkQuality,
  MemoryStats,
} from '../types';

/**
 * 扩展的上传错误类，提供更完善的错误处理和分析能力
 */
export class UploadError extends Error {
  /** 错误发生时间 */
  public timestamp: number;

  /** 重试计数 */
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

  /** 错误详细数据收集 */
  public diagnosticData?: {
    /** 网络诊断信息 */
    networkDiagnosis?: {
      /** 网络状态历史 */
      statusHistory?: Array<{
        timestamp: number;
        online: boolean;
      }>;
      /** 连接质量测量 */
      connectionQuality?: {
        rtt?: number;
        downlink?: number;
        effectiveType?: string;
        quality?: NetworkQuality;
      };
      /** DNS解析时间 */
      dnsResolutionTime?: number;
      /** 请求历史 */
      requestHistory?: Array<{
        timestamp: number;
        duration: number;
        success: boolean;
        status?: number;
      }>;
    };

    /** 资源使用情况 */
    resourceStats?: {
      /** 内存使用 */
      memory?: MemoryStats;
      /** CPU使用率 */
      cpuUsage?: number;
      /** 上传带宽 */
      uploadBandwidth?: number;
    };

    /** 错误频率统计 */
    occurrenceStats?: {
      /** 相似错误出现次数 */
      similarErrorCount: number;
      /** 首次出现时间 */
      firstOccurrence: number;
      /** 同一会话中错误总数 */
      sessionErrorCount: number;
    };
  };

  /** 推荐的解决方案 */
  public recommendedSolutions?: string[];

  /** 最佳恢复策略 */
  public bestRecoveryStrategy?: ErrorRecoveryStrategy;

  /** 错误是否可恢复 */
  public isRecoverable?: boolean;

  /** 错误的唯一标识符 */
  public errorId: string;

  /**
   * 上传错误构造函数
   *
   * @param type 错误类型
   * @param message 错误消息
   * @param originalError 原始错误对象
   * @param chunkInfo 分片信息
   * @param context 上下文信息
   */
  constructor(
    public type: UploadErrorType,
    public message: string,
    public originalError?: any,
    public chunkInfo?: { index: number; retryCount: number },
    public context?: ErrorContextData
  ) {
    super(message);
    this.name = 'UploadError';
    this.timestamp = Date.now();
    this.errorId = this.generateErrorId();

    // 设置默认严重度和分组
    this.severity = this.calculateSeverity();
    this.group = this.deriveErrorGroup();

    // 判断错误是否可恢复
    this.isRecoverable = this.calculateRecoverability();

    // 获取推荐的解决方案
    this.recommendedSolutions = this.getPossibleSolutions();

    // 确定最佳恢复策略
    this.bestRecoveryStrategy = this.determineBestRecoveryStrategy();

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

    // 如果分片信息包含重试计数，复制到错误对象
    if (chunkInfo?.retryCount) {
      this.retryCount = chunkInfo.retryCount;
    }

    // 初始化诊断数据
    this.initDiagnosticData();
  }

  /**
   * 生成错误唯一ID
   */
  private generateErrorId(): string {
    // 结合错误类型、时间戳和随机数生成唯一ID
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `${this.type}_${Date.now()}_${randomPart}`;
  }

  /**
   * 初始化错误诊断数据
   */
  private initDiagnosticData(): void {
    // 初始化基本诊断数据结构
    this.diagnosticData = {
      occurrenceStats: {
        similarErrorCount: 1,
        firstOccurrence: this.timestamp,
        sessionErrorCount: 1,
      },
    };

    // 如果有网络相关上下文，添加到诊断数据
    if (this.context?.network) {
      this.diagnosticData.networkDiagnosis = {
        statusHistory: [
          {
            timestamp: this.timestamp,
            online: this.context.network.online,
          },
        ],
        connectionQuality: {
          rtt: this.context.network.rtt,
          downlink: this.context.network.downlink,
        },
      };
    }

    // 如果有资源相关上下文，添加到诊断数据
    if (this.context?.environment?.memory) {
      this.diagnosticData.resourceStats = {
        memory: this.context.environment.memory,
      };
    }
  }

  /**
   * 计算错误的严重程度
   */
  private calculateSeverity(): ErrorSeverity {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
      case UploadErrorType.SERVER_UNREACHABLE_ERROR:
      case UploadErrorType.DNS_RESOLUTION_ERROR:
      case UploadErrorType.CONNECTION_RESET_ERROR:
        return ErrorSeverity.HIGH;

      case UploadErrorType.TIMEOUT_ERROR:
      case UploadErrorType.SERVER_ERROR:
      case UploadErrorType.MERGE_ERROR:
      case UploadErrorType.MEMORY_ERROR:
      case UploadErrorType.AUTHENTICATION_ERROR:
      case UploadErrorType.SECURITY_ERROR:
      case UploadErrorType.DATA_CORRUPTION_ERROR:
        return ErrorSeverity.MEDIUM;

      case UploadErrorType.UPLOAD_ERROR:
      case UploadErrorType.FILE_ERROR:
      case UploadErrorType.WORKER_ERROR:
      case UploadErrorType.RATE_LIMIT_ERROR:
      case UploadErrorType.VALIDATION_ERROR:
      case UploadErrorType.API_ERROR:
      case UploadErrorType.DATA_PROCESSING_ERROR:
      case UploadErrorType.CONTENT_ENCODING_ERROR:
        return ErrorSeverity.MEDIUM;

      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
      case UploadErrorType.PERMISSION_ERROR:
      case UploadErrorType.ENVIRONMENT_ERROR:
      case UploadErrorType.CANCEL_ERROR:
        return ErrorSeverity.LOW;

      default:
        return ErrorSeverity.LOW;
    }
  }

  /**
   * 确定错误所属分组
   */
  private deriveErrorGroup(): ErrorGroup {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
      case UploadErrorType.TIMEOUT_ERROR:
      case UploadErrorType.SERVER_UNREACHABLE_ERROR:
      case UploadErrorType.DNS_RESOLUTION_ERROR:
      case UploadErrorType.CONNECTION_RESET_ERROR:
      case UploadErrorType.RATE_LIMIT_ERROR:
        return ErrorGroup.NETWORK;

      case UploadErrorType.FILE_ERROR:
      case UploadErrorType.DATA_CORRUPTION_ERROR:
      case UploadErrorType.VALIDATION_ERROR:
        return ErrorGroup.FILE;

      case UploadErrorType.SERVER_ERROR:
      case UploadErrorType.MERGE_ERROR:
      case UploadErrorType.API_ERROR:
        return ErrorGroup.SERVER;

      case UploadErrorType.ENVIRONMENT_ERROR:
      case UploadErrorType.WORKER_ERROR:
        return ErrorGroup.ENVIRONMENT;

      case UploadErrorType.MEMORY_ERROR:
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return ErrorGroup.RESOURCE;

      case UploadErrorType.PERMISSION_ERROR:
      case UploadErrorType.AUTHENTICATION_ERROR:
        return ErrorGroup.PERMISSION;

      case UploadErrorType.SECURITY_ERROR:
        return ErrorGroup.SECURITY;

      case UploadErrorType.CANCEL_ERROR:
        return ErrorGroup.USER;

      case UploadErrorType.CONTENT_ENCODING_ERROR:
      case UploadErrorType.DATA_PROCESSING_ERROR:
        return ErrorGroup.DATA;

      default:
        return ErrorGroup.OTHER;
    }
  }

  /**
   * 确定最佳恢复策略
   */
  private determineBestRecoveryStrategy(): ErrorRecoveryStrategy {
    if (!this.isRecoverable) {
      return ErrorRecoveryStrategy.ABORT;
    }

    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
      case UploadErrorType.SERVER_UNREACHABLE_ERROR:
      case UploadErrorType.DNS_RESOLUTION_ERROR:
        return ErrorRecoveryStrategy.WAIT_FOR_NETWORK;

      case UploadErrorType.TIMEOUT_ERROR:
      case UploadErrorType.CONNECTION_RESET_ERROR:
        return ErrorRecoveryStrategy.RETRY_WITH_BACKOFF;

      case UploadErrorType.SERVER_ERROR:
      case UploadErrorType.RATE_LIMIT_ERROR:
        return ErrorRecoveryStrategy.RETRY_WITH_DELAY;

      case UploadErrorType.UPLOAD_ERROR:
        return ErrorRecoveryStrategy.RETRY_IMMEDIATELY;

      case UploadErrorType.MEMORY_ERROR:
        return ErrorRecoveryStrategy.PAUSE_AND_RETRY;

      case UploadErrorType.WORKER_ERROR:
        return ErrorRecoveryStrategy.FALLBACK;

      case UploadErrorType.MERGE_ERROR:
      case UploadErrorType.DATA_CORRUPTION_ERROR:
        return ErrorRecoveryStrategy.REINITIALIZE;

      default:
        return ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION;
    }
  }

  /**
   * 计算错误是否可恢复
   */
  private calculateRecoverability(): boolean {
    // 可恢复的错误类型
    const recoverableTypes = [
      UploadErrorType.NETWORK_ERROR,
      UploadErrorType.TIMEOUT_ERROR,
      UploadErrorType.SERVER_ERROR,
      UploadErrorType.UPLOAD_ERROR,
      UploadErrorType.WORKER_ERROR,
      UploadErrorType.MERGE_ERROR,
      UploadErrorType.CONNECTION_RESET_ERROR,
      UploadErrorType.SERVER_UNREACHABLE_ERROR,
      UploadErrorType.DNS_RESOLUTION_ERROR,
      UploadErrorType.RATE_LIMIT_ERROR,
      UploadErrorType.DATA_PROCESSING_ERROR,
    ];

    return recoverableTypes.includes(this.type);
  }

  /**
   * 序列化错误对象
   */
  toJSON() {
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
      context: this.context,
      stack: this.stack,
      timestamp: this.timestamp,
      retryCount: this.retryCount,
      recoveryAttempts: this.recoveryAttempts,
      diagnosticData: this.diagnosticData,
      recommendedSolutions: this.recommendedSolutions,
    };
  }

  /**
   * 为错误添加上下文信息
   * @param context 上下文信息
   */
  addContext(context: Partial<ErrorContextData>): this {
    this.context = { ...this.context, ...context } as ErrorContextData;
    return this;
  }

  /**
   * 记录恢复尝试
   * @param successful 是否成功恢复
   * @param strategy 使用的恢复策略
   */
  recordRecoveryAttempt(
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
   * 增加诊断数据
   * @param data 诊断数据
   */
  addDiagnosticData(
    data: Partial<NonNullable<UploadError['diagnosticData']>>
  ): this {
    if (!this.diagnosticData) {
      this.diagnosticData = {
        occurrenceStats: {
          similarErrorCount: 1,
          firstOccurrence: this.timestamp,
          sessionErrorCount: 1,
        },
      };
    }

    // 深度合并诊断数据
    this.diagnosticData = this.deepMerge(this.diagnosticData, data);

    return this;
  }

  /**
   * 深度合并对象
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const output = { ...target };

    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;

    function isObject(item: any): item is Record<string, any> {
      return item && typeof item === 'object' && !Array.isArray(item);
    }
  }

  /**
   * 获取用户友好的错误消息
   */
  getFriendlyMessage(): string {
    // 根据重试次数调整消息
    const retryInfo =
      this.retryCount > 0 ? `（已重试${this.retryCount}次）` : '';

    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return `网络连接失败，请检查您的网络设置并重试${retryInfo}。`;
      case UploadErrorType.TIMEOUT_ERROR:
        return `请求超时，服务器响应时间过长，请稍后重试${retryInfo}。`;
      case UploadErrorType.SERVER_ERROR:
        return `服务器错误，请联系管理员或稍后重试${retryInfo}。`;
      case UploadErrorType.FILE_ERROR:
        return `文件处理失败，请确认文件完整且格式正确${retryInfo}。`;
      case UploadErrorType.PERMISSION_ERROR:
        return `权限不足，无法完成请求操作${retryInfo}。`;
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return `存储空间不足，请清理空间后重试${retryInfo}。`;
      case UploadErrorType.MEMORY_ERROR:
        return `内存不足，请尝试关闭其他应用或使用更小的文件${retryInfo}。`;
      case UploadErrorType.WORKER_ERROR:
        return `后台处理失败，已切换到备用模式，请重试${retryInfo}。`;
      case UploadErrorType.ENVIRONMENT_ERROR:
        return `当前环境不支持此操作，请尝试使用其他浏览器${retryInfo}。`;
      case UploadErrorType.UPLOAD_ERROR:
        return `上传失败${this.chunkInfo ? `(分片 ${this.chunkInfo.index})` : ''}${retryInfo}，请重试。`;
      case UploadErrorType.MERGE_ERROR:
        return `文件合并失败${retryInfo}，请重新上传。`;
      case UploadErrorType.VALIDATION_ERROR:
        return `文件验证失败，请检查文件类型和大小是否符合要求${retryInfo}。`;
      case UploadErrorType.CANCEL_ERROR:
        return `上传已取消${retryInfo}。`;
      case UploadErrorType.SECURITY_ERROR:
        return `安全检查失败，无法继续上传${retryInfo}。`;
      case UploadErrorType.DATA_CORRUPTION_ERROR:
        return `数据损坏，请重新选择文件上传${retryInfo}。`;
      case UploadErrorType.SERVER_UNREACHABLE_ERROR:
        return `无法连接到服务器，请检查网络连接或服务器地址${retryInfo}。`;
      case UploadErrorType.CONNECTION_RESET_ERROR:
        return `连接被重置，请检查网络连接并重试${retryInfo}。`;
      case UploadErrorType.DNS_RESOLUTION_ERROR:
        return `域名解析失败，请检查网络连接或服务器地址${retryInfo}。`;
      case UploadErrorType.AUTHENTICATION_ERROR:
        return `认证失败，请重新登录或检查权限设置${retryInfo}。`;
      case UploadErrorType.RATE_LIMIT_ERROR:
        return `请求频率过高，请稍后再试${retryInfo}。`;
      case UploadErrorType.API_ERROR:
        return `API调用失败，请检查参数或稍后重试${retryInfo}。`;
      case UploadErrorType.CONTENT_ENCODING_ERROR:
        return `内容编码错误，请检查文件格式${retryInfo}。`;
      case UploadErrorType.DATA_PROCESSING_ERROR:
        return `数据处理错误，请重试或使用其他文件${retryInfo}。`;
      default:
        return this.message || `发生未知错误${retryInfo}，请重试。`;
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
          '尝试切换网络环境（如从Wi-Fi切换到移动网络）',
          '检查服务器地址是否正确',
          '检查是否有防火墙或代理阻止连接',
          '稍后重试上传',
        ];
      case UploadErrorType.TIMEOUT_ERROR:
        return [
          '检查网络速度',
          '尝试减小文件大小或分片大小',
          '稍后再试，服务器可能暂时繁忙',
          '如持续出现问题，请联系服务提供商',
        ];
      case UploadErrorType.SERVER_ERROR:
        return [
          '稍后重试，服务器可能暂时不可用',
          '联系服务提供商或管理员报告问题',
          '检查上传参数是否正确',
        ];
      case UploadErrorType.FILE_ERROR:
        return [
          '确认文件是否可以正常打开',
          '检查文件是否损坏',
          '重新选择文件上传',
        ];
      case UploadErrorType.PERMISSION_ERROR:
        return [
          '检查浏览器权限设置',
          '确认是否有文件访问权限',
          '重新登录尝试',
          '使用不同的浏览器尝试',
        ];
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return [
          '清理浏览器存储空间',
          '删除不需要的数据',
          '联系管理员增加存储配额',
        ];
      case UploadErrorType.MEMORY_ERROR:
        return [
          '关闭其他应用释放内存',
          '刷新页面后重试',
          '减小分片大小',
          '分多次上传小文件',
        ];
      case UploadErrorType.ENVIRONMENT_ERROR:
        return [
          '尝试使用最新版本的浏览器',
          '检查浏览器是否支持所需的API',
          '切换到桌面浏览器',
        ];
      case UploadErrorType.WORKER_ERROR:
        return [
          '禁用Web Worker选项后重试',
          '刷新页面后重试',
          '更新浏览器到最新版本',
        ];
      case UploadErrorType.MERGE_ERROR:
        return [
          '重新上传整个文件',
          '检查服务器合并逻辑',
          '联系服务提供商报告问题',
        ];
      case UploadErrorType.VALIDATION_ERROR:
        return [
          '检查文件类型是否在允许范围内',
          '检查文件大小是否超出限制',
          '确认文件格式是否正确',
        ];
      case UploadErrorType.SECURITY_ERROR:
        return [
          '检查文件是否包含恶意内容',
          '联系服务提供商了解安全限制',
          '使用加密后的连接重试',
        ];
      default:
        return [
          '刷新页面重试',
          '联系技术支持',
          '检查控制台是否有更详细的错误信息',
        ];
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
      UploadErrorType.WORKER_ERROR,
      UploadErrorType.MERGE_ERROR,
    ];

    return recoverableTypes.includes(this.type);
  }

  /**
   * 获取错误恢复优先级（越高越应该尝试恢复）
   */
  getRecoveryPriority(): number {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return 4; // 网络错误很可能是暂时的，高优先级恢复
      case UploadErrorType.TIMEOUT_ERROR:
        return 3; // 超时可能是暂时的，较高优先级
      case UploadErrorType.SERVER_ERROR:
        return 2; // 服务器错误可能需要等待，中等优先级
      case UploadErrorType.UPLOAD_ERROR:
        return 3; // 上传错误可能是暂时的，较高优先级
      case UploadErrorType.WORKER_ERROR:
        return 1; // Worker错误可能需要降级处理，低优先级
      case UploadErrorType.MERGE_ERROR:
        return 1; // 合并错误可能需要重新上传，低优先级
      default:
        return 0; // 其他错误可能不适合自动恢复
    }
  }
}

/**
 * 网络错误诊断结果
 */
interface NetworkDiagnosisResult {
  /** 问题类型 */
  issue:
    | 'dns'
    | 'server_down'
    | 'connection_reset'
    | 'rate_limit'
    | 'timeout'
    | 'intermittent'
    | 'unknown';

  /** 可能的原因 */
  possibleCauses: string[];

  /** 建议的解决方案 */
  suggestedActions: string[];

  /** 是否可能是服务器问题 */
  isPossiblyServerIssue: boolean;

  /** 网络状态评估 */
  networkAssessment?: {
    quality: NetworkQuality;
    stability: 'stable' | 'unstable' | 'unknown';
    changes: number; // 状态变化次数
  };

  /** 错误模式分析 */
  pattern?: 'persistent' | 'intermittent' | 'recurring' | 'random' | 'unknown';
}

export class ErrorCenter {
  // 错误事件处理器
  private errorHandlers: Array<(error: UploadError) => void | boolean> = [];

  // 错误统计
  private errorStats: Map<UploadErrorType, number> = new Map();

  // 错误日志历史记录（最近的错误记录）
  private errorLogs: UploadError[] = [];

  // 最大保存的错误日志数量
  private maxErrorLogSize = 50;

  // 错误恢复策略
  private recoveryStrategies: Map<
    UploadErrorType,
    (error: UploadError) => Promise<boolean>
  > = new Map();

  // 网络状态记录
  private networkConditions: {
    timestamp: number;
    isOnline: boolean;
    avgRtt?: number;
    downlink?: number;
  }[] = [];

  // 高级重试设置
  private retrySettings = {
    // 退避算法系数
    backoffFactor: 1.5,
    // 初始重试延迟（毫秒）
    initialDelay: 1000,
    // 最大重试延迟（毫秒）
    maxDelay: 30000,
    // 抖动因子（0-1）用于避免重试风暴
    jitter: 0.2,
    // 每个错误类型的最大重试次数
    maxRetries: {
      [UploadErrorType.NETWORK_ERROR]: 5,
      [UploadErrorType.TIMEOUT_ERROR]: 3,
      [UploadErrorType.SERVER_ERROR]: 3,
      [UploadErrorType.UPLOAD_ERROR]: 3,
      [UploadErrorType.WORKER_ERROR]: 1,
      [UploadErrorType.MERGE_ERROR]: 2,
    },
  };

  constructor() {
    // 初始化默认恢复策略
    this.initDefaultRecoveryStrategies();

    // 初始化网络监听
    this.initNetworkMonitoring();
  }

  /**
   * 初始化网络状态监听
   */
  private initNetworkMonitoring(): void {
    // 仅在浏览器环境中设置网络监听
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      // 添加网络状态变化监听
      window.addEventListener('online', () => this.recordNetworkStatus(true));
      window.addEventListener('offline', () => this.recordNetworkStatus(false));

      // 记录初始状态
      this.recordNetworkStatus(navigator.onLine);

      // 如果支持网络信息API，设置监听
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          connection.addEventListener('change', () => {
            this.recordNetworkStatus(
              navigator.onLine,
              connection.rtt,
              connection.downlink
            );
          });

          // 记录初始状态
          this.recordNetworkStatus(
            navigator.onLine,
            connection.rtt,
            connection.downlink
          );
        }
      }
    }
  }

  /**
   * 记录当前网络状态
   */
  private recordNetworkStatus(
    isOnline: boolean,
    rtt?: number,
    downlink?: number
  ): void {
    this.networkConditions.push({
      timestamp: Date.now(),
      isOnline,
      avgRtt: rtt,
      downlink,
    });

    // 只保留最近100条记录
    if (this.networkConditions.length > 100) {
      this.networkConditions.shift();
    }
  }

  /**
   * 升级版网络错误智能分析
   * 对网络错误进行深入分析，识别问题的可能原因和最佳解决方案
   *
   * @param error 上传错误对象
   * @returns 增强的上传错误对象
   */
  public analyzeNetworkError(error: UploadError): UploadError {
    // 如果不是网络相关错误，直接返回
    if (error.group !== ErrorGroup.NETWORK) {
      return error;
    }

    // 获取最近的网络状态
    const networkStatus = this.getRecentNetworkStatus();

    // 创建诊断结果
    const diagnosis: NetworkDiagnosisResult = {
      issue: 'unknown',
      possibleCauses: [],
      suggestedActions: [],
      isPossiblyServerIssue: false,
      networkAssessment: {
        quality: networkStatus.quality,
        stability: networkStatus.changes > 3 ? 'unstable' : 'stable',
        changes: networkStatus.changes,
      },
    };

    // 基于错误类型和网络状态进行分析
    switch (error.type) {
      case UploadErrorType.DNS_RESOLUTION_ERROR:
        diagnosis.issue = 'dns';
        diagnosis.possibleCauses = [
          '域名服务器不可用',
          'DNS缓存问题',
          '网络配置错误',
          '域名不存在或已过期',
        ];
        diagnosis.suggestedActions = [
          '检查网络连接',
          '尝试使用其他DNS服务器',
          '清除浏览器和系统DNS缓存',
          '检查域名是否正确',
        ];
        diagnosis.isPossiblyServerIssue = false;
        break;

      case UploadErrorType.SERVER_UNREACHABLE_ERROR:
        diagnosis.issue = 'server_down';
        diagnosis.possibleCauses = [
          '服务器已关闭',
          '服务器维护中',
          '服务器过载',
          '网络路由问题',
        ];
        diagnosis.suggestedActions = [
          '检查服务器状态',
          '联系服务提供商',
          '稍后重试',
          '检查服务器地址是否正确',
        ];
        diagnosis.isPossiblyServerIssue = true;
        diagnosis.pattern =
          networkStatus.offlineEvents > 2 ? 'recurring' : 'persistent';
        break;

      case UploadErrorType.CONNECTION_RESET_ERROR:
        diagnosis.issue = 'connection_reset';
        diagnosis.possibleCauses = [
          '网络不稳定',
          '代理或防火墙干扰',
          '服务器重启',
          'HTTP/2连接问题',
        ];
        diagnosis.suggestedActions = [
          '切换到更稳定的网络',
          '禁用代理或VPN',
          '减小并发请求数量',
          '使用较小的分片尝试上传',
        ];
        diagnosis.isPossiblyServerIssue = networkStatus.quality === 'good';
        diagnosis.pattern = 'intermittent';
        break;

      case UploadErrorType.RATE_LIMIT_ERROR:
        diagnosis.issue = 'rate_limit';
        diagnosis.possibleCauses = [
          '请求频率超过服务器限制',
          'IP被限流',
          '账户配额已用尽',
          '服务器防护措施触发',
        ];
        diagnosis.suggestedActions = [
          '减少并发请求数',
          '增加请求间隔',
          '联系服务提供商增加配额',
          '稍后再试',
        ];
        diagnosis.isPossiblyServerIssue = false;
        diagnosis.pattern = 'persistent';
        break;

      case UploadErrorType.TIMEOUT_ERROR:
        diagnosis.issue = 'timeout';
        diagnosis.possibleCauses = [
          '网络延迟高',
          '服务器响应慢',
          '请求数据量过大',
          '服务器过载',
        ];
        diagnosis.suggestedActions = [
          '检查网络连接质量',
          '减小分片大小',
          '增加超时时间',
          '稍后重试',
        ];
        diagnosis.isPossiblyServerIssue = networkStatus.quality !== 'poor';
        diagnosis.pattern =
          networkStatus.avgRtt && networkStatus.avgRtt > 1000
            ? 'persistent'
            : 'intermittent';
        break;

      case UploadErrorType.NETWORK_ERROR:
      default:
        // 通用网络错误，进一步分析具体原因
        if (!networkStatus.isOnline) {
          diagnosis.issue = 'connection_reset';
          diagnosis.possibleCauses = ['设备已离线', '网络连接已断开'];
          diagnosis.suggestedActions = ['检查网络连接', '连接到可用网络后重试'];
          diagnosis.isPossiblyServerIssue = false;
          diagnosis.pattern = 'persistent';
        } else if (networkStatus.quality === 'poor') {
          diagnosis.issue = 'intermittent';
          diagnosis.possibleCauses = ['网络连接不稳定', '信号弱', '网络拥堵'];
          diagnosis.suggestedActions = [
            '切换到更稳定的网络',
            '靠近Wi-Fi接入点',
            '减少并发请求数',
          ];
          diagnosis.isPossiblyServerIssue = false;
          diagnosis.pattern = 'intermittent';
        } else {
          diagnosis.issue = 'unknown';
          diagnosis.possibleCauses = [
            '临时网络问题',
            '代理或防火墙设置',
            '服务器临时不可用',
            '内容过滤',
          ];
          diagnosis.suggestedActions = [
            '刷新页面重试',
            '检查防火墙或代理设置',
            '联系网络管理员',
            '稍后重试',
          ];
          diagnosis.isPossiblyServerIssue =
            networkStatus.quality === 'good' ||
            networkStatus.quality === 'excellent';
          diagnosis.pattern = 'random';
        }
        break;
    }

    // 丰富错误对象的诊断数据
    error.addDiagnosticData({
      networkDiagnosis: {
        connectionQuality: {
          rtt: networkStatus.avgRtt,
          downlink: networkStatus.avgDownlink,
          quality: networkStatus.quality,
        },
      },
    });

    // 将诊断结果添加到错误上下文
    error.addContext({
      network: {
        online: networkStatus.isOnline,
        type: diagnosis.issue,
        diagnosis: {
          causes: diagnosis.possibleCauses,
          actions: diagnosis.suggestedActions,
          pattern: diagnosis.pattern,
          isServerIssue: diagnosis.isPossiblyServerIssue,
        },
      },
      custom: {
        networkDiagnosis: diagnosis,
      },
    } as Partial<ErrorContextData>);

    // 添加或更新解决方案
    error.recommendedSolutions = [...diagnosis.suggestedActions];

    // 根据诊断调整恢复策略
    if (diagnosis.issue === 'dns' || diagnosis.issue === 'server_down') {
      error.bestRecoveryStrategy = ErrorRecoveryStrategy.WAIT_FOR_NETWORK;
    } else if (diagnosis.issue === 'rate_limit') {
      error.bestRecoveryStrategy = ErrorRecoveryStrategy.RETRY_WITH_DELAY;
    } else if (
      diagnosis.issue === 'timeout' &&
      diagnosis.pattern === 'intermittent'
    ) {
      error.bestRecoveryStrategy = ErrorRecoveryStrategy.RETRY_WITH_BACKOFF;
    }

    return error;
  }

  /**
   * 增强的错误严重性判断
   *
   * @param error 上传错误对象
   * @returns 严重性级别（1-4，4最高）
   */
  public getErrorSeverity(error: UploadError): number {
    // 如果错误对象已有严重度信息，直接返回
    if (error.severity) {
      return error.severity;
    }

    // 基础严重度级别
    let severityLevel = 1;

    // 根据错误组提高严重级别
    if (
      error.group === ErrorGroup.NETWORK ||
      error.group === ErrorGroup.SERVER
    ) {
      severityLevel += 1;
    }

    // 根据错误恢复尝试次数提高严重级别
    if (error.retryCount >= 3) {
      severityLevel += 1;
    }

    // 根据错误上下文中的特定字段判断
    if (error.context) {
      // 如果涉及大文件，提高严重性
      if (
        error.context.file?.size &&
        error.context.file.size > 100 * 1024 * 1024
      ) {
        severityLevel += 1;
      }

      // 如果是最后一个分片，提高严重性
      if (error.context.chunk?.index === (error.context.file?.size || 0) - 1) {
        severityLevel += 1;
      }

      // 如果明确是服务器问题，提高严重性
      if (
        error.context.response?.status &&
        error.context.response.status >= 500
      ) {
        severityLevel += 1;
      }
    }

    // 确保严重级别在有效范围内
    return Math.min(Math.max(severityLevel, 1), 4);
  }

  /**
   * 错误分组分析
   * 根据错误类型和上下文信息，将错误分组以便更好地分析和报告
   *
   * @param error 上传错误对象
   * @returns 错误组标识符
   */
  public getErrorGroup(error: UploadError): string {
    // 如果错误已有分组，直接返回
    if (error.group) {
      return error.group;
    }

    // 根据错误类型进行分组
    switch (error.type) {
      case UploadErrorType.NETWORK_ERROR:
      case UploadErrorType.TIMEOUT_ERROR:
      case UploadErrorType.SERVER_UNREACHABLE_ERROR:
      case UploadErrorType.DNS_RESOLUTION_ERROR:
      case UploadErrorType.CONNECTION_RESET_ERROR:
      case UploadErrorType.RATE_LIMIT_ERROR:
        return ErrorGroup.NETWORK;

      case UploadErrorType.SERVER_ERROR:
      case UploadErrorType.API_ERROR:
      case UploadErrorType.MERGE_ERROR:
        return ErrorGroup.SERVER;

      case UploadErrorType.FILE_ERROR:
      case UploadErrorType.VALIDATION_ERROR:
      case UploadErrorType.DATA_CORRUPTION_ERROR:
        return ErrorGroup.FILE;

      case UploadErrorType.ENVIRONMENT_ERROR:
      case UploadErrorType.WORKER_ERROR:
        return ErrorGroup.ENVIRONMENT;

      case UploadErrorType.MEMORY_ERROR:
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return ErrorGroup.RESOURCE;

      case UploadErrorType.PERMISSION_ERROR:
      case UploadErrorType.AUTHENTICATION_ERROR:
        return ErrorGroup.PERMISSION;

      case UploadErrorType.SECURITY_ERROR:
        return ErrorGroup.SECURITY;

      case UploadErrorType.CANCEL_ERROR:
        return ErrorGroup.USER;

      case UploadErrorType.CONTENT_ENCODING_ERROR:
      case UploadErrorType.DATA_PROCESSING_ERROR:
        return ErrorGroup.DATA;

      default:
        return ErrorGroup.OTHER;
    }
  }

  /**
   * 处理错误并收集上下文信息
   *
   * @param error 原始错误
   * @param context 上下文信息
   * @returns 处理后的UploadError对象
   */
  public handle(error: any, context?: Partial<ErrorContextData>): UploadError {
    // 转换为 UploadError 格式
    let uploadError: UploadError;

    if (error instanceof UploadError) {
      uploadError = error;

      // 如果有新的上下文信息，添加到现有的错误对象
      if (context) {
        uploadError.addContext(context);
      }
    } else {
      // 从原始错误构造 UploadError
      let errorType = UploadErrorType.UNKNOWN_ERROR;
      let errorMessage = error.message || '发生未知错误';

      // 从错误内容判断错误类型
      if (this.isNetworkError(error)) {
        errorType = UploadErrorType.NETWORK_ERROR;
        errorMessage = '网络连接失败，请检查网络设置';
      } else if (this.isDNSError(error)) {
        errorType = UploadErrorType.DNS_RESOLUTION_ERROR;
        errorMessage = '域名解析失败，请检查网络连接或服务器地址';
      } else if (this.isConnectionResetError(error)) {
        errorType = UploadErrorType.CONNECTION_RESET_ERROR;
        errorMessage = '连接被重置，请检查网络连接并重试';
      } else if (this.isServerUnreachableError(error)) {
        errorType = UploadErrorType.SERVER_UNREACHABLE_ERROR;
        errorMessage = '无法连接到服务器，请检查网络连接或服务器地址';
      } else if (this.isTimeoutError(error)) {
        errorType = UploadErrorType.TIMEOUT_ERROR;
        errorMessage = '请求超时，请检查网络状况或服务器响应';
      } else if (this.isRateLimitError(error)) {
        errorType = UploadErrorType.RATE_LIMIT_ERROR;
        errorMessage = '请求频率过高，请稍后再试';
      } else if (this.isAuthenticationError(error)) {
        errorType = UploadErrorType.AUTHENTICATION_ERROR;
        errorMessage = '认证失败，请重新登录或检查权限设置';
      } else if (this.isServerError(error)) {
        errorType = UploadErrorType.SERVER_ERROR;
        errorMessage = `服务器错误(${error.status || error.statusCode || 'unknown'})，请稍后重试`;
      } else if (this.isContentEncodingError(error)) {
        errorType = UploadErrorType.CONTENT_ENCODING_ERROR;
        errorMessage = '内容编码错误，请检查文件格式';
      } else if (this.isDataCorruptionError(error)) {
        errorType = UploadErrorType.DATA_CORRUPTION_ERROR;
        errorMessage = '数据损坏，请重新选择文件上传';
      } else if (this.isMemoryError(error)) {
        errorType = UploadErrorType.MEMORY_ERROR;
        errorMessage = '内存不足，请尝试使用更小的分片大小';
      } else if (this.isWorkerError(error)) {
        errorType = UploadErrorType.WORKER_ERROR;
        errorMessage = '处理任务时发生错误，已降级为主线程处理';
      } else if (this.isDataProcessingError(error)) {
        errorType = UploadErrorType.DATA_PROCESSING_ERROR;
        errorMessage = '数据处理错误，请重试或使用其他文件';
      } else if (this.isFileError(error)) {
        errorType = UploadErrorType.FILE_ERROR;
        errorMessage = '文件访问失败，请确认文件存在且可读';
      } else if (this.isSecurityError(error)) {
        errorType = UploadErrorType.SECURITY_ERROR;
        errorMessage = '安全检查失败，无法继续上传';
      } else if (this.isQuotaExceededError(error)) {
        errorType = UploadErrorType.QUOTA_EXCEEDED_ERROR;
        errorMessage = '存储空间不足，无法保存上传进度';
      } else if (this.isApiError(error)) {
        errorType = UploadErrorType.API_ERROR;
        errorMessage = 'API调用错误，请检查参数或联系开发人员';
      }

      // 准备额外的上下文信息
      const enrichedContext: Partial<ErrorContextData> = {
        timestamp: Date.now(),
        ...context,
      };

      // 收集网络状态
      if (typeof navigator !== 'undefined') {
        enrichedContext.network = {
          online: navigator.onLine,
          ...(enrichedContext.network || {}),
        };

        // 如果支持网络信息API，添加更多网络信息
        if ('connection' in navigator) {
          const connection = (navigator as any).connection;
          if (connection) {
            enrichedContext.network = {
              ...enrichedContext.network,
              type: connection.effectiveType,
              downlink: connection.downlink,
              rtt: connection.rtt,
            };
          }
        }
      }

      // 添加请求信息
      if (error.config || error.request) {
        const requestInfo = error.config || error.request || {};
        enrichedContext.request = {
          url: requestInfo.url || '',
          method: requestInfo.method || 'GET',
          headers: requestInfo.headers || {},
          timeout: requestInfo.timeout || undefined,
        };
      }

      // 添加响应信息
      if (error.response) {
        enrichedContext.response = {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data,
        };
      }

      // 创建上传错误对象
      uploadError = new UploadError(
        errorType,
        errorMessage,
        error,
        error.chunkInfo,
        enrichedContext as ErrorContextData
      );
    }

    // 记录错误
    this.trackError(uploadError);

    // 检查是否需要进行网络错误智能分析
    if (
      uploadError.group === ErrorGroup.NETWORK ||
      uploadError.type === UploadErrorType.TIMEOUT_ERROR ||
      uploadError.type === UploadErrorType.SERVER_ERROR
    ) {
      uploadError = this.analyzeNetworkError(uploadError);
    }

    // 触发错误处理钩子
    this.callErrorHandlers(uploadError);

    // 记录详细日志
    this.logError(uploadError);

    return uploadError;
  }

  /**
   * 判断是否为网络错误
   */
  private isNetworkError(error: any): boolean {
    return (
      error.name === 'NetworkError' ||
      error.message?.includes('network') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNABORTED' ||
      (typeof error.status === 'number' && error.status === 0) ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network request failed') ||
      (error instanceof TypeError && error.message?.includes('network'))
    );
  }

  /**
   * 判断是否为服务器不可达错误
   */
  private isServerUnreachableError(error: any): boolean {
    return (
      error.code === 'ENOTFOUND' ||
      error.code === 'EHOSTDOWN' ||
      error.code === 'EHOSTUNREACH' ||
      error.message?.includes('server unreachable') ||
      error.message?.includes('cannot connect to host') ||
      error.message?.includes('unable to connect') ||
      error.message?.includes('无法连接到服务器') ||
      error.status === 503 ||
      error.statusCode === 503
    );
  }

  /**
   * 判断是否为DNS解析错误
   */
  private isDNSError(error: any): boolean {
    return (
      error.code === 'ENOTFOUND' ||
      error.code === 'ESERVFAIL' ||
      error.message?.includes('DNS') ||
      error.message?.includes('域名解析') ||
      error.message?.includes('host not found') ||
      error.message?.includes('name resolution') ||
      (error.name === 'TypeError' && error.message?.includes('Failed to fetch'))
    );
  }

  /**
   * 判断是否为连接重置错误
   */
  private isConnectionResetError(error: any): boolean {
    return (
      error.code === 'ECONNRESET' ||
      error.message?.includes('connection reset') ||
      error.message?.includes('socket hang up') ||
      error.message?.includes('连接重置') ||
      error.message?.includes('network changed')
    );
  }

  /**
   * 判断是否为超时错误
   */
  private isTimeoutError(error: any): boolean {
    return (
      error.name === 'TimeoutError' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ESOCKETTIMEDOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out') ||
      error.message?.includes('超时')
    );
  }

  /**
   * 判断是否为请求频率限制错误
   */
  private isRateLimitError(error: any): boolean {
    return (
      error.status === 429 ||
      error.statusCode === 429 ||
      error.message?.includes('rate limit') ||
      error.message?.includes('too many requests') ||
      error.message?.includes('请求频率过高') ||
      error.message?.includes('限流')
    );
  }

  /**
   * 判断是否为服务器错误
   */
  private isServerError(error: any): boolean {
    const status = error.status || error.statusCode;
    return (
      (typeof status === 'number' && status >= 500 && status < 600) ||
      error.message?.includes('server error') ||
      error.message?.includes('服务器错误') ||
      error.message?.includes('internal server error')
    );
  }

  /**
   * 判断是否为认证错误
   */
  private isAuthenticationError(error: any): boolean {
    return (
      error.status === 401 ||
      error.statusCode === 401 ||
      error.status === 403 ||
      error.statusCode === 403 ||
      error.message?.includes('unauthorized') ||
      error.message?.includes('forbidden') ||
      error.message?.includes('authentication') ||
      error.message?.includes('授权') ||
      error.message?.includes('认证')
    );
  }

  /**
   * 判断是否为内容编码错误
   */
  private isContentEncodingError(error: any): boolean {
    return (
      error.message?.includes('encoding') ||
      error.message?.includes('编码') ||
      error.message?.includes('decode') ||
      error.message?.includes('character set') ||
      error.message?.includes('charset')
    );
  }

  /**
   * 判断是否为数据损坏错误
   */
  private isDataCorruptionError(error: any): boolean {
    return (
      error.message?.includes('corrupt') ||
      error.message?.includes('invalid data') ||
      error.message?.includes('checksum') ||
      error.message?.includes('CRC') ||
      error.message?.includes('hash') ||
      error.message?.includes('integrity') ||
      error.message?.includes('损坏')
    );
  }

  /**
   * 判断是否为数据处理错误
   */
  private isDataProcessingError(error: any): boolean {
    return (
      error.message?.includes('JSON') ||
      error.message?.includes('parse') ||
      error.message?.includes('解析') ||
      error.message?.includes('processing') ||
      error.message?.includes('处理') ||
      error.message?.includes('transform')
    );
  }

  /**
   * 判断是否为内存错误
   */
  private isMemoryError(error: any): boolean {
    return (
      error.name === 'OutOfMemoryError' ||
      error.message?.includes('memory') ||
      error.message?.includes('内存') ||
      error.message?.includes('allocation failed') ||
      error.message?.includes('heap limit') ||
      error.message?.includes('allocation failure')
    );
  }

  /**
   * 判断是否为Worker错误
   */
  private isWorkerError(error: any): boolean {
    return (
      error.message?.includes('Worker') ||
      error.name === 'WorkerError' ||
      error.message?.includes('worker') ||
      error.message?.includes('thread')
    );
  }

  /**
   * 判断是否为文件错误
   */
  private isFileError(error: any): boolean {
    return (
      error.name === 'NotFoundError' ||
      error.name === 'NotReadableError' ||
      error.code === 'ENOENT' ||
      error.code === 'EMFILE' ||
      error.message?.includes('file') ||
      error.message?.includes('read') ||
      error.message?.includes('文件')
    );
  }

  /**
   * 判断是否为安全错误
   */
  private isSecurityError(error: any): boolean {
    return (
      error.name === 'SecurityError' ||
      error.message?.includes('security') ||
      error.message?.includes('secure') ||
      error.message?.includes('CORS') ||
      error.message?.includes('cross-origin') ||
      error.message?.includes('安全') ||
      error.status === 403 ||
      error.statusCode === 403
    );
  }

  /**
   * 判断是否为存储配额超出错误
   */
  private isQuotaExceededError(error: any): boolean {
    return (
      error.name === 'QuotaExceededError' ||
      error.code === 'ENOSPC' ||
      error.message?.includes('quota') ||
      error.message?.includes('storage') ||
      error.message?.includes('空间') ||
      error.message?.includes('存储')
    );
  }

  /**
   * 判断是否为API调用错误
   */
  private isApiError(error: any): boolean {
    return (
      error.message?.includes('API') ||
      error.message?.includes('api') ||
      error.message?.includes('endpoint') ||
      error.message?.includes('接口') ||
      (error.status && error.status >= 400 && error.status < 500) ||
      (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)
    );
  }

  /**
   * 调用所有错误处理钩子
   * @param error 上传错误对象
   */
  private callErrorHandlers(error: UploadError): void {
    if (!this.errorHandlers.length) return;

    for (const handler of this.errorHandlers) {
      try {
        const result = handler(error);
        if (result === true) {
          // 处理器已处理错误，不再继续
          break;
        }
      } catch (handlerError) {
        console.error('错误处理器执行失败:', handlerError);
      }
    }
  }

  /**
   * 获取最近的网络状态分析
   */
  private getRecentNetworkStatus(): {
    isOnline: boolean;
    offlineEvents: number;
    quality: 'good' | 'medium' | 'poor';
    avgRtt?: number;
    avgDownlink?: number;
    changes: number;
  } {
    // 默认值
    const result = {
      isOnline: true,
      offlineEvents: 0,
      quality: 'good' as 'good' | 'medium' | 'poor',
      changes: 0,
    };

    // 如果没有记录，返回默认值
    if (this.networkConditions.length === 0) {
      return result;
    }

    // 当前是否在线
    result.isOnline =
      this.networkConditions[this.networkConditions.length - 1].isOnline;

    // 分析最近10分钟的网络状态
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recentConditions = this.networkConditions.filter(
      c => c.timestamp >= tenMinutesAgo
    );

    if (recentConditions.length > 0) {
      // 计算离线事件次数
      let lastStatus = recentConditions[0].isOnline;
      for (const condition of recentConditions) {
        if (lastStatus && !condition.isOnline) {
          result.offlineEvents++;
        }
        if (lastStatus !== condition.isOnline) {
          result.changes++;
        }
        lastStatus = condition.isOnline;
      }

      // 计算平均RTT和下行速度
      const validRtts = recentConditions
        .filter(c => typeof c.avgRtt === 'number')
        .map(c => c.avgRtt as number);
      const validDownlinks = recentConditions
        .filter(c => typeof c.downlink === 'number')
        .map(c => c.downlink as number);

      if (validRtts.length > 0) {
        result.avgRtt =
          validRtts.reduce((sum, rtt) => sum + rtt, 0) / validRtts.length;
      }

      if (validDownlinks.length > 0) {
        result.avgDownlink =
          validDownlinks.reduce((sum, dl) => sum + dl, 0) /
          validDownlinks.length;
      }

      // 评估网络质量
      if (result.offlineEvents > 2 || result.changes > 5) {
        result.quality = 'poor';
      } else if (
        (result.avgRtt && result.avgRtt > 500) ||
        (result.avgDownlink && result.avgDownlink < 1)
      ) {
        result.quality = 'poor';
      } else if (
        (result.avgRtt && result.avgRtt > 200) ||
        (result.avgDownlink && result.avgDownlink < 5)
      ) {
        result.quality = 'medium';
      }
    }

    return result;
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
   * 获取错误汇总报告
   * 提供更详细的错误统计和分析信息
   *
   * @returns 错误汇总报告
   */
  public getErrorSummary(): {
    totalErrors: number;
    byType: Record<string, number>;
    byGroup: Record<string, number>;
    bySeverity: Record<number, number>;
    mostFrequent: { type: string; count: number }[];
    mostRecent: { type: string; timestamp: number }[];
    networkRelated: number;
    recoverableErrors: number;
    recoverySuccessRate: number;
    avgRetryCount: number;
    errorPatterns: Record<string, number>;
    timeDistribution: {
      last5min: number;
      last15min: number;
      last30min: number;
      last1hour: number;
      last24hours: number;
    };
    recommendations: string[];
  } {
    // 总计错误数
    const totalErrors = this.errorLogs.length;

    // 如果没有错误，返回空报告
    if (totalErrors === 0) {
      return {
        totalErrors: 0,
        byType: {},
        byGroup: {},
        bySeverity: {},
        mostFrequent: [],
        mostRecent: [],
        networkRelated: 0,
        recoverableErrors: 0,
        recoverySuccessRate: 0,
        avgRetryCount: 0,
        errorPatterns: {},
        timeDistribution: {
          last5min: 0,
          last15min: 0,
          last30min: 0,
          last1hour: 0,
          last24hours: 0,
        },
        recommendations: [],
      };
    }

    // 按类型统计
    const byType: Record<string, number> = {};
    for (const [type, count] of this.errorStats) {
      byType[type] = count;
    }

    // 按分组和严重程度统计
    const byGroup: Record<string, number> = {};
    const bySeverity: Record<number, number> = {};
    const errorPatterns: Record<string, number> = {};

    // 可恢复错误数量
    let recoverableErrors = 0;

    // 重试统计
    let totalRetries = 0;
    let successfulRecoveries = 0;

    // 时间分布
    const now = Date.now();
    const timeDistribution = {
      last5min: 0,
      last15min: 0,
      last30min: 0,
      last1hour: 0,
      last24hours: 0,
    };

    // 处理每个错误
    for (const error of this.errorLogs) {
      // 按分组统计
      const group = error.group || this.getErrorGroup(error);
      byGroup[group] = (byGroup[group] || 0) + 1;

      // 按严重程度统计
      const severity = error.severity || this.getErrorSeverity(error);
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;

      // 统计可恢复的错误
      if (error.isRecoverable) {
        recoverableErrors++;
      }

      // 统计重试情况
      totalRetries += error.retryCount;

      // 统计成功的恢复
      if (error.recoveryAttempts && error.recoveryAttempts.length > 0) {
        const successfulAttempts = error.recoveryAttempts.filter(
          attempt => attempt.successful
        );
        successfulRecoveries += successfulAttempts.length;
      }

      // 模式分析
      if (error.context?.network?.diagnosis?.pattern) {
        const pattern = error.context.network.diagnosis.pattern;
        errorPatterns[pattern] = (errorPatterns[pattern] || 0) + 1;
      }

      // 时间分布统计
      const errorTime = error.timestamp;
      if (now - errorTime < 5 * 60 * 1000) timeDistribution.last5min++;
      if (now - errorTime < 15 * 60 * 1000) timeDistribution.last15min++;
      if (now - errorTime < 30 * 60 * 1000) timeDistribution.last30min++;
      if (now - errorTime < 60 * 60 * 1000) timeDistribution.last1hour++;
      if (now - errorTime < 24 * 60 * 60 * 1000) timeDistribution.last24hours++;
    }

    // 计算恢复成功率
    const recoverySuccessRate =
      recoverableErrors > 0
        ? (successfulRecoveries / recoverableErrors) * 100
        : 0;

    // 计算平均重试次数
    const avgRetryCount = totalErrors > 0 ? totalRetries / totalErrors : 0;

    // 按出现频率排序错误类型
    const errorTypeEntries = Object.entries(byType);
    const mostFrequent = errorTypeEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // 最近发生的错误
    const mostRecent = this.errorLogs.slice(0, 5).map(error => ({
      type: error.type,
      timestamp: error.timestamp,
    }));

    // 计算网络相关错误数
    const networkRelated = byGroup[ErrorGroup.NETWORK] || 0;

    // 生成建议
    const recommendations = this.generateRecommendations({
      totalErrors,
      byGroup,
      bySeverity,
      mostFrequent,
      networkRelated,
      recoverySuccessRate,
      errorPatterns,
      timeDistribution,
    });

    return {
      totalErrors,
      byType,
      byGroup,
      bySeverity,
      mostFrequent,
      mostRecent,
      networkRelated,
      recoverableErrors,
      recoverySuccessRate,
      avgRetryCount,
      errorPatterns,
      timeDistribution,
      recommendations,
    };
  }

  /**
   * 生成错误汇总报告的建议
   */
  private generateRecommendations(summary: {
    totalErrors: number;
    byGroup: Record<string, number>;
    bySeverity: Record<number, number>;
    mostFrequent: { type: string; count: number }[];
    networkRelated: number;
    recoverySuccessRate: number;
    errorPatterns: Record<string, number>;
    timeDistribution: Record<string, number>;
  }): string[] {
    const recommendations: string[] = [];

    // 判断是否有太多网络相关错误
    if (summary.networkRelated > summary.totalErrors * 0.5) {
      recommendations.push('检查网络连接稳定性，可能存在网络质量问题');
      recommendations.push('考虑增加重试间隔和次数，以应对不稳定网络');

      if (
        summary.errorPatterns['intermittent'] &&
        summary.errorPatterns['intermittent'] > summary.totalErrors * 0.3
      ) {
        recommendations.push('网络连接表现为间歇性问题，建议采用指数退避算法');
      }
    }

    // 判断是否有许多服务器错误
    if ((summary.byGroup[ErrorGroup.SERVER] || 0) > summary.totalErrors * 0.3) {
      recommendations.push(
        '服务器端出现较多错误，建议联系服务提供商检查服务状态'
      );
    }

    // 判断是否有严重错误
    if (
      (summary.bySeverity[ErrorSeverity.HIGH] || 0) +
        (summary.bySeverity[ErrorSeverity.CRITICAL] || 0) >
      0
    ) {
      recommendations.push('存在严重级别错误，需要优先处理');
    }

    // 判断最近错误频率是否增加
    if (
      summary.timeDistribution.last5min >
      summary.timeDistribution.last30min * 0.5
    ) {
      recommendations.push('错误发生频率在最近5分钟内明显增加，可能是新问题');
    }

    // 判断恢复成功率
    if (summary.recoverySuccessRate < 50) {
      recommendations.push('错误恢复成功率低于50%，建议调整恢复策略');
    }

    // 基于最常见的错误类型给出建议
    if (summary.mostFrequent.length > 0) {
      const mostCommonError = summary.mostFrequent[0].type;

      switch (mostCommonError) {
        case UploadErrorType.NETWORK_ERROR:
          recommendations.push(
            '网络错误是最常见的问题，建议检查网络连接稳定性'
          );
          break;
        case UploadErrorType.TIMEOUT_ERROR:
          recommendations.push(
            '超时错误频繁发生，考虑增加超时时间或减小分片大小'
          );
          break;
        case UploadErrorType.SERVER_ERROR:
          recommendations.push(
            '服务器错误频繁，建议联系服务提供商或检查服务端日志'
          );
          break;
        case UploadErrorType.MEMORY_ERROR:
          recommendations.push('内存错误频繁，建议减小分片大小和并发数');
          break;
        case UploadErrorType.RATE_LIMIT_ERROR:
          recommendations.push(
            '请求频率受限，建议减少并发请求数或增加请求间隔'
          );
          break;
      }
    }

    // 确保至少有一个建议
    if (recommendations.length === 0) {
      recommendations.push('目前错误数量较少，监控系统状态并保持当前配置');
    }

    return recommendations;
  }

  /**
   * 自适应调整重试策略
   * 根据错误类型和发生频率，动态调整重试策略
   */
  public adaptRetryStrategy(): void {
    // 获取错误汇总信息
    const summary = this.getErrorSummary();

    // 如果错误数量太少，不做调整
    if (summary.totalErrors < 5) return;

    const newRetrySettings = { ...this.retrySettings };

    // 根据网络相关错误情况调整
    if (summary.networkRelated > summary.totalErrors * 0.7) {
      // 网络错误频繁，增加最大重试次数
      newRetrySettings.maxRetries = {
        ...newRetrySettings.maxRetries,
        [UploadErrorType.NETWORK_ERROR]: 7,
        [UploadErrorType.TIMEOUT_ERROR]: 5,
        [UploadErrorType.CONNECTION_RESET_ERROR]: 6,
        [UploadErrorType.SERVER_UNREACHABLE_ERROR]: 4,
      };

      // 网络不稳定，增加退避因子，减少服务器负载
      if (
        summary.errorPatterns['intermittent'] &&
        summary.errorPatterns['intermittent'] > summary.totalErrors * 0.3
      ) {
        newRetrySettings.backoffFactor = 2.0;
        newRetrySettings.jitter = 0.3; // 增加抖动以避免重试风暴
      }

      // 如果有很多超时错误，延长初始延迟
      if (
        (summary.byType[UploadErrorType.TIMEOUT_ERROR] || 0) >
        summary.totalErrors * 0.3
      ) {
        newRetrySettings.initialDelay = 2000;
      }
    }

    // 如果恢复成功率低，调整策略
    if (summary.recoverySuccessRate < 30) {
      newRetrySettings.backoffFactor = Math.min(
        newRetrySettings.backoffFactor * 1.5,
        4.0
      );
      newRetrySettings.maxDelay = 60000; // 增加最大延迟至60秒
    } else if (summary.recoverySuccessRate > 80) {
      // 恢复成功率高，可以稍微降低延迟
      newRetrySettings.initialDelay = Math.max(
        newRetrySettings.initialDelay * 0.8,
        500
      );
    }

    // 应用新的重试设置
    this.configureRetrySettings(newRetrySettings);
  }

  /**
   * 增强的恢复错误尝试
   * 针对更多类型的错误提供智能恢复策略
   *
   * @param error 上传错误
   * @returns 是否成功恢复
   */
  public async tryRecover(error: UploadError): Promise<boolean> {
    // 如果错误不可恢复，直接返回失败
    if (!error.isRecoverable) return false;

    // 如果错误已经超过最大重试次数，不再尝试恢复
    const maxRetries = this.retrySettings.maxRetries[error.type] || 3;
    if (error.retryCount >= maxRetries) return false;

    // 检查是否有针对此类型错误的特定恢复策略
    const recoveryStrategy = this.recoveryStrategies.get(error.type);

    // 如果有特定策略，尝试执行
    if (recoveryStrategy) {
      try {
        const recoveryResult = await recoveryStrategy(error);

        // 记录恢复尝试
        error.recordRecoveryAttempt(
          recoveryResult,
          error.bestRecoveryStrategy || ErrorRecoveryStrategy.RETRY_WITH_BACKOFF
        );

        return recoveryResult;
      } catch (recoveryError) {
        console.error('执行恢复策略时出错:', recoveryError);

        // 记录失败的恢复尝试
        error.recordRecoveryAttempt(
          false,
          error.bestRecoveryStrategy || ErrorRecoveryStrategy.RETRY_WITH_BACKOFF
        );

        return false;
      }
    }

    // 没有针对性策略时，使用自动推断的最佳恢复策略
    if (error.bestRecoveryStrategy) {
      try {
        let recoveryResult = false;

        switch (error.bestRecoveryStrategy) {
          case ErrorRecoveryStrategy.WAIT_FOR_NETWORK:
            // 等待网络连接恢复
            recoveryResult = await this.waitForOnline(30000); // 最多等待30秒
            break;

          case ErrorRecoveryStrategy.RETRY_IMMEDIATELY:
            // 立即重试，无需等待
            recoveryResult = true;
            break;

          case ErrorRecoveryStrategy.RETRY_WITH_DELAY:
            // 简单延迟后重试
            await new Promise(resolve =>
              setTimeout(resolve, 1000 * (error.retryCount + 1))
            );
            recoveryResult = true;
            break;

          case ErrorRecoveryStrategy.RETRY_WITH_BACKOFF:
            {
              // 使用退避算法计算延迟
              const delay = this.calculateBackoffDelay(error.retryCount);
              await new Promise(resolve => setTimeout(resolve, delay));
              recoveryResult = true;
            }
            break;

          case ErrorRecoveryStrategy.FALLBACK:
            // 降级处理，可以由具体业务模块处理
            recoveryResult = true;
            break;

          default:
            // 默认为未处理
            recoveryResult = false;
        }

        // 记录恢复尝试
        error.recordRecoveryAttempt(recoveryResult, error.bestRecoveryStrategy);

        return recoveryResult;
      } catch (e) {
        console.error('执行自动恢复策略时出错:', e);

        // 记录失败的恢复尝试
        error.recordRecoveryAttempt(false, error.bestRecoveryStrategy);

        return false;
      }
    }

    // 没有任何适用的恢复策略，返回失败
    return false;
  }

  /**
   * 记录错误到日志历史
   * @param error 上传错误
   */
  private logError(error: UploadError): void {
    // 添加时间戳到错误上下文
    if (!error.context) {
      error.context = {};
    }

    if (!error.context.logTimestamp) {
      error.context.logTimestamp = Date.now();
    }

    // 添加到日志历史
    this.errorLogs.push(error);

    // 维持最大日志数量
    if (this.errorLogs.length > this.maxErrorLogSize) {
      this.errorLogs.shift();
    }
  }
}

export default ErrorCenter;
