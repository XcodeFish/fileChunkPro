/**
 * OptimizedAdapterInterfaces.ts
 * 重构优化后的适配器接口定义，精简归类提高可维护性
 */

import { NetworkQuality } from '../types';
import { Environment } from '../types/environment';
import { EnvironmentType } from './interfaces';

/**
 * 存储操作接口
 * 定义跨平台统一的存储API
 */
export interface IStorageAdapter {
  /**
   * 获取存储项
   * @param key 键名
   */
  getItem(key: string): Promise<string | null>;

  /**
   * 设置存储项
   * @param key 键名
   * @param value 值
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * 删除存储项
   * @param key 键名
   */
  removeItem(key: string): Promise<void>;

  /**
   * 清空所有存储项
   */
  clear(): Promise<void>;

  /**
   * 获取所有键名
   */
  keys(): Promise<string[]>;

  /**
   * 检查存储是否可用
   */
  isAvailable(): boolean;
}

/**
 * 文件操作接口
 * 定义跨平台统一的文件操作API
 */
export interface IFileAdapter {
  /**
   * 读取文件片段
   * @param file 文件对象
   * @param start 开始位置
   * @param size 读取大小
   */
  readChunk(file: any, start: number, size: number): Promise<ArrayBuffer>;

  /**
   * 获取文件信息
   * @param file 文件对象
   */
  getFileInfo(file: any): Promise<IFileInfo>;

  /**
   * 计算文件哈希值
   * @param file 文件对象
   * @param algorithm 哈希算法
   */
  calculateFileHash?(file: any, algorithm: string): Promise<string>;
}

/**
 * 网络操作接口
 * 定义跨平台统一的网络操作API
 */
export interface INetworkAdapter {
  /**
   * 获取当前网络质量
   */
  getNetworkQuality(): NetworkQuality;

  /**
   * 设置网络质量
   * @param quality 网络质量
   */
  setNetworkQuality(quality: NetworkQuality): void;

  /**
   * 发送HTTP请求
   * @param url 请求地址
   * @param options 请求选项
   */
  request(url: string, options?: IRequestOptions): Promise<IResponse>;

  /**
   * 上传分片
   * @param url 上传地址
   * @param chunk 数据块
   * @param headers 请求头
   * @param metadata 元数据
   */
  uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: IChunkMetadata
  ): Promise<any>;
}

/**
 * 环境信息接口
 */
export interface IEnvironmentAdapter {
  /**
   * 获取环境类型
   */
  getEnvironmentType(): EnvironmentType;

  /**
   * 获取环境主类型
   */
  getEnvironment(): Environment;

  /**
   * 检测特性支持情况
   */
  detectFeatures(): Record<string, boolean>;

  /**
   * 检查是否支持特定特性
   * @param feature 特性名称
   */
  supportsFeature(feature: string): boolean;
}

/**
 * 统一适配器接口
 * 整合所有操作接口
 */
export interface IUnifiedAdapter
  extends IFileAdapter,
    INetworkAdapter,
    IStorageAdapter,
    IEnvironmentAdapter {
  /**
   * 初始化适配器
   * @param options 初始化选项
   */
  initialize(options?: IAdapterOptions): Promise<void>;

  /**
   * 获取适配器名称
   */
  getName(): string;

  /**
   * 获取适配器优先级
   */
  getPriority(): number;

  /**
   * 获取适配器支持的环境类型列表
   */
  getSupportedEnvironments(): Environment[];

  /**
   * 获取适配器支持的环境子类型列表
   */
  getSupportedEnvironmentTypes(): EnvironmentType[];

  /**
   * 获取适配器需要的特性列表
   */
  getRequiredFeatures(): string[];

  /**
   * 获取推荐配置
   */
  getRecommendedConfig(): Record<string, any>;

  /**
   * 销毁适配器，释放资源
   */
  dispose(): void;
}

/**
 * 文件信息接口
 */
export interface IFileInfo {
  /**
   * 文件名
   */
  name: string;

  /**
   * 文件大小
   */
  size: number;

  /**
   * 文件类型
   */
  type?: string;

  /**
   * 文件路径
   */
  path?: string;

  /**
   * 最后修改时间
   */
  lastModified?: number;

  /**
   * 扩展信息
   */
  [key: string]: any;
}

/**
 * HTTP响应接口
 */
export interface IResponse {
  /**
   * 是否成功
   */
  ok: boolean;

  /**
   * HTTP状态码
   */
  status: number;

  /**
   * 状态文本
   */
  statusText?: string;

  /**
   * 响应数据
   */
  data: any;

  /**
   * 响应头
   */
  headers: Record<string, string>;
}

/**
 * HTTP请求选项
 */
export interface IRequestOptions {
  /**
   * 请求方法
   */
  method?: string;

  /**
   * 请求头
   */
  headers?: Record<string, string>;

  /**
   * 请求体
   */
  body?: any;

  /**
   * 超时时间(ms)
   */
  timeout?: number;

  /**
   * 响应类型
   */
  responseType?: 'json' | 'text' | 'arraybuffer' | 'blob';

  /**
   * 是否携带凭证
   */
  withCredentials?: boolean;

  /**
   * 中止信号
   */
  signal?: AbortSignal;

  /**
   * 进度回调
   */
  onProgress?: (progress: number) => void;
}

/**
 * 分片元数据
 */
export interface IChunkMetadata {
  /**
   * 分片索引
   */
  chunkIndex?: number;

  /**
   * 总分片数
   */
  totalChunks?: number;

  /**
   * 文件名
   */
  fileName?: string;

  /**
   * 文件ID
   */
  fileId?: string;

  /**
   * 其他元数据
   */
  [key: string]: any;
}

/**
 * 适配器配置选项
 */
export interface IAdapterOptions {
  /**
   * 超时时间(ms)
   */
  timeout?: number;

  /**
   * 最大重试次数
   */
  maxRetries?: number;

  /**
   * 进度回调
   */
  progressCallback?: (progress: number) => void;

  /**
   * 中止信号
   */
  abortSignal?: AbortSignal;

  /**
   * 是否携带凭证
   */
  withCredentials?: boolean;

  /**
   * 自动检测特性
   */
  autoDetectFeatures?: boolean;

  /**
   * 调试模式
   */
  debug?: boolean;

  /**
   * 扩展选项
   */
  [key: string]: any;
}

/**
 * 适配器构建器接口
 * 用于创建适配器实例
 */
export interface IAdapterBuilder {
  /**
   * 创建适配器
   * @param options 配置选项
   */
  build(options?: IAdapterOptions): IUnifiedAdapter;

  /**
   * 设置选项
   * @param options 配置选项
   */
  withOptions(options: IAdapterOptions): IAdapterBuilder;

  /**
   * 设置超时时间
   * @param timeout 超时时间(ms)
   */
  withTimeout(timeout: number): IAdapterBuilder;

  /**
   * 设置最大重试次数
   * @param maxRetries 最大重试次数
   */
  withMaxRetries(maxRetries: number): IAdapterBuilder;

  /**
   * 设置进度回调
   * @param progressCallback 进度回调
   */
  withProgressCallback(
    progressCallback: (progress: number) => void
  ): IAdapterBuilder;

  /**
   * 设置中止信号
   * @param signal 中止信号
   */
  withAbortSignal(signal: AbortSignal): IAdapterBuilder;

  /**
   * 设置是否携带凭证
   * @param withCredentials 是否携带凭证
   */
  withCredentials(withCredentials: boolean): IAdapterBuilder;
}

/**
 * 适配器工厂接口
 * 用于创建适配器实例
 */
export interface IAdapterFactory {
  /**
   * 创建适配器
   * @param adapterType 适配器类型
   * @param options 配置选项
   */
  createAdapter(
    adapterType: EnvironmentType,
    options?: IAdapterOptions
  ): IUnifiedAdapter;

  /**
   * 创建适合当前环境的最佳适配器
   * @param options 配置选项
   */
  createBestAdapter(options?: IAdapterOptions): Promise<IUnifiedAdapter>;

  /**
   * 获取适配器构建器
   * @param adapterType 适配器类型
   */
  getBuilder(adapterType: EnvironmentType): IAdapterBuilder;
}
