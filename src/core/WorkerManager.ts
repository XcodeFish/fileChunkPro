/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WorkerManager
 * 用于创建、管理和与Worker线程通信
 */

import { EnvUtils } from '../utils/EnvUtils';
import { Logger } from '../utils/Logger';

import { EventBus } from './EventBus';

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
  // 是否自动调整Worker池大小
  autoAdjustPool?: boolean;
  // 健康检查间隔(ms)
  healthCheckInterval?: number;
  // 是否记录性能指标
  logPerformance?: boolean;
  // 事件总线实例
  eventBus?: EventBus;
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

// Worker状态
export type WorkerStatus = 'idle' | 'busy' | 'error' | 'unresponsive';

// Worker实例信息
interface WorkerInstance {
  worker: Worker;
  status: WorkerStatus;
  taskCount?: number;
  totalTaskTime?: number;
  errorCount?: number;
  lastResponseTime?: number;
  creationTime?: number;
  unresponsiveCount?: number;
  memoryUsage?: any;
  cpuUsage?: any;
}

// Worker性能指标
export interface WorkerPerformanceMetrics {
  timestamp: number;
  workers: {
    [type: string]: {
      status: WorkerStatus;
      taskCount: number;
      avgTaskTime: number;
      errorCount: number;
      memoryUsage?: any;
      cpuUsage?: any;
    };
  };
}

// Worker配置
interface WorkerConfig {
  poolSize: number;
  maxTasks: number;
  scriptPath: string;
}

/**
 * WorkerManager 类
 * 负责 Worker 创建与管理、任务分发机制、Worker 通信接口、错误边界处理、降级方案处理
 */
export default class WorkerManager {
  private workers: Map<string, WorkerInstance> = new Map();
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
  private initialized = false;
  private pendingTasks: Map<
    string,
    Array<{
      taskId: string;
      type: WorkerTaskType;
      data: any;
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      priority: number;
    }>
  > = new Map();
  private activeTaskCount = 0;
  private isTerminating = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private workerConfigs: Record<string, WorkerConfig> = {};
  private eventBus?: EventBus;
  private logger: Logger = new Logger('WorkerManager');

  /**
   * 构造函数
   * @param options Worker管理器配置
   */
  constructor(options: WorkerManagerOptions = {}) {
    this.options = {
      maxWorkers:
        options.maxWorkers ||
        Math.max(
          2,
          navigator.hardwareConcurrency ? navigator.hardwareConcurrency - 1 : 2
        ),
      workerTaskTimeout: options.workerTaskTimeout || 30000,
      fallbackToMainThread: options.fallbackToMainThread !== false,
      workerPath: options.workerPath || '/workers/default',
      inlineWorkers: options.inlineWorkers || false,
      autoAdjustPool: options.autoAdjustPool !== false,
      healthCheckInterval: options.healthCheckInterval || 30000,
      logPerformance: options.logPerformance || false,
      eventBus: options.eventBus,
    };

    // 保存事件总线引用
    this.eventBus = this.options.eventBus;

    // 检查环境是否支持 Worker
    this.isWorkerSupported = EnvUtils.isWorkerSupported();

    // 设置Worker配置
    this.initializeWorkerConfigs();

    // 如果支持Worker，启动健康检查
    if (this.isWorkerSupported) {
      this.startWorkerHealthCheck();
    }
  }

  /**
   * 初始化Worker配置
   */
  private initializeWorkerConfigs(): void {
    // 默认Worker配置
    this.workerConfigs = {
      chunk: {
        poolSize: Math.max(2, Math.floor(this.options.maxWorkers! / 2)),
        maxTasks: 50,
        scriptPath: `${this.options.workerPath}/chunk.js`,
      },
      hash: {
        poolSize: 1,
        maxTasks: 20,
        scriptPath: `${this.options.workerPath}/hash.js`,
      },
      default: {
        poolSize: 1,
        maxTasks: 30,
        scriptPath: `${this.options.workerPath}/worker.js`,
      },
    };
  }

  /**
   * 初始化Worker池
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized || !this.isWorkerSupported) {
      return this.initialized;
    }

    let initSuccess = true;

    try {
      // 初始化每种类型的Worker池
      for (const [type, config] of Object.entries(this.workerConfigs)) {
        for (let i = 0; i < config.poolSize; i++) {
          const worker = await this.createWorker(type);
          if (worker) {
            const id = `${type}:${i}`;
            this.workers.set(id, {
              worker,
              status: 'idle',
              taskCount: 0,
              totalTaskTime: 0,
              errorCount: 0,
              lastResponseTime: Date.now(),
              creationTime: Date.now(),
            });
          } else {
            this.logger.warn(`初始化 ${type} Worker #${i} 失败`);
            initSuccess = false;
          }
        }

        // 初始化待处理任务队列
        this.pendingTasks.set(type, []);
      }

      this.initialized = initSuccess;

      if (initSuccess) {
        this.logger.info('Worker管理器初始化成功');
        this.eventBus?.emit('worker:initialized', { timestamp: Date.now() });
      } else {
        this.logger.warn('Worker管理器部分初始化失败，将使用回退机制');
        this.eventBus?.emit('worker:initWarning', {
          message: '部分Worker初始化失败',
          timestamp: Date.now(),
        });
      }

      return initSuccess;
    } catch (error) {
      this.logger.error('Worker管理器初始化失败', error);
      this.eventBus?.emit('worker:initError', { error, timestamp: Date.now() });
      return false;
    }
  }

  /**
   * 创建一个新的Worker实例
   * @param type Worker类型
   * @returns 创建的Worker实例或null（如果创建失败）
   */
  private async createWorker(type: string): Promise<Worker | null> {
    if (!this.isWorkerSupported) {
      this.logger.warn('当前环境不支持Web Workers');
      return null;
    }

    // 获取Worker配置
    const config = this.workerConfigs[type] || this.workerConfigs.default;

    try {
      let worker: Worker;

      // 创建Worker实例
      if (this.options.inlineWorkers) {
        // 使用内联脚本创建Worker
        const workerScript = this.getInlineWorkerScript(type);
        const blob = new Blob([workerScript], {
          type: 'application/javascript',
        });
        const url = URL.createObjectURL(blob);
        worker = new Worker(url);

        // 创建后立即释放URL对象
        URL.revokeObjectURL(url);
      } else {
        // 使用外部脚本创建Worker
        worker = new Worker(config.scriptPath);
      }

      // 设置Worker错误处理
      worker.onerror = (event: ErrorEvent) => {
        this.handleWorkerError(event, type);
      };

      // 设置Worker消息处理
      worker.onmessage = (event: MessageEvent) => {
        this.handleWorkerMessage(event, type);
      };

      // 等待Worker准备就绪
      const isReady = await this.waitForWorkerReady(worker).catch(error => {
        this.logger.error(`Worker(${type})初始化失败: ${error.message}`);
        return false;
      });

      if (!isReady) {
        // Worker初始化失败，尝试清理
        try {
          worker.terminate();
        } catch (e) {
          // 忽略终止错误
        }
        return null;
      }

      // 将Worker添加到池中
      this.workers.set(`${type}_${Date.now()}`, {
        worker,
        status: 'idle',
        taskCount: 0,
        totalTaskTime: 0,
        errorCount: 0,
        lastResponseTime: Date.now(),
        creationTime: Date.now(),
        unresponsiveCount: 0,
      });

      // 向Worker发送初始化消息
      worker.postMessage({
        action: 'init',
        config: {
          type,
          maxMemory: navigator.deviceMemory
            ? navigator.deviceMemory * 1024 * 1024 * 1024
            : undefined,
          logLevel: this.logger.getLevel(),
        },
      });

      this.logger.info(`成功创建Worker(${type})`);

      // 如果启用了事件总线，发布Worker创建事件
      if (this.eventBus) {
        this.eventBus.emit('worker:created', { type });
      }

      return worker;
    } catch (error) {
      this.logger.error(
        `创建Worker(${type})失败: ${error instanceof Error ? error.message : String(error)}`
      );

      // 如果启用了事件总线，发布Worker创建失败事件
      if (this.eventBus) {
        this.eventBus.emit('worker:createFailed', { type, error });
      }

      return null;
    }
  }

  /**
   * 等待Worker准备就绪
   * @param worker Worker实例
   * @param timeout 超时时间(ms)，默认5000ms
   * @returns Promise，解析为布尔值，表示Worker是否成功初始化
   */
  private waitForWorkerReady(worker: Worker, timeout = 5000): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      let isResolved = false;
      let messageHandler: ((event: MessageEvent) => void) | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      // 设置超时
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;

          // 清理事件监听器
          if (messageHandler) {
            worker.removeEventListener('message', messageHandler);
          }

          reject(new Error('Worker初始化超时'));
        }
      }, timeout);

      // 监听Worker消息
      messageHandler = (event: MessageEvent) => {
        const data = event.data;

        if (data && data.type === 'READY') {
          if (!isResolved) {
            isResolved = true;

            // 清理超时定时器
            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            // 移除事件监听
            worker.removeEventListener('message', messageHandler);

            resolve(true);
          }
        }
      };

      // 添加消息监听
      worker.addEventListener('message', messageHandler);

      // 发送ping消息，检查Worker是否响应
      try {
        worker.postMessage({ action: 'ping', timestamp: Date.now() });
      } catch (error) {
        // 如果发送消息失败，说明Worker已经不可用
        if (!isResolved) {
          isResolved = true;

          // 清理资源
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (messageHandler) {
            worker.removeEventListener('message', messageHandler);
          }

          reject(
            new Error(
              `Worker通信失败: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
    });
  }

  /**
   * 获取内联Worker脚本
   * @param type Worker类型
   */
  private getInlineWorkerScript(type: string): string {
    // 这里仅作为示例，实际项目中应该由构建工具处理
    // 基础脚本
    const baseScript = `
      self.onmessage = function(e) {
        const message = e.data;
        
        if (message.action === 'ping') {
          self.postMessage({ type: 'PONG', timestamp: Date.now() });
          return;
        }
        
        try {
          // 处理任务
          const { taskId, type, data } = message;
          let result;
          
          switch (type) {
    `;

    // 根据Worker类型添加不同的处理逻辑
    let typeSpecificScript = '';

    if (type === 'chunk') {
      typeSpecificScript = `
            case 'calculateChunks':
              // 简化的分片计算示例
              result = calculateChunks(data);
              break;
              
            case 'processFile':
              // 文件处理示例
              result = processFile(data);
              break;
      `;
    } else if (type === 'hash') {
      typeSpecificScript = `
            case 'calculateHash':
              // 哈希计算示例
              result = 'simulated-hash-' + Date.now();
              break;
      `;
    } else {
      // 默认Worker
      typeSpecificScript = `
            default:
              // 通用处理
              result = { processed: true, timestamp: Date.now() };
              break;
      `;
    }

    // 辅助函数
    const helperFunctions = `
      // 辅助函数
      function calculateChunks(data) {
        const { fileSize, chunkSize } = data;
        const chunks = [];
        for (let start = 0; start < fileSize; start += chunkSize) {
          const end = Math.min(start + chunkSize, fileSize);
          chunks.push({ index: chunks.length, start, end, size: end - start });
        }
        return chunks;
      }
      
      function processFile(data) {
        // 文件处理逻辑
        return { processed: true, size: data.size };
      }
    `;

    // 尾部脚本
    const tailScript = `
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
      
      // 通知主线程Worker已就绪
      self.postMessage({ type: 'READY' });
    `;

    return baseScript + typeSpecificScript + helperFunctions + tailScript;
  }

  /**
   * 获取Worker实例
   * @param type Worker类型
   */
  private getWorker(type = 'default'): Worker | null {
    if (!this.isWorkerSupported || !this.initialized) {
      return null;
    }

    // 查找指定类型的空闲Worker
    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${type}:`) && instance.status === 'idle') {
        return instance.worker;
      }
    }

    // 如果没有空闲的指定类型Worker，尝试复用其他类型
    if (type !== 'default') {
      for (const [id, instance] of this.workers.entries()) {
        if (instance.status === 'idle') {
          return instance.worker;
        }
      }
    }

    // 如果所有Worker都忙，则放入等待队列
    return null;
  }

  /**
   * 处理Worker消息
   * @param event Worker消息事件
   * @param workerType Worker类型
   */
  private handleWorkerMessage(event: MessageEvent, workerType: string): void {
    const response = event.data;

    // 处理特殊消息类型
    if (response.type) {
      switch (response.type) {
        case 'READY':
          this.handleWorkerReady(workerType);
          return;
        case 'PONG':
          this.handleWorkerPong(workerType);
          return;
        case 'STATUS':
        case 'METRICS':
        case 'HEALTH':
          this.handleWorkerStatus(response, workerType);
          return;
        case 'WARNING':
          this.handleWorkerWarning(response, workerType);
          return;
        case 'ERROR':
          // 特殊错误处理，但仍继续处理常规响应
          this.handleWorkerSpecificError(response, workerType);
          break;
      }
    }

    // 处理常规任务响应
    const callback = this.taskCallbacks.get(response.taskId);

    if (callback) {
      // 清除超时定时器
      if (callback.timer) {
        clearTimeout(callback.timer);
      }

      // 更新Worker实例统计信息
      this.updateWorkerStats(workerType, response.success);

      // 减少活动任务计数
      this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);

      // 处理响应结果
      if (response.success) {
        callback.resolve(response.result);
      } else {
        callback.reject(new Error(response.error || '任务失败'));
      }

      // 清理回调
      this.taskCallbacks.delete(response.taskId);

      // 处理等待中的任务
      this.processPendingTasks(workerType);
    }
  }

  /**
   * 处理Worker就绪消息
   */
  private handleWorkerReady(workerType: string): void {
    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${workerType}:`)) {
        instance.status = 'idle';
        instance.lastResponseTime = Date.now();
        this.logger.debug(`Worker ${id} 已就绪`);
      }
    }

    // 发送就绪事件
    this.eventBus?.emit('worker:ready', { type: workerType });

    // 处理等待中的任务
    this.processPendingTasks(workerType);
  }

  /**
   * 处理Worker心跳响应
   */
  private handleWorkerPong(workerType: string): void {
    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${workerType}:`)) {
        instance.lastResponseTime = Date.now();
        instance.unresponsiveCount = 0;
      }
    }
  }

  /**
   * 处理Worker状态更新
   */
  private handleWorkerStatus(response: any, workerType: string): void {
    // 更新Worker状态
    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${workerType}:`)) {
        if (response.status) {
          instance.status = response.status;
        }

        if (response.memory) {
          instance.memoryUsage = response.memory;
        }

        if (response.stats) {
          Object.assign(instance, response.stats);
        }
      }
    }

    // 发送状态事件
    if (this.options.logPerformance) {
      this.logger.debug(`Worker ${workerType} 状态:`, response);
    }
  }

  /**
   * 处理Worker警告
   */
  private handleWorkerWarning(response: any, workerType: string): void {
    this.logger.warn(
      `Worker ${workerType} 警告:`,
      response.warning || response
    );

    // 发送警告事件
    this.eventBus?.emit('worker:warning', {
      type: workerType,
      warning: response.warning,
      details: response,
    });
  }

  /**
   * 处理Worker特定错误
   */
  private handleWorkerSpecificError(response: any, workerType: string): void {
    this.logger.error(`Worker ${workerType} 错误:`, response.error || response);

    // 更新Worker实例统计
    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${workerType}:`)) {
        instance.errorCount = (instance.errorCount || 0) + 1;
      }
    }

    // 发送错误事件
    this.eventBus?.emit('worker:specificError', {
      type: workerType,
      error: response.error,
      details: response,
    });
  }

  /**
   * 更新Worker统计信息
   */
  private updateWorkerStats(workerType: string, success: boolean): void {
    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${workerType}:`)) {
        // 更新任务计数
        instance.taskCount = (instance.taskCount || 0) + 1;

        // 如果是错误，增加错误计数
        if (!success) {
          instance.errorCount = (instance.errorCount || 0) + 1;
        }

        // 更新状态
        instance.status = 'idle';
      }
    }
  }

  /**
   * 处理Worker错误
   * @param event Worker错误事件
   * @param workerType Worker类型
   */
  private handleWorkerError(event: ErrorEvent, workerType: string): void {
    this.logger.error(`Worker ${workerType} 执行错误:`, event.message);

    // 更新Worker状态
    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${workerType}:`)) {
        instance.status = 'error';
        instance.errorCount = (instance.errorCount || 0) + 1;
      }
    }

    // 发送错误事件
    this.eventBus?.emit('worker:error', {
      type: workerType,
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });

    // 如果有正在执行的任务，将它们全部标记为失败
    this.taskCallbacks.forEach((callback, taskId) => {
      if (callback.timer) {
        clearTimeout(callback.timer);
      }

      callback.reject(new Error(`Worker执行错误: ${event.message}`));
      this.taskCallbacks.delete(taskId);

      // 减少活动任务计数
      this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
    });

    // 尝试恢复或重启Worker
    this.tryRecoverWorker(workerType);
  }

  /**
   * 尝试恢复Worker
   */
  private async tryRecoverWorker(workerType: string): Promise<void> {
    // 尝试重启Worker
    const success = await this.restartWorker(workerType);

    if (success) {
      this.logger.info(`Worker ${workerType} 已成功重启`);
    } else {
      this.logger.warn(`Worker ${workerType} 重启失败，任务将降级到主线程处理`);

      // 将待处理任务移至主线程处理
      const pendingTasks = this.pendingTasks.get(workerType) || [];
      for (const task of pendingTasks) {
        this.fallbackToMainThread(task.type, task.data)
          .then(task.resolve)
          .catch(task.reject);
      }

      // 清空待处理队列
      this.pendingTasks.set(workerType, []);
    }
  }

  /**
   * 发送任务到Worker执行
   * @param type 任务类型
   * @param data 任务数据
   * @param workerType Worker类型
   * @param priority 任务优先级，值越小优先级越高
   * @param timeout 任务超时时间，默认使用全局配置
   * @returns Promise，解析为任务执行结果
   */
  async sendTask(
    type: WorkerTaskType,
    data: any,
    workerType = 'default',
    priority = 1,
    timeout?: number
  ): Promise<any> {
    // 如果正在终止，拒绝所有新任务
    if (this.isTerminating) {
      throw new Error('WorkerManager正在终止，无法接受新任务');
    }

    // 生成唯一任务ID
    const taskId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 使用自定义超时或默认超时
    const taskTimeout = timeout || this.options.workerTaskTimeout;

    // 记录任务开始时间（用于性能监控）
    const taskStartTime = Date.now();

    // 创建任务Promise
    const taskPromise = new Promise<any>((resolve, reject) => {
      // 如果不支持Worker或Worker创建失败，直接在主线程执行
      if (!this.isWorkerSupported) {
        this.logger.info(`环境不支持Worker，任务 ${taskId} 将在主线程执行`);

        return this.fallbackToMainThread(type, data)
          .then(resolve)
          .catch(reject);
      }

      // 尝试获取可用的Worker
      const worker = this.getWorker(workerType);

      if (worker) {
        // 有可用Worker，直接执行任务
        this.executeTask(
          worker,
          taskId,
          type,
          data,
          workerType,
          resolve,
          reject,
          taskTimeout
        );
      } else {
        // 没有可用Worker，将任务加入待处理队列
        this.logger.debug(
          `没有可用的${workerType} Worker，任务 ${taskId} 加入队列`
        );

        if (!this.pendingTasks.has(workerType)) {
          this.pendingTasks.set(workerType, []);
        }

        // 添加到待处理队列（包括优先级信息）
        const pendingTasks = this.pendingTasks.get(workerType)!;

        // 根据优先级插入队列
        const taskItem = {
          taskId,
          type,
          data,
          resolve,
          reject,
          priority,
        };

        // 找到合适的位置插入（保持优先级顺序）
        const insertIndex = pendingTasks.findIndex(
          task => (task as any).priority > priority
        );

        if (insertIndex === -1) {
          // 没找到更低优先级的任务，追加到末尾
          pendingTasks.push(taskItem);
        } else {
          // 插入到找到的位置
          pendingTasks.splice(insertIndex, 0, taskItem);
        }

        // 尝试创建新Worker处理队列任务
        if (this.options.autoAdjustPool) {
          this.tryCreateWorkerForPendingTasks(workerType);
        }
      }
    });

    // 增加活跃任务计数
    this.activeTaskCount++;

    // 监控任务执行情况
    taskPromise.finally(() => {
      // 任务完成后减少活跃计数
      this.activeTaskCount--;

      // 记录任务执行时间
      const taskTime = Date.now() - taskStartTime;

      // 记录性能数据
      if (this.options.logPerformance) {
        this.logger.debug(`任务 ${taskId}(${type}) 执行时间: ${taskTime}ms`);

        // 发送任务执行指标
        if (this.eventBus) {
          this.eventBus.emit('worker:taskMetrics', {
            taskId,
            type,
            workerType,
            executionTime: taskTime,
            success: true,
          });
        }
      }
    });

    return taskPromise;
  }

  /**
   * 在Worker中执行任务
   * @private
   */
  private executeTask(
    worker: Worker,
    taskId: string,
    type: WorkerTaskType,
    data: any,
    workerType: string,
    resolve: (value: any) => void,
    reject: (reason: any) => void,
    timeout?: number
  ): void {
    // 设置任务超时
    const timer = setTimeout(() => {
      // 检查任务是否仍在处理中
      if (this.taskCallbacks.has(taskId)) {
        this.logger.warn(`任务 ${taskId} 执行超时`);

        // 移除回调
        this.taskCallbacks.delete(taskId);

        // 拒绝Promise
        reject(new Error(`任务执行超时(${timeout}ms)`));

        // 记录Worker可能出现问题
        for (const [key, instance] of this.workers.entries()) {
          if (instance.worker === worker) {
            instance.unresponsiveCount = (instance.unresponsiveCount || 0) + 1;

            // 如果Worker多次无响应，尝试重启
            if (instance.unresponsiveCount > 3) {
              this.logger.warn(`Worker ${key} 多次无响应，尝试重启`);
              this.restartWorker(workerType);
            }
            break;
          }
        }
      }
    }, timeout || this.options.workerTaskTimeout);

    // 保存任务回调
    this.taskCallbacks.set(taskId, {
      resolve,
      reject,
      timer,
    });

    // 发送任务到Worker
    try {
      worker.postMessage({
        taskId,
        type,
        data,
      });
    } catch (error) {
      // 发送失败（可能是传输对象过大或Worker已终止）
      clearTimeout(timer);
      this.taskCallbacks.delete(taskId);

      this.logger.error(
        `向Worker发送任务失败: ${error instanceof Error ? error.message : String(error)}`
      );

      // 如果是因为数据过大，尝试在主线程执行
      if (
        error instanceof DOMException &&
        (error.name === 'DataCloneError' || error.code === 25)
      ) {
        this.logger.warn('数据无法被克隆，尝试在主线程执行');

        this.fallbackToMainThread(type, data).then(resolve).catch(reject);
      } else {
        // 其他错误直接拒绝
        reject(
          new Error(
            `任务发送失败: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    }
  }

  /**
   * 尝试为待处理任务创建新Worker
   */
  private async tryCreateWorkerForPendingTasks(
    workerType: string
  ): Promise<void> {
    const pendingTasks = this.pendingTasks.get(workerType);

    // 如果没有待处理任务，或者正在终止，则不创建新Worker
    if (!pendingTasks || pendingTasks.length === 0 || this.isTerminating) {
      return;
    }

    // 计算当前此类型的Worker数量
    let currentWorkerCount = 0;
    for (const [key, instance] of this.workers.entries()) {
      if (key.startsWith(workerType)) {
        currentWorkerCount++;
      }
    }

    // 如果当前Worker数量小于配置的池大小，可以创建新Worker
    const config = this.workerConfigs[workerType] || this.workerConfigs.default;

    if (currentWorkerCount < config.poolSize) {
      this.logger.debug(`为待处理任务创建新的${workerType} Worker`);

      // 创建新Worker
      const worker = await this.createWorker(workerType);

      // 如果创建成功且仍有待处理任务，处理它们
      if (worker) {
        this.processPendingTasks(workerType);
      }
    }
  }

  /**
   * 回退到主线程处理任务
   * @param type 任务类型
   * @param data 任务数据
   */
  private async fallbackToMainThread(
    type: WorkerTaskType,
    data: any
  ): Promise<any> {
    this.logger.debug(`任务 ${type} 在主线程中执行`);

    // 发送回退事件
    this.eventBus?.emit('worker:fallback', {
      type,
      reason: 'Worker不可用或任务发送失败',
    });

    try {
      // 根据任务类型在主线程中执行
      switch (type) {
        case 'calculateChunks':
          return this.calculateChunksInMainThread(data);
        case 'calculateHash':
          return this.calculateHashInMainThread(data);
        case 'processFile':
          return this.processFileInMainThread(data);
        default:
          throw new Error(`未知的任务类型: ${type}`);
      }
    } catch (error) {
      this.logger.error(`主线程任务执行失败: ${error}`);
      throw error;
    }
  }

  /**
   * 在主线程中计算分片
   * @param data 计算分片所需数据
   */
  private calculateChunksInMainThread(data: any): any {
    const { fileSize, chunkSize } = data;
    const chunks = [];

    // 基本分片计算
    for (let start = 0; start < fileSize; start += chunkSize) {
      const end = Math.min(start + chunkSize, fileSize);
      chunks.push({
        index: chunks.length,
        start,
        end,
        size: end - start,
      });
    }

    return chunks;
  }

  /**
   * 在主线程中计算哈希
   * @param data 计算哈希所需数据
   */
  private calculateHashInMainThread(data: any): string {
    // 简化实现，实际项目中需要使用真实的哈希算法
    // 这里只是一个占位符，表示实际会调用哈希库
    return `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 在主线程中处理文件
   * @param data 处理文件所需数据
   */
  private processFileInMainThread(data: any): any {
    // 简化实现，实际项目中需要根据实际需求处理
    return {
      processed: true,
      size: data.size,
      timestamp: Date.now(),
    };
  }

  /**
   * 处理等待中的任务
   * @param workerType Worker类型
   */
  private processPendingTasks(workerType: string): void {
    // 检查是否有等待中的任务
    const pendingTasks = this.pendingTasks.get(workerType) || [];
    if (pendingTasks.length === 0) return;

    // 检查是否有空闲Worker
    const worker = this.getWorker(workerType);
    if (!worker) return;

    // 取出第一个等待中的任务
    const task = pendingTasks.shift();
    this.pendingTasks.set(workerType, pendingTasks);

    if (!task) return;

    // 重新提交任务
    this.logger.debug(`处理等待中的任务: ${task.taskId}`);
    this.sendTask(task.type, task.data, workerType, task.priority)
      .then(task.resolve)
      .catch(task.reject);
  }

  /**
   * 重启特定类型的Worker
   * @param type Worker类型
   */
  private async restartWorker(type: string): Promise<boolean> {
    this.logger.info(`正在重启 ${type} Worker`);

    // 查找所有匹配类型的Worker
    const workersToRestart: Array<[string, WorkerInstance]> = [];

    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${type}:`)) {
        workersToRestart.push([id, instance]);
      }
    }

    if (workersToRestart.length === 0) {
      return false;
    }

    let success = true;

    // 逐个重启Worker
    for (const [id, instance] of workersToRestart) {
      try {
        // 终止现有Worker
        try {
          instance.worker.terminate();
        } catch (e) {
          // 忽略终止错误
          this.logger.warn(`终止 Worker ${id} 时出错: ${e}`);
        }

        // 创建新Worker
        const worker = await this.createWorker(type);

        if (worker) {
          // 更新Worker实例
          this.workers.set(id, {
            worker,
            status: 'idle',
            taskCount: 0,
            totalTaskTime: 0,
            errorCount: 0,
            lastResponseTime: Date.now(),
            creationTime: Date.now(),
            unresponsiveCount: 0,
          });

          this.logger.info(`Worker ${id} 已成功重启`);
        } else {
          success = false;
          this.logger.error(`重启 Worker ${id} 失败`);
        }
      } catch (error) {
        success = false;
        this.logger.error(`重启 Worker ${id} 时出错:`, error);
      }
    }

    // 发送事件
    if (success) {
      this.eventBus?.emit('worker:restarted', { type });
    } else {
      this.eventBus?.emit('worker:restartFailed', { type });
    }

    return success;
  }

  /**
   * 终止所有Worker
   */
  public terminate(): void {
    if (this.isTerminating) return;

    this.isTerminating = true;
    this.logger.info('正在终止所有Worker');

    // 优雅终止
    this.gracefulTerminate();
  }

  /**
   * 优雅终止Worker
   */
  private gracefulTerminate(): void {
    // 如果有活跃任务，等待它们完成
    if (this.activeTaskCount > 0) {
      // 设置终止标志，阻止新任务添加
      this.isTerminating = true;

      // 设置超时
      const terminateTimeout = setTimeout(() => {
        // 强制终止剩余worker
        this.forceTerminateAllWorkers();
        this.onTerminateComplete();
      }, 5000); // 5秒超时

      // 设置检查间隔
      const checkInterval = setInterval(() => {
        if (this.activeTaskCount === 0) {
          clearInterval(checkInterval);
          clearTimeout(terminateTimeout);

          // 现在可以安全终止所有worker
          this.safeTerminateAllWorkers();
          this.onTerminateComplete();
        }
      }, 100);
    } else {
      // 没有活跃任务，立即终止
      this.safeTerminateAllWorkers();
      this.onTerminateComplete();
    }
  }

  /**
   * 安全终止所有Worker
   */
  private safeTerminateAllWorkers(): void {
    for (const [type, instance] of this.workers.entries()) {
      if (instance.worker) {
        try {
          // 先发送终止消息，让worker自己清理
          instance.worker.postMessage({ action: 'terminate' });

          // 设置短延时后终止worker
          setTimeout(() => {
            try {
              instance.worker?.terminate();
            } catch (err) {
              this.logger.error(`无法终止 ${type} worker:`, err);
            }
          }, 100);
        } catch (err) {
          this.logger.error(`发送终止消息到 ${type} worker 失败:`, err);
          // 直接尝试终止
          try {
            instance.worker.terminate();
          } catch (e) {
            // 忽略终止错误
          }
        }
      }
    }
  }

  /**
   * 强制终止所有Worker
   */
  private forceTerminateAllWorkers(): void {
    for (const [type, instance] of this.workers.entries()) {
      if (instance.worker) {
        try {
          instance.worker.terminate();
        } catch (err) {
          this.logger.error(`强制终止 ${type} worker 失败:`, err);
        }
      }
    }
  }

  /**
   * 终止完成回调
   */
  private onTerminateComplete(): void {
    // 清理资源
    this.workers.clear();
    this.pendingTasks.clear();
    this.activeTaskCount = 0;
    this.isTerminating = false;

    // 触发终止完成事件
    this.eventBus?.emit('worker:terminated', { timestamp: Date.now() });

    // 重置状态
    this.initialized = false;

    // 停止健康检查
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.logger.info('所有Worker已终止');
  }

  /**
   * 开始Worker健康检查
   */
  private startWorkerHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.checkWorkersHealth();

      // 自适应调整Worker池大小
      if (this.options.autoAdjustPool) {
        this.adaptWorkerPoolSize();
      }

      // 收集性能指标
      if (this.options.logPerformance) {
        this.collectPerformanceMetrics();
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * 检查所有Worker的健康状态
   */
  private checkWorkersHealth(): void {
    // 遍历所有Worker检查健康状态
    for (const [id, instance] of this.workers.entries()) {
      if (instance.worker && instance.status !== 'error') {
        try {
          // 发送ping检查
          instance.worker.postMessage({
            action: 'ping',
            timestamp: Date.now(),
          });

          // 检查是否长时间未响应
          const now = Date.now();
          if (now - (instance.lastResponseTime || 0) > 10000) {
            // 10秒未响应
            // 标记为可能无响应
            if (instance.status !== 'unresponsive') {
              instance.unresponsiveCount =
                (instance.unresponsiveCount || 0) + 1;

              if (instance.unresponsiveCount >= 3) {
                // 连续3次无响应，尝试重启
                this.logger.warn(`Worker ${id} 无响应，尝试重启`);
                const workerType = id.split(':')[0];
                this.restartWorker(workerType);
              } else {
                this.logger.warn(`Worker ${id} 可能无响应，继续监控`);
                instance.status = 'unresponsive';
              }
            }
          }
        } catch (err) {
          this.logger.error(`Worker ${id} 健康检查失败:`, err);
        }
      }
    }
  }

  /**
   * 自适应调整工作线程池大小
   */
  private adaptWorkerPoolSize(): void {
    // 获取系统信息
    const cpuCount = navigator.hardwareConcurrency || 4;

    // 遍历所有Worker类型
    for (const [type, config] of Object.entries(this.workerConfigs)) {
      const currentCount = config.poolSize || 1;
      let optimalPoolSize = currentCount;

      // 获取此类型Worker的等待任务数
      const pendingCount = (this.pendingTasks.get(type) || []).length;

      // 根据任务队列和系统资源决定是否需要扩展或收缩线程池
      if (pendingCount > currentCount * 2 && currentCount < cpuCount) {
        // 队列长，考虑增加线程
        optimalPoolSize = Math.min(currentCount + 1, cpuCount);
      } else if (pendingCount === 0 && currentCount > 1) {
        // 队列空，考虑减少线程
        optimalPoolSize = Math.max(currentCount - 1, 1);
      }

      // 如果需要调整池大小
      if (optimalPoolSize !== currentCount) {
        this.logger.info(
          `调整 ${type} Worker池大小: ${currentCount} -> ${optimalPoolSize}`
        );

        if (optimalPoolSize > currentCount) {
          // 扩大池
          this.expandWorkerPool(type, optimalPoolSize - currentCount);
        } else {
          // 缩小池
          this.shrinkWorkerPool(type, currentCount - optimalPoolSize);
        }

        // 更新配置
        config.poolSize = optimalPoolSize;
      }
    }
  }

  /**
   * 扩大工作线程池
   */
  private async expandWorkerPool(type: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      try {
        // 获取当前此类型的Worker数量
        let currentCount = 0;
        for (const id of this.workers.keys()) {
          if (id.startsWith(`${type}:`)) {
            currentCount++;
          }
        }

        // 创建新Worker
        const worker = await this.createWorker(type);
        if (worker) {
          const id = `${type}:${currentCount}`;
          this.workers.set(id, {
            worker,
            status: 'idle',
            taskCount: 0,
            totalTaskTime: 0,
            errorCount: 0,
            lastResponseTime: Date.now(),
            creationTime: Date.now(),
          });

          this.logger.info(`Worker ${id} 已创建`);
        }
      } catch (err) {
        this.logger.error(`扩展 ${type} Worker池失败:`, err);
      }
    }

    // 处理等待中的任务
    this.processPendingTasks(type);
  }

  /**
   * 缩小工作线程池
   */
  private shrinkWorkerPool(type: string, count: number): void {
    // 找出空闲Worker
    const idleWorkers: string[] = [];

    for (const [id, instance] of this.workers.entries()) {
      if (id.startsWith(`${type}:`) && instance.status === 'idle') {
        idleWorkers.push(id);
      }
    }

    // 移除指定数量的空闲Worker
    const toRemove = idleWorkers.slice(0, count);

    for (const id of toRemove) {
      const instance = this.workers.get(id);
      if (instance?.worker) {
        try {
          // 安全终止
          instance.worker.postMessage({ action: 'terminate' });

          setTimeout(() => {
            try {
              instance.worker?.terminate();
            } catch (e) {
              // 忽略错误
            }
            this.workers.delete(id);
          }, 200);
        } catch (err) {
          this.logger.error(`终止 Worker ${id} 失败:`, err);

          // 直接终止并移除
          try {
            instance.worker.terminate();
          } catch (e) {
            // 忽略错误
          }
          this.workers.delete(id);
        }
      }
    }
  }

  /**
   * 收集性能指标
   */
  private collectPerformanceMetrics(): WorkerPerformanceMetrics {
    const metrics: WorkerPerformanceMetrics = {
      timestamp: Date.now(),
      workers: {},
    };

    for (const [id, instance] of this.workers.entries()) {
      const type = id.split(':')[0];

      metrics.workers[id] = {
        status: instance.status,
        taskCount: instance.taskCount || 0,
        avgTaskTime:
          instance.totalTaskTime && instance.taskCount
            ? instance.totalTaskTime / instance.taskCount
            : 0,
        errorCount: instance.errorCount || 0,
        memoryUsage: instance.memoryUsage,
        cpuUsage: instance.cpuUsage,
      };
    }

    // 发送性能事件
    this.eventBus?.emit('worker:metrics', metrics);

    return metrics;
  }

  /**
   * 获取Worker状态
   */
  public getStatus(): Record<string, any> {
    const status: Record<string, any> = {
      initialized: this.initialized,
      isTerminating: this.isTerminating,
      activeTaskCount: this.activeTaskCount,
      workers: {},
      pendingTasks: {},
    };

    // 添加Worker状态
    for (const [id, instance] of this.workers.entries()) {
      status.workers[id] = {
        status: instance.status,
        taskCount: instance.taskCount || 0,
        errorCount: instance.errorCount || 0,
        lastResponseTime: instance.lastResponseTime,
        unresponsiveCount: instance.unresponsiveCount || 0,
      };
    }

    // 添加待处理任务状态
    for (const [type, tasks] of this.pendingTasks.entries()) {
      status.pendingTasks[type] = tasks.length;
    }

    return status;
  }
}
