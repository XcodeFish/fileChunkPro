/**
 * 构建ServiceWorker文件
 * 此脚本生成用于离线上传和后台上传的ServiceWorker文件
 */

const fs = require('fs');
const path = require('path');
const terser = require('terser');
const chalk = require('chalk');

// ServiceWorker文件模板
const serviceWorkerTemplate = `
// fileChunkPro ServiceWorker
// 版本: __VERSION__
// 构建时间: __BUILD_TIME__

const CACHE_NAME = 'file-chunk-pro-cache-__VERSION__';
const API_CACHE_NAME = 'file-chunk-pro-api-cache-__VERSION__';
const UPLOAD_STORE_NAME = 'file-chunk-pro-uploads';
const FILE_STORE_NAME = 'file-chunk-pro-files';
const CLIENT_ID_STORE_NAME = 'file-chunk-pro-clients';

// 客户端消息端口映射
const clientPorts = new Map();

// 上传任务队列
const uploadQueue = new Map();

// 活跃上传任务
const activeUploads = new Map();

/**
 * ServiceWorker安装事件
 * 预缓存关键资源
 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('[FileChunkPro SW] ServiceWorker installed');
});

/**
 * ServiceWorker激活事件
 * 清理旧缓存
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[FileChunkPro SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[FileChunkPro SW] ServiceWorker activated');
      return self.clients.claim();
    })
  );
});

/**
 * 消息处理
 */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  
  if (type === 'INIT_PORT' && event.ports && event.ports.length > 0) {
    // 初始化客户端通信端口
    const { clientId } = payload || {};
    const port = event.ports[0];
    
    if (clientId) {
      clientPorts.set(clientId, port);
      
      // 设置消息处理器
      port.onmessage = (e) => handleClientMessage(clientId, e.data);
      
      // 发送就绪消息
      port.postMessage({ type: 'SW_READY' });
      console.log('[FileChunkPro SW] Client connection established:', clientId);
    }
    return;
  }
  
  // 直接消息处理
  handleClientMessage(event.source?.id, event.data);
});

/**
 * 处理来自客户端的消息
 */
function handleClientMessage(clientId, message) {
  if (!message || !message.type) return;
  
  const { type, payload } = message;
  
  switch (type) {
    case 'UPLOAD_FILE':
      addToUploadQueue(clientId, payload);
      break;
      
    case 'CANCEL_UPLOAD':
      cancelUpload(payload.fileId);
      break;
      
    case 'CANCEL_ALL_UPLOADS':
      cancelAllUploads(clientId);
      break;
      
    case 'RETRY_UPLOADS':
      retryUploads(payload.fileIds);
      break;
      
    case 'GET_PENDING_UPLOADS':
      sendPendingUploads(clientId);
      break;
      
    case 'GET_CACHED_FILES':
      sendCachedFiles(clientId);
      break;
      
    case 'CLEAN_CACHE':
      cleanCache();
      break;
      
    default:
      console.log('[FileChunkPro SW] Unknown message type:', type);
      break;
  }
}

/**
 * 添加上传任务到队列
 */
function addToUploadQueue(clientId, uploadTask) {
  if (!uploadTask || !uploadTask.fileId) return;
  
  const { fileId } = uploadTask;
  
  // 添加到上传队列
  uploadQueue.set(fileId, {
    ...uploadTask,
    clientId,
    status: 'pending',
    progress: 0,
    retries: 0,
    createdAt: Date.now()
  });
  
  console.log('[FileChunkPro SW] Added to upload queue:', fileId);
  
  // 尝试立即处理上传
  processUploadQueue();
}

/**
 * 处理上传队列
 */
function processUploadQueue() {
  // 检查网络连接
  if (!navigator.onLine) {
    console.log('[FileChunkPro SW] Network offline, upload queue processing paused');
    return;
  }
  
  // 检查当前活跃上传任务数量
  const maxConcurrent = 2; // 最大并发数
  
  if (activeUploads.size >= maxConcurrent) {
    console.log('[FileChunkPro SW] Max concurrent uploads reached, waiting');
    return;
  }
  
  // 遍历队列，找到待处理的任务
  for (const [fileId, task] of uploadQueue.entries()) {
    if (task.status === 'pending' && !activeUploads.has(fileId)) {
      startUpload(fileId, task);
      
      // 如果达到最大并发数，退出循环
      if (activeUploads.size >= maxConcurrent) {
        break;
      }
    }
  }
}

/**
 * 开始上传
 */
function startUpload(fileId, task) {
  // 标记为活跃上传
  activeUploads.set(fileId, {
    startTime: Date.now(),
    clientId: task.clientId
  });
  
  // 更新任务状态
  uploadQueue.set(fileId, {
    ...task,
    status: 'uploading',
    startedAt: Date.now()
  });
  
  console.log('[FileChunkPro SW] Starting upload:', fileId);
  
  // 模拟上传过程 (实际实现会涉及到fetch和IndexedDB)
  simulateUpload(fileId, task);
}

/**
 * 模拟上传过程 (实际项目中需要真实实现)
 */
function simulateUpload(fileId, task) {
  let progress = 0;
  const clientId = task.clientId;
  const totalTime = task.fileSize > 1024 * 1024 * 10 ? 10000 : 5000; // 大文件10秒，小文件5秒
  const interval = 500;
  const steps = totalTime / interval;
  const progressStep = 100 / steps;
  
  const updateInterval = setInterval(() => {
    progress += progressStep;
    
    if (progress >= 100) {
      progress = 100;
      clearInterval(updateInterval);
      
      // 上传完成
      completeUpload(fileId, {
        url: \`https://example.com/uploads/\${fileId}\`,
        fileName: task.fileName
      });
    }
    
    // 更新进度
    updateUploadProgress(fileId, Math.floor(progress));
  }, interval);
  
  // 保存定时器以便能够取消
  activeUploads.set(fileId, {
    ...activeUploads.get(fileId),
    interval: updateInterval
  });
}

/**
 * 更新上传进度
 */
function updateUploadProgress(fileId, progress) {
  const task = uploadQueue.get(fileId);
  if (!task) return;
  
  // 更新任务进度
  uploadQueue.set(fileId, {
    ...task,
    progress
  });
  
  // 向客户端发送进度更新
  sendMessageToClient(task.clientId, {
    type: 'UPLOAD_PROGRESS',
    payload: { fileId, progress }
  });
}

/**
 * 完成上传
 */
function completeUpload(fileId, result) {
  const task = uploadQueue.get(fileId);
  if (!task) return;
  
  console.log('[FileChunkPro SW] Upload completed:', fileId);
  
  // 更新任务状态
  uploadQueue.set(fileId, {
    ...task,
    status: 'completed',
    progress: 100,
    result,
    completedAt: Date.now()
  });
  
  // 向客户端发送完成消息
  sendMessageToClient(task.clientId, {
    type: 'UPLOAD_COMPLETE',
    payload: { fileId, result }
  });
  
  // 从活跃上传中移除
  const activeUpload = activeUploads.get(fileId);
  if (activeUpload && activeUpload.interval) {
    clearInterval(activeUpload.interval);
  }
  activeUploads.delete(fileId);
  
  // 尝试处理队列中的下一个任务
  processUploadQueue();
  
  // 定期清理已完成的任务
  setTimeout(() => {
    if (uploadQueue.has(fileId) && uploadQueue.get(fileId).status === 'completed') {
      uploadQueue.delete(fileId);
    }
  }, 3600000); // 1小时后清理
}

/**
 * 处理上传错误
 */
function handleUploadError(fileId, error) {
  const task = uploadQueue.get(fileId);
  if (!task) return;
  
  console.error('[FileChunkPro SW] Upload error:', fileId, error);
  
  // 增加重试次数
  const retries = (task.retries || 0) + 1;
  const maxRetries = 3;
  
  if (retries <= maxRetries) {
    // 更新任务状态，准备重试
    uploadQueue.set(fileId, {
      ...task,
      status: 'pending',
      retries,
      lastError: error,
      lastErrorAt: Date.now()
    });
    
    console.log('[FileChunkPro SW] Will retry upload:', fileId, \`(Attempt \${retries}/\${maxRetries})\`);
    
    // 通知客户端重试
    sendMessageToClient(task.clientId, {
      type: 'UPLOAD_RETRY',
      payload: { fileId, retries, maxRetries, error }
    });
    
    // 稍后重试
    setTimeout(() => {
      if (uploadQueue.has(fileId) && uploadQueue.get(fileId).status === 'pending') {
        processUploadQueue();
      }
    }, 5000 * retries); // 重试间隔随重试次数增加
  } else {
    // 重试次数已达上限，标记为失败
    uploadQueue.set(fileId, {
      ...task,
      status: 'failed',
      retries,
      lastError: error,
      lastErrorAt: Date.now()
    });
    
    // 通知客户端失败
    sendMessageToClient(task.clientId, {
      type: 'UPLOAD_ERROR',
      payload: { fileId, error, retries }
    });
    
    // 从活跃上传中移除
    const activeUpload = activeUploads.get(fileId);
    if (activeUpload && activeUpload.interval) {
      clearInterval(activeUpload.interval);
    }
    activeUploads.delete(fileId);
    
    // 处理队列中的下一个任务
    processUploadQueue();
  }
}

/**
 * 取消上传
 */
function cancelUpload(fileId) {
  const task = uploadQueue.get(fileId);
  if (!task) return;
  
  console.log('[FileChunkPro SW] Cancelling upload:', fileId);
  
  // 如果任务正在上传中，需要中断上传
  const activeUpload = activeUploads.get(fileId);
  if (activeUpload && activeUpload.interval) {
    clearInterval(activeUpload.interval);
  }
  
  // 从活跃上传和队列中移除
  activeUploads.delete(fileId);
  uploadQueue.delete(fileId);
  
  // 通知客户端取消成功
  sendMessageToClient(task.clientId, {
    type: 'UPLOAD_CANCELLED',
    payload: { fileId }
  });
  
  // 处理队列中的下一个任务
  processUploadQueue();
}

/**
 * 取消所有上传
 */
function cancelAllUploads(clientId) {
  console.log('[FileChunkPro SW] Cancelling all uploads for client:', clientId);
  
  // 找出该客户端的所有上传任务
  const fileIds = [];
  
  for (const [fileId, task] of uploadQueue.entries()) {
    if (task.clientId === clientId) {
      fileIds.push(fileId);
    }
  }
  
  // 逐个取消
  fileIds.forEach(fileId => cancelUpload(fileId));
  
  // 通知客户端所有上传已取消
  sendMessageToClient(clientId, {
    type: 'ALL_UPLOADS_CANCELLED'
  });
}

/**
 * 重试上传
 */
function retryUploads(fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return;
  
  console.log('[FileChunkPro SW] Retrying uploads:', fileIds);
  
  fileIds.forEach(fileId => {
    const task = uploadQueue.get(fileId);
    if (task && (task.status === 'failed' || task.status === 'pending')) {
      // 重置任务状态
      uploadQueue.set(fileId, {
        ...task,
        status: 'pending',
        lastRetryAt: Date.now()
      });
    }
  });
  
  // 处理队列
  processUploadQueue();
}

/**
 * 发送待处理的上传任务列表给客户端
 */
function sendPendingUploads(clientId) {
  const pendingTasks = [];
  
  for (const [fileId, task] of uploadQueue.entries()) {
    if (task.clientId === clientId && task.status !== 'completed') {
      pendingTasks.push({
        fileId,
        fileName: task.fileName,
        fileSize: task.fileSize,
        status: task.status,
        progress: task.progress,
        retries: task.retries,
        createdAt: task.createdAt
      });
    }
  }
  
  sendMessageToClient(clientId, {
    type: 'PENDING_UPLOADS',
    payload: pendingTasks
  });
}

/**
 * 发送缓存的文件列表给客户端
 */
function sendCachedFiles(clientId) {
  // 此处应该从IndexedDB中获取文件列表
  // 模拟实现
  const cachedFiles = [];
  
  sendMessageToClient(clientId, {
    type: 'CACHED_FILES',
    payload: cachedFiles
  });
}

/**
 * 清理缓存
 */
function cleanCache() {
  console.log('[FileChunkPro SW] Cleaning cache');
  
  // 清理缓存
  caches.delete(CACHE_NAME);
  caches.delete(API_CACHE_NAME);
  
  // 实际实现应该还要清理IndexedDB中的内容
}

/**
 * 发送消息给指定的客户端
 */
function sendMessageToClient(clientId, message) {
  // 通过MessageChannel发送
  const port = clientPorts.get(clientId);
  if (port) {
    port.postMessage(message);
    return;
  }
  
  // 回退方式：尝试通过clients API发送
  self.clients.matchAll().then(clients => {
    const targetClient = clients.find(client => client.id === clientId);
    if (targetClient) {
      targetClient.postMessage(message);
    }
  });
}

/**
 * 后台同步事件
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'fileChunkProUpload') {
    event.waitUntil(syncUploads());
  }
});

/**
 * 同步上传所有待处理的任务
 */
async function syncUploads() {
  console.log('[FileChunkPro SW] Background sync triggered');
  
  // 处理所有pending状态的上传
  for (const [fileId, task] of uploadQueue.entries()) {
    if (task.status === 'pending') {
      // 触发上传处理
      processUploadQueue();
      return;
    }
  }
}

/**
 * 网络状态变化处理
 */
self.addEventListener('online', () => {
  console.log('[FileChunkPro SW] Network is online, resuming uploads');
  processUploadQueue();
});

self.addEventListener('offline', () => {
  console.log('[FileChunkPro SW] Network is offline, pausing uploads');
  // 可以在这里处理离线逻辑
});

// 初始处理
console.log('[FileChunkPro SW] ServiceWorker initialized');
`;

// 目标目录
const targetDir = path.resolve(__dirname, '../dist/browser');

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 读取package.json获取版本
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')
);
const version = packageJson.version;

// 替换模板变量
const swContent = serviceWorkerTemplate
  .replace('__VERSION__', version)
  .replace('__VERSION__', version)
  .replace('__VERSION__', version)
  .replace('__BUILD_TIME__', new Date().toISOString());

// 写入未压缩版本
const swPath = path.join(targetDir, 'sw.js');
fs.writeFileSync(swPath, swContent);

// 压缩ServiceWorker
(async () => {
  try {
    const minified = await terser.minify(swContent, {
      compress: {
        dead_code: true,
        drop_console: false,
        drop_debugger: true,
        keep_fnames: false,
        keep_infinity: true,
        passes: 2,
      },
      mangle: {
        properties: false,
      },
      output: {
        comments: false,
      },
    });

    // 写入压缩版本
    const swMinPath = path.join(targetDir, 'sw.min.js');
    fs.writeFileSync(swMinPath, minified.code);

    const originalSize = Buffer.byteLength(swContent, 'utf8') / 1024;
    const minifiedSize = Buffer.byteLength(minified.code, 'utf8') / 1024;

    console.log(chalk.green(`✓ ServiceWorker已生成`));
    console.log(`  - 未压缩: ${swPath} (${originalSize.toFixed(2)} KB)`);
    console.log(`  - 已压缩: ${swMinPath} (${minifiedSize.toFixed(2)} KB)`);
    console.log(
      `  - 压缩率: ${((1 - minifiedSize / originalSize) * 100).toFixed(2)}%`
    );
  } catch (error) {
    console.error(chalk.red(`✗ ServiceWorker压缩失败:`), error);
  }
})();
