/**
 * NodeAdapter - Node.js 环境适配器
 * 实现服务端环境下的文件读取、处理与上传功能
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as stream from 'stream';
import { URL } from 'url';

import { UploadError } from '../core/ErrorCenter';
import { UploadErrorType, NetworkQuality, EnvironmentType } from '../types';
import { Logger } from '../utils/Logger';

import {
  AbstractAdapter,
  IStorage,
  RequestOptions,
  IResponse,
} from './interfaces';
import { NodeStorage } from './storage/NodeStorage';

// 文件系统Promise API
const statAsync = fs.promises.stat;
const accessAsync = fs.promises.access;
const mkdirAsync = fs.promises.mkdir;

// 扩展适配器配置接口
interface NodeAdapterOptions {
  timeout?: number;
  maxRetries?: number;
  useStreamProcessing?: boolean;
  tempDir?: string;
  maxConcurrentStreams?: number;
  progressCallback?: (progress: number) => void;
  abortSignal?: AbortSignal;
  withCredentials?: boolean;
  highWaterMark?: number; // 控制流缓冲区大小
}

// 请求回调类型定义
type RequestCallback = (...args: unknown[]) => void;

// 请求响应类型
interface INodeRequestResponse {
  send: (data?: {
    data?: Record<string, unknown> | Buffer | ArrayBuffer | string;
    headers?: Record<string, string>;
  }) => Promise<IResponse>;
  abort: () => void;
  on: (event: string, callback: RequestCallback) => void;
}

/**
 * Node.js 环境适配器
 * 专为服务端环境优化的文件处理与上传适配器
 */
export class NodeAdapter extends AbstractAdapter {
  private timeout: number;
  private maxRetries: number;
  private useStreamProcessing: boolean;
  private tempDir: string;
  private maxConcurrentStreams: number;
  private progressCallback?: (progress: number) => void;
  private abortSignal?: AbortSignal;
  private withCredentials: boolean;
  private highWaterMark: number;
  private streamPool: Set<stream.Readable | stream.Writable> = new Set();
  private logger: Logger;
  private storage: IStorage;

  /**
   * 创建Node.js适配器实例
   * @param options 适配器配置选项
   */
  constructor(options: NodeAdapterOptions = {}) {
    super(options);

    this.timeout = options.timeout || 60000; // 默认60秒超时，服务端通常需要更长处理时间
    this.maxRetries = options.maxRetries || 3;
    this.useStreamProcessing = options.useStreamProcessing !== false; // 默认启用流处理
    this.tempDir = options.tempDir || path.join(process.cwd(), 'temp');
    this.maxConcurrentStreams = options.maxConcurrentStreams || 10;
    this.progressCallback = options.progressCallback;
    this.abortSignal = options.abortSignal;
    this.withCredentials = options.withCredentials || false;
    this.highWaterMark = options.highWaterMark || 64 * 1024; // 默认64KB

    this.logger = new Logger('NodeAdapter');
    this.storage = new NodeStorage();

    // 验证Node环境
    this.validateEnvironment();

    // 确保临时目录存在
    this.ensureTempDirExists();
  }

  /**
   * 获取环境类型
   * @returns 环境类型
   */
  getEnvironmentType(): EnvironmentType {
    return EnvironmentType.NODE_JS;
  }

  /**
   * 获取存储实例
   * @returns 存储实例
   */
  getStorage(): IStorage {
    return this.storage;
  }

  /**
   * 创建HTTP请求对象
   * @param options 请求配置
   * @returns 请求对象
   */
  createRequest(options: RequestOptions): INodeRequestResponse {
    const controller = new AbortController();
    const signal = options.signal || this.abortSignal || controller.signal;
    const listeners: Record<string, Array<RequestCallback>> = {};
    const req: http.ClientRequest | null = null;

    const request = {
      send: async (data?: {
        data?: Record<string, unknown> | Buffer | ArrayBuffer | string;
        headers?: Record<string, string>;
      }) => {
        try {
          const response = await this.request(options.url, {
            method: options.method || 'GET',
            headers: { ...options.headers, ...(data?.headers || {}) },
            body: data?.data,
            timeout: options.timeout || this.timeout,
            signal,
            onProgress: options.onProgress || this.progressCallback,
            withCredentials: options.withCredentials || this.withCredentials,
            responseType: options.responseType || 'json',
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
        if (req) req.abort();
        controller.abort();

        // 触发中止事件
        if (listeners['abort']) {
          listeners['abort'].forEach(callback => callback());
        }
      },
      on: (event: string, callback: RequestCallback) => {
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
   * @param filePath 文件路径
   * @param start 开始位置
   * @param size 读取大小
   * @returns Promise<ArrayBuffer>
   */
  async readFile(
    filePath: string,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    if (this.useStreamProcessing) {
      return this.readChunkAsStream(filePath, start, size);
    } else {
      return this.readChunkAsBuffer(filePath, start, size);
    }
  }

  /**
   * 创建文件读取器
   * @returns 文件读取器
   */
  createFileReader(): Record<string, unknown> {
    // 在Node.js中返回封装fs的读取器对象
    // 使用箭头函数捕获this，避免aliasing警告
    return {
      readAsArrayBuffer: async (
        filePath: string,
        options: { start?: number; end?: number } = {}
      ) => {
        const fileStream = fs.createReadStream(filePath, {
          start: options.start,
          end: options.end,
          highWaterMark: this.highWaterMark,
        });

        this.streamPool.add(fileStream);

        return {
          result: null,
          onload: null,
          onerror: null,

          // 启动读取流程
          read() {
            const chunks: Buffer[] = [];

            fileStream.on('data', chunk => {
              chunks.push(chunk);
            });

            fileStream.on('end', () => {
              const buffer = Buffer.concat(chunks);
              this.result = buffer.buffer;
              this.streamPool.delete(fileStream);

              if (this.onload) {
                this.onload({ target: this });
              }
            });

            fileStream.on('error', err => {
              this.streamPool.delete(fileStream);

              if (this.onerror) {
                this.onerror(err);
              }
            });
          },
        };
      },
    };
  }

  /**
   * 获取文件信息
   * @param filePath 文件路径
   * @returns 文件信息
   */
  async getFileInfo(filePath: string): Promise<{
    name: string;
    size: number;
    type?: string;
    path?: string;
    lastModified?: number;
  }> {
    try {
      const stats = await statAsync(filePath);
      return {
        name: path.basename(filePath),
        size: stats.size,
        path: filePath,
        lastModified: stats.mtimeMs,
        // 尝试根据扩展名判断类型
        type: this.getMimeTypeFromPath(filePath),
      };
    } catch (error) {
      throw new UploadError(
        UploadErrorType.FILE_ERROR,
        `获取文件信息失败: ${(error as Error).message}`
      );
    }
  }

  /**
   * 流式读取文件块
   * @param filePath 文件路径
   * @param start 开始位置
   * @param size 读取大小
   * @returns Promise<ArrayBuffer>
   */
  private async readChunkAsStream(
    filePath: string,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      try {
        // 计算结束位置
        const end = start + size - 1;

        // 创建可读流
        const readStream = fs.createReadStream(filePath, {
          start,
          end,
          highWaterMark: this.highWaterMark,
        });

        this.streamPool.add(readStream);

        const chunks: Buffer[] = [];
        let bytesRead = 0;

        readStream.on('data', chunk => {
          chunks.push(chunk);
          bytesRead += chunk.length;

          // 报告进度
          if (this.progressCallback) {
            this.progressCallback(bytesRead / size);
          }
        });

        readStream.on('end', () => {
          this.streamPool.delete(readStream);
          const buffer = Buffer.concat(chunks);
          resolve(
            buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength
            )
          );
        });

        readStream.on('error', err => {
          this.streamPool.delete(readStream);
          reject(
            new UploadError(
              UploadErrorType.FILE_READ_ERROR,
              `流式读取文件块失败: ${err.message}`
            )
          );
        });

        // 如果提供了中止信号，处理中止事件
        if (this.abortSignal) {
          const onAbort = () => {
            readStream.destroy();
            this.streamPool.delete(readStream);
            if (this.abortSignal) {
              this.abortSignal.removeEventListener('abort', onAbort);
            }
            reject(
              new UploadError(
                UploadErrorType.UPLOAD_ABORTED,
                '读取操作被用户中止'
              )
            );
          };

          this.abortSignal.addEventListener('abort', onAbort);
        }
      } catch (error) {
        reject(
          new UploadError(
            UploadErrorType.FILE_READ_ERROR,
            `流式读取文件块失败: ${(error as Error).message}`
          )
        );
      }
    });
  }

  /**
   * 使用Buffer读取文件块
   * @param filePath 文件路径
   * @param start 开始位置
   * @param size 读取大小
   * @returns Promise<ArrayBuffer>
   */
  private async readChunkAsBuffer(
    filePath: string,
    start: number,
    size: number
  ): Promise<ArrayBuffer> {
    try {
      // 使用fs.promises.open获取文件句柄
      const fileHandle = await fs.promises.open(filePath, 'r');

      try {
        // 创建用于读取的缓冲区
        const buffer = Buffer.alloc(size);

        // 从指定位置读取
        const { bytesRead } = await fileHandle.read(buffer, 0, size, start);

        // 如果读取的字节数小于请求的字节数
        if (bytesRead < size) {
          const actualBuffer = buffer.slice(0, bytesRead);
          return actualBuffer.buffer.slice(
            actualBuffer.byteOffset,
            actualBuffer.byteOffset + actualBuffer.byteLength
          );
        }

        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        );
      } finally {
        // 确保关闭文件句柄
        await fileHandle.close();
      }
    } catch (error) {
      throw new UploadError(
        UploadErrorType.FILE_READ_ERROR,
        `读取文件块失败: ${(error as Error).message}`
      );
    }
  }

  /**
   * 上传数据块
   * @param url 上传地址
   * @param chunk 数据块
   * @param headers 请求头
   * @param metadata 元数据
   * @returns Promise<IResponse>
   */
  async uploadChunk(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: {
      chunkIndex?: number;
      totalChunks?: number;
      fileName?: string;
      [key: string]: unknown;
    }
  ): Promise<IResponse> {
    // 尝试重试逻辑
    let currentRetry = 0;
    let lastError: Error | null = null;

    while (currentRetry <= this.maxRetries) {
      try {
        return await this.uploadChunkImpl(url, chunk, headers, metadata);
      } catch (error) {
        lastError = error as Error;

        // 判断是否可以重试
        if (currentRetry < this.maxRetries) {
          this.logger.warn(
            `上传分片失败，尝试重试 (${currentRetry + 1}/${this.maxRetries})`
          );

          // 指数退避策略
          const delay = this.calculateRetryDelay(currentRetry);
          await new Promise(resolve => setTimeout(resolve, delay));

          currentRetry++;
        } else {
          break;
        }
      }
    }

    // 如果到这里还有错误，说明所有重试都失败了
    throw new UploadError(
      UploadErrorType.CHUNK_UPLOAD_ERROR,
      `上传分片失败，已重试${currentRetry}次: ${lastError?.message || '未知错误'}`
    );
  }

  /**
   * 上传分片实际实现
   * @param url 上传地址
   * @param chunk 数据块
   * @param headers 请求头
   * @param metadata 元数据
   * @returns Promise<IResponse>
   */
  private async uploadChunkImpl(
    url: string,
    chunk: ArrayBuffer,
    headers: Record<string, string>,
    metadata?: {
      chunkIndex?: number;
      totalChunks?: number;
      fileName?: string;
      [key: string]: unknown;
    }
  ): Promise<IResponse> {
    // 创建表单数据
    const formData = new FormData();

    // 添加元数据字段
    if (metadata) {
      if (metadata.chunkIndex !== undefined) {
        formData.append('chunkIndex', String(metadata.chunkIndex));
      }

      if (metadata.totalChunks !== undefined) {
        formData.append('totalChunks', String(metadata.totalChunks));
      }

      if (metadata.fileName) {
        formData.append('fileName', metadata.fileName);
      }

      // 添加其他可能的元数据
      Object.entries(metadata).forEach(([key, value]) => {
        if (!['chunkIndex', 'totalChunks', 'fileName'].includes(key)) {
          formData.append(key, String(value));
        }
      });
    }

    // 添加文件块
    const buffer = Buffer.from(chunk);
    formData.append('file', buffer, {
      filename: metadata?.fileName || 'chunk',
      contentType: headers['content-type'] || 'application/octet-stream',
    });

    // 发起请求
    const response = await this.request(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: this.abortSignal,
      onProgress: this.progressCallback,
    });

    return response;
  }

  /**
   * 计算重试延迟
   * @param retryCount 已重试次数
   * @returns 延迟时间(ms)
   */
  private calculateRetryDelay(retryCount: number): number {
    // 指数退避算法: 2^retryCount * 100ms + 随机抖动
    const baseDelay = Math.pow(2, retryCount) * 100;
    const jitter = Math.random() * 100;
    return Math.min(baseDelay + jitter, 10000); // 最大10秒
  }

  /**
   * 执行HTTP请求
   * @param url 请求URL
   * @param options 请求选项
   * @returns Promise<IResponse>
   */
  async request(url: string, options: RequestOptions = {}): Promise<IResponse> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';

    return new Promise((resolve, reject) => {
      const requestOptions: http.RequestOptions = {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || this.timeout,
      };

      let data: Buffer | null = null;

      if (options.body) {
        if (options.body instanceof Buffer) {
          data = options.body;
        } else if (options.body instanceof ArrayBuffer) {
          data = Buffer.from(options.body);
        } else if (typeof options.body === 'string') {
          data = Buffer.from(options.body);
        } else {
          // 处理JSON对象
          data = Buffer.from(JSON.stringify(options.body));
          if (
            requestOptions.headers &&
            !requestOptions.headers['content-type']
          ) {
            requestOptions.headers['content-type'] = 'application/json';
          }
        }

        // 设置内容长度
        if (requestOptions.headers) {
          requestOptions.headers['content-length'] = String(data.length);
        }
      }

      // 创建请求
      const req = (isHttps ? https : http).request(url, requestOptions, res => {
        const chunks: Buffer[] = [];
        let receivedLength = 0;

        res.on('data', chunk => {
          chunks.push(chunk);
          receivedLength += chunk.length;

          // 报告下载进度
          if (options.onProgress) {
            // 尝试获取总长度
            const totalLength = parseInt(
              res.headers['content-length'] || '0',
              10
            );
            if (totalLength > 0) {
              options.onProgress(receivedLength / totalLength);
            }
          }
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let responseData: unknown = buffer;

          // 根据响应类型处理数据
          try {
            if (
              options.responseType === 'json' ||
              res.headers['content-type']?.includes('application/json')
            ) {
              responseData = JSON.parse(buffer.toString());
            } else if (options.responseType === 'text') {
              responseData = buffer.toString();
            } else if (options.responseType === 'arraybuffer') {
              responseData = buffer.buffer;
            }
          } catch (error) {
            // 解析错误，保留原始buffer
            this.logger.warn(`响应解析失败: ${(error as Error).message}`);
          }

          if (res.statusCode && res.statusMessage) {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers as Record<string, string>,
              data: responseData,
            });
          } else {
            // 处理状态码或状态消息为空的情况
            reject(
              new UploadError(
                UploadErrorType.NETWORK_ERROR,
                '请求响应缺少有效状态'
              )
            );
          }
        });
      });

      // 错误处理
      req.on('error', error => {
        reject(
          new UploadError(
            UploadErrorType.NETWORK_ERROR,
            `请求失败: ${error.message}`
          )
        );
      });

      // 超时处理
      req.on('timeout', () => {
        req.destroy();
        reject(
          new UploadError(
            UploadErrorType.REQUEST_TIMEOUT,
            `请求超时: ${options.timeout || this.timeout}ms`
          )
        );
      });

      // 如果有中止信号，监听它
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          req.destroy();
        });
      }

      // 发送请求体
      if (data) {
        req.write(data);
      }

      req.end();
    });
  }

  /**
   * 检测Node.js环境特性
   * @returns 环境特性
   */
  detectFeatures(): Record<string, boolean> {
    const features: Record<string, boolean> = {};

    // 检测基本特性
    features.hasFs = typeof fs !== 'undefined';
    features.hasStreams = typeof stream !== 'undefined';
    features.hasPromises = typeof Promise !== 'undefined';
    features.hasAsyncAwait = true; // Node 8+都支持
    features.hasBuffer = typeof Buffer !== 'undefined';
    features.hasFsPromises = typeof fs.promises !== 'undefined';

    // 检测高级特性
    features.hasWorkerThreads = this.checkModuleAvailability('worker_threads');
    features.hasStreamPipeline = typeof stream.pipeline === 'function';
    features.hasHttp2 = this.checkModuleAvailability('http2');

    return features;
  }

  /**
   * 检查模块是否可用
   * @param moduleName 模块名称
   * @returns 是否可用
   */
  private checkModuleAvailability(moduleName: string): boolean {
    try {
      // 使用动态导入检测模块可用性
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(moduleName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 从文件路径获取MIME类型
   * @param filePath 文件路径
   * @returns MIME类型
   */
  private getMimeTypeFromPath(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.txt': 'text/plain',
      '.xml': 'application/xml',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * 验证Node环境
   */
  private validateEnvironment(): void {
    if (
      typeof process === 'undefined' ||
      !process.versions ||
      !process.versions.node
    ) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        'NodeAdapter需要在Node.js环境中运行'
      );
    }

    // 检查必要的Node功能
    if (!fs || !path || !stream) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        'NodeAdapter需要fs、path和stream模块支持'
      );
    }

    this.logger.info(
      `NodeAdapter在Node.js ${process.versions.node}环境中初始化`
    );
  }

  /**
   * 确保临时目录存在
   */
  private async ensureTempDirExists(): Promise<void> {
    try {
      await accessAsync(this.tempDir, fs.constants.F_OK);
    } catch (error) {
      // 目录不存在，创建它
      try {
        await mkdirAsync(this.tempDir, { recursive: true });
        this.logger.info(`已创建临时目录: ${this.tempDir}`);
      } catch (createError) {
        this.logger.warn(`无法创建临时目录: ${(createError as Error).message}`);
      }
    }
  }

  /**
   * 计算文件哈希值
   * @param filePath 文件路径
   * @param algorithm 哈希算法
   * @returns 哈希值
   */
  async calculateFileHash(
    filePath: string,
    algorithm = 'md5'
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        const hash = crypto.createHash(algorithm);
        const stream = fs.createReadStream(filePath, {
          highWaterMark: this.highWaterMark,
        });

        this.streamPool.add(stream);

        stream.on('data', data => {
          hash.update(data);
        });

        stream.on('end', () => {
          this.streamPool.delete(stream);
          resolve(hash.digest('hex'));
        });

        stream.on('error', error => {
          this.streamPool.delete(stream);
          reject(
            new UploadError(
              UploadErrorType.FILE_HASH_ERROR,
              `计算文件哈希值失败: ${error.message}`
            )
          );
        });
      } catch (error) {
        reject(
          new UploadError(
            UploadErrorType.FILE_HASH_ERROR,
            `计算文件哈希值失败: ${(error as Error).message}`
          )
        );
      }
    });
  }

  /**
   * 释放资源
   */
  override dispose(): void {
    super.dispose();

    // 关闭所有活动的流
    for (const stream of this.streamPool) {
      try {
        if ('destroy' in stream && typeof stream.destroy === 'function') {
          stream.destroy();
        }
      } catch (error) {
        this.logger.warn(`关闭流失败: ${(error as Error).message}`);
      }
    }

    this.streamPool.clear();
    this.logger.info('NodeAdapter资源已释放');
  }

  /**
   * 设置网络质量
   * @param quality 网络质量等级
   */
  override setNetworkQuality(quality: NetworkQuality): void {
    super.setNetworkQuality(quality);

    // 根据网络质量调整配置
    if (quality === NetworkQuality.POOR) {
      this.maxConcurrentStreams = 1; // 降低并发数
      this.highWaterMark = 16 * 1024; // 降低缓冲区大小
    } else if (quality === NetworkQuality.GOOD) {
      this.maxConcurrentStreams = 5; // 适中并发
      this.highWaterMark = 64 * 1024;
    } else if (quality === NetworkQuality.EXCELLENT) {
      this.maxConcurrentStreams = 10; // 高并发
      this.highWaterMark = 128 * 1024;
    }
  }

  /**
   * Node特有API: 创建写入流
   * @param filePath 文件路径
   * @param options 选项
   * @returns 可写流
   */
  createWriteStream(
    filePath: string,
    options: {
      flags?: string;
      encoding?: string;
      autoClose?: boolean;
      start?: number;
    } = {}
  ): fs.WriteStream {
    const writeStream = fs.createWriteStream(filePath, {
      flags: options.flags || 'w',
      encoding: options.encoding as BufferEncoding,
      autoClose: options.autoClose !== false,
      start: options.start,
    });

    this.streamPool.add(writeStream);

    // 监听流关闭，从池中移除
    writeStream.on('close', () => {
      this.streamPool.delete(writeStream);
    });

    return writeStream;
  }

  /**
   * Node特有API: 流式上传文件
   * @param filePath 源文件路径
   * @param url 上传URL
   * @param options 选项
   * @returns Promise<IResponse>
   */
  streamUploadFile(
    filePath: string,
    url: string,
    options: {
      headers?: Record<string, string>;
      onProgress?: (progress: number) => void;
      metadata?: Record<string, unknown>;
      chunkSize?: number;
    } = {}
  ): Promise<IResponse> {
    return new Promise((resolve, reject) => {
      try {
        // 获取文件信息
        fs.stat(filePath, async (err, stats) => {
          if (err) {
            return reject(
              new UploadError(
                UploadErrorType.FILE_ERROR,
                `获取文件信息失败: ${err.message}`
              )
            );
          }

          // 创建可读流
          const readStream = fs.createReadStream(filePath, {
            highWaterMark: this.highWaterMark,
          });

          this.streamPool.add(readStream);

          // 解析URL
          const parsedUrl = new URL(url);
          const isHttps = parsedUrl.protocol === 'https:';

          // 准备请求选项
          const requestOptions: http.RequestOptions = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': stats.size.toString(),
              ...options.headers,
            },
          };

          // 如果有元数据，添加到请求头
          if (options.metadata) {
            Object.entries(options.metadata).forEach(([key, value]) => {
              if (requestOptions.headers) {
                requestOptions.headers[`X-Metadata-${key}`] = String(value);
              }
            });
          }

          // 创建请求
          const req = (isHttps ? https : http).request(
            url,
            requestOptions,
            res => {
              let responseBody = '';

              res.on('data', chunk => {
                responseBody += chunk.toString();
              });

              res.on('end', () => {
                this.streamPool.delete(readStream);

                if (
                  res.statusCode &&
                  res.statusCode >= 200 &&
                  res.statusCode < 300
                ) {
                  try {
                    const contentType = res.headers['content-type'];
                    const data =
                      contentType && contentType.includes('application/json')
                        ? JSON.parse(responseBody)
                        : responseBody;

                    if (res.statusCode && res.statusMessage) {
                      resolve({
                        ok: true,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: res.headers as Record<string, string>,
                        data,
                      });
                    } else {
                      reject(
                        new UploadError(
                          UploadErrorType.NETWORK_ERROR,
                          '响应缺少有效状态'
                        )
                      );
                    }
                  } catch (error) {
                    if (res.statusCode && res.statusMessage) {
                      resolve({
                        ok: true,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: res.headers as Record<string, string>,
                        data: responseBody,
                      });
                    } else {
                      reject(
                        new UploadError(
                          UploadErrorType.NETWORK_ERROR,
                          '响应缺少有效状态'
                        )
                      );
                    }
                  }
                } else {
                  const statusCode = res.statusCode || 0;
                  const statusMessage = res.statusMessage || 'Unknown error';
                  reject(
                    new UploadError(
                      UploadErrorType.UPLOAD_ERROR,
                      `上传失败: 服务器返回 ${statusCode} ${statusMessage}`
                    )
                  );
                }
              });
            }
          );

          // 错误处理
          req.on('error', error => {
            this.streamPool.delete(readStream);
            reject(
              new UploadError(
                UploadErrorType.NETWORK_ERROR,
                `上传请求失败: ${error.message}`
              )
            );
          });

          // 进度报告
          if (options.onProgress) {
            let bytesUploaded = 0;
            readStream.on('data', chunk => {
              bytesUploaded += chunk.length;
              options.onProgress(bytesUploaded / stats.size);
            });
          }

          // 如果有中止信号，监听它
          if (this.abortSignal) {
            const onAbort = () => {
              readStream.destroy();
              req.destroy();
              this.streamPool.delete(readStream);
              if (this.abortSignal) {
                this.abortSignal.removeEventListener('abort', onAbort);
              }
              reject(
                new UploadError(
                  UploadErrorType.UPLOAD_ABORTED,
                  '上传操作被用户中止'
                )
              );
            };

            this.abortSignal.addEventListener('abort', onAbort);
          }

          // 通过管道连接流
          readStream.pipe(req);
        });
      } catch (error) {
        reject(
          new UploadError(
            UploadErrorType.UPLOAD_ERROR,
            `流式上传文件失败: ${(error as Error).message}`
          )
        );
      }
    });
  }
}
