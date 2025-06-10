import {
  IStorageAdapter,
  FileMetadata,
  IndexedDBAdapterOptions,
} from '../types';

/**
 * IndexedDB存储适配器
 * 使用IndexedDB实现大文件分块存储
 */
export class IndexedDBAdapter implements IStorageAdapter {
  /**
   * 数据库名称
   */
  private _dbName: string;

  /**
   * 数据库版本
   */
  private _dbVersion: number;

  /**
   * 数据库连接
   */
  private _db: IDBDatabase | null = null;

  /**
   * 存储空间最大值(字节)
   */
  private _storageQuota: number;

  /**
   * 数据过期时间(毫秒)
   */
  private _expirationTime: number;

  /**
   * 清理定时器ID
   */
  private _cleanupTimerId: ReturnType<typeof setInterval> | null = null;

  /**
   * 存储表名
   */
  private readonly STORES = {
    CHUNKS: 'chunks', // 文件块存储
    METADATA: 'metadata', // 文件元数据存储
    STATS: 'stats', // 存储统计信息
  };

  /**
   * 构造函数
   * @param options 选项
   */
  constructor(options: IndexedDBAdapterOptions) {
    this._dbName = options.dbName;
    this._dbVersion = options.dbVersion || 1;
    this._storageQuota = options.storageQuota || 1024 * 1024 * 1024; // 默认1GB
    this._expirationTime = options.expirationTime || 7 * 24 * 60 * 60 * 1000; // 默认7天

    // 设置自动清理
    if (options.cleanupInterval) {
      this._setupAutoCleanup(options.cleanupInterval);
    }
  }

  /**
   * 初始化数据库
   */
  public async init(): Promise<void> {
    if (this._db) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this._dbName, this._dbVersion);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建文件块存储
        if (!db.objectStoreNames.contains(this.STORES.CHUNKS)) {
          const chunkStore = db.createObjectStore(this.STORES.CHUNKS, {
            keyPath: ['fileId', 'chunkIndex'],
          });
          chunkStore.createIndex('fileId', 'fileId', { unique: false });
          chunkStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 创建文件元数据存储
        if (!db.objectStoreNames.contains(this.STORES.METADATA)) {
          const metadataStore = db.createObjectStore(this.STORES.METADATA, {
            keyPath: 'fileId',
          });
          metadataStore.createIndex('updatedAt', 'updatedAt', {
            unique: false,
          });
          metadataStore.createIndex('fileHash', 'fileHash', { unique: false });
        }

        // 创建存储统计信息
        if (!db.objectStoreNames.contains(this.STORES.STATS)) {
          db.createObjectStore(this.STORES.STATS, { keyPath: 'id' });
        }
      };

      request.onsuccess = event => {
        this._db = (event.target as IDBOpenDBRequest).result;

        // 初始化存储使用统计
        this._initStorageStats().catch(console.error);

        resolve();
      };

      request.onerror = event => {
        reject(
          new Error(
            `IndexedDB开启失败: ${(event.target as IDBOpenDBRequest).error?.message || '未知错误'}`
          )
        );
      };
    });
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
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(
      [this.STORES.CHUNKS, this.STORES.STATS],
      'readwrite'
    );
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);

    // 检查存储配额
    await this._checkStorageQuota(chunkData.size);

    return new Promise<void>((resolve, reject) => {
      const chunkObject = {
        fileId,
        chunkIndex,
        data: chunkData,
        size: chunkData.size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const request = chunkStore.put(chunkObject);

      request.onsuccess = async () => {
        // 更新存储使用统计
        await this._updateStorageStats(chunkData.size);
        resolve();
      };

      request.onerror = () => {
        reject(
          new Error(`保存文件块失败: ${request.error?.message || '未知错误'}`)
        );
      };
    });
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
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(this.STORES.CHUNKS, 'readonly');
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);

    return new Promise<Blob | null>((resolve, reject) => {
      const request = chunkStore.get([fileId, chunkIndex]);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(
          new Error(`获取文件块失败: ${request.error?.message || '未知错误'}`)
        );
      };
    });
  }

  /**
   * 检查文件块是否存在
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public async hasChunk(fileId: string, chunkIndex: number): Promise<boolean> {
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(this.STORES.CHUNKS, 'readonly');
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);

    return new Promise<boolean>((resolve, reject) => {
      const request = chunkStore.count([fileId, chunkIndex]);

      request.onsuccess = () => {
        resolve(request.result > 0);
      };

      request.onerror = () => {
        reject(
          new Error(`检查文件块失败: ${request.error?.message || '未知错误'}`)
        );
      };
    });
  }

  /**
   * 删除文件块
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  public async deleteChunk(fileId: string, chunkIndex: number): Promise<void> {
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(
      [this.STORES.CHUNKS, this.STORES.STATS],
      'readwrite'
    );
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);

    // 获取块大小用于更新存储统计
    const chunkSize = await this._getChunkSize(fileId, chunkIndex);

    return new Promise<void>((resolve, reject) => {
      const request = chunkStore.delete([fileId, chunkIndex]);

      request.onsuccess = async () => {
        if (chunkSize > 0) {
          // 更新存储使用统计
          await this._updateStorageStats(-chunkSize);
        }
        resolve();
      };

      request.onerror = () => {
        reject(
          new Error(`删除文件块失败: ${request.error?.message || '未知错误'}`)
        );
      };
    });
  }

  /**
   * 删除文件的所有块
   * @param fileId 文件唯一标识
   */
  public async deleteFileChunks(fileId: string): Promise<void> {
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(
      [this.STORES.CHUNKS, this.STORES.STATS],
      'readwrite'
    );
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);
    const fileIdIndex = chunkStore.index('fileId');

    // 获取所有块总大小用于更新存储统计
    const totalSize = await this._getFileChunksSize(fileId);

    return new Promise<void>((resolve, reject) => {
      const keyRange = IDBKeyRange.only(fileId);
      const request = fileIdIndex.openCursor(keyRange);

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest)
          .result as IDBCursorWithValue;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          // 所有块都已删除
          this._updateStorageStats(-totalSize).then(() => resolve());
        }
      };

      request.onerror = () => {
        reject(
          new Error(
            `删除文件所有块失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 获取文件块列表
   * @param fileId 文件唯一标识
   */
  public async getChunkList(fileId: string): Promise<number[]> {
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(this.STORES.CHUNKS, 'readonly');
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);
    const fileIdIndex = chunkStore.index('fileId');

    return new Promise<number[]>((resolve, reject) => {
      const chunkIndexes: number[] = [];
      const keyRange = IDBKeyRange.only(fileId);
      const request = fileIdIndex.openCursor(keyRange);

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest)
          .result as IDBCursorWithValue;
        if (cursor) {
          chunkIndexes.push(cursor.value.chunkIndex);
          cursor.continue();
        } else {
          // 排序
          chunkIndexes.sort((a, b) => a - b);
          resolve(chunkIndexes);
        }
      };

      request.onerror = () => {
        reject(
          new Error(
            `获取文件块列表失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
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
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(this.STORES.METADATA, 'readwrite');
    const metadataStore = transaction.objectStore(this.STORES.METADATA);

    return new Promise<void>((resolve, reject) => {
      // 确保更新时间
      metadata.updatedAt = Date.now();

      const request = metadataStore.put(metadata);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(
          new Error(
            `保存文件元数据失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 获取文件元数据
   * @param fileId 文件唯一标识
   */
  public async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(this.STORES.METADATA, 'readonly');
    const metadataStore = transaction.objectStore(this.STORES.METADATA);

    return new Promise<FileMetadata | null>((resolve, reject) => {
      const request = metadataStore.get(fileId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(
          new Error(
            `获取文件元数据失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 删除文件元数据
   * @param fileId 文件唯一标识
   */
  public async deleteFileMetadata(fileId: string): Promise<void> {
    await this._ensureDbReady();

    const db = this._db as IDBDatabase;
    const transaction = db.transaction(this.STORES.METADATA, 'readwrite');
    const metadataStore = transaction.objectStore(this.STORES.METADATA);

    return new Promise<void>((resolve, reject) => {
      const request = metadataStore.delete(fileId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(
          new Error(
            `删除文件元数据失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 确保数据库已准备好
   */
  private async _ensureDbReady(): Promise<void> {
    if (!this._db) {
      await this.init();
    }
  }

  /**
   * 设置自动清理
   * @param interval 清理间隔(毫秒)
   */
  private _setupAutoCleanup(interval: number): void {
    // 清除已存在的定时器
    if (this._cleanupTimerId !== null) {
      clearInterval(this._cleanupTimerId);
    }

    // 设置新的定时器
    this._cleanupTimerId = setInterval(() => {
      this.cleanup().catch(console.error);
    }, interval);
  }

  /**
   * 清理过期数据
   * @param expirationTime 过期时间(毫秒)，默认使用构造函数中设置的值
   */
  public async cleanup(expirationTime?: number): Promise<void> {
    await this._ensureDbReady();

    const expireTime = expirationTime || this._expirationTime;
    const expireDate = Date.now() - expireTime;

    // 清理过期元数据及其对应的chunks
    await this._cleanupExpiredMetadata(expireDate);

    // 清理孤立的chunks(没有对应元数据的chunks)
    await this._cleanupOrphanedChunks();
  }

  /**
   * 关闭存储连接
   */
  public async close(): Promise<void> {
    if (this._db) {
      this._db.close();
      this._db = null;
    }

    // 清除自动清理定时器
    if (this._cleanupTimerId !== null) {
      clearInterval(this._cleanupTimerId);
      this._cleanupTimerId = null;
    }
  }

  /**
   * 初始化存储统计信息
   */
  private async _initStorageStats(): Promise<void> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(this.STORES.STATS, 'readwrite');
    const statsStore = transaction.objectStore(this.STORES.STATS);

    return new Promise<void>((resolve, reject) => {
      const request = statsStore.get('usage');

      request.onsuccess = () => {
        // 如果不存在则创建
        if (!request.result) {
          statsStore.put({
            id: 'usage',
            totalSize: 0,
            totalChunks: 0,
            updatedAt: Date.now(),
          });
        }
        resolve();
      };

      request.onerror = () => {
        reject(
          new Error(
            `初始化存储统计失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 更新存储统计信息
   * @param sizeDelta 大小变化(字节)
   */
  private async _updateStorageStats(sizeDelta: number): Promise<void> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(this.STORES.STATS, 'readwrite');
    const statsStore = transaction.objectStore(this.STORES.STATS);

    return new Promise<void>((resolve, reject) => {
      const request = statsStore.get('usage');

      request.onsuccess = () => {
        const stats = request.result || {
          id: 'usage',
          totalSize: 0,
          totalChunks: 0,
          updatedAt: Date.now(),
        };

        // 更新统计信息
        stats.totalSize = Math.max(0, stats.totalSize + sizeDelta);
        stats.totalChunks =
          sizeDelta > 0
            ? stats.totalChunks + 1
            : Math.max(0, stats.totalChunks - 1);
        stats.updatedAt = Date.now();

        const updateRequest = statsStore.put(stats);

        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => {
          reject(
            new Error(
              `更新存储统计失败: ${updateRequest.error?.message || '未知错误'}`
            )
          );
        };
      };

      request.onerror = () => {
        reject(
          new Error(`获取存储统计失败: ${request.error?.message || '未知错误'}`)
        );
      };
    });
  }

  /**
   * 获取当前存储使用量
   */
  private async _getStorageUsage(): Promise<number> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(this.STORES.STATS, 'readonly');
    const statsStore = transaction.objectStore(this.STORES.STATS);

    return new Promise<number>((resolve, reject) => {
      const request = statsStore.get('usage');

      request.onsuccess = () => {
        resolve(request.result?.totalSize || 0);
      };

      request.onerror = () => {
        reject(
          new Error(
            `获取存储使用量失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 检查存储配额
   * @param additionalSize 额外大小(字节)
   */
  private async _checkStorageQuota(additionalSize: number): Promise<void> {
    const currentUsage = await this._getStorageUsage();

    if (currentUsage + additionalSize > this._storageQuota) {
      throw new Error(
        `存储空间不足，当前使用: ${currentUsage}字节，配额: ${this._storageQuota}字节`
      );
    }
  }

  /**
   * 获取块大小
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  private async _getChunkSize(
    fileId: string,
    chunkIndex: number
  ): Promise<number> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(this.STORES.CHUNKS, 'readonly');
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);

    return new Promise<number>((resolve, reject) => {
      const request = chunkStore.get([fileId, chunkIndex]);

      request.onsuccess = () => {
        resolve(request.result?.size || 0);
      };

      request.onerror = () => {
        reject(
          new Error(`获取块大小失败: ${request.error?.message || '未知错误'}`)
        );
      };
    });
  }

  /**
   * 获取文件所有块的总大小
   * @param fileId 文件唯一标识
   */
  private async _getFileChunksSize(fileId: string): Promise<number> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(this.STORES.CHUNKS, 'readonly');
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);
    const fileIdIndex = chunkStore.index('fileId');

    return new Promise<number>((resolve, reject) => {
      let totalSize = 0;
      const keyRange = IDBKeyRange.only(fileId);
      const request = fileIdIndex.openCursor(keyRange);

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest)
          .result as IDBCursorWithValue;
        if (cursor) {
          totalSize += cursor.value.size;
          cursor.continue();
        } else {
          resolve(totalSize);
        }
      };

      request.onerror = () => {
        reject(
          new Error(
            `获取文件块总大小失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 清理过期元数据及其对应的chunks
   * @param expireDate 过期时间戳
   */
  private async _cleanupExpiredMetadata(expireDate: number): Promise<void> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(
      [this.STORES.METADATA, this.STORES.CHUNKS],
      'readwrite'
    );
    const metadataStore = transaction.objectStore(this.STORES.METADATA);
    const updatedAtIndex = metadataStore.index('updatedAt');

    // 收集过期的文件ID
    const expiredFileIds: string[] = await new Promise<string[]>(
      (resolve, reject) => {
        const fileIds: string[] = [];
        const keyRange = IDBKeyRange.upperBound(expireDate);
        const request = updatedAtIndex.openCursor(keyRange);

        request.onsuccess = event => {
          const cursor = (event.target as IDBRequest)
            .result as IDBCursorWithValue;
          if (cursor) {
            fileIds.push(cursor.value.fileId);
            cursor.continue();
          } else {
            resolve(fileIds);
          }
        };

        request.onerror = () => {
          reject(
            new Error(
              `查找过期元数据失败: ${request.error?.message || '未知错误'}`
            )
          );
        };
      }
    );

    // 删除每个过期文件的元数据和分块
    for (const fileId of expiredFileIds) {
      // 删除文件分块
      await this.deleteFileChunks(fileId);

      // 删除文件元数据
      await this.deleteFileMetadata(fileId);
    }
  }

  /**
   * 清理孤立的chunks(没有对应元数据的chunks)
   */
  private async _cleanupOrphanedChunks(): Promise<void> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    // 获取所有文件ID
    const fileIds = await this._getAllFileIds();

    // 获取所有块的文件ID
    const chunkFileIds = await this._getAllChunkFileIds();

    // 找出孤立的文件ID(在chunks中但不在metadata中)
    const orphanedFileIds = chunkFileIds.filter(id => !fileIds.includes(id));

    // 删除孤立的文件块
    for (const fileId of orphanedFileIds) {
      await this.deleteFileChunks(fileId);
    }
  }

  /**
   * 获取所有文件ID
   */
  private async _getAllFileIds(): Promise<string[]> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(this.STORES.METADATA, 'readonly');
    const metadataStore = transaction.objectStore(this.STORES.METADATA);

    return new Promise<string[]>((resolve, reject) => {
      const fileIds: string[] = [];
      const request = metadataStore.openCursor();

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest)
          .result as IDBCursorWithValue;
        if (cursor) {
          fileIds.push(cursor.value.fileId);
          cursor.continue();
        } else {
          resolve(fileIds);
        }
      };

      request.onerror = () => {
        reject(
          new Error(
            `获取所有文件ID失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }

  /**
   * 获取所有块的文件ID
   */
  private async _getAllChunkFileIds(): Promise<string[]> {
    if (!this._db) {
      throw new Error('数据库未初始化');
    }

    const transaction = this._db.transaction(this.STORES.CHUNKS, 'readonly');
    const chunkStore = transaction.objectStore(this.STORES.CHUNKS);
    const fileIdIndex = chunkStore.index('fileId');

    return new Promise<string[]>((resolve, reject) => {
      const fileIds = new Set<string>();
      const request = fileIdIndex.openCursor();

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest)
          .result as IDBCursorWithValue;
        if (cursor) {
          fileIds.add(cursor.value.fileId);
          cursor.continue();
        } else {
          resolve(Array.from(fileIds));
        }
      };

      request.onerror = () => {
        reject(
          new Error(
            `获取所有块的文件ID失败: ${request.error?.message || '未知错误'}`
          )
        );
      };
    });
  }
}
