/**
 * 分片处理Worker
 * 负责文件分片的生成和处理
 */

// 导入任务处理器
import { fileProcessor } from './tasks/fileProcessor';
import { chunkCalculator } from './tasks/chunkCalculator';

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
      case 'CHUNK_FILE':
        handleChunkFile(payload, taskId);
        break;
      case 'CALCULATE_CHUNKS':
        calculateChunks(payload, taskId);
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
 * 处理文件分片任务
 */
function handleChunkFile(payload: any, taskId: string): void {
  const { file, chunkSize, chunkIndex } = payload;

  // 使用文件处理器来处理分片
  fileProcessor
    .processChunk(file, chunkSize, chunkIndex)
    .then((chunkData) => {
      self.postMessage(
        {
          result: chunkData,
          taskId,
        },
        [chunkData.data]
      );
    })
    .catch((error) => {
      self.postMessage({
        error: error instanceof Error ? error.message : String(error),
        taskId,
      });
    });
}

/**
 * 计算文件分片信息
 */
function calculateChunks(payload: any, taskId: string): void {
  const { fileSize, preferredChunkSize } = payload;

  // 使用分片计算器
  try {
    const chunks = chunkCalculator.calculateOptimalChunks(
      fileSize,
      preferredChunkSize
    );
    self.postMessage({
      result: chunks,
      taskId,
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      taskId,
    });
  }
}

// 通知主线程Worker已准备就绪
self.postMessage({ type: 'READY' }); 