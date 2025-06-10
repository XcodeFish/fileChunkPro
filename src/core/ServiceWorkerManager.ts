/**
 * ServiceWorkerManager - ServiceWorker管理类
 * 负责ServiceWorker的注册、更新、控制和通信
 */

import { EventBus } from './EventBus';
import { UploadError, UploadErrorType } from './ErrorCenter';
import { IServiceWorkerManager, ServiceWorkerOptions } from '../types/services';

export class ServiceWorkerManager implements IServiceWorkerManager {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private events: EventBus = new EventBus();
  private pendingMessages: Array<any> = [];
  private options: ServiceWorkerOptions;
  private isRegistered = false;
  private messageChannel: MessageChannel | null = null;
  private _ready = false;

  /**
   * 创建ServiceWorkerManager实例
   * @param options ServiceWorker配置选项
   */
  constructor(options: ServiceWorkerOptions) {
    this.options = {
      scriptURL: options.scriptURL || '/sw.js',
      scope: options.scope || '/',
      updateInterval: options.updateInterval || 3600000, // 默认1小时检查一次更新
      autoRegister: options.autoRegister !== false,
      forceUpdate: options.forceUpdate || false,
      ...options,
    };

    // 自动注册
    if (this.options.autoRegister) {
      this.register().catch(err => {
        console.error('[ServiceWorkerManager] 自动注册失败:', err);
      });
    }

    // 定时检查更新
    if (typeof window !== 'undefined' && this.options.updateInterval > 0) {
      setInterval(() => {
        this.checkForUpdates().catch(err => {
          console.error('[ServiceWorkerManager] 检查更新失败:', err);
        });
      }, this.options.updateInterval);
    }
  }

  /**
   * 检查环境是否支持ServiceWorker
   */
  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  }

  /**
   * 注册ServiceWorker
   */
  public async register(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) {
      console.warn('[ServiceWorkerManager] 当前环境不支持ServiceWorker');
      return null;
    }

    if (this.isRegistered) {
      return this.swRegistration;
    }

    try {
      const registration = await navigator.serviceWorker.register(
        this.options.scriptURL,
        {
          scope: this.options.scope,
        }
      );

      this.swRegistration = registration;
      this.isRegistered = true;

      console.log(
        '[ServiceWorkerManager] ServiceWorker注册成功:',
        registration
      );

      // 等待ServiceWorker激活
      if (registration.installing) {
        await this.waitForActivation(registration.installing);
      }

      // 设置事件处理
      this.setupEventListeners();

      // 初始化消息通道
      this.initMessageChannel();

      // 发送待处理的消息
      this.flushPendingMessages();

      return registration;
    } catch (error) {
      console.error('[ServiceWorkerManager] ServiceWorker注册失败:', error);
      throw new UploadError(
        'ServiceWorker注册失败',
        UploadErrorType.SERVICE_WORKER_REGISTRATION_FAILED
      );
    }
  }

  /**
   * 获取当前ServiceWorker注册对象
   */
  public getRegistration(): ServiceWorkerRegistration | null {
    return this.swRegistration;
  }

  /**
   * 卸载ServiceWorker
   */
  public async unregister(): Promise<boolean> {
    if (!this.swRegistration) {
      return false;
    }

    try {
      const success = await this.swRegistration.unregister();
      if (success) {
        this.swRegistration = null;
        this.isRegistered = false;
        this._ready = false;
        console.log('[ServiceWorkerManager] ServiceWorker已卸载');
      }
      return success;
    } catch (error) {
      console.error('[ServiceWorkerManager] ServiceWorker卸载失败:', error);
      return false;
    }
  }

  /**
   * 发送消息到ServiceWorker
   */
  public sendMessage(type: string, payload?: any): void {
    if (!this.isRegistered || !this._ready) {
      // 缓存消息，等待连接建立后发送
      this.pendingMessages.push({ type, payload });
      return;
    }

    try {
      // 优先使用MessageChannel
      if (this.messageChannel) {
        this.messageChannel.port1.postMessage({ type, payload });
        return;
      }

      // 回退方式: 直接发送
      if (this.swRegistration?.active) {
        this.swRegistration.active.postMessage({ type, payload });
      }
    } catch (error) {
      console.error('[ServiceWorkerManager] 发送消息失败:', error);
    }
  }

  /**
   * 检查ServiceWorker更新
   */
  public async checkForUpdates(): Promise<void> {
    if (!this.swRegistration) {
      return;
    }

    try {
      await this.swRegistration.update();
    } catch (error) {
      console.error('[ServiceWorkerManager] 更新检查失败:', error);
      throw error;
    }
  }

  /**
   * ServiceWorker是否已准备就绪
   */
  public isReady(): boolean {
    return this._ready;
  }

  /**
   * 添加事件监听
   */
  public on(
    event: string,
    handler: (...args: any[]) => void
  ): IServiceWorkerManager {
    this.events.on(event, handler);
    return this;
  }

  /**
   * 移除事件监听
   */
  public off(
    event: string,
    handler?: (...args: any[]) => void
  ): IServiceWorkerManager {
    this.events.off(event, handler);
    return this;
  }

  /**
   * 一次性事件监听
   */
  public once(
    event: string,
    handler: (...args: any[]) => void
  ): IServiceWorkerManager {
    this.events.once(event, handler);
    return this;
  }

  /**
   * 获取缓存的文件
   */
  public async getCachedFiles(): Promise<string[]> {
    if (!this.swRegistration) {
      return [];
    }

    return new Promise<string[]>(resolve => {
      // 设置一次性监听
      this.once('message', data => {
        if (data.type === 'CACHED_FILES' && Array.isArray(data.payload)) {
          resolve(data.payload);
        } else {
          resolve([]);
        }
      });

      // 请求缓存文件列表
      this.sendMessage('GET_CACHED_FILES');

      // 5秒超时
      setTimeout(() => resolve([]), 5000);
    });
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    // 清理消息通道
    if (this.messageChannel) {
      this.messageChannel.port1.close();
      this.messageChannel = null;
    }

    // 清理事件监听
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener(
        'message',
        this.handleMessage
      );
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        this.handleControllerChange
      );
    }

    // 清理事件总线
    this.events.clear();

    // 重置状态
    this._ready = false;
    this.pendingMessages = [];
  }

  /**
   * 等待ServiceWorker激活
   */
  private waitForActivation(serviceWorker: ServiceWorker): Promise<void> {
    return new Promise<void>(resolve => {
      serviceWorker.addEventListener('statechange', () => {
        if (serviceWorker.state === 'activated') {
          resolve();
        }
      });
    });
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      // 监听来自ServiceWorker的消息
      navigator.serviceWorker.addEventListener('message', this.handleMessage);

      // 监听ServiceWorker控制变化
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        this.handleControllerChange
      );
    }
  }

  /**
   * 初始化消息通道
   */
  private initMessageChannel(): void {
    if (!this.swRegistration?.active) {
      return;
    }

    // 创建MessageChannel
    this.messageChannel = new MessageChannel();

    // 设置消息处理器
    this.messageChannel.port1.onmessage = event => {
      this.handleMessage(event);

      // 收到就绪消息
      if (event.data && event.data.type === 'SW_READY') {
        this._ready = true;
        this.events.emit('ready');
      }
    };

    // 发送初始化消息
    this.swRegistration.active.postMessage(
      {
        type: 'INIT_PORT',
        payload: {
          clientId: this.getClientId(),
        },
      },
      [this.messageChannel.port2]
    );
  }

  /**
   * 处理来自ServiceWorker的消息
   */
  private handleMessage = (event: MessageEvent): void => {
    const data = event.data;
    if (!data || !data.type) return;

    // 触发消息事件
    this.events.emit('message', data);

    // 根据消息类型触发特定事件
    this.events.emit(data.type.toLowerCase(), data.payload);

    // 处理特殊消息类型
    switch (data.type) {
      case 'SW_READY':
        this._ready = true;
        this.events.emit('ready');
        this.flushPendingMessages();
        break;
    }
  };

  /**
   * 处理ServiceWorker控制变化
   */
  private handleControllerChange = (): void => {
    // 重新初始化消息通道
    setTimeout(() => {
      this.initMessageChannel();
    }, 1000);

    this.events.emit('controllerchange');
  };

  /**
   * 发送所有待处理的消息
   */
  private flushPendingMessages(): void {
    if (!this._ready) return;

    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (message) {
        this.sendMessage(message.type, message.payload);
      }
    }
  }

  /**
   * 获取客户端ID
   */
  private getClientId(): string {
    // 尝试从SessionStorage获取持久客户端ID
    if (typeof window !== 'undefined' && window.sessionStorage) {
      let clientId = sessionStorage.getItem('sw_client_id');

      if (!clientId) {
        clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem('sw_client_id', clientId);
      }

      return clientId;
    }

    // 回退：生成临时ID
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
