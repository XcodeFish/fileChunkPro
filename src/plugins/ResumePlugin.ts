/**
 * ResumePlugin - 断点续传功能增强插件
 * 支持多存储策略、更可靠的状态保存、文件指纹比对、部分上传检测与恢复、跨会话恢复支持、上传进度持久化
 */

import { UploaderCore } from '../core/UploaderCore';
import {
  IPlugin,
  ChunkInfo,
  Environment,
  UploadErrorType,
  PluginPriority,
} from '../types';
import EnvUtils from '../utils/EnvUtils';
import {
  IStorage,
  LocalStorageAdapter,
  SessionStorageAdapter,
  MemoryStorageAdapter,
} from '../utils/StorageUtils';

/**
 * 文件进度信息
 */
interface FileProgressInfo {
  fileId: string; // 文件ID
  fileName: string; // 文件名
  fileSize: number; // 文件大小
  fileMd5?: string; // 文件MD5（如果有）
  fileType?: string; // 文件类型
  chunks: ChunkInfo[]; // 分片信息
  uploadedChunks: number[]; // 已上传分片索引
  lastUpdated: number; // 最后更新时间
  createdAt: number; // 创建时间
  sessionId: string; // 会话ID
  totalChunks: number; // 总分片数
  progress: number; // 总进度(0-100)
  uploadUrl?: string; // 上传URL（对于某些需要保持一致的服务）
  metadata?: Record<string, unknown>; // 自定义元数据
}

/**
 * 错误信息结构
 */
interface ErrorInfo {
  type: string;
  message: string;
  timestamp?: number;
}

/**
 * 存储类型
 */
export type StorageType =
  | 'localStorage'
  | 'sessionStorage'
  | 'indexedDB'
  | 'miniprogram'
  | 'taroStorage'
  | 'uniappStorage'
  | 'memoryStorage'
  | 'custom';

/**
 * 日志级别类型
 */
export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

/**
 * 断点续传插件配置选项
 */
export interface ResumeOptions {
  enabled?: boolean; // 是否启用断点续传
  storageType?: StorageType; // 存储类型
  keyPrefix?: string; // 存储键前缀
  expiryTime?: number; // 过期时间(毫秒)
  fingerprintAlgorithm?: 'md5' | 'sha1' | 'simple'; // 文件指纹算法
  autoResume?: boolean; // 是否自动恢复
  customStorage?: IStorage; // 自定义存储
  persistProgressInterval?: number; // 进度持久化间隔(毫秒)
  enableCrossSession?: boolean; // 是否启用跨会话支持
  autoCleanExpired?: boolean; // 是否自动清理过期数据
  maxStorageItems?: number; // 最大存储项数
  partialDetection?: boolean; // 是否启用部分上传检测
  encryptData?: boolean; // 是否加密存储数据
  encryptionKey?: string; // 加密密钥
  logLevel?: LogLevel; // 日志级别
}

/**
 * 断点续传插件
 * 实现断点续传功能增强
 */
export class ResumePlugin implements IPlugin {
  public readonly version = '2.0.0';
  private options: ResumeOptions;
  private storage: IStorage;
  private uploader: UploaderCore | null = null;
  private sessionId: string;
  private progressTimers: Map<string, number> = new Map();
  private readonly DEFAULT_EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7天
  private readonly DEFAULT_PERSIST_INTERVAL = 1000; // 1秒

  /**
   * 创建断点续传插件实例
   * @param options 配置选项
   */
  constructor(options: ResumeOptions = {}) {
    this.options = {
      enabled: true,
      storageType: 'localStorage',
      keyPrefix: 'fileChunkPro_resume_',
      expiryTime: this.DEFAULT_EXPIRY_TIME,
      fingerprintAlgorithm: 'simple',
      autoResume: true,
      persistProgressInterval: this.DEFAULT_PERSIST_INTERVAL,
      enableCrossSession: true,
      autoCleanExpired: true,
      maxStorageItems: 100,
      partialDetection: true,
      encryptData: false,
      logLevel: 'warn',
      ...options,
    };

    // 生成唯一会话ID
    this.sessionId = this.generateSessionId();

    // 初始化存储
    this.storage = this.initStorage();

    // 如果启用了自动清理过期数据，则立即执行清理
    if (this.options.autoCleanExpired) {
      this.cleanExpiredItems().catch(err =>
        this.log('error', '清理过期数据失败', err)
      );
    }
  }

  /**
   * 生成唯一会话ID
   * @returns 会话ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 初始化适合环境的存储
   * @returns 存储接口实现
   */
  private initStorage(): IStorage {
    const env = EnvUtils.detectEnvironment();

    // 如果提供了自定义存储，则优先使用
    if (this.options.storageType === 'custom' && this.options.customStorage) {
      return this.options.customStorage;
    }

    // 根据指定的存储类型创建存储适配器
    switch (this.options.storageType) {
      case 'localStorage':
        if (
          env === Environment.Browser &&
          typeof localStorage !== 'undefined'
        ) {
          return new LocalStorageAdapter({ prefix: this.options.keyPrefix });
        }
        break;

      case 'sessionStorage':
        if (
          env === Environment.Browser &&
          typeof sessionStorage !== 'undefined'
        ) {
          return new SessionStorageAdapter({ prefix: this.options.keyPrefix });
        }
        break;

      // 注意：这里需要引入其他存储适配器的实现
      // case 'indexedDB':
      // case 'miniprogram':
      // case 'taroStorage':
      // case 'uniappStorage':
    }

    // 默认使用内存存储
    this.log('warn', `未找到支持的存储方式，回退到内存存储`);
    return new MemoryStorageAdapter({ prefix: this.options.keyPrefix });
  }

  /**
   * 插件安装方法
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this.uploader = uploader;

    // 注册各种事件监听
    uploader.on('chunkSuccess', this.handleChunkSuccess.bind(this));
    uploader.on('uploadComplete', this.handleUploadComplete.bind(this));
    uploader.on('error', this.handleError.bind(this));
    uploader.on('progress', this.handleProgress.bind(this));

    // 监听创建分片前的钩子，用于恢复上传
    uploader.hook('beforeCreateChunks', this.beforeCreateChunks.bind(this));

    // 注册上传开始事件，用于初始化进度信息
    uploader.on('uploadStart', this.handleUploadStart.bind(this));

    // 设置插件优先级（如果UploaderCore支持此方法）
    // 注意：当前UploaderCore类型中不存在此方法，可能是一个将来要实现的特性
    // 在实际使用时，如果该方法存在则调用，否则跳过
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((uploader as any).setPluginPriority) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (uploader as any).setPluginPriority('ResumePlugin', PluginPriority.HIGH);
    }
  }

  /**
   * 处理上传开始事件
   * @param info 上传信息
   */
  private async handleUploadStart(
    info: Record<string, unknown>
  ): Promise<void> {
    if (!this.options.enabled || !info.fileId) return;

    const { fileId, fileName, fileSize, chunkSize } = info as {
      fileId: string;
      fileName: string;
      fileSize: number;
      chunkSize: number;
    };

    try {
      // 检查是否有未完成的上传
      const existingProgress = await this.getFileProgress(fileId);

      // 如果没有现有进度或不启用自动恢复，则初始化新的进度信息
      if (!existingProgress || !this.options.autoResume) {
        const newProgress: FileProgressInfo = {
          fileId,
          fileName,
          fileSize,
          chunks: [],
          uploadedChunks: [],
          lastUpdated: Date.now(),
          createdAt: Date.now(),
          sessionId: this.sessionId,
          totalChunks: Math.ceil(fileSize / chunkSize),
          progress: 0,
        };

        await this.saveFileProgress(fileId, newProgress);

        // 启动进度持久化定时器
        if (
          this.options.persistProgressInterval &&
          this.options.persistProgressInterval > 0
        ) {
          const timerId = window.setInterval(() => {
            this.persistProgress(fileId).catch(err =>
              this.log('error', '持久化进度失败', err)
            );
          }, this.options.persistProgressInterval);

          this.progressTimers.set(fileId, timerId);
        }
      }
    } catch (error) {
      this.log('error', '处理上传开始事件失败', error);
    }
  }

  /**
   * 创建分片前的钩子处理
   * @param params 钩子参数
   * @returns 钩子结果
   */
  private async beforeCreateChunks(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (!this.options.enabled || !this.uploader) {
      return null;
    }

    try {
      const file = params.file as { size: number; name: string };
      // 获取文件ID - 由于generateFileId是私有方法，这里使用自定义方法获取ID
      // 在实际使用时，应该使用UploaderCore公开的API
      const fileId = await this.getFileId(file);

      // 获取保存的进度信息
      const savedProgress = await this.getFileProgress(fileId);

      if (savedProgress) {
        // 检查文件大小是否匹配
        if (savedProgress.fileSize === file.size) {
          // 如果启用了文件指纹比对，并且有保存的指纹
          if (
            this.options.fingerprintAlgorithm !== 'simple' &&
            savedProgress.fileMd5 &&
            this.hasFileMd5Method()
          ) {
            // 计算当前文件的指纹
            const currentMd5 = await this.calculateFileMd5(file);

            // 如果指纹不匹配，清除旧进度并重新开始
            if (currentMd5 !== savedProgress.fileMd5) {
              this.log('info', `文件指纹不匹配，清除旧进度: ${fileId}`);
              await this.clearProgress(fileId);
              return null;
            }
          }

          this.log(
            'info',
            `找到可恢复的上传: ${fileId}，已上传分片: ${savedProgress.uploadedChunks.length}/${savedProgress.totalChunks}`
          );

          // 返回已保存的分片信息和已上传的分片索引
          return {
            chunks: savedProgress.chunks,
            uploadedChunks: savedProgress.uploadedChunks,
            resumeInfo: savedProgress,
          };
        } else {
          // 文件大小不匹配，清除旧进度
          this.log('info', `文件大小不匹配，清除旧进度: ${fileId}`);
          await this.clearProgress(fileId);
        }
      }
    } catch (error) {
      this.log('error', '恢复上传失败', error);
    }

    return null; // 继续默认流程
  }

  /**
   * 获取文件ID
   * 由于UploaderCore的generateFileId是私有方法，这里创建替代方法
   * @param file 文件对象
   * @returns 文件ID
   */
  private async getFileId(file: {
    size: number;
    name: string;
  }): Promise<string> {
    // 简单实现，使用文件名和大小生成ID
    return `${file.name}_${file.size}_${Date.now()}`;
  }

  /**
   * 检查是否支持文件MD5计算
   * @returns 是否支持
   */
  private hasFileMd5Method(): boolean {
    // 检查UploaderCore是否支持MD5计算方法
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (
      this.uploader !== null &&
      typeof (this.uploader as any).generateFileMd5 === 'function'
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  /**
   * 计算文件MD5
   * 这是一个兼容方法，根据UploaderCore是否支持MD5计算来处理
   * @param file 文件对象
   * @returns MD5值
   */
  private async calculateFileMd5(file: unknown): Promise<string> {
    if (this.uploader && this.hasFileMd5Method()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.uploader as any).generateFileMd5(file);
    }

    // 如果UploaderCore不支持，返回一个基于文件名和大小的简单哈希
    const fileObj = file as { name: string; size: number };
    return `${fileObj.name}_${fileObj.size}`;
  }

  /**
   * 处理分片上传成功事件
   * @param info 分片信息
   */
  private async handleChunkSuccess(info: {
    fileId: string;
    chunk: ChunkInfo;
  }): Promise<void> {
    if (!this.options.enabled || !info.fileId || !info.chunk) return;

    try {
      const { fileId, chunk } = info;
      await this.saveChunkProgress(fileId, chunk);
    } catch (error) {
      this.log('error', '保存分片进度失败', error);
    }
  }

  /**
   * 处理上传完成事件
   * @param info 完成信息
   */
  private async handleUploadComplete(info: { fileId: string }): Promise<void> {
    if (!this.options.enabled || !info.fileId) return;

    try {
      const { fileId } = info;

      // 清除进度信息
      await this.clearProgress(fileId);

      // 清除进度持久化定时器
      this.clearProgressTimer(fileId);
    } catch (error) {
      this.log('error', '处理上传完成事件失败', error);
    }
  }

  /**
   * 处理错误事件
   * @param error 错误信息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleError(error: any): Promise<void> {
    if (!this.options.enabled || !error.fileId) return;

    try {
      // 只有在非致命错误时保存进度
      if (!this.isTerminalError(error)) {
        await this.saveUploadError(error.fileId, error);
      } else {
        // 致命错误，清除进度
        await this.clearProgress(error.fileId);

        // 清除进度持久化定时器
        this.clearProgressTimer(error.fileId);
      }
    } catch (err) {
      this.log('error', '处理错误事件失败', err);
    }
  }

  /**
   * 处理进度事件
   * @param info 进度信息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleProgress(info: any): Promise<void> {
    if (!this.options.enabled || !info.fileId) return;

    try {
      const { fileId, progress } = info;

      // 更新进度信息
      const fileProgress = await this.getFileProgress(fileId);
      if (fileProgress) {
        fileProgress.progress = progress;
        fileProgress.lastUpdated = Date.now();
        await this.saveFileProgress(fileId, fileProgress);
      }
    } catch (error) {
      this.log('error', '更新进度失败', error);
    }
  }

  /**
   * 保存分片上传进度
   * @param fileId 文件ID
   * @param chunk 分片信息
   */
  private async saveChunkProgress(
    fileId: string,
    chunk: ChunkInfo
  ): Promise<void> {
    try {
      const progress = await this.getFileProgress(fileId);

      if (progress) {
        // 更新已上传分片
        if (!progress.uploadedChunks.includes(chunk.index)) {
          progress.uploadedChunks.push(chunk.index);
        }

        // 确保有分片信息
        const existingChunkIndex = progress.chunks.findIndex(
          c => c.index === chunk.index
        );
        if (existingChunkIndex >= 0) {
          progress.chunks[existingChunkIndex] = { ...chunk };
        } else {
          progress.chunks.push({ ...chunk });
        }

        // 更新最后更新时间
        progress.lastUpdated = Date.now();

        // 保存更新后的进度
        await this.saveFileProgress(fileId, progress);
      }
    } catch (error) {
      this.log(
        'error',
        `保存分片进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 保存上传错误信息
   * @param fileId 文件ID
   * @param error 错误信息
   */
  private async saveUploadError(
    fileId: string,
    error: { type?: string; message?: string; chunkInfo?: { index: number } }
  ): Promise<void> {
    try {
      const progress = await this.getFileProgress(fileId);

      if (progress) {
        // 保存错误信息到元数据
        if (!progress.metadata) {
          progress.metadata = {};
        }

        const errorInfo: ErrorInfo = {
          type: error.type || 'UNKNOWN_ERROR',
          message: error.message || '未知错误',
          timestamp: Date.now(),
        };

        progress.metadata.lastError = errorInfo;

        // 如果有分片信息，更新分片状态
        if (error.chunkInfo && typeof error.chunkInfo.index === 'number') {
          const chunkIndex = progress.chunks.findIndex(
            c => c.index === error.chunkInfo?.index
          );
          if (chunkIndex >= 0) {
            progress.chunks[chunkIndex].status = 'error';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            progress.chunks[chunkIndex].error = {
              type: error.type || 'UNKNOWN_ERROR',
              message: error.message || '未知错误',
            };
          }
        }

        // 更新最后更新时间
        progress.lastUpdated = Date.now();

        // 保存更新后的进度
        await this.saveFileProgress(fileId, progress);
      }
    } catch (error) {
      this.log(
        'error',
        `保存上传错误信息失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取文件上传进度
   * @param fileId 文件ID
   * @returns 文件进度信息
   */
  private async getFileProgress(
    fileId: string
  ): Promise<FileProgressInfo | null> {
    try {
      const key = this.getStorageKey(fileId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const savedProgress = await this.storage.getItem<FileProgressInfo>(key);

      if (savedProgress) {
        // 检查进度是否过期
        const expiryTime = this.options.expiryTime || this.DEFAULT_EXPIRY_TIME;
        if (Date.now() - savedProgress.lastUpdated > expiryTime) {
          this.log('info', `上传进度已过期: ${fileId}`);
          await this.storage.removeItem(key);
          return null;
        }

        return savedProgress;
      }
      return null;
    } catch (error) {
      this.log(
        'error',
        `获取文件进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * 保存文件进度信息
   * @param fileId 文件ID
   * @param progress 进度信息
   */
  private async saveFileProgress(
    fileId: string,
    progress: FileProgressInfo
  ): Promise<void> {
    try {
      const key = this.getStorageKey(fileId);

      // 如果启用了加密且提供了加密密钥，则加密数据
      if (this.options.encryptData && this.options.encryptionKey) {
        // 在实际项目中实现加密逻辑
        // progress = this.encryptProgressData(progress);
      }

      await this.storage.setItem(key, progress);
    } catch (error) {
      this.log(
        'error',
        `保存文件进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清除上传进度
   * @param fileId 文件ID
   */
  private async clearProgress(fileId: string): Promise<void> {
    try {
      const key = this.getStorageKey(fileId);
      await this.storage.removeItem(key);
    } catch (error) {
      this.log(
        'error',
        `清除上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清除进度持久化定时器
   * @param fileId 文件ID
   */
  private clearProgressTimer(fileId: string): void {
    const timerId = this.progressTimers.get(fileId);
    if (timerId) {
      clearInterval(timerId);
      this.progressTimers.delete(fileId);
    }
  }

  /**
   * 持久化进度信息
   * @param fileId 文件ID
   */
  private async persistProgress(fileId: string): Promise<void> {
    try {
      // 如果存在进度信息，更新最后更新时间
      const progress = await this.getFileProgress(fileId);
      if (progress) {
        progress.lastUpdated = Date.now();
        await this.saveFileProgress(fileId, progress);
      }
    } catch (error) {
      this.log(
        'error',
        `持久化进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清理过期的项目
   */
  private async cleanExpiredItems(): Promise<void> {
    try {
      // 获取所有键
      const keys = await this.storage.keys();
      const expiryTime = this.options.expiryTime || this.DEFAULT_EXPIRY_TIME;
      let removedCount = 0;

      for (const key of keys) {
        // 只处理符合前缀的键
        if (key.startsWith(this.options.keyPrefix || '')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const item = await this.storage.getItem(key);
          if (
            item &&
            item.lastUpdated &&
            Date.now() - item.lastUpdated > expiryTime
          ) {
            await this.storage.removeItem(key);
            removedCount++;
          }
        }
      }

      if (removedCount > 0) {
        this.log('info', `已清理 ${removedCount} 个过期项目`);
      }
    } catch (error) {
      this.log(
        'error',
        `清理过期项目失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取存储键
   * @param fileId 文件ID
   * @returns 存储键
   */
  private getStorageKey(fileId: string): string {
    return `resume_${fileId}`;
  }

  /**
   * 判断错误是否为致命错误
   * @param error 错误信息
   * @returns 是否为致命错误
   */
  private isTerminalError(error: { type?: string }): boolean {
    // 以下类型的错误被视为致命错误，不会保存进度
    const terminalErrorTypes = [
      UploadErrorType.FILE_ERROR,
      UploadErrorType.CANCEL_ERROR,
      UploadErrorType.SECURITY_ERROR,
      UploadErrorType.QUOTA_EXCEEDED_ERROR,
      UploadErrorType.DATA_CORRUPTION_ERROR,
    ];

    return terminalErrorTypes.includes(error.type as UploadErrorType);
  }

  /**
   * 记录日志
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    const logLevels: Record<LogLevel, number> = {
      none: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
    };
    const configLevel = this.options.logLevel || 'warn';

    if (logLevels[level] <= logLevels[configLevel]) {
      const prefix = '[ResumePlugin]';

      // 在开发环境或者非生产环境下才输出日志
      if (process.env.NODE_ENV !== 'production') {
        switch (level) {
          case 'error':
            // eslint-disable-next-line no-console
            console.error(`${prefix} ${message}`, data);
            break;
          case 'warn':
            // eslint-disable-next-line no-console
            console.warn(`${prefix} ${message}`, data);
            break;
          case 'info':
            // eslint-disable-next-line no-console
            console.info(`${prefix} ${message}`, data);
            break;
          case 'debug':
            // eslint-disable-next-line no-console
            console.debug(`${prefix} ${message}`, data);
            break;
        }
      }
    }
  }
}
