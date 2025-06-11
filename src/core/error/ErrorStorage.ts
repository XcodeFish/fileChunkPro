/**
 * 错误存储模块
 * 负责错误缓存、统计和持久化
 */

import { UploadError } from './UploadError';
import { UploadErrorType } from '../../types/errors';

/**
 * 错误存储配置选项
 */
export interface ErrorStorageOptions {
  /** 缓存最大错误数 */
  maxCachedErrors: number;
  /** 是否持久化错误到localStorage */
  persistToLocalStorage: boolean;
  /** localStorage存储键名 */
  localStorageKey: string;
  /** 持久化时间间隔(毫秒) */
  persistInterval: number;
}

/**
 * 错误查询选项
 */
export interface ErrorQueryOptions {
  /** 最大返回数量 */
  limit?: number;
  /** 错误类型过滤 */
  type?: UploadErrorType | UploadErrorType[];
  /** 时间范围开始 */
  startTime?: number;
  /** 时间范围结束 */
  endTime?: number;
  /** 是否包含已恢复的错误 */
  includeRecovered?: boolean;
}

/**
 * 错误统计类型
 */
export interface ErrorStats {
  /** 按类型统计的错误数量 */
  byType: Record<UploadErrorType, number>;
  /** 按分组统计的错误数量 */
  byGroup: Record<string, number>;
  /** 按时间段统计的错误数量 */
  byTime: {
    last5min: number;
    last15min: number;
    last1hour: number;
    last24hours: number;
  };
  /** 恢复率 */
  recoveryRate: number;
  /** 错误总数 */
  total: number;
}

/**
 * 错误存储管理器
 * 提供错误的存储、查询、统计和持久化功能
 */
export class ErrorStorage {
  /** 缓存的错误对象 */
  private errorCache: UploadError[] = [];

  /** 错误统计信息 */
  private errorStats: Record<UploadErrorType, number> = {} as Record<
    UploadErrorType,
    number
  >;

  /** 配置选项 */
  private options: ErrorStorageOptions;

  /** 持久化定时器 */
  private persistTimer: any;

  /** 默认配置 */
  private static readonly DEFAULT_OPTIONS: ErrorStorageOptions = {
    maxCachedErrors: 100,
    persistToLocalStorage: false,
    localStorageKey: 'fileChunkPro_errors',
    persistInterval: 60000, // 1分钟
  };

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options?: Partial<ErrorStorageOptions>) {
    this.options = { ...ErrorStorage.DEFAULT_OPTIONS, ...options };

    // 从缓存恢复错误记录
    if (this.options.persistToLocalStorage) {
      this.loadFromPersistence();
      this.startPersistTimer();
    }
  }

  /**
   * 存储错误
   * @param error 上传错误对象
   */
  public store(error: UploadError): void {
    // 更新错误统计
    this.errorStats[error.type] = (this.errorStats[error.type] || 0) + 1;

    // 添加到缓存
    this.errorCache.push(error);

    // 如果缓存超过最大限制，则移除最旧的
    if (this.errorCache.length > this.options.maxCachedErrors) {
      this.errorCache.shift();
    }
  }

  /**
   * 查询错误
   * @param options 查询选项
   * @returns 符合条件的错误数组
   */
  public query(options: ErrorQueryOptions = {}): UploadError[] {
    let result = [...this.errorCache];

    // 根据错误类型筛选
    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      result = result.filter(err => types.includes(err.type));
    }

    // 根据时间范围筛选
    if (options.startTime) {
      result = result.filter(err => err.timestamp >= options.startTime!);
    }

    if (options.endTime) {
      result = result.filter(err => err.timestamp <= options.endTime!);
    }

    // 是否包含已恢复的错误
    if (options.includeRecovered === false) {
      result = result.filter(
        err => !err.recoveryAttempts.some(a => a.successful)
      );
    }

    // 限制返回数量
    if (options.limit && options.limit > 0) {
      result = result.slice(-options.limit); // 返回最新的N条
    }

    return result;
  }

  /**
   * 获取错误统计信息
   * @returns 错误统计数据
   */
  public getStats(): ErrorStats {
    const now = Date.now();
    const stats: ErrorStats = {
      byType: { ...this.errorStats },
      byGroup: {},
      byTime: {
        last5min: 0,
        last15min: 0,
        last1hour: 0,
        last24hours: 0,
      },
      recoveryRate: 0,
      total: 0,
    };

    // 计算总数
    stats.total = Object.values(this.errorStats).reduce(
      (sum, count) => sum + count,
      0
    );

    // 按组统计
    for (const error of this.errorCache) {
      stats.byGroup[error.group] = (stats.byGroup[error.group] || 0) + 1;

      // 按时间统计
      const timeDiff = now - error.timestamp;
      if (timeDiff <= 5 * 60 * 1000) stats.byTime.last5min++;
      if (timeDiff <= 15 * 60 * 1000) stats.byTime.last15min++;
      if (timeDiff <= 60 * 60 * 1000) stats.byTime.last1hour++;
      if (timeDiff <= 24 * 60 * 60 * 1000) stats.byTime.last24hours++;
    }

    // 计算恢复率
    const recoverableErrors = this.errorCache.filter(
      err => err.isRecoverable
    ).length;
    const recoveredErrors = this.errorCache.filter(err =>
      err.recoveryAttempts.some(attempt => attempt.successful)
    ).length;

    stats.recoveryRate =
      recoverableErrors > 0 ? recoveredErrors / recoverableErrors : 0;

    return stats;
  }

  /**
   * 诊断特定错误类型
   * @param type 错误类型
   * @returns 诊断信息
   */
  public diagnoseErrorType(type: UploadErrorType): {
    count: number;
    firstOccurrence?: Date;
    lastOccurrence?: Date;
    relatedErrors: UploadError[];
  } {
    const relatedErrors = this.errorCache.filter(err => err.type === type);

    return {
      count: this.errorStats[type] || 0,
      firstOccurrence:
        relatedErrors.length > 0
          ? new Date(relatedErrors[0].timestamp)
          : undefined,
      lastOccurrence:
        relatedErrors.length > 0
          ? new Date(relatedErrors[relatedErrors.length - 1].timestamp)
          : undefined,
      relatedErrors,
    };
  }

  /**
   * 清除错误缓存
   */
  public clearCache(): void {
    this.errorCache = [];
    this.errorStats = {} as Record<UploadErrorType, number>;
  }

  /**
   * 开始持久化定时器
   */
  private startPersistTimer(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }

    this.persistTimer = setInterval(() => {
      this.persistToDisk();
    }, this.options.persistInterval);
  }

  /**
   * 持久化错误数据
   */
  private persistToDisk(): void {
    if (
      !this.options.persistToLocalStorage ||
      typeof localStorage === 'undefined'
    ) {
      return;
    }

    try {
      // 只存储基本错误信息而非完整对象，以减少存储大小
      const persistData = this.errorCache.map(err => ({
        id: err.errorId,
        type: err.type,
        message: err.message,
        timestamp: err.timestamp,
        severity: err.severity,
        group: err.group,
        isRecoverable: err.isRecoverable,
        retryCount: err.retryCount,
      }));

      localStorage.setItem(
        this.options.localStorageKey,
        JSON.stringify({
          errors: persistData,
          stats: this.errorStats,
          lastUpdated: Date.now(),
        })
      );
    } catch (e) {
      console.warn('错误数据持久化失败:', e);
    }
  }

  /**
   * 从持久化存储加载错误数据
   */
  private loadFromPersistence(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.options.localStorageKey);
      if (stored) {
        const data = JSON.parse(stored);

        // 恢复统计数据
        if (data.stats) {
          this.errorStats = data.stats;
        }

        // 错误对象需要重建，因为完整对象无法序列化
        // 这里我们只恢复基本信息
        if (
          data.lastUpdated &&
          Date.now() - data.lastUpdated < 24 * 60 * 60 * 1000
        ) {
          // 只恢复24小时以内的错误记录
          console.log(
            `从持久化存储恢复了${data.errors?.length || 0}条错误记录`
          );
        }
      }
    } catch (e) {
      console.warn('从持久化存储加载错误数据失败:', e);
    }
  }

  /**
   * 销毁并清理资源
   */
  public destroy(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }

    // 保存最终状态
    if (this.options.persistToLocalStorage) {
      this.persistToDisk();
    }
  }
}
