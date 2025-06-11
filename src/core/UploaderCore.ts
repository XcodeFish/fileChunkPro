/**
 * UploaderCore - 核心上传模块
 * 实现文件分片处理、上传流程控制等基础功能
 *
 * 重构后的UploaderCore作为高级协调器，负责组织各个专业模块的协同工作
 * 大部分具体实现被分离到FileManager、NetworkManager等专门的组件中
 */

import {
  UploaderOptions,
  UploadResult,
  ChunkInfo,
  UploadErrorType,
  TaskPriority,
  NetworkQuality,
  UploadStrategy,
  Environment,
  DeviceCapability,
  UploadPerformanceStats,
} from '../types';
import { IServiceWorkerManager, IServiceWorkerPlugin } from '../types/services';
import EnvUtils from '../utils/EnvUtils';
import { MemoryManager } from '../utils/MemoryManager';
import { NetworkDetector } from '../utils/NetworkDetector';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { ErrorUtils } from '../utils/ErrorUtils';
import { IStorageAdapter } from '../types/storage';
import { FileManager, IFileManager } from './FileManager';
import { NetworkManager, INetworkManager } from './NetworkManager';
import { DependencyContainer } from './DependencyContainer';
import { ErrorCenter, UploadError } from './error';
import { EventBus } from './EventBus';
import { PluginManager } from './PluginManager';
import { TaskScheduler } from './TaskScheduler';
import { Logger } from '../utils/Logger';

// 文件类型统一接口
interface AnyFile {
  name: string;
  size: number;
  type?: string;
  [key: string]: any;
}

/**
 * UploaderCore - 上传器核心类
 * 作为高级协调器，负责组织各个专业模块的协同工作
 */
export class UploaderCore {
  private options: UploaderOptions;
  private events: EventBus;
  private errorCenter: ErrorCenter;
  private pluginManager: PluginManager;
  private scheduler: TaskScheduler;
  private isCancelled = false;
  private currentFileId: string | null = null;
  private memoryWatcher: NodeJS.Timeout | null = null;
  private environment: Environment;
  private deviceCapabilities: DeviceCapability;
  private performanceMonitor: PerformanceMonitor;

  // 文件和网络管理器
  private fileManager: IFileManager;
  private networkManager: INetworkManager;

  // ServiceWorker支持
  private _serviceWorkerManager: IServiceWorkerManager | null = null;

  // 日志记录器
  public logger: Logger;

  // 上传监控和管理
  private uploadStrategies: Map<string, UploadStrategy> = new Map();
  private memoryThreshold = 0.8; // 内存使用阈值，超过则调整策略
  private networkDetector: NetworkDetector | null = null;
  private activeUploads: Set<string> = new Set(); // 活动上传集合
  private failedChunks: Map<string, number> = new Map(); // 失败分片计数
  private uploadStartTime: Record<string, number> = {}; // 记录上传开始时间
  private uploadPerformance: Record<string, UploadPerformanceStats> = {}; // 上传性能数据

  // 存储适配器管理
  private _defaultStorageAdapter: IStorageAdapter | null = null;
  private _additionalStorageAdapters: Map<string, IStorageAdapter> = new Map();
  private _currentStorageAdapter: IStorageAdapter | null = null;

  // 自适应策略配置
  private adaptiveStrategies = {
    minChunkSize: 256 * 1024, // 最小分片大小 (256KB)
    maxChunkSize: 10 * 1024 * 1024, // 最大分片大小 (10MB)
  };

  /**
   * 创建UploaderCore实例
   * @param container 依赖容器
   * @param options 上传选项
   */
  constructor(
    private container: DependencyContainer,
    options: UploaderOptions
  ) {
    // 检查必要参数
    if (!options.endpoint) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '必须提供上传端点(endpoint)'
      );
    }

    // 从容器获取核心服务
    this.events = this.container.resolve<EventBus>('eventBus');
    this.errorCenter = this.container.resolve<ErrorCenter>('errorCenter');

    // 设置错误工具类的错误中心
    ErrorUtils.setErrorCenter(this.errorCenter);

    this.pluginManager = this.container.resolve<PluginManager>('pluginManager');
    this.fileManager = this.container.resolve<FileManager>('fileManager');
    this.networkManager =
      this.container.resolve<NetworkManager>('networkManager');
    this.logger = new Logger('UploaderCore');

    // 检测环境
    this.environment = EnvUtils.detectEnvironment();

    // 检测设备能力
    this.deviceCapabilities = this.detectDeviceCapabilities();

    // 初始化性能监控器
    this.performanceMonitor = new PerformanceMonitor();

    this.options = {
      ...options,
      concurrency: options.concurrency || this.getOptimalConcurrency(),
      timeout: options.timeout || 30000,
      retryCount: options.retryCount || 3,
      retryDelay: options.retryDelay || 1000,
      chunkSize: options.chunkSize || 'auto',
      headers: options.headers || {},
      useWorker: options.useWorker !== false && EnvUtils.isWorkerSupported(),
      // 新增默认设置
      enableAdaptiveUploads: options.enableAdaptiveUploads !== false,
      maxMemoryUsage: options.maxMemoryUsage || 0.9,
      smartRetry: options.smartRetry !== false,
      autoResume: options.autoResume !== false,
      adaptiveStrategies: {
        ...this.adaptiveStrategies,
        ...(options.adaptiveStrategies || {}),
      },
      enablePerformanceMonitoring:
        options.enablePerformanceMonitoring !== false,
      performanceCheckInterval: options.performanceCheckInterval || 5000,
      maxFileSize: options.maxFileSize || EnvUtils.getMaxFileSizeSupport(),
    };

    // 初始化任务调度器
    this.scheduler = new TaskScheduler(
      {
        concurrency: this.options.concurrency as number,
        retryCount: this.options.retryCount as number,
        retryDelay: this.options.retryDelay as number,
        timeout: this.options.timeout as number,
      },
      this.events
    );

    // 设置调度器进度回调
    this.scheduler.onProgress(progress => {
      this.emitProgress(progress);
    });

    // 设置内存阈值
    this.memoryThreshold = this.options.maxMemoryUsage || 0.8;

    // 初始化上传策略
    this.initializeUploadStrategies();

    // 检查是否有NetworkDetector
    this.networkDetector =
      this.container.tryResolve<NetworkDetector>('networkDetector');
  }

  //===========================
  // 公共 API 方法
  //===========================

  /**
   * 发布事件
   */
  public emit(event: string, data?: any): void {
    this.events.emit(event, data);
  }

  /**
   * 上传文件
   * @param file 要上传的文件
   * @param options 上传选项
   * @returns 上传结果
   */
  public async upload(
    file: AnyFile,
    options?: { storageKey?: string }
  ): Promise<UploadResult> {
    return ErrorUtils.safeExecuteAsync(async () => {
      if (this.isCancelled) {
        this.isCancelled = false; // 重置取消状态以允许新的上传
      }

      try {
        // 验证文件
        const validationResult = await this.fileManager.validateFile(
          file as File
        );
        if (!validationResult.valid) {
          throw new UploadError(
            UploadErrorType.VALIDATION_ERROR,
            `文件验证失败: ${validationResult.errors.join(', ')}`
          );
        }

        // 选择最佳上传策略
        const strategy = await this.selectUploadStrategy(file);

        // 根据策略确定分片大小
        let chunkSize = strategy.chunkSize;
        if (chunkSize === 'auto') {
          const networkQuality = this.networkDetector
            ? this.networkDetector.getNetworkQuality()
            : NetworkQuality.NORMAL;
          chunkSize = this.getDynamicChunkSize(file.size, networkQuality);
        }

        // 生成文件ID
        const fileId = await this.fileManager.generateFileId(file as File);
        this.currentFileId = fileId;

        // 创建分片
        const chunks = await this.fileManager.createChunks(
          file as File,
          chunkSize as number
        );

        // 记录活动上传
        this.activeUploads.add(fileId);

        // 初始化上传
        await this.initializeUpload(file, fileId, chunks.length);

        // 开始性能追踪
        this.startPerformanceTracking(fileId, file.size);

        // 配置存储适配器
        if (options?.storageKey) {
          this._currentStorageAdapter = this.getStorageAdapter(
            options.storageKey
          );
        }

        // 上传所有分片
        const promises = chunks.map((chunk, i) => {
          return this.scheduler.schedule(
            () => this.uploadChunk(chunk, i, fileId),
            {
              priority: TaskPriority.NORMAL,
              retryCount: this.options.retryCount as number,
              retryDelay: this.options.retryDelay as number,
              timeout: this.options.timeout as number,
              metadata: {
                fileId,
                chunkIndex: i,
                fileName: file.name,
                fileSize: file.size,
                chunkSize: chunk.blob.size,
              },
            }
          );
        });

        await Promise.all(promises);

        // 合并分片
        const result = await this.mergeChunks(fileId, file.name, chunks.length);

        // 结束性能追踪
        this.finishPerformanceTracking(fileId, true);

        // 移除活动上传
        this.activeUploads.delete(fileId);

        return result;
      } catch (error) {
        this.logger.error(`上传失败: ${error.message}`);

        // 如果存在fileId，结束性能追踪并移除活动上传
        if (this.currentFileId) {
          this.finishPerformanceTracking(this.currentFileId, false);
          this.activeUploads.delete(this.currentFileId);
        }

        throw this.errorCenter.normalizeError(
          error,
          UploadErrorType.UPLOAD_ERROR,
          '上传失败'
        );
      } finally {
        this.cleanup();
      }
    }) as Promise<UploadResult>;
  }

  /**
   * 公开的文件准备方法，委托给FileManager
   * @param file 要准备的文件
   * @returns 分片信息
   */
  public async prepareFile(file: AnyFile): Promise<ChunkInfo[]> {
    // 确定分片大小
    const chunkSize =
      typeof this.options.chunkSize === 'number'
        ? this.options.chunkSize
        : await this.fileManager.getOptimalChunkSize(file.size);

    return this.fileManager.createChunks(file as File, chunkSize);
  }

  /**
   * 取消上传
   * @param fileId 可选的特定文件ID，如果不提供则取消当前上传
   */
  public cancel(fileId?: string): void {
    this.isCancelled = true;

    if (fileId) {
      // 取消特定文件
      this.cancelSpecificFile(fileId);
    } else {
      // 取消当前所有上传
      // 通过调度器清除任务
      if (this.scheduler) {
        if (typeof this.scheduler.clear === 'function') {
          this.scheduler.clear();
        } else if (typeof this.scheduler.abort === 'function') {
          this.scheduler.abort();
        }
      }

      this.emit('cancel', { fileId: this.currentFileId });
    }

    // 清理被取消上传的资源
    this.cleanupCancelledUpload(fileId);
  }

  /**
   * 取消特定文件的上传
   * @param fileId 文件ID
   */
  private cancelSpecificFile(fileId: string): void {
    // 从活动上传中移除
    if (this.activeUploads.has(fileId)) {
      this.activeUploads.delete(fileId);

      // 取消相关任务
      if (this.scheduler && typeof this.scheduler.cancelTask === 'function') {
        this.scheduler.cancelTasksWithMetadata({ fileId });
      }

      // 触发特定文件取消事件
      this.emit('fileCancel', { fileId });
    }
  }

  /**
   * 清理被取消上传的资源
   * @param fileId 可选的特定文件ID
   */
  private cleanupCancelledUpload(fileId?: string): void {
    try {
      // 1. 清理内存中的文件分片
      if (fileId) {
        // 清理特定文件的分片
        this.fileManager.releaseFileChunks(fileId);
      } else {
        // 清理所有活动文件的分片
        for (const id of this.activeUploads) {
          this.fileManager.releaseFileChunks(id);
        }

        // 清空活动上传集合
        this.activeUploads.clear();
      }

      // 2. 终止相关的Worker任务
      if (this.options.useWorker) {
        const workerManager = this.container.tryResolve<any>('workerManager');
        if (workerManager) {
          if (fileId) {
            workerManager.terminateTasksByFileId(fileId);
          } else {
            workerManager.terminateAllTasks();
          }
        }
      }

      // 3. 清理上传性能统计
      if (fileId) {
        delete this.uploadPerformance[fileId];
        delete this.uploadStartTime[fileId];
      }

      // 4. 清理失败分片计数
      if (fileId) {
        this.failedChunks.delete(fileId);
      } else {
        this.failedChunks.clear();
      }

      // 5. 强制垃圾回收
      if (typeof global !== 'undefined' && global.gc) {
        this.logger.debug('触发垃圾回收');
        global.gc();
      } else {
        // 浏览器环境无法直接调用GC，使用其他方式尝试释放内存
        this.scheduleMemoryCleanup();
      }
    } catch (error) {
      this.logger.error('清理资源失败', { fileId, error });
    }
  }

  /**
   * 调度内存清理
   */
  private scheduleMemoryCleanup(): void {
    // 创建大数组然后释放，可能帮助触发浏览器的垃圾回收
    setTimeout(() => {
      try {
        const largeArray = new Array(10000000);
        for (let i = 0; i < 10000000; i++) {
          largeArray[i] = i;
        }
        // 释放引用
        largeArray.length = 0;
      } catch (e) {
        // 忽略错误，只是尝试触发GC
      }
    }, 100);
  }

  /**
   * 销毁实例，释放资源
   */
  public dispose(): void {
    // 取消所有上传
    this.cancel();

    // 清理事件监听器
    this.events.clear();

    // 停止内存监控
    if (this.memoryWatcher) {
      clearInterval(this.memoryWatcher);
      this.memoryWatcher = null;
    }

    // 关闭网络检测器
    if (this.networkDetector) {
      this.networkDetector.dispose();
      this.networkDetector = null;
    }

    // 调用插件销毁钩子
    this.runPluginHook('dispose', {});

    // 清空插件
    this.pluginManager.clearPlugins();

    // 清空策略
    this.uploadStrategies.clear();

    // 清空所有引用
    this._currentStorageAdapter = null;
    this._defaultStorageAdapter = null;
    this._additionalStorageAdapters.clear();

    // 释放文件管理器资源
    this.fileManager.dispose();

    // 重置状态
    this.currentFileId = null;
    this.isCancelled = false;

    this.logger.debug('UploaderCore已完全销毁');
  }

  /**
   * 获取插件实例
   * @param name 插件名称
   * @returns 插件实例
   */
  public getPlugin(name: string): any {
    return this.pluginManager.getPlugin(name);
  }

  /**
   * 注册插件
   * @param plugin 插件实例
   * @returns this 实例
   */
  public use(plugin: any): this {
    this.pluginManager.registerPlugin(plugin);
    return this;
  }

  /**
   * 监听事件
   * @param event 事件名称
   * @param handler 处理函数
   * @returns this 实例
   */
  public on(event: string, handler: (...args: any[]) => void): this {
    this.events.on(event, handler);
    return this;
  }

  /**
   * 取消监听事件
   * @param event 事件名称
   * @param handler 处理函数
   * @returns this 实例
   */
  public off(event: string, handler?: (...args: any[]) => void): this {
    this.events.off(event, handler);
    return this;
  }

  /**
   * 获取当前活动上传数量
   */
  public getActiveUploadsCount(): number {
    return this.activeUploads.size;
  }

  /**
   * 暂停所有上传
   */
  public pauseAll(): void {
    this.scheduler.pause();
    this.emit('pauseAll', { count: this.activeUploads.size });
  }

  /**
   * 恢复所有上传
   */
  public resumeAll(): void {
    this.scheduler.resume();
    this.emit('resumeAll', { count: this.activeUploads.size });
  }

  /**
   * 设置上传策略
   * @param name 策略名称
   * @param strategy 策略配置
   * @returns this 实例
   */
  public setUploadStrategy(name: string, strategy: UploadStrategy): this {
    this.uploadStrategies.set(name, strategy);
    return this;
  }

  /**
   * 获取上传策略
   * @param name 策略名称
   * @returns 策略配置
   */
  public getUploadStrategy(name = 'default'): UploadStrategy | undefined {
    return this.uploadStrategies.get(name);
  }

  /**
   * 获取上传性能统计
   * @param fileId 文件ID
   * @returns 性能统计
   */
  public getUploadPerformanceStats(
    fileId?: string
  ): UploadPerformanceStats | Record<string, UploadPerformanceStats> {
    if (fileId) {
      return this.uploadPerformance[fileId] || null;
    }
    return this.uploadPerformance;
  }

  // 获取各种组件的方法
  /**
   * 获取事件总线
   */
  public getEventBus(): EventBus {
    return this.events;
  }

  /**
   * 获取任务调度器
   */
  public getTaskScheduler(): TaskScheduler {
    return this.scheduler;
  }

  /**
   * 获取插件管理器
   */
  public getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * 获取文件管理器
   */
  public getFileManager(): IFileManager {
    return this.fileManager;
  }

  /**
   * 获取网络管理器
   */
  public getNetworkManager(): INetworkManager {
    return this.networkManager;
  }

  /**
   * 获取ServiceWorker管理器
   */
  public getServiceWorkerManager(): IServiceWorkerManager | null {
    return this._serviceWorkerManager;
  }

  /**
   * 获取ServiceWorker插件
   */
  public getServiceWorkerPlugin(): IServiceWorkerPlugin | undefined {
    return this.getPlugin('serviceWorker') as IServiceWorkerPlugin;
  }

  // 存储适配器相关方法
  /**
   * 获取存储适配器
   */
  public getStorageAdapter(storageKey?: string): IStorageAdapter | null {
    if (storageKey && this._additionalStorageAdapters.has(storageKey)) {
      return this._additionalStorageAdapters.get(storageKey) || null;
    }
    return this._defaultStorageAdapter;
  }

  /**
   * 设置默认存储适配器
   */
  public setStorageAdapter(adapter: IStorageAdapter): this {
    this._defaultStorageAdapter = adapter;
    return this;
  }

  /**
   * 添加存储适配器
   */
  public addStorageAdapter(key: string, adapter: IStorageAdapter): this {
    this._additionalStorageAdapters.set(key, adapter);
    return this;
  }

  /**
   * 删除存储适配器
   */
  public removeStorageAdapter(key: string): this {
    this._additionalStorageAdapters.delete(key);
    return this;
  }

  //===========================
  // 私有辅助方法
  //===========================

  /**
   * 上传分片
   * @param chunk 分片信息
   * @param index 分片索引
   * @param fileId 文件ID
   * @private
   */
  private async uploadChunk(
    chunk: ChunkInfo,
    index: number,
    fileId: string
  ): Promise<void> {
    try {
      // 运行钩子
      const hookResult = await this.runPluginHook('beforeUploadChunk', {
        chunk,
        index,
        fileId,
      });

      if (hookResult && hookResult.skip) {
        this.logger.debug(`跳过分片 ${index} 上传`);
        return;
      }

      const start = Date.now();

      // 使用NetworkManager上传分片
      await this.executeChunkUpload(chunk, index, fileId);

      const end = Date.now();

      // 更新性能统计
      this.updatePerformanceStats(fileId, chunk, 'completed');

      // 运行钩子
      await this.runPluginHook('afterUploadChunk', {
        chunk,
        index,
        fileId,
        duration: end - start,
      });
    } catch (error) {
      this.logger.error(`分片 ${index} 上传失败: ${error.message}`);

      // 更新失败计数
      const failKey = `${fileId}-${index}`;
      this.failedChunks.set(failKey, (this.failedChunks.get(failKey) || 0) + 1);

      // 更新性能统计
      this.updatePerformanceStats(fileId, chunk, 'failed');

      throw error;
    }
  }

  /**
   * 执行分片上传
   * @param chunk 分片信息
   * @param index 分片索引
   * @param fileId 文件ID
   */
  private async executeChunkUpload(
    chunk: ChunkInfo,
    index: number,
    fileId: string
  ): Promise<any> {
    const updateProgress = (progress: number) => {
      chunk.progress = progress;
      // 进度更新由scheduler处理
    };

    const url = this.options.endpoint as string;
    const headers = {
      ...this.options.headers,
      'X-File-ID': fileId,
      'X-Chunk-Index': String(index),
      'X-Total-Chunks': String(chunk.totalChunks),
    };

    // 调用NetworkManager上传分片
    const result = await this.networkManager.uploadChunk(url, chunk.blob, {
      method: 'POST',
      headers,
      onProgress: updateProgress,
      timeout: this.options.timeout as number,
      responseType: 'json',
      retries: this.options.retryCount as number,
    });

    return result.data;
  }

  /**
   * 初始化上传（与服务器交互，创建上传会话）
   * @param file 文件对象
   * @param fileId 文件唯一ID
   * @param chunkCount 分片总数
   */
  private async initializeUpload(
    file: AnyFile,
    fileId: string,
    chunkCount: number
  ): Promise<void> {
    // 调用插件钩子，准备上传
    await this.runPluginHook('initializeUpload', {
      file,
      fileId,
      chunkCount,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || this.fileManager.getFileType(file as File),
    });

    // 发出初始化事件
    this.emit('initialized', {
      fileId,
      fileName: file.name,
      fileSize: file.size,
      chunkCount,
    });
  }

  /**
   * 合并分片，完成上传
   * @param fileId 文件ID
   * @param fileName 文件名
   * @param chunkCount 分片数量
   * @returns 上传结果
   */
  private async mergeChunks(
    fileId: string,
    fileName: string,
    chunkCount: number
  ): Promise<UploadResult> {
    // 发送合并请求
    try {
      const mergeUrl = `${this.options.endpoint}`;
      const result = await this.networkManager.request(mergeUrl, {
        method: 'POST',
        headers: {
          ...this.options.headers,
          'X-File-ID': fileId,
          'X-File-Name': encodeURIComponent(fileName),
          'X-Total-Chunks': String(chunkCount),
          'Content-Type': 'application/json',
        },
        data: {
          action: 'merge',
          fileId,
          fileName,
          chunkCount,
        },
        responseType: 'json',
      });

      // 运行插件钩子
      await this.runPluginHook('afterMergeChunks', {
        fileId,
        fileName,
        chunkCount,
        result: result.data,
      });

      // 返回结果
      return {
        fileId,
        url: result.data?.url || '',
        success: true,
      };
    } catch (error) {
      this.logger.error(`合并分片失败: ${error.message}`);
      throw this.errorCenter.normalizeError(
        error,
        UploadErrorType.MERGE_ERROR,
        '合并分片失败'
      );
    }
  }

  /**
   * 安全执行插件钩子
   * 使用ErrorUtils封装runPluginHook方法提高错误处理一致性
   */
  private async runPluginHook(hookName: string, args: any): Promise<any> {
    return ErrorUtils.safeExecuteAsync(async () => {
      return await this.pluginManager.runHook(hookName, args);
    });
  }

  /**
   * 发出进度事件
   */
  private emitProgress(progress: number): void {
    this.emit('progress', {
      progress,
      fileId: this.currentFileId,
    });
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    // 清空当前文件ID
    this.currentFileId = null;
  }

  /**
   * 启动性能追踪
   * @param fileId 文件ID
   * @param fileSize 文件大小
   */
  private startPerformanceTracking(fileId: string, fileSize: number): void {
    // 初始化性能数据
    this.uploadStartTime[fileId] = Date.now();
    this.uploadPerformance[fileId] = {
      fileId,
      fileSize,
      startTime: this.uploadStartTime[fileId],
      endTime: 0,
      duration: 0,
      avgSpeed: 0,
      chunks: {
        total: 0,
        completed: 0,
        failed: 0,
        retried: 0,
      },
      bytesUploaded: 0,
    };
  }

  /**
   * 更新性能统计
   * @param fileId 文件ID
   * @param chunkInfo 分片信息
   * @param status 状态
   */
  private updatePerformanceStats(
    fileId: string,
    chunkInfo: ChunkInfo,
    status: 'completed' | 'failed' | 'retried'
  ): void {
    if (!this.uploadPerformance[fileId]) return;

    const stats = this.uploadPerformance[fileId];

    // 更新分片计数
    if (status === 'completed') {
      stats.chunks.completed++;
      stats.bytesUploaded += chunkInfo.blob?.size || 0;
    } else if (status === 'failed') {
      stats.chunks.failed++;
    } else if (status === 'retried') {
      stats.chunks.retried++;
    }

    // 更新总分片数
    if (stats.chunks.total === 0 && chunkInfo.totalChunks) {
      stats.chunks.total = chunkInfo.totalChunks;
    }

    // 计算平均速度
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - stats.startTime) / 1000;
    if (elapsedSeconds > 0) {
      stats.avgSpeed = stats.bytesUploaded / elapsedSeconds;
    }
  }

  /**
   * 完成性能追踪
   * @param fileId 文件ID
   * @param success 是否成功
   */
  private finishPerformanceTracking(fileId: string, success: boolean): void {
    if (!this.uploadPerformance[fileId]) return;

    const stats = this.uploadPerformance[fileId];
    const endTime = Date.now();

    // 更新统计数据
    stats.endTime = endTime;
    stats.duration = endTime - stats.startTime;
    stats.success = success;

    // 如果时间大于0，重新计算平均速度
    if (stats.duration > 0) {
      stats.avgSpeed = stats.bytesUploaded / (stats.duration / 1000);
    }

    // 发出性能事件
    this.emit('performanceStats', { stats });
  }

  /**
   * 动态调整分片大小
   * @param fileSize 文件大小
   * @param networkQuality 网络质量
   */
  private getDynamicChunkSize(
    fileSize: number,
    networkQuality: NetworkQuality
  ): number {
    return this.fileManager.getOptimalChunkSize(fileSize, networkQuality);
  }

  /**
   * 检测设备能力
   * @returns 设备能力对象
   */
  private detectDeviceCapabilities(): DeviceCapability {
    const capabilities: DeviceCapability = {
      memory: 'normal',
      processor: 'normal',
      network: 'normal',
      storage: 'normal',
      battery: 'normal',
    };

    // 检测处理器能力
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      if (navigator.hardwareConcurrency <= 2) {
        capabilities.processor = 'low';
      } else if (navigator.hardwareConcurrency >= 8) {
        capabilities.processor = 'high';
      }
    }

    // 检测内存能力
    if (MemoryManager.isLowMemoryDevice()) {
      capabilities.memory = 'low';
    }

    return capabilities;
  }

  /**
   * 获取最佳并发数
   */
  private getOptimalConcurrency(): number {
    // 基于环境和设备能力，决定最佳并发数
    if (this.environment === Environment.MINIPROGRAM) {
      // 小程序环境下限制并发
      return 2;
    } else if (this.deviceCapabilities?.processor === 'low') {
      // 低性能处理器
      return 2;
    } else if (this.deviceCapabilities?.memory === 'low') {
      // 低内存设备
      return 2;
    } else {
      // 普通设备
      return 3;
    }
  }

  /**
   * 初始化上传策略
   */
  private initializeUploadStrategies(): void {
    // 默认策略
    this.uploadStrategies.set('default', {
      chunkSize: 2 * 1024 * 1024, // 2MB
      concurrency: this.options.concurrency as number,
      retryCount: this.options.retryCount as number,
      retryDelay: this.options.retryDelay as number,
      prioritizeFirstChunk: true,
      prioritizeLastChunk: false,
    });

    // 高性能策略 (适合网络良好，设备性能好)
    this.uploadStrategies.set('highPerformance', {
      chunkSize: 5 * 1024 * 1024, // 5MB
      concurrency: Math.min((this.options.concurrency as number) + 2, 8),
      retryCount: Math.max((this.options.retryCount as number) - 1, 1),
      retryDelay: Math.max((this.options.retryDelay as number) - 500, 500),
      prioritizeFirstChunk: true,
      prioritizeLastChunk: true,
    });

    // 可靠性策略 (适合网络不稳定)
    this.uploadStrategies.set('reliability', {
      chunkSize: 1 * 1024 * 1024, // 1MB
      concurrency: Math.max(
        Math.floor((this.options.concurrency as number) / 2),
        1
      ),
      retryCount: Math.min((this.options.retryCount as number) + 2, 7),
      retryDelay: (this.options.retryDelay as number) * 1.5,
      prioritizeFirstChunk: false,
      prioritizeLastChunk: false,
    });

    // 省电模式 (适合低电量设备)
    this.uploadStrategies.set('powerSaving', {
      chunkSize: 1 * 1024 * 1024, // 1MB
      concurrency: 1,
      retryCount: this.options.retryCount as number,
      retryDelay: this.options.retryDelay as number,
      prioritizeFirstChunk: true,
      prioritizeLastChunk: false,
    });
  }

  /**
   * 选择上传策略
   * @param file 文件对象
   * @returns 选择的上传策略
   */
  private async selectUploadStrategy(file: AnyFile): Promise<UploadStrategy> {
    // 如果不启用自适应上传，直接使用默认策略
    if (!this.options.enableAdaptiveUploads) {
      return this.uploadStrategies.get('default')!;
    }

    // 检测网络质量
    let networkQuality: NetworkQuality = NetworkQuality.MEDIUM;
    if (this.networkDetector) {
      try {
        networkQuality = this.networkDetector.getNetworkQuality();
      } catch (error) {
        // 如果网络检测失败，使用默认策略
        this.logger.error('网络质量检测失败', error);
      }
    }

    // 基于网络和设备状况选择策略
    if (
      networkQuality === NetworkQuality.GOOD &&
      this.deviceCapabilities.memory !== 'low'
    ) {
      return this.uploadStrategies.get('highPerformance')!;
    } else if (
      networkQuality === NetworkQuality.POOR ||
      file.size > 100 * 1024 * 1024
    ) {
      return this.uploadStrategies.get('reliability')!;
    } else if (this.deviceCapabilities.battery === 'low') {
      return this.uploadStrategies.get('powerSaving')!;
    }

    return this.uploadStrategies.get('default')!;
  }

  /**
   * 暂停指定文件的上传
   * @param fileId 文件ID
   * @returns 是否成功暂停
   */
  public async pauseFile(fileId: string): Promise<boolean> {
    if (!this.activeUploads.has(fileId)) {
      this.logger.warn('尝试暂停不存在的上传', { fileId });
      return false;
    }

    try {
      // 暂停与该文件相关的任务
      let tasksPaused = false;
      if (
        this.scheduler &&
        typeof this.scheduler.pauseTasksWithMetadata === 'function'
      ) {
        tasksPaused = await this.scheduler.pauseTasksWithMetadata({ fileId });
      }

      // 触发文件暂停事件
      this.emit('filePause', { fileId, timestamp: Date.now() });

      this.logger.debug('文件上传已暂停', { fileId });

      return tasksPaused;
    } catch (error) {
      this.logger.error('暂停文件上传失败', { fileId, error });
      return false;
    }
  }

  /**
   * 恢复指定文件的上传
   * @param fileId 文件ID
   * @returns 是否成功恢复
   */
  public async resumeFile(fileId: string): Promise<boolean> {
    try {
      let tasksResumed = false;

      // 恢复与该文件相关的任务
      if (
        this.scheduler &&
        typeof this.scheduler.resumeTasksWithMetadata === 'function'
      ) {
        tasksResumed = await this.scheduler.resumeTasksWithMetadata({ fileId });
      }

      if (tasksResumed) {
        // 如果文件不在活动上传列表中，添加回来
        if (!this.activeUploads.has(fileId)) {
          this.activeUploads.add(fileId);
        }

        // 触发文件恢复事件
        this.emit('fileResume', { fileId, timestamp: Date.now() });

        this.logger.debug('文件上传已恢复', { fileId });
      }

      return tasksResumed;
    } catch (error) {
      this.logger.error('恢复文件上传失败', { fileId, error });
      return false;
    }
  }

  /**
   * 获取文件上传状态信息
   * @param fileId 文件ID
   * @returns 文件状态信息
   */
  public getFileStatus(fileId: string): {
    active: boolean;
    progress: number;
    remainingChunks: number;
    uploadedChunks: number;
    state: string;
    uploadSpeed: number;
    timeRemaining: number;
  } | null {
    // 检查是否是活动上传
    const isActive = this.activeUploads.has(fileId);

    // 尝试从插件获取详细信息
    const resumePlugin = this.pluginManager.getPlugin('ResumePlugin');
    if (resumePlugin && typeof resumePlugin.getFileProgress === 'function') {
      // 获取文件进度
      const fileProgress = resumePlugin.getFileProgress(fileId);
      if (fileProgress !== null) {
        // 计算剩余时间
        const timeRemaining = this.estimateRemainingTime(fileId, fileProgress);

        // 计算上传速度
        const uploadSpeed = this.calculateUploadSpeed(fileId);

        // 获取文件状态
        const status = resumePlugin.getFileStatus
          ? resumePlugin.getFileStatus(fileId)
          : 'unknown';

        return {
          active: isActive,
          progress: fileProgress,
          remainingChunks: resumePlugin.getRemainingChunks
            ? resumePlugin.getRemainingChunks(fileId)
            : 0,
          uploadedChunks: resumePlugin.getUploadedChunks
            ? resumePlugin.getUploadedChunks(fileId)
            : 0,
          state: status,
          uploadSpeed,
          timeRemaining,
        };
      }
    }

    // 如果没有获得详细信息，返回基本状态
    return isActive
      ? {
          active: true,
          progress: 0,
          remainingChunks: 0,
          uploadedChunks: 0,
          state: 'uploading',
          uploadSpeed: 0,
          timeRemaining: 0,
        }
      : null;
  }

  /**
   * 注册上传操作回调
   * @param operation 操作类型
   * @param callback 回调函数
   */
  public onOperation(
    operation: 'pause' | 'resume' | 'cancel',
    callback: (data: any) => void
  ): void {
    const eventMap = {
      pause: 'filePause',
      resume: 'fileResume',
      cancel: 'fileCancel',
    };

    this.events.on(eventMap[operation], callback);
  }

  /**
   * 取消注册上传操作回调
   * @param operation 操作类型
   * @param callback 回调函数
   */
  public offOperation(
    operation: 'pause' | 'resume' | 'cancel',
    callback?: (data: any) => void
  ): void {
    const eventMap = {
      pause: 'filePause',
      resume: 'fileResume',
      cancel: 'fileCancel',
    };

    this.events.off(eventMap[operation], callback);
  }

  /**
   * 获取所有活动上传的信息
   * @returns 活动上传信息列表
   */
  public getActiveUploads(): Array<{
    fileId: string;
    progress: number;
    state: string;
    speed: number;
  }> {
    const result = [];

    for (const fileId of this.activeUploads) {
      const status = this.getFileStatus(fileId);
      if (status) {
        result.push({
          fileId,
          progress: status.progress,
          state: status.state,
          speed: status.uploadSpeed,
        });
      }
    }

    return result;
  }

  /**
   * 计算指定文件的上传速度（字节/秒）
   */
  private calculateUploadSpeed(fileId: string): number {
    const performance = this.uploadPerformance[fileId];
    if (!performance) return 0;

    const now = Date.now();
    const startTime = this.uploadStartTime[fileId] || now;
    const elapsedSeconds = (now - startTime) / 1000;

    if (elapsedSeconds <= 0) return 0;

    return Math.round(performance.bytesUploaded / elapsedSeconds);
  }

  /**
   * 估算上传剩余时间（秒）
   */
  private estimateRemainingTime(fileId: string, progress: number): number {
    const performance = this.uploadPerformance[fileId];
    if (!performance || progress >= 1) return 0;

    const now = Date.now();
    const startTime = this.uploadStartTime[fileId] || now;
    const elapsedSeconds = (now - startTime) / 1000;

    if (elapsedSeconds <= 0 || progress <= 0) return 0;

    // 根据已完成的进度和耗时估算
    const totalTime = elapsedSeconds / progress;
    const remainingTime = totalTime - elapsedSeconds;

    return Math.round(remainingTime);
  }
}
