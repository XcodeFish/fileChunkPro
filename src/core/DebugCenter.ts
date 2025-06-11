/**
 * DebugCenter - 核心调试中心
 * 为开发者提供调试工具、日志系统、错误诊断和配置验证功能
 */

import {
  IDebugCenter,
  IDebugConfig,
  LogLevel,
  ILogEntry,
  ILogFilterOptions,
  IBreakpoint,
  IDiagnosticResult,
  IConfigValidationResult,
  IPerformanceMetric,
  ILogStorageProvider,
  LogLevelStringType,
  logLevelFromString,
} from '../types/debug';
import { Logger } from '../utils/Logger';
import { ErrorCenter, UploadError } from './error';
import { EventBus } from './EventBus';
import {
  PerformanceCollector,
  PerformanceMetricType,
} from '../utils/PerformanceCollector';
import { LogStorage } from '../utils/LogStorage';

/**
 * 调试中心类 - 实现IDebugCenter接口
 */
export class DebugCenter implements IDebugCenter {
  private static instance: DebugCenter;
  private config: IDebugConfig;
  private logStorage: ILogStorageProvider;
  private breakpoints: Map<string, IBreakpoint> = new Map();
  private diagnosticResults: IDiagnosticResult[] = [];
  private performanceMetrics: IPerformanceMetric[] = [];
  private consoleVisible = false;
  private eventBus: EventBus;
  private errorCenter: ErrorCenter;
  private readonly DEFAULT_CONFIG: IDebugConfig = {
    enabled: false,
    logLevel: LogLevel.INFO,
    persistLogs: false,
    maxLogEntries: 1000,
    allowRemoteDebug: false,
    breakpointsEnabled: false,
    consoleEnabled: true,
  };

  /**
   * 获取调试中心单例
   */
  public static getInstance(): DebugCenter {
    if (!DebugCenter.instance) {
      DebugCenter.instance = new DebugCenter();
    }
    return DebugCenter.instance;
  }

  /**
   * 私有构造函数，防止外部直接实例化
   */
  private constructor() {
    this.config = { ...this.DEFAULT_CONFIG };
    this.logStorage = new LogStorage({
      maxEntries: this.config.maxLogEntries,
      cleanupThreshold: Math.floor(this.config.maxLogEntries * 0.8),
    });
    this.eventBus = new EventBus();
    this.errorCenter = new ErrorCenter();
    this.setupErrorHandler();
  }

  /**
   * 设置错误处理程序
   */
  private setupErrorHandler(): void {
    // 注册全局错误处理
    if (typeof window !== 'undefined') {
      window.addEventListener('error', event => {
        if (this.config.enabled) {
          this.handleJsError(event);
        }
      });

      window.addEventListener('unhandledrejection', event => {
        if (this.config.enabled) {
          this.handlePromiseError(event);
        }
      });
    }

    // 注册ErrorCenter错误处理
    ErrorCenter.registerErrorHandler(
      'ALL', // 处理所有类型的错误
      (error: UploadError) => {
        if (this.config.enabled) {
          this.createDiagnosticResult(error);
          return false; // 允许其他处理程序继续处理
        }
        return false;
      }
    );
  }

  /**
   * 处理JavaScript错误
   */
  private handleJsError(event: ErrorEvent): void {
    const logEntry: ILogEntry = {
      id: `js_error_${Date.now()}`,
      timestamp: Date.now(),
      level: LogLevel.ERROR,
      module: 'window',
      message: `JavaScript错误: ${event.message}`,
      data: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
          ? {
              name: event.error.name,
              message: event.error.message,
              stack: event.error.stack,
            }
          : null,
      },
    };

    this.logToStorage(logEntry);
  }

  /**
   * 处理Promise错误
   */
  private handlePromiseError(event: PromiseRejectionEvent): void {
    const logEntry: ILogEntry = {
      id: `promise_error_${Date.now()}`,
      timestamp: Date.now(),
      level: LogLevel.ERROR,
      module: 'promise',
      message: `未捕获的Promise异常`,
      data: {
        reason:
          event.reason instanceof Error
            ? {
                name: event.reason.name,
                message: event.reason.message,
                stack: event.reason.stack,
              }
            : event.reason,
      },
    };

    this.logToStorage(logEntry);
  }

  /**
   * 初始化调试中心
   */
  public initialize(config: Partial<IDebugConfig>): void {
    // 处理logLevel字段，确保正确转换
    if (typeof config.logLevel === 'string') {
      config = {
        ...config,
        logLevel: logLevelFromString(config.logLevel),
      };
    }

    // 合并配置
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    // 重新初始化日志存储
    if (this.config.persistLogs) {
      // 使用高效索引的日志存储
      this.logStorage = new LogStorage({
        maxEntries: this.config.maxLogEntries,
        cleanupThreshold: Math.floor(this.config.maxLogEntries * 0.8),
      });
    } else {
      // 非持久化也使用高效存储，只是不保存到磁盘
      this.logStorage = new LogStorage({
        maxEntries: this.config.maxLogEntries,
        cleanupThreshold: Math.floor(this.config.maxLogEntries * 0.8),
      });
    }

    // 记录初始化完成日志
    const logger = this.getLogger('DebugCenter');
    logger.info('调试中心初始化完成', { config: this.config });
  }

  /**
   * 检查是否启用调试模式
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 设置是否启用调试模式
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    const logger = this.getLogger('DebugCenter');
    logger.info(`调试模式已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 获取当前日志级别
   */
  public getLogLevel(): LogLevel {
    return typeof this.config.logLevel === 'string'
      ? logLevelFromString(this.config.logLevel)
      : this.config.logLevel;
  }

  /**
   * 设置日志级别
   */
  public setLogLevel(level: LogLevel | LogLevelStringType): void {
    if (typeof level === 'string') {
      this.config.logLevel = logLevelFromString(level);
    } else {
      this.config.logLevel = level;
    }

    const logger = this.getLogger('DebugCenter');
    logger.info(`日志级别已设置为: ${LogLevel[this.getLogLevel()]}`);
  }

  /**
   * 获取指定模块的日志记录器
   */
  public getLogger(module: string): Logger {
    const logger = new Logger(module, {
      level: this.getLogLevel(),
    });

    // 拦截日志并存储
    const originalDebug = logger.debug;
    const originalInfo = logger.info;
    const originalWarn = logger.warn;
    const originalError = logger.error;

    logger.debug = (message: string, ...data: any[]) => {
      if (this.config.enabled && this.getLogLevel() >= LogLevel.DEBUG) {
        const logEntryId = `${module}_debug_${Date.now()}`;
        // 创建性能快照关联
        const perfSnapshotId = this.createPerformanceSnapshot(
          'log_debug',
          module
        );

        this.logToStorage({
          id: logEntryId,
          timestamp: Date.now(),
          level: LogLevel.DEBUG,
          module,
          message,
          data: data.length > 0 ? data : undefined,
          performanceSnapshotId: perfSnapshotId,
        });
      }
      return originalDebug.call(logger, message, ...data);
    };

    logger.info = (message: string, ...data: any[]) => {
      if (this.config.enabled && this.getLogLevel() >= LogLevel.INFO) {
        const logEntryId = `${module}_info_${Date.now()}`;
        // 创建性能快照关联
        const perfSnapshotId = this.createPerformanceSnapshot(
          'log_info',
          module
        );

        this.logToStorage({
          id: logEntryId,
          timestamp: Date.now(),
          level: LogLevel.INFO,
          module,
          message,
          data: data.length > 0 ? data : undefined,
          performanceSnapshotId: perfSnapshotId,
        });
      }
      return originalInfo.call(logger, message, ...data);
    };

    logger.warn = (message: string, ...data: any[]) => {
      if (this.config.enabled && this.getLogLevel() >= LogLevel.WARN) {
        const logEntryId = `${module}_warn_${Date.now()}`;
        // 创建性能快照关联
        const perfSnapshotId = this.createPerformanceSnapshot(
          'log_warn',
          module
        );

        this.logToStorage({
          id: logEntryId,
          timestamp: Date.now(),
          level: LogLevel.WARN,
          module,
          message,
          data: data.length > 0 ? data : undefined,
          performanceSnapshotId: perfSnapshotId,
        });
      }
      return originalWarn.call(logger, message, ...data);
    };

    logger.error = (message: string, ...data: any[]) => {
      if (this.config.enabled) {
        const logEntryId = `${module}_error_${Date.now()}`;
        // 创建性能快照关联
        const perfSnapshotId = this.createPerformanceSnapshot(
          'log_error',
          module
        );

        this.logToStorage({
          id: logEntryId,
          timestamp: Date.now(),
          level: LogLevel.ERROR,
          module,
          message,
          data: data.length > 0 ? data : undefined,
          performanceSnapshotId: perfSnapshotId,
        });
      }
      return originalError.call(logger, message, ...data);
    };

    return logger;
  }

  /**
   * 创建性能快照
   */
  private createPerformanceSnapshot(eventType: string, module: string): string {
    const snapshotId = `perf_snapshot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 收集性能数据
    PerformanceCollector.getInstance().collect(
      PerformanceMetricType.LOG_ASSOCIATION,
      undefined,
      {
        metricId: snapshotId,
        eventType,
        module,
      }
    );

    return snapshotId;
  }

  /**
   * 将日志保存到存储
   */
  private async logToStorage(entry: ILogEntry): Promise<void> {
    try {
      await this.logStorage.saveLog(entry);
    } catch (error) {
      console.error('保存日志到存储失败:', error);
    }
  }

  /**
   * 获取日志
   */
  public async getLogs(filter?: ILogFilterOptions): Promise<ILogEntry[]> {
    return await this.logStorage.getLogs(filter);
  }

  /**
   * 清除日志
   */
  public async clearLogs(): Promise<void> {
    await this.logStorage.clearLogs();
    const logger = this.getLogger('DebugCenter');
    logger.info('日志已清除');
  }

  /**
   * 导出日志
   */
  public async exportLogs(
    format: 'json' | 'text' | 'csv' = 'json'
  ): Promise<string> {
    return await this.logStorage.exportLogs(format);
  }

  /**
   * 添加断点
   */
  public addBreakpoint(
    breakpoint: Omit<IBreakpoint, 'id' | 'hitCount'>
  ): IBreakpoint {
    const id = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newBreakpoint: IBreakpoint = {
      ...breakpoint,
      id,
      hitCount: 0,
    };

    this.breakpoints.set(id, newBreakpoint);

    const logger = this.getLogger('DebugCenter');
    logger.info(
      `断点已添加: ${breakpoint.moduleName}${breakpoint.functionName ? `::${breakpoint.functionName}` : ''}`,
      { breakpointId: id, active: breakpoint.active }
    );

    return newBreakpoint;
  }

  /**
   * 移除断点
   */
  public removeBreakpoint(id: string): boolean {
    const success = this.breakpoints.delete(id);

    if (success) {
      const logger = this.getLogger('DebugCenter');
      logger.info(`断点已移除: ${id}`);
    }

    return success;
  }

  /**
   * 获取所有断点
   */
  public getBreakpoints(): IBreakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * 创建错误诊断结果
   */
  private createDiagnosticResult(error: UploadError): IDiagnosticResult {
    const diagnosticResult: IDiagnosticResult = {
      errorId: error.id,
      timestamp: Date.now(),
      errorType: error.type,
      severity: error.isFatal ? '致命' : '一般',
      message: error.message,
      rootCause: this.determineRootCause(error),
      context: error.context || {},
      recommendation: [],
      relatedErrors: [],
      recoverable: !error.isFatal,
      debugInfo: {
        stack: error.stack,
        state: this.captureState(),
        environment: this.captureEnvironment(),
      },
    };

    // 生成推荐解决方案
    diagnosticResult.recommendation = this.generateRecommendations(error);

    // 将诊断结果添加到集合
    this.diagnosticResults.push(diagnosticResult);

    return diagnosticResult;
  }

  /**
   * 确定错误根本原因
   */
  private determineRootCause(error: UploadError): string {
    // 基于错误类型和诊断数据确定根本原因
    if (error.diagnosticData && error.diagnosticData.rootCause) {
      return error.diagnosticData.rootCause;
    }

    return `未知(${error.type})`;
  }

  /**
   * 生成错误推荐解决方案
   */
  private generateRecommendations(error: UploadError): string[] {
    // 基于错误类型提供解决建议
    const recommendations: string[] = [];

    switch (error.type) {
      case 'NETWORK_ERROR':
        recommendations.push('检查网络连接是否正常');
        recommendations.push('确保服务器地址配置正确');
        break;
      case 'TIMEOUT_ERROR':
        recommendations.push('检查网络质量');
        recommendations.push('增加超时配置');
        recommendations.push('考虑减小分片大小');
        break;
      case 'FILE_ERROR':
        recommendations.push('检查文件格式是否正确');
        recommendations.push('验证文件权限');
        break;
      // 更多针对不同错误类型的推荐解决方案
      default:
        recommendations.push('查看详细错误信息');
        recommendations.push('联系技术支持');
    }

    return recommendations;
  }

  /**
   * 捕获当前状态
   */
  private captureState(): Record<string, any> {
    // 捕获运行时状态
    return {
      timestamp: Date.now(),
      enabled: this.config.enabled,
      breakpointsCount: this.breakpoints.size,
      diagnosticsCount: this.diagnosticResults.length,
    };
  }

  /**
   * 捕获环境信息
   */
  private captureEnvironment(): Record<string, any> {
    const env: Record<string, any> = {
      timestamp: Date.now(),
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      platform:
        typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    };

    // 捕获性能数据
    if (typeof window !== 'undefined' && window.performance) {
      const timing = window.performance.timing;
      env.performance = {
        navigationStart: timing.navigationStart,
        domComplete: timing.domComplete,
        loadEventEnd: timing.loadEventEnd,
      };

      // 计算关键性能指标
      env.performanceMetrics = {
        pageLoadTime: timing.loadEventEnd - timing.navigationStart,
        domProcessingTime: timing.domComplete - timing.domLoading,
        networkLatency: timing.responseEnd - timing.fetchStart,
      };
    }

    // 捕获内存使用情况（如果可用）
    if (typeof window !== 'undefined' && (window.performance as any).memory) {
      env.memory = (window.performance as any).memory;
    }

    return env;
  }

  /**
   * 获取诊断结果
   */
  public getDiagnosticResults(): IDiagnosticResult[] {
    return [...this.diagnosticResults];
  }

  /**
   * 验证配置
   */
  public validateConfig(config: Record<string, any>): IConfigValidationResult {
    const issues: Array<{
      type: 'error' | 'warning' | 'info';
      field?: string;
      message: string;
      recommendation?: string;
    }> = [];

    const recommendations: string[] = [];

    // 验证基本配置
    if (config.chunkSize !== undefined) {
      if (typeof config.chunkSize !== 'number' || config.chunkSize <= 0) {
        issues.push({
          type: 'error',
          field: 'chunkSize',
          message: 'chunkSize必须是正整数',
          recommendation: '请设置合适的分片大小，例如2MB（2 * 1024 * 1024）',
        });
      } else {
        // 分析分片大小是否合适
        if (config.chunkSize < 1024 * 1024) {
          // 小于1MB
          issues.push({
            type: 'warning',
            field: 'chunkSize',
            message: '分片大小过小，可能导致请求数过多',
            recommendation: '建议将分片大小设置为1MB-10MB之间',
          });
        } else if (config.chunkSize > 20 * 1024 * 1024) {
          // 大于20MB
          issues.push({
            type: 'warning',
            field: 'chunkSize',
            message: '分片大小过大，可能导致上传失败率增加',
            recommendation: '建议将分片大小设置为1MB-10MB之间',
          });
        }
      }
    } else {
      recommendations.push('未设置分片大小，将使用默认值');
    }

    // 并发数验证
    if (config.concurrency !== undefined) {
      if (
        typeof config.concurrency !== 'number' ||
        config.concurrency <= 0 ||
        !Number.isInteger(config.concurrency)
      ) {
        issues.push({
          type: 'error',
          field: 'concurrency',
          message: 'concurrency必须是正整数',
          recommendation: '请设置合适的并发数，例如3',
        });
      } else if (config.concurrency > 6) {
        issues.push({
          type: 'warning',
          field: 'concurrency',
          message: '并发数过高可能导致网络阻塞',
          recommendation: '建议将并发数设置为3-6之间',
        });
      } else if (config.concurrency === 1) {
        issues.push({
          type: 'info',
          field: 'concurrency',
          message: '并发数为1，上传速度可能较慢',
          recommendation: '建议将并发数设置为3-6之间以提高上传速度',
        });
      }
    }

    // 重试次数验证
    if (config.retryCount !== undefined) {
      if (
        typeof config.retryCount !== 'number' ||
        config.retryCount < 0 ||
        !Number.isInteger(config.retryCount)
      ) {
        issues.push({
          type: 'error',
          field: 'retryCount',
          message: 'retryCount必须是非负整数',
          recommendation: '请设置合适的重试次数，例如3',
        });
      } else if (config.retryCount === 0) {
        issues.push({
          type: 'warning',
          field: 'retryCount',
          message: '重试次数为0，上传失败将不会重试',
          recommendation: '建议设置重试次数为3-5以提高上传成功率',
        });
      } else if (config.retryCount > 10) {
        issues.push({
          type: 'warning',
          field: 'retryCount',
          message: '重试次数过多可能导致资源浪费',
          recommendation: '建议将重试次数设置为3-5之间',
        });
      }
    }

    // 计算性能影响
    let performanceImpact: 'high' | 'medium' | 'low' | 'none' = 'none';
    let securityImpact: 'high' | 'medium' | 'low' | 'none' = 'none';

    // 基于配置计算性能影响
    const concurrencyIssue = issues.find(i => i.field === 'concurrency');
    const chunkSizeIssue = issues.find(i => i.field === 'chunkSize');

    if (
      (concurrencyIssue && concurrencyIssue.type === 'error') ||
      (chunkSizeIssue && chunkSizeIssue.type === 'error')
    ) {
      performanceImpact = 'high';
    } else if (
      (concurrencyIssue && concurrencyIssue.type === 'warning') ||
      (chunkSizeIssue && chunkSizeIssue.type === 'warning')
    ) {
      performanceImpact = 'medium';
    } else {
      performanceImpact = 'low';
    }

    // 验证安全配置（如果有）
    if (config.securityLevel !== undefined) {
      if (!['basic', 'standard', 'advanced'].includes(config.securityLevel)) {
        issues.push({
          type: 'error',
          field: 'securityLevel',
          message: 'securityLevel必须是basic、standard或advanced',
          recommendation: '请设置有效的安全级别',
        });
        securityImpact = 'high';
      } else if (config.securityLevel === 'basic') {
        issues.push({
          type: 'info',
          field: 'securityLevel',
          message: '使用基本安全级别，安全性较低',
          recommendation: '如需更高安全性，请考虑设置为standard或advanced',
        });
        securityImpact = 'medium';
      }
    } else {
      securityImpact = 'low';
    }

    // 推荐的最优配置
    const optimalSettings: Record<string, any> = {};
    if (config.chunkSize === undefined || chunkSizeIssue) {
      optimalSettings.chunkSize = 5 * 1024 * 1024; // 5MB
    }
    if (config.concurrency === undefined || concurrencyIssue) {
      optimalSettings.concurrency = 3;
    }
    if (
      config.retryCount === undefined ||
      issues.find(i => i.field === 'retryCount')
    ) {
      optimalSettings.retryCount = 3;
    }

    return {
      isValid: !issues.some(issue => issue.type === 'error'),
      issues,
      recommendations,
      optimalSettings:
        Object.keys(optimalSettings).length > 0 ? optimalSettings : undefined,
      performanceImpact,
      securityImpact,
    };
  }

  /**
   * 获取性能指标
   */
  public getPerformanceMetrics(category?: string): IPerformanceMetric[] {
    if (category) {
      return this.performanceMetrics.filter(m => m.category === category);
    }
    return [...this.performanceMetrics];
  }

  /**
   * 记录性能指标
   */
  public recordPerformanceMetric(
    metric: Omit<IPerformanceMetric, 'id' | 'timestamp'>
  ): void {
    const id = `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();

    const fullMetric: IPerformanceMetric = {
      ...metric,
      id,
      timestamp,
    };

    this.performanceMetrics.push(fullMetric);

    // 记录日志
    const logger = this.getLogger('DebugCenter');
    logger.debug(`性能指标: ${metric.name} = ${metric.value}${metric.unit}`, {
      category: metric.category,
      id,
    });

    // 如果指标数量过多，移除最旧的
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.splice(0, 100);
    }
  }

  /**
   * 显示控制台
   */
  public showConsole(): void {
    if (!this.consoleVisible) {
      this.consoleVisible = true;
      this.eventBus.emit('console:show');

      const logger = this.getLogger('DebugCenter');
      logger.debug('调试控制台已显示');
    }
  }

  /**
   * 隐藏控制台
   */
  public hideConsole(): void {
    if (this.consoleVisible) {
      this.consoleVisible = false;
      this.eventBus.emit('console:hide');

      const logger = this.getLogger('DebugCenter');
      logger.debug('调试控制台已隐藏');
    }
  }

  /**
   * 注册事件处理程序
   */
  public on(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.on(event, handler);
  }

  /**
   * 注销事件处理程序
   */
  public off(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.off(event, handler);
  }
}
