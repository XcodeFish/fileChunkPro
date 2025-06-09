/**
 * 安全插件模块
 * 导出不同安全级别的插件实现
 */

import { SecurityLevel } from '../../types';

import BasicSecurityPlugin from './BasicSecurityPlugin';
import type { BasicSecurityPluginOptions } from './BasicSecurityPlugin';
import { StandardSecurityPlugin } from './StandardSecurityPlugin';
import type { StandardSecurityPluginOptions } from './StandardSecurityPlugin';

/**
 * 根据安全级别获取对应的安全插件
 * @param level 安全级别
 * @returns 对应的安全插件
 */
export const getSecurityPluginByLevel = (level: SecurityLevel) => {
  switch (level) {
    case SecurityLevel.BASIC:
      return BasicSecurityPlugin;
    case SecurityLevel.STANDARD:
      return StandardSecurityPlugin;
    case SecurityLevel.ADVANCED:
      // TODO: 高级安全级别插件暂未实现
      return StandardSecurityPlugin;
    default:
      return BasicSecurityPlugin;
  }
};

export {
  BasicSecurityPlugin,
  StandardSecurityPlugin,
  // 将来会导出 AdvancedSecurityPlugin
};

export type { BasicSecurityPluginOptions, StandardSecurityPluginOptions };

export default {
  BasicSecurityPlugin,
  StandardSecurityPlugin,
  getSecurityPluginByLevel,
};
