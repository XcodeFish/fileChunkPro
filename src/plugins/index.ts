/**
 * 插件模块导出索引
 */

import { ChunkPlugin } from './ChunkPlugin';
import { ProgressPlugin } from './ProgressPlugin';
import { ResumePlugin } from './ResumePlugin';
import { ValidatorPlugin } from './ValidatorPlugin';

// 导出所有插件
export { ChunkPlugin, ProgressPlugin, ValidatorPlugin, ResumePlugin };

// 默认导出插件对象
export default {
  ChunkPlugin,
  ProgressPlugin,
  ValidatorPlugin,
  ResumePlugin,
};
