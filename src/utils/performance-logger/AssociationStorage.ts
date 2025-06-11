/**
 * AssociationStorage - 日志与性能数据关联存储
 * 负责关联数据的高效存储、索引与缓存管理
 */

import {
  IPerformanceLogAssociation,
  PerformanceLogAssociationType,
} from '../../types/performance-logger';

/**
 * 关联存储选项
 */
export interface AssociationStorageOptions {
  /** 最大关联数量 */
  maxAssociations: number;
  /** LRU缓存大小 */
  lruCacheSize: number;
  /** 持久化存储键名 */
  persistKey?: string;
  /** 是否持久化到localStorage */
  enablePersistence?: boolean;
  /** 持久化间隔(ms) */
  persistInterval?: number;
  /** 缓存清理阈值 */
  cleanupThreshold: number;
}

/**
 * 默认存储选项
 */
const DEFAULT_STORAGE_OPTIONS: AssociationStorageOptions = {
  maxAssociations: 10000,
  lruCacheSize: 100,
  cleanupThreshold: 8000,
  enablePersistence: false,
  persistInterval: 60000,
};

/**
 * 关联索引结构
 */
interface AssociationIndices {
  byLogId: Map<string, Set<string>>;
  byMetricId: Map<string, Set<string>>;
  byType: Map<PerformanceLogAssociationType, Set<string>>;
  byTimeRange: Map<string, Set<string>>;
  byWeight: Map<string, Set<string>>;
}

/**
 * 最近使用项记录类型
 */
interface LRUItem {
  id: string;
  lastAccess: number;
}

/**
 * 关联数据存储类
 * 提供高效的数据存储、查询和管理功能
 */
export class AssociationStorage {
  private options: AssociationStorageOptions;
  private associations: Map<string, IPerformanceLogAssociation> = new Map();
  private indices: AssociationIndices = {
    byLogId: new Map(),
    byMetricId: new Map(),
    byType: new Map(),
    byTimeRange: new Map(),
    byWeight: new Map(),
  };
  private lruCache: LRUItem[] = [];
  private persistTimer: any = null;

  /**
   * 构造函数
   * @param options 存储选项
   */
  constructor(options?: Partial<AssociationStorageOptions>) {
    this.options = { ...DEFAULT_STORAGE_OPTIONS, ...options };

    // 初始化关联类型索引
    Object.values(PerformanceLogAssociationType).forEach(type => {
      if (typeof type === 'string') {
        this.indices.byType.set(
          type as PerformanceLogAssociationType,
          new Set()
        );
      }
    });

    // 初始化权重索引 (分10个区间)
    for (let i = 0; i < 10; i++) {
      const weightKey = `w${i / 10}-${(i + 1) / 10}`;
      this.indices.byWeight.set(weightKey, new Set());
    }

    // 设置持久化定时器(如果启用)
    if (this.options.enablePersistence && this.options.persistInterval) {
      this.persistTimer = setInterval(() => {
        this.persistAssociations();
      }, this.options.persistInterval);
    }

    // 恢复持久化数据
    if (this.options.enablePersistence && this.options.persistKey) {
      this.restoreAssociations();
    }
  }

  /**
   * 添加关联
   * @param association 关联对象
   * @returns 关联ID
   */
  public add(association: IPerformanceLogAssociation): string {
    const id =
      association.id ||
      `assoc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 确保关联有ID
    const associationWithId = {
      ...association,
      id,
    };

    // 检查并清理超量数据
    this.checkCapacityAndCleanup();

    // 存储关联
    this.associations.set(id, associationWithId);

    // 更新索引
    this.indexAssociation(associationWithId);

    // 更新LRU缓存
    this.updateLRUCache(id);

    return id;
  }

  /**
   * 获取关联
   * @param id 关联ID
   * @returns 关联对象或null
   */
  public get(id: string): IPerformanceLogAssociation | null {
    const association = this.associations.get(id);

    if (association) {
      // 更新LRU访问记录
      this.updateLRUCache(id);
      return association;
    }

    return null;
  }

  /**
   * 更新关联
   * @param id 关联ID
   * @param updates 更新字段
   * @returns 成功更新返回true，失败返回false
   */
  public update(
    id: string,
    updates: Partial<
      Omit<IPerformanceLogAssociation, 'id' | 'logId' | 'performanceMetricId'>
    >
  ): boolean {
    const association = this.associations.get(id);

    if (!association) {
      return false;
    }

    // 删除旧索引
    this.removeAssociationIndices(association);

    // 更新关联
    const updatedAssociation = {
      ...association,
      ...updates,
    };
    this.associations.set(id, updatedAssociation);

    // 重新索引
    this.indexAssociation(updatedAssociation);

    // 更新LRU缓存
    this.updateLRUCache(id);

    return true;
  }

  /**
   * 根据日志ID查找关联
   * @param logId 日志ID
   * @returns 关联ID数组
   */
  public findByLogId(logId: string): IPerformanceLogAssociation[] {
    const ids = this.indices.byLogId.get(logId);
    if (!ids || ids.size === 0) {
      return [];
    }

    return this.getAssociationsByIds(ids);
  }

  /**
   * 根据性能指标ID查找关联
   * @param metricId 性能指标ID
   * @returns 关联ID数组
   */
  public findByMetricId(metricId: string): IPerformanceLogAssociation[] {
    const ids = this.indices.byMetricId.get(metricId);
    if (!ids || ids.size === 0) {
      return [];
    }

    return this.getAssociationsByIds(ids);
  }

  /**
   * 根据关联类型查找关联
   * @param type 关联类型
   * @returns 关联ID数组
   */
  public findByType(
    type: PerformanceLogAssociationType
  ): IPerformanceLogAssociation[] {
    const ids = this.indices.byType.get(type);
    if (!ids || ids.size === 0) {
      return [];
    }

    return this.getAssociationsByIds(ids);
  }

  /**
   * 根据时间范围查找关联
   * @param startTime 开始时间
   * @param endTime 结束时间
   * @returns 关联数组
   */
  public findByTimeRange(
    startTime: number,
    endTime: number
  ): IPerformanceLogAssociation[] {
    const results: Set<string> = new Set();

    // 根据时间获取相关时间块
    const timeKeys = this.getTimeRangeKeys(startTime, endTime);

    for (const key of timeKeys) {
      const ids = this.indices.byTimeRange.get(key);
      if (ids) {
        ids.forEach(id => results.add(id));
      }
    }

    // 二次过滤确保在精确时间范围内
    return this.getAssociationsByIds(results).filter(
      assoc => assoc.timestamp >= startTime && assoc.timestamp <= endTime
    );
  }

  /**
   * 根据权重范围查找关联
   * @param minWeight 最小权重
   * @param maxWeight 最大权重
   * @returns 关联数组
   */
  public findByWeightRange(
    minWeight: number,
    maxWeight: number
  ): IPerformanceLogAssociation[] {
    const results: Set<string> = new Set();

    // 计算权重范围包含的区间
    const minBucket = Math.floor(minWeight * 10);
    const maxBucket = Math.floor(maxWeight * 10);

    for (let i = minBucket; i <= maxBucket; i++) {
      const weightKey = `w${i / 10}-${(i + 1) / 10}`;
      const ids = this.indices.byWeight.get(weightKey);
      if (ids) {
        ids.forEach(id => results.add(id));
      }
    }

    // 二次过滤确保在精确权重范围内
    return this.getAssociationsByIds(results).filter(
      assoc => assoc.weight >= minWeight && assoc.weight <= maxWeight
    );
  }

  /**
   * 删除关联
   * @param id 关联ID
   * @returns 成功删除返回true，失败返回false
   */
  public delete(id: string): boolean {
    const association = this.associations.get(id);

    if (!association) {
      return false;
    }

    // 移除索引
    this.removeAssociationIndices(association);

    // 移除存储
    this.associations.delete(id);

    // 从LRU缓存中移除
    const lruIndex = this.lruCache.findIndex(item => item.id === id);
    if (lruIndex !== -1) {
      this.lruCache.splice(lruIndex, 1);
    }

    return true;
  }

  /**
   * 清除所有关联
   */
  public clear(): void {
    this.associations.clear();
    this.lruCache = [];

    // 清除索引
    this.indices.byLogId.clear();
    this.indices.byMetricId.clear();
    this.indices.byTimeRange.clear();
    this.indices.byWeight.clear();

    // 重新初始化类型索引
    Object.values(PerformanceLogAssociationType).forEach(type => {
      if (typeof type === 'string') {
        this.indices.byType.set(
          type as PerformanceLogAssociationType,
          new Set()
        );
      }
    });

    // 重新初始化权重索引
    for (let i = 0; i < 10; i++) {
      const weightKey = `w${i / 10}-${(i + 1) / 10}`;
      this.indices.byWeight.set(weightKey, new Set());
    }

    // 清除本地存储
    if (
      this.options.enablePersistence &&
      this.options.persistKey &&
      typeof localStorage !== 'undefined'
    ) {
      localStorage.removeItem(this.options.persistKey);
    }
  }

  /**
   * 为关联创建索引
   * @param association 关联对象
   */
  private indexAssociation(association: IPerformanceLogAssociation): void {
    const { id, logId, performanceMetricId, type, timestamp, weight } =
      association;

    // 确保有ID
    if (!id) return;

    // 日志ID索引
    if (!this.indices.byLogId.has(logId)) {
      this.indices.byLogId.set(logId, new Set());
    }
    this.indices.byLogId.get(logId)!.add(id);

    // 性能指标ID索引
    if (!this.indices.byMetricId.has(performanceMetricId)) {
      this.indices.byMetricId.set(performanceMetricId, new Set());
    }
    this.indices.byMetricId.get(performanceMetricId)!.add(id);

    // 类型索引
    this.indices.byType.get(type)!.add(id);

    // 时间索引
    const timeKey = this.getTimeKey(timestamp);
    if (!this.indices.byTimeRange.has(timeKey)) {
      this.indices.byTimeRange.set(timeKey, new Set());
    }
    this.indices.byTimeRange.get(timeKey)!.add(id);

    // 权重索引
    const weightBucket = Math.floor(weight * 10);
    const weightKey = `w${weightBucket / 10}-${(weightBucket + 1) / 10}`;
    this.indices.byWeight.get(weightKey)!.add(id);
  }

  /**
   * 从索引中移除关联
   * @param association 关联对象
   */
  private removeAssociationIndices(
    association: IPerformanceLogAssociation
  ): void {
    const { id, logId, performanceMetricId, type, timestamp, weight } =
      association;

    if (!id) return;

    // 从日志ID索引中移除
    this.indices.byLogId.get(logId)?.delete(id);

    // 从性能指标ID索引中移除
    this.indices.byMetricId.get(performanceMetricId)?.delete(id);

    // 从类型索引中移除
    this.indices.byType.get(type)?.delete(id);

    // 从时间索引中移除
    const timeKey = this.getTimeKey(timestamp);
    this.indices.byTimeRange.get(timeKey)?.delete(id);

    // 从权重索引中移除
    const weightBucket = Math.floor(weight * 10);
    const weightKey = `w${weightBucket / 10}-${(weightBucket + 1) / 10}`;
    this.indices.byWeight.get(weightKey)?.delete(id);
  }

  /**
   * 获取时间索引键
   * @param timestamp 时间戳
   * @returns 时间索引键
   */
  private getTimeKey(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
  }

  /**
   * 获取时间范围内的所有时间块键
   * @param startTime 开始时间
   * @param endTime 结束时间
   * @returns 时间块键数组
   */
  private getTimeRangeKeys(startTime: number, endTime: number): string[] {
    const keys = new Set<string>();
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    // 按小时生成时间块键
    const current = new Date(startDate);
    while (current <= endDate) {
      keys.add(this.getTimeKey(current.getTime()));
      current.setHours(current.getHours() + 1);
    }

    return Array.from(keys);
  }

  /**
   * 根据ID集合获取关联对象
   * @param ids ID集合
   * @returns 关联对象数组
   */
  private getAssociationsByIds(ids: Set<string>): IPerformanceLogAssociation[] {
    const result: IPerformanceLogAssociation[] = [];

    ids.forEach(id => {
      const association = this.associations.get(id);
      if (association) {
        // 更新LRU缓存
        this.updateLRUCache(id);
        result.push(association);
      }
    });

    return result;
  }

  /**
   * 更新LRU缓存
   * @param id 关联ID
   */
  private updateLRUCache(id: string): void {
    // 更新或添加到LRU缓存
    const existingIndex = this.lruCache.findIndex(item => item.id === id);

    if (existingIndex !== -1) {
      // 已存在，移除旧条目
      this.lruCache.splice(existingIndex, 1);
    }

    // 添加到缓存头部
    this.lruCache.unshift({
      id,
      lastAccess: Date.now(),
    });

    // 保持缓存大小不超过限制
    if (this.lruCache.length > this.options.lruCacheSize) {
      this.lruCache.pop();
    }
  }

  /**
   * 检查容量并清理过期数据
   */
  private checkCapacityAndCleanup(): void {
    if (this.associations.size >= this.options.cleanupThreshold) {
      // 需要清理
      const toKeep = Math.floor(this.options.maxAssociations * 0.8);
      const toRemove = this.associations.size - toKeep;

      if (toRemove <= 0) return;

      // 获取访问频率最低的项
      const lruIds = new Set(this.lruCache.map(item => item.id));
      const candidates: string[] = [];

      // 优先移除非LRU缓存中的项
      for (const id of this.associations.keys()) {
        if (!lruIds.has(id)) {
          candidates.push(id);
          if (candidates.length >= toRemove) break;
        }
      }

      // 如果还需要移除更多，按照LRU顺序移除
      if (candidates.length < toRemove) {
        const remainingToRemove = toRemove - candidates.length;
        // 从LRU缓存尾部开始移除
        candidates.push(
          ...this.lruCache.slice(-remainingToRemove).map(item => item.id)
        );
      }

      // 执行删除
      for (const id of candidates) {
        this.delete(id);
      }
    }
  }

  /**
   * 持久化关联到本地存储
   */
  private persistAssociations(): void {
    if (
      !this.options.enablePersistence ||
      !this.options.persistKey ||
      typeof localStorage === 'undefined'
    ) {
      return;
    }

    try {
      const data = [...this.associations.values()];
      localStorage.setItem(this.options.persistKey, JSON.stringify(data));
    } catch (error) {
      console.error('[AssociationStorage] 无法持久化关联:', error);
    }
  }

  /**
   * 从本地存储恢复关联
   */
  private restoreAssociations(): void {
    if (
      !this.options.enablePersistence ||
      !this.options.persistKey ||
      typeof localStorage === 'undefined'
    ) {
      return;
    }

    try {
      const data = localStorage.getItem(this.options.persistKey);
      if (!data) return;

      const associations = JSON.parse(data) as IPerformanceLogAssociation[];
      for (const association of associations) {
        this.add(association);
      }
    } catch (error) {
      console.error('[AssociationStorage] 无法恢复关联:', error);
    }
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    totalCount: number;
    byType: Record<string, number>;
    byWeightRange: Record<string, number>;
    recentAccess: number;
  } {
    const byType: Record<string, number> = {};
    const byWeightRange: Record<string, number> = {};

    // 统计类型分布
    for (const [type, ids] of this.indices.byType.entries()) {
      byType[type] = ids.size;
    }

    // 统计权重分布
    for (const [weightKey, ids] of this.indices.byWeight.entries()) {
      byWeightRange[weightKey] = ids.size;
    }

    // 计算最近访问时间
    let recentAccess = 0;
    if (this.lruCache.length > 0) {
      recentAccess = this.lruCache[0].lastAccess;
    }

    return {
      totalCount: this.associations.size,
      byType,
      byWeightRange,
      recentAccess,
    };
  }

  /**
   * 销毁存储
   */
  public destroy(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }

    // 最后一次持久化
    if (this.options.enablePersistence) {
      this.persistAssociations();
    }

    this.associations.clear();
    this.lruCache = [];

    // 清除所有索引
    Object.values(this.indices).forEach(indexMap => {
      indexMap.clear();
    });
  }
}

export default AssociationStorage;
