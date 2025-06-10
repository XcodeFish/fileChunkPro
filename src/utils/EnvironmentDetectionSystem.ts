/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EnvironmentDetectionSystem.ts
 * 全面的环境检测系统，检测当前运行环境的特性和能力
 */

import { DeviceCapability } from '../types';
import {
  Environment,
  BrowserFeature,
  MiniProgramFeature,
  ReactNativeFeature,
  NodeFeature,
  FeatureSupport,
  CapabilityLevel,
  FallbackStrategy,
  EnvironmentDetectionResult,
  EnvironmentCapabilityScore,
} from '../types/environment';

/**
 * 环境检测系统 - 负责检测当前运行环境的特性和能力
 * 提供详细的环境信息、特性支持情况和设备能力评估
 */
export class EnvironmentDetectionSystem {
  // 缓存检测结果，避免重复检测
  private cachedEnvironment: Environment | null = null;
  private cachedFeatures: FeatureSupport | null = null;
  private cachedCapabilities: DeviceCapability | null = null;
  private cachedDetectionResult: EnvironmentDetectionResult | null = null;
  private cachedCapabilityScore: EnvironmentCapabilityScore | null = null;

  /**
   * 构造函数
   */
  constructor() {
    // 初始化时不立即执行检测，延迟到需要时再执行
  }

  /**
   * 获取当前运行环境
   * @returns 当前环境类型枚举值
   */
  public getEnvironment(): Environment {
    if (this.cachedEnvironment !== null) {
      return this.cachedEnvironment;
    }

    // 浏览器环境
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // 检查React Native环境
      if (
        typeof navigator !== 'undefined' &&
        navigator.product === 'ReactNative'
      ) {
        this.cachedEnvironment = Environment.ReactNative;
        return Environment.ReactNative;
      }

      // 检查微信小程序环境
      if (typeof window.wx !== 'undefined') {
        this.cachedEnvironment = Environment.WechatMP;
        return Environment.WechatMP;
      }

      // 检查支付宝小程序环境
      if (typeof window.my !== 'undefined') {
        this.cachedEnvironment = Environment.AlipayMP;
        return Environment.AlipayMP;
      }

      // 检查字节跳动小程序环境
      if (typeof window.tt !== 'undefined') {
        this.cachedEnvironment = Environment.BytedanceMP;
        return Environment.BytedanceMP;
      }

      // 检查百度小程序环境
      if (typeof window.swan !== 'undefined') {
        this.cachedEnvironment = Environment.BaiduMP;
        return Environment.BaiduMP;
      }

      // 检查uni-app环境
      if (typeof window.uni !== 'undefined') {
        this.cachedEnvironment = Environment.UniAppMP;
        return Environment.UniAppMP;
      }

      // 标准浏览器环境
      this.cachedEnvironment = Environment.Browser;
      return Environment.Browser;
    }

    // Node.js环境
    if (
      typeof process !== 'undefined' &&
      process.versions &&
      process.versions.node
    ) {
      this.cachedEnvironment = Environment.NodeJS;
      return Environment.NodeJS;
    }

    // 未知环境
    this.cachedEnvironment = Environment.Unknown;
    return Environment.Unknown;
  }

  /**
   * 获取环境名称
   * @returns 环境名称字符串
   */
  public getEnvironmentName(): string {
    const env = this.getEnvironment();
    switch (env) {
      case Environment.Browser:
        return '浏览器';
      case Environment.ReactNative:
        return 'React Native';
      case Environment.WechatMP:
        return '微信小程序';
      case Environment.AlipayMP:
        return '支付宝小程序';
      case Environment.BytedanceMP:
        return '字节跳动小程序';
      case Environment.BaiduMP:
        return '百度小程序';
      case Environment.TaroMP:
        return 'Taro';
      case Environment.UniAppMP:
        return 'uni-app';
      case Environment.NodeJS:
        return 'Node.js';
      default:
        return '未知环境';
    }
  }

  /**
   * 检测当前环境中所有相关特性的支持情况
   * @returns 特性支持情况映射
   */
  public detectAllFeatures(): FeatureSupport {
    if (this.cachedFeatures !== null) {
      return this.cachedFeatures;
    }

    const env = this.getEnvironment();
    let features: FeatureSupport = {};

    switch (env) {
      case Environment.Browser:
        features = this.detectBrowserFeatures();
        break;
      case Environment.ReactNative:
        features = this.detectReactNativeFeatures();
        break;
      case Environment.WechatMP:
      case Environment.AlipayMP:
      case Environment.BytedanceMP:
      case Environment.BaiduMP:
      case Environment.TaroMP:
      case Environment.UniAppMP:
        features = this.detectMiniProgramFeatures();
        break;
      case Environment.NodeJS:
        features = this.detectNodeFeatures();
        break;
      default:
        features = {}; // 未知环境，特性支持情况未知
    }

    this.cachedFeatures = features;
    return features;
  }

  /**
   * 检测浏览器环境特性
   * @returns 浏览器特性支持情况
   */
  private detectBrowserFeatures(): FeatureSupport {
    const features: FeatureSupport = {};

    // Web Worker 支持情况
    features[BrowserFeature.WEB_WORKER] = typeof Worker !== 'undefined';

    // Service Worker 支持情况
    features[BrowserFeature.SERVICE_WORKER] = 'serviceWorker' in navigator;

    // WebSocket 支持情况
    features[BrowserFeature.WEBSOCKET] = typeof WebSocket !== 'undefined';

    // IndexedDB 支持情况
    features[BrowserFeature.INDEXED_DB] = typeof indexedDB !== 'undefined';

    // File API 支持情况
    features[BrowserFeature.FILE_API] =
      typeof File !== 'undefined' && typeof FileReader !== 'undefined';

    // Streams API 支持情况
    features[BrowserFeature.STREAMS_API] =
      typeof ReadableStream !== 'undefined';

    // SharedArrayBuffer 支持情况
    features[BrowserFeature.SHARED_ARRAY_BUFFER] =
      typeof SharedArrayBuffer !== 'undefined';

    // Network Information API 支持情况
    features[BrowserFeature.NETWORK_INFORMATION_API] =
      'connection' in navigator;

    // Web Crypto API 支持情况
    features[BrowserFeature.WEB_CRYPTO] =
      typeof crypto !== 'undefined' && 'subtle' in crypto;

    // Performance API 支持情况
    features[BrowserFeature.PERFORMANCE_API] =
      typeof performance !== 'undefined';

    // Memory API 支持情况
    features[BrowserFeature.MEMORY_API] =
      typeof performance !== 'undefined' && 'memory' in performance;

    // Battery API 支持情况
    features[BrowserFeature.BATTERY_API] = 'getBattery' in navigator;

    // 硬件并发支持情况
    features[BrowserFeature.HARDWARE_CONCURRENCY] =
      'hardwareConcurrency' in navigator;

    // 设备内存 API 支持情况
    features[BrowserFeature.DEVICE_MEMORY_API] = 'deviceMemory' in navigator;

    // Fetch API 支持情况
    features[BrowserFeature.FETCH_API] = typeof fetch !== 'undefined';

    // Promise 支持情况
    features[BrowserFeature.PROMISE] = typeof Promise !== 'undefined';

    // Async/Await 支持情况
    features[BrowserFeature.ASYNC_AWAIT] = (() => {
      try {
        new Function('async () => {}');
        return true;
      } catch (e) {
        return false;
      }
    })();

    // WebAssembly 支持情况
    features[BrowserFeature.WEB_ASSEMBLY] = typeof WebAssembly !== 'undefined';

    return features;
  }

  /**
   * 检测小程序环境特性
   * @returns 小程序特性支持情况
   */
  private detectMiniProgramFeatures(): FeatureSupport {
    const features: FeatureSupport = {};
    const env = this.getEnvironment();

    // 根据不同小程序环境进行特性检测
    switch (env) {
      case Environment.WechatMP:
        if (typeof window !== 'undefined' && window.wx) {
          // 文件系统 API 支持情况
          features[MiniProgramFeature.FILE_SYSTEM] =
            typeof window.wx.getFileSystemManager === 'function';

          // 上传文件 API 支持情况
          features[MiniProgramFeature.UPLOAD_FILE] =
            typeof window.wx.uploadFile === 'function';

          // 下载文件 API 支持情况
          features[MiniProgramFeature.DOWNLOAD_FILE] =
            typeof window.wx.downloadFile === 'function';

          // WebSocket 支持情况
          features[MiniProgramFeature.SOCKET] =
            typeof window.wx.connectSocket === 'function';

          // Worker 支持情况
          features[MiniProgramFeature.WORKER] =
            typeof window.wx.createWorker === 'function';
        }
        break;

      case Environment.AlipayMP:
        if (typeof window !== 'undefined' && window.my) {
          // 支付宝小程序的特性检测
          features[MiniProgramFeature.FILE_SYSTEM] =
            typeof window.my.getFileSystemManager === 'function';

          features[MiniProgramFeature.UPLOAD_FILE] =
            typeof window.my.uploadFile === 'function';

          features[MiniProgramFeature.DOWNLOAD_FILE] =
            typeof window.my.downloadFile === 'function';

          features[MiniProgramFeature.SOCKET] =
            typeof window.my.connectSocket === 'function';
        }
        break;

      // 其他小程序环境类似检测...
      case Environment.BytedanceMP:
      case Environment.BaiduMP:
      case Environment.UniAppMP:
      case Environment.TaroMP:
        // 这里可以添加其他小程序环境的特性检测逻辑
        break;
    }

    return features;
  }

  /**
   * 检测React Native环境特性
   * @returns React Native特性支持情况
   */
  private detectReactNativeFeatures(): FeatureSupport {
    const features: FeatureSupport = {};

    // Fetch API 支持情况
    features[ReactNativeFeature.FETCH] = typeof fetch !== 'undefined';

    // XMLHttpRequest 支持情况
    features[ReactNativeFeature.XMLHTTPREQUEST] =
      typeof XMLHttpRequest !== 'undefined';

    // WebSocket 支持情况
    features[ReactNativeFeature.WEBSOCKET] = typeof WebSocket !== 'undefined';

    // 文件系统 API 支持情况 - 需要额外检测React Native特定API
    features[ReactNativeFeature.FILE_SYSTEM] = false;

    try {
      // 尝试动态加载 react-native-fs 模块
      // 注意: 这里只是检测，实际使用需要正确配置
      import('react-native-fs')
        .then(_RNFS => {
          features[ReactNativeFeature.FILE_SYSTEM] = true;
        })
        .catch(() => {
          features[ReactNativeFeature.FILE_SYSTEM] = false;
        });
    } catch (e) {
      // 模块不可用
    }

    return features;
  }

  /**
   * 检测Node.js环境特性
   * @returns Node.js特性支持情况
   */
  private detectNodeFeatures(): FeatureSupport {
    const features: FeatureSupport = {};

    try {
      // 检测fs模块
      import('fs')
        .then(_fs => {
          features[NodeFeature.FS] = true;
        })
        .catch(() => {
          features[NodeFeature.FS] = false;
        });
    } catch (e) {
      features[NodeFeature.FS] = false;
    }

    try {
      // 检测http模块
      import('http')
        .then(_http => {
          features[NodeFeature.HTTP] = true;
        })
        .catch(() => {
          features[NodeFeature.HTTP] = false;
        });
    } catch (e) {
      features[NodeFeature.HTTP] = false;
    }

    try {
      // 检测https模块
      import('https')
        .then(_https => {
          features[NodeFeature.HTTPS] = true;
        })
        .catch(() => {
          features[NodeFeature.HTTPS] = false;
        });
    } catch (e) {
      features[NodeFeature.HTTPS] = false;
    }

    try {
      // 检测stream模块
      import('stream')
        .then(_stream => {
          features[NodeFeature.STREAM] = true;
        })
        .catch(() => {
          features[NodeFeature.STREAM] = false;
        });
    } catch (e) {
      features[NodeFeature.STREAM] = false;
    }

    try {
      // 检测worker_threads模块
      import('worker_threads')
        .then(_worker => {
          features[NodeFeature.WORKER_THREADS] = true;
        })
        .catch(() => {
          features[NodeFeature.WORKER_THREADS] = false;
        });
    } catch (e) {
      features[NodeFeature.WORKER_THREADS] = false;
    }

    try {
      // 检测crypto模块
      import('crypto')
        .then(_crypto => {
          features[NodeFeature.CRYPTO] = true;
        })
        .catch(() => {
          features[NodeFeature.CRYPTO] = false;
        });
    } catch (e) {
      features[NodeFeature.CRYPTO] = false;
    }

    return features;
  }

  /**
   * 检查当前环境是否支持特定特性
   * @param feature 特性名称
   * @returns 是否支持该特性
   */
  public hasFeature(feature: string): boolean {
    const allFeatures = this.detectAllFeatures();
    return !!allFeatures[feature];
  }

  /**
   * 评估设备能力
   * 包括内存、处理器、网络、存储和电池状态评估
   * @returns 设备能力评级
   */
  public getDeviceCapabilities(): DeviceCapability {
    if (this.cachedCapabilities !== null) {
      return this.cachedCapabilities;
    }

    const env = this.getEnvironment();
    const capabilities: DeviceCapability = {
      memory: 'normal',
      processor: 'normal',
      network: 'normal',
      storage: 'normal',
      battery: 'normal',
    };

    // 浏览器环境下进行详细评估
    if (env === Environment.Browser) {
      // 内存能力评估
      capabilities.memory = this.evaluateMemoryCapability();

      // 处理器能力评估
      capabilities.processor = this.evaluateProcessorCapability();

      // 网络能力评估
      capabilities.network = this.evaluateNetworkCapability();

      // 存储能力评估
      capabilities.storage = this.evaluateStorageCapability();

      // 电池状态评估
      capabilities.battery = this.evaluateBatteryStatus();
    }
    // 小程序环境下的能力评估
    else if (
      env === Environment.WechatMP ||
      env === Environment.AlipayMP ||
      env === Environment.BytedanceMP ||
      env === Environment.BaiduMP
    ) {
      // 小程序环境能力评估相对保守
      capabilities.memory = 'low';
      capabilities.processor = 'low';
      capabilities.network = 'normal';
      capabilities.storage = 'low';
      capabilities.battery = 'normal';
    }
    // React Native环境下的能力评估
    else if (env === Environment.ReactNative) {
      // React Native环境能力评估
      capabilities.memory = 'normal';
      capabilities.processor = 'normal';
      capabilities.network = 'normal';
      capabilities.storage = 'normal';
      capabilities.battery = 'normal';
    }
    // Node.js环境下的能力评估
    else if (env === Environment.NodeJS) {
      // Node.js环境通常有较好的资源
      capabilities.memory = 'high';
      capabilities.processor = 'high';
      capabilities.network = 'high';
      capabilities.storage = 'high';
      capabilities.battery = 'high'; // 服务器通常有稳定电源
    }

    this.cachedCapabilities = capabilities;
    return capabilities;
  }

  /**
   * 评估内存能力
   * @returns 内存能力级别
   */
  private evaluateMemoryCapability(): CapabilityLevel {
    // 检查deviceMemory API
    if (
      navigator &&
      'deviceMemory' in navigator &&
      typeof (navigator as any).deviceMemory === 'number'
    ) {
      const memory = (navigator as any).deviceMemory;
      if (memory <= 1) return 'low';
      if (memory <= 4) return 'normal';
      return 'high';
    }

    // 检查performance.memory API
    if (
      performance &&
      'memory' in performance &&
      (performance as any).memory &&
      typeof (performance as any).memory.jsHeapSizeLimit === 'number'
    ) {
      const maxMemory = (performance as any).memory.jsHeapSizeLimit;
      // 小于512MB视为低内存
      if (maxMemory < 512 * 1024 * 1024) return 'low';
      // 小于2GB视为普通内存
      if (maxMemory < 2 * 1024 * 1024 * 1024) return 'normal';
      // 大于2GB视为高内存
      return 'high';
    }

    // 无法准确检测时，返回默认值
    return 'normal';
  }

  /**
   * 评估处理器能力
   * @returns 处理器能力级别
   */
  private evaluateProcessorCapability(): CapabilityLevel {
    // 检查硬件并发数
    if (navigator && 'hardwareConcurrency' in navigator) {
      const cores = navigator.hardwareConcurrency;
      if (cores <= 2) return 'low';
      if (cores <= 6) return 'normal';
      return 'high';
    }

    // 使用简单性能测试评估
    const startTime = Date.now();
    for (let i = 0; i < 1000000; i++) {
      // 执行一些简单计算以测试 CPU 性能
    }
    const duration = Date.now() - startTime;

    // 根据测试耗时判断处理器能力
    if (duration > 100) return 'low';
    if (duration > 30) return 'normal';
    return 'high';
  }

  /**
   * 评估网络能力
   * @returns 网络能力级别
   */
  private evaluateNetworkCapability(): CapabilityLevel {
    // 检查Network Information API
    if (navigator && 'connection' in navigator) {
      const connection = (navigator as any).connection;

      if (connection) {
        // 检查网络类型
        if (connection.saveData) {
          return 'low'; // 节省数据模式
        }

        // 检查有效网络类型
        if (connection.effectiveType) {
          switch (connection.effectiveType) {
            case 'slow-2g':
            case '2g':
              return 'low';
            case '3g':
              return 'normal';
            case '4g':
              return 'high';
            default:
              return 'normal';
          }
        }

        // 检查下载速度
        if (typeof connection.downlink === 'number') {
          if (connection.downlink < 1) return 'low';
          if (connection.downlink < 5) return 'normal';
          return 'high';
        }
      }
    }

    // 无法准确检测时，返回默认值
    return 'normal';
  }

  /**
   * 评估存储能力
   * @returns 存储能力级别
   */
  private evaluateStorageCapability(): CapabilityLevel {
    // 检查IndexedDB支持
    const hasIndexedDB = this.hasFeature(BrowserFeature.INDEXED_DB);

    // 检查存储估计API
    if (
      navigator &&
      'storage' in navigator &&
      'estimate' in navigator.storage
    ) {
      // 尝试获取存储配额信息
      navigator.storage
        .estimate()
        .then(estimate => {
          if (estimate.quota) {
            if (estimate.quota < 100 * 1024 * 1024) return 'low'; // 小于100MB
            if (estimate.quota < 1024 * 1024 * 1024) return 'normal'; // 小于1GB
            return 'high'; // 大于1GB
          }
        })
        .catch(() => {
          // 发生错误，无法获取存储估计
        });
    }

    // 如果支持IndexedDB，至少为普通存储能力
    if (hasIndexedDB) {
      return 'normal';
    }

    // 默认为低存储能力
    return 'low';
  }

  /**
   * 评估电池状态
   * @returns 电池状态级别
   */
  private evaluateBatteryStatus(): CapabilityLevel {
    // 检查Battery API
    if (navigator && 'getBattery' in navigator) {
      navigator
        .getBattery()
        .then(battery => {
          // 充电状态
          if (battery.charging) {
            return 'high';
          }

          // 电量水平
          const level = battery.level;
          if (level < 0.2) return 'low';
          if (level < 0.5) return 'normal';
          return 'high';
        })
        .catch(() => {
          // 发生错误，无法获取电池信息
        });
    }

    // 无法检测时，假设为普通电池状态
    return 'normal';
  }

  /**
   * 获取当前环境的降级策略
   * 在关键特性不支持时提供替代方案
   * @returns 降级策略列表
   */
  public getFallbackStrategies(): FallbackStrategy[] {
    const features = this.detectAllFeatures();
    const strategies: FallbackStrategy[] = [];

    // Worker 降级策略
    if (!features[BrowserFeature.WEB_WORKER]) {
      strategies.push({
        feature: BrowserFeature.WEB_WORKER,
        fallbackMethod: 'main_thread_processing',
        performance: 'low',
        limitations: ['可能导致UI阻塞', '处理大文件时性能下降'],
        enabled: true,
      });
    }

    // IndexedDB 降级策略
    if (!features[BrowserFeature.INDEXED_DB]) {
      strategies.push({
        feature: BrowserFeature.INDEXED_DB,
        fallbackMethod: 'memory_storage',
        performance: 'medium',
        limitations: ['断点续传功能受限', '无法处理超大文件'],
        enabled: true,
      });
    }

    // Streams API 降级策略
    if (!features[BrowserFeature.STREAMS_API]) {
      strategies.push({
        feature: BrowserFeature.STREAMS_API,
        fallbackMethod: 'array_buffer_processing',
        performance: 'medium',
        limitations: ['内存使用量增加', '处理大文件时可能内存不足'],
        enabled: true,
      });
    }

    // WebCrypto API 降级策略
    if (!features[BrowserFeature.WEB_CRYPTO]) {
      strategies.push({
        feature: BrowserFeature.WEB_CRYPTO,
        fallbackMethod: 'js_crypto_implementation',
        performance: 'low',
        limitations: ['哈希计算速度变慢', '可能影响上传性能'],
        enabled: true,
      });
    }

    return strategies;
  }

  /**
   * 获取环境能力评分
   * 综合评估环境对文件上传的支持能力
   * @returns 环境能力评分（0-100）
   */
  public getCapabilityScore(): EnvironmentCapabilityScore {
    if (this.cachedCapabilityScore !== null) {
      return this.cachedCapabilityScore;
    }

    const features = this.detectAllFeatures();
    const capabilities = this.getDeviceCapabilities();

    // 文件处理能力评分
    const fileProcessingScore = this.calculateFileProcessingScore(
      features,
      capabilities
    );

    // 网络能力评分
    const networkingScore = this.calculateNetworkingScore(
      features,
      capabilities
    );

    // 并发处理能力评分
    const concurrencyScore = this.calculateConcurrencyScore(
      features,
      capabilities
    );

    // 存储能力评分
    const storageScore = this.calculateStorageScore(features, capabilities);

    // 可靠性评分
    const reliabilityScore = this.calculateReliabilityScore(features);

    // 计算总体评分 (各部分权重可调整)
    const overallScore = Math.round(
      fileProcessingScore * 0.25 +
        networkingScore * 0.25 +
        concurrencyScore * 0.2 +
        storageScore * 0.15 +
        reliabilityScore * 0.15
    );

    const score: EnvironmentCapabilityScore = {
      overall: overallScore,
      fileProcessing: fileProcessingScore,
      networking: networkingScore,
      concurrency: concurrencyScore,
      storage: storageScore,
      reliability: reliabilityScore,
    };

    this.cachedCapabilityScore = score;
    return score;
  }

  /**
   * 计算文件处理能力评分
   */
  private calculateFileProcessingScore(
    features: FeatureSupport,
    capabilities: DeviceCapability
  ): number {
    let score = 50; // 基础分

    // 文件API支持
    if (features[BrowserFeature.FILE_API]) score += 20;

    // Streams API支持
    if (features[BrowserFeature.STREAMS_API]) score += 15;

    // WebCrypto支持
    if (features[BrowserFeature.WEB_CRYPTO]) score += 10;

    // 处理器能力
    if (capabilities.processor === 'high') score += 5;
    if (capabilities.processor === 'low') score -= 5;

    // 内存能力
    if (capabilities.memory === 'high') score += 5;
    if (capabilities.memory === 'low') score -= 10;

    // 确保分数在0-100范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算网络能力评分
   */
  private calculateNetworkingScore(
    features: FeatureSupport,
    capabilities: DeviceCapability
  ): number {
    let score = 50; // 基础分

    // Fetch API支持
    if (features[BrowserFeature.FETCH_API]) score += 15;

    // Network Information API支持
    if (features[BrowserFeature.NETWORK_INFORMATION_API]) score += 10;

    // WebSocket支持
    if (features[BrowserFeature.WEBSOCKET]) score += 10;

    // 网络能力
    if (capabilities.network === 'high') score += 15;
    if (capabilities.network === 'normal') score += 5;
    if (capabilities.network === 'low') score -= 10;

    // 确保分数在0-100范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算并发处理能力评分
   */
  private calculateConcurrencyScore(
    features: FeatureSupport,
    capabilities: DeviceCapability
  ): number {
    let score = 50; // 基础分

    // Web Worker支持
    if (features[BrowserFeature.WEB_WORKER]) score += 20;

    // 硬件并发支持
    if (features[BrowserFeature.HARDWARE_CONCURRENCY]) score += 10;

    // SharedArrayBuffer支持
    if (features[BrowserFeature.SHARED_ARRAY_BUFFER]) score += 15;

    // 处理器能力
    if (capabilities.processor === 'high') score += 10;
    if (capabilities.processor === 'low') score -= 15;

    // 确保分数在0-100范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算存储能力评分
   */
  private calculateStorageScore(
    features: FeatureSupport,
    capabilities: DeviceCapability
  ): number {
    let score = 50; // 基础分

    // IndexedDB支持
    if (features[BrowserFeature.INDEXED_DB]) score += 25;

    // 存储能力
    if (capabilities.storage === 'high') score += 15;
    if (capabilities.storage === 'normal') score += 5;
    if (capabilities.storage === 'low') score -= 10;

    // 确保分数在0-100范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算可靠性评分
   */
  private calculateReliabilityScore(features: FeatureSupport): number {
    let score = 50; // 基础分

    // Promise支持
    if (features[BrowserFeature.PROMISE]) score += 15;

    // Async/Await支持
    if (features[BrowserFeature.ASYNC_AWAIT]) score += 15;

    // Performance API支持
    if (features[BrowserFeature.PERFORMANCE_API]) score += 10;

    // Service Worker支持(离线能力)
    if (features[BrowserFeature.SERVICE_WORKER]) score += 10;

    // 确保分数在0-100范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 获取完整的环境检测结果
   * @returns 完整的环境检测结果对象
   */
  public getDetectionResult(): EnvironmentDetectionResult {
    if (this.cachedDetectionResult !== null) {
      return this.cachedDetectionResult;
    }

    const env = this.getEnvironmentName();
    const features = this.detectAllFeatures();
    const capabilities = this.getDeviceCapabilities();
    const scores = this.getCapabilityScore();
    const fallbacks = this.getFallbackStrategies();

    // 收集警告信息
    const warnings: string[] = [];

    // 收集限制信息
    const limitations: string[] = [];

    // 添加主要限制和警告
    if (capabilities.memory === 'low') {
      warnings.push('设备内存较低，可能影响大文件处理');
    }

    if (capabilities.network === 'low') {
      warnings.push('网络条件较差，上传可能较慢');
    }

    if (!features[BrowserFeature.WEB_WORKER]) {
      limitations.push('不支持Web Worker，无法使用后台线程处理');
    }

    if (!features[BrowserFeature.INDEXED_DB]) {
      limitations.push('不支持IndexedDB，断点续传功能受限');
    }

    // 生成推荐配置
    // 这里只是一个示例，实际推荐配置会由ConfigurationEngine负责生成
    const recommendations = {
      chunkSize: capabilities.memory === 'low' ? 1048576 : 4194304, // 1MB 或 4MB
      concurrency: capabilities.processor === 'low' ? 2 : 4,
      useWorker: features[BrowserFeature.WEB_WORKER],
      storageType: features[BrowserFeature.INDEXED_DB] ? 'indexeddb' : 'memory',
      retryStrategy: {
        maxRetries: capabilities.network === 'low' ? 5 : 3,
        initialDelay: 1000,
        maxDelay: 30000,
      },
      timeout: capabilities.network === 'low' ? 60000 : 30000,
      processingMode: features[BrowserFeature.STREAMS_API]
        ? 'stream'
        : 'buffer',
      memoryManagement: {
        maxUsage: capabilities.memory === 'low' ? 0.5 : 0.8,
        cleanupInterval: 10000,
      },
      monitoringFrequency: capabilities.processor === 'low' ? 2000 : 1000,
      optimizations: [],
    };

    // 根据特性和能力添加推荐的优化项
    if (features[BrowserFeature.WEB_WORKER]) {
      recommendations.optimizations.push('worker_processing');
    }

    if (features[BrowserFeature.STREAMS_API]) {
      recommendations.optimizations.push('stream_processing');
    }

    if (capabilities.network === 'high') {
      recommendations.optimizations.push('aggressive_concurrency');
    }

    if (capabilities.memory === 'high') {
      recommendations.optimizations.push('large_chunks');
    }

    const result: EnvironmentDetectionResult = {
      environment: env,
      features,
      capabilities,
      scores,
      recommendations,
      fallbacks,
      warnings,
      limitations,
    };

    this.cachedDetectionResult = result;
    return result;
  }

  /**
   * 重置缓存的检测结果
   * 用于强制重新检测环境
   */
  public resetCache(): void {
    this.cachedEnvironment = null;
    this.cachedFeatures = null;
    this.cachedCapabilities = null;
    this.cachedDetectionResult = null;
    this.cachedCapabilityScore = null;
  }
}

export default EnvironmentDetectionSystem;
