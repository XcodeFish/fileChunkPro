import {
  IPathOptimizer,
  INetworkQualityResult,
  IUploadPath,
  NetworkQualityLevel,
  PathOptimizerOptions,
} from '../../types/AdaptiveUploadTypes';

/**
 * 路径优化器
 * 负责选择最优上传路径
 */
export class PathOptimizer implements IPathOptimizer {
  private availablePaths: IUploadPath[] = [];
  private options: Required<PathOptimizerOptions>;
  private pathStatistics: Map<
    string,
    {
      successes: number;
      failures: number;
      totalLatency: number;
      measurements: number;
      lastUpdated: number;
    }
  > = new Map();
  private refreshTimer: any = null;

  /**
   * 路径优化器构造函数
   * @param options 配置选项
   */
  constructor(options?: PathOptimizerOptions) {
    // 默认配置
    this.options = {
      defaultPaths: [],
      pathTestTimeout: 5000,
      pathRefreshInterval: 300000, // 5分钟刷新一次路径状态
      maxPathsToKeep: 10,
      ...options,
    };

    // 初始化路径
    if (this.options.defaultPaths && this.options.defaultPaths.length > 0) {
      this.availablePaths = [...this.options.defaultPaths];

      // 初始化路径统计
      this.availablePaths.forEach(path => {
        this.pathStatistics.set(path.url, {
          successes: 0,
          failures: 0,
          totalLatency: 0,
          measurements: 0,
          lastUpdated: Date.now(),
        });
      });
    }

    // 启动定时刷新
    this.startPeriodicRefresh();
  }

  /**
   * 获取可用路径列表
   * @returns 可用路径列表
   */
  public async getAvailablePaths(): Promise<IUploadPath[]> {
    // 如果路径为空，返回空数组
    if (this.availablePaths.length === 0) {
      return [];
    }

    // 测试路径可用性
    await this.testPathsAvailability();

    // 返回权重排序后的路径
    return [...this.availablePaths].sort((a, b) => b.weight - a.weight);
  }

  /**
   * 选择最优路径
   * @param networkQuality 网络质量
   * @param availablePaths 可用路径列表
   * @returns 最优路径
   */
  public selectOptimalPath(
    networkQuality: INetworkQualityResult,
    availablePaths: IUploadPath[]
  ): IUploadPath {
    if (availablePaths.length === 0) {
      throw new Error('没有可用的上传路径');
    }

    if (availablePaths.length === 1) {
      return availablePaths[0];
    }

    // 根据网络质量进行路径选择
    switch (networkQuality.qualityLevel) {
      case NetworkQualityLevel.VERY_POOR:
      case NetworkQualityLevel.POOR:
        // 糟糕网络优先选择低延迟路径
        return this.selectPathForPoorNetwork(availablePaths);

      case NetworkQualityLevel.MODERATE:
        // 一般网络平衡考虑延迟和权重
        return this.selectPathForModerateNetwork(availablePaths);

      case NetworkQualityLevel.GOOD:
      case NetworkQualityLevel.EXCELLENT:
        // 良好网络优先考虑权重（通常代表吞吐量）
        return this.selectPathForGoodNetwork(availablePaths, networkQuality);

      default:
        // 默认使用权重最高的路径
        return availablePaths[0];
    }
  }

  /**
   * 添加新路径
   * @param path 路径信息
   */
  public addPath(path: IUploadPath): void {
    // 检查路径是否已存在
    const existingPathIndex = this.availablePaths.findIndex(
      p => p.url === path.url
    );

    if (existingPathIndex >= 0) {
      // 更新现有路径
      this.availablePaths[existingPathIndex] = {
        ...this.availablePaths[existingPathIndex],
        ...path,
      };
    } else {
      // 添加新路径
      this.availablePaths.push(path);

      // 初始化路径统计
      this.pathStatistics.set(path.url, {
        successes: 0,
        failures: 0,
        totalLatency: 0,
        measurements: 0,
        lastUpdated: Date.now(),
      });

      // 如果路径数量超过限制，删除权重最低的路径
      if (this.availablePaths.length > this.options.maxPathsToKeep) {
        this.prunePathsByWeight();
      }
    }
  }

  /**
   * 更新路径状态
   * @param url 路径URL
   * @param isAvailable 是否可用
   * @param latency 延迟(毫秒)
   */
  public updatePathStatus(
    url: string,
    isAvailable: boolean,
    latency?: number
  ): void {
    // 查找路径
    const pathIndex = this.availablePaths.findIndex(p => p.url === url);
    if (pathIndex === -1) {
      return;
    }

    // 获取路径统计
    const stats = this.pathStatistics.get(url);
    if (!stats) {
      return;
    }

    // 更新统计数据
    if (isAvailable) {
      stats.successes++;
      if (latency !== undefined) {
        stats.totalLatency += latency;
        stats.measurements++;

        // 更新路径延迟
        this.availablePaths[pathIndex].latency = latency;
      }
    } else {
      stats.failures++;
    }

    stats.lastUpdated = Date.now();

    // 更新路径可用性得分
    if (stats.successes + stats.failures > 0) {
      const successRate = stats.successes / (stats.successes + stats.failures);
      const availabilityScore = Math.max(0, Math.min(1, successRate));
      this.availablePaths[pathIndex].availabilityScore = availabilityScore;

      // 根据可用性和延迟更新权重
      this.updatePathWeight(pathIndex);
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * 测试所有路径的可用性
   * @private
   */
  private async testPathsAvailability(): Promise<void> {
    const testPromises = this.availablePaths.map(async path => {
      try {
        const start = Date.now();
        const response = await fetch(`${path.url}?_=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(this.options.pathTestTimeout),
        });

        const latency = Date.now() - start;
        const isAvailable = response.ok;

        this.updatePathStatus(path.url, isAvailable, latency);
        return { url: path.url, isAvailable, latency };
      } catch (error) {
        this.updatePathStatus(path.url, false);
        return { url: path.url, isAvailable: false };
      }
    });

    await Promise.allSettled(testPromises);
  }

  /**
   * 为糟糕网络选择最优路径
   * 优先考虑低延迟路径
   * @param paths 路径列表
   * @returns 最优路径
   * @private
   */
  private selectPathForPoorNetwork(paths: IUploadPath[]): IUploadPath {
    // 对路径按延迟排序
    const sortedByLatency = [...paths].sort((a, b) => {
      // 如果没有延迟数据，则根据权重排序
      if (!a.latency || !b.latency) {
        return (b.availabilityScore || 0) - (a.availabilityScore || 0);
      }
      return a.latency - b.latency;
    });

    // 取延迟最低的几个路径
    const candidates = sortedByLatency.slice(
      0,
      Math.min(3, sortedByLatency.length)
    );

    // 在候选中选择可用性最高的
    return candidates.sort(
      (a, b) => (b.availabilityScore || 0) - (a.availabilityScore || 0)
    )[0];
  }

  /**
   * 为一般网络选择最优路径
   * 平衡考虑延迟和权重
   * @param paths 路径列表
   * @returns 最优路径
   * @private
   */
  private selectPathForModerateNetwork(paths: IUploadPath[]): IUploadPath {
    // 计算综合得分 (延迟和权重的平衡)
    const scoredPaths = paths.map(path => {
      const latencyScore = path.latency
        ? 100 / Math.max(1, path.latency) // 延迟越低分数越高
        : 0;

      const weightScore = path.weight * 10; // 权重得分
      const availabilityScore = (path.availabilityScore || 0.5) * 10; // 可用性得分

      // 综合得分
      const totalScore =
        latencyScore * 0.4 + weightScore * 0.3 + availabilityScore * 0.3;

      return {
        ...path,
        score: totalScore,
      };
    });

    // 按综合得分排序
    return scoredPaths.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * 为良好网络选择最优路径
   * 优先考虑高权重路径
   * @param paths 路径列表
   * @param networkQuality 网络质量
   * @returns 最优路径
   * @private
   */
  private selectPathForGoodNetwork(
    paths: IUploadPath[],
    networkQuality: INetworkQualityResult
  ): IUploadPath {
    // 筛选高可用性路径
    const highAvailabilityPaths = paths.filter(
      path => !path.availabilityScore || path.availabilityScore > 0.8
    );

    const pathsToConsider =
      highAvailabilityPaths.length > 0 ? highAvailabilityPaths : paths;

    // 如果是极好网络，考虑使用带有特定区域或标签的路径
    if (networkQuality.qualityLevel === NetworkQualityLevel.EXCELLENT) {
      // 查找带有CDN标签的路径
      const cdnPaths = pathsToConsider.filter(
        path => path.tags && path.tags.includes('cdn')
      );

      if (cdnPaths.length > 0) {
        // 按权重排序
        return cdnPaths.sort((a, b) => b.weight - a.weight)[0];
      }
    }

    // 按权重排序
    return pathsToConsider.sort((a, b) => b.weight - a.weight)[0];
  }

  /**
   * 更新路径权重
   * @param pathIndex 路径索引
   * @private
   */
  private updatePathWeight(pathIndex: number): void {
    const path = this.availablePaths[pathIndex];
    const stats = this.pathStatistics.get(path.url);

    if (!stats) {
      return;
    }

    // 计算可用性得分 (0-1)
    const availabilityScore = path.availabilityScore || 0.5;

    // 计算延迟得分 (0-1)，延迟越低分数越高
    const latencyScore = path.latency
      ? Math.max(0, Math.min(1, 1000 / (path.latency + 100)))
      : 0.5;

    // 计算新权重
    // 权重 = 可用性得分(60%) + 延迟得分(40%)
    const newWeight = availabilityScore * 0.6 + latencyScore * 0.4;

    // 更新路径权重
    this.availablePaths[pathIndex].weight = newWeight;
  }

  /**
   * 删除权重最低的路径
   * @private
   */
  private prunePathsByWeight(): void {
    // 按权重排序
    this.availablePaths.sort((a, b) => b.weight - a.weight);

    // 保留最大数量的路径
    if (this.availablePaths.length > this.options.maxPathsToKeep) {
      const removedPaths = this.availablePaths.splice(
        this.options.maxPathsToKeep,
        this.availablePaths.length - this.options.maxPathsToKeep
      );

      // 清理统计数据
      removedPaths.forEach(path => {
        this.pathStatistics.delete(path.url);
      });
    }
  }

  /**
   * 启动定期刷新路径状态
   * @private
   */
  private startPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      this.testPathsAvailability();
    }, this.options.pathRefreshInterval);
  }
}
