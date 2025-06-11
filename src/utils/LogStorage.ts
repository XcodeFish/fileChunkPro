/**
 * LogStorage - 高效日志存储模块
 * 提供高性能的日志存储、索引和查询功能
 */

import {
  ILogEntry,
  ILogFilterOptions,
  ILogStorageProvider,
  LogLevel,
} from '../types/debug';

/**
 * 日志索引类型
 */
interface LogIndex {
  // 模块索引：模块名称 -> 日志ID数组
  byModule: Map<string, Set<string>>;

  // 级别索引：日志级别 -> 日志ID数组
  byLevel: Map<LogLevel, Set<string>>;

  // 时间索引：时间标记 -> 日志ID数组
  byTime: Map<string, Set<string>>;

  // 文本搜索索引：关键词 -> 日志ID数组
  byKeyword: Map<string, Set<string>>;

  // 性能快照关联索引：快照ID -> 日志ID数组
  byPerfSnapshot: Map<string, Set<string>>;
}

/**
 * 索引时间块类型，决定时间索引的粒度
 */
export enum TimeBlockType {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
}

/**
 * 日志存储配置
 */
export interface LogStorageOptions {
  // 最大日志条目数量
  maxEntries?: number;

  // 是否启用压缩
  enableCompression?: boolean;

  // 时间索引块类型
  timeBlockType?: TimeBlockType;

  // 关键词索引的最小长度
  minKeywordLength?: number;

  // 关键词索引的最大长度
  maxKeywordLength?: number;

  // 超过多少条日志时启用自动清理
  cleanupThreshold?: number;

  // 自动清理时保留的百分比
  retentionPercentage?: number;
}

/**
 * 增强型日志存储类
 * 使用高效索引结构提高查询效率
 */
export class LogStorage implements ILogStorageProvider {
  private logs: Map<string, ILogEntry> = new Map();
  private indices: LogIndex = {
    byModule: new Map(),
    byLevel: new Map(),
    byTime: new Map(),
    byKeyword: new Map(),
    byPerfSnapshot: new Map(),
  };
  private entryTimestamps: number[] = [];
  private options: Required<LogStorageOptions>;
  private logCount = 0;

  private static readonly DEFAULT_OPTIONS: Required<LogStorageOptions> = {
    maxEntries: 5000,
    enableCompression: false,
    timeBlockType: TimeBlockType.HOUR,
    minKeywordLength: 3,
    maxKeywordLength: 20,
    cleanupThreshold: 4000,
    retentionPercentage: 75,
  };

  /**
   * 构造函数
   */
  constructor(options?: LogStorageOptions) {
    this.options = { ...LogStorage.DEFAULT_OPTIONS, ...options };

    // 初始化日志级别索引
    Object.values(LogLevel).forEach(level => {
      if (typeof level === 'number') {
        this.indices.byLevel.set(level as LogLevel, new Set());
      }
    });
  }

  /**
   * 保存日志条目
   * @param entry 日志条目
   */
  public async saveLog(entry: ILogEntry): Promise<void> {
    const { id } = entry;

    // 检查容量并在必要时执行清理
    this.checkCapacityAndCleanup();

    // 存储日志条目
    this.logs.set(id, entry);
    this.entryTimestamps.push(entry.timestamp);
    this.logCount++;

    // 建立索引
    this.indexEntry(entry);
  }

  /**
   * 检查存储容量并在必要时执行清理
   */
  private checkCapacityAndCleanup(): void {
    if (this.logCount >= this.options.cleanupThreshold) {
      // 计算需要保留的日志数量
      const retentionCount = Math.floor(
        (this.options.maxEntries * this.options.retentionPercentage) / 100
      );

      // 如果当前日志数量超过保留阈值，执行清理
      if (this.logCount > retentionCount) {
        this.cleanup(retentionCount);
      }
    }
  }

  /**
   * 清理日志存储
   * @param retentionCount 要保留的日志数量
   */
  private cleanup(retentionCount: number): void {
    // 按时间戳排序
    const sortedIds = [...this.logs.keys()].sort(
      (a, b) => this.logs.get(a)!.timestamp - this.logs.get(b)!.timestamp
    );

    // 确定要移除的日志条目
    const removeCount = this.logCount - retentionCount;
    const idsToRemove = sortedIds.slice(0, removeCount);

    // 移除指定的条目
    for (const id of idsToRemove) {
      const entry = this.logs.get(id);
      if (entry) {
        this.removeEntryIndices(entry);
        this.logs.delete(id);
      }
    }

    // 更新日志计数
    this.logCount -= idsToRemove.length;

    // 重建时间戳数组
    this.entryTimestamps = [...this.logs.values()]
      .map(entry => entry.timestamp)
      .sort();
  }

  /**
   * 为日志条目创建索引
   * @param entry 日志条目
   */
  private indexEntry(entry: ILogEntry): void {
    const {
      id,
      level,
      module,
      message,
      timestamp,
      data,
      performanceSnapshotId,
    } = entry;

    // 添加模块索引
    if (!this.indices.byModule.has(module)) {
      this.indices.byModule.set(module, new Set());
    }
    this.indices.byModule.get(module)!.add(id);

    // 添加级别索引
    this.indices.byLevel.get(level)!.add(id);

    // 添加时间索引
    const timeKey = this.getTimeBlockKey(timestamp);
    if (!this.indices.byTime.has(timeKey)) {
      this.indices.byTime.set(timeKey, new Set());
    }
    this.indices.byTime.get(timeKey)!.add(id);

    // 添加关键词索引
    const text = `${message} ${JSON.stringify(data || '')}`.toLowerCase();
    this.indexText(text, id);

    // 添加性能快照关联索引
    if (performanceSnapshotId) {
      if (!this.indices.byPerfSnapshot.has(performanceSnapshotId)) {
        this.indices.byPerfSnapshot.set(performanceSnapshotId, new Set());
      }
      this.indices.byPerfSnapshot.get(performanceSnapshotId)!.add(id);
    }
  }

  /**
   * 从索引中移除日志条目
   * @param entry 日志条目
   */
  private removeEntryIndices(entry: ILogEntry): void {
    const { id, level, module, timestamp, performanceSnapshotId } = entry;

    // 从模块索引中移除
    this.indices.byModule.get(module)?.delete(id);

    // 从级别索引中移除
    this.indices.byLevel.get(level)?.delete(id);

    // 从时间索引中移除
    const timeKey = this.getTimeBlockKey(timestamp);
    this.indices.byTime.get(timeKey)?.delete(id);

    // 从关键词索引中移除（较复杂，简化处理）
    // 完整实现需要遍历所有关键词索引

    // 从性能快照关联索引中移除
    if (performanceSnapshotId) {
      this.indices.byPerfSnapshot.get(performanceSnapshotId)?.delete(id);
    }
  }

  /**
   * 为文本内容创建关键词索引
   * @param text 文本内容
   * @param id 日志ID
   */
  private indexText(text: string, id: string): void {
    // 分词获取关键词
    const words = this.extractKeywords(text);

    for (const word of words) {
      if (!this.indices.byKeyword.has(word)) {
        this.indices.byKeyword.set(word, new Set());
      }
      this.indices.byKeyword.get(word)!.add(id);
    }
  }

  /**
   * 从文本中提取关键词
   * @param text 文本内容
   * @returns 关键词数组
   */
  private extractKeywords(text: string): string[] {
    // 简化版分词，实际可使用更复杂的算法
    const words = new Set<string>();
    const { minKeywordLength, maxKeywordLength } = this.options;

    // 按空格分词
    const tokens = text.split(/\s+/);
    for (const token of tokens) {
      if (
        token.length >= minKeywordLength &&
        token.length <= maxKeywordLength
      ) {
        words.add(token);
      }
    }

    return [...words];
  }

  /**
   * 获取时间块的键值
   * @param timestamp 时间戳
   * @returns 时间块键值
   */
  private getTimeBlockKey(timestamp: number): string {
    const date = new Date(timestamp);

    switch (this.options.timeBlockType) {
      case TimeBlockType.MINUTE:
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
      case TimeBlockType.HOUR:
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      case TimeBlockType.DAY:
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      default:
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    }
  }

  /**
   * 查询日志条目
   * @param filter 过滤选项
   * @returns 过滤后的日志条目数组
   */
  public async getLogs(filter?: ILogFilterOptions): Promise<ILogEntry[]> {
    if (!filter) {
      // 返回所有日志
      return [...this.logs.values()];
    }

    // 使用索引高效查询
    const candidateIds = this.findCandidateIds(filter);
    if (candidateIds.size === 0) {
      return [];
    }

    // 获取日志条目并进行精确过滤
    const result: ILogEntry[] = [];
    for (const id of candidateIds) {
      const log = this.logs.get(id);
      if (log && this.matchesFilter(log, filter)) {
        result.push(log);
      }
    }

    // 根据时间排序
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 使用索引查找候选日志ID
   * @param filter 过滤选项
   * @returns 候选日志ID集合
   */
  private findCandidateIds(filter: ILogFilterOptions): Set<string> {
    let candidateIds: Set<string> | null = null;

    // 按日志级别过滤
    if (filter.level !== undefined) {
      const levelIds = new Set<string>();

      // 收集所有符合级别要求的日志ID
      for (let level = LogLevel.ERROR; level <= filter.level; level++) {
        const idsForLevel = this.indices.byLevel.get(level as LogLevel);
        if (idsForLevel) {
          idsForLevel.forEach(id => levelIds.add(id));
        }
      }

      candidateIds = levelIds;
    }

    // 按模块过滤
    if (filter.module) {
      let moduleIds: Set<string>;

      if (typeof filter.module === 'string') {
        // 精确匹配模块名
        moduleIds = this.indices.byModule.get(filter.module) || new Set();
      } else {
        // 正则匹配模块名
        moduleIds = new Set<string>();
        for (const [module, ids] of this.indices.byModule.entries()) {
          if (filter.module.test(module)) {
            ids.forEach(id => moduleIds.add(id));
          }
        }
      }

      candidateIds = candidateIds
        ? this.intersectSets(candidateIds, moduleIds)
        : moduleIds;
    }

    // 按时间范围过滤
    if (filter.timeRange) {
      let timeIds: Set<string> | null = null;

      // 根据时间范围查找相关的时间块
      if (
        filter.timeRange.start !== undefined ||
        filter.timeRange.end !== undefined
      ) {
        const start = filter.timeRange.start || 0;
        const end = filter.timeRange.end || Date.now();

        // 二分查找时间范围内的日志索引
        const startIdx = this.binarySearchTime(this.entryTimestamps, start);
        const endIdx = this.binarySearchTime(this.entryTimestamps, end, false);

        // 时间范围内的所有日志
        if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
          timeIds = new Set<string>();
          for (let i = startIdx; i <= endIdx; i++) {
            const timestamp = this.entryTimestamps[i];
            const timeKey = this.getTimeBlockKey(timestamp);
            const ids = this.indices.byTime.get(timeKey);
            if (ids) {
              ids.forEach(id => timeIds!.add(id));
            }
          }
        }
      }

      if (timeIds) {
        candidateIds = candidateIds
          ? this.intersectSets(candidateIds, timeIds)
          : timeIds;
      }
    }

    // 按搜索内容过滤
    if (filter.search) {
      let searchIds: Set<string>;

      if (typeof filter.search === 'string') {
        // 从关键词索引中查找匹配的日志ID
        const keywords = this.extractKeywords(filter.search.toLowerCase());
        searchIds = new Set<string>();

        if (keywords.length > 0) {
          // 首先获取第一个关键词的匹配结果
          const firstKeyword = keywords[0];
          const firstIds =
            this.indices.byKeyword.get(firstKeyword) || new Set();
          firstIds.forEach(id => searchIds.add(id));

          // 与后续关键词的结果取交集
          for (let i = 1; i < keywords.length; i++) {
            const keyword = keywords[i];
            const ids = this.indices.byKeyword.get(keyword) || new Set();
            searchIds = this.intersectSets(searchIds, ids);
          }
        }
      } else {
        // 正则表达式搜索需要全表扫描
        searchIds = new Set<string>();
        for (const [id, entry] of this.logs.entries()) {
          const searchContent = `${entry.module}:${entry.message}:${JSON.stringify(entry.data || '')}`;
          if (filter.search.test(searchContent)) {
            searchIds.add(id);
          }
        }
      }

      candidateIds = candidateIds
        ? this.intersectSets(candidateIds, searchIds)
        : searchIds;
    }

    return candidateIds || new Set(this.logs.keys());
  }

  /**
   * 计算两个集合的交集
   * @param set1 集合1
   * @param set2 集合2
   * @returns 交集
   */
  private intersectSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    const result = new Set<T>();

    // 选择较小的集合进行遍历，提高效率
    const [smaller, larger] =
      set1.size <= set2.size ? [set1, set2] : [set2, set1];

    for (const item of smaller) {
      if (larger.has(item)) {
        result.add(item);
      }
    }

    return result;
  }

  /**
   * 二分查找时间戳数组中最接近目标值的索引
   * @param timestamps 时间戳数组
   * @param target 目标时间戳
   * @param findLower 是否查找小于等于目标的最大值
   * @returns 数组索引，未找到时返回-1
   */
  private binarySearchTime(
    timestamps: number[],
    target: number,
    findLower = true
  ): number {
    if (timestamps.length === 0) return -1;

    let left = 0;
    let right = timestamps.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midVal = timestamps[mid];

      if (findLower) {
        // 查找小于等于目标的最大值
        if (midVal <= target) {
          result = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      } else {
        // 查找大于等于目标的最小值
        if (midVal >= target) {
          result = mid;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
    }

    return result;
  }

  /**
   * 检查日志条目是否匹配过滤条件
   * @param log 日志条目
   * @param filter 过滤条件
   * @returns 是否匹配
   */
  private matchesFilter(log: ILogEntry, filter: ILogFilterOptions): boolean {
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
  }

  /**
   * 清空所有日志
   */
  public async clearLogs(): Promise<void> {
    this.logs.clear();
    this.logCount = 0;
    this.entryTimestamps = [];

    // 清空所有索引
    this.indices.byModule.clear();
    this.indices.byKeyword.clear();
    this.indices.byTime.clear();
    this.indices.byPerfSnapshot.clear();

    // 重新初始化日志级别索引
    this.indices.byLevel.forEach(set => set.clear());
  }

  /**
   * 导出日志
   * @param format 导出格式
   * @returns 导出的日志字符串
   */
  public async exportLogs(
    format: 'json' | 'text' | 'csv' = 'json'
  ): Promise<string> {
    const logs = [...this.logs.values()];

    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);

      case 'text':
        return logs
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(
            log =>
              `[${new Date(log.timestamp).toISOString()}] [${LogLevel[log.level]}] [${log.module}] ${log.message}`
          )
          .join('\n');

      case 'csv': {
        const header = 'Timestamp,Level,Module,Message,Data\n';
        const rows = logs
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(
            log =>
              `"${new Date(log.timestamp).toISOString()}","${LogLevel[log.level]}","${log.module}","${log.message.replace(/"/g, '""')}","${JSON.stringify(log.data || '').replace(/"/g, '""')}"`
          )
          .join('\n');
        return header + rows;
      }

      default:
        return JSON.stringify(logs);
    }
  }

  /**
   * 根据性能快照ID查找相关日志
   * @param perfSnapshotId 性能快照ID
   * @returns 相关日志条目
   */
  public async getLogsByPerformanceSnapshot(
    perfSnapshotId: string
  ): Promise<ILogEntry[]> {
    const ids = this.indices.byPerfSnapshot.get(perfSnapshotId);
    if (!ids || ids.size === 0) {
      return [];
    }

    const result: ILogEntry[] = [];
    for (const id of ids) {
      const log = this.logs.get(id);
      if (log) {
        result.push(log);
      }
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
  }
}

export default LogStorage;
