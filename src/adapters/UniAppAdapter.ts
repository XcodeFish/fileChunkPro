/**
 * UniAppAdapter - uni-app框架环境适配器
 * 实现uni-app框架环境下的文件读取与上传功能
 *
 * 主要功能：
 * 1. uni-app环境支持
 * 2. uni-app特定功能适配
 */

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

// 确保uni对象在类型系统中可用
declare const uni: any;
declare const plus: any;
declare const process: any;

/**
 * UniApp适配器配置接口
 */
export type UniAppAdapterOptions = BaseFrameworkAdapterOptions;

/**
 * uni-app平台类型
 */
enum UniAppPlatform {
  APP = 'app', // App(Android/iOS)
  APP_PLUS = 'app-plus', // App(Android/iOS)
  H5 = 'h5', // H5
  MP_WEIXIN = 'mp-weixin', // 微信小程序
  MP_ALIPAY = 'mp-alipay', // 支付宝小程序
  MP_BAIDU = 'mp-baidu', // 百度小程序
  MP_TOUTIAO = 'mp-toutiao', // 字节跳动小程序
  MP_QQ = 'mp-qq', // QQ小程序
  MP_KUAISHOU = 'mp-kuaishou', // 快手小程序
  MP_LARK = 'mp-lark', // 飞书小程序
  MP_JD = 'mp-jd', // 京东小程序
  QUICKAPP_WEBVIEW = 'quickapp-webview', // 快应用Webview
  QUICKAPP_NATIVE = 'quickapp-native', // 快应用原生
  UNKNOWN = 'unknown', // 未知环境
}

/**
 * uni-app框架适配器
 * 用于uni-app跨平台开发框架的文件上传适配
 */
export default class UniAppAdapter extends BaseFrameworkAdapter {
  private logger: Logger;
  private uniPlatform: UniAppPlatform = UniAppPlatform.UNKNOWN;
  private storage: IStorage | null = null;

  /**
   * 创建uni-app框架适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: UniAppAdapterOptions = {}) {
    // 设置框架类型为uni-app
    super({
      ...options,
      frameworkApi: typeof uni !== 'undefined' ? uni : null,
    });

    this.frameworkType = SupportedFramework.UniApp;
    this.logger = new Logger('UniAppAdapter');

    // 检测并警告worker设置
    if ((options as any).useWorker) {
      this.logger.warn('uni-app环境不支持Web Worker，已自动禁用此功能');
    }
  }

  /**
   * 验证uni-app框架API是否可用
   * @protected
   */
  protected validateFrameworkAPI(): void {
    super.validateFrameworkAPI();

    if (typeof this.frameworkApi !== 'object') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前不是有效的uni-app环境，无法使用uni-app适配器'
      );
    }

    // 检查基本API是否可用
    if (
      typeof this.frameworkApi.request !== 'function' ||
      typeof this.frameworkApi.uploadFile !== 'function'
    ) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前uni-app环境缺少必要的网络API'
      );
    }
  }

  /**
   * 检测uni-app运行的平台
   * @protected
   */
  protected detectPlatform(): void {
    // 从环境变量获取
    if (
      typeof process !== 'undefined' &&
      process.env &&
      process.env.UNI_PLATFORM
    ) {
      this.currentPlatform = process.env.UNI_PLATFORM;
      this.uniPlatform =
        (process.env.UNI_PLATFORM as UniAppPlatform) || UniAppPlatform.UNKNOWN;
      return;
    }

    // 从uni运行时获取
    try {
      const systemInfo = this.frameworkApi.getSystemInfoSync();

      // 尝试从系统信息中获取平台信息
      if (systemInfo && systemInfo.uniPlatform) {
        this.currentPlatform = systemInfo.uniPlatform;
        this.uniPlatform =
          (systemInfo.uniPlatform as UniAppPlatform) || UniAppPlatform.UNKNOWN;
        return;
      }

      // 通过环境特征推断平台
      if (typeof plus !== 'undefined') {
        this.currentPlatform = 'app';
        this.uniPlatform = UniAppPlatform.APP;
      } else if (
        typeof window !== 'undefined' &&
        typeof document !== 'undefined'
      ) {
        this.currentPlatform = 'h5';
        this.uniPlatform = UniAppPlatform.H5;
      } else {
        // 小程序环境判断
        if (systemInfo && systemInfo.platform) {
          if (
            systemInfo.platform.includes('ios') ||
            systemInfo.platform.includes('android')
          ) {
            this.currentPlatform = 'app';
            this.uniPlatform = UniAppPlatform.APP;
          } else {
            this.currentPlatform = systemInfo.platform;
          }
        }

        // 如果是小程序环境，可以通过特定的API判断类型
        if (typeof this.frameworkApi.__wxjs_environment !== 'undefined') {
          this.currentPlatform = 'mp-weixin';
          this.uniPlatform = UniAppPlatform.MP_WEIXIN;
        } else if (
          typeof this.frameworkApi.canIUse === 'function' &&
          this.frameworkApi.canIUse('getAccountInfoSync')
        ) {
          this.currentPlatform = 'mp-weixin';
          this.uniPlatform = UniAppPlatform.MP_WEIXIN;
        }
      }
    } catch (error) {
      this.logger.error('检测uni-app平台失败:', error);
      this.currentPlatform = 'unknown';
      this.uniPlatform = UniAppPlatform.UNKNOWN;
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
      this.uniPlatform === UniAppPlatform.H5 ||
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

        // uni-app小程序环境读取文件
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

      // 检查是否在uni-app的H5环境中
      if (this.isH5Platform()) {
        // 使用uni-app的上传API
        const uploadOptions: any = {
          url,
          header: { ...headers },
          formData,
          name: 'file',
          files: [
            {
              name: 'file',
              file: blob,
              uri: fileName,
            },
          ],
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
        };

        // 添加进度回调
        let task;
        if (this.options.progressCallback) {
          task = this.frameworkApi.uploadFile({
            ...uploadOptions,
            timeout: this.options.timeout,
          });

          if (task && task.onProgressUpdate) {
            task.onProgressUpdate((res: { progress: number }) => {
              if (this.options.progressCallback) {
                this.options.progressCallback(res.progress / 100);
              }
            });
          }
        } else {
          this.frameworkApi.uploadFile(uploadOptions);
        }

        // 检查是否需要中止
        if (task && this.options.abortSignal) {
          const checkAbort = () => {
            if (this.options.abortSignal?.aborted && task.abort) {
              task.abort();
              reject(
                new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
              );
            }
          };

          // 定期检查是否需要中止
          const intervalId = setInterval(checkAbort, 100);

          // 设置一个超时时间来清除定时器，避免长时间占用资源
          setTimeout(() => {
            clearInterval(intervalId);
          }, this.options.timeout || 30000);

          // 初始检查
          checkAbort();
        }
      } else {
        // 如果不在uni-app环境，使用标准fetch API（几乎不会走到这里）
        reject(
          new UploadError(
            UploadErrorType.ENVIRONMENT_ERROR,
            '当前环境不支持FormData上传'
          )
        );
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
      // 在uni-app小程序环境中，我们需要先将ArrayBuffer写入临时文件
      const tempFilePath = `${this.frameworkApi.env.USER_DATA_PATH}/chunk_${Date.now()}.bin`;
      const fs = this.frameworkApi.getFileSystemManager();

      try {
        // 写入临时文件
        fs.writeFileSync(tempFilePath, chunk, 'binary');

        // 使用上传API
        const uploadTask = this.frameworkApi.uploadFile({
          url,
          filePath: tempFilePath,
          name: 'file',
          header: headers,
          success: (res: any) => {
            // 清理临时文件
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              this.logger.warn('清理临时文件失败:', e);
            }

            try {
              const data = JSON.parse(res.data);
              resolve(data);
            } catch {
              resolve(res.data);
            }
          },
          fail: (error: any) => {
            // 清理临时文件
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {
              this.logger.warn('清理临时文件失败:', e);
            }

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
        if (this.options.progressCallback && uploadTask.onProgressUpdate) {
          uploadTask.onProgressUpdate((res: { progress: number }) => {
            if (this.options.progressCallback) {
              this.options.progressCallback(res.progress / 100);
            }
          });
        }

        // 检查是否需要中止
        if (this.options.abortSignal && uploadTask.abort) {
          const checkAbort = () => {
            if (this.options.abortSignal?.aborted) {
              uploadTask.abort();
              reject(
                new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
              );

              // 清理临时文件
              try {
                fs.unlinkSync(tempFilePath);
              } catch (e) {
                this.logger.warn('清理临时文件失败:', e);
              }
            }
          };

          // 初始检查
          checkAbort();

          // 设置定期检查
          const intervalId = setInterval(checkAbort, 100);

          // 设置超时清理
          setTimeout(() => {
            clearInterval(intervalId);
          }, this.options.timeout || 30000);
        }
      } catch (error: any) {
        // 清理临时文件
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // 忽略清理错误
        }

        reject(
          new UploadError(
            UploadErrorType.FILE_ERROR,
            `处理文件失败: ${error.message || error.errMsg || JSON.stringify(error)}`,
            error
          )
        );
      }
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
          if (typeof options.signal.addEventListener === 'function') {
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
   * 获取当前平台可用存储估计
   * uni-app特有功能
   */
  async getAvailableStorage(): Promise<number> {
    if (this.uniPlatform === UniAppPlatform.APP) {
      try {
        // App环境使用plus.io
        if (typeof plus !== 'undefined' && plus.io && plus.io.getStorageInfo) {
          return new Promise((resolve, reject) => {
            plus.io.getStorageInfo({
              success: (info: any) => {
                resolve(info.freeDiskSpace);
              },
              fail: (error: any) => {
                reject(error);
              },
            });
          });
        }
      } catch (error) {
        this.logger.warn('获取存储信息失败:', error);
      }
    }

    // 对于其他平台，尝试使用通用API
    try {
      return new Promise((resolve, _reject) => {
        this.frameworkApi.getStorageInfoSync({
          success: (res: any) => {
            if (typeof res.limitSize === 'number') {
              resolve(res.limitSize - res.currentSize);
            } else {
              // 如果没有限制大小信息，返回一个默认值
              resolve(50 * 1024 * 1024); // 默认50MB
            }
          },
          fail: () => {
            // 默认返回一个保守估计
            resolve(10 * 1024 * 1024); // 10MB
          },
        });
      });
    } catch (error) {
      return 10 * 1024 * 1024; // 10MB as fallback
    }
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
