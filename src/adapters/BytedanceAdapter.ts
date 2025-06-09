/**
 * BytedanceAdapter - 字节跳动小程序环境适配器
 * 实现抖音/今日头条等字节系小程序环境下的文件读取与上传功能
 *
 * 主要功能：
 * 1. 字节跳动小程序文件API适配
 * 2. 字节跳动小程序网络API适配
 * 3. 字节跳动小程序特定限制处理
 * 4. 抖音/今日头条环境支持
 */

import { UploadError } from '../core/ErrorCenter';
import { UploadErrorType, NetworkQuality, EnvironmentType } from '../types';
import { Logger } from '../utils/Logger';

import { IAdapter, RequestOptions, IStorage, FileInfo } from './interfaces';
import { MiniProgramStorage } from './storage/MiniProgramStorage';

// 字节跳动小程序适配器配置接口
interface BytedanceAdapterOptions {
  timeout?: number; // 请求超时时间
  maxRetries?: number; // 最大重试次数
  progressCallback?: (progress: number) => void; // 上传进度回调
  abortSignal?: { aborted: boolean }; // 中止信号
}

export class BytedanceAdapter implements IAdapter {
  private timeout: number;
  private maxRetries: number;
  private progressCallback?: (progress: number) => void;
  private abortSignal?: { aborted: boolean };
  private networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private logger: Logger;
  private storage: IStorage;

  /**
   * 创建字节跳动小程序适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: BytedanceAdapterOptions = {}) {
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3;
    this.progressCallback = options.progressCallback;
    this.abortSignal = options.abortSignal;
    this.logger = new Logger('BytedanceAdapter');
    this.storage = new MiniProgramStorage('bytedance');

    // 验证字节跳动小程序环境
    this.validateEnvironment();
  }

  /**
   * 获取环境类型
   * @returns 环境类型
   */
  getEnvironmentType(): EnvironmentType {
    return 'bytedance';
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
   */
  async readFile(file: any, start: number, size: number): Promise<ArrayBuffer> {
    if (typeof file === 'string') {
      return this.readChunk(file, start, size);
    } else if (file && typeof file.path === 'string') {
      return this.readChunk(file.path, start, size);
    } else {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '字节跳动小程序适配器需要文件路径字符串或包含path属性的对象'
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
        const fs = tt.getFileSystemManager();
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
      tt.getFileInfo({
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
      const task = tt.request({
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

  /**
   * 从文件中读取指定范围的数据块
   */
  async readChunk(
    filePath: string,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    // 检查文件路径是否有效
    if (!filePath || typeof filePath !== 'string') {
      throw new UploadError(UploadErrorType.FILE_ERROR, '无效的文件路径');
    }

    // 获取文件系统管理器
    const fs = tt.getFileSystemManager();

    // 读取文件块
    return new Promise<ArrayBuffer>((resolve, reject) => {
      fs.readFile({
        filePath,
        position: start,
        length: size,
        success: res => {
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
  }

  /**
   * 上传数据块到指定URL
   */
  async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    _metadata?: Record<string, any>
  ): Promise<any> {
    return this.request(url, {
      method: 'POST',
      headers,
      body: chunk,
      responseType: 'json',
    });
  }

  /**
   * 设置网络质量
   */
  setNetworkQuality(quality: NetworkQuality): void {
    this.networkQuality = quality;
  }

  /**
   * 检测环境特性
   */
  detectFeatures(): Record<string, boolean> {
    return {
      fileSystem:
        typeof tt !== 'undefined' &&
        typeof tt.getFileSystemManager === 'function',
      request: typeof tt !== 'undefined' && typeof tt.request === 'function',
      storage: typeof tt !== 'undefined' && typeof tt.getStorage === 'function',
      upload: typeof tt !== 'undefined' && typeof tt.uploadFile === 'function',
      network:
        typeof tt !== 'undefined' && typeof tt.getNetworkType === 'function',
    };
  }

  /**
   * 释放资源
   */
  dispose(): void {
    // 清理资源
  }

  /**
   * 验证字节跳动小程序环境是否可用
   */
  private validateEnvironment(): void {
    if (typeof tt === 'undefined') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前不是字节跳动小程序环境，无法使用字节跳动小程序适配器'
      );
    }

    // 检查文件系统API是否可用
    if (typeof tt.getFileSystemManager !== 'function') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前字节跳动小程序环境不支持文件系统API'
      );
    }
  }
}
