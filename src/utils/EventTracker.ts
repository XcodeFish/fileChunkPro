/**
 * EventTracker - 事件监听器跟踪系统
 * 用于追踪和管理组件的事件监听器，确保完全清理
 */

import { EventBus } from '../core/EventBus';
import { Logger } from './Logger';

type EventHandler = (...args: any[]) => void;
type UnsubscribeFn = () => void;

interface TrackedListener {
  eventName: string;
  handler: EventHandler;
  source: string;
  unsubscribe: UnsubscribeFn | null;
  tag?: string;
}

/**
 * 组件应使用此类来管理其事件监听器
 * 可以在组件销毁时一次性清理所有监听器
 */
export class EventTracker {
  private listeners: TrackedListener[] = [];
  private logger: Logger;
  private componentName: string;

  /**
   * 创建事件跟踪器
   * @param componentName 使用该跟踪器的组件名称（用于调试）
   */
  constructor(componentName: string) {
    this.componentName = componentName;
    this.logger = new Logger(`EventTracker:${componentName}`);
  }

  /**
   * 添加事件监听
   * @param eventBus 事件总线实例
   * @param eventName 事件名称
   * @param handler 事件处理函数
   * @param options 订阅选项
   * @returns 原始的取消订阅函数（也可以使用EventTracker.unsubscribe或clearAll）
   */
  on<T = any>(
    eventBus: EventBus,
    eventName: string,
    handler: (data: T) => void,
    options?: { tag?: string; once?: boolean; priority?: number }
  ): UnsubscribeFn {
    if (!eventBus || !eventName || !handler) {
      this.logger.warn('尝试注册无效的事件监听器');
      return () => {};
    }

    // 使用EventBus注册事件
    const unsubscribe = eventBus.on(eventName, handler, options);

    // 追踪这个监听器
    const trackedListener: TrackedListener = {
      eventName,
      handler,
      source: 'EventBus',
      unsubscribe,
      tag: options?.tag,
    };

    this.listeners.push(trackedListener);
    return unsubscribe;
  }

  /**
   * 添加只触发一次的事件监听
   * @param eventBus 事件总线实例
   * @param eventName 事件名称
   * @param handler 事件处理函数
   * @param options 订阅选项
   * @returns 取消订阅函数
   */
  once<T = any>(
    eventBus: EventBus,
    eventName: string,
    handler: (data: T) => void,
    options?: { tag?: string; priority?: number }
  ): UnsubscribeFn {
    return this.on(eventBus, eventName, handler, { ...options, once: true });
  }

  /**
   * 添加DOM事件监听
   * @param element DOM元素
   * @param eventName 事件名称
   * @param handler 事件处理函数
   * @param options 事件监听选项
   */
  addEventListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement | Window | Document,
    eventName: K,
    handler: (evt: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!element || !eventName || !handler) {
      this.logger.warn('尝试注册无效的DOM事件监听器');
      return;
    }

    // 添加DOM事件监听
    element.addEventListener(eventName, handler as EventListener, options);

    // 追踪这个监听器
    const trackedListener: TrackedListener = {
      eventName: eventName as string,
      handler: handler as EventHandler,
      source: 'DOM',
      unsubscribe: () =>
        element.removeEventListener(
          eventName,
          handler as EventListener,
          options
        ),
    };

    this.listeners.push(trackedListener);
  }

  /**
   * 添加Worker事件监听
   * @param worker Worker实例
   * @param eventName 事件名称
   * @param handler 事件处理函数
   */
  addWorkerListener(
    worker: Worker,
    eventName: string,
    handler: EventListener
  ): void {
    if (!worker || !eventName || !handler) {
      this.logger.warn('尝试注册无效的Worker事件监听器');
      return;
    }

    // 添加Worker事件监听
    worker.addEventListener(eventName, handler);

    // 追踪这个监听器
    const trackedListener: TrackedListener = {
      eventName,
      handler: handler as EventHandler,
      source: 'Worker',
      unsubscribe: () => worker.removeEventListener(eventName, handler),
    };

    this.listeners.push(trackedListener);
  }

  /**
   * 取消特定事件的监听
   * @param eventName 事件名称
   * @param handler 可选的特定处理函数
   * @returns 是否成功取消
   */
  unsubscribe(eventName: string, handler?: EventHandler): boolean {
    const matchingListeners = this.listeners.filter(
      listener =>
        listener.eventName === eventName &&
        (!handler || listener.handler === handler)
    );

    if (matchingListeners.length === 0) {
      return false;
    }

    let success = true;
    matchingListeners.forEach(listener => {
      try {
        if (listener.unsubscribe) {
          listener.unsubscribe();
        }

        // 从跟踪列表中移除
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
          this.listeners.splice(index, 1);
        }
      } catch (error) {
        success = false;
        this.logger.error(`取消订阅事件失败: ${eventName}`, error);
      }
    });

    return success;
  }

  /**
   * 取消特定标签的所有事件监听
   * @param tag 标签名
   * @returns 取消的监听器数量
   */
  unsubscribeByTag(tag: string): number {
    const matchingListeners = this.listeners.filter(
      listener => listener.tag === tag
    );

    matchingListeners.forEach(listener => {
      try {
        if (listener.unsubscribe) {
          listener.unsubscribe();
        }

        // 从跟踪列表中移除
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
          this.listeners.splice(index, 1);
        }
      } catch (error) {
        this.logger.error(`取消标签订阅失败: ${tag}`, error);
      }
    });

    return matchingListeners.length;
  }

  /**
   * 清理所有监听器
   */
  clearAll(): void {
    const count = this.listeners.length;

    this.listeners.forEach(listener => {
      try {
        if (listener.unsubscribe) {
          listener.unsubscribe();
        }
      } catch (error) {
        this.logger.error(`清理事件监听器失败: ${listener.eventName}`, error);
      }
    });

    this.listeners = [];
    this.logger.debug(`已清理 ${count} 个事件监听器`);
  }

  /**
   * 获取当前监听器数量
   */
  get count(): number {
    return this.listeners.length;
  }
}
