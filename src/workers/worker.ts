/**
 * Worker主脚本
 * 处理来自主线程的消息并执行对应操作
 */

import { calculateChunks } from './tasks/chunkCalculator';
import { calculateHash } from './tasks/hashCalculator';
import { processFile } from './tasks/fileProcessor';

// 任务类型
type TaskType = 'calculateChunks' | 'calculateHash' | 'processFile' | 'ping';

// Worker状态
type WorkerState = 'idle' | 'busy' | 'error';

// 当前状态
let currentState: WorkerState = 'idle';
let currentTaskId: string | null = null;
let taskStartTime: number = 0;
let totalTasksProcessed = 0;
let totalErrors = 0;
let lastMemoryUsage = 0;

// 性能监控间隔
const PERFORMANCE_CHECK_INTERVAL = 10000; // 10秒

/**
 * 任务处理方法映射
 */
const taskHandlers: Record<string, (data: any) => Promise<any> | any> = {
  /**
   * 计算文件分片
   */
  calculateChunks,
  
  /**
   * 计算文件哈希
   */
  calculateHash,
  
  /**
   * 处理文件数据
   */
  processFile,
  
  /**
   * 处理ping请求
   */
  ping: () => ({
    timestamp: Date.now(),
    state: currentState,
    memory: getMemoryUsage(),
    stats: {
      totalTasksProcessed,
      totalErrors,
      uptime: Date.now() - (self as any).startTime,
    }
  })
};

/**
 * 获取内存使用情况
 */
function getMemoryUsage(): any {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const memory = (performance as any).memory;
    lastMemoryUsage = memory?.usedJSHeapSize || 0;
    return {
      total: memory?.totalJSHeapSize || 0,
      used: memory?.usedJSHeapSize || 0,
      limit: memory?.jsHeapSizeLimit || 0,
      usageRatio: memory?.usedJSHeapSize ? memory.usedJSHeapSize / memory.jsHeapSizeLimit : 0
    };
  }
  
  return { used: lastMemoryUsage };
}

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
 * 发送状态信息
 */
function sendStatus() {
  self.postMessage({
    type: 'STATUS',
    status: currentState,
    memory: getMemoryUsage(),
    stats: {
      totalTasksProcessed,
      totalErrors,
      uptime: Date.now() - (self as any).startTime,
      currentTaskId,
      taskElapsedTime: currentTaskId ? Date.now() - taskStartTime : 0
    }
  });
}

/**
 * 设置状态
 */
function setState(state: WorkerState) {
  currentState = state;
}

/**
 * 初始化Worker
 */
function initWorker() {
  // 记录启动时间
  (self as any).startTime = Date.now();
  
  // 发送就绪消息
  self.postMessage({ type: 'READY' });
  
  // 设置周期性状态报告
  setInterval(() => {
    sendStatus();
  }, PERFORMANCE_CHECK_INTERVAL);
  
  // 处理未捕获异常
  self.addEventListener('unhandledrejection', event => {
    totalErrors++;
    self.postMessage({
      type: 'ERROR',
      error: event.reason?.toString() || '未知Promise异常'
    });
  });
}

/**
 * 消息处理函数
 */
self.onmessage = async function(event) {
  try {
    const message = event.data;
    
    // 处理特殊控制消息
    if (message.action) {
      switch (message.action) {
        case 'ping':
          self.postMessage({ 
            type: 'PONG', 
            timestamp: Date.now(),
            memory: getMemoryUsage()
          });
          return;
          
        case 'status':
          sendStatus();
          return;
          
        case 'terminate':
          // 清理资源后通知准备终止
          self.postMessage({ type: 'TERMINATE_ACK' });
          return;
          
        default:
          break;
      }
    }
    
    // 处理常规任务
    const { taskId, type, data } = message;
    
    if (!taskId) {
      throw new Error('缺少任务ID');
    }
    
    if (!type) {
      throw new Error('缺少任务类型');
    }
    
    // 更新状态
    setState('busy');
    currentTaskId = taskId;
    taskStartTime = Date.now();
    
    try {
      // 检查任务类型是否支持
      if (!(type in taskHandlers)) {
        throw new Error(`不支持的任务类型: ${type}`);
      }

      // 执行对应的任务处理器
      const handler = taskHandlers[type];
      const result = await handler(data);
      
      // 任务完成
      totalTasksProcessed++;
      
      // 发送成功响应
      self.postMessage({
        taskId,
        success: true,
        result,
        performance: {
          duration: Date.now() - taskStartTime,
          memory: getMemoryUsage()
        }
      });
    } catch (error) {
      // 记录错误
      totalErrors++;
      
      // 发送错误响应
      self.postMessage({
        taskId,
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        performance: {
          duration: Date.now() - taskStartTime,
          memory: getMemoryUsage()
        }
      });
    } finally {
      // 重置状态
      setState('idle');
      currentTaskId = null;
    }
  } catch (error) {
    // 处理消息处理器本身的错误
    totalErrors++;
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : '消息处理失败'
    });
    setState('error');
  }
};

/**
 * 错误处理
 */
self.onerror = function(error) {
  totalErrors++;
  
  // 由于 onerror 没有消息上下文，
  // 所以我们向主线程发送一个通用错误通知
  self.postMessage({
    type: 'ERROR',
    error: error instanceof Error ? error.message : '全局错误',
    detail: error
  });
  
  setState('error');
  
  return true; // 防止默认处理
};

// 初始化Worker
initWorker(); 