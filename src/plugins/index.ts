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
import { SmartConcurrencyPlugin } from './SmartConcurrencyPlugin';
import { ValidatorPlugin } from './ValidatorPlugin';

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
};
