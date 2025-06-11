/**
 * ServiceContainer - 服务容器初始化模块
 * 负责注册和初始化核心服务
 */

import { DependencyContainer } from './DependencyContainer';
import { EventBus } from './EventBus';
import { FileManager } from './FileManager';
import { NetworkManager } from './NetworkManager';
import { PluginManager } from './PluginManager';
import { TaskScheduler } from './TaskScheduler';
import { ErrorCenter } from './error';
import { UploaderOptions } from '../types';
import { Logger } from '../utils/Logger';
import { MemoryManager } from '../utils/MemoryManager';
import { NetworkDetector } from '../utils/NetworkDetector';
import { UploaderCore } from './UploaderCore';

/**
 * 核心服务初始化类
 */
export class ServiceContainer {
  private container: DependencyContainer;
  private logger: Logger;

  /**
   * 创建服务容器
   * @param options 上传器选项
   */
  constructor(options: UploaderOptions = {}) {
    this.container = new DependencyContainer();
    this.logger = new Logger('ServiceContainer');

    // 初始化核心服务
    this.initCoreServices(options);
  }

  /**
   * 初始化核心服务
   * @param options 上传器选项
   */
  private initCoreServices(options: UploaderOptions): void {
    this.logger.debug('初始化核心服务');

    // 注册事件总线
    this.container.registerInstance(
      'eventBus',
      new EventBus({
        debug: options.debug || false,
      })
    );

    // 注册错误中心
    this.container.register('errorCenter', container => {
      return new ErrorCenter(container, {
        enableErrorTracking: options.enableErrorTracking || false,
        errorReportingLevel: options.errorReportingLevel || 'error',
      });
    });

    // 注册内存管理器
    this.container.register('memoryManager', () => {
      const memoryManager = new MemoryManager({
        lowMemoryThreshold: options.lowMemoryThreshold || 0.1,
        criticalMemoryThreshold: options.criticalMemoryThreshold || 0.05,
      });
      return memoryManager;
    });

    // 注册网络检测器
    this.container.register('networkDetector', () => {
      return NetworkDetector.create();
    });

    // 注册任务调度器
    this.container.register('taskScheduler', container => {
      return new TaskScheduler(container, {
        maxConcurrentTasks: options.maxConcurrentTasks || 3,
        priorityLevels: options.priorityLevels || 3,
        defaultTaskTimeout: options.defaultTaskTimeout || 60000,
      });
    });

    // 注册网络管理器
    this.container.register('networkManager', container => {
      return new NetworkManager(container, {
        defaultOptions: options.requestOptions,
        retryStrategy: options.retryStrategy,
      });
    });

    // 注册文件管理器
    this.container.register('fileManager', container => {
      return new FileManager(container, {
        maxFileSize: options.maxFileSize,
        allowedFileTypes: options.allowedFileTypes,
        disallowedFileTypes: options.disallowedFileTypes,
        minChunkSize: options.minChunkSize,
        maxChunkSize: options.maxChunkSize,
      });
    });

    // 注册插件管理器
    this.container.register('pluginManager', container => {
      return new PluginManager(container);
    });

    // 注册UploaderCore
    this.container.register('uploaderCore', container => {
      return new UploaderCore(container, options);
    });
  }

  /**
   * 注册自定义服务
   * @param name 服务名称
   * @param factory 服务工厂函数
   * @param options 注册选项
   * @returns 服务容器实例
   */
  public register<T>(
    name: string,
    factory: (container: DependencyContainer) => T,
    options: {
      lifetime?: 'singleton' | 'transient' | 'scoped';
      tags?: string[];
    } = {}
  ): this {
    this.container.register(name, factory, options);
    return this;
  }

  /**
   * 注册服务实例
   * @param name 服务名称
   * @param instance 服务实例
   * @param tags 标签列表
   * @returns 服务容器实例
   */
  public registerInstance<T>(
    name: string,
    instance: T,
    tags: string[] = []
  ): this {
    this.container.registerInstance(name, instance, tags);
    return this;
  }

  /**
   * 获取服务
   * @param name 服务名称
   * @returns 服务实例
   */
  public getService<T>(name: string): T {
    return this.container.resolve<T>(name);
  }

  /**
   * 尝试获取服务，如果不存在则返回null
   * @param name 服务名称
   * @returns 服务实例或null
   */
  public tryGetService<T>(name: string): T | null {
    return this.container.tryResolve<T>(name);
  }

  /**
   * 获取依赖注入容器
   * @returns 依赖注入容器
   */
  public getContainer(): DependencyContainer {
    return this.container;
  }

  /**
   * 获取上传器核心实例
   * @returns 上传器核心实例
   */
  public getUploaderCore(): UploaderCore {
    return this.container.resolve<UploaderCore>('uploaderCore');
  }

  /**
   * 获取事件总线
   * @returns 事件总线
   */
  public getEventBus(): EventBus {
    return this.container.resolve<EventBus>('eventBus');
  }

  /**
   * 获取插件管理器
   * @returns 插件管理器
   */
  public getPluginManager(): PluginManager {
    return this.container.resolve<PluginManager>('pluginManager');
  }
}

// 导出默认实现
export default ServiceContainer;
