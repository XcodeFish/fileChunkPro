/**
 * Worker主脚本
 * 处理来自主线程的消息并执行对应操作
 */

// 任务类型
type TaskType = 'calculateChunks' | 'calculateHash' | 'processFile';

/**
 * 任务处理方法
 */
const taskHandlers = {
  /**
   * 计算文件分片
   */
  calculateChunks: (data: { fileSize: number; chunkSize: number }) => {
    const { fileSize, chunkSize } = data;
    
    // 参数验证
    if (typeof fileSize !== 'number' || fileSize <= 0) {
      throw new Error('无效的文件大小');
    }
    
    if (typeof chunkSize !== 'number' || chunkSize <= 0) {
      throw new Error('无效的分片大小');
    }
    
    // 计算分片
    const chunks = [];
    for (let start = 0; start < fileSize; start += chunkSize) {
      const end = Math.min(start + chunkSize, fileSize);
      chunks.push({
        index: chunks.length,
        start,
        end,
        size: end - start,
        fileSize
      });
    }
    
    return chunks;
  },
  
  /**
   * 计算文件哈希
   */
  calculateHash: async (data: { fileData: ArrayBuffer | Uint8Array; algorithm?: string }) => {
    const { fileData, algorithm = 'SHA-256' } = data;
    
    // 参数验证
    if (!fileData || !(fileData instanceof ArrayBuffer || fileData instanceof Uint8Array)) {
      throw new Error('无效的文件数据');
    }
    
    try {
      // 使用Web Crypto API计算哈希
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // 确保数据是正确的类型
        const buffer = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
        
        // 计算哈希
        const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
        
        // 将ArrayBuffer转换为十六进制字符串
        return Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } 
      // 浏览器不支持Web Crypto API，使用简单哈希算法
      else {
        console.warn('Web Crypto API不可用，使用简单哈希算法');
        return simpleHash(fileData);
      }
    } catch (error) {
      console.error('哈希计算失败:', error);
      // 回退到简单哈希
      return simpleHash(fileData);
    }
  },
  
  /**
   * 处理文件数据
   */
  processFile: async (data: { 
    fileData: ArrayBuffer | Uint8Array;
    operation: string;
    options?: Record<string, any>;
  }) => {
    const { fileData, operation, options = {} } = data;
    
    // 参数验证
    if (!fileData || !(fileData instanceof ArrayBuffer || fileData instanceof Uint8Array)) {
      throw new Error('无效的文件数据');
    }
    
    if (!operation) {
      throw new Error('未指定操作类型');
    }
    
    // 根据操作类型进行不同处理
    try {
      switch (operation) {
        case 'compress': 
          return {
            success: true,
            data: {
              compressedSize: Math.round((fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)).length * 0.6),
              originalSize: (fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)).length,
              compressionRatio: 0.6 // 模拟60%的压缩率
            }
          };
          
        case 'encrypt':
          return {
            success: true,
            data: {
              encryptedSize: (fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)).length + 16,
              originalSize: (fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)).length
            }
          };
          
        default:
          throw new Error(`不支持的操作: ${operation}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '处理文件时出错'
      };
    }
  }
};

/**
 * 简单哈希算法（当Web Crypto API不可用时的回退方案）
 */
function simpleHash(data: ArrayBuffer | Uint8Array): string {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  
  // 每512字节采样一次以提高性能
  const step = Math.max(1, Math.floor(view.length / 2048));
  
  for (let i = 0; i < view.length; i += step) {
    const val = view[i];
    h1 = Math.imul(h1 ^ val, 2654435761);
    h2 = Math.imul(h2 ^ val, 1597334677);
  }
  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(16, '0');
}

/**
 * 消息处理函数
 */
self.onmessage = async function(event) {
  const { taskId, type, data } = event.data;
  
  try {
    // 检查任务类型是否支持
    if (!type || !(type in taskHandlers)) {
      throw new Error(`不支持的任务类型: ${type}`);
    }

    // 执行对应的任务处理器
    const handler = taskHandlers[type as keyof typeof taskHandlers];
    const result = await handler(data);
    
    // 发送成功响应
    self.postMessage({
      taskId,
      success: true,
      result
    });
  } catch (error) {
    // 发送错误响应
    self.postMessage({
      taskId,
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    });
  }
};

/**
 * 错误处理
 */
self.onerror = function(error) {
  console.error('Worker 错误:', error);
  
  // 由于 onerror 没有消息上下文，
  // 所以我们向主线程发送一个通用错误通知
  self.postMessage({
    taskId: 'global_error',
    success: false,
    error: error instanceof Error ? error.message : '未知Worker错误'
  });
};

// 通知主线程我们已准备就绪
self.postMessage({
  taskId: 'worker_init',
  success: true,
  result: { initialized: true, supportedTasks: Object.keys(taskHandlers) }
}); 