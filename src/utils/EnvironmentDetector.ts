/**
 * EnvironmentDetector - 环境检测工具
 * 提供详细的环境特性检测、平台能力识别、运行时性能评估和最佳配置推荐
 */

import {
  Environment,
  DeviceCapability,
  NetworkQuality,
  UploadStrategy,
} from '../types';

import EnvUtils from './EnvUtils';
import MemoryManager from './MemoryManager';
import NetworkDetector from './NetworkDetector';

export interface EnvironmentFeatures {
  hasServiceWorker: boolean;
  hasIndexedDB: boolean;
  hasWebWorker: boolean;
  hasSharedArrayBuffer: boolean;
  hasFileSystem: boolean;
  hasFetch: boolean;
  hasWebSockets: boolean;
  hasWebRTC: boolean;
  supportsStreaming: boolean;
  supportsRequestStreaming: boolean;
  supportsResponseStreaming: boolean;
  maxSimultaneousConnections: number;
  maxFileSizeSupport: number;
  hasNativeFileSystem: boolean;
}

export interface PlatformCapabilities {
  environment: Environment;
  environmentName: string;
  features: EnvironmentFeatures;
  capabilities: DeviceCapability;
  browser?: { name: string; version: string };
  platform?: string;
  isSecureContext: boolean;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  networkQuality: NetworkQuality;
  networkType?: string;
  memoryInfo: {
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
    deviceMemory?: number;
  };
  screenInfo: {
    width: number;
    height: number;
    pixelRatio: number;
  };
}

export interface RecommendedConfig {
  chunkSize: number;
  concurrency: number;
  retryCount: number;
  retryDelay: number;
  timeout: number;
  useWorker: boolean;
  useServiceWorker: boolean;
  memoryOptimizationLevel: 'none' | 'low' | 'medium' | 'high';
  uploadStrategies: Record<string, UploadStrategy>;
}

export class EnvironmentDetector {
  private static instance: EnvironmentDetector;
  private _platformCapabilities: PlatformCapabilities | null = null;
  private _features: EnvironmentFeatures | null = null;
  private _networkDetector: NetworkDetector | null = null;
  private _memoryManager: MemoryManager | null = null;

  /**
   * 获取EnvironmentDetector单例
   */
  public static getInstance(): EnvironmentDetector {
    if (!EnvironmentDetector.instance) {
      EnvironmentDetector.instance = new EnvironmentDetector();
    }
    return EnvironmentDetector.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    try {
      this._networkDetector = NetworkDetector.create();
    } catch (err) {
      console.warn('无法初始化网络检测器', err);
    }

    try {
      this._memoryManager = new MemoryManager();
    } catch (err) {
      console.warn('无法初始化内存管理器', err);
    }
  }

  /**
   * 检测环境特性
   */
  public detectFeatures(): EnvironmentFeatures {
    if (this._features) {
      return this._features;
    }

    const env = EnvUtils.detectEnvironment();
    const features: EnvironmentFeatures = {
      hasServiceWorker: false,
      hasIndexedDB: false,
      hasWebWorker: false,
      hasSharedArrayBuffer: false,
      hasFileSystem: false,
      hasFetch: false,
      hasWebSockets: false,
      hasWebRTC: false,
      supportsStreaming: false,
      supportsRequestStreaming: false,
      supportsResponseStreaming: false,
      maxSimultaneousConnections: 6,
      maxFileSizeSupport: -1,
      hasNativeFileSystem: false,
    };

    if (env === Environment.Browser) {
      // 浏览器环境特性检测
      features.hasServiceWorker =
        typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
      features.hasIndexedDB = typeof indexedDB !== 'undefined';
      features.hasWebWorker = typeof Worker !== 'undefined';
      features.hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      features.hasFetch = typeof fetch !== 'undefined';
      features.hasWebSockets = typeof WebSocket !== 'undefined';
      features.hasWebRTC = typeof RTCPeerConnection !== 'undefined';

      // 检测流支持
      if (typeof ReadableStream !== 'undefined') {
        features.supportsStreaming = true;

        // 检测请求流
        if (typeof Request !== 'undefined') {
          try {
            // @ts-ignore: 检测是否支持流请求体
            new Request('', { method: 'POST', body: new ReadableStream() });
            features.supportsRequestStreaming = true;
          } catch (e) {
            features.supportsRequestStreaming = false;
          }
        }

        // 检测响应流
        features.supportsResponseStreaming =
          typeof Response !== 'undefined' &&
          Object.prototype.hasOwnProperty.call(Response.prototype, 'body');
      }

      // 检测File System Access API
      features.hasNativeFileSystem =
        typeof window !== 'undefined' && 'showOpenFilePicker' in window;

      // 估算最大同时连接数
      const browserInfo = EnvUtils.getBrowserInfo();
      if (browserInfo.name === 'chrome') {
        features.maxSimultaneousConnections = 6;
      } else if (browserInfo.name === 'firefox') {
        features.maxSimultaneousConnections = 6;
      } else if (browserInfo.name === 'safari') {
        features.maxSimultaneousConnections = 6;
      } else if (browserInfo.name === 'edge') {
        features.maxSimultaneousConnections = 6;
      } else {
        features.maxSimultaneousConnections = 4;
      }

      // 最大文件大小支持
      features.maxFileSizeSupport = -1; // 浏览器理论上无限制
    } else if (env === Environment.WechatMP) {
      // 微信小程序环境特性检测
      features.hasFileSystem = true;
      features.hasFetch = true;
      features.hasWebSockets = true;
      features.maxSimultaneousConnections = 10; // 微信小程序文档说明
      features.maxFileSizeSupport = 100 * 1024 * 1024; // 100MB
    } else if (env === Environment.AlipayMP) {
      // 支付宝小程序环境特性检测
      features.hasFileSystem = true;
      features.hasFetch = true;
      features.hasWebSockets = true;
      features.maxSimultaneousConnections = 5;
      features.maxFileSizeSupport = 50 * 1024 * 1024; // 50MB
    } else if (env === Environment.BytedanceMP) {
      // 字节跳动小程序环境特性检测
      features.hasFileSystem = true;
      features.hasFetch = true;
      features.hasWebSockets = true;
      features.maxSimultaneousConnections = 5;
      features.maxFileSizeSupport = 50 * 1024 * 1024; // 50MB
    } else if (env === Environment.BaiduMP) {
      // 百度小程序环境特性检测
      features.hasFileSystem = true;
      features.hasFetch = true;
      features.hasWebSockets = true;
      features.maxSimultaneousConnections = 5;
      features.maxFileSizeSupport = 50 * 1024 * 1024; // 50MB
    }

    this._features = features;
    return features;
  }

  /**
   * 获取平台能力
   */
  public detectPlatformCapabilities(): PlatformCapabilities {
    if (this._platformCapabilities) {
      return this._platformCapabilities;
    }

    const env = EnvUtils.detectEnvironment();
    const features = this.detectFeatures();
    const deviceCapabilities = this.detectDeviceCapabilities();
    const networkQuality = this._networkDetector
      ? this._networkDetector.getCurrentQuality()
      : NetworkQuality.UNKNOWN;

    const capabilities: PlatformCapabilities = {
      environment: env,
      environmentName: Environment[env],
      features,
      capabilities: deviceCapabilities,
      isSecureContext:
        typeof window !== 'undefined' ? window.isSecureContext : false,
      isMobile: this.detectIsMobile(),
      isIOS: this.detectIsIOS(),
      isAndroid: this.detectIsAndroid(),
      networkQuality,
      memoryInfo: this.getMemoryInfo(),
      screenInfo: this.getScreenInfo(),
    };

    // 浏览器特定信息
    if (env === Environment.Browser) {
      capabilities.browser = EnvUtils.getBrowserInfo();
      capabilities.platform = navigator.platform;

      // 网络信息
      if (navigator && 'connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn) {
          capabilities.networkType = conn.effectiveType || conn.type;
        }
      }
    }

    this._platformCapabilities = capabilities;
    return capabilities;
  }

  /**
   * 检测设备能力
   */
  public detectDeviceCapabilities(): DeviceCapability {
    const capabilities: DeviceCapability = {
      memory: 'normal',
      processor: 'normal',
      network: 'normal',
      storage: 'normal',
      battery: 'normal',
    };

    // 检测处理器能力
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      if (navigator.hardwareConcurrency <= 2) {
        capabilities.processor = 'low';
      } else if (navigator.hardwareConcurrency >= 8) {
        capabilities.processor = 'high';
      }
    }

    // 检测内存能力
    const memInfo = this.getMemoryInfo();
    if (memInfo.deviceMemory) {
      if (memInfo.deviceMemory <= 2) {
        capabilities.memory = 'low';
      } else if (memInfo.deviceMemory >= 8) {
        capabilities.memory = 'high';
      }
    } else if (memInfo.jsHeapSizeLimit) {
      // 根据JS堆大小估算
      const heapLimitInGB = memInfo.jsHeapSizeLimit / (1024 * 1024 * 1024);
      if (heapLimitInGB <= 0.5) {
        capabilities.memory = 'low';
      } else if (heapLimitInGB >= 2) {
        capabilities.memory = 'high';
      }
    }

    // 检测网络能力
    if (this._networkDetector) {
      const quality = this._networkDetector.getCurrentQuality();
      if (quality === NetworkQuality.POOR || quality === NetworkQuality.LOW) {
        capabilities.network = 'low';
      } else if (
        quality === NetworkQuality.GOOD ||
        quality === NetworkQuality.EXCELLENT
      ) {
        capabilities.network = 'high';
      }
    }

    // 检测电池状态
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      try {
        (navigator as any).getBattery().then((battery: any) => {
          if (battery.charging) {
            capabilities.battery = 'high';
          } else if (battery.level < 0.2) {
            capabilities.battery = 'low';
          }
        });
      } catch (e) {
        // 忽略错误
      }
    }

    return capabilities;
  }

  /**
   * 获取推荐配置
   */
  public getRecommendedConfig(): RecommendedConfig {
    const capabilities = this.detectPlatformCapabilities();
    const features = capabilities.features;
    const deviceCap = capabilities.capabilities;
    const networkQuality = capabilities.networkQuality;

    // 基本配置
    const config: RecommendedConfig = {
      chunkSize: 2 * 1024 * 1024, // 默认2MB
      concurrency: 3,
      retryCount: 3,
      retryDelay: 1000,
      timeout: 30000,
      useWorker: features.hasWebWorker,
      useServiceWorker: features.hasServiceWorker,
      memoryOptimizationLevel: 'none',
      uploadStrategies: this.getDefaultUploadStrategies(),
    };

    // 根据环境调整
    if (capabilities.environment === Environment.WechatMP) {
      config.concurrency = 2;
      config.timeout = 60000;
      config.chunkSize = 4 * 1024 * 1024;
      config.useWorker = false;
    } else if (
      capabilities.environment === Environment.AlipayMP ||
      capabilities.environment === Environment.BytedanceMP ||
      capabilities.environment === Environment.BaiduMP
    ) {
      config.concurrency = 3;
      config.chunkSize = 4 * 1024 * 1024;
      config.useWorker = false;
    }

    // 根据设备能力调整
    if (deviceCap.processor === 'low') {
      config.concurrency = Math.min(config.concurrency, 2);
      config.memoryOptimizationLevel = 'high';
    }

    if (deviceCap.memory === 'low') {
      config.chunkSize = 1 * 1024 * 1024; // 1MB
      config.memoryOptimizationLevel = 'high';
      config.concurrency = Math.min(config.concurrency, 2);
    } else if (deviceCap.memory === 'high') {
      config.chunkSize = 8 * 1024 * 1024; // 8MB
    }

    // 根据网络质量调整
    if (networkQuality === NetworkQuality.POOR) {
      config.chunkSize = 256 * 1024; // 256KB
      config.concurrency = 1;
      config.retryCount = 5;
      config.retryDelay = 2000;
      config.timeout = 60000;
    } else if (networkQuality === NetworkQuality.LOW) {
      config.chunkSize = 512 * 1024; // 512KB
      config.concurrency = 2;
      config.retryCount = 4;
      config.timeout = 45000;
    } else if (networkQuality === NetworkQuality.EXCELLENT) {
      config.chunkSize = 10 * 1024 * 1024; // 10MB
      config.concurrency = Math.min(6, features.maxSimultaneousConnections);
    }

    // 移动设备优化
    if (capabilities.isMobile) {
      if (config.chunkSize > 4 * 1024 * 1024) {
        config.chunkSize = 4 * 1024 * 1024; // 移动设备最大4MB
      }

      if (deviceCap.battery === 'low') {
        config.concurrency = Math.min(config.concurrency, 2);
        config.memoryOptimizationLevel = 'medium';
      }
    }

    return config;
  }

  /**
   * 运行性能评估
   */
  public async evaluateRuntimePerformance(): Promise<{
    processingSpeed: number; // 处理速度 (MB/s)
    memoryEfficiency: number; // 内存效率 (0-1)
    concurrencyEfficiency: number; // 并发效率 (0-1)
    overallScore: number; // 总体评分 (0-100)
    recommendation: string; // 性能建议
  }> {
    // 计算性能分数的默认值
    const result = {
      processingSpeed: 0,
      memoryEfficiency: 0.5,
      concurrencyEfficiency: 0.5,
      overallScore: 50,
      recommendation: '',
    };

    try {
      // 测试文件处理速度
      const processingSpeed = await this.measureProcessingSpeed();
      result.processingSpeed = processingSpeed;

      // 测试内存效率
      if (this._memoryManager) {
        const memStats = this._memoryManager.getMemoryStats();
        result.memoryEfficiency = 1 - (memStats.usageRatio || 0.5);
      }

      // 计算并发效率 (通过网络质量估算)
      if (this._networkDetector) {
        const quality = this._networkDetector.getCurrentQuality();
        switch (quality) {
          case NetworkQuality.EXCELLENT:
            result.concurrencyEfficiency = 1.0;
            break;
          case NetworkQuality.GOOD:
            result.concurrencyEfficiency = 0.8;
            break;
          case NetworkQuality.MEDIUM:
            result.concurrencyEfficiency = 0.6;
            break;
          case NetworkQuality.LOW:
            result.concurrencyEfficiency = 0.4;
            break;
          case NetworkQuality.POOR:
            result.concurrencyEfficiency = 0.2;
            break;
          default:
            result.concurrencyEfficiency = 0.5;
        }
      }

      // 计算总体评分
      result.overallScore = Math.round(
        (result.processingSpeed / 10) * 40 + // 处理速度占40%
          result.memoryEfficiency * 30 + // 内存效率占30%
          result.concurrencyEfficiency * 30 // 并发效率占30%
      );

      // 根据评分给出建议
      if (result.overallScore >= 80) {
        result.recommendation = '设备性能良好，可以使用高性能配置';
      } else if (result.overallScore >= 60) {
        result.recommendation = '设备性能中等，建议使用平衡配置';
      } else {
        result.recommendation = '设备性能较弱，建议使用省电模式并减少并发';
      }
    } catch (error) {
      console.error('性能评估出错:', error);
    }

    return result;
  }

  /**
   * 测量文件处理速度 (MB/s)
   */
  private async measureProcessingSpeed(): Promise<number> {
    // 创建测试数据
    const testSize = 10 * 1024 * 1024; // 10MB
    const buffer = new ArrayBuffer(testSize);
    const view = new Uint8Array(buffer);

    // 填充随机数据
    for (let i = 0; i < testSize; i++) {
      view[i] = Math.floor(Math.random() * 256);
    }

    // 计时处理速度
    const startTime = performance.now();

    // 模拟分片处理
    const chunkSize = 1024 * 1024; // 1MB
    const chunks = Math.ceil(testSize / chunkSize);

    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, testSize);
      const chunk = buffer.slice(start, end);

      // 模拟基本处理 (计算校验和)
      const chunkView = new Uint8Array(chunk);
      let checksum = 0;
      for (let j = 0; j < chunkView.length; j++) {
        checksum = (checksum + chunkView[j]) % 65536;
      }
    }

    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;
    const speedMBps = testSize / (1024 * 1024) / durationSeconds;

    return parseFloat(speedMBps.toFixed(2));
  }

  /**
   * 获取内存信息
   */
  private getMemoryInfo() {
    const result: PlatformCapabilities['memoryInfo'] = {};

    if (typeof performance !== 'undefined' && performance.memory) {
      // @ts-ignore: Chrome特有API
      const memory = performance.memory;
      result.totalJSHeapSize = memory.totalJSHeapSize;
      result.usedJSHeapSize = memory.usedJSHeapSize;
      result.jsHeapSizeLimit = memory.jsHeapSizeLimit;
    }

    if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
      result.deviceMemory = (navigator as any).deviceMemory;
    }

    return result;
  }

  /**
   * 获取屏幕信息
   */
  private getScreenInfo() {
    const result = {
      width: 0,
      height: 0,
      pixelRatio: 1,
    };

    if (typeof window !== 'undefined' && window.screen) {
      result.width = window.screen.width;
      result.height = window.screen.height;

      if (window.devicePixelRatio) {
        result.pixelRatio = window.devicePixelRatio;
      }
    }

    return result;
  }

  /**
   * 检测是否为移动设备
   */
  private detectIsMobile(): boolean {
    if (typeof navigator === 'undefined' || !navigator.userAgent) {
      return false;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );
  }

  /**
   * 检测是否为iOS设备
   */
  private detectIsIOS(): boolean {
    if (typeof navigator === 'undefined' || !navigator.userAgent) {
      return false;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/i.test(userAgent);
  }

  /**
   * 检测是否为Android设备
   */
  private detectIsAndroid(): boolean {
    if (typeof navigator === 'undefined' || !navigator.userAgent) {
      return false;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    return /android/i.test(userAgent);
  }

  /**
   * 获取默认上传策略
   */
  private getDefaultUploadStrategies(): Record<string, UploadStrategy> {
    return {
      default: {
        chunkSize: 2 * 1024 * 1024,
        concurrency: 3,
        retryCount: 3,
        retryDelay: 1000,
        timeout: 30000,
      },
      highPerformance: {
        chunkSize: 8 * 1024 * 1024,
        concurrency: 6,
        retryCount: 2,
        retryDelay: 500,
        timeout: 30000,
        prioritizeFirstChunk: false,
      },
      balanced: {
        chunkSize: 4 * 1024 * 1024,
        concurrency: 3,
        retryCount: 3,
        retryDelay: 1000,
        timeout: 30000,
        prioritizeFirstChunk: true,
      },
      powerSaving: {
        chunkSize: 2 * 1024 * 1024,
        concurrency: 2,
        retryCount: 4,
        retryDelay: 2000,
        timeout: 45000,
        prioritizeFirstChunk: true,
      },
      lowMemory: {
        chunkSize: 1 * 1024 * 1024,
        concurrency: 2,
        retryCount: 3,
        retryDelay: 1500,
        timeout: 40000,
        prioritizeFirstChunk: true,
      },
    };
  }
}

export default EnvironmentDetector;
