/**
 * 任务优先级枚举
 */
export enum TaskPriority {
  /**
   * 低优先级
   */
  LOW = 'low',

  /**
   * 普通优先级（默认）
   */
  NORMAL = 'normal',

  /**
   * 高优先级
   */
  HIGH = 'high',

  /**
   * 最高优先级（紧急）
   */
  CRITICAL = 'critical'
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  /**
   * 等待中
   */
  PENDING = 'pending',

  /**
   * 运行中
   */
  RUNNING = 'running',

  /**
   * 已完成
   */
  COMPLETED = 'completed',

  /**
   * 已失败
   */
  FAILED = 'failed',

  /**
   * 已取消
   */
  CANCELLED = 'cancelled',

  /**
   * 已暂停
   */
  PAUSED = 'paused'
}

/**
 * 任务类型
 * 表示一个可执行的异步任务
 */
export type Task<T = any> = () => Promise<T>;

/**
 * 任务元数据接口
 * 包含任务的附加信息
 */
export interface TaskMetadata {
  /**
   * 任务名称
   */
  name?: string;

  /**
   * 任务描述
   */
  description?: string;

  /**
   * 任务分组
   */
  group?: string;

  /**
   * 文件ID（如果任务与文件相关）
   */
  fileId?: string;

  /**
   * 分片ID（如果任务与分片相关）
   */
  chunkId?: string;

  /**
   * 自定义标签
   */
  tags?: string[];

  /**
   * 任务创建时间
   */
  createdAt?: number;

  /**
   * 任务创建者
   */
  createdBy?: string;

  /**
   * 任务超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 最大重试次数
   */
  maxRetries?: number;

  /**
   * 重试间隔（毫秒）
   */
  retryInterval?: number;

  /**
   * 是否使用指数退避算法进行重试
   */
  exponentialBackoff?: boolean;

  /**
   * 任务权重（影响进度计算）
   */
  weight?: number;

  /**
   * 附加数据
   */
  [key: string]: any;
}

/**
 * 任务项接口
 * 表示调度器中的一个任务
 */
export interface TaskItem<T = any> {
  /**
   * 任务ID
   */
  id: number;

  /**
   * 任务函数
   */
  task: Task<T>;

  /**
   * 任务优先级
   */
  priority: TaskPriority;

  /**
   * 任务状态
   */
  status: TaskStatus;

  /**
   * 任务元数据
   */
  metadata?: TaskMetadata;

  /**
   * 任务创建时间
   */
  createdAt: number;

  /**
   * 任务开始执行时间
   */
  startedAt?: number;

  /**
   * 任务完成时间
   */
  completedAt?: number;

  /**
   * 当前重试次数
   */
  retryCount: number;

  /**
   * 任务结果
   */
  result?: T;

  /**
   * 任务错误
   */
  error?: Error;

  /**
   * 任务进度（0-100）
   */
  progress: number;

  /**
   * 任务中止信号
   */
  abortController: AbortController;

  /**
   * 任务相关的promise解析函数
   */
  resolve?: (value: T | PromiseLike<T>) => void;

  /**
   * 任务相关的promise拒绝函数
   */
  reject?: (reason?: any) => void;
}

/**
 * 任务结果接口
 */
export interface TaskResult<T = any> {
  /**
   * 任务ID
   */
  id: number;

  /**
   * 任务状态
   */
  status: TaskStatus;

  /**
   * 任务结果数据
   */
  data?: T;

  /**
   * 任务错误
   */
  error?: Error;

  /**
   * 任务元数据
   */
  metadata?: TaskMetadata;

  /**
   * 任务执行时间（毫秒）
   */
  executionTime?: number;

  /**
   * 任务总时间（包括等待时间，毫秒）
   */
  totalTime?: number;

  /**
   * 重试次数
   */
  retryCount: number;
}

/**
 * 任务进度事件接口
 */
export interface TaskProgressEvent {
  /**
   * 任务ID
   */
  taskId: number;

  /**
   * 任务进度（0-100）
   */
  progress: number;

  /**
   * 任务状态
   */
  status: TaskStatus;

  /**
   * 任务元数据
   */
  metadata?: TaskMetadata;

  /**
   * 已完成任务数
   */
  completedTasks: number;

  /**
   * 总任务数
   */
  totalTasks: number;

  /**
   * 总体进度（0-100）
   */
  totalProgress: number;

  /**
   * 预估剩余时间（毫秒）
   */
  estimatedTimeRemaining?: number;

  /**
   * 任务执行速率（任务/秒）
   */
  taskRate?: number;
}

/**
 * 任务调度器配置接口
 */
export interface TaskSchedulerConfig {
  /**
   * 最大并发任务数
   * @default 3
   */
  maxConcurrent?: number;

  /**
   * 默认任务优先级
   * @default TaskPriority.NORMAL
   */
  defaultPriority?: TaskPriority;

  /**
   * 默认任务超时时间（毫秒）
   * @default 30000 (30秒)
   */
  defaultTimeout?: number;

  /**
   * 默认最大重试次数
   * @default 3
   */
  defaultMaxRetries?: number;

  /**
   * 默认重试间隔（毫秒）
   * @default 1000 (1秒)
   */
  defaultRetryInterval?: number;

  /**
   * 是否启用自动重试
   * @default true
   */
  autoRetry?: boolean;

  /**
   * 是否使用指数退避算法进行重试
   * @default true
   */
  exponentialBackoff?: boolean;

  /**
   * 是否启用进度报告
   * @default true
   */
  enableProgressTracking?: boolean;

  /**
   * 进度报告间隔（毫秒）
   * @default 500 (0.5秒)
   */
  progressInterval?: number;

  /**
   * 是否启用任务优先级排序
   * @default true
   */
  priorityScheduling?: boolean;

  /**
   * 是否根据系统负载动态调整并发数
   * @default false
   */
  dynamicConcurrency?: boolean;

  /**
   * 是否自动启动调度器
   * @default true
   */
  autoStart?: boolean;

  /**
   * 是否在所有任务完成后自动暂停
   * @default false
   */
  autoPause?: boolean;

  /**
   * 是否保留已完成任务的历史记录
   * @default true
   */
  keepTaskHistory?: boolean;

  /**
   * 最大历史记录数量
   * @default 100
   */
  maxHistorySize?: number;

  /**
   * 是否启用任务统计
   * @default true
   */
  enableStats?: boolean;

  /**
   * 任务执行前处理函数
   */
  beforeTaskExecution?: (task: TaskItem) => Promise<void> | void;

  /**
   * 任务执行后处理函数
   */
  afterTaskExecution?: (task: TaskItem, result: any) => Promise<void> | void;

  /**
   * 任务失败处理函数
   */
  onTaskFailure?: (task: TaskItem, error: Error) => Promise<void> | void;
}

/**
 * 任务统计信息接口
 */
export interface TaskStats {
  /**
   * 等待中任务数
   */
  pending: number;

  /**
   * 运行中任务数
   */
  running: number;

  /**
   * 已完成任务数
   */
  completed: number;

  /**
   * 已失败任务数
   */
  failed: number;

  /**
   * 已取消任务数
   */
  cancelled: number;

  /**
   * 已暂停任务数
   */
  paused: number;

  /**
   * 总任务数
   */
  total: number;

  /**
   * 平均任务执行时间（毫秒）
   */
  averageExecutionTime: number;

  /**
   * 最长任务执行时间（毫秒）
   */
  maxExecutionTime: number;

  /**
   * 最短任务执行时间（毫秒）
   */
  minExecutionTime: number;

  /**
   * 成功率（0-1）
   */
  successRate: number;

  /**
   * 任务吞吐率（任务/秒）
   */
  throughput: number;

  /**
   * 当前队列使用率（0-1）
   */
  queueUtilization: number;

  /**
   * 开始时间
   */
  startTime: number;

  /**
   * 运行时间（毫秒）
   */
  runTime: number;

  /**
   * 任务延迟统计（毫秒）
   */
  latency: {
    average: number;
    max: number;
    min: number;
  };

  /**
   * 各优先级任务统计
   */
  byPriority: {
    [priority in TaskPriority]: number;
  };

  /**
   * 各状态任务统计
   */
  byStatus: {
    [status in TaskStatus]: number;
  };
} 