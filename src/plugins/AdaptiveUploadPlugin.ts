import { IPlugin } from './interfaces';
import {
  IAdaptiveUploadConfig,
  INetworkQualityResult,
  AdaptiveStrategyEventType,
  IUploadParameters,
  IUploadPath,
  ICDNNode,
  NetworkQualityLevel,
  IAdaptiveStrategyEvent,
} from '../types/AdaptiveUploadTypes';
import {
  NetworkDetector,
  ParameterAdjuster,
  PathOptimizer,
  CDNSelector,
} from './adaptive';
import { UploaderCore } from '../core/UploaderCore';
import { NetworkQuality, UploadStrategy } from '../types';

/**
 * 自适应上传策略插件
 * 根据网络状况动态调整上传参数，优化上传路径和CDN选择
 */
export class AdaptiveUploadPlugin implements IPlugin {
  public readonly name = 'AdaptiveUploadPlugin';
  private config: Required<IAdaptiveUploadConfig>;
  private networkDetector: NetworkDetector | null = null;
  private parameterAdjuster: ParameterAdjuster | null = null;
  private pathOptimizer: PathOptimizer | null = null;
  private cdnSelector: CDNSelector | null = null;
  private uploaderCore: any = null;
  private latestNetworkQuality: INetworkQualityResult | null = null;
  private fileUploadParams: Map<string, IUploadParameters> = new Map();
  private fileUploadPaths: Map<string, IUploadPath> = new Map();
  private fileCDNNodes: Map<string, ICDNNode> = new Map();
  private isInitialized = false;
  private uploader: UploaderCore | null = null;
  private options: AdaptiveUploadOptions;
  private uploadStrategies: Map<string, UploadStrategy> = new Map();
  private currentNetworkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * 自适应上传策略插件构造函数
   * @param config 配置选项
   */
  constructor(config: IAdaptiveUploadConfig) {
    // 合并默认配置
    this.config = {
      enableNetworkDetection: true,
      networkMonitoringInterval: 60000, // 每分钟检测一次
      enableParameterAdjustment: true,
      enablePathOptimization: true,
      enableCDNSelection: true,
      initialParameters: {},
      customPaths: [],
      customCDNNodes: [],
      minChunkSize: 128 * 1024, // 128KB
      maxChunkSize: 4 * 1024 * 1024, // 4MB
      minConcurrency: 1,
      maxConcurrency: 6,
      perFileStrategy: true,
      debug: false,
      ...config,
    };

    // 初始化上传策略
    this.initializeUploadStrategies();
  }

  /**
   * 安装插件
   * @param uploaderCore 上传器核心实例
   */
  public install(uploaderCore: any): void {
    this.uploaderCore = uploaderCore;
    this.initComponents();
    this.registerHooks();
    this.isInitialized = true;

    if (this.config.debug) {
      console.log('[AdaptiveUploadPlugin] 已安装');
    }
  }

  /**
   * 初始化组件
   * @private
   */
  private initComponents(): void {
    // 初始化网络检测器
    if (this.config.enableNetworkDetection) {
      this.networkDetector = new NetworkDetector({
        autoStart: true,
        monitoringInterval: this.config.networkMonitoringInterval,
      });

      // 监听网络变化
      this.networkDetector.onNetworkChange(this.handleNetworkChange.bind(this));
    }

    // 初始化参数调整器
    if (this.config.enableParameterAdjustment) {
      this.parameterAdjuster = new ParameterAdjuster({
        minChunkSize: this.config.minChunkSize,
        maxChunkSize: this.config.maxChunkSize,
        minConcurrency: this.config.minConcurrency,
        maxConcurrency: this.config.maxConcurrency,
      });
    }

    // 初始化路径优化器
    if (this.config.enablePathOptimization) {
      this.pathOptimizer = new PathOptimizer({
        defaultPaths: this.config.customPaths || [],
      });
    }

    // 初始化CDN选择器
    if (this.config.enableCDNSelection) {
      this.cdnSelector = new CDNSelector({
        defaultNodes: this.config.customCDNNodes || [],
      });
    }
  }

  /**
   * 注册钩子
   * @private
   */
  private registerHooks(): void {
    const core = this.uploaderCore;

    // 注册自适应上传钩子
    core.hook('adaptiveUpload:configure', this.handleConfigure.bind(this));
    core.hook('adaptiveUpload:enable', this.handleEnable.bind(this));
    core.hook('adaptiveUpload:disable', this.handleDisable.bind(this));

    // 注册文件准备钩子
    core.hook('beforeFileUpload', this.onBeforeFileUpload.bind(this));
    core.hook('beforeUpload', this.onBeforeFileUpload.bind(this));

    // 注册分片准备钩子
    core.hook('beforeChunkUpload', this.onBeforeChunkUpload.bind(this));

    // 注册上传完成钩子
    core.hook('fileUploadSuccess', this.onFileUploadSuccess.bind(this));
    core.hook('uploadComplete', this.onFileUploadSuccess.bind(this));

    // 注册上传失败钩子
    core.hook('fileUploadError', this.onFileUploadError.bind(this));
    core.hook('uploadError', this.onFileUploadError.bind(this));

    // 注册网络质量变化钩子
    core.hook(
      'networkQualityChange',
      this.handleNetworkQualityChange.bind(this)
    );

    // 注册资源释放钩子
    core.hook('destroy', this.onDestroy.bind(this));
  }

  /**
   * 处理网络变化
   * @param networkQuality 网络质量结果
   * @private
   */
  private handleNetworkChange(networkQuality: INetworkQualityResult): void {
    this.latestNetworkQuality = networkQuality;

    // 触发网络质量变化事件
    this.emitStrategyEvent(AdaptiveStrategyEventType.NETWORK_QUALITY_CHANGE, {
      networkQuality,
    });

    if (this.config.debug) {
      console.log(
        `[AdaptiveUploadPlugin] 网络质量变化: ${networkQuality.qualityLevel}`,
        networkQuality
      );
    }

    // 如果不是按文件策略，则全局调整参数
    if (!this.config.perFileStrategy && this.parameterAdjuster) {
      const currentGlobalParams = this.uploaderCore.getOptions();
      const adjustedParams = this.parameterAdjuster.adjustParameters(
        networkQuality,
        currentGlobalParams
      );

      // 应用全局参数调整
      this.applyGlobalParameters(adjustedParams);

      // 触发参数调整事件
      this.emitStrategyEvent(AdaptiveStrategyEventType.PARAMETERS_ADJUSTED, {
        parameters: adjustedParams,
        isGlobal: true,
      });
    }
  }

  /**
   * 文件上传前处理
   * @param file 文件对象
   * @param options 上传选项
   * @returns 处理后的上传选项
   * @private
   */
  private async onBeforeFileUpload(file: any, options: any): Promise<any> {
    if (!this.isInitialized || !this.latestNetworkQuality) {
      return options;
    }

    const fileId = file.id || file.uniqueIdentifier || file.name + file.size;
    let updatedOptions = { ...options };

    // 调整上传参数
    if (this.config.enableParameterAdjustment && this.parameterAdjuster) {
      const currentParams = this.getUploadParameters(options);
      const adjustedParams = this.parameterAdjuster.adjustParameters(
        this.latestNetworkQuality,
        currentParams
      );

      // 保存文件特定参数
      this.fileUploadParams.set(fileId, adjustedParams);

      // 更新选项
      updatedOptions = this.applyParametersToOptions(
        adjustedParams,
        updatedOptions
      );

      // 触发参数调整事件
      this.emitStrategyEvent(AdaptiveStrategyEventType.PARAMETERS_ADJUSTED, {
        fileId,
        parameters: adjustedParams,
        isGlobal: false,
      });

      if (this.config.debug) {
        console.log(
          `[AdaptiveUploadPlugin] 文件参数调整: ${fileId}`,
          adjustedParams
        );
      }
    }

    // 优化上传路径
    if (this.config.enablePathOptimization && this.pathOptimizer) {
      try {
        const availablePaths = await this.pathOptimizer.getAvailablePaths();
        if (availablePaths.length > 0) {
          const optimalPath = this.pathOptimizer.selectOptimalPath(
            this.latestNetworkQuality,
            availablePaths
          );

          // 保存文件特定路径
          this.fileUploadPaths.set(fileId, optimalPath);

          // 更新上传URL
          if (optimalPath.url) {
            updatedOptions.target = optimalPath.url;
          }

          // 触发路径优化事件
          this.emitStrategyEvent(AdaptiveStrategyEventType.PATH_OPTIMIZED, {
            fileId,
            path: optimalPath,
          });

          if (this.config.debug) {
            console.log(
              `[AdaptiveUploadPlugin] 路径优化: ${fileId}`,
              optimalPath
            );
          }
        }
      } catch (error) {
        console.error('[AdaptiveUploadPlugin] 路径优化失败:', error);
      }
    }

    // 选择CDN节点
    if (this.config.enableCDNSelection && this.cdnSelector) {
      try {
        const availableCDNs = await this.cdnSelector.getAvailableCDNs();
        if (availableCDNs.length > 0) {
          const optimalCDN = await this.cdnSelector.selectOptimalCDN(
            this.latestNetworkQuality,
            file.size
          );

          // 保存文件特定CDN节点
          this.fileCDNNodes.set(fileId, optimalCDN);

          // 如果没有设置优化路径，则使用CDN URL
          if (!this.fileUploadPaths.has(fileId) && optimalCDN.url) {
            updatedOptions.target = optimalCDN.url;
          }

          // 触发CDN选择事件
          this.emitStrategyEvent(AdaptiveStrategyEventType.CDN_SELECTED, {
            fileId,
            cdn: optimalCDN,
          });

          if (this.config.debug) {
            console.log(
              `[AdaptiveUploadPlugin] CDN选择: ${fileId}`,
              optimalCDN
            );
          }
        }
      } catch (error) {
        console.error('[AdaptiveUploadPlugin] CDN选择失败:', error);
      }
    }

    // 触发策略应用事件
    this.emitStrategyEvent(AdaptiveStrategyEventType.STRATEGY_APPLIED, {
      fileId,
      options: updatedOptions,
    });

    return updatedOptions;
  }

  /**
   * 分片上传前处理
   * @param chunk 分片对象
   * @param options 上传选项
   * @returns 处理后的上传选项
   * @private
   */
  private onBeforeChunkUpload(chunk: any, options: any): any {
    if (!this.isInitialized || !this.latestNetworkQuality) {
      return options;
    }

    // 如果网络质量恶化，可以在分片级别进行调整
    const currentQuality = this.latestNetworkQuality.qualityLevel;
    if (
      currentQuality === NetworkQualityLevel.VERY_POOR ||
      currentQuality === NetworkQualityLevel.POOR
    ) {
      // 降低超时时间
      const updatedOptions = { ...options };

      // 针对糟糕网络增加超时时间
      updatedOptions.timeout = options.timeout ? options.timeout * 1.5 : 60000;

      return updatedOptions;
    }

    return options;
  }

  /**
   * 文件上传成功处理
   * @param file 文件对象
   * @param _response 响应数据
   * @private
   */
  private onFileUploadSuccess(file: any, _response: any): void {
    if (!this.isInitialized) {
      return;
    }

    const fileId = file.id || file.uniqueIdentifier || file.name + file.size;

    // 记录成功参数
    if (this.parameterAdjuster && this.latestNetworkQuality) {
      const params = this.fileUploadParams.get(fileId);
      if (params) {
        // 计算传输速率
        const transferRate = this.calculateTransferRate(file);

        // 记录成功结果，用于自适应学习
        this.parameterAdjuster.recordUploadResult(
          this.latestNetworkQuality,
          params,
          true,
          transferRate
        );
      }
    }

    // 更新路径状态
    if (this.pathOptimizer) {
      const path = this.fileUploadPaths.get(fileId);
      if (path) {
        this.pathOptimizer.updatePathStatus(path.url, true);
      }
    }

    // 更新CDN状态
    if (this.cdnSelector) {
      const cdn = this.fileCDNNodes.get(fileId);
      if (cdn) {
        this.cdnSelector.updateCDNStatus(cdn.id, cdn.latency || 100, 1.0);
      }
    }

    // 清理文件特定记录
    this.cleanupFileRecords(fileId);
  }

  /**
   * 文件上传失败处理
   * @param file 文件对象
   * @param error 错误信息
   * @private
   */
  private onFileUploadError(file: any, error: any): void {
    if (!this.isInitialized) {
      return;
    }

    const fileId = file.id || file.uniqueIdentifier || file.name + file.size;

    // 记录失败参数
    if (this.parameterAdjuster && this.latestNetworkQuality) {
      const params = this.fileUploadParams.get(fileId);
      if (params) {
        // 记录失败结果
        this.parameterAdjuster.recordUploadResult(
          this.latestNetworkQuality,
          params,
          false
        );
      }
    }

    // 更新路径状态
    if (this.pathOptimizer) {
      const path = this.fileUploadPaths.get(fileId);
      if (path) {
        this.pathOptimizer.updatePathStatus(path.url, false);
      }
    }

    // 更新CDN状态
    if (this.cdnSelector) {
      const cdn = this.fileCDNNodes.get(fileId);
      if (cdn) {
        this.cdnSelector.updateCDNStatus(cdn.id, cdn.latency || 500, 0.0);
      }
    }

    // 触发策略错误事件
    this.emitStrategyEvent(AdaptiveStrategyEventType.STRATEGY_ERROR, {
      fileId,
      error,
    });

    // 清理文件特定记录
    this.cleanupFileRecords(fileId);
  }

  /**
   * 销毁插件
   * @private
   */
  private onDestroy(): void {
    // 停止网络监控
    if (this.networkDetector) {
      this.networkDetector.stopMonitoring();
    }

    // 清理路径优化器
    if (this.pathOptimizer) {
      this.pathOptimizer.dispose();
    }

    // 清理CDN选择器
    if (this.cdnSelector) {
      this.cdnSelector.dispose();
    }

    // 清理缓存
    this.fileUploadParams.clear();
    this.fileUploadPaths.clear();
    this.fileCDNNodes.clear();

    this.isInitialized = false;

    if (this.config.debug) {
      console.log('[AdaptiveUploadPlugin] 已销毁');
    }
  }

  /**
   * 发送策略事件
   * @param type 事件类型
   * @param data 事件数据
   * @private
   */
  private emitStrategyEvent(type: AdaptiveStrategyEventType, data: any): void {
    if (!this.uploaderCore || !this.uploaderCore.events) {
      return;
    }

    const event: IAdaptiveStrategyEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    this.uploaderCore.events.emit('adaptiveStrategy', event);
  }

  /**
   * 从上传选项中提取上传参数
   * @param options 上传选项
   * @returns 上传参数
   * @private
   */
  private getUploadParameters(options: any): IUploadParameters {
    // 合并默认值、初始配置和当前选项
    return {
      chunkSize: options.chunkSize || 1024 * 1024,
      concurrency: options.simultaneousUploads || 3,
      retryCount: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
      precheckEnabled: options.precheckEnabled || false,
      useWorker: options.useWorker || false,
      ...this.config.initialParameters,
    };
  }

  /**
   * 将上传参数应用到上传选项
   * @param parameters 上传参数
   * @param options 上传选项
   * @returns 更新后的上传选项
   * @private
   */
  private applyParametersToOptions(
    parameters: IUploadParameters,
    options: any
  ): any {
    return {
      ...options,
      chunkSize: parameters.chunkSize,
      simultaneousUploads: parameters.concurrency,
      maxRetries: parameters.retryCount,
      retryDelay: parameters.retryDelay,
      timeout: parameters.timeout,
      precheckEnabled: parameters.precheckEnabled,
      useWorker: parameters.useWorker,
    };
  }

  /**
   * 应用全局参数调整
   * @param parameters 上传参数
   * @private
   */
  private applyGlobalParameters(parameters: IUploadParameters): void {
    if (!this.uploaderCore || !this.uploaderCore.setOptions) {
      return;
    }

    // 将参数转换为上传器选项格式
    const options = this.applyParametersToOptions(parameters, {});

    // 应用全局选项
    this.uploaderCore.setOptions(options);

    if (this.config.debug) {
      console.log('[AdaptiveUploadPlugin] 应用全局参数调整', parameters);
    }
  }

  /**
   * 计算传输速率
   * @param file 文件对象
   * @returns 传输速率 (KB/s)
   * @private
   */
  private calculateTransferRate(file: any): number {
    // 如果文件对象包含上传统计信息
    if (file.stats && file.stats.averageSpeed) {
      return file.stats.averageSpeed / 1024; // 转换为KB/s
    }

    // 简单计算：文件大小 / 上传时间
    if (file.uploadStartTime && file.uploadEndTime) {
      const uploadTimeSeconds =
        (file.uploadEndTime - file.uploadStartTime) / 1000;
      if (uploadTimeSeconds > 0) {
        return file.size / 1024 / uploadTimeSeconds;
      }
    }

    // 无法计算
    return 0;
  }

  /**
   * 清理文件特定记录
   * @param fileId 文件ID
   * @private
   */
  private cleanupFileRecords(fileId: string): void {
    this.fileUploadParams.delete(fileId);
    this.fileUploadPaths.delete(fileId);
    this.fileCDNNodes.delete(fileId);
  }

  /**
   * 初始化上传策略
   */
  private initializeUploadStrategies(): void {
    // 极差网络策略
    this.uploadStrategies.set(NetworkQuality.POOR, {
      concurrency: 1,
      chunkSize: 256 * 1024, // 256KB
      retryCount: 5,
      retryDelay: 3000,
      timeout: 60000, // 60秒
    });

    // 一般网络策略
    this.uploadStrategies.set(NetworkQuality.MEDIUM, {
      concurrency: 2,
      chunkSize: 1 * 1024 * 1024, // 1MB
      retryCount: 3,
      retryDelay: 2000,
      timeout: 30000, // 30秒
    });

    // 良好网络策略
    this.uploadStrategies.set(NetworkQuality.GOOD, {
      concurrency: 4,
      chunkSize: 4 * 1024 * 1024, // 4MB
      retryCount: 2,
      retryDelay: 1000,
      timeout: 20000, // 20秒
    });

    // 极好网络策略
    this.uploadStrategies.set(NetworkQuality.EXCELLENT, {
      concurrency: 6,
      chunkSize: 8 * 1024 * 1024, // 8MB
      retryCount: 1,
      retryDelay: 500,
      timeout: 15000, // 15秒
    });
  }

  /**
   * 选择上传策略
   */
  private selectUploadStrategy(file: any): UploadStrategy {
    const fileSize = file.size;
    const quality = this.currentNetworkQuality;

    // 获取与当前网络质量匹配的策略
    const strategy = this.getStrategyForNetworkQuality(quality);

    // 根据文件大小调整分片大小
    if (this.options.adjustChunkSize) {
      // 对于大文件，增加分片大小以提高效率
      if (fileSize > 100 * 1024 * 1024) {
        // 100MB以上
        strategy.chunkSize = Math.min(
          strategy.chunkSize * 2,
          this.options.maxChunkSize as number
        );
      }

      // 对于小文件，减小分片大小
      if (fileSize < 10 * 1024 * 1024) {
        // 10MB以下
        strategy.chunkSize = Math.max(
          strategy.chunkSize / 2,
          this.options.minChunkSize as number
        );
      }
    }

    return strategy;
  }

  /**
   * 根据网络质量获取策略
   */
  private getStrategyForNetworkQuality(
    quality: NetworkQuality
  ): UploadStrategy {
    // 默认使用中等网络策略
    let strategy = this.uploadStrategies.get(
      NetworkQuality.MEDIUM
    ) as UploadStrategy;

    // 如果存在指定质量的策略，使用对应策略
    if (this.uploadStrategies.has(quality)) {
      strategy = this.uploadStrategies.get(quality) as UploadStrategy;
    }

    return { ...strategy };
  }

  /**
   * 应用策略到上传器
   */
  private applyStrategy(strategy: UploadStrategy): void {
    if (!this.uploader) return;

    // 调整调度器配置
    const scheduler = this.uploader.getTaskScheduler();

    if (scheduler) {
      scheduler.updateConfig({
        concurrency: strategy.concurrency,
        retryCount: strategy.retryCount,
        retryDelay: strategy.retryDelay,
        timeout: strategy.timeout,
      });
    }

    // 记录应用的策略
    if (this.uploader) {
      this.uploader.emit('adaptiveStrategyApplied', {
        strategy,
        networkQuality: this.currentNetworkQuality,
      });
    }
  }

  /**
   * 开始监控
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkNetworkQuality();
    }, this.options.samplingInterval);
  }

  /**
   * 停止监控
   */
  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * 重启监控
   */
  private restartMonitoring(): void {
    this.stopMonitoring();
    this.startMonitoring();
  }

  /**
   * 检查网络质量
   */
  private checkNetworkQuality(): void {
    if (this.networkDetector) {
      this.networkDetector.detectNetworkQuality();
    }
  }

  /**
   * 获取当前网络质量
   */
  public getCurrentNetworkQuality(): NetworkQuality {
    return this.currentNetworkQuality;
  }

  /**
   * 获取当前策略
   */
  public getCurrentStrategy(): UploadStrategy {
    return this.getStrategyForNetworkQuality(this.currentNetworkQuality);
  }

  /**
   * 销毁插件
   */
  public uninstall(): void {
    this.stopMonitoring();

    if (this.networkDetector) {
      this.networkDetector.dispose();
      this.networkDetector = null;
    }

    this.uploader = null;
  }

  /**
   * 处理配置更新
   */
  private handleConfigure({ options }: { options: Partial<any> }): {
    handled: boolean;
  } {
    if (this.config.debug) {
      console.log('[AdaptiveUploadPlugin] 更新配置:', options);
    }

    // 合并配置
    this.config = {
      ...this.config,
      ...options,
    };

    // 如果调整了采样间隔，重启监控
    if (options.networkMonitoringInterval && this.networkDetector) {
      this.networkDetector.stopMonitoring();
      this.networkDetector.startMonitoring(options.networkMonitoringInterval);
    }

    return { handled: true };
  }

  /**
   * 处理启用自适应上传
   */
  private handleEnable(): { handled: boolean } {
    this.config.enableNetworkDetection = true;
    this.config.enableParameterAdjustment = true;
    this.config.enablePathOptimization = true;

    if (this.networkDetector && !this.networkDetector.isMonitoring()) {
      this.networkDetector.startMonitoring(
        this.config.networkMonitoringInterval
      );
    }

    if (this.config.debug) {
      console.log('[AdaptiveUploadPlugin] 自适应上传已启用');
    }

    return { handled: true };
  }

  /**
   * 处理禁用自适应上传
   */
  private handleDisable(): { handled: boolean } {
    this.config.enableNetworkDetection = false;
    this.config.enableParameterAdjustment = false;
    this.config.enablePathOptimization = false;

    if (this.networkDetector) {
      this.networkDetector.stopMonitoring();
    }

    if (this.config.debug) {
      console.log('[AdaptiveUploadPlugin] 自适应上传已禁用');
    }

    return { handled: true };
  }

  /**
   * 处理网络质量变化
   */
  private handleNetworkQualityChange({
    quality,
  }: {
    quality: NetworkQuality;
  }): { handled: boolean } {
    // 转换为内部网络质量类型
    let internalQuality: NetworkQualityLevel;

    switch (quality) {
      case NetworkQuality.POOR:
        internalQuality = NetworkQualityLevel.POOR;
        break;
      case NetworkQuality.MEDIUM:
        internalQuality = NetworkQualityLevel.MODERATE;
        break;
      case NetworkQuality.GOOD:
        internalQuality = NetworkQualityLevel.GOOD;
        break;
      case NetworkQuality.EXCELLENT:
        internalQuality = NetworkQualityLevel.EXCELLENT;
        break;
      default:
        internalQuality = NetworkQualityLevel.MODERATE;
    }

    // 创建网络质量结果对象
    const networkQualityResult: INetworkQualityResult = {
      qualityLevel: internalQuality,
      downloadSpeed: 0, // 这些值可以从NetworkDetector获取
      uploadSpeed: 0,
      latency: 0,
      isUnstable: false,
      timestamp: Date.now(),
    };

    // 触发网络变化处理
    this.handleNetworkChange(networkQualityResult);

    return { handled: true };
  }
}
