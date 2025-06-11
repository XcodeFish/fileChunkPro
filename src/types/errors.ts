/**
 * 错误类型定义
 * 统一管理所有错误相关的枚举和类型
 */

/**
 * 上传错误类型
 * 所有可能的错误类型枚举
 */
export enum UploadErrorType {
  // 网络相关错误
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  SERVER_UNREACHABLE_ERROR = 'server_unreachable_error',
  DNS_RESOLUTION_ERROR = 'dns_resolution_error',
  CONNECTION_RESET_ERROR = 'connection_reset_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  
  // 服务器相关错误
  SERVER_ERROR = 'server_error',
  MERGE_ERROR = 'merge_error',
  API_ERROR = 'api_error',
  
  // 文件相关错误
  FILE_ERROR = 'file_error',
  VALIDATION_ERROR = 'validation_error',
  DATA_CORRUPTION_ERROR = 'data_corruption_error',
  UPLOAD_ERROR = 'upload_error',
  
  // 安全相关错误
  SECURITY_ERROR = 'security_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  
  // 资源相关错误
  MEMORY_ERROR = 'memory_error',
  QUOTA_EXCEEDED_ERROR = 'quota_exceeded_error',
  
  // 系统相关错误
  ENVIRONMENT_ERROR = 'environment_error',
  WORKER_ERROR = 'worker_error',
  
  // 数据处理相关错误
  CONTENT_ENCODING_ERROR = 'content_encoding_error',
  DATA_PROCESSING_ERROR = 'data_processing_error',
  
  // 用户相关错误
  PERMISSION_ERROR = 'permission_error',
  CANCEL_ERROR = 'cancel_error',
  
  // 存储相关错误
  STORAGE_ERROR = 'storage_error',
  
  // 其他错误
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  LOW = 1,      // 低严重性，不影响主要功能
  MEDIUM = 2,   // 中等严重性，影响部分功能
  HIGH = 3,     // 高严重性，影响主要功能
  CRITICAL = 4  // 严重错误，导致完全无法使用
}

/**
 * 错误分组
 */
export enum ErrorGroup {
  NETWORK = 'network',       // 网络相关错误
  SERVER = 'server',         // 服务器相关错误
  FILE = 'file',             // 文件相关错误
  SECURITY = 'security',     // 安全相关错误
  RESOURCE = 'resource',     // 资源相关错误
  PERMISSION = 'permission', // 权限相关错误
  DATA = 'data',             // 数据相关错误
  ENVIRONMENT = 'environment', // 环境相关错误
  USER = 'user',             // 用户操作相关错误
  OTHER = 'other'            // 其他错误
}

/**
 * 错误恢复策略
 */
export enum ErrorRecoveryStrategy {
  RETRY_IMMEDIATELY = 'retry_immediately',   // 立即重试
  RETRY_WITH_DELAY = 'retry_with_delay',     // 延迟后重试
  RETRY_WITH_BACKOFF = 'retry_with_backoff', // 使用退避算法重试
  WAIT_FOR_NETWORK = 'wait_for_network',     // 等待网络恢复
  PAUSE_AND_RETRY = 'pause_and_retry',       // 暂停后重试
  FALLBACK = 'fallback',                     // 降级处理
  REINITIALIZE = 'reinitialize',             // 重新初始化
  WAIT_FOR_USER_ACTION = 'wait_for_user_action', // 等待用户操作
  ABORT = 'abort'                            // 中止操作
}

/**
 * 网络质量级别
 */
export enum NetworkQuality {
  POOR = 'poor',           // 网络质量差
  FAIR = 'fair',           // 网络质量一般
  GOOD = 'good',           // 网络质量良好
  EXCELLENT = 'excellent'  // 网络质量极佳
}

/**
 * 内存使用统计
 */
export interface MemoryStats {
  /** 总内存 (bytes) */
  totalJSHeapSize?: number;
  /** 已使用内存 (bytes) */
  usedJSHeapSize?: number;
  /** 内存限制 (bytes) */
  jsHeapSizeLimit?: number;
  /** 可用内存百分比 */
  availableMemoryPercentage?: number;
}

/**
 * 错误上下文数据接口
 */
export interface ErrorContextData {
  /** 时间戳 */
  timestamp: number;
  
  /** 网络相关上下文 */
  network?: {
    /** 是否在线 */
    online: boolean;
    /** 网络类型 */
    type?: string;
    /** 下行速率 (Mbps) */
    downlink?: number;
    /** 往返时间 (ms) */
    rtt?: number;
    /** 诊断信息 */
    diagnosis?: {
      /** 可能的原因 */
      causes: string[];
      /** 建议的解决方案 */
      actions: string[];
      /** 错误模式 */
      pattern?: string;
      /** 是否服务器问题 */
      isServerIssue?: boolean;
    };
  };
  
  /** 请求相关上下文 */
  request?: {
    /** 请求URL */
    url: string;
    /** 请求方法 */
    method: string;
    /** 请求头 */
    headers: Record<string, string>;
    /** 超时设置 */
    timeout?: number;
    /** 请求体大小 */
    bodySize?: number;
  };
  
  /** 响应相关上下文 */
  response?: {
    /** 状态码 */
    status: number;
    /** 状态文本 */
    statusText: string;
    /** 响应头 */
    headers: Record<string, any>;
    /** 响应数据 */
    data?: any;
    /** 响应时间 */
    responseTime?: number;
  };
  
  /** 文件相关上下文 */
  file?: {
    /** 文件名 */
    name?: string;
    /** 文件大小 */
    size?: number;
    /** 文件类型 */
    type?: string;
    /** 文件唯一标识 */
    uid?: string;
  };
  
  /** 分片相关上下文 */
  chunk?: {
    /** 分片索引 */
    index: number;
    /** 分片大小 */
    size: number;
    /** 总分片数 */
    total: number;
    /** 已重试次数 */
    retryCount: number;
  };
  
  /** 环境相关上下文 */
  environment?: {
    /** 运行环境 */
    runtime?: string;
    /** 浏览器信息 */
    browser?: {
      name: string;
      version: string;
    };
    /** 操作系统信息 */
    os?: {
      name: string;
      version: string;
    };
    /** 内存使用情况 */
    memory?: MemoryStats;
  };
  
  /** 用户相关上下文 */
  user?: {
    /** 用户ID */
    id?: string;
    /** 用户角色 */
    role?: string;
    /** 会话ID */
    sessionId?: string;
  };
  
  /** 自定义上下文数据 */
  custom?: Record<string, any>;
}

/**
 * 错误类型到分组的映射
 * 用于快速确定错误类型所属的分组
 */
export const ERROR_TYPE_TO_GROUP: Record<UploadErrorType, ErrorGroup> = {
  [UploadErrorType.NETWORK_ERROR]: ErrorGroup.NETWORK,
  [UploadErrorType.TIMEOUT_ERROR]: ErrorGroup.NETWORK,
  [UploadErrorType.SERVER_UNREACHABLE_ERROR]: ErrorGroup.NETWORK,
  [UploadErrorType.DNS_RESOLUTION_ERROR]: ErrorGroup.NETWORK,
  [UploadErrorType.CONNECTION_RESET_ERROR]: ErrorGroup.NETWORK,
  [UploadErrorType.RATE_LIMIT_ERROR]: ErrorGroup.NETWORK,
  
  [UploadErrorType.SERVER_ERROR]: ErrorGroup.SERVER,
  [UploadErrorType.MERGE_ERROR]: ErrorGroup.SERVER,
  [UploadErrorType.API_ERROR]: ErrorGroup.SERVER,
  
  [UploadErrorType.FILE_ERROR]: ErrorGroup.FILE,
  [UploadErrorType.VALIDATION_ERROR]: ErrorGroup.FILE,
  [UploadErrorType.DATA_CORRUPTION_ERROR]: ErrorGroup.FILE,
  [UploadErrorType.UPLOAD_ERROR]: ErrorGroup.FILE,
  
  [UploadErrorType.SECURITY_ERROR]: ErrorGroup.SECURITY,
  [UploadErrorType.AUTHENTICATION_ERROR]: ErrorGroup.PERMISSION,
  
  [UploadErrorType.MEMORY_ERROR]: ErrorGroup.RESOURCE,
  [UploadErrorType.QUOTA_EXCEEDED_ERROR]: ErrorGroup.RESOURCE,
  
  [UploadErrorType.ENVIRONMENT_ERROR]: ErrorGroup.ENVIRONMENT,
  [UploadErrorType.WORKER_ERROR]: ErrorGroup.ENVIRONMENT,
  
  [UploadErrorType.CONTENT_ENCODING_ERROR]: ErrorGroup.DATA,
  [UploadErrorType.DATA_PROCESSING_ERROR]: ErrorGroup.DATA,
  
  [UploadErrorType.PERMISSION_ERROR]: ErrorGroup.PERMISSION,
  [UploadErrorType.CANCEL_ERROR]: ErrorGroup.USER,
  
  [UploadErrorType.STORAGE_ERROR]: ErrorGroup.RESOURCE,
  
  [UploadErrorType.UNKNOWN_ERROR]: ErrorGroup.OTHER
};

/**
 * 错误类型到严重程度的映射
 */
export const ERROR_TYPE_TO_SEVERITY: Record<UploadErrorType, ErrorSeverity> = {
  [UploadErrorType.NETWORK_ERROR]: ErrorSeverity.HIGH,
  [UploadErrorType.SERVER_UNREACHABLE_ERROR]: ErrorSeverity.HIGH,
  [UploadErrorType.DNS_RESOLUTION_ERROR]: ErrorSeverity.HIGH,
  [UploadErrorType.CONNECTION_RESET_ERROR]: ErrorSeverity.HIGH,
  
  [UploadErrorType.TIMEOUT_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.SERVER_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.MERGE_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.MEMORY_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.AUTHENTICATION_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.SECURITY_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.DATA_CORRUPTION_ERROR]: ErrorSeverity.MEDIUM,
  
  [UploadErrorType.UPLOAD_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.FILE_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.WORKER_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.RATE_LIMIT_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.VALIDATION_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.API_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.DATA_PROCESSING_ERROR]: ErrorSeverity.MEDIUM,
  [UploadErrorType.CONTENT_ENCODING_ERROR]: ErrorSeverity.MEDIUM,
  
  [UploadErrorType.QUOTA_EXCEEDED_ERROR]: ErrorSeverity.LOW,
  [UploadErrorType.PERMISSION_ERROR]: ErrorSeverity.LOW,
  [UploadErrorType.ENVIRONMENT_ERROR]: ErrorSeverity.LOW,
  [UploadErrorType.CANCEL_ERROR]: ErrorSeverity.LOW,
  [UploadErrorType.STORAGE_ERROR]: ErrorSeverity.LOW,
  
  [UploadErrorType.UNKNOWN_ERROR]: ErrorSeverity.LOW
};

/**
 * 错误类型到恢复策略的映射
 */
export const ERROR_TYPE_TO_RECOVERY_STRATEGY: Record<UploadErrorType, ErrorRecoveryStrategy> = {
  [UploadErrorType.NETWORK_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_NETWORK,
  [UploadErrorType.SERVER_UNREACHABLE_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_NETWORK,
  [UploadErrorType.DNS_RESOLUTION_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_NETWORK,
  
  [UploadErrorType.TIMEOUT_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_BACKOFF,
  [UploadErrorType.CONNECTION_RESET_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_BACKOFF,
  
  [UploadErrorType.SERVER_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
  [UploadErrorType.RATE_LIMIT_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
  
  [UploadErrorType.UPLOAD_ERROR]: ErrorRecoveryStrategy.RETRY_IMMEDIATELY,
  
  [UploadErrorType.MEMORY_ERROR]: ErrorRecoveryStrategy.PAUSE_AND_RETRY,
  
  [UploadErrorType.WORKER_ERROR]: ErrorRecoveryStrategy.FALLBACK,
  
  [UploadErrorType.MERGE_ERROR]: ErrorRecoveryStrategy.REINITIALIZE,
  [UploadErrorType.DATA_CORRUPTION_ERROR]: ErrorRecoveryStrategy.REINITIALIZE,
  
  [UploadErrorType.AUTHENTICATION_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
  [UploadErrorType.SECURITY_ERROR]: ErrorRecoveryStrategy.ABORT,
  [UploadErrorType.PERMISSION_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
  [UploadErrorType.VALIDATION_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
  [UploadErrorType.QUOTA_EXCEEDED_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
  
  [UploadErrorType.FILE_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
  [UploadErrorType.API_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
  [UploadErrorType.CONTENT_ENCODING_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION,
  [UploadErrorType.DATA_PROCESSING_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
  [UploadErrorType.ENVIRONMENT_ERROR]: ErrorRecoveryStrategy.ABORT,
  [UploadErrorType.CANCEL_ERROR]: ErrorRecoveryStrategy.ABORT,
  [UploadErrorType.STORAGE_ERROR]: ErrorRecoveryStrategy.RETRY_WITH_DELAY,
  
  [UploadErrorType.UNKNOWN_ERROR]: ErrorRecoveryStrategy.WAIT_FOR_USER_ACTION
}; 