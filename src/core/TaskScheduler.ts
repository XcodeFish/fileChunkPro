/**
 * TaskScheduler - 任务调度系统
 * 负责并发控制、任务队列管理和进度计算
 */

interface TaskSchedulerOptions {
  maxConcurrent: number; // 最大并发数
  retryCount: number; // 最大重试次数
  retryDelay: number; // 重试延迟(毫秒)
  timeout: number; // 任务超时时间(毫秒)
}

type Task = () => Promise<any>;
type ProgressCallback = (progress: number) => void;

interface TaskItem {
  id: number; // 任务ID
  task: Task; // 任务函数
  retryCount: number; // 已重试次数
  completed: boolean; // 是否已完成
}

export class TaskScheduler {
  private options: TaskSchedulerOptions;
  private taskQueue: TaskItem[] = [];
  private runningTasks: Set<number> = new Set();
  private completedTaskCount = 0;
  private progressCallbacks: ProgressCallback[] = [];
  private aborted = false;
  private lastProgress = 0;

  constructor(options: TaskSchedulerOptions) {
    this.options = {
      maxConcurrent: options.maxConcurrent || 3,
      retryCount: options.retryCount || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
    };
  }

  /**
   * 添加任务到队列
   * @param task 任务函数
   * @param id 任务ID
   */
  public addTask(task: Task, id: number): void {
    this.taskQueue.push({
      id,
      task,
      retryCount: 0,
      completed: false,
    });
  }

  /**
   * 获取任务的重试次数
   * @param id 任务ID
   * @returns 重试次数
   */
  public getRetryCount(id: number): number {
    const task = this.taskQueue.find(t => t.id === id);
    return task ? task.retryCount : 0;
  }

  /**
   * 清空任务队列
   */
  public clear(): void {
    this.taskQueue = [];
    this.runningTasks.clear();
    this.completedTaskCount = 0;
    this.aborted = true;
  }

  /**
   * 注册进度回调函数
   * @param callback 进度回调函数
   */
  public onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * 执行所有任务
   * @returns 任务执行结果的Promise
   */
  public async run(): Promise<void> {
    this.aborted = false;
    this.lastProgress = 0;
    this.completedTaskCount = 0;

    // 没有任务，直接返回
    if (this.taskQueue.length === 0) {
      this.updateProgress(100);
      return Promise.resolve();
    }

    try {
      // 开始执行任务
      const totalTasks = this.taskQueue.length;
      await this.scheduleNext();

      // 等待所有任务完成
      while (this.completedTaskCount < totalTasks && !this.aborted) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 如果被中止，抛出错误
      if (this.aborted) {
        throw new Error('任务队列已被中止');
      }

      // 确保最终进度为100%
      this.updateProgress(100);
      return Promise.resolve();
    } catch (error) {
      this.aborted = true;
      throw error;
    }
  }

  /**
   * 调度下一批任务
   */
  private async scheduleNext(): Promise<void> {
    // 如果已中止，不再调度
    if (this.aborted) return;

    // 计算可以添加多少新任务
    const availableSlots = this.options.maxConcurrent - this.runningTasks.size;
    if (availableSlots <= 0) return;

    // 找出未完成且未运行的任务
    const pendingTasks = this.taskQueue.filter(
      task => !task.completed && !this.runningTasks.has(task.id)
    );

    // 没有待处理任务，直接返回
    if (pendingTasks.length === 0) return;

    // 开始执行新任务
    const tasksToStart = pendingTasks.slice(0, availableSlots);
    for (const task of tasksToStart) {
      this.runningTasks.add(task.id);
      this.executeTask(task);
    }
  }

  /**
   * 执行单个任务
   * @param taskItem 任务项
   */
  private async executeTask(taskItem: TaskItem): Promise<void> {
    try {
      // 如果已中止，不执行任务
      if (this.aborted) return;

      // 执行任务，添加超时控制
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('任务执行超时')),
          this.options.timeout
        );
      });

      await Promise.race([taskItem.task(), timeoutPromise]);

      // 任务成功完成
      taskItem.completed = true;
      this.completedTaskCount++;
      this.runningTasks.delete(taskItem.id);
      this.updateProgress();

      // 调度下一批任务
      this.scheduleNext();
    } catch (error) {
      // 如果可以重试，则重试
      if (taskItem.retryCount < this.options.retryCount && !this.aborted) {
        taskItem.retryCount++;

        // 延迟后重试
        setTimeout(() => {
          if (!this.aborted) {
            this.executeTask(taskItem);
          }
        }, this.options.retryDelay);
      } else {
        // 重试次数已用完，标记为失败
        this.runningTasks.delete(taskItem.id);
        throw error;
      }
    }
  }

  /**
   * 更新并发送进度信息
   * @param forceProgress 强制设置的进度值
   */
  private updateProgress(forceProgress?: number): void {
    let progress: number;

    if (forceProgress !== undefined) {
      progress = forceProgress;
    } else {
      const total = this.taskQueue.length;
      if (total === 0) return;

      progress = Math.floor((this.completedTaskCount / total) * 100);
    }

    // 避免重复发送相同进度
    if (progress === this.lastProgress) return;
    this.lastProgress = progress;

    // 通知所有进度回调
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (e) {
        console.error('进度回调执行错误:', e);
      }
    }
  }
}

export default TaskScheduler;
