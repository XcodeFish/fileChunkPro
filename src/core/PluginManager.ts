/**
 * PluginManager - 插件管理系统
 * 负责插件的注册与管理，以及钩子系统的实现
 */

import { IPlugin, PluginPriority, HookResult } from '../types';
import { Logger } from '../utils/Logger';

import { EventBus } from './EventBus';

// 钩子处理函数
export type HookHandler = (...args: any[]) => any;

// 钩子处理函数注册信息
interface HookRegistration {
  handler: HookHandler;
  priority: PluginPriority;
  plugin: string;
}

// 插件注册信息
interface PluginRegistration {
  instance: IPlugin;
  version: string;
  enabled: boolean;
  dependencies: string[];
  loadedAt: number;
}

export class PluginManager {
  private plugins: Map<string, PluginRegistration> = new Map();
  private hooks: Map<string, HookRegistration[]> = new Map();
  private pluginDependencies: Map<string, Set<string>> = new Map();
  private pluginOrder: string[] = [];
  private logger: Logger = new Logger('PluginManager');
  private eventBus?: EventBus;

  /**
   * 构造函数
   * @param eventBus 可选的事件总线实例
   */
  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * 注册插件
   * @param name 插件名称
   * @param plugin 插件实例
   * @param dependencies 依赖的其他插件
   * @returns 当前实例，用于链式调用
   */
  public registerPlugin(
    name: string,
    plugin: IPlugin,
    dependencies: string[] = []
  ): this {
    if (this.plugins.has(name)) {
      this.logger.warn(`插件"${name}"已注册，将被覆盖`);
    }

    // 检查循环依赖
    if (this.hasCircularDependency(name, dependencies)) {
      throw new Error(`插件"${name}"存在循环依赖`);
    }

    // 检查依赖是否已注册
    for (const dep of dependencies) {
      if (!this.plugins.has(dep)) {
        this.logger.warn(`插件"${name}"依赖的"${dep}"未注册`);
      }
    }

    // 保存插件信息
    this.plugins.set(name, {
      instance: plugin,
      version: plugin.version || '1.0.0',
      enabled: true,
      dependencies,
      loadedAt: Date.now(),
    });

    // 更新依赖关系
    this.pluginDependencies.set(name, new Set(dependencies));

    // 更新插件加载顺序
    this.recalculatePluginOrder();

    // 触发事件
    this.eventBus?.emit('plugin:registered', { name, plugin });

    return this;
  }

  /**
   * 检查是否存在循环依赖
   * @param pluginName 插件名称
   * @param dependencies 依赖列表
   * @param visited 已访问的插件
   */
  private hasCircularDependency(
    pluginName: string,
    dependencies: string[],
    visited: Set<string> = new Set()
  ): boolean {
    // 如果插件名在依赖中，则存在循环依赖
    if (dependencies.includes(pluginName)) {
      return true;
    }

    // 标记当前插件已访问
    visited.add(pluginName);

    // 递归检查每个依赖
    for (const dep of dependencies) {
      if (visited.has(dep)) {
        return true;
      }

      const subDeps = Array.from(this.pluginDependencies.get(dep) || []);
      if (this.hasCircularDependency(pluginName, subDeps, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  /**
   * 重新计算插件加载顺序
   */
  private recalculatePluginOrder(): void {
    // 拓扑排序，确保依赖在前
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    // 深度优先搜索
    const visit = (node: string) => {
      if (temp.has(node)) {
        throw new Error(`插件依赖存在循环: ${node}`);
      }

      if (visited.has(node)) {
        return;
      }

      temp.add(node);

      // 访问所有依赖
      const deps = this.pluginDependencies.get(node) || new Set();
      deps.forEach(dep => {
        visit(dep);
      });

      temp.delete(node);
      visited.add(node);
      result.push(node);
    };

    // 遍历所有插件
    for (const name of this.plugins.keys()) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    this.pluginOrder = result;
  }

  /**
   * 获取插件
   * @param name 插件名称
   * @returns 插件实例或undefined
   */
  public getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name)?.instance;
  }

  /**
   * 获取插件详细信息
   * @param name 插件名称
   */
  public getPluginInfo(name: string): PluginRegistration | undefined {
    return this.plugins.get(name);
  }

  /**
   * 注册钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   * @param options 选项
   */
  public registerHook(
    hookName: string,
    handler: HookHandler,
    options: {
      priority?: PluginPriority;
      plugin?: string;
    } = {}
  ): void {
    const { priority = PluginPriority.NORMAL, plugin = 'anonymous' } = options;

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    const registrations = this.hooks.get(hookName)!;

    // 按优先级插入
    const registration: HookRegistration = { handler, priority, plugin };

    // 找到合适的位置插入（保持优先级降序）
    const index = registrations.findIndex(r => r.priority < priority);
    if (index === -1) {
      // 如果没有找到更低优先级的处理函数，则追加到末尾
      registrations.push(registration);
    } else {
      // 在找到的位置插入
      registrations.splice(index, 0, registration);
    }

    // 触发事件
    this.eventBus?.emit('hook:registered', {
      hookName,
      priority,
      plugin,
    });
  }

  /**
   * 运行钩子
   * @param hookName 钩子名称
   * @param args 传递给钩子的参数
   * @returns 处理结果
   */
  public async runHook(hookName: string, args: any = {}): Promise<HookResult> {
    const registrations = this.hooks.get(hookName) || [];

    if (registrations.length === 0) {
      return {
        handled: false,
        result: undefined,
        modified: false,
      };
    }

    // 初始结果
    let result = args;
    let handled = false;
    let modified = false;
    const errors: Error[] = [];

    // 按注册顺序（已按优先级排序）执行钩子处理函数
    for (const registration of registrations) {
      try {
        // 检查插件是否启用
        if (registration.plugin !== 'anonymous') {
          const pluginInfo = this.plugins.get(registration.plugin);
          if (!pluginInfo || !pluginInfo.enabled) {
            continue; // 跳过禁用的插件
          }
        }

        // 执行钩子处理函数
        const startTime = Date.now();
        const handlerResult = await registration.handler(result);
        const duration = Date.now() - startTime;

        // 记录执行时间过长的钩子
        if (duration > 100) {
          this.logger.warn(
            `钩子 "${hookName}" 由插件 "${registration.plugin}" 执行耗时 ${duration}ms`
          );
        }

        // 处理结果
        if (handlerResult !== undefined) {
          result = handlerResult;
          handled = true;
          modified = true;
        }
      } catch (error) {
        // 记录错误但不中断执行
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        this.logger.error(
          `执行钩子 "${hookName}" 插件 "${registration.plugin}" 发生错误:`,
          err
        );

        // 触发错误事件
        this.eventBus?.emit('hook:error', {
          hookName,
          plugin: registration.plugin,
          error: err,
        });
      }
    }

    // 触发钩子执行完成事件
    this.eventBus?.emit('hook:executed', {
      hookName,
      handled,
      modified,
      hasErrors: errors.length > 0,
    });

    return {
      handled,
      result,
      modified,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 串行运行钩子（一个接一个，前一个的结果传给下一个）
   * @param hookName 钩子名称
   * @param args 初始参数
   */
  public async runHookSerial(
    hookName: string,
    args: any = {}
  ): Promise<HookResult> {
    const registrations = this.hooks.get(hookName) || [];

    if (registrations.length === 0) {
      return {
        handled: false,
        result: args,
        modified: false,
      };
    }

    let result = args;
    let handled = false;
    let modified = false;
    const errors: Error[] = [];

    // 串行执行
    for (const registration of registrations) {
      try {
        // 检查插件是否启用
        if (registration.plugin !== 'anonymous') {
          const pluginInfo = this.plugins.get(registration.plugin);
          if (!pluginInfo || !pluginInfo.enabled) {
            continue;
          }
        }

        // 执行处理函数，传入上一步的结果
        const handlerResult = await registration.handler(result);

        // 如果有返回值，更新结果
        if (handlerResult !== undefined) {
          result = handlerResult;
          handled = true;
          modified = true;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        this.logger.error(
          `串行执行钩子 "${hookName}" 插件 "${registration.plugin}" 发生错误:`,
          err
        );
      }
    }

    return {
      handled,
      result,
      modified,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 并行运行钩子（同时执行所有处理函数）
   * @param hookName 钩子名称
   * @param args 参数
   */
  public async runHookParallel(
    hookName: string,
    args: any = {}
  ): Promise<HookResult> {
    const registrations = this.hooks.get(hookName) || [];

    if (registrations.length === 0) {
      return {
        handled: false,
        result: undefined,
        modified: false,
      };
    }

    // 并行执行所有处理函数
    const promises = registrations
      .filter(registration => {
        // 过滤掉禁用插件的处理函数
        if (registration.plugin === 'anonymous') return true;
        const pluginInfo = this.plugins.get(registration.plugin);
        return pluginInfo && pluginInfo.enabled;
      })
      .map(registration => {
        return new Promise<{ result: any; plugin: string }>(
          (resolve, reject) => {
            try {
              const result = registration.handler(args);
              // 处理异步和同步结果
              if (result instanceof Promise) {
                result
                  .then(value =>
                    resolve({ result: value, plugin: registration.plugin })
                  )
                  .catch(error =>
                    reject({ error, plugin: registration.plugin })
                  );
              } else {
                resolve({ result, plugin: registration.plugin });
              }
            } catch (error) {
              reject({ error, plugin: registration.plugin });
            }
          }
        );
      });

    // 收集结果
    const results = await Promise.allSettled(promises);
    const errors: Error[] = [];
    const validResults: any[] = [];

    // 处理执行结果
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.result !== undefined) {
          validResults.push(result.value.result);
        }
      } else {
        const error =
          result.reason.error instanceof Error
            ? result.reason.error
            : new Error(String(result.reason.error));

        errors.push(error);
        this.logger.error(
          `并行执行钩子 "${hookName}" 插件 "${result.reason.plugin}" 发生错误:`,
          error
        );
      }
    });

    return {
      handled: validResults.length > 0,
      result: validResults,
      modified: validResults.length > 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 移除钩子处理函数
   * @param hookName 钩子名称
   * @param handler 可选，指定要移除的处理函数，不提供则移除所有
   * @param plugin 可选，指定插件名称，仅移除该插件注册的处理函数
   */
  public removeHook(
    hookName: string,
    handler?: HookHandler,
    plugin?: string
  ): void {
    if (!this.hooks.has(hookName)) return;

    // 获取处理函数列表
    const registrations = this.hooks.get(hookName) || [];

    if (!handler && !plugin) {
      // 移除所有处理函数
      this.hooks.delete(hookName);
      return;
    }

    // 根据条件过滤保留的处理函数
    const filtered = registrations.filter(registration => {
      // 如果指定了处理函数，检查是否匹配
      if (handler && registration.handler === handler) {
        return false;
      }

      // 如果指定了插件，检查是否匹配
      if (plugin && registration.plugin === plugin) {
        return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      // 如果没有处理函数，删除钩子
      this.hooks.delete(hookName);
    } else {
      // 更新处理函数列表
      this.hooks.set(hookName, filtered);
    }
  }

  /**
   * 移除插件的所有钩子
   * @param pluginName 插件名称
   */
  public removePluginHooks(pluginName: string): void {
    // 遍历所有钩子
    for (const [hookName, registrations] of this.hooks.entries()) {
      // 过滤掉指定插件的处理函数
      const filtered = registrations.filter(
        registration => registration.plugin !== pluginName
      );

      if (filtered.length === 0) {
        // 如果没有处理函数，删除钩子
        this.hooks.delete(hookName);
      } else {
        // 更新处理函数列表
        this.hooks.set(hookName, filtered);
      }
    }
  }

  /**
   * 启用插件
   * @param name 插件名称
   * @returns 是否成功启用
   */
  public enablePlugin(name: string): boolean {
    const pluginInfo = this.plugins.get(name);
    if (!pluginInfo) {
      return false;
    }

    // 检查依赖是否都已启用
    for (const dep of pluginInfo.dependencies) {
      const depInfo = this.plugins.get(dep);
      if (!depInfo || !depInfo.enabled) {
        this.logger.error(`无法启用插件"${name}"，其依赖"${dep}"未启用`);
        return false;
      }
    }

    // 更新状态
    pluginInfo.enabled = true;

    // 触发事件
    this.eventBus?.emit('plugin:enabled', { name });

    return true;
  }

  /**
   * 禁用插件
   * @param name 插件名称
   * @returns 是否成功禁用
   */
  public disablePlugin(name: string): boolean {
    const pluginInfo = this.plugins.get(name);
    if (!pluginInfo) {
      return false;
    }

    // 检查是否有其他插件依赖此插件
    for (const [otherName, info] of this.plugins.entries()) {
      if (info.enabled && info.dependencies.includes(name)) {
        this.logger.error(`无法禁用插件"${name}"，插件"${otherName}"依赖它`);
        return false;
      }
    }

    // 更新状态
    pluginInfo.enabled = false;

    // 触发事件
    this.eventBus?.emit('plugin:disabled', { name });

    return true;
  }

  /**
   * 判断插件是否已注册
   * @param name 插件名称
   * @returns 是否已注册
   */
  public hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * 判断插件是否已启用
   * @param name 插件名称
   * @returns 是否已启用
   */
  public isPluginEnabled(name: string): boolean {
    const pluginInfo = this.plugins.get(name);
    return !!pluginInfo && pluginInfo.enabled;
  }

  /**
   * 获取所有注册的插件名称
   * @param enabledOnly 是否只返回已启用的插件
   * @returns 插件名称数组
   */
  public getPluginNames(enabledOnly = false): string[] {
    if (!enabledOnly) {
      return Array.from(this.plugins.keys());
    }

    return Array.from(this.plugins.entries())
      .filter(([_, info]) => info.enabled)
      .map(([name]) => name);
  }

  /**
   * 获取所有注册的钩子名称
   * @returns 钩子名称数组
   */
  public getHookNames(): string[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * 获取指定钩子的处理函数数量
   * @param hookName 钩子名称
   * @returns 处理函数数量
   */
  public getHookHandlerCount(hookName: string): number {
    return this.hooks.get(hookName)?.length || 0;
  }

  /**
   * 清空所有插件
   */
  public clearPlugins(): void {
    // 清空插件
    this.plugins.clear();

    // 清空钩子
    this.hooks.clear();

    // 清空依赖关系
    this.pluginDependencies.clear();

    // 重置插件顺序
    this.pluginOrder = [];

    // 触发事件
    this.eventBus?.emit('plugins:cleared');
  }
}

export default PluginManager;
