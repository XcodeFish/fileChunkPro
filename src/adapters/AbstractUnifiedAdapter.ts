/**
 * AbstractUnifiedAdapter.ts
 * 抽象通用适配器基类，实现共享功能，减少子类重复代码
 */

import { Logger } from '../utils/Logger';
import { NetworkQuality } from '../types';
import { Environment } from '../types/environment';
import { EnvironmentType } from './interfaces';
import {
  IUnifiedAdapter,
  IAdapterOptions,
  IChunkMetadata,
  IRequestOptions,
  IResponse,
  IFileInfo,
} from './OptimizedAdapterInterfaces';

/**
 * 抽象通用适配器
 * 提供适配器公共功能实现
 */
export abstract class AbstractUnifiedAdapter implements IUnifiedAdapter {
  protected options: IAdapterOptions;
  protected logger: Logger;
  protected networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  protected supportedFeatures: Record<string, boolean> = {};
  protected initialized = false;

  /**
   * 构造函数
   * @param name 适配器名称
   * @param options 适配器选项
   */
  constructor(
    protected name: string,
    options: IAdapterOptions = {}
  ) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      withCredentials: false,
      autoDetectFeatures: true,
      debug: false,
      ...options,
    };

    this.logger = new Logger(`${name}Adapter`);

    if (this.options.debug) {
      this.logger.setLevel('debug');
    }
  }

  /**
   * 初始化适配器
   */
  public async initialize(options?: IAdapterOptions): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.debug('初始化适配器');

    if (options) {
      this.options = { ...this.options, ...options };
    }

    if (this.options.autoDetectFeatures) {
      this.supportedFeatures = this.detectFeatures();
    }

    await this.onInitialize();

    this.initialized = true;
    this.logger.debug('适配器初始化完成');
  }

  /**
   * 适配器初始化钩子
   * 子类可重写此方法实现特殊初始化逻辑
   */
  protected async onInitialize(): Promise<void> {
    // 默认实现为空
  }

  /**
   * 获取适配器名称
   */
  public getName(): string {
    return this.name;
  }

  /**
   * 获取适配器优先级
   * 子类应重写此方法返回适当优先级
   */
  public getPriority(): number {
    return 0;
  }

  /**
   * 获取适配器支持的环境类型列表
   * 子类应重写此方法返回支持的环境类型
   */
  public abstract getSupportedEnvironments(): Environment[];

  /**
   * 获取适配器支持的环境子类型列表
   * 子类应重写此方法返回支持的环境子类型
   */
  public abstract getSupportedEnvironmentTypes(): EnvironmentType[];

  /**
   * 获取适配器需要的特性列表
   * 子类应重写此方法返回需要的特性
   */
  public abstract getRequiredFeatures(): string[];

  /**
   * 获取环境类型
   * 子类应重写此方法返回当前环境子类型
   */
  public abstract getEnvironmentType(): EnvironmentType;

  /**
   * 获取环境主类型
   * 子类应重写此方法返回当前环境主类型
   */
  public abstract getEnvironment(): Environment;

  /**
   * 读取文件片段
   * 子类必须实现此方法
   */
  public abstract readChunk(
    file: any,
    start: number,
    size: number
  ): Promise<ArrayBuffer>;

  /**
   * 获取文件信息
   * 子类必须实现此方法
   */
  public abstract getFileInfo(file: any): Promise<IFileInfo>;

  /**
   * 检测特性支持情况
   * 子类必须实现此方法
   */
  public abstract detectFeatures(): Record<string, boolean>;

  /**
   * 获取存储提供者
   * 子类必须实现此方法
   */
  public abstract getStorage(): any;

  /**
   * 发送HTTP请求
   * 子类必须实现此方法
   */
  public abstract request(
    url: string,
    options?: IRequestOptions
  ): Promise<IResponse>;

  /**
   * 上传分片
   * 子类必须实现此方法
   */
  public abstract uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: IChunkMetadata
  ): Promise<any>;

  /**
   * 设置网络质量
   * 子类可以重写此方法实现特定逻辑
   */
  public setNetworkQuality(quality: NetworkQuality): void {
    this.networkQuality = quality;
  }

  /**
   * 获取当前网络质量
   */
  public getNetworkQuality(): NetworkQuality {
    return this.networkQuality;
  }

  /**
   * 检查是否支持特定特性
   */
  public supportsFeature(feature: string): boolean {
    return !!this.supportedFeatures[feature];
  }

  /**
   * 计算重试延迟时间(指数退避策略)
   * @param retryCount 当前重试次数
   * @param baseDelay 基础延迟时间
   */
  protected calculateRetryDelay(retryCount: number, baseDelay = 1000): number {
    // 使用指数退避策略计算延迟时间
    // 公式: baseDelay * 2^retryCount + randomMs
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitterMs = Math.random() * 1000; // 0-1000ms的随机抖动
    return exponentialDelay + jitterMs;
  }

  /**
   * 等待特定时间
   * @param ms 毫秒
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建可中止的延迟
   * @param ms 延迟时间（毫秒）
   * @param signal 中止信号
   */
  protected createAbortableDelay(
    ms: number,
    signal?: AbortSignal
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 如果已经中止，直接拒绝
      if (signal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }

      // 创建定时器
      const timer = setTimeout(() => resolve(), ms);

      // 监听中止事件
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('Operation aborted'));
          },
          { once: true }
        );
      }
    });
  }

  /**
   * 带重试的异步操作执行器
   * @param operation 异步操作
   * @param retryOptions 重试选项
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryOptions: {
      maxRetries?: number;
      retryCondition?: (error: any) => boolean;
      onRetry?: (error: any, retryCount: number) => void;
      baseDelay?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = this.options.maxRetries || 3,
      retryCondition = () => true,
      onRetry,
      baseDelay = 1000,
      signal,
    } = retryOptions;

    let retryCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // 检查是否已中止
        if (signal?.aborted) {
          throw new Error('Operation aborted');
        }

        return await operation();
      } catch (error) {
        // 达到最大重试次数或不满足重试条件，抛出错误
        if (
          retryCount >= maxRetries ||
          !retryCondition(error) ||
          signal?.aborted
        ) {
          throw error;
        }

        // 计算延迟时间
        const delayMs = this.calculateRetryDelay(retryCount, baseDelay);

        // 调用重试回调
        if (onRetry) {
          onRetry(error, retryCount);
        }

        this.logger.debug(
          `操作失败，${delayMs}ms后重试(${retryCount + 1}/${maxRetries})`,
          error
        );

        // 等待后重试
        await this.createAbortableDelay(delayMs, signal);

        retryCount++;
      }
    }
  }

  /**
   * 获取推荐配置
   */
  public getRecommendedConfig(): Record<string, any> {
    // 默认配置
    return {
      timeout: this.options.timeout || 30000,
      maxRetries: this.options.maxRetries || 3,
      withCredentials: this.options.withCredentials || false,
    };
  }

  /**
   * 销毁适配器，释放资源
   */
  public dispose(): void {
    this.logger.debug('销毁适配器');
    this.onDispose();
  }

  /**
   * 适配器销毁钩子
   * 子类可重写此方法实现特殊销毁逻辑
   */
  protected onDispose(): void {
    // 默认实现为空
  }
}

export default AbstractUnifiedAdapter;
