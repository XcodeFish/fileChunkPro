/**
 * EventBus - 事件总线
 * 提供类型安全的事件发布订阅机制
 */

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
   * 最大事件历史记录数量
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
   * 创建事件总线
   * @param options 配置选项
   */
  constructor(options?: {
    debug?: boolean;
    namespaceName?: string;
    parent?: EventBus;
  }) {
    this.debug = options?.debug || false;
    this.namespaceName = options?.namespaceName || '';
    this.parent = options?.parent || null;

    if (this.debug) {
      console.debug(
        `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 初始化`
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
    if (typeof handler !== 'function') {
      throw new Error('事件处理器必须是一个函数');
    }

    const subscription: Subscription<T> = {
      handler,
      once: options.once || false,
      priority: options.priority || 0,
      tag: options.tag,
    };

    const subs = this.getSubscriptions<T>(eventName, true);
    subs.push(subscription);

    // 按优先级排序，优先级高的先执行
    subs.sort((a, b) => b.priority - a.priority);

    const fullEventName = this.getFullEventName(eventName);
    this.subscriptions.set(fullEventName, subs as Array<Subscription>);

    if (this.debug) {
      console.debug(
        `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 订阅事件: ${eventName}${subscription.once ? ' (一次性)' : ''}${subscription.tag ? ` [${subscription.tag}]` : ''}`
      );
    }

    // 返回取消订阅的函数
    return () => this.off(eventName, handler);
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
    const fullEventName = this.getFullEventName(eventName);

    // 记录事件历史
    if (this.debug) {
      this.eventHistory.push({
        name: eventName,
        data,
        timestamp: Date.now(),
      });

      // 保持历史记录在最大数量以内
      if (this.eventHistory.length > this.MAX_HISTORY_SIZE) {
        this.eventHistory.shift();
      }
    }

    const subs = this.getSubscriptions<T>(eventName);

    if (subs.length === 0) {
      if (this.debug) {
        console.debug(
          `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 事件无订阅者: ${eventName}`
        );
      }
      return false;
    }

    if (this.debug) {
      console.debug(
        `[EventBus${this.namespaceName ? `:${this.namespaceName}` : ''}] 发布事件: ${eventName}`,
        data
      );
    }

    // 收集需要移除的一次性订阅
    const onceSubs: Subscription<T>[] = [];

    // 调用所有订阅者的处理函数
    for (const sub of subs) {
      try {
        sub.handler(data as T);

        if (sub.once) {
          onceSubs.push(sub);
        }
      } catch (error) {
        console.error(`[EventBus] 事件处理器错误:`, error);
      }
    }

    // 移除一次性订阅
    if (onceSubs.length > 0) {
      const filteredSubs = subs.filter(sub => !onceSubs.includes(sub));
      if (filteredSubs.length === 0) {
        this.subscriptions.delete(fullEventName);
      } else {
        this.subscriptions.set(
          fullEventName,
          filteredSubs as Array<Subscription>
        );
      }
    }

    return true;
  }

  /**
   * 通过流水线处理事件数据
   * @param eventName 事件名称
   * @param data 初始数据
   * @returns 事件流水线
   */
  pipe<T = any>(eventName: string, data: T): EventPipeline<T> {
    const subs = this.getSubscriptions<T>(eventName);

    if (subs.length === 0) {
      return new EventPipelineImpl<T>(data);
    }

    // 创建初始流水线
    let pipeline = new EventPipelineImpl<T>(data);

    // 应用每个处理器
    for (const sub of subs) {
      pipeline = pipeline.pipe(value => {
        sub.handler(value);
        return value;
      }) as EventPipelineImpl<T>;
    }

    return pipeline;
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
}

// 导出默认实例
export default EventBus;
