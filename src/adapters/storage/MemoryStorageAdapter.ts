import {
  FileMetadata,
  StorageEngineType,
  StorageStats,
} from '../../types/storage';
import AbstractStorageAdapter from './AbstractStorageAdapter';

/**
 * 内存存储适配器选项
 */
export interface MemoryStorageOptions {
  /**
   * 存储名称
   * @default 'memory-storage'
   */
  storageName?: string;

  /**
   * 最大存储大小(字节)
   * @default 100MB
   */
  maxSize?: number;

  /**
   * 数据过期时间(毫秒)
   * @default 24小时
   */
  expirationTime?: number;
}

/**
 * 内存存储适配器
 * 将数据存储在内存中，适用于小文件和临时存储
 * 注意：此适配器不支持持久化，页面刷新后数据会丢失
 */
export class MemoryStorageAdapter extends AbstractStorageAdapter {
  /**
   * 存储块数据的Map
   */
  private _chunkStore: Map<string, Blob> = new Map();

  /**
   * 存储元数据的Map
   */
  private _metadataStore: Map<string, FileMetadata> = new Map();

  /**
   * 块的访问时间记录
   */
  private _lastAccessed: Map<string, number> = new Map();

  /**
   * 存储选项
   */
  private _options: Required<MemoryStorageOptions>;

  /**
   * 已用存储空间(字节)
   */
  private _usedSpace = 0;

  /**
   * 构造函数
   * @param options 存储选项
   */
  constructor(options: MemoryStorageOptions = {}) {
    const storageName = options.storageName || 'memory-storage';
    super(StorageEngineType.MEMORY, storageName);

    // 设置默认选项
    this._options = {
      storageName,
      maxSize: options.maxSize || 100 * 1024 * 1024, // 默认100MB
      expirationTime: options.expirationTime || 24 * 60 * 60 * 1000, // 默认24小时
    };
  }

  /**
   * 初始化存储
   */
  public async init(): Promise<void> {
    this._initialized = true;
    return Promise.resolve();
  }

  /**
   * 保存文件块
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   * @param chunkData 块数据
   */
  public async saveChunk(
    fileId: string,
    chunkIndex: number,
    chunkData: Blob
  ): Promise<void> {
    this._validateFileId(fileId);
    this._validateChunkIndex(chunkIndex);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    // 检查存储空间
    const newSize = this._usedSpace + chunkData.size;
    if (newSize > this._options.maxSize) {
      throw new Error(
        `存储空间不足，当前已用 ${this._usedSpace} 字节，总容量 ${this._options.maxSize} 字节`
      );
    }

    const chunkKey = this._getChunkKey(fileId, chunkIndex);
    const oldChunk = this._chunkStore.get(chunkKey);

    // 如果已存在数据，需要减去旧数据大小
    if (oldChunk) {
      this._usedSpace -= oldChunk.size;
    }

    // 更新存储和统计信息
    this._chunkStore.set(chunkKey, chunkData);
    this._lastAccessed.set(chunkKey, Date.now());
    this._usedSpace += chunkData.size;

    // 更新上传状态
    await this._updateUploadedChunks(fileId, chunkIndex, true);
  }

  /**
   * 获取文件块
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public async getChunk(
    fileId: string,
    chunkIndex: number
  ): Promise<Blob | null> {
    this._validateFileId(fileId);
    this._validateChunkIndex(chunkIndex);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    const chunkKey = this._getChunkKey(fileId, chunkIndex);
    const chunk = this._chunkStore.get(chunkKey) || null;

    // 更新访问时间
    if (chunk) {
      this._lastAccessed.set(chunkKey, Date.now());
    }

    return chunk;
  }

  /**
   * 检查文件块是否存在
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public async hasChunk(fileId: string, chunkIndex: number): Promise<boolean> {
    this._validateFileId(fileId);
    this._validateChunkIndex(chunkIndex);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    const chunkKey = this._getChunkKey(fileId, chunkIndex);
    return this._chunkStore.has(chunkKey);
  }

  /**
   * 删除文件块
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public async deleteChunk(fileId: string, chunkIndex: number): Promise<void> {
    this._validateFileId(fileId);
    this._validateChunkIndex(chunkIndex);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    const chunkKey = this._getChunkKey(fileId, chunkIndex);
    const chunk = this._chunkStore.get(chunkKey);

    // 更新存储统计
    if (chunk) {
      this._usedSpace -= chunk.size;
      this._chunkStore.delete(chunkKey);
      this._lastAccessed.delete(chunkKey);

      // 更新上传状态
      await this._updateUploadedChunks(fileId, chunkIndex, false);
    }
  }

  /**
   * 获取文件块列表
   * @param fileId 文件唯一标识
   */
  public async getChunkList(fileId: string): Promise<number[]> {
    this._validateFileId(fileId);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    const chunkIndices: number[] = [];
    for (const key of this._chunkStore.keys()) {
      if (key.startsWith(`${fileId}_chunk_`)) {
        const chunkIndex = parseInt(key.split('_').pop() || '', 10);
        if (!isNaN(chunkIndex)) {
          chunkIndices.push(chunkIndex);
        }
      }
    }

    return chunkIndices.sort((a, b) => a - b);
  }

  /**
   * 保存文件元数据
   * @param fileId 文件唯一标识
   * @param metadata 文件元数据
   */
  public async saveFileMetadata(
    fileId: string,
    metadata: FileMetadata
  ): Promise<void> {
    this._validateFileId(fileId);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    const metadataKey = this._getMetadataKey(fileId);
    this._metadataStore.set(metadataKey, { ...metadata });
    this._metadataCache.set(fileId, { ...metadata });
    this._lastAccessed.set(metadataKey, Date.now());
  }

  /**
   * 获取文件元数据
   * @param fileId 文件唯一标识
   */
  public async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    this._validateFileId(fileId);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    // 先从缓存获取
    if (this._metadataCache.has(fileId)) {
      return { ...this._metadataCache.get(fileId)! };
    }

    const metadataKey = this._getMetadataKey(fileId);
    const metadata = this._metadataStore.get(metadataKey) || null;

    if (metadata) {
      // 更新缓存和访问时间
      this._metadataCache.set(fileId, { ...metadata });
      this._lastAccessed.set(metadataKey, Date.now());
      return { ...metadata };
    }

    return null;
  }

  /**
   * 删除文件元数据
   * @param fileId 文件唯一标识
   */
  public async deleteFileMetadata(fileId: string): Promise<void> {
    this._validateFileId(fileId);

    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    const metadataKey = this._getMetadataKey(fileId);
    this._metadataStore.delete(metadataKey);
    this._metadataCache.delete(fileId);
    this._lastAccessed.delete(metadataKey);
  }

  /**
   * 清理过期数据
   * @param expirationTime 过期时间(毫秒)，不传则使用默认值
   */
  public async cleanup(expirationTime?: number): Promise<void> {
    if (!this._initialized) {
      throw new Error('存储尚未初始化');
    }

    const expiration = expirationTime || this._options.expirationTime;
    const now = Date.now();
    const expiredKeys: string[] = [];

    // 收集过期项
    for (const [key, lastAccessed] of this._lastAccessed.entries()) {
      if (now - lastAccessed > expiration) {
        expiredKeys.push(key);
      }
    }

    // 删除过期数据
    for (const key of expiredKeys) {
      if (key.includes('_chunk_')) {
        const chunk = this._chunkStore.get(key);
        if (chunk) {
          this._usedSpace -= chunk.size;
          this._chunkStore.delete(key);
        }
      } else if (key.includes('_metadata')) {
        const fileId = key.replace('_metadata', '');
        this._metadataStore.delete(key);
        this._metadataCache.delete(fileId);
      }

      this._lastAccessed.delete(key);
    }
  }

  /**
   * 关闭存储连接
   */
  public async close(): Promise<void> {
    if (!this._initialized) {
      return;
    }

    this._chunkStore.clear();
    this._metadataStore.clear();
    this._lastAccessed.clear();
    this._usedSpace = 0;

    await super.close();
  }

  /**
   * 获取存储统计信息
   */
  public async getStats(): Promise<StorageStats> {
    const fileCount = new Set(
      [...this._metadataStore.keys()].map(key =>
        key.substring(0, key.lastIndexOf('_'))
      )
    ).size;

    return {
      usedSpace: this._usedSpace,
      totalSpace: this._options.maxSize,
      fileCount,
      chunkCount: this._chunkStore.size,
      lastAccessed: Math.max(
        ...(Array.from(this._lastAccessed.values()).length
          ? Array.from(this._lastAccessed.values())
          : [0])
      ),
    };
  }
}

export default MemoryStorageAdapter;
