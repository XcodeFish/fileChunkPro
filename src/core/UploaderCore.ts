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
 *
 * @remarks
 * UploaderCore是fileChunkPro的中央控制器，协调各专业组件完成文件上传。
 * 它管理文件分片、上传任务调度、重试策略、进度跟踪等核心功能。
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
   *
   * @param container - 依赖容器，提供核心组件和服务
   * @param options - 上传器配置选项
   *
   * @throws {UploadError} 当缺少必要参数或初始化失败时抛出错误
   *
   * @example
   * ```typescript
   * const uploader = new UploaderCore(container, {
   *   endpoint: 'https://api.example.com/upload',
   *   chunk: {
   *     size: 2 * 1024 * 1024, // 2MB固定分片大小
   *   },
   *   network: {
   *     concurrency: 3, // 3个并发上传
   *     timeout: 30000 // 30秒超时
   *   }
   * });
   * ```
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

    // 处理新旧配置格式兼容，优先使用新格式
    // 初始化默认配置
    const defaultOptions: UploaderOptions = {
      endpoint: options.endpoint,
      network: {
        concurrency: 3,
        timeout: 30000,
        adaptive: true,
        headers: {},
        withCredentials: false,
      },
      retry: {
        count: 3,
        delay: 1000,
        smart: true,
        exponentialBackoff: true,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      },
      chunk: {
        size: 'auto',
        sizeRange: {
          min: this.adaptiveStrategies.minChunkSize,
          max: this.adaptiveStrategies.maxChunkSize,
        },
        optimizeFirstChunk: false,
      },
      features: {
        autoStart: true,
        resumable: true,
        skipDuplicate: true,
        autoResume: true,
      },
      performance: {
        useWorker: EnvUtils.isWorkerSupported(),
        maxMemoryUsage: 0.9,
        enableMonitoring: true,
        checkInterval: 5000,
      },
      validation: {
        maxFileSize: EnvUtils.getMaxFileSizeSupport(),
        allowEmptyFiles: false,
      },
      security: {
        level: 'standard',
        validateResponse: true,
        contentTypeValidation: true,
      },
      debug: {
        enabled: false,
        logLevel: 'error',
        errorTracking: true,
      },
    };

    // 处理向后兼容性 - 从旧格式到新格式的映射
    if (options.concurrency !== undefined) {
      options.network = options.network || {};
      options.network.concurrency = options.concurrency;
    }

    if (options.timeout !== undefined) {
      options.network = options.network || {};
      options.network.timeout = options.timeout;
    }

    if (options.headers !== undefined) {
      options.network = options.network || {};
      options.network.headers = options.headers;
    }

    if (options.retryCount !== undefined) {
      options.retry = options.retry || {};
      options.retry.count = options.retryCount;
    }

    if (options.retryDelay !== undefined) {
      options.retry = options.retry || {};
      options.retry.delay = options.retryDelay;
    }

    if (options.chunkSize !== undefined) {
      options.chunk = options.chunk || {};
      options.chunk.size = options.chunkSize;
    }

    if (options.useWorker !== undefined) {
      options.performance = options.performance || {};
      options.performance.useWorker = options.useWorker;
    }

    if (options.autoStart !== undefined) {
      options.features = options.features || {};
      options.features.autoStart = options.autoStart;
    }

    // 深度合并配置
    this.options = this.mergeOptions(defaultOptions, options);

    // 从新配置结构中提取常用选项
    const concurrency = this.options.network?.concurrency || 3;
    const retryCount = this.options.retry?.count || 3;
    const retryDelay = this.options.retry?.delay || 1000;
    const timeout = this.options.network?.timeout || 30000;

    // 初始化任务调度器
    this.scheduler = new TaskScheduler(
      {
        concurrency,
        retryCount,
        retryDelay,
        timeout,
      },
      this.events
    );

    // 设置调度器进度回调
    this.scheduler.onProgress(progress => {
      this.emitProgress(progress);
    });

    // 设置内存阈值
    this.memoryThreshold = this.options.performance?.maxMemoryUsage || 0.9;

    // 初始化上传策略
    this.initializeUploadStrategies();

    // 检查是否有NetworkDetector
    this.networkDetector =
      this.container.tryResolve<NetworkDetector>('networkDetector');
  }

  /**
   * 深度合并配置对象
   *
   * @private
   * @param target - 目标对象
   * @param source - 源对象
   * @returns 合并后的对象
   */
  private mergeOptions<T>(target: T, source: Partial<T>): T {
    const result: any = { ...target };

    for (const key in source) {
      if (source[key] === undefined) continue;

      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (!(key in target)) {
          Object.assign(result, { [key]: source[key] });
        } else {
          result[key] = this.mergeOptions(result[key], source[key]);
        }
      } else {
        Object.assign(result, { [key]: source[key] });
      }
    }

    return result;
  }

  //===========================
  // 公共 API 方法
  //===========================

  /**
   * 发布事件
   *
   * @param event - 事件名称
   * @param data - 事件数据
   */
  public emit(event: string, data?: any): void {
    this.events.emit(event, data);
  }

  /**
   * 上传文件
   *
   * @param file - 要上传的文件对象
   * @param options - 上传选项
   * @returns 包含上传结果的Promise
   *
   * @throws {UploadError} 当上传过程中出现无法恢复的错误时
   *
   * @example
   * ```typescript
   * try {
   *   const result = await uploader.upload(file);
   *   console.log(`上传成功: ${result.fileInfo.name}`);
   *   console.log(`服务器返回:`, result.response);
   * } catch (error) {
   *   if (error instanceof UploadError) {
   *     console.error(`上传失败: ${error.message}, 错误类型: ${error.type}`);
   *   } else {
   *     console.error(`未知错误: ${error.message}`);
   *   }
   * }
   * ```
   */
  public async upload(
    file: AnyFile,
    options?: { storageKey?: string }
  ): Promise<UploadResult> {
    try {
      if (this.isCancelled) {
        this.isCancelled = false; // 重置取消状态以允许新的上传
      }

      // 验证文件
      const validationResult = await this.fileManager.validateFile(
        file as File
      );
      if (!validationResult.valid) {
        const error = new UploadError(
          UploadErrorType.VALIDATION_ERROR,
          `文件验证失败: ${validationResult.errors.join(', ')}`
        );

        // 统一错误事件
        this.events.emit('error', {
          error,
          file,
          phase: 'validation',
        });

        throw error;
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

      // 配置存储适配器 (如果指定)
      if (options?.storageKey) {
        this._currentStorageAdapter = this.getStorageAdapter(
          options.storageKey
        );
      }

      try {
        // 尝试执行预检查（秒传）
        if (this.options.features?.skipDuplicate) {
          const precheckResult = await this.runPluginHook('beforeUpload', {
            file,
            fileId,
            options: this.options,
          });

          if (precheckResult && precheckResult.skipUpload) {
            this.logger.info('文件已存在，跳过上传');

            // 结束性能追踪
            this.finishPerformanceTracking(fileId, true);

            // 从活动上传中移除
            this.activeUploads.delete(fileId);

            // 构建上传结果
            return {
              success: true,
              skipped: true, // 标记为跳过上传
              fileInfo: {
                name: file.name,
                size: file.size,
                type: file.type || '',
                uid: fileId,
              },
              metadata: precheckResult.metadata || {
                fileId,
                created: Date.now(),
                extension: file.name.split('.').pop() || '',
              },
              response: precheckResult.response || {
                message: '文件已存在，跳过上传',
              },
              stats: {
                averageSpeed: 0,
                peakSpeed: 0,
                totalBytes: file.size,
                duration: 0,
                retries: 0,
                failedChunks: 0,
                successfulChunks: chunks.length,
              },
            };
          }
        }

        // 执行实际上传
        this.events.emit('uploadStart', {
          fileId,
          fileName: file.name,
          size: file.size,
        });

        // 并行上传所有分片
        const uploadPromises = chunks.map((chunk, index) =>
          this.uploadChunk(chunk, index, fileId)
        );

        try {
          await Promise.all(uploadPromises);
        } catch (error) {
          // 如果上传被取消，抛出相应错误
          if (this.isCancelled) {
            throw new UploadError(UploadErrorType.CANCELLED, '上传已被取消');
          }

          // 抛出分片上传错误
          throw error;
        }

        // 执行合并操作
        const result = await this.mergeChunks(fileId, file.name, chunks.length);

        // 结束性能追踪
        this.finishPerformanceTracking(fileId, true);

        // 从活动上传中移除
        this.activeUploads.delete(fileId);

        // 通知上传完成
        this.events.emit('uploadComplete', {
          fileId,
          fileName: file.name,
          result,
        });

        return result;
      } catch (error) {
        // 结束性能追踪（标记为失败）
        this.finishPerformanceTracking(fileId, false);

        // 从活动上传中移除
        this.activeUploads.delete(fileId);

        // 转换错误类型
        const uploadError =
          error instanceof UploadError
            ? error
            : new UploadError(
                UploadErrorType.UPLOAD_FAILED,
                `上传失败: ${error.message || '未知错误'}`,
                { originalError: error }
              );

        // 触发错误事件
        this.events.emit('uploadError', {
          fileId,
          fileName: file.name,
          error: uploadError,
        });

        throw uploadError;
      } finally {
        // 清理资源
        this.cleanup();
      }
    } catch (error) {
      // 确保所有错误都是UploadError类型
      const uploadError =
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.UNKNOWN_ERROR,
              `上传过程中发生未知错误: ${error.message || '无错误信息'}`,
              { originalError: error }
            );

      // 触发错误事件（如果尚未触发）
      if (!(error instanceof UploadError)) {
        this.events.emit('error', { error: uploadError, file });
      }

      throw uploadError;
    }
  }

  /**
   * 准备文件上传，但不立即开始上传
   *
   * @param file - 要准备的文件
   * @returns 文件分片信息数组的Promise
   *
   * @throws {UploadError} 文件验证失败或准备过程中出错
   *
   * @example
   * ```typescript
   * // 准备文件但不立即上传
   * try {
   *   const chunks = await uploader.prepareFile(file);
   *   console.log(`文件已准备好上传，共${chunks.length}个分片`);
   *
   *   // 稍后可以调用upload方法开始上传
   *   const result = await uploader.upload(file);
   * } catch (error) {
   *   console.error('准备文件失败:', error.message);
   * }
   * ```
   */
  public async prepareFile(file: AnyFile): Promise<ChunkInfo[]> {
    try {
      // 验证文件
      const validationResult = await this.fileManager.validateFile(
        file as File
      );

      if (!validationResult.valid) {
        const error = new UploadError(
          UploadErrorType.VALIDATION_ERROR,
          `文件验证失败: ${validationResult.errors.join(', ')}`
        );

        this.events.emit('error', {
          error,
          file,
          phase: 'validation',
        });

        throw error;
      }

      // 选择最佳上传策略
      const strategy = await this.selectUploadStrategy(file);

      // 确定分片大小
      let chunkSize = strategy.chunkSize;
      if (chunkSize === 'auto') {
        const networkQuality = this.networkDetector
          ? this.networkDetector.getNetworkQuality()
          : NetworkQuality.NORMAL;
        chunkSize = this.getDynamicChunkSize(file.size, networkQuality);
      }

      // 创建分片
      const chunks = await this.fileManager.createChunks(
        file as File,
        chunkSize as number
      );

      // 触发文件准备完成事件
      this.events.emit('filePrepared', {
        file,
        chunks: chunks.length,
        chunkSize,
      });

      return chunks;
    } catch (error) {
      // 确保所有错误都是UploadError类型
      const prepareError =
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.PREPARATION_ERROR,
              `准备文件失败: ${error.message || '未知错误'}`,
              { originalError: error }
            );

      // 触发错误事件（如果尚未触发）
      if (!(error instanceof UploadError)) {
        this.events.emit('error', {
          error: prepareError,
          file,
          phase: 'preparation',
        });
      }

      throw prepareError;
    }
  }

  /**
   * 取消上传
   *
   * @param fileId - 可选的文件ID，如果不提供则取消所有上传
   *
   * @example
   * ```typescript
   * // 取消所有上传
   * uploader.cancel();
   *
   * // 取消特定文件的上传
   * uploader.cancel('file-123');
   * ```
   */
  public cancel(fileId?: string): void {
    try {
      if (fileId) {
        // 如果指定了文件ID，则只取消该文件的上传
        this.cancelSpecificFile(fileId);
      } else {
        // 否则取消所有上传
        this.isCancelled = true;
        this.scheduler.abort();

        // 取消所有活动上传
        this.activeUploads.forEach(id => {
          this.cancelSpecificFile(id);
        });

        // 发布全局取消事件
        this.events.emit('cancelAll', { timestamp: Date.now() });
      }
    } catch (error) {
      // 统一错误处理
      const cancelError =
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.OPERATION_ERROR,
              `取消上传失败: ${error.message || '未知错误'}`,
              { originalError: error }
            );

      // 触发错误事件
      this.events.emit('error', {
        error: cancelError,
        phase: 'cancel',
        fileId,
      });

      this.logger.error(`取消上传失败: ${cancelError.message}`);
    }
  }

  /**
   * 取消指定文件的上传
   *
   * @private
   * @param fileId - 要取消的文件ID
   */
  private cancelSpecificFile(fileId: string): void {
    try {
      // 如果文件不在活动上传列表中，直接返回
      if (!this.activeUploads.has(fileId)) {
        return;
      }

      // 结束性能追踪
      this.finishPerformanceTracking(fileId, false);

      // 从活动上传列表中移除
      this.activeUploads.delete(fileId);

      // 清理已取消的上传
      this.cleanupCancelledUpload(fileId);

      // 触发取消事件
      this.events.emit('cancel', { fileId, timestamp: Date.now() });

      this.logger.info(`已取消文件上传: ${fileId}`);
    } catch (error) {
      throw new UploadError(
        UploadErrorType.OPERATION_ERROR,
        `取消文件上传失败: ${error.message}`,
        { originalError: error, fileId }
      );
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
    try {
      this.logger.info(`合并分片: ${fileName}, ${chunkCount}个分片`);

      // 获取上传统计数据
      const stats = this.getUploadPerformanceStats(
        fileId
      ) as UploadPerformanceStats;

      // 构建文件元数据
      const metadata = {
        fileId,
        created: Date.now(),
        extension: fileName.split('.').pop() || '',
      };

      // 调用网络管理器执行合并请求
      const response = await this.networkManager.mergeChunks({
        fileId,
        fileName,
        chunkCount,
        metadata,
      });

      // 如果响应不成功，抛出错误
      if (!response || !response.success) {
        throw new UploadError(
          UploadErrorType.MERGE_ERROR,
          `合并分片失败: ${response?.message || '服务器未返回成功状态'}`,
          { response }
        );
      }

      // 构造统一的上传结果对象
      const result: UploadResult = {
        success: true,
        fileInfo: {
          name: fileName,
          size: stats.totalBytes,
          type: response.fileType || '',
          uid: fileId,
        },
        metadata: {
          ...metadata,
          ...response.metadata,
        },
        response: response,
        stats: {
          averageSpeed: stats.averageSpeed,
          peakSpeed: stats.peakSpeed,
          totalBytes: stats.totalBytes,
          duration: stats.duration,
          retries: stats.retries,
          failedChunks: stats.failedChunks,
          successfulChunks: chunkCount - stats.failedChunks,
        },
      };

      // 运行插件钩子
      await this.runPluginHook('afterUpload', result);

      return result;
    } catch (error) {
      const mergeError =
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.MERGE_ERROR,
              `合并分片时发生错误: ${error.message || '未知错误'}`,
              { originalError: error }
            );

      // 确保清理
      this.cleanup();

      throw mergeError;
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
   *
   * @param fileId - 要暂停上传的文件ID
   * @returns 是否成功暂停的Promise
   *
   * @throws {UploadError} 当暂停操作失败时
   *
   * @example
   * ```typescript
   * try {
   *   const success = await uploader.pauseFile('file-123');
   *   if (success) {
   *     console.log('文件上传已暂停');
   *   } else {
   *     console.log('无法暂停文件上传');
   *   }
   * } catch (error) {
   *   console.error('暂停上传失败:', error.message);
   * }
   * ```
   */
  public async pauseFile(fileId: string): Promise<boolean> {
    try {
      // 检查文件是否正在上传
      if (!this.activeUploads.has(fileId)) {
        this.logger.warn(`尝试暂停不存在的上传: ${fileId}`);
        return false;
      }

      this.logger.info(`暂停文件上传: ${fileId}`);

      // 获取上传状态
      const status = this.getFileStatus(fileId);
      if (!status) {
        return false;
      }

      // 通过插件系统执行暂停
      const pauseResult = await this.runPluginHook('pauseUpload', {
        fileId,
        status,
      });

      // 如果插件处理了暂停，使用插件的结果
      if (pauseResult?.handled) {
        // 触发暂停事件
        this.events.emit('pause', {
          fileId,
          timestamp: Date.now(),
          status: pauseResult.status || 'paused',
        });

        return true;
      }

      // 否则，使用内置暂停逻辑

      // 暂停调度器中与此文件相关的任务
      this.scheduler.pauseTasksWithMetadata({ fileId });

      // 保存当前上传状态
      const storageAdapter =
        this._currentStorageAdapter || this._defaultStorageAdapter;
      if (storageAdapter) {
        await storageAdapter.saveUploadState(fileId, {
          paused: true,
          timestamp: Date.now(),
          progress: status.progress,
          uploadedChunks: status.uploadedChunks,
        });
      }

      // 触发暂停事件
      this.events.emit('pause', {
        fileId,
        timestamp: Date.now(),
        status: 'paused',
      });

      return true;
    } catch (error) {
      // 统一错误处理
      const pauseError =
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.OPERATION_ERROR,
              `暂停上传失败: ${error.message || '未知错误'}`,
              { originalError: error, fileId }
            );

      // 触发错误事件
      this.events.emit('error', {
        error: pauseError,
        phase: 'pause',
        fileId,
      });

      throw pauseError;
    }
  }

  /**
   * 恢复指定文件的上传
   *
   * @param fileId - 要恢复上传的文件ID
   * @returns 是否成功恢复的Promise
   *
   * @throws {UploadError} 当恢复操作失败时
   *
   * @example
   * ```typescript
   * try {
   *   const success = await uploader.resumeFile('file-123');
   *   if (success) {
   *     console.log('文件上传已恢复');
   *   } else {
   *     console.log('无法恢复文件上传');
   *   }
   * } catch (error) {
   *   console.error('恢复上传失败:', error.message);
   * }
   * ```
   */
  public async resumeFile(fileId: string): Promise<boolean> {
    try {
      this.logger.info(`恢复文件上传: ${fileId}`);

      // 通过插件系统执行恢复
      const resumeResult = await this.runPluginHook('resumeUpload', {
        fileId,
      });

      // 如果插件处理了恢复，使用插件的结果
      if (resumeResult?.handled) {
        // 触发恢复事件
        this.events.emit('resume', {
          fileId,
          timestamp: Date.now(),
          status: resumeResult.status || 'uploading',
        });

        return true;
      }

      // 否则，使用内置恢复逻辑

      // 尝试从存储中加载上传状态
      const storageAdapter =
        this._currentStorageAdapter || this._defaultStorageAdapter;
      if (!storageAdapter) {
        this.logger.warn('无法恢复上传：未配置存储适配器');
        return false;
      }

      const savedState = await storageAdapter.getUploadState(fileId);
      if (!savedState) {
        this.logger.warn(`未找到可恢复的上传状态: ${fileId}`);
        return false;
      }

      // 恢复上传状态
      this.activeUploads.add(fileId);

      // 解除调度器中与此文件相关任务的暂停
      this.scheduler.resumeTasksWithMetadata({ fileId });

      // 更新存储状态
      await storageAdapter.saveUploadState(fileId, {
        ...savedState,
        paused: false,
        timestamp: Date.now(),
      });

      // 触发恢复事件
      this.events.emit('resume', {
        fileId,
        timestamp: Date.now(),
        progress: savedState.progress,
        status: 'uploading',
      });

      return true;
    } catch (error) {
      // 统一错误处理
      const resumeError =
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.OPERATION_ERROR,
              `恢复上传失败: ${error.message || '未知错误'}`,
              { originalError: error, fileId }
            );

      // 触发错误事件
      this.events.emit('error', {
        error: resumeError,
        phase: 'resume',
        fileId,
      });

      throw resumeError;
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
