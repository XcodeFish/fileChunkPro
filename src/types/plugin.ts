/**
 * 插件系统类型定义
 */

import { UploaderCore } from '../core/UploaderCore';
import { AnyFile } from '../core/FileProcessor';
import { SecurityLevel } from './index';
import { DependencyContainer } from '../core/DependencyContainer';
import { EventBus } from '../core/EventBus';

/**
 * 插件生命周期钩子类型
 */
export type PluginHook =
  | 'beforeInit'
  | 'afterInit'
  | 'beforeUpload'
  | 'afterUpload'
  | 'beforeChunk'
  | 'afterChunk'
  | 'beforeRequest'
  | 'afterRequest'
  | 'onProgress'
  | 'onError'
  | 'onSuccess'
  | 'beforeDestroy'
  | 'afterDestroy';

/**
 * 插件优先级
 * 优先级越高，越早执行
 */
export enum PluginPriority {
  HIGHEST = 100,
  HIGH = 75,
  NORMAL = 50,
  LOW = 25,
  LOWEST = 0
}

/**
 * 依赖项类型
 */
export type PluginDependency = string | IPlugin;

/**
 * 依赖关系
 */
export interface PluginDependencyRelation {
  /**
   * 依赖的插件ID
   */
  id: string;

  /**
   * 是否为可选依赖
   */
  optional?: boolean;

  /**
   * 最小支持版本
   */
  minVersion?: string;

  /**
   * 最大支持版本
   */
  maxVersion?: string;
}

/**
 * 插件元数据
 */
export interface PluginMeta {
  /**
   * 插件ID，唯一标识
   */
  id: string;

  /**
   * 插件名称
   */
  name: string;

  /**
   * 插件版本
   */
  version: string;

  /**
   * 插件描述
   */
  description?: string;

  /**
   * 插件优先级，决定执行顺序
   */
  priority?: PluginPriority;

  /**
   * 插件依赖
   */
  dependencies?: Array<string | PluginDependencyRelation>;

  /**
   * 插件作者
   */
  author?: string;

  /**
   * 是否为核心插件
   */
  isCore?: boolean;

  /**
   * 监听的钩子
   */
  hooks?: PluginHook[];
}

/**
 * 插件上下文接口
 * 插件运行上下文中可用的核心服务
 */
export interface PluginContext {
  /**
   * 依赖容器
   */
  container: DependencyContainer;
  
  /**
   * 事件总线
   */
  eventBus: EventBus;
  
  /**
   * 插件配置
   */
  config: Record<string, any>;
}

/**
 * 钩子处理函数结果
 * @template T 结果类型
 */
export interface HookResult<T = any> {
  /**
   * 处理结果数据
   */
  result?: T;
  
  /**
   * 是否阻止后续钩子执行
   */
  prevented?: boolean;
  
  /**
   * 元数据
   */
  meta?: Record<string, any>;
}

/**
 * 钩子处理函数
 * @template T 参数类型
 * @template R 结果类型
 */
export type HookHandler<T = any, R = any> = (params: T, context: PluginContext) => HookResult<R> | Promise<HookResult<R>> | R | Promise<R> | void;

/**
 * 钩子处理结果包装器
 * @template T 参数类型
 * @template R 结果类型
 */
export interface HookInvocationResult<T = any, R = any> {
  /**
   * 原始参数
   */
  params: T;
  
  /**
   * 最终结果
   */
  result?: R;
  
  /**
   * 是否被阻止
   */
  prevented: boolean;
  
  /**
   * 已执行的插件列表
   */
  executedPlugins: string[];
  
  /**
   * 元数据集合
   */
  meta: Record<string, any>;
}

/**
 * 插件接口
 */
export interface IPlugin<TConfig = Record<string, any>> {
  /**
   * 插件名称
   */
  name: string;
  
  /**
   * 插件版本
   */
  version: string;
  
  /**
   * 插件描述
   */
  description?: string;
  
  /**
   * 插件依赖列表
   */
  dependencies?: string[];
  
  /**
   * 插件冲突列表
   */
  conflicts?: string[];
  
  /**
   * 插件初始化函数
   * @param context 插件上下文
   */
  install(context: PluginContext): void | Promise<void>;
  
  /**
   * 插件卸载函数
   * @param context 插件上下文
   */
  uninstall?(context: PluginContext): void | Promise<void>;
  
  /**
   * 注册钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   */
  registerHook<T = any, R = any>(hookName: string, handler: HookHandler<T, R>): void;
  
  /**
   * 设置插件配置
   * @param config 配置对象
   */
  setConfig(config: Partial<TConfig>): void;
  
  /**
   * 获取插件配置
   * @returns 配置对象
   */
  getConfig(): TConfig;
}

/**
 * 插件工厂函数
 */
export type PluginFactory<TConfig = Record<string, any>> = (config?: TConfig) => IPlugin<TConfig>;

/**
 * 插件管理器接口
 */
export interface IPluginManager {
  /**
   * 注册插件
   * @param plugin 插件实例
   * @param config 插件配置
   * @returns 插件管理器实例
   */
  register<TConfig = Record<string, any>>(plugin: IPlugin<TConfig>, config?: Partial<TConfig>): IPluginManager;
  
  /**
   * 移除插件
   * @param pluginName 插件名称
   * @returns 是否成功移除
   */
  unregister(pluginName: string): boolean;
  
  /**
   * 获取已注册插件
   * @param pluginName 插件名称
   * @returns 插件实例或undefined
   */
  getPlugin<T extends IPlugin = IPlugin>(pluginName: string): T | undefined;
  
  /**
   * 检查插件是否已注册
   * @param pluginName 插件名称
   * @returns 是否已注册
   */
  hasPlugin(pluginName: string): boolean;
  
  /**
   * 获取所有已注册的插件
   * @returns 插件实例数组
   */
  getPlugins(): IPlugin[];
  
  /**
   * 应用钩子
   * @param hookName 钩子名称
   * @param params 钩子参数
   * @returns 钩子执行结果
   */
  applyHook<T = any, R = any>(hookName: string, params: T): Promise<HookInvocationResult<T, R>>;
}

/**
 * 钩子元数据
 */
export interface HookMetadata {
  /**
   * 钩子名称
   */
  name: string;
  
  /**
   * 钩子描述
   */
  description?: string;
  
  /**
   * 钩子类型
   * - sync: 同步钩子，按顺序执行，可能修改参数
   * - waterfall: 瀑布钩子，每个钩子处理上一个钩子的返回值
   * - parallel: 并行钩子，同时执行所有处理函数
   */
  type: 'sync' | 'waterfall' | 'parallel';
  
  /**
   * 钩子调用阶段
   */
  stage: 'before' | 'process' | 'after';
}

/**
 * 标准插件类型
 */
export type StandardPluginType = 
  | 'chunk'           // 分片处理插件
  | 'resume'          // 断点续传插件
  | 'security'        // 安全插件
  | 'validation'      // 验证插件
  | 'storage'         // 存储插件
  | 'ui'              // UI插件
  | 'progress'        // 进度插件
  | 'retry'           // 重试插件
  | 'queue'           // 队列插件
  | 'compression'     // 压缩插件
  | 'preprocess'      // 预处理插件
  | 'postprocess'     // 后处理插件
  | 'encoding'        // 编码插件
  | 'analytics'       // 分析插件
  | 'logging'         // 日志插件
  | 'adapter'         // 适配器插件
  | 'concurrency'     // 并发控制插件
  | 'priority'        // 优先级插件
  | 'transform'       // 转换插件
  | 'filter'          // 过滤插件
  | 'utility';        // 工具插件

/**
 * 插件注册选项
 */
export interface PluginRegistrationOptions {
  /**
   * 插件优先级，值越大优先级越高
   * @default 0
   */
  priority?: number;
  
  /**
   * 是否启用插件
   * @default true
   */
  enabled?: boolean;
  
  /**
   * 插件类型
   */
  type?: StandardPluginType | string;
  
  /**
   * 是否是核心插件
   * @default false
   */
  isCore?: boolean;
  
  /**
   * 标签列表，用于分组和批量操作
   */
  tags?: string[];
}

/**
 * 插件验证错误
 */
export interface PluginValidationError {
  /**
   * 错误代码
   */
  code: string;
  
  /**
   * 错误消息
   */
  message: string;
  
  /**
   * 插件名称
   */
  pluginName: string;
  
  /**
   * 错误详情
   */
  details?: Record<string, any>;
}

/**
 * 钩子生命周期方法
 * 插件可以实现这些标准钩子方法，自动被调用
 */
export interface PluginHookLifecycle<TConfig = Record<string, any>> {
  /**
   * 插件初始化前
   */
  beforeInstall?(context: PluginContext): void | Promise<void>;
  
  /**
   * 插件初始化后
   */
  afterInstall?(context: PluginContext): void | Promise<void>;
  
  /**
   * 插件卸载前
   */
  beforeUninstall?(context: PluginContext): void | Promise<void>;
  
  /**
   * 插件卸载后
   */
  afterUninstall?(context: PluginContext): void | Promise<void>;
  
  /**
   * 配置变更时
   * @param newConfig 新配置
   * @param oldConfig 旧配置
   */
  onConfigChange?(newConfig: Partial<TConfig>, oldConfig: TConfig, context: PluginContext): void | Promise<void>;
}

/**
 * 插件基础抽象类
 * 为插件实现提供基础功能
 */
export abstract class BasePlugin<TConfig = Record<string, any>> implements IPlugin<TConfig> {
  /**
   * 插件名称
   */
  public abstract name: string;
  
  /**
   * 插件版本
   */
  public abstract version: string;
  
  /**
   * 插件描述
   */
  public description?: string;
  
  /**
   * 插件依赖
   */
  public dependencies: string[] = [];
  
  /**
   * 插件冲突列表
   */
  public conflicts: string[] = [];
  
  /**
   * 钩子处理函数映射
   */
  private hooks: Map<string, HookHandler[]> = new Map();
  
  /**
   * 插件上下文
   */
  protected context?: PluginContext;
  
  /**
   * 插件配置
   */
  protected config: any = {};
  
  /**
   * 构造函数
   * @param config 插件配置
   */
  constructor(config?: Partial<TConfig>) {
    if (config) {
      this.setConfig(config);
    }
  }
  
  /**
   * 初始化插件（子类必须实现）
   * @param context 插件上下文
   */
  public abstract install(context: PluginContext): void | Promise<void>;
  
  /**
   * 卸载插件（可选实现）
   * @param context 插件上下文
   */
  public uninstall?(context: PluginContext): void | Promise<void>;
  
  /**
   * 注册钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   */
  public registerHook<T = any, R = any>(hookName: string, handler: HookHandler<T, R>): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    
    this.hooks.get(hookName)!.push(handler as HookHandler);
  }
  
  /**
   * 获取钩子处理函数
   * @param hookName 钩子名称
   * @returns 处理函数数组
   */
  public getHooks(hookName: string): HookHandler[] {
    return this.hooks.get(hookName) || [];
  }
  
  /**
   * 获取所有钩子名称
   * @returns 钩子名称数组
   */
  public getRegisteredHooks(): string[] {
    return Array.from(this.hooks.keys());
  }
  
  /**
   * 设置插件配置
   * @param config 配置对象
   */
  public setConfig(config: Partial<TConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };
    
    // 配置变更回调
    if (
      this.context && 
      typeof (this as any).onConfigChange === 'function'
    ) {
      (this as any).onConfigChange(config, oldConfig, this.context);
    }
  }
  
  /**
   * 获取插件配置
   * @returns 配置对象
   */
  public getConfig(): TConfig {
    return this.config;
  }
}

/**
 * 常见钩子名称集合
 */
export enum CommonHooks {
  // 文件处理相关钩子
  BEFORE_FILE_UPLOAD = 'beforeFileUpload',
  AFTER_FILE_UPLOAD = 'afterFileUpload',
  VALIDATE_FILE = 'validateFile',
  TRANSFORM_FILE = 'transformFile',
  
  // 分片处理相关钩子
  BEFORE_CHUNK_UPLOAD = 'beforeChunkUpload',
  AFTER_CHUNK_UPLOAD = 'afterChunkUpload',
  BEFORE_CREATE_CHUNKS = 'beforeCreateChunks',
  AFTER_CREATE_CHUNKS = 'afterCreateChunks',
  OPTIMIZE_CHUNK_SIZE = 'optimizeChunkSize',
  
  // 续传相关钩子
  SAVE_UPLOAD_STATE = 'saveUploadState',
  LOAD_UPLOAD_STATE = 'loadUploadState',
  RESTORE_UPLOAD = 'restoreUpload',
  
  // 进度相关钩子
  UPDATE_PROGRESS = 'updateProgress',
  CALCULATE_TOTAL_PROGRESS = 'calculateTotalProgress',
  
  // 请求相关钩子
  BEFORE_REQUEST = 'beforeRequest',
  AFTER_REQUEST = 'afterRequest',
  REQUEST_ERROR = 'requestError',
  TRANSFORM_REQUEST = 'transformRequest',
  TRANSFORM_RESPONSE = 'transformResponse',
  
  // 安全相关钩子
  GENERATE_FILE_ID = 'generateFileId',
  ENCRYPT_DATA = 'encryptData',
  DECRYPT_DATA = 'decryptData',
  VERIFY_RESPONSE = 'verifyResponse',
  
  // 错误处理钩子
  HANDLE_ERROR = 'handleError',
  ON_RETRY = 'onRetry',
  
  // 生命周期钩子
  BEFORE_INIT = 'beforeInit',
  AFTER_INIT = 'afterInit',
  BEFORE_DESTROY = 'beforeDestroy',
  AFTER_DESTROY = 'afterDestroy',
}

/**
 * 插件创建辅助函数
 * 简化插件创建
 * @param definition 插件定义
 * @returns 插件工厂函数
 */
export function createPlugin<TConfig = Record<string, any>>(
  definition: Omit<IPlugin<TConfig>, 'registerHook' | 'setConfig' | 'getConfig'> & Partial<PluginHookLifecycle<TConfig>> & {
    hooks?: Record<string, HookHandler>;
    defaultConfig?: TConfig;
  }
): PluginFactory<TConfig> {
  return (config?: TConfig) => {
    const plugin = new BasePlugin<TConfig>(config) as BasePlugin<TConfig> & typeof definition;
    
    // 复制属性
    Object.assign(plugin, { 
      ...definition,
      config: { 
        ...(definition.defaultConfig || {}),
        ...(config || {})
      }
    });
    
    // 注册钩子
    if (definition.hooks) {
      Object.entries(definition.hooks).forEach(([hookName, handler]) => {
        plugin.registerHook(hookName, handler);
      });
    }
    
    return plugin;
  };
}

/**
 * 插件注册状态
 */
export enum PluginStatus {
  /**
   * 已注册但未初始化
   */
  REGISTERED = 'registered',
  
  /**
   * 已初始化
   */
  INSTALLED = 'installed',
  
  /**
   * 已启用
   */
  ENABLED = 'enabled',
  
  /**
   * 已禁用
   */
  DISABLED = 'disabled',
  
  /**
   * 错误
   */
  ERROR = 'error',
  
  /**
   * 已卸载
   */
  UNINSTALLED = 'uninstalled',
}

/**
 * 分块插件接口
 */
export interface IChunkPlugin extends IPlugin {
  /**
   * 创建分块
   * @param file 文件对象
   * @param chunkSize 块大小
   */
  createChunks: (file: AnyFile, chunkSize: number) => Promise<any[]>;
  
  /**
   * 处理块上传
   * @param chunk 块信息
   * @param endpoint 上传端点
   */
  uploadChunk?: (chunk: any, endpoint: string) => Promise<any>;
  
  /**
   * 合并块
   * @param fileId 文件ID
   * @param totalChunks 总块数
   */
  mergeChunks?: (fileId: string, totalChunks: number) => Promise<any>;
}

/**
 * 断点续传插件接口
 */
export interface IResumePlugin extends IPlugin {
  /**
   * 保存上传状态
   * @param fileId 文件ID
   * @param state 状态信息
   */
  saveState: (fileId: string, state: any) => Promise<void>;
  
  /**
   * 加载上传状态
   * @param fileId 文件ID
   */
  loadState: (fileId: string) => Promise<any | null>;
  
  /**
   * 清除上传状态
   * @param fileId 文件ID
   */
  clearState: (fileId: string) => Promise<void>;
  
  /**
   * 恢复上传
   * @param fileId 文件ID
   */
  resumeUpload?: (fileId: string) => Promise<boolean>;
}

/**
 * 并发控制插件接口
 */
export interface IConcurrencyPlugin extends IPlugin {
  /**
   * 获取推荐的并发数
   * @param fileSize 文件大小
   */
  getRecommendedConcurrency: (fileSize: number) => number;
  
  /**
   * 设置并发数
   * @param value 并发数
   */
  setConcurrency: (value: number) => void;
  
  /**
   * 获取当前并发数
   */
  getConcurrency: () => number;
  
  /**
   * 调整并发数
   */
  adjustConcurrency?: () => void;
}

/**
 * 文件校验插件接口
 */
export interface IValidatorPlugin extends IPlugin {
  /**
   * 验证文件
   * @param file 文件对象
   */
  validateFile: (file: AnyFile) => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
  
  /**
   * 验证文件内容
   * @param file 文件对象
   */
  validateContent?: (file: AnyFile) => Promise<{ valid: boolean; reason: string }>;
  
  /**
   * 添加验证规则
   * @param rule 规则函数
   */
  addRule?: (rule: (file: AnyFile) => Promise<string | null>) => void;
}

/**
 * 进度监控插件接口
 */
export interface IProgressPlugin extends IPlugin {
  /**
   * 更新进度
   * @param fileId 文件ID
   * @param progress 进度信息
   */
  updateProgress: (fileId: string, progress: any) => void;
  
  /**
   * 获取当前进度
   * @param fileId 文件ID
   */
  getProgress: (fileId: string) => any;
  
  /**
   * 监听进度更新
   * @param fileId 文件ID
   * @param callback 回调函数
   */
  onProgressUpdate?: (fileId: string, callback: (progress: any) => void) => void;
}

/**
 * 文件预检插件接口（秒传）
 */
export interface IPrecheckPlugin extends IPlugin {
  /**
   * 预检文件
   * @param file 文件对象
   */
  precheckFile: (file: AnyFile) => Promise<{ exists: boolean; url?: string; fileId?: string }>;
  
  /**
   * 生成文件指纹
   * @param file 文件对象
   */
  generateFingerprint?: (file: AnyFile) => Promise<string>;
}

/**
 * 自适应上传插件接口
 */
export interface IAdaptiveUploadPlugin extends IPlugin {
  /**
   * 获取最佳上传策略
   * @param fileSize 文件大小
   */
  getBestStrategy: (fileSize: number) => any;
  
  /**
   * 检测环境和网络条件
   */
  detectConditions?: () => Promise<any>;
  
  /**
   * 注册策略
   * @param name 策略名称
   * @param strategy 策略配置
   */
  registerStrategy?: (name: string, strategy: any) => void;
}

/**
 * 服务工作线程插件接口
 */
export interface IServiceWorkerPlugin extends IPlugin {
  /**
   * 初始化服务工作线程
   * @param scope 作用域
   * @returns 初始化Promise
   */
  initServiceWorker(scope: string): Promise<ServiceWorkerRegistration>;

  /**
   * 获取当前服务工作线程注册
   * @returns 服务工作线程注册
   */
  getRegistration(): Promise<ServiceWorkerRegistration | null>;

  /**
   * 检查是否支持服务工作线程
   * @returns 是否支持
   */
  isSupported(): boolean;
}

/**
 * 安全插件接口
 */
export interface ISecurityPlugin extends IPlugin {
  /**
   * 获取安全级别
   */
  getSecurityLevel: () => SecurityLevel;
  
  /**
   * 设置安全级别
   * @param level 安全级别
   */
  setSecurityLevel: (level: SecurityLevel) => void;
  
  /**
   * 验证文件安全性
   * @param file 文件对象
   */
  validateSecurity?: (file: AnyFile) => Promise<{ valid: boolean; issues: any[] }>;
}

/**
 * 监控插件接口
 */
export interface IMonitoringPlugin extends IPlugin {
  /**
   * 开始监控
   */
  startMonitoring: () => void;
  
  /**
   * 停止监控
   */
  stopMonitoring: () => void;
  
  /**
   * 获取监控数据
   */
  getMetrics?: () => any;
  
  /**
   * 记录事件
   * @param eventName 事件名称
   * @param data 事件数据
   */
  trackEvent?: (eventName: string, data: any) => void;
}

/**
 * UI集成插件接口
 */
export interface IUIPlugin extends IPlugin {
  /**
   * 渲染UI
   * @param container 容器元素
   */
  render: (container: HTMLElement) => void;
  
  /**
   * 更新UI
   * @param data 更新数据
   */
  update?: (data: any) => void;
  
  /**
   * 卸载UI
   */
  unmount?: () => void;
}

/**
 * 插件接口映射
 */
export interface PluginInterfaceMap {
  'chunk': IChunkPlugin;
  'resume': IResumePlugin;
  'concurrency': IConcurrencyPlugin;
  'validator': IValidatorPlugin;
  'progress': IProgressPlugin;
  'precheck': IPrecheckPlugin;
  'adaptive-upload': IAdaptiveUploadPlugin;
  'service-worker': IServiceWorkerPlugin;
  'security': ISecurityPlugin;
  'monitoring': IMonitoringPlugin;
  'ui': IUIPlugin;
  [key: string]: IPlugin;
}

/**
 * 上传策略接口
 */
export interface IUploadStrategy {
  /**
   * 执行上传策略
   * @param file 文件对象
   * @param options 上传选项
   */
  execute(file: File | Blob, options: any): Promise<void>;

  /**
   * 获取策略元数据
   * @returns 策略元数据
   */
  getMeta(): {
    id: string;
    name: string;
    description?: string;
  };
}

/**
 * 上传策略类型
 */
export enum UploadStrategyType {
  STANDARD = 'standard',
  CHUNKED = 'chunked',
  DIRECT = 'direct',
  RESUMABLE = 'resumable',
  ADAPTIVE = 'adaptive'
}

/**
 * 插件管理器接口
 */
export interface IPluginManager {
  /**
   * 注册插件
   * @param plugin 插件实例或插件类
   * @param options 插件选项
   * @returns 是否注册成功
   */
  register(plugin: IPlugin | (new () => IPlugin), options?: any): boolean;

  /**
   * 注销插件
   * @param pluginId 插件ID
   * @returns 是否注销成功
   */
  unregister(pluginId: string): boolean;

  /**
   * 获取插件实例
   * @param pluginId 插件ID
   * @returns 插件实例
   */
  getPlugin<T extends IPlugin = IPlugin>(pluginId: string): T | null;

  /**
   * 检查插件是否已注册
   * @param pluginId 插件ID
   * @returns 是否已注册
   */
  hasPlugin(pluginId: string): boolean;

  /**
   * 获取所有已注册的插件
   * @returns 插件列表
   */
  getPlugins(): IPlugin[];

  /**
   * 按优先级执行钩子
   * @param hook 钩子名称
   * @param args 钩子参数
   * @returns 钩子执行结果
   */
  executeHook(hook: PluginHook, ...args: any[]): Promise<any[]>;

  /**
   * 获取监听特定钩子的插件
   * @param hook 钩子名称
   * @returns 插件列表
   */
  getPluginsByHook(hook: PluginHook): IPlugin[];

  /**
   * 验证插件依赖关系
   * @param plugin 插件实例
   * @returns 依赖是否满足
   */
  validateDependencies(plugin: IPlugin): {
    valid: boolean;
    missing: string[];
    incompatible: string[];
  };
} 