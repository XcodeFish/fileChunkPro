/**
 * EnvironmentAdapterFactory.ts
 * 环境适配器工厂，负责根据当前环境创建适当的适配器
 */

import { Environment } from '../types/environment';
import { environmentDetector } from './EnvironmentDetectionSystem';
import { featureDetector, SupportLevel } from './EnvironmentFeatureDetector';

/**
 * 适配器类型枚举
 */
export enum AdapterType {
  // 网络适配器
  NETWORK = 'network',

  // 存储适配器
  STORAGE = 'storage',

  // 文件系统适配器
  FILE_SYSTEM = 'file_system',

  // UI适配器
  UI = 'ui',

  // 安全适配器
  SECURITY = 'security',
}

/**
 * 适配器接口
 */
export interface IAdapter {
  /**
   * 适配器类型
   */
  type: AdapterType;

  /**
   * 适配器名称
   */
  name: string;

  /**
   * 初始化适配器
   */
  initialize(): Promise<void>;

  /**
   * 销毁适配器
   */
  destroy(): Promise<void>;
}

/**
 * 网络适配器接口
 */
export interface INetworkAdapter extends IAdapter {
  /**
   * 发送HTTP请求
   */
  request(options: NetworkRequestOptions): Promise<NetworkResponse>;

  /**
   * 上传文件
   */
  uploadFile(options: UploadOptions): Promise<UploadResponse>;

  /**
   * 下载文件
   */
  downloadFile(options: DownloadOptions): Promise<DownloadResponse>;

  /**
   * 取消请求
   */
  abort(requestId: string): void;

  /**
   * 获取当前网络状态
   */
  getNetworkStatus(): Promise<NetworkStatus>;
}

/**
 * 存储适配器接口
 */
export interface IStorageAdapter extends IAdapter {
  /**
   * 保存数据
   */
  setItem(key: string, value: any): Promise<void>;

  /**
   * 获取数据
   */
  getItem<T>(key: string): Promise<T | null>;

  /**
   * 删除数据
   */
  removeItem(key: string): Promise<void>;

  /**
   * 清空所有数据
   */
  clear(): Promise<void>;

  /**
   * 获取存储容量信息
   */
  getStorageInfo(): Promise<StorageInfo>;
}

/**
 * 文件系统适配器接口
 */
export interface IFileSystemAdapter extends IAdapter {
  /**
   * 读取文件
   */
  readFile(options: ReadFileOptions): Promise<ArrayBuffer>;

  /**
   * 写入文件
   */
  writeFile(options: WriteFileOptions): Promise<void>;

  /**
   * 获取文件信息
   */
  getFileInfo(path: string): Promise<FileInfo>;

  /**
   * 移除文件
   */
  removeFile(path: string): Promise<void>;

  /**
   * 创建目录
   */
  mkdir(dirPath: string): Promise<void>;
}

/**
 * UI适配器接口
 */
export interface IUIAdapter extends IAdapter {
  /**
   * 显示消息提示
   */
  showToast(options: ToastOptions): Promise<void>;

  /**
   * 显示加载指示器
   */
  showLoading(options?: LoadingOptions): Promise<void>;

  /**
   * 隐藏加载指示器
   */
  hideLoading(): Promise<void>;

  /**
   * 显示模态对话框
   */
  showModal(options: ModalOptions): Promise<ModalResponse>;

  /**
   * 显示上传进度
   */
  updateProgress(options: ProgressOptions): void;
}

/**
 * 安全适配器接口
 */
export interface ISecurityAdapter extends IAdapter {
  /**
   * 生成安全哈希
   */
  generateHash(data: ArrayBuffer, algorithm: string): Promise<string>;

  /**
   * 加密数据
   */
  encrypt(data: ArrayBuffer, key: ArrayBuffer): Promise<ArrayBuffer>;

  /**
   * 解密数据
   */
  decrypt(data: ArrayBuffer, key: ArrayBuffer): Promise<ArrayBuffer>;

  /**
   * 生成随机数
   */
  generateRandomBytes(length: number): Promise<ArrayBuffer>;

  /**
   * 校验数据完整性
   */
  verifyIntegrity(
    data: ArrayBuffer,
    signature: ArrayBuffer,
    key: ArrayBuffer
  ): Promise<boolean>;
}

/**
 * 网络请求选项
 */
export interface NetworkRequestOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  data?: any;
  timeout?: number;
  responseType?: string;
  withCredentials?: boolean;
  requestId?: string;
  onProgress?: (progress: number) => void;
}

/**
 * 网络响应
 */
export interface NetworkResponse {
  data: any;
  status: number;
  headers: Record<string, string>;
  requestId: string;
}

/**
 * 上传选项
 */
export interface UploadOptions {
  url: string;
  filePath: string;
  name: string;
  headers?: Record<string, string>;
  formData?: Record<string, any>;
  timeout?: number;
  requestId?: string;
  onProgress?: (progress: number) => void;
}

/**
 * 上传响应
 */
export interface UploadResponse {
  data: any;
  status: number;
  headers: Record<string, string>;
  requestId: string;
}

/**
 * 下载选项
 */
export interface DownloadOptions {
  url: string;
  filePath?: string;
  headers?: Record<string, string>;
  timeout?: number;
  requestId?: string;
  onProgress?: (progress: number) => void;
}

/**
 * 下载响应
 */
export interface DownloadResponse {
  tempFilePath: string;
  filePath: string;
  status: number;
  headers: Record<string, string>;
  requestId: string;
}

/**
 * 网络状态
 */
export interface NetworkStatus {
  isConnected: boolean;
  networkType: string;
}

/**
 * 存储信息
 */
export interface StorageInfo {
  keys: string[];
  currentSize: number;
  limitSize?: number;
}

/**
 * 读取文件选项
 */
export interface ReadFileOptions {
  filePath: string;
  encoding?: string;
  position?: number;
  length?: number;
}

/**
 * 写入文件选项
 */
export interface WriteFileOptions {
  filePath: string;
  data: ArrayBuffer | string;
  encoding?: string;
  append?: boolean;
}

/**
 * 文件信息
 */
export interface FileInfo {
  size: number;
  lastModified: number;
  path: string;
  name: string;
}

/**
 * 消息提示选项
 */
export interface ToastOptions {
  title: string;
  icon?: 'success' | 'error' | 'loading' | 'none';
  duration?: number;
}

/**
 * 加载选项
 */
export interface LoadingOptions {
  title?: string;
  mask?: boolean;
}

/**
 * 模态对话框选项
 */
export interface ModalOptions {
  title: string;
  content: string;
  showCancel?: boolean;
  cancelText?: string;
  cancelColor?: string;
  confirmText?: string;
  confirmColor?: string;
}

/**
 * 模态对话框响应
 */
export interface ModalResponse {
  confirm: boolean;
  cancel: boolean;
}

/**
 * 进度选项
 */
export interface ProgressOptions {
  progress: number;
  total?: number;
  speed?: number;
  remainingTime?: number;
}

/**
 * 环境适配器工厂
 * 负责根据当前运行环境创建适合的适配器实例
 */
class EnvironmentAdapterFactory {
  private static instance: EnvironmentAdapterFactory | null = null;
  private _environmentInfo: any = null;
  private _adapters: Map<AdapterType, IAdapter> = new Map();

  /**
   * 获取单例实例
   */
  public static getInstance(): EnvironmentAdapterFactory {
    if (!EnvironmentAdapterFactory.instance) {
      EnvironmentAdapterFactory.instance = new EnvironmentAdapterFactory();
    }
    return EnvironmentAdapterFactory.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    // 使用单例模式
  }

  /**
   * 初始化工厂
   */
  public async initialize(): Promise<void> {
    this._environmentInfo = environmentDetector.getEnvironmentInfo();
    console.log('环境适配器工厂初始化完成', this._environmentInfo);
  }

  /**
   * 获取网络适配器
   */
  public async getNetworkAdapter(): Promise<INetworkAdapter> {
    if (this._adapters.has(AdapterType.NETWORK)) {
      return this._adapters.get(AdapterType.NETWORK) as INetworkAdapter;
    }

    const adapter = await this.createNetworkAdapter();
    await adapter.initialize();
    this._adapters.set(AdapterType.NETWORK, adapter);
    return adapter;
  }

  /**
   * 获取存储适配器
   */
  public async getStorageAdapter(): Promise<IStorageAdapter> {
    if (this._adapters.has(AdapterType.STORAGE)) {
      return this._adapters.get(AdapterType.STORAGE) as IStorageAdapter;
    }

    const adapter = await this.createStorageAdapter();
    await adapter.initialize();
    this._adapters.set(AdapterType.STORAGE, adapter);
    return adapter;
  }

  /**
   * 获取文件系统适配器
   */
  public async getFileSystemAdapter(): Promise<IFileSystemAdapter> {
    if (this._adapters.has(AdapterType.FILE_SYSTEM)) {
      return this._adapters.get(AdapterType.FILE_SYSTEM) as IFileSystemAdapter;
    }

    const adapter = await this.createFileSystemAdapter();
    await adapter.initialize();
    this._adapters.set(AdapterType.FILE_SYSTEM, adapter);
    return adapter;
  }

  /**
   * 获取UI适配器
   */
  public async getUIAdapter(): Promise<IUIAdapter> {
    if (this._adapters.has(AdapterType.UI)) {
      return this._adapters.get(AdapterType.UI) as IUIAdapter;
    }

    const adapter = await this.createUIAdapter();
    await adapter.initialize();
    this._adapters.set(AdapterType.UI, adapter);
    return adapter;
  }

  /**
   * 获取安全适配器
   */
  public async getSecurityAdapter(): Promise<ISecurityAdapter> {
    if (this._adapters.has(AdapterType.SECURITY)) {
      return this._adapters.get(AdapterType.SECURITY) as ISecurityAdapter;
    }

    const adapter = await this.createSecurityAdapter();
    await adapter.initialize();
    this._adapters.set(AdapterType.SECURITY, adapter);
    return adapter;
  }

  /**
   * 销毁所有适配器
   */
  public async destroyAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    this._adapters.forEach(adapter => {
      promises.push(adapter.destroy());
    });

    await Promise.all(promises);
    this._adapters.clear();
  }

  /**
   * 创建网络适配器
   */
  private async createNetworkAdapter(): Promise<INetworkAdapter> {
    const env = this._environmentInfo.environment;

    // 根据环境创建对应的网络适配器
    switch (env) {
      case Environment.WechatMP: {
        const WechatNetworkAdapter = await import(
          '../adapters/WechatNetworkAdapter'
        );
        return new WechatNetworkAdapter.default() as INetworkAdapter;
      }

      case Environment.AlipayMP: {
        const AlipayNetworkAdapter = await import(
          '../adapters/AlipayNetworkAdapter'
        );
        return new AlipayNetworkAdapter.default() as INetworkAdapter;
      }

      case Environment.BytedanceMP: {
        const BytedanceNetworkAdapter = await import(
          '../adapters/BytedanceNetworkAdapter'
        );
        return new BytedanceNetworkAdapter.default() as INetworkAdapter;
      }

      case Environment.BaiduMP: {
        const BaiduNetworkAdapter = await import(
          '../adapters/BaiduNetworkAdapter'
        );
        return new BaiduNetworkAdapter.default() as INetworkAdapter;
      }

      case Environment.QQ_MP: {
        const QQNetworkAdapter = await import('../adapters/QQNetworkAdapter');
        return new QQNetworkAdapter.default() as INetworkAdapter;
      }

      case Environment.Taro: {
        const TaroNetworkAdapter = await import(
          '../adapters/TaroNetworkAdapter'
        );
        return new TaroNetworkAdapter.default() as INetworkAdapter;
      }

      case Environment.UniApp: {
        const UniAppNetworkAdapter = await import(
          '../adapters/UniAppNetworkAdapter'
        );
        return new UniAppNetworkAdapter.default() as INetworkAdapter;
      }

      default: {
        const BrowserNetworkAdapter = await import(
          '../adapters/BrowserNetworkAdapter'
        );
        return new BrowserNetworkAdapter.default() as INetworkAdapter;
      }
    }
  }

  /**
   * 创建存储适配器
   */
  private async createStorageAdapter(): Promise<IStorageAdapter> {
    const env = this._environmentInfo.environment;

    // 检查环境支持的存储能力
    const storageCapabilities = featureDetector.detectStorageCapabilities();

    // 根据环境和存储能力选择适合的存储适配器
    if (typeof env === 'string' && env.includes('miniprogram')) {
      // 小程序环境使用对应的存储适配器
      switch (env) {
        case Environment.WechatMP: {
          const WechatStorageAdapter = await import(
            '../adapters/WechatStorageAdapter'
          );
          return new WechatStorageAdapter.default() as IStorageAdapter;
        }

        case Environment.AlipayMP: {
          const AlipayStorageAdapter = await import(
            '../adapters/AlipayStorageAdapter'
          );
          return new AlipayStorageAdapter.default() as IStorageAdapter;
        }

        default: {
          // 其他小程序环境使用统一小程序存储适配器
          const MiniProgramStorageAdapter = await import(
            '../adapters/MiniProgramStorageAdapter'
          );
          return new MiniProgramStorageAdapter.default(env) as IStorageAdapter;
        }
      }
    } else {
      // 浏览器环境根据支持的能力选择
      if (storageCapabilities.bestOption === 'IndexedDB') {
        const IndexedDBStorageAdapter = await import(
          '../adapters/IndexedDBStorageAdapter'
        );
        return new IndexedDBStorageAdapter.default() as IStorageAdapter;
      } else if (storageCapabilities.bestOption === 'LocalStorage') {
        const LocalStorageAdapter = await import(
          '../adapters/LocalStorageAdapter'
        );
        return new LocalStorageAdapter.default() as IStorageAdapter;
      } else {
        // 回退到内存存储
        const MemoryStorageAdapter = await import(
          '../adapters/MemoryStorageAdapter'
        );
        return new MemoryStorageAdapter.default() as IStorageAdapter;
      }
    }
  }

  /**
   * 创建文件系统适配器
   */
  private async createFileSystemAdapter(): Promise<IFileSystemAdapter> {
    const env = this._environmentInfo.environment;

    // 根据环境创建对应的文件系统适配器
    switch (env) {
      case Environment.WechatMP: {
        const WechatFileSystemAdapter = await import(
          '../adapters/WechatFileSystemAdapter'
        );
        return new WechatFileSystemAdapter.default() as IFileSystemAdapter;
      }

      case Environment.AlipayMP: {
        const AlipayFileSystemAdapter = await import(
          '../adapters/AlipayFileSystemAdapter'
        );
        return new AlipayFileSystemAdapter.default() as IFileSystemAdapter;
      }

      case Environment.BytedanceMP: {
        const BytedanceFileSystemAdapter = await import(
          '../adapters/BytedanceFileSystemAdapter'
        );
        return new BytedanceFileSystemAdapter.default() as IFileSystemAdapter;
      }

      case Environment.NodeJS: {
        const NodeFileSystemAdapter = await import(
          '../adapters/NodeFileSystemAdapter'
        );
        return new NodeFileSystemAdapter.default() as IFileSystemAdapter;
      }

      default: {
        // 浏览器环境
        const BrowserFileSystemAdapter = await import(
          '../adapters/BrowserFileSystemAdapter'
        );
        return new BrowserFileSystemAdapter.default() as IFileSystemAdapter;
      }
    }
  }

  /**
   * 创建UI适配器
   */
  private async createUIAdapter(): Promise<IUIAdapter> {
    const env = this._environmentInfo.environment;

    // 根据环境创建对应的UI适配器
    switch (env) {
      case Environment.WechatMP: {
        const WechatUIAdapter = await import('../adapters/WechatUIAdapter');
        return new WechatUIAdapter.default() as IUIAdapter;
      }

      case Environment.AlipayMP: {
        const AlipayUIAdapter = await import('../adapters/AlipayUIAdapter');
        return new AlipayUIAdapter.default() as IUIAdapter;
      }

      case Environment.Taro: {
        const TaroUIAdapter = await import('../adapters/TaroUIAdapter');
        return new TaroUIAdapter.default() as IUIAdapter;
      }

      case Environment.UniApp: {
        const UniAppUIAdapter = await import('../adapters/UniAppUIAdapter');
        return new UniAppUIAdapter.default() as IUIAdapter;
      }

      default: {
        // 浏览器环境
        const BrowserUIAdapter = await import('../adapters/BrowserUIAdapter');
        return new BrowserUIAdapter.default() as IUIAdapter;
      }
    }
  }

  /**
   * 创建安全适配器
   */
  private async createSecurityAdapter(): Promise<ISecurityAdapter> {
    const env = this._environmentInfo.environment;
    const webCryptoSupport =
      featureDetector.detectFeature('WebCrypto').supportLevel;

    // 如果环境支持WebCrypto，优先使用WebCrypto实现
    if (webCryptoSupport === SupportLevel.FULL && env === Environment.Browser) {
      const WebCryptoSecurityAdapter = await import(
        '../adapters/WebCryptoSecurityAdapter'
      );
      return new WebCryptoSecurityAdapter.default() as ISecurityAdapter;
    } else {
      // 否则使用纯JavaScript实现的加密库
      const PolyfillSecurityAdapter = await import(
        '../adapters/PolyfillSecurityAdapter'
      );
      return new PolyfillSecurityAdapter.default() as ISecurityAdapter;
    }
  }
}

// 导出工厂单例
export const adapterFactory = EnvironmentAdapterFactory.getInstance();

export default EnvironmentAdapterFactory;
