/**
 * FileRecordManager - 文件记录管理器
 *
 * 负责管理上传文件的索引记录
 */

import { Logger } from '../utils/Logger';
import { StorageManager } from '../utils/StorageManager';
import { FileRecord, ResumeData, UploadStatus } from '../types/resume';

/**
 * 文件记录管理器选项
 */
export interface FileRecordManagerOptions {
  /** 实例ID */
  instanceId: string;
  /** 最大文件记录数量 */
  maxFileRecords?: number;
}

/**
 * 文件记录管理器
 */
export class FileRecordManager {
  private logger: Logger;
  private options: Required<FileRecordManagerOptions>;
  private fileIndex: Map<string, FileRecord> = new Map();
  private storageManager: StorageManager | null = null;
  private isInitialized = false;

  /**
   * 构造函数
   * @param storageManager 存储管理器实例
   * @param options 配置选项
   */
  constructor(
    storageManager: StorageManager,
    options: FileRecordManagerOptions
  ) {
    this.logger = new Logger('FileRecordManager');
    this.storageManager = storageManager;

    this.options = {
      instanceId: options.instanceId,
      maxFileRecords: options.maxFileRecords || 100,
    };
  }

  /**
   * 初始化
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.loadFileIndex();
      this.isInitialized = true;
      this.logger.debug('文件记录管理器初始化成功', {
        recordCount: this.fileIndex.size,
      });
    } catch (error) {
      this.logger.error('文件记录管理器初始化失败', { error });
      throw error;
    }
  }

  /**
   * 加载文件索引
   */
  private async loadFileIndex(): Promise<void> {
    if (!this.storageManager) {
      this.logger.error('存储管理器未初始化');
      return;
    }

    try {
      const key = this.getFileIndexKey();
      const indexData =
        await this.storageManager.get<[string, FileRecord][]>(key);

      if (indexData) {
        this.fileIndex = new Map(indexData);
        this.logger.debug('已加载文件索引', {
          count: this.fileIndex.size,
        });
      } else {
        this.logger.debug('文件索引不存在，将创建新索引');
        this.fileIndex = new Map();
      }
    } catch (error) {
      this.logger.error('加载文件索引失败', { error });
      this.fileIndex = new Map();
    }
  }

  /**
   * 保存文件索引
   */
  public async saveFileIndex(): Promise<void> {
    if (!this.storageManager) {
      this.logger.error('存储管理器未初始化');
      return;
    }

    try {
      const key = this.getFileIndexKey();
      await this.storageManager.set(key, Array.from(this.fileIndex.entries()));
      this.logger.debug('已保存文件索引', {
        count: this.fileIndex.size,
      });
    } catch (error) {
      this.logger.error('保存文件索引失败', { error });
    }
  }

  /**
   * 更新文件记录
   */
  public async updateFileRecord(resumeData: ResumeData): Promise<void> {
    const {
      fileId,
      fileName,
      fileSize,
      lastModified,
      createdAt,
      updatedAt,
      status,
      progress,
      uploadedSize,
    } = resumeData;

    const fileRecord: FileRecord = {
      fileId,
      fileName,
      fileSize,
      lastModified,
      createdAt,
      updatedAt,
      status,
      progress,
      uploadedSize,
    };

    this.fileIndex.set(fileId, fileRecord);
    await this.saveFileIndex();

    // 检查是否超出最大记录数量，如果超出则删除最旧的记录
    await this.enforceLimits();
  }

  /**
   * 删除文件记录
   */
  public async deleteFileRecord(fileId: string): Promise<void> {
    if (this.fileIndex.has(fileId)) {
      this.fileIndex.delete(fileId);
      await this.saveFileIndex();
    }
  }

  /**
   * 强制执行记录限制
   */
  private async enforceLimits(): Promise<void> {
    if (this.fileIndex.size <= this.options.maxFileRecords) {
      return;
    }

    // 按修改时间排序所有记录
    const sortedEntries = Array.from(this.fileIndex.entries()).sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt
    );

    // 计算需要删除的记录数量
    const recordsToDelete = this.fileIndex.size - this.options.maxFileRecords;

    // 删除最旧的记录
    for (let i = 0; i < recordsToDelete; i++) {
      if (i < sortedEntries.length) {
        const fileId = sortedEntries[i][0];
        this.fileIndex.delete(fileId);
      }
    }

    await this.saveFileIndex();
    this.logger.debug('已清理旧文件记录', {
      deletedCount: recordsToDelete,
      remainingCount: this.fileIndex.size,
    });
  }

  /**
   * 获取文件索引的存储键
   */
  private getFileIndexKey(): string {
    return `${this.options.instanceId}_file_index`;
  }

  /**
   * 获取文件记录
   */
  public getFileRecord(fileId: string): FileRecord | null {
    return this.fileIndex.get(fileId) || null;
  }

  /**
   * 获取所有文件记录
   */
  public async getAllFileRecords(): Promise<FileRecord[]> {
    return Array.from(this.fileIndex.values());
  }

  /**
   * 获取指定状态的文件记录
   */
  public async getFileRecordsByStatus(
    status: UploadStatus
  ): Promise<FileRecord[]> {
    return Array.from(this.fileIndex.values()).filter(
      record => record.status === status
    );
  }

  /**
   * 获取可恢复的文件记录（暂停或失败的上传）
   */
  public async getResumableFileRecords(): Promise<FileRecord[]> {
    return Array.from(this.fileIndex.values()).filter(
      record =>
        record.status === UploadStatus.PAUSED ||
        record.status === UploadStatus.ERROR
    );
  }

  /**
   * 检查文件ID是否存在
   */
  public hasFileRecord(fileId: string): boolean {
    return this.fileIndex.has(fileId);
  }

  /**
   * 清理过期数据
   */
  public async cleanupExpiredRecords(expirationTime: number): Promise<void> {
    const now = Date.now();
    const expiredFileIds: string[] = [];

    // 查找过期文件
    for (const [fileId, record] of this.fileIndex.entries()) {
      const isExpired = now - record.updatedAt > expirationTime;
      const isCompleted = record.status === UploadStatus.COMPLETED;

      // 已过期或已完成的记录
      if (isExpired || isCompleted) {
        expiredFileIds.push(fileId);
      }
    }

    // 删除过期记录
    for (const fileId of expiredFileIds) {
      this.fileIndex.delete(fileId);
    }

    if (expiredFileIds.length > 0) {
      await this.saveFileIndex();
      this.logger.info('已清理过期文件记录', {
        count: expiredFileIds.length,
      });
    }
  }

  /**
   * 清空所有文件记录
   */
  public async clearAllRecords(): Promise<void> {
    this.fileIndex.clear();
    await this.saveFileIndex();
  }

  /**
   * 获取记录总数
   */
  public getRecordCount(): number {
    return this.fileIndex.size;
  }
}

export default FileRecordManager;
