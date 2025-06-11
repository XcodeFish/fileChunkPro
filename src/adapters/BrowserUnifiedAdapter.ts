/**
 * BrowserUnifiedAdapter.ts
 * 浏览器环境统一适配器实现
 */

import AbstractUnifiedAdapter from './AbstractUnifiedAdapter';
import { Environment } from '../types/environment';
import { EnvironmentType } from './interfaces';
import { BrowserFeature } from '../types/environment';
import {
  IAdapterOptions,
  IChunkMetadata,
  IRequestOptions,
  IResponse,
  IFileInfo,
} from './OptimizedAdapterInterfaces';

/**
 * 浏览器环境统一适配器
 * 实现浏览器环境下的各种操作
 */
export class BrowserUnifiedAdapter extends AbstractUnifiedAdapter {
  private fileReader: FileReader;
  private storage: Storage;

  /**
   * 构造函数
   * @param options 适配器选项
   */
  constructor(options?: IAdapterOptions) {
    super('Browser', options);

    // 初始化文件读取器
    this.fileReader = new FileReader();

    // 使用localStorage作为存储
    this.storage = window.localStorage;
  }

  /**
   * 初始化适配器
   * @param options 初始化选项
   */
  protected async onInitialize(): Promise<void> {
    this.logger.debug('初始化浏览器适配器');

    // 检测浏览器特性
    this.supportedFeatures = this.detectFeatures();
  }

  /**
   * 获取环境类型
   */
  public getEnvironmentType(): EnvironmentType {
    return EnvironmentType.BROWSER;
  }

  /**
   * 获取环境主类型
   */
  public getEnvironment(): Environment {
    return Environment.BROWSER;
  }

  /**
   * 获取适配器优先级
   */
  public getPriority(): number {
    return 100; // 浏览器适配器默认优先级
  }

  /**
   * 获取适配器支持的环境类型列表
   */
  public getSupportedEnvironments(): Environment[] {
    return [Environment.BROWSER];
  }

  /**
   * 获取适配器支持的环境子类型列表
   */
  public getSupportedEnvironmentTypes(): EnvironmentType[] {
    return [EnvironmentType.BROWSER, EnvironmentType.WEBVIEW];
  }

  /**
   * 获取适配器需要的特性列表
   */
  public getRequiredFeatures(): string[] {
    return [BrowserFeature.FILE_API, BrowserFeature.XHR];
  }

  /**
   * 检测特性支持情况
   */
  public detectFeatures(): Record<string, boolean> {
    const features: Record<string, boolean> = {};

    // 检测 File API
    features[BrowserFeature.FILE_API] =
      typeof File !== 'undefined' && typeof FileReader !== 'undefined';

    // 检测 Blob API
    features[BrowserFeature.BLOB] = typeof Blob !== 'undefined';

    // 检测 XHR
    features[BrowserFeature.XHR] = typeof XMLHttpRequest !== 'undefined';

    // 检测 Fetch API
    features[BrowserFeature.FETCH] = typeof fetch === 'function';

    // 检测 Service Worker
    features[BrowserFeature.SERVICE_WORKER] = 'serviceWorker' in navigator;

    // 检测 Web Worker
    features[BrowserFeature.WEB_WORKER] = typeof Worker !== 'undefined';

    // 检测 IndexedDB
    features[BrowserFeature.INDEXED_DB] = 'indexedDB' in window;

    // 检测 Web Crypto API
    features[BrowserFeature.WEB_CRYPTO] =
      'crypto' in window && 'subtle' in window.crypto;

    // 检测 Streams API
    features[BrowserFeature.STREAMS_API] =
      typeof ReadableStream !== 'undefined';

    // 检测本地存储
    features[BrowserFeature.LOCAL_STORAGE] =
      typeof localStorage !== 'undefined';

    this.logger.debug('检测到浏览器特性', features);
    return features;
  }

  /**
   * 读取文件片段
   * @param file 文件对象
   * @param start 开始位置
   * @param size 读取大小
   */
  public async readChunk(
    file: File,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      // 检查文件类型
      if (!(file instanceof File)) {
        reject(new Error('参数必须是File类型'));
        return;
      }

      // 计算结束位置
      const end = Math.min(start + size, file.size);

      // 使用slice方法截取文件片段
      const blob = file.slice(start, end);

      // 使用FileReader读取为ArrayBuffer
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('读取文件片段失败'));
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * 获取文件信息
   * @param file 文件对象
   */
  public async getFileInfo(file: File): Promise<IFileInfo> {
    // 检查文件类型
    if (!(file instanceof File)) {
      throw new Error('参数必须是File类型');
    }

    return {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };
  }

  /**
   * 计算文件哈希值
   * @param file 文件对象
   * @param algorithm 哈希算法
   */
  public async calculateFileHash(
    file: File,
    algorithm = 'SHA-256'
  ): Promise<string> {
    if (!this.supportedFeatures[BrowserFeature.WEB_CRYPTO]) {
      throw new Error('当前环境不支持Web Crypto API');
    }

    // 读取文件内容
    const buffer = await this.readChunk(file, 0, file.size);

    // 使用Web Crypto API计算哈希
    const hashBuffer = await window.crypto.subtle.digest(algorithm, buffer);

    // 将ArrayBuffer转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return hashHex;
  }

  /**
   * 发送HTTP请求
   * @param url 请求地址
   * @param options 请求选项
   */
  public async request(
    url: string,
    options: IRequestOptions = {}
  ): Promise<IResponse> {
    try {
      const {
        method = 'GET',
        headers = {},
        body,
        timeout = this.options.timeout,
        responseType = 'json',
        withCredentials = this.options.withCredentials,
        onProgress,
        signal,
      } = options;

      // 优先使用Fetch API (如果可用且没有进度回调)
      if (this.supportedFeatures[BrowserFeature.FETCH] && !onProgress) {
        const response = await this.fetchRequest(
          url,
          {
            method,
            headers,
            body,
            signal,
            credentials: withCredentials ? 'include' : 'same-origin',
          },
          timeout
        );

        return response;
      }

      // 回退到XMLHttpRequest
      return await this.xhrRequest(url, {
        method,
        headers,
        body,
        timeout,
        responseType,
        withCredentials,
        onProgress,
        signal,
      });
    } catch (error) {
      this.logger.error('请求失败', error);
      throw error;
    }
  }

  /**
   * 使用Fetch API发送请求
   * @param url 请求地址
   * @param options 请求选项
   * @param timeout 超时时间
   */
  private async fetchRequest(
    url: string,
    options: RequestInit,
    timeout?: number
  ): Promise<IResponse> {
    try {
      // 创建超时Promise
      const timeoutPromise = new Promise<Response>((_, reject) => {
        if (timeout) {
          setTimeout(() => reject(new Error('请求超时')), timeout);
        }
      });

      // 发送请求
      const response = await Promise.race([
        fetch(url, options),
        timeoutPromise,
      ]);

      // 解析响应数据
      const data = await response.json();

      // 获取响应头
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        headers,
      };
    } catch (error) {
      this.logger.error('Fetch请求失败', error);
      throw error;
    }
  }

  /**
   * 使用XMLHttpRequest发送请求
   * @param url 请求地址
   * @param options 请求选项
   */
  private xhrRequest(
    url: string,
    options: IRequestOptions
  ): Promise<IResponse> {
    return new Promise((resolve, reject) => {
      const {
        method = 'GET',
        headers = {},
        body,
        timeout,
        responseType = 'json',
        withCredentials,
        onProgress,
        signal,
      } = options;

      // 创建XHR对象
      const xhr = new XMLHttpRequest();

      // 打开连接
      xhr.open(method, url, true);

      // 设置响应类型
      xhr.responseType =
        responseType === 'json'
          ? 'json'
          : (responseType as XMLHttpRequestResponseType);

      // 设置超时
      if (timeout) {
        xhr.timeout = timeout;
      }

      // 设置凭证
      if (withCredentials) {
        xhr.withCredentials = true;
      }

      // 设置请求头
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      // 上传进度回调
      if (onProgress && method !== 'GET') {
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        };
      }

      // 响应处理
      xhr.onload = () => {
        const responseHeaders: Record<string, string> = {};
        xhr
          .getAllResponseHeaders()
          .split('\r\n')
          .forEach(line => {
            if (!line) return;
            const parts = line.split(': ');
            if (parts.length === 2) {
              responseHeaders[parts[0].toLowerCase()] = parts[1];
            }
          });

        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          data: xhr.response,
          headers: responseHeaders,
        });
      };

      // 错误处理
      xhr.onerror = () => reject(new Error('网络请求失败'));
      xhr.ontimeout = () => reject(new Error('请求超时'));

      // 中止处理
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('请求已中止'));
        });
      }

      // 发送请求
      xhr.send(body);
    });
  }

  /**
   * 上传分片
   * @param url 上传地址
   * @param chunk 数据块
   * @param headers 请求头
   * @param metadata 元数据
   */
  public async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: IChunkMetadata
  ): Promise<any> {
    try {
      // 创建FormData
      const formData = new FormData();

      // 添加元数据
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          formData.append(key, String(value));
        });
      }

      // 添加文件数据
      formData.append('chunk', new Blob([chunk]));

      // 发送请求
      const response = await this.request(url, {
        method: 'POST',
        headers,
        body: formData,
        onProgress: this.options.progressCallback,
      });

      return response.data;
    } catch (error) {
      this.logger.error('上传分片失败', error);

      // 使用重试机制
      return this.executeWithRetry(() =>
        this.uploadChunk(url, chunk, headers, metadata)
      );
    }
  }

  /**
   * 获取推荐配置
   */
  public getRecommendedConfig(): Record<string, any> {
    const baseConfig = super.getRecommendedConfig();

    // 根据浏览器特性调整配置
    const recommendedConfig = {
      ...baseConfig,
      chunkSize: 2 * 1024 * 1024, // 2MB分片大小
      concurrentUploads: 3, // 3个并发上传
      useWorkers: this.supportedFeatures[BrowserFeature.WEB_WORKER],
      useServiceWorker: this.supportedFeatures[BrowserFeature.SERVICE_WORKER],
      useStreams: this.supportedFeatures[BrowserFeature.STREAMS_API],
      useCrypto: this.supportedFeatures[BrowserFeature.WEB_CRYPTO],
      storageMethod: this.supportedFeatures[BrowserFeature.INDEXED_DB]
        ? 'indexedDB'
        : 'localStorage',
    };

    return recommendedConfig;
  }

  /**
   * 获取存储提供者
   */
  public getStorage(): any {
    if (!this.storage) {
      throw new Error('存储不可用');
    }

    return {
      getItem: async (key: string): Promise<string | null> => {
        return this.storage.getItem(key);
      },

      setItem: async (key: string, value: string): Promise<void> => {
        this.storage.setItem(key, value);
      },

      removeItem: async (key: string): Promise<void> => {
        this.storage.removeItem(key);
      },

      clear: async (): Promise<void> => {
        this.storage.clear();
      },

      keys: async (): Promise<string[]> => {
        return Object.keys(this.storage);
      },

      isAvailable: (): boolean => {
        return this.supportedFeatures[BrowserFeature.LOCAL_STORAGE];
      },
    };
  }

  /**
   * 适配器销毁钩子
   */
  protected onDispose(): void {
    this.logger.debug('销毁浏览器适配器');
    // 清理资源
  }
}

export default BrowserUnifiedAdapter;
