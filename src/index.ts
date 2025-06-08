/**
 * fileChunkPro - 高性能大文件上传工具
 * 主入口文件
 */

// 此处为占位代码，后续需要完善实际功能
// 根据设计方案进行实现

// 导出类型
export * from './types';

// 导出核心模块
export * from './core';

// 导出适配器
export * from './adapters';

// 导出工具类
export { default as EnvUtils } from './utils/EnvUtils';
export { default as MemoryManager } from './utils/MemoryManager';
export { default as StorageUtils } from './utils/StorageUtils';

// 导出UI组件
export * as UI from './ui';

// 默认导出UploaderCore
import UploaderCore from './core/UploaderCore';
export default UploaderCore;

// 导出插件API（占位）
export const Plugins = {};
