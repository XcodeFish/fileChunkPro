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

// 环境检测相关工具导出
export { default as WebViewDetector } from './WebViewDetector';
export { default as DeviceCapabilityDetector } from './DeviceCapabilityDetector';
export { default as EnvironmentFeatureDatabase } from './EnvironmentFeatureDatabase';
export { default as EnvironmentDetector } from './EnvironmentDetector';
export { default as EnvironmentDetectionSystem } from './EnvironmentDetectionSystem';
export { default as AdaptiveConfigManager } from './AdaptiveConfigManager';
export { default as FallbackStrategyManager } from './FallbackStrategyManager';
export { default as MiniProgramOptimizer } from './MiniProgramOptimizer';

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

// WebView检测相关类型导出
export type {
  WebViewInfo,
  WebViewType,
  WebViewEngine,
  WebViewLimitation,
} from './WebViewDetector';

// 设备能力检测相关类型导出
export type {
  DeviceMemoryInfo,
  ProcessorInfo,
  DeviceProfile,
} from './DeviceCapabilityDetector';

// 环境特性数据库相关类型导出
export type {
  EnvironmentFeatureData,
  FeatureSupportInfo,
  VersionFeatureData,
} from './EnvironmentFeatureDatabase';

// 自适应配置类型导出
export type {
  FeatureType,
  DegradationLevel,
  DegradationReason,
  FallbackState,
  FallbackStrategyConfig,
  FallbackResult,
} from './FallbackStrategyManager';

// 小程序优化器类型导出
export type {
  MiniProgramPlatform,
  ApiCompatMap,
  MiniProgramLimitation,
  MiniProgramRecommendation,
} from './MiniProgramOptimizer';

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
