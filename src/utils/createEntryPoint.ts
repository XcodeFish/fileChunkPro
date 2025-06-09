/* eslint-disable */
/**
 * 入口点生成工具
 * 支持环境特定的按需加载
 */

import UploaderCore from '../core/UploaderCore';
import { IPlugin } from '../plugins/interfaces';

/**
 * 入口点选项接口
 */
interface EntryPointOptions {
  /**
   * 适配器工厂函数
   */
  adapter: (config: Record<string, any>) => any;

  /**
   * 默认加载的插件
   */
  defaultPlugins?: IPlugin[];

  /**
   * 按需加载的插件配置
   */
  lazyPlugins?: Record<
    string,
    () => Promise<{ default: new (...args: any[]) => IPlugin }>
  >;

  /**
   * 环境特性
   */
  features?: Record<string, boolean | number | string>;
}

/**
 * 创建特定环境的入口点
 * @param options 入口点选项
 * @returns FileChunkPro类
 */
export function createEntryPoint(options: EntryPointOptions): any {
  const {
    adapter,
    defaultPlugins = [],
    lazyPlugins = {},
    features = {},
  } = options;

  // 定义FileChunkPro类
  return class FileChunkPro extends UploaderCore {
    constructor(config: Record<string, any> = {}) {
      // 合并环境特定配置
      const mergedConfig = {
        ...config,
        adapter: adapter(config),
        features,
        endpoint: config.endpoint || 'https://example.com/upload', // 提供默认endpoint避免类型错误
      };

      super(mergedConfig);

      // 加载默认插件
      defaultPlugins.forEach(plugin => {
        this.use(plugin);
      });

      // 加载用户配置的插件
      if (config.plugins && Array.isArray(config.plugins)) {
        config.plugins.forEach((plugin: IPlugin) => {
          this.use(plugin);
        });
      }
    }

    /**
     * 按需加载插件
     * @param pluginName 插件名称
     * @param options 插件选项
     * @returns Promise
     */
    async loadPlugin(pluginName: string, options: Record<string, any> = {}) {
      if (!lazyPlugins[pluginName]) {
        throw new Error(
          `Plugin "${pluginName}" not found or not supported in current environment`
        );
      }

      try {
        const module = await lazyPlugins[pluginName]();
        const PluginClass = module.default;
        const plugin = new PluginClass(options);
        this.use(plugin);
        return plugin;
      } catch (error) {
        console.error(`Failed to load plugin "${pluginName}":`, error);
        throw error;
      }
    }
  };
}
