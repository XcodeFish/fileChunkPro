/**
 * adapters/interfaces.ts
 * 定义统一的适配器接口和类型
 */

import { NetworkQuality } from '../types';

/**
 * 基础适配器配置选项
 * 所有适配器配置的通用选项
 */
export interface IAdapterOptions {
  timeout?: number; // 请求超时时间(ms)
  maxRetries?: number; // 最大重试次数
  progressCallback?: (progress: number) => void; // 进度回调
  abortSignal?: AbortSignal; // 中止信号
  withCredentials?: boolean; // 请求是否携带凭证
  autoDetectFeatures?: boolean; // 是否自动检测环境特性
}

/**
 * 文件读取选项
 */
export interface ReadChunkOptions {
  offset: number; // 读取起始位置
  size: number; // 读取大小
  priority?: number; // 读取优先级
  signal?: AbortSignal; // 中止信号
}

/**
 * 分块上传选项
 */
export interface UploadChunkOptions {
  url: string; // 上传URL
  headers?: Record<string, string>; // 请求头
  onProgress?: (progress: number) => void; // 进度回调
  timeout?: number; // 超时时间(ms)
  signal?: AbortSignal; // 中止信号
  metadata?: {
    // 元数据
    chunkIndex?: number; // 分片索引
    totalChunks?: number; // 总分片数
    fileName?: string; // 文件名
    fileId?: string; // 文件ID
    [key: string]: any; // 其他元数据
  };
}

/**
 * 文件信息接口
 */
export interface FileInfo {
  name: string; // 文件名
  size: number; // 文件大小
  type?: string; // 文件MIME类型
  path?: string; // 文件路径(仅小程序环境)
  lastModified?: number; // 文件最后修改时间
}

/**
 * 存储接口
 */
export interface IStorage {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  isAvailable(): boolean;
}

/**
 * 网络请求响应
 */
export interface IResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  data: any;
  headers: Record<string, string>;
}

/**
 * 统一适配器接口
 * 定义跨平台文件上传需要的核心功能
 */
export interface IAdapter {
  /**
   * 从文件中读取指定范围的数据
   * @param file 文件对象、文件路径或文件ID
   * @param start 起始字节位置
   * @param size 要读取的字节数
   */
  readChunk(file: any, start: number, size: number): Promise<ArrayBuffer>;

  /**
   * 上传数据块
   * @param url 上传URL
   * @param chunk 数据块
   * @param headers HTTP请求头
   * @param metadata 可选的元数据
   */
  uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<any>;

  /**
   * 获取文件信息
   * @param file 文件对象或文件路径
   */
  getFileInfo(file: any): Promise<FileInfo>;

  /**
   * 获取存储实现
   */
  getStorage(): IStorage;

  /**
   * 检测环境特性
   * @returns 特性支持情况
   */
  detectFeatures(): Record<string, boolean>;

  /**
   * 设置网络质量
   * @param quality 网络质量等级
   */
  setNetworkQuality(quality: NetworkQuality): void;

  /**
   * 获取当前网络质量
   */
  getNetworkQuality(): NetworkQuality;

  /**
   * 执行HTTP请求
   * @param url 请求URL
   * @param options 请求选项
   */
  request(url: string, options?: RequestOptions): Promise<IResponse>;

  /**
   * 检查是否支持特定功能
   * @param feature 功能名称
   */
  supportsFeature(feature: string): boolean;

  /**
   * 计算文件哈希值(用于文件指纹/秒传)
   * @param file 文件对象或文件路径
   * @param algorithm 哈希算法，如'md5'、'sha1'等
   */
  calculateFileHash?(file: any, algorithm: string): Promise<string>;

  /**
   * 清理资源
   */
  dispose(): void;
}

/**
 * 请求选项
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  responseType?: 'json' | 'text' | 'arraybuffer' | 'blob';
  withCredentials?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

/**
 * 抽象适配器基类
 * 提供适配器公共功能实现
 */
export abstract class AbstractAdapter implements IAdapter {
  protected options: IAdapterOptions;
  protected networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
  protected supportedFeatures: Record<string, boolean> = {};

  constructor(options: IAdapterOptions = {}) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      withCredentials: false,
      autoDetectFeatures: true,
      ...options,
    };

    if (this.options.autoDetectFeatures) {
      this.supportedFeatures = this.detectFeatures();
    }
  }

  abstract readChunk(
    file: any,
    start: number,
    size: number
  ): Promise<ArrayBuffer>;

  abstract uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<any>;

  abstract getFileInfo(file: any): Promise<FileInfo>;

  abstract getStorage(): IStorage;

  abstract detectFeatures(): Record<string, boolean>;

  abstract request(url: string, options?: RequestOptions): Promise<IResponse>;

  setNetworkQuality(quality: NetworkQuality): void {
    this.networkQuality = quality;
  }

  getNetworkQuality(): NetworkQuality {
    return this.networkQuality;
  }

  supportsFeature(feature: string): boolean {
    return !!this.supportedFeatures[feature];
  }

  dispose(): void {
    // 默认实现，子类可以重写
  }
}
