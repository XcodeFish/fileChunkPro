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
} from '../types/debug';
import { Logger } from '../utils/Logger';
import { ErrorCenter, UploadError } from './ErrorCenter';
import { EventBus } from './EventBus';

/**
 * 内存日志存储提供者
 */
class MemoryLogStorage implements ILogStorageProvider {
  private logs: ILogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  async saveLog(entry: ILogEntry): Promise<void> {
    this.logs.push(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }
  }

  async getLogs(filter?: ILogFilterOptions): Promise<ILogEntry[]> {
    if (!filter) {
      return [...this.logs];
    }

    return this.logs.filter(log => {
      // 过滤日志级别
      if (filter.level !== undefined && log.level > filter.level) {
        return false;
      }

      // 过滤模块名
      if (filter.module) {
        if (typeof filter.module === 'string') {
          if (log.module !== filter.module) {
            return false;
          }
        } else if (!filter.module.test(log.module)) {
          return false;
        }
      }

      // 过滤时间范围
      if (filter.timeRange) {
        if (
          filter.timeRange.start !== undefined &&
          log.timestamp < filter.timeRange.start
        ) {
          return false;
        }
        if (
          filter.timeRange.end !== undefined &&
          log.timestamp > filter.timeRange.end
        ) {
          return false;
        }
      }

      // 搜索内容
      if (filter.search) {
        const searchContent = `${log.module}:${log.message}:${JSON.stringify(log.data || '')}`;
        if (typeof filter.search === 'string') {
          if (!searchContent.includes(filter.search)) {
            return false;
          }
        } else if (!filter.search.test(searchContent)) {
          return false;
        }
      }

      return true;
    });
  }

  async clearLogs(): Promise<void> {
    this.logs = [];
  }

  async exportLogs(format: 'json' | 'text' | 'csv' = 'json'): Promise<string> {
    let result: string;

    switch (format) {
      case 'json':
        result = JSON.stringify(this.logs, null, 2);
        break;
      case 'text':
        result = this.logs
          .map(
            log =>
              `[${new Date(log.timestamp).toISOString()}] [${LogLevel[log.level]}] [${log.module}] ${log.message}`
          )
          .join('\n');
        break;
      case 'csv': {
        const header = 'Timestamp,Level,Module,Message,Data\n';
        const rows = this.logs
          .map(
            log =>
              `"${new Date(log.timestamp).toISOString()}","${LogLevel[log.level]}","${log.module}","${log.message.replace(/"/g, '""')}","${JSON.stringify(log.data || '').replace(/"/g, '""')}"`
          )
          .join('\n');
        result = header + rows;
        break;
      }
      default:
        result = JSON.stringify(this.logs);
    }

    return result;
  }
}

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
    this.logStorage = new MemoryLogStorage(this.config.maxLogEntries);
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
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    // 重新初始化日志存储
    if (this.config.persistLogs) {
      // 这里可以根据需要实现持久化存储
      this.logStorage = new MemoryLogStorage(this.config.maxLogEntries);
    } else {
      this.logStorage = new MemoryLogStorage(this.config.maxLogEntries);
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
    return this.config.logLevel;
  }

  /**
   * 设置日志级别
   */
  public setLogLevel(level: LogLevel): void {
    this.config.logLevel = level;
    const logger = this.getLogger('DebugCenter');
    logger.info(`日志级别已设置为: ${LogLevel[level]}`);
  }

  /**
   * 获取指定模块的日志记录器
   */
  public getLogger(module: string): any {
    const logger = new Logger(module, {
      level: LogLevel[this.config.logLevel].toLowerCase(),
    });

    // 拦截日志并存储
    const originalDebug = logger.debug;
    const originalInfo = logger.info;
    const originalWarn = logger.warn;
    const originalError = logger.error;

    logger.debug = (message: string, ...data: any[]) => {
      if (this.config.enabled && this.config.logLevel >= LogLevel.DEBUG) {
        this.logToStorage({
          id: `${module}_debug_${Date.now()}`,
          timestamp: Date.now(),
          level: LogLevel.DEBUG,
          module,
          message,
          data: data.length > 0 ? data : undefined,
        });
      }
      return originalDebug.call(logger, message, ...data);
    };

    logger.info = (message: string, ...data: any[]) => {
      if (this.config.enabled && this.config.logLevel >= LogLevel.INFO) {
        this.logToStorage({
          id: `${module}_info_${Date.now()}`,
          timestamp: Date.now(),
          level: LogLevel.INFO,
          module,
          message,
          data: data.length > 0 ? data : undefined,
        });
      }
      return originalInfo.call(logger, message, ...data);
    };

    logger.warn = (message: string, ...data: any[]) => {
      if (this.config.enabled && this.config.logLevel >= LogLevel.WARN) {
        this.logToStorage({
          id: `${module}_warn_${Date.now()}`,
          timestamp: Date.now(),
          level: LogLevel.WARN,
          module,
          message,
          data: data.length > 0 ? data : undefined,
        });
      }
      return originalWarn.call(logger, message, ...data);
    };

    logger.error = (message: string, ...data: any[]) => {
      if (this.config.enabled && this.config.logLevel >= LogLevel.ERROR) {
        this.logToStorage({
          id: `${module}_error_${Date.now()}`,
          timestamp: Date.now(),
          level: LogLevel.ERROR,
          module,
          message,
          data: data.length > 0 ? data : undefined,
        });
      }
      return originalError.call(logger, message, ...data);
    };

    return logger;
  }

  /**
   * 将日志存储到存储提供者
   */
  private async logToStorage(entry: ILogEntry): Promise<void> {
    try {
      await this.logStorage.saveLog(entry);
      this.eventBus.emit('log:new', entry);
    } catch (error) {
      console.error('Failed to save log entry:', error);
    }
  }

  /**
   * 获取过滤后的日志
   */
  public async getLogs(filter?: ILogFilterOptions): Promise<ILogEntry[]> {
    return await this.logStorage.getLogs(filter);
  }

  /**
   * 清除所有日志
   */
  public async clearLogs(): Promise<void> {
    await this.logStorage.clearLogs();
    this.eventBus.emit('log:cleared');
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
    if (!this.config.breakpointsEnabled) {
      throw new Error('断点功能未启用');
    }

    const id = `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newBreakpoint: IBreakpoint = {
      ...breakpoint,
      id,
      hitCount: 0,
    };

    this.breakpoints.set(id, newBreakpoint);
    this.eventBus.emit('breakpoint:added', newBreakpoint);
    return newBreakpoint;
  }

  /**
   * 移除断点
   */
  public removeBreakpoint(id: string): boolean {
    const result = this.breakpoints.delete(id);
    if (result) {
      this.eventBus.emit('breakpoint:removed', id);
    }
    return result;
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
    const diagnostic: IDiagnosticResult = {
      errorId: error.errorId,
      timestamp: error.timestamp,
      errorType: error.type,
      severity: error.severity,
      message: error.message,
      rootCause: this.determineRootCause(error),
      context: error.context || {},
      recommendation: error.recommendedSolutions || [],
      relatedErrors: [],
      recoverable: error.isRecoverable || false,
      debugInfo: {
        stack: error.stack,
        state: this.captureState(),
        environment: this.captureEnvironment(),
      },
    };

    this.diagnosticResults.push(diagnostic);
    this.eventBus.emit('diagnostic:new', diagnostic);
    return diagnostic;
  }

  /**
   * 确定错误的根本原因
   */
  private determineRootCause(error: UploadError): string {
    // 根据错误类型和上下文分析根本原因
    if (error.originalError) {
      return `${error.type}: ${error.originalError.message || error.message}`;
    }
    return `${error.type}: ${error.message}`;
  }

  /**
   * 捕获当前状态信息
   */
  private captureState(): Record<string, any> {
    // 这里可以收集当前上传任务状态、配置等信息
    return {
      timestamp: Date.now(),
      // 其他状态信息
    };
  }

  /**
   * 捕获环境信息
   */
  private captureEnvironment(): Record<string, any> {
    const env: Record<string, any> = {
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      platform:
        typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      timestamp: Date.now(),
    };

    // 浏览器环境
    if (typeof window !== 'undefined') {
      env.windowSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      env.isOnline = navigator.onLine;

      // 添加网络信息
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn) {
          env.network = {
            type: conn.type,
            effectiveType: conn.effectiveType,
            downlink: conn.downlink,
            rtt: conn.rtt,
            saveData: conn.saveData,
          };
        }
      }
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

    // 检查关键配置项是否存在
    if (!config.chunkSize) {
      issues.push({
        type: 'warning',
        field: 'chunkSize',
        message: '未设置分片大小，将使用默认值',
        recommendation: '根据网络环境设置合适的分片大小可以优化上传性能',
      });
      recommendations.push('建议设置合适的分片大小，一般在1MB~5MB之间');
    } else if (config.chunkSize < 512 * 1024) {
      issues.push({
        type: 'warning',
        field: 'chunkSize',
        message: '分片大小过小，可能影响上传性能',
        recommendation: '建议设置分片大小大于512KB',
      });
    } else if (config.chunkSize > 10 * 1024 * 1024) {
      issues.push({
        type: 'warning',
        field: 'chunkSize',
        message: '分片大小过大，可能导致单次上传失败率增加',
        recommendation: '建议分片大小不超过10MB',
      });
    }

    // 检查并发数配置
    if (!config.concurrency) {
      issues.push({
        type: 'info',
        field: 'concurrency',
        message: '未设置并发数，将使用默认值',
        recommendation: '设置合适的并发数可以优化上传速度',
      });
    } else if (config.concurrency > 10) {
      issues.push({
        type: 'warning',
        field: 'concurrency',
        message: '并发数过高，可能导致网络拥塞',
        recommendation: '一般情况下，并发数设置为3-6较为合适',
      });
    }

    // 检查重试配置
    if (!config.retryCount && config.retryCount !== 0) {
      issues.push({
        type: 'info',
        field: 'retryCount',
        message: '未设置重试次数，将使用默认值',
        recommendation: '设置合适的重试次数可以提高上传成功率',
      });
    }

    // 检查超时配置
    if (!config.timeout) {
      issues.push({
        type: 'info',
        field: 'timeout',
        message: '未设置请求超时时间，将使用默认值',
        recommendation: '设置合理的超时时间可以避免长时间等待无响应的请求',
      });
    }

    // 检查配置的一致性
    if (config.retryCount > 0 && !config.retryDelay) {
      issues.push({
        type: 'warning',
        field: 'retryDelay',
        message: '设置了重试次数但未设置重试延迟',
        recommendation: '建议设置合适的重试延迟，避免立即重试导致的网络拥塞',
      });
    }

    // 生成优化建议
    if (config.chunkSize && config.concurrency) {
      const totalBufferSize = config.chunkSize * config.concurrency;
      if (totalBufferSize > 50 * 1024 * 1024) {
        issues.push({
          type: 'warning',
          field: 'memory',
          message: '当前配置可能导致较高的内存占用',
          recommendation: '考虑减小分片大小或并发数以减少内存使用',
        });
      }
    }

    // 计算性能影响
    let performanceImpact: 'high' | 'medium' | 'low' | 'none' = 'none';
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    if (errorCount > 0) {
      performanceImpact = 'high';
    } else if (warningCount > 2) {
      performanceImpact = 'medium';
    } else if (warningCount > 0) {
      performanceImpact = 'low';
    }

    // 生成最优配置建议
    const optimalSettings: Record<string, any> = { ...config };

    // 调整可能存在问题的配置
    if (
      !optimalSettings.chunkSize ||
      optimalSettings.chunkSize < 512 * 1024 ||
      optimalSettings.chunkSize > 10 * 1024 * 1024
    ) {
      optimalSettings.chunkSize = 2 * 1024 * 1024; // 2MB
    }

    if (!optimalSettings.concurrency || optimalSettings.concurrency > 10) {
      optimalSettings.concurrency = 3;
    }

    if (!optimalSettings.retryCount && optimalSettings.retryCount !== 0) {
      optimalSettings.retryCount = 3;
    }

    if (!optimalSettings.retryDelay && optimalSettings.retryCount > 0) {
      optimalSettings.retryDelay = 1000;
    }

    return {
      isValid: errorCount === 0,
      issues,
      recommendations,
      optimalSettings,
      performanceImpact,
      securityImpact: issues.some(i => i.field === 'security')
        ? 'medium'
        : 'low',
    };
  }

  /**
   * 获取性能指标
   */
  public getPerformanceMetrics(category?: string): IPerformanceMetric[] {
    if (!category) {
      return [...this.performanceMetrics];
    }
    return this.performanceMetrics.filter(
      metric => metric.category === category
    );
  }

  /**
   * 记录性能指标
   */
  public recordPerformanceMetric(
    metric: Omit<IPerformanceMetric, 'id' | 'timestamp'>
  ): void {
    const id = `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newMetric: IPerformanceMetric = {
      ...metric,
      id,
      timestamp: Date.now(),
    };

    this.performanceMetrics.push(newMetric);

    // 保持性能指标数量在合理范围内
    if (this.performanceMetrics.length > this.config.maxLogEntries) {
      this.performanceMetrics = this.performanceMetrics.slice(
        -this.config.maxLogEntries
      );
    }

    this.eventBus.emit('performance:metric', newMetric);
  }

  /**
   * 显示控制台
   */
  public showConsole(): void {
    if (!this.config.consoleEnabled) {
      return;
    }

    this.consoleVisible = true;
    this.eventBus.emit('console:show');
  }

  /**
   * 隐藏控制台
   */
  public hideConsole(): void {
    this.consoleVisible = false;
    this.eventBus.emit('console:hide');
  }

  /**
   * 订阅事件
   */
  public on(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.on(event, handler);
  }

  /**
   * 取消订阅事件
   */
  public off(event: string, handler: (...args: any[]) => void): void {
    this.eventBus.off(event, handler);
  }
}
