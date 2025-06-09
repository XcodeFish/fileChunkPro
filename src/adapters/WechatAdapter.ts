/**
 * WechatAdapter - 微信小程序环境适配器
 * 实现微信小程序环境下的文件读取与上传功能
 *
 * 主要功能：
 * 1. 微信文件API适配
 * 2. 微信网络API适配
 * 3. 小程序特定限制处理
 * 4. 微信存储适配
 */

import { UploadError } from '../core/ErrorCenter';
import { UploadErrorType, NetworkQuality, EnvironmentType } from '../types';
import { Logger } from '../utils/Logger';

import { IAdapter, RequestOptions, IStorage, FileInfo } from './interfaces';
import { MiniProgramStorage } from './storage/MiniProgramStorage';

// 微信小程序适配器配置接口
interface WechatAdapterOptions {
  timeout?: number; // 请求超时时间
  maxRetries?: number; // 最大重试次数
  progressCallback?: (progress: number) => void; // 上传进度回调
  abortSignal?: { aborted: boolean }; // 中止信号
}

export class WechatAdapter implements IAdapter {
  private timeout: number;
  private maxRetries: number;
  private progressCallback?: (progress: number) => void;
  private abortSignal?: { aborted: boolean };
  private networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private logger: Logger;
  private storage: IStorage;

  /**
   * 创建微信小程序适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: WechatAdapterOptions = {}) {
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3;
    this.progressCallback = options.progressCallback;
    this.abortSignal = options.abortSignal;
    this.logger = new Logger('WechatAdapter');
    this.storage = new MiniProgramStorage('wechat');

    // 检测并警告worker设置
    if ((options as any).useWorker) {
      this.logger.warn('微信小程序环境不支持Web Worker，已自动禁用此功能');
    }

    // 验证微信小程序环境
    this.validateEnvironment();
  }

  /**
   * 获取环境类型
   * @returns 环境类型
   */
  getEnvironmentType(): EnvironmentType {
    return 'wechat';
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
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const requestTask: any = null;

    const request = {
      send: async (data?: { data?: any; headers?: Record<string, string> }) => {
        try {
          const response = await this.request(options.url, {
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
          // 触发中止事件
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
   * 获取存储提供者
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
   * 读取文件
   * @param file 文件路径
   * @param start 开始位置
   * @param size 读取大小
   * @returns Promise<ArrayBuffer>
   */
  async readFile(file: any, start: number, size: number): Promise<ArrayBuffer> {
    if (typeof file === 'string') {
      return this.readChunk(file, start, size);
    } else if (file && typeof file.path === 'string') {
      return this.readChunk(file.path, start, size);
    } else {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '微信小程序适配器需要文件路径字符串或包含path属性的对象'
      );
    }
  }

  /**
   * 创建文件读取器
   * @returns 文件读取器模拟对象
   */
  createFileReader(): any {
    // 微信小程序没有FileReader，返回模拟对象
    const callbacks: Record<string, any> = {};
    const reader = {
      readAsArrayBuffer: (blob: any) => {
        const fs = wx.getFileSystemManager();
        // 如果是文件路径
        if (typeof blob === 'string') {
          fs.readFile({
            filePath: blob,
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
        } else if (blob && typeof blob.path === 'string') {
          fs.readFile({
            filePath: blob.path,
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
        } else {
          if (callbacks.onerror) {
            callbacks.onerror({
              target: {
                error: new Error(
                  '无效的文件对象，需要文件路径或包含path属性的对象'
                ),
              },
            });
          }
        }
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
   * @param file 文件路径或文件对象
   * @returns 文件信息
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
      wx.getFileInfo({
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
   * @param url 请求URL
   * @param options 请求选项
   */
  async request(url: string, options: RequestOptions = {}): Promise<any> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.timeout,
    } = options;

    return new Promise((resolve, reject) => {
      const task = wx.request({
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
          if (error.errMsg.includes('abort')) {
            reject(
              new UploadError(UploadErrorType.CANCEL_ERROR, '请求被中止', error)
            );
          } else if (error.errMsg.includes('timeout')) {
            reject(
              new UploadError(UploadErrorType.TIMEOUT_ERROR, '请求超时', error)
            );
          } else {
            reject(
              new UploadError(
                UploadErrorType.NETWORK_ERROR,
                `请求失败: ${error.errMsg || JSON.stringify(error)}`,
                error
              )
            );
          }
        },
      });

      // 如果提供了中止信号
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          task.abort();
        });
      }
    });
  }

  /**
   * 验证微信小程序环境是否可用
   * @private
   */
  private validateEnvironment(): void {
    if (typeof wx === 'undefined') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前不是微信小程序环境，无法使用微信小程序适配器'
      );
    }

    // 检查文件系统API是否可用
    if (typeof wx.getFileSystemManager !== 'function') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前微信小程序环境不支持文件系统API'
      );
    }
  }

  /**
   * 从文件中读取指定范围的数据块
   * @param filePath 文件路径，微信小程序中通常是临时文件路径或用户选择的文件路径
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
      const fs = wx.getFileSystemManager();

      // 读取文件块
      return new Promise<ArrayBuffer>((resolve, reject) => {
        fs.readFile({
          filePath,
          position: start,
          length: size,
          success: res => {
            // 微信小程序readFile返回的data可能是ArrayBuffer或string
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

      // 处理元数据，如果有的话使用FormData形式
      if (metadata) {
        return await this.uploadWithFormData(url, chunk, headers, metadata);
      } else {
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
        multiplier = 2; // 网络差时延迟更长
        break;
      case NetworkQuality.GOOD:
      case NetworkQuality.EXCELLENT:
        multiplier = 0.5; // 网络好时延迟更短
        break;
    }

    // 添加随机抖动避免多个请求同时重试
    const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15的随机数

    // 最终延迟时间，最大不超过30秒
    return Math.min(exponentialDelay * multiplier * jitter, 30000);
  }

  /**
   * 使用FormData形式上传（用于包含元数据的情况）
   * @private
   */
  private async uploadWithFormData(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata: { chunkIndex?: number; totalChunks?: number; fileName?: string }
  ): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      // 创建临时文件路径
      const tempFilePath = `${wx.env.USER_DATA_PATH}/chunk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const fs = wx.getFileSystemManager();

      try {
        // 将ArrayBuffer写入临时文件
        fs.writeFileSync(tempFilePath, chunk);

        // 构建FormData所需的参数
        const formData: Record<string, any> = {};
        if (metadata.chunkIndex !== undefined) {
          formData.chunkIndex = String(metadata.chunkIndex);
        }
        if (metadata.totalChunks !== undefined) {
          formData.totalChunks = String(metadata.totalChunks);
        }
        if (metadata.fileName) {
          formData.fileName = metadata.fileName;
        }

        // 设置超时
        const timeoutId = setTimeout(() => {
          if (uploadTask) {
            uploadTask.abort();
          }
          reject(
            new UploadError(
              UploadErrorType.TIMEOUT_ERROR,
              `上传请求超时(${this.timeout}ms)`
            )
          );
        }, this.timeout);

        // 使用uploadFile API
        const uploadTask = wx.uploadFile({
          url,
          filePath: tempFilePath,
          name: 'chunk',
          formData,
          header: headers,
          success: res => {
            clearTimeout(timeoutId);

            // 清理临时文件
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              this.logger.warn('清理临时文件失败', e);
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                // 尝试解析JSON响应
                const parsedData = JSON.parse(res.data);
                resolve(parsedData);
              } catch (e) {
                // 如果不是JSON格式，返回原始响应
                resolve(res.data);
              }
            } else if (res.statusCode >= 500) {
              reject(
                new UploadError(
                  UploadErrorType.SERVER_ERROR,
                  `服务器错误(${res.statusCode})`,
                  { status: res.statusCode, data: res.data }
                )
              );
            } else {
              reject(
                new UploadError(
                  UploadErrorType.NETWORK_ERROR,
                  `HTTP错误(${res.statusCode})`,
                  { status: res.statusCode, data: res.data }
                )
              );
            }
          },
          fail: err => {
            clearTimeout(timeoutId);

            // 清理临时文件
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              this.logger.warn('清理临时文件失败', e);
            }

            reject(err);
          },
        });

        // 监听上传进度
        if (this.progressCallback && uploadTask.onProgressUpdate) {
          uploadTask.onProgressUpdate(res => {
            this.progressCallback!(res.progress);
          });
        }

        // 处理取消事件
        if (this.abortSignal) {
          const checkAbort = () => {
            if (this.abortSignal?.aborted && uploadTask) {
              uploadTask.abort();
              reject(
                new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
              );
            } else {
              setTimeout(checkAbort, 100);
            }
          };
          checkAbort();
        }
      } catch (err) {
        // 清理临时文件
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          // 忽略清理错误
        }
        reject(err);
      }
    });
  }

  /**
   * 使用wx.request API上传数据（用于无元数据的情况）
   * @private
   */
  private async uploadWithRequestAPI(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>
  ): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        if (requestTask && requestTask.abort) {
          requestTask.abort();
        }
        reject(
          new UploadError(
            UploadErrorType.TIMEOUT_ERROR,
            `上传请求超时(${this.timeout}ms)`
          )
        );
      }, this.timeout);

      // 使用request API
      const requestTask = wx.request({
        url,
        data: chunk,
        method: 'POST',
        header: {
          'Content-Type': 'application/octet-stream',
          ...headers,
        },
        success: res => {
          clearTimeout(timeoutId);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else if (res.statusCode >= 500) {
            reject(
              new UploadError(
                UploadErrorType.SERVER_ERROR,
                `服务器错误(${res.statusCode})`,
                { status: res.statusCode, data: res.data }
              )
            );
          } else {
            reject(
              new UploadError(
                UploadErrorType.NETWORK_ERROR,
                `HTTP错误(${res.statusCode})`,
                { status: res.statusCode, data: res.data }
              )
            );
          }
        },
        fail: err => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });

      // 处理取消事件
      if (this.abortSignal && requestTask && requestTask.abort) {
        const checkAbort = () => {
          if (this.abortSignal?.aborted && requestTask && requestTask.abort) {
            requestTask.abort();
            reject(
              new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
            );
          } else if (!this.abortSignal?.aborted) {
            setTimeout(checkAbort, 100);
          }
        };
        checkAbort();
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
      const testKey = '__test__';
      wx.setStorageSync(testKey, testKey);
      wx.removeStorageSync(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 检查可用空间
   * @returns 可用空间大小（字节）
   */
  public async getAvailableStorage(): Promise<number> {
    return new Promise(resolve => {
      wx.getStorageInfo({
        success: res => {
          // 计算可用空间（单位为KB，转换为字节）
          const available = (res.limitSize - res.currentSize) * 1024;
          resolve(available);
        },
        fail: () => {
          // 如果获取失败，返回保守估计值
          resolve(10 * 1024 * 1024); // 10MB
        },
      });
    });
  }

  /**
   * 检测微信小程序支持的特性
   * @returns 特性支持情况
   */
  public detectFeatures(): Record<string, boolean> {
    return {
      fileSystem: typeof wx.getFileSystemManager === 'function',
      storage: this.isStorageAvailable(),
      network: typeof wx.request === 'function',
      upload: typeof wx.uploadFile === 'function',
      download: typeof wx.downloadFile === 'function',
      socketTask: typeof wx.connectSocket === 'function',
      userDataPath: !!wx.env?.USER_DATA_PATH,
      batteryInfo: typeof wx.getBatteryInfo === 'function',
      networkType: typeof wx.getNetworkType === 'function',
      camera: typeof wx.createCameraContext === 'function',
    };
  }
}
