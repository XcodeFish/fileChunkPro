/**
 * EventBus使用示例
 */
import { EventBus, createEventObject, EventObject } from '../src/core/EventBus';

// 创建事件总线实例
const eventBus = new EventBus();

// 注册普通事件处理器
eventBus.on('message', (event: EventObject) => {
  console.log('收到消息事件:', event.data);
});

// 注册高优先级事件处理器
eventBus.on(
  'message',
  (event: EventObject) => {
    console.log('高优先级处理器收到消息:', event.data);

    // 演示停止事件传播
    if (event.data?.important) {
      console.log('重要消息，停止传播');
      event.stopPropagation();
    }
  },
  { priority: 10 }
);

// 注册低优先级事件处理器
eventBus.on(
  'message',
  (event: EventObject) => {
    console.log('低优先级处理器收到消息:', event.data);
  },
  { priority: -10 }
);

// 注册一次性事件处理器
eventBus.once('once-event', (event: EventObject) => {
  console.log('这个处理器只执行一次:', event.data);
});

// 演示事件传播
console.log('--- 普通消息 ---');
eventBus.emit('message', { text: '这是一条普通消息' });

console.log('\n--- 重要消息（会停止传播） ---');
eventBus.emit('message', { text: '这是一条重要消息', important: true });

// 演示一次性事件
console.log('\n--- 一次性事件 ---');
eventBus.emit('once-event', { text: '第一次触发' });
eventBus.emit('once-event', { text: '第二次触发（不会收到）' });

// 演示阻止默认行为
console.log('\n--- 阻止默认行为 ---');
eventBus.on('action', (event: EventObject) => {
  console.log('检查操作:', event.data);
  if (event.data?.action === 'dangerous') {
    console.log('阻止危险操作');
    event.preventDefault();
  }
});

eventBus.on('action', (event: EventObject) => {
  if (event.defaultPrevented) {
    console.log('默认行为已被阻止，跳过操作');
  } else {
    console.log('执行操作:', event.data?.action);
  }
});

// 安全操作
eventBus.emit('action', { action: 'safe' });
// 危险操作
eventBus.emit('action', { action: 'dangerous' });

// 动态创建和分发事件对象
console.log('\n--- 手动创建事件对象 ---');
const customEvent = createEventObject('custom', { value: 42 }, 'EventCreator');
eventBus.on('custom', (event: EventObject) => {
  console.log(`接收自定义事件:`, event);
});
eventBus.emit(customEvent);

// 清理事件监听器
console.log('\n--- 清理前的状态 ---');
console.log(`message事件监听器数量: ${eventBus.listenerCount('message')}`);
console.log(`action事件监听器数量: ${eventBus.listenerCount('action')}`);

eventBus.removeAllListeners('message');
console.log('\n--- 清理特定事件后的状态 ---');
console.log(`message事件监听器数量: ${eventBus.listenerCount('message')}`);
console.log(`action事件监听器数量: ${eventBus.listenerCount('action')}`);

eventBus.removeAllListeners();
console.log('\n--- 清理所有事件后的状态 ---');
console.log(`message事件监听器数量: ${eventBus.listenerCount('message')}`);
console.log(`action事件监听器数量: ${eventBus.listenerCount('action')}`);
