/**
 * EnvironmentDetectorFactory.ts
 * 环境检测器工厂类，简化环境检测器的创建和管理
 */

import {
  IEnvironmentDetector,
  IEnvironmentDetectionOptions,
  IEnvironmentDetectorFactory,
} from '../types/environment-detection';
import { EnhancedEnvironmentDetector } from './EnhancedEnvironmentDetector';
import { Logger } from './Logger';

/**
 * 环境检测器工厂
 */
export class EnvironmentDetectorFactory implements IEnvironmentDetectorFactory {
  private static instance: EnvironmentDetectorFactory;
  private detectorCache: Map<string, IEnvironmentDetector> = new Map();
  private logger: Logger;

  /**
   * 获取单例实例
   */
  public static getInstance(): EnvironmentDetectorFactory {
    if (!EnvironmentDetectorFactory.instance) {
      EnvironmentDetectorFactory.instance = new EnvironmentDetectorFactory();
    }
    return EnvironmentDetectorFactory.instance;
  }

  /**
   * 构造函数
   */
  private constructor() {
    this.logger = new Logger('EnvironmentDetectorFactory');
  }

  /**
   * 创建环境检测器
   * @param options 检测选项
   * @returns 环境检测器实例
   */
  public createDetector(
    options?: IEnvironmentDetectionOptions
  ): IEnvironmentDetector {
    const key = this.getCacheKey(options);

    // 如果缓存中存在，直接返回
    if (this.detectorCache.has(key)) {
      return this.detectorCache.get(key)!;
    }

    // 创建增强版环境检测器
    const detector = EnhancedEnvironmentDetector.getInstance(options);

    // 缓存检测器
    this.detectorCache.set(key, detector);
    return detector;
  }

  /**
   * 创建轻量级环境检测器
   * 适用于只需进行简单环境检测的场景
   */
  public createLightDetector(): IEnvironmentDetector {
    // 配置轻量级选项
    const options: IEnvironmentDetectionOptions = {
      enableCache: true,
      detectWebView: false,
      detectDeviceCapabilities: false,
      applyFeatureDatabase: false,
      autoAdjustSettings: true,
    };

    return this.createDetector(options);
  }

  /**
   * 创建完整的环境检测器
   * 进行全面的环境检测和能力评估
   */
  public createFullDetector(): IEnvironmentDetector {
    const options: IEnvironmentDetectionOptions = {
      enableCache: true,
      detectWebView: true,
      detectDeviceCapabilities: true,
      applyFeatureDatabase: true,
      autoAdjustSettings: true,
    };

    return this.createDetector(options);
  }

  /**
   * 创建调试版环境检测器
   * 包含详细的日志输出
   */
  public createDebugDetector(): IEnvironmentDetector {
    const options: IEnvironmentDetectionOptions = {
      enableCache: false,
      detectWebView: true,
      detectDeviceCapabilities: true,
      applyFeatureDatabase: true,
      autoAdjustSettings: true,
      debug: true,
    };

    return this.createDetector(options);
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(options?: IEnvironmentDetectionOptions): string {
    if (!options) {
      return 'default';
    }

    return JSON.stringify({
      enableCache: options.enableCache ?? true,
      detectWebView: options.detectWebView ?? true,
      detectDeviceCapabilities: options.detectDeviceCapabilities ?? true,
      applyFeatureDatabase: options.applyFeatureDatabase ?? true,
      autoAdjustSettings: options.autoAdjustSettings ?? true,
      debug: options.debug ?? false,
    });
  }

  /**
   * 清除检测器缓存
   */
  public clearCache(): void {
    this.detectorCache.forEach(detector => {
      detector.resetCache();
    });

    this.detectorCache.clear();
    this.logger.debug('已清除环境检测器缓存');
  }

  /**
   * 获取默认检测器
   * 使用推荐的默认配置
   */
  public getDefaultDetector(): IEnvironmentDetector {
    return this.createDetector();
  }
}

export default EnvironmentDetectorFactory;
