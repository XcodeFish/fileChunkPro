/**
 * 哈希计算Worker
 * 负责文件和分片的哈希计算
 */

// 导入哈希计算器
import { hashCalculator } from './tasks/hashCalculator';

// 定义消息类型
interface WorkerMessage {
  type: string;
  payload: any;
  taskId: string;
}

/**
 * 响应主线程消息
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, taskId } = event.data;

  try {
    switch (type) {
      case 'CALCULATE_HASH':
        calculateHash(payload, taskId);
        break;
      case 'CALCULATE_CHUNK_HASH':
        calculateChunkHash(payload, taskId);
        break;
      default:
        self.postMessage({
          error: `未知的任务类型: ${type}`,
          taskId,
        });
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      taskId,
    });
  }
};

/**
 * 计算文件哈希
 */
function calculateHash(payload: any, taskId: string): void {
  const { file, algorithm = 'md5' } = payload;

  hashCalculator
    .calculateFileHash(file, algorithm)
    .then((hash) => {
      self.postMessage({
        result: hash,
        taskId,
      });
    })
    .catch((error) => {
      self.postMessage({
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
    });
}

/**
 * 计算分片哈希
 */
function calculateChunkHash(payload: any, taskId: string): void {
  const { chunk, algorithm = 'md5' } = payload;

  hashCalculator
    .calculateChunkHash(chunk, algorithm)
    .then((hash) => {
      self.postMessage({
        result: hash,
        taskId,
      });
    })
    .catch((error) => {
      self.postMessage({
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
    });
}

// 通知主线程Worker已准备就绪
self.postMessage({ type: 'READY' }); 