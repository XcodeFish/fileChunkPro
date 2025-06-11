/**
 * EventBus - 事件总线
 * 提供类型安全的事件发布订阅机制
 */

import { CallbackWrapper } from '../utils/CallbackWrapper';
import { ErrorUtils } from '../utils/ErrorUtils';
import { Logger } from '../utils/Logger';

/**
 * 事件处理器类型
 */
export type EventHandler<T = any> = (data: T) => void;

/**
 * 事件订阅选项
 */
export interface SubscriptionOptions {
  /**
   * 是否只监听一次
   */
  once?: boolean;

  /**
   * 订阅优先级，数字越大优先级越高
   */
  priority?: number;

  /**
   * 订阅标识，用于分组和批量取消
   */
  tag?: string;
}

/**
 * 订阅信息
 */
interface Subscription<T = any> {
  /**
   * 事件处理器
   */
  handler: EventHandler<T>;

  /**
   * 是否只监听一次
   */
  once: boolean;

  /**
   * 订阅优先级
   */
  priority: number;

  /**
   * 订阅标识
   */
  tag?: string;
}

/**
 * 事件流水线
 */
export interface EventPipeline<T> {
  /**
   * 添加处理器到流水线
   * @param handler 处理器函数
   * @returns 更新后的流水线
   */
  pipe<R>(handler: (data: T) => R): EventPipeline<R>;

  /**
   * 异步添加处理器到流水线
   * @param handler 异步处理器函数
   * @returns 更新后的流水线
   */
  pipeAsync<R>(handler: (data: T) => Promise<R>): EventPipeline<Promise<R>>;

  /**
   * 获取流水线结果
   * @returns 处理结果
   */
  getValue(): T;
}

/**
 * 事件总线接口
 */
export interface IEventBus {
  /**
   * 订阅事件
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 取消订阅的函数
   */
  on<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): () => void;

  /**
   * 订阅事件（只触发一次）
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 取消订阅的函数
   */
  once<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): () => void;

  /**
   * 发布事件
   * @param eventName 事件名称
   * @param data 事件数据
   * @returns 是否有监听器处理了事件
   */
  emit<T = any>(eventName: string, data?: T): boolean;

  /**
   * 通过流水线处理事件数据
   * @param eventName 事件名称
   * @param data 初始数据
   * @returns 事件流水线
   */
  pipe<T = any>(eventName: string, data: T): EventPipeline<T>;

  /**
   * 取消订阅
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @returns 是否成功取消订阅
   */
  off<T = any>(eventName: string, handler?: EventHandler<T>): boolean;

  /**
   * 取消指定标签的所有订阅
   * @param tag 标签名称
   * @returns 取消的订阅数量
   */
  offByTag(tag: string): number;

  /**
   * 取消指定事件的所有订阅
   * @param eventName 事件名称
   * @returns 是否成功取消
   */
  offAll(eventName: string): boolean;

  /**
   * 获取指定事件的订阅者数量
   * @param eventName 事件名称
   * @returns 订阅者数量
   */
  listenerCount(eventName: string): number;

  /**
   * 检查是否有指定事件的订阅者
   * @param eventName 事件名称
   * @returns 是否有订阅者
   */
  hasListeners(eventName: string): boolean;

  /**
   * 获取所有已注册的事件名称
   * @returns 事件名称数组
   */
  eventNames(): string[];

  /**
   * 清空所有订阅
   */
  clear(): void;

  /**
   * 创建事件空间，隔离事件处理
   * @param namespace 命名空间
   * @returns 命名空间事件总线
   */
  createNamespace(namespace: string): IEventBus;
}

/**
 * 事件流水线实现
 */
class EventPipelineImpl<T> implements EventPipeline<T> {
  /**
   * 构造函数
   * @param value 当前值
   */
  constructor(private value: T) {}

  /**
   * 添加处理器到流水线
   * @param handler 处理器函数
   * @returns 更新后的流水线
   */
  pipe<R>(handler: (data: T) => R): EventPipeline<R> {
    return new EventPipelineImpl<R>(handler(this.value));
  }

  /**
   * 异步添加处理器到流水线
   * @param handler 异步处理器函数
   * @returns 更新后的流水线
   */
  async pipeAsync<R>(
    handler: (data: T) => Promise<R>
  ): Promise<EventPipeline<R>> {
    const result = await handler(this.value);
    return new EventPipelineImpl<R>(result);
  }

  /**
   * 获取流水线结果
   * @returns 处理结果
   */
  getValue(): T {
    return this.value;
  }
}

/**
 * 事件总线
 */
export class EventBus implements IEventBus {
  /**
   * 所有事件的订阅者映射
   */
  private subscriptions = new Map<string, Array<Subscription>>();

  /**
   * 事件命名空间映射
   */
  private namespaces = new Map<string, EventBus>();

  /**
   * 当前命名空间名称
   */
  private namespaceName = '';

  /**
   * 父事件总线
   */
  private parent: EventBus | null = null;

  /**
   * 是否启用调试模式
   */
  private debug = false;

  /**
   * 事件历史记录最大数量
   */
  private readonly MAX_HISTORY_SIZE = 100;

  /**
   * 事件历史记录
   */
  private eventHistory: Array<{
    name: string;
    data: any;
    timestamp: number;
  }> = [];

  /**
   * 日志记录器
   */
  private logger: Logger;

  /**
   * 构造函数
   * @param options 选项
   */
  constructor(options?: {
    debug?: boolean;
    namespaceName?: string;
    parent?: EventBus;
  }) {
    this.debug = options?.debug || false;
    this.namespaceName = options?.namespaceName || '';
    this.parent = options?.parent || null;
    this.logger = new Logger('EventBus');

    if (this.debug) {
      this.logger.info(
        `创建事件总线${this.namespaceName ? ': ' + this.namespaceName : ''}`
      );
    }
  }

  /**
   * 获取事件完整名称（带命名空间）
   * @param eventName 事件名称
   * @returns 完整事件名称
   */
  private getFullEventName(eventName: string): string {
    return this.namespaceName
      ? `${this.namespaceName}:${eventName}`
      : eventName;
  }

  /**
   * 获取事件订阅列表
   * @param eventName 事件名称
   * @param createIfNotExist 如果不存在是否创建
   * @returns 订阅列表
   */
  private getSubscriptions<T = any>(
    eventName: string,
    createIfNotExist = false
  ): Array<Subscription<T>> {
    const fullEventName = this.getFullEventName(eventName);

    if (!this.subscriptions.has(fullEventName) && createIfNotExist) {
      this.subscriptions.set(fullEventName, []);
    }

    return (
      (this.subscriptions.get(fullEventName) as Array<Subscription<T>>) || []
    );
  }

  /**
   * 订阅事件
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 取消订阅的函数
   */
  on<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): () => void {
    // 使用CallbackWrapper包装事件处理器，确保统一的错误处理
    const safeHandler = CallbackWrapper.wrap1<T, void>(handler);

    const fullEventName = this.getFullEventName(eventName);
    const subs = this.getSubscriptions<T>(fullEventName, true);

    const subscription: Subscription<T> = {
      handler: safeHandler as EventHandler<T>, // 使用安全处理器替换原始处理器
      once: options.once || false,
      priority: options.priority || 0,
      tag: options.tag,
    };

    // 按优先级插入
    let inserted = false;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i].priority < subscription.priority) {
        subs.splice(i, 0, subscription);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      subs.push(subscription);
    }

    if (this.debug) {
      this.logger.debug(`添加事件订阅: ${fullEventName}`);
    }

    // 返回取消订阅函数
    return () => {
      this.off(eventName, handler);
    };
  }

  /**
   * 订阅事件（只触发一次）
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 取消订阅的函数
   */
  once<T = any>(
    eventName: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): () => void {
    return this.on(eventName, handler, { ...options, once: true });
  }

  /**
   * 发布事件
   * @param eventName 事件名称
   * @param data 事件数据
   * @returns 是否有监听器处理了事件
   */
  emit<T = any>(eventName: string, data?: T): boolean {
    // 使用ErrorUtils.safeExecute来确保emit方法的错误被正确处理
    return (
      ErrorUtils.safeExecute(() => {
        const fullEventName = this.getFullEventName(eventName);
        const subs = this.getSubscriptions<T>(fullEventName);

        if (subs.length === 0) {
          if (this.debug) {
            this.logger.debug(`没有订阅者处理事件: ${fullEventName}`);
          }
          return false;
        }

        if (this.debug) {
          this.logger.debug(
            `触发事件: ${fullEventName}, 订阅者数量: ${subs.length}`
          );
        }

        // 记录事件历史
        if (this.debug) {
          this.recordEventHistory(fullEventName, data);
        }

        // 创建要执行的订阅副本，以防在遍历过程中有修改
        const subsToExecute = [...subs];

        // 跟踪需要删除的一次性订阅
        const onceSubs = subsToExecute.filter(sub => sub.once);

        // 执行所有处理器
        for (const sub of subsToExecute) {
          try {
            sub.handler(data as T);
          } catch (error) {
            // 错误已经被CallbackWrapper处理，这里只是记录日志
            this.logger.error(
              `事件处理器执行错误: ${fullEventName}, 错误: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        // 移除一次性订阅
        if (onceSubs.length > 0) {
          const subsArray = this.subscriptions.get(fullEventName);
          if (subsArray) {
            onceSubs.forEach(onceSub => {
              const index = subsArray.findIndex(
                sub => sub.handler === onceSub.handler
              );
              if (index !== -1) {
                subsArray.splice(index, 1);
              }
            });

            // 如果没有更多订阅，删除整个事件条目
            if (subsArray.length === 0) {
              this.subscriptions.delete(fullEventName);
            }
          }
        }

        return true;
      }) || false
    ); // 如果出错，假定没有处理器被调用
  }

  /**
   * 生成安全的事件流水线
   * @param eventName 事件名称
   * @param data 初始数据
   * @returns 事件流水线
   */
  pipe<T = any>(eventName: string, data: T): EventPipeline<T> {
    return (
      ErrorUtils.safeExecute(() => {
        const fullEventName = this.getFullEventName(eventName);
        const subs = this.getSubscriptions(fullEventName);

        if (subs.length === 0) {
          if (this.debug) {
            this.logger.debug(`没有订阅者处理流水线: ${fullEventName}`);
          }
          return new EventPipelineImpl<T>(data);
        }

        let pipeline = new EventPipelineImpl<T>(data);

        for (const sub of subs) {
          pipeline = pipeline.pipe(value => {
            let result = value;
            try {
              result = sub.handler(value) || value;
            } catch (error) {
              ErrorUtils.handleError(error);
              this.logger.error(
                `流水线处理器错误: ${fullEventName}, 错误: ${error instanceof Error ? error.message : String(error)}`
              );
            }
            return result;
          }) as EventPipelineImpl<T>;

          if (sub.once) {
            this.off(eventName, sub.handler);
          }
        }

        return pipeline;
      }) || new EventPipelineImpl<T>(data)
    );
  }

  /**
   * 取消订阅
   * @param eventName 事件名称
   * @param handler 事件处理器
   * @returns 是否成功取消订阅
   */
  off<T = any>(eventName: string, handler?: EventHandler<T>): boolean {
    const fullEventName = this.getFullEventName(eventName);

    if (!this.subscriptions.has(fullEventName)) {
      return false;
    }

    if (!handler) {
      // 移除所有该事件的订阅
      this.subscriptions.delete(fullEventName);
      return true;
    }

    const subs = this.getSubscriptions<T>(eventName);
    const originalLength = subs.length;
    const filteredSubs = subs.filter(sub => sub.handler !== handler);

    if (filteredSubs.length === originalLength) {
      return false; // 没有找到匹配的处理器
    }

    if (filteredSubs.length === 0) {
      this.subscriptions.delete(fullEventName);
    } else {
      this.subscriptions.set(
        fullEventName,
        filteredSubs as Array<Subscription>
      );
    }

    if (this.debug) {
      console.debug(
        `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 取消订阅事件: ${eventName}`
      );
    }

    return true;
  }

  /**
   * 取消指定标签的所有订阅
   * @param tag 标签名称
   * @returns 取消的订阅数量
   */
  offByTag(tag: string): number {
    let count = 0;

    for (const [eventName, subs] of this.subscriptions.entries()) {
      const originalLength = subs.length;
      const filteredSubs = subs.filter(sub => sub.tag !== tag);

      if (filteredSubs.length !== originalLength) {
        count += originalLength - filteredSubs.length;

        if (filteredSubs.length === 0) {
          this.subscriptions.delete(eventName);
        } else {
          this.subscriptions.set(eventName, filteredSubs);
        }
      }
    }

    if (this.debug && count > 0) {
      console.debug(
        `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 取消标签订阅: ${tag}, 数量: ${count}`
      );
    }

    return count;
  }

  /**
   * 取消指定事件的所有订阅
   * @param eventName 事件名称
   * @returns 是否成功取消
   */
  offAll(eventName: string): boolean {
    const fullEventName = this.getFullEventName(eventName);
    const result = this.subscriptions.delete(fullEventName);

    if (result && this.debug) {
      console.debug(
        `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 取消所有订阅: ${eventName}`
      );
    }

    return result;
  }

  /**
   * 获取指定事件的订阅者数量
   * @param eventName 事件名称
   * @returns 订阅者数量
   */
  listenerCount(eventName: string): number {
    return this.getSubscriptions(eventName).length;
  }

  /**
   * 检查是否有指定事件的订阅者
   * @param eventName 事件名称
   * @returns 是否有订阅者
   */
  hasListeners(eventName: string): boolean {
    return this.listenerCount(eventName) > 0;
  }

  /**
   * 获取所有已注册的事件名称
   * @returns 事件名称数组
   */
  eventNames(): string[] {
    const prefix = this.namespaceName ? `${this.namespaceName}:` : '';
    const names: string[] = [];

    for (const name of this.subscriptions.keys()) {
      if (prefix && name.startsWith(prefix)) {
        names.push(name.substring(prefix.length));
      } else if (!prefix) {
        names.push(name);
      }
    }

    return names;
  }

  /**
   * 清空所有订阅
   */
  clear(): void {
    this.subscriptions.clear();

    if (this.debug) {
      console.debug(
        `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 清空所有订阅`
      );
    }
  }

  /**
   * 创建事件空间，隔离事件处理
   * @param namespace 命名空间
   * @returns 命名空间事件总线
   */
  createNamespace(namespace: string): EventBus {
    if (this.namespaces.has(namespace)) {
      return this.namespaces.get(namespace)!;
    }

    const namespaceBus = new EventBus({
      debug: this.debug,
      namespaceName: namespace,
      parent: this,
    });

    this.namespaces.set(namespace, namespaceBus);
    return namespaceBus;
  }

  /**
   * 获取事件历史记录
   * @returns 事件历史记录
   */
  getEventHistory() {
    return [...this.eventHistory];
  }

  /**
   * 开启调试模式
   */
  enableDebug(): void {
    this.debug = true;
  }

  /**
   * 关闭调试模式
   */
  disableDebug(): void {
    this.debug = false;
  }

  /**
   * 记录事件历史
   * @param eventName 事件名称
   * @param data 事件数据
   */
  private recordEventHistory(eventName: string, data: any): void {
    this.eventHistory.push({
      name: eventName,
      data,
      timestamp: Date.now(),
    });

    // 限制历史记录大小
    if (this.eventHistory.length > this.MAX_HISTORY_SIZE) {
      this.eventHistory.shift();
    }
  }
}

// 导出默认实例
export default EventBus;
