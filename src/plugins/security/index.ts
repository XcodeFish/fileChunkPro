/**
 * 安全插件模块
 * 导出不同安全级别的插件实现
 */

import { SecurityLevel } from '../../types';

import BasicSecurityPlugin from './BasicSecurityPlugin';

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
      // TODO: 标准安全级别插件暂未实现
      return BasicSecurityPlugin;
    case SecurityLevel.ADVANCED:
      // TODO: 高级安全级别插件暂未实现
      return BasicSecurityPlugin;
    default:
      return BasicSecurityPlugin;
  }
};

export {
  BasicSecurityPlugin,
  // 将来会导出 StandardSecurityPlugin 和 AdvancedSecurityPlugin
};

export default {
  BasicSecurityPlugin,
  getSecurityPluginByLevel,
};
