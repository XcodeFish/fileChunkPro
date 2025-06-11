/**
 * LoopSafetyChecker - 循环安全检查器
 * 提供循环边界检查及安全策略，防止无限循环和事件循环阻塞
 */

import { Logger } from './Logger';
import { TimerManager } from './TimerManager';

/**
 * 循环控制配置选项
 */
export interface LoopControlOptions {
  /**
   * 最大迭代次数
   */
  maxIterations?: number;

  /**
   * 最长执行时间(毫秒)
   */
  maxExecutionTime?: number;

  /**
   * 开始让出主线程的迭代次数
   */
  yieldThreshold?: number;

  /**
   * 让出主线程的间隔(迭代次数)
   */
  yieldInterval?: number;

  /**
   * 循环名称(用于日志)
   */
  loopName?: string;

  /**
   * 循环被中断时的回调函数
   */
  onLoopInterrupted?: (
    reason: string,
    iterations: number,
    elapsedMs: number
  ) => void;
}

/**
 * 循环状态对象
 */
interface LoopState {
  iterations: number;
  startTime: number;
  lastYieldTime: number;
  interrupted: boolean;
}

/**
 * 循环安全检查器
 * 提供循环保护机制，防止无限循环和主线程阻塞
 */
export class LoopSafetyChecker {
  private static logger = new Logger('LoopSafetyChecker');
  private static timerManager = new TimerManager('LoopSafetyChecker');

  /**
   * 检查循环条件是否安全
   * @param state 循环状态
   * @param options 安全选项
   * @returns 是否可以继续循环
   */
  static checkLoopSafety(
    state: LoopState,
    options: LoopControlOptions = {}
  ): boolean {
    const {
      maxIterations = 1000000,
      maxExecutionTime = 5000,
      loopName = '未命名循环',
    } = options;

    state.iterations++;

    // 检查是否超过最大迭代次数
    if (state.iterations > maxIterations) {
      state.interrupted = true;
      const message = `安全检查: ${loopName} 超过最大迭代次数 ${maxIterations}`;
      this.logger.warn(message);

      if (options.onLoopInterrupted) {
        const now = Date.now();
        const elapsed = now - state.startTime;
        options.onLoopInterrupted('maxIterations', state.iterations, elapsed);
      }

      return false;
    }

    // 定期检查运行时间
    if (state.iterations % 10000 === 0) {
      const now = Date.now();
      const elapsed = now - state.startTime;

      // 检查是否超过最大执行时间
      if (elapsed > maxExecutionTime) {
        state.interrupted = true;
        const message = `安全检查: ${loopName} 超过最大执行时间 ${maxExecutionTime}ms (已执行 ${elapsed}ms)`;
        this.logger.warn(message);

        if (options.onLoopInterrupted) {
          options.onLoopInterrupted(
            'maxExecutionTime',
            state.iterations,
            elapsed
          );
        }

        return false;
      }
    }

    return true;
  }

  /**
   * 创建一个受控循环，提供安全保护
   * @param iterationFn 每次迭代执行的函数
   * @param conditionFn 循环继续条件的函数
   * @param options 循环控制选项
   */
  static async controlledLoop(
    iterationFn: (i: number) => unknown,
    conditionFn: (i: number) => boolean,
    options: LoopControlOptions = {}
  ): Promise<void> {
    const {
      maxIterations = 1000000,
      maxExecutionTime = 5000,
      yieldThreshold = 10000,
      yieldInterval = 1000,
      loopName = '受控循环',
    } = options;

    let i = 0;
    const startTime = Date.now();

    while (conditionFn(i)) {
      // 检查迭代次数上限
      if (i >= maxIterations) {
        const message = `安全中断: ${loopName} 达到最大迭代次数 ${maxIterations}`;
        this.logger.warn(message);

        if (options.onLoopInterrupted) {
          const elapsed = Date.now() - startTime;
          options.onLoopInterrupted('maxIterations', i, elapsed);
        }

        break;
      }

      // 定期检查执行时间
      if (i % 10000 === 0 && i > 0) {
        const elapsed = Date.now() - startTime;
        if (elapsed > maxExecutionTime) {
          const message = `安全中断: ${loopName} 超过最大执行时间 ${maxExecutionTime}ms (已执行 ${elapsed}ms)`;
          this.logger.warn(message);

          if (options.onLoopInterrupted) {
            options.onLoopInterrupted('maxExecutionTime', i, elapsed);
          }

          break;
        }
      }

      // 执行迭代函数
      await iterationFn(i);

      // 定期让出主线程，避免UI阻塞
      if (i >= yieldThreshold && i % yieldInterval === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      i++;
    }
  }

  /**
   * 处理计算密集型任务，分段执行以避免阻塞主线程
   * @param task 要执行的计算密集型任务
   * @param options 任务控制选项
   */
  static async executeNonBlocking<T>(
    task: (yieldControl: () => Promise<void>) => Promise<T>,
    options: {
      maxBlockTime?: number;
      progressCallback?: (progress: number) => void;
    } = {}
  ): Promise<T> {
    const { maxBlockTime = 50 } = options;
    let lastYieldTime = Date.now();

    // 创建让出控制权的函数
    const yieldControl = async (): Promise<void> => {
      const now = Date.now();
      const timeSinceLastYield = now - lastYieldTime;

      if (timeSinceLastYield >= maxBlockTime) {
        // 真正让出控制权，使用 requestAnimationFrame 可以更智能地配合浏览器渲染循环
        await new Promise<void>(resolve => {
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => setTimeout(resolve, 0));
          } else {
            setTimeout(resolve, 0);
          }
        });

        lastYieldTime = Date.now();
      }
    };

    // 执行任务
    return await task(yieldControl);
  }

  /**
   * 监控循环执行，防止无限循环，适用于常规 for/while 循环
   * @param loopName 循环名称
   * @param options 监控选项
   * @returns 循环控制对象
   */
  static monitorLoop(
    loopName: string,
    options: LoopControlOptions = {}
  ): {
    check: () => boolean;
    finish: () => void;
    getState: () => { iterations: number; elapsedTime: number };
  } {
    const state: LoopState = {
      iterations: 0,
      startTime: Date.now(),
      lastYieldTime: Date.now(),
      interrupted: false,
    };

    const {
      maxIterations = 1000000,
      maxExecutionTime = 5000,
      yieldThreshold = 10000,
      yieldInterval = 1000,
    } = options;

    // 设置安全超时，确保不会无限循环
    const safetyTimeout = this.timerManager.setTimeout(() => {
      if (!state.interrupted) {
        state.interrupted = true;
        const elapsed = Date.now() - state.startTime;
        this.logger.error(
          `安全超时触发: ${loopName} 可能是无限循环 (已执行 ${state.iterations} 次，${elapsed}ms)`
        );

        if (options.onLoopInterrupted) {
          options.onLoopInterrupted('timeout', state.iterations, elapsed);
        }
      }
    }, maxExecutionTime * 2); // 双倍最大执行时间作为最后的保障

    return {
      // 检查循环是否可以继续
      check: (): boolean => {
        state.iterations++;

        // 检查是否已被中断
        if (state.interrupted) {
          return false;
        }

        // 检查迭代次数
        if (state.iterations > maxIterations) {
          state.interrupted = true;
          this.timerManager.clearTimer(safetyTimeout);

          const elapsed = Date.now() - state.startTime;
          this.logger.warn(
            `安全检查: ${loopName} 超过最大迭代次数 ${maxIterations} (已执行 ${elapsed}ms)`
          );

          if (options.onLoopInterrupted) {
            options.onLoopInterrupted(
              'maxIterations',
              state.iterations,
              elapsed
            );
          }

          return false;
        }

        // 定期检查执行时间
        if (state.iterations % 10000 === 0) {
          const now = Date.now();
          const elapsed = now - state.startTime;

          // 检查是否超过最大执行时间
          if (elapsed > maxExecutionTime) {
            state.interrupted = true;
            this.timerManager.clearTimer(safetyTimeout);

            this.logger.warn(
              `安全检查: ${loopName} 超过最大执行时间 ${maxExecutionTime}ms (已执行 ${elapsed}ms)`
            );

            if (options.onLoopInterrupted) {
              options.onLoopInterrupted(
                'maxExecutionTime',
                state.iterations,
                elapsed
              );
            }

            return false;
          }

          // 让出主线程，防止UI阻塞
          if (
            state.iterations >= yieldThreshold &&
            state.iterations % yieldInterval === 0
          ) {
            const now = Date.now();
            if (now - state.lastYieldTime > 100) {
              // 至少100ms检查一次
              state.lastYieldTime = now;
              setTimeout(() => {
                /* 空函数，仅用于让出线程 */
              }, 0);
            }
          }
        }

        return true;
      },

      // 完成循环，清理资源
      finish: (): void => {
        this.timerManager.clearTimer(safetyTimeout);
      },

      // 获取当前循环状态
      getState: () => ({
        iterations: state.iterations,
        elapsedTime: Date.now() - state.startTime,
      }),
    };
  }
}
