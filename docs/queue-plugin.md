# 多文件队列系统插件 (QueuePlugin)

## 简介

多文件队列系统是fileChunkPro 3.0引入的企业级特性，提供了批量文件上传、队列管理、优先级控制、暂停/恢复和状态持久化等高级功能。该插件通过对上传任务的集中控制和管理，极大地提高了多文件上传的灵活性和可控性。

## 主要特性

1. **批量文件上传**

   - 同时管理多个文件上传任务
   - 自定义并行上传数量控制

2. **队列优先级控制**

   - 支持4种优先级级别（低、中、高、紧急）
   - 多种排序策略（优先级、大小、添加顺序）
   - 动态调整任务优先级

3. **队列状态管理**

   - 实时监控上传状态
   - 详细的队列统计信息
   - 全队列暂停/恢复

4. **队列状态持久化**
   - 浏览器刷新后恢复队列状态
   - 自定义持久化策略

## 安装和基本使用

### 1. 安装插件

```typescript
import UploaderCore from 'fileChunkPro/core';
import { QueuePlugin } from 'fileChunkPro/plugins';

// 创建上传器实例
const uploader = new UploaderCore({
  endpoint: 'https://api.example.com/upload',
  // ... 其他上传配置
});

// 创建并安装队列插件
const queuePlugin = new QueuePlugin();
uploader.use(queuePlugin);
```

### 2. 配置选项

```typescript
const queuePlugin = new QueuePlugin({
  // 队列排序方式: PRIORITY(优先级), SIZE_ASC(小到大), SIZE_DESC(大到小), FIFO(先进先出), LIFO(后进先出)
  sortMode: QueueSortMode.PRIORITY,

  // 并行上传数量
  parallelUploads: 2,

  // 是否自动开始上传
  autoStart: true,

  // 是否持久化队列
  persistQueue: true,
  persistKey: 'myApp_uploadQueue',

  // 队列长度限制 (0表示不限制)
  maxQueueSize: 10,

  // 是否自动清理已完成项
  autoCleanCompleted: false,

  // 队列变动事件节流时间(ms)
  throttleTime: 300,
});
```

### 3. 添加文件到队列

```typescript
// 添加单个文件到队列
const id1 = uploader.queue.add(file);

// 添加文件并设置优先级
import { TaskPriority } from 'fileChunkPro/types';
const id2 = uploader.queue.add(file, TaskPriority.HIGH);

// 添加文件并带自定义数据
const id3 = uploader.queue.add(file, TaskPriority.NORMAL, {
  category: 'image',
  userId: 1001,
});
```

### 4. 监听队列事件

```typescript
uploader.on('queueChange', ({ queue, stats }) => {
  console.log(`队列状态更新: 总计${stats.total}个文件`);
  console.log(`总进度: ${stats.progress.toFixed(2)}%`);
  console.log(
    `已完成: ${stats.completed}, 上传中: ${stats.uploading}, 等待中: ${stats.pending}`
  );
});
```

### 5. 控制队列

```typescript
// 开始上传队列
uploader.queue.start();

// 暂停整个队列
uploader.queue.pause();

// 恢复整个队列
uploader.queue.resume();

// 清空整个队列
uploader.queue.clear();

// 从队列中移除特定文件
uploader.queue.remove(fileId);
```

## 进阶功能

### 1. 队列项状态

队列中的每个文件都有以下可能状态：

- `PENDING`: 等待上传
- `UPLOADING`: 上传中
- `PAUSED`: 暂停
- `COMPLETED`: 已完成
- `FAILED`: 失败
- `CANCELLED`: 已取消

### 2. 优先级控制

```typescript
// 更新队列项优先级
uploader.queue.updatePriority(fileId, TaskPriority.CRITICAL);

// 优先级级别:
// TaskPriority.LOW = 0
// TaskPriority.NORMAL = 1
// TaskPriority.HIGH = 2
// TaskPriority.CRITICAL = 3
```

### 3. 队列查询

```typescript
// 获取队列中的所有文件
const allItems = uploader.queue.getItems();

// 获取活跃的上传项(上传中或等待中)
const activeItems = uploader.queue.getActiveItems();

// 获取队列统计信息
const stats = uploader.queue.getStats();
console.log(`总文件大小: ${stats.totalSize} 字节`);
console.log(`已上传大小: ${stats.uploadedSize} 字节`);
console.log(`总进度: ${stats.progress}%`);
```

### 4. 状态持久化机制

队列插件可以将当前队列状态持久化到localStorage中，这使得即使在页面刷新后，仍能保持队列状态。

注意：由于文件对象无法序列化，因此在恢复队列时，需要用户重新选择文件。恢复的队列项中，原先处于`PENDING`或`UPLOADING`状态的项会被标记为`FAILED`状态，并显示提示信息。

## 常见的使用场景

### 场景一：批量上传文件夹内容

```typescript
async function uploadFolder(folderInput) {
  const files = Array.from(folderInput.files);

  // 按文件大小排序，优先上传小文件
  files.sort((a, b) => a.size - b.size);

  for (const file of files) {
    // 根据文件类型设置优先级
    let priority = TaskPriority.NORMAL;
    if (file.type.startsWith('image/')) {
      priority = TaskPriority.HIGH; // 图片优先
    } else if (file.size > 50 * 1024 * 1024) {
      priority = TaskPriority.LOW; // 大文件降低优先级
    }

    uploader.queue.add(file, priority);
  }

  // 开始上传队列
  uploader.queue.start();
}
```

### 场景二：错误重试

```typescript
uploader.on('queueChange', ({ queue }) => {
  // 检查是否有失败的项
  const failedItems = queue.filter(
    item => item.status === QueueItemStatus.FAILED
  );

  if (failedItems.length > 0) {
    // 是否要重试
    if (confirm(`${failedItems.length}个文件上传失败，是否重试？`)) {
      failedItems.forEach(item => {
        // 将状态改回PENDING以便重新上传
        item.status = QueueItemStatus.PENDING;
      });
      uploader.queue.start();
    }
  }
});
```

## 注意事项与最佳实践

1. **内存管理**

   - 在处理大量文件时，考虑适当限制`maxQueueSize`
   - 使用`autoCleanCompleted: true`自动清理已完成项

2. **优先级策略**

   - 为小文件设置较高优先级，可以提升用户体验
   - 考虑文件类型和业务重要性设置优先级

3. **队列持久化**

   - 启用`persistQueue`可以提高用户体验，避免刷新页面导致上传状态丢失
   - 在恢复队列后，需要引导用户重新选择文件

4. **性能考量**
   - 合理设置`parallelUploads`值，推荐2-3个并行上传任务
   - 大量文件时，可考虑逐批次添加到队列，避免一次性处理过多文件

## API参考

### QueuePlugin选项

| 选项               | 类型          | 默认值                 | 描述                         |
| ------------------ | ------------- | ---------------------- | ---------------------------- |
| maxQueueSize       | number        | 0                      | 最大队列长度，0表示不限制    |
| sortMode           | QueueSortMode | QueueSortMode.PRIORITY | 队列排序方式                 |
| autoStart          | boolean       | true                   | 添加文件后是否自动开始上传   |
| parallelUploads    | number        | 1                      | 同时上传的文件数量           |
| persistQueue       | boolean       | false                  | 是否持久化队列状态           |
| persistKey         | string        | 'fileChunkPro_queue'   | 持久化使用的localStorage键名 |
| throttleTime       | number        | 300                    | 队列变动事件节流时间(毫秒)   |
| autoCleanCompleted | boolean       | false                  | 是否自动清理已完成项         |

### 队列方法

| 方法                              | 返回值      | 描述                         |
| --------------------------------- | ----------- | ---------------------------- |
| add(file, priority?, customData?) | string      | 添加文件到队列，返回队列项ID |
| remove(id)                        | boolean     | 从队列中移除指定ID的文件     |
| clear()                           | void        | 清空队列                     |
| start()                           | void        | 开始上传队列                 |
| pause()                           | void        | 暂停队列                     |
| resume()                          | void        | 恢复队列                     |
| getItems()                        | QueueItem[] | 获取队列中的所有文件         |
| getActiveItems()                  | QueueItem[] | 获取活跃的上传项             |
| getStats()                        | QueueStats  | 获取队列统计信息             |
| updatePriority(id, priority)      | boolean     | 更新队列项优先级             |

### 事件

| 事件名      | 参数             | 描述               |
| ----------- | ---------------- | ------------------ |
| queueChange | { queue, stats } | 队列状态变化时触发 |
