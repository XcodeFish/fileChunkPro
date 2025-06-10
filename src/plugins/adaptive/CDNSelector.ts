import {
  ICDNSelector,
  ICDNNode,
  INetworkQualityResult,
  NetworkQualityLevel,
  CDNSelectorOptions,
} from '../../types/AdaptiveUploadTypes';

/**
 * CDN选择器
 * 根据网络状况选择最优CDN节点
 */
export class CDNSelector implements ICDNSelector {
  private cdnNodes: ICDNNode[] = [];
  private options: Required<CDNSelectorOptions>;
  private nodeStatistics: Map<
    string,
    {
      successCount: number;
      failureCount: number;
      totalLatency: number;
      samplesCount: number;
      lastUpdated: number;
      lastSuccess: number;
    }
  > = new Map();
  private refreshTimer: any = null;
  private userRegion: string | null = null;

  /**
   * CDN选择器构造函数
   * @param options 配置选项
   */
  constructor(options?: CDNSelectorOptions) {
    // 默认配置
    this.options = {
      defaultNodes: [],
      testTimeout: 5000,
      geoLocationBased: true,
      refreshInterval: 600000, // 10分钟刷新一次
      selectionStrategy: 'balanced',
      ...options,
    };

    // 初始化CDN节点
    if (this.options.defaultNodes && this.options.defaultNodes.length > 0) {
      this.cdnNodes = [...this.options.defaultNodes];

      // 初始化节点统计
      this.cdnNodes.forEach(node => {
        this.nodeStatistics.set(node.id, {
          successCount: 0,
          failureCount: 0,
          totalLatency: 0,
          samplesCount: 0,
          lastUpdated: Date.now(),
          lastSuccess: 0,
        });
      });
    }

    // 如果启用地理位置功能，尝试获取用户地区
    if (this.options.geoLocationBased) {
      this.detectUserRegion();
    }

    // 启动定时刷新
    this.startPeriodicRefresh();
  }

  /**
   * 获取可用CDN节点列表
   * @returns CDN节点列表
   */
  public async getAvailableCDNs(): Promise<ICDNNode[]> {
    // 如果节点为空，返回空数组
    if (this.cdnNodes.length === 0) {
      return [];
    }

    // 测试节点状态
    await this.testCDNsAvailability();

    // 返回已启用且按权重排序的节点
    return this.cdnNodes
      .filter(node => node.enabled)
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));
  }

  /**
   * 选择最优CDN节点
   * @param networkQuality 网络质量
   * @param fileSize 文件大小(字节)
   * @returns 最优CDN节点
   */
  public async selectOptimalCDN(
    networkQuality: INetworkQualityResult,
    fileSize: number
  ): Promise<ICDNNode> {
    // 获取可用的CDN节点
    const availableCDNs = await this.getAvailableCDNs();

    if (availableCDNs.length === 0) {
      throw new Error('没有可用的CDN节点');
    }

    if (availableCDNs.length === 1) {
      return availableCDNs[0];
    }

    // 根据不同的网络质量和文件大小选择最佳CDN
    switch (networkQuality.qualityLevel) {
      case NetworkQualityLevel.VERY_POOR:
      case NetworkQualityLevel.POOR:
        // 糟糕网络优先选择低延迟节点
        return this.selectCDNForPoorNetwork(availableCDNs);

      case NetworkQualityLevel.MODERATE:
        // 中等网络平衡考虑延迟和可用性
        return this.selectCDNForModerateNetwork(availableCDNs);

      case NetworkQualityLevel.GOOD:
      case NetworkQualityLevel.EXCELLENT:
        // 良好网络优先考虑高可用性节点，对大文件考虑区域
        return this.selectCDNForGoodNetwork(availableCDNs, fileSize);

      default:
        // 默认使用平衡选择策略
        return this.selectCDNWithBalancedStrategy(availableCDNs);
    }
  }

  /**
   * 添加CDN节点
   * @param node CDN节点
   */
  public addCDNNode(node: ICDNNode): void {
    // 检查节点是否已存在
    const existingNodeIndex = this.cdnNodes.findIndex(n => n.id === node.id);

    if (existingNodeIndex >= 0) {
      // 更新现有节点
      this.cdnNodes[existingNodeIndex] = {
        ...this.cdnNodes[existingNodeIndex],
        ...node,
      };
    } else {
      // 添加新节点
      this.cdnNodes.push(node);

      // 初始化节点统计
      this.nodeStatistics.set(node.id, {
        successCount: 0,
        failureCount: 0,
        totalLatency: 0,
        samplesCount: 0,
        lastUpdated: Date.now(),
        lastSuccess: 0,
      });
    }
  }

  /**
   * 禁用CDN节点
   * @param nodeId 节点ID
   */
  public disableCDNNode(nodeId: string): void {
    const nodeIndex = this.cdnNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex !== -1) {
      this.cdnNodes[nodeIndex].enabled = false;
    }
  }

  /**
   * 启用CDN节点
   * @param nodeId 节点ID
   */
  public enableCDNNode(nodeId: string): void {
    const nodeIndex = this.cdnNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex !== -1) {
      this.cdnNodes[nodeIndex].enabled = true;
    }
  }

  /**
   * 更新CDN节点状态
   * @param nodeId 节点ID
   * @param latency 延迟(毫秒)
   * @param availability 可用性(0-1)
   */
  public updateCDNStatus(
    nodeId: string,
    latency: number,
    availability: number
  ): void {
    const nodeIndex = this.cdnNodes.findIndex(node => node.id === nodeId);
    if (nodeIndex === -1) {
      return;
    }

    // 更新节点状态
    this.cdnNodes[nodeIndex].latency = latency;
    this.cdnNodes[nodeIndex].availability = availability;

    // 更新节点权重
    this.updateCDNWeight(nodeIndex);

    // 更新统计信息
    const stats = this.nodeStatistics.get(nodeId);
    if (stats) {
      stats.totalLatency += latency;
      stats.samplesCount++;
      stats.lastUpdated = Date.now();

      if (availability > 0.5) {
        stats.successCount++;
        stats.lastSuccess = Date.now();
      } else {
        stats.failureCount++;
      }
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
   * 测试所有CDN节点的可用性
   * @private
   */
  private async testCDNsAvailability(): Promise<void> {
    const testPromises = this.cdnNodes.map(async node => {
      if (!node.enabled) {
        return;
      }

      try {
        const start = Date.now();
        const response = await fetch(`${node.url}?_=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
          signal: AbortSignal.timeout(this.options.testTimeout),
        });

        const latency = Date.now() - start;
        const availability = response.ok ? 1.0 : 0.0;

        this.updateCDNStatus(node.id, latency, availability);
        return { id: node.id, available: response.ok, latency };
      } catch (error) {
        this.updateCDNStatus(node.id, this.options.testTimeout, 0.0);
        return { id: node.id, available: false };
      }
    });

    await Promise.allSettled(testPromises);
  }

  /**
   * 尝试检测用户地区
   * @private
   */
  private async detectUserRegion(): Promise<void> {
    try {
      // 使用免费的地理位置服务
      const response = await fetch('https://ipapi.co/json/', {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.country_code) {
          this.userRegion = data.country_code.toLowerCase();
        }
      }
    } catch (error) {
      console.warn('无法检测用户地区:', error);
      this.userRegion = null;
    }
  }

  /**
   * 为糟糕网络选择最优CDN节点
   * 优先考虑低延迟节点
   * @param nodes CDN节点列表
   * @returns 最优CDN节点
   * @private
   */
  private selectCDNForPoorNetwork(nodes: ICDNNode[]): ICDNNode {
    // 按延迟排序
    const sortedByLatency = [...nodes].sort((a, b) => {
      const aLatency = a.latency || Number.MAX_SAFE_INTEGER;
      const bLatency = b.latency || Number.MAX_SAFE_INTEGER;
      return aLatency - bLatency;
    });

    // 取延迟最低的前几个节点
    const candidates = sortedByLatency.slice(
      0,
      Math.min(3, sortedByLatency.length)
    );

    // 在候选中选择可用性最高的
    return candidates.sort((a, b) => {
      const aAvailability = a.availability || 0;
      const bAvailability = b.availability || 0;
      return bAvailability - aAvailability;
    })[0];
  }

  /**
   * 为中等网络选择最优CDN节点
   * 平衡考虑延迟和可用性
   * @param nodes CDN节点列表
   * @returns 最优CDN节点
   * @private
   */
  private selectCDNForModerateNetwork(nodes: ICDNNode[]): ICDNNode {
    // 计算综合评分
    const scoredNodes = nodes.map(node => {
      const latencyScore = node.latency
        ? (100 / Math.max(10, node.latency)) * 10 // 延迟越低分数越高
        : 5; // 默认中等分数

      const availabilityScore = (node.availability || 0.5) * 10;

      // 综合得分，平衡考虑延迟和可用性
      const totalScore = latencyScore * 0.5 + availabilityScore * 0.5;

      return {
        ...node,
        score: totalScore,
      };
    });

    // 按综合分数排序
    return scoredNodes.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * 为良好网络选择最优CDN节点
   * 优先考虑高可用性节点，对大文件考虑区域
   * @param nodes CDN节点列表
   * @param fileSize 文件大小(字节)
   * @returns 最优CDN节点
   * @private
   */
  private selectCDNForGoodNetwork(
    nodes: ICDNNode[],
    fileSize: number
  ): ICDNNode {
    // 对于大文件(>10MB)，优先考虑同区域的CDN
    const isLargeFile = fileSize > 10 * 1024 * 1024;

    if (isLargeFile && this.userRegion) {
      // 查找同区域的CDN节点
      const sameRegionNodes = nodes.filter(
        node => node.region.toLowerCase() === this.userRegion
      );

      if (sameRegionNodes.length > 0) {
        // 按可用性排序
        return sameRegionNodes.sort(
          (a, b) => (b.availability || 0) - (a.availability || 0)
        )[0];
      }
    }

    // 如果没有同区域节点或不是大文件，按可用性和权重排序
    return nodes.sort((a, b) => {
      // 先按可用性排序
      const availabilityDiff = (b.availability || 0) - (a.availability || 0);

      // 如果可用性相近(差异<0.1)，再按权重排序
      if (Math.abs(availabilityDiff) < 0.1) {
        return (b.weight || 0) - (a.weight || 0);
      }

      return availabilityDiff;
    })[0];
  }

  /**
   * 使用平衡策略选择CDN节点
   * @param nodes CDN节点列表
   * @returns CDN节点
   * @private
   */
  private selectCDNWithBalancedStrategy(nodes: ICDNNode[]): ICDNNode {
    // 根据所选策略计算得分
    const scoredNodes = nodes.map(node => {
      let score: number;

      switch (this.options.selectionStrategy) {
        case 'latency':
          // 主要考虑延迟
          score = node.latency ? (100 / Math.max(10, node.latency)) * 10 : 5;
          break;

        case 'availability':
          // 主要考虑可用性
          score = (node.availability || 0.5) * 10;
          break;

        case 'balanced':
        default: {
          // 平衡考虑所有因素
          const latencyScore = node.latency
            ? (100 / Math.max(10, node.latency)) * 10
            : 5;
          const availabilityScore = (node.availability || 0.5) * 10;
          const weightScore = (node.weight || 0.5) * 10;

          // 区域匹配加分
          const regionBonus =
            this.userRegion && node.region.toLowerCase() === this.userRegion
              ? 2
              : 0;

          score =
            latencyScore * 0.3 +
            availabilityScore * 0.4 +
            weightScore * 0.2 +
            regionBonus;
          break;
        }
      }

      return {
        ...node,
        score,
      };
    });

    // 按得分排序
    return scoredNodes.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * 更新CDN节点权重
   * @param nodeIndex 节点索引
   * @private
   */
  private updateCDNWeight(nodeIndex: number): void {
    const node = this.cdnNodes[nodeIndex];
    const stats = this.nodeStatistics.get(node.id);

    if (!stats) {
      return;
    }

    // 计算平均延迟
    const avgLatency =
      stats.samplesCount > 0 ? stats.totalLatency / stats.samplesCount : 500; // 默认500ms

    // 计算成功率
    const totalRequests = stats.successCount + stats.failureCount;
    const successRate =
      totalRequests > 0 ? stats.successCount / totalRequests : 0.5; // 默认0.5

    // 计算延迟得分 (0-1)，延迟越低得分越高
    const latencyScore = Math.max(0, Math.min(1, 1000 / (avgLatency + 100)));

    // 计算可用性得分 (0-1)
    const availabilityScore = Math.max(0, Math.min(1, successRate));

    // 计算区域匹配得分 (0-1)
    const regionScore =
      this.userRegion && node.region.toLowerCase() === this.userRegion
        ? 1
        : 0.5;

    // 计算最终权重
    // 权重 = 延迟(30%) + 可用性(50%) + 区域匹配(20%)
    const weight =
      latencyScore * 0.3 + availabilityScore * 0.5 + regionScore * 0.2;

    // 更新节点权重和可用性
    this.cdnNodes[nodeIndex].weight = weight;
    this.cdnNodes[nodeIndex].availability = availabilityScore;

    // 如果可用性太低，自动禁用节点
    if (availabilityScore < 0.2 && totalRequests >= 5) {
      this.cdnNodes[nodeIndex].enabled = false;
    }
  }

  /**
   * 启动定期刷新CDN状态
   * @private
   */
  private startPeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      this.testCDNsAvailability();
    }, this.options.refreshInterval);
  }
}
