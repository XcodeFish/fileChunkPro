/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * ResumeStorageAdapter - 断点续传存储适配器
 *
 * 提供对断点续传数据的存储和检索功能
 */

import { StorageManager } from '../utils/StorageManager';
import { Logger } from '../utils/Logger';

/**
 * 存储适配器选项
 */
export interface ResumeStorageOptions {
  /** 存储前缀 */
  prefix: string;
  /** 存储命名空间 */
  namespace: string;
  /** 数据过期时间(毫秒) */
  expirationTime?: number;
}

/**
 * 断点续传存储适配器
 * 封装了断点续传数据的存储访问接口
 */
export class ResumeStorageAdapter {
  private logger: Logger;
  private storageManager: StorageManager;
  private prefix: string;
  private namespace: string;
  private expirationTime: number;

  /**
   * 构造函数
   * @param storageManager 存储管理器实例
   * @param options 适配器选项
   */
  constructor(storageManager: StorageManager, options: ResumeStorageOptions) {
    this.logger = new Logger('ResumeStorageAdapter');
    this.storageManager = storageManager;
    this.prefix = options.prefix;
    this.namespace = options.namespace;
    this.expirationTime = options.expirationTime || 7 * 24 * 60 * 60 * 1000; // 默认7天
  }

  /**
   * 存储上传文件元数据
   * @param fileId 文件ID
   * @param metadata 文件元数据
   */
  public async saveFileMetadata<T extends object>(
    fileId: string,
    metadata: T
  ): Promise<boolean> {
    try {
      const key = this.getFileMetadataKey(fileId);
      const data = {
        ...metadata,
        _timestamp: Date.now(), // 用于过期检查
      };

      await this.storageManager.set(key, data);
      return true;
    } catch (error) {
      this.logger.error('保存文件元数据失败', { fileId, error });
      return false;
    }
  }

  /**
   * 获取上传文件元数据
   * @param fileId 文件ID
   */
  public async getFileMetadata<T extends object>(
    fileId: string
  ): Promise<T | null> {
    try {
      const key = this.getFileMetadataKey(fileId);
      const data = await this.storageManager.get<T & { _timestamp?: number }>(
        key
      );

      if (!data) {
        return null;
      }

      // 检查是否过期
      const timestamp = data._timestamp || 0;
      const now = Date.now();

      if (now - timestamp > this.expirationTime) {
        this.logger.debug('文件元数据已过期', { fileId });
        await this.removeFileMetadata(fileId);
        return null;
      }

      // 移除内部时间戳
      const { _timestamp, ...metadata } = data;
      return metadata as T;
    } catch (error) {
      this.logger.error('获取文件元数据失败', { fileId, error });
      return null;
    }
  }

  /**
   * 移除上传文件元数据
   * @param fileId 文件ID
   */
  public async removeFileMetadata(fileId: string): Promise<boolean> {
    try {
      const key = this.getFileMetadataKey(fileId);
      await this.storageManager.remove(key);
      return true;
    } catch (error) {
      this.logger.error('删除文件元数据失败', { fileId, error });
      return false;
    }
  }

  /**
   * 存储上传进度
   * @param fileId 文件ID
   * @param progress 上传进度数据
   */
  public async saveProgress<T extends object>(
    fileId: string,
    progress: T
  ): Promise<boolean> {
    try {
      const key = this.getProgressKey(fileId);
      const data = {
        ...progress,
        _timestamp: Date.now(), // 用于过期检查
      };

      await this.storageManager.set(key, data);
      return true;
    } catch (error) {
      this.logger.error('保存上传进度失败', { fileId, error });
      return false;
    }
  }

  /**
   * 获取上传进度
   * @param fileId 文件ID
   */
  public async getProgress<T extends object>(
    fileId: string
  ): Promise<T | null> {
    try {
      const key = this.getProgressKey(fileId);
      const data = await this.storageManager.get<T & { _timestamp?: number }>(
        key
      );

      if (!data) {
        return null;
      }

      // 检查是否过期
      const timestamp = data._timestamp || 0;
      const now = Date.now();

      if (now - timestamp > this.expirationTime) {
        this.logger.debug('上传进度数据已过期', { fileId });
        await this.removeProgress(fileId);
        return null;
      }

      // 移除内部时间戳
      const { _timestamp, ...progress } = data;
      return progress as T;
    } catch (error) {
      this.logger.error('获取上传进度失败', { fileId, error });
      return null;
    }
  }

  /**
   * 移除上传进度
   * @param fileId 文件ID
   */
  public async removeProgress(fileId: string): Promise<boolean> {
    try {
      const key = this.getProgressKey(fileId);
      await this.storageManager.remove(key);
      return true;
    } catch (error) {
      this.logger.error('删除上传进度失败', { fileId, error });
      return false;
    }
  }

  /**
   * 存储分片状态
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   * @param chunkData 分片数据
   */
  public async saveChunkState<T extends object>(
    fileId: string,
    chunkIndex: number,
    chunkData: T
  ): Promise<boolean> {
    try {
      const key = this.getChunkStateKey(fileId, chunkIndex);
      const data = {
        ...chunkData,
        _timestamp: Date.now(), // 用于过期检查
      };

      await this.storageManager.set(key, data);
      return true;
    } catch (error) {
      this.logger.error('保存分片状态失败', { fileId, chunkIndex, error });
      return false;
    }
  }

  /**
   * 获取分片状态
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   */
  public async getChunkState<T extends object>(
    fileId: string,
    chunkIndex: number
  ): Promise<T | null> {
    try {
      const key = this.getChunkStateKey(fileId, chunkIndex);
      const data = await this.storageManager.get<T & { _timestamp?: number }>(
        key
      );

      if (!data) {
        return null;
      }

      // 检查是否过期
      const timestamp = data._timestamp || 0;
      const now = Date.now();

      if (now - timestamp > this.expirationTime) {
        this.logger.debug('分片状态数据已过期', { fileId, chunkIndex });
        await this.removeChunkState(fileId, chunkIndex);
        return null;
      }

      // 移除内部时间戳
      const { _timestamp, ...chunkState } = data;
      return chunkState as T;
    } catch (error) {
      this.logger.error('获取分片状态失败', { fileId, chunkIndex, error });
      return null;
    }
  }

  /**
   * 移除分片状态
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   */
  public async removeChunkState(
    fileId: string,
    chunkIndex: number
  ): Promise<boolean> {
    try {
      const key = this.getChunkStateKey(fileId, chunkIndex);
      await this.storageManager.remove(key);
      return true;
    } catch (error) {
      this.logger.error('删除分片状态失败', { fileId, chunkIndex, error });
      return false;
    }
  }

  /**
   * 获取文件的所有分片状态键
   * @param fileId 文件ID
   */
  public async getChunkKeys(fileId: string): Promise<string[]> {
    try {
      const keys = await this.storageManager.keys();
      const chunkKeyPrefix = this.getChunkKeyPrefix(fileId);

      return keys.filter(key => key.startsWith(chunkKeyPrefix));
    } catch (error) {
      this.logger.error('获取分片状态键列表失败', { fileId, error });
      return [];
    }
  }

  /**
   * 清除文件的所有存储数据
   * @param fileId 文件ID
   */
  public async clearFileData(fileId: string): Promise<boolean> {
    try {
      // 清除文件元数据
      await this.removeFileMetadata(fileId);

      // 清除上传进度
      await this.removeProgress(fileId);

      // 清除所有分片状态
      const chunkKeys = await this.getChunkKeys(fileId);
      const promises = chunkKeys.map(key => this.storageManager.remove(key));
      await Promise.all(promises);

      return true;
    } catch (error) {
      this.logger.error('清除文件数据失败', { fileId, error });
      return false;
    }
  }

  /**
   * 清理过期数据
   */
  public async cleanupExpiredData(): Promise<void> {
    try {
      const now = Date.now();
      const keys = await this.storageManager.keys();
      const ourKeys = keys.filter(key => key.startsWith(this.prefix));

      for (const key of ourKeys) {
        const data = await this.storageManager.get<any>(key);

        if (data && data._timestamp) {
          if (now - data._timestamp > this.expirationTime) {
            await this.storageManager.remove(key);
            this.logger.debug('已清理过期数据', { key });
          }
        }
      }
    } catch (error) {
      this.logger.error('清理过期数据失败', { error });
    }
  }

  /**
   * 获取文件元数据键
   * @param fileId 文件ID
   */
  private getFileMetadataKey(fileId: string): string {
    return `${this.prefix}_${this.namespace}_metadata_${fileId}`;
  }

  /**
   * 获取上传进度键
   * @param fileId 文件ID
   */
  private getProgressKey(fileId: string): string {
    return `${this.prefix}_${this.namespace}_progress_${fileId}`;
  }

  /**
   * 获取分片状态键
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   */
  private getChunkStateKey(fileId: string, chunkIndex: number): string {
    return `${this.prefix}_${this.namespace}_chunk_${fileId}_${chunkIndex}`;
  }

  /**
   * 获取分片键前缀
   * @param fileId 文件ID
   */
  private getChunkKeyPrefix(fileId: string): string {
    return `${this.prefix}_${this.namespace}_chunk_${fileId}_`;
  }
}

export default ResumeStorageAdapter;
