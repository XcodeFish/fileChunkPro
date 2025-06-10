/**
 * 核心模块导出
 */

import { UploaderCore } from './UploaderCore';
import { EventBus } from './EventBus';
import { ErrorCenter } from './ErrorCenter';
import { FileProcessor } from './FileProcessor';
import { NetworkManager } from './NetworkManager';
import { UploadStrategyManager } from './UploadStrategyManager';
import { TaskScheduler } from './TaskScheduler';
import { WorkerManager } from './WorkerManager';
import { PluginManager } from './PluginManager';
import { DependencyContainer } from './DependencyContainer';

// 导出所有核心模块
export {
  UploaderCore,
  EventBus,
  ErrorCenter,
  FileProcessor,
  NetworkManager,
  UploadStrategyManager,
  TaskScheduler,
  WorkerManager,
  PluginManager,
  DependencyContainer,
};

// 导出默认实例
export default UploaderCore;
