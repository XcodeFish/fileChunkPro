/**
 * SecurityError
 * 安全错误类，用于处理文件上传中的安全相关错误
 */

import {
  ErrorGroup,
  ErrorSeverity,
  SecurityErrorSubType,
  SecurityIssueSeverity,
  UploadErrorType,
} from '../types';

/**
 * 安全错误选项接口
 */
export interface SecurityErrorOptions {
  /** 错误子类型 */
  subType: SecurityErrorSubType;

  /** 安全问题严重程度 */
  severity: SecurityIssueSeverity;

  /** 错误关联的文件信息 */
  file?: {
    name: string;
    size: number;
    type: string;
  };

  /** 是否可恢复的错误 */
  recoverable?: boolean;

  /** 错误上下文信息 */
  context?: Record<string, any>;
}

/**
 * 安全错误类
 * 用于处理文件上传过程中的安全相关错误
 */
class SecurityError extends Error {
  /** 错误类型 */
  public readonly type = UploadErrorType.SECURITY_ERROR;

  /** 错误子类型 */
  public readonly subType: SecurityErrorSubType;

  /** 错误组 */
  public readonly group = ErrorGroup.SECURITY;

  /** 错误严重程度 */
  public readonly severity: ErrorSeverity;

  /** 安全问题严重程度 */
  public readonly securitySeverity: SecurityIssueSeverity;

  /** 是否可恢复 */
  public readonly recoverable: boolean;

  /** 文件信息 */
  public readonly file?: {
    name: string;
    size: number;
    type: string;
  };

  /** 错误上下文 */
  public readonly context: Record<string, any>;

  /** 错误发生时间 */
  public readonly timestamp: number;

  /**
   * 创建安全错误实例
   * @param message 错误消息
   * @param options 错误选项
   */
  constructor(message: string, options: SecurityErrorOptions) {
    super(message);

    this.subType = options.subType;
    this.securitySeverity = options.severity;
    this.file = options.file;
    this.recoverable = options.recoverable ?? false;
    this.context = options.context || {};
    this.timestamp = Date.now();

    // 根据安全严重程度映射到错误严重程度
    switch (options.severity) {
      case SecurityIssueSeverity.LOW:
        this.severity = ErrorSeverity.LOW;
        break;
      case SecurityIssueSeverity.MEDIUM:
        this.severity = ErrorSeverity.MEDIUM;
        break;
      case SecurityIssueSeverity.HIGH:
        this.severity = ErrorSeverity.HIGH;
        break;
      case SecurityIssueSeverity.CRITICAL:
        this.severity = ErrorSeverity.CRITICAL;
        break;
      default:
        this.severity = ErrorSeverity.MEDIUM;
    }

    // 设置错误名称
    this.name = 'SecurityError';

    // 修复 instanceof 检查问题
    Object.setPrototypeOf(this, SecurityError.prototype);
  }

  /**
   * 获取格式化的错误详情
   * @returns 错误详情对象
   */
  public getDetails(): Record<string, any> {
    return {
      type: this.type,
      subType: this.subType,
      message: this.message,
      severity: this.severity,
      securitySeverity: this.securitySeverity,
      group: this.group,
      file: this.file,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      context: this.context,
    };
  }

  /**
   * 创建文件类型不允许错误
   * @param file 文件对象
   * @param allowedTypes 允许的文件类型
   * @returns 安全错误实例
   */
  public static fileTypeNotAllowed(
    file: File,
    allowedTypes: string[]
  ): SecurityError {
    return new SecurityError(
      `文件类型 "${file.type}" 不允许上传，允许的类型: ${allowedTypes.join(', ')}`,
      {
        subType: SecurityErrorSubType.FILE_TYPE_NOT_ALLOWED,
        severity: SecurityIssueSeverity.MEDIUM,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        recoverable: false,
        context: {
          allowedTypes,
        },
      }
    );
  }

  /**
   * 创建文件大小超限错误
   * @param file 文件对象
   * @param maxSize 最大允许大小
   * @returns 安全错误实例
   */
  public static fileSizeExceeded(file: File, maxSize: number): SecurityError {
    return new SecurityError(
      `文件大小 ${file.size} 字节超过限制 ${maxSize} 字节`,
      {
        subType: SecurityErrorSubType.FILE_SIZE_EXCEEDED,
        severity: SecurityIssueSeverity.MEDIUM,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        recoverable: false,
        context: {
          maxSize,
        },
      }
    );
  }

  /**
   * 创建敏感文件类型错误
   * @param file 文件对象
   * @param extension 文件扩展名
   * @returns 安全错误实例
   */
  public static sensitiveFileType(
    file: File,
    extension: string
  ): SecurityError {
    return new SecurityError(`检测到敏感文件类型: "${extension}"`, {
      subType: SecurityErrorSubType.SENSITIVE_FILE_TYPE,
      severity: SecurityIssueSeverity.HIGH,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
      recoverable: false,
      context: {
        extension,
      },
    });
  }

  /**
   * 创建文件扩展名与MIME类型不匹配错误
   * @param file 文件对象
   * @param extension 文件扩展名
   * @param expectedMimeTypes 预期的MIME类型
   * @returns 安全错误实例
   */
  public static extensionMismatch(
    file: File,
    extension: string,
    expectedMimeTypes: string[]
  ): SecurityError {
    return new SecurityError(
      `文件扩展名 "${extension}" 与实际MIME类型 "${file.type}" 不匹配`,
      {
        subType: SecurityErrorSubType.EXTENSION_MISMATCH,
        severity: SecurityIssueSeverity.HIGH,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        recoverable: false,
        context: {
          extension,
          expectedMimeTypes,
        },
      }
    );
  }

  /**
   * 创建权限拒绝错误
   * @param reason 拒绝原因
   * @returns 安全错误实例
   */
  public static permissionDenied(reason: string): SecurityError {
    return new SecurityError(`上传权限被拒绝: ${reason}`, {
      subType: SecurityErrorSubType.PERMISSION_DENIED,
      severity: SecurityIssueSeverity.HIGH,
      recoverable: false,
      context: {
        reason,
      },
    });
  }
}

export default SecurityError;
