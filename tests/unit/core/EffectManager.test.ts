import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EffectManager, Effect } from '../../../src/core/EffectManager';
import { EventBus } from '../../../src/core/EventBus';
import {
  EffectType,
  EffectStatus,
  EffectPriority,
  ResourceType,
} from '../../../src/types/effect';

describe('Effect', () => {
  let effect: Effect;
  const mockExecutor = vi.fn();

  beforeEach(() => {
    mockExecutor.mockReset();
    mockExecutor.mockResolvedValue('result');

    effect = new Effect(mockExecutor, {
      id: 'test-effect',
      type: EffectType.NETWORK,
      priority: EffectPriority.HIGH,
      metadata: {
        module: 'test-module',
        fileId: 'test-file',
        taskId: 'test-task',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该正确创建Effect实例', () => {
    expect(effect.id).toBe('test-effect');
    expect(effect.type).toBe(EffectType.NETWORK);
    expect(effect.priority).toBe(EffectPriority.HIGH);
    expect(effect.status).toBe(EffectStatus.CREATED);
    expect(effect.metadata).toMatchObject({
      module: 'test-module',
      fileId: 'test-file',
      taskId: 'test-task',
    });
  });

  it('应该成功执行并返回结果', async () => {
    const result = await effect.execute();

    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toBe('result');
    expect(result.error).toBeUndefined();
    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(effect.status).toBe(EffectStatus.COMPLETED);
  });

  it('应该处理执行过程中的错误', async () => {
    const error = new Error('测试错误');
    mockExecutor.mockRejectedValue(error);

    const result = await effect.execute();

    expect(result.status).toBe(EffectStatus.FAILED);
    expect(result.data).toBeUndefined();
    expect(result.error).toBe(error);
    expect(effect.status).toBe(EffectStatus.FAILED);
  });

  it('应该支持自动重试', async () => {
    mockExecutor.mockRejectedValueOnce(new Error('失败'));
    mockExecutor.mockResolvedValueOnce('重试成功');

    const retryEffect = new Effect(mockExecutor, {
      id: 'retry-effect',
      type: EffectType.NETWORK,
      autoRetry: true,
      maxRetries: 1,
    });

    const result = await retryEffect.execute();

    expect(mockExecutor).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toBe('重试成功');
  });

  it('应该支持取消操作', async () => {
    const longExecutor = vi.fn(async signal => {
      return new Promise(resolve => {
        const timeout = setTimeout(() => resolve('完成'), 1000);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve('已取消');
        });
      });
    });

    const cancelEffect = new Effect(longExecutor, {
      id: 'cancel-effect',
      type: EffectType.TIMER,
    });

    // 启动执行后立即取消
    const executePromise = cancelEffect.execute();
    cancelEffect.cancel();

    const result = await executePromise;

    expect(result.status).toBe(EffectStatus.CANCELLED);
    expect(cancelEffect.status).toBe(EffectStatus.CANCELLED);
  });

  it('应该支持超时配置', async () => {
    vi.useFakeTimers();

    const slowExecutor = vi.fn(async () => {
      return new Promise(resolve => {
        setTimeout(() => resolve('太慢了'), 2000);
      });
    });

    const timeoutEffect = new Effect(slowExecutor, {
      id: 'timeout-effect',
      type: EffectType.NETWORK,
      timeout: 1000,
    });

    const executePromise = timeoutEffect.execute();

    vi.advanceTimersByTime(1100);

    const result = await executePromise;

    expect(result.status).toBe(EffectStatus.FAILED);
    expect(result.error?.message).toContain('超时');

    vi.useRealTimers();
  });

  it('应该正确管理资源并释放', async () => {
    const resourceDisposeFunc = vi.fn();
    let registeredResource: any;

    const resourceExecutor = vi.fn(
      async (signal, metadata, registerResource) => {
        registeredResource = {
          dispose: resourceDisposeFunc,
          type: ResourceType.TIMER,
          id: 'test-resource',
        };
        registerResource(registeredResource);
        return 'with-resource';
      }
    );

    const resourceEffect = new Effect(resourceExecutor, {
      id: 'resource-effect',
      type: EffectType.TIMER,
    });

    await resourceEffect.execute();

    expect(resourceEffect.getResources()).toHaveLength(1);
    expect(resourceEffect.getResources()[0]).toBe(registeredResource);

    resourceEffect.dispose();

    expect(resourceDisposeFunc).toHaveBeenCalledTimes(1);
  });
});

describe('EffectManager', () => {
  let effectManager: EffectManager;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    effectManager = new EffectManager(eventBus);
  });

  afterEach(() => {
    effectManager.dispose();
  });

  it('应该创建并执行Effect', async () => {
    const mockExecutor = vi.fn().mockResolvedValue('测试结果');

    const effect = effectManager.create(mockExecutor, {
      type: EffectType.NETWORK,
      priority: EffectPriority.NORMAL,
    });

    expect(effect).toBeDefined();
    expect(effect.id).toBeDefined();
    expect(effect.type).toBe(EffectType.NETWORK);

    const result = await effectManager.execute(effect);

    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toBe('测试结果');
  });

  it('应该提供简化运行方法', async () => {
    const mockExecutor = vi.fn().mockResolvedValue('快速运行');

    const result = await effectManager.run(mockExecutor, {
      type: EffectType.TIMER,
    });

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toBe('快速运行');
  });

  it('应该通过ID获取Effect', async () => {
    const mockExecutor = vi.fn().mockResolvedValue('test');

    const effect = effectManager.create(mockExecutor, {
      id: 'unique-id',
      type: EffectType.NETWORK,
    });

    const retrievedEffect = effectManager.get('unique-id');

    expect(retrievedEffect).toBe(effect);
  });

  it('应该根据类型获取所有Effect', async () => {
    effectManager.create(vi.fn(), { type: EffectType.NETWORK });
    effectManager.create(vi.fn(), { type: EffectType.NETWORK });
    effectManager.create(vi.fn(), { type: EffectType.WORKER });

    const networkEffects = effectManager.getAll(EffectType.NETWORK);
    const workerEffects = effectManager.getAll(EffectType.WORKER);
    const allEffects = effectManager.getAll();

    expect(networkEffects.length).toBe(2);
    expect(workerEffects.length).toBe(1);
    expect(allEffects.length).toBe(3);
  });

  it('应该取消指定的Effect', async () => {
    const mockExecutor = vi.fn(async signal => {
      if (signal.aborted) return 'already aborted';

      return new Promise(resolve => {
        const check = () => {
          if (signal.aborted) {
            resolve('aborted');
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    });

    const effect = effectManager.create(mockExecutor, {
      id: 'cancel-me',
      type: EffectType.NETWORK,
    });

    // 开始执行
    const resultPromise = effectManager.execute(effect);

    // 取消
    effectManager.cancel('cancel-me');

    const result = await resultPromise;

    expect(result.status).toBe(EffectStatus.CANCELLED);
  });

  it('应该取消所有Effect', async () => {
    const mockExecutor = vi.fn(async () => 'result');

    effectManager.create(mockExecutor, {
      type: EffectType.NETWORK,
      id: 'net-1',
    });
    effectManager.create(mockExecutor, {
      type: EffectType.NETWORK,
      id: 'net-2',
    });
    effectManager.create(mockExecutor, {
      type: EffectType.WORKER,
      id: 'worker-1',
    });

    // 取消所有网络Effect
    effectManager.cancelAll(EffectType.NETWORK);

    expect(effectManager.get('net-1')?.status).toBe(EffectStatus.CANCELLED);
    expect(effectManager.get('net-2')?.status).toBe(EffectStatus.CANCELLED);
    expect(effectManager.get('worker-1')?.status).toBe(EffectStatus.CREATED);

    // 取消所有剩余Effect
    effectManager.cancelAll();

    expect(effectManager.get('worker-1')?.status).toBe(EffectStatus.CANCELLED);
  });

  it('应该创建和管理资源', async () => {
    const mockDispose = vi.fn();
    const resourceId = effectManager.createResource(
      ResourceType.TIMER,
      { test: true },
      mockDispose,
      { name: 'test-resource' }
    );

    expect(resourceId).toBeDefined();

    // 清理所有资源
    effectManager.cleanup();

    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it('应该提供Effect统计信息', async () => {
    const successExecutor = vi.fn().mockResolvedValue('success');
    const failExecutor = vi.fn().mockRejectedValue(new Error('fail'));

    const effect1 = effectManager.create(successExecutor, {
      type: EffectType.NETWORK,
    });
    const effect2 = effectManager.create(successExecutor, {
      type: EffectType.TIMER,
    });
    const effect3 = effectManager.create(failExecutor, {
      type: EffectType.NETWORK,
    });

    await effectManager.execute(effect1);
    await effectManager.execute(effect2);
    try {
      await effectManager.execute(effect3);
    } catch (e) {
      // 忽略错误
    }

    const stats = effectManager.getStats();

    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.total).toBe(3);
  });

  it('应该支持创建网络请求Effect', async () => {
    // 模拟fetch
    global.fetch = vi.fn().mockResolvedValue(new Response('成功'));

    const result = await effectManager.createNetworkRequest(
      effectManager,
      'https://example.com/api',
      { method: 'POST' },
      { priority: EffectPriority.HIGH }
    );

    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toBeInstanceOf(Response);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'POST',
      signal: expect.any(AbortSignal),
    });

    // 清除模拟
    (global.fetch as any).mockRestore();
  });

  it('应该支持创建Worker Effect', async () => {
    // 模拟Worker实现
    class MockWorker {
      onmessage: (event: any) => void = () => {
        // 此方法将被重写，这里只是初始化
      };

      constructor() {
        setTimeout(() => {
          this.onmessage({ data: { result: 'worker result' } });
        }, 10);
      }

      postMessage() {
        // 测试中不需要实际实现
      }

      terminate() {
        // 测试中不需要实际实现
      }
    }

    global.Worker = MockWorker as any;

    const result = await effectManager.createWorkerEffect(
      effectManager,
      'test-worker.js',
      { input: 'data' },
      { timeout: 1000 }
    );

    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toEqual({ result: 'worker result' });
  });

  it('应该支持创建Timer Effect', async () => {
    vi.useFakeTimers();

    const mockCallback = vi.fn().mockResolvedValue('timer executed');

    const executePromise = effectManager.createTimerEffect(
      effectManager,
      mockCallback,
      1000
    );

    expect(mockCallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1100);

    const result = await executePromise;

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toBe('timer executed');

    vi.useRealTimers();
  });

  it('应该支持创建事件监听Effect', async () => {
    const eventTarget = new EventTarget();
    const event = new Event('test-event');

    // 创建事件监听器
    const eventPromise = effectManager.createEventListenerEffect(
      effectManager,
      eventTarget,
      'test-event'
    );

    // 派发事件
    setTimeout(() => {
      eventTarget.dispatchEvent(event);
    }, 10);

    const result = await eventPromise;

    expect(result.status).toBe(EffectStatus.COMPLETED);
    expect(result.data).toBeInstanceOf(Event);
    expect(result.data.type).toBe('test-event');
  });
});
