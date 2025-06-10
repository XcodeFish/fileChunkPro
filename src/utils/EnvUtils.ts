/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/**
 * EnvUtils - 环境检测工具
 * 提供当前运行环境检测与相关功能
 */

import { Environment, BrowserFeature } from '../types';

import ConfigurationEngine from './ConfigurationEngine';
import { EnvironmentDetectionSystem } from './EnvironmentDetectionSystem';

// 这些类型声明在EnvironmentDetectionSystem中使用，保留定义
// 因为在环境检测系统中需要检测这些全局对象
// @ts-ignore - 避免linter报错
declare global {
  interface Window {
    wx?: { getFileSystemManager: () => any };
    my?: { getFileSystemManager: () => any };
    tt?: { getFileSystemManager: () => any };
    swan?: { getFileSystemManager: () => any };
    uni?: any;
  }
}

/**
 * 增强的环境检测工具
 * 提供运行环境检测与相关功能
 */
export class EnvUtils {
  private static envSystem: EnvironmentDetectionSystem | null = null;
  private static configEngine: ConfigurationEngine | null = null;

  /**
   * 获取环境检测系统实例
   * 单例模式，确保全局只有一个环境检测系统实例
   */
  static getEnvSystem(): EnvironmentDetectionSystem {
    if (!this.envSystem) {
      this.envSystem = new EnvironmentDetectionSystem();
    }
    return this.envSystem;
  }

  /**
   * 获取配置推荐引擎实例
   * 单例模式，确保全局只有一个配置推荐引擎实例
   */
  static getConfigEngine(): ConfigurationEngine {
    if (!this.configEngine) {
      this.configEngine = new ConfigurationEngine(this.getEnvSystem());
    }
    return this.configEngine;
  }

  /**
   * 检测当前环境
   */
  static detectEnvironment(): Environment {
    return this.getEnvSystem().getEnvironment();
  }

  /**
   * 检查是否支持Worker
   */
  static isWorkerSupported(): boolean {
    return this.getEnvSystem().hasFeature(BrowserFeature.WEB_WORKER);
  }

  /**
   * 检查是否支持ServiceWorker
   */
  static isServiceWorkerSupported(): boolean {
    return this.getEnvSystem().hasFeature(BrowserFeature.SERVICE_WORKER);
  }

  /**
   * 获取环境最大并发数建议值
   */
  static getRecommendedConcurrency(): number {
    const config = this.getConfigEngine().generateRecommendedConfig(0);
    return config.concurrency || 3;
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

  /**
   * 获取设备能力详情
   * 返回设备内存、处理器、网络、存储和电池状态的能力级别
   */
  static getDeviceCapabilities() {
    return this.getEnvSystem().getDeviceCapabilities();
  }

  /**
   * 获取特定文件大小的推荐上传配置
   * @param fileSize 文件大小（字节）
   * @param options 用户自定义配置选项
   */
  static getRecommendedConfig(fileSize: number, options = {}) {
    return this.getConfigEngine().generateRecommendedConfig(fileSize, options);
  }

  /**
   * 检查当前环境是否支持特定特性
   * @param feature 特性名称
   */
  static hasFeature(feature: string): boolean {
    return this.getEnvSystem().hasFeature(feature);
  }

  /**
   * 获取当前环境名称
   */
  static getEnvironmentName(): string {
    return this.getEnvSystem().getEnvironmentName();
  }

  /**
   * 获取环境能力报告
   * 生成详细的环境能力评估报告
   */
  static getCapabilityReport() {
    return this.getConfigEngine().generateCapabilityReport();
  }

  /**
   * 重置环境检测系统
   * 用于测试或强制刷新环境检测结果
   */
  static resetEnvSystem() {
    this.envSystem = null;
    this.configEngine = null;
  }

  /**
   * 获取针对当前环境的降级策略
   */
  static getFallbackStrategies() {
    return this.getEnvSystem().getFallbackStrategies();
  }
}

export default EnvUtils;
