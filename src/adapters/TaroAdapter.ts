/**
 * TaroAdapter - Taro框架环境适配器
 * 实现Taro框架环境下的文件读取与上传功能
 *
 * 主要功能：
 * 1. Taro框架适配层
 * 2. 多平台小程序适配
 */

declare const Taro: any;

import { UploadError } from '../core/ErrorCenter';
import { IUploadAdapter, UploadErrorType, NetworkQuality } from '../types';
import { Logger } from '../utils/Logger';

// Taro适配器配置接口
interface TaroAdapterOptions {
  timeout?: number; // 请求超时时间
  maxRetries?: number; // 最大重试次数
  progressCallback?: (progress: number) => void; // 上传进度回调
  abortSignal?: { aborted: boolean }; // 中止信号
  withCredentials?: boolean; // 是否携带凭证
}

export default class TaroAdapter implements IUploadAdapter {
  private timeout: number;
  private maxRetries: number;
  private progressCallback?: (progress: number) => void;
  private abortSignal?: { aborted: boolean };
  private withCredentials: boolean;
  private networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  private logger: Logger;
  private currentPlatform: string;

  /**
   * 创建Taro框架适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: TaroAdapterOptions = {}) {
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3;
    this.progressCallback = options.progressCallback;
    this.abortSignal = options.abortSignal;
    this.withCredentials = options.withCredentials || false;
    this.logger = new Logger('TaroAdapter');

    // 检测当前Taro运行的平台
    this.currentPlatform = this.detectTaroPlatform();

    // 检测并警告worker设置
    if ((options as any).useWorker) {
      this.logger.warn('Taro环境不支持Web Worker，已自动禁用此功能');
    }

    // 验证Taro环境
    this.validateEnvironment();
  }

  /**
   * 检测当前Taro运行的平台
   * @private
   */
  private detectTaroPlatform(): string {
    if (process && process.env && process.env.TARO_ENV) {
      return process.env.TARO_ENV;
    }

    // 尝试从Taro运行时获取平台信息
    if (Taro && Taro.getEnv) {
      const env = Taro.getEnv();
      if (env === 'WEAPP') return 'weapp';
      if (env === 'ALIPAY') return 'alipay';
      if (env === 'SWAN') return 'swan';
      if (env === 'TT') return 'tt';
      if (env === 'WEB') return 'h5';
      if (env === 'RN') return 'rn';
      if (env === 'QUICKAPP') return 'quickapp';
      return env.toLowerCase();
    }

    return 'unknown';
  }

  /**
   * 验证Taro环境是否可用
   * @private
   */
  private validateEnvironment(): void {
    if (typeof Taro === 'undefined') {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '当前不是Taro环境，无法使用Taro适配器'
      );
    }

    // 检查文件系统API是否可用（针对小程序环境）
    if (this.currentPlatform !== 'h5' && this.currentPlatform !== 'rn') {
      try {
        const fs = Taro.getFileSystemManager();
        if (!fs || typeof fs.readFile !== 'function') {
          throw new Error('文件系统API不可用');
        }
      } catch (error) {
        throw new UploadError(
          UploadErrorType.ENVIRONMENT_ERROR,
          `当前Taro环境不支持文件系统API: ${error}`
        );
      }
    }
  }

  /**
   * 从文件中读取指定范围的数据块
   * @param filePath 文件路径
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

      // 不同平台的文件读取处理
      if (this.currentPlatform === 'h5') {
        return this.readChunkInH5(filePath, start, size);
      } else {
        return this.readChunkInMiniProgram(filePath, start, size);
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
   * 在H5环境中读取文件块
   * @private
   */
  private async readChunkInH5(
    filePath: string | File | Blob,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    // 在H5环境，filePath可能是File对象或字符串
    let file: File | Blob;

    if (typeof filePath === 'string') {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        'H5环境不支持通过文件路径读取文件，请直接提供File对象'
      );
    } else {
      file = filePath as File | Blob;
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
    // 获取文件系统管理器
    const fs = Taro.getFileSystemManager();

    // 读取文件块
    return new Promise<ArrayBuffer>((resolve, reject) => {
      fs.readFile({
        filePath,
        position: start,
        length: size,
        success: res => {
          // Taro readFile返回的data可能是ArrayBuffer或string
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
            `网络请求失败: ${error.errMsg || JSON.stringify(error)}`,
            error
          );
        }

        throw new UploadError(
          UploadErrorType.UPLOAD_ERROR,
          `上传失败: ${error.errMsg || error.message || JSON.stringify(error)}`,
          error
        );
      }

      // 计算退避延迟
      const delay = this.calculateRetryDelay(currentRetry);

      // 记录重试信息
      this.logger.info(
        `上传失败，将在${delay}ms后进行第${currentRetry + 1}次重试，错误信息: ${
          error.message || error.errMsg || JSON.stringify(error)
        }`
      );

      // 延迟后重试
      await new Promise(resolve => setTimeout(resolve, delay));

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
   * 计算重试延迟时间（指数退避策略）
   * @private
   */
  private calculateRetryDelay(retryCount: number): number {
    // 基础延迟时间（毫秒）
    const baseDelay = 300;

    // 使用指数退避策略，增加一些随机性以避免同时重试
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 300;

    // 最大延迟5秒
    return Math.min(exponentialDelay + jitter, 5000);
  }

  /**
   * 使用FormData方式上传（包含元数据）
   * @private
   */
  private async uploadWithFormData(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata: { chunkIndex?: number; totalChunks?: number; fileName?: string }
  ): Promise<any> {
    if (this.currentPlatform === 'h5') {
      // H5环境使用FormData上传
      const formData = new FormData();

      // 添加文件数据
      const blob = new Blob([chunk]);
      formData.append(
        'file',
        new File([blob], metadata.fileName || 'chunk.bin')
      );

      // 添加元数据
      if (metadata.chunkIndex !== undefined) {
        formData.append('chunkIndex', String(metadata.chunkIndex));
      }

      if (metadata.totalChunks !== undefined) {
        formData.append('totalChunks', String(metadata.totalChunks));
      }

      if (metadata.fileName) {
        formData.append('fileName', metadata.fileName);
      }

      // 使用fetch API上传
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        credentials: this.withCredentials ? 'include' : 'same-origin',
        signal: (this.abortSignal as any)?.signal,
      });

      if (!response.ok) {
        throw new UploadError(
          UploadErrorType.UPLOAD_ERROR,
          `上传失败，服务器返回状态码：${response.status}`
        );
      }

      return await response.json();
    } else {
      // 小程序环境使用Taro.uploadFile
      return new Promise((resolve, reject) => {
        // 创建临时文件
        const fs = Taro.getFileSystemManager();
        const tempFilePath = `${Taro.env.USER_DATA_PATH}/temp_upload_${Date.now()}.bin`;

        try {
          fs.writeFileSync(tempFilePath, chunk, 'binary');

          // 设置上传任务
          const uploadTask = Taro.uploadFile({
            url,
            filePath: tempFilePath,
            name: 'file',
            header: headers,
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
            success: res => {
              try {
                // 清理临时文件
                fs.unlink({
                  filePath: tempFilePath,
                  fail: () => {
                    /* 忽略清理失败 */
                  },
                });

                if (res.statusCode >= 200 && res.statusCode < 300) {
                  let data;
                  try {
                    data = JSON.parse(res.data);
                  } catch (e) {
                    data = res.data;
                  }
                  resolve(data);
                } else {
                  reject(
                    new UploadError(
                      UploadErrorType.UPLOAD_ERROR,
                      `上传失败，服务器返回状态码：${res.statusCode}`,
                      res
                    )
                  );
                }
              } catch (e) {
                reject(e);
              }
            },
            fail: err => {
              // 清理临时文件
              fs.unlink({
                filePath: tempFilePath,
                fail: () => {
                  /* 忽略清理失败 */
                },
              });

              reject(
                new UploadError(
                  UploadErrorType.UPLOAD_ERROR,
                  `上传失败: ${err.errMsg || JSON.stringify(err)}`,
                  err
                )
              );
            },
          });

          // 进度回调
          if (this.progressCallback && uploadTask.onProgressUpdate) {
            uploadTask.onProgressUpdate(res => {
              this.progressCallback!(res.progress / 100);
            });
          }

          // 中止处理
          const checkAbort = () => {
            if (this.abortSignal?.aborted && uploadTask.abort) {
              uploadTask.abort();
              reject(
                new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消')
              );
            }
          };

          // 初始检查
          checkAbort();

          // 定期检查是否中止
          const abortChecker = setInterval(checkAbort, 100);

          // 在完成时清理定时器
          uploadTask
            .then(() => clearInterval(abortChecker))
            .catch(() => clearInterval(abortChecker));
        } catch (error) {
          // 清理临时文件
          try {
            fs.unlinkSync(tempFilePath);
          } catch (e) {
            /* 忽略清理失败 */
          }

          reject(error);
        }
      });
    }
  }

  /**
   * 使用请求API上传（不包含元数据）
   * @private
   */
  private async uploadWithRequestAPI(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // 设置请求任务
      const requestTask = Taro.request({
        url,
        method: 'POST',
        data: chunk,
        header: {
          'Content-Type': 'application/octet-stream',
          ...headers,
        },
        responseType: 'text',
        dataType: 'json',
        success: res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(
              new UploadError(
                UploadErrorType.UPLOAD_ERROR,
                `上传失败，服务器返回状态码：${res.statusCode}`,
                res
              )
            );
          }
        },
        fail: err => {
          reject(
            new UploadError(
              UploadErrorType.UPLOAD_ERROR,
              `上传失败: ${err.errMsg || JSON.stringify(err)}`,
              err
            )
          );
        },
      });

      // 中止处理
      const checkAbort = () => {
        if (this.abortSignal?.aborted && requestTask.abort) {
          requestTask.abort();
          reject(new UploadError(UploadErrorType.CANCEL_ERROR, '上传已被取消'));
        }
      };

      // 初始检查
      checkAbort();

      // 定期检查是否中止
      const abortChecker = setInterval(checkAbort, 100);

      // 确保在请求完成后清理
      setTimeout(() => clearInterval(abortChecker), this.timeout + 1000);
    });
  }

  /**
   * 设置网络质量
   * @param quality 网络质量级别
   */
  public setNetworkQuality(quality: NetworkQuality): void {
    this.networkQuality = quality;
  }

  /**
   * 检查存储是否可用
   */
  public isStorageAvailable(): boolean {
    try {
      if (this.currentPlatform === 'h5') {
        return typeof localStorage !== 'undefined';
      } else {
        return true; // 小程序环境一般都有存储API
      }
    } catch (e) {
      return false;
    }
  }

  /**
   * 检测环境特性
   */
  public detectFeatures(): Record<string, boolean> {
    const features: Record<string, boolean> = {
      fileSystem: false,
      networkRequest: false,
      formData: false,
      arrayBuffer: false,
      storage: this.isStorageAvailable(),
      uploadProgress: false,
      abortRequest: false,
    };

    // 文件系统支持
    if (this.currentPlatform === 'h5') {
      features.fileSystem =
        typeof File !== 'undefined' &&
        typeof Blob !== 'undefined' &&
        typeof FileReader !== 'undefined';
    } else {
      try {
        const fs = Taro.getFileSystemManager();
        features.fileSystem = typeof fs.readFile === 'function';
      } catch {
        features.fileSystem = false;
      }
    }

    // 网络请求支持
    features.networkRequest = typeof Taro.request === 'function';

    // FormData支持
    features.formData =
      this.currentPlatform === 'h5' && typeof FormData !== 'undefined';

    // ArrayBuffer支持
    features.arrayBuffer = typeof ArrayBuffer !== 'undefined';

    // 上传进度支持
    features.uploadProgress =
      this.currentPlatform !== 'h5' &&
      typeof Taro.uploadFile === 'function' &&
      typeof Taro.uploadFile({} as any).onProgressUpdate === 'function';

    // 请求中止支持
    features.abortRequest =
      this.currentPlatform !== 'h5' &&
      typeof Taro.request({} as any).abort === 'function';

    return features;
  }
}
