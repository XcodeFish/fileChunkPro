/**
 * PluginContext - 插件上下文类
 * 为插件提供统一的API接口，管理插件生命周期和系统交互
 */

import UploaderCore from '../../core/UploaderCore';
import { PluginManager } from '../../core/PluginManager';
import { EventBus } from '../../core/EventBus';
import { TaskScheduler } from '../../core/TaskScheduler';
import { Logger } from '../../utils/Logger';
import {
  ExtensionPoint,
  ExtensionOptions,
  IPluginContext,
  HookResult,
  PluginPriority,
} from '../../types';

// 钩子处理函数类型
type HookHandler = (...args: any[]) => any;

/**
 * 插件上下文类
 * 提供插件访问核心系统的接口
 */
export class PluginContext implements IPluginContext {
  private core: UploaderCore;
  private pluginName: string;
  private logger: Logger;
  private config: Record<string, any> = {};
  private extensions: Map<string, any[]> = new Map();

  /**
   * 构造函数
   * @param core UploaderCore实例
   * @param pluginName 插件名称
   * @param initialConfig 初始配置
   */
  constructor(
    core: UploaderCore,
    pluginName: string,
    initialConfig: Record<string, any> = {}
  ) {
    this.core = core;
    this.pluginName = pluginName;
    this.logger = new Logger(`Plugin[${pluginName}]`);
    this.config = { ...initialConfig };
  }

  /**
   * 获取上传器核心实例
   */
  public getCore(): UploaderCore {
    return this.core;
  }

  /**
   * 获取插件管理器
   */
  public getPluginManager(): PluginManager {
    return this.core.getPluginManager();
  }

  /**
   * 获取事件总线
   */
  public getEventBus(): EventBus {
    return this.core.getEventBus();
  }

  /**
   * 获取任务调度器
   */
  public getTaskScheduler(): TaskScheduler {
    return this.core.getTaskScheduler();
  }

  /**
   * 获取其他插件实例
   * @param name 插件名称
   */
  public getPlugin(name: string): any {
    return this.getPluginManager().getPlugin(name);
  }

  /**
   * 检查插件是否存在
   * @param name 插件名称
   */
  public hasPlugin(name: string): boolean {
    return this.getPluginManager().hasPlugin(name);
  }

  /**
   * 注册钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   * @param priority 优先级
   */
  public registerHook(
    hookName: string,
    handler: HookHandler,
    priority: PluginPriority = PluginPriority.NORMAL
  ): void {
    this.getPluginManager().registerHook(hookName, handler, {
      priority,
      plugin: this.pluginName,
    });

    this.logger.debug(`已注册钩子: ${hookName}`);
  }

  /**
   * 移除钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   */
  public removeHook(hookName: string, handler: HookHandler): void {
    this.getPluginManager().removeHook(hookName, handler, this.pluginName);

    this.logger.debug(`已移除钩子: ${hookName}`);
  }

  /**
   * 运行钩子
   * @param hookName 钩子名称
   * @param args 参数
   */
  public async runHook(hookName: string, args?: any): Promise<HookResult> {
    return this.getPluginManager().runHook(hookName, args);
  }

  /**
   * 注册扩展点实现
   * @param point 扩展点
   * @param implementation 实现
   * @param options 选项
   */
  public registerExtension(
    point: ExtensionPoint | string,
    implementation: any,
    options: ExtensionOptions = { name: 'anonymous' }
  ): void {
    if (!this.extensions.has(point)) {
      this.extensions.set(point, []);
    }

    const existingImplementations = this.extensions.get(point)!;

    // 检查是否需要替换
    if (options.replace) {
      const index = existingImplementations.findIndex(
        impl => impl.options && impl.options.name === options.name
      );

      if (index !== -1) {
        existingImplementations[index] = { implementation, options };
        this.logger.debug(`已替换扩展点实现: ${point} (${options.name})`);
        return;
      }
    }

    // 添加新实现
    existingImplementations.push({ implementation, options });

    // 按优先级排序
    existingImplementations.sort((a, b) => {
      const priorityA = a.options?.priority || PluginPriority.NORMAL;
      const priorityB = b.options?.priority || PluginPriority.NORMAL;
      return priorityB - priorityA; // 高优先级在前
    });

    this.logger.debug(`已注册扩展点实现: ${point} (${options.name})`);

    // 触发扩展点注册事件
    this.getEventBus().emit('plugin:extension:registered', {
      plugin: this.pluginName,
      point,
      implementation,
      options,
    });
  }

  /**
   * 获取扩展点的所有实现
   * @param point 扩展点
   */
  public getExtensions(point: ExtensionPoint | string): any[] {
    const extensions = this.extensions.get(point) || [];
    return extensions.map(ext => ext.implementation);
  }

  /**
   * 获取配置
   * @param key 配置键，不提供则返回所有配置
   */
  public getConfig<T = any>(key?: string): T {
    if (key === undefined) {
      return this.config as unknown as T;
    }
    return this.config[key] as T;
  }

  /**
   * 设置配置
   * @param key 配置键
   * @param value 配置值
   */
  public setConfig<T = any>(key: string, value: T): void {
    this.config[key] = value;

    // 触发配置变更事件
    this.getEventBus().emit('plugin:config:changed', {
      plugin: this.pluginName,
      key,
      value,
      config: this.config,
    });
  }

  /**
   * 记录日志
   * @param level 日志级别
   * @param message 日志消息
   * @param data 日志数据
   */
  public log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: any
  ): void {
    this.logger[level](message, data);
  }
}
