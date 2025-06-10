/**
 * fileChunkPro 3.0 插件SDK类型定义
 */

import UploaderCore from '../core/UploaderCore';
import { HookResult, PluginPriority } from './index';

/**
 * 扩展点类型
 * 定义插件可以扩展的系统扩展点
 */
export enum ExtensionPoint {
  // 文件处理扩展点
  FILE_PROCESSOR = 'fileProcessor',
  // 网络请求扩展点
  NETWORK_HANDLER = 'networkHandler',
  // 存储扩展点
  STORAGE_PROVIDER = 'storageProvider',
  // 安全验证扩展点
  SECURITY_VALIDATOR = 'securityValidator',
  // UI扩展点
  UI_COMPONENT = 'uiComponent',
  // 分析扩展点
  ANALYTICS_PROVIDER = 'analyticsProvider',
  // 错误处理扩展点
  ERROR_HANDLER = 'errorHandler',
  // 事件处理扩展点
  EVENT_HANDLER = 'eventHandler',
  // 自定义扩展点
  CUSTOM = 'custom'
}

/**
 * 插件生命周期钩子类型
 */
export enum PluginLifecycleHook {
  // 初始化前
  BEFORE_INIT = 'beforeInit',
  // 初始化后
  AFTER_INIT = 'afterInit',
  // 添加文件前
  BEFORE_ADD_FILE = 'beforeAddFile',
  // 添加文件后
  AFTER_ADD_FILE = 'afterAddFile',
  // 上传前
  BEFORE_UPLOAD = 'beforeUpload',
  // 上传后
  AFTER_UPLOAD = 'afterUpload',
  // 分片前
  BEFORE_CHUNK = 'beforeChunk',
  // 分片后
  AFTER_CHUNK = 'afterChunk',
  // 上传分片前
  BEFORE_UPLOAD_CHUNK = 'beforeUploadChunk',
  // 上传分片后
  AFTER_UPLOAD_CHUNK = 'afterUploadChunk',
  // 合并前
  BEFORE_MERGE = 'beforeMerge',
  // 合并后
  AFTER_MERGE = 'afterMerge',
  // 进度更新
  ON_PROGRESS = 'onProgress',
  // 错误发生
  ON_ERROR = 'onError',
  // 成功完成
  ON_SUCCESS = 'onSuccess',
  // 取消
  ON_CANCEL = 'onCancel',
  // 暂停
  ON_PAUSE = 'onPause',
  // 恢复
  ON_RESUME = 'onResume',
  // 销毁前
  BEFORE_DESTROY = 'beforeDestroy',
  // 销毁后
  AFTER_DESTROY = 'afterDestroy',
  // Worker消息
  ON_WORKER_MESSAGE = 'onWorkerMessage',
  // 网络状态变化
  ON_NETWORK_STATUS_CHANGE = 'onNetworkStatusChange',
  // 内存警告
  ON_MEMORY_WARNING = 'onMemoryWarning'
}

/**
 * 插件上下文接口
 * 提供给插件使用的上下文环境
 */
export interface IPluginContext {
  /**
   * 获取上传器核心实例
   */
  getCore(): UploaderCore;

  /**
   * 获取插件管理器
   */
  getPluginManager(): any;

  /**
   * 获取事件总线
   */
  getEventBus(): any;

  /**
   * 获取任务调度器
   */
  getTaskScheduler(): any;

  /**
   * 获取其他插件实例
   * @param name 插件名称
   */
  getPlugin(name: string): any;

  /**
   * 检查插件是否存在
   * @param name 插件名称
   */
  hasPlugin(name: string): boolean;

  /**
   * 注册钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   * @param priority 优先级
   */
  registerHook(hookName: string, handler: Function, priority?: PluginPriority): void;

  /**
   * 移除钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   */
  removeHook(hookName: string, handler: Function): void;

  /**
   * 运行钩子
   * @param hookName 钩子名称
   * @param args 参数
   */
  runHook(hookName: string, args?: any): Promise<HookResult>;

  /**
   * 注册扩展点实现
   * @param point 扩展点
   * @param implementation 实现
   * @param options 选项
   */
  registerExtension(point: ExtensionPoint | string, implementation: any, options?: ExtensionOptions): void;

  /**
   * 获取扩展点的所有实现
   * @param point 扩展点
   */
  getExtensions(point: ExtensionPoint | string): any[];

  /**
   * 获取配置
   * @param key 配置键
   */
  getConfig<T = any>(key?: string): T;

  /**
   * 设置配置
   * @param key 配置键
   * @param value 配置值
   */
  setConfig<T = any>(key: string, value: T): void;

  /**
   * 记录日志
   * @param level 日志级别
   * @param message 日志消息
   * @param data 日志数据
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void;
}

/**
 * 扩展点选项接口
 */
export interface ExtensionOptions {
  /**
   * 扩展实现名称
   */
  name: string;

  /**
   * 扩展点优先级
   */
  priority?: PluginPriority;

  /**
   * 是否替换现有实现
   */
  replace?: boolean;

  /**
   * 扩展点描述
   */
  description?: string;

  /**
   * 标签，用于分类和筛选
   */
  tags?: string[];

  /**
   * 扩展点元数据
   */
  metadata?: Record<string, any>;
}

/**
 * 插件注册配置
 */
export interface PluginRegistrationOptions {
  /**
   * 插件名称
   */
  name: string;

  /**
   * 插件版本
   */
  version: string;

  /**
   * 插件依赖
   */
  dependencies?: string[];

  /**
   * 插件描述
   */
  description?: string;

  /**
   * 插件作者
   */
  author?: string;

  /**
   * 启用插件
   */
  enabled?: boolean;

  /**
   * 插件初始配置
   */
  config?: Record<string, any>;

  /**
   * 插件标签
   */
  tags?: string[];
}

/**
 * 插件元数据接口
 */
export interface PluginMetadata {
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
   * 插件作者
   */
  author?: string;

  /**
   * 插件主页
   */
  homepage?: string;

  /**
   * 插件仓库
   */
  repository?: string;

  /**
   * 插件许可证
   */
  license?: string;

  /**
   * 插件标签
   */
  tags?: string[];

  /**
   * 插件依赖
   */
  dependencies?: string[];

  /**
   * 插件兼容性
   */
  compatibility?: {
    coreVersion?: string;
    environments?: string[];
  };

  /**
   * 插件文档
   */
  documentation?: string;

  /**
   * 插件扩展点
   */
  extensionPoints?: string[];

  /**
   * 插件钩子
   */
  hooks?: string[];

  /**
   * 其他元数据
   */
  [key: string]: any;
}

/**
 * 插件接口
 * 所有插件必须实现此接口
 */
export interface ISDKPlugin {
  /**
   * 插件元数据
   */
  metadata: PluginMetadata;

  /**
   * 安装插件
   * @param context 插件上下文
   */
  install(context: IPluginContext): void;

  /**
   * 卸载插件
   */
  uninstall?(): void;

  /**
   * 插件初始化
   * 在所有插件安装完成后调用
   */
  init?(): Promise<void>;

  /**
   * 插件销毁
   * 在上传器销毁前调用
   */
  destroy?(): Promise<void>;

  /**
   * 更新插件配置
   * @param config 新配置
   */
  updateConfig?(config: Record<string, any>): void;
} 