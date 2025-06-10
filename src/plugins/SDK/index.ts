/**
 * fileChunkPro 3.0 插件SDK
 * 提供高级插件开发功能和扩展点系统
 */

// 导出SDK核心类
export { PluginSDK } from './PluginSDK';
export { PluginBase } from './PluginBase';
export { PluginContext } from './PluginContext';

// 导出插件SDK类型
export {
  ISDKPlugin,
  IPluginContext,
  PluginLifecycleHook,
  ExtensionPoint,
  ExtensionOptions,
  PluginMetadata,
  PluginRegistrationOptions,
} from '../../types';

/**
 * 创建自定义扩展点
 * @param name 扩展点名称
 * @returns 扩展点标识符
 */
export function createExtensionPoint(name: string): string {
  return `custom:${name}`;
}

/**
 * 快速创建基本的插件元数据
 * @param name 插件名称
 * @param version 插件版本
 * @param options 其他元数据选项
 * @returns 插件元数据对象
 */
export function createPluginMetadata(
  name: string,
  version = '1.0.0',
  options: Partial<PluginMetadata> = {}
): PluginMetadata {
  return {
    name,
    version,
    ...options,
  };
}
