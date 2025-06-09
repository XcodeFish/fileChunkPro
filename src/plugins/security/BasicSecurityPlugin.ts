/**
 * BasicSecurityPlugin
 * 基础安全级别插件，提供基本的安全保障功能：
 * - 文件类型安全检查
 * - 基础权限验证
 * - 大小限制实施
 * - 安全错误隔离
 */

import { EventBus } from '../../core/EventBus';
import UploaderCore from '../../core/UploaderCore';
import {
  Environment,
  ErrorGroup,
  ErrorSeverity,
  HookResult,
  SecurityErrorSubType,
  SecurityIssueSeverity,
  SecurityLevel,
  SecurityValidationResult,
  UploadErrorType,
} from '../../types';
import FileContentDetector from '../../utils/FileContentDetector';
import PermissionChecker from '../../utils/PermissionChecker';
import SecurityError from '../../utils/SecurityError';
import { IPlugin } from '../interfaces';

export interface BasicSecurityPluginOptions {
  /**
   * 允许的文件MIME类型
   */
  allowedMimeTypes?: string[];

  /**
   * 最大文件大小 (字节)
   */
  maxFileSize?: number;

  /**
   * 最大文件名长度
   */
  maxFileNameLength?: number;

  /**
   * 是否启用敏感文件后缀检查
   */
  enableSensitiveExtensionCheck?: boolean;

  /**
   * 是否验证文件后缀与MIME类型是否匹配
   */
  validateFileExtension?: boolean;

  /**
   * 是否检查上传权限
   */
  checkUploadPermission?: boolean;

  /**
   * 是否验证文件内容
   */
  validateFileContent?: boolean;

  /**
   * 是否启用严格文件类型检查
   */
  strictTypeChecking?: boolean;

  /**
   * 是否检查网络权限
   */
  checkNetworkPermission?: boolean;

  /**
   * 是否检查存储权限
   */
  checkStoragePermission?: boolean;

  /**
   * 是否允许空文件
   */
  allowEmptyFiles?: boolean;

  /**
   * 敏感文件后缀列表（覆盖默认列表）
   */
  sensitiveExtensions?: string[];
}

/**
 * 基础安全插件类
 * 提供基础级别的文件上传安全保障
 */
class BasicSecurityPlugin implements IPlugin {
  name = 'BasicSecurityPlugin';

  private _options: BasicSecurityPluginOptions;
  private _eventBus?: EventBus;
  private _uploader?: UploaderCore;
  private _environment: Environment = Environment.Unknown;

  // 敏感文件后缀列表
  private static readonly SENSITIVE_EXTENSIONS = [
    'exe',
    'bat',
    'cmd',
    'sh',
    'php',
    'phtml',
    'pl',
    'py',
    'cgi',
    'asp',
    'aspx',
    'config',
    'conf',
    'xml',
    'log',
    'bak',
    'backup',
    'swp',
    'sql',
    'htaccess',
    'htpasswd',
    'dll',
    'sys',
    'vbs',
    'js',
    'jar',
    'jnlp',
    'hta',
    'msi',
    'ps1',
    'reg',
    'action',
    'war',
  ];

  // 文件扩展名到MIME类型的映射
  private static readonly EXTENSION_TO_MIME: Record<string, string[]> = {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    gif: ['image/gif'],
    webp: ['image/webp'],
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    xls: ['application/vnd.ms-excel'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    zip: ['application/zip', 'application/x-zip-compressed'],
    mp3: ['audio/mpeg'],
    mp4: ['video/mp4'],
    txt: ['text/plain'],
    csv: ['text/csv'],
    json: ['application/json'],
    xml: ['application/xml', 'text/xml'],
    svg: ['image/svg+xml'],
    ico: ['image/x-icon'],
    ppt: ['application/vnd.ms-powerpoint'],
    pptx: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    rar: ['application/vnd.rar', 'application/x-rar-compressed'],
    html: ['text/html'],
    htm: ['text/html'],
    css: ['text/css'],
    js: ['text/javascript', 'application/javascript'],
  };

  /**
   * 创建基础安全插件实例
   * @param options 安全插件选项
   */
  constructor(options: BasicSecurityPluginOptions = {}) {
    this._options = {
      allowedMimeTypes: [],
      maxFileSize: 100 * 1024 * 1024, // 默认100MB
      maxFileNameLength: 255, // 默认最大文件名长度
      enableSensitiveExtensionCheck: true, // 默认启用敏感后缀检查
      validateFileExtension: true, // 默认验证文件后缀
      checkUploadPermission: true, // 默认检查上传权限
      validateFileContent: false, // 默认不验证文件内容
      strictTypeChecking: false, // 默认不启用严格类型检查
      checkNetworkPermission: true, // 默认检查网络权限
      checkStoragePermission: true, // 默认检查存储权限
      allowEmptyFiles: false, // 默认不允许空文件
      ...options,
    };

    // 使用自定义敏感后缀列表（如果提供）
    if (options.sensitiveExtensions) {
      this._sensitiveExtensions = options.sensitiveExtensions;
    } else {
      this._sensitiveExtensions = BasicSecurityPlugin.SENSITIVE_EXTENSIONS;
    }
  }

  // 当前使用的敏感后缀列表
  private _sensitiveExtensions: string[];

  /**
   * 安装插件
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this._uploader = uploader;
    this._eventBus = uploader.getEventBus();
    const pluginManager = uploader.getPluginManager();

    // 获取运行环境
    this._environment = uploader.getEnvironment();

    // 注册钩子
    pluginManager.registerHook(
      'beforeFileUpload',
      this._validateFile.bind(this),
      { plugin: this.name, priority: 9 }
    );

    pluginManager.registerHook(
      'beforeChunkUpload',
      this._validateChunk.bind(this),
      { plugin: this.name, priority: 9 }
    );

    // 注册事件处理
    if (this._eventBus) {
      this._eventBus.on('fileUpload:start', this._onFileUploadStart.bind(this));
      this._eventBus.on('fileUpload:error', this._onFileUploadError.bind(this));
      this._eventBus.on(
        'uploader:init',
        this._checkInitialPermissions.bind(this)
      );
    }
  }

  /**
   * 卸载插件
   */
  uninstall(): void {
    if (this._eventBus) {
      this._eventBus.off(
        'fileUpload:start',
        this._onFileUploadStart.bind(this)
      );
      this._eventBus.off(
        'fileUpload:error',
        this._onFileUploadError.bind(this)
      );
      this._eventBus.off(
        'uploader:init',
        this._checkInitialPermissions.bind(this)
      );
    }

    if (this._uploader) {
      const pluginManager = this._uploader.getPluginManager();
      pluginManager.removePluginHooks(this.name);
    }
  }

  /**
   * 初始化时检查权限
   */
  private async _checkInitialPermissions(): Promise<void> {
    if (!this._options.checkUploadPermission) {
      return;
    }

    try {
      const permissionResult = await PermissionChecker.checkUploadPermission({
        environment: this._environment,
        checkStorage: this._options.checkStoragePermission,
        checkNetwork: this._options.checkNetworkPermission,
        checkFileSystem: false, // 基础级别不检查文件系统权限
      });

      if (!permissionResult.granted) {
        this._logSecurityEvent('初始权限检查失败', {
          reason: permissionResult.deniedReason,
          details: permissionResult.details,
        });

        if (this._eventBus) {
          this._eventBus.emit('security:permissionDenied', {
            reason: permissionResult.deniedReason,
            details: permissionResult.details,
          });
        }
      }
    } catch (error) {
      this._logSecurityEvent('权限检查异常', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * 验证文件
   * @param param0 包含文件对象的参数
   * @returns 钩子结果
   */
  private async _validateFile({ file }: { file: File }): Promise<HookResult> {
    const config = this._uploader?.getConfig() || {};
    const validationResult: SecurityValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      // 1. 检查文件大小
      const maxSize = this._options.maxFileSize || config.maxFileSize;
      if (maxSize && file.size > maxSize) {
        validationResult.valid = false;
        validationResult.errors.push({
          code: SecurityErrorSubType.FILE_SIZE_EXCEEDED,
          message: `文件大小超过限制: ${file.size} 字节 > ${maxSize} 字节`,
          severity: SecurityIssueSeverity.MEDIUM,
        });
      }

      // 2. 检查空文件
      if (!this._options.allowEmptyFiles && file.size === 0) {
        validationResult.valid = false;
        validationResult.errors.push({
          code: SecurityErrorSubType.INVALID_FILENAME,
          message: '不允许上传空文件',
          severity: SecurityIssueSeverity.MEDIUM,
        });
      }

      // 3. 检查文件类型
      const allowedTypes =
        this._options.allowedMimeTypes || config.allowFileTypes;
      if (allowedTypes && allowedTypes.length > 0) {
        const isAllowed = this._checkFileType(file.type, allowedTypes);
        if (!isAllowed) {
          validationResult.valid = false;
          validationResult.errors.push({
            code: SecurityErrorSubType.FILE_TYPE_NOT_ALLOWED,
            message: `文件类型不允许: ${file.type}`,
            severity: SecurityIssueSeverity.MEDIUM,
          });
        }
      }

      // 4. 检查文件名长度
      if (
        this._options.maxFileNameLength &&
        file.name.length > this._options.maxFileNameLength
      ) {
        validationResult.valid = false;
        validationResult.errors.push({
          code: SecurityErrorSubType.INVALID_FILENAME,
          message: `文件名长度超过限制: ${file.name.length} > ${this._options.maxFileNameLength}`,
          severity: SecurityIssueSeverity.MEDIUM,
        });
      }

      // 5. 检查敏感文件后缀
      if (this._options.enableSensitiveExtensionCheck) {
        const extension = this._getFileExtension(file.name).toLowerCase();
        if (this._sensitiveExtensions.includes(extension)) {
          validationResult.valid = false;
          validationResult.errors.push({
            code: SecurityErrorSubType.SENSITIVE_FILE_TYPE,
            message: `检测到敏感文件类型: ${extension}`,
            severity: SecurityIssueSeverity.HIGH,
          });
        }
      }

      // 6. 验证文件后缀与MIME类型是否匹配
      if (this._options.validateFileExtension) {
        const isValidExtension = this._validateFileExtensionWithMime(file);
        if (!isValidExtension) {
          validationResult.valid = false;
          validationResult.errors.push({
            code: SecurityErrorSubType.EXTENSION_MISMATCH,
            message: `文件后缀与实际类型不匹配: ${file.name} (${file.type})`,
            severity: SecurityIssueSeverity.HIGH,
          });
        }
      }

      // 7. 验证文件内容（如果启用）
      if (this._options.validateFileContent) {
        try {
          const contentDetectionResult =
            await FileContentDetector.detectContentType(file);

          if (
            contentDetectionResult.success &&
            !contentDetectionResult.matchesDeclared
          ) {
            validationResult.valid = false;
            validationResult.errors.push({
              code: SecurityErrorSubType.EXTENSION_MISMATCH,
              message: `文件内容与声明类型不匹配: 声明为 ${file.type}，实际为 ${contentDetectionResult.detectedMimeType}`,
              severity: SecurityIssueSeverity.HIGH,
            });
          }

          // 进行更严格的扩展名与内容类型匹配检查
          if (
            this._options.strictTypeChecking &&
            contentDetectionResult.success
          ) {
            const extensionMatchesContent =
              FileContentDetector.validateExtensionWithContent(
                file.name,
                contentDetectionResult
              );

            if (!extensionMatchesContent) {
              validationResult.valid = false;
              validationResult.errors.push({
                code: SecurityErrorSubType.EXTENSION_MISMATCH,
                message: `文件扩展名与内容不匹配: ${file.name}`,
                severity: SecurityIssueSeverity.HIGH,
              });
            }
          }
        } catch (error) {
          // 内容检测失败，但不阻止上传
          validationResult.warnings.push({
            code: 'content_detection_failed',
            message: `文件内容检测失败: ${(error as Error).message}`,
          });
        }
      }

      // 8. 检查上传权限（如果启用）
      if (this._options.checkUploadPermission) {
        try {
          const permissionResult =
            await PermissionChecker.checkUploadPermission({
              environment: this._environment,
              checkStorage: this._options.checkStoragePermission,
              checkNetwork: this._options.checkNetworkPermission,
            });

          if (!permissionResult.granted) {
            validationResult.valid = false;
            validationResult.errors.push({
              code: SecurityErrorSubType.PERMISSION_DENIED,
              message: `上传权限检查失败: ${permissionResult.deniedReason}`,
              severity: SecurityIssueSeverity.HIGH,
            });
          }
        } catch (error) {
          validationResult.warnings.push({
            code: 'permission_check_failed',
            message: `权限检查异常: ${(error as Error).message}`,
          });
        }
      }

      // 记录安全验证结果
      if (!validationResult.valid) {
        this._logSecurityValidationResult(validationResult, file);

        // 如果验证失败，抛出安全错误
        const mainError = validationResult.errors[0];
        throw this._createSecurityError(
          mainError.code,
          mainError.message,
          file,
          mainError.severity
        );
      }

      return {
        handled: true,
        result: validationResult,
        modified: false,
      };
    } catch (error) {
      // 处理验证过程中的错误
      if (error instanceof SecurityError) {
        throw error; // 已经是SecurityError，直接抛出
      } else {
        // 包装为安全错误
        throw new SecurityError(`文件验证失败: ${(error as Error).message}`, {
          subType: SecurityErrorSubType.OTHER,
          severity: SecurityIssueSeverity.MEDIUM,
          file: {
            name: file.name,
            size: file.size,
            type: file.type,
          },
          recoverable: false,
        });
      }
    }
  }

  /**
   * 验证分片
   * @param param0 包含分片信息的参数
   * @returns 钩子结果
   */
  private _validateChunk({
    chunk,
    file,
    index,
  }: {
    chunk: ArrayBuffer;
    file: File;
    index: number;
  }): HookResult {
    // 基础安全级别仅做简单的分片验证
    // 1. 检查分片大小是否合理
    if (chunk.byteLength === 0) {
      this._logSecurityEvent('检测到空分片', {
        fileId: file.name,
        chunkIndex: index,
      });
    }

    // 在此可以添加更多的分片验证逻辑

    return {
      handled: true,
      result: true,
      modified: false,
    };
  }

  /**
   * 文件上传开始事件处理
   * @param param0 包含文件信息的参数
   */
  private _onFileUploadStart({ file }: { file: File }): void {
    // 记录上传开始的安全日志
    this._logSecurityEvent('文件上传开始', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      timestamp: Date.now(),
    });
  }

  /**
   * 文件上传错误事件处理
   * @param param0 包含错误信息的参数
   */
  private _onFileUploadError({
    error,
    file,
  }: {
    error: Error;
    file: File;
  }): void {
    // 处理安全相关错误
    if (error instanceof SecurityError) {
      this._logSecurityIssue('上传安全错误', error.subType, file, error);
    } else {
      const errorType = (error as any).type || 'UNKNOWN_ERROR';
      if (errorType === UploadErrorType.SECURITY_ERROR) {
        this._logSecurityIssue(
          '上传安全错误',
          SecurityErrorSubType.OTHER,
          file,
          error
        );
      }
    }
  }

  /**
   * 检查文件类型是否允许
   * @param mimeType 文件MIME类型
   * @param allowedTypes 允许的类型列表
   * @returns 是否允许
   */
  private _checkFileType(mimeType: string, allowedTypes: string[]): boolean {
    // 如果允许列表为空，则允许所有类型
    if (allowedTypes.length === 0) return true;

    // 空MIME类型视为不允许
    if (!mimeType) return false;

    // 处理通配符类型匹配 (例如 "image/*")
    return allowedTypes.some(type => {
      if (type === '*' || type === mimeType) {
        return true;
      }

      if (type.endsWith('/*')) {
        const mainType = type.split('/')[0];
        const fileMimeMainType = mimeType.split('/')[0];
        return mainType === fileMimeMainType;
      }

      return false;
    });
  }

  /**
   * 获取文件扩展名
   * @param filename 文件名
   * @returns 文件扩展名
   */
  private _getFileExtension(filename: string): string {
    return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2);
  }

  /**
   * 验证文件扩展名与MIME类型是否匹配
   * @param file 文件对象
   * @returns 是否匹配
   */
  private _validateFileExtensionWithMime(file: File): boolean {
    const extension = this._getFileExtension(file.name).toLowerCase();

    // 如果我们没有该扩展名的MIME类型记录，就不做验证
    if (!BasicSecurityPlugin.EXTENSION_TO_MIME[extension]) {
      return true;
    }

    // 检查MIME类型是否在预期列表中
    return BasicSecurityPlugin.EXTENSION_TO_MIME[extension].includes(file.type);
  }

  /**
   * 记录安全事件
   * @param message 事件消息
   * @param data 事件数据
   */
  private _logSecurityEvent(message: string, data: any): void {
    if (this._eventBus) {
      this._eventBus.emit('security:event', {
        level: SecurityLevel.BASIC,
        message,
        data,
        timestamp: Date.now(),
      });
    }

    // 在调试模式下输出日志
    if (this._uploader?.getConfig().debug) {
      console.log(`[BasicSecurityPlugin] ${message}`, data);
    }
  }

  /**
   * 记录安全问题
   * @param message 问题消息
   * @param code 问题代码
   * @param file 文件对象
   * @param error 错误对象（可选）
   */
  private _logSecurityIssue(
    message: string,
    code: string | SecurityErrorSubType,
    file: File,
    error?: Error
  ): void {
    const issueData = {
      code,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
      timestamp: Date.now(),
      error: error
        ? {
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    if (this._eventBus) {
      this._eventBus.emit('security:issue', {
        level: SecurityLevel.BASIC,
        message,
        data: issueData,
        severity: ErrorSeverity.HIGH,
        group: ErrorGroup.SECURITY,
      });
    }

    // 在调试模式下输出日志
    if (this._uploader?.getConfig().debug) {
      console.error(`[BasicSecurityPlugin] 安全问题: ${message}`, issueData);
    }
  }

  /**
   * 记录安全验证结果
   * @param result 验证结果
   * @param file 文件对象
   */
  private _logSecurityValidationResult(
    result: SecurityValidationResult,
    file: File
  ): void {
    if (this._eventBus) {
      this._eventBus.emit('security:validationResult', {
        level: SecurityLevel.BASIC,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        result,
        timestamp: Date.now(),
      });
    }

    // 在调试模式下输出日志
    if (this._uploader?.getConfig().debug) {
      console.log(`[BasicSecurityPlugin] 文件验证结果:`, {
        file: file.name,
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
  }

  /**
   * 创建安全错误
   * @param code 错误代码
   * @param message 错误消息
   * @param file 文件对象
   * @param severity 错误严重程度
   * @returns 安全错误实例
   */
  private _createSecurityError(
    code: SecurityErrorSubType,
    message: string,
    file: File,
    severity: SecurityIssueSeverity
  ): SecurityError {
    return new SecurityError(message, {
      subType: code,
      severity,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
      recoverable: false,
    });
  }
}

export default BasicSecurityPlugin;
