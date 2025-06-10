/**
 * QueuePlugin使用示例
 * 演示多文件队列系统插件的用法
 */
import UploaderCore from '../src/core/UploaderCore';
import {
  QueuePlugin,
  QueueSortMode,
  QueueItemStatus,
} from '../src/plugins/QueuePlugin';
import { TaskPriority } from '../src/types';

// 1. 创建上传器核心实例
const uploader = new UploaderCore({
  endpoint: 'https://api.example.com/upload',
  chunkSize: 2 * 1024 * 1024, // 2MB分片
  concurrency: 3, // 并发上传分片数
  retryCount: 3, // 失败重试次数
});

// 2. 创建队列插件实例，并配置参数
const queuePlugin = new QueuePlugin({
  // 队列排序方式
  sortMode: QueueSortMode.PRIORITY, // 按优先级排序

  // 并行上传数量
  parallelUploads: 1, // 一次只上传一个文件

  // 是否自动开始上传
  autoStart: true, // 添加后自动开始上传

  // 是否持久化队列
  persistQueue: true, // 启用队列持久化
  persistKey: 'myApp_uploadQueue', // 持久化使用的key

  // 队列长度限制，0表示不限制
  maxQueueSize: 10, // 最多同时添加10个文件

  // 是否自动清理已完成项
  autoCleanCompleted: false, // 保留已完成的上传项
});

// 3. 安装插件
uploader.use(queuePlugin);

// 4. 监听队列事件
uploader.on('queueChange', ({ queue, stats }) => {
  console.log('队列已更新:', queue.length ? '有文件等待上传' : '队列为空');
  console.log(`总进度: ${stats.progress.toFixed(2)}%`);
  console.log(
    `总文件数: ${stats.total}, 等待: ${stats.pending}, 上传中: ${stats.uploading}, ` +
      `已完成: ${stats.completed}, 失败: ${stats.failed}`
  );
});

// 获取上传元素（示例）
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const resumeBtn = document.getElementById('resumeBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// 5. 添加文件到队列
fileInput?.addEventListener('change', _e => {
  const files = fileInput.files;
  if (!files || files.length === 0) return;

  // 遍历文件列表添加到队列
  Array.from(files).forEach((file, index) => {
    try {
      // 根据文件大小决定优先级：大文件低优先级，小文件高优先级
      const priority =
        file.size > 10 * 1024 * 1024 ? TaskPriority.LOW : TaskPriority.HIGH;

      // 添加到队列，并设置自定义数据
      const itemId = (uploader as any).queue.add(file, priority, {
        addedAt: new Date(),
        customId: `file_${Date.now()}_${index}`,
      });

      console.log(`文件 ${file.name} 已添加到队列，ID: ${itemId}`);
    } catch (error) {
      console.error(`添加文件 ${file.name} 失败:`, error);
    }
  });
});

// 6. 手动控制队列
uploadBtn?.addEventListener('click', () => {
  // 开始上传队列
  (uploader as any).queue.start();
});

pauseBtn?.addEventListener('click', () => {
  // 暂停队列
  (uploader as any).queue.pause();
});

resumeBtn?.addEventListener('click', () => {
  // 恢复队列
  (uploader as any).queue.resume();
});

clearBtn?.addEventListener('click', () => {
  // 清空队列
  (uploader as any).queue.clear();
});

// 7. 获取队列状态
function updateQueueStatus() {
  // 获取队列中的所有文件
  const allItems = (uploader as any).queue.getItems();

  // 获取活跃的上传项(上传中或等待中) - 可根据需要在UI中使用
  // const activeItems = (uploader as any).queue.getActiveItems();

  // 获取队列统计信息
  const stats = (uploader as any).queue.getStats();

  console.log('队列统计:', {
    total: stats.total,
    pending: stats.pending,
    uploading: stats.uploading,
    completed: stats.completed,
    failed: stats.failed,
    totalSize: `${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB`,
    progress: `${stats.progress.toFixed(2)}%`,
  });

  // 更新UI (示例)
  updateUI(allItems, stats);
}

// 8. 示例UI更新函数
function updateUI(items: any[], stats: any) {
  const queueListEl = document.getElementById('queueList');
  if (!queueListEl) return;

  queueListEl.innerHTML = '';

  // 更新全局进度
  const progressEl = document.getElementById(
    'totalProgress'
  ) as HTMLProgressElement;
  if (progressEl) {
    progressEl.value = stats.progress;
  }

  // 更新各文件状态
  items.forEach(item => {
    const itemEl = document.createElement('li');

    // 状态文本
    let statusText = '';
    switch (item.status) {
      case QueueItemStatus.PENDING:
        statusText = '等待中';
        break;
      case QueueItemStatus.UPLOADING:
        statusText = '上传中';
        break;
      case QueueItemStatus.PAUSED:
        statusText = '已暂停';
        break;
      case QueueItemStatus.COMPLETED:
        statusText = '已完成';
        break;
      case QueueItemStatus.FAILED:
        statusText = '失败';
        break;
      case QueueItemStatus.CANCELLED:
        statusText = '已取消';
        break;
    }

    // 优先级文本
    let priorityText = '';
    switch (item.priority) {
      case TaskPriority.LOW:
        priorityText = '低';
        break;
      case TaskPriority.NORMAL:
        priorityText = '中';
        break;
      case TaskPriority.HIGH:
        priorityText = '高';
        break;
      case TaskPriority.CRITICAL:
        priorityText = '紧急';
        break;
    }

    itemEl.innerHTML = `
      <div>
        <strong>${item.file.name}</strong> (${(item.file.size / 1024).toFixed(2)} KB)
        <span>状态: ${statusText}</span>
        <span>优先级: ${priorityText}</span>
        <progress value="${item.progress}" max="100"></progress>
        <span>${item.progress.toFixed(2)}%</span>
      </div>
    `;

    // 操作按钮
    if (
      item.status === QueueItemStatus.PENDING ||
      item.status === QueueItemStatus.PAUSED
    ) {
      const promoteBtn = document.createElement('button');
      promoteBtn.textContent = '提高优先级';
      promoteBtn.onclick = () => {
        (uploader as any).queue.updatePriority(item.id, TaskPriority.CRITICAL);
      };
      itemEl.appendChild(promoteBtn);
    }

    if (item.status === QueueItemStatus.FAILED) {
      const retryBtn = document.createElement('button');
      retryBtn.textContent = '重试';
      retryBtn.onclick = () => {
        // 将状态改回PENDING以便重新上传
        item.status = QueueItemStatus.PENDING;
        (uploader as any).queue.start();
      };
      itemEl.appendChild(retryBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '移除';
    removeBtn.onclick = () => {
      (uploader as any).queue.remove(item.id);
    };
    itemEl.appendChild(removeBtn);

    queueListEl.appendChild(itemEl);
  });
}

// 每秒更新一次队列状态
setInterval(updateQueueStatus, 1000);

// 添加示例HTML结构
document.body.innerHTML = `
  <div class="upload-container">
    <h2>多文件队列上传示例</h2>
    
    <div class="file-input">
      <input type="file" id="fileInput" multiple />
      <div class="queue-controls">
        <button id="uploadBtn">开始上传</button>
        <button id="pauseBtn">暂停队列</button>
        <button id="resumeBtn">恢复队列</button>
        <button id="clearBtn">清空队列</button>
      </div>
    </div>
    
    <div class="queue-status">
      <h3>上传队列总进度</h3>
      <progress id="totalProgress" value="0" max="100"></progress>
    </div>
    
    <div class="queue-list">
      <h3>队列中的文件</h3>
      <ul id="queueList"></ul>
    </div>
  </div>
`;
