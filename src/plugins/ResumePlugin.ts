/**
 * ResumePlugin - 断点续传插件
 *
 * 负责协调各个管理器模块，实现文件的断点续传功能
 */

import { IPlugin } from './interfaces';
import { Logger } from '../utils/Logger';
import { EventBus } from '../core/EventBus';
import { UploaderCore } from '../core/UploaderCore';
import { StorageManager, StorageEngine } from '../utils/StorageManager';
import { HashGenerator } from '../utils/HashGenerator';
import { ResumeStorageAdapter } from '../adapters/ResumeStorageAdapter';
import { ResumeStateManager } from '../managers/ResumeStateManager';
import { ChunkIndexManager } from '../managers/ChunkIndexManager';
import { FileRecordManager } from '../managers/FileRecordManager';
import { ResumeSessionManager } from '../managers/ResumeSessionManager';
import {
  ChunkStatus,
  ResumeData,
  ResumeOptions,
  StorageOptions,
  UploadStatus,
} from '../types/resume';

/**
 * 断点续传插件
 * 用于实现文件的断点续传功能
 */
export class ResumePlugin implements IPlugin {
  /** 插件名称 */
  public name = 'ResumePlugin';
  /** 插件版本 */
  public version = '1.0.0';

  private logger: Logger;
  private core: UploaderCore | null = null;
  private eventBus: EventBus;

  // 存储相关模块
  private storageManager: StorageManager;
  private storageAdapter: ResumeStorageAdapter;

  // 管理模块
  private stateManager: ResumeStateManager;
  private chunkManager: ChunkIndexManager;
  private fileRecordManager: FileRecordManager;
  private sessionManager: ResumeSessionManager;

  // 工具实例
  private hashGenerator: HashGenerator;

  // 配置选项
  private options: Required<ResumeOptions>;
  private isInitialized = false;

  /**
   * 构造函数
   * @param options 插件配置选项
   */
  constructor(options: ResumeOptions = {}) {
    this.logger = new Logger('ResumePlugin');
    this.eventBus = EventBus.getInstance();
    this.hashGenerator = new HashGenerator();

    // 设置默认选项
    this.options = {
      enabled: options.enabled !== undefined ? options.enabled : true,
      storage: {
        engine: options.storage?.engine ?? StorageEngine.LOCAL_STORAGE,
        path: options.storage?.path ?? 'fileChunkPro',
        namespace: options.storage?.namespace ?? 'resumeData',
        customStorage: options.storage?.customStorage,
      },
      maxFileRecords: options.maxFileRecords || 100,
      chunkMetaFields: options.chunkMetaFields || [
        'index',
        'start',
        'end',
        'size',
        'md5',
      ],
      checkpointInterval: options.checkpointInterval || 30000, // 默认30秒
      expirationTime: options.expirationTime || 7 * 24 * 60 * 60 * 1000, // 默认7天
      autoSaveOnUnload:
        options.autoSaveOnUnload !== undefined
          ? options.autoSaveOnUnload
          : true,
    };

    // 初始化存储管理器
    this.storageManager = new StorageManager(
      this.options.storage as StorageOptions
    );

    // 初始化存储适配器
    this.storageAdapter = new ResumeStorageAdapter(this.storageManager, {
      prefix: this.options.storage.path,
      namespace: this.options.storage.namespace,
      expirationTime: this.options.expirationTime,
    });

    // 初始化状态管理器
    this.stateManager = new ResumeStateManager({
      instanceId: this.getInstanceId(),
      chunkMetaFields: this.options.chunkMetaFields,
      expirationTime: this.options.expirationTime,
    });

    // 初始化分片管理器
    this.chunkManager = new ChunkIndexManager();

    // 初始化文件记录管理器
    this.fileRecordManager = new FileRecordManager(this.storageManager, {
      instanceId: this.getInstanceId(),
      maxFileRecords: this.options.maxFileRecords,
    });

    // 初始化会话管理器
    this.sessionManager = new ResumeSessionManager(this.storageManager, {
      instanceId: this.getInstanceId(),
      autoSaveOnUnload: this.options.autoSaveOnUnload,
      checkpointInterval: this.options.checkpointInterval,
    });
  }

  /**
   * 安装插件
   * @param core UploaderCore实例
   */
  public install(core: UploaderCore): void {
    if (this.core) {
      this.logger.warn('断点续传插件已安装，忽略重复安装');
      return;
    }

    this.core = core;

    if (!this.options.enabled) {
      this.logger.info('断点续传功能已禁用');
      return;
    }

    this.initialize().catch(error => {
      this.logger.error('断点续传插件初始化失败', { error });
    });

    // 注册事件处理器
    this.registerEventHandlers();

    this.logger.info('断点续传插件已安装');
  }

  /**
   * 卸载插件
   */
  public uninstall(): void {
    if (!this.core) {
      return;
    }

    // 保存当前状态
    this.saveAllState().catch(error => {
      this.logger.error('卸载插件时保存状态失败', { error });
    });

    // 清理和注销事件处理器
    this.unregisterEventHandlers();

    // 销毁会话管理器
    this.sessionManager.destroy();

    this.core = null;
    this.isInitialized = false;
    this.logger.info('断点续传插件已卸载');
  }

  /**
   * 初始化插件
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化存储管理器
      await this.storageManager.initialize();

      // 初始化文件记录管理器
      await this.fileRecordManager.initialize();

      // 初始化会话管理器
      this.sessionManager.initialize();

      // 执行过期数据清理
      await this.storageAdapter.cleanupExpiredData();
      await this.fileRecordManager.cleanupExpiredRecords(
        this.options.expirationTime
      );

      this.isInitialized = true;
      this.logger.debug('断点续传插件初始化成功');
    } catch (error) {
      this.logger.error('断点续传插件初始化失败', { error });
      throw error;
    }
  }

  /**
   * 注册事件处理器
   */
  private registerEventHandlers(): void {
    if (!this.core) return;

    // 文件添加前钩子
    this.core.hooks.beforeFileAdd.tap(
      this.name,
      this.onBeforeFileAdd.bind(this)
    );

    // 文件添加后钩子
    this.core.hooks.afterFileAdd.tap(this.name, this.onAfterFileAdd.bind(this));

    // 分片上传前钩子
    this.core.hooks.beforeChunkUpload.tap(
      this.name,
      this.onBeforeChunkUpload.bind(this)
    );

    // 分片上传成功钩子
    this.core.hooks.afterChunkUpload.tap(
      this.name,
      this.onAfterChunkUpload.bind(this)
    );

    // 分片上传失败钩子
    this.core.hooks.onChunkUploadError.tap(
      this.name,
      this.onChunkUploadError.bind(this)
    );

    // 文件上传成功钩子
    this.core.hooks.afterFileUpload.tap(
      this.name,
      this.onAfterFileUpload.bind(this)
    );

    // 文件上传失败钩子
    this.core.hooks.onFileUploadError.tap(
      this.name,
      this.onFileUploadError.bind(this)
    );

    // 暂停文件上传钩子
    this.core.hooks.onFilePause.tap(this.name, this.onFilePause.bind(this));

    // 恢复文件上传钩子
    this.core.hooks.onFileResume.tap(this.name, this.onFileResume.bind(this));

    // 文件上传取消钩子
    this.core.hooks.onFileCancel.tap(this.name, this.onFileCancel.bind(this));

    // 注册内部事件处理
    this.eventBus.on('resume:saveState', this.handleSaveStateEvent.bind(this));

    this.logger.debug('断点续传插件已注册事件处理器');
  }

  /**
   * 注销事件处理器
   */
  private unregisterEventHandlers(): void {
    if (!this.core) return;

    // 注销钩子
    this.core.hooks.beforeFileAdd.untap(this.name);
    this.core.hooks.afterFileAdd.untap(this.name);
    this.core.hooks.beforeChunkUpload.untap(this.name);
    this.core.hooks.afterChunkUpload.untap(this.name);
    this.core.hooks.onChunkUploadError.untap(this.name);
    this.core.hooks.afterFileUpload.untap(this.name);
    this.core.hooks.onFileUploadError.untap(this.name);
    this.core.hooks.onFilePause.untap(this.name);
    this.core.hooks.onFileResume.untap(this.name);
    this.core.hooks.onFileCancel.untap(this.name);

    // 注销内部事件
    this.eventBus.off('resume:saveState', this.handleSaveStateEvent.bind(this));

    this.logger.debug('断点续传插件已注销事件处理器');
  }

  /**
   * 处理文件添加前
   */
  private async onBeforeFileAdd(file: File): Promise<File> {
    try {
      // 检查文件恢复
      const fileId = await this.sessionManager.createFileId(file);
      const resumeData = await this.sessionManager.loadState(fileId);

      // 如果找不到恢复数据，直接返回原始文件
      if (!resumeData) {
        return file;
      }

      // 校验恢复数据有效性
      const chunks = this.core.helpers.splitFileIntoChunks(file);
      if (
        !chunks ||
        !this.stateManager.isResumeDataValid(resumeData, file, chunks)
      ) {
        // 恢复数据无效，清除数据
        await this.sessionManager.clearState(fileId);
        return file;
      }

      // 附加恢复数据到文件对象
      (file as any)._resumeData = resumeData;

      this.logger.debug('已找到有效的恢复数据', {
        fileId,
        fileName: file.name,
      });

      // 通知用户可以恢复上传
      this.eventBus.emit('resume:availableData', {
        fileId,
        fileName: file.name,
        progress: resumeData.progress,
        status: resumeData.status,
      });

      return file;
    } catch (error) {
      this.logger.error('处理文件恢复失败', { fileName: file.name, error });
      return file;
    }
  }

  /**
   * 处理文件添加后
   */
  private async onAfterFileAdd({ file, fileId, chunks }): Promise<void> {
    try {
      // 检查文件是否携带恢复数据
      const resumeData = (file as any)._resumeData as ResumeData;

      if (resumeData) {
        // 应用恢复数据
        this.stateManager.applyResumeData(fileId, resumeData, chunks);
        this.chunkManager.applyResumeData(fileId, resumeData);
        this.sessionManager.addToCurrentSession(fileId);
      } else {
        // 创建新的恢复数据
        this.stateManager.createResumeData(fileId, file, chunks);
        this.chunkManager.registerFileChunks(fileId, chunks);
      }

      // 更新文件记录
      const currentData = this.stateManager.getResumeData(fileId);
      if (currentData) {
        await this.fileRecordManager.updateFileRecord(currentData);
      }

      this.logger.debug('文件已添加到断点续传管理', {
        fileId,
        fileName: file.name,
      });
    } catch (error) {
      this.logger.error('添加文件到断点续传管理失败', {
        fileId,
        fileName: file.name,
        error,
      });
    }
  }

  /**
   * 处理分片上传前
   */
  private onBeforeChunkUpload({ fileId, chunkIndex, _chunk }): boolean {
    try {
      // 检查分片是否已上传
      const chunkStatus = this.chunkManager.getChunkStatus(fileId, chunkIndex);

      if (chunkStatus === ChunkStatus.UPLOADED) {
        this.logger.debug('跳过已上传的分片', { fileId, chunkIndex });
        return false; // 跳过上传
      }

      // 更新分片状态为上传中
      this.chunkManager.updateChunkStatus(
        fileId,
        chunkIndex,
        ChunkStatus.UPLOADING
      );

      // 更新上传状态
      this.stateManager.updateChunkStatus(
        fileId,
        chunkIndex,
        ChunkStatus.UPLOADING
      );

      return true; // 允许上传
    } catch (error) {
      this.logger.error('处理分片上传前发生错误', {
        fileId,
        chunkIndex,
        error,
      });
      return true; // 默认允许上传
    }
  }

  /**
   * 处理分片上传成功
   */
  private async onAfterChunkUpload({
    fileId,
    chunkIndex,
    response,
  }): Promise<void> {
    try {
      // 更新分片状态为已上传
      this.chunkManager.updateChunkStatus(
        fileId,
        chunkIndex,
        ChunkStatus.UPLOADED
      );

      // 更新上传状态
      this.stateManager.updateChunkStatus(
        fileId,
        chunkIndex,
        ChunkStatus.UPLOADED,
        response
      );

      // 获取当前恢复数据
      const resumeData = this.stateManager.getResumeData(fileId);
      if (!resumeData) return;

      // 保存当前状态
      await this.sessionManager.saveState(fileId, resumeData);

      // 更新文件记录
      await this.fileRecordManager.updateFileRecord(resumeData);

      // 检查是否所有分片都上传完成
      const isAllUploaded = this.chunkManager.areAllChunksUploaded(fileId);

      if (isAllUploaded) {
        this.logger.debug('所有分片上传完成', { fileId });
      } else {
        this.logger.debug('分片上传成功', {
          fileId,
          chunkIndex,
          progress: resumeData.progress,
        });
      }
    } catch (error) {
      this.logger.error('处理分片上传成功失败', { fileId, chunkIndex, error });
    }
  }

  /**
   * 处理分片上传错误
   */
  private async onChunkUploadError({
    fileId,
    chunkIndex,
    error,
  }): Promise<void> {
    try {
      // 更新分片状态为失败
      this.chunkManager.updateChunkStatus(
        fileId,
        chunkIndex,
        ChunkStatus.FAILED
      );

      // 更新上传状态
      this.stateManager.updateChunkStatus(
        fileId,
        chunkIndex,
        ChunkStatus.FAILED
      );

      // 尝试保存当前状态
      const resumeData = this.stateManager.getResumeData(fileId);
      if (resumeData) {
        await this.sessionManager.saveState(fileId, resumeData);
        await this.fileRecordManager.updateFileRecord(resumeData);
      }

      this.logger.debug('分片上传失败', { fileId, chunkIndex, error });
    } catch (error) {
      this.logger.error('处理分片上传错误失败', { fileId, chunkIndex, error });
    }
  }

  /**
   * 处理文件上传成功
   */
  private async onAfterFileUpload({ fileId, response }): Promise<void> {
    try {
      // 更新上传状态
      this.stateManager.updateStatus(fileId, UploadStatus.COMPLETED);
      this.stateManager.updateResponse(fileId, response);

      // 获取最终状态
      const resumeData = this.stateManager.getResumeData(fileId);
      if (!resumeData) return;

      // 保存最终状态
      await this.sessionManager.saveState(fileId, resumeData);
      await this.fileRecordManager.updateFileRecord(resumeData);

      this.logger.debug('文件上传完成，保存最终状态', { fileId });
    } catch (error) {
      this.logger.error('处理文件上传成功失败', { fileId, error });
    }
  }

  /**
   * 处理文件上传错误
   */
  private async onFileUploadError({ fileId, error }): Promise<void> {
    try {
      // 更新上传状态
      this.stateManager.updateStatus(fileId, UploadStatus.ERROR, error);

      // 获取状态
      const resumeData = this.stateManager.getResumeData(fileId);
      if (!resumeData) return;

      // 保存状态
      await this.sessionManager.saveState(fileId, resumeData);
      await this.fileRecordManager.updateFileRecord(resumeData);

      this.logger.debug('文件上传失败，保存错误状态', { fileId, error });
    } catch (error) {
      this.logger.error('处理文件上传错误失败', { fileId, error });
    }
  }

  /**
   * 处理文件暂停
   */
  private async onFilePause({ fileId }): Promise<void> {
    try {
      // 更新上传状态
      this.stateManager.updateStatus(fileId, UploadStatus.PAUSED);

      // 获取状态
      const resumeData = this.stateManager.getResumeData(fileId);
      if (!resumeData) return;

      // 保存状态
      await this.sessionManager.saveState(fileId, resumeData);
      await this.fileRecordManager.updateFileRecord(resumeData);

      this.logger.debug('文件上传已暂停', { fileId });
    } catch (error) {
      this.logger.error('处理文件暂停失败', { fileId, error });
    }
  }

  /**
   * 处理文件恢复上传
   */
  private async onFileResume({ fileId }): Promise<void> {
    try {
      // 更新上传状态
      this.stateManager.updateStatus(fileId, UploadStatus.UPLOADING);

      // 获取状态
      const resumeData = this.stateManager.getResumeData(fileId);
      if (!resumeData) return;

      // 保存状态
      await this.sessionManager.saveState(fileId, resumeData);
      await this.fileRecordManager.updateFileRecord(resumeData);

      this.logger.debug('文件上传已恢复', { fileId });
    } catch (error) {
      this.logger.error('处理文件恢复上传失败', { fileId, error });
    }
  }

  /**
   * 处理文件取消上传
   */
  private async onFileCancel({ fileId }): Promise<void> {
    try {
      // 更新上传状态
      this.stateManager.updateStatus(fileId, UploadStatus.CANCELLED);

      // 获取状态
      const resumeData = this.stateManager.getResumeData(fileId);
      if (!resumeData) return;

      // 保存状态
      await this.sessionManager.saveState(fileId, resumeData);
      await this.fileRecordManager.updateFileRecord(resumeData);

      this.logger.debug('文件上传已取消', { fileId });
    } catch (error) {
      this.logger.error('处理文件取消上传失败', { fileId, error });
    }
  }

  /**
   * 获取实例ID
   */
  private getInstanceId(): string {
    return `${this.name}_${Date.now().toString(36)}`;
  }

  /**
   * 处理保存状态事件
   */
  private async handleSaveStateEvent(event: {
    fileId: string;
    action: string;
  }): Promise<void> {
    try {
      const { fileId } = event;
      const resumeData = this.stateManager.getResumeData(fileId);

      if (resumeData) {
        await this.sessionManager.saveState(fileId, resumeData);
      }
    } catch (error) {
      this.logger.error('处理保存状态事件失败', { event, error });
    }
  }

  /**
   * 保存所有状态
   */
  private async saveAllState(): Promise<void> {
    const promises = [];

    // 保存所有文件的状态
    for (const [fileId, resumeData] of this.stateManager.getAllResumeData()) {
      promises.push(this.sessionManager.saveState(fileId, resumeData));
    }

    try {
      await Promise.all(promises);
      this.logger.debug('已保存所有文件状态');
    } catch (error) {
      this.logger.error('保存所有文件状态失败', { error });
    }
  }

  /**
   * 获取可恢复的上传列表
   */
  public async getResumableUploads(): Promise<any[]> {
    try {
      // 获取所有可恢复的文件记录
      const fileRecords =
        await this.fileRecordManager.getResumableFileRecords();
      return fileRecords.map(record => ({
        fileId: record.fileId,
        fileName: record.fileName,
        fileSize: record.fileSize,
        progress: record.progress,
        status: record.status,
        uploadedSize: record.uploadedSize,
        updatedAt: record.updatedAt,
      }));
    } catch (error) {
      this.logger.error('获取可恢复上传列表失败', { error });
      return [];
    }
  }

  /**
   * 尝试恢复上传
   * @param fileId 文件ID
   * @param file 文件对象(可选，如果提供则会校验)
   */
  public async resumeUpload(fileId: string, file?: File): Promise<boolean> {
    if (!this.core) return false;

    try {
      // 获取存储的状态
      const resumeData = await this.sessionManager.loadState(fileId);
      if (!resumeData) {
        this.logger.debug('找不到可恢复的上传数据', { fileId });
        return false;
      }

      // 如果提供了文件对象，校验文件是否匹配
      if (file) {
        if (
          resumeData.fileName !== file.name ||
          resumeData.fileSize !== file.size ||
          resumeData.lastModified !== file.lastModified
        ) {
          this.logger.debug('文件与恢复数据不匹配', { fileId });
          return false;
        }

        // 添加文件到上传器
        await this.core.addFile(file);
      } else {
        // 尝试通知上传器恢复特定文件ID的上传
        this.eventBus.emit('uploader:resumeUpload', { fileId, resumeData });
      }

      return true;
    } catch (error) {
      this.logger.error('尝试恢复上传失败', { fileId, error });
      return false;
    }
  }

  /**
   * 清理过期数据
   */
  public async cleanupExpiredData(): Promise<void> {
    try {
      await this.storageAdapter.cleanupExpiredData();
      await this.fileRecordManager.cleanupExpiredRecords(
        this.options.expirationTime
      );
      this.logger.info('清理过期数据完成');
    } catch (error) {
      this.logger.error('清理过期数据失败', { error });
    }
  }

  /**
   * 清除文件的恢复数据
   * @param fileId 文件ID
   */
  public async clearFileData(fileId: string): Promise<boolean> {
    try {
      // 清理存储数据
      await this.storageAdapter.clearFileData(fileId);

      // 清理记录
      await this.fileRecordManager.deleteFileRecord(fileId);

      // 清理状态管理器
      this.stateManager.removeResumeData(fileId);

      // 清理分片管理器
      this.chunkManager.cleanupFile(fileId);

      // 清理会话管理器
      this.sessionManager.clearState(fileId);
      this.sessionManager.removeFromCurrentSession(fileId);

      this.logger.debug('已清除文件恢复数据', { fileId });

      return true;
    } catch (error) {
      this.logger.error('清除文件恢复数据失败', { fileId, error });
      return false;
    }
  }

  /**
   * 检查文件是否存在恢复数据
   * @param fileId 文件ID
   */
  public async hasResumeData(fileId: string): Promise<boolean> {
    try {
      const resumeData = await this.sessionManager.loadState(fileId);
      return !!resumeData;
    } catch (error) {
      this.logger.error('检查文件恢复数据失败', { fileId, error });
      return false;
    }
  }

  /**
   * 获取文件上传进度
   * @param fileId 文件ID
   */
  public async getFileProgress(fileId: string): Promise<number | null> {
    try {
      const resumeData = this.stateManager.getResumeData(fileId);
      if (resumeData) {
        return resumeData.progress;
      }

      // 如果内存中没有，尝试从存储加载
      const savedData = await this.sessionManager.loadState(fileId);
      return savedData ? savedData.progress : null;
    } catch (error) {
      this.logger.error('获取文件上传进度失败', { fileId, error });
      return null;
    }
  }

  /**
   * 设置存储引擎
   * @param engine 存储引擎
   * @param options 存储选项
   */
  public async setStorageEngine(
    engine: StorageEngine,
    options?: any
  ): Promise<boolean> {
    try {
      // 先保存当前状态
      await this.saveAllState();

      // 更新存储引擎
      await this.storageManager.setEngine(engine, options);

      // 更新配置
      this.options.storage.engine = engine;
      if (options) {
        this.options.storage = {
          ...this.options.storage,
          ...options,
        };
      }

      // 重新初始化各管理器
      await this.storageAdapter.reinitialize(this.storageManager, {
        prefix: this.options.storage.path,
        namespace: this.options.storage.namespace,
        expirationTime: this.options.expirationTime,
      });

      await this.fileRecordManager.reinitialize(this.storageManager, {
        instanceId: this.getInstanceId(),
        maxFileRecords: this.options.maxFileRecords,
      });

      this.logger.info('存储引擎已更新', { engine });
      return true;
    } catch (error) {
      this.logger.error('设置存储引擎失败', { engine, error });
      return false;
    }
  }

  /**
   * 获取当前插件统计信息
   */
  public getStats(): object {
    return {
      version: this.version,
      enabled: this.options.enabled,
      storageEngine: this.options.storage.engine,
      activeFiles: this.sessionManager.getCurrentSessionSize(),
      fileRecordsCount: this.fileRecordManager.getRecordsCount(),
      sessionId: this.sessionManager.getCurrentSessionId(),
    };
  }

  /**
   * 导出所有恢复数据
   * 可用于在不同环境间迁移上传状态
   */
  public async exportAllResumeData(): Promise<string> {
    try {
      const allRecords = await this.fileRecordManager.getAllFileRecords();
      const exportData = {
        version: this.version,
        timestamp: Date.now(),
        records: allRecords,
      };

      return JSON.stringify(exportData);
    } catch (error) {
      this.logger.error('导出恢复数据失败', { error });
      throw error;
    }
  }

  /**
   * 导入恢复数据
   * @param jsonData 之前导出的JSON数据
   */
  public async importResumeData(jsonData: string): Promise<number> {
    try {
      const importData = JSON.parse(jsonData);

      if (
        !importData.version ||
        !importData.records ||
        !Array.isArray(importData.records)
      ) {
        throw new Error('无效的恢复数据格式');
      }

      let importedCount = 0;

      for (const record of importData.records) {
        if (record.fileId && record.fileName) {
          await this.fileRecordManager.updateFileRecord(record);
          await this.sessionManager.saveState(record.fileId, record);
          importedCount++;
        }
      }

      this.logger.info('恢复数据导入完成', { importedCount });
      return importedCount;
    } catch (error) {
      this.logger.error('导入恢复数据失败', { error });
      throw error;
    }
  }

  /**
   * 生成文件的断点续传ID
   * 可用于自定义ID生成逻辑
   * @param file 文件对象
   */
  public async generateFileId(file: File): Promise<string> {
    return this.sessionManager.createFileId(file);
  }
}

export default ResumePlugin;
