/**
 * adapters/index.ts
 * 适配器导出和注册
 */

import { EnvironmentType } from './interfaces';
import AdapterFactory from './AdapterFactory';
import BrowserUnifiedAdapter from './BrowserUnifiedAdapter';

/**
 * 注册适配器类型
 */
export function registerAdapters() {
  const factory = AdapterFactory.getInstance();

  // 注册浏览器适配器
  factory.registerAdapter(EnvironmentType.BROWSER, BrowserUnifiedAdapter);

  // 可以注册其他类型的适配器
  // factory.registerAdapter(EnvironmentType.WECHAT_MINIPROGRAM, WechatMiniProgramAdapter);
  // factory.registerAdapter(EnvironmentType.ALIPAY_MINIPROGRAM, AlipayMiniProgramAdapter);

  return factory;
}

// 导出适配器相关类
export { default as AdapterFactory } from './AdapterFactory';
export { default as AbstractUnifiedAdapter } from './AbstractUnifiedAdapter';
export { default as BrowserUnifiedAdapter } from './BrowserUnifiedAdapter';

// 导出接口
export * from './OptimizedAdapterInterfaces';
export * from './interfaces';
