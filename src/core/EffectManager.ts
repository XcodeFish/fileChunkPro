/**
 * EffectManager - 副作用管理系统
 *
 * 负责统一管理所有副作用操作，追踪资源生命周期，并确保资源正确释放。
 * 提供清晰的边界来分离纯函数逻辑与副作用操作。
 */

import { v4 as uuidv4 } from 'uuid';
import { EventBus } from './EventBus';
import { Logger } from '../utils/Logger';
import {
  EffectType,
  EffectStatus,
  EffectPriority,
  ResourceType,
  EffectMetadata,
  EffectResource,
  EffectOptions,
  EffectResult,
  EffectExecutor,
  IEffect,
} from '../types/effect';

/**
 * 副作用实体类
 */
export class Effect<T = any> implements IEffect<T> {
  public readonly id: string;
  public readonly type: EffectType;
  public readonly priority: EffectPriority;

  private _status: EffectStatus = EffectStatus.CREATED;
  private _metadata: EffectMetadata;
  private _resources: Map<string, EffectResource> = new Map();
  private _dependencies: Set<string> = new Set();
  private _executor: EffectExecutor<T>;
  private _controller: AbortController;
  private _options: EffectOptions;
  private _result?: T;
  private _error?: Error;
  private _logger: Logger;
  private _timeoutId?: NodeJS.Timeout;

  /**
   * 创建副作用实例
   * @param executor - 副作用执行函数
   * @param options - 副作用配置选项
   */
  constructor(executor: EffectExecutor<T>, options: EffectOptions) {
    this.id = options.id || uuidv4();
    this.type = options.type;
    this.priority = options.priority || EffectPriority.NORMAL;
    this._executor = executor;
    this._options = options;
    this._controller = new AbortController();
    this._logger = new Logger(`Effect:${this.type}`);

    // 初始化元数据
    this._metadata = {
      createdAt: Date.now(),
      module: options.metadata?.module || 'unknown',
      fileId: options.metadata?.fileId,
      taskId: options.metadata?.taskId,
      context: options.metadata?.context || {},
      retries: 0,
      maxRetries: options.maxRetries || 0,
    };

    // 添加依赖
    if (options.dependsOn) {
      options.dependsOn.forEach(depId => this._dependencies.add(depId));
    }
  }

  /**
   * 获取当前状态
   */
  get status(): EffectStatus {
    return this._status;
  }

  /**
   * 获取元数据
   */
  get metadata(): EffectMetadata {
    return { ...this._metadata };
  }

  /**
   * 执行副作用
   */
  async execute(): Promise<EffectResult<T>> {
    // 如果已经完成或失败，直接返回结果
    if (
      this._status === EffectStatus.COMPLETED ||
      this._status === EffectStatus.FAILED ||
      this._status === EffectStatus.CANCELLED
    ) {
      return this.getResult();
    }

    try {
      // 更新状态为运行中
      this._status = EffectStatus.RUNNING;
      this._metadata.startedAt = Date.now();
      this._logger.debug(`开始执行副作用: ${this.id}`);

      // 设置超时处理
      if (this._options.timeout) {
        this.setupTimeout(this._options.timeout);
      }

      // 执行副作用
      this._result = await this._executor(
        this._controller.signal,
        this._metadata,
        this.registerResource.bind(this)
      );

      // 取消超时
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
      }

      // 更新状态为已完成
      this._status = EffectStatus.COMPLETED;
      this._metadata.completedAt = Date.now();
      this._metadata.duration =
        this._metadata.completedAt -
        (this._metadata.startedAt || this._metadata.createdAt);

      this._logger.debug(
        `副作用执行完成: ${this.id}, 耗时: ${this._metadata.duration}ms`
      );

      // 调用完成回调
      if (this._options.onComplete) {
        this._options.onComplete(this._result);
      }

      return this.getResult();
    } catch (error) {
      // 取消超时
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
      }

      // 检查是否为取消操作
      if (this._controller.signal.aborted) {
        this._status = EffectStatus.CANCELLED;
        this._logger.debug(`副作用已取消: ${this.id}`);

        // 调用取消回调
        if (this._options.onCancel) {
          this._options.onCancel();
        }
      } else {
        // 记录错误
        this._error = error instanceof Error ? error : new Error(String(error));
        this._logger.error(`副作用执行失败: ${this.id}`, this._error);

        // 尝试自动重试
        if (
          this._options.autoRetry &&
          this._metadata.retries! < this._metadata.maxRetries!
        ) {
          this._metadata.retries!++;
          this._logger.debug(
            `尝试重试副作用: ${this.id}, 重试次数: ${this._metadata.retries}`
          );

          // 重置控制器
          this._controller = new AbortController();

          // 重新执行
          return this.execute();
        }

        this._status = EffectStatus.FAILED;

        // 调用错误回调
        if (this._options.onError) {
          this._options.onError(this._error);
        }
      }

      return this.getResult();
    } finally {
      // 更新元数据
      if (!this._metadata.completedAt) {
        this._metadata.completedAt = Date.now();
        this._metadata.duration =
          this._metadata.completedAt -
          (this._metadata.startedAt || this._metadata.createdAt);
      }

      // 如果配置了自动清理，则释放资源
      if (this._options.autoCleanup) {
        this.dispose();
      }
    }
  }

  /**
   * 取消副作用执行
   */
  cancel(): void {
    if (
      this._status === EffectStatus.CREATED ||
      this._status === EffectStatus.RUNNING
    ) {
      this._logger.debug(`取消副作用: ${this.id}`);
      this._controller.abort();

      // 如果副作用尚未开始执行，则直接标记为已取消
      if (this._status === EffectStatus.CREATED) {
        this._status = EffectStatus.CANCELLED;
      }
    }
  }

  /**
   * 添加依赖副作用
   * @param effectId - 依赖的副作用ID
   */
  addDependency(effectId: string): void {
    this._dependencies.add(effectId);
  }

  /**
   * 获取依赖列表
   */
  getDependencies(): string[] {
    return Array.from(this._dependencies);
  }

  /**
   * 注册资源
   * @param resource - 资源对象
   */
  private registerResource(resource: EffectResource): void {
    this._logger.debug(`注册资源: ${resource.id}, 类型: ${resource.type}`);
    this._resources.set(resource.id, resource);
  }

  /**
   * 获取资源列表
   */
  getResources(): EffectResource[] {
    return Array.from(this._resources.values());
  }

  /**
   * 释放所有资源
   */
  dispose(): void {
    this._logger.debug(`释放副作用资源: ${this.id}`);

    // 释放所有注册的资源
    this._resources.forEach(resource => {
      try {
        resource.dispose();
        this._logger.debug(`释放资源: ${resource.id}, 类型: ${resource.type}`);
      } catch (error) {
        this._logger.error(`释放资源失败: ${resource.id}`, error);
      }
    });

    // 清空资源映射
    this._resources.clear();
  }

  /**
   * 获取执行结果
   */
  private getResult(): EffectResult<T> {
    return {
      id: this.id,
      status: this._status,
      data: this._result,
      error: this._error,
      metadata: this.metadata,
      resources: this.getResources(),
    };
  }

  /**
   * 设置超时处理
   * @param timeout - 超时时间（毫秒）
   */
  private setupTimeout(timeout: number): void {
    this._timeoutId = setTimeout(() => {
      this._logger.warn(`副作用执行超时: ${this.id}, 超时时间: ${timeout}ms`);
      this.cancel();
    }, timeout);
  }
}

/**
 * 副作用管理器
 */
export class EffectManager {
  private _effects: Map<string, IEffect> = new Map();
  private _eventBus: EventBus;
  private _logger: Logger;
  private _activeEffects = 0;
  private _completedEffects = 0;
  private _failedEffects = 0;

  /**
   * 创建副作用管理器实例
   * @param eventBus - 事件总线实例
   */
  constructor(eventBus: EventBus) {
    this._eventBus = eventBus;
    this._logger = new Logger('EffectManager');

    // 注册事件监听
    this.registerEventListeners();
  }

  /**
   * 创建副作用
   * @param executor - 副作用执行函数
   * @param options - 副作用配置选项
   * @returns 创建的副作用实例
   */
  create<T>(executor: EffectExecutor<T>, options: EffectOptions): IEffect<T> {
    const effect = new Effect<T>(executor, options);
    this._effects.set(effect.id, effect);

    this._logger.debug(`创建副作用: ${effect.id}, 类型: ${effect.type}`);
    this._eventBus.emit('effect:created', { id: effect.id, type: effect.type });

    return effect;
  }

  /**
   * 执行副作用
   * @param effect - 副作用实例或ID
   * @returns 执行结果Promise
   */
  async execute<T>(effect: IEffect<T> | string): Promise<EffectResult<T>> {
    const effectInstance =
      typeof effect === 'string'
        ? (this._effects.get(effect) as IEffect<T>)
        : effect;

    if (!effectInstance) {
      throw new Error(`副作用不存在: ${effect}`);
    }

    this._logger.debug(`执行副作用: ${effectInstance.id}`);
    this._activeEffects++;
    this._eventBus.emit('effect:executing', {
      id: effectInstance.id,
      type: effectInstance.type,
    });

    try {
      const result = (await effectInstance.execute()) as EffectResult<T>;

      // 根据执行结果更新统计
      if (result.status === EffectStatus.COMPLETED) {
        this._completedEffects++;
        this._eventBus.emit('effect:completed', {
          id: effectInstance.id,
          type: effectInstance.type,
        });
      } else if (result.status === EffectStatus.FAILED) {
        this._failedEffects++;
        this._eventBus.emit('effect:failed', {
          id: effectInstance.id,
          type: effectInstance.type,
          error: result.error,
        });
      } else if (result.status === EffectStatus.CANCELLED) {
        this._eventBus.emit('effect:cancelled', {
          id: effectInstance.id,
          type: effectInstance.type,
        });
      }

      return result;
    } finally {
      this._activeEffects--;
    }
  }

  /**
   * 创建并执行副作用
   * @param executor - 副作用执行函数
   * @param options - 副作用配置选项
   * @returns 执行结果Promise
   */
  async run<T>(
    executor: EffectExecutor<T>,
    options: EffectOptions
  ): Promise<EffectResult<T>> {
    const effect = this.create(executor, options);
    return this.execute<T>(effect);
  }

  /**
   * 取消副作用
   * @param effectId - 副作用ID
   */
  cancel(effectId: string): void {
    const effect = this._effects.get(effectId);

    if (effect) {
      this._logger.debug(`取消副作用: ${effectId}`);
      effect.cancel();
    }
  }

  /**
   * 批量取消副作用
   * @param type - 可选的副作用类型过滤
   */
  cancelAll(type?: EffectType): void {
    this._effects.forEach(effect => {
      if (!type || effect.type === type) {
        effect.cancel();
      }
    });
  }

  /**
   * 获取副作用实例
   * @param effectId - 副作用ID
   * @returns 副作用实例或undefined
   */
  get(effectId: string): IEffect | undefined {
    return this._effects.get(effectId);
  }

  /**
   * 获取所有副作用
   * @param type - 可选的副作用类型过滤
   * @returns 副作用数组
   */
  getAll(type?: EffectType): IEffect[] {
    if (!type) {
      return Array.from(this._effects.values());
    }

    return Array.from(this._effects.values()).filter(
      effect => effect.type === type
    );
  }

  /**
   * 获取副作用执行统计
   */
  getStats(): {
    active: number;
    completed: number;
    failed: number;
    total: number;
  } {
    return {
      active: this._activeEffects,
      completed: this._completedEffects,
      failed: this._failedEffects,
      total: this._effects.size,
    };
  }

  /**
   * 清理已完成的副作用
   */
  cleanup(): void {
    const toRemove: string[] = [];

    this._effects.forEach((effect, id) => {
      if (
        effect.status === EffectStatus.COMPLETED ||
        effect.status === EffectStatus.FAILED ||
        effect.status === EffectStatus.CANCELLED
      ) {
        effect.dispose();
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => {
      this._effects.delete(id);
    });

    this._logger.debug(`清理了 ${toRemove.length} 个已完成/失败的副作用`);
  }

  /**
   * 创建资源并自动注册到当前执行的副作用
   * @param type - 资源类型
   * @param instance - 资源实例
   * @param dispose - 资源释放函数
   * @param metadata - 资源元数据
   * @returns 资源ID
   */
  createResource(
    type: ResourceType,
    _instance: any,
    _dispose: () => void,
    _metadata?: Record<string, any>
  ): string {
    const resourceId = uuidv4();

    this._eventBus.emit('resource:created', {
      id: resourceId,
      type,
    });

    return resourceId;
  }

  /**
   * 注册事件监听
   */
  private registerEventListeners(): void {
    // 定期清理已完成的副作用
    setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 销毁副作用管理器
   */
  dispose(): void {
    // 取消所有副作用
    this.cancelAll();

    // 清理所有资源
    this._effects.forEach(effect => {
      effect.dispose();
    });

    // 清空副作用集合
    this._effects.clear();

    this._logger.debug('副作用管理器已销毁');
  }
}

/**
 * 创建常用副作用工厂函数
 */
export const EffectFactory = {
  /**
   * 创建网络请求副作用
   * @param effectManager - 副作用管理器实例
   * @param url - 请求URL
   * @param options - 请求选项
   * @param effectOptions - 副作用配置选项
   * @returns 副作用执行结果Promise
   */
  async createNetworkRequest(
    effectManager: EffectManager,
    url: string,
    options: RequestInit = {},
    effectOptions: Partial<EffectOptions> = {}
  ): Promise<EffectResult<Response>> {
    return effectManager.run<Response>(
      async (signal, metadata, register) => {
        // 创建请求
        const controller = new AbortController();

        // 注册可取消的资源
        register({
          id: `fetch-${metadata.createdAt}`,
          type: ResourceType.FETCH,
          instance: controller,
          dispose: () => controller.abort(),
          metadata: { url, method: options.method || 'GET' },
        });

        // 将取消信号转发到请求
        signal.addEventListener('abort', () => controller.abort());

        // 执行请求
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        return response;
      },
      {
        type: EffectType.NETWORK_REQUEST,
        priority: EffectPriority.NORMAL,
        autoCleanup: true,
        timeout: effectOptions.timeout || 30000,
        maxRetries: effectOptions.maxRetries || 3,
        autoRetry: effectOptions.autoRetry !== false,
        ...effectOptions,
      }
    );
  },

  /**
   * 创建Worker副作用
   * @param effectManager - 副作用管理器实例
   * @param workerScript - Worker脚本URL或函数体
   * @param workerData - 传递给Worker的数据
   * @param effectOptions - 副作用配置选项
   * @returns 副作用执行结果Promise
   */
  async createWorkerEffect<T, R>(
    effectManager: EffectManager,
    workerScript: string | (() => void),
    workerData: T,
    effectOptions: Partial<EffectOptions> = {}
  ): Promise<EffectResult<R>> {
    return effectManager.run<R>(
      async (signal, metadata, register) => {
        return new Promise<R>((resolve, reject) => {
          let worker: Worker;

          // 创建Worker
          if (typeof workerScript === 'string') {
            // 从URL创建
            worker = new Worker(workerScript);
          } else {
            // 从函数创建
            const blob = new Blob([`(${workerScript.toString()})()`], {
              type: 'application/javascript',
            });
            worker = new Worker(URL.createObjectURL(blob));
          }

          // 注册Worker资源
          register({
            id: `worker-${metadata.createdAt}`,
            type: ResourceType.WORKER,
            instance: worker,
            dispose: () => {
              worker.terminate();

              // 如果是从函数创建的，释放ObjectURL
              if (typeof workerScript !== 'string') {
                URL.revokeObjectURL(worker.objectURL);
              }
            },
          });

          // 处理Worker消息
          worker.onmessage = event => {
            resolve(event.data);
          };

          // 处理Worker错误
          worker.onerror = error => {
            reject(new Error(`Worker error: ${error.message}`));
          };

          // 监听取消信号
          signal.addEventListener('abort', () => {
            worker.terminate();
            reject(new Error('Worker operation cancelled'));
          });

          // 发送数据到Worker
          worker.postMessage(workerData);
        });
      },
      {
        type: EffectType.WORKER,
        priority: EffectPriority.NORMAL,
        autoCleanup: true,
        ...effectOptions,
      }
    );
  },

  /**
   * 创建定时器副作用
   * @param effectManager - 副作用管理器实例
   * @param callback - 定时器回调函数
   * @param delay - 延迟时间（毫秒）
   * @param effectOptions - 副作用配置选项
   * @returns 副作用执行结果Promise
   */
  async createTimerEffect<T>(
    effectManager: EffectManager,
    callback: () => T | Promise<T>,
    delay: number,
    effectOptions: Partial<EffectOptions> = {}
  ): Promise<EffectResult<T>> {
    return effectManager.run<T>(
      async (signal, metadata, register) => {
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(async () => {
            try {
              const result = await callback();
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }, delay);

          // 注册定时器资源
          register({
            id: `timer-${metadata.createdAt}`,
            type: ResourceType.TIMER,
            instance: timer,
            dispose: () => clearTimeout(timer),
            metadata: { delay },
          });

          // 监听取消信号
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Timer operation cancelled'));
          });
        });
      },
      {
        type: EffectType.TIMER,
        priority: EffectPriority.LOW,
        autoCleanup: true,
        ...effectOptions,
      }
    );
  },

  /**
   * 创建事件监听副作用
   * @param effectManager - 副作用管理器实例
   * @param target - 事件目标
   * @param eventType - 事件类型
   * @param options - 事件选项
   * @param effectOptions - 副作用配置选项
   * @returns 副作用执行结果Promise
   */
  async createEventListenerEffect<T extends Event>(
    effectManager: EffectManager,
    target: EventTarget,
    eventType: string,
    options?: AddEventListenerOptions,
    effectOptions: Partial<EffectOptions> = {}
  ): Promise<EffectResult<T>> {
    return effectManager.run<T>(
      async (signal, metadata, register) => {
        return new Promise<T>((resolve, reject) => {
          const handleEvent = (event: Event) => {
            resolve(event as T);
          };

          // 添加事件监听器
          target.addEventListener(eventType, handleEvent, options);

          // 注册事件监听器资源
          register({
            id: `event-${metadata.createdAt}`,
            type: ResourceType.EVENT_LISTENER,
            instance: { target, eventType, handler: handleEvent },
            dispose: () =>
              target.removeEventListener(eventType, handleEvent, options),
            metadata: { eventType, options },
          });

          // 监听取消信号
          signal.addEventListener('abort', () => {
            target.removeEventListener(eventType, handleEvent, options);
            reject(new Error('Event listener cancelled'));
          });
        });
      },
      {
        type: EffectType.EVENT_LISTENER,
        priority: EffectPriority.NORMAL,
        autoCleanup: true,
        ...effectOptions,
      }
    );
  },
};
