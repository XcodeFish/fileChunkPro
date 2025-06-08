/**
 * WorkerManager
 * 用于创建、管理和与Worker线程通信
 */

import { EnvUtils } from '../utils/EnvUtils';

// WorkerManager 配置
export interface WorkerManagerOptions {
  // 最大 Worker 数量
  maxWorkers?: number;
  // Worker 任务超时时间 (ms)
  workerTaskTimeout?: number;
  // Worker 失败时是否回退到主线程处理
  fallbackToMainThread?: boolean;
  // Worker 脚本路径
  workerPath?: string;
  // 是否使用内联 Worker
  inlineWorkers?: boolean;
}

// Worker 任务类型
export type WorkerTaskType =
  | 'calculateChunks'
  | 'calculateHash'
  | 'processFile';

// Worker 任务消息
export interface WorkerTaskMessage {
  taskId: string;
  type: WorkerTaskType;
  data: any;
}

// Worker 任务响应
export interface WorkerTaskResponse {
  taskId: string;
  success: boolean;
  error?: string;
  result?: any;
}

/**
 * WorkerManager 类
 * 负责 Worker 创建与管理、任务分发机制、Worker 通信接口、错误边界处理、降级方案处理
 */
export default class WorkerManager {
  private workers: Map<string, Worker> = new Map();
  private taskCallbacks: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timer: NodeJS.Timeout | null;
    }
  > = new Map();
  private options: WorkerManagerOptions;
  private isWorkerSupported: boolean;

  /**
   * 构造函数
   * @param options Worker管理器配置
   */
  constructor(options: WorkerManagerOptions = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || 2,
      workerTaskTimeout: options.workerTaskTimeout || 30000,
      fallbackToMainThread: options.fallbackToMainThread !== false,
      workerPath: options.workerPath || '/workers/default',
      inlineWorkers: options.inlineWorkers || false,
    };

    // 检查环境是否支持 Worker
    this.isWorkerSupported = EnvUtils.isWorkerSupported();
  }

  /**
   * 获取 Worker 实例
   * @param type Worker类型：chunk(分片处理) / hash(哈希计算) / default(默认)
   */
  private getWorker(type = 'default'): Worker | null {
    if (!this.isWorkerSupported) {
      return null;
    }

    // 如果已存在该类型的 Worker，则返回
    if (this.workers.has(type)) {
      return this.workers.get(type)!;
    }

    // 如果已达到最大 Worker 数量限制，则复用现有 Worker
    if (this.workers.size >= this.options.maxWorkers!) {
      // 返回第一个可用的 Worker
      return Array.from(this.workers.values())[0];
    }

    try {
      // 创建新 Worker
      let workerUrl: string;

      // 根据环境决定如何加载 Worker
      if (typeof window !== 'undefined' && typeof Blob !== 'undefined') {
        // 内联模式
        if (this.options.inlineWorkers) {
          // 在生产环境中，这部分应该由构建工具处理并注入
          // 为了示例，这里使用简化实现
          const workerScript = `
            self.onmessage = function(e) {
              const { taskId, type, data } = e.data;
              
              try {
                let result;
                
                // 根据任务类型执行不同的操作
                if (type === 'calculateChunks') {
                  // 简化的分片计算示例
                  const { fileSize, chunkSize } = data;
                  const chunks = [];
                  for (let start = 0; start < fileSize; start += chunkSize) {
                    const end = Math.min(start + chunkSize, fileSize);
                    chunks.push({ index: chunks.length, start, end, size: end - start });
                  }
                  result = chunks;
                } else if (type === 'calculateHash') {
                  // 哈希计算示例（实际实现会更复杂）
                  result = 'simulated-hash-' + Date.now();
                }
                
                // 发送成功响应
                self.postMessage({
                  taskId,
                  success: true,
                  result
                });
              } catch (error) {
                // 发送错误响应
                self.postMessage({
                  taskId,
                  success: false,
                  error: error.message || '未知错误'
                });
              }
            };
          `;

          const blob = new Blob([workerScript], { type: 'text/javascript' });
          workerUrl = URL.createObjectURL(blob);
        } else {
          // 外部文件方式
          workerUrl = `${this.options.workerPath}/${type === 'default' ? 'worker' : type}.js`;
        }

        const worker = new Worker(workerUrl);

        // 设置消息处理函数
        worker.onmessage = this.handleWorkerMessage.bind(this);
        worker.onerror = this.handleWorkerError.bind(this);

        this.workers.set(type, worker);
        return worker;
      }
    } catch (error) {
      console.error('创建 Worker 失败:', error);
      return null;
    }

    return null;
  }

  /**
   * 处理 Worker 消息
   * @param event Worker 消息事件
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const response = event.data as WorkerTaskResponse;
    const callback = this.taskCallbacks.get(response.taskId);

    if (callback) {
      // 清除超时定时器
      if (callback.timer) {
        clearTimeout(callback.timer);
      }

      if (response.success) {
        callback.resolve(response.result);
      } else {
        callback.reject(new Error(response.error || '任务失败'));
      }

      this.taskCallbacks.delete(response.taskId);
    }
  }

  /**
   * 处理 Worker 错误
   * @param event Worker 错误事件
   */
  private handleWorkerError(event: ErrorEvent): void {
    console.error('Worker 执行错误:', event.message);

    // 如果有正在执行的任务，将它们全部标记为失败
    this.taskCallbacks.forEach((callback, taskId) => {
      if (callback.timer) {
        clearTimeout(callback.timer);
      }

      callback.reject(new Error(`Worker 执行错误: ${event.message}`));
      this.taskCallbacks.delete(taskId);
    });
  }

  /**
   * 发送任务到 Worker 并等待响应
   * @param type 任务类型
   * @param data 任务数据
   * @param workerType Worker类型
   */
  async sendTask(
    type: WorkerTaskType,
    data: any,
    workerType = 'default'
  ): Promise<any> {
    // 如果不支持 Worker 或需要回退到主线程，则使用主线程处理
    if (!this.isWorkerSupported) {
      return this.fallbackToMainThread(type, data);
    }

    const worker = this.getWorker(workerType);

    // 如果获取 Worker 失败，则回退到主线程处理
    if (!worker && this.options.fallbackToMainThread) {
      return this.fallbackToMainThread(type, data);
    } else if (!worker) {
      throw new Error('无法创建 Worker，且未启用主线程回退');
    }

    // 创建任务 ID
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 创建任务消息
    const message: WorkerTaskMessage = {
      taskId,
      type,
      data,
    };

    // 创建 Promise
    return new Promise((resolve, reject) => {
      // 设置超时处理
      const timer = setTimeout(() => {
        // 如果任务超时，则从回调映射中移除并拒绝 Promise
        if (this.taskCallbacks.has(taskId)) {
          this.taskCallbacks.delete(taskId);

          if (this.options.fallbackToMainThread) {
            // 尝试在主线程中重新执行
            console.warn('Worker 任务超时，尝试在主线程中执行');
            this.fallbackToMainThread(type, data).then(resolve).catch(reject);
          } else {
            reject(new Error('Worker 任务超时'));
          }
        }
      }, this.options.workerTaskTimeout);

      // 存储回调
      this.taskCallbacks.set(taskId, { resolve, reject, timer });

      // 发送消息到 Worker
      worker.postMessage(message);
    });
  }

  /**
   * 主线程回退实现
   * @param type 任务类型
   * @param data 任务数据
   */
  private async fallbackToMainThread(
    type: WorkerTaskType,
    data: any
  ): Promise<any> {
    console.warn(`在主线程中执行任务: ${type}`);

    try {
      // 根据任务类型执行不同的操作
      switch (type) {
        case 'calculateChunks': {
          // 分片计算实现
          const { fileSize, chunkSize } = data;
          const chunks = [];

          for (let start = 0; start < fileSize; start += chunkSize) {
            const end = Math.min(start + chunkSize, fileSize);
            chunks.push({
              index: chunks.length,
              start,
              end,
              size: end - start,
              fileSize,
            });
          }

          return chunks;
        }

        case 'calculateHash': {
          // 哈希计算实现
          // 这里只是简单示例，实际应该实现真正的哈希算法
          return `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        case 'processFile': {
          // 文件处理相关操作
          throw new Error('主线程不支持此操作');
        }

        default:
          throw new Error(`未知任务类型: ${type}`);
      }
    } catch (error) {
      console.error(`主线程执行任务 ${type} 失败:`, error);
      throw error;
    }
  }

  /**
   * 处理所有未完成的任务
   */
  private handlePendingTasks(): void {
    this.taskCallbacks.forEach(callback => {
      if (callback.timer) {
        clearTimeout(callback.timer);
      }

      callback.reject(new Error('Worker 已终止'));
    });

    // 清空任务回调映射
    this.taskCallbacks.clear();
  }

  /**
   * 终止所有 Worker
   */
  terminate(): void {
    // 终止所有 Worker
    this.workers.forEach(worker => {
      try {
        worker.terminate();
      } catch (error) {
        console.error('终止 Worker 失败:', error);
      }
    });

    // 清空 Worker 映射
    this.workers.clear();

    // 处理所有未完成的任务
    this.handlePendingTasks();
  }
}
