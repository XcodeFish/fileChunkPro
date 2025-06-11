/**
 * ValidatorPlugin - 文件验证插件
 * 负责基础文件验证、类型检查和大小限制检查
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, UploadErrorType } from '../types';
import { FileContentDetector } from '../utils/FileContentDetector';

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
  validateChunks?: boolean; // 是否验证分块
  validateFileContent?: boolean; // 是否验证文件内容
  allowEmptyFiles?: boolean; // 是否允许空文件
  autoFixFileNames?: boolean; // 是否自动修复文件名
  extraMimeTypes?: Record<string, string>; // 额外的MIME类型映射
  strictMimeValidation?: boolean; // 是否使用严格MIME类型验证
}

/**
 * 文件验证插件，验证文件类型和大小
 */
export class ValidatorPlugin implements IPlugin {
  private options: ValidatorPluginOptions;
  private uploader: UploaderCore | null = null;
  private fileContentDetector: FileContentDetector;
  private extraMimeTypesMap: Record<string, string> = {};

  // 扩展文件类型映射，包含更多特殊文件类型
  private readonly extendedMimeTypes: Record<string, string> = {
    // 3D模型文件
    stl: 'application/vnd.ms-pki.stl',
    obj: 'model/obj',
    fbx: 'application/octet-stream',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',

    // 设计文件
    psd: 'image/vnd.adobe.photoshop',
    ai: 'application/illustrator',
    sketch: 'application/sketch',
    fig: 'application/figma',
    xd: 'application/adobe.xd',

    // 压缩文件
    '7z': 'application/x-7z-compressed',
    bz2: 'application/x-bzip2',
    gz: 'application/gzip',
    xz: 'application/x-xz',
    zst: 'application/zstd',

    // 科学/分析数据
    dat: 'application/octet-stream',
    hdf5: 'application/x-hdf5',
    netcdf: 'application/x-netcdf',
    mdb: 'application/x-msaccess',
    accdb: 'application/x-msaccess',
    sas: 'application/x-sas',
    spss: 'application/x-spss',
    stata: 'application/x-stata',

    // 字体文件
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',

    // 电子书
    epub: 'application/epub+zip',
    mobi: 'application/x-mobipocket-ebook',
    azw: 'application/vnd.amazon.ebook',
    azw3: 'application/vnd.amazon.ebook',

    // 其他特殊格式
    iso: 'application/x-iso9660-image',
    sql: 'application/sql',
    bak: 'application/octet-stream',
    log: 'text/plain',
  };

  /**
   * 创建文件验证插件实例
   * @param options 验证插件选项
   */
  constructor(options: ValidatorPluginOptions = {}) {
    this.options = {
      validateFileNames: false,
      validateFileContent: false,
      allowEmptyFiles: false,
      autoFixFileNames: false,
      strictMimeValidation: false,
      ...options,
    };

    this.fileContentDetector = new FileContentDetector();

    // 合并额外的MIME类型映射
    this.extraMimeTypesMap = {
      ...this.extendedMimeTypes,
      ...(this.options.extraMimeTypes || {}),
    };
  }

  /**
   * 插件安装方法
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    // 保存上传器实例
    this.uploader = uploader;

    // 注册文件验证钩子
    uploader.hook('validateFile', this.validateFile.bind(this));

    // 注册beforeUpload钩子
    uploader.hook('beforeUpload', this.checkFileBeforeUpload.bind(this));

    // 注册beforeChunk钩子
    if (this.options.validateChunks) {
      uploader.hook('beforeChunk', this.validateChunks.bind(this));
    }
  }

  /**
   * 验证文件是否符合要求
   * @param file 待验证文件
   * @throws ValidationError 如果文件不符合要求
   */
  private async validateFile(file: IValidatableFile): Promise<void> {
    // 检查空文件
    if (file.size === 0 && !this.options.allowEmptyFiles) {
      throw new ValidationError(UploadErrorType.FILE_ERROR, '不允许上传空文件');
    }

    // 检查文件大小
    this.validateFileSize(file);

    // 检查文件类型
    await this.validateFileType(file);

    // 检查文件名（如果需要）
    if (this.options.validateFileNames) {
      this.validateFileName(file);
    }

    // 检查文件内容（如果启用）
    if (this.options.validateFileContent && file instanceof Blob) {
      await this.validateFileContent(file as Blob);
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
  private async validateFileType(file: IValidatableFile): Promise<void> {
    const fileName = file.name || '';
    let fileType = file.type || this.getTypeFromFileName(fileName);
    const fileExt = this.getExtFromFileName(fileName).toLowerCase();

    // 如果启用了严格MIME验证，且文件是Blob类型，尝试通过文件头识别真实MIME类型
    if (
      this.options.strictMimeValidation &&
      file instanceof Blob &&
      this.fileContentDetector
    ) {
      try {
        // 从文件内容检测真实MIME类型
        const detectedType = await this.fileContentDetector.detectMimeType(
          file as Blob
        );
        if (detectedType && detectedType !== 'application/octet-stream') {
          fileType = detectedType;
        }
      } catch (error) {
        console.warn('文件内容类型检测失败:', error);
      }
    }

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
   * 验证文件内容
   * @param file 待验证文件
   * @throws ValidationError 如果文件内容不符合要求
   */
  private async validateFileContent(file: Blob): Promise<void> {
    try {
      // 检查文件是否可能包含恶意内容
      const contentInfo = await this.fileContentDetector.analyzeFile(file);

      // 检查文件内容类型与声明类型是否匹配
      if (
        contentInfo.mimeType &&
        file.type &&
        contentInfo.mimeType !== file.type &&
        contentInfo.mimeType !== 'application/octet-stream'
      ) {
        throw new ValidationError(
          UploadErrorType.FILE_ERROR,
          `文件内容类型(${contentInfo.mimeType})与声明类型(${file.type})不匹配`
        );
      }

      // 检查文件是否可能包含恶意代码
      if (contentInfo.potentiallyMalicious) {
        throw new ValidationError(
          UploadErrorType.SECURITY_ERROR,
          `文件可能包含恶意内容: ${contentInfo.warnings.join(', ')}`
        );
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      // 其他错误视为验证通过，但记录警告
      console.warn('文件内容验证失败:', error);
    }
  }

  /**
   * 验证文件名
   * @param file 待验证文件
   * @throws ValidationError 如果文件名不符合要求
   */
  private validateFileName(file: IValidatableFile): void {
    const fileName = file.name || '';

    // 自动修复文件名
    if (
      this.options.autoFixFileNames &&
      'name' in file &&
      /[<>:"/\\|?*]/.test(fileName)
    ) {
      // 替换不安全字符
      const fixedName = this.sanitizeFileName(fileName);
      file.name = fixedName;
    }
    // 检查文件名是否符合规则
    else if (
      this.options.allowFileNames &&
      !this.options.allowFileNames.test(fileName)
    ) {
      throw new ValidationError(UploadErrorType.FILE_ERROR, '文件名不符合要求');
    }

    // 检查文件名长度
    if (fileName.length > 255) {
      throw new ValidationError(
        UploadErrorType.FILE_ERROR,
        '文件名长度超过最大限制(255个字符)'
      );
    }

    // 检查文件名特殊字符
    if (/[<>:"/\\|?*]/.test(fileName) && !this.options.autoFixFileNames) {
      throw new ValidationError(
        UploadErrorType.FILE_ERROR,
        '文件名包含非法字符 (< > : " / \\ | ? *)'
      );
    }
  }

  /**
   * 净化文件名，去除或替换不安全字符
   * @param fileName 原始文件名
   * @returns 处理后的安全文件名
   */
  private sanitizeFileName(fileName: string): string {
    // 保留文件扩展名
    const lastDotIndex = fileName.lastIndexOf('.');
    let extension = '';
    let baseName = fileName;

    if (lastDotIndex > 0) {
      extension = fileName.substring(lastDotIndex);
      baseName = fileName.substring(0, lastDotIndex);
    }

    // 替换特殊字符
    const safeBaseName = baseName
      .replace(/[<>:"/\\|?*]/g, '_') // 替换不安全字符为下划线
      .replace(/\s+/g, ' ') // 合并多个空格为一个
      .trim();

    return safeBaseName + extension;
  }

  /**
   * 从文件名获取文件类型
   * @param fileName 文件名
   * @returns 文件MIME类型
   */
  private getTypeFromFileName(fileName: string): string {
    const ext = this.getExtFromFileName(fileName).toLowerCase();
    if (!ext) return 'application/octet-stream';

    // 先检查扩展的MIME类型映射
    if (this.extraMimeTypesMap[ext]) {
      return this.extraMimeTypesMap[ext];
    }

    // 文件扩展名到MIME类型的基础映射
    const mimeMap: Record<string, string> = {
      // 图片
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      tif: 'image/tiff',
      tiff: 'image/tiff',

      // 文档
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      rtf: 'application/rtf',
      odt: 'application/vnd.oasis.opendocument.text',
      ods: 'application/vnd.oasis.opendocument.spreadsheet',
      odp: 'application/vnd.oasis.opendocument.presentation',

      // 文本
      txt: 'text/plain',
      csv: 'text/csv',
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      md: 'text/markdown',

      // 编程
      js: 'application/javascript',
      ts: 'application/typescript',
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/yaml',
      yml: 'application/yaml',

      // 压缩
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      tar: 'application/x-tar',
      gz: 'application/gzip',

      // 音频
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      aac: 'audio/aac',
      m4a: 'audio/mp4',

      // 视频
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      wmv: 'video/x-ms-wmv',
      flv: 'video/x-flv',
      m4v: 'video/mp4',
    };

    return mimeMap[ext] || 'application/octet-stream';
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

  /**
   * 上传前检查文件
   * @param file 文件对象
   */
  private async checkFileBeforeUpload(
    file: IValidatableFile
  ): Promise<IValidatableFile> {
    try {
      await this.validateFile(file);
      return file;
    } catch (error) {
      if (error instanceof ValidationError) {
        this.options.onValidationFailed?.(error);
      }
      throw error;
    }
  }

  /**
   * 验证分片
   * @param chunks 分片数组
   */
  private async validateChunks(chunks: any[]): Promise<any[]> {
    // 这里可以添加分片验证逻辑
    // 例如检查分片数量、大小等
    if (!chunks || chunks.length === 0) {
      throw new ValidationError(
        UploadErrorType.VALIDATION_ERROR,
        '无效的分片数据'
      );
    }

    // 验证每个分片
    chunks.forEach((chunk, index) => {
      if (!chunk || chunk.size <= 0) {
        throw new ValidationError(
          UploadErrorType.VALIDATION_ERROR,
          `分片 ${index} 无效`
        );
      }
    });

    return chunks;
  }
}
