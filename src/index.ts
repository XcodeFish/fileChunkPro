/**
 * fileChunkPro - 高性能大文件上传工具
 * 主入口文件
 */

// 导入所需模块
import UploaderCore from './core/UploaderCore';
import * as PluginModules from './plugins';

// 导出类型
export * from './types';

// 导出核心模块
export * from './core';

// 导出适配器
export * from './adapters';

// 导出工具类
export { default as EnvUtils } from './utils/EnvUtils';
export { MemoryManager } from './utils/MemoryManager';
export { default as StorageUtils } from './utils/StorageUtils';

// 导出UI组件
export * as UI from './ui';

// 默认导出UploaderCore
export default UploaderCore;

// 导出插件
export const Plugins = PluginModules;
