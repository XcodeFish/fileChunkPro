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
// 导入安全插件

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
};
