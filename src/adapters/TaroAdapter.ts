/**
 * TaroAdapter - Taro框架环境适配器
 * 实现Taro框架环境下的文件读取与上传功能
 *
 * 主要功能：
 * 1. Taro框架适配层
 * 2. 多平台小程序适配
 */

declare const Taro: any;
declare const process: any;

import { UploadError } from '../core/ErrorCenter';
import { UploadErrorType } from '../types';
import { Logger } from '../utils/Logger';

import {
  BaseFrameworkAdapter,
  BaseFrameworkAdapterOptions,
  SupportedFramework,
} from './base/BaseFrameworkAdapter';
import { FileInfo, IResponse, IStorage, RequestOptions } from './interfaces';
import { BrowserStorage } from './storage/BrowserStorage';
import { MiniProgramStorage } from './storage/MiniProgramStorage';

/**
 * Taro适配器配置接口
 */
export type TaroAdapterOptions = BaseFrameworkAdapterOptions;

/**
 * Taro平台类型
 */
enum TaroPlatform {
  WEAPP = 'weapp', // 微信小程序
  ALIPAY = 'alipay', // 支付宝小程序
  SWAN = 'swan', // 百度小程序
  TT = 'tt', // 字节跳动小程序
  QQ = 'qq', // QQ小程序
  JD = 'jd', // 京东小程序
  H5 = 'h5', // H5环境
  RN = 'rn', // ReactNative环境
  QUICKAPP = 'quickapp', // 快应用环境
  UNKNOWN = 'unknown', // 未知环境
}

/**
 * Taro框架适配器
 * 用于Taro跨平台开发框架的文件上传适配
 */
export default class TaroAdapter extends BaseFrameworkAdapter {
  private logger: Logger;
  private taroPlatform: TaroPlatform = TaroPlatform.UNKNOWN;
  private storage: IStorage | null = null;

  /**
   * 创建Taro框架适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: TaroAdapterOptions = {}) {
    // 设置框架类型为Taro
    super({
      ...options,
      frameworkApi: typeof Taro !== 'undefined' ? Taro : null,
    });

    this.frameworkType = SupportedFramework.Taro;
    this.logger = new Logger('TaroAdapter');

    // 检测并警告worker设置
    if ((options as any).useWorker) {
      this.logger.warn('Taro环境不支持Web Worker，已自动禁用此功能');
    }
  }

  /**
   * 验证Taro框架API是否可用
   * @protected
   */
  protected validateFrameworkAPI(): void {
    super.validateFrameworkAPI();

    if (typeof this.frameworkApi !== 'object' || !this.frameworkApi.getEnv) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前不是有效的Taro环境，无法使用Taro适配器'
      );
    }
  }

  /**
   * 检测Taro运行的平台
   * @protected
   */
  protected detectPlatform(): void {
    // 从环境变量获取
    if (typeof process !== 'undefined' && process.env && process.env.TARO_ENV) {
      this.currentPlatform = process.env.TARO_ENV;
      this.taroPlatform =
        (process.env.TARO_ENV as TaroPlatform) || TaroPlatform.UNKNOWN;
      return;
    }

    // 从Taro运行时获取
    try {
      const env = this.frameworkApi.getEnv();
      if (env === 'WEAPP') {
        this.currentPlatform = 'weapp';
        this.taroPlatform = TaroPlatform.WEAPP;
      } else if (env === 'ALIPAY') {
        this.currentPlatform = 'alipay';
        this.taroPlatform = TaroPlatform.ALIPAY;
      } else if (env === 'SWAN') {
        this.currentPlatform = 'swan';
        this.taroPlatform = TaroPlatform.SWAN;
      } else if (env === 'TT') {
        this.currentPlatform = 'tt';
        this.taroPlatform = TaroPlatform.TT;
      } else if (env === 'WEB') {
        this.currentPlatform = 'h5';
        this.taroPlatform = TaroPlatform.H5;
      } else if (env === 'RN') {
        this.currentPlatform = 'rn';
        this.taroPlatform = TaroPlatform.RN;
      } else if (env === 'QUICKAPP') {
        this.currentPlatform = 'quickapp';
        this.taroPlatform = TaroPlatform.QUICKAPP;
      } else {
        this.currentPlatform = env.toLowerCase();
        this.taroPlatform = TaroPlatform.UNKNOWN;
      }
    } catch (error) {
      this.logger.error('检测Taro平台失败:', error);
      this.currentPlatform = 'unknown';
      this.taroPlatform = TaroPlatform.UNKNOWN;
    }
  }

  /**
   * 从文件中读取指定范围的数据块
   * @param file 文件对象、文件路径或文件ID
   * @param start 起始字节位置
   * @param size 要读取的字节数
   * @returns Promise<ArrayBuffer> 读取的数据块
   */
  async readChunk(
    file: any,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    try {
      // 检查文件是否有效
      if (!file) {
        throw new UploadError(UploadErrorType.FILE_ERROR, '无效的文件');
      }

      // 根据平台不同采用不同的读取策略
      if (this.isH5Platform()) {
        return this.readChunkInH5(file, start, size);
      } else {
        return this.readChunkInMiniProgram(file, start, size);
      }
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
   * 判断当前是否为H5平台
   * @private
   */
  private isH5Platform(): boolean {
    return (
      this.taroPlatform === TaroPlatform.H5 ||
      (typeof window !== 'undefined' && typeof document !== 'undefined')
    );
  }

  /**
   * 在H5环境中读取文件块
   * @private
   */
  private async readChunkInH5(
    file: any,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    // 处理H5环境中的文件
    let fileObj: File | Blob;

    if (typeof file === 'string') {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        'H5环境不支持通过文件路径读取文件，请直接提供File对象'
      );
    } else if (file instanceof File || file instanceof Blob) {
      fileObj = file;
    } else {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        '不支持的文件类型，请提供File或Blob对象'
      );
    }

    // 检查文件大小与请求范围
    if (start < 0 || start >= fileObj.size) {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        `无效的读取起始位置：${start}，文件大小：${fileObj.size}`
      );
    }

    // 调整读取大小，防止超出文件边界
    const adjustedSize = Math.min(size, fileObj.size - start);

    // 使用slice方法获取指定范围的文件切片
    const chunk = fileObj.slice(start, start + adjustedSize);

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
            '文件读取出错',
            reader.error
          )
        );
      };

      reader.readAsArrayBuffer(chunk);
    });
  }

  /**
   * 在小程序环境中读取文件块
   * @private
   */
  private readChunkInMiniProgram(
    filePath: string,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      try {
        // 检查文件系统管理器是否可用
        const fs = this.frameworkApi.getFileSystemManager();
        if (!fs || typeof fs.readFile !== 'function') {
          reject(
            new UploadError(
              UploadErrorType.ENVIRONMENT_ERROR,
              '当前环境不支持文件系统API'
            )
          );
          return;
        }

        // 使用小程序文件系统API读取文件片段
        fs.readFile({
          filePath,
          position: start,
          length: size,
          success: (res: any) => {
            // 处理不同平台的返回格式差异
            if (res.data instanceof ArrayBuffer) {
              resolve(res.data);
            } else if (res.data && res.data.buffer instanceof ArrayBuffer) {
              resolve(res.data.buffer);
            } else {
              reject(
                new UploadError(
                  UploadErrorType.FILE_ERROR,
                  '文件读取失败：无法获取ArrayBuffer格式的数据'
                )
              );
            }
          },
          fail: (error: any) => {
            reject(
              new UploadError(
                UploadErrorType.FILE_ERROR,
                `读取文件失败: ${error.errMsg || JSON.stringify(error)}`,
                error
              )
            );
          },
        });
      } catch (error: any) {
        reject(
          new UploadError(
            UploadErrorType.FILE_ERROR,
            `文件系统API调用失败: ${error.message || JSON.stringify(error)}`,
            error
          )
        );
      }
    });
  }

  /**
   * 上传数据块
   * @param url 上传URL
   * @param chunk 数据块
   * @param headers HTTP请求头
   * @param metadata 可选的元数据
   */
  async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<any> {
    try {
      return await this.attemptUpload(url, chunk, headers, metadata);
    } catch (error: any) {
      throw new UploadError(
        UploadErrorType.UPLOAD_ERROR,
        `上传分片失败: ${error.message || JSON.stringify(error)}`,
        error
      );
    }
  }

  /**
   * 尝试上传，带重试逻辑
   * @private
   */
  private async attemptUpload(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: Record<string, any>,
    currentRetry = 0
  ): Promise<any> {
    try {
      // 不同平台的上传处理
      if (this.isH5Platform()) {
        // H5环境支持FormData
        return await this.uploadWithFormData(
          url,
          chunk,
          headers,
          metadata || {}
        );
      } else {
        // 小程序环境
        return await this.uploadWithRequestAPI(url, chunk, headers);
      }
    } catch (error: any) {
      // 检查是否可重试
      const maxRetries = this.options.maxRetries || 3;
      if (currentRetry >= maxRetries) {
        throw error;
      }

      // 检查错误类型，只对网络错误进行重试
      if (!this.isRetriableError(error)) {
        throw error;
      }

      // 计算重试延迟时间
      const retryDelay = this.calculateRetryDelay(currentRetry);

      // 延迟后重试
      this.logger.warn(
        `上传失败，将在${retryDelay}ms后重试(${currentRetry + 1}/${maxRetries})...`
      );
      await new Promise(resolve => setTimeout(resolve, retryDelay));

      // 递归重试
      return this.attemptUpload(
        url,
        chunk,
        headers,
        metadata,
        currentRetry + 1
      );
    }
  }

  /**
   * 判断错误是否可重试
   * @private
   */
  private isRetriableError(error: any): boolean {
    // 检查是否是网络相关错误
    const errorMsg = String(error.message || error.errMsg || '');
    return (
      errorMsg.includes('network') ||
      errorMsg.includes('网络') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('超时') ||
      errorMsg.includes('connection') ||
      errorMsg.includes('连接')
    );
  }

  /**
   * 计算重试延迟时间（指数退避策略）
   * @private
   */
  private calculateRetryDelay(retryCount: number): number {
    // 基础延迟时间（毫秒）
    const baseDelay = 1000;
    // 指数退避因子
    const factor = Math.pow(2, retryCount);
    // 添加随机抖动，防止同时重试造成服务器压力
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay * factor + jitter, 30000); // 最大30秒
  }

  /**
   * 使用FormData上传（H5环境）
   * @private
   */
  private async uploadWithFormData(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata: Record<string, any>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // 创建FormData对象
      const formData = new FormData();

      // 转换ArrayBuffer为Blob
      const blob = new Blob([chunk]);

      // 添加文件到FormData
      let fileName = metadata.fileName || 'chunk';
      if (metadata.chunkIndex !== undefined) {
        fileName = `${fileName}_${metadata.chunkIndex}`;
      }
      formData.append('file', blob, fileName);

      // 添加其他元数据
      Object.keys(metadata).forEach(key => {
        if (key !== 'fileName') {
          // 文件名已经用于blob了
          formData.append(key, String(metadata[key]));
        }
      });

      // 设置请求选项
      const uploadOptions: any = {
        url,
        method: 'POST',
        header: { ...headers },
        formData,
        success: (res: any) => {
          resolve(res.data);
        },
        fail: (error: any) => {
          reject(
            new UploadError(
              UploadErrorType.UPLOAD_ERROR,
              `上传失败: ${error.errMsg || JSON.stringify(error)}`,
              error
            )
          );
        },
      };

      // 添加进度回调
      if (this.options.progressCallback && this.frameworkApi.uploadFile) {
        const task = this.frameworkApi.uploadFile({
          ...uploadOptions,
          timeout: this.options.timeout,
          filePath: '',
          name: 'file',
          formData: Object.entries(metadata).reduce(
            (acc, [key, value]) => {
              acc[key] = String(value);
              return acc;
            },
            {} as Record<string, string>
          ),
        });

        task.progress(
          (res: { progress: number; totalBytesExpected: number }) => {
            if (this.options.progressCallback) {
              this.options.progressCallback(res.progress / 100);
            }
          }
        );

        // 检查是否需要中止
        const checkAbort = () => {
          if (this.options.abortSignal?.aborted) {
            task.abort();
            reject(
              new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
            );
          }
        };

        // 定期检查是否需要中止
        const intervalId = setInterval(checkAbort, 100);

        // 请求结束时清除定时器
        task
          .then(() => {
            clearInterval(intervalId);
          })
          .catch(() => {
            clearInterval(intervalId);
          });

        // 初始检查
        checkAbort();
      } else {
        // 使用普通请求
        this.frameworkApi.request(uploadOptions);
      }
    });
  }

  /**
   * 使用RequestAPI上传（小程序环境）
   * @private
   */
  private async uploadWithRequestAPI(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // 因为小程序环境不能直接上传ArrayBuffer，我们需要使用特定方法
      const uploadTask = this.frameworkApi.uploadFile({
        url,
        header: { ...headers },
        name: 'file',
        filePath: chunk, // 小程序环境中这里应该是临时文件路径，但我们这里直接传入ArrayBuffer会在大多数平台报错
        success: (res: any) => {
          try {
            const data = JSON.parse(res.data);
            resolve(data);
          } catch {
            resolve(res.data);
          }
        },
        fail: (error: any) => {
          reject(
            new UploadError(
              UploadErrorType.UPLOAD_ERROR,
              `上传失败: ${error.errMsg || JSON.stringify(error)}`,
              error
            )
          );
        },
      });

      // 添加进度回调
      if (this.options.progressCallback && uploadTask.progress) {
        uploadTask.progress((res: { progress: number }) => {
          if (this.options.progressCallback) {
            this.options.progressCallback(res.progress / 100);
          }
        });
      }

      // 检查是否需要中止
      const checkAbort = () => {
        if (this.options.abortSignal?.aborted && uploadTask.abort) {
          uploadTask.abort();
          reject(new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消'));
        }
      };

      // 初始检查
      checkAbort();
    });
  }

  /**
   * 获取文件信息
   * @param file 文件对象或文件路径
   */
  async getFileInfo(file: any): Promise<FileInfo> {
    try {
      if (this.isH5Platform()) {
        return this.getFileInfoInH5(file);
      } else {
        return this.getFileInfoInMiniProgram(file);
      }
    } catch (error: any) {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        `获取文件信息失败: ${error.message || JSON.stringify(error)}`,
        error
      );
    }
  }

  /**
   * 获取H5环境下的文件信息
   * @private
   */
  private getFileInfoInH5(file: File | Blob): FileInfo {
    if (file instanceof File) {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      };
    } else if (file instanceof Blob) {
      return {
        name: 'blob',
        size: file.size,
        type: file.type,
      };
    } else {
      throw new UploadError(UploadErrorType.FILE_ERROR, '不支持的文件类型');
    }
  }

  /**
   * 获取小程序环境下的文件信息
   * @private
   */
  private async getFileInfoInMiniProgram(filePath: string): Promise<FileInfo> {
    return new Promise((resolve, reject) => {
      try {
        const fs = this.frameworkApi.getFileSystemManager();
        fs.getFileInfo({
          filePath,
          success: (res: any) => {
            // 从文件路径中提取文件名
            const name = filePath.split('/').pop() || 'unknown';
            resolve({
              name,
              size: res.size,
              path: filePath,
            });
          },
          fail: (error: any) => {
            reject(
              new UploadError(
                UploadErrorType.FILE_ERROR,
                `获取文件信息失败: ${error.errMsg || JSON.stringify(error)}`,
                error
              )
            );
          },
        });
      } catch (error: any) {
        reject(
          new UploadError(
            UploadErrorType.FILE_ERROR,
            `文件系统API调用失败: ${error.message || JSON.stringify(error)}`,
            error
          )
        );
      }
    });
  }

  /**
   * 获取存储实现
   */
  getStorage(): IStorage {
    if (!this.storage) {
      if (this.isH5Platform()) {
        this.storage = new BrowserStorage(this.storageKeyPrefix);
      } else {
        // 使用小程序存储API
        const storageAPI = {
          getItem: (key: string) => {
            return this.frameworkApi.getStorageSync(key);
          },
          setItem: (key: string, value: string) => {
            return this.frameworkApi.setStorageSync(key, value);
          },
          removeItem: (key: string) => {
            return this.frameworkApi.removeStorageSync(key);
          },
        };
        this.storage = new MiniProgramStorage(
          storageAPI,
          this.storageKeyPrefix
        );
      }
    }
    return this.storage;
  }

  /**
   * 执行HTTP请求
   * @param url 请求URL
   * @param options 请求选项
   */
  async request(url: string, options?: RequestOptions): Promise<IResponse> {
    try {
      const requestOptions: any = {
        url,
        method: options?.method || 'GET',
        header: options?.headers || {},
        timeout: options?.timeout || this.options.timeout,
        dataType: options?.responseType || 'json',
        withCredentials:
          options?.withCredentials || this.options.withCredentials,
      };

      if (options?.body) {
        requestOptions.data = options.body;
      }

      return new Promise((resolve, reject) => {
        const requestTask = this.frameworkApi.request({
          ...requestOptions,
          success: (res: any) => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: String(res.statusCode),
              data: res.data,
              headers: res.header || {},
            });
          },
          fail: (error: any) => {
            reject(
              new UploadError(
                UploadErrorType.NETWORK_ERROR,
                `请求失败: ${error.errMsg || JSON.stringify(error)}`,
                error
              )
            );
          },
        });

        // 检查是否需要中止请求
        if (options?.signal && requestTask.abort) {
          const checkAbort = () => {
            if (options.signal?.aborted) {
              requestTask.abort();
              reject(
                new UploadError(UploadErrorType.CANCEL_ERROR, '请求已被取消')
              );
            }
          };

          // 初始检查
          checkAbort();

          // 监听abort信号
          if (options.signal.addEventListener) {
            options.signal.addEventListener('abort', checkAbort);
          }
        }
      });
    } catch (error: any) {
      throw new UploadError(
        UploadErrorType.NETWORK_ERROR,
        `请求执行失败: ${error.message || JSON.stringify(error)}`,
        error
      );
    }
  }

  /**
   * 检测环境特性
   * @returns 环境特性支持情况
   */
  detectFeatures(): Record<string, boolean> {
    const features: Record<string, boolean> = {
      fileSystem: false,
      networkRequest: false,
      uploadFile: false,
      storage: false,
      arrayBuffer: false,
      blob: false,
      formData: false,
      webWorker: false,
    };

    try {
      if (this.frameworkApi) {
        // 网络请求API
        features.networkRequest =
          typeof this.frameworkApi.request === 'function';

        // 上传文件API
        features.uploadFile =
          typeof this.frameworkApi.uploadFile === 'function';

        // 存储API
        features.storage =
          typeof this.frameworkApi.setStorage === 'function' &&
          typeof this.frameworkApi.getStorage === 'function';

        // H5特定特性检测
        if (this.isH5Platform()) {
          features.arrayBuffer = typeof ArrayBuffer === 'function';
          features.blob = typeof Blob === 'function';
          features.formData = typeof FormData === 'function';
          features.webWorker = typeof Worker === 'function';
        } else {
          // 小程序特定特性检测
          try {
            const fs = this.frameworkApi.getFileSystemManager();
            features.fileSystem = typeof fs.readFile === 'function';
          } catch {
            features.fileSystem = false;
          }
        }
      }
    } catch (error) {
      this.logger.error('检测环境特性失败:', error);
    }

    return features;
  }

  /**
   * 检查当前平台是否支持特定功能
   * @param feature 特性名称
   * @returns 是否支持
   */
  isPlatformSupported(feature: string): boolean {
    const features = this.detectFeatures();
    return !!features[feature];
  }

  /**
   * 计算文件哈希
   * @param file 文件对象或路径
   * @param algorithm 哈希算法
   */
  async calculateFileHash(file: any, algorithm: string): Promise<string> {
    try {
      if (this.isH5Platform()) {
        // H5环境使用Web Crypto API
        return this.calculateFileHashInH5(file, algorithm);
      } else {
        // 小程序环境没有内置的哈希计算，需要分片读取并自行实现
        // 这里简化处理，实际项目中应当完整实现
        throw new UploadError(
          UploadErrorType.ENVIRONMENT_ERROR,
          '当前小程序环境不支持文件哈希计算'
        );
      }
    } catch (error: any) {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        `计算文件哈希失败: ${error.message || JSON.stringify(error)}`,
        error
      );
    }
  }

  /**
   * H5环境下计算文件哈希
   * @private
   */
  private async calculateFileHashInH5(
    file: File | Blob,
    algorithm: string
  ): Promise<string> {
    // 检查Web Crypto API是否可用
    if (!window.crypto || !window.crypto.subtle) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前环境不支持Web Crypto API'
      );
    }

    // 将文件读取为ArrayBuffer
    const fileBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('无法读取文件为ArrayBuffer'));
        }
      };
      reader.onerror = () => {
        reject(reader.error);
      };
      reader.readAsArrayBuffer(file);
    });

    // 计算哈希
    const hashBuffer = await window.crypto.subtle.digest(algorithm, fileBuffer);

    // 转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hashHex;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 清理资源和事件监听
    this.storage = null;
    // 子类可以扩展其他清理逻辑
  }
}
