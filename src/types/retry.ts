/**
 * 智能重试系统类型定义
 */
import { UploadErrorType, ErrorGroup, ErrorRecoveryStrategy } from './index';

/**
 * 错误分析结果
 */
export interface ErrorAnalysisResult {
  /**
   * 错误类型
   */
  errorType: UploadErrorType;
  
  /**
   * 错误分组
   */
  errorGroup: ErrorGroup;
  
  /**
   * 建议的恢复策略
   */
  suggestedStrategy: ErrorRecoveryStrategy;
  
  /**
   * 是否可恢复
   */
  isRecoverable: boolean;
  
  /**
   * 建议的最大重试次数
   */
  suggestedMaxRetries: number;
  
  /**
   * 错误上下文数据
   */
  context?: Record<string, any>;
  
  /**
   * 重试优先级 (0-10，越高越优先)
   */
  retryPriority: number;
}

/**
 * 重试策略类型
 */
export enum RetryStrategyType {
  /**
   * 固定间隔策略
   */
  FIXED_INTERVAL = 'fixed_interval',
  
  /**
   * 指数退避策略
   */
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  
  /**
   * 随机指数退避策略
   */
  JITTERED_BACKOFF = 'jittered_backoff',
  
  /**
   * 线性退避策略
   */
  LINEAR_BACKOFF = 'linear_backoff',
  
  /**
   * 网络质量自适应策略
   */
  NETWORK_ADAPTIVE = 'network_adaptive',
  
  /**
   * 错误类型自适应策略
   */
  ERROR_ADAPTIVE = 'error_adaptive',
  
  /**
   * 阶梯间隔策略
   */
  STEPPED_INTERVAL = 'stepped_interval',
  
  /**
   * 自定义策略
   */
  CUSTOM = 'custom'
}

/**
 * 重试策略选择器配置
 */
export interface RetryStrategySelectorConfig {
  /**
   * 默认策略类型
   */
  defaultStrategyType: RetryStrategyType;
  
  /**
   * 错误类型策略映射
   */
  errorTypeStrategies?: Record<UploadErrorType, RetryStrategyType>;
  
  /**
   * 错误组策略映射
   */
  errorGroupStrategies?: Record<ErrorGroup, RetryStrategyType>;
  
  /**
   * 是否启用自适应策略选择
   */
  enableAdaptiveSelection: boolean;
  
  /**
   * 是否使用历史数据优化策略选择
   */
  useHistoricalData: boolean;
  
  /**
   * 自定义选择函数
   */
  customSelector?: (error: Error, context?: any) => RetryStrategyType;
}

/**
 * 基础退避配置
 */
export interface BackoffConfig {
  /**
   * 初始延迟（毫秒）
   */
  initialDelay: number;
  
  /**
   * 最大延迟（毫秒）
   */
  maxDelay: number;
}

/**
 * 指数退避配置
 */
export interface ExponentialBackoffConfig extends BackoffConfig {
  /**
   * 指数因子
   */
  factor: number;
  
  /**
   * 抖动因子 (0-1)
   */
  jitter?: number;
}

/**
 * 线性退避配置
 */
export interface LinearBackoffConfig extends BackoffConfig {
  /**
   * 增量（每次重试增加的延迟，毫秒）
   */
  increment: number;
}

/**
 * 阶梯间隔配置
 */
export interface SteppedIntervalConfig {
  /**
   * 阶梯延迟时间（毫秒）
   */
  intervals: number[];
}

/**
 * 网络自适应配置
 */
export interface NetworkAdaptiveConfig extends BackoffConfig {
  /**
   * 网络质量因子映射
   */
  qualityFactors: Record<string, number>;
  
  /**
   * 基础因子
   */
  baseFactor: number;
}

/**
 * 智能重试插件配置
 */
export interface SmartRetryPluginOptions {
  /**
   * 是否启用
   */
  enabled?: boolean;
  
  /**
   * 默认最大重试次数
   */
  maxRetries?: number;
  
  /**
   * 策略选择器配置
   */
  strategySelectorConfig?: Partial<RetryStrategySelectorConfig>;
  
  /**
   * 指数退避配置
   */
  exponentialBackoffConfig?: Partial<ExponentialBackoffConfig>;
  
  /**
   * 线性退避配置
   */
  linearBackoffConfig?: Partial<LinearBackoffConfig>;
  
  /**
   * 阶梯间隔配置
   */
  steppedIntervalConfig?: Partial<SteppedIntervalConfig>;
  
  /**
   * 网络自适应配置
   */
  networkAdaptiveConfig?: Partial<NetworkAdaptiveConfig>;
  
  /**
   * 错误类型特定最大重试次数
   */
  errorTypeMaxRetries?: Record<UploadErrorType, number>;
  
  /**
   * 错误组特定最大重试次数
   */
  errorGroupMaxRetries?: Record<ErrorGroup, number>;
  
  /**
   * 是否在调试模式下
   */
  debug?: boolean;
  
  /**
   * 是否启用历史错误分析
   */
  enableHistoricalAnalysis?: boolean;
  
  /**
   * 历史数据保留时长（毫秒）
   */
  historicalDataRetention?: number;
  
  /**
   * 根据错误类型是否应该重试的映射
   */
  shouldRetryMap?: Record<UploadErrorType, boolean>;
  
  /**
   * 自定义是否应该重试的判断函数
   */
  shouldRetryFn?: (error: Error, context?: any) => boolean;
}

/**
 * 重试历史记录
 */
export interface RetryHistoryEntry {
  /**
   * 文件ID
   */
  fileId: string;
  
  /**
   * 块索引
   */
  chunkIndex: number;
  
  /**
   * 重试尝试次数
   */
  attempt: number;
  
  /**
   * 错误类型
   */
  errorType: UploadErrorType;
  
  /**
   * 应用的策略类型
   */
  strategyType: RetryStrategyType;
  
  /**
   * 延迟时间（毫秒）
   */
  delay: number;
  
  /**
   * 重试时间戳
   */
  timestamp: number;
  
  /**
   * 是否成功
   */
  success?: boolean;
  
  /**
   * 网络质量
   */
  networkQuality?: string;
}

/**
 * 重试统计
 */
export interface RetryStats {
  /**
   * 总重试次数
   */
  totalRetries: number;
  
  /**
   * 成功重试次数
   */
  successfulRetries: number;
  
  /**
   * 失败重试次数
   */
  failedRetries: number;
  
  /**
   * 按错误类型统计的重试次数
   */
  retriesByErrorType: Record<UploadErrorType, number>;
  
  /**
   * 按策略类型统计的重试次数
   */
  retriesByStrategyType: Record<RetryStrategyType, number>;
  
  /**
   * 平均重试延迟（毫秒）
   */
  avgRetryDelay: number;
  
  /**
   * 平均重试成功率
   */
  avgRetrySuccessRate: number;
} 