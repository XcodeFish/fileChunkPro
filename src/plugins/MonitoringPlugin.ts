/**
 * MonitoringPlugin - 监控系统插件
 *
 * 为UploaderCore提供监控系统集成，包括指标收集、数据聚合、可视化和报警功能
 */

import { IPlugin } from './interfaces';
import UploaderCore from '../core/UploaderCore';
import { MonitoringSystem } from '../core/MonitoringSystem';
import {
  MonitoringSystemOptions,
  AlertRule,
  MonitoringMetric,
  AggregationOptions,
  MonitoringMetricType,
  MetricMappingConfig,
  AggregationResult,
} from '../types/monitoring';

/**
 * 监控插件配置选项
 */
export interface MonitoringPluginOptions extends MonitoringSystemOptions {
  /**
   * 是否自动收集上传相关指标
   * @default true
   */
  autoCollectUploadMetrics?: boolean;

  /**
   * 是否自动收集系统性能指标
   * @default true
   */
  autoCollectSystemMetrics?: boolean;

  /**
   * 是否监听错误事件
   * @default true
   */
  listenToErrors?: boolean;

  /**
   * 是否自动对接到UploaderCore事件
   * @default true
   */
  integrateWithCoreEvents?: boolean;

  /**
   * 是否在控制台打印监控日志
   * @default false
   */
  enableConsoleLogging?: boolean;

  /**
   * 是否启用对象池优化
   * @default true
   */
  useObjectPool?: boolean;
}

/**
 * 对象池，用于减少重复创建对象
 */
class MetricObjectPool {
  private static readonly DEFAULT_POOL_SIZE = 100;
  private pool: MonitoringMetric[] = [];
  private size: number;

  constructor(size?: number) {
    this.size = size || MetricObjectPool.DEFAULT_POOL_SIZE;
    this.initPool();
  }

  /**
   * 初始化对象池
   */
  private initPool(): void {
    for (let i = 0; i < this.size; i++) {
      this.pool.push({
        type: MonitoringMetricType.CUSTOM,
        value: 0,
        timestamp: 0,
        tags: {},
      });
    }
  }

  /**
   * 从对象池中获取一个对象
   */
  public acquire(): MonitoringMetric {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    // 池中没有可用对象，创建新对象
    return {
      type: MonitoringMetricType.CUSTOM,
      value: 0,
      timestamp: 0,
      tags: {},
    };
  }

  /**
   * 将对象归还给对象池
   */
  public release(metric: MonitoringMetric): void {
    // 重置对象状态
    metric.value = 0;
    metric.timestamp = 0;

    // 清空tags对象而不是创建新对象
    if (metric.tags) {
      Object.keys(metric.tags).forEach(key => {
        delete metric.tags![key];
      });
    }

    // 如果池没有达到最大容量，则归还
    if (this.pool.length < this.size) {
      this.pool.push(metric);
    }
  }
}

/**
 * 监控系统插件
 * 为UploaderCore提供全面的监控功能
 */
export class MonitoringPlugin implements IPlugin {
  public name = 'MonitoringPlugin';
  private core: UploaderCore | null = null;
  private monitoringSystem: MonitoringSystem;
  private options: Required<MonitoringPluginOptions>;
  private metricPool: MetricObjectPool | null = null;

  /**
   * 创建监控插件实例
   */
  constructor(options?: MonitoringPluginOptions) {
    // 设置默认选项
    this.options = {
      enabled: options?.enabled ?? true,
      metricsBufferSize: options?.metricsBufferSize ?? 10000,
      collectInterval: options?.collectInterval ?? 5000,
      aggregationInterval: options?.aggregationInterval ?? 15000,
      autoAggregations: options?.autoAggregations ?? [],
      alertRules: options?.alertRules ?? [],
      notificationChannels: options?.notificationChannels ?? [],
      persistence: options?.persistence ?? {
        enabled: false,
        type: 'memory',
      },
      visualization: options?.visualization ?? {
        enabled: true,
        defaultCharts: [],
      },
      autoCollectUploadMetrics: options?.autoCollectUploadMetrics ?? true,
      autoCollectSystemMetrics: options?.autoCollectSystemMetrics ?? true,
      listenToErrors: options?.listenToErrors ?? true,
      integrateWithCoreEvents: options?.integrateWithCoreEvents ?? true,
      enableConsoleLogging: options?.enableConsoleLogging ?? false,
      useObjectPool: options?.useObjectPool ?? true,
    };

    // 初始化监控系统
    this.monitoringSystem = MonitoringSystem.getInstance(this.options);

    // 如果启用对象池，初始化对象池
    if (this.options.useObjectPool) {
      this.metricPool = new MetricObjectPool(
        Math.floor(this.options.metricsBufferSize / 4)
      );
    }
  }

  /**
   * 安装插件
   */
  public install(core: UploaderCore): void {
    this.core = core;

    // 在UploaderCore上注册监控系统实例
    core.monitoringSystem = this.monitoringSystem;

    // 启动监控系统
    this.monitoringSystem.start();

    // 集成UploaderCore事件
    if (this.options.integrateWithCoreEvents) {
      this.setupEventIntegration(core);
    }

    // 设置错误监听
    if (this.options.listenToErrors) {
      this.setupErrorListeners(core);
    }

    // 设置控制台日志
    if (this.options.enableConsoleLogging) {
      this.setupConsoleLogging();
    }

    // 向UploaderCore添加监控相关方法
    this.extendUploaderCore(core);
  }

  /**
   * 卸载插件
   */
  public uninstall(): void {
    if (!this.core) return;

    // 移除事件监听
    this.removeEventListeners(this.core);

    // 停止监控系统
    this.monitoringSystem.stop();

    // 移除UploaderCore上的扩展
    this.removeUploaderCoreExtensions(this.core);

    this.core = null;
  }

  /**
   * 设置与UploaderCore的事件集成
   */
  private setupEventIntegration(core: UploaderCore): void {
    // 监听文件上传开始事件
    core.on('upload:start', (file: any) => {
      this.collectMetric(MonitoringMetricType.BUSINESS_TOTAL_UPLOADS, 1, {
        fileId: file.id || '',
        fileName: file.name || '',
        fileSize: file.size?.toString() || '0',
      });
    });

    // 监听文件上传完成事件
    core.on('upload:success', (file: any, _result: any) => {
      this.collectMetric(
        MonitoringMetricType.UPLOAD_SUCCESS_RATE,
        100, // 成功率100%
        {
          fileId: file.id || '',
          fileName: file.name || '',
        }
      );
    });

    // 监听文件上传错误事件
    core.on('upload:error', (file: any, error: any) => {
      this.collectMetric(MonitoringMetricType.UPLOAD_ERROR_RATE, 1, {
        fileId: file.id || '',
        fileName: file.name || '',
        errorCode: error.code || '',
        errorMessage: error.message || '',
      });
    });

    // 监听分片上传速度事件
    core.on('chunk:progress', (chunk: any, progress: any) => {
      if (progress.loaded && progress.total && progress.timeElapsed) {
        const speed = (progress.loaded / progress.timeElapsed) * 1000; // 字节/秒

        this.collectMetric(MonitoringMetricType.CHUNK_SPEED, speed, {
          fileId: chunk.fileId || '',
          chunkIndex: chunk.index?.toString() || '',
        });
      }
    });

    // 监听并发上传数量变化
    core.on('concurrency:change', (data: any) => {
      this.collectMetric(
        MonitoringMetricType.BUSINESS_CONCURRENT_UPLOADS,
        data.current || 0,
        {
          reason: data.reason || '',
        }
      );
    });
  }

  /**
   * 设置错误监听
   */
  private setupErrorListeners(core: UploaderCore): void {
    core.on('error', (error: any) => {
      this.collectMetric(MonitoringMetricType.UPLOAD_ERROR_RATE, 1, {
        errorCode: error.code || '',
        errorType: error.type || '',
        errorMessage: error.message || '',
      });
    });
  }

  /**
   * 收集指标，如果启用了对象池则使用池中对象
   */
  private collectMetric(
    type: MonitoringMetricType,
    value: number,
    tags?: Record<string, string>
  ): void {
    if (this.options.useObjectPool && this.metricPool) {
      // 从对象池获取对象
      const metric = this.metricPool.acquire();

      // 设置指标数据
      metric.type = type;
      metric.value = value;
      metric.timestamp = Date.now();

      // 添加标签
      if (tags) {
        for (const [key, val] of Object.entries(tags)) {
          metric.tags![key] = val;
        }
      }

      // 收集指标
      this.monitoringSystem.collect(metric);

      // 归还对象到池中
      this.metricPool.release(metric);
    } else {
      // 不使用对象池，直接创建新对象
      this.monitoringSystem.collect({
        type,
        value,
        timestamp: Date.now(),
        tags,
      });
    }
  }

  /**
   * 设置控制台日志
   */
  private setupConsoleLogging(): void {
    // 监听指标收集事件
    this.monitoringSystem.on('metric_collected', (metric: MonitoringMetric) => {
      console.log(
        `[监控系统] 收集指标: ${metric.type} = ${metric.value}`,
        metric.tags
      );
    });

    // 监听聚合完成事件
    this.monitoringSystem.on(
      'aggregation_completed',
      (results: AggregationResult[]) => {
        console.log(`[监控系统] 聚合完成: ${results.length} 条结果`);
      }
    );

    // 监听报警触发事件
    this.monitoringSystem.on('alert_triggered', (alert: any) => {
      console.warn(`[监控系统] 报警触发: ${alert.ruleName} - ${alert.message}`);
    });

    // 监听报警解除事件
    this.monitoringSystem.on('alert_resolved', (alert: any) => {
      console.info(`[监控系统] 报警解除: ${alert.ruleName} - ${alert.message}`);
    });
  }

  /**
   * 移除事件监听
   */
  private removeEventListeners(_core: UploaderCore): void {
    // 使用相同的事件名移除事件监听
    if (this.core) {
      this.core.off('upload:start');
      this.core.off('upload:success');
      this.core.off('upload:error');
      this.core.off('chunk:progress');
      this.core.off('concurrency:change');
      this.core.off('error');
    }
  }

  /**
   * 扩展UploaderCore
   */
  private extendUploaderCore(core: UploaderCore): void {
    // 向UploaderCore添加监控相关方法
    const uploadCore = core as any;

    // 添加收集自定义指标的方法
    uploadCore.collectMetric = (
      metricType: MonitoringMetricType,
      value: number,
      tags?: Record<string, string>
    ): void => {
      this.collectMetric(metricType, value, tags);
    };

    // 添加获取聚合数据的方法
    uploadCore.getAggregationResults = (
      metricType?: MonitoringMetricType
    ): AggregationResult[] => {
      const results = this.monitoringSystem.getAggregationResults();
      if (metricType) {
        return results.filter(r => r.metricType === metricType);
      }
      return results;
    };

    // 添加执行聚合的方法
    uploadCore.aggregateNow = (
      options: AggregationOptions,
      metricType: MonitoringMetricType
    ): AggregationResult | null => {
      return this.monitoringSystem.aggregateNow(options, metricType);
    };

    // 添加注册报警规则的方法
    uploadCore.addAlertRule = (rule: Omit<AlertRule, 'id'>): string => {
      return this.monitoringSystem.addAlertRule(rule);
    };

    // 添加删除报警规则的方法
    uploadCore.removeAlertRule = (ruleId: string): boolean => {
      return this.monitoringSystem.removeAlertRule(ruleId);
    };
  }

  /**
   * 移除UploaderCore扩展
   */
  private removeUploaderCoreExtensions(core: UploaderCore): void {
    const uploadCore = core as any;
    delete uploadCore.collectMetric;
    delete uploadCore.getAggregationResults;
    delete uploadCore.aggregateNow;
    delete uploadCore.addAlertRule;
    delete uploadCore.removeAlertRule;
  }

  /**
   * 注册指标映射
   */
  public registerMetricMapping(mapping: MetricMappingConfig): void {
    this.monitoringSystem.registerMetricMapping(mapping);
  }

  /**
   * 添加报警规则
   */
  public addAlertRule(rule: Omit<AlertRule, 'id'>): string {
    return this.monitoringSystem.addAlertRule(rule);
  }

  /**
   * 移除报警规则
   */
  public removeAlertRule(ruleId: string): boolean {
    return this.monitoringSystem.removeAlertRule(ruleId);
  }

  /**
   * 获取监控系统实例
   */
  public getMonitoringSystem(): MonitoringSystem {
    return this.monitoringSystem;
  }
}
