/**
 * ValidatorPlugin - 文件验证插件
 * 负责基础文件验证、类型检查和大小限制检查
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, UploadErrorType } from '../types';

// 通用文件接口定义
interface IValidatableFile {
  name?: string;
  size?: number;
  type?: string;
  path?: string;
  [key: string]: unknown; // 允许其他属性
}

// 文件验证错误
class ValidationError extends Error {
  constructor(
    public type: UploadErrorType,
    message: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface ValidatorPluginOptions {
  maxFileSize?: number; // 最大文件大小（字节）
  minFileSize?: number; // 最小文件大小（字节）
  allowFileTypes?: string[]; // 允许的文件类型MIME
  allowExtensions?: string[]; // 允许的文件扩展名
  disallowFileTypes?: string[]; // 不允许的文件类型MIME
  disallowExtensions?: string[]; // 不允许的文件扩展名
  validateFileNames?: boolean; // 是否验证文件名
  allowFileNames?: RegExp; // 允许的文件名正则表达式
  onValidationFailed?: (error: ValidationError) => void; // 验证失败回调
}

/**
 * 文件验证插件，验证文件类型和大小
 */
export class ValidatorPlugin implements IPlugin {
  private options: ValidatorPluginOptions;
  private uploader: UploaderCore | null = null;

  /**
   * 创建文件验证插件实例
   * @param options 验证插件选项
   */
  constructor(options: ValidatorPluginOptions = {}) {
    this.options = {
      validateFileNames: false,
      ...options,
    };
  }

  /**
   * 插件安装方法
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this.uploader = uploader;

    // 注册钩子，在上传前验证文件
    uploader.hooks?.beforeUpload?.tapAsync(
      'ValidatorPlugin',
      (file: IValidatableFile, callback: (error?: Error) => void) => {
        try {
          this.validateFile(file);
          callback();
        } catch (error) {
          if (error instanceof ValidationError) {
            this.options.onValidationFailed?.(error);
            callback(error);
          } else {
            callback(error as Error);
          }
        }
      }
    );
  }

  /**
   * 验证文件是否符合要求
   * @param file 待验证文件
   * @throws ValidationError 如果文件不符合要求
   */
  private validateFile(file: IValidatableFile): void {
    // 检查文件大小
    this.validateFileSize(file);

    // 检查文件类型
    this.validateFileType(file);

    // 检查文件名（如果需要）
    if (this.options.validateFileNames) {
      this.validateFileName(file);
    }
  }

  /**
   * 验证文件大小
   * @param file 待验证文件
   * @throws ValidationError 如果文件大小超出限制
   */
  private validateFileSize(file: IValidatableFile): void {
    const fileSize = file.size || 0;

    // 检查最大文件大小限制
    if (this.options.maxFileSize && fileSize > this.options.maxFileSize) {
      throw new ValidationError(
        UploadErrorType.FILE_ERROR,
        `文件大小超出限制，最大允许 ${this.formatSize(this.options.maxFileSize)}`
      );
    }

    // 检查最小文件大小限制
    if (this.options.minFileSize && fileSize < this.options.minFileSize) {
      throw new ValidationError(
        UploadErrorType.FILE_ERROR,
        `文件大小低于要求，最小需要 ${this.formatSize(this.options.minFileSize)}`
      );
    }
  }

  /**
   * 验证文件类型
   * @param file 待验证文件
   * @throws ValidationError 如果文件类型不符合要求
   */
  private validateFileType(file: IValidatableFile): void {
    const fileName = file.name || '';
    const fileType = file.type || this.getTypeFromFileName(fileName);
    const fileExt = this.getExtFromFileName(fileName);

    // 检查文件类型黑名单
    if (
      this.options.disallowFileTypes &&
      this.options.disallowFileTypes.length > 0 &&
      this.options.disallowFileTypes.includes(fileType)
    ) {
      throw new ValidationError(
        UploadErrorType.FILE_ERROR,
        `不允许上传 ${fileType} 类型的文件`
      );
    }

    // 检查文件扩展名黑名单
    if (
      this.options.disallowExtensions &&
      this.options.disallowExtensions.length > 0 &&
      fileExt &&
      this.options.disallowExtensions.includes(fileExt.toLowerCase())
    ) {
      throw new ValidationError(
        UploadErrorType.FILE_ERROR,
        `不允许上传 .${fileExt} 类型的文件`
      );
    }

    // 如果同时设置了白名单，检查文件是否在白名单中
    if (this.options.allowFileTypes && this.options.allowFileTypes.length > 0) {
      const isTypeAllowed = this.options.allowFileTypes.some(allowedType => {
        // 支持通配符匹配，如 image/*
        if (allowedType.endsWith('/*')) {
          const prefix = allowedType.split('/*')[0];
          return fileType.startsWith(prefix + '/');
        }
        return allowedType === fileType;
      });

      if (!isTypeAllowed) {
        throw new ValidationError(
          UploadErrorType.FILE_ERROR,
          `不支持上传 ${fileType} 类型的文件，仅支持 ${this.options.allowFileTypes.join(', ')}`
        );
      }
    }

    // 检查文件扩展名白名单
    if (
      this.options.allowExtensions &&
      this.options.allowExtensions.length > 0 &&
      fileExt
    ) {
      const isExtAllowed = this.options.allowExtensions.includes(
        fileExt.toLowerCase()
      );

      if (!isExtAllowed) {
        throw new ValidationError(
          UploadErrorType.FILE_ERROR,
          `不支持上传 .${fileExt} 类型的文件，仅支持 ${this.options.allowExtensions.map(ext => `.${ext}`).join(', ')}`
        );
      }
    }
  }

  /**
   * 验证文件名
   * @param file 待验证文件
   * @throws ValidationError 如果文件名不符合要求
   */
  private validateFileName(file: IValidatableFile): void {
    const fileName = file.name || '';

    // 检查文件名是否符合规则
    if (
      this.options.allowFileNames &&
      !this.options.allowFileNames.test(fileName)
    ) {
      throw new ValidationError(UploadErrorType.FILE_ERROR, '文件名不符合要求');
    }
  }

  /**
   * 从文件名获取文件类型
   * @param fileName 文件名
   * @returns 文件MIME类型
   */
  private getTypeFromFileName(fileName: string): string {
    const ext = this.getExtFromFileName(fileName);
    if (!ext) return 'application/octet-stream';

    // 文件扩展名到MIME类型的基础映射
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      csv: 'text/csv',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      xml: 'application/xml',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      webm: 'video/webm',
    };

    return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * 从文件名获取扩展名
   * @param fileName 文件名
   * @returns 扩展名
   */
  private getExtFromFileName(fileName: string): string {
    return fileName.split('.').pop() || '';
  }

  /**
   * 格式化文件大小
   * @param bytes 字节大小
   * @returns 格式化后的大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024)
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
}
