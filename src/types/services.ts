/**
 * 服务相关类型定义
 */

/**
 * ServiceWorker配置选项
 */
export interface ServiceWorkerOptions {
  /**
   * ServiceWorker脚本URL
   */
  scriptURL: string;
  
  /**
   * ServiceWorker作用域
   */
  scope?: string;
  
  /**
   * 检查更新的时间间隔（毫秒）
   */
  updateInterval?: number;
  
  /**
   * 是否自动注册
   */
  autoRegister?: boolean;
  
  /**
   * 是否强制更新
   */
  forceUpdate?: boolean;
  
  /**
   * 最大缓存大小（字节）
   */
  maxCacheSize?: number;
  
  /**
   * 缓存策略
   */
  cacheStrategy?: 'networkFirst' | 'cacheFirst' | 'staleWhileRevalidate';
  
  /**
   * 缓存名称
   */
  cacheName?: string;
  
  /**
   * 其他配置选项
   */
  [key: string]: any;
}

/**
 * ServiceWorkerManager接口
 */
export interface IServiceWorkerManager {
  /**
   * 检查环境是否支持ServiceWorker
   */
  isSupported(): boolean;
  
  /**
   * 注册ServiceWorker
   */
  register(): Promise<ServiceWorkerRegistration | null>;
  
  /**
   * 获取当前ServiceWorker注册对象
   */
  getRegistration(): ServiceWorkerRegistration | null;
  
  /**
   * 卸载ServiceWorker
   */
  unregister(): Promise<boolean>;
  
  /**
   * 发送消息到ServiceWorker
   */
  sendMessage(type: string, payload?: any): void;
  
  /**
   * 检查ServiceWorker更新
   */
  checkForUpdates(): Promise<void>;
  
  /**
   * ServiceWorker是否已准备就绪
   */
  isReady(): boolean;
  
  /**
   * 添加事件监听
   */
  on(event: string, handler: (...args: any[]) => void): IServiceWorkerManager;
  
  /**
   * 移除事件监听
   */
  off(event: string, handler?: (...args: any[]) => void): IServiceWorkerManager;
  
  /**
   * 一次性事件监听
   */
  once(event: string, handler: (...args: any[]) => void): IServiceWorkerManager;
  
  /**
   * 获取缓存的文件
   */
  getCachedFiles(): Promise<string[]>;
  
  /**
   * 清理资源
   */
  dispose(): void;
} 