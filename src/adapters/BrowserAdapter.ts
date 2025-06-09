/**
 * BrowserAdapter - 浏览器环境适配器
 * 实现浏览器环境下的文件读取与上传功能
 */

import { UploadError } from '../core/ErrorCenter';
import { IUploadAdapter, UploadErrorType, NetworkQuality } from '../types';
import { Logger } from '../utils/Logger';

// 扩展适配器配置接口
interface BrowserAdapterOptions {
  timeout?: number;
  maxRetries?: number;
  useChunkedUpload?: boolean;
  progressCallback?: (progress: number) => void;
  abortSignal?: AbortSignal;
  withCredentials?: boolean;
}

export class BrowserAdapter implements IUploadAdapter {
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

    // 验证浏览器环境
    this.validateEnvironment();
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
    return {
      fetch: this.supportsFetchAPI,
      xhr2: this.supportsXHR2,
      fileAPI: typeof File !== 'undefined' && typeof Blob !== 'undefined',
      formData: typeof FormData !== 'undefined',
      streams: typeof ReadableStream !== 'undefined',
      workers: typeof Worker !== 'undefined',
      serviceWorker: 'serviceWorker' in navigator,
      localStorage: this.isStorageAvailable(),
      indexedDB: 'indexedDB' in window,
      webSocket: 'WebSocket' in window,
      textEncoder: typeof TextEncoder !== 'undefined',
      performance: 'performance' in window,
    };
  }
}

export default BrowserAdapter;
