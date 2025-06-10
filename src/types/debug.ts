/**
 * 调试工具类型定义文件
 * 定义了调试工具、实时日志系统、错误诊断工具和配置验证器的相关类型
 */

/**
 * 日志级别枚举
 */
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  ALL = 5
}

/**
 * 日志条目接口
 */
export interface ILogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
}

/**
 * 日志过滤选项
 */
export interface ILogFilterOptions {
  level?: LogLevel;
  module?: string | RegExp;
  timeRange?: {
    start?: number;
    end?: number;
  };
  search?: string | RegExp;
}

/**
 * 日志存储提供者接口
 */
export interface ILogStorageProvider {
  saveLog(entry: ILogEntry): Promise<void>;
  getLogs(filter?: ILogFilterOptions): Promise<ILogEntry[]>;
  clearLogs(): Promise<void>;
  exportLogs(format?: 'json' | 'text' | 'csv'): Promise<string>;
}

/**
 * 断点接口
 */
export interface IBreakpoint {
  id: string;
  active: boolean;
  moduleName: string;
  functionName?: string;
  condition?: string;
  hitCount: number;
}

/**
 * 调试工具配置
 */
export interface IDebugConfig {
  enabled: boolean;
  logLevel: LogLevel;
  persistLogs: boolean;
  maxLogEntries: number;
  allowRemoteDebug: boolean;
  breakpointsEnabled: boolean;
  consoleEnabled: boolean;
}

/**
 * 性能指标接口
 */
export interface IPerformanceMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  category: 'network' | 'memory' | 'cpu' | 'fileOperation' | 'rendering' | 'other';
}

/**
 * 错误诊断结果接口
 */
export interface IDiagnosticResult {
  errorId: string;
  timestamp: number;
  errorType: string;
  severity: string;
  message: string;
  rootCause: string;
  context: Record<string, any>;
  recommendation: string[];
  relatedErrors: string[];
  recoverable: boolean;
  debugInfo: {
    stack?: string;
    state?: Record<string, any>;
    environment?: Record<string, any>;
  };
}

/**
 * 配置验证结果接口
 */
export interface IConfigValidationResult {
  isValid: boolean;
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    field?: string;
    message: string;
    recommendation?: string;
  }>;
  recommendations: string[];
  optimalSettings?: Record<string, any>;
  performanceImpact?: 'high' | 'medium' | 'low' | 'none';
  securityImpact?: 'high' | 'medium' | 'low' | 'none';
}

/**
 * 调试中心接口
 */
export interface IDebugCenter {
  initialize(config: Partial<IDebugConfig>): void;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  getLogLevel(): LogLevel;
  setLogLevel(level: LogLevel): void;
  getLogger(module: string): any;
  getLogs(filter?: ILogFilterOptions): ILogEntry[];
  clearLogs(): void;
  exportLogs(format?: 'json' | 'text' | 'csv'): string;
  addBreakpoint(breakpoint: Omit<IBreakpoint, 'id' | 'hitCount'>): IBreakpoint;
  removeBreakpoint(id: string): boolean;
  getBreakpoints(): IBreakpoint[];
  getDiagnosticResults(): IDiagnosticResult[];
  validateConfig(config: Record<string, any>): IConfigValidationResult;
  getPerformanceMetrics(category?: string): IPerformanceMetric[];
  recordPerformanceMetric(metric: Omit<IPerformanceMetric, 'id' | 'timestamp'>): void;
  showConsole(): void;
  hideConsole(): void;
}

/**
 * 开发者工具插件配置接口
 */
export interface IDeveloperToolsPluginConfig {
  enabled?: boolean;
  logLevel?: LogLevel;
  persistLogs?: boolean;
  maxLogEntries?: number;
  allowRemoteDebug?: boolean;
  breakpointsEnabled?: boolean;
  consoleEnabled?: boolean;
  autoShowConsoleOnError?: boolean;
  showPerformanceMetrics?: boolean;
  logFilters?: ILogFilterOptions;
  storageProvider?: ILogStorageProvider;
}

/**
 * 开发者控制台UI配置
 */
export interface IDevConsoleConfig {
  theme?: 'light' | 'dark' | 'auto';
  position?: 'bottom' | 'right' | 'left' | 'top';
  width?: string;
  height?: string;
  zIndex?: number;
  showToolbar?: boolean;
  defaultTab?: 'logs' | 'errors' | 'network' | 'performance' | 'config';
  collapsible?: boolean;
  transparent?: boolean;
  shortcutKey?: string;
} 