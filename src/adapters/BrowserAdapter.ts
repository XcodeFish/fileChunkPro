/**
 * BrowserAdapter - 浏览器环境适配器
 * 实现浏览器环境下的文件读取与上传功能
 */

import { UploadError } from '../core/ErrorCenter';
import { IUploadAdapter, UploadErrorType } from '../types';

export class BrowserAdapter implements IUploadAdapter {
  private supportsFetchAPI: boolean;
  private timeout: number;

  /**
   * 创建浏览器适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: { timeout?: number } = {}) {
    // 检测Fetch API支持情况
    this.supportsFetchAPI = typeof fetch === 'function';
    this.timeout = options.timeout || 30000; // 默认30秒超时

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
   * 上传数据块到指定URL
   * @param url 上传端点URL
   * @param chunk 要上传的数据块
   * @param headers 请求头
   * @returns Promise<any> 上传结果
   */
  async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>
  ): Promise<any> {
    try {
      // 优先使用Fetch API，如不支持则回退到XMLHttpRequest
      if (this.supportsFetchAPI) {
        return await this.uploadWithFetch(url, chunk, headers);
      } else {
        return await this.uploadWithXhr(url, chunk, headers);
      }
    } catch (error: any) {
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
  }

  /**
   * 使用Fetch API上传数据块
   * @private
   */
  private async uploadWithFetch(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>
  ): Promise<any> {
    // 创建AbortController用于超时控制
    const controller = new AbortController();
    const signal = controller.signal;

    // 设置超时
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...headers,
        },
        body: chunk,
        signal,
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

      // 处理中止请求的情况
      if (error.name === 'AbortError') {
        throw new UploadError(
          UploadErrorType.TIMEOUT_ERROR,
          `上传请求超时(${this.timeout}ms)`,
          error
        );
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
    headers: Record<string, string>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // 设置超时
      xhr.timeout = this.timeout;

      // 打开连接
      xhr.open('POST', url, true);

      // 设置默认headers
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      // 设置自定义headers
      Object.keys(headers).forEach(key => {
        xhr.setRequestHeader(key, headers[key]);
      });

      // 处理加载完成事件
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // 尝试解析为JSON
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            // 如果不是有效的JSON，返回原始响应文本
            resolve(xhr.responseText);
          }
        } else if (xhr.status >= 500) {
          reject(
            new UploadError(
              UploadErrorType.SERVER_ERROR,
              `服务器错误(${xhr.status})`,
              { status: xhr.status, statusText: xhr.statusText }
            )
          );
        } else {
          reject(
            new UploadError(
              UploadErrorType.NETWORK_ERROR,
              `HTTP错误(${xhr.status})`,
              { status: xhr.status, statusText: xhr.statusText }
            )
          );
        }
      };

      // 处理错误
      xhr.onerror = () => {
        reject(
          new UploadError(
            UploadErrorType.NETWORK_ERROR,
            '网络连接失败，请检查网络设置',
            { type: 'xhr_error' }
          )
        );
      };

      // 处理超时
      xhr.ontimeout = () => {
        reject(
          new UploadError(
            UploadErrorType.TIMEOUT_ERROR,
            `上传请求超时(${this.timeout}ms)`,
            { type: 'xhr_timeout' }
          )
        );
      };

      // 发送数据
      xhr.send(chunk);
    });
  }

  /**
   * 检测浏览器存储可用性
   * @returns 存储是否可用
   */
  isStorageAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e: any) {
      return false;
    }
  }

  /**
   * 检测浏览器特性
   * @returns 浏览器特性支持情况
   */
  detectFeatures(): Record<string, boolean> {
    return {
      fileApi: typeof File !== 'undefined' && typeof FileReader !== 'undefined',
      blob: typeof Blob !== 'undefined',
      arrayBuffer: typeof ArrayBuffer !== 'undefined',
      fetch: typeof fetch === 'function',
      xhr: typeof XMLHttpRequest === 'function',
      webWorker: typeof Worker !== 'undefined',
      serviceWorker:
        typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      localStorage: this.isStorageAvailable(),
      indexedDb: typeof indexedDB !== 'undefined',
    };
  }
}

export default BrowserAdapter;
