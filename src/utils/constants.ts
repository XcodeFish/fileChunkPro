/**
 * 环境常量定义
 */

/**
 * 支持的目标环境
 */
export const TARGETS = {
  BROWSER: 'browser',
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
  BYTEDANCE: 'bytedance',
  BAIDU: 'baidu',
  TARO: 'taro',
  UNIAPP: 'uni-app',
} as const;

/**
 * 支持的安全级别
 */
export const SECURITY_LEVELS = {
  BASIC: 'basic',
  STANDARD: 'standard',
  ADVANCED: 'advanced',
} as const;

/**
 * 分片大小常量（以字节为单位）
 */
export const CHUNK_SIZES = {
  SMALL: 1024 * 1024, // 1MB
  MEDIUM: 2 * 1024 * 1024, // 2MB
  LARGE: 5 * 1024 * 1024, // 5MB
} as const;

/**
 * 适配器类型
 */
export const ADAPTER_TYPES = {
  HTTP: 'http',
  FILE: 'file',
  STORAGE: 'storage',
} as const;

/**
 * 文件哈希算法
 */
export const HASH_ALGORITHMS = {
  MD5: 'md5',
  SHA1: 'sha1',
  SHA256: 'sha256',
} as const;

/**
 * 上传状态
 */
export const UPLOAD_STATUS = {
  PENDING: 'pending',
  HASHING: 'hashing',
  UPLOADING: 'uploading',
  PAUSED: 'paused',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELED: 'canceled',
} as const;

/**
 * 事件类型
 */
export const EVENT_TYPES = {
  PROGRESS: 'progress',
  SUCCESS: 'success',
  ERROR: 'error',
  ABORT: 'abort',
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  RETRY: 'retry',
  CHUNK_SUCCESS: 'chunkSuccess',
  CHUNK_ERROR: 'chunkError',
  HASH_PROGRESS: 'hashProgress',
} as const;

/**
 * 错误码
 */
export const ERROR_CODES = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  ABORTED: 'ABORTED',
  UNSUPPORTED_ENVIRONMENT: 'UNSUPPORTED_ENVIRONMENT',
} as const;
