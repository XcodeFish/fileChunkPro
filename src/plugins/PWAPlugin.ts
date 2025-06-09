/**
 * PWAPlugin - PWA 支持插件
 * 提供 ServiceWorker 管理、离线缓存策略和 Web App Manifest 处理
 */

import { UploadError } from '../core/ErrorCenter';
import { UploaderCore } from '../core/UploaderCore';
import { Environment, UploadErrorType } from '../types';
import { EnvUtils } from '../utils/EnvUtils';
import { Logger } from '../utils/Logger';

import { IPlugin } from './interfaces';

export interface PWAPluginOptions {
  /**
   * 是否启用 PWA 功能
   */
  enabled?: boolean;

  /**
   * ServiceWorker 脚本路径
   */
  swPath?: string;

  /**
   * 缓存名称前缀
   */
  cachePrefix?: string;

  /**
   * 是否自动注册 ServiceWorker
   */
  autoRegister?: boolean;

  /**
   * 缓存策略
   * - network-first: 优先使用网络，网络失败时使用缓存
   * - cache-first: 优先使用缓存，缓存没有时使用网络
   * - stale-while-revalidate: 同时使用缓存和网络，返回缓存但更新缓存
   */
  cacheStrategy?: 'network-first' | 'cache-first' | 'stale-while-revalidate';

  /**
   * 要缓存的文件匹配模式
   */
  cachePatterns?: string[];

  /**
   * Web App Manifest 路径
   */
  manifestPath?: string;
}

export class PWAPlugin implements IPlugin {
  private core: UploaderCore | null = null;
  private logger: Logger;
  private isEnabled: boolean;
  private swPath: string;
  private cachePrefix: string;
  private autoRegister: boolean;
  private cacheStrategy: string;
  private cachePatterns: string[];
  private manifestPath: string | null;
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor(options: PWAPluginOptions = {}) {
    this.logger = new Logger('PWAPlugin');
    this.isEnabled = options.enabled !== false;
    this.swPath = options.swPath || '/sw.js';
    this.cachePrefix = options.cachePrefix || 'fileChunkPro-';
    this.autoRegister = options.autoRegister !== false;
    this.cacheStrategy = options.cacheStrategy || 'network-first';
    this.cachePatterns = options.cachePatterns || [
      '/index.html',
      '/css/**',
      '/js/**',
      '/images/**',
      '/fonts/**',
    ];
    this.manifestPath = options.manifestPath || null;
  }

  /**
   * 安装插件
   * @param core UploaderCore 实例
   */
  public install(core: UploaderCore): void {
    this.core = core;
    this.logger.info('PWA 插件已安装');

    // 检查是否为浏览器环境
    const env = EnvUtils.detectEnvironment();
    if (env !== Environment.Browser) {
      this.logger.warn('非浏览器环境，PWA 功能将不可用');
      this.isEnabled = false;
      return;
    }

    // 检查是否支持 ServiceWorker
    if (!this.isSWSupported()) {
      this.logger.warn('当前环境不支持 ServiceWorker，PWA 功能将不可用');
      this.isEnabled = false;
      return;
    }

    // 检查是否为安全上下文（HTTPS 或 localhost）
    if (!this.isSecureContext()) {
      this.logger.warn(
        '非安全上下文（HTTPS/localhost），ServiceWorker 功能不可用'
      );
      this.isEnabled = false;
      return;
    }

    // 注册事件处理
    this.registerEvents();

    // 自动注册 ServiceWorker
    if (this.isEnabled && this.autoRegister) {
      this.registerServiceWorker();
    }

    // 处理 Web App Manifest
    this.handleManifest();
  }

  /**
   * 检查是否支持 ServiceWorker
   */
  private isSWSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  }

  /**
   * 检查是否为安全上下文
   */
  private isSecureContext(): boolean {
    return (
      typeof window !== 'undefined' &&
      (window.isSecureContext ||
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1')
    );
  }

  /**
   * 注册事件处理
   */
  private registerEvents(): void {
    if (!this.core) return;

    // 监听上传事件，可以在这里处理离线上传排队等
    this.core.on('upload:start', () => {
      // 检查是否在线，如果离线则将任务加入队列
      if (!navigator.onLine && this.isEnabled) {
        this.logger.info('检测到离线状态，上传任务将加入队列');
        // 可以实现离线队列功能
      }
    });

    // 监听网络状态变化
    window.addEventListener('online', this.handleOnlineEvent.bind(this));
    window.addEventListener('offline', this.handleOfflineEvent.bind(this));
  }

  /**
   * 处理在线事件
   */
  private handleOnlineEvent(): void {
    this.logger.info('网络连接已恢复');
    // 可以在这里处理恢复上传队列
    if (this.core) {
      this.core.emit('pwa:online');
    }
  }

  /**
   * 处理离线事件
   */
  private handleOfflineEvent(): void {
    this.logger.info('网络连接已断开');
    if (this.core) {
      this.core.emit('pwa:offline');
    }
  }

  /**
   * 注册 ServiceWorker
   */
  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isEnabled || !this.isSWSupported()) {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register(this.swPath, {
        scope: '/',
      });

      this.swRegistration = registration;
      this.logger.info('ServiceWorker 注册成功，范围:', registration.scope);

      // 监听 ServiceWorker 更新
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            this.logger.info('ServiceWorker 状态变更:', newWorker.state);
            if (this.core && newWorker.state === 'activated') {
              this.core.emit('pwa:sw-activated');
            }
          });
        }
      });

      if (this.core) {
        this.core.emit('pwa:sw-registered', registration);
      }

      return registration;
    } catch (error) {
      this.logger.error('ServiceWorker 注册失败:', error);
      if (this.core) {
        this.core.emit('pwa:sw-error', error);
      }
      return null;
    }
  }

  /**
   * 注销 ServiceWorker
   */
  public async unregisterServiceWorker(): Promise<boolean> {
    if (!this.swRegistration) {
      return false;
    }

    try {
      const result = await this.swRegistration.unregister();
      this.logger.info('ServiceWorker 注销结果:', result);
      if (this.core) {
        this.core.emit('pwa:sw-unregistered', result);
      }
      return result;
    } catch (error) {
      this.logger.error('ServiceWorker 注销失败:', error);
      return false;
    }
  }

  /**
   * 处理 Web App Manifest
   */
  private handleManifest(): void {
    if (!this.isEnabled || !this.manifestPath) {
      return;
    }

    try {
      // 检查 manifest 链接是否已存在
      const existingLink = document.querySelector('link[rel="manifest"]');
      if (existingLink) {
        return;
      }

      // 创建并添加 manifest 链接
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = this.manifestPath;
      document.head.appendChild(link);

      this.logger.info('Web App Manifest 已添加:', this.manifestPath);
    } catch (error) {
      this.logger.error('添加 Web App Manifest 失败:', error);
    }
  }

  /**
   * 发送消息到 ServiceWorker
   */
  public async sendMessageToSW(message: any): Promise<any> {
    if (!this.isEnabled || !this.swRegistration) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        'ServiceWorker 未注册，无法发送消息'
      );
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = event => {
        resolve(event.data);
      };

      // 发送消息到 ServiceWorker
      if (this.swRegistration.active) {
        this.swRegistration.active.postMessage(message, [messageChannel.port2]);
      } else {
        reject(new Error('ServiceWorker 未激活，无法发送消息'));
      }
    });
  }

  /**
   * 检查是否支持 Web App 安装
   */
  public isPWAInstallable(): boolean {
    // @ts-ignore: beforeinstallprompt 是非标准事件
    return (
      typeof window !== 'undefined' && 'BeforeInstallPromptEvent' in window
    );
  }

  /**
   * 提示用户安装 PWA
   */
  public async promptInstall(): Promise<boolean> {
    if (!this.isEnabled || !this.isPWAInstallable()) {
      return false;
    }

    // @ts-ignore: deferredPrompt 可能存在于 window 对象上
    const deferredPrompt = window.deferredPrompt;
    if (!deferredPrompt) {
      this.logger.warn('没有可用的安装提示');
      return false;
    }

    try {
      // 显示安装提示
      deferredPrompt.prompt();

      // 等待用户响应
      const choiceResult = await deferredPrompt.userChoice;

      // 清除已使用的提示
      // @ts-ignore: 清除 deferredPrompt
      window.deferredPrompt = null;

      const accepted = choiceResult.outcome === 'accepted';
      if (accepted) {
        this.logger.info('用户已接受 PWA 安装');
        if (this.core) {
          this.core.emit('pwa:installed');
        }
      } else {
        this.logger.info('用户拒绝了 PWA 安装');
      }

      return accepted;
    } catch (error) {
      this.logger.error('PWA 安装提示失败:', error);
      return false;
    }
  }

  /**
   * 获取当前 PWA 状态
   */
  public getPWAStatus(): {
    isEnabled: boolean;
    isSupported: boolean;
    isRegistered: boolean;
    isInstallable: boolean;
    isOnline: boolean;
  } {
    return {
      isEnabled: this.isEnabled,
      isSupported: this.isSWSupported() && this.isSecureContext(),
      isRegistered: !!this.swRegistration,
      isInstallable: this.isPWAInstallable(),
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,
    };
  }
}

export default PWAPlugin;
