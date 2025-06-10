/**
 * PluginSDK - 插件SDK管理器
 * 统一管理插件SDK功能，提供插件注册、卸载和管理功能
 */

import UploaderCore from '../../core/UploaderCore';
import { PluginContext } from './PluginContext';
import {
  ISDKPlugin,
  PluginMetadata,
  PluginRegistrationOptions,
} from '../../types';
import { Logger } from '../../utils/Logger';

/**
 * 插件SDK管理器
 * 提供插件的注册、卸载和管理功能
 */
export class PluginSDK {
  private core: UploaderCore;
  private plugins: Map<string, ISDKPlugin> = new Map();
  private pluginContexts: Map<string, PluginContext> = new Map();
  private logger: Logger = new Logger('PluginSDK');
  private initialized = false;

  /**
   * 构造函数
   * @param core UploaderCore实例
   */
  constructor(core: UploaderCore) {
    this.core = core;
  }

  /**
   * 注册插件
   * @param plugin 插件实例
   * @param options 注册选项
   */
  public registerPlugin(
    plugin: ISDKPlugin,
    options?: Partial<PluginRegistrationOptions>
  ): void {
    const metadata = plugin.metadata;
    const name = metadata.name;

    // 检查插件是否已注册
    if (this.plugins.has(name)) {
      this.logger.warn(`插件 ${name} 已注册，将被覆盖`);
    }

    // 合并选项
    const finalOptions: PluginRegistrationOptions = {
      name,
      version: metadata.version,
      dependencies: metadata.dependencies || [],
      description: metadata.description,
      author: metadata.author,
      enabled: true,
      config: {},
      ...options,
    };

    // 检查依赖
    if (finalOptions.dependencies && finalOptions.dependencies.length > 0) {
      for (const dep of finalOptions.dependencies) {
        if (!this.plugins.has(dep)) {
          this.logger.warn(`插件 ${name} 依赖的 ${dep} 尚未注册`);
        }
      }
    }

    // 创建插件上下文
    const context = new PluginContext(
      this.core,
      name,
      finalOptions.config || {}
    );
    this.pluginContexts.set(name, context);

    // 安装插件
    try {
      plugin.install(context);
      this.plugins.set(name, plugin);
      this.logger.info(`插件 ${name}@${metadata.version} 注册成功`);
    } catch (error) {
      this.logger.error(`插件 ${name} 注册失败`, error);
      this.pluginContexts.delete(name);
      throw error;
    }

    // 如果SDK已初始化，则初始化新插件
    if (this.initialized) {
      this.initializePlugin(plugin, name).catch(error => {
        this.logger.error(`插件 ${name} 初始化失败`, error);
      });
    }
  }

  /**
   * 卸载插件
   * @param name 插件名称
   */
  public unregisterPlugin(name: string): boolean {
    if (!this.plugins.has(name)) {
      this.logger.warn(`插件 ${name} 未注册，无法卸载`);
      return false;
    }

    // 获取插件
    const plugin = this.plugins.get(name)!;

    // 检查依赖
    const dependents = this.findDependentPlugins(name);
    if (dependents.length > 0) {
      this.logger.warn(
        `插件 ${name} 无法卸载，以下插件依赖它: ${dependents.join(', ')}`
      );
      return false;
    }

    // 卸载插件
    try {
      if (plugin.uninstall) {
        plugin.uninstall();
      }
      this.plugins.delete(name);
      this.pluginContexts.delete(name);
      this.logger.info(`插件 ${name} 卸载成功`);
      return true;
    } catch (error) {
      this.logger.error(`插件 ${name} 卸载失败`, error);
      return false;
    }
  }

  /**
   * 获取插件
   * @param name 插件名称
   */
  public getPlugin(name: string): ISDKPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取插件上下文
   * @param name 插件名称
   */
  public getPluginContext(name: string): PluginContext | undefined {
    return this.pluginContexts.get(name);
  }

  /**
   * 检查插件是否已注册
   * @param name 插件名称
   */
  public hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * 获取所有已注册插件的名称
   */
  public getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * 获取插件元数据
   * @param name 插件名称
   */
  public getPluginMetadata(name: string): PluginMetadata | undefined {
    const plugin = this.plugins.get(name);
    return plugin?.metadata;
  }

  /**
   * 更新插件配置
   * @param name 插件名称
   * @param config 新配置
   */
  public updatePluginConfig(name: string, config: Record<string, any>): void {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`插件 ${name} 未注册`);
    }

    if (plugin.updateConfig) {
      plugin.updateConfig(config);
    } else {
      // 如果插件没有实现updateConfig方法，直接更新上下文配置
      const context = this.pluginContexts.get(name);
      if (context) {
        Object.keys(config).forEach(key => {
          context.setConfig(key, config[key]);
        });
      }
    }
  }

  /**
   * 初始化所有插件
   * 在UploaderCore初始化完成后调用
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('PluginSDK已经初始化，不会重复初始化');
      return;
    }

    // 按依赖顺序初始化插件
    const sortedPlugins = this.sortPluginsByDependencies();

    for (const name of sortedPlugins) {
      await this.initializePlugin(this.plugins.get(name)!, name);
    }

    this.initialized = true;
    this.logger.info('所有插件初始化完成');
  }

  /**
   * 销毁所有插件
   * 在UploaderCore销毁前调用
   */
  public async destroy(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // 逆序销毁插件（先销毁依赖其他插件的插件）
    const sortedPlugins = this.sortPluginsByDependencies().reverse();

    for (const name of sortedPlugins) {
      const plugin = this.plugins.get(name);
      if (plugin && plugin.destroy) {
        try {
          await plugin.destroy();
          this.logger.debug(`插件 ${name} 销毁成功`);
        } catch (error) {
          this.logger.error(`插件 ${name} 销毁失败`, error);
        }
      }
    }

    this.initialized = false;
    this.logger.info('所有插件已销毁');
  }

  /**
   * 初始化单个插件
   * @param plugin 插件实例
   * @param name 插件名称
   */
  private async initializePlugin(
    plugin: ISDKPlugin,
    name: string
  ): Promise<void> {
    if (plugin.init) {
      try {
        await plugin.init();
        this.logger.debug(`插件 ${name} 初始化成功`);
      } catch (error) {
        this.logger.error(`插件 ${name} 初始化失败`, error);
        throw error;
      }
    }
  }

  /**
   * 按依赖关系排序插件
   * 返回按依赖顺序排序的插件名称数组（被依赖的插件在前）
   */
  private sortPluginsByDependencies(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    // 深度优先搜索
    const visit = (name: string) => {
      if (temp.has(name)) {
        throw new Error(`插件依赖存在循环: ${name}`);
      }

      if (visited.has(name)) {
        return;
      }

      temp.add(name);

      // 访问所有依赖
      const plugin = this.plugins.get(name);
      const dependencies = plugin?.metadata.dependencies || [];

      for (const dep of dependencies) {
        if (this.plugins.has(dep)) {
          visit(dep);
        }
      }

      temp.delete(name);
      visited.add(name);
      result.push(name);
    };

    // 遍历所有插件
    for (const name of this.plugins.keys()) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    return result;
  }

  /**
   * 查找依赖指定插件的所有插件
   * @param name 插件名称
   */
  private findDependentPlugins(name: string): string[] {
    const dependents: string[] = [];

    for (const [pluginName, plugin] of this.plugins.entries()) {
      const dependencies = plugin.metadata.dependencies || [];
      if (dependencies.includes(name)) {
        dependents.push(pluginName);
      }
    }

    return dependents;
  }
}
