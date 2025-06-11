/**
 * PluginManager - 插件管理器
 * 负责管理插件的安装、卸载、依赖管理和钩子注册
 */

import {
  IPlugin,
  PluginConfig,
  PluginPriority,
  PluginRegistration,
  PluginInterfaceMap,
  HookType,
  HookHandler,
  HookResult,
  SecurityLevel,
} from '../types/plugin';
import { EventBus } from './EventBus';
import DependencyContainer from './DependencyContainer';
import { UploadError, ErrorCenter } from './ErrorCenter';
import { UploadErrorType } from '../types';
import SecurityPluginManager, {
  SecurityPluginManagerOptions,
} from '../plugins/security/SecurityPluginManager';

/**
 * 插件管理器类
 */
export class PluginManager {
  /**
   * 已注册的插件
   */
  private plugins: Map<string, PluginRegistration> = new Map();

  /**
   * 钩子处理函数
   */
  private hooks: Map<
    string,
    Array<{
      handler: HookHandler;
      plugin: string;
      priority: PluginPriority;
    }>
  > = new Map();

  /**
   * 事件总线
   */
  private eventBus: EventBus;

  /**
   * 核心上传器引用
   */
  private uploader: any;

  /**
   * 依赖容器
   */
  private container: DependencyContainer;

  /**
   * 错误处理中心
   */
  private errorCenter: ErrorCenter;

  /**
   * 插件接口类型映射
   */
  private interfaceMap: Map<string, keyof PluginInterfaceMap> = new Map();

  /**
   * 安全插件管理器
   */
  private _securityManager?: SecurityPluginManager;

  /**
   * 创建插件管理器
   * @param uploader 上传器实例
   * @param container 依赖容器
   */
  constructor(uploader: any, container: DependencyContainer) {
    this.uploader = uploader;
    this.container = container;
    this.eventBus = container.resolve('eventBus');
    this.errorCenter = container.resolve('errorCenter');

    // 初始化插件接口类型映射
    this.initInterfaceMap();
  }

  /**
   * 初始化插件接口类型映射
   */
  private initInterfaceMap(): void {
    // 注册标准插件类型
    this.interfaceMap.set('ChunkPlugin', 'chunk');
    this.interfaceMap.set('ResumePlugin', 'resume');
    this.interfaceMap.set('ConcurrencyPlugin', 'concurrency');
    this.interfaceMap.set('ValidatorPlugin', 'validator');
    this.interfaceMap.set('ProgressPlugin', 'progress');
    this.interfaceMap.set('PrecheckPlugin', 'precheck');
    this.interfaceMap.set('AdaptiveUploadPlugin', 'adaptive-upload');
    this.interfaceMap.set('ServiceWorkerPlugin', 'service-worker');
    this.interfaceMap.set('SecurityPlugin', 'security');
    this.interfaceMap.set('MonitoringPlugin', 'monitoring');
    this.interfaceMap.set('UIPlugin', 'ui');
  }

  /**
   * 注册插件
   * @param plugin 插件实例
   * @param config 插件配置
   * @returns 是否成功注册
   */
  public register(plugin: IPlugin, config: PluginConfig = {}): boolean {
    try {
      // 检查插件是否有名称
      if (!plugin.name) {
        throw new UploadError(UploadErrorType.PLUGIN_ERROR, '插件必须有名称');
      }

      // 检查是否已注册
      if (this.plugins.has(plugin.name)) {
        throw new UploadError(
          UploadErrorType.PLUGIN_ERROR,
          `插件 "${plugin.name}" 已经注册`
        );
      }

      // 合并默认配置
      const mergedConfig: PluginConfig = {
        enabled: true,
        priority: PluginPriority.NORMAL,
        ...config,
      };

      // 注册插件
      this.plugins.set(plugin.name, {
        plugin,
        config: mergedConfig,
        installed: false,
      });

      // 发出插件注册事件
      this.eventBus.emit('plugin:registered', {
        name: plugin.name,
        version: plugin.version,
        config: mergedConfig,
      });

      // 尝试匹配插件接口类型
      this.detectPluginInterface(plugin);

      // 自动安装
      if (mergedConfig.enabled) {
        this.install(plugin.name);
      }

      return true;
    } catch (error) {
      this.errorCenter.handleError(
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.PLUGIN_ERROR,
              `注册插件 "${plugin.name}" 失败: ${error instanceof Error ? error.message : String(error)}`
            )
      );

      return false;
    }
  }

  /**
   * 检测插件接口类型
   * @param plugin 插件实例
   */
  private detectPluginInterface(plugin: IPlugin): void {
    // 从构造函数名称推断
    const constructorName = plugin.constructor.name;
    const interfaceType = this.interfaceMap.get(constructorName);

    if (interfaceType) {
      // 注册到依赖容器
      this.container.registerInstance(`plugin:${interfaceType}`, plugin);

      // 发出插件接口类型检测事件
      this.eventBus.emit('plugin:interfaceDetected', {
        name: plugin.name,
        interface: interfaceType,
      });
    }
  }

  /**
   * 安装插件
   * @param name 插件名称
   * @returns 是否成功安装
   */
  public install(name: string): boolean {
    try {
      const registration = this.plugins.get(name);

      if (!registration) {
        throw new UploadError(
          UploadErrorType.PLUGIN_ERROR,
          `插件 "${name}" 未注册`
        );
      }

      if (registration.installed) {
        // 已安装，直接返回成功
        return true;
      }

      const { plugin, config } = registration;

      // 检查依赖
      if (plugin.dependencies && plugin.dependencies.length > 0) {
        this.checkDependencies(name, plugin.dependencies);
      }

      // 执行安装
      plugin.install(this.uploader);

      // 更新安装状态
      registration.installed = true;
      registration.installedAt = Date.now();

      // 发出插件安装事件
      this.eventBus.emit('plugin:installed', {
        name: plugin.name,
        version: plugin.version,
        config,
      });

      return true;
    } catch (error) {
      this.errorCenter.handleError(
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.PLUGIN_ERROR,
              `安装插件 "${name}" 失败: ${error instanceof Error ? error.message : String(error)}`
            )
      );

      return false;
    }
  }

  /**
   * 检查插件依赖
   * @param pluginName 插件名称
   * @param dependencies 依赖列表
   */
  private checkDependencies(pluginName: string, dependencies: string[]): void {
    for (const dependency of dependencies) {
      const depRegistration = this.plugins.get(dependency);

      if (!depRegistration) {
        throw new UploadError(
          UploadErrorType.PLUGIN_ERROR,
          `插件 "${pluginName}" 依赖 "${dependency}" 未注册`
        );
      }

      if (!depRegistration.installed) {
        // 尝试安装依赖
        const success = this.install(dependency);

        if (!success) {
          throw new UploadError(
            UploadErrorType.PLUGIN_ERROR,
            `插件 "${pluginName}" 的依赖 "${dependency}" 安装失败`
          );
        }
      }
    }
  }

  /**
   * 卸载插件
   * @param name 插件名称
   * @returns 是否成功卸载
   */
  public uninstall(name: string): boolean {
    try {
      const registration = this.plugins.get(name);

      if (!registration) {
        throw new UploadError(
          UploadErrorType.PLUGIN_ERROR,
          `插件 "${name}" 未注册`
        );
      }

      if (!registration.installed) {
        // 未安装，直接返回成功
        return true;
      }

      const { plugin } = registration;

      // 检查是否有依赖此插件的其他插件
      const dependents = this.findDependents(name);
      if (dependents.length > 0) {
        throw new UploadError(
          UploadErrorType.PLUGIN_ERROR,
          `无法卸载插件 "${name}"，以下插件依赖它: ${dependents.join(', ')}`
        );
      }

      // 执行卸载
      if (plugin.uninstall) {
        plugin.uninstall();
      }

      // 移除所有钩子
      this.removePluginHooks(name);

      // 更新安装状态
      registration.installed = false;

      // 发出插件卸载事件
      this.eventBus.emit('plugin:uninstalled', {
        name: plugin.name,
      });

      return true;
    } catch (error) {
      this.errorCenter.handleError(
        error instanceof UploadError
          ? error
          : new UploadError(
              UploadErrorType.PLUGIN_ERROR,
              `卸载插件 "${name}" 失败: ${error instanceof Error ? error.message : String(error)}`
            )
      );

      return false;
    }
  }

  /**
   * 查找依赖指定插件的其他插件
   * @param name 插件名称
   * @returns 依赖此插件的插件名称列表
   */
  private findDependents(name: string): string[] {
    const dependents: string[] = [];

    this.plugins.forEach((registration, pluginName) => {
      if (
        registration.installed &&
        registration.plugin.dependencies &&
        registration.plugin.dependencies.includes(name)
      ) {
        dependents.push(pluginName);
      }
    });

    return dependents;
  }

  /**
   * 移除插件的所有钩子
   * @param pluginName 插件名称
   */
  private removePluginHooks(pluginName: string): void {
    this.hooks.forEach((handlers, hookType) => {
      const filteredHandlers = handlers.filter(
        item => item.plugin !== pluginName
      );

      if (filteredHandlers.length !== handlers.length) {
        this.hooks.set(hookType, filteredHandlers);
      }
    });
  }

  /**
   * 注册钩子处理函数
   * @param hookType 钩子类型
   * @param handler 处理函数
   * @param pluginName 插件名称
   * @param priority 优先级
   */
  public registerHook(
    hookType: HookType,
    handler: HookHandler,
    pluginName: string,
    priority: PluginPriority = PluginPriority.NORMAL
  ): void {
    // 检查插件是否存在
    if (!this.plugins.has(pluginName)) {
      throw new UploadError(
        UploadErrorType.PLUGIN_ERROR,
        `注册钩子失败: 插件 "${pluginName}" 未注册`
      );
    }

    // 获取钩子处理函数列表
    let handlers = this.hooks.get(hookType);

    if (!handlers) {
      handlers = [];
      this.hooks.set(hookType, handlers);
    }

    // 添加处理函数
    handlers.push({
      handler,
      plugin: pluginName,
      priority,
    });

    // 按优先级排序
    this.sortHookHandlers(hookType);

    // 发出钩子注册事件
    this.eventBus.emit('hook:registered', {
      hookType,
      plugin: pluginName,
      priority,
    });
  }

  /**
   * 按优先级排序钩子处理函数
   * @param hookType 钩子类型
   */
  private sortHookHandlers(hookType: HookType): void {
    const handlers = this.hooks.get(hookType);

    if (handlers) {
      handlers.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * 移除钩子处理函数
   * @param hookType 钩子类型
   * @param pluginName 插件名称
   * @returns 是否成功移除
   */
  public removeHook(hookType: HookType, pluginName: string): boolean {
    const handlers = this.hooks.get(hookType);

    if (!handlers) {
      return false;
    }

    const originalLength = handlers.length;
    const filteredHandlers = handlers.filter(
      item => item.plugin !== pluginName
    );

    if (filteredHandlers.length !== originalLength) {
      this.hooks.set(hookType, filteredHandlers);

      // 发出钩子移除事件
      this.eventBus.emit('hook:removed', {
        hookType,
        plugin: pluginName,
      });

      return true;
    }

    return false;
  }

  /**
   * 执行钩子
   * @param hookType 钩子类型
   * @param params 参数
   * @returns 执行结果
   */
  public async applyHook(
    hookType: HookType,
    params: any = {}
  ): Promise<HookResult> {
    const handlers = this.hooks.get(hookType);

    if (!handlers || handlers.length === 0) {
      // 无处理函数
      return {
        handled: false,
        result: params,
        modified: false,
      };
    }

    let currentParams = { ...params };
    let finalResult = currentParams;
    let modified = false;
    const errors: Error[] = [];

    // 创建执行链
    for (let i = 0; i < handlers.length; i++) {
      const { handler, plugin } = handlers[i];

      try {
        // 构建next函数，传递给处理函数
        const next = async (newParams?: any): Promise<any> => {
          // 如果提供了新参数，更新当前参数
          if (newParams !== undefined) {
            currentParams = newParams;
            modified = true;
          }

          // 如果还有下一个处理函数，继续执行
          if (i < handlers.length - 1) {
            i++; // 移动到下一个处理函数
            const nextHandler = handlers[i];
            try {
              return await nextHandler.handler(currentParams, next);
            } catch (error) {
              errors.push(
                error instanceof Error ? error : new Error(String(error))
              );
              return currentParams;
            }
          } else {
            // 已到达最后一个处理函数，返回当前参数
            return currentParams;
          }
        };

        // 执行处理函数
        finalResult = await handler(currentParams, next);

        // 如果处理函数返回了结果，更新结果
        if (finalResult !== undefined) {
          currentParams = finalResult;
          modified = true;
        }
      } catch (error) {
        // 记录错误并继续执行其他处理函数
        errors.push(error instanceof Error ? error : new Error(String(error)));

        // 记录错误日志
        this.eventBus.emit('hook:error', {
          hookType,
          plugin,
          error,
        });
      }
    }

    // 返回执行结果
    return {
      handled: true,
      result: finalResult,
      modified,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 获取插件
   * @param name 插件名称
   * @returns 插件实例或undefined
   */
  public getPlugin<T extends IPlugin>(name: string): T | undefined {
    const registration = this.plugins.get(name);
    return registration ? (registration.plugin as T) : undefined;
  }

  /**
   * 获取指定接口的插件
   * @param interfaceType 接口类型
   * @returns 插件实例或undefined
   */
  public getPluginByInterface<K extends keyof PluginInterfaceMap>(
    interfaceType: K
  ): PluginInterfaceMap[K] | undefined {
    return this.container.tryResolve<PluginInterfaceMap[K]>(
      `plugin:${interfaceType}`
    );
  }

  /**
   * 获取所有已注册的插件
   * @returns 插件注册信息Map
   */
  public getAllPlugins(): Map<string, PluginRegistration> {
    return new Map(this.plugins);
  }

  /**
   * 启用插件
   * @param name 插件名称
   * @returns 是否成功启用
   */
  public enable(name: string): boolean {
    const registration = this.plugins.get(name);

    if (!registration) {
      return false;
    }

    registration.config.enabled = true;

    // 如果未安装，则安装
    if (!registration.installed) {
      return this.install(name);
    }

    // 发出插件启用事件
    this.eventBus.emit('plugin:enabled', {
      name,
    });

    return true;
  }

  /**
   * 禁用插件
   * @param name 插件名称
   * @returns 是否成功禁用
   */
  public disable(name: string): boolean {
    const registration = this.plugins.get(name);

    if (!registration) {
      return false;
    }

    registration.config.enabled = false;

    // 如果已安装，则卸载
    if (registration.installed) {
      return this.uninstall(name);
    }

    // 发出插件禁用事件
    this.eventBus.emit('plugin:disabled', {
      name,
    });

    return true;
  }

  /**
   * 获取钩子处理函数列表
   * @param hookType 钩子类型
   * @returns 处理函数列表
   */
  public getHookHandlers(hookType: HookType): Array<{
    handler: HookHandler;
    plugin: string;
    priority: PluginPriority;
  }> {
    return [...(this.hooks.get(hookType) || [])];
  }

  /**
   * 检查钩子是否有处理函数
   * @param hookType 钩子类型
   * @returns 是否有处理函数
   */
  public hasHookHandlers(hookType: HookType): boolean {
    const handlers = this.hooks.get(hookType);
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * 清除所有插件
   */
  public clear(): void {
    // 卸载所有已安装的插件
    this.plugins.forEach((registration, name) => {
      if (registration.installed) {
        this.uninstall(name);
      }
    });

    // 清空插件列表
    this.plugins.clear();

    // 清空钩子
    this.hooks.clear();

    // 发出清除事件
    this.eventBus.emit('plugin:allCleared', {});
  }

  /**
   * 初始化安全插件管理器
   * @param options 安全插件管理器选项
   */
  public initSecurityManager(options: SecurityPluginManagerOptions = {}): void {
    // 如果已经存在安全插件管理器，先卸载
    if (this._securityManager) {
      this._securityManager.uninstall();
    }

    // 创建并安装新的安全插件管理器
    this._securityManager = new SecurityPluginManager(options);
    this._securityManager.install(this.uploader);
  }

  /**
   * 根据安全级别加载安全插件
   * @param securityLevel 安全级别
   * @param options 安全插件选项
   * @deprecated 使用initSecurityManager代替
   */
  public loadSecurityPluginByLevel(
    securityLevel: SecurityLevel,
    options: any = {}
  ): void {
    console.warn(
      'loadSecurityPluginByLevel方法已弃用，请使用initSecurityManager代替'
    );

    this.initSecurityManager({
      initialSecurityLevel: securityLevel,
      basicOptions: options,
      standardOptions: options,
      advancedOptions: options,
    });
  }

  /**
   * 获取安全插件管理器
   * @returns 安全插件管理器实例
   */
  public getSecurityManager(): SecurityPluginManager | undefined {
    return this._securityManager;
  }

  /**
   * 升级安全级别
   * @param targetLevel 目标安全级别
   * @returns 是否升级成功
   */
  public upgradeSecurityLevel(targetLevel: SecurityLevel): boolean {
    if (!this._securityManager) {
      console.error('安全插件管理器未初始化，无法升级安全级别');
      return false;
    }

    return this._securityManager.upgradeSecurityLevel(targetLevel);
  }

  /**
   * 降级安全级别
   * @param targetLevel 目标安全级别
   * @returns 是否降级成功
   */
  public downgradeSecurityLevel(targetLevel: SecurityLevel): boolean {
    if (!this._securityManager) {
      console.error('安全插件管理器未初始化，无法降级安全级别');
      return false;
    }

    return this._securityManager.downgradeSecurityLevel(targetLevel);
  }

  /**
   * 获取当前安全级别
   * @returns 当前安全级别
   */
  public getCurrentSecurityLevel(): SecurityLevel | undefined {
    return this._securityManager?.getCurrentSecurityLevel();
  }
}

export default PluginManager;
