/**
 * 插件模块导出索引
 */

import { ChunkPlugin } from './ChunkPlugin';
import {
  PrecheckPlugin,
  PrecheckOptions,
  PrecheckResult,
} from './PrecheckPlugin';
import { ProgressPlugin } from './ProgressPlugin';
import { PWAPlugin, PWAPluginOptions } from './PWAPlugin';
import { ResumePlugin } from './ResumePlugin';
import { BasicSecurityPlugin, getSecurityPluginByLevel } from './security';
import { SmartConcurrencyPlugin } from './SmartConcurrencyPlugin';
import { ValidatorPlugin } from './ValidatorPlugin';
import { StoragePlugin } from './StoragePlugin';
import {
  QueuePlugin,
  QueuePluginOptions,
  QueueItem,
  QueueItemStatus,
  QueueSortMode,
  QueueStats,
} from './QueuePlugin';
import PipelinePlugin from './pipeline';
import { WasmPlugin, WasmPluginOptions } from './WasmPlugin';
import SmartRetryPlugin from './smartRetry';
import { AdaptiveUploadPlugin } from './AdaptiveUploadPlugin';
import { MonitoringPlugin, MonitoringPluginOptions } from './MonitoringPlugin';
import { DeveloperToolsPlugin } from './DeveloperToolsPlugin';
import { ConcurrencyPlugin } from './ConcurrencyPlugin';
import { StandardSecurityPlugin } from './security/StandardSecurityPlugin';
import { AdvancedSecurityPlugin } from './security/AdvancedSecurityPlugin';
import { AccessibilityPlugin } from './AccessibilityPlugin';
import { I18nPlugin } from './I18nPlugin';
// 导入安全插件

// 导出所有插件
// 核心插件
export * from './ChunkPlugin';
export * from './ConcurrencyPlugin';
export * from './ResumePlugin';
export * from './ValidatorPlugin';
export * from './ProgressPlugin';
export * from './PrecheckPlugin';
export * from './SmartConcurrencyPlugin';
export * from './PipelinePlugin';
export * from './QueuePlugin';
export * from './MonitoringPlugin';
export * from './DeveloperToolsPlugin';

// 安全插件
export * from './security/BasicSecurityPlugin';
export * from './security/StandardSecurityPlugin';
export * from './security/AdvancedSecurityPlugin';

// 国际化与无障碍插件
export * from './AccessibilityPlugin';
export * from './I18nPlugin';

// 导出所有插件
export {
  ChunkPlugin,
  ProgressPlugin,
  ValidatorPlugin,
  ResumePlugin,
  PrecheckPlugin,
  PrecheckOptions,
  PrecheckResult,
  SmartConcurrencyPlugin,
  PWAPlugin,
  PWAPluginOptions,
  StoragePlugin,
  QueuePlugin,
  QueuePluginOptions,
  QueueItem,
  QueueItemStatus,
  QueueSortMode,
  QueueStats,
  // 导出安全插件
  BasicSecurityPlugin,
  getSecurityPluginByLevel,
  PipelinePlugin,
  // 导出WebAssembly优化插件
  WasmPlugin,
  WasmPluginOptions,
  // 导出智能重试插件
  SmartRetryPlugin,
  AdaptiveUploadPlugin,
  MonitoringPlugin,
  MonitoringPluginOptions,
  DeveloperToolsPlugin,
};

// 默认导出插件对象
export default {
  ChunkPlugin,
  ProgressPlugin,
  ValidatorPlugin,
  ResumePlugin,
  PrecheckPlugin,
  SmartConcurrencyPlugin,
  PWAPlugin,
  StoragePlugin,
  QueuePlugin,
  // 导出安全插件
  BasicSecurityPlugin,
  getSecurityPluginByLevel,
  PipelinePlugin,
  // 导出WebAssembly优化插件
  WasmPlugin,
  // 导出智能重试插件
  SmartRetryPlugin,
  AdaptiveUploadPlugin,
  MonitoringPlugin,
  MonitoringPluginOptions,
  DeveloperToolsPlugin,
  ConcurrencyPlugin,
  StandardSecurityPlugin,
  AdvancedSecurityPlugin,
  AccessibilityPlugin,
  I18nPlugin,
};
