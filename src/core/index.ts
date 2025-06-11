/**
 * 核心模块导出文件
 */

// 核心类导出
export { default as UploaderCore } from './UploaderCore';
export { EventBus } from './EventBus';
export { TaskScheduler } from './TaskScheduler';
export { PluginManager } from './PluginManager';
export { WorkerManager } from './WorkerManager';
export { ServiceWorkerManager } from './ServiceWorkerManager';
export { WorkerPoolManager } from './WorkerPoolManager';
export { DebugCenter } from './DebugCenter';
export { MonitoringSystem } from './MonitoringSystem';
export { NetworkManager } from './NetworkManager';
export { UploadStrategyManager } from './UploadStrategyManager';
export { FileManager } from './FileManager';
export { FileProcessor } from './FileProcessor';

// 依赖注入相关
export { DependencyContainer } from './DependencyContainer';
export { ServiceContainer } from './ServiceContainer';

// 错误处理系统新增导出
export { ErrorCenter } from './ErrorCenter';
export {
  WorkerErrorBridge,
  workerErrorBridge,
  safeWorkerExec,
  safeWorkerExecAsync,
} from './WorkerErrorBridge';
export {
  errorHandlingSystem,
  safeAsync,
  safeCallback,
} from './error/ErrorHandlingSystem';

// 降级处理系统导出
export {
  DegradationManager,
  degradationManager,
  withDegradation,
  DegradationLevel,
} from './DegradationManager';

// 版本信息
export const VERSION = '3.0.0';
