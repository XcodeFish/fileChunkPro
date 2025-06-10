/**
 * NetworkDetector - 网络检测器 (重构版)
 *
 * 功能:
 * 1. 监控网络状态
 * 2. 检测网络质量
 * 3. 提供实时网络信息
 * 4. 网络故障预警
 */

import { EventBus } from '../core/EventBus';
import { Logger } from './Logger';
import {
  NetworkQualityEvaluator,
  NetworkQualityMetrics,
} from '../evaluators/NetworkQualityEvaluator';
import { NetworkSpeedMonitor } from '../monitors/NetworkSpeedMonitor';
import {
  NetworkStabilityAnalyzer,
  ConnectionEvent,
} from '../analyzers/NetworkStabilityAnalyzer';
import { NetworkTrendPredictor } from '../predictors/NetworkTrendPredictor';

import {
  NetworkQuality,
  NetworkType,
  NetworkCondition,
  EnvironmentType,
} from '../types/network';
import { DependencyContainer } from '../core/DependencyContainer';

export class NetworkDetector {
  private static instance: NetworkDetector;

  // 核心功能模块
  private qualityEvaluator: NetworkQualityEvaluator;
  private speedMonitor: NetworkSpeedMonitor;
  private stabilityAnalyzer: NetworkStabilityAnalyzer;
  private trendPredictor: NetworkTrendPredictor;

  // 基础属性
  private eventBus: EventBus;
  private logger: Logger;
  private isOnline = true;
  private networkType: NetworkType = NetworkType.UNKNOWN;
  private currentNetworkQuality: NetworkQuality = NetworkQuality.FAIR;
  private environmentType: EnvironmentType = EnvironmentType.BROWSER;

  // 测速相关
  private speedTestUrl = 'https://www.cloudflare.com/cdn-cgi/trace'; // 使用可访问的真实URL
  private speedTestInterval = 60000; // 1分钟
  private speedTestTimer: ReturnType<typeof setInterval> | null = null;

  // ping相关
  private pingUrl = 'https://www.cloudflare.com/cdn-cgi/trace';
  private pingInterval = 30000; // 30秒
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: {
    autoRefreshInterval?: number;
    enableNetworkListener?: boolean;
  }) {
    this.eventBus = EventBus.getInstance();
    this.logger = new Logger('NetworkDetector');

    // 初始化模块
    this.qualityEvaluator = new NetworkQualityEvaluator();
    this.speedMonitor = new NetworkSpeedMonitor();
    this.stabilityAnalyzer = new NetworkStabilityAnalyzer();
    this.trendPredictor = new NetworkTrendPredictor();

    // 应用选项
    if (options) {
      if (options.autoRefreshInterval) {
        this.speedTestInterval = options.autoRefreshInterval;
      }
    }

    // 检测环境类型
    this.detectEnvironmentType();

    // 注册事件处理
    this.registerEvents();

    // 立即进行一次网络状态检测
    this.detectNetworkState();

    // 定时测速
    this.startSpeedTest();

    // 定时ping检测
    this.startPingTest();
  }

  public static getInstance(options?: {
    autoRefreshInterval?: number;
    enableNetworkListener?: boolean;
  }): NetworkDetector {
    if (!NetworkDetector.instance) {
      NetworkDetector.instance = new NetworkDetector(options);
    } else if (options) {
      // 如果提供了配置选项，应用它们
      if (options.autoRefreshInterval) {
        NetworkDetector.instance.speedTestInterval =
          options.autoRefreshInterval;
      }
    }
    return NetworkDetector.instance;
  }

  /**
   * 检测环境类型
   */
  private detectEnvironmentType(): void {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.environmentType = EnvironmentType.BROWSER;
    } else if (typeof wx !== 'undefined' && wx.getSystemInfo) {
      this.environmentType = EnvironmentType.WECHAT_MINIPROGRAM;
    } else if (typeof my !== 'undefined' && my.getSystemInfo) {
      this.environmentType = EnvironmentType.ALIPAY_MINIPROGRAM;
    } else if (typeof tt !== 'undefined' && tt.getSystemInfo) {
      this.environmentType = EnvironmentType.BYTEDANCE_MINIPROGRAM;
    } else if (typeof swan !== 'undefined' && swan.getSystemInfo) {
      this.environmentType = EnvironmentType.BAIDU_MINIPROGRAM;
    } else if (typeof uni !== 'undefined') {
      this.environmentType = EnvironmentType.UNI_APP;
    } else if (
      typeof process !== 'undefined' &&
      process.versions &&
      process.versions.node
    ) {
      this.environmentType = EnvironmentType.NODE;
    } else {
      this.environmentType = EnvironmentType.UNKNOWN;
    }

    this.logger.info('环境类型检测', { environmentType: this.environmentType });
  }

  /**
   * 注册事件监听
   */
  private registerEvents(): void {
    // 浏览器环境下注册网络状态变化事件
    if (this.environmentType === EnvironmentType.BROWSER) {
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));

      // 监听网络连接变化
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          connection.addEventListener(
            'change',
            this.handleConnectionChange.bind(this)
          );

          // 初始获取网络类型
          this.updateNetworkType(connection.type);
        }
      }
    }
    // 可以添加其他环境的事件监听
  }

  /**
   * 网络上线处理
   */
  private handleOnline(): void {
    this.isOnline = true;
    this.logger.info('网络已连接');

    // 记录连接事件
    const connectionEvent: ConnectionEvent = {
      timestamp: Date.now(),
      type: 'online',
    };
    this.stabilityAnalyzer.recordConnectionEvent(connectionEvent);

    // 触发事件
    this.eventBus.emit('network:online', { timestamp: Date.now() });

    // 立即进行一次网络状态检测
    this.detectNetworkState();
  }

  /**
   * 网络离线处理
   */
  private handleOffline(): void {
    this.isOnline = false;
    this.logger.warn('网络已断开');

    // 记录连接事件
    const connectionEvent: ConnectionEvent = {
      timestamp: Date.now(),
      type: 'offline',
    };
    this.stabilityAnalyzer.recordConnectionEvent(connectionEvent);

    // 更新网络质量为不可用
    this.updateNetworkQuality(NetworkQuality.UNUSABLE);

    // 触发事件
    this.eventBus.emit('network:offline', { timestamp: Date.now() });
  }

  /**
   * 处理网络连接变化
   */
  private handleConnectionChange(_event: any): void {
    const connection = (navigator as any).connection;
    if (!connection) return;

    const oldNetworkType = this.networkType;

    // 更新网络类型
    this.updateNetworkType(connection.type);

    this.logger.debug('网络连接变化', {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      from: oldNetworkType,
      to: this.networkType,
    });

    // 记录类型变化事件
    if (oldNetworkType !== this.networkType) {
      const connectionEvent: ConnectionEvent = {
        timestamp: Date.now(),
        type: 'type_change',
        previousType: oldNetworkType,
        newType: this.networkType,
      };
      this.stabilityAnalyzer.recordConnectionEvent(connectionEvent);

      // 触发事件
      this.eventBus.emit('network:typeChange', {
        from: oldNetworkType,
        to: this.networkType,
        timestamp: Date.now(),
      });
    }

    // 更新网络质量评估
    this.evaluateNetworkQuality();
  }

  /**
   * 启动定时网速测试
   */
  private startSpeedTest(): void {
    if (this.speedTestTimer) {
      clearInterval(this.speedTestTimer);
    }

    // 立即执行一次
    this.performSpeedTest();

    // 设置定时器
    this.speedTestTimer = setInterval(() => {
      if (this.isOnline) {
        this.performSpeedTest();
      }
    }, this.speedTestInterval);

    this.logger.debug('启动网速定时测试', { interval: this.speedTestInterval });
  }

  /**
   * 执行网速测试
   */
  private async performSpeedTest(): Promise<void> {
    try {
      // 使用SpeedMonitor进行测速
      const result = await this.speedMonitor.runSpeedTest(this.speedTestUrl);

      // 记录RTT样本
      this.stabilityAnalyzer.recordRTTSample(result.latency);

      // 更新网络质量评估
      this.evaluateNetworkQuality();

      // 触发事件
      this.eventBus.emit('network:speedTest', {
        download: result.downloadSpeed,
        upload: result.uploadSpeed,
        latency: result.latency,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.warn('网速测试失败', { error });
    }
  }

  /**
   * 启动定时ping测试
   */
  private startPingTest(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }

    // 设置定时器
    this.pingTimer = setInterval(() => {
      if (this.isOnline) {
        this.performPingTest();
      }
    }, this.pingInterval);

    this.logger.debug('启动ping定时测试', { interval: this.pingInterval });
  }

  /**
   * 执行ping测试
   */
  private async performPingTest(): Promise<void> {
    try {
      const startTime = Date.now();

      // 简单的ping测试
      const response = await fetch(this.pingUrl, {
        method: 'HEAD',
        cache: 'no-cache',
      });

      if (response.ok) {
        const latency = Date.now() - startTime;

        // 记录RTT样本
        this.stabilityAnalyzer.recordRTTSample(latency);

        // 触发事件
        this.eventBus.emit('network:ping', {
          latency,
          timestamp: Date.now(),
        });

        this.logger.debug('Ping测试完成', { latency });
      }
    } catch (error) {
      this.logger.warn('Ping测试失败', { error });
    }
  }

  /**
   * 检测网络状态
   */
  private detectNetworkState(): void {
    // 检测是否在线
    if (this.environmentType === EnvironmentType.BROWSER) {
      this.isOnline = navigator.onLine;

      // 尝试获取网络类型
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          this.updateNetworkType(connection.type);
        }
      }
    }
    // 可以添加其他环境的检测方法

    // 如果在线，评估网络质量
    if (this.isOnline) {
      this.evaluateNetworkQuality();
    } else {
      this.updateNetworkQuality(NetworkQuality.UNUSABLE);
    }
  }

  /**
   * 评估网络质量
   */
  private evaluateNetworkQuality(): void {
    // 构建评估指标
    const metrics: NetworkQualityMetrics = {
      networkType: this.networkType,
      downloadSpeed: this.speedMonitor.getAverageDownloadSpeed(),
      latency: this.speedMonitor.getAverageLatency(),
      latencyVariation: this.stabilityAnalyzer.analyzeStability().jitter,
      recentConnectionChanges:
        this.stabilityAnalyzer.analyzeStability().typeChanges,
      recentDisconnections:
        this.stabilityAnalyzer.analyzeStability().disconnections,
    };

    // 评估网络质量
    const previousQuality = this.currentNetworkQuality;
    const newQuality = this.qualityEvaluator.evaluateNetworkQuality(metrics);

    // 更新质量并触发事件
    if (previousQuality !== newQuality) {
      this.updateNetworkQuality(newQuality);
    }
  }

  /**
   * 更新网络质量
   * @param quality 网络质量
   */
  private updateNetworkQuality(quality: NetworkQuality): void {
    const previousQuality = this.currentNetworkQuality;
    this.currentNetworkQuality = quality;

    if (previousQuality !== quality) {
      this.logger.info('网络质量变化', {
        from: NetworkQualityEvaluator.getQualityDescription(previousQuality),
        to: NetworkQualityEvaluator.getQualityDescription(quality),
      });

      // 记录质量变化事件
      const connectionEvent: ConnectionEvent = {
        timestamp: Date.now(),
        type: 'quality_change',
        previousQuality: previousQuality,
        newQuality: quality,
        isStable: NetworkQualityEvaluator.isNetworkStable(quality),
      };
      this.stabilityAnalyzer.recordConnectionEvent(connectionEvent);

      // 记录到趋势预测器
      this.trendPredictor.recordNetworkQuality(quality);

      // 触发事件
      this.eventBus.emit('network:qualityChange', {
        previousQuality,
        quality,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 更新网络类型
   * @param type 网络类型
   */
  private updateNetworkType(type: string): void {
    // 将浏览器网络类型转换为统一类型
    let networkType = NetworkType.UNKNOWN;

    switch (type) {
      case 'ethernet':
        networkType = NetworkType.ETHERNET;
        break;
      case 'wifi':
        networkType = NetworkType.WIFI;
        break;
      case 'cellular':
        networkType = NetworkType.CELLULAR;
        break;
      case 'none':
        networkType = NetworkType.NONE;
        break;
      default:
        networkType = NetworkType.UNKNOWN;
    }

    // 尝试获取更精确的移动网络类型
    if (networkType === NetworkType.CELLULAR) {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection && connection.effectiveType) {
          switch (connection.effectiveType) {
            case '4g':
              networkType = NetworkType.CELLULAR_4G;
              break;
            case '3g':
              networkType = NetworkType.CELLULAR_3G;
              break;
            case '2g':
              networkType = NetworkType.CELLULAR_2G;
              break;
            case 'slow-2g':
              networkType = NetworkType.CELLULAR_2G;
              break;
          }
        }
      }
    }

    this.networkType = networkType;
  }

  /**
   * 获取当前网络质量
   * @returns 网络质量
   */
  public getCurrentNetworkQuality(): NetworkQuality {
    return this.currentNetworkQuality;
  }

  /**
   * 获取网络条件
   * @returns 网络条件
   */
  public getNetworkCondition(): NetworkCondition {
    const isOnline = this.isOnline;
    const networkType = this.networkType;
    const quality = this.currentNetworkQuality;
    const speedKBps = this.speedMonitor.getAverageDownloadSpeed();
    const latency = this.speedMonitor.getAverageLatency();
    const stability = this.stabilityAnalyzer.analyzeStability();

    return {
      isOnline,
      networkType,
      quality,
      speedKBps,
      latency,
      isStable: stability.isStable,
      jitter: stability.jitter,
      timestamp: Date.now(),
    };
  }

  /**
   * 网络是否在线
   * @returns 是否在线
   */
  public isNetworkOnline(): boolean {
    return this.isOnline;
  }

  /**
   * 获取网络类型
   * @returns 网络类型
   */
  public getNetworkType(): NetworkType {
    return this.networkType;
  }

  /**
   * 获取网络稳定性分析
   * @returns 稳定性分析结果
   */
  public getNetworkStability() {
    return this.stabilityAnalyzer.analyzeStability();
  }

  /**
   * 预测未来网络质量
   * @param timeWindowMs 预测窗口(ms)
   * @returns 网络预测结果
   */
  public predictNetworkQuality(timeWindowMs = 5 * 60 * 1000) {
    return this.trendPredictor.predictNetworkQuality(timeWindowMs);
  }

  /**
   * 获取网络优化建议
   * @returns 建议数组
   */
  public getNetworkOptimizationSuggestions(): string[] {
    return this.trendPredictor.getNetworkOptimizationSuggestions();
  }

  /**
   * 主动触发网络状态检测
   */
  public refreshNetworkState(): Promise<NetworkCondition> {
    return new Promise(resolve => {
      this.detectNetworkState();

      // 执行一次speedTest
      this.performSpeedTest()
        .then(() => {
          const condition = this.getNetworkCondition();
          resolve(condition);
        })
        .catch(() => {
          const condition = this.getNetworkCondition();
          resolve(condition);
        });
    });
  }

  /**
   * 销毁实例，清理资源
   */
  public destroy(): void {
    // 清除定时器
    if (this.speedTestTimer) {
      clearInterval(this.speedTestTimer);
      this.speedTestTimer = null;
    }

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    // 移除浏览器环境的事件监听
    if (this.environmentType === EnvironmentType.BROWSER) {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);

      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          connection.removeEventListener('change', this.handleConnectionChange);
        }
      }
    }

    this.logger.info('NetworkDetector已销毁');
    NetworkDetector.instance = undefined as unknown as NetworkDetector;
  }
}

// 注册DI容器
DependencyContainer.register('NetworkDetector', NetworkDetector);

export default NetworkDetector;
