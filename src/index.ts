/**
 * FileChunkPro - 多环境兼容的文件分片上传解决方案
 * 主入口文件
 */

// 核心模块
import { UploaderCore } from './core/UploaderCore';
import { TaskScheduler } from './core/TaskScheduler';
import { EventBus } from './core/EventBus';
import { PluginManager } from './core/PluginManager';

// 适配器
import { registerAdapters, AdapterFactory } from './adapters';
import { IUnifiedAdapter } from './adapters/OptimizedAdapterInterfaces';

// 环境检测
import { EnhancedEnvironmentDetector } from './utils/EnhancedEnvironmentDetector';
import { EnvironmentDetectorFactory } from './utils/EnvironmentDetectorFactory';

// 配置相关
import { AdaptiveConfigManager } from './utils/AdaptiveConfigManager';
import { FallbackStrategyManager } from './utils/FallbackStrategyManager';
import { MiniProgramOptimizer } from './utils/MiniProgramOptimizer';

// 初始化适配器工厂
const adapterFactory = registerAdapters();

/**
 * 创建上传器实例
 * @param options 上传器配置
 * @returns 上传器实例
 */
export async function createUploader(options: any = {}) {
  try {
    // 初始化环境检测
    const environmentDetector =
      EnvironmentDetectorFactory.getInstance().createFullDetector();
    const environment = await environmentDetector.detect();

    // 创建最佳适配器
    const adapter = await adapterFactory.createBestAdapter();

    // 创建配置管理器
    const configManager = new AdaptiveConfigManager({
      environmentDetection: environment,
      baseConfig: options,
    });

    // 应用环境优化
    const optimizedConfig = configManager.generateOptimalConfiguration();

    // 创建上传器
    const uploader = new UploaderCore({
      ...optimizedConfig,
      adapter,
      eventBus: new EventBus(),
      pluginManager: new PluginManager(),
      taskScheduler: new TaskScheduler(),
    });

    return uploader;
  } catch (error) {
    console.error('创建上传器失败:', error);
    throw error;
  }
}

/**
 * 获取适配器工厂
 * @returns 适配器工厂实例
 */
export function getAdapterFactory(): AdapterFactory {
  return adapterFactory;
}

/**
 * 获取环境检测器
 * @returns 环境检测器
 */
export function getEnvironmentDetector() {
  return EnvironmentDetectorFactory.getInstance().createFullDetector();
}

/**
 * 获取特定类型的适配器
 * @param type 适配器类型
 * @param options 适配器配置
 * @returns 适配器实例
 */
export function getAdapter(type: string, options: any = {}): IUnifiedAdapter {
  return adapterFactory.createAdapter(type as any, options);
}

/**
 * 获取最佳适配器
 * @param options 适配器配置
 * @returns 最佳适配器实例Promise
 */
export function getBestAdapter(options: any = {}): Promise<IUnifiedAdapter> {
  return adapterFactory.createBestAdapter(options);
}

// 导出核心类
export * from './core';

// 导出插件
export * from './plugins';

// 导出适配器接口
export * from './adapters/OptimizedAdapterInterfaces';

// 导出类型
export * from './types';
export * from './types/environment';
export * from './types/environment-detection';

// 导出主要工具类
export {
  EnhancedEnvironmentDetector,
  EnvironmentDetectorFactory,
  AdaptiveConfigManager,
  FallbackStrategyManager,
  MiniProgramOptimizer,
};

// 默认导出
export default {
  createUploader,
  getAdapterFactory,
  getEnvironmentDetector,
  getAdapter,
  getBestAdapter,
};
