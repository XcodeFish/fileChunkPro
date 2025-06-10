/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * UploadStrategyManager - 上传策略管理器
 * 负责管理和提供上传策略，包括自动选择最佳策略
 */

import {
  UploadStrategy,
  NetworkQuality,
  DeviceCapability,
  Environment,
  IUploadStrategy,
  UploadStrategyType,
  UploadOptions,
  EnvironmentInfo,
  FileInfo,
} from '../types';
import EnvUtils from '../utils/EnvUtils';
import EventBus from './EventBus';
import dependencyContainer from './DependencyContainer';

/**
 * 上传策略管理器
 * 负责选择和执行适合当前环境和文件特性的上传策略
 */
export class UploadStrategyManager {
  private strategies: Map<UploadStrategyType, IUploadStrategy> = new Map();
  private eventBus: EventBus;
  private defaultStrategy: UploadStrategyType = UploadStrategyType.STANDARD;

  constructor() {
    this.eventBus = dependencyContainer.getService<EventBus>('eventBus');
  }

  /**
   * 注册上传策略
   * @param type 策略类型
   * @param strategy 策略实现
   */
  public registerStrategy(
    type: UploadStrategyType,
    strategy: IUploadStrategy
  ): void {
    this.strategies.set(type, strategy);
    this.eventBus.emit('strategyManager:strategyRegistered', { type });
  }

  /**
   * 设置默认策略
   * @param type 默认策略类型
   */
  public setDefaultStrategy(type: UploadStrategyType): void {
    if (!this.strategies.has(type)) {
      throw new Error(`Strategy type '${type}' is not registered`);
    }
    this.defaultStrategy = type;
  }

  /**
   * 获取上传策略
   * @param type 策略类型，不指定则返回默认策略
   * @returns 上传策略实现
   */
  public getStrategy(type?: UploadStrategyType): IUploadStrategy {
    const strategyType = type || this.defaultStrategy;
    const strategy = this.strategies.get(strategyType);

    if (!strategy) {
      throw new Error(`Strategy type '${strategyType}' is not registered`);
    }

    return strategy;
  }

  /**
   * 根据文件信息和环境信息自动选择最优上传策略
   * @param fileInfo 文件信息
   * @param envInfo 环境信息
   * @returns 最优上传策略
   */
  public selectOptimalStrategy(
    fileInfo: FileInfo,
    envInfo: EnvironmentInfo
  ): IUploadStrategy {
    // 发出策略选择事件，允许插件修改选择逻辑
    const result = this.eventBus.emit('strategyManager:selectStrategy', {
      fileInfo,
      envInfo,
      recommendedType: this.defaultStrategy,
    });

    // 使用事件处理结果中的推荐策略类型
    const recommendedType = result.recommendedType || this.defaultStrategy;

    // 尝试获取推荐策略
    try {
      return this.getStrategy(recommendedType);
    } catch (error) {
      // 如果推荐策略不可用，回退到默认策略
      return this.getStrategy();
    }
  }

  /**
   * 应用上传策略
   * @param file 文件对象
   * @param options 上传选项
   * @param strategy 指定的上传策略，不指定则自动选择
   * @returns 策略执行的结果
   */
  public async applyStrategy(
    file: File | Blob,
    options: UploadOptions,
    strategy?: IUploadStrategy
  ): Promise<void> {
    const fileInfo: FileInfo = {
      size: file.size,
      type: file.type,
      name: 'name' in file ? file.name : 'unnamed-blob',
    };

    // 获取环境信息
    const envInfo =
      dependencyContainer.getService<EnvironmentInfo>('environmentInfo');

    // 确定使用的策略
    const uploadStrategy =
      strategy || this.selectOptimalStrategy(fileInfo, envInfo);

    // 执行策略
    await uploadStrategy.execute(file, options);
  }

  /**
   * 获取所有已注册的策略类型
   * @returns 策略类型数组
   */
  public getRegisteredStrategyTypes(): UploadStrategyType[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 移除已注册的策略
   * @param type 策略类型
   * @returns 是否成功移除
   */
  public removeStrategy(type: UploadStrategyType): boolean {
    // 不允许移除默认策略
    if (type === this.defaultStrategy) {
      throw new Error(`Cannot remove default strategy (${type})`);
    }

    const result = this.strategies.delete(type);

    if (result) {
      this.eventBus.emit('strategyManager:strategyRemoved', { type });
    }

    return result;
  }
}

export default UploadStrategyManager;
