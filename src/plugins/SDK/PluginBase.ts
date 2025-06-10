/**
 * PluginBase - 插件基类
 * 所有SDK插件的基础类，提供通用功能和生命周期管理
 */

import {
  IPluginContext,
  ISDKPlugin,
  PluginMetadata,
  PluginLifecycleHook,
  ExtensionPoint,
  ExtensionOptions,
  PluginPriority,
} from '../../types';

/**
 * 插件基类
 * 提供插件的基本功能和生命周期管理
 */
export abstract class PluginBase implements ISDKPlugin {
  /**
   * 插件元数据
   */
  public readonly metadata: PluginMetadata;

  /**
   * 插件上下文
   */
  protected context?: IPluginContext;

  /**
   * 是否已安装
   */
  protected installed = false;

  /**
   * 是否已初始化
   */
  protected initialized = false;

  /**
   * 已注册的钩子处理函数
   */
  protected registeredHooks: Map<string, Array<(...args: any[]) => any>> =
    new Map();

  /**
   * 已注册的扩展点
   */
  protected registeredExtensions: Map<string, any[]> = new Map();

  /**
   * 构造函数
   * @param metadata 插件元数据
   */
  constructor(metadata: PluginMetadata) {
    this.metadata = {
      ...metadata,
      // 确保必填字段存在
      name: metadata.name || 'unnamed-plugin',
      version: metadata.version || '1.0.0',
    };
  }

  /**
   * 安装插件
   * 此方法在插件被注册到系统时调用
   * @param context 插件上下文
   */
  public install(context: IPluginContext): void {
    if (this.installed) {
      context.log('warn', `插件 ${this.metadata.name} 已经安装，不会重复安装`);
      return;
    }

    this.context = context;
    this.installed = true;

    // 注册生命周期钩子
    this.registerLifecycleHooks();

    // 调用子类的安装方法
    this.onInstall();

    context.log(
      'info',
      `插件 ${this.metadata.name}@${this.metadata.version} 安装成功`
    );
  }

  /**
   * 卸载插件
   * 此方法在插件被从系统移除时调用
   */
  public uninstall(): void {
    if (!this.installed || !this.context) {
      return;
    }

    // 调用子类的卸载方法
    this.onUninstall();

    // 清理所有注册的钩子
    this.cleanupHooks();

    // 清理所有注册的扩展点
    this.cleanupExtensions();

    this.context.log('info', `插件 ${this.metadata.name} 卸载成功`);

    this.installed = false;
    this.initialized = false;
    this.context = undefined;
  }

  /**
   * 初始化插件
   * 此方法在所有插件安装完成后调用
   */
  public async init(): Promise<void> {
    if (!this.installed || !this.context) {
      throw new Error(`插件 ${this.metadata.name} 尚未安装，无法初始化`);
    }

    if (this.initialized) {
      this.context.log(
        'warn',
        `插件 ${this.metadata.name} 已经初始化，不会重复初始化`
      );
      return;
    }

    // 调用子类的初始化方法
    await this.onInit();

    this.initialized = true;
    this.context.log('info', `插件 ${this.metadata.name} 初始化成功`);
  }

  /**
   * 销毁插件
   * 此方法在上传器销毁前调用
   */
  public async destroy(): Promise<void> {
    if (!this.installed || !this.context) {
      return;
    }

    // 调用子类的销毁方法
    await this.onDestroy();

    this.initialized = false;
    this.context.log('info', `插件 ${this.metadata.name} 销毁成功`);
  }

  /**
   * 更新插件配置
   * @param config 新配置
   */
  public updateConfig(config: Record<string, any>): void {
    if (!this.context) {
      throw new Error(`插件 ${this.metadata.name} 尚未安装，无法更新配置`);
    }

    // 获取当前配置
    const currentConfig = this.context.getConfig<Record<string, any>>();

    // 合并新配置
    Object.keys(config).forEach(key => {
      this.context?.setConfig(key, config[key]);
    });

    // 调用子类的配置更新方法
    this.onConfigUpdate(currentConfig, config);

    this.context.log('debug', `插件 ${this.metadata.name} 配置已更新`, {
      config,
    });
  }

  /**
   * 获取插件上下文
   * @throws 如果插件尚未安装
   */
  protected getContext(): IPluginContext {
    if (!this.context) {
      throw new Error(`插件 ${this.metadata.name} 尚未安装，无法获取上下文`);
    }
    return this.context;
  }

  /**
   * 注册钩子
   * @param hookName 钩子名称
   * @param handler 处理函数
   * @param priority 优先级
   */
  protected registerHook(
    hookName: string,
    handler: (...args: any[]) => any,
    priority: PluginPriority = PluginPriority.NORMAL
  ): void {
    if (!this.context) {
      throw new Error(`插件 ${this.metadata.name} 尚未安装，无法注册钩子`);
    }

    // 保存处理函数引用，以便后续卸载
    if (!this.registeredHooks.has(hookName)) {
      this.registeredHooks.set(hookName, []);
    }
    this.registeredHooks.get(hookName)!.push(handler);

    // 注册到系统
    this.context.registerHook(hookName, handler, priority);
  }

  /**
   * 注册扩展点实现
   * @param point 扩展点
   * @param implementation 实现
   * @param options 选项
   */
  protected registerExtension(
    point: ExtensionPoint | string,
    implementation: any,
    options: ExtensionOptions = { name: this.metadata.name }
  ): void {
    if (!this.context) {
      throw new Error(
        `插件 ${this.metadata.name} 尚未安装，无法注册扩展点实现`
      );
    }

    // 保存实现引用，以便后续卸载
    if (!this.registeredExtensions.has(point)) {
      this.registeredExtensions.set(point, []);
    }
    this.registeredExtensions.get(point)!.push({ implementation, options });

    // 注册到系统
    this.context.registerExtension(point, implementation, options);
  }

  /**
   * 清理所有注册的钩子
   */
  protected cleanupHooks(): void {
    if (!this.context) {
      return;
    }

    // 移除所有注册的钩子
    this.registeredHooks.forEach((handlers, hookName) => {
      handlers.forEach(handler => {
        this.context?.removeHook(hookName, handler);
      });
    });

    this.registeredHooks.clear();
  }

  /**
   * 清理所有注册的扩展点
   */
  protected cleanupExtensions(): void {
    this.registeredExtensions.clear();
    // 扩展点无法直接移除，但我们可以清理内部引用
  }

  /**
   * 注册生命周期钩子
   * 自动将类方法映射到对应的生命周期钩子
   */
  private registerLifecycleHooks(): void {
    if (!this.context) {
      return;
    }

    // 获取所有生命周期钩子名称
    const lifecycleHooks = Object.values(PluginLifecycleHook);

    // 遍历所有生命周期钩子
    lifecycleHooks.forEach(hookName => {
      // 检查是否有对应的处理方法
      const handlerName = `handle${this.pascalCase(hookName)}`;
      const handler = (this as any)[handlerName];

      if (typeof handler === 'function') {
        // 注册钩子
        this.registerHook(hookName, handler.bind(this));
      }
    });
  }

  /**
   * 将字符串转换为PascalCase
   * @param str 输入字符串
   */
  private pascalCase(str: string): string {
    return str
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }

  /**
   * 插件安装时调用
   * 子类应重写此方法以提供自定义安装逻辑
   */
  protected onInstall(): void {
    // 子类实现
  }

  /**
   * 插件卸载时调用
   * 子类应重写此方法以提供自定义卸载逻辑
   */
  protected onUninstall(): void {
    // 子类实现
  }

  /**
   * 插件初始化时调用
   * 子类应重写此方法以提供自定义初始化逻辑
   */
  protected async onInit(): Promise<void> {
    // 子类实现
  }

  /**
   * 插件销毁时调用
   * 子类应重写此方法以提供自定义销毁逻辑
   */
  protected async onDestroy(): Promise<void> {
    // 子类实现
  }

  /**
   * 插件配置更新时调用
   * 子类应重写此方法以提供自定义配置更新逻辑
   * @param _oldConfig 旧配置
   * @param _newConfig 新配置
   */
  protected onConfigUpdate(
    _oldConfig: Record<string, any>,
    _newConfig: Record<string, any>
  ): void {
    // 子类实现
  }
}
