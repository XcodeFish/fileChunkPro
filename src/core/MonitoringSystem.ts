/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MonitoringSystem - 监控系统核心
 *
 * 功能：
 * 1. 指标收集架构
 * 2. 数据聚合机制
 * 3. 可视化接口
 * 4. 报警系统
 */

import {
  PerformanceCollector,
  PerformanceMetric,
  PerformanceMetricType,
} from '../utils/PerformanceCollector';
import {
  MonitoringMetricType,
  MonitoringMetric,
  AggregationType,
  AggregationOptions,
  AggregationResult,
  VisualizationSeries,
  VisualizationChartConfig,
  AlertRule,
  AlertEvent,
  AlertStatus,
  NotificationChannelConfig,
  NotificationContent,
  MonitoringSystemOptions,
  MetricMappingConfig,
  AlertCondition,
  AlertSeverity,
  AlertConditionOperator,
} from '../types/monitoring';
import { generateUUID } from '../utils/common';

// 定义事件回调类型，避免使用泛型Function
type MetricCollectedCallback = (metric: MonitoringMetric) => void;
type AggregationCompletedCallback = (results: AggregationResult[]) => void;
type AlertTriggeredCallback = (alert: AlertEvent) => void;
type EventCallback =
  | MetricCollectedCallback
  | AggregationCompletedCallback
  | AlertTriggeredCallback;

/**
 * 监控系统默认配置
 */
const DEFAULT_OPTIONS: Required<MonitoringSystemOptions> = {
  enabled: true,
  metricsBufferSize: 10000,
  collectInterval: 5000,
  aggregationInterval: 15000,
  autoAggregations: [
    {
      type: AggregationType.AVG,
      timeWindow: 60000, // 1分钟
    },
    {
      type: AggregationType.MAX,
      timeWindow: 60000, // 1分钟
    },
  ],
  alertRules: [],
  notificationChannels: [],
  persistence: {
    enabled: false,
    type: 'memory',
    retentionTime: 86400000, // 24小时
    maxSize: 50000, // 最多存储50000条指标
  },
  visualization: {
    enabled: true,
    defaultCharts: [],
  },
};

/**
 * 默认性能指标到监控指标的映射
 */
const DEFAULT_METRIC_MAPPINGS: MetricMappingConfig[] = [
  {
    performanceMetricType: PerformanceMetricType.UPLOAD_START,
    monitoringMetricType: MonitoringMetricType.BUSINESS_TOTAL_UPLOADS,
    valueExtractor: () => 1,
    tagsExtractor: metric => ({
      fileId: metric.fileId || '',
      fileSize: metric.value?.toString() || '0',
    }),
  },
  {
    performanceMetricType: PerformanceMetricType.UPLOAD_END,
    monitoringMetricType: MonitoringMetricType.UPLOAD_SUCCESS_RATE,
    valueExtractor: () => 100, // 上传成功率100%
    tagsExtractor: metric => ({
      fileId: metric.fileId || '',
    }),
  },
  {
    performanceMetricType: PerformanceMetricType.CHUNK_END,
    monitoringMetricType: MonitoringMetricType.CHUNK_SPEED,
    valueExtractor: metric => {
      if (metric.value && metric.metadata?.chunkSize) {
        return (metric.metadata.chunkSize / metric.value) * 1000; // 字节/秒
      }
      return 0;
    },
    tagsExtractor: metric => ({
      fileId: metric.fileId || '',
      chunkIndex: metric.chunkIndex?.toString() || '',
    }),
  },
  {
    performanceMetricType: PerformanceMetricType.ERROR_OCCUR,
    monitoringMetricType: MonitoringMetricType.UPLOAD_ERROR_RATE,
    valueExtractor: () => 1,
    tagsExtractor: metric => ({
      errorCode: metric.metadata?.errorCode || '',
    }),
  },
  {
    performanceMetricType: PerformanceMetricType.MEMORY_PRESSURE,
    monitoringMetricType: MonitoringMetricType.SYSTEM_MEMORY_USAGE,
    valueExtractor: metric => metric.value || 0,
  },
  {
    performanceMetricType: PerformanceMetricType.NETWORK_CHANGE,
    monitoringMetricType: MonitoringMetricType.SYSTEM_NETWORK_LATENCY,
    valueExtractor: metric => metric.value || 0,
  },
  {
    performanceMetricType: PerformanceMetricType.NETWORK_CHANGE,
    monitoringMetricType: MonitoringMetricType.SYSTEM_NETWORK_BANDWIDTH,
    valueExtractor: metric => metric.metadata?.bandwidth || 0,
  },
];

/**
 * 监控系统
 * 实现指标收集、数据聚合、可视化接口和报警系统
 */
export class MonitoringSystem {
  private static instance: MonitoringSystem;
  private options: Required<MonitoringSystemOptions>;
  private metrics: MonitoringMetric[] = [];
  private aggregationResults: AggregationResult[] = [];
  private alertEvents: AlertEvent[] = [];
  private metricCollectTimer: NodeJS.Timeout | null = null;
  private aggregationTimer: NodeJS.Timeout | null = null;
  private alertCheckTimer: NodeJS.Timeout | null = null;
  private performanceCollector: PerformanceCollector;
  private metricMappings: MetricMappingConfig[];
  private nextAlertId = 1;
  private activeAlerts: Map<string, AlertEvent> = new Map();
  private eventListeners: Map<string, EventCallback[]> = new Map();

  /**
   * 获取MonitoringSystem单例
   */
  public static getInstance(
    options?: MonitoringSystemOptions
  ): MonitoringSystem {
    if (!MonitoringSystem.instance) {
      MonitoringSystem.instance = new MonitoringSystem(options);
    } else if (options) {
      MonitoringSystem.instance.updateOptions(options);
    }
    return MonitoringSystem.instance;
  }

  /**
   * 构造函数
   */
  private constructor(options?: MonitoringSystemOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.metricMappings = [...DEFAULT_METRIC_MAPPINGS];
    this.performanceCollector = PerformanceCollector.getInstance();

    // 初始化监控系统
    if (this.options.enabled) {
      this.init();
    }
  }

  /**
   * 初始化监控系统
   */
  private init(): void {
    // 订阅性能指标收集器的事件
    this.setupPerformanceCollectorListener();

    // 启动定时收集和聚合
    this.startTimers();
  }

  /**
   * 更新配置选项
   */
  public updateOptions(options: Partial<MonitoringSystemOptions>): void {
    const wasEnabled = this.options.enabled;
    this.options = { ...this.options, ...options };

    // 如果启用状态变化，需要重新初始化或停止
    if (!wasEnabled && this.options.enabled) {
      this.init();
    } else if (wasEnabled && !this.options.enabled) {
      this.stop();
    } else if (this.options.enabled) {
      // 重新启动定时器，应用新设置
      this.stopTimers();
      this.startTimers();
    }
  }

  /**
   * 设置性能指标收集器的监听
   */
  private setupPerformanceCollectorListener(): void {
    // 监听性能收集器的报告事件
    this.performanceCollector.updateOptions({
      onReport: (metrics: PerformanceMetric[]) => {
        this.processPerformanceMetrics(metrics);
      },
      reportInterval: this.options.collectInterval,
    });
  }

  /**
   * 处理性能指标转换为监控指标
   */
  private processPerformanceMetrics(metrics: PerformanceMetric[]): void {
    for (const metric of metrics) {
      // 应用映射规则，转换为监控指标
      const mappings = this.metricMappings.filter(
        m => m.performanceMetricType === metric.type
      );

      for (const mapping of mappings) {
        const value = mapping.valueExtractor
          ? mapping.valueExtractor(metric)
          : metric.value || 0;

        const tags = mapping.tagsExtractor ? mapping.tagsExtractor(metric) : {};

        // 创建监控指标
        this.collect({
          type: mapping.monitoringMetricType,
          value,
          timestamp: metric.timestamp,
          tags,
          metadata: metric.metadata,
        });
      }
    }
  }

  /**
   * 启动所有定时器
   */
  private startTimers(): void {
    // 启动指标收集定时器
    if (this.options.collectInterval > 0) {
      this.metricCollectTimer = setInterval(() => {
        this.collectSystemMetrics();
      }, this.options.collectInterval);
    }

    // 启动数据聚合定时器
    if (this.options.aggregationInterval > 0) {
      this.aggregationTimer = setInterval(() => {
        this.performAggregations();
      }, this.options.aggregationInterval);
    }

    // 启动报警检查定时器
    this.alertCheckTimer = setInterval(() => {
      this.checkAlertRules();
    }, 10000); // 每10秒检查一次报警规则
  }

  /**
   * 停止所有定时器
   */
  private stopTimers(): void {
    if (this.metricCollectTimer) {
      clearInterval(this.metricCollectTimer);
      this.metricCollectTimer = null;
    }

    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }

    if (this.alertCheckTimer) {
      clearInterval(this.alertCheckTimer);
      this.alertCheckTimer = null;
    }
  }

  /**
   * 收集系统指标
   */
  private collectSystemMetrics(): void {
    // 这里可以收集一些系统级别的指标
    // 例如当前内存使用、CPU使用等

    // 内存使用
    if (typeof window !== 'undefined' && (window.performance as any).memory) {
      const memory = (window.performance as any).memory;
      this.collect({
        type: MonitoringMetricType.SYSTEM_MEMORY_USAGE,
        value: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
        timestamp: Date.now(),
        tags: {
          unit: 'ratio',
        },
      });
    }

    // TODO: 添加更多系统指标收集
  }

  /**
   * 收集监控指标
   */
  public collect(metric: MonitoringMetric): void {
    if (!this.options.enabled) return;

    // 添加到指标列表
    this.metrics.push(metric);

    // 超出缓冲区大小时移除最旧的指标
    if (this.metrics.length > this.options.metricsBufferSize) {
      this.metrics.shift();
    }

    // 触发指标收集事件
    this.emit('metric_collected', metric);
  }

  /**
   * 执行数据聚合
   * 根据配置的聚合选项，对收集的指标进行聚合计算
   */
  private performAggregations(): void {
    if (!this.options.enabled || this.metrics.length === 0) return;

    const now = Date.now();
    const newResults: AggregationResult[] = [];

    // 执行自动聚合
    for (const aggOptions of this.options.autoAggregations) {
      const timeWindow = aggOptions.timeWindow;
      const startTime = now - timeWindow;

      // 按指标类型分组
      const metricsByType = new Map<MonitoringMetricType, MonitoringMetric[]>();

      // 筛选时间窗口内的指标并按类型分组
      for (const metric of this.metrics) {
        if (metric.timestamp >= startTime) {
          if (!metricsByType.has(metric.type)) {
            metricsByType.set(metric.type, []);
          }
          metricsByType.get(metric.type)?.push(metric);
        }
      }

      // 对每种指标类型执行聚合
      for (const [metricType, typeMetrics] of metricsByType.entries()) {
        // 如果有维度，需要按维度再次分组
        if (aggOptions.dimensions && aggOptions.dimensions.length > 0) {
          const metricsByDimension = this.groupByDimensions(
            typeMetrics,
            aggOptions.dimensions
          );

          for (const [
            dimensionKey,
            dimensionMetrics,
          ] of metricsByDimension.entries()) {
            const dimensionValues = this.parseDimensionKey(dimensionKey);
            const result = this.calculateAggregation(
              dimensionMetrics,
              aggOptions.type,
              metricType,
              startTime,
              now,
              dimensionValues
            );
            newResults.push(result);
          }
        } else {
          // 无维度聚合
          const result = this.calculateAggregation(
            typeMetrics,
            aggOptions.type,
            metricType,
            startTime,
            now
          );
          newResults.push(result);
        }
      }
    }

    // 更新聚合结果
    this.aggregationResults = [...this.aggregationResults, ...newResults];

    // 触发聚合完成事件
    this.emit('aggregation_completed', newResults);
  }

  /**
   * 按维度分组指标
   */
  private groupByDimensions(
    metrics: MonitoringMetric[],
    dimensions: string[]
  ): Map<string, MonitoringMetric[]> {
    const result = new Map<string, MonitoringMetric[]>();

    for (const metric of metrics) {
      const dimensionKey = this.getDimensionKey(metric, dimensions);
      if (!result.has(dimensionKey)) {
        result.set(dimensionKey, []);
      }
      result.get(dimensionKey)?.push(metric);
    }

    return result;
  }

  /**
   * 获取维度键
   */
  private getDimensionKey(
    metric: MonitoringMetric,
    dimensions: string[]
  ): string {
    const parts: string[] = [];
    for (const dim of dimensions) {
      const value = metric.tags?.[dim] || '';
      parts.push(`${dim}:${value}`);
    }
    return parts.join('|');
  }

  /**
   * 解析维度键为维度值对象
   */
  private parseDimensionKey(dimensionKey: string): Record<string, string> {
    const result: Record<string, string> = {};
    const parts = dimensionKey.split('|');

    for (const part of parts) {
      const [key, value] = part.split(':');
      if (key) {
        result[key] = value || '';
      }
    }

    return result;
  }

  /**
   * 计算聚合结果
   */
  private calculateAggregation(
    metrics: MonitoringMetric[],
    aggregationType: AggregationType,
    metricType: MonitoringMetricType,
    startTime: number,
    endTime: number,
    dimensions?: Record<string, string>
  ): AggregationResult {
    let value = 0;

    switch (aggregationType) {
      case AggregationType.SUM:
        value = metrics.reduce((sum, m) => sum + m.value, 0);
        break;

      case AggregationType.AVG:
        value =
          metrics.length > 0
            ? metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length
            : 0;
        break;

      case AggregationType.MIN:
        value = metrics.length > 0 ? Math.min(...metrics.map(m => m.value)) : 0;
        break;

      case AggregationType.MAX:
        value = metrics.length > 0 ? Math.max(...metrics.map(m => m.value)) : 0;
        break;

      case AggregationType.COUNT:
        value = metrics.length;
        break;

      case AggregationType.PERCENTILE_95: {
        // 计算95百分位数
        if (metrics.length === 0) {
          value = 0;
        } else {
          const sortedValues = metrics.map(m => m.value).sort((a, b) => a - b);
          const idx = Math.floor(sortedValues.length * 0.95);
          value = sortedValues[idx];
        }
        break;
      }

      case AggregationType.PERCENTILE_99: {
        // 计算99百分位数
        if (metrics.length === 0) {
          value = 0;
        } else {
          const sortedValues = metrics.map(m => m.value).sort((a, b) => a - b);
          const idx = Math.floor(sortedValues.length * 0.99);
          value = sortedValues[idx];
        }
        break;
      }
    }

    return {
      metricType,
      aggregationType,
      value,
      dimensions,
      startTime,
      endTime,
    };
  }

  /**
   * 检查报警规则
   */
  private checkAlertRules(): void {
    if (!this.options.enabled || this.options.alertRules.length === 0) return;

    const now = Date.now();

    for (const rule of this.options.alertRules) {
      if (!rule.enabled) continue;

      const alertKey = rule.id;
      const existingAlert = this.activeAlerts.get(alertKey);

      // 如果已有活动报警且在冷却期内，跳过
      if (
        existingAlert &&
        existingAlert.status === AlertStatus.ACTIVE &&
        now - existingAlert.timestamp < rule.cooldown
      ) {
        continue;
      }

      // 检查报警条件
      const isTriggered = this.checkAlertCondition(rule.condition);

      if (isTriggered) {
        // 创建或更新报警
        if (!existingAlert || existingAlert.status !== AlertStatus.ACTIVE) {
          // 新建报警
          const alertEvent: AlertEvent = {
            id: `alert-${this.nextAlertId++}`,
            ruleId: rule.id,
            ruleName: rule.name,
            status: AlertStatus.ACTIVE,
            severity: rule.severity,
            condition: rule.condition,
            value: this.getConditionValue(rule.condition),
            timestamp: now,
            message: this.generateAlertMessage(
              rule,
              this.getConditionValue(rule.condition)
            ),
          };

          this.activeAlerts.set(alertKey, alertEvent);
          this.alertEvents.push(alertEvent);

          // 触发报警事件
          this.emit('alert_triggered', alertEvent);

          // 发送通知
          this.sendAlertNotifications(alertEvent, rule.notificationChannels);
        }
      } else if (existingAlert && existingAlert.status === AlertStatus.ACTIVE) {
        // 解除报警
        const resolvedAlert: AlertEvent = {
          ...existingAlert,
          status: AlertStatus.RESOLVED,
          timestamp: now,
          message: `已解除: ${existingAlert.message}`,
        };

        this.activeAlerts.set(alertKey, resolvedAlert);
        this.alertEvents.push(resolvedAlert);

        // 触发报警解除事件
        this.emit('alert_resolved', resolvedAlert);
      }
    }
  }

  /**
   * 检查报警条件是否触发
   */
  private checkAlertCondition(condition: AlertCondition): boolean {
    const currentValue = this.getConditionValue(condition);

    switch (condition.operator) {
      case AlertConditionOperator.GT:
        return currentValue > condition.threshold;
      case AlertConditionOperator.GTE:
        return currentValue >= condition.threshold;
      case AlertConditionOperator.LT:
        return currentValue < condition.threshold;
      case AlertConditionOperator.LTE:
        return currentValue <= condition.threshold;
      case AlertConditionOperator.EQ:
        return currentValue === condition.threshold;
      case AlertConditionOperator.NEQ:
        return currentValue !== condition.threshold;
      default:
        return false;
    }
  }

  /**
   * 获取条件对应的当前值
   */
  private getConditionValue(condition: AlertCondition): number {
    // 从最新的聚合结果中查找匹配的结果
    const matchingResults = this.aggregationResults.filter(result => {
      // 检查指标类型和聚合类型是否匹配
      const typeMatch = result.metricType === condition.metricType;
      const aggMatch = result.aggregationType === condition.aggregation;

      // 检查维度是否匹配
      let dimensionsMatch = true;
      if (condition.dimensions && result.dimensions) {
        for (const [key, value] of Object.entries(condition.dimensions)) {
          if (result.dimensions[key] !== value) {
            dimensionsMatch = false;
            break;
          }
        }
      } else if (condition.dimensions) {
        dimensionsMatch = false;
      }

      return typeMatch && aggMatch && dimensionsMatch;
    });

    // 找到最新的匹配结果
    if (matchingResults.length > 0) {
      const latestResult = matchingResults.reduce((latest, current) => {
        return current.endTime > latest.endTime ? current : latest;
      }, matchingResults[0]);

      return latestResult.value;
    }

    // 如果没有找到匹配的聚合结果，执行即时聚合
    const now = Date.now();
    const timeWindow = condition.timeWindow;
    const startTime = now - timeWindow;

    // 筛选时间窗口内的匹配指标
    const matchingMetrics = this.metrics.filter(metric => {
      const typeMatch = metric.type === condition.metricType;
      const timeMatch = metric.timestamp >= startTime;

      // 检查维度是否匹配
      let dimensionsMatch = true;
      if (condition.dimensions && metric.tags) {
        for (const [key, value] of Object.entries(condition.dimensions)) {
          if (metric.tags[key] !== value) {
            dimensionsMatch = false;
            break;
          }
        }
      } else if (condition.dimensions) {
        dimensionsMatch = false;
      }

      return typeMatch && timeMatch && dimensionsMatch;
    });

    // 执行即时聚合计算
    if (matchingMetrics.length > 0) {
      const result = this.calculateAggregation(
        matchingMetrics,
        condition.aggregation,
        condition.metricType,
        startTime,
        now,
        condition.dimensions
      );

      return result.value;
    }

    return 0; // 默认值
  }

  /**
   * 生成报警消息
   */
  private generateAlertMessage(rule: AlertRule, value: number): string {
    const conditionText = this.formatCondition(rule.condition);
    return `${rule.name}: ${conditionText} (当前值: ${value.toFixed(2)})`;
  }

  /**
   * 格式化报警条件为可读文本
   */
  private formatCondition(condition: AlertCondition): string {
    const metricName = condition.metricType;
    const operator = condition.operator;
    const threshold = condition.threshold;
    const aggType = condition.aggregation;

    let dimensionText = '';
    if (condition.dimensions) {
      const parts = Object.entries(condition.dimensions)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      dimensionText = parts ? ` [${parts}]` : '';
    }

    return `${metricName}${dimensionText} ${aggType} ${operator} ${threshold}`;
  }

  /**
   * 发送报警通知
   */
  private sendAlertNotifications(
    alertEvent: AlertEvent,
    channelIds: string[]
  ): void {
    // 查找通知渠道
    const channels = this.options.notificationChannels.filter(
      ch => channelIds.includes(ch.id) && ch.enabled
    );

    // 准备通知内容
    const content: NotificationContent = {
      title: `[${alertEvent.severity.toUpperCase()}] ${alertEvent.ruleName}`,
      message: alertEvent.message,
      alertEvent,
      timestamp: alertEvent.timestamp,
    };

    // 发送到各个渠道
    for (const channel of channels) {
      try {
        // 这里实际应用中会集成不同的通知方式
        // 如邮件、短信、Webhook等
        console.log(`发送通知到 ${channel.name} (${channel.type}):`, content);

        // 触发通知事件
        this.emit('notification_sent', { channel, content });
      } catch (error) {
        console.error(`发送通知到 ${channel.name} 失败:`, error);
      }
    }
  }

  /**
   * 停止监控系统
   */
  public stop(): void {
    this.stopTimers();
    this.options.enabled = false;
  }

  /**
   * 启动监控系统
   */
  public start(): void {
    if (this.options.enabled) return;

    this.options.enabled = true;
    this.init();
  }

  /**
   * 清空所有指标数据
   */
  public clearMetrics(): void {
    this.metrics = [];
    this.aggregationResults = [];
  }

  /**
   * 获取原始指标数据
   */
  public getMetrics(): MonitoringMetric[] {
    return [...this.metrics];
  }

  /**
   * 获取聚合结果
   */
  public getAggregationResults(): AggregationResult[] {
    return [...this.aggregationResults];
  }

  /**
   * 获取报警事件
   */
  public getAlertEvents(): AlertEvent[] {
    return [...this.alertEvents];
  }

  /**
   * 添加事件监听器
   */
  public on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  /**
   * 移除事件监听器
   */
  public off(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) return;

    const listeners = this.eventListeners.get(event) || [];
    this.eventListeners.set(
      event,
      listeners.filter(cb => cb !== callback)
    );
  }

  /**
   * 触发事件
   */
  private emit(event: string, ...args: any[]): void {
    if (!this.eventListeners.has(event)) return;

    const listeners = this.eventListeners.get(event) || [];
    for (const callback of listeners) {
      try {
        callback(...(args as [any]));
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    }
  }

  /**
   * 注册自定义指标映射
   */
  public registerMetricMapping(mapping: MetricMappingConfig): void {
    this.metricMappings.push(mapping);
  }

  /**
   * 添加报警规则
   */
  public addAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const id = `rule-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newRule: AlertRule = {
      ...rule,
      id,
    };

    this.options.alertRules.push(newRule);
    return id;
  }

  /**
   * 移除报警规则
   */
  public removeAlertRule(ruleId: string): boolean {
    const initialLength = this.options.alertRules.length;
    this.options.alertRules = this.options.alertRules.filter(
      rule => rule.id !== ruleId
    );

    // 清理相关活动报警
    if (this.activeAlerts.has(ruleId)) {
      this.activeAlerts.delete(ruleId);
    }

    return initialLength !== this.options.alertRules.length;
  }

  /**
   * 执行即时聚合
   */
  public aggregateNow(
    options: AggregationOptions,
    metricType: MonitoringMetricType
  ): AggregationResult | null {
    if (!this.options.enabled || this.metrics.length === 0) return null;

    const now = Date.now();
    const timeWindow = options.timeWindow;
    const startTime = now - timeWindow;

    // 筛选时间窗口内的匹配指标
    const matchingMetrics = this.metrics.filter(metric => {
      return metric.type === metricType && metric.timestamp >= startTime;
    });

    if (matchingMetrics.length === 0) return null;

    // 执行聚合
    return this.calculateAggregation(
      matchingMetrics,
      options.type,
      metricType,
      startTime,
      now,
      undefined
    );
  }
}
