/**
 * 适配器模块导出
 * 提供各种环境的适配器实现
 */

import BrowserAdapter from './BrowserAdapter';
import WechatAdapter from './WechatAdapter';

export { BrowserAdapter, WechatAdapter };

export default {
  BrowserAdapter,
  WechatAdapter,
};
