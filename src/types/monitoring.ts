/**
 * 监控系统类型定义
 */

import { PerformanceMetric } from '../utils/PerformanceCollector';

/**
 * 监控指标类型
 */
export enum MonitoringMetricType {
  // 系统指标
  SYSTEM_CPU_USAGE = 'system.cpu.usage',
  SYSTEM_MEMORY_USAGE = 'system.memory.usage',
  SYSTEM_NETWORK_LATENCY = 'system.network.latency',
  SYSTEM_NETWORK_BANDWIDTH = 'system.network.bandwidth',
  
  // 上传指标
  UPLOAD_SPEED = 'upload.speed',
  UPLOAD_SUCCESS_RATE = 'upload.success_rate',
  UPLOAD_RETRY_RATE = 'upload.retry_rate',
  UPLOAD_ERROR_RATE = 'upload.error_rate',
  UPLOAD_THROUGHPUT = 'upload.throughput',
  
  // 分片指标
  CHUNK_SPEED = 'chunk.speed',
  CHUNK_SUCCESS_RATE = 'chunk.success_rate',
  CHUNK_RETRY_RATE = 'chunk.retry_rate',
  
  // 业务指标
  BUSINESS_TOTAL_UPLOADS = 'business.total_uploads',
  BUSINESS_CONCURRENT_UPLOADS = 'business.concurrent_uploads',
  BUSINESS_AVERAGE_FILE_SIZE = 'business.average_file_size',
  
  // 自定义指标
  CUSTOM = 'custom'
}

/**
 * 监控指标数据结构
 */
export interface MonitoringMetric {
  type: MonitoringMetricType;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

/**
 * 监控数据聚合类型
 */
export enum AggregationType {
  SUM = 'sum',
  AVG = 'avg',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
  PERCENTILE_95 = 'p95',
  PERCENTILE_99 = 'p99'
}

/**
 * 聚合选项
 */
export interface AggregationOptions {
  type: AggregationType;
  timeWindow: number; // 时间窗口（毫秒）
  dimensions?: string[]; // 聚合维度（标签键）
}

/**
 * 聚合结果
 */
export interface AggregationResult {
  metricType: MonitoringMetricType;
  aggregationType: AggregationType;
  value: number;
  dimensions?: Record<string, string>;
  startTime: number;
  endTime: number;
}

/**
 * 监控可视化数据点
 */
export interface VisualizationDataPoint {
  timestamp: number;
  value: number;
}

/**
 * 监控可视化数据系列
 */
export interface VisualizationSeries {
  name: string;
  data: VisualizationDataPoint[];
  tags?: Record<string, string>;
  metricType: MonitoringMetricType;
}

/**
 * 监控可视化图表类型
 */
export enum VisualizationChartType {
  LINE = 'line',
  BAR = 'bar',
  GAUGE = 'gauge',
  PIE = 'pie'
}

/**
 * 监控可视化图表配置
 */
export interface VisualizationChartConfig {
  title: string;
  type: VisualizationChartType;
  metrics: MonitoringMetricType[];
  aggregation: AggregationType;
  timeWindow: number;
  refreshInterval?: number;
  dimensions?: string[];
  limit?: number;
}

/**
 * 报警级别
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * 报警状态
 */
export enum AlertStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  ACKNOWLEDGED = 'acknowledged'
}

/**
 * 报警条件操作符
 */
export enum AlertConditionOperator {
  GT = '>',
  GTE = '>=',
  LT = '<',
  LTE = '<=',
  EQ = '=',
  NEQ = '!='
}

/**
 * 报警条件
 */
export interface AlertCondition {
  metricType: MonitoringMetricType;
  operator: AlertConditionOperator;
  threshold: number;
  aggregation: AggregationType;
  timeWindow: number;
  dimensions?: Record<string, string>;
}

/**
 * 报警规则
 */
export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  enabled: boolean;
  notificationChannels: string[];
  cooldown: number; // 冷却期（毫秒）
}

/**
 * 报警事件
 */
export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  status: AlertStatus;
  severity: AlertSeverity;
  condition: AlertCondition;
  value: number;
  timestamp: number;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * 通知渠道类型
 */
export enum NotificationChannelType {
  EMAIL = 'email',
  SMS = 'sms',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  CUSTOM = 'custom'
}

/**
 * 通知渠道配置
 */
export interface NotificationChannelConfig {
  id: string;
  name: string;
  type: NotificationChannelType;
  config: Record<string, any>;
  enabled: boolean;
}

/**
 * 通知内容
 */
export interface NotificationContent {
  title: string;
  message: string;
  alertEvent: AlertEvent;
  timestamp: number;
}

/**
 * 监控系统配置选项
 */
export interface MonitoringSystemOptions {
  enabled?: boolean;
  metricsBufferSize?: number;
  collectInterval?: number;
  aggregationInterval?: number;
  autoAggregations?: AggregationOptions[];
  alertRules?: AlertRule[];
  notificationChannels?: NotificationChannelConfig[];
  // 数据存储选项
  persistence?: {
    enabled: boolean;
    type: 'memory' | 'indexeddb' | 'custom';
    retentionTime?: number; // 数据保留时间（毫秒）
    maxSize?: number; // 最大存储量
    customStore?: any; // 自定义存储实现
  };
  // 可视化选项
  visualization?: {
    enabled: boolean;
    defaultCharts?: VisualizationChartConfig[];
  };
}

/**
 * 性能指标到监控指标的映射
 */
export interface MetricMappingConfig {
  performanceMetricType: string;
  monitoringMetricType: MonitoringMetricType;
  valueExtractor?: (metric: PerformanceMetric) => number;
  tagsExtractor?: (metric: PerformanceMetric) => Record<string, string>;
} 