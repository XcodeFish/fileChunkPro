/**
 * SecurityError
 * 安全相关错误的统一处理类
 */

import { UploadError, ErrorType as UploadErrorType } from '../core/ErrorCenter';
import { ErrorContextData, ErrorSeverity } from '../types';

/**
 * 安全错误类型
 */
export enum SecurityErrorType {
  // 加密相关错误
  ENCRYPTION_FAILURE = 'encryption_failure',
  DECRYPTION_FAILURE = 'decryption_failure',
  KEY_GENERATION_FAILURE = 'key_generation_failure',
  KEY_DERIVATION_FAILURE = 'key_derivation_failure',
  KEY_ROTATION_FAILURE = 'key_rotation_failure',
  KEY_IMPORT_FAILURE = 'key_import_failure',
  KEY_EXPORT_FAILURE = 'key_export_failure',

  // 完整性检查错误
  INTEGRITY_CHECK_FAILURE = 'integrity_check_failure',
  HASH_MISMATCH = 'hash_mismatch',
  SIGNATURE_VERIFICATION_FAILURE = 'signature_verification_failure',
  TAMPERING_DETECTED = 'tampering_detected',

  // CSRF 相关错误
  CSRF_TOKEN_MISSING = 'csrf_token_missing',
  CSRF_TOKEN_INVALID = 'csrf_token_invalid',
  CSRF_TOKEN_EXPIRED = 'csrf_token_expired',
  CSRF_VERIFICATION_FAILURE = 'csrf_verification_failure',

  // 权限相关错误
  PERMISSION_DENIED = 'permission_denied',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  TOKEN_EXPIRED = 'token_expired',
  INSUFFICIENT_PRIVILEGES = 'insufficient_privileges',

  // 环境相关错误
  INSECURE_ENVIRONMENT = 'insecure_environment',
  CRYPTO_API_UNAVAILABLE = 'crypto_api_unavailable',

  // 其他安全错误
  SECURITY_POLICY_VIOLATION = 'security_policy_violation',
  XSS_ATTEMPT_DETECTED = 'xss_attempt_detected',
  PROTOTYPE_POLLUTION_ATTEMPT = 'prototype_pollution_attempt',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
}

/**
 * 安全错误映射到UploadErrorType
 */
const SecurityErrorToUploadErrorMap = new Map<
  SecurityErrorType,
  UploadErrorType
>([
  // 加密错误映射到数据处理错误
  [SecurityErrorType.ENCRYPTION_FAILURE, UploadErrorType.DATA_PROCESSING_ERROR],
  [SecurityErrorType.DECRYPTION_FAILURE, UploadErrorType.DATA_PROCESSING_ERROR],
  [
    SecurityErrorType.KEY_GENERATION_FAILURE,
    UploadErrorType.INITIALIZATION_ERROR,
  ],
  [
    SecurityErrorType.KEY_DERIVATION_FAILURE,
    UploadErrorType.INITIALIZATION_ERROR,
  ],
  [SecurityErrorType.KEY_ROTATION_FAILURE, UploadErrorType.INTERNAL_ERROR],
  [SecurityErrorType.KEY_IMPORT_FAILURE, UploadErrorType.INITIALIZATION_ERROR],
  [SecurityErrorType.KEY_EXPORT_FAILURE, UploadErrorType.INTERNAL_ERROR],

  // 完整性错误映射到数据完整性错误
  [
    SecurityErrorType.INTEGRITY_CHECK_FAILURE,
    UploadErrorType.DATA_INTEGRITY_ERROR,
  ],
  [SecurityErrorType.HASH_MISMATCH, UploadErrorType.DATA_INTEGRITY_ERROR],
  [
    SecurityErrorType.SIGNATURE_VERIFICATION_FAILURE,
    UploadErrorType.DATA_INTEGRITY_ERROR,
  ],
  [SecurityErrorType.TAMPERING_DETECTED, UploadErrorType.DATA_INTEGRITY_ERROR],

  // CSRF错误映射到安全错误
  [SecurityErrorType.CSRF_TOKEN_MISSING, UploadErrorType.SECURITY_ERROR],
  [SecurityErrorType.CSRF_TOKEN_INVALID, UploadErrorType.SECURITY_ERROR],
  [SecurityErrorType.CSRF_TOKEN_EXPIRED, UploadErrorType.SECURITY_ERROR],
  [SecurityErrorType.CSRF_VERIFICATION_FAILURE, UploadErrorType.SECURITY_ERROR],

  // 权限错误映射到授权错误
  [SecurityErrorType.PERMISSION_DENIED, UploadErrorType.AUTHORIZATION_ERROR],
  [SecurityErrorType.UNAUTHORIZED_ACCESS, UploadErrorType.UNAUTHORIZED],
  [SecurityErrorType.TOKEN_EXPIRED, UploadErrorType.AUTHORIZATION_ERROR],
  [SecurityErrorType.INSUFFICIENT_PRIVILEGES, UploadErrorType.PERMISSION_ERROR],

  // 环境错误映射到环境错误
  [SecurityErrorType.INSECURE_ENVIRONMENT, UploadErrorType.ENVIRONMENT_ERROR],
  [
    SecurityErrorType.CRYPTO_API_UNAVAILABLE,
    UploadErrorType.FEATURE_NOT_SUPPORTED,
  ],

  // 其他安全错误
  [SecurityErrorType.SECURITY_POLICY_VIOLATION, UploadErrorType.SECURITY_ERROR],
  [SecurityErrorType.XSS_ATTEMPT_DETECTED, UploadErrorType.SECURITY_ERROR],
  [
    SecurityErrorType.PROTOTYPE_POLLUTION_ATTEMPT,
    UploadErrorType.SECURITY_ERROR,
  ],
  [SecurityErrorType.RATE_LIMIT_EXCEEDED, UploadErrorType.RATE_LIMIT_ERROR],
]);

/**
 * 安全错误的严重程度映射
 */
const SecurityErrorSeverityMap = new Map<SecurityErrorType, ErrorSeverity>([
  // 加密错误
  [SecurityErrorType.ENCRYPTION_FAILURE, ErrorSeverity.CRITICAL],
  [SecurityErrorType.DECRYPTION_FAILURE, ErrorSeverity.CRITICAL],
  [SecurityErrorType.KEY_GENERATION_FAILURE, ErrorSeverity.HIGH],
  [SecurityErrorType.KEY_DERIVATION_FAILURE, ErrorSeverity.HIGH],
  [SecurityErrorType.KEY_ROTATION_FAILURE, ErrorSeverity.MEDIUM],
  [SecurityErrorType.KEY_IMPORT_FAILURE, ErrorSeverity.HIGH],
  [SecurityErrorType.KEY_EXPORT_FAILURE, ErrorSeverity.HIGH],

  // 完整性错误
  [SecurityErrorType.INTEGRITY_CHECK_FAILURE, ErrorSeverity.HIGH],
  [SecurityErrorType.HASH_MISMATCH, ErrorSeverity.HIGH],
  [SecurityErrorType.SIGNATURE_VERIFICATION_FAILURE, ErrorSeverity.CRITICAL],
  [SecurityErrorType.TAMPERING_DETECTED, ErrorSeverity.CRITICAL],

  // CSRF错误
  [SecurityErrorType.CSRF_TOKEN_MISSING, ErrorSeverity.MEDIUM],
  [SecurityErrorType.CSRF_TOKEN_INVALID, ErrorSeverity.HIGH],
  [SecurityErrorType.CSRF_TOKEN_EXPIRED, ErrorSeverity.MEDIUM],
  [SecurityErrorType.CSRF_VERIFICATION_FAILURE, ErrorSeverity.HIGH],

  // 权限错误
  [SecurityErrorType.PERMISSION_DENIED, ErrorSeverity.MEDIUM],
  [SecurityErrorType.UNAUTHORIZED_ACCESS, ErrorSeverity.HIGH],
  [SecurityErrorType.TOKEN_EXPIRED, ErrorSeverity.LOW],
  [SecurityErrorType.INSUFFICIENT_PRIVILEGES, ErrorSeverity.MEDIUM],

  // 环境错误
  [SecurityErrorType.INSECURE_ENVIRONMENT, ErrorSeverity.HIGH],
  [SecurityErrorType.CRYPTO_API_UNAVAILABLE, ErrorSeverity.HIGH],

  // 其他安全错误
  [SecurityErrorType.SECURITY_POLICY_VIOLATION, ErrorSeverity.HIGH],
  [SecurityErrorType.XSS_ATTEMPT_DETECTED, ErrorSeverity.CRITICAL],
  [SecurityErrorType.PROTOTYPE_POLLUTION_ATTEMPT, ErrorSeverity.CRITICAL],
  [SecurityErrorType.RATE_LIMIT_EXCEEDED, ErrorSeverity.MEDIUM],
]);

/**
 * 安全错误的友好消息映射
 */
const SecurityErrorFriendlyMessages = new Map<SecurityErrorType, string>([
  // 加密错误
  [SecurityErrorType.ENCRYPTION_FAILURE, '文件加密失败，请重试或联系支持团队'],
  [
    SecurityErrorType.DECRYPTION_FAILURE,
    '文件解密失败，可能是密钥不匹配或数据已损坏',
  ],
  [
    SecurityErrorType.KEY_GENERATION_FAILURE,
    '无法生成安全密钥，可能是浏览器不支持或环境不安全',
  ],
  [
    SecurityErrorType.KEY_DERIVATION_FAILURE,
    '从密码派生密钥失败，请检查密码复杂度',
  ],
  [
    SecurityErrorType.KEY_ROTATION_FAILURE,
    '密钥轮换失败，系统将继续使用现有密钥',
  ],
  [SecurityErrorType.KEY_IMPORT_FAILURE, '导入密钥失败，密钥格式可能不受支持'],
  [SecurityErrorType.KEY_EXPORT_FAILURE, '导出密钥失败，密钥可能不允许导出'],

  // 完整性错误
  [
    SecurityErrorType.INTEGRITY_CHECK_FAILURE,
    '文件完整性检查失败，文件可能已损坏或被篡改',
  ],
  [SecurityErrorType.HASH_MISMATCH, '文件哈希值不匹配，上传的内容可能已被修改'],
  [
    SecurityErrorType.SIGNATURE_VERIFICATION_FAILURE,
    '文件签名验证失败，可能是文件被篡改或使用了错误的密钥',
  ],
  [
    SecurityErrorType.TAMPERING_DETECTED,
    '检测到数据篡改，上传被中止以保护安全',
  ],

  // CSRF错误
  [SecurityErrorType.CSRF_TOKEN_MISSING, 'CSRF令牌缺失，请刷新页面后重试'],
  [
    SecurityErrorType.CSRF_TOKEN_INVALID,
    'CSRF令牌无效，可能是会话已过期，请重新登录',
  ],
  [SecurityErrorType.CSRF_TOKEN_EXPIRED, 'CSRF令牌已过期，请刷新页面后重试'],
  [
    SecurityErrorType.CSRF_VERIFICATION_FAILURE,
    'CSRF验证失败，请刷新页面或清除浏览器缓存后重试',
  ],

  // 权限错误
  [
    SecurityErrorType.PERMISSION_DENIED,
    '权限被拒绝，您可能没有执行此操作的权限',
  ],
  [SecurityErrorType.UNAUTHORIZED_ACCESS, '未经授权的访问，请登录后重试'],
  [SecurityErrorType.TOKEN_EXPIRED, '授权令牌已过期，请重新登录'],
  [
    SecurityErrorType.INSUFFICIENT_PRIVILEGES,
    '权限不足，您的账户没有执行此操作的权限',
  ],

  // 环境错误
  [
    SecurityErrorType.INSECURE_ENVIRONMENT,
    '检测到不安全的环境，请使用HTTPS连接',
  ],
  [SecurityErrorType.CRYPTO_API_UNAVAILABLE, '加密API不可用，请使用现代浏览器'],

  // 其他安全错误
  [
    SecurityErrorType.SECURITY_POLICY_VIOLATION,
    '安全策略冲突，该操作可能违反了内容安全策略',
  ],
  [
    SecurityErrorType.XSS_ATTEMPT_DETECTED,
    '检测到潜在的XSS攻击尝试，请检查输入内容',
  ],
  [
    SecurityErrorType.PROTOTYPE_POLLUTION_ATTEMPT,
    '检测到潜在的原型污染尝试，操作被阻止',
  ],
  [SecurityErrorType.RATE_LIMIT_EXCEEDED, '请求频率超过限制，请稍后重试'],
]);

/**
 * 安全错误是否可恢复映射
 */
const SecurityErrorRecoverabilityMap = new Map<SecurityErrorType, boolean>([
  // 一些错误是可以恢复的
  [SecurityErrorType.ENCRYPTION_FAILURE, true], // 可以重试加密
  [SecurityErrorType.DECRYPTION_FAILURE, true], // 可以重试解密
  [SecurityErrorType.KEY_GENERATION_FAILURE, true], // 可以尝试不同参数生成密钥
  [SecurityErrorType.KEY_DERIVATION_FAILURE, true], // 可以重试派生或使用不同参数
  [SecurityErrorType.KEY_ROTATION_FAILURE, true], // 可以稍后重试轮换
  [SecurityErrorType.KEY_IMPORT_FAILURE, true], // 可以使用不同格式或参数导入
  [SecurityErrorType.KEY_EXPORT_FAILURE, false], // 如果不可导出则无法恢复

  // 数据完整性错误通常不可恢复
  [SecurityErrorType.INTEGRITY_CHECK_FAILURE, false],
  [SecurityErrorType.HASH_MISMATCH, false],
  [SecurityErrorType.SIGNATURE_VERIFICATION_FAILURE, false],
  [SecurityErrorType.TAMPERING_DETECTED, false],

  // CSRF错误通常是可恢复的
  [SecurityErrorType.CSRF_TOKEN_MISSING, true], // 可以重新获取令牌
  [SecurityErrorType.CSRF_TOKEN_INVALID, true], // 可以重新获取令牌
  [SecurityErrorType.CSRF_TOKEN_EXPIRED, true], // 可以重新获取令牌
  [SecurityErrorType.CSRF_VERIFICATION_FAILURE, true], // 可以重新获取令牌并重试

  // 权限错误视情况而定
  [SecurityErrorType.PERMISSION_DENIED, false], // 通常需要用户提高权限
  [SecurityErrorType.UNAUTHORIZED_ACCESS, true], // 可以重新登录
  [SecurityErrorType.TOKEN_EXPIRED, true], // 可以重新获取令牌
  [SecurityErrorType.INSUFFICIENT_PRIVILEGES, false], // 通常需要提高用户账户权限

  // 环境错误通常无法自动恢复
  [SecurityErrorType.INSECURE_ENVIRONMENT, false], // 需要切换到HTTPS
  [SecurityErrorType.CRYPTO_API_UNAVAILABLE, false], // 需要更换浏览器

  // 其他安全错误
  [SecurityErrorType.SECURITY_POLICY_VIOLATION, false],
  [SecurityErrorType.XSS_ATTEMPT_DETECTED, false],
  [SecurityErrorType.PROTOTYPE_POLLUTION_ATTEMPT, false],
  [SecurityErrorType.RATE_LIMIT_EXCEEDED, true], // 可以等待限制解除后重试
]);

/**
 * 安全错误类
 * 继承自UploadError，用于处理安全相关错误
 */
export class SecurityError extends UploadError {
  /**
   * 创建安全错误
   * @param securityType 安全错误类型
   * @param message 错误消息
   * @param originalError 原始错误
   * @param context 错误上下文
   * @returns 新的SecurityError实例
   */
  constructor(
    public securityType: SecurityErrorType,
    message?: string,
    originalError?: any,
    context?: ErrorContextData
  ) {
    // 将安全错误类型映射到上传错误类型
    const uploadErrorType =
      SecurityErrorToUploadErrorMap.get(securityType) ||
      UploadErrorType.SECURITY_ERROR;

    // 如果没有提供消息，使用友好消息
    const errorMessage =
      message ||
      SecurityErrorFriendlyMessages.get(securityType) ||
      `安全错误: ${securityType}`;

    // 创建上传错误
    super(
      uploadErrorType,
      errorMessage,
      originalError,
      undefined, // 没有分片信息
      {
        ...context,
        security: {
          securityErrorType: securityType,
          timestamp: Date.now(),
          ...context?.security,
        },
      }
    );

    this.name = 'SecurityError';

    // 覆盖严重程度
    if (SecurityErrorSeverityMap.has(securityType)) {
      this.severity = SecurityErrorSeverityMap.get(securityType)!;
    }

    // 覆盖可恢复性
    if (SecurityErrorRecoverabilityMap.has(securityType)) {
      this.isRecoverable = SecurityErrorRecoverabilityMap.get(securityType);
    }

    // 添加安全特定的诊断数据
    this.addSecurityDiagnostics();
  }

  /**
   * 添加安全特定的诊断数据
   */
  private addSecurityDiagnostics(): void {
    // 确保diagnosticData被初始化
    if (!this.diagnosticData) {
      this.diagnosticData = {
        occurrenceStats: {
          similarErrorCount: 1,
          firstOccurrence: this.timestamp,
          sessionErrorCount: 1,
        },
      };
    }

    // 添加安全特定的数据
    this.diagnosticData = {
      ...this.diagnosticData,
      securityDiagnostics: {
        securityErrorType: this.securityType,
        severity: this.severity,
        isRecoverable: this.isRecoverable,
        // 添加环境相关信息
        environment: {
          isHttps:
            typeof window !== 'undefined' &&
            window.location?.protocol === 'https:',
          hasCryptoApi:
            typeof crypto !== 'undefined' &&
            typeof crypto.subtle !== 'undefined',
          // 检测是否在安全上下文中
          isSecureContext:
            typeof window !== 'undefined' && window.isSecureContext === true,
        },
      },
    };

    // 如果有原始错误，尝试提取更多诊断信息
    if (this.originalError) {
      try {
        if (this.originalError.code) {
          (this.diagnosticData as any).securityDiagnostics.errorCode =
            this.originalError.code;
        }
        if (this.originalError.name) {
          (this.diagnosticData as any).securityDiagnostics.errorName =
            this.originalError.name;
        }
      } catch (e) {
        // 忽略无法访问的属性
      }
    }
  }

  /**
   * 获取建议的解决方案，覆盖基类方法
   */
  getPossibleSolutions(): string[] {
    const baseSolutions = super.getPossibleSolutions();

    // 根据安全错误类型添加特定的解决方案
    let securitySpecificSolutions: string[] = [];

    switch (this.securityType) {
      case SecurityErrorType.ENCRYPTION_FAILURE:
      case SecurityErrorType.DECRYPTION_FAILURE:
        securitySpecificSolutions = [
          '确保浏览器支持所需的加密算法',
          '尝试刷新页面后重试',
          '检查是否有浏览器扩展干扰加密操作',
        ];
        break;

      case SecurityErrorType.KEY_GENERATION_FAILURE:
      case SecurityErrorType.KEY_DERIVATION_FAILURE:
        securitySpecificSolutions = [
          '确保使用的是支持Web Crypto API的现代浏览器',
          '尝试在无痕/隐私模式下重试',
          '检查浏览器是否启用了安全功能',
        ];
        break;

      case SecurityErrorType.CSRF_TOKEN_MISSING:
      case SecurityErrorType.CSRF_TOKEN_INVALID:
      case SecurityErrorType.CSRF_TOKEN_EXPIRED:
        securitySpecificSolutions = [
          '刷新页面获取新的CSRF令牌',
          '清除浏览器缓存和Cookie后重试',
          '确保没有禁用Cookie',
        ];
        break;

      case SecurityErrorType.PERMISSION_DENIED:
      case SecurityErrorType.UNAUTHORIZED_ACCESS:
      case SecurityErrorType.TOKEN_EXPIRED:
      case SecurityErrorType.INSUFFICIENT_PRIVILEGES:
        securitySpecificSolutions = [
          '尝试重新登录',
          '联系管理员获取所需权限',
          '检查账户状态是否正常',
        ];
        break;

      case SecurityErrorType.RATE_LIMIT_EXCEEDED:
        securitySpecificSolutions = [
          '等待几分钟后再尝试',
          '减少请求频率',
          '批量处理请求以降低频率',
        ];
        break;

      case SecurityErrorType.INSECURE_ENVIRONMENT:
        securitySpecificSolutions = [
          '切换到HTTPS连接',
          '确保所有资源都从安全源加载',
        ];
        break;
    }

    return [...securitySpecificSolutions, ...baseSolutions];
  }

  /**
   * 创建适当的SecurityError实例
   * 工厂方法，方便创建不同类型的安全错误
   * @param type 安全错误类型
   * @param message 错误消息
   * @param originalError 原始错误
   * @param context 错误上下文
   * @returns SecurityError实例
   */
  public static create(
    type: SecurityErrorType,
    message?: string,
    originalError?: any,
    context?: ErrorContextData
  ): SecurityError {
    return new SecurityError(type, message, originalError, context);
  }

  /**
   * 将Error或其他错误转换为SecurityError
   * @param error 原始错误
   * @param defaultType 默认安全错误类型
   * @param context 错误上下文
   * @returns SecurityError实例
   */
  public static fromError(
    error: any,
    defaultType: SecurityErrorType = SecurityErrorType.SECURITY_POLICY_VIOLATION,
    context?: ErrorContextData
  ): SecurityError {
    // 如果已经是SecurityError，直接返回
    if (error instanceof SecurityError) {
      // 如果提供了上下文，添加到现有错误
      if (context) {
        error.addContext(context);
      }
      return error;
    }

    // 尝试确定更具体的安全错误类型
    let securityType = defaultType;
    const message = error instanceof Error ? error.message : String(error);

    // 根据错误消息或类型判断安全错误类型
    if (error instanceof Error) {
      if (
        error.name === 'NotAllowedError' ||
        message.includes('secure context')
      ) {
        securityType = SecurityErrorType.INSECURE_ENVIRONMENT;
      } else if (error.name === 'QuotaExceededError') {
        securityType = SecurityErrorType.RATE_LIMIT_EXCEEDED;
      } else if (message.includes('crypto') || message.includes('subtle')) {
        securityType = SecurityErrorType.CRYPTO_API_UNAVAILABLE;
      } else if (message.includes('permission') || message.includes('access')) {
        securityType = SecurityErrorType.PERMISSION_DENIED;
      } else if (message.includes('tamper') || message.includes('integrity')) {
        securityType = SecurityErrorType.TAMPERING_DETECTED;
      } else if (message.includes('hash') || message.includes('checksum')) {
        securityType = SecurityErrorType.HASH_MISMATCH;
      } else if (message.includes('encrypt')) {
        securityType = SecurityErrorType.ENCRYPTION_FAILURE;
      } else if (message.includes('decrypt')) {
        securityType = SecurityErrorType.DECRYPTION_FAILURE;
      } else if (message.includes('key')) {
        securityType = SecurityErrorType.KEY_GENERATION_FAILURE;
      } else if (message.includes('csrf') || message.includes('token')) {
        securityType = SecurityErrorType.CSRF_TOKEN_INVALID;
      }
    }

    return new SecurityError(securityType, message, error, context);
  }
}

/**
 * 导出单例ErrorHandler，方便在安全模块中使用
 */
export class SecurityErrorHandler {
  private static instance: SecurityErrorHandler | null = null;

  /**
   * 获取SecurityErrorHandler实例
   */
  public static getInstance(): SecurityErrorHandler {
    if (!this.instance) {
      this.instance = new SecurityErrorHandler();
    }
    return this.instance;
  }

  /**
   * 构造函数，初始化错误处理器
   */
  private constructor() {
    // 初始化代码
    this.registerErrorHandlers();
  }

  /**
   * 注册错误处理器
   */
  private registerErrorHandlers(): void {
    // 这里可以注册全局错误处理器或特定模块的错误处理器
    // 例如监听全局的未捕获异常
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', event => {
        this.handlePossibleSecurityError(event.reason);
      });
    }
  }

  /**
   * 处理安全错误
   * @param error 错误对象
   * @param context 错误上下文
   * @returns SecurityError实例
   */
  public handleSecurityError(
    errorOrType: SecurityErrorType | Error | any,
    message?: string,
    originalError?: any,
    context?: ErrorContextData
  ): SecurityError {
    let securityError: SecurityError;

    // 根据传入的参数类型创建SecurityError
    if (
      typeof errorOrType === 'string' &&
      Object.values(SecurityErrorType).includes(
        errorOrType as SecurityErrorType
      )
    ) {
      // 是SecurityErrorType枚举值
      securityError = SecurityError.create(
        errorOrType as SecurityErrorType,
        message,
        originalError,
        context
      );
    } else {
      // 是其他错误类型
      securityError = SecurityError.fromError(
        errorOrType,
        SecurityErrorType.SECURITY_POLICY_VIOLATION,
        context
      );
    }

    // 记录错误
    this.logSecurityError(securityError);

    // 向上抛出给ErrorCenter处理
    return securityError;
  }

  /**
   * 处理可能的安全错误
   * @param error 可能是安全错误的对象
   * @returns 如果是安全错误，返回处理后的SecurityError实例
   */
  public handlePossibleSecurityError(error: any): SecurityError | null {
    // 检查是否是安全相关错误
    if (this.isSecurityError(error)) {
      return this.handleSecurityError(error);
    }
    return null;
  }

  /**
   * 判断一个错误是否是安全相关错误
   * @param error 要检查的错误
   * @returns 是否是安全相关错误
   */
  public isSecurityError(error: any): boolean {
    if (error instanceof SecurityError) {
      return true;
    }

    // 检查错误消息和名称
    if (error instanceof Error) {
      const errorText = `${error.name}: ${error.message}`.toLowerCase();
      const securityKeywords = [
        'security',
        'secure',
        'crypto',
        'encrypt',
        'decrypt',
        'hash',
        'integrity',
        'tamper',
        'token',
        'csrf',
        'xss',
        'injection',
        'permission',
        'access',
        'unauthorized',
        'forbidden',
        'auth',
      ];

      return securityKeywords.some(keyword => errorText.includes(keyword));
    }

    return false;
  }

  /**
   * 记录安全错误
   * @param error 安全错误
   */
  private logSecurityError(error: SecurityError): void {
    // 记录错误到控制台
    console.error('[Security Error]', error);

    // 这里可以添加更多的错误记录逻辑，如：
    // - 发送到错误跟踪服务
    // - 存储到本地存储进行分析
    // - 显示安全警告给用户
  }
}

// 导出安全错误处理器单例
export const securityErrorHandler = SecurityErrorHandler.getInstance();
