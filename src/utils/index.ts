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
export { default as SecurityUtils } from './SecurityUtils';
export { default as ContentValidator } from './ContentValidator';
export { default as CSRFProtection } from './CSRFProtection';
export { default as IntegrityCheck } from './IntegrityCheck';

// Web标准相关工具导出
export { WebStandardDetector } from './WebStandardDetector';
export { WebStandardValidator } from './WebStandardValidator';
export { BrowserCompatibilityTester } from './BrowserCompatibilityTester';
export { PerformanceBenchmark } from './PerformanceBenchmark';

export type { SecurityErrorOptions } from './SecurityError';
export type { FileContentDetectionResult } from './FileContentDetector';
export type {
  PermissionCheckOptions,
  PermissionCheckResult,
} from './PermissionChecker';
export type {
  HashAlgorithm,
  EncryptionAlgorithm,
  EncryptionConfig,
  HashResult,
  EncryptionResult,
} from './SecurityUtils';
export type { CSRFTokenOptions } from './CSRFProtection';
export type {
  IntegrityAlgorithm,
  IntegrityCheckOptions,
  IntegrityCheckResult,
  IntegrityCheckStatus,
} from './IntegrityCheck';

// Web标准相关类型导出
export type {
  IFeatureSupport,
  IWebStandardSupport,
} from './WebStandardDetector';
export type {
  IComplianceResult,
  IComplianceIssue,
  IValidationOptions,
} from './WebStandardValidator';
export type {
  IBrowserInfo,
  ICompatibilityTestResult,
  ITestFailure,
  ITestCase,
} from './BrowserCompatibilityTester';
export type {
  IBenchmarkResult,
  IBenchmarkSuite,
  IBenchmarkOptions,
  IBenchmarkSuiteResult,
  IBenchmarkComparisonResult,
} from './PerformanceBenchmark';
