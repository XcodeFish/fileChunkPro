/**
 * 错误处理系统模块导出
 * 提供统一的导入路径和向后兼容支持
 */

// 核心组件导出
export { ErrorCenter } from './ErrorCenter';
export { UploadError } from './UploadError';

// 从类型定义中导出错误类型
export { UploadErrorType, ErrorSeverity, ErrorGroup } from '../../types/errors';

// 子模块导出
export { ErrorContext, ErrorContextOptions } from './ErrorContext';
export {
  ErrorStorage,
  ErrorStorageOptions,
  ErrorQueryOptions,
  ErrorStats,
} from './ErrorStorage';
export { ErrorTelemetry, ErrorTelemetryOptions } from './ErrorTelemetry';
export { ErrorRecoveryManager } from './ErrorRecoveryManager';

// 错误处理策略导出
export {
  ErrorHandlerFactory,
  IErrorHandler,
  IHandlerSelector,
  BaseErrorHandler,
  NetworkErrorHandler,
  TimeoutErrorHandler,
  ServerErrorHandler,
  FileErrorHandler,
  DefaultErrorHandler,
} from './ErrorHandlerStrategy';

// 旧版兼容层 (为确保平滑迁移)
import { ErrorCenter } from './ErrorCenter';
import { EventBus } from '../EventBus';

/**
 * @deprecated 使用 ErrorCenter.getInstance() 替代
 */
export function createErrorCenter(eventBus?: EventBus, options?: any) {
  console.warn(
    'createErrorCenter 已废弃，请使用 ErrorCenter.getInstance() 替代'
  );
  return ErrorCenter.getInstance(options);
}
