/**
 * StateConsistencyMonitor - 状态一致性监控
 * 用于检测和恢复系统中的状态不一致问题，增强系统稳定性
 */

import { EventBus } from '../core/EventBus';
import { Logger } from './Logger';

/**
 * 一致性检查规则
 */
export interface ConsistencyRule<T = any> {
  /** 规则ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 检查函数，返回 true 表示一致，false 表示不一致 */
  check: () => boolean;
  /** 修复函数，用于恢复一致性 */
  fix: () => Promise<boolean>;
  /** 检查的数据对象 */
  data?: T;
  /** 上下文描述 */
  context?: string;
  /** 严重程度: critical-关键, high-高, medium-中, low-低 */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** 最大修复尝试次数 */
  maxFixAttempts?: number;
}

/**
 * 监控配置
 */
export interface ConsistencyMonitorOptions {
  /** 检查间隔(ms) */
  checkInterval?: number;
  /** 自动恢复 */
  autoFix?: boolean;
  /** 仅修复非关键问题 */
  fixNonCriticalOnly?: boolean;
  /** 按重要性排序修复 */
  prioritizedFix?: boolean;
  /** 事件总线 */
  eventBus?: EventBus;
  /** 最大修复尝试次数 */
  maxFixAttempts?: number;
  /** 延迟修复时间(ms) */
  fixDelay?: number;
  /** 日志级别 */
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'none';
}

/**
 * 状态一致性记录
 */
interface ConsistencyRecord {
  /** 规则ID */
  ruleId: string;
  /** 最后检查时间 */
  lastCheck: number;
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 修复尝试次数 */
  fixAttempts: number;
  /** 最后修复时间 */
  lastFixAttempt?: number;
  /** 最后修复是否成功 */
  lastFixSuccess?: boolean;
}

/**
 * 状态一致性监控器
 * 负责持续监控系统状态一致性，并在发现问题时自动修复
 */
export class StateConsistencyMonitor {
  /** 一致性规则 */
  private rules: Map<string, ConsistencyRule> = new Map();
  /** 一致性记录 */
  private records: Map<string, ConsistencyRecord> = new Map();
  /** 监控配置 */
  private options: Required<ConsistencyMonitorOptions>;
  /** 检查定时器 */
  private checkInterval: NodeJS.Timeout | null = null;
  /** 事件总线 */
  private eventBus: EventBus;
  /** 日志记录器 */
  private logger: Logger;
  /** 是否正在运行 */
  private isRunning = false;
  /** 正在修复的规则 */
  private fixingRules: Set<string> = new Set();

  /**
   * 创建状态一致性监控器
   * @param options 监控配置
   */
  constructor(options: ConsistencyMonitorOptions = {}) {
    // 合并默认选项
    this.options = {
      checkInterval: 30000, // 默认30秒检查一次
      autoFix: true,
      fixNonCriticalOnly: false,
      prioritizedFix: true,
      eventBus: options.eventBus || new EventBus(),
      maxFixAttempts: 3,
      fixDelay: 1000,
      logLevel: options.logLevel || 'info',
    };

    // 保存事件总线
    this.eventBus = this.options.eventBus;

    // 初始化日志记录器
    this.logger = new Logger('StateConsistencyMonitor', {
      level: this.options.logLevel,
    });
  }

  /**
   * 注册一致性规则
   * @param rule 一致性规则
   */
  registerRule(rule: ConsistencyRule): void {
    if (this.rules.has(rule.id)) {
      this.logger.warn(`规则 ${rule.id} 已存在，将被覆盖`);
    }

    this.rules.set(rule.id, rule);

    // 创建初始记录
    this.records.set(rule.id, {
      ruleId: rule.id,
      lastCheck: 0,
      consecutiveFailures: 0,
      fixAttempts: 0,
    });

    this.logger.debug(`已注册规则: ${rule.id} - ${rule.name}`);
  }

  /**
   * 取消注册规则
   * @param ruleId 规则ID
   */
  unregisterRule(ruleId: string): void {
    if (this.rules.has(ruleId)) {
      this.rules.delete(ruleId);
      this.records.delete(ruleId);
      this.logger.debug(`已取消注册规则: ${ruleId}`);
    }
  }

  /**
   * 开始监控
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.info('状态一致性监控已启动');

    // 立即执行一次检查
    this.checkAllRules();

    // 设置定期检查
    this.checkInterval = setInterval(() => {
      this.checkAllRules();
    }, this.options.checkInterval);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.logger.info('状态一致性监控已停止');
  }

  /**
   * 检查所有规则
   */
  private checkAllRules(): void {
    const now = Date.now();
    const inconsistentRules: ConsistencyRule[] = [];

    // 记录检查开始
    this.logger.debug(`开始检查 ${this.rules.size} 条一致性规则`);

    // 检查所有规则
    for (const rule of this.rules.values()) {
      try {
        // 跳过正在修复的规则
        if (this.fixingRules.has(rule.id)) {
          continue;
        }

        const isConsistent = rule.check();
        const record = this.records.get(rule.id)!;
        record.lastCheck = now;

        if (!isConsistent) {
          // 记录连续失败
          record.consecutiveFailures++;

          // 添加到不一致规则列表
          inconsistentRules.push(rule);

          this.logger.warn(
            `检测到状态不一致: ${rule.id} - ${rule.name} (连续${record.consecutiveFailures}次失败)`
          );

          // 触发不一致事件
          this.eventBus.emit('state:inconsistency', {
            ruleId: rule.id,
            ruleName: rule.name,
            context: rule.context,
            severity: rule.severity,
            consecutiveFailures: record.consecutiveFailures,
            timestamp: now,
          });
        } else {
          // 重置连续失败
          if (record.consecutiveFailures > 0) {
            this.logger.debug(
              `规则 ${rule.id} 恢复一致性 (之前连续${record.consecutiveFailures}次失败)`
            );
            record.consecutiveFailures = 0;
          }
        }
      } catch (error) {
        // 规则检查时出错
        this.logger.error(`规则 ${rule.id} 检查时出错:`, error);

        // 触发规则错误事件
        this.eventBus.emit('state:ruleError', {
          ruleId: rule.id,
          ruleName: rule.name,
          error,
          timestamp: now,
        });
      }
    }

    // 记录检查完成
    this.logger.debug(
      `一致性检查完成，发现 ${inconsistentRules.length} 个问题`
    );

    // 如果配置了自动修复，修复不一致的规则
    if (this.options.autoFix && inconsistentRules.length > 0) {
      this.fixInconsistentRules(inconsistentRules);
    }
  }

  /**
   * 修复不一致的规则
   * @param inconsistentRules 不一致的规则列表
   */
  private async fixInconsistentRules(
    inconsistentRules: ConsistencyRule[]
  ): Promise<void> {
    // 如果配置了按优先级修复，对规则进行排序
    if (this.options.prioritizedFix) {
      // 按严重程度排序: critical > high > medium > low
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      inconsistentRules.sort(
        (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
      );
    }

    // 依次修复规则
    for (const rule of inconsistentRules) {
      // 如果配置只修复非关键问题，跳过关键问题
      if (this.options.fixNonCriticalOnly && rule.severity === 'critical') {
        this.logger.warn(`跳过关键问题修复: ${rule.id} - ${rule.name}`);
        continue;
      }

      const record = this.records.get(rule.id)!;
      const maxAttempts = rule.maxFixAttempts || this.options.maxFixAttempts;

      // 检查修复尝试次数是否超过上限
      if (record.fixAttempts >= maxAttempts) {
        this.logger.warn(
          `规则 ${rule.id} 修复尝试次数已达上限(${maxAttempts})，不再尝试修复`
        );

        // 触发修复放弃事件
        this.eventBus.emit('state:fixAbandoned', {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          maxAttempts,
          timestamp: Date.now(),
        });

        continue;
      }

      // 标记为正在修复
      this.fixingRules.add(rule.id);

      // 延迟一段时间再修复，避免集中修复造成资源争用
      await new Promise(resolve => setTimeout(resolve, this.options.fixDelay));

      try {
        this.logger.info(
          `开始修复规则 ${rule.id} - ${rule.name} (第${record.fixAttempts + 1}次尝试)`
        );

        // 记录修复开始
        record.fixAttempts++;
        record.lastFixAttempt = Date.now();

        // 触发修复开始事件
        this.eventBus.emit('state:fixAttempt', {
          ruleId: rule.id,
          ruleName: rule.name,
          attempt: record.fixAttempts,
          timestamp: record.lastFixAttempt,
        });

        // 执行修复
        const success = await rule.fix();
        record.lastFixSuccess = success;

        if (success) {
          this.logger.info(`规则 ${rule.id} 修复成功`);

          // 重置连续失败计数
          record.consecutiveFailures = 0;

          // 触发修复成功事件
          this.eventBus.emit('state:fixSuccess', {
            ruleId: rule.id,
            ruleName: rule.name,
            attempt: record.fixAttempts,
            timestamp: Date.now(),
          });

          // 重新检查规则
          const isConsistent = rule.check();
          if (isConsistent) {
            // 修复后状态已恢复一致
            this.logger.info(`规则 ${rule.id} 状态已恢复一致`);
          } else {
            // 修复后状态仍不一致
            this.logger.warn(`规则 ${rule.id} 修复后状态仍不一致`);

            // 触发修复不完全事件
            this.eventBus.emit('state:fixIncomplete', {
              ruleId: rule.id,
              ruleName: rule.name,
              timestamp: Date.now(),
            });
          }
        } else {
          this.logger.warn(`规则 ${rule.id} 修复失败`);

          // 触发修复失败事件
          this.eventBus.emit('state:fixFailure', {
            ruleId: rule.id,
            ruleName: rule.name,
            attempt: record.fixAttempts,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        // 修复过程中出错
        record.lastFixSuccess = false;
        this.logger.error(`规则 ${rule.id} 修复过程中出错:`, error);

        // 触发修复错误事件
        this.eventBus.emit('state:fixError', {
          ruleId: rule.id,
          ruleName: rule.name,
          error,
          timestamp: Date.now(),
        });
      } finally {
        // 完成修复，移除标记
        this.fixingRules.delete(rule.id);
      }
    }
  }

  /**
   * 手动触发检查
   * @param ruleId 规则ID，不指定则检查所有规则
   */
  manualCheck(ruleId?: string): void {
    if (ruleId) {
      const rule = this.rules.get(ruleId);
      if (rule) {
        try {
          const isConsistent = rule.check();
          this.logger.info(
            `手动检查规则 ${ruleId}: ${isConsistent ? '一致' : '不一致'}`
          );

          if (!isConsistent && this.options.autoFix) {
            this.fixInconsistentRules([rule]);
          }

          return;
        } catch (error) {
          this.logger.error(`手动检查规则 ${ruleId} 时出错:`, error);
          return;
        }
      } else {
        this.logger.warn(`规则 ${ruleId} 不存在`);
        return;
      }
    }

    // 检查所有规则
    this.checkAllRules();
  }

  /**
   * 手动修复指定规则
   * @param ruleId 规则ID
   */
  async manualFix(ruleId: string): Promise<boolean> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      this.logger.warn(`规则 ${ruleId} 不存在`);
      return false;
    }

    if (this.fixingRules.has(ruleId)) {
      this.logger.warn(`规则 ${ruleId} 正在修复中`);
      return false;
    }

    this.logger.info(`手动修复规则 ${ruleId}`);
    this.fixingRules.add(ruleId);

    try {
      const record = this.records.get(ruleId)!;
      record.fixAttempts++;
      record.lastFixAttempt = Date.now();

      const success = await rule.fix();
      record.lastFixSuccess = success;

      if (success) {
        this.logger.info(`规则 ${ruleId} 手动修复成功`);

        // 重置连续失败计数
        record.consecutiveFailures = 0;
      } else {
        this.logger.warn(`规则 ${ruleId} 手动修复失败`);
      }

      return success;
    } catch (error) {
      const record = this.records.get(ruleId)!;
      record.lastFixSuccess = false;
      this.logger.error(`规则 ${ruleId} 手动修复时出错:`, error);
      return false;
    } finally {
      this.fixingRules.delete(ruleId);
    }
  }

  /**
   * 获取监控状态
   */
  getStatus(): {
    isRunning: boolean;
    ruleCount: number;
    inconsistentRuleCount: number;
    criticalRuleCount: number;
    fixingRuleCount: number;
  } {
    let inconsistentRuleCount = 0;
    let criticalRuleCount = 0;

    for (const [ruleId, record] of this.records.entries()) {
      if (record.consecutiveFailures > 0) {
        inconsistentRuleCount++;

        const rule = this.rules.get(ruleId);
        if (rule && rule.severity === 'critical') {
          criticalRuleCount++;
        }
      }
    }

    return {
      isRunning: this.isRunning,
      ruleCount: this.rules.size,
      inconsistentRuleCount,
      criticalRuleCount,
      fixingRuleCount: this.fixingRules.size,
    };
  }

  /**
   * 获取规则状态
   * @param ruleId 规则ID
   */
  getRuleStatus(ruleId: string): {
    id: string;
    name: string;
    severity: string;
    isConsistent: boolean;
    consecutiveFailures: number;
    fixAttempts: number;
    lastCheck: number;
    lastFixAttempt?: number;
    lastFixSuccess?: boolean;
    isFixing: boolean;
  } | null {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    const record = this.records.get(ruleId)!;
    const isConsistent = rule.check();

    return {
      id: rule.id,
      name: rule.name,
      severity: rule.severity,
      isConsistent,
      consecutiveFailures: record.consecutiveFailures,
      fixAttempts: record.fixAttempts,
      lastCheck: record.lastCheck,
      lastFixAttempt: record.lastFixAttempt,
      lastFixSuccess: record.lastFixSuccess,
      isFixing: this.fixingRules.has(ruleId),
    };
  }
}
