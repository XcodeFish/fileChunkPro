/**
 * 插件模块导出索引
 */

import { ChunkPlugin } from './ChunkPlugin';
import { ProgressPlugin } from './ProgressPlugin';
import { ValidatorPlugin } from './ValidatorPlugin';

// 导出所有插件
export { ChunkPlugin, ProgressPlugin, ValidatorPlugin };

// 默认导出插件对象
export default {
  ChunkPlugin,
  ProgressPlugin,
  ValidatorPlugin,
};
