/**
 * DeveloperToolsPlugin - 开发者工具插件
 * 提供调试工具、实时日志系统、错误诊断和配置验证功能
 */

import { DebugCenter } from '../core/DebugCenter';
import { UploaderCore } from '../core/UploaderCore';
import { IDeveloperToolsPluginConfig, LogLevel } from '../types/debug';
import { IPlugin } from './interfaces';

/**
 * 开发者工具插件
 * 用于提供开发时的调试和诊断功能
 */
export class DeveloperToolsPlugin implements IPlugin {
  static readonly pluginName = 'DeveloperToolsPlugin';
  private config: IDeveloperToolsPluginConfig;
  private debugCenter: DebugCenter;
  private uploaderCore: UploaderCore | null = null;
  private performanceMonitoringTimer: number | null = null;

  /**
   * 创建开发者工具插件实例
   * @param config 插件配置选项
   */
  constructor(config: IDeveloperToolsPluginConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      logLevel: config.logLevel ?? LogLevel.INFO,
      persistLogs: config.persistLogs ?? false,
      maxLogEntries: config.maxLogEntries ?? 1000,
      allowRemoteDebug: config.allowRemoteDebug ?? false,
      breakpointsEnabled: config.breakpointsEnabled ?? false,
      consoleEnabled: config.consoleEnabled ?? true,
      autoShowConsoleOnError: config.autoShowConsoleOnError ?? true,
      showPerformanceMetrics: config.showPerformanceMetrics ?? true,
      logFilters: config.logFilters,
      storageProvider: config.storageProvider,
    };

    this.debugCenter = DebugCenter.getInstance();
    this.initializeDebugCenter();
  }

  /**
   * 初始化调试中心
   */
  private initializeDebugCenter(): void {
    this.debugCenter.initialize({
      enabled: this.config.enabled,
      logLevel: this.config.logLevel,
      persistLogs: this.config.persistLogs,
      maxLogEntries: this.config.maxLogEntries,
      allowRemoteDebug: this.config.allowRemoteDebug,
      breakpointsEnabled: this.config.breakpointsEnabled,
      consoleEnabled: this.config.consoleEnabled,
    });

    // 监听错误事件，自动显示控制台
    if (this.config.autoShowConsoleOnError) {
      this.debugCenter.on('diagnostic:new', () => {
        if (this.config.consoleEnabled && this.config.autoShowConsoleOnError) {
          this.debugCenter.showConsole();
        }
      });
    }
  }

  /**
   * 安装插件到上传核心
   * @param core UploaderCore实例
   */
  public install(core: UploaderCore): void {
    this.uploaderCore = core;
    const logger = this.debugCenter.getLogger(DeveloperToolsPlugin.pluginName);
    logger.info('开发者工具插件已安装');

    // 注册事件监听
    this.registerEventListeners(core);

    // 启动性能监控
    if (this.config.showPerformanceMetrics && this.config.enabled) {
      this.startPerformanceMonitoring();
    }

    // 暴露调试方法给全局对象（仅在浏览器环境）
    if (typeof window !== 'undefined' && this.config.enabled) {
      this.exposeDebugMethods();
    }
  }

  /**
   * 注册事件监听
   * @param core UploaderCore实例
   */
  private registerEventListeners(core: UploaderCore): void {
    const logger = this.debugCenter.getLogger(DeveloperToolsPlugin.pluginName);

    // 监听上传开始事件
    core.on('upload:start', file => {
      logger.info(`开始上传文件: ${file.name}`, {
        fileId: file.id,
        fileSize: file.size,
        fileType: file.type,
      });

      // 记录性能指标
      this.debugCenter.recordPerformanceMetric({
        name: 'upload_start',
        value: 0,
        unit: 'ms',
        category: 'fileOperation',
      });
    });

    // 监听上传进度事件
    core.on('upload:progress', progress => {
      if (progress.percent % 10 === 0) {
        // 每10%记录一次，避免日志过多
        logger.debug(`上传进度: ${progress.percent}%`, {
          fileId: progress.fileId,
          loaded: progress.loaded,
          total: progress.total,
        });
      }
    });

    // 监听上传完成事件
    core.on('upload:success', result => {
      logger.info(`文件上传成功: ${result.fileName}`, {
        fileId: result.fileId,
        url: result.url,
      });

      // 记录性能指标
      this.debugCenter.recordPerformanceMetric({
        name: 'upload_success',
        value: result.duration || 0,
        unit: 'ms',
        category: 'fileOperation',
      });
    });

    // 监听上传错误事件
    core.on('upload:error', error => {
      logger.error(`文件上传失败: ${error.message}`, {
        fileId: error.fileId,
        errorType: error.type,
        errorDetails: error,
      });

      // 记录性能指标
      this.debugCenter.recordPerformanceMetric({
        name: 'upload_error',
        value: 1,
        unit: 'count',
        category: 'fileOperation',
      });
    });

    // 监听分片上传事件
    core.on('chunk:upload', chunkInfo => {
      logger.debug(`分片上传: ${chunkInfo.index + 1}/${chunkInfo.total}`, {
        fileId: chunkInfo.fileId,
        chunkIndex: chunkInfo.index,
        chunkSize: chunkInfo.size,
      });
    });

    // 监听分片上传成功事件
    core.on('chunk:success', chunkInfo => {
      logger.debug(`分片上传成功: ${chunkInfo.index + 1}/${chunkInfo.total}`, {
        fileId: chunkInfo.fileId,
        chunkIndex: chunkInfo.index,
        duration: chunkInfo.duration,
      });

      // 记录性能指标
      this.debugCenter.recordPerformanceMetric({
        name: 'chunk_upload_time',
        value: chunkInfo.duration || 0,
        unit: 'ms',
        category: 'network',
      });
    });

    // 监听分片上传失败事件
    core.on('chunk:error', chunkInfo => {
      logger.warn(`分片上传失败: ${chunkInfo.index + 1}/${chunkInfo.total}`, {
        fileId: chunkInfo.fileId,
        chunkIndex: chunkInfo.index,
        error: chunkInfo.error,
      });
    });

    // 监听重试事件
    core.on('retry', retryInfo => {
      logger.warn(`正在重试: 第${retryInfo.retryCount}次`, {
        fileId: retryInfo.fileId,
        chunkIndex: retryInfo.chunkIndex,
        delay: retryInfo.delay,
      });
    });
  }

  /**
   * 启动性能监控
   */
  private startPerformanceMonitoring(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // 每5秒收集一次性能指标
    this.performanceMonitoringTimer = window.setInterval(() => {
      this.collectPerformanceMetrics();
    }, 5000);
  }

  /**
   * 收集性能指标
   */
  private collectPerformanceMetrics(): void {
    if (!this.config.enabled || !this.config.showPerformanceMetrics) {
      return;
    }

    const metrics = this.debugCenter.getLogger('PerformanceMonitor');

    // 收集内存使用情况
    if (window.performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      this.debugCenter.recordPerformanceMetric({
        name: 'js_heap_size',
        value: Math.round(memory.usedJSHeapSize / (1024 * 1024)),
        unit: 'MB',
        category: 'memory',
      });

      this.debugCenter.recordPerformanceMetric({
        name: 'js_heap_limit',
        value: Math.round(memory.jsHeapSizeLimit / (1024 * 1024)),
        unit: 'MB',
        category: 'memory',
      });

      metrics.debug('内存使用情况', {
        usedHeap: `${Math.round(memory.usedJSHeapSize / (1024 * 1024))}MB`,
        totalHeap: `${Math.round(memory.totalJSHeapSize / (1024 * 1024))}MB`,
        limit: `${Math.round(memory.jsHeapSizeLimit / (1024 * 1024))}MB`,
      });
    }

    // 收集网络信息
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn) {
        this.debugCenter.recordPerformanceMetric({
          name: 'network_downlink',
          value: conn.downlink || 0,
          unit: 'Mbps',
          category: 'network',
        });

        this.debugCenter.recordPerformanceMetric({
          name: 'network_rtt',
          value: conn.rtt || 0,
          unit: 'ms',
          category: 'network',
        });

        metrics.debug('网络状态', {
          type: conn.type,
          effectiveType: conn.effectiveType,
          downlink: `${conn.downlink}Mbps`,
          rtt: `${conn.rtt}ms`,
          saveData: conn.saveData,
        });
      }
    }
  }

  /**
   * 暴露调试方法到全局对象
   */
  private exposeDebugMethods(): void {
    if (typeof window === 'undefined') {
      return;
    }

    (window as any).__fileChunkProDebug = {
      showConsole: () => this.debugCenter.showConsole(),
      hideConsole: () => this.debugCenter.hideConsole(),
      getLogs: (filter?: any) => this.debugCenter.getLogs(filter),
      clearLogs: () => this.debugCenter.clearLogs(),
      exportLogs: (format?: 'json' | 'text' | 'csv') =>
        this.debugCenter.exportLogs(format),
      setLogLevel: (level: LogLevel) => this.debugCenter.setLogLevel(level),
      getConfig: () => this.config,
      validateConfig: (config: any) => this.debugCenter.validateConfig(config),
      getPerformanceMetrics: (category?: string) =>
        this.debugCenter.getPerformanceMetrics(category),
      getDiagnosticResults: () => this.debugCenter.getDiagnosticResults(),
      getUploaderState: () => this.getUploaderState(),
    };
  }

  /**
   * 获取上传器状态
   */
  private getUploaderState(): Record<string, any> {
    if (!this.uploaderCore) {
      return { error: 'UploaderCore not available' };
    }

    // 这里可以根据UploaderCore的实际接口返回更多状态信息
    return {
      timestamp: Date.now(),
      config: this.uploaderCore.getConfig
        ? this.uploaderCore.getConfig()
        : 'Not available',
      state: this.uploaderCore.getState
        ? this.uploaderCore.getState()
        : 'Not available',
      // 其他状态信息
    };
  }

  /**
   * 启用调试模式
   */
  public enable(): void {
    this.config.enabled = true;
    this.debugCenter.setEnabled(true);

    if (
      this.config.showPerformanceMetrics &&
      !this.performanceMonitoringTimer
    ) {
      this.startPerformanceMonitoring();
    }

    const logger = this.debugCenter.getLogger(DeveloperToolsPlugin.pluginName);
    logger.info('开发者工具已启用');
  }

  /**
   * 禁用调试模式
   */
  public disable(): void {
    this.config.enabled = false;
    this.debugCenter.setEnabled(false);

    if (this.performanceMonitoringTimer) {
      window.clearInterval(this.performanceMonitoringTimer);
      this.performanceMonitoringTimer = null;
    }

    const logger = this.debugCenter.getLogger(DeveloperToolsPlugin.pluginName);
    logger.info('开发者工具已禁用');
  }

  /**
   * 显示开发者控制台
   */
  public showConsole(): void {
    this.debugCenter.showConsole();
  }

  /**
   * 隐藏开发者控制台
   */
  public hideConsole(): void {
    this.debugCenter.hideConsole();
  }

  /**
   * 验证上传配置
   * @param config 要验证的配置对象
   */
  public validateConfig(config: Record<string, any>) {
    return this.debugCenter.validateConfig(config);
  }

  /**
   * 获取插件名称
   */
  public static getName(): string {
    return DeveloperToolsPlugin.pluginName;
  }

  /**
   * 卸载插件时执行的清理操作
   */
  public uninstall(): void {
    if (this.performanceMonitoringTimer) {
      window.clearInterval(this.performanceMonitoringTimer);
      this.performanceMonitoringTimer = null;
    }

    // 移除全局暴露的调试方法
    if (typeof window !== 'undefined' && (window as any).__fileChunkProDebug) {
      delete (window as any).__fileChunkProDebug;
    }

    this.uploaderCore = null;
    const logger = this.debugCenter.getLogger(DeveloperToolsPlugin.pluginName);
    logger.info('开发者工具插件已卸载');
  }
}
