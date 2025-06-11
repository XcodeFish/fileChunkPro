/**
 * 副作用管理系统的类型定义
 */

/**
 * 副作用类型枚举
 */
export enum EffectType {
  /**
   * 网络请求
   */
  NETWORK_REQUEST = 'NETWORK_REQUEST',
  
  /**
   * 文件系统操作
   */
  FILE_SYSTEM = 'FILE_SYSTEM',
  
  /**
   * 本地存储操作
   */
  STORAGE = 'STORAGE',
  
  /**
   * Worker线程操作
   */
  WORKER = 'WORKER',
  
  /**
   * 定时器操作
   */
  TIMER = 'TIMER',
  
  /**
   * 事件监听操作
   */
  EVENT_LISTENER = 'EVENT_LISTENER',
  
  /**
   * DOM操作
   */
  DOM = 'DOM',
  
  /**
   * 日志操作
   */
  LOGGING = 'LOGGING',
  
  /**
   * 环境交互
   */
  ENVIRONMENT = 'ENVIRONMENT',
  
  /**
   * 其他操作
   */
  OTHER = 'OTHER'
}

/**
 * 副作用状态枚举
 */
export enum EffectStatus {
  /**
   * 已创建但未执行
   */
  CREATED = 'CREATED',
  
  /**
   * 正在执行中
   */
  RUNNING = 'RUNNING',
  
  /**
   * 已完成
   */
  COMPLETED = 'COMPLETED',
  
  /**
   * 已取消
   */
  CANCELLED = 'CANCELLED',
  
  /**
   * 执行失败
   */
  FAILED = 'FAILED'
}

/**
 * 副作用优先级枚举
 */
export enum EffectPriority {
  /**
   * 高优先级 - 立即执行
   */
  HIGH = 'HIGH',
  
  /**
   * 中优先级 - 常规执行
   */
  NORMAL = 'NORMAL',
  
  /**
   * 低优先级 - 空闲时执行
   */
  LOW = 'LOW'
}

/**
 * 资源类型枚举
 */
export enum ResourceType {
  /**
   * Worker线程
   */
  WORKER = 'WORKER',
  
  /**
   * XHR请求
   */
  XHR = 'XHR',
  
  /**
   * Fetch请求
   */
  FETCH = 'FETCH',
  
  /**
   * 定时器
   */
  TIMER = 'TIMER',
  
  /**
   * 事件监听器
   */
  EVENT_LISTENER = 'EVENT_LISTENER',
  
  /**
   * 文件句柄
   */
  FILE_HANDLE = 'FILE_HANDLE',
  
  /**
   * 其他资源
   */
  OTHER = 'OTHER'
}

/**
 * 副作用元数据
 */
export interface EffectMetadata {
  /**
   * 副作用创建时间
   */
  createdAt: number;
  
  /**
   * 副作用开始执行时间
   */
  startedAt?: number;
  
  /**
   * 副作用完成时间
   */
  completedAt?: number;
  
  /**
   * 副作用执行耗时（毫秒）
   */
  duration?: number;
  
  /**
   * 副作用执行所在的模块
   */
  module: string;
  
  /**
   * 关联的文件ID（如有）
   */
  fileId?: string;
  
  /**
   * 相关任务ID（如有）
   */
  taskId?: string;
  
  /**
   * 执行上下文
   */
  context?: Record<string, any>;
  
  /**
   * 重试次数
   */
  retries?: number;
  
  /**
   * 最大重试次数
   */
  maxRetries?: number;
}

/**
 * 副作用资源实例
 */
export interface EffectResource {
  /**
   * 资源类型
   */
  type: ResourceType;
  
  /**
   * 资源唯一标识
   */
  id: string;
  
  /**
   * 资源实例
   */
  instance: any;
  
  /**
   * 资源释放函数
   */
  dispose: () => void;
  
  /**
   * 资源元数据
   */
  metadata?: Record<string, any>;
}

/**
 * 副作用配置选项
 */
export interface EffectOptions {
  /**
   * 副作用ID
   */
  id?: string;
  
  /**
   * 副作用类型
   */
  type: EffectType;
  
  /**
   * 副作用优先级
   */
  priority?: EffectPriority;
  
  /**
   * 最大重试次数
   */
  maxRetries?: number;
  
  /**
   * 超时时间（毫秒）
   */
  timeout?: number;
  
  /**
   * 自动资源清理
   */
  autoCleanup?: boolean;
  
  /**
   * 副作用元数据
   */
  metadata?: Partial<EffectMetadata>;
  
  /**
   * 取消标记检查函数
   */
  shouldCancel?: () => boolean;
  
  /**
   * 可选的父级副作用ID
   */
  parentId?: string;
  
  /**
   * 依赖的副作用ID列表
   */
  dependsOn?: string[];
  
  /**
   * 副作用完成回调
   */
  onComplete?: (result: any) => void;
  
  /**
   * 副作用错误回调
   */
  onError?: (error: Error) => void;
  
  /**
   * 副作用取消回调
   */
  onCancel?: () => void;
  
  /**
   * 是否启用自动重试
   */
  autoRetry?: boolean;
}

/**
 * 副作用执行结果
 */
export interface EffectResult<T = any> {
  /**
   * 副作用ID
   */
  id: string;
  
  /**
   * 执行状态
   */
  status: EffectStatus;
  
  /**
   * 执行结果数据
   */
  data?: T;
  
  /**
   * 错误信息（如果有）
   */
  error?: Error;
  
  /**
   * 元数据
   */
  metadata: EffectMetadata;
  
  /**
   * 资源列表
   */
  resources: EffectResource[];
}

/**
 * 副作用执行函数接口
 */
export interface EffectExecutor<T = any> {
  /**
   * 执行副作用
   * @param signal - 取消信号
   * @param metadata - 副作用元数据
   * @param register - 资源注册函数
   * @returns 执行结果
   */
  (
    signal: AbortSignal,
    metadata: EffectMetadata,
    register: (resource: EffectResource) => void
  ): Promise<T>;
}

/**
 * 副作用接口
 */
export interface IEffect<T = any> {
  /**
   * 副作用ID
   */
  readonly id: string;
  
  /**
   * 副作用类型
   */
  readonly type: EffectType;
  
  /**
   * 副作用优先级
   */
  readonly priority: EffectPriority;
  
  /**
   * 当前状态
   */
  readonly status: EffectStatus;
  
  /**
   * 元数据
   */
  readonly metadata: EffectMetadata;
  
  /**
   * 执行副作用
   * @returns 执行结果Promise
   */
  execute(): Promise<EffectResult<T>>;
  
  /**
   * 取消副作用执行
   */
  cancel(): void;
  
  /**
   * 添加依赖副作用
   * @param effectId - 依赖的副作用ID
   */
  addDependency(effectId: string): void;
  
  /**
   * 获取资源列表
   * @returns 资源列表
   */
  getResources(): EffectResource[];
  
  /**
   * 释放所有资源
   */
  dispose(): void;
} 