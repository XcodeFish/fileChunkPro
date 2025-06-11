/**
 * 性能日志关联类型定义文件
 * 提供日志与性能数据关联所需的接口定义
 */

import { ILogEntry, LogLevel } from './debug';
import { PerformanceMetric } from '../utils/PerformanceCollector';

/**
 * 性能日志关联数据结构
 * 用于关联日志条目与性能监控点
 */
export interface IPerformanceLogAssociation {
  // 日志条目ID
  logId: string;
  
  // 性能指标ID
  performanceMetricId: string;
  
  // 关联类型
  associationType: PerformanceLogAssociationType;
  
  // 关联时间戳
  timestamp: number;
  
  // 关联权重 (0-1)，表示关联强度
  weight: number;
  
  // 关联描述
  description?: string;
}

/**
 * 性能日志关联类型
 */
export enum PerformanceLogAssociationType {
  // 直接关联（日志与性能点直接相关）
  DIRECT = 'direct',
  
  // 时间关联（基于时间窗口的关联）
  TEMPORAL = 'temporal',
  
  // 因果关联（一个事件导致另一个事件）
  CAUSAL = 'causal',
  
  // 上下文关联（共享上下文信息）
  CONTEXTUAL = 'contextual'
}

/**
 * 增强型日志条目接口
 * 添加了性能关联数据
 */
export interface IEnhancedLogEntry extends ILogEntry {
  // 相关联的性能指标IDs
  relatedPerformanceMetrics?: string[];
  
  // 关联类型映射
  associationTypes?: Record<string, PerformanceLogAssociationType>;
  
  // 关联强度映射
  associationWeights?: Record<string, number>;
}

/**
 * 增强型性能指标接口
 * 添加了日志关联数据
 */
export interface IEnhancedPerformanceMetric extends PerformanceMetric {
  // 相关联的日志条目IDs
  relatedLogEntries?: string[];
  
  // 关联类型映射
  associationTypes?: Record<string, PerformanceLogAssociationType>;
  
  // 关联强度映射
  associationWeights?: Record<string, number>;
}

/**
 * 性能日志查询选项
 */
export interface IPerformanceLogQuery {
  // 日志级别过滤
  logLevel?: LogLevel;
  
  // 模块名过滤
  module?: string | RegExp;
  
  // 性能指标类型过滤
  metricTypes?: string[];
  
  // 时间范围过滤
  timeRange?: {
    start?: number;
    end?: number;
  };
  
  // 关键词搜索
  search?: string | RegExp;
  
  // 关联类型过滤
  associationTypes?: PerformanceLogAssociationType[];
  
  // 最小关联强度
  minAssociationWeight?: number;
  
  // 排序方式
  sort?: 'timestamp' | 'level' | 'module' | 'associationWeight';
  
  // 排序顺序
  order?: 'asc' | 'desc';
  
  // 分页选项
  pagination?: {
    offset: number;
    limit: number;
  };
}

/**
 * 性能日志关联结果
 */
export interface IPerformanceLogResult {
  // 符合条件的日志条目
  logs: IEnhancedLogEntry[];
  
  // 相关的性能指标
  metrics: IEnhancedPerformanceMetric[];
  
  // 关联关系
  associations: IPerformanceLogAssociation[];
  
  // 分析结果摘要
  summary?: {
    totalLogs: number;
    totalMetrics: number;
    totalAssociations: number;
    averageAssociationWeight: number;
    topModules: string[];
    topMetricTypes: string[];
    timeRange: {
      start: number;
      end: number;
    };
  };
}

/**
 * 性能日志关联器接口
 * 用于处理日志与性能数据的关联
 */
export interface IPerformanceLogAssociator {
  /**
   * 关联日志和性能数据
   * @param log 日志条目
   * @param metric 性能指标
   * @param type 关联类型
   * @param weight 关联权重
   * @param description 关联描述
   */
  associate(
    log: ILogEntry,
    metric: PerformanceMetric,
    type: PerformanceLogAssociationType,
    weight: number,
    description?: string
  ): IPerformanceLogAssociation;
  
  /**
   * 查找指定日志相关的性能指标
   * @param logId 日志ID
   * @returns 关联的性能指标
   */
  getMetricsByLogId(logId: string): Promise<IEnhancedPerformanceMetric[]>;
  
  /**
   * 查找指定性能指标相关的日志
   * @param metricId 性能指标ID
   * @returns 关联的日志条目
   */
  getLogsByMetricId(metricId: string): Promise<IEnhancedLogEntry[]>;
  
  /**
   * 高级查询性能日志关联
   * @param query 查询选项
   * @returns 查询结果
   */
  query(query: IPerformanceLogQuery): Promise<IPerformanceLogResult>;
}

export default IPerformanceLogAssociator; 