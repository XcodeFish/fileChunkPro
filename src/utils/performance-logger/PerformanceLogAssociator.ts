/**
 * PerformanceLogAssociator - 性能日志关联器
 * 负责处理日志与性能数据的高效关联
 * 重构版：采用模块化设计，提高性能和可维护性
 */

import { ILogEntry } from '../../types/debug';
import {
  IPerformanceLogAssociator,
  IPerformanceLogAssociation,
  PerformanceLogAssociationType,
  IEnhancedLogEntry,
  IEnhancedPerformanceMetric,
  IPerformanceLogQuery,
  IPerformanceLogResult,
} from '../../types/performance-logger';
import {
  PerformanceCollector,
  PerformanceMetric,
} from '../PerformanceCollector';
import { LogStorage } from '../LogStorage';

import AssociationAlgorithm, {
  AssociationWeightConfig,
} from './AssociationAlgorithm';
import AssociationStorage, {
  AssociationStorageOptions,
} from './AssociationStorage';

/**
 * 性能日志关联器配置
 */
export interface PerformanceLogAssociatorConfig {
  /** 算法配置 */
  algorithmOptions?: Partial<AssociationWeightConfig>;

  /** 存储配置 */
  storageOptions?: Partial<AssociationStorageOptions>;

  /** 是否启用自动关联 */
  enableAutoAssociation?: boolean;

  /** 自动关联的最小权重阈值 */
  autoAssociateMinWeight?: number;

  /** 缓存增强日志结果 */
  cacheEnhancedResults?: boolean;

  /** 增强结果缓存大小 */
  enhancedResultsCacheSize?: number;

  /** 批量处理分块大小 */
  batchSize?: number;
}

/**
 * 日志与性能指标关联结果缓存项
 */
interface EnhancedResultCacheItem {
  data: IEnhancedLogEntry[] | IEnhancedPerformanceMetric[];
  timestamp: number;
}

/**
 * 性能日志关联器实现
 */
export class PerformanceLogAssociator implements IPerformanceLogAssociator {
  private performanceCollector: PerformanceCollector;
  private logStorage: LogStorage;
  private algorithm: AssociationAlgorithm;
  private storage: AssociationStorage;
  private config: Required<PerformanceLogAssociatorConfig>;

  // 增强结果缓存
  private enhancedLogCache: Map<string, EnhancedResultCacheItem> = new Map();
  private enhancedMetricCache: Map<string, EnhancedResultCacheItem> = new Map();
  private queryCacheExpiry = 30000; // 30秒

  // 默认配置
  private static readonly DEFAULT_CONFIG: Required<PerformanceLogAssociatorConfig> =
    {
      algorithmOptions: {},
      storageOptions: {},
      enableAutoAssociation: true,
      autoAssociateMinWeight: 0.5,
      cacheEnhancedResults: true,
      enhancedResultsCacheSize: 50,
      batchSize: 100,
    };

  /**
   * 构造函数
   */
  constructor(
    logStorage: LogStorage,
    performanceCollector?: PerformanceCollector,
    config?: PerformanceLogAssociatorConfig
  ) {
    this.logStorage = logStorage;
    this.performanceCollector =
      performanceCollector || PerformanceCollector.getInstance();
    this.config = { ...PerformanceLogAssociator.DEFAULT_CONFIG, ...config };

    // 初始化子模块
    this.algorithm = new AssociationAlgorithm(this.config.algorithmOptions);
    this.storage = new AssociationStorage(this.config.storageOptions);
  }

  /**
   * 关联日志和性能数据
   * @param log 日志条目
   * @param metric 性能指标
   * @param type 关联类型
   * @param weight 关联权重
   * @param description 关联描述
   * @returns 关联关系对象
   */
  public associate(
    log: ILogEntry,
    metric: PerformanceMetric,
    type?: PerformanceLogAssociationType,
    weight?: number,
    description?: string
  ): IPerformanceLogAssociation {
    // 如果没有提供类型和权重，自动计算
    if (type === undefined || weight === undefined) {
      const result = this.algorithm.calculateAssociation(log, metric);
      type = type || result.type;
      weight = weight !== undefined ? weight : result.weight;
    }

    // 创建关联对象
    const association: IPerformanceLogAssociation = {
      logId: log.id,
      performanceMetricId: metric.metadata?.metricId || 'unknown',
      associationType: type!,
      timestamp: Date.now(),
      weight: Math.max(0, Math.min(1, weight!)), // 确保权重在0-1范围内
      description,
    };

    // 存储关联
    const id = this.storage.add(association);

    // 清除相关的增强结果缓存
    this.clearRelatedCache(log.id, association.performanceMetricId);

    return { ...association, id };
  }

  /**
   * 清除与指定日志或性能指标相关的缓存
   * @param logId 日志ID
   * @param metricId 性能指标ID
   */
  private clearRelatedCache(logId: string, metricId: string): void {
    // 清除日志相关缓存
    this.enhancedLogCache.delete(logId);

    // 清除与日志相关的查询缓存
    for (const [key] of this.enhancedLogCache) {
      if (key.includes(`log:${logId}`) || key.includes(`metric:${metricId}`)) {
        this.enhancedLogCache.delete(key);
      }
    }

    // 清除性能指标相关缓存
    this.enhancedMetricCache.delete(metricId);

    // 清除与性能指标相关的查询缓存
    for (const [key] of this.enhancedMetricCache) {
      if (key.includes(`log:${logId}`) || key.includes(`metric:${metricId}`)) {
        this.enhancedMetricCache.delete(key);
      }
    }
  }

  /**
   * 根据日志ID查找相关的性能指标
   * @param logId 日志ID
   * @returns 关联的性能指标
   */
  public async getMetricsByLogId(
    logId: string
  ): Promise<IEnhancedPerformanceMetric[]> {
    // 检查缓存
    if (this.config.cacheEnhancedResults) {
      const cached = this.enhancedMetricCache.get(logId);
      if (cached && Date.now() - cached.timestamp < this.queryCacheExpiry) {
        return cached.data as IEnhancedPerformanceMetric[];
      }
    }

    // 查找关联
    const associations = this.storage.findByLogId(logId);
    if (associations.length === 0) {
      return [];
    }

    // 收集相关的性能指标ID
    const metricIds = new Set<string>();
    const associationsByMetricId = new Map<
      string,
      IPerformanceLogAssociation[]
    >();

    for (const association of associations) {
      const { performanceMetricId } = association;
      metricIds.add(performanceMetricId);

      if (!associationsByMetricId.has(performanceMetricId)) {
        associationsByMetricId.set(performanceMetricId, []);
      }
      associationsByMetricId.get(performanceMetricId)!.push(association);
    }

    // 获取性能指标
    const result: IEnhancedPerformanceMetric[] = [];

    for (const metricId of metricIds) {
      const metric = await this.performanceCollector.findById(metricId);
      if (metric) {
        const relatedAssociations = associationsByMetricId.get(metricId) || [];

        // 找出最高权重的关联
        const highestWeightAssociation = relatedAssociations.reduce(
          (highest, current) => {
            return current.weight > highest.weight ? current : highest;
          },
          relatedAssociations[0]
        );

        // 创建增强的指标对象
        const enhancedMetric: IEnhancedPerformanceMetric = {
          ...metric,
          relatedLogEntries: [logId],
          associationTypes: {
            [logId]: highestWeightAssociation.associationType,
          },
          associationWeights: {
            [logId]: highestWeightAssociation.weight,
          },
        };

        result.push(enhancedMetric);
      }
    }

    // 更新缓存
    if (this.config.cacheEnhancedResults) {
      this.enhancedMetricCache.set(logId, {
        data: result,
        timestamp: Date.now(),
      });

      // 管理缓存大小
      this.manageCache(this.enhancedMetricCache);
    }

    return result;
  }

  /**
   * 根据性能指标ID查找相关的日志
   * @param metricId 性能指标ID
   * @returns 关联的日志条目
   */
  public async getLogsByMetricId(
    metricId: string
  ): Promise<IEnhancedLogEntry[]> {
    // 检查缓存
    if (this.config.cacheEnhancedResults) {
      const cached = this.enhancedLogCache.get(metricId);
      if (cached && Date.now() - cached.timestamp < this.queryCacheExpiry) {
        return cached.data as IEnhancedLogEntry[];
      }
    }

    // 查找关联
    const associations = this.storage.findByMetricId(metricId);
    if (associations.length === 0) {
      return [];
    }

    // 收集相关的日志ID
    const logIds = new Set<string>();
    const associationsByLogId = new Map<string, IPerformanceLogAssociation[]>();

    for (const association of associations) {
      const { logId } = association;
      logIds.add(logId);

      if (!associationsByLogId.has(logId)) {
        associationsByLogId.set(logId, []);
      }
      associationsByLogId.get(logId)!.push(association);
    }

    // 获取日志条目
    const result: IEnhancedLogEntry[] = [];

    // 批量处理日志ID查询，避免单个查询过多
    const logIdsArray = Array.from(logIds);
    for (let i = 0; i < logIdsArray.length; i += this.config.batchSize) {
      const batch = logIdsArray.slice(i, i + this.config.batchSize);

      // 查询每个日志
      for (const logId of batch) {
        const logs = await this.logStorage.getLogs({ search: logId });
        if (logs.length > 0) {
          const log = logs[0];
          const relatedAssociations = associationsByLogId.get(logId) || [];

          // 找出最高权重的关联
          const highestWeightAssociation = relatedAssociations.reduce(
            (highest, current) => {
              return current.weight > highest.weight ? current : highest;
            },
            relatedAssociations[0]
          );

          // 创建增强的日志对象
          const enhancedLog: IEnhancedLogEntry = {
            ...log,
            relatedPerformanceMetrics: [metricId],
            associationTypes: {
              [metricId]: highestWeightAssociation.associationType,
            },
            associationWeights: {
              [metricId]: highestWeightAssociation.weight,
            },
          };

          result.push(enhancedLog);
        }
      }
    }

    // 更新缓存
    if (this.config.cacheEnhancedResults) {
      this.enhancedLogCache.set(metricId, {
        data: result,
        timestamp: Date.now(),
      });

      // 管理缓存大小
      this.manageCache(this.enhancedLogCache);
    }

    return result;
  }

  /**
   * 自动分析日志和性能指标，找出潜在关联
   * @param log 日志条目
   * @param lookbackWindow 回溯窗口大小(ms)
   * @returns 发现的关联数量
   */
  public async autoAssociateLog(
    log: ILogEntry,
    lookbackWindow = 10000
  ): Promise<number> {
    if (!this.config.enableAutoAssociation) return 0;

    const endTime = log.timestamp;
    const startTime = endTime - lookbackWindow;

    // 查找时间窗口内的性能指标
    const metrics = await this.performanceCollector.findByTimeRange(
      startTime,
      endTime
    );
    if (metrics.length === 0) return 0;

    let associatedCount = 0;

    // 评估每个性能指标与日志的关联度
    for (const metric of metrics) {
      const { weight, type } = this.algorithm.calculateAssociation(log, metric);

      // 仅创建超过阈值的关联
      if (weight >= this.config.autoAssociateMinWeight) {
        this.associate(log, metric, type, weight, 'Auto-associated');
        associatedCount++;
      }
    }

    return associatedCount;
  }

  /**
   * 自动分析性能指标，找出潜在关联的日志
   * @param metric 性能指标
   * @param lookbackWindow 回溯窗口大小(ms)
   * @returns 发现的关联数量
   */
  public async autoAssociateMetric(
    metric: PerformanceMetric,
    lookbackWindow = 10000
  ): Promise<number> {
    if (!this.config.enableAutoAssociation) return 0;

    const endTime = metric.timestamp;
    const startTime = endTime - lookbackWindow;

    // 查找时间窗口内的日志
    const logs = await this.logStorage.getLogs({
      timeRange: { start: startTime, end: endTime },
    });

    if (logs.length === 0) return 0;

    let associatedCount = 0;

    // 评估每个日志与性能指标的关联度
    for (const log of logs) {
      const { weight, type } = this.algorithm.calculateAssociation(log, metric);

      // 仅创建超过阈值的关联
      if (weight >= this.config.autoAssociateMinWeight) {
        this.associate(log, metric, type, weight, 'Auto-associated');
        associatedCount++;
      }
    }

    return associatedCount;
  }

  /**
   * 高级查询性能日志关联
   * @param query 查询选项
   * @returns 查询结果
   */
  public async query(
    query: IPerformanceLogQuery
  ): Promise<IPerformanceLogResult> {
    // 构建缓存键
    const cacheKey = `query:${JSON.stringify(query)}`;

    // 检查缓存
    if (this.config.cacheEnhancedResults) {
      const cachedLogs = this.enhancedLogCache.get(cacheKey);
      const cachedMetrics = this.enhancedMetricCache.get(cacheKey);

      if (
        cachedLogs &&
        cachedMetrics &&
        Date.now() - cachedLogs.timestamp < this.queryCacheExpiry
      ) {
        return {
          logs: cachedLogs.data as IEnhancedLogEntry[],
          metrics: cachedMetrics.data as IEnhancedPerformanceMetric[],
          associations: [], // 不缓存关联列表
          summary: undefined, // 不缓存摘要
        };
      }
    }

    // 应用过滤条件
    let associations: IPerformanceLogAssociation[] = [];

    // 按关联类型过滤
    if (query.associationTypes && query.associationTypes.length > 0) {
      // 合并多个类型的关联
      const typeResults: IPerformanceLogAssociation[][] = [];
      for (const type of query.associationTypes) {
        typeResults.push(this.storage.findByType(type));
      }
      associations = typeResults.flat();
    }

    // 按时间范围过滤
    if (query.timeRange) {
      const { start, end } = query.timeRange;
      if (start !== undefined && end !== undefined) {
        const timeResults = this.storage.findByTimeRange(start, end);

        // 合并结果或进一步过滤现有结果
        if (associations.length === 0) {
          associations = timeResults;
        } else {
          const timeResultsIds = new Set(timeResults.map(a => a.id!));
          associations = associations.filter(
            a => a.id && timeResultsIds.has(a.id)
          );
        }
      }
    }

    // 按最小关联权重过滤
    if (query.minAssociationWeight !== undefined) {
      const weightResults = this.storage.findByWeightRange(
        query.minAssociationWeight,
        1.0
      );

      // 合并结果或进一步过滤现有结果
      if (associations.length === 0) {
        associations = weightResults;
      } else {
        const weightResultsIds = new Set(weightResults.map(a => a.id!));
        associations = associations.filter(
          a => a.id && weightResultsIds.has(a.id)
        );
      }
    }

    // 如果没有应用过滤条件，获取所有关联
    if (associations.length === 0) {
      // 简单实现，实际中可能需要更高效的策略
      associations = [
        ...this.storage.findByType(PerformanceLogAssociationType.DIRECT),
        ...this.storage.findByType(PerformanceLogAssociationType.CAUSAL),
        ...this.storage.findByType(PerformanceLogAssociationType.CONTEXTUAL),
        ...this.storage.findByType(PerformanceLogAssociationType.TEMPORAL),
      ];
    }

    // 提取相关的日志ID和性能指标ID
    const logIds = new Set<string>();
    const metricIds = new Set<string>();

    for (const association of associations) {
      logIds.add(association.logId);
      metricIds.add(association.performanceMetricId);
    }

    // 预处理：按日志ID分组关联
    const logIdToAssociations = new Map<string, IPerformanceLogAssociation[]>();
    const metricIdToAssociations = new Map<
      string,
      IPerformanceLogAssociation[]
    >();

    // 按日志和指标ID分组关联
    for (const association of associations) {
      // 日志ID索引
      if (!logIdToAssociations.has(association.logId)) {
        logIdToAssociations.set(association.logId, []);
      }
      logIdToAssociations.get(association.logId)!.push(association);

      // 指标ID索引
      if (!metricIdToAssociations.has(association.performanceMetricId)) {
        metricIdToAssociations.set(association.performanceMetricId, []);
      }
      metricIdToAssociations
        .get(association.performanceMetricId)!
        .push(association);
    }

    // 构建增强日志
    const enhancedLogs = await this.buildEnhancedLogs(
      logIds,
      logIdToAssociations
    );

    // 构建增强指标
    const enhancedMetrics = await this.buildEnhancedMetrics(
      metricIds,
      metricIdToAssociations
    );

    // 排序与分页
    const sortedLogs = this.sortAndPage(enhancedLogs, query);
    const sortedMetrics = this.sortAndPage(enhancedMetrics, query);

    // 生成简单摘要
    const summary = {
      totalLogs: enhancedLogs.length,
      totalMetrics: enhancedMetrics.length,
      totalAssociations: associations.length,
      averageAssociationWeight:
        associations.length > 0
          ? associations.reduce((sum, a) => sum + a.weight, 0) /
            associations.length
          : 0,
      topModules: this.getTopModules(enhancedLogs, 5),
      topMetricTypes: this.getTopMetricTypes(enhancedMetrics, 5),
      timeRange: {
        start:
          associations.length > 0
            ? Math.min(...associations.map(a => a.timestamp))
            : Date.now(),
        end:
          associations.length > 0
            ? Math.max(...associations.map(a => a.timestamp))
            : Date.now(),
      },
    };

    // 缓存结果
    if (this.config.cacheEnhancedResults) {
      this.enhancedLogCache.set(cacheKey, {
        data: sortedLogs,
        timestamp: Date.now(),
      });

      this.enhancedMetricCache.set(cacheKey, {
        data: sortedMetrics,
        timestamp: Date.now(),
      });

      // 管理缓存大小
      this.manageCache(this.enhancedLogCache);
      this.manageCache(this.enhancedMetricCache);
    }

    return {
      logs: sortedLogs,
      metrics: sortedMetrics,
      associations,
      summary,
    };
  }

  /**
   * 构建增强日志对象集合
   */
  private async buildEnhancedLogs(
    logIds: Set<string>,
    logIdToAssociations: Map<string, IPerformanceLogAssociation[]>
  ): Promise<IEnhancedLogEntry[]> {
    const enhancedLogs: IEnhancedLogEntry[] = [];

    // 批量处理日志查询
    const logIdsArray = Array.from(logIds);
    for (let i = 0; i < logIdsArray.length; i += this.config.batchSize) {
      const batch = logIdsArray.slice(i, i + this.config.batchSize);

      for (const logId of batch) {
        const logs = await this.logStorage.getLogs({ search: logId });
        if (logs.length > 0) {
          const log = logs[0];
          const logAssociations = logIdToAssociations.get(logId) || [];

          // 对每个日志，计算关联的指标和最佳权重
          const metricAssociations = new Map<
            string,
            IPerformanceLogAssociation
          >();

          for (const assoc of logAssociations) {
            const metricId = assoc.performanceMetricId;

            if (
              !metricAssociations.has(metricId) ||
              metricAssociations.get(metricId)!.weight < assoc.weight
            ) {
              metricAssociations.set(metricId, assoc);
            }
          }

          // 创建关联类型和权重映射
          const relatedMetricIds = Array.from(metricAssociations.keys());
          const associationTypes: Record<
            string,
            PerformanceLogAssociationType
          > = {};
          const associationWeights: Record<string, number> = {};

          metricAssociations.forEach((assoc, metricId) => {
            associationTypes[metricId] = assoc.associationType;
            associationWeights[metricId] = assoc.weight;
          });

          // 创建增强日志
          enhancedLogs.push({
            ...log,
            relatedPerformanceMetrics: relatedMetricIds,
            associationTypes,
            associationWeights,
          });
        }
      }
    }

    return enhancedLogs;
  }

  /**
   * 构建增强指标对象集合
   */
  private async buildEnhancedMetrics(
    metricIds: Set<string>,
    metricIdToAssociations: Map<string, IPerformanceLogAssociation[]>
  ): Promise<IEnhancedPerformanceMetric[]> {
    const enhancedMetrics: IEnhancedPerformanceMetric[] = [];

    // 批量处理指标查询
    const metricIdsArray = Array.from(metricIds);
    for (let i = 0; i < metricIdsArray.length; i += this.config.batchSize) {
      const batch = metricIdsArray.slice(i, i + this.config.batchSize);

      for (const metricId of batch) {
        const metric = await this.performanceCollector.findById(metricId);
        if (metric) {
          const metricAssociations = metricIdToAssociations.get(metricId) || [];

          // 对每个指标，计算关联的日志和最佳权重
          const logAssociations = new Map<string, IPerformanceLogAssociation>();

          for (const assoc of metricAssociations) {
            const logId = assoc.logId;

            if (
              !logAssociations.has(logId) ||
              logAssociations.get(logId)!.weight < assoc.weight
            ) {
              logAssociations.set(logId, assoc);
            }
          }

          // 创建关联类型和权重映射
          const relatedLogIds = Array.from(logAssociations.keys());
          const associationTypes: Record<
            string,
            PerformanceLogAssociationType
          > = {};
          const associationWeights: Record<string, number> = {};

          logAssociations.forEach((assoc, logId) => {
            associationTypes[logId] = assoc.associationType;
            associationWeights[logId] = assoc.weight;
          });

          // 创建增强指标
          enhancedMetrics.push({
            ...metric,
            relatedLogEntries: relatedLogIds,
            associationTypes,
            associationWeights,
          });
        }
      }
    }

    return enhancedMetrics;
  }

  /**
   * 管理缓存大小，移除最旧项
   */
  private manageCache(cache: Map<string, EnhancedResultCacheItem>): void {
    if (cache.size > this.config.enhancedResultsCacheSize) {
      // 找到最旧的项
      let oldestKey: string | undefined;
      let oldestTime = Infinity;

      for (const [key, item] of cache.entries()) {
        if (item.timestamp < oldestTime) {
          oldestTime = item.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
  }

  /**
   * 对结果进行排序和分页
   */
  private sortAndPage<T>(items: T[], query: IPerformanceLogQuery): T[] {
    let result = [...items];

    // 排序
    if (query.sort) {
      result.sort((a: any, b: any) => {
        let valueA, valueB;

        switch (query.sort) {
          case 'timestamp':
            valueA = a.timestamp || 0;
            valueB = b.timestamp || 0;
            break;
          case 'level':
            valueA = a.level || 0;
            valueB = b.level || 0;
            break;
          case 'module':
            valueA = a.module || '';
            valueB = b.module || '';
            break;
          case 'associationWeight':
            // 使用平均关联权重
            valueA = a.associationWeights
              ? Object.values(a.associationWeights).reduce(
                  (sum: number, val: any) => sum + val,
                  0
                ) / Object.values(a.associationWeights).length
              : 0;
            valueB = b.associationWeights
              ? Object.values(b.associationWeights).reduce(
                  (sum: number, val: any) => sum + val,
                  0
                ) / Object.values(b.associationWeights).length
              : 0;
            break;
          default:
            valueA = 0;
            valueB = 0;
        }

        // 根据排序顺序返回比较结果
        return (
          (query.order === 'desc' ? -1 : 1) *
          (valueA < valueB ? -1 : valueA > valueB ? 1 : 0)
        );
      });
    }

    // 分页
    if (query.pagination) {
      const { offset, limit } = query.pagination;
      result = result.slice(offset, offset + limit);
    }

    return result;
  }

  /**
   * 获取出现频率最高的模块
   */
  private getTopModules(logs: IEnhancedLogEntry[], limit: number): string[] {
    const moduleCounts: Record<string, number> = {};

    for (const log of logs) {
      if (log.module) {
        moduleCounts[log.module] = (moduleCounts[log.module] || 0) + 1;
      }
    }

    return Object.entries(moduleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([module]) => module);
  }

  /**
   * 获取出现频率最高的指标类型
   */
  private getTopMetricTypes(
    metrics: IEnhancedPerformanceMetric[],
    limit: number
  ): string[] {
    const typeCounts: Record<string, number> = {};

    for (const metric of metrics) {
      if (metric.type) {
        typeCounts[metric.type] = (typeCounts[metric.type] || 0) + 1;
      }
    }

    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([type]) => type);
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.enhancedLogCache.clear();
    this.enhancedMetricCache.clear();
  }

  /**
   * 获取统计信息
   */
  public getStats() {
    return {
      storage: this.storage.getStats(),
      cacheInfo: {
        logCache: this.enhancedLogCache.size,
        metricCache: this.enhancedMetricCache.size,
      },
      config: this.config,
    };
  }

  /**
   * 销毁资源
   */
  public destroy(): void {
    this.storage.destroy();
    this.clearCache();
  }
}

export default PerformanceLogAssociator;
