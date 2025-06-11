/**
 * 降级处理系统
 * 负责在出现错误时进行功能降级处理，确保系统可用性
 */

import { EventBus } from './EventBus';
import { UploadErrorType } from '../types';
import { Logger } from '../utils/Logger';

/**
 * 功能降级状态
 */
export enum DegradationLevel {
  /** 正常模式 */
  NORMAL = 'normal',
  /** 轻度降级 */
  LIGHT = 'light',
  /** 中度降级 */
  MODERATE = 'moderate',
  /** 重度降级 */
  SEVERE = 'severe',
  /** 应急模式 */
  EMERGENCY = 'emergency',
}

/**
 * 功能健康状态记录
 */
interface FeatureHealth {
  /** 错误计数 */
  errorCount: number;
  /** 上次错误时间 */
  lastError?: Date;
  /** 上次错误类型 */
  lastErrorType?: UploadErrorType;
  /** 上次错误消息 */
  lastErrorMessage?: string;
  /** 当前降级级别 */
  degradationLevel: DegradationLevel;
  /** 降级历史 */
  degradationHistory: Array<{
    timestamp: Date;
    fromLevel: DegradationLevel;
    toLevel: DegradationLevel;
    reason: string;
  }>;
  /** 恢复尝试次数 */
  recoveryAttempts: number;
  /** 下次恢复尝试时间 */
  nextRecoveryAttempt?: Date;
}

/**
 * 功能降级配置
 */
interface FeatureDegradationConfig {
  /** 功能标识 */
  featureId: string;
  /** 功能描述 */
  description?: string;
  /** 降级阈值 - 轻度 */
  lightThreshold?: number;
  /** 降级阈值 - 中度 */
  moderateThreshold?: number;
  /** 降级阈值 - 重度 */
  severeThreshold?: number;
  /** 降级阈值 - 应急 */
  emergencyThreshold?: number;
  /** 错误统计窗口时间(分钟) */
  errorWindowMinutes?: number;
  /** 自动恢复尝试间隔(分钟) */
  recoveryIntervalMinutes?: number;
  /** 最大自动恢复尝试次数 */
  maxRecoveryAttempts?: number;
  /** 每个错误类型的权重 - 某些错误比其他错误更严重 */
  errorTypeWeights?: Record<UploadErrorType, number>;
}

/**
 * 降级管理器选项
 */
export interface DegradationManagerOptions {
  /** 自动恢复 */
  autoRecovery?: boolean;
  /** 恢复检查间隔(毫秒) */
  recoveryCheckInterval?: number;
  /** 调试模式 */
  debug?: boolean;
}

/**
 * 降级管理器
 * 管理系统各功能的降级逻辑
 */
export class DegradationManager {
  private static instance: DegradationManager;
  private logger: Logger;
  private eventBus: EventBus;

  /** 功能健康状态记录 */
  private featureHealth: Map<string, FeatureHealth> = new Map();

  /** 功能降级配置 */
  private degradationConfigs: Map<string, FeatureDegradationConfig> = new Map();

  /** 降级处理器 */
  private degradationHandlers: Map<
    string,
    Record<DegradationLevel, () => void>
  > = new Map();

  /** 恢复处理器 */
  private recoveryHandlers: Map<
    string,
    (
      previousLevel: DegradationLevel,
      currentLevel: DegradationLevel
    ) => Promise<boolean>
  > = new Map();

  /** 恢复检查定时器 */
  private recoveryCheckTimer: number | null = null;

  /** 默认选项 */
  private options: DegradationManagerOptions = {
    autoRecovery: true,
    recoveryCheckInterval: 5 * 60 * 1000, // 5分钟
    debug: false,
  };

  /**
   * 获取单例实例
   */
  public static getInstance(
    options?: DegradationManagerOptions
  ): DegradationManager {
    if (!DegradationManager.instance) {
      DegradationManager.instance = new DegradationManager(options);
    }
    return DegradationManager.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor(options?: DegradationManagerOptions) {
    this.options = { ...this.options, ...options };
    this.logger = new Logger('DegradationManager');
    this.eventBus = EventBus.getInstance();

    // 如果启用自动恢复，启动恢复检查定时器
    if (this.options.autoRecovery) {
      this.startRecoveryCheck();
    }
  }

  /**
   * 注册功能降级配置
   * @param config 降级配置
   */
  public registerFeature(config: FeatureDegradationConfig): void {
    // 合并默认值
    const defaultConfig: Partial<FeatureDegradationConfig> = {
      lightThreshold: 3,
      moderateThreshold: 6,
      severeThreshold: 10,
      emergencyThreshold: 15,
      errorWindowMinutes: 30,
      recoveryIntervalMinutes: 10,
      maxRecoveryAttempts: 3,
    };

    const mergedConfig = { ...defaultConfig, ...config };
    this.degradationConfigs.set(
      config.featureId,
      mergedConfig as FeatureDegradationConfig
    );

    // 初始化功能健康状态
    if (!this.featureHealth.has(config.featureId)) {
      this.featureHealth.set(config.featureId, {
        errorCount: 0,
        degradationLevel: DegradationLevel.NORMAL,
        degradationHistory: [],
        recoveryAttempts: 0,
      });
    }

    this.logger.debug(`已注册功能 ${config.featureId} 的降级配置`);
  }

  /**
   * 注册降级处理器
   * @param featureId 功能标识
   * @param handlers 各级别的降级处理函数
   */
  public registerDegradationHandlers(
    featureId: string,
    handlers: Record<DegradationLevel, () => void>
  ): void {
    this.degradationHandlers.set(featureId, handlers);
  }

  /**
   * 注册恢复处理器
   * @param featureId 功能标识
   * @param handler 恢复处理函数
   */
  public registerRecoveryHandler(
    featureId: string,
    handler: (
      previousLevel: DegradationLevel,
      currentLevel: DegradationLevel
    ) => Promise<boolean>
  ): void {
    this.recoveryHandlers.set(featureId, handler);
  }

  /**
   * 记录功能错误，判断是否需要降级
   * @param featureId 功能标识
   * @param error 错误信息
   * @returns 是否已降级
   */
  public recordError(featureId: string, error: any): boolean {
    // 检查功能是否已注册
    if (!this.degradationConfigs.has(featureId)) {
      this.logger.warn(`功能 ${featureId} 未注册降级配置，无法处理错误`);
      return false;
    }

    const config = this.degradationConfigs.get(featureId)!;
    const health = this.featureHealth.get(featureId)!;

    // 更新错误信息
    health.errorCount++;
    health.lastError = new Date();

    // 尝试提取错误类型
    if (error && error.type) {
      health.lastErrorType = error.type;
    }

    // 提取错误消息
    health.lastErrorMessage =
      error instanceof Error ? error.message : error?.message || String(error);

    // 计算当前窗口期内的错误权重
    const errorWeight = this.calculateErrorWeight(featureId, error);

    // 根据错误权重确定降级级别
    let newLevel = health.degradationLevel;

    if (errorWeight >= config.emergencyThreshold!) {
      newLevel = DegradationLevel.EMERGENCY;
    } else if (errorWeight >= config.severeThreshold!) {
      newLevel = DegradationLevel.SEVERE;
    } else if (errorWeight >= config.moderateThreshold!) {
      newLevel = DegradationLevel.MODERATE;
    } else if (errorWeight >= config.lightThreshold!) {
      newLevel = DegradationLevel.LIGHT;
    }

    // 如果需要降级
    if (newLevel !== health.degradationLevel) {
      // 记录降级历史
      health.degradationHistory.push({
        timestamp: new Date(),
        fromLevel: health.degradationLevel,
        toLevel: newLevel,
        reason: `错误权重 ${errorWeight} 超过阈值 ${this.getThresholdForLevel(newLevel, config)}`,
      });

      // 更新降级级别
      health.degradationLevel = newLevel;

      // 重置恢复尝试计数
      health.recoveryAttempts = 0;

      // 设置下次恢复尝试时间
      health.nextRecoveryAttempt = new Date(
        Date.now() + config.recoveryIntervalMinutes! * 60 * 1000
      );

      // 调用降级处理器
      this.applyDegradation(featureId, newLevel);

      // 发送事件
      this.eventBus.emit('feature:degraded', {
        featureId,
        level: newLevel,
        reason: error,
      });

      return true;
    }

    return false;
  }

  /**
   * 计算错误权重
   * @param featureId 功能标识
   * @param error 错误信息
   * @returns 错误权重
   */
  private calculateErrorWeight(featureId: string, error: any): number {
    const config = this.degradationConfigs.get(featureId)!;
    const health = this.featureHealth.get(featureId)!;

    // 基本权重就是错误计数
    let weight = health.errorCount;

    // 如果有错误类型权重配置，应用它
    if (
      error &&
      error.type &&
      config.errorTypeWeights &&
      config.errorTypeWeights[error.type]
    ) {
      weight *= config.errorTypeWeights[error.type];
    }

    // 检查错误是否在时间窗口内
    // 移除过期的错误计数
    const now = Date.now();
    const windowStartTime = now - config.errorWindowMinutes! * 60 * 1000;

    // 如果最后一次错误发生在窗口开始之前，重置错误计数
    if (health.lastError && health.lastError.getTime() < windowStartTime) {
      health.errorCount = 1; // 当前错误
      weight = 1;
    }

    return weight;
  }

  /**
   * 获取指定降级级别的阈值
   * @param level 降级级别
   * @param config 降级配置
   * @returns 阈值
   */
  private getThresholdForLevel(
    level: DegradationLevel,
    config: FeatureDegradationConfig
  ): number {
    switch (level) {
      case DegradationLevel.LIGHT:
        return config.lightThreshold!;
      case DegradationLevel.MODERATE:
        return config.moderateThreshold!;
      case DegradationLevel.SEVERE:
        return config.severeThreshold!;
      case DegradationLevel.EMERGENCY:
        return config.emergencyThreshold!;
      default:
        return 0;
    }
  }

  /**
   * 应用功能降级
   * @param featureId 功能标识
   * @param level 降级级别
   */
  private applyDegradation(featureId: string, level: DegradationLevel): void {
    const handlers = this.degradationHandlers.get(featureId);

    if (handlers && handlers[level]) {
      try {
        handlers[level]();
        this.logger.info(`功能 ${featureId} 已降级至 ${level} 级别`);
      } catch (error) {
        this.logger.error(`执行功能 ${featureId} 的降级处理器失败:`, error);
      }
    } else {
      this.logger.warn(`功能 ${featureId} 没有 ${level} 级别的降级处理器`);
    }
  }

  /**
   * 检查并尝试自动恢复降级的功能
   */
  private async checkForRecovery(): Promise<void> {
    const now = Date.now();

    for (const [featureId, health] of this.featureHealth.entries()) {
      // 跳过正常状态的功能
      if (health.degradationLevel === DegradationLevel.NORMAL) {
        continue;
      }

      const config = this.degradationConfigs.get(featureId);
      if (!config) continue;

      // 检查是否到了恢复尝试时间
      if (
        health.nextRecoveryAttempt &&
        health.nextRecoveryAttempt.getTime() <= now &&
        health.recoveryAttempts < config.maxRecoveryAttempts!
      ) {
        // 尝试恢复
        await this.attemptRecovery(featureId);
      }
    }
  }

  /**
   * 尝试恢复功能
   * @param featureId 功能标识
   * @returns 是否恢复成功
   */
  public async attemptRecovery(featureId: string): Promise<boolean> {
    const health = this.featureHealth.get(featureId);
    const config = this.degradationConfigs.get(featureId);

    if (!health || !config) {
      this.logger.warn(`尝试恢复未注册的功能: ${featureId}`);
      return false;
    }

    // 如果已经是正常状态，无需恢复
    if (health.degradationLevel === DegradationLevel.NORMAL) {
      return true;
    }

    // 增加恢复尝试次数
    health.recoveryAttempts++;

    try {
      let recoverySuccess = false;

      // 调用恢复处理器
      const recoveryHandler = this.recoveryHandlers.get(featureId);
      if (recoveryHandler) {
        // 确定要恢复到的级别
        const currentLevel = health.degradationLevel;
        const targetLevel = this.getRecoveryTargetLevel(currentLevel);

        // 调用恢复处理器
        recoverySuccess = await recoveryHandler(currentLevel, targetLevel);

        if (recoverySuccess) {
          const previousLevel = health.degradationLevel;
          health.degradationLevel = targetLevel;

          // 记录恢复历史
          health.degradationHistory.push({
            timestamp: new Date(),
            fromLevel: previousLevel,
            toLevel: targetLevel,
            reason: `自动恢复尝试 #${health.recoveryAttempts}`,
          });

          // 如果恢复到正常状态，重置错误计数
          if (targetLevel === DegradationLevel.NORMAL) {
            health.errorCount = 0;
            health.recoveryAttempts = 0;
            health.nextRecoveryAttempt = undefined;
          } else {
            // 设置下次恢复尝试时间
            health.nextRecoveryAttempt = new Date(
              Date.now() + config.recoveryIntervalMinutes! * 60 * 1000
            );
          }

          // 发送恢复事件
          this.eventBus.emit('feature:recovered', {
            featureId,
            fromLevel: previousLevel,
            toLevel: targetLevel,
            attempt: health.recoveryAttempts,
          });

          this.logger.info(
            `功能 ${featureId} 已从 ${previousLevel} 恢复到 ${targetLevel}`
          );
        } else {
          // 记录恢复失败
          this.logger.warn(
            `功能 ${featureId} 恢复失败 (尝试 #${health.recoveryAttempts})`
          );

          // 设置下次恢复尝试时间
          health.nextRecoveryAttempt = new Date(
            Date.now() +
              config.recoveryIntervalMinutes! *
                60 *
                1000 *
                health.recoveryAttempts
          );
        }
      } else {
        this.logger.warn(`功能 ${featureId} 没有恢复处理器`);
      }

      return recoverySuccess;
    } catch (error) {
      this.logger.error(`功能 ${featureId} 恢复过程出错:`, error);

      // 设置下次恢复尝试时间 (加倍间隔)
      health.nextRecoveryAttempt = new Date(
        Date.now() + config.recoveryIntervalMinutes! * 60 * 1000 * 2
      );

      return false;
    }
  }

  /**
   * 获取恢复目标级别
   * @param currentLevel 当前级别
   * @returns 目标级别
   */
  private getRecoveryTargetLevel(
    currentLevel: DegradationLevel
  ): DegradationLevel {
    // 恢复策略：逐步恢复，每次提高一个级别
    switch (currentLevel) {
      case DegradationLevel.EMERGENCY:
        return DegradationLevel.SEVERE;
      case DegradationLevel.SEVERE:
        return DegradationLevel.MODERATE;
      case DegradationLevel.MODERATE:
        return DegradationLevel.LIGHT;
      case DegradationLevel.LIGHT:
        return DegradationLevel.NORMAL;
      default:
        return DegradationLevel.NORMAL;
    }
  }

  /**
   * 手动设置功能降级级别
   * @param featureId 功能标识
   * @param level 降级级别
   * @param reason 降级原因
   */
  public setDegradationLevel(
    featureId: string,
    level: DegradationLevel,
    reason: string
  ): void {
    const health = this.featureHealth.get(featureId);

    if (!health) {
      this.logger.warn(`尝试设置未注册功能 ${featureId} 的降级级别`);
      return;
    }

    const previousLevel = health.degradationLevel;

    if (level === previousLevel) {
      return; // 无变化，不处理
    }

    // 更新降级级别
    health.degradationLevel = level;

    // 记录降级历史
    health.degradationHistory.push({
      timestamp: new Date(),
      fromLevel: previousLevel,
      toLevel: level,
      reason: reason || '手动设置',
    });

    // 应用降级
    if (level !== DegradationLevel.NORMAL) {
      this.applyDegradation(featureId, level);
    }

    // 发送事件
    if (level > previousLevel) {
      this.eventBus.emit('feature:degraded', {
        featureId,
        level,
        reason,
      });
    } else {
      this.eventBus.emit('feature:recovered', {
        featureId,
        fromLevel: previousLevel,
        toLevel: level,
        reason,
      });
    }
  }

  /**
   * 检查功能是否已降级
   * @param featureId 功能标识
   * @returns 是否已降级
   */
  public isDegraded(featureId: string): boolean {
    const health = this.featureHealth.get(featureId);
    return health ? health.degradationLevel !== DegradationLevel.NORMAL : false;
  }

  /**
   * 获取功能的降级级别
   * @param featureId 功能标识
   * @returns 降级级别
   */
  public getDegradationLevel(featureId: string): DegradationLevel {
    const health = this.featureHealth.get(featureId);
    return health ? health.degradationLevel : DegradationLevel.NORMAL;
  }

  /**
   * 获取功能的健康状态
   * @param featureId 功能标识
   * @returns 健康状态信息
   */
  public getFeatureHealth(featureId: string): FeatureHealth | null {
    return this.featureHealth.get(featureId) || null;
  }

  /**
   * 获取所有功能的健康状态
   * @returns 功能健康状态映射
   */
  public getAllFeatureHealth(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [featureId, health] of this.featureHealth.entries()) {
      result[featureId] = {
        errorCount: health.errorCount,
        degradationLevel: health.degradationLevel,
        lastError: health.lastError?.toISOString(),
        lastErrorType: health.lastErrorType,
        lastErrorMessage: health.lastErrorMessage,
        recoveryAttempts: health.recoveryAttempts,
        nextRecoveryAttempt: health.nextRecoveryAttempt?.toISOString(),
        history: health.degradationHistory
          .map(h => ({
            ...h,
            timestamp: h.timestamp.toISOString(),
          }))
          .slice(-5), // 只返回最近5条历史记录
      };
    }

    return result;
  }

  /**
   * 重置功能健康状态
   * @param featureId 功能标识
   */
  public resetFeature(featureId: string): void {
    const health = this.featureHealth.get(featureId);

    if (!health) {
      return;
    }

    const previousLevel = health.degradationLevel;

    // 重置健康状态
    health.errorCount = 0;
    health.degradationLevel = DegradationLevel.NORMAL;
    health.recoveryAttempts = 0;
    health.nextRecoveryAttempt = undefined;

    // 记录历史
    if (previousLevel !== DegradationLevel.NORMAL) {
      health.degradationHistory.push({
        timestamp: new Date(),
        fromLevel: previousLevel,
        toLevel: DegradationLevel.NORMAL,
        reason: '手动重置',
      });

      // 发送恢复事件
      this.eventBus.emit('feature:recovered', {
        featureId,
        fromLevel: previousLevel,
        toLevel: DegradationLevel.NORMAL,
        reason: '手动重置',
      });
    }

    this.logger.info(`功能 ${featureId} 健康状态已重置`);
  }

  /**
   * 启动恢复检查定时器
   */
  private startRecoveryCheck(): void {
    if (this.recoveryCheckTimer !== null) {
      return;
    }

    this.recoveryCheckTimer = setInterval(() => {
      this.checkForRecovery().catch(error => {
        this.logger.error('恢复检查过程出错:', error);
      });
    }, this.options.recoveryCheckInterval) as any;

    this.logger.debug('已启动自动恢复检查');
  }

  /**
   * 停止恢复检查
   */
  private stopRecoveryCheck(): void {
    if (this.recoveryCheckTimer !== null) {
      clearInterval(this.recoveryCheckTimer);
      this.recoveryCheckTimer = null;
    }
  }

  /**
   * 销毁降级管理器实例
   */
  public destroy(): void {
    this.stopRecoveryCheck();
    this.degradationHandlers.clear();
    this.recoveryHandlers.clear();
    this.featureHealth.clear();
    this.degradationConfigs.clear();
  }

  /**
   * 清除系统实例
   * 用于测试目的
   */
  public static clearInstance(): void {
    if (DegradationManager.instance) {
      DegradationManager.instance.destroy();
      DegradationManager.instance = undefined as any;
    }
  }
}

// 导出单例实例，方便直接使用
export const degradationManager = DegradationManager.getInstance();

/**
 * 创建降级处理装饰器 - 用于类方法
 * @param featureId 功能标识
 * @returns 方法装饰器
 */
export function withDegradation(featureId: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const dm = DegradationManager.getInstance();

      // 如果功能已降级，不执行原方法
      if (dm.isDegraded(featureId)) {
        const level = dm.getDegradationLevel(featureId);
        console.warn(
          `功能 ${featureId} 已降级(${level})，跳过方法 ${propertyKey} 执行`
        );
        return;
      }

      try {
        return originalMethod.apply(this, args);
      } catch (error) {
        // 记录错误并触发降级
        dm.recordError(featureId, error);
        throw error;
      }
    };

    return descriptor;
  };
}
