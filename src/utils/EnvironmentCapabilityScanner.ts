/**
 * EnvironmentCapabilityScanner - 环境能力扫描器
 * 提供更精确的环境特性识别和能力评估功能
 */

import { Environment } from '../types';

import EnvUtils from './EnvUtils';

export interface FeatureDetectionResult {
  feature: string;
  supported: boolean;
  details?: any;
}

export type CapabilityLevel =
  | 'unavailable'
  | 'minimal'
  | 'basic'
  | 'good'
  | 'excellent';

export class EnvironmentCapabilityScanner {
  private static instance: EnvironmentCapabilityScanner;
  private _currentEnvironment: Environment;
  private _featureDetectionCache: Map<string, FeatureDetectionResult> =
    new Map();

  /**
   * 获取单例实例
   */
  public static getInstance(): EnvironmentCapabilityScanner {
    if (!EnvironmentCapabilityScanner.instance) {
      EnvironmentCapabilityScanner.instance =
        new EnvironmentCapabilityScanner();
    }
    return EnvironmentCapabilityScanner.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this._currentEnvironment = EnvUtils.detectEnvironment();
  }

  /**
   * 检测特定功能的支持程度
   */
  public detectFeatureCapabilityLevel(feature: string): CapabilityLevel {
    const env = this._currentEnvironment;

    switch (feature) {
      case 'file-handling':
        if (env === Environment.Browser) {
          if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
            return 'excellent';
          } else if (
            typeof File !== 'undefined' &&
            typeof FileReader !== 'undefined'
          ) {
            return 'good';
          } else if (typeof FormData !== 'undefined') {
            return 'basic';
          } else {
            return 'minimal';
          }
        } else if (
          env === Environment.WechatMP ||
          env === Environment.AlipayMP
        ) {
          return 'good';
        }
        break;

      case 'storage':
        if (env === Environment.Browser) {
          if (typeof indexedDB !== 'undefined') {
            return 'excellent';
          } else if (typeof localStorage !== 'undefined') {
            return 'good';
          } else if (typeof sessionStorage !== 'undefined') {
            return 'basic';
          } else {
            return 'minimal';
          }
        } else if (env === Environment.WechatMP) {
          return 'good';
        }
        break;

      case 'network':
        if (env === Environment.Browser) {
          if (
            typeof fetch !== 'undefined' &&
            typeof AbortController !== 'undefined'
          ) {
            return 'excellent';
          } else if (typeof fetch !== 'undefined') {
            return 'good';
          } else if (typeof XMLHttpRequest !== 'undefined') {
            return 'basic';
          } else {
            return 'minimal';
          }
        } else if (env === Environment.WechatMP) {
          return 'good';
        }
        break;

      case 'concurrency':
        if (env === Environment.Browser) {
          if (
            typeof Worker !== 'undefined' &&
            typeof SharedArrayBuffer !== 'undefined'
          ) {
            return 'excellent';
          } else if (typeof Worker !== 'undefined') {
            return 'good';
          } else if (typeof Promise !== 'undefined') {
            return 'basic';
          } else {
            return 'minimal';
          }
        } else if (
          env === Environment.WechatMP ||
          env === Environment.AlipayMP
        ) {
          return 'basic';
        }
        break;
    }

    return 'unavailable';
  }

  /**
   * 检测特定功能支持
   */
  public detectFeature(featureName: string): FeatureDetectionResult {
    // 检查缓存
    if (this._featureDetectionCache.has(featureName)) {
      return this._featureDetectionCache.get(featureName)!;
    }

    const result: FeatureDetectionResult = {
      feature: featureName,
      supported: false,
    };

    const env = this._currentEnvironment;

    switch (featureName) {
      case 'async-file-reading':
        if (env === Environment.Browser) {
          result.supported =
            typeof FileReader !== 'undefined' && typeof Promise !== 'undefined';
        } else if (env === Environment.WechatMP) {
          result.supported =
            typeof wx !== 'undefined' &&
            typeof wx.getFileSystemManager === 'function';
        }
        break;

      case 'chunked-upload':
        if (env === Environment.Browser) {
          result.supported =
            typeof Blob !== 'undefined' &&
            typeof Blob.prototype.slice !== 'undefined';
        } else if (env === Environment.WechatMP) {
          result.supported =
            typeof wx !== 'undefined' && typeof wx.uploadFile === 'function';
        }
        break;

      case 'concurrent-network-requests':
        result.supported = true; // 大部分环境都支持
        break;

      case 'offline-storage':
        if (env === Environment.Browser) {
          result.supported =
            typeof indexedDB !== 'undefined' ||
            typeof localStorage !== 'undefined';
        } else if (env === Environment.WechatMP) {
          result.supported =
            typeof wx !== 'undefined' && typeof wx.setStorage === 'function';
        }
        break;

      case 'background-processing':
        if (env === Environment.Browser) {
          result.supported = typeof Worker !== 'undefined';
        } else {
          result.supported = false;
        }
        break;
    }

    // 缓存结果
    this._featureDetectionCache.set(featureName, result);

    return result;
  }
}

export default EnvironmentCapabilityScanner;
