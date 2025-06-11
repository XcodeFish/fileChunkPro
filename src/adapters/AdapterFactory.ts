/**
 * AdapterFactory.ts
 * 适配器工厂实现，负责创建和管理适配器实例
 */

import { Logger } from '../utils/Logger';
import { EnvironmentType } from './interfaces';
import { EnhancedEnvironmentDetector } from '../utils/EnhancedEnvironmentDetector';
import {
  IUnifiedAdapter,
  IAdapterOptions,
  IAdapterFactory,
  IAdapterBuilder,
} from './OptimizedAdapterInterfaces';

/**
 * 适配器构建器实现
 */
class AdapterBuilder implements IAdapterBuilder {
  private options: IAdapterOptions = {};

  constructor(
    private readonly factory: AdapterFactory,
    private readonly adapterType: EnvironmentType
  ) {}

  /**
   * 构建适配器
   */
  public build(options?: IAdapterOptions): IUnifiedAdapter {
    const mergedOptions = { ...this.options, ...options };
    return this.factory.createAdapter(this.adapterType, mergedOptions);
  }

  /**
   * 设置选项
   */
  public withOptions(options: IAdapterOptions): IAdapterBuilder {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * 设置超时时间
   */
  public withTimeout(timeout: number): IAdapterBuilder {
    this.options.timeout = timeout;
    return this;
  }

  /**
   * 设置最大重试次数
   */
  public withMaxRetries(maxRetries: number): IAdapterBuilder {
    this.options.maxRetries = maxRetries;
    return this;
  }

  /**
   * 设置进度回调
   */
  public withProgressCallback(
    progressCallback: (progress: number) => void
  ): IAdapterBuilder {
    this.options.progressCallback = progressCallback;
    return this;
  }

  /**
   * 设置中止信号
   */
  public withAbortSignal(signal: AbortSignal): IAdapterBuilder {
    this.options.abortSignal = signal;
    return this;
  }

  /**
   * 设置是否携带凭证
   */
  public withCredentials(withCredentials: boolean): IAdapterBuilder {
    this.options.withCredentials = withCredentials;
    return this;
  }
}

/**
 * 适配器工厂实现
 */
export class AdapterFactory implements IAdapterFactory {
  private static instance: AdapterFactory;
  private logger: Logger;
  private adapterRegistry: Map<
    EnvironmentType,
    new (options?: IAdapterOptions) => IUnifiedAdapter
  > = new Map();
  private adapterCache: Map<string, IUnifiedAdapter> = new Map();
  private environmentDetector: EnhancedEnvironmentDetector;

  /**
   * 获取单例实例
   */
  public static getInstance(): AdapterFactory {
    if (!AdapterFactory.instance) {
      AdapterFactory.instance = new AdapterFactory();
    }
    return AdapterFactory.instance;
  }

  /**
   * 构造函数
   */
  private constructor() {
    this.logger = new Logger('AdapterFactory');
    this.environmentDetector = EnhancedEnvironmentDetector.getInstance();
  }

  /**
   * 注册适配器类型
   * @param type 适配器类型
   * @param adapterClass 适配器类构造函数
   */
  public registerAdapter(
    type: EnvironmentType,
    adapterClass: new (options?: IAdapterOptions) => IUnifiedAdapter
  ): void {
    this.adapterRegistry.set(type, adapterClass);
    this.logger.debug(`注册适配器: ${type}`);
  }

  /**
   * 创建适配器
   * @param adapterType 适配器类型
   * @param options 适配器配置
   */
  public createAdapter(
    adapterType: EnvironmentType,
    options?: IAdapterOptions
  ): IUnifiedAdapter {
    // 生成缓存键
    const cacheKey = this.generateCacheKey(adapterType, options);

    // 检查缓存
    if (this.adapterCache.has(cacheKey)) {
      return this.adapterCache.get(cacheKey)!;
    }

    // 查找适配器类
    const AdapterClass = this.adapterRegistry.get(adapterType);
    if (!AdapterClass) {
      throw new Error(`不支持的适配器类型: ${adapterType}`);
    }

    // 创建适配器实例
    try {
      const adapter = new AdapterClass(options);

      // 初始化适配器
      adapter.initialize(options).catch(error => {
        this.logger.error(`适配器初始化失败: ${error}`);
      });

      // 缓存适配器
      this.adapterCache.set(cacheKey, adapter);

      return adapter;
    } catch (error) {
      this.logger.error(`创建适配器失败: ${error}`);
      throw new Error(`创建适配器失败: ${error}`);
    }
  }

  /**
   * 创建适合当前环境的最佳适配器
   * @param options 适配器配置
   */
  public async createBestAdapter(
    options?: IAdapterOptions
  ): Promise<IUnifiedAdapter> {
    try {
      // 检测当前环境
      const envResult = await this.environmentDetector.detect();

      // 尝试按照环境类型匹配
      if (this.adapterRegistry.has(envResult.environmentType)) {
        return this.createAdapter(envResult.environmentType, options);
      }

      // 收集所有适配器实例
      const adapters: IUnifiedAdapter[] = [];
      for (const [type, AdapterClass] of this.adapterRegistry.entries()) {
        try {
          const adapter = new AdapterClass({
            ...options,
            autoDetectFeatures: true,
          });
          await adapter.initialize();
          adapters.push(adapter);
        } catch (error) {
          this.logger.debug(`适配器 ${type} 初始化失败: ${error}`);
        }
      }

      if (adapters.length === 0) {
        throw new Error('没有找到可用的适配器');
      }

      // 筛选支持当前环境的适配器
      const compatibleAdapters = adapters.filter(adapter => {
        // 检查环境主类型是否匹配
        const supportedEnvironments = adapter.getSupportedEnvironments();
        if (supportedEnvironments.includes(envResult.environment)) {
          return true;
        }

        // 检查环境子类型是否匹配
        const supportedTypes = adapter.getSupportedEnvironmentTypes();
        if (supportedTypes.includes(envResult.environmentType)) {
          return true;
        }

        // 检查特性要求是否满足
        const requiredFeatures = adapter.getRequiredFeatures();
        return requiredFeatures.every(
          feature =>
            envResult.features[feature] || envResult.capabilities[feature]
        );
      });

      if (compatibleAdapters.length === 0) {
        // 如果没有完全兼容的，尝试使用第一个可用的适配器
        this.logger.warn(
          '没有找到与当前环境完全兼容的适配器，将使用第一个可用的适配器'
        );
        return adapters[0];
      }

      // 按优先级排序
      compatibleAdapters.sort((a, b) => b.getPriority() - a.getPriority());

      // 使用优先级最高的适配器
      const bestAdapter = compatibleAdapters[0];
      this.logger.debug(`选择最佳适配器: ${bestAdapter.getName()}`);

      return bestAdapter;
    } catch (error) {
      this.logger.error(`创建最佳适配器失败: ${error}`);
      throw new Error(`创建最佳适配器失败: ${error}`);
    }
  }

  /**
   * 获取适配器构建器
   * @param adapterType 适配器类型
   */
  public getBuilder(adapterType: EnvironmentType): IAdapterBuilder {
    return new AdapterBuilder(this, adapterType);
  }

  /**
   * 生成缓存键
   * @param adapterType 适配器类型
   * @param options 适配器配置
   */
  private generateCacheKey(
    adapterType: EnvironmentType,
    options?: IAdapterOptions
  ): string {
    if (!options) {
      return adapterType;
    }

    // 只包含影响适配器行为的关键选项
    const keyOptions = {
      timeout: options.timeout,
      maxRetries: options.maxRetries,
      withCredentials: options.withCredentials,
      autoDetectFeatures: options.autoDetectFeatures,
    };

    return `${adapterType}_${JSON.stringify(keyOptions)}`;
  }

  /**
   * 清除适配器缓存
   */
  public clearCache(): void {
    // 释放资源
    this.adapterCache.forEach(adapter => {
      adapter.dispose();
    });

    this.adapterCache.clear();
    this.logger.debug('已清除适配器缓存');
  }

  /**
   * 获取环境检测器
   */
  public getEnvironmentDetector(): EnhancedEnvironmentDetector {
    return this.environmentDetector;
  }

  /**
   * 获取所有注册的适配器类型
   */
  public getRegisteredAdapterTypes(): EnvironmentType[] {
    return Array.from(this.adapterRegistry.keys());
  }
}

export default AdapterFactory;
