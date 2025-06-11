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

import { WorkerErrorBridge } from '../core/WorkerErrorBridge';

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

// Worker类型标识
const WORKER_TYPE = self.name || 'generic';

// 全局错误处理器
const handleError = WorkerErrorBridge.createWorkerErrorHandler(WORKER_TYPE);

// 设置全局未捕获错误处理
self.addEventListener('error', (event) => {
  handleError(event.error || new Error('Worker全局错误'), 'global');
  event.preventDefault();
});

// 设置未捕获的Promise错误处理
self.addEventListener('unhandledrejection', (event) => {
  handleError(event.reason || new Error('Worker未处理的Promise拒绝'), 'promise');
  event.preventDefault();
});

// 安全执行函数
function safeExec<T>(fn: () => T, taskId?: string): T {
  try {
    return fn();
  } catch (error) {
    handleError(error, taskId);
    throw error;
  }
}

// 安全异步执行函数
async function safeExecAsync<T>(fn: () => Promise<T>, taskId?: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, taskId);
    throw error;
  }
}

// 任务处理器
const taskHandlers: Record<string, (data: any) => any> = {
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
 * 注册任务处理器
 * @param type 任务类型
 * @param handler 处理函数
 */
export function registerTaskHandler(type: string, handler: (data: any) => any): void {
  taskHandlers[type] = handler;
}

// 性能监控数据
let performanceData = {
  taskCount: 0,
  successCount: 0,
  errorCount: 0,
  totalTaskTime: 0,
  avgTaskTime: 0,
  memoryUsage: {} as any
};

/**
 * 更新性能监控数据
 */
function updatePerformanceData(success: boolean, duration: number): void {
  performanceData.taskCount++;
  if (success) {
    performanceData.successCount++;
  } else {
    performanceData.errorCount++;
  }
  
  performanceData.totalTaskTime += duration;
  performanceData.avgTaskTime = performanceData.totalTaskTime / performanceData.taskCount;
  
  // 尝试获取内存使用情况
  try {
    if ((self as any).performance && (self as any).performance.memory) {
      performanceData.memoryUsage = {
        jsHeapSizeLimit: (self as any).performance.memory.jsHeapSizeLimit,
        totalJSHeapSize: (self as any).performance.memory.totalJSHeapSize,
        usedJSHeapSize: (self as any).performance.memory.usedJSHeapSize
      };
    }
  } catch (e) {
    // 忽略错误
  }
}

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
 * 处理来自主线程的消息
 */
self.addEventListener('message', async (event) => {
  const { action, taskId, data } = event.data;
  
  try {
    switch (action) {
      case 'ping': {
        // 响应ping请求
        self.postMessage({
          action: 'pong',
          timestamp: Date.now()
        });
        break;
      }
      
      case 'terminate': {
        // 安全终止
        self.postMessage({ action: 'terminating', workerId: WORKER_TYPE });
        setTimeout(() => self.close(), 100);
        break;
      }
      
      case 'getStatus': {
        // 返回状态信息
        self.postMessage({
          action: 'status',
          workerId: WORKER_TYPE,
          status: 'active',
          performance: performanceData
        });
        break;
      }
      
      case 'task': {
        // 处理任务
        if (!taskId) {
          throw new Error('任务ID缺失');
        }
        
        const { type, ...taskData } = data;
        
        if (!type || !taskHandlers[type]) {
          throw new Error(`未知任务类型: ${type}`);
        }
        
        const startTime = performance.now();
        
        try {
          // 安全执行任务处理器
          const result = await safeExecAsync(
            () => Promise.resolve(taskHandlers[type](taskData)),
            taskId
          );
          
          const endTime = performance.now();
          const duration = endTime - startTime;
          
          // 更新性能数据
          updatePerformanceData(true, duration);
          
          // 发送成功结果
          self.postMessage({
            action: 'result',
            taskId,
            success: true,
            result,
            duration
          });
        } catch (error) {
          const endTime = performance.now();
          const duration = endTime - startTime;
          
          // 更新性能数据
          updatePerformanceData(false, duration);
          
          // 发送错误结果
          const errorData = handleError(error, taskId);
          
          self.postMessage({
            action: 'result',
            taskId,
            success: false,
            error: errorData,
            duration
          });
        }
        break;
      }
      
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (error) {
    // 处理元操作错误
    const errorData = handleError(error, taskId || 'meta');
    
    self.postMessage({
      action: 'error',
      taskId: taskId || 'meta',
      error: errorData
    });
  }
});

// 初始化完成通知
self.postMessage({ action: 'ready', workerId: WORKER_TYPE });

// 导出工具函数
export { safeExec, safeExecAsync, handleError };

// 初始化Worker
initWorker(); 