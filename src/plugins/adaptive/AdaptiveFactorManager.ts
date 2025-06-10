/**
 * AdaptiveFactorManager - 自适应因子管理器
 *
 * 功能:
 * 1. 管理上传调整的各种自适应因子
 * 2. 根据设备性能计算适应因子
 * 3. 根据网络质量计算适应因子
 * 4. 根据RTT计算适应因子
 * 5. 应用所有因子计算最终并发调整值
 */

import { NetworkQuality } from '../../types';
import { ExtendedDeviceCapability } from '../evaluators/DeviceCapabilityEvaluator';

export interface AdaptiveFactors {
  device: number; // 设备性能因子 (0.5-1.5)
  network: number; // 网络质量因子 (0.5-1.5)
  rtt: number; // RTT因子 (0.5-1.5)
  progress?: number; // 进度因子 (0.8-1.2)
  fileSize?: number; // 文件大小因子 (0.8-1.2)
  errorRate?: number; // 错误率因子 (0.5-1.0)
  jitter?: number; // 网络抖动因子 (0.7-1.0)
}

export class AdaptiveFactorManager {
  private factors: Map<string, number> = new Map();

  constructor() {
    // 初始化默认因子
    this.factors.set('device', 1.0);
    this.factors.set('network', 1.0);
    this.factors.set('rtt', 1.0);
    this.factors.set('progress', 1.0);
    this.factors.set('fileSize', 1.0);
    this.factors.set('errorRate', 1.0);
    this.factors.set('jitter', 1.0);
  }

  /**
   * 计算设备性能因子
   */
  public calculateDeviceFactor(
    deviceCapabilities: ExtendedDeviceCapability
  ): number {
    const { overallPerformanceScore } = deviceCapabilities;

    // 设置设备性能因子 (0.5-1.5)
    return 0.5 + overallPerformanceScore / 10;
  }

  /**
   * 计算网络质量因子
   */
  public calculateNetworkFactor(networkQuality: NetworkQuality): number {
    // 网络质量转换为数字
    const qualityLevel = this.qualityToLevel(networkQuality);

    // 设置网络质量因子 (0.5-1.5)
    return 0.5 + qualityLevel / 8;
  }

  /**
   * 计算RTT因子
   */
  public calculateRttFactor(avgRTT: number): number {
    // 设置RTT因子 (0.5-1.5)
    return avgRTT <= 50
      ? 1.5 // 非常低的延迟
      : avgRTT <= 100
        ? 1.3 // 低延迟
        : avgRTT <= 200
          ? 1.0 // 正常延迟
          : avgRTT <= 500
            ? 0.7 // 高延迟
            : 0.5; // 非常高的延迟
  }

  /**
   * 计算进度因子
   */
  public calculateProgressFactor(progress: number): number {
    // 上传初期
    if (progress < 0.2) {
      return 1.0;
    }
    // 上传中期
    else if (progress < 0.5) {
      return 1.1;
    }
    // 上传后期
    else if (progress < 0.8) {
      return 1.2;
    }
    // 上传尾声
    else if (progress < 0.95) {
      return 1.1;
    }
    // 几乎完成
    else {
      return 0.9; // 减少资源占用
    }
  }

  /**
   * 计算文件大小因子
   */
  public calculateFileSizeFactor(fileSize: number): number {
    // 小文件
    if (fileSize < 1024 * 1024) {
      // < 1MB
      return 0.8;
    }
    // 中小文件
    else if (fileSize < 10 * 1024 * 1024) {
      // < 10MB
      return 0.9;
    }
    // 中型文件
    else if (fileSize < 100 * 1024 * 1024) {
      // < 100MB
      return 1.0;
    }
    // 大文件
    else if (fileSize < 1024 * 1024 * 1024) {
      // < 1GB
      return 1.1;
    }
    // 超大文件
    else {
      return 1.2;
    }
  }

  /**
   * 计算错误率因子
   */
  public calculateErrorRateFactor(errorRate: number): number {
    // 错误率越高，因子越低
    return Math.max(0.5, 1.0 - errorRate * 0.5);
  }

  /**
   * 计算网络抖动因子
   */
  public calculateJitterFactor(jitterValue: number, avgRTT: number): number {
    if (avgRTT <= 0) return 1.0;

    // 计算抖动比例
    const jitterRatio = jitterValue / avgRTT;

    // 根据抖动比例计算因子
    if (jitterRatio > 0.5) {
      // 严重抖动
      return 0.7;
    } else if (jitterRatio > 0.3) {
      // 中度抖动
      return 0.8;
    } else if (jitterRatio > 0.1) {
      // 轻微抖动
      return 0.9;
    } else {
      // 稳定网络
      return 1.0;
    }
  }

  /**
   * 设置因子值
   */
  public setFactor(name: string, value: number): void {
    this.factors.set(name, value);
  }

  /**
   * 获取因子值
   */
  public getFactor(name: string): number {
    return this.factors.get(name) || 1.0;
  }

  /**
   * 获取所有因子
   */
  public getAllFactors(): AdaptiveFactors {
    return {
      device: this.getFactor('device'),
      network: this.getFactor('network'),
      rtt: this.getFactor('rtt'),
      progress: this.getFactor('progress'),
      fileSize: this.getFactor('fileSize'),
      errorRate: this.getFactor('errorRate'),
      jitter: this.getFactor('jitter'),
    };
  }

  /**
   * 应用所有因子计算并发调整值
   * @param baseConcurrency 基础并发数
   */
  public applyFactors(baseConcurrency: number): number {
    let adjustedConcurrency = baseConcurrency;

    // 应用设备性能因子
    adjustedConcurrency *= this.factors.get('device') || 1.0;

    // 应用网络质量因子
    adjustedConcurrency *= this.factors.get('network') || 1.0;

    // 应用RTT因子
    adjustedConcurrency *= this.factors.get('rtt') || 1.0;

    // 应用进度因子
    if (this.factors.has('progress')) {
      adjustedConcurrency *= this.factors.get('progress') || 1.0;
    }

    // 应用文件大小因子
    if (this.factors.has('fileSize')) {
      adjustedConcurrency *= this.factors.get('fileSize') || 1.0;
    }

    // 应用错误率因子
    if (this.factors.has('errorRate')) {
      adjustedConcurrency *= this.factors.get('errorRate') || 1.0;
    }

    // 应用抖动因子
    if (this.factors.has('jitter')) {
      adjustedConcurrency *= this.factors.get('jitter') || 1.0;
    }

    // 四舍五入
    return Math.round(adjustedConcurrency);
  }

  /**
   * 重置所有因子
   */
  public resetFactors(): void {
    this.factors.clear();
    this.factors.set('device', 1.0);
    this.factors.set('network', 1.0);
    this.factors.set('rtt', 1.0);
    this.factors.set('progress', 1.0);
    this.factors.set('fileSize', 1.0);
    this.factors.set('errorRate', 1.0);
    this.factors.set('jitter', 1.0);
  }

  /**
   * 网络质量级别转换为数值
   */
  private qualityToLevel(quality: NetworkQuality): number {
    switch (quality) {
      case NetworkQuality.POOR:
        return 1;
      case NetworkQuality.LOW:
        return 2;
      case NetworkQuality.MEDIUM:
        return 3;
      case NetworkQuality.GOOD:
        return 4;
      case NetworkQuality.EXCELLENT:
        return 5;
      case NetworkQuality.UNKNOWN:
      default:
        return 3; // 默认中等
    }
  }
}
