/**
 * UploaderCore - 核心上传模块
 * 实现文件分片处理、上传流程控制等基础功能
 */

import {
  UploaderOptions,
  Environment,
  UploadResult,
  ChunkInfo,
  UploadErrorType,
} from '../types';
import EnvUtils from '../utils/EnvUtils';
import MemoryManager from '../utils/MemoryManager';

import ErrorCenter, { UploadError } from './ErrorCenter';
import EventBus from './EventBus';
import PluginManager from './PluginManager';
import TaskScheduler from './TaskScheduler';

// 文件类型统一接口
interface AnyFile {
  name: string;
  size: number;
  type?: string;
  [key: string]: any;
}

export class UploaderCore {
  private options: UploaderOptions;
  private events: EventBus = new EventBus();
  private errorCenter: ErrorCenter = new ErrorCenter();
  private pluginManager: PluginManager = new PluginManager();
  private scheduler: TaskScheduler;
  private environment: Environment;
  private isCancelled = false;
  private currentFileId: string | null = null;
  private memoryWatcher: NodeJS.Timeout | null = null;

  /**
   * 创建UploaderCore实例
   * @param options 上传选项
   */
  constructor(options: UploaderOptions) {
    // 检查必要参数
    if (!options.endpoint) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '必须提供上传端点(endpoint)'
      );
    }

    this.options = {
      ...options,
      concurrency: options.concurrency || EnvUtils.getRecommendedConcurrency(),
      timeout: options.timeout || 30000,
      retryCount: options.retryCount || 3,
      retryDelay: options.retryDelay || 1000,
      chunkSize: options.chunkSize || 'auto',
      headers: options.headers || {},
      useWorker: options.useWorker !== false && EnvUtils.isWorkerSupported(),
    };

    // 初始化任务调度器
    this.scheduler = new TaskScheduler({
      maxConcurrent: this.options.concurrency as number,
      retryCount: this.options.retryCount as number,
      retryDelay: this.options.retryDelay as number,
      timeout: this.options.timeout as number,
    });

    // 设置调度器进度回调
    this.scheduler.onProgress(progress => {
      this.emitProgress(progress);
    });

    // 检测环境
    this.environment = EnvUtils.detectEnvironment();

    // 设置内存监控
    if (options.enableMemoryMonitoring !== false) {
      this.setupMemoryMonitoring();
    }
  }

  /**
   * 注册插件
   * @param name 插件名称
   * @param plugin 插件实例
   */
  public registerPlugin(name: string, plugin: any): this {
    this.pluginManager.registerPlugin(name, plugin);
    plugin.install?.(this);
    return this;
  }

  /**
   * 注册事件监听器
   * @param event 事件名称
   * @param handler 处理函数
   */
  public on(event: string, handler: (...args: any[]) => void): this {
    this.events.on(event, handler);
    return this;
  }

  /**
   * 取消事件监听
   * @param event 事件名称
   * @param handler 处理函数
   */
  public off(event: string, handler?: (...args: any[]) => void): this {
    this.events.off(event, handler);
    return this;
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 事件参数
   */
  public emit(event: string, ...args: any[]): void {
    this.events.emit(event, ...args);
  }

  /**
   * 上传文件
   * @param file 待上传的文件
   * @returns 上传结果
   */
  public async upload(file: AnyFile): Promise<UploadResult> {
    // 重置取消状态
    this.isCancelled = false;

    try {
      // 验证文件
      this.validateFile(file);

      // 执行前置钩子
      await this.runPluginHook('beforeUpload', { file });

      // 生成文件唯一ID
      this.currentFileId = await this.generateFileId(file);

      // 创建文件分片
      const chunks = await this.createChunks(file);

      // 初始化上传（可能包含与服务器的交互）
      await this.initializeUpload(file, this.currentFileId, chunks.length);

      // 添加所有分片上传任务
      chunks.forEach((chunk, index) => {
        this.scheduler.addTask(async () => {
          if (this.isCancelled) {
            throw new Error('上传已取消');
          }

          await this.uploadChunk(chunk, index, this.currentFileId!);

          // 调用分片上传成功钩子
          await this.runPluginHook('chunkUploaded', {
            chunkIndex: index,
            chunkCount: chunks.length,
            fileId: this.currentFileId,
          });
        }, index);
      });

      // 执行所有任务
      await this.scheduler.run();

      // 如果上传被取消，则抛出错误
      if (this.isCancelled) {
        throw new UploadError(
          UploadErrorType.UNKNOWN_ERROR,
          '上传已被用户取消'
        );
      }

      // 合并分片
      const result = await this.mergeChunks(
        this.currentFileId,
        file.name,
        chunks.length
      );

      // 执行后置钩子
      await this.runPluginHook('afterUpload', {
        result,
        fileId: this.currentFileId,
      });

      // 发送完成事件
      this.emit('complete', result);

      return result;
    } catch (error) {
      const uploadError = this.errorCenter.handle(error);

      // 如果不是因取消造成的错误，才发送错误事件
      if (!this.isCancelled) {
        this.emit('error', uploadError);
      }

      throw uploadError;
    } finally {
      // 清理资源
      this.cleanup();
    }
  }

  /**
   * 取消上传
   */
  public cancel(): void {
    this.isCancelled = true;
    this.scheduler.clear();
    this.emit('cancel');
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.scheduler.clear();
    this.events.removeAllListeners();

    if (this.memoryWatcher) {
      clearInterval(this.memoryWatcher);
      this.memoryWatcher = null;
    }

    this.currentFileId = null;
  }

  /**
   * 获取插件
   * @param name 插件名称
   */
  public getPlugin(name: string): any {
    return this.pluginManager.getPlugin(name);
  }

  /**
   * 验证文件
   * @param file 文件对象
   * @throws 如果文件不符合要求则抛出错误
   */
  private validateFile(file: AnyFile): void {
    // 检查文件大小是否在限制范围内
    if (this.options.maxFileSize && file.size > this.options.maxFileSize) {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        `文件大小超过限制: ${file.size} > ${this.options.maxFileSize}`
      );
    }

    // 检查文件类型是否在允许列表中
    if (this.options.allowFileTypes && this.options.allowFileTypes.length > 0) {
      // 获取文件类型
      const fileType = file.type || this.getFileTypeFromName(file.name);

      if (
        !this.options.allowFileTypes.some(allowedType => {
          // 支持通配符匹配，如 'image/*'
          if (allowedType.endsWith('/*')) {
            const prefix = allowedType.substr(0, allowedType.indexOf('/*'));
            return fileType.startsWith(prefix);
          }
          return fileType === allowedType;
        })
      ) {
        throw new UploadError(
          UploadErrorType.FILE_ERROR,
          `不支持的文件类型: ${fileType}`
        );
      }
    }
  }

  /**
   * 从文件名推断文件类型
   * @param fileName 文件名
   * @returns MIME类型字符串
   */
  private getFileTypeFromName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    // 简单的类型映射
    const mimeMap: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
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
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      wav: 'audio/wav',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * 设置内存监控
   */
  private setupMemoryMonitoring(): void {
    // 仅在浏览器环境启用
    if (this.environment === Environment.Browser) {
      this.memoryWatcher = setInterval(() => {
        if (MemoryManager.needsMemoryCleanup()) {
          this.emit('memoryWarning', {
            message: '内存使用率较高，建议及时释放不必要的资源',
          });
        }
      }, 10000);
    }
  }

  /**
   * 创建文件分片
   * @param file 文件对象
   * @returns 分片数组
   */
  private async createChunks(file: AnyFile): Promise<ChunkInfo[]> {
    // 确定分片大小
    const chunkSize = MemoryManager.getOptimalChunkSize(
      file.size,
      this.options.chunkSize || 'auto'
    );

    // 计算分片数量
    const chunkCount = Math.ceil(file.size / chunkSize);
    const chunks: ChunkInfo[] = [];

    // 创建分片信息
    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(file.size, start + chunkSize);

      chunks.push({
        index: i,
        start,
        end,
        size: end - start,
        fileSize: file.size,
      });
    }

    return chunks;
  }

  /**
   * 上传单个分片
   * @param chunk 分片信息
   * @param index 分片索引
   * @param fileId 文件ID
   */
  private async uploadChunk(
    _chunk: ChunkInfo,
    _index: number,
    _fileId: string
  ): Promise<void> {
    // 这里实现具体的分片上传逻辑
    // 实际实现会涉及到适配器的使用，这里简化处理

    // 等待片刻模拟上传
    await new Promise(resolve => setTimeout(resolve, 50));

    // 如果已取消，则终止上传
    if (this.isCancelled) {
      throw new Error('上传已取消');
    }
  }

  /**
   * 生成文件唯一ID
   * @param file 文件对象
   * @returns 文件ID
   */
  private async generateFileId(_file: AnyFile): Promise<string> {
    // 简单实现，实际项目中可能需要更复杂的逻辑
    return `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 初始化上传
   * @param file 文件对象
   * @param fileId 文件ID
   * @param chunkCount 分片数
   */
  private async initializeUpload(
    file: AnyFile,
    fileId: string,
    chunkCount: number
  ): Promise<void> {
    // 实现上传初始化逻辑，例如向服务器请求上传会话
    // 这里简化处理
    this.emit('start', {
      fileId,
      fileName: file.name,
      fileSize: file.size,
      chunkCount,
    });
  }

  /**
   * 合并分片
   * @param fileId 文件ID
   * @param fileName 文件名
   * @param chunkCount 分片数
   * @returns 上传结果
   */
  private async mergeChunks(
    fileId: string,
    fileName: string,
    _chunkCount: number
  ): Promise<UploadResult> {
    // 实现分片合并逻辑，例如通知服务器进行合并
    // 这里简化处理，返回模拟结果
    return {
      success: true,
      fileId,
      fileName,
      url: `https://example.com/files/${fileId}/${fileName}`,
    };
  }

  /**
   * 运行插件钩子
   * @param hookName 钩子名称
   * @param args 钩子参数
   * @returns 钩子返回值
   */
  private async runPluginHook(hookName: string, args: any): Promise<any> {
    try {
      return await this.pluginManager.runHook(hookName, args);
    } catch (error) {
      throw this.errorCenter.handle(error);
    }
  }

  /**
   * 触发进度事件
   * @param progress 进度值(0-100)
   */
  private emitProgress(progress: number): void {
    if (this.isCancelled) return;
    this.emit('progress', progress);
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.currentFileId = null;
  }
}

export default UploaderCore;
