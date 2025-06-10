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
    };

    // 初始化监控系统
    this.monitoringSystem = MonitoringSystem.getInstance(this.options);
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
      this.monitoringSystem.collect({
        type: MonitoringMetricType.BUSINESS_TOTAL_UPLOADS,
        value: 1,
        timestamp: Date.now(),
        tags: {
          fileId: file.id || '',
          fileName: file.name || '',
          fileSize: file.size?.toString() || '0',
        },
      });
    });

    // 监听文件上传完成事件
    core.on('upload:success', (file: any, _result: any) => {
      this.monitoringSystem.collect({
        type: MonitoringMetricType.UPLOAD_SUCCESS_RATE,
        value: 100, // 成功率100%
        timestamp: Date.now(),
        tags: {
          fileId: file.id || '',
          fileName: file.name || '',
        },
      });
    });

    // 监听文件上传错误事件
    core.on('upload:error', (file: any, error: any) => {
      this.monitoringSystem.collect({
        type: MonitoringMetricType.UPLOAD_ERROR_RATE,
        value: 1,
        timestamp: Date.now(),
        tags: {
          fileId: file.id || '',
          fileName: file.name || '',
          errorCode: error.code || '',
          errorMessage: error.message || '',
        },
      });
    });

    // 监听分片上传速度事件
    core.on('chunk:progress', (chunk: any, progress: any) => {
      if (progress.loaded && progress.total && progress.timeElapsed) {
        const speed = (progress.loaded / progress.timeElapsed) * 1000; // 字节/秒

        this.monitoringSystem.collect({
          type: MonitoringMetricType.CHUNK_SPEED,
          value: speed,
          timestamp: Date.now(),
          tags: {
            fileId: chunk.fileId || '',
            chunkIndex: chunk.index?.toString() || '',
          },
        });
      }
    });

    // 监听并发上传数量变化
    core.on('concurrency:change', (data: any) => {
      this.monitoringSystem.collect({
        type: MonitoringMetricType.BUSINESS_CONCURRENT_UPLOADS,
        value: data.current || 0,
        timestamp: Date.now(),
        tags: {
          reason: data.reason || '',
        },
      });
    });
  }

  /**
   * 设置错误监听
   */
  private setupErrorListeners(core: UploaderCore): void {
    core.on('error', (error: any) => {
      this.monitoringSystem.collect({
        type: MonitoringMetricType.UPLOAD_ERROR_RATE,
        value: 1,
        timestamp: Date.now(),
        tags: {
          errorCode: error.code || '',
          errorType: error.type || '',
          errorMessage: error.message || '',
        },
      });
    });
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
    // 这里可以做一些清理工作，但UploaderCore目前没有提供off方法来移除特定事件回调
    // 因此，我们依赖插件卸载机制来处理这个问题
  }

  /**
   * 扩展UploaderCore
   */
  private extendUploaderCore(core: UploaderCore): void {
    // 这里可以向UploaderCore添加一些监控相关的方法
    // 由于TypeScript限制，这些方法将不会有完整的类型支持
    // 但可以在插件文档中描述这些方法

    // 例如，我们可以添加一个收集自定义指标的方法
    (core as any).collectCustomMetric = (
      name: string,
      value: number,
      tags?: Record<string, string>
    ) => {
      this.monitoringSystem.collect({
        type: MonitoringMetricType.CUSTOM,
        value,
        timestamp: Date.now(),
        tags: {
          metricName: name,
          ...tags,
        },
      });
    };

    // 添加一个方法来获取当前监控数据
    (core as any).getMonitoringMetrics = () => {
      return this.monitoringSystem.getMetrics();
    };

    // 添加一个方法来获取聚合结果
    (core as any).getMonitoringAggregations = () => {
      return this.monitoringSystem.getAggregationResults();
    };

    // 添加一个方法来获取报警事件
    (core as any).getMonitoringAlerts = () => {
      return this.monitoringSystem.getAlertEvents();
    };

    // 添加一个方法来执行即时聚合
    (core as any).aggregateMetricsNow = (
      options: AggregationOptions,
      metricType: MonitoringMetricType
    ) => {
      return this.monitoringSystem.aggregateNow(options, metricType);
    };

    // 添加一个方法来添加报警规则
    (core as any).addMonitoringAlertRule = (rule: Omit<AlertRule, 'id'>) => {
      return this.monitoringSystem.addAlertRule(rule);
    };
  }

  /**
   * 移除UploaderCore扩展
   */
  private removeUploaderCoreExtensions(core: UploaderCore): void {
    // 删除添加的方法
    delete (core as any).collectCustomMetric;
    delete (core as any).getMonitoringMetrics;
    delete (core as any).getMonitoringAggregations;
    delete (core as any).getMonitoringAlerts;
    delete (core as any).aggregateMetricsNow;
    delete (core as any).addMonitoringAlertRule;

    // 移除监控系统引用
    delete (core as any).monitoringSystem;
  }

  /**
   * 注册自定义指标映射
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
