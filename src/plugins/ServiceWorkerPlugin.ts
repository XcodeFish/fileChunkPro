/**
 * ServiceWorkerPlugin - 为UploaderCore提供ServiceWorker支持
 * 实现离线上传、后台上传、上传队列等功能
 */

import { ServiceWorkerManager } from '../core/ServiceWorkerManager';
import { ServiceWorkerOptions, IServiceWorkerPlugin } from '../types/services';
import { UploaderCore } from '../core/UploaderCore';
import EnvUtils from '../utils/EnvUtils';

/**
 * ServiceWorker插件配置
 */
export interface ServiceWorkerPluginOptions extends ServiceWorkerOptions {
  /**
   * ServiceWorker脚本路径
   */
  swPath?: string;

  /**
   * 是否启用离线上传缓存
   */
  useOfflineCache?: boolean;

  /**
   * 是否启用后台上传
   */
  enableBackgroundUploads?: boolean;

  /**
   * 是否启用请求缓存
   */
  enableRequestCache?: boolean;

  /**
   * 是否开启自动清理缓存
   */
  autoCleanCache?: boolean;

  /**
   * 离线上传最大尝试次数
   */
  maxOfflineRetries?: number;

  /**
   * 离线上传重试间隔（毫秒）
   */
  offlineRetryInterval?: number;

  /**
   * 离线存储限制（字节）
   */
  offlineStorageLimit?: number;

  /**
   * 离线上传超时时间（毫秒）
   */
  offlineUploadTimeout?: number;
}

/**
 * ServiceWorkerPlugin类
 * 通过ServiceWorker提供离线上传、后台上传等功能
 */
export class ServiceWorkerPlugin implements IServiceWorkerPlugin {
  private manager: ServiceWorkerManager | null = null;
  private uploader: UploaderCore | null = null;
  private options: ServiceWorkerPluginOptions;
  private offlineQueue: Set<string> = new Set();
  private backgroundQueue: Set<string> = new Set();
  private retryIntervalId: NodeJS.Timeout | null = null;
  private syncRegistered = false;

  /**
   * 插件名称
   */
  public name = 'serviceWorker';

  /**
   * 创建ServiceWorkerPlugin实例
   * @param options 配置选项
   */
  constructor(options: ServiceWorkerPluginOptions) {
    this.options = {
      scriptURL: options.scriptURL || '/sw.js',
      swPath: options.swPath || '/serviceWorker.js',
      useOfflineCache: options.useOfflineCache !== false,
      enableBackgroundUploads: options.enableBackgroundUploads !== false,
      enableRequestCache: options.enableRequestCache !== false,
      autoCleanCache: options.autoCleanCache !== false,
      maxOfflineRetries: options.maxOfflineRetries || 5,
      offlineRetryInterval: options.offlineRetryInterval || 60000, // 默认1分钟
      offlineStorageLimit: options.offlineStorageLimit || 100 * 1024 * 1024, // 默认100MB
      offlineUploadTimeout: options.offlineUploadTimeout || 5 * 60 * 1000, // 默认5分钟
      ...options,
    };
  }

  /**
   * 获取ServiceWorker配置
   */
  public getConfig(): {
    swPath: string;
    useOfflineCache: boolean;
    enableBackgroundUploads: boolean;
    enableRequestCache: boolean;
  } {
    return {
      swPath: this.options.swPath || '/serviceWorker.js',
      useOfflineCache: this.options.useOfflineCache !== false,
      enableBackgroundUploads: this.options.enableBackgroundUploads !== false,
      enableRequestCache: this.options.enableRequestCache !== false,
    };
  }

  /**
   * 启用离线上传功能
   */
  public enableOfflineUpload(): this {
    this.options.useOfflineCache = true;
    return this;
  }

  /**
   * 禁用离线上传功能
   */
  public disableOfflineUpload(): this {
    this.options.useOfflineCache = false;
    return this;
  }

  /**
   * 启用后台上传功能
   */
  public enableBackgroundUploads(): this {
    this.options.enableBackgroundUploads = true;
    if (this.uploader && this.manager) {
      this.registerBackgroundSync();
    }
    return this;
  }

  /**
   * 禁用后台上传功能
   */
  public disableBackgroundUploads(): this {
    this.options.enableBackgroundUploads = false;
    return this;
  }

  /**
   * 启用请求缓存功能
   */
  public enableRequestCache(): this {
    this.options.enableRequestCache = true;
    return this;
  }

  /**
   * 禁用请求缓存功能
   */
  public disableRequestCache(): this {
    this.options.enableRequestCache = false;
    return this;
  }

  /**
   * 安装插件
   * @param uploader UploaderCore实例
   */
  public install(uploader: UploaderCore): void {
    if (!EnvUtils.isServiceWorkerSupported()) {
      console.warn(
        '[ServiceWorkerPlugin] 当前环境不支持ServiceWorker，插件将被禁用'
      );
      return;
    }

    this.uploader = uploader;

    // 监听核心初始化ServiceWorker的钩子
    uploader.hook('core:initServiceWorker', ({ options, manager }) => {
      this.manager = manager;

      // 更新插件配置
      this.options = {
        ...this.options,
        swPath: options.swPath || this.options.swPath,
        useOfflineCache: options.useOfflineCache,
        enableBackgroundUploads: options.enableBackgroundUploads,
        enableRequestCache: options.enableRequestCache,
      };

      // 注册事件监听
      this.registerEvents();

      // 如果支持后台同步，注册后台同步
      if (this.options.enableBackgroundUploads) {
        this.registerBackgroundSync();
      }

      // 初始化离线重试机制
      if (this.options.useOfflineCache) {
        this.initOfflineRetry();
      }

      return { handled: true };
    });

    // 注册插件
    uploader.getPluginManager().registerPlugin(this.name, this);
  }

  /**
   * 注册ServiceWorker事件监听
   */
  private registerEvents(): void {
    if (!this.manager || !this.uploader) return;

    // 监听ServiceWorker就绪事件
    this.manager.on('ready', () => {
      this.retrieveOfflineUploads();
    });

    // 处理上传进度更新
    this.manager.on('uploadProgress', data => {
      const { fileId, progress } = data;
      this.uploader?.emit('swUploadProgress', { fileId, progress });
    });

    // 处理上传完成
    this.manager.on('uploadComplete', data => {
      const { fileId, result } = data;
      this.uploader?.emit('swUploadComplete', { fileId, result });
      this.offlineQueue.delete(fileId);
      this.backgroundQueue.delete(fileId);
    });

    // 处理上传错误
    this.manager.on('uploadError', data => {
      const { fileId, error } = data;
      this.uploader?.emit('swUploadError', { fileId, error });
    });

    // 处理配额超出
    this.manager.on('quotaExceeded', () => {
      if (this.options.autoCleanCache) {
        this.cleanCache();
      }
    });

    // 监听上传前事件，判断是否可以使用ServiceWorker处理
    this.uploader.hook('beforeUpload', async (file, options) => {
      // 仅当显式指定使用ServiceWorker或启用后台上传时才使用ServiceWorker
      if (
        (options?.useServiceWorker || this.options.enableBackgroundUploads) &&
        this.manager?.isReady()
      ) {
        // 生成唯一文件ID
        const fileId = await this.uploader?.generateFileId(file);

        // 将上传任务委托给ServiceWorker
        this.delegateToServiceWorker(file, fileId, options);

        // 返回特殊标记，告知UploaderCore不要继续处理此上传
        return { swHandled: true, fileId };
      }

      // 否则继续正常上传流程
      return null;
    });
  }

  /**
   * 将上传任务委托给ServiceWorker
   */
  private delegateToServiceWorker(
    file: any,
    fileId: string,
    options?: any
  ): void {
    if (!this.manager?.isReady()) return;

    // 创建上传任务
    const uploadTask = {
      fileId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      endpoint: this.uploader?.options.endpoint,
      headers: this.uploader?.options.headers,
      chunkSize: this.uploader?.options.chunkSize,
      metadata: options?.metadata || {},
      isBackground: !!options?.background,
      createdAt: Date.now(),
    };

    // 发送上传任务到ServiceWorker
    this.manager.sendMessage('UPLOAD_FILE', uploadTask);

    // 添加到相应队列
    if (options?.background) {
      this.backgroundQueue.add(fileId);
    } else if (this.options.useOfflineCache) {
      this.offlineQueue.add(fileId);
    }

    // 触发事件
    this.uploader?.emit('swUploadStarted', { fileId, task: uploadTask });
  }

  /**
   * 注册后台同步
   */
  private async registerBackgroundSync(): Promise<void> {
    if (!this.manager?.isReady() || this.syncRegistered) return;

    try {
      // 等待ServiceWorker准备就绪
      await new Promise<void>(resolve => {
        if (this.manager?.isReady()) {
          resolve();
        } else {
          this.manager?.once('ready', () => resolve());
        }
      });

      // 注册后台同步
      const registration = this.manager?.getRegistration();
      if (registration && 'sync' in registration) {
        await registration.sync.register('fileChunkProUpload');
        this.syncRegistered = true;
      }
    } catch (error) {
      console.warn('[ServiceWorkerPlugin] 注册后台同步失败:', error);
    }
  }

  /**
   * 初始化离线重试机制
   */
  private initOfflineRetry(): void {
    // 如果已经设置了重试间隔，清除之前的定时器
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
    }

    // 设置定期检查并重试离线上传
    this.retryIntervalId = setInterval(() => {
      this.retryOfflineUploads();
    }, this.options.offlineRetryInterval);

    // 监听网络在线状态变化
    if (typeof window !== 'undefined' && 'navigator' in window) {
      window.addEventListener('online', () => {
        this.retryOfflineUploads();
      });
    }
  }

  /**
   * 重试离线上传
   */
  private retryOfflineUploads(): void {
    if (!this.manager?.isReady() || this.offlineQueue.size === 0) return;

    // 检查是否在线
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }

    // 发送重试消息到ServiceWorker
    this.manager.sendMessage('RETRY_UPLOADS', {
      fileIds: Array.from(this.offlineQueue),
    });
  }

  /**
   * 从ServiceWorker中获取待处理的离线上传
   */
  private retrieveOfflineUploads(): void {
    if (!this.manager?.isReady()) return;

    // 请求待处理的上传任务
    this.manager.sendMessage('GET_PENDING_UPLOADS');

    // 设置一次性监听，接收待处理的上传任务
    this.manager.once('message', data => {
      if (data.type === 'PENDING_UPLOADS' && Array.isArray(data.payload)) {
        // 更新离线队列
        data.payload.forEach((task: any) => {
          this.offlineQueue.add(task.fileId);
        });

        // 触发事件
        this.uploader?.emit('swPendingUploads', { tasks: data.payload });
      }
    });
  }

  /**
   * 清理缓存
   */
  private cleanCache(): void {
    if (!this.manager?.isReady()) return;

    this.manager.sendMessage('CLEAN_CACHE');
  }

  /**
   * 获取当前正在处理的上传任务
   */
  public getActiveUploads(): { offline: string[]; background: string[] } {
    return {
      offline: Array.from(this.offlineQueue),
      background: Array.from(this.backgroundQueue),
    };
  }

  /**
   * 取消指定的上传任务
   */
  public cancelUpload(fileId: string): void {
    if (!this.manager?.isReady()) return;

    this.manager.sendMessage('CANCEL_UPLOAD', { fileId });
    this.offlineQueue.delete(fileId);
    this.backgroundQueue.delete(fileId);
    this.uploader?.emit('swUploadCancelled', { fileId });
  }

  /**
   * 取消所有上传任务
   */
  public cancelAllUploads(): void {
    if (!this.manager?.isReady()) return;

    this.manager.sendMessage('CANCEL_ALL_UPLOADS');
    this.offlineQueue.clear();
    this.backgroundQueue.clear();
    this.uploader?.emit('swAllUploadsCancelled');
  }

  /**
   * 获取ServiceWorkerManager实例
   */
  public getManager(): ServiceWorkerManager | null {
    return this.manager;
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = null;
    }

    this.manager?.dispose();
    this.manager = null;
    this.uploader = null;
    this.offlineQueue.clear();
    this.backgroundQueue.clear();
  }
}
