/**
 * 通用类型定义
 */

/**
 * 任意对象类型
 */
export type AnyObject = Record<string, any>;

/**
 * 空对象类型
 */
export type EmptyObject = Record<string, never>;

/**
 * 可为空类型
 */
export type Nullable<T> = T | null;

/**
 * 可为空或未定义类型
 */
export type Optional<T> = T | null | undefined;

/**
 * 深度部分类型
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

/**
 * 深度只读类型
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P];
};

/**
 * 类型为函数的属性
 */
export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

/**
 * 类型为非函数的属性
 */
export type NonFunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

/**
 * 获取函数属性
 */
export type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

/**
 * 获取非函数属性
 */
export type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;

/**
 * 文件类型
 */
export interface AnyFile {
  /**
   * 文件名
   */
  name: string;
  
  /**
   * 文件大小
   */
  size: number;
  
  /**
   * 文件类型
   */
  type?: string;
  
  /**
   * 最后修改时间
   */
  lastModified?: number;
  
  /**
   * 任意其他属性
   */
  [key: string]: any;
}

/**
 * 识别ID类型
 */
export type Identifier = string | number;

/**
 * 环境标识
 */
export enum Environment {
  BROWSER = 'browser',
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  BYTEDANCE = 'bytedance',
  BAIDU = 'baidu',
  QQ = 'qq',
  TARO = 'taro',
  UNI_APP = 'uni-app',
  REACT_NATIVE = 'react-native',
  NODE = 'node',
  ELECTRON = 'electron',
  UNKNOWN = 'unknown'
}

/**
 * 网络质量
 */
export enum NetworkQuality {
  /**
   * 优秀
   */
  EXCELLENT = 'excellent',
  
  /**
   * 良好
   */
  GOOD = 'good',
  
  /**
   * 一般
   */
  NORMAL = 'normal',
  
  /**
   * 较差
   */
  POOR = 'poor',
  
  /**
   * 非常差
   */
  BAD = 'bad',
  
  /**
   * 离线
   */
  OFFLINE = 'offline'
}

/**
 * 内存趋势
 */
export enum MemoryTrend {
  /**
   * 稳定
   */
  STABLE = 'stable',
  
  /**
   * 上升中
   */
  INCREASING = 'increasing',
  
  /**
   * 下降中
   */
  DECREASING = 'decreasing',
  
  /**
   * 接近限制
   */
  NEAR_LIMIT = 'nearLimit',
  
  /**
   * 危险
   */
  CRITICAL = 'critical'
}

/**
 * 日志级别
 */
export enum LogLevel {
  /**
   * 调试
   */
  DEBUG = 'debug',
  
  /**
   * 信息
   */
  INFO = 'info',
  
  /**
   * 警告
   */
  WARN = 'warn',
  
  /**
   * 错误
   */
  ERROR = 'error',
  
  /**
   * 致命错误
   */
  FATAL = 'fatal',
  
  /**
   * 关闭日志
   */
  OFF = 'off'
} 