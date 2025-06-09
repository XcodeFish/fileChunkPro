/**
 * HashWorker.ts
 * 哈希计算Worker
 */

// 导入哈希计算函数
import { hashCalculator } from './tasks/hashCalculator';

// 监听消息
self.addEventListener('message', (event) => {
  const { taskId, type, data } = event.data;

  // 根据任务类型处理
  switch (type) {
    case 'calculateHash':
      handleCalculateHash(taskId, data);
      break;
    case 'calculateFileHash':
      handleCalculateFileHash(taskId, data);
      break;
    case 'ping':
      handlePing(taskId);
      break;
    default:
      sendError(taskId, `未知任务类型: ${type}`);
  }
});

/**
 * 处理哈希计算任务
 */
function handleCalculateHash(taskId: string, data: any): void {
  // 执行哈希计算
  hashCalculator.calculateHash(data)
    .then((hash) => {
      // 发送结果
      sendSuccess(taskId, { hash });
    })
    .catch((error) => {
      sendError(taskId, error instanceof Error ? error.message : String(error));
    });
}

/**
 * 处理文件哈希计算任务
 */
function handleCalculateFileHash(taskId: string, data: any): void {
  // 执行文件哈希计算
  hashCalculator.calculateHash(data)
    .then((hash) => {
      // 发送结果
      sendSuccess(taskId, { 
        hash,
        fileId: data.fileId,
        timestamp: Date.now()
      });
    })
    .catch((error) => {
      sendError(taskId, error instanceof Error ? error.message : String(error));
    });
}

/**
 * 处理ping请求
 */
function handlePing(taskId: string): void {
  sendSuccess(taskId, { status: 'ok', timestamp: Date.now() });
}

/**
 * 发送成功响应
 */
function sendSuccess(taskId: string, result: any): void {
  self.postMessage({
    taskId,
    success: true,
    result
  });
}

/**
 * 发送错误响应
 */
function sendError(taskId: string, error: string): void {
  self.postMessage({
    taskId,
    success: false,
    error
  });
}

// 发送就绪消息
self.postMessage({ type: 'READY' }); 