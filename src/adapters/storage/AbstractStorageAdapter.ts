import {
  FileMetadata,
  IStorageAdapter,
  StorageEngineType,
  StorageStats,
} from '../../types/storage';

/**
 * 抽象存储适配器
 * 为自定义存储适配器提供基础实现
 */
export abstract class AbstractStorageAdapter implements IStorageAdapter {
  /**
   * 存储引擎类型
   */
  protected _engineType: StorageEngineType;

  /**
   * 存储名称
   */
  protected _storageName: string;

  /**
   * 是否已初始化
   */
  protected _initialized = false;

  /**
   * 文件元数据缓存
   */
  protected _metadataCache: Map<string, FileMetadata> = new Map();

  /**
   * 构造函数
   * @param engineType 存储引擎类型
   * @param storageName 存储名称
   */
  constructor(engineType: StorageEngineType, storageName: string) {
    this._engineType = engineType;
    this._storageName = storageName;
  }

  /**
   * 获取存储引擎类型
   */
  public getEngineType(): StorageEngineType {
    return this._engineType;
  }

  /**
   * 获取存储名称
   */
  public getStorageName(): string {
    return this._storageName;
  }

  /**
   * 检查是否已初始化
   */
  public isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 初始化存储
   * 子类必须实现此方法
   */
  public abstract init(): Promise<void>;

  /**
   * 保存文件块
   * 子类必须实现此方法
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   * @param chunkData 块数据
   */
  public abstract saveChunk(
    fileId: string,
    chunkIndex: number,
    chunkData: Blob
  ): Promise<void>;

  /**
   * 获取文件块
   * 子类必须实现此方法
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public abstract getChunk(
    fileId: string,
    chunkIndex: number
  ): Promise<Blob | null>;

  /**
   * 检查文件块是否存在
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public abstract hasChunk(
    fileId: string,
    chunkIndex: number
  ): Promise<boolean>;

  /**
   * 删除文件块
   * 子类必须实现此方法
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public abstract deleteChunk(
    fileId: string,
    chunkIndex: number
  ): Promise<void>;

  /**
   * 删除文件的所有块
   * 默认实现是获取块列表然后逐个删除
   * 子类可以重写此方法以提供更高效的实现
   * @param fileId 文件唯一标识
   */
  public async deleteFileChunks(fileId: string): Promise<void> {
    try {
      const chunkList = await this.getChunkList(fileId);
      await Promise.all(
        chunkList.map(chunkIndex => this.deleteChunk(fileId, chunkIndex))
      );
    } catch (error) {
      throw new Error(`删除文件块失败: ${error.message}`);
    }
  }

  /**
   * 获取文件块列表
   * 子类必须实现此方法
   * @param fileId 文件唯一标识
   */
  public abstract getChunkList(fileId: string): Promise<number[]>;

  /**
   * 保存文件元数据
   * 子类必须实现此方法
   * @param fileId 文件唯一标识
   * @param metadata 文件元数据
   */
  public abstract saveFileMetadata(
    fileId: string,
    metadata: FileMetadata
  ): Promise<void>;

  /**
   * 获取文件元数据
   * 子类必须实现此方法
   * @param fileId 文件唯一标识
   */
  public abstract getFileMetadata(fileId: string): Promise<FileMetadata | null>;

  /**
   * 删除文件元数据
   * 子类必须实现此方法
   * @param fileId 文件唯一标识
   */
  public abstract deleteFileMetadata(fileId: string): Promise<void>;

  /**
   * 清理过期数据
   * 子类必须实现此方法
   * @param expirationTime 过期时间(毫秒)
   */
  public abstract cleanup(expirationTime?: number): Promise<void>;

  /**
   * 关闭存储连接
   * 默认实现是清空元数据缓存
   * 子类可以重写此方法以提供更多清理操作
   */
  public async close(): Promise<void> {
    this._metadataCache.clear();
    this._initialized = false;
  }

  /**
   * 获取存储统计信息
   * 默认返回基本统计信息
   * 子类可以重写此方法以提供更详细的统计
   */
  public async getStats(): Promise<StorageStats> {
    return {
      usedSpace: 0,
      fileCount: this._metadataCache.size,
      chunkCount: 0,
      lastAccessed: Date.now(),
    };
  }

  /**
   * 生成文件块键
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  protected _getChunkKey(fileId: string, chunkIndex: number): string {
    return `${fileId}_chunk_${chunkIndex}`;
  }

  /**
   * 生成文件元数据键
   * @param fileId 文件唯一标识
   */
  protected _getMetadataKey(fileId: string): string {
    return `${fileId}_metadata`;
  }

  /**
   * 更新文件元数据中的已上传分片信息
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   * @param isUploaded 是否已上传
   */
  protected async _updateUploadedChunks(
    fileId: string,
    chunkIndex: number,
    isUploaded: boolean
  ): Promise<void> {
    const metadata = await this.getFileMetadata(fileId);
    if (!metadata) return;

    if (!metadata.uploadedChunks) {
      metadata.uploadedChunks = [];
    }

    if (isUploaded && !metadata.uploadedChunks.includes(chunkIndex)) {
      metadata.uploadedChunks.push(chunkIndex);
    } else if (!isUploaded) {
      metadata.uploadedChunks = metadata.uploadedChunks.filter(
        i => i !== chunkIndex
      );
    }

    metadata.updatedAt = Date.now();
    await this.saveFileMetadata(fileId, metadata);
  }

  /**
   * 校验文件ID格式
   * @param fileId 文件唯一标识
   */
  protected _validateFileId(fileId: string): void {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('文件ID必须是非空字符串');
    }
  }

  /**
   * 校验块索引
   * @param chunkIndex 块索引
   */
  protected _validateChunkIndex(chunkIndex: number): void {
    if (
      typeof chunkIndex !== 'number' ||
      chunkIndex < 0 ||
      !Number.isInteger(chunkIndex)
    ) {
      throw new Error('块索引必须是非负整数');
    }
  }
}

export default AbstractStorageAdapter;
