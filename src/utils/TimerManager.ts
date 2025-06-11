/**
 * TimerManager - 定时器管理器
 * 集中管理定时器，确保在组件销毁时能全部清理，防止内存泄漏
 */

import { Logger } from './Logger';

interface TimerInfo {
  id: number;
  type: 'timeout' | 'interval';
  createdAt: number;
  description?: string;
}

/**
 * 定时器管理服务
 * 用于集中管理 setTimeout 和 setInterval 创建的定时器
 */
export class TimerManager {
  private static instance: TimerManager;
  private timers: Map<number, TimerInfo> = new Map();
  private logger: Logger;
  private componentName: string;

  /**
   * 创建定时器管理器
   * @param componentName 使用该管理器的组件名称
   */
  constructor(componentName: string) {
    this.componentName = componentName;
    this.logger = new Logger(`TimerManager:${componentName}`);
  }

  /**
   * 获取全局单例实例
   */
  static getInstance(): TimerManager {
    if (!TimerManager.instance) {
      TimerManager.instance = new TimerManager('global');
    }
    return TimerManager.instance;
  }

  /**
   * 创建一个超时定时器，并自动追踪
   * @param callback 回调函数
   * @param ms 延迟时间(毫秒)
   * @param description 可选的描述，方便调试
   * @returns 定时器ID
   */
  setTimeout(
    callback: (...args: any[]) => void,
    ms: number,
    description?: string
  ): number {
    const timerId = setTimeout(() => {
      // 回调执行前先从管理列表中移除
      this.timers.delete(timerId);

      // 执行原始回调
      try {
        callback();
      } catch (error) {
        this.logger.error(
          `定时器回调执行错误: ${description || 'unnamed'}`,
          error
        );
      }
    }, ms);

    // 记录定时器信息
    this.timers.set(timerId, {
      id: timerId,
      type: 'timeout',
      createdAt: Date.now(),
      description,
    });

    return timerId;
  }

  /**
   * 创建一个间隔定时器，并自动追踪
   * @param callback 回调函数
   * @param ms 间隔时间(毫秒)
   * @param description 可选的描述，方便调试
   * @returns 定时器ID
   */
  setInterval(
    callback: (...args: any[]) => void,
    ms: number,
    description?: string
  ): number {
    // 创建安全的回调函数
    const safeCallback = (...args: any[]) => {
      try {
        callback(...args);
      } catch (error) {
        this.logger.error(
          `间隔定时器回调执行错误: ${description || 'unnamed'}`,
          error
        );
      }
    };

    const timerId = setInterval(safeCallback, ms);

    // 记录定时器信息
    this.timers.set(timerId, {
      id: timerId,
      type: 'interval',
      createdAt: Date.now(),
      description,
    });

    return timerId;
  }

  /**
   * 清除特定的定时器
   * @param timerId 定时器ID
   * @returns 是否成功清除
   */
  clearTimer(timerId: number | null | undefined): boolean {
    if (timerId == null) return false;

    const timerInfo = this.timers.get(timerId);
    if (!timerInfo) {
      // 可能是未注册到此管理器的定时器，尝试同时清除
      clearTimeout(timerId);
      clearInterval(timerId);
      return false;
    }

    if (timerInfo.type === 'timeout') {
      clearTimeout(timerId);
    } else {
      clearInterval(timerId);
    }

    // 从管理列表中移除
    this.timers.delete(timerId);
    return true;
  }

  /**
   * 清除所有定时器
   * @returns 清除的定时器数量
   */
  clearAll(): number {
    const count = this.timers.size;

    this.timers.forEach(timer => {
      if (timer.type === 'timeout') {
        clearTimeout(timer.id);
      } else {
        clearInterval(timer.id);
      }
    });

    this.timers.clear();

    if (count > 0) {
      this.logger.debug(`已清理 ${count} 个定时器`);
    }

    return count;
  }

  /**
   * 检查长期运行的定时器
   * 可在开发环境下定期调用，检测潜在泄漏
   * @param thresholdMs 阈值毫秒数，超过此时间的定时器会被记录
   */
  checkLongRunningTimers(thresholdMs = 60000): Array<TimerInfo> {
    const now = Date.now();
    const longRunning: Array<TimerInfo> = [];

    this.timers.forEach(timer => {
      const duration = now - timer.createdAt;
      if (duration > thresholdMs) {
        longRunning.push({ ...timer });

        this.logger.warn(
          `发现长时间运行的${timer.type === 'timeout' ? '超时' : '间隔'}定时器: ${
            timer.description || 'unnamed'
          }, 已运行 ${Math.floor(duration / 1000)}秒`
        );
      }
    });

    return longRunning;
  }

  /**
   * 获取当前活跃定时器数量
   */
  get count(): number {
    return this.timers.size;
  }
}
