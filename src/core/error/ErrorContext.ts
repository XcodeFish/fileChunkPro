/**
 * 错误上下文收集模块
 * 负责收集错误发生时的环境、网络等上下文信息
 */

import { ErrorContextData, NetworkQuality } from '../../types/errors';

/**
 * 错误上下文收集器配置选项
 */
export interface ErrorContextOptions {
  /** 是否收集网络信息 */
  collectNetworkInfo: boolean;
  /** 是否收集环境信息 */
  collectEnvironmentInfo: boolean;
  /** 自定义网络质量评估器 */
  networkQualityEvaluator?: () => Promise<NetworkQuality>;
}

/**
 * 错误上下文收集器
 * 负责提取和管理与错误相关的环境、网络和运行时上下文信息
 */
export class ErrorContext {
  /** 当前网络质量 */
  private currentNetworkQuality: NetworkQuality = NetworkQuality.GOOD;

  /** 配置选项 */
  private options: ErrorContextOptions = {
    collectNetworkInfo: true,
    collectEnvironmentInfo: true,
  };

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options?: Partial<ErrorContextOptions>) {
    this.options = { ...this.options, ...options };

    // 初始化网络监控
    if (this.options.collectNetworkInfo) {
      this.setupNetworkMonitoring();
    }
  }

  /**
   * 设置网络监控
   */
  private setupNetworkMonitoring(): void {
    // 监听网络在线状态
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'online',
        this.handleOnlineStatusChange.bind(this)
      );
      window.addEventListener(
        'offline',
        this.handleOnlineStatusChange.bind(this)
      );
    }

    // 初始网络质量评估
    this.evaluateNetworkQuality()
      .then(quality => {
        this.currentNetworkQuality = quality;
      })
      .catch(() => {
        // 评估失败默认为良好
        this.currentNetworkQuality = NetworkQuality.GOOD;
      });
  }

  /**
   * 处理网络状态变化
   */
  private handleOnlineStatusChange(): void {
    // 重新评估网络质量
    this.evaluateNetworkQuality()
      .then(quality => {
        this.currentNetworkQuality = quality;
      })
      .catch(() => {
        // 评估失败，根据在线状态设置基本质量
        const isOnline =
          typeof navigator !== 'undefined' ? navigator.onLine : true;
        this.currentNetworkQuality = isOnline
          ? NetworkQuality.FAIR
          : NetworkQuality.POOR;
      });
  }

  /**
   * 评估网络质量
   * @returns 网络质量等级
   */
  public async evaluateNetworkQuality(): Promise<NetworkQuality> {
    // 如果有自定义评估器，优先使用
    if (this.options.networkQualityEvaluator) {
      return this.options.networkQualityEvaluator();
    }

    // 使用默认评估逻辑
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const conn = (navigator as any).connection;

      if (conn) {
        // 先判断是否在线
        if (!navigator.onLine) {
          return NetworkQuality.POOR;
        }

        // 根据下行速率评估
        if (conn.downlink !== undefined) {
          if (conn.downlink >= 10) {
            return NetworkQuality.EXCELLENT;
          } else if (conn.downlink >= 5) {
            return NetworkQuality.GOOD;
          } else if (conn.downlink >= 1) {
            return NetworkQuality.FAIR;
          } else {
            return NetworkQuality.POOR;
          }
        }

        // 根据有效连接类型评估
        if (conn.effectiveType !== undefined) {
          switch (conn.effectiveType) {
            case '4g':
              return NetworkQuality.EXCELLENT;
            case '3g':
              return NetworkQuality.GOOD;
            case '2g':
              return NetworkQuality.FAIR;
            case 'slow-2g':
              return NetworkQuality.POOR;
            default:
              return NetworkQuality.GOOD;
          }
        }
      }
    }

    // 无法评估，默认为良好
    return NetworkQuality.GOOD;
  }

  /**
   * 获取当前网络质量
   */
  public getCurrentNetworkQuality(): NetworkQuality {
    return this.currentNetworkQuality;
  }

  /**
   * 创建错误上下文数据
   * @returns 错误上下文数据
   */
  public createContext(): ErrorContextData {
    return {
      timestamp: Date.now(),
      network: this.options.collectNetworkInfo
        ? this.getNetworkInfo()
        : undefined,
      environment: this.options.collectEnvironmentInfo
        ? this.getEnvironmentInfo()
        : undefined,
    };
  }

  /**
   * 获取网络信息
   */
  private getNetworkInfo() {
    return {
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      type: this.getNetworkType(),
      downlink: this.getNetworkDownlink(),
      rtt: this.getNetworkRtt(),
      quality: this.currentNetworkQuality,
    };
  }

  /**
   * 获取网络类型
   */
  private getNetworkType(): string | undefined {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return undefined;
    }

    const conn = (navigator as any).connection;
    return conn?.type || conn?.effectiveType;
  }

  /**
   * 获取网络下行速率
   */
  private getNetworkDownlink(): number | undefined {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return undefined;
    }

    const conn = (navigator as any).connection;
    return conn?.downlink;
  }

  /**
   * 获取网络往返时间
   */
  private getNetworkRtt(): number | undefined {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return undefined;
    }

    const conn = (navigator as any).connection;
    return conn?.rtt;
  }

  /**
   * 获取环境信息
   */
  private getEnvironmentInfo() {
    return {
      runtime: this.getRuntimeEnvironment(),
      browser: this.getBrowserInfo(),
      os: this.getOSInfo(),
      memory: this.getMemoryStats(),
    };
  }

  /**
   * 获取运行环境
   */
  private getRuntimeEnvironment(): string | undefined {
    if (typeof window === 'undefined') {
      return 'node';
    }

    if (typeof wx !== 'undefined' && (wx as any).getSystemInfoSync) {
      return 'wechat';
    }

    if (typeof my !== 'undefined' && (my as any).getSystemInfoSync) {
      return 'alipay';
    }

    return 'browser';
  }

  /**
   * 获取浏览器信息
   */
  private getBrowserInfo(): { name: string; version: string } | undefined {
    if (typeof window === 'undefined' || !('navigator' in window)) {
      return undefined;
    }

    const ua = navigator.userAgent;
    let browserName = 'unknown';
    let version = 'unknown';

    if (/Edge/.test(ua)) {
      browserName = 'Edge';
      version = ua.match(/Edge\/(\d+)/)?.[1] || 'unknown';
    } else if (/Chrome/.test(ua)) {
      browserName = 'Chrome';
      version = ua.match(/Chrome\/(\d+)/)?.[1] || 'unknown';
    } else if (/Firefox/.test(ua)) {
      browserName = 'Firefox';
      version = ua.match(/Firefox\/(\d+)/)?.[1] || 'unknown';
    } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
      browserName = 'Safari';
      version = ua.match(/Version\/(\d+)/)?.[1] || 'unknown';
    } else if (/MSIE/.test(ua) || /Trident/.test(ua)) {
      browserName = 'IE';
      version = ua.match(/(MSIE |rv:)(\d+)/)?.[2] || 'unknown';
    }

    return { name: browserName, version };
  }

  /**
   * 获取操作系统信息
   */
  private getOSInfo(): { name: string; version: string } | undefined {
    if (typeof window === 'undefined' || !('navigator' in window)) {
      return undefined;
    }

    const ua = navigator.userAgent;
    let osName = 'unknown';
    let version = 'unknown';

    if (/(iPhone|iPad|iPod)/.test(ua)) {
      osName = 'iOS';
      version = ua.match(/OS (\d+)_/)?.[1] || 'unknown';
    } else if (/Android/.test(ua)) {
      osName = 'Android';
      version = ua.match(/Android (\d+)/)?.[1] || 'unknown';
    } else if (/Win/.test(ua)) {
      osName = 'Windows';
      if (/Windows NT 10.0/.test(ua)) {
        version = '10';
      } else if (/Windows NT 6.3/.test(ua)) {
        version = '8.1';
      } else if (/Windows NT 6.2/.test(ua)) {
        version = '8';
      } else if (/Windows NT 6.1/.test(ua)) {
        version = '7';
      }
    } else if (/Mac/.test(ua)) {
      osName = 'macOS';
      version = ua.match(/Mac OS X (\d+)[._](\d+)/)?.[1] || 'unknown';
    } else if (/Linux/.test(ua)) {
      osName = 'Linux';
    }

    return { name: osName, version };
  }

  /**
   * 获取内存统计信息
   */
  private getMemoryStats():
    | {
        totalJSHeapSize?: number;
        usedJSHeapSize?: number;
        jsHeapSizeLimit?: number;
        availableMemoryPercentage?: number;
      }
    | undefined {
    if (
      typeof window === 'undefined' ||
      !('performance' in window) ||
      !('memory' in performance)
    ) {
      return undefined;
    }

    const memory = (performance as any).memory;
    if (!memory) {
      return undefined;
    }

    return {
      totalJSHeapSize: memory.totalJSHeapSize,
      usedJSHeapSize: memory.usedJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      availableMemoryPercentage:
        memory.jsHeapSizeLimit > 0
          ? (1 - memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
          : undefined,
    };
  }

  /**
   * 销毁并清理资源
   */
  public destroy(): void {
    // 移除事件监听
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnlineStatusChange);
      window.removeEventListener('offline', this.handleOnlineStatusChange);
    }
  }
}
