/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * DeviceCapabilityEvaluator - 设备能力评估器
 *
 * 功能:
 * 1. 评估设备CPU性能
 * 2. 评估设备内存性能
 * 3. 评估网络稳定性
 * 4. 计算综合设备性能得分
 */

import { DeviceCapability } from '../../types';
import MemoryManager from '../../utils/MemoryManager';

// 扩展的设备能力评估
export interface ExtendedDeviceCapability extends DeviceCapability {
  cpuScore: number; // CPU性能得分
  memoryScore: number; // 内存性能得分
  networkStabilityScore: number; // 网络稳定性得分
  overallPerformanceScore: number; // 综合性能得分
}

export class DeviceCapabilityEvaluator {
  /**
   * 评估设备能力
   * @param rttSamples RTT样本数据
   * @returns 扩展的设备能力信息
   */
  public static evaluateDeviceCapabilities(
    rttSamples: number[] = []
  ): ExtendedDeviceCapability {
    // 检测基本环境能力
    const baseCapabilities = this.detectBasicEnvironmentCapabilities();

    // 获取CPU性能得分
    const cpuScore = this.evaluateCPUPerformance();

    // 获取内存性能得分
    const memoryScore = this.evaluateMemoryPerformance(baseCapabilities);

    // 获取网络稳定性得分
    const networkStabilityScore = this.evaluateNetworkStability(rttSamples);

    // 计算综合性能得分 (权重可调整)
    const overallPerformanceScore =
      cpuScore * 0.3 + memoryScore * 0.3 + networkStabilityScore * 0.4;

    return {
      ...baseCapabilities,
      cpuScore,
      memoryScore,
      networkStabilityScore,
      overallPerformanceScore,
    };
  }

  /**
   * 检测基本环境能力
   */
  private static detectBasicEnvironmentCapabilities(): DeviceCapability {
    try {
      const memory = MemoryManager.getMemoryInfo();
      const isLowMemoryDevice =
        memory && memory.totalJSHeapSize < 100 * 1024 * 1024;
      const isLowEndCPU = this.isLowEndCPU();
      const isMobileDevice = this.isMobileDevice();

      // 初始化基本设备能力对象
      return {
        memory: memory
          ? {
              total: memory.totalJSHeapSize,
              used: memory.usedJSHeapSize,
              limit: memory.jsHeapSizeLimit,
            }
          : undefined,
        isLowEndDevice: isLowMemoryDevice || isLowEndCPU,
        isLowMemoryDevice,
        isLowBandwidth: false, // 这个将由网络检测器提供
        isMobile: isMobileDevice,
      };
    } catch (error) {
      console.warn('设备能力检测失败', error);
      return {
        isLowEndDevice: false,
        isLowMemoryDevice: false,
        isLowBandwidth: false,
        isMobile: this.isMobileDevice(),
      };
    }
  }

  /**
   * 评估CPU性能
   */
  private static evaluateCPUPerformance(): number {
    // 简单CPU性能测试
    try {
      const start = performance.now();
      let result = 0;
      for (let i = 0; i < 1000000; i++) {
        result += Math.sqrt(i);
      }
      const duration = performance.now() - start;

      // 计算得分 - 时间越短得分越高 (1-10分)
      return Math.min(10, Math.max(1, 10 * (100 / Math.max(duration, 10))));
    } catch (e) {
      // 出错时返回中等得分
      return 5;
    }
  }

  /**
   * 评估内存性能
   */
  private static evaluateMemoryPerformance(
    deviceCapabilities: DeviceCapability
  ): number {
    try {
      if (!deviceCapabilities?.memory) return 5;

      const { total, limit } = deviceCapabilities.memory;

      // 根据可用内存与限制的比例计算得分
      const ratio = total / limit;

      // 计算得分 (1-10分)
      return Math.min(10, Math.max(1, ratio * 10));
    } catch (e) {
      return 5; // 出错时返回中等得分
    }
  }

  /**
   * 评估网络稳定性
   */
  private static evaluateNetworkStability(rttSamples: number[]): number {
    try {
      // 基于历史RTT计算网络稳定性
      if (rttSamples.length < 3) return 5;

      const rtts = rttSamples.slice(-10); // 最近10个样本
      if (rtts.length <= 1) return 5;

      // 计算标准差
      const avg = rtts.reduce((sum, rtt) => sum + rtt, 0) / rtts.length;
      const variance =
        rtts.reduce((sum, rtt) => sum + Math.pow(rtt - avg, 2), 0) /
        rtts.length;
      const stdDev = Math.sqrt(variance);

      // 标准差与平均值的比值越小越稳定
      const stabilityRatio = stdDev / avg;

      // 计算得分: 1-10分，比值越小得分越高
      return Math.min(10, Math.max(1, 10 * (1 - Math.min(1, stabilityRatio))));
    } catch (e) {
      return 5; // 出错时返回中等得分
    }
  }

  /**
   * 判断是否为低端CPU
   */
  private static isLowEndCPU(): boolean {
    try {
      // 简单的CPU性能测试
      const start = performance.now();
      let result = 0;
      for (let i = 0; i < 500000; i++) {
        result += Math.sqrt(i);
      }
      const duration = performance.now() - start;

      // 如果处理时间超过200ms，认为是低端CPU
      return duration > 200;
    } catch (e) {
      return false;
    }
  }

  /**
   * 判断是否为移动设备
   */
  private static isMobileDevice(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    );
  }
}
