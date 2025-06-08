/**
 * EventBus - 事件总线系统
 * 提供事件注册、取消和触发功能
 */

type EventHandler = (...args: any[]) => void;

export class EventBus {
  private events: Map<string, EventHandler[]> = new Map();

  /**
   * 注册事件监听器
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  public on(event: string, handler: EventHandler): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(handler);
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
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.events.delete(event);
    }
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 事件参数
   */
  public emit(event: string, ...args: any[]): void {
    if (!this.events.has(event)) return;

    const handlers = this.events.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(...args);
      } catch (error) {
        console.error(
          `[EventBus] Error in event handler for "${event}":`,
          error
        );
      }
    });
  }

  /**
   * 移除所有事件监听器
   */
  public removeAllListeners(): void {
    this.events.clear();
  }
}

export default EventBus;
