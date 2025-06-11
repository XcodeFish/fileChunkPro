/**
 * OptimizedWorkerManager - 优化的工作线程管理器
 * 提供高效的工作线程创建、管理和通信机制，减少主线程阻塞风险
 */

import { EventBus } from './EventBus';
import { Logger } from '../utils/Logger';
import { WorkerTaskQueue } from './workers/WorkerTaskQueue';
import { WorkerPoolManager } from './workers/WorkerPoolManager';
import { StateLock } from '../utils/StateLock';
import { IWorkerAdapter } from '../adapters/interfaces';

/**
 * 工作线程配置
 */
export interface WorkerManagerOptions {
  /** 最大工作线程数 */
  maxWorkers?: number;
  /** 初始工作线程数 */
  initialWorkers?: number;
  /** 自动调整线程池大小 */
  autoScale?: boolean;
  /** 每个工作线程最大任务数 */
  maxTasksPerWorker?: number;
  /** 工作线程空闲超时时间(ms) */
  workerIdleTimeout?: number;
  /** 是否使用共享工作线程 */
  useSharedWorkers?: boolean;
  /** 工作线程脚本路径 */
  workerScript?: string;
  /** 工作线程类型 */
  workerType?: 'module' | 'classic';
  /** 工作线程名称 */
  workerName?: string;
  /** 事件总线 */
  eventBus?: EventBus;
  /** 日志级别 */
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'none';
  /** 环境适配器 */
  adapter?: IWorkerAdapter;
}

/**
 * 工作线程任务
 */
export interface WorkerTask<T = any, R = any> {
  /** 任务ID */
  id: string;
  /** 任务类型 */
  type: string;
  /** 任务数据 */
  data: T;
  /** 任务优先级 */
  priority?: number;
  /** 任务创建时间 */
  createdAt: number;
  /** 任务开始时间 */
  startedAt?: number;
  /** 任务完成回调 */
  resolve: (result: R) => void;
  /** 任务错误回调 */
  reject: (error: any) => void;
  /** 任务取消回调 */
  onCancel?: () => void;
  /** 任务超时时间(ms) */
  timeout?: number;
  /** 任务标签 */
  tags?: string[];
  /** 传输数据策略 */
  transferList?: Transferable[];
}

/**
 * 工作线程状态
 */
export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  STARTING = 'starting',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated',
  ERROR = 'error',
}

/**
 * 工作线程信息
 */
export interface WorkerInfo {
  /** 工作线程ID */
  id: string;
  /** 状态 */
  status: WorkerStatus;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动时间 */
  lastActiveAt: number;
  /** 处理的任务数 */
  processedTasks: number;
  /** 当前任务ID */
  currentTaskId?: string;
  /** 工作线程实例 */
  worker: Worker | SharedWorker | any;
  /** 是否共享工作线程 */
  isShared: boolean;
  /** 错误计数 */
  errorCount: number;
  /** 错误信息 */
  lastError?: Error;
  /** 自定义数据 */
  metadata?: Record<string, any>;
}

/**
 * 优化的工作线程管理器
 * 提供高效的工作线程创建、管理和通信系统，减少主线程阻塞
 */
export class OptimizedWorkerManager {
  /** 工作线程配置 */
  private options: Required<WorkerManagerOptions>;
  /** 工作线程池管理器 */
  private poolManager: WorkerPoolManager;
  /** 工作线程任务队列 */
  private taskQueue: WorkerTaskQueue;
  /** 事件总线 */
  private eventBus: EventBus;
  /** 日志记录器 */
  private logger: Logger;
  /** 状态锁 */
  private stateLock = new StateLock('worker-manager');
  /** 是否已初始化 */
  private initialized = false;
  /** 是否正在处理任务 */
  private isProcessing = false;
  /** 环境适配器 */
  private adapter: IWorkerAdapter;

  /**
   * 创建工作线程管理器
   * @param options 配置选项
   */
  constructor(options: WorkerManagerOptions = {}) {
    const cpuCores =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;

    // 设置默认选项
    this.options = {
      maxWorkers: Math.max(2, Math.min(cpuCores - 1, 4)),
      initialWorkers: 2,
      autoScale: true,
      maxTasksPerWorker: 10,
      workerIdleTimeout: 60000, // 60秒
      useSharedWorkers: false,
      workerScript: '/workers/main-worker.js',
      workerType: 'classic',
      workerName: 'fileChunkProWorker',
      eventBus: options.eventBus || new EventBus(),
      logLevel: options.logLevel || 'info',
      adapter: options.adapter || undefined,
      ...options,
    };

    // 保存事件总线
    this.eventBus = this.options.eventBus;

    // 初始化日志记录器
    this.logger = new Logger('WorkerManager', {
      level: this.options.logLevel,
    });

    // 初始化适配器
    this.adapter = this.options.adapter!;

    // 创建任务队列
    this.taskQueue = new WorkerTaskQueue({
      eventBus: this.eventBus,
      logLevel: this.options.logLevel,
    });

    // 创建工作线程池管理器
    this.poolManager = new WorkerPoolManager({
      maxWorkers: this.options.maxWorkers,
      initialWorkers: this.options.initialWorkers,
      autoScale: this.options.autoScale,
      workerIdleTimeout: this.options.workerIdleTimeout,
      useSharedWorkers: this.options.useSharedWorkers,
      workerScript: this.options.workerScript,
      workerType: this.options.workerType,
      workerName: this.options.workerName,
      eventBus: this.eventBus,
      logLevel: this.options.logLevel,
      adapter: this.adapter,
    });

    // 监听任务队列事件
    this.taskQueue.on('taskAdded', () => this.processNextTask());
    this.taskQueue.on('taskPrioritized', () => this.processNextTask());

    // 监听工作线程池事件
    this.poolManager.on('workerIdle', () => this.processNextTask());

    this.logger.info('工作线程管理器已创建', {
      maxWorkers: this.options.maxWorkers,
      initialWorkers: this.options.initialWorkers,
    });
  }

  /**
   * 初始化工作线程管理器
   * @returns 初始化promise
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('工作线程管理器已初始化，跳过重复操作');
      return;
    }

    try {
      // 初始化工作线程池
      await this.poolManager.initialize();

      this.initialized = true;
      this.logger.info('工作线程管理器初始化完成');

      this.eventBus.emit('workerManager:initialized', {
        timestamp: Date.now(),
        maxWorkers: this.options.maxWorkers,
        initialWorkers: this.options.initialWorkers,
      });
    } catch (error) {
      this.logger.error('工作线程管理器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 提交任务到工作线程
   * @param taskType 任务类型
   * @param taskData 任务数据
   * @param options 任务选项
   * @returns 任务结果Promise
   */
  async submitTask<T = any, R = any>(
    taskType: string,
    taskData: T,
    options: {
      priority?: number;
      timeout?: number;
      tags?: string[];
      transferList?: Transferable[];
      onCancel?: () => void;
    } = {}
  ): Promise<R> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 创建任务
    const task: WorkerTask<T, R> = {
      id: taskId,
      type: taskType,
      data: taskData,
      createdAt: Date.now(),
      priority: options.priority || 0,
      resolve: _result => {},
      reject: _error => {},
      onCancel: options.onCancel,
      timeout: options.timeout,
      tags: options.tags,
      transferList: options.transferList,
    };

    // 创建任务Promise
    const taskPromise = new Promise<R>((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });

    // 添加任务到队列
    this.taskQueue.enqueue(task);

    this.logger.debug(`任务 ${taskId} (${taskType}) 已提交`);

    return taskPromise;
  }

  /**
   * 处理下一个任务
   */
  private async processNextTask(): Promise<void> {
    // 状态锁保护，避免并发处理时的竞争
    return this.stateLock.withLock(async () => {
      if (this.isProcessing || !this.initialized) {
        return;
      }

      this.isProcessing = true;

      try {
        // 获取可用的空闲工作线程
        const idleWorker = this.poolManager.getIdleWorker();

        if (!idleWorker) {
          // 如果没有空闲工作线程，但可以扩展线程池
          if (this.poolManager.canAddWorker()) {
            const worker = await this.poolManager.addWorker();

            if (worker) {
              // 成功添加了新的工作线程，继续处理
              await this.processTaskWithWorker(worker);
            }
          }

          this.isProcessing = false;
          return;
        }

        // 使用空闲工作线程处理任务
        await this.processTaskWithWorker(idleWorker);
      } finally {
        this.isProcessing = false;
      }

      // 检查队列中是否还有任务，如果有则继续处理
      if (!this.taskQueue.isEmpty()) {
        this.processNextTask();
      }
    });
  }

  /**
   * 使用指定工作线程处理任务
   * @param workerInfo 工作线程信息
   */
  private async processTaskWithWorker(workerInfo: WorkerInfo): Promise<void> {
    // 从队列获取下一个任务
    const task = this.taskQueue.dequeue();
    if (!task) {
      return;
    }

    // 设置工作线程为忙碌状态
    this.poolManager.setWorkerStatus(workerInfo.id, WorkerStatus.BUSY);
    workerInfo.currentTaskId = task.id;
    workerInfo.lastActiveAt = Date.now();

    // 记录任务开始时间
    task.startedAt = Date.now();

    try {
      // 发送任务到工作线程
      const result = await this.poolManager.executeTask(workerInfo.id, task);

      // 处理任务结果
      task.resolve(result);

      this.logger.debug(`任务 ${task.id} (${task.type}) 已完成`);

      // 触发任务完成事件
      this.eventBus.emit('task:completed', {
        taskId: task.id,
        taskType: task.type,
        workerId: workerInfo.id,
        duration: Date.now() - task.startedAt,
      });
    } catch (error) {
      // 处理任务错误
      task.reject(error);

      this.logger.error(`任务 ${task.id} (${task.type}) 执行失败:`, error);

      // 更新工作线程错误计数
      workerInfo.errorCount++;
      workerInfo.lastError = error as Error;

      // 触发任务失败事件
      this.eventBus.emit('task:failed', {
        taskId: task.id,
        taskType: task.type,
        workerId: workerInfo.id,
        error,
      });

      // 检查错误计数，如果达到阈值则重启工作线程
      if (workerInfo.errorCount >= 3) {
        this.logger.warn(`工作线程 ${workerInfo.id} 错误次数过多，准备重启`);
        this.poolManager.restartWorker(workerInfo.id);
      }
    } finally {
      // 清理任务引用
      workerInfo.currentTaskId = undefined;
      workerInfo.processedTasks++;

      // 更新工作线程状态
      this.poolManager.setWorkerStatus(workerInfo.id, WorkerStatus.IDLE);
    }
  }

  /**
   * 取消所有任务
   */
  cancelAllTasks(): number {
    return this.taskQueue.cancelAll();
  }

  /**
   * 取消特定任务类型的所有任务
   * @param taskType 任务类型
   */
  cancelTasksByType(taskType: string): number {
    return this.taskQueue.cancelByType(taskType);
  }

  /**
   * 取消特定标签的所有任务
   * @param tag 任务标签
   */
  cancelTasksByTag(tag: string): number {
    return this.taskQueue.cancelByTag(tag);
  }

  /**
   * 获取工作线程状态统计
   * @returns 状态统计信息
   */
  getStats(): {
    workers: {
      total: number;
      idle: number;
      busy: number;
    };
    tasks: {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      totalProcessed: number;
    };
  } {
    const workerStats = this.poolManager.getStats();
    const taskStats = this.taskQueue.getStats();

    return {
      workers: workerStats,
      tasks: taskStats,
    };
  }

  /**
   * 关闭工作线程管理器
   */
  async shutdown(): Promise<void> {
    this.logger.info('工作线程管理器正在关闭...');

    // 取消所有待处理任务
    const canceledCount = this.cancelAllTasks();
    if (canceledCount > 0) {
      this.logger.info(`已取消 ${canceledCount} 个待处理任务`);
    }

    // 关闭工作线程池
    await this.poolManager.shutdown();

    this.initialized = false;

    this.logger.info('工作线程管理器已关闭');

    this.eventBus.emit('workerManager:shutdown', {
      timestamp: Date.now(),
    });
  }

  /**
   * 销毁工作线程管理器
   * 清理所有资源和引用
   */
  destroy(): void {
    // 先尝试优雅关闭
    this.shutdown()
      .catch(err => {
        this.logger.error('工作线程管理器关闭出错:', err);
      })
      .finally(() => {
        // 清理事件监听
        this.taskQueue.removeAllListeners();
        this.poolManager.removeAllListeners();

        // 手动清理其他引用
        (this.taskQueue as any) = null;
        (this.poolManager as any) = null;

        this.logger.info('工作线程管理器资源已销毁');
      });
  }

  /**
   * 获取事件总线
   * @returns 事件总线实例
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * 暂时暂停接受新任务
   */
  pause(): void {
    this.taskQueue.pause();
    this.logger.info('工作线程管理器已暂停接受新任务');
  }

  /**
   * 恢复接受新任务
   */
  resume(): void {
    this.taskQueue.resume();
    this.logger.info('工作线程管理器已恢复接受新任务');

    // 恢复后立即尝试处理待处理的任务
    if (!this.taskQueue.isEmpty()) {
      this.processNextTask();
    }
  }

  /**
   * 检查工作线程管理器是否暂停
   * @returns 是否暂停
   */
  isPaused(): boolean {
    return this.taskQueue.isPaused();
  }
}
