/**
 * BaseMiniProgramAdapter - 小程序基础适配器
 * 小程序环境下的通用功能实现
 */

import { UploadError } from '../../core/ErrorCenter';
import { UploadErrorType, NetworkQuality } from '../../types';
import {
  AbstractAdapter,
  IAdapterOptions,
  FileInfo,
  IResponse,
  RequestOptions,
} from '../interfaces';

/**
 * 小程序适配器基础配置选项
 */
export interface BaseMiniProgramAdapterOptions extends IAdapterOptions {
  requestApi?: any; // 小程序平台的请求API
  uploadFileApi?: any; // 小程序平台的上传文件API
  fileSystemApi?: any; // 小程序平台的文件系统API
  storageApi?: any; // 小程序平台的存储API
  storageKeyPrefix?: string; // 存储键前缀
  automaticRetry?: boolean; // 是否自动重试
  retryTimes?: number; // 重试次数
}

/**
 * 小程序环境基础适配器 - 抽象类
 * 不直接使用，由具体小程序适配器继承实现
 */
export abstract class BaseMiniProgramAdapter extends AbstractAdapter {
  protected options: BaseMiniProgramAdapterOptions;
  protected requestApi: any;
  protected uploadFileApi: any;
  protected fileSystemApi: any;
  protected storageApi: any;
  protected storageKeyPrefix: string;

  /**
   * 创建小程序基础适配器实例
   * @param options 配置选项
   */
  constructor(options: BaseMiniProgramAdapterOptions) {
    super(options);

    this.options = {
      timeout: 30000,
      maxRetries: 3,
      storageKeyPrefix: 'fileChunkPro_',
      automaticRetry: true,
      retryTimes: 3,
      ...options,
    };

    this.requestApi = options.requestApi;
    this.uploadFileApi = options.uploadFileApi;
    this.fileSystemApi = options.fileSystemApi;
    this.storageApi = options.storageApi;
    this.storageKeyPrefix = options.storageKeyPrefix || 'fileChunkPro_';

    // 验证必要的API
    this.validateRequiredAPIs();
  }

  /**
   * 验证必要的API是否可用
   * @protected
   */
  protected validateRequiredAPIs(): void {
    if (!this.requestApi) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '未提供小程序请求API'
      );
    }

    if (!this.uploadFileApi) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '未提供小程序上传API'
      );
    }
  }

  /**
   * 从文件中读取指定范围的数据
   * @param file 小程序文件路径或文件对象
   * @param start 起始字节位置
   * @param size 要读取的字节数
   * @returns Promise<ArrayBuffer> 读取的数据块
   */
  abstract readChunk(
    file: any,
    start: number,
    size: number
  ): Promise<ArrayBuffer>;

  /**
   * 上传数据块
   * @param url 上传URL
   * @param chunk 数据块
   * @param headers HTTP请求头
   * @param metadata 可选的元数据
   */
  abstract uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<any>;

  /**
   * 获取文件信息
   * @param filePath 文件路径或文件对象
   */
  abstract getFileInfo(filePath: any): Promise<FileInfo>;

  /**
   * 获取存储实现
   */
  abstract getStorage(): any;

  /**
   * 执行网络请求
   * @param url 请求URL
   * @param options 请求选项
   */
  abstract request(url: string, options?: RequestOptions): Promise<IResponse>;

  /**
   * 检测环境特性
   * @returns 环境特性支持情况
   */
  abstract detectFeatures(): Record<string, boolean>;

  /**
   * 重试请求
   * @param callback 请求回调
   * @param retries 重试次数
   * @param delay 重试延迟
   * @private
   */
  protected async retryRequest<T>(
    callback: () => Promise<T>,
    retries = this.options.retryTimes || 3,
    delay = 1000
  ): Promise<T> {
    try {
      return await callback();
    } catch (error: any) {
      if (retries <= 0 || !this.options.automaticRetry) {
        throw error;
      }

      // 网络错误才进行重试
      if (
        !error.message?.includes('网络') &&
        !error.message?.includes('network') &&
        !error.message?.includes('timeout') &&
        !error.message?.includes('超时')
      ) {
        throw error;
      }

      // 等待一定时间后重试
      await new Promise(resolve => setTimeout(resolve, delay));

      // 指数退避重试
      return this.retryRequest(callback, retries - 1, delay * 2);
    }
  }

  /**
   * 转换状态码为NetworkQuality
   * @param statusCode HTTP状态码
   * @protected
   */
  protected statusCodeToNetworkQuality(statusCode: number): NetworkQuality {
    if (statusCode >= 500) {
      return NetworkQuality.POOR;
    } else if (statusCode >= 400) {
      return NetworkQuality.LOW;
    } else if (statusCode >= 300) {
      return NetworkQuality.MEDIUM;
    } else {
      return NetworkQuality.GOOD;
    }
  }

  /**
   * 解析小程序错误
   * @param error 原始错误
   * @protected
   */
  protected parseMiniProgramError(error: any): UploadError {
    // 不同小程序平台错误格式有差异，由子类实现具体解析
    if (error instanceof UploadError) {
      return error;
    }

    const errorCode =
      error.code || error.errCode || error.errcode || error.errorCode || 0;
    const errorMsg =
      error.errMsg || error.errmsg || error.msg || error.message || '未知错误';

    let errorType = UploadErrorType.UNKNOWN_ERROR;

    // 通用错误码解析
    if (errorMsg.includes('网络') || errorMsg.includes('network')) {
      errorType = UploadErrorType.NETWORK_ERROR;
    } else if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
      errorType = UploadErrorType.TIMEOUT_ERROR;
    } else if (errorMsg.includes('权限') || errorMsg.includes('permission')) {
      errorType = UploadErrorType.PERMISSION_ERROR;
    } else if (
      errorMsg.includes('存储') ||
      errorMsg.includes('storage') ||
      errorMsg.includes('空间')
    ) {
      errorType = UploadErrorType.QUOTA_EXCEEDED_ERROR;
    } else if (errorMsg.includes('文件') || errorMsg.includes('file')) {
      errorType = UploadErrorType.FILE_ERROR;
    } else if (errorCode >= 500 || errorMsg.includes('server')) {
      errorType = UploadErrorType.SERVER_ERROR;
    }

    return new UploadError(errorType, `小程序错误: ${errorMsg}`, error);
  }

  /**
   * 格式化存储键名
   * @param key 原始键名
   * @protected
   */
  protected formatStorageKey(key: string): string {
    return `${this.storageKeyPrefix}${key}`;
  }
}
