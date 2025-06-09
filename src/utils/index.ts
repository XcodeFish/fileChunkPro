/**
 * 工具函数导出入口
 */

export { default as PerformanceMonitor } from './PerformanceMonitor';
export { default as PerformanceCollector } from './PerformanceCollector';
export { default as MemoryManager } from './MemoryManager';
export { default as Logger } from './Logger';
export { default as NetworkDetector } from './NetworkDetector';
export { default as NetworkQuality } from './NetworkQuality';
export { default as StorageUtils } from './StorageUtils';
export { default as EnvUtils } from './EnvUtils';
export {
  MD5,
  HashCalculator,
  FileFingerprint,
  FingerprintOptions,
  FingerprintResult,
} from './HashUtils';

// 安全相关工具导出
export { default as SecurityError } from './SecurityError';
export { default as FileContentDetector } from './FileContentDetector';
export { default as PermissionChecker } from './PermissionChecker';
export type { SecurityErrorOptions } from './SecurityError';
export type { FileContentDetectionResult } from './FileContentDetector';
export type {
  PermissionCheckOptions,
  PermissionCheckResult,
} from './PermissionChecker';
