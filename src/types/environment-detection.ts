/**
 * environment-detection.ts
 * 统一环境检测系统的类型定义，简化结构提高可维护性
 */

import { Environment, EnvironmentCapabilityScore } from './environment';
import { EnvironmentType } from '../adapters/interfaces';

/**
 * 通用环境特性定义
 */
export interface IEnvironmentFeature {
  /** 特性名称 */
  name: string;
  /** 是否支持 */
  supported: boolean;
  /** 备选方案 */
  fallback?: string; 
  /** 优先级 */
  priority?: 'high' | 'medium' | 'low';
}

/**
 * 环境限制信息
 */
export interface IEnvironmentLimitation {
  /** 限制类型 */
  type: string;
  /** 限制描述 */
  description: string;
  /** 限制值（如大小限制等） */
  value?: number | string;
  /** 解决方案 */
  workaround?: string;
  /** 严重程度 */
  criticalityLevel: 'low' | 'medium' | 'high';
  /** 是否阻断 */
  blocking?: boolean;
}

/**
 * 环境推荐配置
 */
export interface IEnvironmentRecommendation {
  /** 分片大小 */
  chunkSize?: number;
  /** 并发任务数 */
  maxConcurrentTasks?: number;
  /** 是否使用Worker */
  useWorker?: boolean;
  /** 是否使用ServiceWorker */
  useServiceWorker?: boolean;
  /** 存储方式 */
  storageType?: string;
  /** 重试次数 */
  retryCount?: number;
  /** 超时时间 */
  timeout?: number;
  /** 是否启用预检查 */
  precheckEnabled?: boolean;
  /** 是否使用内存优化 */
  useMemoryOptimization?: boolean;
  /** 是否使用哈希校验 */
  useHashVerification?: boolean;
  /** 最大文件大小 */
  maxFileSize?: number;
  /** 自定义配置 */
  [key: string]: any;
}

/**
 * 设备信息
 */
export interface IDeviceInfo {
  /** 内存信息 */
  memory: {
    /** 设备内存 (GB) */
    deviceMemory?: number;
    /** 是否低内存设备 */
    isLowMemoryDevice?: boolean;
    /** 估计可用内存 (MB) */
    estimatedAvailableMemory?: number;
  };
  /** 处理器信息 */
  processor: {
    /** 硬件并发数 */
    hardwareConcurrency?: number;
    /** 是否低功耗设备 */
    isLowPowerDevice?: boolean;
  };
  /** 设备类型 */
  deviceType?: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  /** 是否低端设备 */
  lowEndDevice?: boolean;
  /** 网络信息 */
  network?: {
    /** 连接类型 */
    connectionType?: string;
    /** 下行速度 (Mbps) */
    downlink?: number;
    /** 有效网络类型 */
    effectiveType?: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
    /** RTT (ms) */
    rtt?: number;
  };
}

/**
 * WebView环境信息
 */
export interface IWebViewInfo {
  /** 是否WebView */
  isWebView: boolean;
  /** WebView类型 */
  type?: string;
  /** WebView引擎 */
  engine?: string;
  /** WebView版本 */
  version?: string;
  /** 容器应用名称 */
  containerApp?: string;
  /** 限制列表 */
  limitations?: string[];
}

/**
 * 浏览器信息
 */
export interface IBrowserInfo {
  /** 浏览器名称 */
  name: string;
  /** 浏览器版本 */
  version?: string;
  /** 浏览器引擎 */
  engine?: string;
  /** 引擎版本 */
  engineVersion?: string;
  /** 是否移动浏览器 */
  isMobile?: boolean;
}

/**
 * 操作系统信息
 */
export interface IOSInfo {
  /** 操作系统名称 */
  name: string;
  /** 操作系统版本 */
  version?: string;
  /** 操作系统平台 */
  platform?: string;
}

/**
 * 统一环境检测结果
 */
export interface IEnvironmentDetectionResult {
  /** 环境类型 */
  environment: Environment;
  /** 环境子类型 */
  environmentType: EnvironmentType;
  /** 运行时名称 */
  runtime?: string;
  /** 运行时版本 */
  version?: string;
  /** 操作系统信息 */
  osInfo?: IOSInfo;
  /** 浏览器信息 */
  browser?: IBrowserInfo;
  /** 环境能力 */
  capabilities: Record<string, boolean>;
  /** 环境特性 */
  features: Record<string, boolean>;
  /** 环境特性详情 */
  featureDetails?: IEnvironmentFeature[];
  /** 环境限制 */
  limitations: IEnvironmentLimitation[];
  /** 设备信息 */
  deviceProfile?: IDeviceInfo;
  /** WebView信息 */
  webViewInfo?: IWebViewInfo;
  /** 推荐配置 */
  recommendedSettings: IEnvironmentRecommendation;
  /** 环境容量评分 */
  scores?: EnvironmentCapabilityScore;
}

/**
 * 环境检测器接口
 */
export interface IEnvironmentDetector {
  /**
   * 检测当前环境
   */
  detect(): Promise<IEnvironmentDetectionResult>;
  
  /**
   * 获取环境主类型
   */
  getEnvironment(): Environment;
  
  /**
   * 获取环境子类型
   */
  getEnvironmentType(): EnvironmentType;
  
  /**
   * 检测特定特性是否支持
   */
  supportsFeature(feature: string): boolean;
  
  /**
   * 获取推荐配置
   */
  getRecommendedConfig(): IEnvironmentRecommendation;
  
  /**
   * 获取环境限制
   */
  getLimitations(): IEnvironmentLimitation[];
  
  /**
   * 获取设备配置
   */
  getDeviceProfile(): Promise<IDeviceInfo>;
  
  /**
   * 检查环境是否满足需求
   */
  checkRequirements(requirements: {
    environment?: Environment | Environment[];
    environmentType?: EnvironmentType | EnvironmentType[];
    features?: string[];
    capabilities?: string[];
    minMemory?: number;
    minCpu?: number;
  }): Promise<{
    satisfied: boolean;
    missing: string[];
    recommendations: string[];
  }>;
  
  /**
   * 重置检测缓存
   */
  resetCache(): void;
}

/**
 * 环境检测配置选项
 */
export interface IEnvironmentDetectionOptions {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 是否自动检测WebView */
  detectWebView?: boolean;
  /** 是否检测设备能力 */
  detectDeviceCapabilities?: boolean;
  /** 是否应用环境特性数据库 */
  applyFeatureDatabase?: boolean;
  /** 自动调整设置 */
  autoAdjustSettings?: boolean;
  /** 调试模式 */
  debug?: boolean;
}

/**
 * 环境检测工厂接口
 */
export interface IEnvironmentDetectorFactory {
  /**
   * 创建环境检测器
   */
  createDetector(options?: IEnvironmentDetectionOptions): IEnvironmentDetector;
} 