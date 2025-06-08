import { describe, it, expect, vi } from 'vitest';

import EventBus, { createEventObject } from '../../../src/core/EventBus';

describe('EventBus', () => {
  it('should create an instance', () => {
    const eventBus = new EventBus();
    expect(eventBus).toBeInstanceOf(EventBus);
  });

  it('should register and trigger event handlers', () => {
    const eventBus = new EventBus();
    const handler = vi.fn();

    eventBus.on('test', handler);
    eventBus.emit('test', { data: 'test-data' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'test',
        data: { data: 'test-data' },
      })
    );
  });

  it('should remove event handlers', () => {
    const eventBus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    eventBus.on('test', handler1);
    eventBus.on('test', handler2);

    // 移除特定处理函数
    eventBus.off('test', handler1);
    eventBus.emit('test');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);

    // 移除所有处理函数
    eventBus.off('test');
    eventBus.emit('test');

    expect(handler2).toHaveBeenCalledTimes(1); // 不会再增加调用次数
  });

  it('should register once handlers', () => {
    const eventBus = new EventBus();
    const handler = vi.fn();

    eventBus.once('test', handler);

    eventBus.emit('test');
    eventBus.emit('test');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should respect event priority', () => {
    const eventBus = new EventBus();
    const results: number[] = [];

    eventBus.on('test', () => results.push(3), { priority: 1 });
    eventBus.on('test', () => results.push(1), { priority: 3 });
    eventBus.on('test', () => results.push(2), { priority: 2 });

    eventBus.emit('test');

    expect(results).toEqual([1, 2, 3]);
  });

  it('should handle event propagation control', () => {
    const eventBus = new EventBus();
    const handler1 = vi.fn(event => event.stopPropagation());
    const handler2 = vi.fn();

    eventBus.on('test', handler1);
    eventBus.on('test', handler2);

    eventBus.emit('test');

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should create event objects', () => {
    const event = createEventObject('test', { value: 123 }, 'source');

    expect(event).toMatchObject({
      type: 'test',
      data: { value: 123 },
      source: 'source',
      defaultPrevented: false,
      propagationStopped: false,
    });

    // 测试事件方法
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);

    event.stopPropagation();
    expect(event.propagationStopped).toBe(true);
  });

  it('should remove all listeners', () => {
    const eventBus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    eventBus.on('test1', handler1);
    eventBus.on('test2', handler2);

    eventBus.removeAllListeners();

    eventBus.emit('test1');
    eventBus.emit('test2');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should count listeners', () => {
    const eventBus = new EventBus();
    const handler = vi.fn();

    expect(eventBus.listenerCount('test')).toBe(0);

    eventBus.on('test', handler);
    eventBus.on('test', () => {});

    expect(eventBus.listenerCount('test')).toBe(2);
    expect(eventBus.hasListeners('test')).toBe(true);
    expect(eventBus.hasListeners('nonexistent')).toBe(false);
  });
});
