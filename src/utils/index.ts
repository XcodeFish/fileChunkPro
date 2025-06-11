/**
 * utils/index.ts
 * 导出工具函数和类
 */

// 日志
export { Logger } from './Logger';

// 环境检测相关
export { EnvUtils } from './EnvUtils';
export { EnvironmentDetector } from './EnvironmentDetector';
export { EnhancedEnvironmentDetector } from './EnhancedEnvironmentDetector';
export { EnvironmentDetectorFactory } from './EnvironmentDetectorFactory';
export { DeviceCapabilityDetector } from './DeviceCapabilityDetector';
export { WebViewDetector } from './WebViewDetector';
export { default as EnvironmentFeatureDatabase } from './EnvironmentFeatureDatabase';
export { default as EnvironmentDetectionSystem } from './EnvironmentDetectionSystem';

// 工作线程和性能管理
export { ThreadWorker } from './ThreadWorker';
export { JobScheduler } from './JobScheduler';
export { MemoryManager } from './MemoryManager';
export { PerformanceMonitor } from './PerformanceMonitor';

// 文件处理和加密
export { FileUtils } from './FileUtils';
export { HashCalculator } from './HashCalculator';
export { SecurityUtils } from './SecurityUtils';
export { CryptoProvider } from './CryptoProvider';

// 网络
export { NetworkDetector } from './NetworkDetector';
export { ConnectionMonitor } from './ConnectionMonitor';
export { RequestManager } from './RequestManager';

// 其他工具函数
export { default as CommonUtils } from './CommonUtils';
export { default as TimeUtils } from './TimeUtils';
export { default as ObjectUtils } from './ObjectUtils';
export { default as PathUtils } from './PathUtils';
export { default as MimeTypeUtils } from './MimeTypeUtils';
export { MiniProgramOptimizer } from './MiniProgramOptimizer';

// 预测器
export * from '../predictors/NetworkTrendPredictor';
export * from '../predictors/TimeSeriesPredictor';
