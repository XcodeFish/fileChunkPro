/**
 * ChunkWorker.ts
 * 文件分片处理Worker
 */

// 导入任务处理函数
import { chunkCalculator } from './tasks/chunkCalculator';

// 监听消息
self.addEventListener('message', (event) => {
  const { taskId, type, data } = event.data;

  // 根据任务类型处理
  switch (type) {
    case 'calculateChunks':
      handleCalculateChunks(taskId, data);
      break;
    case 'processFile':
      handleProcessFile(taskId, data);
      break;
    case 'ping':
      handlePing(taskId);
      break;
    default:
      sendError(taskId, `未知任务类型: ${type}`);
  }
});

/**
 * 处理分片计算任务
 */
function handleCalculateChunks(taskId: string, data: any): void {
  try {
    // 执行分片计算
    const chunks = chunkCalculator.calculateChunks(data);
    
    // 发送结果
    sendSuccess(taskId, chunks);
  } catch (error) {
    sendError(taskId, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 处理文件处理任务
 */
function handleProcessFile(taskId: string, data: any): void {
  // 模拟文件处理
  setTimeout(() => {
    try {
      // 这里可以添加实际的文件处理逻辑
      const result = {
        processed: true,
        chunks: data.chunkSize ? Math.ceil(data.fileSize / data.chunkSize) : 0,
        timestamp: Date.now()
      };
      
      sendSuccess(taskId, result);
    } catch (error) {
      sendError(taskId, error instanceof Error ? error.message : String(error));
    }
  }, 100); // 模拟处理时间
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