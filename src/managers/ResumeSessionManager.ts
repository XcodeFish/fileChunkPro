/**
 * ResumeSessionManager - 断点续传会话管理器
 *
 * 负责管理跨会话的上传状态恢复
 */

import { Logger } from '../utils/Logger';
import { EventBus } from '../core/EventBus';
import { HashGenerator } from '../utils/HashGenerator';
import { StorageManager } from '../utils/StorageManager';
import { ResumeData } from '../types/resume';

/**
 * 断点续传会话管理器选项
 */
export interface ResumeSessionManagerOptions {
  /** 实例ID */
  instanceId: string;
  /** 页面卸载时是否自动保存状态 */
  autoSaveOnUnload?: boolean;
  /** 定期保存状态间隔，0表示不启用（毫秒） */
  checkpointInterval?: number;
}

/**
 * 断点续传会话管理器
 * 管理跨会话上传状态恢复
 */
export class ResumeSessionManager {
  private logger: Logger;
  private eventBus: EventBus;
  private hashGenerator: HashGenerator;
  private storageManager: StorageManager;
  private options: Required<ResumeSessionManagerOptions>;
  private sessionFiles = new Set<string>();
  private unloadListener: () => void;
  private checkpointInterval: any = null;

  /**
   * 构造函数
   * @param storageManager 存储管理器实例
   * @param options 配置选项
   */
  constructor(
    storageManager: StorageManager,
    options: ResumeSessionManagerOptions
  ) {
    this.logger = new Logger('ResumeSessionManager');
    this.eventBus = EventBus.getInstance();
    this.hashGenerator = new HashGenerator();
    this.storageManager = storageManager;

    this.options = {
      instanceId: options.instanceId,
      autoSaveOnUnload:
        options.autoSaveOnUnload !== undefined
          ? options.autoSaveOnUnload
          : true,
      checkpointInterval: options.checkpointInterval ?? 30000, // 默认30秒
    };

    // 绑定方法以保持this上下文
    this.saveState = this.saveState.bind(this);
    this.saveAllState = this.saveAllState.bind(this);
    this.onUnload = this.onUnload.bind(this);
  }

  /**
   * 初始化
   */
  public initialize(): void {
    // 设置页面卸载处理器
    if (this.options.autoSaveOnUnload) {
      this.setupUnloadHandler();
    }

    // 启动定期保存
    if (this.options.checkpointInterval > 0) {
      this.startCheckpointInterval();
    }
  }

  /**
   * 设置页面卸载处理器
   */
  private setupUnloadHandler(): void {
    // 移除现有监听器（如果有）
    if (this.unloadListener) {
      window.removeEventListener('beforeunload', this.unloadListener);
    }

    // 添加新的监听器
    this.unloadListener = this.onUnload;
    window.addEventListener('beforeunload', this.unloadListener);
    this.logger.debug('已设置页面卸载处理器');
  }

  /**
   * 页面卸载处理
   */
  private onUnload(): void {
    // 在页面卸载前保存所有状态
    this.saveAllState();
    this.logger.debug('页面卸载，保存上传状态');
  }

  /**
   * 启动定期保存
   */
  private startCheckpointInterval(): void {
    // 清除现有定时器
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }

    // 创建新的定时器
    this.checkpointInterval = setInterval(() => {
      this.performCheckpoint();
    }, this.options.checkpointInterval);

    this.logger.debug('已启动定期状态保存', {
      interval: this.options.checkpointInterval,
    });
  }

  /**
   * 执行定期保存
   */
  private performCheckpoint(): void {
    if (this.sessionFiles.size === 0) return;

    this.saveAllState();
    this.logger.debug('执行周期性状态保存', {
      filesCount: this.sessionFiles.size,
    });
  }

  /**
   * 保存上传状态
   * @param fileId 文件ID
   * @param resumeData 恢复数据
   */
  public async saveState(
    fileId: string,
    resumeData: ResumeData
  ): Promise<boolean> {
    try {
      // 更新会话ID
      resumeData.sessionId = this.options.instanceId;

      // 保存到存储
      const key = this.getFileKey(fileId);
      await this.storageManager.set(key, resumeData);

      // 添加到当前会话文件集合
      this.sessionFiles.add(fileId);

      return true;
    } catch (error) {
      this.logger.error('保存上传状态失败', { fileId, error });
      return false;
    }
  }

  /**
   * 保存所有上传状态
   */
  public async saveAllState(): Promise<void> {
    if (this.sessionFiles.size === 0) return;

    const promises: Promise<any>[] = [];
    for (const fileId of this.sessionFiles) {
      // 获取最新状态（需要从外部传入）
      const event = {
        fileId,
        action: 'save_state',
      };

      this.eventBus.emit('resume:saveState', event);
    }

    try {
      await Promise.all(promises);
    } catch (error) {
      this.logger.error('保存所有上传状态失败', { error });
    }
  }

  /**
   * 加载上传状态
   * @param fileId 文件ID
   */
  public async loadState(fileId: string): Promise<ResumeData | null> {
    try {
      const key = this.getFileKey(fileId);
      return await this.storageManager.get<ResumeData>(key);
    } catch (error) {
      this.logger.error('加载上传状态失败', { fileId, error });
      return null;
    }
  }

  /**
   * 清除上传状态
   * @param fileId 文件ID
   */
  public async clearState(fileId: string): Promise<boolean> {
    try {
      const key = this.getFileKey(fileId);
      await this.storageManager.remove(key);
      this.sessionFiles.delete(fileId);
      return true;
    } catch (error) {
      this.logger.error('清除上传状态失败', { fileId, error });
      return false;
    }
  }

  /**
   * 创建文件ID
   * @param file 文件对象
   */
  public async createFileId(file: File): Promise<string> {
    // 使用文件名、大小和最后修改时间创建唯一ID
    const fileInfo = `${file.name}_${file.size}_${file.lastModified}`;
    const hash = await this.hashGenerator.generateSimpleHash(fileInfo);
    return hash;
  }

  /**
   * 获取文件的存储键
   * @param fileId 文件ID
   */
  private getFileKey(fileId: string): string {
    return `${this.options.instanceId}_file_${fileId}`;
  }

  /**
   * 检查文件是否在当前会话中
   * @param fileId 文件ID
   */
  public isInCurrentSession(fileId: string): boolean {
    return this.sessionFiles.has(fileId);
  }

  /**
   * 添加文件到当前会话
   * @param fileId 文件ID
   */
  public addToCurrentSession(fileId: string): void {
    this.sessionFiles.add(fileId);
  }

  /**
   * 从当前会话中移除文件
   * @param fileId 文件ID
   */
  public removeFromCurrentSession(fileId: string): void {
    this.sessionFiles.delete(fileId);
  }

  /**
   * 获取可恢复文件列表（所有会话）
   */
  public async getResumableFiles(): Promise<string[]> {
    try {
      // 获取所有键
      const keys = await this.storageManager.keys();
      const prefix = `${this.options.instanceId}_file_`;

      // 过滤出文件键
      const fileKeys = keys.filter(key => key.startsWith(prefix));

      // 提取文件ID
      return fileKeys.map(key => key.substring(prefix.length));
    } catch (error) {
      this.logger.error('获取可恢复文件列表失败', { error });
      return [];
    }
  }

  /**
   * 获取当前会话的文件列表
   */
  public getCurrentSessionFiles(): string[] {
    return Array.from(this.sessionFiles);
  }

  /**
   * 销毁会话管理器
   */
  public destroy(): void {
    // 移除页面卸载处理器
    if (this.unloadListener) {
      window.removeEventListener('beforeunload', this.unloadListener);
      this.unloadListener = null;
    }

    // 清除定时器
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }

    // 保存当前状态
    this.saveAllState().catch(error => {
      this.logger.error('销毁时保存状态失败', { error });
    });

    this.logger.debug('会话管理器已销毁');
  }
}

export default ResumeSessionManager;
