/**
 * FileManager - 文件管理模块
 * 负责文件处理、分片创建等文件相关操作
 */

import {
  FileInfo,
  ChunkInfo,
  UploadErrorType,
  FileMetadata,
  FileValidationResult,
} from '../types';
import { UploadError } from './error';
import MemoryManager from '../utils/MemoryManager';
import { EventBus } from './EventBus';
import { DependencyContainer } from './DependencyContainer';

/**
 * 文件管理器接口
 */
export interface IFileManager {
  /**
   * 验证文件是否符合要求
   * @param file 需要验证的文件
   * @returns 验证结果
   */
  validateFile(file: File | Blob): Promise<FileValidationResult>;

  /**
   * 准备文件，包括验证、生成元数据等
   * @param file 需要准备的文件
   * @returns 文件信息和元数据
   */
  prepareFile(
    file: File | Blob
  ): Promise<{ info: FileInfo; metadata: FileMetadata }>;

  /**
   * 创建文件分片
   * @param file 需要分片的文件
   * @param chunkSize 分片大小
   * @returns 分片信息列表
   */
  createChunks(file: File | Blob, chunkSize: number): Promise<ChunkInfo[]>;

  /**
   * 获取最佳分片大小
   * @param fileSize 文件大小
   * @returns 推荐的分片大小
   */
  getOptimalChunkSize(fileSize: number): Promise<number>;

  /**
   * 生成文件唯一标识符
   * @param file 文件对象
   * @returns 文件标识符
   */
  generateFileId(file: File | Blob): Promise<string>;

  /**
   * 获取文件类型
   * @param file 文件对象
   * @returns 文件MIME类型
   */
  getFileType(file: File | Blob): string;

  /**
   * 清理文件资源
   * @param fileId 文件标识符
   */
  cleanup(fileId: string): void;

  /**
   * 释放指定文件的分片内存
   * @param fileId 文件标识符
   */
  releaseFileChunks(fileId: string): void;

  /**
   * 销毁管理器，释放所有资源
   */
  dispose(): void;
}

/**
 * 文件管理器实现
 */
export class FileManager implements IFileManager {
  private eventBus: EventBus;
  private options: {
    maxFileSize: number;
    allowedFileTypes?: string[];
    disallowedFileTypes?: string[];
    minChunkSize: number;
    maxChunkSize: number;
  };

  // 保存文件分片引用的映射表，用于显式释放内存
  private fileChunksMap: Map<string, Array<ChunkInfo>> = new Map();

  /**
   * 创建文件管理器实例
   * @param container 依赖容器
   * @param options 配置选项
   */
  constructor(
    private container: DependencyContainer,
    options: {
      maxFileSize?: number;
      allowedFileTypes?: string[];
      disallowedFileTypes?: string[];
      minChunkSize?: number;
      maxChunkSize?: number;
    } = {}
  ) {
    this.eventBus = container.resolve<EventBus>('eventBus');
    this.options = {
      maxFileSize: options.maxFileSize || 1024 * 1024 * 1024, // 默认1GB
      allowedFileTypes: options.allowedFileTypes,
      disallowedFileTypes: options.disallowedFileTypes,
      minChunkSize: options.minChunkSize || 512 * 1024, // 默认最小512KB
      maxChunkSize: options.maxChunkSize || 50 * 1024 * 1024, // 默认最大50MB
    };
  }

  /**
   * 验证文件是否符合要求
   * @param file 需要验证的文件
   * @returns 验证结果
   */
  public async validateFile(file: File | Blob): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // 验证文件大小
    if (file.size > this.options.maxFileSize) {
      result.valid = false;
      result.errors.push(
        `文件大小超过限制: ${file.size} > ${this.options.maxFileSize}`
      );
    }

    // 验证文件类型（如果设置了类型限制）
    if (this.options.allowedFileTypes?.length) {
      const fileType = this.getFileType(file);
      const fileExt = this.getFileExtension(file);

      const isTypeAllowed = this.options.allowedFileTypes.some(
        type =>
          type === '*' ||
          type === fileType ||
          type === fileExt ||
          type === `*.${fileExt}`
      );

      if (!isTypeAllowed) {
        result.valid = false;
        result.errors.push(`不支持的文件类型: ${fileType}`);
      }
    }

    // 验证不允许的文件类型
    if (this.options.disallowedFileTypes?.length) {
      const fileType = this.getFileType(file);
      const fileExt = this.getFileExtension(file);

      const isTypeDisallowed = this.options.disallowedFileTypes.some(
        type => type === fileType || type === fileExt || type === `*.${fileExt}`
      );

      if (isTypeDisallowed) {
        result.valid = false;
        result.errors.push(`文件类型不被允许: ${fileType}`);
      }
    }

    // 运行插件钩子进行额外验证
    const hookResult = await this.container
      .resolve('pluginManager')
      .applyHook('validateFile', {
        file,
        result,
      });

    // 合并插件验证结果
    if (hookResult.result && typeof hookResult.result === 'object') {
      if (hookResult.result.errors?.length) {
        result.valid = false;
        result.errors = [...result.errors, ...hookResult.result.errors];
      }

      if (hookResult.result.warnings?.length) {
        result.warnings = [...result.warnings, ...hookResult.result.warnings];
      }
    }

    return result;
  }

  /**
   * 获取文件类型
   * @param file 文件对象
   * @returns 文件类型
   */
  public getFileType(file: File | Blob): string {
    if ('type' in file && file.type) {
      return file.type;
    }

    // 尝试从文件名获取类型
    if ('name' in file) {
      return this.getFileTypeFromName(file.name);
    }

    return 'application/octet-stream';
  }

  /**
   * 从文件名中获取MIME类型
   * @param fileName 文件名
   * @returns MIME类型字符串
   */
  private getFileTypeFromName(fileName: string): string {
    const extension = this.getFileExtensionFromName(fileName).toLowerCase();

    // 常见文件类型映射
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'text/javascript',
      json: 'application/json',
      xml: 'application/xml',
      zip: 'application/zip',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * 获取文件扩展名
   * @param file 文件对象
   * @returns 文件扩展名(不含点)
   */
  private getFileExtension(file: File | Blob): string {
    if ('name' in file) {
      return this.getFileExtensionFromName(file.name);
    }
    return '';
  }

  /**
   * 从文件名中获取扩展名
   * @param fileName 文件名
   * @returns 扩展名(不含点)
   */
  private getFileExtensionFromName(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  /**
   * 准备文件，包括验证、生成元数据等
   * @param file 需要准备的文件
   * @returns 文件信息和元数据
   */
  public async prepareFile(
    file: File | Blob
  ): Promise<{ info: FileInfo; metadata: FileMetadata }> {
    // 验证文件
    const validationResult = await this.validateFile(file);

    if (!validationResult.valid) {
      throw new UploadError(
        UploadErrorType.FILE_VALIDATION_ERROR,
        `文件验证失败: ${validationResult.errors.join(', ')}`
      );
    }

    // 生成文件ID
    const fileId = await this.generateFileId(file);

    // 创建文件信息
    const info: FileInfo = {
      name: 'name' in file ? file.name : `file-${fileId}`,
      size: file.size,
      type: this.getFileType(file),
      uid: fileId,
      lastModified: 'lastModified' in file ? file.lastModified : Date.now(),
    };

    // 创建文件元数据
    const metadata: FileMetadata = {
      fileId,
      created: Date.now(),
      extension: this.getFileExtension(file),
      warnings: validationResult.warnings,
    };

    // 发出文件准备完成事件
    this.eventBus.emit('file:prepared', { info, metadata });

    return { info, metadata };
  }

  /**
   * 创建文件分片
   * @param file 需要分片的文件
   * @param chunkSize 分片大小
   * @returns 分片信息列表
   */
  public async createChunks(
    file: File | Blob,
    chunkSize: number
  ): Promise<ChunkInfo[]> {
    // 验证并调整分片大小
    const validChunkSize = this.validateChunkSize(chunkSize, file.size);

    // 创建分片
    const chunks: ChunkInfo[] = [];
    const totalChunks = Math.ceil(file.size / validChunkSize);

    // 发送分片创建开始事件
    this.eventBus.emit('chunkingStart', {
      file,
      chunkSize: validChunkSize,
      totalChunks,
    });

    // 当前内存占用可能较大的操作，需谨慎处理
    const memory = await MemoryManager.getMemoryInfo();
    const criticalMemory = memory.usagePercent > 0.85;

    if (criticalMemory) {
      // 内存紧张时，采用连续分片策略以降低内存占用
      this.eventBus.emit('memoryWarning', {
        type: 'chunking',
        memoryInfo: memory,
      });
    }

    // 生成文件ID用于存储分片映射
    const fileId = await this.generateFileId(file);

    // 创建所有分片信息
    for (let i = 0; i < totalChunks; i++) {
      const start = i * validChunkSize;
      const end = Math.min(start + validChunkSize, file.size);
      const chunk = file.slice(start, end);

      chunks.push({
        index: i,
        start,
        end,
        size: end - start,
        blob: chunk,
        uploaded: false,
        retries: 0,
        status: 'pending',
      });
    }

    // 存储分片映射表，用于后续释放内存
    this.fileChunksMap.set(fileId, [...chunks]);

    // 发送分片创建完成事件
    this.eventBus.emit('chunkingComplete', {
      file,
      chunks,
      totalChunks,
    });

    return chunks;
  }

  /**
   * 验证并调整分片大小
   * @param requestedSize 请求的分片大小
   * @param fileSize 文件总大小
   * @returns 有效的分片大小
   */
  private validateChunkSize(requestedSize: number, fileSize: number): number {
    // 分片大小不能小于最小值
    if (requestedSize < this.options.minChunkSize) {
      return this.options.minChunkSize;
    }

    // 分片大小不能大于最大值
    if (requestedSize > this.options.maxChunkSize) {
      return this.options.maxChunkSize;
    }

    // 对于小文件，分片大小不应过大
    if (fileSize < requestedSize * 2) {
      return Math.max(this.options.minChunkSize, Math.ceil(fileSize / 2));
    }

    return requestedSize;
  }

  /**
   * 获取最佳分片大小
   * @param fileSize 文件大小
   * @returns 推荐的分片大小
   */
  public async getOptimalChunkSize(fileSize: number): Promise<number> {
    // 基础分片大小计算逻辑
    let optimalSize: number;

    // 根据文件大小动态调整
    if (fileSize <= 5 * 1024 * 1024) {
      // 5MB以下
      optimalSize = 1024 * 1024; // 1MB
    } else if (fileSize <= 100 * 1024 * 1024) {
      // 5MB-100MB
      optimalSize = 2 * 1024 * 1024; // 2MB
    } else if (fileSize <= 1024 * 1024 * 1024) {
      // 100MB-1GB
      optimalSize = 5 * 1024 * 1024; // 5MB
    } else {
      // 大于1GB
      optimalSize = 10 * 1024 * 1024; // 10MB
    }

    // 根据内存情况调整
    if (MemoryManager.isAvailable() && MemoryManager.isLowMemory()) {
      // 内存不足时减小分片大小以减轻内存压力
      optimalSize = Math.max(this.options.minChunkSize, optimalSize / 2);
    }

    // 应用钩子，允许插件调整分片大小
    const hookResult = await this.container
      .resolve('pluginManager')
      .applyHook('optimizeChunkSize', {
        fileSize,
        suggestedSize: optimalSize,
        memoryStatus: MemoryManager.isAvailable()
          ? MemoryManager.getMemoryStats()
          : null,
      });

    // 使用钩子返回的大小，如果有的话
    if (
      hookResult.result?.optimizedSize &&
      typeof hookResult.result.optimizedSize === 'number'
    ) {
      optimalSize = hookResult.result.optimizedSize;
    }

    // 确保分片大小在有效范围内
    return this.validateChunkSize(optimalSize, fileSize);
  }

  /**
   * 生成文件唯一标识符
   * @param file 文件对象
   * @returns 文件标识符
   */
  public async generateFileId(file: File | Blob): Promise<string> {
    // 首先尝试通过插件获取文件ID
    const hookResult = await this.container
      .resolve('pluginManager')
      .applyHook('generateFileId', { file });

    if (
      hookResult.result?.fileId &&
      typeof hookResult.result.fileId === 'string'
    ) {
      return hookResult.result.fileId;
    }

    // 插件未提供ID时，使用默认逻辑
    const info = {
      size: file.size,
      type: this.getFileType(file),
      name: 'name' in file ? file.name : '',
      lastModified: 'lastModified' in file ? file.lastModified : Date.now(),
    };

    // 简单实现，生产环境应使用更可靠的唯一标识生成方法
    const idString = `${info.name}-${info.size}-${info.lastModified}-${Math.random().toString(36).substring(2, 15)}`;
    return btoa(encodeURIComponent(idString))
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 32);
  }

  /**
   * 释放指定文件的分片内存
   * @param fileId 文件标识符
   */
  public releaseFileChunks(fileId: string): void {
    if (this.fileChunksMap.has(fileId)) {
      const chunks = this.fileChunksMap.get(fileId);

      // 清除每个分片的引用
      if (chunks) {
        for (const chunk of chunks) {
          // 显式清除blob引用
          if (chunk.blob) {
            // 将blob设置为null帮助垃圾回收
            (chunk as any).blob = null;
          }
        }
      }

      // 从映射表中移除
      this.fileChunksMap.delete(fileId);

      this.eventBus.emit('chunksReleased', {
        fileId,
        chunksCount: chunks?.length || 0,
      });
    }
  }

  /**
   * 清理文件资源
   * @param fileId 文件标识符
   */
  public cleanup(fileId: string): void {
    // 释放分片内存
    this.releaseFileChunks(fileId);

    // 触发清理事件
    this.eventBus.emit('fileCleanup', { fileId });
  }

  /**
   * 销毁管理器，释放所有资源
   */
  public dispose(): void {
    // 释放所有文件的分片内存
    for (const fileId of this.fileChunksMap.keys()) {
      this.releaseFileChunks(fileId);
    }

    // 清空映射表
    this.fileChunksMap.clear();

    // 触发销毁事件
    this.eventBus.emit('fileManagerDispose');
  }
}

// 导出实例
export default FileManager;
