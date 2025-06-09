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

// 尝试导入Taro，用于taro存储适配器
let Taro: any;
try {
  // 在浏览器环境中可能会失败，使用动态导入避免直接报错
  Taro = require('@tarojs/taro');
} catch (e) {
  // 忽略导入错误
}

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
  errors?: ErrorInfo[]; // 上传错误信息
  fingerprint?: string; // 文件指纹
  resumeAttempts?: number; // 恢复尝试次数
}

/**
 * 错误信息结构
 */
interface ErrorInfo {
  type: string;
  message: string;
  timestamp?: number;
  chunkIndex?: number; // 出错的分片索引
  attemptCount?: number; // 尝试次数
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
 * 文件指纹算法类型
 */
export type FingerprintAlgorithm = 'md5' | 'sha1' | 'simple';

/**
 * 断点续传插件配置选项
 */
export interface ResumeOptions {
  enabled?: boolean; // 是否启用断点续传
  storageType?: StorageType; // 存储类型
  keyPrefix?: string; // 存储键前缀
  expiryTime?: number; // 过期时间(毫秒)
  fingerprintAlgorithm?: FingerprintAlgorithm; // 文件指纹算法
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
  maxResumeAttempts?: number; // 最大恢复尝试次数
  alternativeStorages?: StorageType[]; // 备选存储类型，当主存储不可用时使用
  autoSyncStorages?: boolean; // 是否自动同步不同存储的数据
  storeProgressOnPause?: boolean; // 是否在暂停时保存进度
  useStrictFingerprint?: boolean; // 是否使用严格的文件指纹校验
}

/**
 * 断点续传插件
 * 实现断点续传功能增强
 */
export class ResumePlugin implements IPlugin {
  public readonly version = '2.0.0';
  private options: ResumeOptions;
  private storage: IStorage;
  private backupStorages: IStorage[] = []; // 备用存储
  private uploader: UploaderCore | null = null;
  private sessionId: string;
  private progressTimers: Map<string, number> = new Map();
  private readonly DEFAULT_EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7天
  private readonly DEFAULT_PERSIST_INTERVAL = 1000; // 1秒
  private pendingChunkSaves: Map<string, Set<number>> = new Map(); // 等待保存的分片进度
  private lastCompletePersistTime: Map<string, number> = new Map(); // 上次完整持久化时间
  private resumeInProgress: Map<string, boolean> = new Map(); // 正在恢复的上传
  private fileFingerprints: Map<string, string> = new Map(); // 文件指纹缓存

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
      maxResumeAttempts: 3, // 最多尝试恢复3次
      alternativeStorages: ['memoryStorage'], // 默认内存作为备用存储
      autoSyncStorages: true, // 默认自动同步存储
      storeProgressOnPause: true, // 默认在暂停时保存进度
      useStrictFingerprint: false, // 默认不使用严格指纹校验
      ...options,
    };

    // 生成唯一会话ID
    this.sessionId = this.generateSessionId();

    // 初始化主存储
    this.storage = this.initStorage(this.options.storageType);

    // 初始化备用存储
    if (
      this.options.alternativeStorages &&
      this.options.alternativeStorages.length > 0
    ) {
      for (const storageType of this.options.alternativeStorages) {
        if (storageType !== this.options.storageType) {
          const backupStorage = this.initStorage(storageType);
          if (backupStorage) {
            this.backupStorages.push(backupStorage);
          }
        }
      }
    }

    // 如果启用了自动清理过期数据，则立即执行清理
    if (this.options.autoCleanExpired) {
      this.cleanExpiredItems().catch(err =>
        this.log('error', '清理过期数据失败', err)
      );
    }

    // 如果启用了自动同步存储，立即同步一次
    if (this.options.autoSyncStorages && this.backupStorages.length > 0) {
      this.syncStorages().catch(err =>
        this.log('error', '同步存储数据失败', err)
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
   * @param storageType 存储类型
   * @returns 存储接口实现
   */
  private initStorage(storageType: StorageType | undefined): IStorage {
    const env = EnvUtils.detectEnvironment();

    // 如果提供了自定义存储，则优先使用
    if (storageType === 'custom' && this.options.customStorage) {
      return this.options.customStorage;
    }

    // 根据指定的存储类型创建存储适配器
    switch (storageType) {
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

      case 'memoryStorage':
        return new MemoryStorageAdapter({ prefix: this.options.keyPrefix });

      // 针对小程序环境的存储实现
      case 'miniprogram':
        if (typeof wx !== 'undefined') {
          return this.createMiniprogramStorage('wx');
        } else if (typeof my !== 'undefined') {
          return this.createMiniprogramStorage('my');
        } else if (typeof tt !== 'undefined') {
          return this.createMiniprogramStorage('tt');
        } else if (typeof swan !== 'undefined') {
          return this.createMiniprogramStorage('swan');
        }
        break;

      case 'taroStorage':
        if (Taro) {
          return this.createTaroStorage(Taro);
        }
        break;

      case 'uniappStorage':
        if (typeof uni !== 'undefined') {
          return this.createUniAppStorage();
        }
        break;
    }

    // 默认使用内存存储
    this.log('warn', `未找到支持的存储方式 ${storageType}，回退到内存存储`);
    return new MemoryStorageAdapter({ prefix: this.options.keyPrefix });
  }

  /**
   * 创建小程序存储适配器
   */
  private createMiniprogramStorage(
    type: 'wx' | 'my' | 'tt' | 'swan'
  ): IStorage {
    // 获取小程序对象
    const mp =
      type === 'wx' ? wx : type === 'my' ? my : type === 'tt' ? tt : swan;

    return {
      getItem: async <T>(key: string): Promise<T | null> => {
        try {
          return new Promise<T | null>(resolve => {
            mp.getStorage({
              key: this.options.keyPrefix + key,
              success: (res: any) => resolve(res.data),
              fail: () => resolve(null),
            });
          });
        } catch (e) {
          return null;
        }
      },

      setItem: async <T>(key: string, value: T): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          mp.setStorage({
            key: this.options.keyPrefix + key,
            data: value,
            success: () => resolve(),
            fail: (e: any) => reject(new Error(`存储失败: ${e.errMsg}`)),
          });
        });
      },

      removeItem: async (key: string): Promise<void> => {
        return new Promise<void>(resolve => {
          mp.removeStorage({
            key: this.options.keyPrefix + key,
            success: () => resolve(),
            fail: () => resolve(),
          });
        });
      },

      clear: async (): Promise<void> => {
        try {
          const keys = await this.keys();
          for (const key of keys) {
            await this.removeItem(key);
          }
        } catch {
          // 忽略错误
        }
      },

      keys: async (): Promise<string[]> => {
        return new Promise<string[]>(resolve => {
          mp.getStorageInfo({
            success: (res: any) => {
              const keys = (res.keys || [])
                .filter((k: string) =>
                  k.startsWith(this.options.keyPrefix || '')
                )
                .map((k: string) =>
                  k.substring((this.options.keyPrefix || '').length)
                );
              resolve(keys);
            },
            fail: () => resolve([]),
          });
        });
      },
    };
  }

  /**
   * 创建Taro存储适配器
   */
  private createTaroStorage(taroInstance: any): IStorage {
    const taroAPI = taroInstance;
    return {
      getItem: async <T>(key: string): Promise<T | null> => {
        try {
          const res = await taroAPI.getStorage({
            key: this.options.keyPrefix + key,
          });
          return res.data;
        } catch (e) {
          return null;
        }
      },

      setItem: async <T>(key: string, value: T): Promise<void> => {
        await taroAPI.setStorage({
          key: this.options.keyPrefix + key,
          data: value,
        });
      },

      removeItem: async (key: string): Promise<void> => {
        try {
          await taroAPI.removeStorage({ key: this.options.keyPrefix + key });
        } catch {
          // 忽略错误
        }
      },

      clear: async (): Promise<void> => {
        try {
          const keys = await this.keys();
          for (const key of keys) {
            await this.removeItem(key);
          }
        } catch {
          // 忽略错误
        }
      },

      keys: async (): Promise<string[]> => {
        try {
          const res = await taroAPI.getStorageInfo();
          return (res.keys || [])
            .filter((k: string) => k.startsWith(this.options.keyPrefix || ''))
            .map((k: string) =>
              k.substring((this.options.keyPrefix || '').length)
            );
        } catch {
          return [];
        }
      },
    };
  }

  /**
   * 创建UniApp存储适配器
   */
  private createUniAppStorage(): IStorage {
    return {
      getItem: async <T>(key: string): Promise<T | null> => {
        try {
          const data = uni.getStorageSync(this.options.keyPrefix + key);
          return data || null;
        } catch (e) {
          return null;
        }
      },

      setItem: async <T>(key: string, value: T): Promise<void> => {
        try {
          uni.setStorageSync(this.options.keyPrefix + key, value);
        } catch (e) {
          throw new Error(`UniApp存储失败: ${e}`);
        }
      },

      removeItem: async (key: string): Promise<void> => {
        try {
          uni.removeStorageSync(this.options.keyPrefix + key);
        } catch {
          // 忽略错误
        }
      },

      clear: async (): Promise<void> => {
        try {
          const keys = await this.keys();
          for (const key of keys) {
            await this.removeItem(key);
          }
        } catch {
          // 忽略错误
        }
      },

      keys: async (): Promise<string[]> => {
        try {
          const res = uni.getStorageInfoSync();
          return (res.keys || [])
            .filter(k => k.startsWith(this.options.keyPrefix || ''))
            .map(k => k.substring((this.options.keyPrefix || '').length));
        } catch {
          return [];
        }
      },
    };
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
    uploader.on('uploadPaused', this.handleUploadPaused.bind(this));
    uploader.on('uploadResumed', this.handleUploadResumed.bind(this));
    uploader.on('uploadCancelled', this.handleUploadCancelled.bind(this));

    // 监听创建分片前的钩子，用于恢复上传
    uploader.hook('beforeCreateChunks', this.beforeCreateChunks.bind(this));

    // 注册上传开始事件，用于初始化进度信息
    uploader.on('uploadStart', this.handleUploadStart.bind(this));

    // 设置插件优先级（如果UploaderCore支持此方法）
    if (typeof uploader.setPluginPriority === 'function') {
      uploader.setPluginPriority('ResumePlugin', PluginPriority.HIGH);
    }
  }

  /**
   * 同步不同存储之间的数据
   * 用于提高数据可靠性
   */
  private async syncStorages(): Promise<void> {
    if (this.backupStorages.length === 0) return;

    try {
      // 从主存储获取所有键
      const primaryKeys = await this.storage.keys();

      // 对每个键执行同步
      for (const key of primaryKeys) {
        const data = await this.storage.getItem(key);

        // 数据存在且有效
        if (data) {
          // 同步到所有备份存储
          for (const backupStorage of this.backupStorages) {
            await backupStorage.setItem(key, data).catch(() => {
              // 忽略备份存储写入错误
            });
          }
        }
      }

      this.log('debug', '存储同步完成');
    } catch (error) {
      this.log('error', '存储同步失败', error);
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
      // 清除进度保存定时器
      this.clearProgressTimer(fileId);

      // 检查是否有未完成的上传
      const existingProgress = await this.getFileProgress(fileId);

      // 如果没有现有进度或不启用自动恢复，则初始化新的进度信息
      if (!existingProgress || !this.options.autoResume) {
        // 计算文件指纹
        const fingerprint = await this.calculateFileFingerprint(info);

        // 创建新的进度信息
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
          fingerprint,
          resumeAttempts: 0,
        };

        // 保存文件的MIME类型(如果有)
        if (info.fileType) {
          newProgress.fileType = info.fileType as string;
        }

        // 保存上传URL(如果有)
        if (info.uploadUrl) {
          newProgress.uploadUrl = info.uploadUrl as string;
        }

        // 保存文件MD5(如果有)
        if (info.fileMd5) {
          newProgress.fileMd5 = info.fileMd5 as string;
        }

        // 保存进度信息
        await this.saveFileProgress(fileId, newProgress);

        // 设置暂存分片集合
        this.pendingChunkSaves.set(fileId, new Set());

        // 记录最后完整持久化时间
        this.lastCompletePersistTime.set(fileId, Date.now());

        this.log('debug', `初始化上传进度 ${fileName} (${fileId})`);
      } else {
        // 标记为正在恢复的上传
        this.resumeInProgress.set(fileId, true);

        // 增加恢复尝试次数
        existingProgress.resumeAttempts =
          (existingProgress.resumeAttempts || 0) + 1;

        // 更新会话ID和最后更新时间
        existingProgress.sessionId = this.sessionId;
        existingProgress.lastUpdated = Date.now();

        // 更新现有进度信息
        await this.saveFileProgress(fileId, existingProgress);

        // 设置暂存分片集合并填充已上传的分片
        const pendingSet = new Set<number>();
        for (let i = 0; i < existingProgress.totalChunks; i++) {
          if (!existingProgress.uploadedChunks.includes(i)) {
            pendingSet.add(i);
          }
        }
        this.pendingChunkSaves.set(fileId, pendingSet);

        // 记录最后完整持久化时间
        this.lastCompletePersistTime.set(fileId, Date.now());

        this.log(
          'info',
          `恢复上传 ${fileName} (${fileId}), 已上传 ${existingProgress.uploadedChunks.length}/${existingProgress.totalChunks} 分片`
        );
      }

      // 启动定时保存进度
      this.startProgressTimer(fileId);
    } catch (error) {
      this.log(
        'error',
        `初始化上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 创建分片前的钩子处理
   * 用于恢复上传
   */
  private async beforeCreateChunks(
    params: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (!this.options.enabled || !this.options.autoResume || !params.fileId) {
      return params;
    }

    const fileId = params.fileId as string;

    try {
      // 获取已保存的上传进度
      const progress = await this.getFileProgress(fileId);

      // 没有找到进度，继续正常上传
      if (!progress) {
        return params;
      }

      // 如果设置了严格文件指纹校验，检查文件指纹是否匹配
      if (this.options.useStrictFingerprint && progress.fingerprint) {
        // 从参数中获取文件对象，计算当前文件的指纹
        const currentFingerprint = await this.calculateFileFingerprint(params);

        // 如果指纹不匹配，说明不是同一个文件，不应该恢复
        if (currentFingerprint !== progress.fingerprint) {
          this.log('warn', `文件指纹不匹配，不恢复上传: ${fileId}`);
          // 清除旧的进度记录
          await this.clearProgress(fileId);
          return params;
        }
      }

      // 如果恢复尝试次数超过最大值，不再恢复
      if (
        progress.resumeAttempts !== undefined &&
        progress.resumeAttempts >= (this.options.maxResumeAttempts || 3)
      ) {
        this.log(
          'warn',
          `恢复尝试次数超过限制(${progress.resumeAttempts}次)，重新上传: ${fileId}`
        );
        await this.clearProgress(fileId);
        return params;
      }

      // 部分上传检测：如果启用了分片上传检测并且有已上传的分片
      if (this.options.partialDetection && progress.uploadedChunks.length > 0) {
        // 修改参数，跳过已上传的分片
        return {
          ...params,
          uploadedChunks: progress.uploadedChunks,
          resumeFrom: Math.max(...progress.uploadedChunks) + 1,
          resumeInfo: {
            totalChunks: progress.totalChunks,
            progress: progress.progress,
            lastUpdated: progress.lastUpdated,
          },
        };
      }
    } catch (error) {
      this.log(
        'error',
        `恢复上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return params;
  }

  /**
   * 获取/生成文件唯一ID
   */
  private async getFileId(file: {
    size: number;
    name: string;
  }): Promise<string> {
    // 如果上传器支持获取文件ID，则使用其方法
    if (
      this.uploader &&
      typeof (this.uploader as any).getFileId === 'function'
    ) {
      return await (this.uploader as any).getFileId(file);
    }

    // 否则生成基于文件名和大小的简单ID
    return `${file.name}_${file.size}_${Date.now()}`;
  }

  /**
   * 检测上传器是否支持文件MD5计算
   */
  private hasFileMd5Method(): boolean {
    if (!this.uploader) return false;

    // 检查上传器是否有计算文件MD5的方法
    return typeof (this.uploader as any).calculateFileMd5 === 'function';
  }

  /**
   * 计算文件指纹
   * 根据配置选择合适的指纹算法
   */
  private async calculateFileFingerprint(info: unknown): Promise<string> {
    const { fingerprintAlgorithm } = this.options;

    try {
      // 如果已有指纹缓存，直接返回
      const fileId = (info as any).fileId as string;
      if (fileId && this.fileFingerprints.has(fileId)) {
        return this.fileFingerprints.get(fileId) as string;
      }

      let fingerprint: string;

      // 如果上传器支持MD5计算并且指定使用MD5算法
      if (
        fingerprintAlgorithm === 'md5' &&
        this.hasFileMd5Method() &&
        (info as any).file
      ) {
        fingerprint = await (this.uploader as any).calculateFileMd5(
          (info as any).file
        );
      }
      // 使用简单算法
      else {
        const file = (info as any).file;
        const fileName =
          (info as any).fileName || (file ? file.name : 'unknown');
        const fileSize = (info as any).fileSize || (file ? file.size : 0);
        const lastModified =
          file && file.lastModified ? file.lastModified : Date.now();

        // 组合文件属性生成简单指纹
        fingerprint = `${fileName}_${fileSize}_${lastModified}`;
      }

      // 缓存指纹
      if (fileId) {
        this.fileFingerprints.set(fileId, fingerprint);
      }

      return fingerprint;
    } catch (error) {
      this.log('error', '计算文件指纹失败', error);
      // 返回基于时间戳的后备指纹
      return `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
  }

  /**
   * 处理分片上传成功事件
   */
  private async handleChunkSuccess(info: {
    fileId: string;
    chunk: ChunkInfo;
  }): Promise<void> {
    if (!this.options.enabled || !info.fileId) return;

    const { fileId, chunk } = info;

    try {
      // 记录成功上传的分片
      await this.saveChunkProgress(fileId, chunk);

      // 添加到暂存集合
      const pendingChunks = this.pendingChunkSaves.get(fileId);
      if (pendingChunks) {
        pendingChunks.add(chunk.index);
      }

      // 更新内存中的最后持久化时间
      this.lastCompletePersistTime.set(fileId, Date.now());
    } catch (error) {
      this.log(
        'error',
        `保存分片进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 处理上传完成事件
   */
  private async handleUploadComplete(info: { fileId: string }): Promise<void> {
    if (!this.options.enabled || !info.fileId) return;

    const { fileId } = info;

    try {
      // 清除进度保存定时器
      this.clearProgressTimer(fileId);

      // 清除上传进度信息
      await this.clearProgress(fileId);

      // 清除暂存分片集合
      this.pendingChunkSaves.delete(fileId);
      this.lastCompletePersistTime.delete(fileId);
      this.resumeInProgress.delete(fileId);

      // 清除文件指纹缓存
      this.fileFingerprints.delete(fileId);

      this.log('debug', `上传完成，清除进度信息: ${fileId}`);
    } catch (error) {
      this.log(
        'error',
        `清除进度信息失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 处理上传错误事件
   */
  private async handleError(error: any): Promise<void> {
    // 如果未启用断点续传或错误对象无效，则直接返回
    if (!this.options.enabled || !error || typeof error !== 'object') return;

    // 获取文件ID
    const fileId = error.fileId || (error.source && error.source.fileId);
    if (!fileId) return;

    try {
      // 只有非致命错误才保存进度
      if (!this.isTerminalError(error)) {
        // 保存错误信息
        await this.saveUploadError(fileId, {
          type: error.type || 'UNKNOWN_ERROR',
          message: error.message || '未知错误',
          chunkInfo: error.chunkInfo,
        });
      } else {
        // 清除进度保存定时器
        this.clearProgressTimer(fileId);

        // 如果是致命错误，清除上传进度
        await this.clearProgress(fileId);

        // 清除暂存信息
        this.pendingChunkSaves.delete(fileId);
        this.lastCompletePersistTime.delete(fileId);
        this.resumeInProgress.delete(fileId);
      }
    } catch (err) {
      this.log(
        'error',
        `处理上传错误失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * 处理上传进度事件
   */
  private async handleProgress(info: any): Promise<void> {
    if (!this.options.enabled || !info || !info.fileId) return;

    const { fileId, progress } = info;

    try {
      // 获取当前进度信息
      const progressInfo = await this.getFileProgress(fileId);

      if (progressInfo) {
        // 更新进度
        progressInfo.progress = progress;
        progressInfo.lastUpdated = Date.now();

        // 保存进度信息
        await this.persistProgress(fileId);
      }
    } catch (error) {
      this.log(
        'debug',
        `更新上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 处理上传暂停事件
   */
  private async handleUploadPaused(info: { fileId: string }): Promise<void> {
    if (
      !this.options.enabled ||
      !info.fileId ||
      !this.options.storeProgressOnPause
    )
      return;

    const { fileId } = info;

    try {
      // 获取当前进度信息
      const progressInfo = await this.getFileProgress(fileId);

      if (progressInfo) {
        // 更新最后更新时间
        progressInfo.lastUpdated = Date.now();

        // 立即保存进度信息
        await this.saveFileProgress(fileId, progressInfo);

        this.log('debug', `已保存暂停状态: ${fileId}`);
      }
    } catch (error) {
      this.log(
        'error',
        `保存暂停状态失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 处理上传恢复事件
   */
  private async handleUploadResumed(info: { fileId: string }): Promise<void> {
    if (!this.options.enabled || !info.fileId) return;

    const { fileId } = info;

    // 恢复进度保存定时器
    this.startProgressTimer(fileId);
  }

  /**
   * 处理上传取消事件
   */
  private async handleUploadCancelled(info: { fileId: string }): Promise<void> {
    if (!this.options.enabled || !info.fileId) return;

    const { fileId } = info;

    try {
      // 清除进度保存定时器
      this.clearProgressTimer(fileId);

      // 清除上传进度信息
      await this.clearProgress(fileId);

      // 清除暂存信息
      this.pendingChunkSaves.delete(fileId);
      this.lastCompletePersistTime.delete(fileId);
      this.resumeInProgress.delete(fileId);
      this.fileFingerprints.delete(fileId);

      this.log('debug', `上传取消，清除进度信息: ${fileId}`);
    } catch (error) {
      this.log(
        'error',
        `清除取消上传进度信息失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 保存分片上传进度
   */
  private async saveChunkProgress(
    fileId: string,
    chunk: ChunkInfo
  ): Promise<void> {
    try {
      // 获取已保存的进度信息
      const progressInfo = await this.getFileProgress(fileId);

      if (!progressInfo) {
        this.log('warn', `未找到上传进度信息: ${fileId}`);
        return;
      }

      // 检查分片是否已记录
      if (!progressInfo.uploadedChunks.includes(chunk.index)) {
        // 添加分片信息
        progressInfo.uploadedChunks.push(chunk.index);

        // 对分片索引排序
        progressInfo.uploadedChunks.sort((a, b) => a - b);

        // 保存分片信息(可选)
        const existingChunkIdx = progressInfo.chunks.findIndex(
          c => c.index === chunk.index
        );
        if (existingChunkIdx >= 0) {
          progressInfo.chunks[existingChunkIdx] = chunk;
        } else {
          progressInfo.chunks.push(chunk);
        }

        // 更新最后更新时间
        progressInfo.lastUpdated = Date.now();

        // 计算上传进度
        progressInfo.progress =
          (progressInfo.uploadedChunks.length / progressInfo.totalChunks) * 100;
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
   */
  private async saveUploadError(
    fileId: string,
    error: { type?: string; message?: string; chunkInfo?: { index: number } }
  ): Promise<void> {
    try {
      // 获取已保存的进度信息
      const progressInfo = await this.getFileProgress(fileId);

      if (!progressInfo) {
        this.log('warn', `未找到上传进度信息: ${fileId}`);
        return;
      }

      // 创建错误信息
      const errorInfo: ErrorInfo = {
        type: error.type || 'UNKNOWN_ERROR',
        message: error.message || '未知错误',
        timestamp: Date.now(),
      };

      // 如果有分片信息，记录出错的分片索引
      if (error.chunkInfo && typeof error.chunkInfo.index === 'number') {
        errorInfo.chunkIndex = error.chunkInfo.index;
      }

      // 检查是否已有相同分片的错误
      if (progressInfo.errors && errorInfo.chunkIndex !== undefined) {
        const existingErrorIdx = progressInfo.errors.findIndex(
          e => e.chunkIndex === errorInfo.chunkIndex
        );

        if (existingErrorIdx >= 0) {
          // 更新现有错误
          const existingError = progressInfo.errors[existingErrorIdx];
          existingError.attemptCount = (existingError.attemptCount || 0) + 1;
          existingError.timestamp = Date.now();
          existingError.message = errorInfo.message;
          existingError.type = errorInfo.type;
        } else {
          // 添加新错误
          errorInfo.attemptCount = 1;
          progressInfo.errors = [...(progressInfo.errors || []), errorInfo];
        }
      } else {
        // 无分片索引或首次错误
        errorInfo.attemptCount = 1;
        progressInfo.errors = [...(progressInfo.errors || []), errorInfo];
      }

      // 限制错误记录数量
      if (progressInfo.errors && progressInfo.errors.length > 20) {
        progressInfo.errors = progressInfo.errors.slice(-20);
      }

      // 更新最后更新时间
      progressInfo.lastUpdated = Date.now();

      // 保存更新后的进度信息
      await this.saveFileProgress(fileId, progressInfo);
    } catch (error) {
      this.log(
        'error',
        `保存上传错误失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取文件上传进度
   */
  private async getFileProgress(
    fileId: string
  ): Promise<FileProgressInfo | null> {
    try {
      // 从主存储获取
      let progress = await this.storage.getItem<FileProgressInfo>(fileId);

      // 如果主存储没有找到且有备份存储
      if (!progress && this.backupStorages.length > 0) {
        // 尝试从备份存储获取
        for (const backupStorage of this.backupStorages) {
          const backupProgress =
            await backupStorage.getItem<FileProgressInfo>(fileId);
          if (backupProgress) {
            progress = backupProgress;

            // 同步回主存储
            await this.storage.setItem(fileId, backupProgress).catch(() => {
              // 忽略同步错误
            });

            break;
          }
        }
      }

      // 检查数据有效性
      if (progress && typeof progress === 'object') {
        // 检查是否过期
        if (
          this.options.expiryTime &&
          Date.now() - progress.lastUpdated > this.options.expiryTime
        ) {
          this.log('info', `上传记录已过期: ${fileId}`);
          await this.clearProgress(fileId);
          return null;
        }

        return progress;
      }

      return null;
    } catch (error) {
      this.log(
        'error',
        `获取上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * 保存文件上传进度
   */
  private async saveFileProgress(
    fileId: string,
    progress: FileProgressInfo
  ): Promise<void> {
    try {
      // 更新最后更新时间
      progress.lastUpdated = Date.now();

      // 如果启用了加密
      let dataToSave: FileProgressInfo | string = progress;
      if (this.options.encryptData && this.options.encryptionKey) {
        dataToSave = this.encryptData(progress, this.options.encryptionKey);
      }

      // 保存到主存储
      await this.storage.setItem(fileId, dataToSave);

      // 如果有备份存储且启用了自动同步
      if (this.options.autoSyncStorages && this.backupStorages.length > 0) {
        // 异步保存到备份存储
        for (const backupStorage of this.backupStorages) {
          backupStorage.setItem(fileId, dataToSave).catch(() => {
            // 忽略备份存储错误
          });
        }
      }
    } catch (error) {
      this.log(
        'error',
        `保存上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清除上传进度
   */
  private async clearProgress(fileId: string): Promise<void> {
    try {
      // 从主存储清除
      await this.storage.removeItem(fileId);

      // 从备份存储清除
      for (const backupStorage of this.backupStorages) {
        backupStorage.removeItem(fileId).catch(() => {
          // 忽略错误
        });
      }
    } catch (error) {
      this.log(
        'error',
        `清除上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清除进度保存定时器
   */
  private clearProgressTimer(fileId: string): void {
    const timerId = this.progressTimers.get(fileId);
    if (timerId) {
      clearInterval(timerId);
      this.progressTimers.delete(fileId);
    }
  }

  /**
   * 启动进度保存定时器
   */
  private startProgressTimer(fileId: string): void {
    // 先清除已存在的定时器
    this.clearProgressTimer(fileId);

    // 设置新的定时器
    const timerId = window.setInterval(
      () => this.persistProgress(fileId),
      this.options.persistProgressInterval
    );

    this.progressTimers.set(fileId, timerId);
  }

  /**
   * 持久化上传进度
   * 智能合并多个分片更新，减少存储写入频率
   */
  private async persistProgress(fileId: string): Promise<void> {
    try {
      // 获取当前进度信息
      const progressInfo = await this.getFileProgress(fileId);

      if (!progressInfo) {
        this.log('warn', `未找到上传进度信息: ${fileId}`);
        return;
      }

      // 获取等待保存的分片集合
      const pendingChunks = this.pendingChunkSaves.get(fileId) || new Set();
      const lastCompleteSave = this.lastCompletePersistTime.get(fileId) || 0;

      // 当满足以下条件之一时执行完整保存：
      // 1. 有挂起的分片更新
      // 2. 自上次完整保存已超过Interval的5倍
      // 3. 上传恢复后的首次保存
      const forceSave =
        pendingChunks.size > 0 ||
        Date.now() - lastCompleteSave >
          this.options.persistProgressInterval! * 5 ||
        this.resumeInProgress.get(fileId);

      if (forceSave) {
        // 执行完整保存
        await this.saveFileProgress(fileId, progressInfo);

        // 清除待保存分片集合
        pendingChunks.clear();

        // 更新最后完整保存时间
        this.lastCompletePersistTime.set(fileId, Date.now());

        // 清除恢复标志
        this.resumeInProgress.delete(fileId);

        this.log('debug', `已保存完整上传进度: ${fileId}`);
      }
    } catch (error) {
      this.log(
        'error',
        `持久化上传进度失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清理过期的上传记录
   */
  private async cleanExpiredItems(): Promise<void> {
    if (!this.options.autoCleanExpired || !this.options.expiryTime) return;

    try {
      // 获取所有键
      const keys = await this.storage.keys();

      // 当前时间
      const now = Date.now();

      // 检查每个键
      for (const key of keys) {
        try {
          // 获取进度信息
          const progress = await this.storage.getItem<FileProgressInfo>(key);

          // 检查是否过期
          if (
            progress &&
            progress.lastUpdated &&
            now - progress.lastUpdated > this.options.expiryTime
          ) {
            // 删除过期记录
            await this.storage.removeItem(key);

            // 同时从备份存储删除
            for (const backupStorage of this.backupStorages) {
              backupStorage.removeItem(key).catch(() => {
                // 忽略错误
              });
            }

            this.log('debug', `已清除过期上传记录: ${key}`);
          }
        } catch {
          // 忽略单个记录处理错误
        }
      }

      // 检查存储项数量限制
      if (this.options.maxStorageItems && this.options.maxStorageItems > 0) {
        await this.enforceStorageLimit();
      }
    } catch (error) {
      this.log(
        'error',
        `清理过期上传记录失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 强制执行存储项数量限制
   */
  private async enforceStorageLimit(): Promise<void> {
    if (!this.options.maxStorageItems) return;

    try {
      // 获取所有进度记录
      const keys = await this.storage.keys();
      const items: { key: string; lastUpdated: number }[] = [];

      // 获取每个记录的最后更新时间
      for (const key of keys) {
        try {
          const progress = await this.storage.getItem<FileProgressInfo>(key);
          if (progress && progress.lastUpdated) {
            items.push({ key, lastUpdated: progress.lastUpdated });
          }
        } catch {
          // 忽略单个项处理错误
        }
      }

      // 如果超出限制
      if (items.length > this.options.maxStorageItems) {
        // 按最后更新时间排序，旧的在前
        items.sort((a, b) => a.lastUpdated - b.lastUpdated);

        // 计算需要删除的数量
        const deleteCount = items.length - this.options.maxStorageItems;

        // 删除最旧的记录
        for (let i = 0; i < deleteCount; i++) {
          const key = items[i].key;
          await this.storage.removeItem(key);

          // 同时从备份存储删除
          for (const backupStorage of this.backupStorages) {
            backupStorage.removeItem(key).catch(() => {
              // 忽略错误
            });
          }

          this.log('debug', `删除超出限制的上传记录: ${key}`);
        }
      }
    } catch (error) {
      this.log(
        'error',
        `执行存储限制失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取存储键
   */
  private getStorageKey(fileId: string): string {
    return fileId;
  }

  /**
   * 判断是否为致命错误(无法恢复的错误)
   */
  private isTerminalError(error: { type?: string }): boolean {
    // 这些错误类型被认为是致命错误，不应该保存进度
    const terminalErrorTypes = [
      UploadErrorType.FILE_ERROR, // 文件错误
      UploadErrorType.PERMISSION_ERROR, // 权限错误
      UploadErrorType.VALIDATION_ERROR, // 验证错误
      UploadErrorType.CANCEL_ERROR, // 取消错误
    ];

    return error.type
      ? terminalErrorTypes.includes(error.type as UploadErrorType)
      : false;
  }

  /**
   * 日志记录
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    const logLevels: Record<LogLevel, number> = {
      none: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
    };

    if (
      this.options.logLevel &&
      logLevels[level] <= logLevels[this.options.logLevel]
    ) {
      const prefix = `[ResumePlugin] ${level.toUpperCase()}:`;

      switch (level) {
        case 'error':
          console.error(prefix, message, data);
          break;
        case 'warn':
          console.warn(prefix, message, data);
          break;
        case 'info':
          console.info(prefix, message, data);
          break;
        case 'debug':
          console.debug(prefix, message, data);
          break;
      }
    }
  }

  /**
   * 加密数据
   * 简单实现，实际应用可使用更复杂的加密算法
   */
  private encryptData(data: any, key: string): string {
    try {
      // 将数据转为JSON字符串
      const jsonString = JSON.stringify(data);

      // 简单的XOR加密
      let encrypted = '';
      for (let i = 0; i < jsonString.length; i++) {
        const charCode =
          jsonString.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        encrypted += String.fromCharCode(charCode);
      }

      // Base64编码
      return btoa(encrypted);
    } catch (error) {
      this.log('error', '数据加密失败', error);
      // 加密失败，返回原始数据
      return JSON.stringify(data);
    }
  }

  /**
   * 解密数据
   * 与加密方法对应
   */
  private decryptData(encryptedData: string, key: string): any {
    try {
      // Base64解码
      const base64Decoded = atob(encryptedData);

      // XOR解密
      let decrypted = '';
      for (let i = 0; i < base64Decoded.length; i++) {
        const charCode =
          base64Decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        decrypted += String.fromCharCode(charCode);
      }

      // 解析JSON
      return JSON.parse(decrypted);
    } catch (error) {
      this.log('error', '数据解密失败', error);
      return null;
    }
  }
}
