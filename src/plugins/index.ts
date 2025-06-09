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
  // 导出安全插件
  BasicSecurityPlugin,
  getSecurityPluginByLevel,
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
  // 导出安全插件
  BasicSecurityPlugin,
  getSecurityPluginByLevel,
};
