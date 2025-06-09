/**
 * BaseFrameworkAdapter - 框架适配器基类
 * 为跨平台框架(如Taro、uni-app)提供基础适配功能
 */

import { UploadError } from '../../core/ErrorCenter';
import { UploadErrorType, NetworkQuality } from '../../types';
import {
  AbstractAdapter,
  IAdapterOptions,
  FileInfo,
  IResponse,
  RequestOptions,
  IStorage,
} from '../interfaces';

/**
 * 框架适配器配置选项
 */
export interface BaseFrameworkAdapterOptions extends IAdapterOptions {
  frameworkApi?: any; // 框架API对象
  platformDetection?: boolean; // 是否启用平台检测
  useOriginalApi?: boolean; // 在可能的情况下使用原始平台API
  storageKeyPrefix?: string; // 存储键前缀
  customPlatformAPI?: Record<string, any>; // 自定义平台API
}

/**
 * 支持的框架枚举
 */
export enum SupportedFramework {
  Taro = 'taro',
  UniApp = 'uni-app',
  ReactNative = 'react-native',
  Unknown = 'unknown',
}

/**
 * 框架适配器基类
 * 为各种跨平台框架提供统一的文件上传适配功能
 */
export abstract class BaseFrameworkAdapter extends AbstractAdapter {
  protected frameworkApi: any;
  protected platformDetection: boolean;
  protected useOriginalApi: boolean;
  protected storageKeyPrefix: string;
  protected customPlatformAPI: Record<string, any>;
  protected currentPlatform = 'unknown';
  protected frameworkType: SupportedFramework = SupportedFramework.Unknown;

  /**
   * 创建框架适配器实例
   * @param options 配置选项
   */
  constructor(options: BaseFrameworkAdapterOptions) {
    super(options);

    this.frameworkApi = options.frameworkApi;
    this.platformDetection = options.platformDetection !== false; // 默认启用平台检测
    this.useOriginalApi = options.useOriginalApi !== false; // 默认使用原始平台API
    this.storageKeyPrefix = options.storageKeyPrefix || 'fileChunkPro_';
    this.customPlatformAPI = options.customPlatformAPI || {};

    // 验证框架API是否有效
    this.validateFrameworkAPI();

    // 检测平台类型
    if (this.platformDetection) {
      this.detectPlatform();
    }
  }

  /**
   * 验证框架API是否有效
   * @protected
   */
  protected validateFrameworkAPI(): void {
    if (!this.frameworkApi) {
      throw new UploadError(UploadErrorType.ENVIRONMENT_ERROR, '未提供框架API');
    }

    // 子类可以重写此方法，验证特定框架所需的API
  }

  /**
   * 检测运行平台类型
   * @protected
   */
  protected detectPlatform(): void {
    // 默认实现，子类应该重写此方法实现特定框架的平台检测
    this.currentPlatform = 'unknown';
  }

  /**
   * 从文件中读取指定范围的数据
   * @param file 文件对象或文件路径
   * @param start 起始字节位置
   * @param size 要读取的字节数
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
   * @param metadata 可选元数据
   */
  abstract uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<any>;

  /**
   * 获取文件信息
   * @param file 文件对象或文件路径
   */
  abstract getFileInfo(file: any): Promise<FileInfo>;

  /**
   * 获取存储实现
   */
  abstract getStorage(): IStorage;

  /**
   * 执行HTTP请求
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
   * 获取当前运行的平台
   * @returns 平台标识
   */
  getPlatform(): string {
    return this.currentPlatform;
  }

  /**
   * 获取框架类型
   * @returns 框架类型
   */
  getFrameworkType(): SupportedFramework {
    return this.frameworkType;
  }

  /**
   * 检查当前平台是否支持特定功能
   * @param featureName 特性名称
   * @returns 是否支持
   */
  abstract isPlatformSupported(featureName: string): boolean;

  /**
   * 将错误转换为标准错误对象
   * @param error 原始错误
   * @protected
   */
  protected parseError(error: any): UploadError {
    if (error instanceof UploadError) {
      return error;
    }

    let errorType = UploadErrorType.UNKNOWN_ERROR;
    let errorMessage = '未知错误';

    if (typeof error === 'object') {
      errorMessage =
        error.message || error.errMsg || error.error || error.msg || '未知错误';

      // 根据消息判断错误类型
      if (errorMessage.includes('network') || errorMessage.includes('网络')) {
        errorType = UploadErrorType.NETWORK_ERROR;
      } else if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('超时')
      ) {
        errorType = UploadErrorType.TIMEOUT_ERROR;
      } else if (
        errorMessage.includes('file') ||
        errorMessage.includes('文件')
      ) {
        errorType = UploadErrorType.FILE_ERROR;
      } else if (
        errorMessage.includes('permission') ||
        errorMessage.includes('权限')
      ) {
        errorType = UploadErrorType.PERMISSION_ERROR;
      } else if (
        errorMessage.includes('memory') ||
        errorMessage.includes('内存')
      ) {
        errorType = UploadErrorType.MEMORY_ERROR;
      }
    } else {
      errorMessage = String(error);
    }

    return new UploadError(errorType, `框架错误: ${errorMessage}`, error);
  }

  /**
   * 转换网络状态为NetworkQuality
   * @param networkState 网络状态对象
   * @protected
   */
  protected networkStateToQuality(_networkState: any): NetworkQuality {
    // 子类可以根据特定框架的网络状态实现转换逻辑
    return NetworkQuality.UNKNOWN;
  }
}
