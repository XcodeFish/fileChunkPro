/**
 * BrowserAdapter - 浏览器环境适配器
 * 实现浏览器环境下的文件读取与上传功能
 */

import { UploadError } from '../core/ErrorCenter';
import { UploadErrorType, NetworkQuality, EnvironmentType } from '../types';
import { Logger } from '../utils/Logger';

import { IAdapter, RequestOptions, IStorage } from './interfaces';
import { BrowserStorage } from './storage/BrowserStorage';

// 扩展适配器配置接口
interface BrowserAdapterOptions {
  timeout?: number;
  maxRetries?: number;
  useChunkedUpload?: boolean;
  progressCallback?: (progress: number) => void;
  abortSignal?: AbortSignal;
  withCredentials?: boolean;
}

export class BrowserAdapter implements IAdapter {
  private supportsFetchAPI: boolean;
  private supportsXHR2: boolean;
  private timeout: number;
  private maxRetries: number;
  private useChunkedUpload: boolean;
  private progressCallback?: (progress: number) => void;
  private abortSignal?: AbortSignal;
  private withCredentials: boolean;
  private networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private logger: Logger;
  private storage: IStorage;

  /**
   * 创建浏览器适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: BrowserAdapterOptions = {}) {
    // 检测Fetch API支持情况
    this.supportsFetchAPI = typeof fetch === 'function';
    this.supportsXHR2 =
      typeof XMLHttpRequest !== 'undefined' && 'upload' in new XMLHttpRequest();
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3;
    this.useChunkedUpload = options.useChunkedUpload || false;
    this.progressCallback = options.progressCallback;
    this.abortSignal = options.abortSignal;
    this.withCredentials = options.withCredentials || false;
    this.logger = new Logger('BrowserAdapter');
    this.storage = new BrowserStorage();

    // 验证浏览器环境
    this.validateEnvironment();
  }

  /**
   * 获取环境类型
   * @returns 环境类型
   */
  getEnvironmentType(): EnvironmentType {
    return 'browser';
  }

  /**
   * 获取存储实例
   * @returns 存储实例
   */
  getStorage(): IStorage {
    return this.storage;
  }

  /**
   * 获取存储提供者（别名，兼容旧接口）
   * @returns 存储实例
   */
  getStorageProvider(): IStorage {
    return this.getStorage();
  }

  /**
   * 创建HTTP请求对象
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
    const signal = options.signal || this.abortSignal;
    const controller = new AbortController();
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};

    const request = {
      send: async (data?: { data?: any; headers?: Record<string, string> }) => {
        try {
          const response = await this.request(options.url, {
            method: options.method || 'GET',
            headers: { ...options.headers, ...(data?.headers || {}) },
            body: data?.data,
            timeout: options.timeout || this.timeout,
            signal: controller.signal,
            onProgress: options.onProgress || this.progressCallback,
            withCredentials: options.withCredentials || this.withCredentials,
          });

          // 触发成功事件
          if (listeners['success']) {
            listeners['success'].forEach(callback => callback(response));
          }

          return response;
        } catch (error) {
          // 触发错误事件
          if (listeners['error']) {
            listeners['error'].forEach(callback => callback(error));
          }
          throw error;
        }
      },
      abort: () => {
        controller.abort();
        // 触发中止事件
        if (listeners['abort']) {
          listeners['abort'].forEach(callback => callback());
        }
      },
      on: (event: string, callback: (...args: any[]) => void) => {
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(callback);
      },
    };

    // 如果提供了外部信号，监听它的中止事件
    if (signal) {
      signal.addEventListener('abort', () => request.abort());
    }

    return request;
  }

  /**
   * 读取文件
   * @param file 文件对象
   * @param start 开始位置
   * @param size 读取大小
   * @returns Promise<ArrayBuffer>
   */
  async readFile(file: any, start: number, size: number): Promise<ArrayBuffer> {
    return this.readChunk(file, start, size);
  }

  /**
   * 创建文件读取器
   * @returns 文件读取器
   */
  createFileReader(): {
    readAsArrayBuffer: (blob: Blob) => void;
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
    onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null;
  } {
    return new FileReader();
  }

  /**
   * 获取文件信息
   * @param file 文件对象
   * @returns 文件信息
   */
  async getFileInfo(file: any): Promise<{
    name: string;
    size: number;
    type?: string;
    lastModified?: number;
  }> {
    if (file instanceof File) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      };
    } else if (file instanceof Blob) {
      // Blob没有name和lastModified属性
      return {
        name: 'blob',
        size: file.size,
        type: file.type,
      };
    } else {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '浏览器适配器仅支持File或Blob类型的文件'
      );
    }
  }

  /**
   * 执行HTTP请求
   * @param url 请求URL
   * @param options 请求选项
   */
  async request(url: string, options: RequestOptions = {}): Promise<any> {
    if (this.supportsFetchAPI) {
      return this.requestWithFetch(url, options);
    } else if (this.supportsXHR2) {
      return this.requestWithXhr(url, options);
    } else {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前浏览器不支持现代HTTP请求API'
      );
    }
  }

  /**
   * 使用Fetch API发送请求
   * @private
   */
  private async requestWithFetch(
    url: string,
    options: RequestOptions
  ): Promise<any> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.timeout,
      signal,
      withCredentials,
    } = options;

    try {
      const controller = new AbortController();
      const timeoutId = timeout
        ? setTimeout(() => controller.abort(), timeout)
        : null;

      // 合并外部信号和内部信号
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      const response = await fetch(url, {
        method,
        headers,
        body,
        credentials: withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      let responseData;
      const contentType = response.headers.get('content-type');

      // 根据响应类型解析响应
      if (options.responseType === 'arraybuffer') {
        responseData = await response.arrayBuffer();
      } else if (options.responseType === 'blob') {
        responseData = await response.blob();
      } else if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        headers: this.parseHeaders(response.headers),
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new UploadError(UploadErrorType.TIMEOUT_ERROR, '请求超时', error);
      }
      throw new UploadError(UploadErrorType.NETWORK_ERROR, '请求失败', error);
    }
  }

  /**
   * 使用XMLHttpRequest发送请求
   * @private
   */
  private requestWithXhr(url: string, options: RequestOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const {
        method = 'GET',
        headers = {},
        body,
        timeout = this.timeout,
        onProgress,
        withCredentials,
      } = options;

      xhr.open(method, url, true);

      // 设置响应类型
      if (options.responseType) {
        xhr.responseType = options.responseType;
      }

      // 设置请求头
      Object.keys(headers).forEach(key => {
        xhr.setRequestHeader(key, headers[key]);
      });

      // 设置超时
      xhr.timeout = timeout;

      // 设置是否携带凭证
      xhr.withCredentials = withCredentials ?? this.withCredentials;

      // 设置进度回调
      if (onProgress && xhr.upload) {
        xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) {
            onProgress(event.loaded / event.total);
          }
        });
      }

      // 设置中止信号监听
      if (options.signal) {
        options.signal.addEventListener('abort', () => xhr.abort());
      }

      xhr.onload = function () {
        let responseData;
        try {
          if (
            xhr.responseType === 'arraybuffer' ||
            xhr.responseType === 'blob'
          ) {
            responseData = xhr.response;
          } else if (
            xhr.getResponseHeader('content-type')?.includes('application/json')
          ) {
            responseData = JSON.parse(xhr.responseText);
          } else {
            responseData = xhr.responseText;
          }
        } catch (e) {
          responseData = xhr.responseText;
        }

        const response = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          data: responseData,
          headers: {},
        };

        // 解析响应头
        const headerString = xhr.getAllResponseHeaders();
        const headerPairs = headerString.split('\u000d\u000a');
        for (let i = 0; i < headerPairs.length; i++) {
          const headerPair = headerPairs[i];
          const index = headerPair.indexOf('\u003a\u0020');
          if (index > 0) {
            const key = headerPair.substring(0, index);
            const val = headerPair.substring(index + 2);
            response.headers[key.toLowerCase()] = val;
          }
        }

        resolve(response);
      };

      xhr.onerror = function () {
        reject(
          new UploadError(UploadErrorType.NETWORK_ERROR, '网络请求失败', {
            status: xhr.status,
          })
        );
      };

      xhr.ontimeout = function () {
        reject(
          new UploadError(UploadErrorType.TIMEOUT_ERROR, '请求超时', {
            timeout,
          })
        );
      };

      // 发送请求
      xhr.send(body);
    });
  }

  /**
   * 解析响应头
   * @private
   */
  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  /**
   * 验证浏览器环境是否支持必要的API
   * @private
   */
  private validateEnvironment(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前不是浏览器环境，无法使用浏览器适配器'
      );
    }

    // 检查File API支持
    if (
      typeof File === 'undefined' ||
      typeof Blob === 'undefined' ||
      typeof FileReader === 'undefined'
    ) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前浏览器不支持File API，无法处理文件上传'
      );
    }
  }

  /**
   * 从文件中读取指定范围的数据块
   * @param filePath 浏览器环境下为File对象
   * @param start 起始字节位置
   * @param size 要读取的字节数
   * @returns Promise<ArrayBuffer> 读取的数据块
   */
  async readChunk(
    filePath: string | File | Blob,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    try {
      let file: File | Blob;

      // 处理输入参数，支持File/Blob对象或文件路径
      if (typeof filePath === 'string') {
        throw new UploadError(
          UploadErrorType.FILE_ERROR,
          '浏览器环境不支持通过文件路径读取文件，请直接提供File对象'
        );
      } else {
        file = filePath;
      }

      // 检查文件大小与请求范围
      if (start < 0 || start >= file.size) {
        throw new UploadError(
          UploadErrorType.FILE_ERROR,
          `无效的读取起始位置：${start}，文件大小：${file.size}`
        );
      }

      // 调整读取大小，防止超出文件边界
      const adjustedSize = Math.min(size, file.size - start);

      // 使用slice方法获取指定范围的文件切片
      const chunk = file.slice(start, start + adjustedSize);

      // 如果支持Streams API，尝试使用流处理大文件
      if (
        this.useChunkedUpload &&
        'stream' in Blob.prototype &&
        chunk.size > 10 * 1024 * 1024
      ) {
        return await this.readChunkAsStream(chunk);
      }

      // 使用FileReader将切片转换为ArrayBuffer
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(
              new UploadError(
                UploadErrorType.FILE_ERROR,
                '文件读取失败：无法获取ArrayBuffer格式的数据'
              )
            );
          }
        };

        reader.onerror = () => {
          reject(
            new UploadError(
              UploadErrorType.FILE_ERROR,
              '文件读取失败',
              reader.error
            )
          );
        };

        // 读取为ArrayBuffer格式
        reader.readAsArrayBuffer(chunk);
      });
    } catch (error: any) {
      if (error instanceof UploadError) {
        throw error;
      }

      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '读取文件块失败',
        error
      );
    }
  }

  /**
   * 使用流式API读取大文件块
   * @param chunk 文件块
   * @returns Promise<ArrayBuffer>
   */
  private async readChunkAsStream(chunk: Blob): Promise<ArrayBuffer> {
    // 检查是否支持流API
    if (!('stream' in Blob.prototype)) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前浏览器不支持Streams API'
      );
    }

    try {
      // 获取流
      const stream = (chunk as any).stream();
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      let isStreamDone = false;
      while (!isStreamDone) {
        const { done, value } = await reader.read();
        if (done) {
          isStreamDone = true;
          break;
        }
        chunks.push(value);
        totalLength += value.length;
      }

      // 合并所有块
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result.buffer;
    } catch (error: any) {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '流式读取文件块失败',
        error
      );
    }
  }

  /**
   * 上传数据块到指定URL
   * @param url 上传端点URL
   * @param chunk 要上传的数据块
   * @param headers 请求头
   * @returns Promise<any> 上传结果
   */
  async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: { chunkIndex?: number; totalChunks?: number; fileName?: string }
  ): Promise<any> {
    const retries = 0;

    // 使用单次尝试的方法，在catch中递归重试
    return this.attemptUpload(url, chunk, headers, metadata, retries);
  }

  /**
   * 尝试上传，失败时递归重试
   * @private
   */
  private async attemptUpload(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: { chunkIndex?: number; totalChunks?: number; fileName?: string },
    currentRetry = 0
  ): Promise<any> {
    try {
      // 检查是否应该取消请求
      if (this.abortSignal?.aborted) {
        throw new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消');
      }

      // 优先使用Fetch API，如不支持则回退到XMLHttpRequest
      if (this.supportsFetchAPI) {
        return await this.uploadWithFetch(url, chunk, headers, metadata);
      } else {
        return await this.uploadWithXhr(url, chunk, headers, metadata);
      }
    } catch (error: any) {
      // 如果是取消错误，直接抛出
      if (
        error instanceof UploadError &&
        error.type === UploadErrorType.CANCEL_ERROR
      ) {
        throw error;
      }

      // 是否已达到最大重试次数
      if (currentRetry >= this.maxRetries) {
        if (error instanceof UploadError) {
          throw error;
        }

        // 网络错误判断
        if (
          error instanceof Error &&
          (error.name === 'NetworkError' ||
            error.message?.includes('network') ||
            error.message?.includes('Network Error'))
        ) {
          throw new UploadError(
            UploadErrorType.NETWORK_ERROR,
            '网络连接失败，请检查网络设置',
            error
          );
        }

        // 超时错误判断
        if (
          error instanceof Error &&
          (error.name === 'TimeoutError' || error.message?.includes('timeout'))
        ) {
          throw new UploadError(
            UploadErrorType.TIMEOUT_ERROR,
            '上传请求超时',
            error
          );
        }

        // 其他错误
        throw new UploadError(
          UploadErrorType.UNKNOWN_ERROR,
          '上传文件块失败',
          error
        );
      }

      // 计算等待时间
      const nextRetry = currentRetry + 1;
      const delay = this.calculateRetryDelay(nextRetry);
      this.logger.warn(`上传失败，${delay}ms后进行第${nextRetry}次重试`, error);

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay));

      // 递归重试
      return this.attemptUpload(url, chunk, headers, metadata, nextRetry);
    }
  }

  /**
   * 计算重试延迟时间
   * @param retryCount 当前重试次数
   * @returns 延迟时间(毫秒)
   */
  private calculateRetryDelay(retryCount: number): number {
    // 指数退避策略，基础延迟500ms
    const baseDelay = 500;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);

    // 根据网络质量调整延迟
    let multiplier = 1;
    switch (this.networkQuality) {
      case 'poor':
        multiplier = 2; // 网络差时延迟更长
        break;
      case 'good':
      case 'excellent':
        multiplier = 0.5; // 网络好时延迟更短
        break;
    }

    // 添加随机抖动避免多个请求同时重试
    const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15的随机数

    // 最终延迟时间，最大不超过30秒
    return Math.min(exponentialDelay * multiplier * jitter, 30000);
  }

  /**
   * 使用Fetch API上传数据块
   * @private
   */
  private async uploadWithFetch(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: { chunkIndex?: number; totalChunks?: number; fileName?: string }
  ): Promise<any> {
    // 创建AbortController用于超时控制
    const controller = new AbortController();
    const signal = controller.signal;

    // 合并外部传入的abort信号
    if (this.abortSignal) {
      this.abortSignal.addEventListener('abort', () => controller.abort());
    }

    // 设置超时
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // 如果有元数据，使用FormData
      let body: BodyInit;
      if (metadata) {
        const formData = new FormData();
        formData.append('chunk', new Blob([chunk]));
        if (metadata.chunkIndex !== undefined)
          formData.append('chunkIndex', String(metadata.chunkIndex));
        if (metadata.totalChunks !== undefined)
          formData.append('totalChunks', String(metadata.totalChunks));
        if (metadata.fileName) formData.append('fileName', metadata.fileName);
        body = formData;
      } else {
        body = chunk;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: metadata
          ? {
              ...headers,
            }
          : {
              'Content-Type': 'application/octet-stream',
              ...headers,
            },
        body,
        signal,
        credentials: this.withCredentials ? 'include' : 'same-origin',
      });

      // 清除超时计时器
      clearTimeout(timeoutId);

      // 检查响应状态
      if (!response.ok) {
        // 服务器错误处理
        if (response.status >= 500) {
          throw new UploadError(
            UploadErrorType.SERVER_ERROR,
            `服务器错误(${response.status})：${response.statusText}`,
            { status: response.status, statusText: response.statusText }
          );
        }

        // 其他HTTP错误
        throw new UploadError(
          UploadErrorType.NETWORK_ERROR,
          `HTTP错误(${response.status})：${response.statusText}`,
          { status: response.status, statusText: response.statusText }
        );
      }

      // 尝试解析响应为JSON
      try {
        return await response.json();
      } catch (e) {
        // 如果响应不是JSON格式，返回文本内容
        return await response.text();
      }
    } catch (error: any) {
      // 清除超时计时器
      clearTimeout(timeoutId);

      // 处理fetch特有的中止错误
      if (error.name === 'AbortError') {
        // 区分主动取消和超时
        if (this.abortSignal?.aborted) {
          throw new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消');
        } else {
          throw new UploadError(
            UploadErrorType.TIMEOUT_ERROR,
            `上传请求超时(${this.timeout}ms)`
          );
        }
      }

      throw error;
    }
  }

  /**
   * 使用XMLHttpRequest上传数据块
   * @private
   */
  private uploadWithXhr(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: { chunkIndex?: number; totalChunks?: number; fileName?: string }
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let timedOut = false;

      // 监听上传进度
      if (xhr.upload && this.progressCallback) {
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) {
            this.progressCallback!(
              Math.round((event.loaded / event.total) * 100)
            );
          }
        };
      }

      // 设置超时处理
      const timeoutId = setTimeout(() => {
        timedOut = true;
        xhr.abort();
      }, this.timeout);

      // 中止处理
      if (this.abortSignal) {
        this.abortSignal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          clearTimeout(timeoutId);

          if (timedOut) {
            reject(
              new UploadError(
                UploadErrorType.TIMEOUT_ERROR,
                `上传请求超时(${this.timeout}ms)`
              )
            );
            return;
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response =
                xhr.responseType === 'json'
                  ? xhr.response
                  : JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              // 如果不是JSON格式，返回文本内容
              resolve(xhr.responseText);
            }
          } else if (xhr.status >= 500) {
            reject(
              new UploadError(
                UploadErrorType.SERVER_ERROR,
                `服务器错误(${xhr.status})`,
                { status: xhr.status, responseText: xhr.responseText }
              )
            );
          } else if (xhr.status > 0) {
            reject(
              new UploadError(
                UploadErrorType.NETWORK_ERROR,
                `HTTP错误(${xhr.status})`,
                { status: xhr.status, responseText: xhr.responseText }
              )
            );
          } else if (
            xhr.status === 0 &&
            !timedOut &&
            !this.abortSignal?.aborted
          ) {
            reject(
              new UploadError(UploadErrorType.NETWORK_ERROR, '网络连接失败')
            );
          }
        }
      };

      xhr.onerror = () => {
        clearTimeout(timeoutId);
        if (!timedOut) {
          reject(
            new UploadError(UploadErrorType.NETWORK_ERROR, '网络错误', {
              status: xhr.status,
              responseText: xhr.responseText,
            })
          );
        }
      };

      xhr.onabort = () => {
        clearTimeout(timeoutId);
        if (this.abortSignal?.aborted) {
          reject(new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消'));
        }
      };

      try {
        // 如果有元数据，使用FormData
        let body: any;
        if (metadata) {
          xhr.open('POST', url);
          body = new FormData();
          body.append('chunk', new Blob([chunk]));
          if (metadata.chunkIndex !== undefined)
            body.append('chunkIndex', String(metadata.chunkIndex));
          if (metadata.totalChunks !== undefined)
            body.append('totalChunks', String(metadata.totalChunks));
          if (metadata.fileName) body.append('fileName', metadata.fileName);
        } else {
          xhr.open('POST', url);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          body = chunk;
        }

        // 设置请求头
        for (const key in headers) {
          xhr.setRequestHeader(key, headers[key]);
        }

        // 设置withCredentials
        xhr.withCredentials = this.withCredentials;

        // 发送请求
        xhr.send(body);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(
          new UploadError(
            UploadErrorType.UNKNOWN_ERROR,
            '发送上传请求失败',
            error
          )
        );
      }
    });
  }

  /**
   * 设置网络质量
   * @param quality 网络质量
   */
  public setNetworkQuality(quality: NetworkQuality): void {
    this.networkQuality = quality;
  }

  /**
   * 检查是否支持本地存储
   * @returns 是否支持本地存储
   */
  public isStorageAvailable(): boolean {
    try {
      const storage = window.localStorage;
      const testKey = '__test__';
      storage.setItem(testKey, testKey);
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 检测浏览器支持的功能
   * @returns 功能支持情况
   */
  public detectFeatures(): Record<string, boolean> {
    const features = {
      fileReader: typeof FileReader !== 'undefined',
      blob: typeof Blob !== 'undefined',
      file: typeof File !== 'undefined',
      formData: typeof FormData !== 'undefined',
      arrayBuffer: typeof ArrayBuffer !== 'undefined',
      fetch: typeof fetch === 'function',
      xhr2:
        typeof XMLHttpRequest !== 'undefined' &&
        'upload' in new XMLHttpRequest(),
      blobSlice: typeof Blob !== 'undefined' && 'slice' in Blob.prototype,
      webCrypto:
        typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
      serviceWorker: 'serviceWorker' in navigator,
      indexedDB: typeof indexedDB !== 'undefined',
      webSocket: typeof WebSocket !== 'undefined',
      webWorker: typeof Worker !== 'undefined',
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      localStorage: typeof localStorage !== 'undefined',
      sessionStorage: typeof sessionStorage !== 'undefined',

      // WebAssembly 基础支持
      webAssembly: typeof WebAssembly !== 'undefined',

      // WebAssembly 具体功能支持
      webAssemblyModule:
        typeof WebAssembly !== 'undefined' &&
        typeof WebAssembly.Module === 'function',
      webAssemblyInstance:
        typeof WebAssembly !== 'undefined' &&
        typeof WebAssembly.Instance === 'function',
      webAssemblyMemory:
        typeof WebAssembly !== 'undefined' &&
        typeof WebAssembly.Memory === 'function',
      webAssemblyCompile:
        typeof WebAssembly !== 'undefined' &&
        typeof WebAssembly.compile === 'function',
      webAssemblyInstantiate:
        typeof WebAssembly !== 'undefined' &&
        typeof WebAssembly.instantiate === 'function',

      // 流和高级API支持
      readableStream: typeof ReadableStream !== 'undefined',
      writableStream: typeof WritableStream !== 'undefined',
      transformStream: typeof TransformStream !== 'undefined',

      // 高级文件API
      fileSystem: 'showDirectoryPicker' in window,
      fileSystemSync: typeof FileSystemDirectoryHandle !== 'undefined',
    };

    // 检测WebAssembly的高级特性
    if (features.webAssembly) {
      try {
        // 验证能否实例化一个简单模块
        const module = new WebAssembly.Module(
          new Uint8Array([
            0x00,
            0x61,
            0x73,
            0x6d, // WASM_BINARY_MAGIC
            0x01,
            0x00,
            0x00,
            0x00, // WASM_BINARY_VERSION
          ])
        );

        features['webAssemblyValid'] = module instanceof WebAssembly.Module;

        // 检测内存API
        if (features['webAssemblyValid']) {
          const memory = new WebAssembly.Memory({ initial: 1 });
          features['webAssemblyMemoryValid'] =
            memory instanceof WebAssembly.Memory &&
            memory.buffer instanceof ArrayBuffer;

          // 检测是否支持共享内存
          try {
            const sharedMemory = new WebAssembly.Memory({
              initial: 1,
              maximum: 1,
              shared: true,
            });
            features['webAssemblySharedMemory'] =
              sharedMemory.buffer instanceof SharedArrayBuffer;
          } catch (e) {
            features['webAssemblySharedMemory'] = false;
          }

          // 检测是否支持SIMD（向量化操作）
          try {
            // 检测SIMD是否可用需要动态加载带有SIMD指令的模块
            // 这里只能提供一个占位符，实际实现需要更复杂的测试
            features['webAssemblySIMD'] = false;
          } catch (e) {
            features['webAssemblySIMD'] = false;
          }

          // 检测是否支持多线程
          features['webAssemblyThreads'] =
            features['webAssemblySharedMemory'] &&
            typeof Atomics !== 'undefined';
        }
      } catch (e) {
        features['webAssemblyValid'] = false;
        features['webAssemblyMemoryValid'] = false;
        features['webAssemblySharedMemory'] = false;
        features['webAssemblySIMD'] = false;
        features['webAssemblyThreads'] = false;
      }
    }

    return features;
  }

  /**
   * 检查是否支持特定功能
   * @param feature 功能名称
   * @returns 是否支持
   */
  public supportsFeature(feature: string): boolean {
    const features = this.detectFeatures();
    return !!features[feature];
  }
}

export default BrowserAdapter;
