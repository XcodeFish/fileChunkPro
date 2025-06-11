/**
 * 安全插件动态加载器
 * 根据配置的安全级别动态加载相应的安全插件
 */

import { importSecurityPlugin } from '../../utils/dynamicImport';
import { SECURITY_LEVELS } from '../../utils/constants';
import type { IUploadAdapter } from '../../adapters/interfaces';
import type { IPlugin } from '../interfaces';

/**
 * 安全插件加载选项
 */
export interface SecurityPluginOptions {
  /**
   * 安全级别
   * basic: 基础安全级别
   * standard: 标准安全级别
   * advanced: 高级安全级别
   */
  level: 'basic' | 'standard' | 'advanced';

  /**
   * 加载成功回调
   */
  onLoaded?: (plugin: IPlugin) => void;

  /**
   * 加载失败回调
   */
  onError?: (error: Error) => void;
}

/**
 * 加载安全插件
 * 根据指定的安全级别动态加载相应插件
 */
export class SecurityPluginLoader {
  private options: SecurityPluginOptions;

  /**
   * 创建安全插件加载器
   * @param options 加载选项
   */
  constructor(options: SecurityPluginOptions) {
    this.options = {
      level: SECURITY_LEVELS.BASIC,
      ...options,
    };
  }

  /**
   * 加载安全插件
   * @param uploaderCore 上传核心实例
   */
  async load(uploaderCore: IUploadAdapter): Promise<IPlugin> {
    try {
      // 动态导入安全插件
      const SecurityPluginClass = await importSecurityPlugin(
        this.options.level
      );

      // 实例化插件
      const securityPlugin = new SecurityPluginClass();

      // 安装插件
      securityPlugin.install(uploaderCore);

      // 触发加载成功回调
      if (this.options.onLoaded) {
        this.options.onLoaded(securityPlugin);
      }

      return securityPlugin;
    } catch (error) {
      // 触发错误回调
      if (this.options.onError) {
        this.options.onError(error as Error);
      }

      // 兜底使用基础安全插件
      if (this.options.level !== SECURITY_LEVELS.BASIC) {
        console.warn(
          `加载${this.options.level}安全插件失败，降级使用基础安全插件`
        );
        this.options.level = SECURITY_LEVELS.BASIC;
        return this.load(uploaderCore);
      }

      throw error;
    }
  }

  /**
   * 获取当前安全级别
   */
  getLevel(): string {
    return this.options.level;
  }
}
