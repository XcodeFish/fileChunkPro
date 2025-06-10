/**
 * ConcurrencyStrategy - 并发策略计算
 *
 * 负责根据不同条件计算并发数:
 * 1. 基于文件大小的并发策略
 * 2. 基于上传进度的并发策略
 * 3. 基于RTT的并发调整
 * 4. 网络质量评级转换
 */

import { NetworkQuality } from '../../types';

// 文件大小分段并发策略
export interface FileSizeConcurrencyStrategy {
  size: number; // 文件大小阈值（字节）
  maxConcurrency: number; // 该大小下的最大并发数
  concurrencyFactor: number; // 并发调整因子
}

// 分段上传时的并发策略
export interface ProgressConcurrencyStrategy {
  progress: number; // 进度百分比阈值
  concurrencyFactor: number; // 并发调整因子
}

// 增加文件大小分段策略
export const FILE_SIZE_CONCURRENCY_STRATEGIES: FileSizeConcurrencyStrategy[] = [
  { size: 1024 * 1024, maxConcurrency: 2, concurrencyFactor: 0.8 }, // 1MB
  { size: 10 * 1024 * 1024, maxConcurrency: 3, concurrencyFactor: 0.9 }, // 10MB
  { size: 100 * 1024 * 1024, maxConcurrency: 4, concurrencyFactor: 1.0 }, // 100MB
  { size: 1024 * 1024 * 1024, maxConcurrency: 6, concurrencyFactor: 1.1 }, // 1GB
  { size: Number.MAX_SAFE_INTEGER, maxConcurrency: 8, concurrencyFactor: 1.2 }, // >1GB
];

// 增加上传进度分段策略
export const PROGRESS_CONCURRENCY_STRATEGIES: ProgressConcurrencyStrategy[] = [
  { progress: 0.2, concurrencyFactor: 1.0 }, // 开始阶段
  { progress: 0.5, concurrencyFactor: 1.1 }, // 中期阶段
  { progress: 0.8, concurrencyFactor: 1.2 }, // 即将完成阶段
  { progress: 0.95, concurrencyFactor: 0.9 }, // 最终阶段，减少并发避免资源浪费
];

// 默认网络质量速度阈值（单位：kb/s）
export const DEFAULT_NETWORK_QUALITY_THRESHOLD = {
  [NetworkQuality.POOR]: 50, // 50 KB/s
  [NetworkQuality.LOW]: 200, // 200 KB/s
  [NetworkQuality.MEDIUM]: 500, // 500 KB/s
  [NetworkQuality.GOOD]: 1000, // 1 MB/s
  [NetworkQuality.EXCELLENT]: 2000, // 2 MB/s
};

// 极端网络场景定义
export const EXTREME_NETWORK_CONDITIONS = {
  highPacketLoss: 0.15, // 15%以上丢包率视为高丢包
  highLatencyVariation: 200, // 200ms以上的延迟变化视为高延迟变化
  extremelyPoorConnection: 20, // 20KB/s以下视为极差网络
  connectionFlapping: 5, // 5秒内网络状态变化超过3次视为抖动连接
};

export class ConcurrencyStrategy {
  /**
   * 根据文件大小获取基础并发数
   */
  public static getFileSizeBasedConcurrency(
    fileSize: number,
    baseConcurrency: number
  ): number {
    if (fileSize <= 0) return baseConcurrency;

    // 查找适合当前文件大小的策略
    for (const strategy of FILE_SIZE_CONCURRENCY_STRATEGIES) {
      if (fileSize <= strategy.size) {
        return Math.min(
          strategy.maxConcurrency,
          Math.round(baseConcurrency * strategy.concurrencyFactor)
        );
      }
    }

    // 默认使用基础并发数
    return baseConcurrency;
  }

  /**
   * 根据上传进度获取调整因子
   */
  public static getProgressBasedFactor(currentProgress: number): number {
    if (currentProgress <= 0) return 1.0;

    // 查找适合当前进度的策略
    for (let i = PROGRESS_CONCURRENCY_STRATEGIES.length - 1; i >= 0; i--) {
      const strategy = PROGRESS_CONCURRENCY_STRATEGIES[i];
      if (currentProgress >= strategy.progress) {
        return strategy.concurrencyFactor;
      }
    }

    // 默认使用1.0
    return 1.0;
  }

  /**
   * 计算动态减少因子
   * @param errorReduceFactor 基础错误减少因子
   * @param networkQuality 当前网络质量
   */
  public static calculateDynamicReductionFactor(
    errorReduceFactor: number,
    networkQuality: NetworkQuality
  ): number {
    // 基础减少因子
    const baseFactor = errorReduceFactor;

    // 根据网络质量调整因子
    const qualityAdjustment =
      networkQuality === NetworkQuality.POOR
        ? 0.1
        : networkQuality === NetworkQuality.LOW
          ? 0.05
          : 0;

    // 最终因子
    return Math.max(0.5, baseFactor - qualityAdjustment);
  }

  /**
   * 根据RTT动态调整并发数
   */
  public static adjustConcurrencyByRTT(
    concurrency: number,
    avgRTT: number,
    rttVariation: number,
    rttTrend: 'increasing' | 'decreasing' | 'stable',
    minConcurrency: number,
    maxConcurrency: number
  ): number {
    if (avgRTT <= 0) return concurrency;

    // 根据RTT和趋势调整并发数
    if (rttTrend === 'increasing' && rttVariation > 50) {
      // RTT快速增长，降低并发
      return Math.max(minConcurrency, Math.floor(concurrency * 0.9));
    } else if (rttTrend === 'decreasing' && avgRTT < 200) {
      // RTT降低且绝对值小，可以适度增加并发
      return Math.min(maxConcurrency, Math.ceil(concurrency * 1.05));
    } else if (avgRTT > 500) {
      // RTT过高，降低并发
      return Math.max(minConcurrency, Math.floor(concurrency * 0.85));
    }

    return concurrency;
  }

  /**
   * 网络质量级别转换为数值
   */
  public static qualityToLevel(quality: NetworkQuality): number {
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
