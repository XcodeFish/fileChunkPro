/**
 * 自适应上传策略类型定义
 */

/**
 * 网络质量等级
 */
export enum NetworkQualityLevel {
  /** 极差网络 */
  VERY_POOR = 'very_poor',
  /** 较差网络 */
  POOR = 'poor',
  /** 一般网络 */
  MODERATE = 'moderate',
  /** 良好网络 */
  GOOD = 'good',
  /** 极好网络 */
  EXCELLENT = 'excellent',
}

/**
 * 网络质量检测结果
 */
export interface INetworkQualityResult {
  /** 网络质量等级 */
  qualityLevel: NetworkQualityLevel;
  /** 下载速度 (KB/s) */
  downloadSpeed: number;
  /** 上传速度 (KB/s) */
  uploadSpeed: number;
  /** 延迟 (ms) */
  latency: number;
  /** 丢包率 (0-1) */
  packetLoss?: number;
  /** 带宽 (KB/s) */
  bandwidth?: number;
  /** 测试时间戳 */
  timestamp: number;
  /** 是否网络不稳定 */
  isUnstable: boolean;
}

/**
 * 网络质量检测器接口
 */
export interface INetworkDetector {
  /** 检测网络质量 */
  detectNetworkQuality(): Promise<INetworkQualityResult>;
  /** 开始持续监控网络 */
  startMonitoring(interval: number): void;
  /** 停止监控 */
  stopMonitoring(): void;
  /** 获取最近的网络质量结果 */
  getLatestResult(): INetworkQualityResult | null;
  /** 设置网络变化回调 */
  onNetworkChange(callback: (result: INetworkQualityResult) => void): void;
}

/**
 * 上传参数配置
 */
export interface IUploadParameters {
  /** 分片大小 (bytes) */
  chunkSize: number;
  /** 并发上传数 */
  concurrency: number;
  /** 重试次数 */
  retryCount: number;
  /** 重试延迟 (ms) */
  retryDelay: number;
  /** 超时时间 (ms) */
  timeout: number;
  /** 预检查开关 */
  precheckEnabled: boolean;
  /** 使用WebWorker */
  useWorker: boolean;
  /** 其他自定义参数 */
  [key: string]: any;
}

/**
 * 参数调整器接口
 */
export interface IParameterAdjuster {
  /** 根据网络质量调整上传参数 */
  adjustParameters(
    networkQuality: INetworkQualityResult,
    currentParameters: IUploadParameters
  ): IUploadParameters;
  /** 获取特定网络质量的推荐参数 */
  getRecommendedParameters(networkQuality: INetworkQualityResult): IUploadParameters;
  /** 应用最小安全参数（降级策略） */
  getMinimumSafeParameters(): IUploadParameters;
}

/**
 * 上传路径信息
 */
export interface IUploadPath {
  /** 路径URL */
  url: string;
  /** 路径权重 (0-1) */
  weight: number;
  /** 路径延迟 (ms) */
  latency?: number;
  /** 区域 */
  region?: string;
  /** 可用性得分 (0-1) */
  availabilityScore?: number;
  /** 路径标签 */
  tags?: string[];
}

/**
 * 路径优化器接口
 */
export interface IPathOptimizer {
  /** 获取可用路径列表 */
  getAvailablePaths(): Promise<IUploadPath[]>;
  /** 选择最优路径 */
  selectOptimalPath(
    networkQuality: INetworkQualityResult,
    availablePaths: IUploadPath[]
  ): IUploadPath;
  /** 添加新路径 */
  addPath(path: IUploadPath): void;
  /** 更新路径状态 */
  updatePathStatus(url: string, isAvailable: boolean, latency?: number): void;
}

/**
 * CDN节点信息
 */
export interface ICDNNode {
  /** 节点ID */
  id: string;
  /** 节点URL */
  url: string;
  /** 区域 */
  region: string;
  /** 提供商 */
  provider: string;
  /** 延迟 (ms) */
  latency?: number;
  /** 权重 (0-1) */
  weight?: number;
  /** 可用性 (0-1) */
  availability?: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * CDN选择器接口
 */
export interface ICDNSelector {
  /** 获取可用CDN节点列表 */
  getAvailableCDNs(): Promise<ICDNNode[]>;
  /** 选择最优CDN节点 */
  selectOptimalCDN(
    networkQuality: INetworkQualityResult,
    fileSize: number
  ): Promise<ICDNNode>;
  /** 添加CDN节点 */
  addCDNNode(node: ICDNNode): void;
  /** 禁用CDN节点 */
  disableCDNNode(nodeId: string): void;
  /** 启用CDN节点 */
  enableCDNNode(nodeId: string): void;
  /** 更新CDN节点状态 */
  updateCDNStatus(nodeId: string, latency: number, availability: number): void;
}

/**
 * 自适应上传策略配置
 */
export interface IAdaptiveUploadConfig {
  /** 启用网络质量检测 */
  enableNetworkDetection: boolean;
  /** 网络监控间隔 (ms) */
  networkMonitoringInterval: number;
  /** 启用自适应参数调整 */
  enableParameterAdjustment: boolean;
  /** 启用路径优化 */
  enablePathOptimization: boolean;
  /** 启用CDN选择 */
  enableCDNSelection: boolean;
  /** 初始上传参数 */
  initialParameters: Partial<IUploadParameters>;
  /** 自定义路径列表 */
  customPaths?: IUploadPath[];
  /** 自定义CDN节点列表 */
  customCDNNodes?: ICDNNode[];
  /** 最小分片大小 (bytes) */
  minChunkSize?: number;
  /** 最大分片大小 (bytes) */
  maxChunkSize?: number;
  /** 最小并发数 */
  minConcurrency?: number;
  /** 最大并发数 */
  maxConcurrency?: number;
  /** 是否在文件级别应用策略 */
  perFileStrategy?: boolean;
  /** 调试模式 */
  debug?: boolean;
}

/**
 * 自适应策略事件类型
 */
export enum AdaptiveStrategyEventType {
  /** 网络质量变化 */
  NETWORK_QUALITY_CHANGE = 'network_quality_change',
  /** 参数调整 */
  PARAMETERS_ADJUSTED = 'parameters_adjusted',
  /** 路径优化 */
  PATH_OPTIMIZED = 'path_optimized',
  /** CDN节点选择 */
  CDN_SELECTED = 'cdn_selected',
  /** 策略应用 */
  STRATEGY_APPLIED = 'strategy_applied',
  /** 策略错误 */
  STRATEGY_ERROR = 'strategy_error',
}

/**
 * 自适应策略事件数据
 */
export interface IAdaptiveStrategyEvent {
  /** 事件类型 */
  type: AdaptiveStrategyEventType;
  /** 事件数据 */
  data: any;
  /** 时间戳 */
  timestamp: number;
}

// 导出类型
export type NetworkDetectorOptions = {
  /** 测速URL */
  speedTestUrl?: string;
  /** 测试数据大小 (bytes) */
  testDataSize?: number;
  /** 延迟测试URL */
  pingUrl?: string;
  /** 采样次数 */
  sampleCount?: number;
  /** 超时时间 (ms) */
  timeout?: number;
  /** 是否自动启动监控 */
  autoStart?: boolean;
  /** 监控间隔 (ms) */
  monitoringInterval?: number;
};

export type ParameterAdjusterOptions = {
  /** 最小分片大小 (bytes) */
  minChunkSize: number;
  /** 最大分片大小 (bytes) */
  maxChunkSize: number;
  /** 最小并发数 */
  minConcurrency: number;
  /** 最大并发数 */
  maxConcurrency: number;
  /** 预设参数映射 */
  presetParameters?: Record<NetworkQualityLevel, Partial<IUploadParameters>>;
  /** 是否启用自适应学习 */
  enableAdaptiveLearning?: boolean;
};

export type PathOptimizerOptions = {
  /** 默认路径 */
  defaultPaths?: IUploadPath[];
  /** 路径测试超时 (ms) */
  pathTestTimeout?: number;
  /** 路径刷新间隔 (ms) */
  pathRefreshInterval?: number;
  /** 最大路径数 */
  maxPathsToKeep?: number;
};

export type CDNSelectorOptions = {
  /** 默认CDN节点 */
  defaultNodes?: ICDNNode[];
  /** CDN测试超时 (ms) */
  testTimeout?: number;
  /** 基于地理位置选择 */
  geoLocationBased?: boolean;
  /** CDN信息刷新间隔 (ms) */
  refreshInterval?: number;
  /** CDN选择策略 */
  selectionStrategy?: 'latency' | 'availability' | 'balanced';
}; 