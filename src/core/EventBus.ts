/**
 * EventBus - 事件总线系统
 * 提供事件注册、取消和触发功能
 */

/**
 * 事件对象接口
 */
export interface EventObject {
  type: string; // 事件类型
  timestamp: number; // 事件发生时间戳
  data?: any; // 事件数据
  defaultPrevented: boolean; // 是否阻止了默认行为
  propagationStopped: boolean; // 是否停止传播
  source?: any; // 事件源
  target?: any; // 事件目标

  /**
   * 阻止事件默认行为
   */
  preventDefault(): void;

  /**
   * 停止事件传播
   */
  stopPropagation(): void;

  /**
   * 同时阻止默认行为和停止传播
   */
  stop(): void;
}

/**
 * 创建事件对象
 * @param type 事件类型
 * @param data 事件数据
 * @param source 事件源
 */
export function createEventObject(
  type: string,
  data?: any,
  source?: any
): EventObject {
  const event: EventObject = {
    type,
    timestamp: Date.now(),
    data,
    defaultPrevented: false,
    propagationStopped: false,
    source,
    target: null,

    preventDefault() {
      this.defaultPrevented = true;
    },

    stopPropagation() {
      this.propagationStopped = true;
    },

    stop() {
      this.preventDefault();
      this.stopPropagation();
    },
  };

  return event;
}

type EventHandler = (event: EventObject, ...args: any[]) => void;
type EventHandlerOptions = {
  once?: boolean; // 是否只执行一次
  priority?: number; // 优先级（值越大优先级越高）
};

interface EventHandlerInfo {
  handler: EventHandler;
  options?: EventHandlerOptions;
}

export class EventBus {
  private events: Map<string, EventHandlerInfo[]> = new Map();

  /**
   * 注册事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数
   * @param options 选项配置
   */
  public on(
    event: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const handlerInfo: EventHandlerInfo = {
      handler,
      options,
    };

    const handlers = this.events.get(event)!;

    // 如果设置了优先级，按照优先级插入
    if (options && typeof options.priority === 'number') {
      const priority = options.priority;
      const index = handlers.findIndex(h => {
        const hPriority =
          h.options && typeof h.options.priority === 'number'
            ? h.options.priority
            : 0;
        return hPriority < priority;
      });

      if (index !== -1) {
        handlers.splice(index, 0, handlerInfo);
        return;
      }
    }

    // 默认添加到末尾
    handlers.push(handlerInfo);
  }

  /**
   * 注册只执行一次的事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数
   * @param options 选项配置
   */
  public once(
    event: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): void {
    this.on(event, handler, { ...options, once: true });
  }

  /**
   * 移除事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数（可选，不提供则移除该事件所有监听器）
   */
  public off(event: string, handler?: EventHandler): void {
    if (!this.events.has(event)) return;

    if (!handler) {
      this.events.delete(event);
      return;
    }

    const handlers = this.events.get(event) || [];
    const index = handlers.findIndex(h => h.handler === handler);

    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.events.delete(event);
    }
  }

  /**
   * 触发事件
   * @param event 事件名称或事件对象
   * @param args 事件参数
   * @returns 事件对象
   */
  public emit(event: string | EventObject, ...args: any[]): EventObject {
    // 如果传入的是字符串，创建事件对象
    const eventObj: EventObject =
      typeof event === 'string' ? createEventObject(event, args[0]) : event;

    const eventType = eventObj.type;

    if (!this.events.has(eventType)) {
      return eventObj;
    }

    // 获取处理函数列表的副本，防止在处理过程中修改原列表
    const handlers = [...(this.events.get(eventType) || [])];
    const onceHandlers: EventHandler[] = [];

    // 按照注册顺序执行所有处理函数
    for (const handlerInfo of handlers) {
      try {
        // 如果事件已经停止传播，终止执行
        if (eventObj.propagationStopped) {
          break;
        }

        // 执行处理函数，传递事件对象作为第一个参数
        handlerInfo.handler(eventObj);

        // 收集一次性处理函数，稍后统一移除
        if (handlerInfo.options?.once) {
          onceHandlers.push(handlerInfo.handler);
        }
      } catch (error) {
        console.error(
          `[EventBus] Error in event handler for "${eventType}":`,
          error
        );
      }
    }

    // 移除一次性处理函数
    onceHandlers.forEach(handler => this.off(eventType, handler));

    return eventObj;
  }

  /**
   * 移除所有事件监听器
   * @param eventName 可选，指定要清除的事件名称
   */
  public removeAllListeners(eventName?: string): void {
    if (eventName) {
      this.events.delete(eventName);
    } else {
      this.events.clear();
    }
  }

  /**
   * 清除所有事件监听器（与removeAllListeners功能相同）
   */
  public clear(): void {
    this.removeAllListeners();
  }

  /**
   * 获取指定事件的监听器数量
   * @param event 事件名称
   * @returns 监听器数量
   */
  public listenerCount(event: string): number {
    return this.events.has(event) ? this.events.get(event)!.length : 0;
  }

  /**
   * 检查是否注册了指定事件
   * @param event 事件名称
   * @returns 是否已注册
   */
  public hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }
}

export default EventBus;
