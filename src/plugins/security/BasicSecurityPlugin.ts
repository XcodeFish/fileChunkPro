/**
 * BasicSecurityPlugin
 * 基础安全级别插件，提供基本的安全保障功能：
 * - 文件类型安全检查
 * - 基础权限验证
 * - 大小限制实施
 * - 安全错误隔离
 */

import {
  HookResult,
  SecurityLevel,
  SecurityValidationResult,
} from '../../types';
import FileContentDetector from '../../utils/FileContentDetector';
import PermissionChecker from '../../utils/PermissionChecker';
import {
  AbstractSecurityPlugin,
  AbstractSecurityPluginOptions,
} from './AbstractSecurityPlugin';

export interface BasicSecurityPluginOptions
  extends AbstractSecurityPluginOptions {
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
 * 基础安全插件
 */
export default class BasicSecurityPlugin extends AbstractSecurityPlugin {
  /**
   * 插件名称
   */
  public readonly name = 'BasicSecurityPlugin';

  /**
   * 插件版本
   */
  public readonly version = '1.0.0';

  /**
   * 敏感文件后缀列表
   */
  private _sensitiveExtensions: string[] = [
    'exe',
    'bat',
    'cmd',
    'sh',
    'ps1',
    'vbs',
    'js',
    'jse',
    'wsf',
    'msc',
    'msi',
    'com',
    'scr',
    'reg',
    'dll',
    'php',
    'asp',
    'aspx',
    'jsp',
  ];

  /**
   * 文件内容检测器
   */
  private _fileContentDetector: FileContentDetector;

  /**
   * 权限检查器
   */
  private _permissionChecker: PermissionChecker;

  /**
   * 构造函数
   * @param options 基础安全插件选项
   */
  constructor(options: BasicSecurityPluginOptions = {}) {
    super({
      securityLevel: SecurityLevel.BASIC,
      ...options,
    });

    this._options = {
      ...this._options,
      maxFileNameLength: 255,
      enableSensitiveExtensionCheck: true,
      validateFileExtension: true,
      checkUploadPermission: true,
      checkNetworkPermission: true,
      checkStoragePermission: true,
      allowEmptyFiles: false,
      ...options,
    };

    // 如果提供了自定义的敏感文件后缀列表，则覆盖默认列表
    if (options.sensitiveExtensions) {
      this._sensitiveExtensions = options.sensitiveExtensions;
    }

    this._fileContentDetector = new FileContentDetector();
    this._permissionChecker = new PermissionChecker();
  }

  /**
   * 注册事件处理程序
   */
  protected registerEventHandlers(): void {
    if (this._eventBus) {
      // 文件上传前验证
      this._eventBus.on(
        'file:beforeUpload',
        this._validateFileBeforeUpload.bind(this)
      );

      // 分片上传前验证
      this._eventBus.on(
        'chunk:beforeUpload',
        this._validateChunkBeforeUpload.bind(this)
      );
    }
  }

  /**
   * 验证文件上传前
   * @param params 钩子参数
   * @returns 钩子结果
   * @private
   */
  private async _validateFileBeforeUpload(params: any): Promise<HookResult> {
    try {
      const file = params.file;
      if (!file) {
        return {
          handled: false,
          result: params,
          modified: false,
        };
      }

      // 检查文件权限
      if (this._options.checkUploadPermission) {
        const hasPermission =
          await this._permissionChecker.checkPermission('file:upload');
        if (!hasPermission) {
          throw this.createSecurityError(
            'PERMISSION_DENIED',
            '没有足够的权限上传文件',
            { severity: 'error' }
          );
        }
      }

      // 验证文件
      const validationResult = await this.validateFile(file);

      // 如果验证不通过，抛出错误
      if (!validationResult.valid) {
        throw this.createSecurityError(
          'FILE_VALIDATION_FAILED',
          `文件验证失败: ${validationResult.errors.join(', ')}`,
          {
            severity: 'error',
            file: {
              name: file.name,
              size: file.size,
              type: file.type,
            },
          }
        );
      }

      // 记录验证结果
      this._logValidationResult(validationResult, file);

      return {
        handled: false, // 不中断钩子链
        result: params,
        modified: false,
      };
    } catch (error) {
      this.logSecurityEvent('File validation failed', {
        error: error instanceof Error ? error.message : String(error),
        file: params.file
          ? {
              name: params.file.name,
              size: params.file.size,
              type: params.file.type,
            }
          : null,
      });

      return {
        handled: true, // 中断钩子链
        result: error,
        modified: true,
        error: true,
      };
    }
  }

  /**
   * 验证分片上传前
   * @param params 钩子参数
   * @returns 钩子结果
   * @private
   */
  private async _validateChunkBeforeUpload(params: any): Promise<HookResult> {
    try {
      // 检查网络权限
      if (this._options.checkNetworkPermission) {
        const hasPermission =
          await this._permissionChecker.checkPermission('network:upload');
        if (!hasPermission) {
          throw this.createSecurityError(
            'PERMISSION_DENIED',
            '没有足够的网络权限',
            { severity: 'error' }
          );
        }
      }

      return {
        handled: false, // 不中断钩子链
        result: params,
        modified: false,
      };
    } catch (error) {
      this.logSecurityEvent('Chunk validation failed', {
        error: error instanceof Error ? error.message : String(error),
        chunk: params.chunk
          ? {
              index: params.chunk.index,
              size: params.chunk.size,
            }
          : null,
      });

      return {
        handled: true, // 中断钩子链
        result: error,
        modified: true,
        error: true,
      };
    }
  }

  /**
   * 验证文件
   * @param file 文件对象
   * @returns 验证结果
   */
  public async validateFile(
    file: File | Blob
  ): Promise<SecurityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查文件是否为空
    if (file.size === 0 && !this._options.allowEmptyFiles) {
      errors.push('不允许上传空文件');
    }

    // 检查文件大小
    if (this._options.maxFileSize && file.size > this._options.maxFileSize) {
      errors.push(
        `文件大小超过限制: ${file.size} > ${this._options.maxFileSize}`
      );
    }

    // 如果是File对象，进行更多检查
    if ('name' in file) {
      // 检查文件名长度
      if (
        this._options.maxFileNameLength &&
        file.name.length > this._options.maxFileNameLength
      ) {
        errors.push(
          `文件名过长: ${file.name.length} > ${this._options.maxFileNameLength}`
        );
      }

      // 检查敏感文件后缀
      if (this._options.enableSensitiveExtensionCheck) {
        const extension = this._getFileExtension(file.name).toLowerCase();
        if (this._sensitiveExtensions.includes(extension)) {
          errors.push(`不允许上传敏感文件类型: .${extension}`);
        }
      }

      // 验证文件类型与MIME类型是否匹配
      if (this._options.validateFileExtension) {
        const extension = this._getFileExtension(file.name).toLowerCase();
        const expectedTypes = this._getExpectedMimeTypes(extension);

        if (
          expectedTypes.length > 0 &&
          file.type &&
          !expectedTypes.includes(file.type)
        ) {
          warnings.push(
            `文件类型不匹配: 文件扩展名为${extension}，但MIME类型为${file.type}`
          );
        }
      }

      // 基本内容验证
      if (this._options.validateFileContent && file.size > 0) {
        try {
          const contentValidation =
            await this._fileContentDetector.detectFileType(file);
          if (contentValidation.mismatch) {
            errors.push(
              `文件内容与声明的类型不匹配: ${contentValidation.actualType || 'unknown'}`
            );
          }
        } catch (error) {
          warnings.push(
            `文件内容检测失败: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 记录验证结果
   * @param result 验证结果
   * @param file 文件对象
   * @private
   */
  private _logValidationResult(
    result: SecurityValidationResult,
    file: File
  ): void {
    this.logSecurityEvent('File validation result', {
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      securityLevel: this._securityLevel,
    });
  }

  /**
   * 获取文件扩展名
   * @param fileName 文件名
   * @returns 扩展名（不含点）
   * @private
   */
  private _getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
      return '';
    }
    return fileName.slice(lastDotIndex + 1);
  }

  /**
   * 根据扩展名获取期望的MIME类型
   * @param extension 扩展名
   * @returns MIME类型列表
   * @private
   */
  private _getExpectedMimeTypes(extension: string): string[] {
    const extToMime: Record<string, string[]> = {
      // 图片
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      gif: ['image/gif'],
      webp: ['image/webp'],
      svg: ['image/svg+xml'],
      // 文档
      pdf: ['application/pdf'],
      doc: ['application/msword'],
      docx: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      xls: ['application/vnd.ms-excel'],
      xlsx: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      // 音视频
      mp3: ['audio/mpeg'],
      mp4: ['video/mp4'],
      webm: ['video/webm'],
      // 其他常见类型
      txt: ['text/plain'],
      html: ['text/html'],
      css: ['text/css'],
      js: ['text/javascript', 'application/javascript'],
      json: ['application/json'],
      zip: ['application/zip'],
    };

    return extToMime[extension.toLowerCase()] || [];
  }
}
