/**
 * ReactNativeAdapter.ts
 * React Native 环境适配器，提供 React Native 平台的文件上传功能
 */

import { UploadError } from '../core/ErrorCenter';
import { UploadErrorType, ReactNativeFeature } from '../types';

import {
  BaseFrameworkAdapter,
  BaseFrameworkAdapterOptions,
  SupportedFramework,
} from './base/BaseFrameworkAdapter';
import {
  EnvironmentType,
  FileInfo,
  IResponse,
  IStorage,
  RequestOptions,
} from './interfaces';

/**
 * React Native 适配器配置选项
 */
export interface ReactNativeAdapterOptions extends BaseFrameworkAdapterOptions {
  rnFetch?: any; // React Native fetch API
  rnFileSystem?: any; // React Native 文件系统 API (react-native-fs)
  rnAsyncStorage?: any; // React Native AsyncStorage API
  rnNetInfo?: any; // React Native NetInfo API
  byteBufferPolyfill?: boolean; // 是否使用 ByteBuffer 的 polyfill
  maxNetworkRetries?: number; // 最大网络重试次数
  networkRetryDelay?: number; // 网络重试延迟 (ms)
  useBackgroundUpload?: boolean; // 是否使用后台上传
  tempFileDirectory?: string; // 临时文件目录路径
}

/**
 * React Native 适配器
 * 提供 React Native 平台的文件上传能力
 */
export class ReactNativeAdapter extends BaseFrameworkAdapter {
  private rnFetch: any;
  private rnFileSystem: any;
  private rnAsyncStorage: any;
  private rnNetInfo: any;
  private byteBufferPolyfill: boolean;
  private maxNetworkRetries: number;
  private networkRetryDelay: number;
  private useBackgroundUpload: boolean;
  private tempFileDirectory: string;
  private storageImpl: ReactNativeStorage | null = null;

  /**
   * 创建 React Native 适配器实例
   * @param options 配置选项
   */
  constructor(options: ReactNativeAdapterOptions = {}) {
    super(options);

    // 设置框架类型
    this.frameworkType = SupportedFramework.ReactNative;

    // 提取 React Native 特定 API
    this.rnFetch = options.rnFetch;
    this.rnFileSystem = options.rnFileSystem;
    this.rnAsyncStorage = options.rnAsyncStorage;
    this.rnNetInfo = options.rnNetInfo;

    // 配置选项
    this.byteBufferPolyfill = options.byteBufferPolyfill !== false;
    this.maxNetworkRetries = options.maxNetworkRetries || 3;
    this.networkRetryDelay = options.networkRetryDelay || 1000;
    this.useBackgroundUpload = options.useBackgroundUpload || false;
    this.tempFileDirectory = options.tempFileDirectory || '';

    // 初始化和验证 API
    this.validateReactNativeAPIs();
    this.initializeAPIs();
  }

  /**
   * 验证必需的 React Native API 是否可用
   * @private
   */
  private validateReactNativeAPIs(): void {
    // 验证 fetch API
    if (!this.rnFetch && typeof global.fetch !== 'function') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        'React Native fetch API 不可用'
      );
    }

    // 文件系统 API 是必需的
    if (!this.rnFileSystem) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        'React Native 文件系统 API (react-native-fs) 不可用，请确保已安装 react-native-fs 并提供给适配器'
      );
    }

    // AsyncStorage 是必需的
    if (!this.rnAsyncStorage) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        'React Native AsyncStorage API 不可用，请确保已安装 @react-native-async-storage/async-storage 并提供给适配器'
      );
    }
  }

  /**
   * 初始化 API 引用
   * @private
   */
  private initializeAPIs(): void {
    // 如果没有提供 fetch，使用全局 fetch
    if (!this.rnFetch) {
      this.rnFetch = global.fetch.bind(global);
    }

    // 设置临时目录路径
    if (!this.tempFileDirectory) {
      this.tempFileDirectory = this.rnFileSystem.CachesDirectoryPath;
    }
  }

  /**
   * 获取环境类型
   * @returns 环境类型 REACT_NATIVE
   */
  getEnvironmentType(): EnvironmentType {
    return EnvironmentType.REACT_NATIVE;
  }

  /**
   * 读取文件内容
   * @param filePath 文件路径或 URI
   * @param start 开始位置，单位字节
   * @param size 读取大小，单位字节
   * @returns Promise<ArrayBuffer> 文件内容
   */
  async readFile(
    filePath: string,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    try {
      // 确保文件路径是字符串
      if (typeof filePath !== 'string') {
        throw new UploadError(
          UploadErrorType.INVALID_PARAMETER,
          'React Native 环境下，filePath 必须是字符串路径或 URI'
        );
      }

      // 检查文件是否存在
      const exists = await this.rnFileSystem.exists(filePath);
      if (!exists) {
        throw new UploadError(
          UploadErrorType.FILE_NOT_FOUND,
          `文件不存在: ${filePath}`
        );
      }

      // 获取文件大小
      const fileInfo = await this.rnFileSystem.stat(filePath);
      const fileSize = fileInfo.size;

      // 验证读取范围
      if (start < 0 || start >= fileSize) {
        throw new UploadError(
          UploadErrorType.INVALID_PARAMETER,
          `无效的起始位置: ${start}`
        );
      }

      // 调整读取大小
      const actualSize = Math.min(size, fileSize - start);

      // 使用 react-native-fs 读取文件片段
      const base64Data = await this.rnFileSystem.read(
        filePath,
        actualSize,
        start,
        'base64'
      );

      // 将 base64 转换为 ArrayBuffer
      return this.base64ToArrayBuffer(base64Data);
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(
        UploadErrorType.FILE_READ_ERROR,
        `读取文件失败: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * 将 base64 字符串转换为 ArrayBuffer
   * @param base64 base64 编码的字符串
   * @returns ArrayBuffer
   * @private
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = global.atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes.buffer;
  }

  /**
   * 创建文件读取器
   * 在 React Native 环境中，返回一个简化的文件读取接口
   * @returns 文件读取器对象
   */
  createFileReader(): any {
    return {
      readAsArrayBuffer: async (file: string, options?: ReadChunkOptions) => {
        const start = options?.offset || 0;
        const size = options?.size || 0;
        return await this.readFile(file, start, size);
      },
      readAsText: async (file: string, options?: ReadChunkOptions) => {
        const buffer = await this.readFile(
          file,
          options?.offset || 0,
          options?.size || 0
        );
        const decoder = new TextDecoder();
        return decoder.decode(buffer);
      },
      abort: () => {
        // React Native 中没有直接的中止方法，这里只是一个空实现
        console.warn('React Native 环境中不支持中止文件读取');
      },
    };
  }

  /**
   * 获取文件信息
   * @param filePath 文件路径或 URI
   * @returns Promise<FileInfo> 文件信息
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      // 确保文件路径是字符串
      if (typeof filePath !== 'string') {
        throw new UploadError(
          UploadErrorType.INVALID_PARAMETER,
          'React Native 环境下，filePath 必须是字符串路径或 URI'
        );
      }

      // 检查文件是否存在
      const exists = await this.rnFileSystem.exists(filePath);
      if (!exists) {
        throw new UploadError(
          UploadErrorType.FILE_NOT_FOUND,
          `文件不存在: ${filePath}`
        );
      }

      // 获取文件信息
      const stat = await this.rnFileSystem.stat(filePath);

      // 提取文件名
      const fileName = filePath.split('/').pop() || 'unknown';

      // 构建文件信息对象
      return {
        name: fileName,
        size: stat.size,
        type: this.getMimeTypeFromPath(filePath),
        path: filePath,
        lastModified: stat.mtime ? new Date(stat.mtime).getTime() : Date.now(),
      };
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        `获取文件信息失败: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * 根据文件路径推断 MIME 类型
   * @param path 文件路径
   * @returns MIME 类型字符串
   * @private
   */
  private getMimeTypeFromPath(path: string): string {
    const extension = path.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      html: 'text/html',
      htm: 'text/html',
      json: 'application/json',
      xml: 'application/xml',
      zip: 'application/zip',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      webm: 'video/webm',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * 创建请求对象
   * @param options 请求配置
   * @returns 请求对象
   */
  createRequest(options: RequestOptions): {
    send: (data?: {
      data?: any;
      headers?: Record<string, string>;
    }) => Promise<any>;
    abort: () => void;
    on: (event: string, callback: (...args: any[]) => void) => void;
  } {
    let abortController: AbortController | null = new AbortController();
    const events: Record<string, Array<(...args: any[]) => void>> = {
      progress: [],
      error: [],
      success: [],
      abort: [],
    };

    const request = {
      send: async (data?: { data?: any; headers?: Record<string, string> }) => {
        try {
          if (!abortController) {
            throw new UploadError(
              UploadErrorType.INVALID_STATE,
              '请求已被中止，无法发送'
            );
          }

          const { data: requestData, headers: requestHeaders } = data || {};
          const {
            url,
            method = 'GET',
            headers = {},
            responseType = 'json',
          } = options;

          // 合并请求头
          const mergedHeaders = { ...headers, ...requestHeaders };

          // 构造请求选项
          const fetchOptions: RequestInit = {
            method,
            headers: mergedHeaders,
            signal: abortController.signal,
            body: requestData,
          };

          // 发送请求
          const response = await this.rnFetch(url, fetchOptions);

          // 准备响应数据
          let responseData;
          if (responseType === 'json') {
            responseData = await response.json();
          } else if (responseType === 'text') {
            responseData = await response.text();
          } else if (responseType === 'arraybuffer') {
            const buffer = await response.arrayBuffer();
            responseData = buffer;
          } else if (responseType === 'blob') {
            throw new UploadError(
              UploadErrorType.ENVIRONMENT_ERROR,
              'React Native 环境不支持 blob 响应类型'
            );
          }

          // 构造标准响应对象
          const result: IResponse = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            data: responseData,
            headers: this.parseHeaders(response.headers),
          };

          // 触发成功事件
          events.success.forEach(callback => callback(result));

          return result;
        } catch (error) {
          // 判断是否是因为中止导致的错误
          if ((error as any)?.name === 'AbortError') {
            events.abort.forEach(callback => callback());
            throw new UploadError(
              UploadErrorType.REQUEST_ABORTED,
              '请求已被中止',
              error
            );
          }

          const uploadError = this.parseError(error);

          // 触发错误事件
          events.error.forEach(callback => callback(uploadError));

          throw uploadError;
        }
      },
      abort: () => {
        if (abortController) {
          abortController.abort();
          abortController = null;

          // 触发中止事件
          events.abort.forEach(callback => callback());
        }
      },
      on: (event: string, callback: (...args: any[]) => void) => {
        if (events[event]) {
          events[event].push(callback);
        }
        return request;
      },
    };

    return request;
  }

  /**
   * 解析响应头
   * @param headers Response Headers 对象
   * @returns 响应头对象
   * @private
   */
  private parseHeaders(headers: any): Record<string, string> {
    const result: Record<string, string> = {};

    // React Native 的 Headers 对象可能有不同的接口
    if (typeof headers.forEach === 'function') {
      headers.forEach((value: string, name: string) => {
        result[name] = value;
      });
    } else if (typeof headers.entries === 'function') {
      // 标准 Headers 接口
      const entries = headers.entries();
      let entry = entries.next();

      while (!entry.done) {
        const [name, value] = entry.value;
        result[name] = value;
        entry = entries.next();
      }
    } else {
      // 回退到对象遍历
      Object.keys(headers).forEach(key => {
        result[key] = headers[key];
      });
    }

    return result;
  }

  /**
   * 上传数据块
   * @param url 上传URL
   * @param chunk 数据块
   * @param headers HTTP请求头
   * @param metadata 可选的元数据
   * @returns Promise<any> 上传响应
   */
  async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<any> {
    try {
      // 创建临时文件以用于上传
      const tempFileName = `upload_chunk_${Date.now()}_${Math.floor(Math.random() * 10000)}.tmp`;
      const tempFilePath = `${this.tempFileDirectory}/${tempFileName}`;

      // 将 ArrayBuffer 转换为 base64 并写入临时文件
      const base64Data = this.arrayBufferToBase64(chunk);
      await this.rnFileSystem.writeFile(tempFilePath, base64Data, 'base64');

      // 构建表单数据
      const formData = new FormData();

      // 添加元数据
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });
      }

      // 添加文件
      formData.append('file', {
        uri: `file://${tempFilePath}`,
        name: metadata?.fileName || 'chunk.dat',
        type: 'application/octet-stream',
      } as any);

      // 设置请求选项
      const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
          ...headers,
          // 不要手动设置 Content-Type，让 FormData 自动设置
        },
        body: formData,
      };

      // 执行上传
      const response = await this.rnFetch(url, requestOptions);

      // 删除临时文件
      this.rnFileSystem.unlink(tempFilePath).catch(err => {
        console.warn('清理临时文件失败:', err);
      });

      // 解析响应
      let responseData;
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // 检查响应状态
      if (!response.ok) {
        throw new UploadError(
          UploadErrorType.UPLOAD_FAILED,
          `上传失败: HTTP ${response.status} ${response.statusText}`,
          responseData
        );
      }

      return responseData;
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(
        UploadErrorType.UPLOAD_FAILED,
        `上传数据块失败: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * 将 ArrayBuffer 转换为 base64 字符串
   * @param buffer ArrayBuffer 数据
   * @returns base64 编码的字符串
   * @private
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return global.btoa(binary);
  }

  /**
   * 获取存储实现
   * @returns IStorage 存储接口实现
   */
  getStorage(): IStorage {
    if (!this.storageImpl) {
      this.storageImpl = new ReactNativeStorage(
        this.rnAsyncStorage,
        this.storageKeyPrefix
      );
    }
    return this.storageImpl;
  }

  /**
   * 获取存储提供者（别名）
   * @returns IStorage 存储接口实现
   */
  getStorageProvider(): IStorage {
    return this.getStorage();
  }

  /**
   * 检测环境特性
   * @returns 特性支持情况
   */
  detectFeatures(): Record<string, boolean> {
    const features: Record<string, boolean> = {};

    // 基本特性检查
    features[ReactNativeFeature.FETCH] =
      !!this.rnFetch || typeof global.fetch === 'function';
    features[ReactNativeFeature.XMLHTTPREQUEST] =
      typeof global.XMLHttpRequest === 'function';
    features[ReactNativeFeature.WEBSOCKET] =
      typeof global.WebSocket === 'function';
    features[ReactNativeFeature.FILE_SYSTEM] = !!this.rnFileSystem;

    // 检查文件系统 API 的可用性
    if (this.rnFileSystem) {
      features['fs_read'] = typeof this.rnFileSystem.readFile === 'function';
      features['fs_write'] = typeof this.rnFileSystem.writeFile === 'function';
      features['fs_stat'] = typeof this.rnFileSystem.stat === 'function';
      features['fs_unlink'] = typeof this.rnFileSystem.unlink === 'function';
    }

    // 检查网络 API
    if (this.rnNetInfo) {
      features['network_info'] = true;
      features['network_state'] = typeof this.rnNetInfo.fetch === 'function';
    }

    // 存储 API
    features['async_storage'] = !!this.rnAsyncStorage;

    this.supportedFeatures = features;
    return features;
  }

  /**
   * 检查平台是否支持特定功能
   * @param featureName 功能名称
   * @returns 是否支持
   */
  isPlatformSupported(featureName: string): boolean {
    // 如果还未检测特性，先执行检测
    if (Object.keys(this.supportedFeatures).length === 0) {
      this.detectFeatures();
    }

    return !!this.supportedFeatures[featureName];
  }

  /**
   * 执行 HTTP 请求
   * @param url 请求 URL
   * @param options 请求选项
   * @returns Promise<IResponse> 响应对象
   */
  async request(url: string, options: RequestOptions = {}): Promise<IResponse> {
    const {
      method = 'GET',
      headers = {},
      body,
      responseType = 'json',
      signal,
    } = options;

    try {
      // 配置请求选项
      const fetchOptions: RequestInit = {
        method,
        headers,
        body,
        signal,
      };

      // 发送请求
      const response = await this.rnFetch(url, fetchOptions);

      // 解析响应数据
      let data;
      if (responseType === 'json') {
        data = await response.json();
      } else if (responseType === 'text') {
        data = await response.text();
      } else if (responseType === 'arraybuffer') {
        data = await response.arrayBuffer();
      } else {
        data = await response.text();
      }

      // 构造标准响应对象
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        headers: this.parseHeaders(response.headers),
      };
    } catch (error) {
      // 转换为标准错误
      throw this.parseError(error);
    }
  }

  /**
   * 计算文件哈希值
   * @param filePath 文件路径
   * @param algorithm 哈希算法
   * @returns Promise<string> 哈希值
   */
  async calculateFileHash(
    filePath: string,
    algorithm: string
  ): Promise<string> {
    try {
      // 目前 React Native 环境只支持有限的哈希算法
      if (algorithm !== 'md5' && algorithm !== 'sha1') {
        throw new UploadError(
          UploadErrorType.UNSUPPORTED_OPERATION,
          `React Native 环境不支持 ${algorithm} 哈希算法，仅支持 md5 和 sha1`
        );
      }

      // 使用 react-native-fs 提供的哈希方法
      if (algorithm === 'md5' && typeof this.rnFileSystem.hash === 'function') {
        return await this.rnFileSystem.hash(filePath, 'md5');
      } else if (
        algorithm === 'sha1' &&
        typeof this.rnFileSystem.hash === 'function'
      ) {
        return await this.rnFileSystem.hash(filePath, 'sha1');
      }

      throw new UploadError(
        UploadErrorType.UNSUPPORTED_OPERATION,
        'React Native 环境不支持所请求的哈希算法计算'
      );
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(
        UploadErrorType.HASH_CALCULATION_ERROR,
        `计算文件哈希值失败: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    super.dispose();

    // 清理存储实例
    this.storageImpl = null;
  }
}

/**
 * React Native 存储实现
 * 基于 AsyncStorage 提供 IStorage 接口实现
 */
class ReactNativeStorage implements IStorage {
  private asyncStorage: any;
  private keyPrefix: string;

  constructor(asyncStorage: any, keyPrefix = 'fileChunkPro_') {
    this.asyncStorage = asyncStorage;
    this.keyPrefix = keyPrefix;
  }

  /**
   * 格式化存储键名
   * @param key 原始键名
   * @returns 带前缀的键名
   * @private
   */
  private formatKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * 获取存储项
   * @param key 键名
   * @returns Promise<string | null> 存储的值
   */
  async getItem(key: string): Promise<string | null> {
    try {
      return await this.asyncStorage.getItem(this.formatKey(key));
    } catch (error) {
      console.error('AsyncStorage getItem 错误:', error);
      return null;
    }
  }

  /**
   * 设置存储项
   * @param key 键名
   * @param value 值
   * @returns Promise<void>
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.asyncStorage.setItem(this.formatKey(key), value);
    } catch (error) {
      throw new UploadError(
        UploadErrorType.STORAGE_ERROR,
        `AsyncStorage setItem 错误: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * 删除存储项
   * @param key 键名
   * @returns Promise<void>
   */
  async removeItem(key: string): Promise<void> {
    try {
      await this.asyncStorage.removeItem(this.formatKey(key));
    } catch (error) {
      console.error('AsyncStorage removeItem 错误:', error);
    }
  }

  /**
   * 清空所有存储项
   * @returns Promise<void>
   */
  async clear(): Promise<void> {
    try {
      // 获取所有键名
      const allKeys = await this.asyncStorage.getAllKeys();

      // 过滤出带有前缀的键
      const keysToRemove = allKeys.filter((key: string) =>
        key.startsWith(this.keyPrefix)
      );

      // 批量删除
      if (keysToRemove.length > 0) {
        await this.asyncStorage.multiRemove(keysToRemove);
      }
    } catch (error) {
      console.error('AsyncStorage clear 错误:', error);
    }
  }

  /**
   * 获取所有键名
   * @returns Promise<string[]> 键名数组
   */
  async keys(): Promise<string[]> {
    try {
      // 获取所有键名
      const allKeys = await this.asyncStorage.getAllKeys();

      // 过滤出带有前缀的键，并去除前缀
      return allKeys
        .filter((key: string) => key.startsWith(this.keyPrefix))
        .map((key: string) => key.substring(this.keyPrefix.length));
    } catch (error) {
      console.error('AsyncStorage keys 错误:', error);
      return [];
    }
  }

  /**
   * 检查存储是否可用
   * @returns 是否可用
   */
  isAvailable(): boolean {
    return !!this.asyncStorage;
  }

  // 别名方法
  get(key: string): Promise<string | null> {
    return this.getItem(key);
  }

  set(key: string, value: string): Promise<void> {
    return this.setItem(key, value);
  }

  remove(key: string): Promise<void> {
    return this.removeItem(key);
  }
}
