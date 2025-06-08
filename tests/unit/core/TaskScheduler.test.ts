import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import EventBus from '../../../src/core/EventBus';
import TaskScheduler from '../../../src/core/TaskScheduler';
import { TaskPriority, TaskState } from '../../../src/types';

describe('TaskScheduler', () => {
  let taskScheduler: TaskScheduler;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    // 模拟并允许navigator.onLine
    vi.stubGlobal('navigator', { onLine: true });

    taskScheduler = new TaskScheduler(
      {
        concurrency: 2,
        retries: 2,
        retryDelay: 100,
        priorityQueue: true,
        autoStart: false,
        memoryOptimization: false,
        networkOptimization: false,
      },
      eventBus
    );

    // 模拟添加全局事件监听器
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
  });

  afterEach(() => {
    taskScheduler.abort();
    taskScheduler.dispose();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should initialize with correct options', () => {
    expect(taskScheduler).toBeDefined();
    expect(taskScheduler.getConcurrency()).toBe(2);
  });

  it('should add tasks to queue', () => {
    const task = vi.fn().mockResolvedValue('success');
    const taskId = taskScheduler.addTask(task, TaskPriority.NORMAL);

    expect(taskId).toBe(1);
    expect(taskScheduler.getTotalTaskCount()).toBe(1);
    expect(taskScheduler.getPendingTaskCount()).toBe(1);
  });

  it('should execute tasks respecting concurrency limit', async () => {
    // 创建延迟任务的函数
    const createDelayedTask = (delay: number) => {
      return () =>
        new Promise(resolve => {
          setTimeout(() => resolve(delay), delay);
        });
    };

    // 添加3个任务，但并发限制是2
    taskScheduler.addTask(createDelayedTask(50));
    taskScheduler.addTask(createDelayedTask(50));
    taskScheduler.addTask(createDelayedTask(50));

    taskScheduler.start();

    // 检查任务是否按并发限制执行
    await vi.advanceTimersByTimeAsync(10);
    expect(taskScheduler.getActiveTaskCount()).toBe(2);

    // 第一批任务完成后，应该开始执行第三个任务
    await vi.advanceTimersByTimeAsync(60);
    expect(taskScheduler.getActiveTaskCount()).toBe(1);

    // 所有任务完成
    await vi.advanceTimersByTimeAsync(60);
    expect(taskScheduler.getActiveTaskCount()).toBe(0);
    expect(taskScheduler.getCompletedTaskCount()).toBe(3);
  });

  it('should retry failed tasks', async () => {
    // 模拟一个会失败再成功的任务
    let attempts = 0;
    const task = vi.fn().mockImplementation(() => {
      return new Promise((resolve, reject) => {
        attempts++;
        if (attempts === 1) {
          reject(new Error('First attempt failed'));
        } else {
          resolve('success');
        }
      });
    });

    taskScheduler.addTask(task);
    taskScheduler.start();

    // 第一次尝试失败
    await vi.advanceTimersByTimeAsync(10);

    // 等待重试延迟
    await vi.advanceTimersByTimeAsync(100);

    // 第二次尝试成功
    await vi.advanceTimersByTimeAsync(10);

    expect(task).toHaveBeenCalledTimes(2);
    expect(taskScheduler.getCompletedTaskCount()).toBe(1);

    // 获取任务统计
    const stats = taskScheduler.getTaskStats();
    expect(stats.retried).toBe(1);
    expect(stats.succeeded).toBe(1);
  });

  it('should handle task priorities correctly', async () => {
    const executionOrder: number[] = [];

    const createPriorityTask = (id: number) => {
      return () =>
        new Promise<void>(resolve => {
          executionOrder.push(id);
          resolve();
        });
    };

    // 添加不同优先级的任务
    taskScheduler.addTask(createPriorityTask(1), TaskPriority.NORMAL);
    taskScheduler.addTask(createPriorityTask(2), TaskPriority.HIGH);
    taskScheduler.addTask(createPriorityTask(3), TaskPriority.CRITICAL);
    taskScheduler.addTask(createPriorityTask(4), TaskPriority.LOW);

    taskScheduler.start();

    // 等待所有任务完成
    await vi.advanceTimersByTimeAsync(100);

    // 应该按优先级高到低执行
    // 注意：由于并发是2，所以前两个会同时开始，但高优先级应该在前面
    expect(executionOrder[0]).toBe(3); // CRITICAL
    expect(executionOrder[1]).toBe(2); // HIGH
    expect(executionOrder[2]).toBe(1); // NORMAL
    expect(executionOrder[3]).toBe(4); // LOW
  });

  it('should emit progress events', () => {
    const progressCallback = vi.fn();
    const eventCallback = vi.fn();

    taskScheduler.onProgress(progressCallback);
    eventBus.on('progress', eventCallback);

    // 添加和完成任务
    taskScheduler.addTask(() => Promise.resolve());
    taskScheduler.addTask(() => Promise.resolve());

    taskScheduler.start();

    // 模拟任务完成
    vi.advanceTimersByTime(10);

    expect(progressCallback).toHaveBeenCalled();
    expect(eventCallback).toHaveBeenCalled();

    const progressData = progressCallback.mock.calls[0][0];
    expect(progressData).toHaveProperty('progress');
    expect(progressData).toHaveProperty('completed');
    expect(progressData).toHaveProperty('total');
  });

  it('should pause and resume task processing', async () => {
    const task1 = vi.fn().mockResolvedValue('task1');
    const task2 = vi.fn().mockResolvedValue('task2');

    taskScheduler.addTask(task1);
    taskScheduler.addTask(task2);

    taskScheduler.start();

    // 立即暂停
    taskScheduler.pause();

    // 等待一段时间，确认任务没有执行
    await vi.advanceTimersByTimeAsync(50);
    expect(task1).not.toHaveBeenCalled();
    expect(task2).not.toHaveBeenCalled();

    // 恢复执行
    taskScheduler.resume();

    // 等待任务执行完成
    await vi.advanceTimersByTimeAsync(50);
    expect(task1).toHaveBeenCalled();
    expect(task2).toHaveBeenCalled();
  });

  it('should cancel specific tasks', async () => {
    const task1 = vi.fn().mockResolvedValue('task1');
    const task2 = vi.fn().mockResolvedValue('task2');

    const taskId1 = taskScheduler.addTask(task1);
    taskScheduler.addTask(task2);

    // 取消第一个任务
    const cancelled = taskScheduler.cancelTask(taskId1);
    expect(cancelled).toBe(true);

    taskScheduler.start();

    // 等待任务执行完成
    await vi.advanceTimersByTimeAsync(50);
    expect(task1).not.toHaveBeenCalled(); // 被取消的任务不应执行
    expect(task2).toHaveBeenCalled();

    // 检查任务状态
    expect(taskScheduler.getTaskState(taskId1)).toBe(TaskState.CANCELLED);
  });

  it('should prioritize specific tasks', async () => {
    const executionOrder: number[] = [];

    const createTask = (id: number) => {
      return () =>
        new Promise<void>(resolve => {
          executionOrder.push(id);
          resolve();
        });
    };

    // 添加多个普通优先级的任务
    taskScheduler.addTask(createTask(1), TaskPriority.NORMAL);
    taskScheduler.addTask(createTask(2), TaskPriority.NORMAL);
    const taskId3 = taskScheduler.addTask(createTask(3), TaskPriority.NORMAL);

    // 优先处理第三个任务
    taskScheduler.prioritizeTask(taskId3);

    // 由于并发为2，应该首先执行任务1和任务3
    taskScheduler.start();

    // 等待任务执行完成
    await vi.advanceTimersByTimeAsync(50);

    // 任务3应该在任务2之前执行
    const task3Index = executionOrder.indexOf(3);
    const task2Index = executionOrder.indexOf(2);
    expect(task3Index).toBeLessThan(task2Index);
  });

  it('should handle network status changes', async () => {
    const onlineEventBusEmitSpy = vi.spyOn(eventBus, 'emit');

    // 模拟离线状态
    Object.defineProperty(navigator, 'onLine', { value: false });

    // 创建新的调度器，这次启用网络优化
    const networkSensitiveScheduler = new TaskScheduler(
      {
        concurrency: 2,
        retries: 2,
        networkOptimization: true,
      },
      eventBus
    );

    const task = vi.fn().mockResolvedValue('success');
    networkSensitiveScheduler.addTask(task);

    // 调度器应该暂停，因为网络离线
    expect(task).not.toHaveBeenCalled();

    // 模拟网络恢复事件
    Object.defineProperty(navigator, 'onLine', { value: true });

    // 触发online事件
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('online'));
    }

    // 检查事件触发
    expect(onlineEventBusEmitSpy).toHaveBeenCalledWith(
      'networkStatusChange',
      expect.objectContaining({
        previous: 'offline',
        current: 'online',
      })
    );

    // 清理
    networkSensitiveScheduler.dispose();
  });

  it('should adjust concurrency based on settings', () => {
    // 手动设置并发度
    taskScheduler.setConcurrency(4);
    expect(taskScheduler.getConcurrency()).toBe(4);

    // 尝试设置无效值
    expect(() => {
      taskScheduler.setConcurrency(0);
    }).toThrow();
  });

  it('should abort all tasks', async () => {
    const task1 = vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve('result1'), 100);
      });
    });

    const task2 = vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => resolve('result2'), 100);
      });
    });

    taskScheduler.addTask(task1);
    taskScheduler.addTask(task2);

    taskScheduler.start();

    // 立即中止所有任务
    taskScheduler.abort();

    // 等待足够长的时间
    await vi.advanceTimersByTimeAsync(200);

    // 任务应该被取消
    expect(taskScheduler.getCompletedTaskCount()).toBe(0);
  });
});
