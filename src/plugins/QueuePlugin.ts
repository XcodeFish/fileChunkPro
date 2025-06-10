/**
 * QueuePlugin - 多文件队列系统插件
 * 提供批量上传、队列优先级控制、暂停/恢复队列、队列状态持久化等功能
 */

import UploaderCore from '../core/UploaderCore';
import { IPlugin } from './interfaces';
import { TaskPriority } from '../types';
import { UploadErrorType } from '../types';
import { UploadError } from '../core/ErrorCenter';

/**
 * 队列文件项接口
 */
export interface QueueItem {
  /** 唯一ID */
  id: string;
  /** 文件对象 */
  file: File | Blob | any;
  /** 优先级 */
  priority: TaskPriority;
  /** 上传状态 */
  status: QueueItemStatus;
  /** 上传进度(0-100) */
  progress: number;
  /** 创建时间戳 */
  created: number;
  /** 开始上传时间戳 */
  started?: number;
  /** 完成上传时间戳 */
  completed?: number;
  /** 错误信息 */
  error?: any;
  /** 上传结果 */
  result?: any;
  /** 自定义数据 */
  customData?: Record<string, any>;
  /** 重试次数 */
  retryCount: number;
}

/**
 * 队列文件状态枚举
 */
export enum QueueItemStatus {
  /** 等待上传 */
  PENDING = 'PENDING',
  /** 上传中 */
  UPLOADING = 'UPLOADING',
  /** 暂停 */
  PAUSED = 'PAUSED',
  /** 已完成 */
  COMPLETED = 'COMPLETED',
  /** 失败 */
  FAILED = 'FAILED',
  /** 已取消 */
  CANCELLED = 'CANCELLED',
}

/**
 * 队列排序方式枚举
 */
export enum QueueSortMode {
  /** 按优先级排序 */
  PRIORITY = 'PRIORITY',
  /** 按文件大小排序(从小到大) */
  SIZE_ASC = 'SIZE_ASC',
  /** 按文件大小排序(从大到小) */
  SIZE_DESC = 'SIZE_DESC',
  /** 按添加顺序排序 */
  FIFO = 'FIFO',
  /** 按添加顺序逆序 */
  LIFO = 'LIFO',
}

/**
 * 队列插件选项
 */
export interface QueuePluginOptions {
  /** 最大队列长度，0表示不限制 */
  maxQueueSize?: number;
  /** 队列排序方式 */
  sortMode?: QueueSortMode;
  /** 自动开始上传 */
  autoStart?: boolean;
  /** 并行上传数量 */
  parallelUploads?: number;
  /** 是否持久化队列 */
  persistQueue?: boolean;
  /** 持久化键名 */
  persistKey?: string;
  /** 队列变动事件节流时间(ms) */
  throttleTime?: number;
  /** 是否自动清理已完成项 */
  autoCleanCompleted?: boolean;
}

/**
 * 队列统计信息
 */
export interface QueueStats {
  /** 总数 */
  total: number;
  /** 等待数 */
  pending: number;
  /** 上传中数量 */
  uploading: number;
  /** 已完成数量 */
  completed: number;
  /** 失败数量 */
  failed: number;
  /** 已取消数量 */
  cancelled: number;
  /** 暂停数量 */
  paused: number;
  /** 总文件大小(字节) */
  totalSize: number;
  /** 已上传大小(字节) */
  uploadedSize: number;
  /** 总体进度(0-100) */
  progress: number;
}

/**
 * 多文件队列系统插件
 */
export class QueuePlugin implements IPlugin {
  public name = 'QueuePlugin';

  private _uploader: UploaderCore | null = null;
  private _queue: QueueItem[] = [];
  private _uploading = false;
  private _paused = false;
  private _options: QueuePluginOptions;
  private _activeUploads = 0;
  private _throttleTimer: any = null;

  /**
   * 构造函数
   * @param options 队列插件选项
   */
  constructor(options: QueuePluginOptions = {}) {
    this._options = {
      maxQueueSize: 0,
      sortMode: QueueSortMode.PRIORITY,
      autoStart: true,
      parallelUploads: 1,
      persistQueue: false,
      persistKey: 'fileChunkPro_queue',
      throttleTime: 300,
      autoCleanCompleted: false,
      ...options,
    };

    // 如果启用队列持久化，尝试恢复队列
    if (this._options.persistQueue) {
      this._restoreQueue();
    }
  }

  /**
   * 安装插件
   * @param uploader UploaderCore实例
   */
  public install(uploader: UploaderCore): void {
    this._uploader = uploader;

    // 注册钩子和事件
    uploader.on('uploadComplete', this._handleUploadComplete.bind(this));
    uploader.on('uploadError', this._handleUploadError.bind(this));
    uploader.on('uploadProgress', this._handleUploadProgress.bind(this));

    // 将队列方法挂载到uploader实例上
    const uploaderAny = uploader as any;
    uploaderAny.queue = {
      add: this.addToQueue.bind(this),
      remove: this.removeFromQueue.bind(this),
      clear: this.clearQueue.bind(this),
      start: this.startQueue.bind(this),
      pause: this.pauseQueue.bind(this),
      resume: this.resumeQueue.bind(this),
      getItems: this.getQueueItems.bind(this),
      getStats: this.getQueueStats.bind(this),
      updatePriority: this.updateItemPriority.bind(this),
      getActiveItems: this.getActiveItems.bind(this),
    };
  }

  /**
   * 卸载插件
   */
  public uninstall(): void {
    if (!this._uploader) return;

    this._uploader.off('uploadComplete', this._handleUploadComplete.bind(this));
    this._uploader.off('uploadError', this._handleUploadError.bind(this));
    this._uploader.off('uploadProgress', this._handleUploadProgress.bind(this));

    // 移除挂载到uploader实例的方法
    if (this._uploader && (this._uploader as any).queue) {
      delete (this._uploader as any).queue;
    }

    this._uploader = null;
  }

  /**
   * 添加文件到队列
   * @param file 文件对象
   * @param priority 优先级
   * @param customData 自定义数据
   * @returns 队列项ID
   */
  public addToQueue(
    file: File | Blob | any,
    priority: TaskPriority = TaskPriority.NORMAL,
    customData?: Record<string, any>
  ): string {
    // 检查队列最大长度
    if (
      this._options.maxQueueSize > 0 &&
      this._queue.length >= this._options.maxQueueSize
    ) {
      throw new UploadError(
        UploadErrorType.QUOTA_EXCEEDED_ERROR,
        '队列已达到最大长度'
      );
    }

    // 创建唯一ID
    const id = `queue_item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // 创建队列项
    const queueItem: QueueItem = {
      id,
      file,
      priority,
      status: QueueItemStatus.PENDING,
      progress: 0,
      created: Date.now(),
      retryCount: 0,
      customData,
    };

    // 添加到队列
    this._queue.push(queueItem);

    // 重新排序队列
    this._sortQueue();

    // 触发队列变动事件
    this._emitQueueChange();

    // 如果设置了自动开始且队列未暂停，则尝试开始上传
    if (this._options.autoStart && !this._paused) {
      this._processQueue();
    }

    // 持久化队列
    this._persistQueue();

    return id;
  }

  /**
   * 从队列中移除文件
   * @param id 队列项ID
   * @returns 是否成功移除
   */
  public removeFromQueue(id: string): boolean {
    const index = this._queue.findIndex(item => item.id === id);

    if (index === -1) {
      return false;
    }

    // 如果文件正在上传中，先取消上传
    const item = this._queue[index];
    if (item.status === QueueItemStatus.UPLOADING && this._uploader) {
      this._uploader.cancel();
      this._activeUploads--;
    }

    // 从队列中移除
    this._queue.splice(index, 1);

    // 触发队列变动事件
    this._emitQueueChange();

    // 持久化队列
    this._persistQueue();

    return true;
  }

  /**
   * 清空队列
   */
  public clearQueue(): void {
    // 取消所有正在上传的项
    if (this._uploader) {
      this._uploader.cancel();
    }

    // 重置状态
    this._activeUploads = 0;
    this._queue = [];

    // 触发队列变动事件
    this._emitQueueChange();

    // 持久化队列
    this._persistQueue();
  }

  /**
   * 开始队列上传
   */
  public startQueue(): void {
    if (this._paused) {
      this._paused = false;
    }

    this._processQueue();
  }

  /**
   * 暂停队列
   */
  public pauseQueue(): void {
    this._paused = true;

    // 标记所有uploading状态的文件为paused
    this._queue.forEach(item => {
      if (item.status === QueueItemStatus.UPLOADING) {
        item.status = QueueItemStatus.PAUSED;
      }
    });

    // 取消当前上传
    if (this._uploader) {
      this._uploader.cancel();
    }

    this._activeUploads = 0;

    // 触发队列变动事件
    this._emitQueueChange();

    // 持久化队列
    this._persistQueue();
  }

  /**
   * 恢复队列
   */
  public resumeQueue(): void {
    this._paused = false;

    // 将所有paused状态的文件改为pending
    this._queue.forEach(item => {
      if (item.status === QueueItemStatus.PAUSED) {
        item.status = QueueItemStatus.PENDING;
      }
    });

    // 触发队列变动事件
    this._emitQueueChange();

    // 开始处理队列
    this._processQueue();

    // 持久化队列
    this._persistQueue();
  }

  /**
   * 获取队列中的所有文件
   * @returns 队列项列表
   */
  public getQueueItems(): QueueItem[] {
    return [...this._queue];
  }

  /**
   * 获取活跃的上传项(上传中或等待中)
   * @returns 活跃队列项列表
   */
  public getActiveItems(): QueueItem[] {
    return this._queue.filter(
      item =>
        item.status === QueueItemStatus.PENDING ||
        item.status === QueueItemStatus.UPLOADING
    );
  }

  /**
   * 获取队列统计信息
   * @returns 队列统计信息
   */
  public getQueueStats(): QueueStats {
    let total = 0;
    let pending = 0;
    let uploading = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let paused = 0;
    let totalSize = 0;
    let uploadedSize = 0;

    this._queue.forEach(item => {
      total++;
      totalSize += item.file.size || 0;
      uploadedSize += (item.file.size || 0) * (item.progress / 100);

      switch (item.status) {
        case QueueItemStatus.PENDING:
          pending++;
          break;
        case QueueItemStatus.UPLOADING:
          uploading++;
          break;
        case QueueItemStatus.COMPLETED:
          completed++;
          break;
        case QueueItemStatus.FAILED:
          failed++;
          break;
        case QueueItemStatus.CANCELLED:
          cancelled++;
          break;
        case QueueItemStatus.PAUSED:
          paused++;
          break;
      }
    });

    return {
      total,
      pending,
      uploading,
      completed,
      failed,
      cancelled,
      paused,
      totalSize,
      uploadedSize,
      progress: total > 0 ? (uploadedSize / totalSize) * 100 : 0,
    };
  }

  /**
   * 更新队列项优先级
   * @param id 队列项ID
   * @param priority 新优先级
   * @returns 是否成功更新
   */
  public updateItemPriority(id: string, priority: TaskPriority): boolean {
    const item = this._queue.find(item => item.id === id);

    if (!item) {
      return false;
    }

    item.priority = priority;

    // 重新排序队列
    this._sortQueue();

    // 触发队列变动事件
    this._emitQueueChange();

    // 持久化队列
    this._persistQueue();

    return true;
  }

  /**
   * 处理上传完成事件
   * @param data 上传完成数据
   */
  private _handleUploadComplete(data: any): void {
    this._activeUploads--;

    // 查找对应的队列项
    const item = this._findActiveUploadItem();

    if (item) {
      item.status = QueueItemStatus.COMPLETED;
      item.completed = Date.now();
      item.progress = 100;
      item.result = data;

      // 触发队列变动事件
      this._emitQueueChange();

      // 如果设置了自动清理已完成项，则移除
      if (this._options.autoCleanCompleted) {
        const index = this._queue.findIndex(i => i.id === item.id);
        if (index !== -1) {
          this._queue.splice(index, 1);
        }
      }
    }

    // 持久化队列
    this._persistQueue();

    // 继续处理队列中的下一项
    this._processQueue();
  }

  /**
   * 处理上传错误事件
   * @param error 错误信息
   */
  private _handleUploadError(error: any): void {
    this._activeUploads--;

    // 查找对应的队列项
    const item = this._findActiveUploadItem();

    if (item) {
      item.status = QueueItemStatus.FAILED;
      item.error = error;

      // 触发队列变动事件
      this._emitQueueChange();
    }

    // 持久化队列
    this._persistQueue();

    // 继续处理队列中的下一项
    this._processQueue();
  }

  /**
   * 处理上传进度事件
   * @param data 进度信息
   */
  private _handleUploadProgress(data: any): void {
    // 查找对应的队列项
    const item = this._findActiveUploadItem();

    if (item) {
      item.progress = data.percent || 0;

      // 触发队列变动事件（使用节流控制触发频率）
      this._throttledEmitQueueChange();
    }
  }

  /**
   * 处理队列中的任务
   */
  private _processQueue(): void {
    if (!this._uploader || this._paused) {
      return;
    }

    // 检查正在上传的任务数量是否达到并行上传限制
    if (this._activeUploads >= this._options.parallelUploads!) {
      return;
    }

    // 获取下一个待上传的文件
    const nextItem = this._getNextPendingItem();

    if (!nextItem) {
      // 没有待上传的文件
      return;
    }

    // 更新状态
    nextItem.status = QueueItemStatus.UPLOADING;
    nextItem.started = Date.now();
    this._activeUploads++;

    // 触发队列变动事件
    this._emitQueueChange();

    // 持久化队列
    this._persistQueue();

    // 开始上传
    this._uploader
      .upload(nextItem.file, { storageKey: nextItem.id })
      .catch(_error => {
        // 错误会由事件处理器处理，这里不需要额外处理
      });
  }

  /**
   * 获取下一个待上传的文件
   * @returns 下一个待上传的队列项
   */
  private _getNextPendingItem(): QueueItem | undefined {
    return this._queue.find(item => item.status === QueueItemStatus.PENDING);
  }

  /**
   * 查找当前活跃上传的队列项
   * @returns 活跃上传的队列项
   */
  private _findActiveUploadItem(): QueueItem | undefined {
    return this._queue.find(item => item.status === QueueItemStatus.UPLOADING);
  }

  /**
   * 根据设置的排序方式对队列进行排序
   */
  private _sortQueue(): void {
    switch (this._options.sortMode) {
      case QueueSortMode.PRIORITY:
        // 按优先级从高到低排序
        this._queue.sort((a, b) => b.priority - a.priority);
        break;

      case QueueSortMode.SIZE_ASC:
        // 按文件大小从小到大排序
        this._queue.sort((a, b) => (a.file.size || 0) - (b.file.size || 0));
        break;

      case QueueSortMode.SIZE_DESC:
        // 按文件大小从大到小排序
        this._queue.sort((a, b) => (b.file.size || 0) - (a.file.size || 0));
        break;

      case QueueSortMode.LIFO:
        // 后进先出排序
        this._queue.sort((a, b) => b.created - a.created);
        break;

      case QueueSortMode.FIFO:
      default:
        // 先进先出排序(默认)
        this._queue.sort((a, b) => a.created - b.created);
        break;
    }
  }

  /**
   * 触发队列变动事件
   */
  private _emitQueueChange(): void {
    if (!this._uploader) return;

    const stats = this.getQueueStats();
    this._uploader.emit('queueChange', {
      queue: this.getQueueItems(),
      stats,
    });
  }

  /**
   * 节流执行的队列变动事件触发
   */
  private _throttledEmitQueueChange(): void {
    if (this._throttleTimer) {
      return;
    }

    this._throttleTimer = setTimeout(() => {
      this._emitQueueChange();
      this._throttleTimer = null;
    }, this._options.throttleTime);
  }

  /**
   * 持久化队列状态
   */
  private _persistQueue(): void {
    if (!this._options.persistQueue) {
      return;
    }

    try {
      // 创建持久化数据，文件对象无法序列化，需要特殊处理
      const persistData = this._queue.map(item => {
        // 获取可序列化的文件信息
        const fileInfo = {
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
          lastModified: item.file.lastModified,
        };

        // 返回可序列化的队列项
        return {
          ...item,
          file: fileInfo,
          // 不保存结果和错误对象，它们可能不可序列化
          result: undefined,
          error: undefined,
        };
      });

      // 保存到localStorage
      localStorage.setItem(
        this._options.persistKey!,
        JSON.stringify({
          queue: persistData,
          paused: this._paused,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.warn('队列持久化失败:', error);
    }
  }

  /**
   * 从持久化存储中恢复队列
   */
  private _restoreQueue(): void {
    try {
      const storedData = localStorage.getItem(this._options.persistKey!);

      if (!storedData) {
        return;
      }

      const parsedData = JSON.parse(storedData);

      // 恢复暂停状态
      this._paused = parsedData.paused || false;

      // 恢复队列项
      // 注意：文件对象无法序列化，需要用户手动重新添加文件
      // 这里主要恢复除文件以外的队列状态
      this._queue = parsedData.queue || [];

      // 由于无法恢复文件对象，将状态改为失败
      this._queue.forEach(item => {
        if (
          item.status === QueueItemStatus.UPLOADING ||
          item.status === QueueItemStatus.PENDING
        ) {
          item.status = QueueItemStatus.FAILED;
          item.error = {
            message: '页面刷新导致文件对象丢失，请重新上传',
          };
        }
      });
    } catch (error) {
      console.warn('恢复队列失败:', error);
      // 恢复失败时清除持久化数据
      localStorage.removeItem(this._options.persistKey!);
    }
  }
}

export default QueuePlugin;
