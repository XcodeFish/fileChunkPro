/**
 * 插件模块导出索引
 */

import { ChunkPlugin } from './ChunkPlugin';
import { PrecheckPlugin } from './PrecheckPlugin';
import { ProgressPlugin } from './ProgressPlugin';
import { ResumePlugin } from './ResumePlugin';
import { ValidatorPlugin } from './ValidatorPlugin';

// 导出所有插件
export {
  ChunkPlugin,
  ProgressPlugin,
  ValidatorPlugin,
  ResumePlugin,
  PrecheckPlugin,
};

// 默认导出插件对象
export default {
  ChunkPlugin,
  ProgressPlugin,
  ValidatorPlugin,
  ResumePlugin,
  PrecheckPlugin,
};
