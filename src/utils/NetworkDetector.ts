/**
 * NetworkDetector - 网络检测工具
 * 用于检测网络状态、质量和特性，提供网络变化监听
 */

import { NetworkQuality, NetworkCondition, NetworkStatus } from '../types';

import { Logger } from './Logger';

// 网络测速结果
export interface SpeedTestResult {
  downloadSpeed: number; // 下载速度 (kb/s)
  uploadSpeed?: number; // 上传速度 (kb/s)
  latency: number; // 延迟 (ms)
  jitter?: number; // 抖动 (ms)
  timestamp: number; // 测试时间戳
}

// 网络检测器配置
export interface NetworkDetectorConfig {
  pingUrl?: string; // ping 测试URL
  speedTestUrl?: string; // 速度测试URL
  sampleSize?: number; // 采样次数
  pingTimeout?: number; // ping超时时间(ms)
  speedTestTimeout?: number; // 速度测试超时时间(ms)
  speedTestSampleSize?: number; // 速度测试采样大小(字节)
  autoRefreshInterval?: number; // 自动刷新间隔(ms)
  enableNetworkListener?: boolean; // 是否启用网络监听
}

// 网络变化回调
type NetworkChangeCallback = (
  status: NetworkStatus,
  condition?: NetworkCondition
) => void;

/**
 * 网络检测器类
 * 提供网络状态检测、速度测试和变化监听功能
 */
export class NetworkDetector {
  private config: NetworkDetectorConfig;
  private currentStatus: NetworkStatus = 'unknown';
  private currentCondition?: NetworkCondition;
  private lastSpeedTest?: SpeedTestResult;
  private refreshInterval?: number;
  private changeListeners: Set<NetworkChangeCallback> = new Set();
  private logger: Logger = new Logger('NetworkDetector');
  private static instance?: NetworkDetector;

  /**
   * 获取网络检测器实例 (单例模式)
   * @param config 配置
   * @returns 网络检测器实例
   */
  public static getInstance(config?: NetworkDetectorConfig): NetworkDetector {
    if (!NetworkDetector.instance) {
      NetworkDetector.instance = new NetworkDetector(config);
    } else if (config) {
      NetworkDetector.instance.updateConfig(config);
    }
    return NetworkDetector.instance;
  }

  /**
   * 构造函数
   * @param config 配置
   */
  private constructor(config?: NetworkDetectorConfig) {
    this.config = {
      pingUrl: 'https://www.google.com/favicon.ico',
      speedTestUrl:
        'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
      sampleSize: 3,
      pingTimeout: 3000,
      speedTestTimeout: 10000,
      speedTestSampleSize: 100 * 1024, // 100KB
      autoRefreshInterval: 60000, // 1分钟
      enableNetworkListener: true,
      ...config,
    };

    // 初始化
    this.initialize();
  }

  /**
   * 初始化网络检测器
   */
  private initialize(): void {
    // 获取当前网络状态
    this.detectNetworkStatus()
      .then(status => {
        this.currentStatus = status;
        this.logger.debug(`初始网络状态: ${status}`);
      })
      .catch(err => {
        this.logger.error('初始网络状态检测失败', err);
      });

    // 获取当前网络条件
    this.detectNetworkCondition()
      .then(condition => {
        this.currentCondition = condition;
        this.logger.debug(`初始网络条件:`, condition);
      })
      .catch(err => {
        this.logger.error('初始网络条件检测失败', err);
      });

    // 设置自动刷新
    if (
      this.config.autoRefreshInterval &&
      this.config.autoRefreshInterval > 0
    ) {
      this.startAutoRefresh();
    }

    // 设置网络变化监听
    if (this.config.enableNetworkListener) {
      this.setupNetworkListener();
    }
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  public updateConfig(config: Partial<NetworkDetectorConfig>): void {
    const prevAutoRefresh = this.config.autoRefreshInterval;
    const prevNetworkListener = this.config.enableNetworkListener;

    // 更新配置
    this.config = { ...this.config, ...config };

    // 如果自动刷新配置变更，重新设置
    if (prevAutoRefresh !== this.config.autoRefreshInterval) {
      this.stopAutoRefresh();
      if (
        this.config.autoRefreshInterval &&
        this.config.autoRefreshInterval > 0
      ) {
        this.startAutoRefresh();
      }
    }

    // 如果网络监听配置变更，重新设置
    if (prevNetworkListener !== this.config.enableNetworkListener) {
      if (this.config.enableNetworkListener) {
        this.setupNetworkListener();
      } else {
        this.removeNetworkListener();
      }
    }
  }

  /**
   * 设置网络变化监听
   */
  private setupNetworkListener(): void {
    if (typeof window !== 'undefined') {
      // 监听在线状态变化
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);

      // 监听Connection API (如果可用)
      if ('connection' in navigator && navigator.connection) {
        const connection = navigator.connection as any;
        if (connection.addEventListener) {
          connection.addEventListener('change', this.handleConnectionChange);
        }
      }
    }
  }

  /**
   * 移除网络变化监听
   */
  private removeNetworkListener(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);

      if ('connection' in navigator && navigator.connection) {
        const connection = navigator.connection as any;
        if (connection.removeEventListener) {
          connection.removeEventListener('change', this.handleConnectionChange);
        }
      }
    }
  }

  /**
   * 处理在线事件
   */
  private handleOnline = (): void => {
    this.currentStatus = 'online';
    this.logger.info('网络已连接');

    // 重新检测网络条件
    this.detectNetworkCondition().then(condition => {
      this.currentCondition = condition;
      this.notifyChangeListeners();
    });
  };

  /**
   * 处理离线事件
   */
  private handleOffline = (): void => {
    this.currentStatus = 'offline';
    this.currentCondition = undefined;
    this.logger.warn('网络已断开');
    this.notifyChangeListeners();
  };

  /**
   * 处理连接变化事件
   */
  private handleConnectionChange = (): void => {
    this.logger.debug('网络连接已变化');

    // 重新检测网络条件
    this.detectNetworkCondition().then(condition => {
      this.currentCondition = condition;
      this.notifyChangeListeners();
    });
  };

  /**
   * 开始自动刷新
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh();

    if (
      this.config.autoRefreshInterval &&
      this.config.autoRefreshInterval > 0
    ) {
      this.refreshInterval = window.setInterval(() => {
        this.refreshNetworkInfo();
      }, this.config.autoRefreshInterval);
    }
  }

  /**
   * 停止自动刷新
   */
  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  /**
   * 刷新网络信息
   */
  public async refreshNetworkInfo(): Promise<void> {
    try {
      // 检测网络状态
      const status = await this.detectNetworkStatus();
      const oldStatus = this.currentStatus;
      this.currentStatus = status;

      // 检测网络条件
      if (status === 'online') {
        const condition = await this.detectNetworkCondition();
        const oldCondition = this.currentCondition;
        this.currentCondition = condition;

        // 如果状态或条件变化，通知监听器
        if (
          oldStatus !== status ||
          JSON.stringify(oldCondition) !== JSON.stringify(condition)
        ) {
          this.notifyChangeListeners();
        }
      } else {
        this.currentCondition = undefined;
        if (oldStatus !== status) {
          this.notifyChangeListeners();
        }
      }
    } catch (error) {
      this.logger.error('刷新网络信息失败', error);
    }
  }

  /**
   * 检测网络状态
   * @returns 网络状态
   */
  public async detectNetworkStatus(): Promise<NetworkStatus> {
    // 如果在浏览器环境，使用navigator.onLine
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine ? 'online' : 'offline';
    }

    // 否则尝试ping服务器
    try {
      await this.ping();
      return 'online';
    } catch (error) {
      return 'offline';
    }
  }

  /**
   * 检测网络条件
   * @returns 网络条件
   */
  public async detectNetworkCondition(): Promise<NetworkCondition> {
    // 默认网络条件
    const defaultCondition: NetworkCondition = {
      type: 'unknown',
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false,
    };

    // 如果在浏览器环境，使用Connection API
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const connection = navigator.connection as any;
      if (connection) {
        return {
          type: connection.type || 'unknown',
          effectiveType: connection.effectiveType || '4g',
          downlink: connection.downlink || 10,
          rtt: connection.rtt || 50,
          saveData: connection.saveData || false,
        };
      }
    }

    // 否则尝试通过ping和速度测试推断
    try {
      // 测量ping
      const pingResult = await this.ping();

      // 根据ping值推断网络类型
      let effectiveType = '4g';
      if (pingResult > 600) {
        effectiveType = '2g';
      } else if (pingResult > 300) {
        effectiveType = '3g';
      }

      return {
        ...defaultCondition,
        effectiveType,
        rtt: pingResult,
      };
    } catch (error) {
      return defaultCondition;
    }
  }

  /**
   * 获取网络质量等级
   * @returns 网络质量
   */
  public getNetworkQuality(): NetworkQuality {
    if (this.currentStatus !== 'online' || !this.currentCondition) {
      return NetworkQuality.UNKNOWN;
    }

    const { effectiveType, rtt, downlink } = this.currentCondition;

    // 基于有效网络类型
    if (effectiveType === '2g' || rtt > 600) {
      return NetworkQuality.POOR;
    }

    if (effectiveType === '3g' || (rtt > 300 && rtt <= 600)) {
      return NetworkQuality.FAIR;
    }

    if (effectiveType === '4g' || (rtt <= 300 && rtt > 100)) {
      return NetworkQuality.GOOD;
    }

    if (effectiveType === '5g' || rtt <= 100 || downlink >= 10) {
      return NetworkQuality.EXCELLENT;
    }

    return NetworkQuality.GOOD; // 默认为良好
  }

  /**
   * Ping测试
   * @returns 延迟时间 (ms)
   */
  public async ping(): Promise<number> {
    const pingUrl = this.config.pingUrl || 'https://www.google.com/favicon.ico';
    const timeout = this.config.pingTimeout || 3000;
    const sampleSize = this.config.sampleSize || 3;

    const results: number[] = [];

    for (let i = 0; i < sampleSize; i++) {
      try {
        const start = Date.now();

        // 添加时间戳和随机数防止缓存
        const url = `${pingUrl}?t=${Date.now()}&r=${Math.random()}`;

        // 使用fetch API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const end = Date.now();
        results.push(end - start);
      } catch (error) {
        // 如果超时或其他错误，记录一个大值
        results.push(timeout);
      }
    }

    // 计算平均ping (去除最高值和最低值后)
    if (results.length >= 3) {
      results.sort((a, b) => a - b);
      results.pop(); // 移除最高值
      results.shift(); // 移除最低值
    }

    // 计算平均值
    const sum = results.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / results.length);
  }

  /**
   * 速度测试
   * @returns 速度测试结果
   */
  public async speedTest(): Promise<SpeedTestResult> {
    const start = Date.now();
    const speedTestUrl = this.config.speedTestUrl;
    const timeout = this.config.speedTestTimeout || 10000;

    try {
      // 创建abort控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // 发起请求并测量时间
      const response = await fetch(`${speedTestUrl}?t=${Date.now()}`, {
        signal: controller.signal,
        cache: 'no-store',
      });

      const blob = await response.blob();
      clearTimeout(timeoutId);

      const end = Date.now();
      const duration = (end - start) / 1000; // 秒

      // 计算下载速度 (kb/s)
      const fileSize = blob.size / 1024; // KB
      const downloadSpeed = fileSize / duration;

      // 计算大致延迟
      const latency = await this.ping();

      this.lastSpeedTest = {
        downloadSpeed,
        latency,
        timestamp: Date.now(),
      };

      return this.lastSpeedTest;
    } catch (error) {
      this.logger.error('速度测试失败', error);

      // 返回一个默认结果
      return {
        downloadSpeed: 0,
        latency: timeout,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 获取当前网络状态
   * @returns 网络状态
   */
  public getNetworkStatus(): NetworkStatus {
    return this.currentStatus;
  }

  /**
   * 获取当前网络条件
   * @returns 网络条件
   */
  public getNetworkCondition(): NetworkCondition | undefined {
    return this.currentCondition;
  }

  /**
   * 获取最后一次速度测试结果
   * @returns 速度测试结果
   */
  public getLastSpeedTest(): SpeedTestResult | undefined {
    return this.lastSpeedTest;
  }

  /**
   * 添加网络变化监听器
   * @param callback 回调函数
   */
  public addChangeListener(callback: NetworkChangeCallback): void {
    this.changeListeners.add(callback);
  }

  /**
   * 移除网络变化监听器
   * @param callback 回调函数
   */
  public removeChangeListener(callback: NetworkChangeCallback): void {
    this.changeListeners.delete(callback);
  }

  /**
   * 通知所有变化监听器
   */
  private notifyChangeListeners(): void {
    for (const callback of this.changeListeners) {
      try {
        callback(this.currentStatus, this.currentCondition);
      } catch (error) {
        this.logger.error('网络变化回调执行失败', error);
      }
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.stopAutoRefresh();
    this.removeNetworkListener();
    this.changeListeners.clear();
  }
}

export default NetworkDetector;
