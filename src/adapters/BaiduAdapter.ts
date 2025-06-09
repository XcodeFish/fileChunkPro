/**
 * BaiduAdapter - 百度小程序环境适配器
 * 实现百度小程序环境下的文件读取与上传功能
 *
 * 主要功能：
 * 1. 百度小程序文件API适配
 * 2. 百度小程序网络请求封装
 * 3. 百度小程序特定限制处理
 * 4. 百度小程序存储适配
 */

import { UploadError } from '../core/ErrorCenter';
import { UploadErrorType, NetworkQuality, EnvironmentType } from '../types';
import { Logger } from '../utils/Logger';

import { IAdapter, RequestOptions, IStorage, FileInfo } from './interfaces';
import { MiniProgramStorage } from './storage/MiniProgramStorage';

// 百度小程序适配器配置接口
interface BaiduAdapterOptions {
  timeout?: number; // 请求超时时间
  maxRetries?: number; // 最大重试次数
  progressCallback?: (progress: number) => void; // 上传进度回调
  abortSignal?: { aborted: boolean }; // 中止信号
}

export class BaiduAdapter implements IAdapter {
  private timeout: number;
  private maxRetries: number;
  private progressCallback?: (progress: number) => void;
  private abortSignal?: { aborted: boolean };
  private networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private logger: Logger;
  private storage: IStorage;

  /**
   * 创建百度小程序适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: BaiduAdapterOptions = {}) {
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3;
    this.progressCallback = options.progressCallback;
    this.abortSignal = options.abortSignal;
    this.logger = new Logger('BaiduAdapter');
    this.storage = new MiniProgramStorage('baidu');

    // 检测并警告worker设置
    if ((options as any).useWorker) {
      this.logger.warn('百度小程序环境不支持Web Worker，已自动禁用此功能');
    }

    // 验证百度小程序环境
    this.validateEnvironment();
  }

  /**
   * 获取环境类型
   */
  getEnvironmentType(): EnvironmentType {
    return 'baidu';
  }

  /**
   * 验证百度小程序环境是否可用
   * @private
   */
  private validateEnvironment(): void {
    if (typeof swan === 'undefined') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前不是百度小程序环境，无法使用百度小程序适配器'
      );
    }

    // 检查文件系统API是否可用
    if (typeof swan.getFileSystemManager !== 'function') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前百度小程序环境不支持文件系统API'
      );
    }
  }

  /**
   * 从文件中读取指定范围的数据块
   * @param filePath 文件路径，百度小程序中通常是临时文件路径或用户选择的文件路径
   * @param start 起始字节位置
   * @param size 要读取的字节数
   * @returns Promise<ArrayBuffer> 读取的数据块
   */
  async readChunk(
    filePath: string,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    try {
      // 检查文件路径是否有效
      if (!filePath || typeof filePath !== 'string') {
        throw new UploadError(UploadErrorType.FILE_ERROR, '无效的文件路径');
      }

      // 获取文件系统管理器
      const fs = swan.getFileSystemManager();

      // 读取文件块
      return new Promise<ArrayBuffer>((resolve, reject) => {
        fs.readFile({
          filePath,
          position: start,
          length: size,
          success: res => {
            // 百度小程序readFile返回的data可能是ArrayBuffer或string
            const data = res.data;
            if (data instanceof ArrayBuffer) {
              resolve(data);
            } else {
              reject(
                new UploadError(
                  UploadErrorType.FILE_ERROR,
                  '无法以ArrayBuffer格式读取文件'
                )
              );
            }
          },
          fail: err => {
            reject(
              new UploadError(
                UploadErrorType.FILE_ERROR,
                `读取文件块失败: ${err.errMsg || JSON.stringify(err)}`,
                err
              )
            );
          },
        });
      });
    } catch (error: any) {
      if (error instanceof UploadError) {
        throw error;
      }

      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        `读取文件块失败: ${error.message || JSON.stringify(error)}`,
        error
      );
    }
  }

  /**
   * 上传数据块到指定URL
   * @param url 上传端点URL
   * @param chunk 要上传的数据块
   * @param headers 请求头
   * @param metadata 元数据，可选
   * @returns Promise<any> 上传结果
   */
  async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: { chunkIndex?: number; totalChunks?: number; fileName?: string }
  ): Promise<any> {
    const retries = 0;

    // 使用可重试的上传方法
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

      // 百度小程序的上传文件处理
      if (metadata) {
        // 如果有元数据，使用带表单的方式上传
        return await this.uploadWithFormData(url, chunk, headers, metadata);
      } else {
        // 直接上传二进制数据
        return await this.uploadWithRequestAPI(url, chunk, headers);
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
          error.errMsg?.includes('request:fail') ||
          error.errMsg?.includes('network')
        ) {
          throw new UploadError(
            UploadErrorType.NETWORK_ERROR,
            '网络连接失败，请检查网络设置',
            error
          );
        }

        // 超时错误判断
        if (error.errMsg?.includes('timeout')) {
          throw new UploadError(
            UploadErrorType.TIMEOUT_ERROR,
            '上传请求超时',
            error
          );
        }

        // 其他错误
        throw new UploadError(
          UploadErrorType.UNKNOWN_ERROR,
          `上传文件块失败: ${error.errMsg || error.message || JSON.stringify(error)}`,
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
      case NetworkQuality.POOR:
        multiplier = 2;
        break;
      case NetworkQuality.LOW:
        multiplier = 1.5;
        break;
      case NetworkQuality.MEDIUM:
        multiplier = 1;
        break;
      case NetworkQuality.GOOD:
      case NetworkQuality.EXCELLENT:
        multiplier = 0.75;
        break;
      default:
        multiplier = 1;
    }

    // 添加随机抖动以避免雷同请求
    const jitter = Math.random() * 300;
    const delay = Math.floor(exponentialDelay * multiplier + jitter);

    // 限制最大延迟为30秒
    return Math.min(delay, 30000);
  }

  /**
   * 使用FormData形式上传
   * @private
   */
  private async uploadWithFormData(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata: { chunkIndex?: number; totalChunks?: number; fileName?: string }
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let uploadTask: any = null;

      // 检查是否需要中止上传
      const checkAbort = () => {
        if (this.abortSignal?.aborted && uploadTask) {
          try {
            uploadTask.abort();
            reject(
              new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
            );
          } catch (e) {
            this.logger.error('取消上传失败', e);
          }
        }
      };

      // 如果有中止信号，定期检查
      if (this.abortSignal) {
        const interval = setInterval(() => {
          checkAbort();
          if (this.abortSignal?.aborted) {
            clearInterval(interval);
          }
        }, 200);

        // 上传完成后清除检查
        setTimeout(() => clearInterval(interval), this.timeout + 1000);
      }

      // 创建临时文件用于上传
      this.createTempFileForUpload(chunk)
        .then(tempFilePath => {
          // 百度小程序的上传文件API
          uploadTask = swan.uploadFile({
            url,
            header: headers,
            filePath: tempFilePath,
            name: 'file',
            formData: {
              chunkIndex:
                metadata.chunkIndex !== undefined
                  ? String(metadata.chunkIndex)
                  : '',
              totalChunks:
                metadata.totalChunks !== undefined
                  ? String(metadata.totalChunks)
                  : '',
              fileName: metadata.fileName || '',
            },
            success: (res: any) => {
              try {
                const response = JSON.parse(res.data);
                resolve(response);
              } catch (e) {
                resolve(res.data);
              }
            },
            fail: (err: any) => {
              reject(err);
            },
            complete: () => {
              // 删除临时文件
              this.deleteTempFile(tempFilePath);
            },
          });

          // 监听上传进度
          if (this.progressCallback && uploadTask.onProgressUpdate) {
            uploadTask.onProgressUpdate(
              (res: {
                progress: number;
                totalBytesWritten: number;
                totalBytesExpectedToWrite: number;
              }) => {
                this.progressCallback?.(res.progress / 100);
              }
            );
          }
        })
        .catch(err => {
          reject(
            new UploadError(
              UploadErrorType.FILE_ERROR,
              `创建临时文件失败: ${err.message || JSON.stringify(err)}`,
              err
            )
          );
        });
    });
  }

  /**
   * 创建临时文件用于上传
   * @private
   * @param chunk 数据块
   * @returns Promise<string> 临时文件路径
   */
  private async createTempFileForUpload(chunk: ArrayBuffer): Promise<string> {
    const fs = swan.getFileSystemManager();
    const tempFilePath = `${swan.env.USER_DATA_PATH}/upload_temp_${Date.now()}.bin`;

    return new Promise<string>((resolve, reject) => {
      fs.writeFile({
        filePath: tempFilePath,
        data: chunk,
        success: () => {
          resolve(tempFilePath);
        },
        fail: err => {
          reject(
            new UploadError(
              UploadErrorType.FILE_ERROR,
              `创建临时文件失败: ${err.errMsg || JSON.stringify(err)}`,
              err
            )
          );
        },
      });
    });
  }

  /**
   * 删除临时文件
   * @private
   * @param filePath 文件路径
   */
  private deleteTempFile(filePath: string): void {
    try {
      const fs = swan.getFileSystemManager();
      fs.unlink({
        filePath,
        fail: (err: any) => {
          this.logger.warn(
            `删除临时文件失败: ${err.errMsg || JSON.stringify(err)}`
          );
        },
      });
    } catch (error) {
      this.logger.warn('删除临时文件失败', error);
    }
  }

  /**
   * 使用请求API上传
   * @private
   */
  private async uploadWithRequestAPI(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let requestTask: any = null;

      // 检查是否需要中止上传
      const checkAbort = () => {
        if (this.abortSignal?.aborted && requestTask) {
          try {
            requestTask.abort();
            reject(
              new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
            );
          } catch (e) {
            this.logger.error('取消上传失败', e);
          }
        }
      };

      // 如果有中止信号，定期检查
      if (this.abortSignal) {
        const interval = setInterval(() => {
          checkAbort();
          if (this.abortSignal?.aborted) {
            clearInterval(interval);
          }
        }, 200);

        // 上传完成后清除检查
        setTimeout(() => clearInterval(interval), this.timeout + 1000);
      }

      // 百度小程序的请求API
      requestTask = swan.request({
        url,
        header: {
          'content-type': 'application/octet-stream',
          ...headers,
        },
        method: 'POST',
        data: chunk,
        dataType: 'text',
        timeout: this.timeout,
        success: (res: any) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response =
                typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              resolve(response);
            } catch (e) {
              resolve(res.data);
            }
          } else {
            reject(
              new UploadError(
                UploadErrorType.SERVER_ERROR,
                `服务器响应错误: HTTP ${res.statusCode}`,
                res
              )
            );
          }
        },
        fail: (err: any) => {
          reject(err);
        },
      });
    });
  }

  /**
   * 设置网络质量指标
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
      const testKey = '__test__';
      swan.setStorageSync(testKey, testKey);
      swan.removeStorageSync(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取存储接口实现
   * @returns 百度小程序存储适配器实例
   */
  public getStorage(): IStorage {
    try {
      return this.storage;
    } catch (error) {
      this.logger.error('创建存储适配器失败', error);
      throw new UploadError(
        UploadErrorType.STORAGE_ERROR,
        '初始化百度存储适配器失败',
        error as Error
      );
    }
  }

  /**
   * 获取存储提供者（别名，兼容旧接口）
   * @returns 存储实例
   */
  getStorageProvider(): IStorage {
    return this.getStorage();
  }

  /**
   * 获取可用存储空间
   * @returns Promise<number> 可用存储空间（字节）
   */
  public async getAvailableStorage(): Promise<number> {
    try {
      return new Promise<number>(resolve => {
        swan.getStorageInfo({
          success: (res: any) => {
            // 百度小程序返回的是已用空间大小和限制，计算可用空间
            const { currentSize, limitSize } = res;
            const available = limitSize - currentSize;
            resolve(available * 1024); // 转换为字节
          },
          fail: () => {
            // 如果失败，返回一个保守估计值 (5MB)
            resolve(5 * 1024 * 1024);
          },
        });
      });
    } catch {
      return 5 * 1024 * 1024; // 默认5MB
    }
  }

  /**
   * 检测适配器支持的功能
   * @returns Record<string, boolean> 功能支持情况
   */
  public detectFeatures(): Record<string, boolean> {
    return {
      fileSystem: typeof swan.getFileSystemManager === 'function',
      uploadFile: typeof swan.uploadFile === 'function',
      arrayBuffer: true,
      storage: this.isStorageAvailable(),
      network: typeof swan.getNetworkType === 'function',
    };
  }

  /**
   * 释放资源
   */
  dispose(): void {
    // 清理资源
  }

  /**
   * 创建HTTP请求对象
   */
  createRequest(options: RequestOptions): {
    send: (data?: {
      data?: any;
      headers?: Record<string, string>;
    }) => Promise<any>;
    abort: () => void;
    on: (event: string, callback: (...args: any[]) => void) => void;
  } {
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const requestTask: any = null;

    const request = {
      send: async (data?: { data?: any; headers?: Record<string, string> }) => {
        try {
          const response = await this.request(url, {
            method: options.method || 'GET',
            headers: { ...options.headers, ...(data?.headers || {}) },
            body: data?.data,
            timeout: options.timeout || this.timeout,
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
        if (requestTask && typeof requestTask.abort === 'function') {
          requestTask.abort();
          if (listeners['abort']) {
            listeners['abort'].forEach(callback => callback());
          }
        }
      },
      on: (event: string, callback: (...args: any[]) => void) => {
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(callback);
      },
    };

    return request;
  }

  /**
   * 读取文件
   */
  async readFile(file: any, start: number, size: number): Promise<ArrayBuffer> {
    if (typeof file === 'string') {
      return this.readChunk(file, start, size);
    } else if (file && typeof file.path === 'string') {
      return this.readChunk(file.path, start, size);
    } else {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '百度小程序适配器需要文件路径字符串或包含path属性的对象'
      );
    }
  }

  /**
   * 创建文件读取器
   */
  createFileReader(): any {
    const callbacks: Record<string, any> = {};
    const reader = {
      readAsArrayBuffer: (blob: any) => {
        const fs = swan.getFileSystemManager();
        const path = typeof blob === 'string' ? blob : blob?.path;

        if (!path) {
          if (callbacks.onerror) {
            callbacks.onerror({
              target: {
                error: new Error('无效的文件对象'),
              },
            });
          }
          return;
        }

        fs.readFile({
          filePath: path,
          success: res => {
            if (callbacks.onload) {
              callbacks.onload({ target: { result: res.data } });
            }
          },
          fail: error => {
            if (callbacks.onerror) {
              callbacks.onerror({ target: { error } });
            }
          },
        });
      },
      set onload(callback: any) {
        callbacks.onload = callback;
      },
      set onerror(callback: any) {
        callbacks.onerror = callback;
      },
    };

    return reader;
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(file: any): Promise<FileInfo> {
    const path = typeof file === 'string' ? file : file.path;

    if (!path) {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '无效的文件对象，需要文件路径或包含path属性的对象'
      );
    }

    return new Promise<FileInfo>((resolve, reject) => {
      swan.getFileInfo({
        filePath: path,
        success: res => {
          resolve({
            name: path.substring(path.lastIndexOf('/') + 1),
            size: res.size,
            path,
          });
        },
        fail: error => {
          reject(
            new UploadError(
              UploadErrorType.FILE_ERROR,
              `获取文件信息失败: ${error.errMsg || JSON.stringify(error)}`,
              error
            )
          );
        },
      });
    });
  }

  /**
   * 执行HTTP请求
   */
  async request(url: string, options: RequestOptions = {}): Promise<any> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.timeout,
    } = options;

    return new Promise((resolve, reject) => {
      const task = swan.request({
        url,
        method: method as any,
        header: headers,
        data: body,
        timeout,
        success: res => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.errMsg,
            data: res.data,
            headers: res.header || {},
          });
        },
        fail: error => {
          reject(
            new UploadError(
              UploadErrorType.NETWORK_ERROR,
              `请求失败: ${error.errMsg || JSON.stringify(error)}`,
              error
            )
          );
        },
      });

      // 如果提供了中止信号
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          if (task && typeof task.abort === 'function') {
            task.abort();
          }
        });
      }
    });
  }
}
