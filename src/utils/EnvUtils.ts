/**
 * EnvUtils - 环境检测工具
 * 提供当前运行环境检测与相关功能
 */

import { Environment } from '../types';

// 针对缺少的全局对象类型声明
interface FileSystemManager {
  readFile: (options: any) => void;
  writeFile: (options: any) => void;
  // 添加其他常用方法...
}

declare const wx: { getFileSystemManager: () => FileSystemManager } | undefined;
declare const my: { getFileSystemManager: () => FileSystemManager } | undefined;
declare const tt: { getFileSystemManager: () => FileSystemManager } | undefined;
declare const swan:
  | { getFileSystemManager: () => FileSystemManager }
  | undefined;
declare const uni: any | undefined;

export class EnvUtils {
  /**
   * 检测当前环境
   */
  static detectEnvironment(): Environment {
    // 浏览器环境
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return Environment.Browser;
    }

    // ReactNative环境
    if (
      typeof global !== 'undefined' &&
      typeof global.navigator !== 'undefined' &&
      global.navigator.product === 'ReactNative'
    ) {
      return Environment.ReactNative;
    }

    // 微信小程序
    if (
      typeof wx !== 'undefined' &&
      typeof wx.getFileSystemManager === 'function'
    ) {
      return Environment.WechatMP;
    }

    // 支付宝小程序
    if (
      typeof my !== 'undefined' &&
      typeof my.getFileSystemManager === 'function'
    ) {
      return Environment.AlipayMP;
    }

    // 字节跳动小程序
    if (
      typeof tt !== 'undefined' &&
      typeof tt.getFileSystemManager === 'function'
    ) {
      return Environment.BytedanceMP;
    }

    // 百度小程序
    if (
      typeof swan !== 'undefined' &&
      typeof swan.getFileSystemManager === 'function'
    ) {
      return Environment.BaiduMP;
    }

    // Taro环境 (检查Taro全局对象)
    if (typeof process !== 'undefined' && process.env && process.env.TARO_ENV) {
      return Environment.TaroMP;
    }

    // Uni-App环境
    if (typeof uni !== 'undefined') {
      return Environment.UniAppMP;
    }

    // Node.js环境
    if (
      typeof process !== 'undefined' &&
      process.versions &&
      process.versions.node
    ) {
      return Environment.NodeJS;
    }

    return Environment.Unknown;
  }

  /**
   * 检查是否支持Worker
   */
  static isWorkerSupported(): boolean {
    const env = this.detectEnvironment();

    // 在浏览器环境中检查Worker支持
    if (env === Environment.Browser) {
      return (
        typeof Worker !== 'undefined' &&
        typeof Blob !== 'undefined' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      );
    }

    // 非浏览器环境不支持标准Worker
    return false;
  }

  /**
   * 获取环境最大并发数建议值
   */
  static getRecommendedConcurrency(): number {
    const env = this.detectEnvironment();

    // 小程序环境一般限制并发
    switch (env) {
      case Environment.WechatMP:
      case Environment.AlipayMP:
      case Environment.BytedanceMP:
      case Environment.BaiduMP:
        return 2;
      case Environment.Browser:
        // @ts-ignore: navigator.hardwareConcurrency可能不存在
        return typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? Math.min(navigator.hardwareConcurrency, 6)
          : 3;
      default:
        return 3;
    }
  }

  /**
   * 获取环境支持的最大文件大小
   * 返回字节数，-1表示无限制
   */
  static getMaxFileSizeSupport(): number {
    const env = this.detectEnvironment();

    switch (env) {
      case Environment.WechatMP:
        return 100 * 1024 * 1024; // 微信小程序文件接口限制
      case Environment.Browser:
        return -1; // 浏览器理论上无限制，但实际受内存影响
      default:
        return -1;
    }
  }

  /**
   * 检测是否在HTTPS环境下
   * 一些特性如ServiceWorker等只在HTTPS环境下可用
   */
  static isHttps(): boolean {
    const env = this.detectEnvironment();

    if (env === Environment.Browser) {
      return (
        typeof location !== 'undefined' &&
        (location.protocol === 'https:' || location.hostname === 'localhost')
      );
    }

    return false;
  }

  /**
   * 检测浏览器类型
   */
  static getBrowserInfo(): { name: string; version: string } {
    const env = this.detectEnvironment();
    const unknown = { name: 'unknown', version: 'unknown' };

    if (env !== Environment.Browser) return unknown;

    const userAgent = navigator.userAgent;

    // 检测Chrome
    const chrome = userAgent.match(/(chrome|chromium)\/(\d+)/i);
    if (chrome) return { name: 'chrome', version: chrome[2] };

    // 检测Firefox
    const firefox = userAgent.match(/(firefox|fxios)\/(\d+)/i);
    if (firefox) return { name: 'firefox', version: firefox[2] };

    // 检测Safari
    const safari = userAgent.match(/version\/(\d+).*safari/i);
    if (safari) return { name: 'safari', version: safari[1] };

    // 检测Edge
    const edge =
      userAgent.match(/edge\/(\d+)/i) || userAgent.match(/edg\/(\d+)/i);
    if (edge) return { name: 'edge', version: edge[1] };

    // 检测IE
    const ie = userAgent.match(/(msie |trident.*rv:)(\d+)/i);
    if (ie) return { name: 'ie', version: ie[2] };

    return unknown;
  }
}

export default EnvUtils;
