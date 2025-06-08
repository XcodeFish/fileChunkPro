/**
 * PluginManager - 插件管理系统
 * 负责插件的注册与管理，以及钩子系统的实现
 */

import { IPlugin } from '../types';

export class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();
  private hooks: Map<string, Array<(...args: any[]) => any>> = new Map();

  /**
   * 注册插件
   * @param name 插件名称
   * @param plugin 插件实例
   */
  public registerPlugin(name: string, plugin: IPlugin): void {
    if (this.plugins.has(name)) {
      console.warn(`[PluginManager] 插件"${name}"已注册，将被覆盖`);
    }

    this.plugins.set(name, plugin);
  }

  /**
   * 获取插件
   * @param name 插件名称
   * @returns 插件实例或undefined
   */
  public getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 注册钩子处理函数
   * @param hookName 钩子名称
   * @param handler 处理函数
   */
  public registerHook(
    hookName: string,
    handler: (...args: any[]) => any
  ): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName)?.push(handler);
  }

  /**
   * 运行钩子
   * @param hookName 钩子名称
   * @param args 传递给钩子的参数
   * @returns 最后一个处理函数的返回值，如果没有处理函数则返回undefined
   */
  public async runHook(hookName: string, ...args: any[]): Promise<any> {
    const handlers = this.hooks.get(hookName);

    if (!handlers || handlers.length === 0) {
      return undefined;
    }

    let result;
    for (const handler of handlers) {
      try {
        // 执行钩子处理函数，并传递参数
        result = await handler(...args);
      } catch (error) {
        console.error(`[PluginManager] 执行钩子"${hookName}"出错:`, error);
        throw error;
      }
    }

    return result;
  }

  /**
   * 移除钩子处理函数
   * @param hookName 钩子名称
   * @param handler 可选，指定要移除的处理函数，不提供则移除所有
   */
  public removeHook(hookName: string, handler?: (...args: any[]) => any): void {
    if (!this.hooks.has(hookName)) return;

    if (!handler) {
      // 移除所有处理函数
      this.hooks.delete(hookName);
      return;
    }

    // 移除指定处理函数
    const handlers = this.hooks.get(hookName) || [];
    const index = handlers.indexOf(handler);

    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.hooks.delete(hookName);
    }
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
   * 获取所有注册的插件名称
   * @returns 插件名称数组
   */
  public getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }
}

export default PluginManager;
