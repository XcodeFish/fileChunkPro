/**
 * AssociationAlgorithm - 日志与性能数据关联算法
 * 负责实现各种关联评分和分析算法
 */

import { ILogEntry } from '../../types/debug';
import { PerformanceMetric } from '../PerformanceCollector';
import { PerformanceLogAssociationType } from '../../types/performance-logger';

/**
 * 关联权重计算配置
 */
export interface AssociationWeightConfig {
  /** 默认时间窗口大小(ms) */
  defaultTimeWindow: number;
  /** 时间衰减因子 */
  timeDecayFactor: number;
  /** 上下文匹配权重 */
  contextMatchWeight: number;
  /** 内容匹配权重 */
  contentMatchWeight: number;
  /** 模块匹配权重 */
  moduleMatchWeight: number;
  /** 时间接近度权重 */
  temporalProximityWeight: number;
}

/**
 * 关联算法默认配置
 */
export const DEFAULT_ASSOCIATION_CONFIG: AssociationWeightConfig = {
  defaultTimeWindow: 5000, // 5秒
  timeDecayFactor: 0.2,
  contextMatchWeight: 0.3,
  contentMatchWeight: 0.25,
  moduleMatchWeight: 0.15,
  temporalProximityWeight: 0.3,
};

/**
 * 关联算法类 - 提供各种关联算法实现
 */
export class AssociationAlgorithm {
  private config: AssociationWeightConfig;

  /**
   * 构造函数
   * @param config 算法配置
   */
  constructor(config?: Partial<AssociationWeightConfig>) {
    this.config = { ...DEFAULT_ASSOCIATION_CONFIG, ...config };
  }

  /**
   * 计算日志和性能数据之间的关联权重和类型
   * @param log 日志条目
   * @param metric 性能指标
   * @returns 关联权重和类型
   */
  public calculateAssociation(
    log: ILogEntry,
    metric: PerformanceMetric
  ): {
    weight: number;
    type: PerformanceLogAssociationType;
  } {
    // 匹配得分组件
    const timeScore = this.calculateTimeProximity(
      log.timestamp,
      metric.timestamp
    );
    const contextScore = this.calculateContextSimilarity(log, metric);
    const contentScore = this.calculateContentSimilarity(log, metric);
    const moduleScore = this.calculateModuleSimilarity(log, metric);

    // 加权总得分
    const totalWeight =
      timeScore * this.config.temporalProximityWeight +
      contextScore * this.config.contextMatchWeight +
      contentScore * this.config.contentMatchWeight +
      moduleScore * this.config.moduleMatchWeight;

    // 确定关联类型
    let associationType = PerformanceLogAssociationType.TEMPORAL;

    // 直接关联: 性能快照ID匹配或特定关联标记
    if (
      log.performanceSnapshotId === metric.metadata?.metricId ||
      metric.metadata?.logId === log.id
    ) {
      associationType = PerformanceLogAssociationType.DIRECT;
    }
    // 因果关联: 错误ID匹配或有明确的因果标记
    else if (
      (log.data?.errorId && metric.metadata?.errorId === log.data.errorId) ||
      metric.metadata?.causalLogId === log.id
    ) {
      associationType = PerformanceLogAssociationType.CAUSAL;
    }
    // 上下文关联: 共享上下文信息
    else if (contextScore > 0.7) {
      associationType = PerformanceLogAssociationType.CONTEXTUAL;
    }

    return {
      weight: Math.min(1, Math.max(0, totalWeight)), // 确保范围在0-1之间
      type: associationType,
    };
  }

  /**
   * 计算时间接近度得分
   * 使用高斯衰减函数模拟接近度
   */
  public calculateTimeProximity(time1: number, time2: number): number {
    const timeDiff = Math.abs(time1 - time2);
    const timeWindow = this.config.defaultTimeWindow;

    // 如果时间差超过时间窗口，得分为0
    if (timeDiff > timeWindow) return 0;

    // 使用高斯衰减函数计算时间接近度
    const decay = this.config.timeDecayFactor;
    return Math.exp(
      -(timeDiff * timeDiff) / (2 * timeWindow * timeWindow * decay)
    );
  }

  /**
   * 计算上下文相似度得分
   */
  private calculateContextSimilarity(
    log: ILogEntry,
    metric: PerformanceMetric
  ): number {
    let score = 0;
    const logData = log.data || {};
    const metricData = metric.metadata || {};

    // 匹配文件ID
    if (log.data?.fileId && log.data.fileId === metric.fileId) {
      score += 0.5;
    }

    // 匹配块索引
    if (
      log.data?.chunkIndex !== undefined &&
      metric.chunkIndex !== undefined &&
      log.data.chunkIndex === metric.chunkIndex
    ) {
      score += 0.3;
    }

    // 匹配请求ID或会话ID
    if (
      (logData.requestId && logData.requestId === metricData.requestId) ||
      (logData.sessionId && logData.sessionId === metricData.sessionId)
    ) {
      score += 0.4;
    }

    // 匹配用户操作ID
    if (logData.operationId && logData.operationId === metricData.operationId) {
      score += 0.4;
    }

    // 匹配任务ID
    if (logData.taskId && logData.taskId === metricData.taskId) {
      score += 0.5;
    }

    return Math.min(1, score); // 确保得分不超过1
  }

  /**
   * 计算内容相似度得分
   * 分析日志消息和性能指标数据中的关键词匹配程度
   */
  private calculateContentSimilarity(
    log: ILogEntry,
    metric: PerformanceMetric
  ): number {
    const logText =
      `${log.message} ${JSON.stringify(log.data || {})}`.toLowerCase();
    const metricText =
      `${metric.type} ${JSON.stringify(metric.metadata || {})}`.toLowerCase();

    // 提取关键词
    const logKeywords = this.extractKeywords(logText);
    const metricKeywords = this.extractKeywords(metricText);

    // 计算关键词重叠度
    const commonKeywords = logKeywords.filter(k => metricKeywords.includes(k));

    if (logKeywords.length === 0 || metricKeywords.length === 0) return 0;

    // Jaccard相似度系数
    return (
      commonKeywords.length /
      (logKeywords.length + metricKeywords.length - commonKeywords.length)
    );
  }

  /**
   * 计算模块相似度得分
   * 比较日志模块和性能指标的相关模块
   */
  private calculateModuleSimilarity(
    log: ILogEntry,
    metric: PerformanceMetric
  ): number {
    // 直接模块名匹配
    if (metric.metadata?.module === log.module) {
      return 1.0;
    }

    // 模块路径部分匹配
    const logModuleParts = log.module.split('.');
    const metricModuleParts = (metric.metadata?.module || '').split('.');

    // 计算共同的模块路径部分
    let commonParts = 0;
    for (
      let i = 0;
      i < Math.min(logModuleParts.length, metricModuleParts.length);
      i++
    ) {
      if (logModuleParts[i] === metricModuleParts[i]) {
        commonParts++;
      } else {
        break; // 一旦不匹配就停止
      }
    }

    // 如果没有共同部分，检查是否有子模块关系
    if (commonParts === 0) {
      if (
        log.module.startsWith(metric.metadata?.module || '') ||
        (metric.metadata?.module || '').startsWith(log.module)
      ) {
        return 0.5;
      }
      return 0;
    }

    // 根据共同部分计算相似度
    return (
      commonParts / Math.max(logModuleParts.length, metricModuleParts.length)
    );
  }

  /**
   * 从文本中提取关键词
   * @param text 文本内容
   * @returns 关键词数组
   */
  private extractKeywords(text: string): string[] {
    // 简单分词实现
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'is',
      'are',
      'to',
      'from',
      'in',
      'out',
      'by',
      'for',
      'with',
      'on',
      'at',
    ]);

    return text
      .replace(/[^\w\s]/g, ' ') // 去除标点符号
      .split(/\s+/)
      .filter(
        word => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word) // 过滤纯数字
      );
  }

  /**
   * 评估两个日志是否可能是同一事件的不同部分
   * @param log1 日志条目1
   * @param log2 日志条目2
   * @returns 相关度得分(0-1)
   */
  public evaluateLogCorrelation(log1: ILogEntry, log2: ILogEntry): number {
    // 如果模块不同且时间相差太久，可能性低
    if (
      log1.module !== log2.module &&
      Math.abs(log1.timestamp - log2.timestamp) > this.config.defaultTimeWindow
    ) {
      return 0.1;
    }

    // 计算时间接近度
    const timeScore = this.calculateTimeProximity(
      log1.timestamp,
      log2.timestamp
    );

    // 检查是否有共享ID
    const hasSharedId =
      log1.data &&
      log2.data &&
      ((log1.data.requestId && log1.data.requestId === log2.data.requestId) ||
        (log1.data.operationId &&
          log1.data.operationId === log2.data.operationId) ||
        (log1.data.taskId && log1.data.taskId === log2.data.taskId));

    const idScore = hasSharedId ? 0.8 : 0;

    // 内容相似度
    const msgSimilarity = this.calculateTextSimilarity(
      `${log1.message} ${JSON.stringify(log1.data || {})}`,
      `${log2.message} ${JSON.stringify(log2.data || {})}`
    );

    // 加权总分
    return timeScore * 0.4 + idScore * 0.4 + msgSimilarity * 0.2;
  }

  /**
   * 计算文本相似度 (使用简化版的Jaccard系数)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.extractKeywords(text1.toLowerCase()));
    const words2 = new Set(this.extractKeywords(text2.toLowerCase()));

    if (words1.size === 0 && words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) intersection++;
    }

    return intersection / (words1.size + words2.size - intersection);
  }
}

export default AssociationAlgorithm;
