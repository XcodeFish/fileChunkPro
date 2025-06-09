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
  ErrorGroup,
  ErrorSeverity,
  FileValidationResult,
  HookResult,
  SecurityLevel,
  UploadErrorType,
} from '../../types';
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
      ...options,
    };
  }

  /**
   * 安装插件
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this._uploader = uploader;
    this._eventBus = uploader.getEventBus();
    const pluginManager = uploader.getPluginManager();

    // 注册钩子
    pluginManager.registerHook(
      'beforeFileUpload',
      this._validateFile.bind(this),
      { plugin: this.name, priority: 9 }
    );

    // 注册事件处理
    if (this._eventBus) {
      this._eventBus.on('fileUpload:start', this._onFileUploadStart.bind(this));
      this._eventBus.on('fileUpload:error', this._onFileUploadError.bind(this));
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
    }

    if (this._uploader) {
      const pluginManager = this._uploader.getPluginManager();
      pluginManager.removePluginHooks(this.name);
    }
  }

  /**
   * 验证文件
   * @param param0 包含文件对象的参数
   * @returns 钩子结果
   */
  private async _validateFile({ file }: { file: File }): Promise<HookResult> {
    const config = this._uploader?.getConfig() || {};
    const result: FileValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // 1. 检查文件大小
    const maxSize = this._options.maxFileSize || config.maxFileSize;
    if (maxSize && file.size > maxSize) {
      result.valid = false;
      result.errors.push('文件大小超过限制');
      this._logSecurityIssue('文件大小超过限制', 'size_limit', file);
    }

    // 2. 检查文件类型
    const allowedTypes =
      this._options.allowedMimeTypes || config.allowFileTypes;
    if (allowedTypes && allowedTypes.length > 0) {
      const isAllowed = this._checkFileType(file.type, allowedTypes);
      if (!isAllowed) {
        result.valid = false;
        result.errors.push('文件类型不允许');
        this._logSecurityIssue('文件类型不允许', 'type_not_allowed', file);
      }
    }

    // 3. 检查文件名长度
    if (
      this._options.maxFileNameLength &&
      file.name.length > this._options.maxFileNameLength
    ) {
      result.valid = false;
      result.errors.push('文件名长度超过限制');
      this._logSecurityIssue('文件名长度超过限制', 'name_too_long', file);
    }

    // 4. 检查敏感文件后缀
    if (this._options.enableSensitiveExtensionCheck) {
      const extension = this._getFileExtension(file.name).toLowerCase();
      if (BasicSecurityPlugin.SENSITIVE_EXTENSIONS.includes(extension)) {
        result.valid = false;
        result.errors.push('文件类型可能存在安全风险');
        this._logSecurityIssue(
          '检测到敏感文件类型',
          'sensitive_extension',
          file
        );
      }
    }

    // 5. 验证文件后缀与MIME类型是否匹配
    if (this._options.validateFileExtension) {
      const isValidExtension = this._validateFileExtensionWithMime(file);
      if (!isValidExtension) {
        result.valid = false;
        result.errors.push('文件后缀与实际类型不匹配');
        this._logSecurityIssue(
          '文件后缀与MIME类型不匹配',
          'extension_mismatch',
          file
        );
      }
    }

    // 6. 检查上传权限（如果启用）
    if (this._options.checkUploadPermission) {
      try {
        const hasPermission = await this._checkUploadPermission();
        if (!hasPermission) {
          result.valid = false;
          result.errors.push('没有上传权限');
          this._logSecurityIssue('没有上传权限', 'no_permission', file);
        }
      } catch (error) {
        result.warnings.push('权限检查失败');
      }
    }

    return {
      handled: true,
      result,
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
    const errorType = (error as any).type || 'UNKNOWN_ERROR';

    if (errorType === UploadErrorType.SECURITY_ERROR) {
      this._logSecurityIssue(
        '上传安全错误',
        'upload_security_error',
        file,
        error
      );
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
   * 检查是否有上传权限
   * 可以扩展实现更复杂的权限检查逻辑
   * @returns 是否有权限
   */
  private async _checkUploadPermission(): Promise<boolean> {
    // 基础版本仅做简单检查，可以在继承类中扩展
    // 例如检查是否登录、是否有写入权限等

    // 检查是否在浏览器环境下
    if (typeof window === 'undefined') {
      return true; // 非浏览器环境默认有权限
    }

    // 简单检查是否有存储访问权限
    try {
      // 尝试写入并读取一个测试值到localStorage
      const testKey = '_upload_permission_test';
      localStorage.setItem(testKey, 'test');
      const value = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      return value === 'test';
    } catch (e) {
      // 如果出现异常（例如隐私模式下），返回无权限
      return false;
    }
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
    code: string,
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
}

export default BasicSecurityPlugin;
