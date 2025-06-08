/**
 * MemoryManager - 内存管理工具
 * 提供内存使用估计与优化功能
 */

import { Environment } from '../types';

import EnvUtils from './EnvUtils';

// 为可能不存在的performance.memory添加类型声明
declare global {
  interface Performance {
    memory?: {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    };
  }
}

export class MemoryManager {
  /**
   * 估计当前可用内存
   * @returns 估计的可用内存大小（字节）
   */
  static estimateAvailableMemory(): number {
    // 浏览器环境尝试使用performance API
    if (
      typeof performance !== 'undefined' &&
      performance.memory &&
      performance.memory.jsHeapSizeLimit
    ) {
      const used = performance.memory.usedJSHeapSize;
      const total = performance.memory.jsHeapSizeLimit;
      return total - used;
    }

    // 回退到保守估计
    const env = EnvUtils.detectEnvironment();
    switch (env) {
      case Environment.WechatMP:
      case Environment.AlipayMP:
      case Environment.BytedanceMP:
        return 100 * 1024 * 1024; // 小程序环境假设 100MB
      case Environment.Browser:
        return 500 * 1024 * 1024; // 浏览器环境假设 500MB
      default:
        return 200 * 1024 * 1024; // 默认假设 200MB
    }
  }

  /**
   * 动态调整最佳分片大小
   * @param fileSize 文件大小
   * @param preferredSize 用户指定的优先大小
   * @returns 计算出的最佳分片大小（字节）
   */
  static getOptimalChunkSize(
    fileSize: number,
    preferredSize: number | 'auto'
  ): number {
    // 基于文件大小的基础策略
    let baseSize: number;
    if (fileSize <= 10 * 1024 * 1024) {
      baseSize = 1024 * 1024; // <10MB: 1MB分片
    } else if (fileSize <= 100 * 1024 * 1024) {
      baseSize = 5 * 1024 * 1024; // <100MB: 5MB分片
    } else if (fileSize <= 1024 * 1024 * 1024) {
      baseSize = 10 * 1024 * 1024; // <1GB: 10MB分片
    } else {
      baseSize = 20 * 1024 * 1024; // >1GB: 20MB分片
    }

    // 如果指定了优先大小并且不是'auto'
    if (preferredSize !== 'auto' && typeof preferredSize === 'number') {
      baseSize = preferredSize;
    }

    // 内存安全检查
    const availableMemory = this.estimateAvailableMemory();
    const safeMemorySize = availableMemory / 4; // 使用1/4可用内存作为安全上限

    // 环境特定限制
    const env = EnvUtils.detectEnvironment();
    let envLimit = Number.MAX_SAFE_INTEGER;

    switch (env) {
      case Environment.WechatMP:
        envLimit = 10 * 1024 * 1024; // 微信小程序文件操作限制10MB
        break;
      case Environment.AlipayMP:
        envLimit = 10 * 1024 * 1024; // 支付宝小程序限制
        break;
      case Environment.BytedanceMP:
        envLimit = 10 * 1024 * 1024; // 字节跳动小程序限制
        break;
    }

    // 取三者的最小值
    return Math.min(baseSize, safeMemorySize, envLimit);
  }

  /**
   * 检查是否需要释放内存
   * @returns 是否需要清理内存
   */
  static needsMemoryCleanup(): boolean {
    if (
      typeof performance !== 'undefined' &&
      performance.memory &&
      performance.memory.jsHeapSizeLimit
    ) {
      const used = performance.memory.usedJSHeapSize;
      const total = performance.memory.jsHeapSizeLimit;
      // 当使用超过80%时建议清理
      return used / total > 0.8;
    }
    return false;
  }
}

export default MemoryManager;
