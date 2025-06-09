/**
 * worker.ts
 * 通用Worker基础类型和工具
 */

// 导入模块
// @ts-ignore - 这些导入将在未来版本中使用
import { chunkCalculator } from './tasks/chunkCalculator';
// @ts-ignore - 这些导入将在未来版本中使用
import { hashCalculator } from './tasks/hashCalculator';
import { processFile } from './tasks/fileProcessor';

// 定义Worker状态类型
type WorkerState = 'idle' | 'busy' | 'error';

// 定义Worker消息类型
export interface WorkerMessage {
  taskId: string;
  type: string;
  data: any;
}

// 定义Worker响应类型
export interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
}

// 定义Worker配置类型
export interface WorkerConfig {
  maxMemory?: number;
  logLevel?: string;
  maxTasks?: number;
}

// 性能监控间隔
const PERFORMANCE_CHECK_INTERVAL = 10000; // 10秒

// 当前状态
let currentState: WorkerState = 'idle';
let currentTaskId: string | null = null;
let taskStartTime = 0;
let totalTasksProcessed = 0;
let totalErrors = 0;
let lastMemoryUsage = 0;

// 任务处理器
const taskHandlers: Record<string, (data: any) => Promise<any>> = {
  // 分片计算任务
  calculateChunks: async (data: any) => {
    return chunkCalculator.calculateChunks(data);
  },
  
  // 哈希计算任务
  calculateHash: async (data: any) => {
    return hashCalculator.calculateHash(data);
  },
  
  // 文件处理任务
  processFile,
  
  // 测试任务
  ping: async () => {
    return { pong: true, timestamp: Date.now() };
  }
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