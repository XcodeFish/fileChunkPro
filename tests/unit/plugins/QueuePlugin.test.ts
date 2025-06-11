/**
 * 多文件队列系统插件单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QueuePlugin,
  QueueItemStatus,
  QueueSortMode,
} from '../../../src/plugins/QueuePlugin';
import { TaskPriority } from '../../../src/types';
import UploaderCore from '../../../src/core/UploaderCore';
import { UploadError } from '../../../src/core/error';

// 模拟UploaderCore
vi.mock('../../../src/core/UploaderCore', () => {
  const UploaderCoreMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    upload: vi
      .fn()
      .mockImplementation(() => Promise.resolve({ success: true })),
    cancel: vi.fn(),
  }));
  return { default: UploaderCoreMock };
});

// 模拟文件对象
const createMockFile = (name: string, size: number) => ({
  name,
  size,
  type: 'application/octet-stream',
  lastModified: Date.now(),
});

describe('QueuePlugin', () => {
  let queuePlugin: QueuePlugin;
  let uploaderCore: UploaderCore;
  let localStorageMock: { [key: string]: string } = {};

  // 在每个测试前设置
  beforeEach(() => {
    // 清空localStorageMock
    localStorageMock = {};

    // 模拟localStorage
    global.localStorage = {
      getItem: vi.fn(key => localStorageMock[key] || null),
      setItem: vi.fn((key, value) => {
        localStorageMock[key] = value.toString();
      }),
      removeItem: vi.fn(key => {
        delete localStorageMock[key];
      }),
      clear: vi.fn(() => {
        localStorageMock = {};
      }),
      length: 0,
      key: vi.fn(() => null),
    };

    // 创建插件实例
    queuePlugin = new QueuePlugin();
    uploaderCore = new UploaderCore({ endpoint: 'http://example.com/upload' });

    // 安装插件
    queuePlugin.install(uploaderCore);
  });

  // 在每个测试后清理
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该能够正确创建插件实例', () => {
    expect(queuePlugin).toBeInstanceOf(QueuePlugin);
    expect(queuePlugin.name).toBe('QueuePlugin');
  });

  it('应该能向队列添加文件', () => {
    const file = createMockFile('test.txt', 1024);
    const id = (uploaderCore as any).queue.add(file);

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');

    const items = (uploaderCore as any).queue.getItems();
    expect(items.length).toBe(1);
    expect(items[0].file).toBe(file);
    expect(items[0].status).toBe(QueueItemStatus.PENDING);
    expect(items[0].priority).toBe(TaskPriority.NORMAL);
  });

  it('应该能从队列移除文件', () => {
    const file = createMockFile('test.txt', 1024);
    const id = (uploaderCore as any).queue.add(file);

    expect((uploaderCore as any).queue.getItems().length).toBe(1);

    const result = (uploaderCore as any).queue.remove(id);

    expect(result).toBe(true);
    expect((uploaderCore as any).queue.getItems().length).toBe(0);
  });

  it('应该能清空整个队列', () => {
    (uploaderCore as any).queue.add(createMockFile('test1.txt', 1024));
    (uploaderCore as any).queue.add(createMockFile('test2.txt', 2048));

    expect((uploaderCore as any).queue.getItems().length).toBe(2);

    (uploaderCore as any).queue.clear();

    expect((uploaderCore as any).queue.getItems().length).toBe(0);
  });

  it('应该能按优先级对队列进行排序', () => {
    const file1 = createMockFile('low.txt', 1024);
    const file2 = createMockFile('high.txt', 2048);
    const file3 = createMockFile('normal.txt', 3072);

    // 使用不同优先级添加文件
    (uploaderCore as any).queue.add(file1, TaskPriority.LOW);
    (uploaderCore as any).queue.add(file2, TaskPriority.HIGH);
    (uploaderCore as any).queue.add(file3, TaskPriority.NORMAL);

    // 获取排序后的队列
    const items = (uploaderCore as any).queue.getItems();

    // 验证优先级排序（高->中->低）
    expect(items[0].priority).toBe(TaskPriority.HIGH);
    expect(items[1].priority).toBe(TaskPriority.NORMAL);
    expect(items[2].priority).toBe(TaskPriority.LOW);
  });

  it('应该能更新队列项优先级', () => {
    const file = createMockFile('test.txt', 1024);
    const id = (uploaderCore as any).queue.add(file, TaskPriority.LOW);

    // 更新优先级
    (uploaderCore as any).queue.updatePriority(id, TaskPriority.CRITICAL);

    const item = (uploaderCore as any).queue.getItems()[0];
    expect(item.priority).toBe(TaskPriority.CRITICAL);
  });

  it('应该能获取队列统计信息', () => {
    // 添加不同状态的文件
    (uploaderCore as any).queue.add(createMockFile('test1.txt', 1024));
    (uploaderCore as any).queue.add(createMockFile('test2.txt', 2048));

    // 修改一个为已完成
    const items = (uploaderCore as any).queue.getItems();
    items[0].status = QueueItemStatus.COMPLETED;
    items[0].progress = 100;

    // 获取统计信息
    const stats = (uploaderCore as any).queue.getStats();

    expect(stats.total).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.totalSize).toBe(3072); // 1024 + 2048
  });

  it('应该能暂停和恢复队列', () => {
    (uploaderCore as any).queue.add(createMockFile('test1.txt', 1024));
    (uploaderCore as any).queue.add(createMockFile('test2.txt', 2048));

    // 暂停队列
    (uploaderCore as any).queue.pause();

    // 所有PENDING项应变为PAUSED
    const pausedItems = (uploaderCore as any).queue.getItems();
    expect(
      pausedItems.every(item => item.status === QueueItemStatus.PAUSED)
    ).toBe(true);

    // 恢复队列
    (uploaderCore as any).queue.resume();

    // 所有PAUSED项应变为PENDING
    const resumedItems = (uploaderCore as any).queue.getItems();
    expect(
      resumedItems.every(item => item.status === QueueItemStatus.PENDING)
    ).toBe(true);
  });

  it('应该能正确处理最大队列长度限制', () => {
    // 创建限制为2的队列
    const limitedQueuePlugin = new QueuePlugin({ maxQueueSize: 2 });
    limitedQueuePlugin.install(uploaderCore);

    // 添加两个文件应该成功
    (uploaderCore as any).queue.add(createMockFile('test1.txt', 1024));
    (uploaderCore as any).queue.add(createMockFile('test2.txt', 2048));

    expect((uploaderCore as any).queue.getItems().length).toBe(2);

    // 添加第三个文件应该失败
    expect(() => {
      (uploaderCore as any).queue.add(createMockFile('test3.txt', 3072));
    }).toThrow(UploadError);
  });

  it('应该支持不同的队列排序模式', () => {
    // 创建按文件大小排序的队列
    const sizeQueuePlugin = new QueuePlugin({
      sortMode: QueueSortMode.SIZE_ASC,
    });
    sizeQueuePlugin.install(uploaderCore);

    // 添加不同大小的文件
    (uploaderCore as any).queue.add(createMockFile('large.txt', 3072));
    (uploaderCore as any).queue.add(createMockFile('small.txt', 1024));
    (uploaderCore as any).queue.add(createMockFile('medium.txt', 2048));

    // 获取排序后的队列
    const items = (uploaderCore as any).queue.getItems();

    // 验证按大小升序排序
    expect(items[0].file.size).toBe(1024);
    expect(items[1].file.size).toBe(2048);
    expect(items[2].file.size).toBe(3072);
  });

  it('应该能持久化和恢复队列状态', () => {
    // 创建能持久化的队列
    const persistQueuePlugin = new QueuePlugin({
      persistQueue: true,
      persistKey: 'test_queue',
    });
    persistQueuePlugin.install(uploaderCore);

    // 添加文件
    (uploaderCore as any).queue.add(createMockFile('test1.txt', 1024));
    (uploaderCore as any).queue.add(createMockFile('test2.txt', 2048));

    // 验证持久化数据
    expect(global.localStorage.setItem).toHaveBeenCalled();
    expect(Object.keys(localStorageMock)).toContain('test_queue');

    // 验证localStorage.getItem被调用
    expect(global.localStorage.getItem).toHaveBeenCalledWith('test_queue');
  });

  it('应该能够获取活跃的上传项', () => {
    const file1 = createMockFile('complete.txt', 1024);
    const file2 = createMockFile('pending.txt', 2048);
    const file3 = createMockFile('active.txt', 3072);

    (uploaderCore as any).queue.add(file1);
    (uploaderCore as any).queue.add(file2);
    (uploaderCore as any).queue.add(file3);

    // 修改状态
    const items = (uploaderCore as any).queue.getItems();
    items[0].status = QueueItemStatus.COMPLETED;
    items[2].status = QueueItemStatus.UPLOADING;

    // 获取活跃项
    const activeItems = (uploaderCore as any).queue.getActiveItems();

    expect(activeItems.length).toBe(2);
    expect(
      activeItems.some(item => item.status === QueueItemStatus.PENDING)
    ).toBe(true);
    expect(
      activeItems.some(item => item.status === QueueItemStatus.UPLOADING)
    ).toBe(true);
    expect(
      activeItems.every(item => item.status !== QueueItemStatus.COMPLETED)
    ).toBe(true);
  });

  it('应该能自动清理已完成项', () => {
    // 创建自动清理的队列
    const autoCleanQueuePlugin = new QueuePlugin({
      autoCleanCompleted: true,
    });
    autoCleanQueuePlugin.install(uploaderCore);

    // 添加文件
    (uploaderCore as any).queue.add(createMockFile('test1.txt', 1024));

    // 模拟上传完成
    const uploadCompleteEvent = {
      success: true,
      url: 'http://example.com/files/test1.txt',
    };

    // 触发上传完成事件
    uploaderCore.emit('uploadComplete', uploadCompleteEvent);

    // 验证队列是否为空
    expect((uploaderCore as any).queue.getItems().length).toBe(0);
  });
});
