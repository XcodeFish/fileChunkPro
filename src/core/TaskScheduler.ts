/**
 * TaskScheduler - 任务调度系统
 * 负责并发控制、任务队列管理和进度计算
 */

import {
  TaskSchedulerOptions,
  Task,
  ProgressCallback,
  TaskPriority,
  TaskMetadata,
  NetworkStatus,
  TaskState,
  TaskStats,
} from '../types';
import MemoryManager from '../utils/MemoryManager';

import EventBus from './EventBus';

interface TaskItem {
  id: number; // 任务ID
  task: Task; // 任务函数
  retryCount: number; // 已重试次数
  maxRetries?: number; // 最大重试次数
  currentAttempt: number; // 当前尝试次数
  completed: boolean; // 是否已完成
  priority: TaskPriority; // 任务优先级
  metadata?: TaskMetadata; // 任务元数据
  startTime?: number; // 任务开始时间
  endTime?: number; // 任务结束时间
  state: TaskState; // 任务状态
  error?: Error; // 任务错误
  aborted?: boolean; // 是否被中止
  result?: unknown; // 任务结果
  executionTime?: number; // 执行时间(毫秒)
}

export class TaskScheduler {
  private options: TaskSchedulerOptions;
  private taskQueue: TaskItem[] = [];
  private runningTasks: Map<number, TaskItem> = new Map();
  private completedTaskCount = 0;
  private failedTaskCount = 0;
  private abortedTaskCount = 0;
  private totalTaskCount = 0;
  private progressCallbacks: ProgressCallback[] = [];
  private aborted = false;
  private paused = false;
  private lastProgress = 0;
  private networkStatus: NetworkStatus = 'unknown';
  private networkCheckInterval: NodeJS.Timeout | null = null;
  private memoryMonitorInterval: NodeJS.Timeout | null = null;
  private concurrencyAdjustInterval: NodeJS.Timeout | null = null;
  private dynamicConcurrency: number;
  private taskIdCounter = 0;
  private eventBus: EventBus;
  private startTime = 0;
  private isMemoryOptimizationEnabled = true;
  private isNetworkOptimizationEnabled = true;
  private lastNetworkStatusTime = 0;
  private networkHistory: Array<{ status: NetworkStatus; timestamp: number }> =
    [];
  private isProcessing = false;
  private nextTaskTimeout: NodeJS.Timeout | null = null;
  private idleStartTime = 0;
  private waitingForNetworkRecovery = false;
  private taskStats: TaskStats = {
    executed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    aborted: 0,
    averageExecutionTime: 0,
    totalExecutionTime: 0,
    longestExecutionTime: 0,
    shortestExecutionTime: Infinity,
  };

  constructor(options: TaskSchedulerOptions, eventBus?: EventBus) {
    this.options = {
      concurrency: 3,
      retries: 3,
      retryDelay: 1000,
      priorityQueue: false,
      autoStart: true,
      memoryOptimization: true,
      networkOptimization: true,
      maxIdleTime: 30000,
      ...options,
    };

    // 设置动态并发值为初始并发值
    this.dynamicConcurrency = this.options.concurrency;

    // 如果提供了eventBus，使用它，否则创建一个新的
    this.eventBus = eventBus || new EventBus();

    if (this.options.memoryOptimization) {
      this.startMemoryMonitoring();
    }

    if (this.options.networkOptimization) {
      this.startNetworkMonitoring();
    }

    // 每30秒根据环境动态调整并发
    this.startConcurrencyAdjustment();
  }

  /**
   * 设置事件总线
   * @param eventBus 事件总线实例
   */
  setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * 启动内存监控
   */
  private startMemoryMonitoring(): void {
    // 启动内存监控
    MemoryManager.startMonitoring();

    // 每10秒检查一次内存使用情况，并调整上传行为
    this.memoryMonitorInterval = setInterval(() => {
      // 当内存使用过高时，减少并发数
      if (MemoryManager.isLowMemory()) {
        const previousConcurrency = this.dynamicConcurrency;
        this.dynamicConcurrency = Math.max(
          1,
          Math.floor(this.dynamicConcurrency * 0.75)
        );

        if (previousConcurrency !== this.dynamicConcurrency) {
          this.eventBus.emit('concurrencyChange', {
            previous: previousConcurrency,
            current: this.dynamicConcurrency,
            reason: 'memoryConstraint',
          });
        }
      }

      // 当内存达到临界值，暂停任务调度
      if (MemoryManager.isCriticalMemory()) {
        if (!this.paused) {
          this.pause();

          // 触发内存警告事件
          this.eventBus.emit('memoryWarning', {
            memoryStats: MemoryManager.getMemoryStats(),
            action: 'pauseScheduler',
          });

          // 建议浏览器执行垃圾回收
          MemoryManager.suggestGarbageCollection();

          // 2秒后恢复任务调度
          setTimeout(() => {
            this.resume();
          }, 2000);
        }
      }
    }, 10000);
  }

  /**
   * 启动网络监控
   */
  private startNetworkMonitoring(): void {
    const checkNetworkStatus = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
        const previousStatus = this.networkStatus;
        this.networkStatus = navigator.onLine ? 'online' : 'offline';

        // 记录网络状态历史
        const now = Date.now();
        this.networkHistory.push({
          status: this.networkStatus,
          timestamp: now,
        });

        // 只保留最近10条记录
        if (this.networkHistory.length > 10) {
          this.networkHistory.shift();
        }

        // 如果网络状态发生变化
        if (previousStatus !== this.networkStatus) {
          this.lastNetworkStatusTime = now;

          // 如果网络断开，暂停调度器
          if (this.networkStatus === 'offline') {
            if (!this.paused) {
              this.pause();
              this.waitingForNetworkRecovery = true;

              this.eventBus.emit('networkStatusChange', {
                previous: previousStatus,
                current: this.networkStatus,
                action: 'pauseScheduler',
              });
            }
          }
          // 如果网络恢复，恢复调度器
          else if (
            previousStatus === 'offline' &&
            this.waitingForNetworkRecovery
          ) {
            this.waitingForNetworkRecovery = false;

            // 稍等一下再恢复，确保网络确实稳定
            setTimeout(() => {
              if (this.networkStatus === 'online') {
                this.resume();

                this.eventBus.emit('networkStatusChange', {
                  previous: previousStatus,
                  current: this.networkStatus,
                  action: 'resumeScheduler',
                });
              }
            }, 1000);
          }
        }
      }
    };

    // 初始检查
    checkNetworkStatus();

    // 设置定期检查
    this.networkCheckInterval = setInterval(checkNetworkStatus, 3000);

    // 添加在线/离线事件监听
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.networkStatus = 'online';
        if (this.waitingForNetworkRecovery) {
          this.waitingForNetworkRecovery = false;
          this.resume();

          this.eventBus.emit('networkStatusChange', {
            previous: 'offline',
            current: 'online',
            action: 'resumeScheduler',
          });
        }
      });

      window.addEventListener('offline', () => {
        this.networkStatus = 'offline';
        if (!this.paused) {
          this.pause();
          this.waitingForNetworkRecovery = true;

          this.eventBus.emit('networkStatusChange', {
            previous: 'online',
            current: 'offline',
            action: 'pauseScheduler',
          });
        }
      });
    }
  }

  /**
   * 启动动态并发调整
   */
  private startConcurrencyAdjustment(): void {
    this.concurrencyAdjustInterval = setInterval(() => {
      // 如果优化被禁用，则使用固定值
      if (
        !this.isMemoryOptimizationEnabled &&
        !this.isNetworkOptimizationEnabled
      ) {
        this.dynamicConcurrency = this.options.concurrency;
        return;
      }

      // 根据环境状况调整并发度
      let recommendedConcurrency = this.options.concurrency;

      // 根据内存使用情况调整
      if (this.isMemoryOptimizationEnabled) {
        recommendedConcurrency = MemoryManager.getRecommendedConcurrency(
          recommendedConcurrency
        );
      }

      // 根据网络稳定性调整
      if (
        this.isNetworkOptimizationEnabled &&
        this.networkHistory.length >= 3
      ) {
        // 计算网络稳定性
        const changes = this.calculateNetworkChanges();
        const stability = changes > 3 ? 'unstable' : 'stable';

        // 不稳定网络减少并发
        if (stability === 'unstable') {
          recommendedConcurrency = Math.max(
            1,
            Math.floor(recommendedConcurrency * 0.6)
          );
        }
      }

      // 更新动态并发值
      if (this.dynamicConcurrency !== recommendedConcurrency) {
        const previous = this.dynamicConcurrency;
        this.dynamicConcurrency = recommendedConcurrency;

        this.eventBus.emit('concurrencyChange', {
          previous,
          current: recommendedConcurrency,
          reason: 'autoAdjustment',
        });
      }
    }, 30000); // 每30秒调整一次
  }

  /**
   * 计算网络变化次数
   * @returns 网络变化次数
   */
  private calculateNetworkChanges(): number {
    let changes = 0;

    // 至少需要2条记录才能计算变化
    if (this.networkHistory.length < 2) return 0;

    for (let i = 1; i < this.networkHistory.length; i++) {
      if (this.networkHistory[i].status !== this.networkHistory[i - 1].status) {
        changes++;
      }
    }

    return changes;
  }

  /**
   * 添加任务到队列
   * @param task 任务函数
   * @param priority 任务优先级
   * @param metadata 任务元数据
   * @returns 任务ID
   */
  addTask(
    task: Task,
    priority: TaskPriority = TaskPriority.NORMAL,
    metadata?: TaskMetadata
  ): number {
    const taskId = ++this.taskIdCounter;

    const taskItem: TaskItem = {
      id: taskId,
      task,
      retryCount: 0,
      currentAttempt: 0,
      completed: false,
      priority,
      metadata,
      state: TaskState.PENDING,
      maxRetries: this.options.retries,
    };

    this.taskQueue.push(taskItem);
    this.totalTaskCount++;

    // 按优先级排序
    if (this.options.priorityQueue) {
      this.taskQueue.sort((a, b) => a.priority - b.priority);
    }

    // 通知有新任务
    this.eventBus.emit('taskAdded', { taskId, metadata });

    // 如果设置了自动启动，那就开始执行任务
    if (this.options.autoStart && this.taskQueue.length === 1 && !this.paused) {
      this.processNextTask();
    }

    return taskId;
  }

  /**
   * 处理下一个任务
   */
  private processNextTask(): void {
    if (this.aborted || this.paused) return;

    // 如果已经在处理任务，不重复处理
    if (this.isProcessing) return;

    this.isProcessing = true;

    // 记录开始时间
    if (this.startTime === 0) {
      this.startTime = Date.now();
    }

    // 执行队列中的任务，同时遵守并发限制
    const executeNextBatch = () => {
      if (this.aborted || this.paused) {
        this.isProcessing = false;
        return;
      }

      // 如果队列为空，但仍有进行中的任务，等待任务完成
      if (this.taskQueue.length === 0 && this.runningTasks.size === 0) {
        this.isProcessing = false;
        this.checkForIdle();
        return;
      }

      // 如果队列为空但有运行中的任务，继续等待
      if (this.taskQueue.length === 0 && this.runningTasks.size > 0) {
        this.nextTaskTimeout = setTimeout(() => {
          executeNextBatch();
        }, 100);
        return;
      }

      // 检查当前运行的任务数量
      while (
        this.runningTasks.size < this.dynamicConcurrency &&
        this.taskQueue.length > 0
      ) {
        const taskItem = this.taskQueue.shift();
        if (taskItem) {
          // 如果任务已经被标记为中止，则跳过
          if (taskItem.aborted) {
            this.abortedTaskCount++;
            this.taskStats.aborted++;
            continue;
          }

          // 标记任务为进行中
          taskItem.state = TaskState.RUNNING;
          taskItem.startTime = Date.now();
          taskItem.currentAttempt++;

          // 记录到运行中的任务
          this.runningTasks.set(taskItem.id, taskItem);

          // 发送任务开始事件
          this.eventBus.emit('taskStarted', {
            taskId: taskItem.id,
            metadata: taskItem.metadata,
            attempt: taskItem.currentAttempt,
          });

          // 执行任务
          Promise.resolve()
            .then(() => taskItem.task())
            .then(result => {
              // 计算任务执行时间
              const endTime = Date.now();
              const executionTime = endTime - (taskItem.startTime || endTime);

              // 更新统计信息
              this.taskStats.executed++;
              this.taskStats.succeeded++;
              this.taskStats.totalExecutionTime += executionTime;
              this.taskStats.averageExecutionTime =
                this.taskStats.totalExecutionTime / this.taskStats.succeeded;

              if (executionTime > this.taskStats.longestExecutionTime) {
                this.taskStats.longestExecutionTime = executionTime;
              }

              if (executionTime < this.taskStats.shortestExecutionTime) {
                this.taskStats.shortestExecutionTime = executionTime;
              }

              taskItem.state = TaskState.COMPLETED;
              taskItem.completed = true;
              taskItem.endTime = endTime;
              taskItem.executionTime = executionTime;
              taskItem.result = result;

              // 从运行中的任务中移除
              this.runningTasks.delete(taskItem.id);
              this.completedTaskCount++;

              // 触发任务完成事件
              this.eventBus.emit('taskCompleted', {
                taskId: taskItem.id,
                result,
                metadata: taskItem.metadata,
                executionTime,
              });

              // 更新进度
              this.updateProgress();

              // 继续执行下一批任务
              executeNextBatch();
            })
            .catch(error => {
              // 记录错误
              taskItem.error = error;
              taskItem.state = TaskState.FAILED;

              // 触发任务错误事件
              this.eventBus.emit('taskError', {
                taskId: taskItem.id,
                error,
                metadata: taskItem.metadata,
                retryCount: taskItem.retryCount,
                maxRetries: this.options.retries,
              });

              // 检查是否需要重试
              if (taskItem.retryCount < this.options.retries) {
                taskItem.retryCount++;
                taskItem.state = TaskState.PENDING;

                this.taskStats.retried++;

                // 定时重试
                setTimeout(() => {
                  if (!this.aborted && !taskItem.aborted) {
                    // 将任务放回队列
                    this.taskQueue.unshift(taskItem);

                    // 触发重试事件
                    this.eventBus.emit('taskRetry', {
                      taskId: taskItem.id,
                      attempt: taskItem.retryCount,
                      metadata: taskItem.metadata,
                    });

                    // 从运行中的任务中移除
                    this.runningTasks.delete(taskItem.id);

                    // 继续执行下一批任务
                    executeNextBatch();
                  }
                }, this.options.retryDelay);
              } else {
                // 任务失败且不再重试
                taskItem.state = TaskState.FAILED;
                this.failedTaskCount++;
                this.taskStats.failed++;

                // 触发任务失败事件
                this.eventBus.emit('taskFailed', {
                  taskId: taskItem.id,
                  error,
                  metadata: taskItem.metadata,
                });

                // 从运行中的任务中移除
                this.runningTasks.delete(taskItem.id);

                // 更新进度
                this.updateProgress();

                // 继续执行下一批任务
                executeNextBatch();
              }
            });
        }
      }

      // 如果还有未处理的任务，但当前并发已满，等待一下再检查
      if (
        this.taskQueue.length > 0 &&
        this.runningTasks.size >= this.dynamicConcurrency
      ) {
        this.nextTaskTimeout = setTimeout(() => {
          executeNextBatch();
        }, 100);
      }
    };

    executeNextBatch();
  }

  /**
   * 检查是否空闲
   */
  private checkForIdle(): void {
    // 如果没有任务且没有启动空闲计时
    if (this.taskQueue.length === 0 && this.runningTasks.size === 0) {
      if (this.idleStartTime === 0) {
        this.idleStartTime = Date.now();

        // 触发空闲开始事件
        this.eventBus.emit('schedulerIdle', {
          timestamp: this.idleStartTime,
        });
      } else {
        const idleTime = Date.now() - this.idleStartTime;

        // 如果空闲时间超过设定值，可以考虑释放资源
        if (idleTime > this.options.maxIdleTime) {
          // 释放内存
          if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
            this.memoryMonitorInterval = null;
            MemoryManager.stopMonitoring();
          }

          // 触发空闲超时事件
          this.eventBus.emit('schedulerIdleTimeout', {
            idleTime,
            action: 'releaseResources',
          });
        }
      }
    } else {
      // 重置空闲计时
      this.idleStartTime = 0;
    }
  }

  /**
   * 启动任务处理
   */
  start(): void {
    if (this.aborted) return;

    this.paused = false;
    this.processNextTask();
  }

  /**
   * 暂停任务处理
   */
  pause(): void {
    this.paused = true;
    this.eventBus.emit('schedulerPaused', { timestamp: Date.now() });
  }

  /**
   * 恢复任务处理
   */
  resume(): void {
    if (this.aborted) return;

    this.paused = false;
    this.eventBus.emit('schedulerResumed', { timestamp: Date.now() });

    // 继续处理任务
    this.processNextTask();
  }

  /**
   * 中止所有任务
   */
  abort(): void {
    this.aborted = true;

    // 清除所有定时器
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }

    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
      MemoryManager.stopMonitoring();
    }

    if (this.concurrencyAdjustInterval) {
      clearInterval(this.concurrencyAdjustInterval);
      this.concurrencyAdjustInterval = null;
    }

    if (this.nextTaskTimeout) {
      clearTimeout(this.nextTaskTimeout);
      this.nextTaskTimeout = null;
    }

    // 标记所有任务为中止
    this.runningTasks.forEach(taskItem => {
      taskItem.aborted = true;
      taskItem.state = TaskState.ABORTED;
    });

    this.taskQueue.forEach(taskItem => {
      taskItem.aborted = true;
      taskItem.state = TaskState.ABORTED;
    });

    // 清空任务队列
    this.taskQueue = [];
    this.runningTasks.clear();

    // 触发中止事件
    this.eventBus.emit('schedulerAborted', { timestamp: Date.now() });
  }

  /**
   * 手动设置并发数
   * @param concurrency 并发数
   */
  setConcurrency(concurrency: number): void {
    if (concurrency < 1) {
      throw new Error('Concurrency must be greater than 0');
    }

    const previous = this.options.concurrency;
    this.options.concurrency = concurrency;
    this.dynamicConcurrency = concurrency;

    this.eventBus.emit('concurrencyChange', {
      previous,
      current: concurrency,
      reason: 'manual',
    });

    // 如果当前并发小于新设置的并发，则启动更多任务
    if (!this.paused && !this.aborted) {
      this.processNextTask();
    }
  }

  /**
   * 获取当前并发数
   * @returns 当前并发数
   */
  getConcurrency(): number {
    return this.dynamicConcurrency;
  }

  /**
   * 获取活跃任务数
   * @returns 活跃任务数
   */
  getActiveTaskCount(): number {
    return this.runningTasks.size;
  }

  /**
   * 获取待处理任务数
   * @returns 待处理任务数
   */
  getPendingTaskCount(): number {
    return this.taskQueue.length;
  }

  /**
   * 获取已完成任务数
   * @returns 已完成任务数
   */
  getCompletedTaskCount(): number {
    return this.completedTaskCount;
  }

  /**
   * 获取失败任务数
   * @returns 失败任务数
   */
  getFailedTaskCount(): number {
    return this.failedTaskCount;
  }

  /**
   * 获取总任务数
   * @returns 总任务数
   */
  getTotalTaskCount(): number {
    return this.totalTaskCount;
  }

  /**
   * 订阅进度更新
   * @param callback 进度回调
   */
  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * 更新进度并通知订阅者
   */
  private updateProgress(): void {
    const totalTasks = this.totalTaskCount;
    if (totalTasks === 0) return;

    const completedTasks = this.completedTaskCount + this.failedTaskCount;
    const progress = Math.min(1, completedTasks / totalTasks);

    // 只有当进度有明显变化时才通知
    if (Math.abs(progress - this.lastProgress) >= 0.01 || progress === 1) {
      this.lastProgress = progress;

      const progressData = {
        progress,
        completed: this.completedTaskCount,
        failed: this.failedTaskCount,
        aborted: this.abortedTaskCount,
        total: totalTasks,
        remaining: totalTasks - completedTasks,
      };

      // 通知所有订阅者
      this.progressCallbacks.forEach(callback => {
        try {
          callback(progressData);
        } catch (error) {
          console.error('Error in progress callback:', error);
        }
      });

      // 发出进度事件
      this.eventBus.emit('progress', progressData);
    }
  }

  /**
   * 获取任务状态
   * @param taskId 任务ID
   * @returns 任务状态
   */
  getTaskState(taskId: number): TaskState | null {
    // 检查运行中的任务
    if (this.runningTasks.has(taskId)) {
      return this.runningTasks.get(taskId)?.state || null;
    }

    // 检查队列中的任务
    const queueTask = this.taskQueue.find(task => task.id === taskId);
    if (queueTask) {
      return queueTask.state;
    }

    return null;
  }

  /**
   * 获取任务统计信息
   * @returns 任务统计信息
   */
  getTaskStats(): TaskStats {
    return { ...this.taskStats };
  }

  /**
   * 优先执行指定任务
   * @param taskId 任务ID
   * @returns 是否成功
   */
  prioritizeTask(taskId: number): boolean {
    // 在队列中查找任务
    const taskIndex = this.taskQueue.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return false;

    // 从队列中移除任务
    const [task] = this.taskQueue.splice(taskIndex, 1);

    // 将任务添加到队列最前面
    this.taskQueue.unshift(task);

    this.eventBus.emit('taskPrioritized', { taskId });

    return true;
  }

  /**
   * 取消指定任务
   * @param taskId 任务ID
   * @returns 是否成功
   */
  cancelTask(taskId: number): boolean {
    // 在队列中查找任务
    const taskIndex = this.taskQueue.findIndex(task => task.id === taskId);
    if (taskIndex !== -1) {
      // 从队列中移除任务
      const [task] = this.taskQueue.splice(taskIndex, 1);
      task.state = TaskState.CANCELLED;

      this.eventBus.emit('taskCancelled', { taskId });

      return true;
    }

    // 检查正在运行的任务
    if (this.runningTasks.has(taskId)) {
      const task = this.runningTasks.get(taskId);
      if (task) {
        task.aborted = true;
        task.state = TaskState.CANCELLED;

        // 从运行中的任务中移除
        this.runningTasks.delete(taskId);

        this.eventBus.emit('taskCancelled', { taskId });

        return true;
      }
    }

    return false;
  }

  /**
   * 清理不再需要的资源
   */
  dispose(): void {
    // 中止所有任务
    this.abort();

    // 清空事件总线
    this.eventBus.clear();

    // 清空回调
    this.progressCallbacks = [];
  }
}

export default TaskScheduler;
