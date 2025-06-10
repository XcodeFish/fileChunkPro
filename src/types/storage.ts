/**
 * storage.ts
 * 存储适配器相关类型定义
 */

/**
 * 存储适配器接口
 * 定义存储适配器必须实现的方法
 */
export interface IStorageAdapter {
  /**
   * 初始化存储
   */
  init(): Promise<void>;
  
  /**
   * 保存文件块
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   * @param chunkData 块数据
   */
  saveChunk(fileId: string, chunkIndex: number, chunkData: Blob): Promise<void>;
  
  /**
   * 获取文件块
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  getChunk(fileId: string, chunkIndex: number): Promise<Blob | null>;
  
  /**
   * 检查文件块是否存在
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  hasChunk(fileId: string, chunkIndex: number): Promise<boolean>;
  
  /**
   * 删除文件块
   * @param fileId 文件唯一标识
   * @param chunkIndex 块索引
   */
  deleteChunk(fileId: string, chunkIndex: number): Promise<void>;
  
  /**
   * 删除文件的所有块
   * @param fileId 文件唯一标识
   */
  deleteFileChunks(fileId: string): Promise<void>;
  
  /**
   * 获取文件块列表
   * @param fileId 文件唯一标识
   */
  getChunkList(fileId: string): Promise<number[]>;
  
  /**
   * 保存文件元数据
   * @param fileId 文件唯一标识
   * @param metadata 文件元数据
   */
  saveFileMetadata(fileId: string, metadata: FileMetadata): Promise<void>;
  
  /**
   * 获取文件元数据
   * @param fileId 文件唯一标识
   */
  getFileMetadata(fileId: string): Promise<FileMetadata | null>;
  
  /**
   * 删除文件元数据
   * @param fileId 文件唯一标识
   */
  deleteFileMetadata(fileId: string): Promise<void>;
  
  /**
   * 清理过期数据
   * @param expirationTime 过期时间(毫秒)
   */
  cleanup(expirationTime?: number): Promise<void>;
  
  /**
   * 关闭存储连接
   */
  close(): Promise<void>;
  
  /**
   * 获取存储统计信息
   */
  getStats?(): Promise<StorageStats>;
}

/**
 * 文件元数据
 */
export interface FileMetadata {
  /**
   * 文件唯一标识
   */
  fileId: string;
  
  /**
   * 文件名
   */
  fileName: string;
  
  /**
   * 文件大小(字节)
   */
  fileSize: number;
  
  /**
   * 文件类型
   */
  fileType: string;
  
  /**
   * 文件哈希值(可用于秒传)
   */
  fileHash?: string;
  
  /**
   * 分片大小(字节)
   */
  chunkSize: number;
  
  /**
   * 总分片数
   */
  totalChunks: number;
  
  /**
   * 已上传的分片索引
   */
  uploadedChunks?: number[];
  
  /**
   * 创建时间
   */
  createdAt: number;
  
  /**
   * 更新时间
   */
  updatedAt: number;
  
  /**
   * 自定义数据
   */
  customData?: Record<string, any>;
}

/**
 * IndexedDB存储适配器选项
 */
export interface IndexedDBAdapterOptions {
  /**
   * 数据库名称
   */
  dbName: string;
  
  /**
   * 数据库版本
   */
  dbVersion?: number;
  
  /**
   * 存储空间最大值(字节)
   */
  storageQuota?: number;
  
  /**
   * 数据过期时间(毫秒)
   */
  expirationTime?: number;
  
  /**
   * 自动清理间隔(毫秒)
   */
  cleanupInterval?: number;
} 

/**
 * 存储统计信息
 */
export interface StorageStats {
  /**
   * 已用存储空间(字节)
   */
  usedSpace: number;
  
  /**
   * 总存储空间(字节)，如果可计算
   */
  totalSpace?: number;
  
  /**
   * 总文件数
   */
  fileCount: number;
  
  /**
   * 总块数
   */
  chunkCount: number;
  
  /**
   * 最后访问时间
   */
  lastAccessed?: number;
  
  /**
   * 自定义统计信息
   */
  custom?: Record<string, any>;
}

/**
 * 存储插件选项
 */
export interface StoragePluginOptions {
  /**
   * 是否覆盖默认存储适配器
   * @default false
   */
  overrideDefault?: boolean;
  
  /**
   * 自定义存储键名，用于注册多个存储适配器
   * @default 'custom-storage'
   */
  storageKey?: string;
  
  /**
   * 上传完成后是否自动清理存储数据
   * @default false
   */
  cleanupOnComplete?: boolean;
  
  /**
   * 文件元数据扩展函数，用于添加自定义元数据
   * @param file 文件对象
   */
  fileMetadataExtension?: (file: File) => Record<string, any>;
  
  /**
   * 存储优先级，数字越小优先级越高
   * @default 100
   */
  priority?: number;
}

/**
 * 存储引擎类型
 */
export enum StorageEngineType {
  /**
   * 内存存储
   */
  MEMORY = 'memory',
  
  /**
   * IndexedDB存储
   */
  INDEXED_DB = 'indexeddb',
  
  /**
   * 文件系统API存储
   */
  FILE_SYSTEM = 'filesystem',
  
  /**
   * 本地存储(LocalStorage)
   */
  LOCAL_STORAGE = 'localstorage',
  
  /**
   * 服务端存储
   */
  SERVER = 'server',
  
  /**
   * 自定义存储
   */
  CUSTOM = 'custom'
}