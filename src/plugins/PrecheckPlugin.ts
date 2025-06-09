/**
 * PrecheckPlugin - 文件预检与秒传插件
 * 通过文件指纹计算、服务端文件检查，实现文件秒传功能
 */

import { IPlugin, PluginPriority } from '../types';
import { EnvUtils } from '../utils/EnvUtils';
import { Logger } from '../utils/Logger';

/**
 * 预检插件配置选项
 */
export interface PrecheckOptions {
  enabled?: boolean; // 是否启用秒传功能
  algorithm?: 'md5' | 'sha1' | 'simple'; // 文件指纹算法
  quickHash?: boolean; // 是否使用快速哈希（仅计算文件部分内容）
  quickHashSize?: number; // 快速哈希采样大小（字节）
  requestMethod?: 'POST' | 'HEAD' | 'GET'; // 秒传检查请求方法
  endpointSuffix?: string; // 秒传检查接口后缀
  customEndpoint?: string; // 自定义秒传检查接口
  headers?: Record<string, string>; // 自定义请求头
  useWorker?: boolean; // 是否使用 Worker 进行哈希计算
  timeout?: number; // 请求超时时间
  retryCount?: number; // 重试次数
  checkBeforeUpload?: boolean; // 是否在上传前检查
  localCacheExpiry?: number; // 本地缓存过期时间（毫秒）
  maxFileSizeForFullHash?: number; // 执行完整哈希的最大文件大小限制
  additionalParams?: Record<string, any>; // 附加请求参数
  onPrecheck?: (result: PrecheckResult) => void; // 预检结果回调
}

/**
 * 预检结果接口
 */
export interface PrecheckResult {
  fileId: string; // 文件唯一标识
  fileName: string; // 文件名
  fileSize: number; // 文件大小
  fileHash: string; // 文件哈希值
  exists: boolean; // 文件是否已存在
  url?: string; // 如果存在，文件的访问URL
  skipUpload: boolean; // 是否可以跳过上传
  hashType: string; // 哈希类型
  hashTime?: number; // 哈希计算耗时
  requestTime?: number; // 请求耗时
  isQuickHash?: boolean; // 是否为快速哈希
  serverResponse?: any; // 服务器响应原始数据
}

/**
 * 文件预检与秒传插件实现
 */
export class PrecheckPlugin implements IPlugin {
  public version = '1.0.0';
  private options: PrecheckOptions;
  private logger: Logger;
  private cache: Map<string, PrecheckResult>;
  private pendingChecks: Map<string, Promise<PrecheckResult>>;

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options: PrecheckOptions = {}) {
    this.options = {
      enabled: true,
      algorithm: 'md5',
      quickHash: true,
      quickHashSize: 1024 * 1024, // 默认取首尾各1MB内容计算哈希
      requestMethod: 'POST',
      endpointSuffix: '/precheck',
      headers: {},
      useWorker: true,
      timeout: 10000,
      retryCount: 2,
      checkBeforeUpload: true,
      localCacheExpiry: 24 * 60 * 60 * 1000, // 默认24小时
      maxFileSizeForFullHash: 100 * 1024 * 1024, // 默认100MB
      ...options,
    };

    this.logger = new Logger('PrecheckPlugin');
    this.cache = new Map<string, PrecheckResult>();
    this.pendingChecks = new Map<string, Promise<PrecheckResult>>();
  }

  /**
   * 安装插件
   * @param uploader 上传器实例
   */
  public install(uploader: any): void {
    if (!this.options.enabled) {
      this.logger.info('秒传功能已禁用');
      return;
    }

    this.logger.info('秒传插件已安装');

    // 注册文件上传前预检钩子
    uploader.hooks.beforeUpload.tap(
      {
        name: 'PrecheckPlugin',
        priority: PluginPriority.HIGH, // 高优先级，确保在分片生成之前执行
      },
      async (file: File) => {
        if (!this.options.checkBeforeUpload) {
          return;
        }

        try {
          // 计算文件ID
          const fileId = await uploader.generateFileId(file);

          // 执行预检
          const result = await this.checkFile(
            file,
            uploader.options.endpoint,
            uploader.options.headers || {}
          );

          // 更新文件元数据
          if (result.fileId) {
            uploader.setFileMetadata(fileId, {
              precheck: result,
              fileHash: result.fileHash,
            });
          }

          // 如果文件已存在，跳过上传
          if (result.exists && result.skipUpload) {
            this.logger.info(`文件已存在，跳过上传: ${file.name}`);

            // 触发成功事件
            uploader.emit('uploadSuccess', {
              fileId,
              fileName: file.name,
              fileSize: file.size,
              url: result.url,
              skipUpload: true,
              precheck: result,
            });

            // 触发完成事件
            uploader.emit('uploadComplete', fileId);

            // 返回处理结果，阻止后续流程
            return {
              skip: true,
              result,
            };
          }
        } catch (error) {
          this.logger.warn('文件预检失败，将继续正常上传', error);
          // 预检失败不影响正常上传流程
        }

        // 返回null继续正常上传流程
        return null;
      }
    );

    // 添加请求参数钩子
    uploader.hooks.beforeChunkUpload.tap(
      'PrecheckPlugin',
      (chunk: any, requestData: any) => {
        const fileId = requestData.fileId || '';
        const metadata = uploader.getFileMetadata(fileId);

        // 如果有文件哈希信息，添加到请求数据中
        if (metadata?.fileHash) {
          requestData.fileHash = metadata.fileHash;
          requestData.hashType = this.options.algorithm;
          // 标记是否为快速哈希
          if (this.options.quickHash) {
            requestData.isQuickHash = true;
          }
        }

        return requestData;
      }
    );
  }

  /**
   * 检查文件是否已存在
   * @param file 文件对象
   * @param baseEndpoint 基础上传端点
   * @param headers 请求头
   * @returns 预检结果
   */
  public async checkFile(
    file: File,
    baseEndpoint: string,
    headers: Record<string, string> = {}
  ): Promise<PrecheckResult> {
    const cacheKey = `${file.name}_${file.size}_${file.lastModified}`;

    // 检查缓存
    if (this.cache.has(cacheKey)) {
      const cachedResult = this.cache.get(cacheKey)!;
      // 检查缓存是否过期
      if (
        Date.now() - (cachedResult.hashTime || 0) <
        (this.options.localCacheExpiry || 0)
      ) {
        this.logger.debug('使用缓存的预检结果', cachedResult);
        return cachedResult;
      }
      this.cache.delete(cacheKey);
    }

    // 检查是否有待处理的相同请求
    if (this.pendingChecks.has(cacheKey)) {
      return this.pendingChecks.get(cacheKey)!;
    }

    // 创建新的预检过程
    const checkPromise = this.performCheck(file, baseEndpoint, headers).finally(
      () => {
        // 无论成功还是失败，都从待处理列表中移除
        this.pendingChecks.delete(cacheKey);
      }
    );

    // 添加到待处理列表
    this.pendingChecks.set(cacheKey, checkPromise);

    return checkPromise;
  }

  /**
   * 执行文件预检
   * @param file 文件对象
   * @param baseEndpoint 基础上传端点
   * @param headers 请求头
   * @returns 预检结果
   */
  private async performCheck(
    file: File,
    baseEndpoint: string,
    headers: Record<string, string>
  ): Promise<PrecheckResult> {
    const startTime = Date.now();
    this.logger.debug(`开始预检文件: ${file.name}`);

    // 计算文件哈希
    const fileHash = await this.calculateFileHash(file);
    const hashTime = Date.now() - startTime;

    // 构建请求URL
    const endpoint =
      this.options.customEndpoint ||
      `${baseEndpoint}${this.options.endpointSuffix || '/precheck'}`;

    // 准备请求数据
    const requestData = {
      fileName: file.name,
      fileSize: file.size,
      fileHash: fileHash,
      hashType: this.options.algorithm,
      isQuickHash: this.options.quickHash,
      ...this.options.additionalParams,
    };

    // 合并请求头
    const mergedHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...this.options.headers,
    };

    // 初始化结果对象
    const result: PrecheckResult = {
      fileId: fileHash,
      fileName: file.name,
      fileSize: file.size,
      fileHash: fileHash,
      exists: false,
      skipUpload: false,
      hashType: this.options.algorithm,
      hashTime,
      isQuickHash: this.options.quickHash,
    };

    try {
      const requestStartTime = Date.now();
      let response;

      // 根据请求方法执行请求
      switch (this.options.requestMethod) {
        case 'HEAD':
          response = await this.sendHeadRequest(
            endpoint,
            fileHash,
            mergedHeaders
          );
          break;
        case 'GET':
          response = await this.sendGetRequest(
            endpoint,
            requestData,
            mergedHeaders
          );
          break;
        case 'POST':
        default:
          response = await this.sendPostRequest(
            endpoint,
            requestData,
            mergedHeaders
          );
          break;
      }

      result.requestTime = Date.now() - requestStartTime;

      // 处理响应
      if (response) {
        result.exists = response.exists || false;
        result.url = response.url || '';
        result.skipUpload = response.skipUpload || false;
        result.serverResponse = response;
      }

      // 缓存结果
      const cacheKey = `${file.name}_${file.size}_${file.lastModified}`;
      this.cache.set(cacheKey, result);

      // 触发回调
      if (typeof this.options.onPrecheck === 'function') {
        this.options.onPrecheck(result);
      }

      return result;
    } catch (error) {
      this.logger.error('文件预检请求失败', error);

      // 即使请求失败，也返回基本的哈希信息
      return result;
    }
  }

  /**
   * 计算文件哈希
   * @param file 文件对象
   * @returns 文件哈希值
   */
  private async calculateFileHash(file: File): Promise<string> {
    // 判断是否使用快速哈希
    const useQuickHash =
      this.options.quickHash &&
      file.size > this.options.maxFileSizeForFullHash!;

    try {
      if (useQuickHash) {
        return await this.calculateQuickHash(file);
      } else {
        return await this.calculateFullHash(file);
      }
    } catch (error) {
      this.logger.error('哈希计算失败，使用文件基本信息作为标识', error);
      // 降级方案：使用文件名、大小和修改时间的组合
      return this.generateSimpleHash(file);
    }
  }

  /**
   * 计算完整文件哈希
   * @param file 文件对象
   * @returns 完整文件哈希值
   */
  private async calculateFullHash(file: File): Promise<string> {
    this.logger.debug(`计算完整文件哈希: ${file.name}`);

    // 判断是否使用Worker
    if (this.options.useWorker && EnvUtils.supportsWorker()) {
      return await this.calculateHashInWorker(file, this.options.algorithm!);
    } else {
      // 主线程中计算哈希
      return await this.calculateHashInMainThread(
        file,
        this.options.algorithm!
      );
    }
  }

  /**
   * 计算快速文件哈希（仅计算文件的一部分）
   * @param file 文件对象
   * @returns 快速文件哈希值
   */
  private async calculateQuickHash(file: File): Promise<string> {
    this.logger.debug(`计算快速文件哈希: ${file.name}`);

    const sampleSize = Math.min(this.options.quickHashSize!, file.size / 2);

    // 获取文件头部和尾部的内容
    let headerChunk, footerChunk;

    try {
      // 读取文件头部
      headerChunk = await this.readFileSlice(file, 0, sampleSize);

      // 读取文件尾部
      if (file.size > sampleSize * 2) {
        footerChunk = await this.readFileSlice(
          file,
          file.size - sampleSize,
          file.size
        );
      } else {
        footerChunk = new ArrayBuffer(0);
      }

      // 合并头部和尾部
      const combinedBuffer = this.concatenateArrayBuffers(
        headerChunk,
        footerChunk
      );

      // 计算哈希
      const hash = await this.calculateBufferHash(
        combinedBuffer,
        this.options.algorithm!
      );

      // 添加文件大小作为哈希的一部分，以增加唯一性
      return `${hash}_${file.size}`;
    } catch (error) {
      this.logger.error('快速哈希计算失败', error);
      // 降级到简单哈希
      return this.generateSimpleHash(file);
    }
  }

  /**
   * 在主线程中计算哈希
   * @param file 文件对象
   * @param algorithm 哈希算法
   * @returns 哈希值
   */
  private async calculateHashInMainThread(
    file: File,
    algorithm: string
  ): Promise<string> {
    try {
      // 实际实现需要根据环境提供相应的哈希算法
      // 这里是简化版，实际项目中需要使用专门的哈希库

      // 对于浏览器环境，可以使用 SubtleCrypto API
      if (window.crypto && window.crypto.subtle) {
        const buffer = await file.arrayBuffer();

        let hashAlgorithm: AlgorithmIdentifier;
        switch (algorithm) {
          case 'sha1':
            hashAlgorithm = 'SHA-1';
            break;
          case 'md5':
            // 注意：SubtleCrypto 不直接支持 MD5，需要使用第三方库
            // 这里使用 SHA-256 作为替代
            hashAlgorithm = 'SHA-256';
            break;
          default:
            hashAlgorithm = 'SHA-256';
        }

        const hashBuffer = await window.crypto.subtle.digest(
          hashAlgorithm,
          buffer
        );
        return this.arrayBufferToHex(hashBuffer);
      } else {
        // 如果不支持 SubtleCrypto，则回退到简单哈希
        return this.generateSimpleHash(file);
      }
    } catch (error) {
      this.logger.error('主线程哈希计算失败', error);
      return this.generateSimpleHash(file);
    }
  }

  /**
   * 在Worker中计算哈希
   * @param file 文件对象
   * @param algorithm 哈希算法
   * @returns 哈希值
   */
  private async calculateHashInWorker(
    file: File,
    algorithm: string
  ): Promise<string> {
    // 这里需要实现与哈希计算Worker的通信逻辑
    // 实际实现需要创建Worker，发送文件数据，接收哈希结果

    // 简化版示例
    return new Promise<string>((resolve, reject) => {
      try {
        const worker = new Worker('/src/workers/HashWorker.js');

        worker.onmessage = e => {
          if (e.data.error) {
            reject(new Error(e.data.error));
          } else {
            resolve(e.data.hash);
          }
          worker.terminate();
        };

        worker.onerror = e => {
          reject(new Error('Worker error: ' + e.message));
          worker.terminate();
        };

        worker.postMessage({
          file,
          algorithm,
          action: 'calculateHash',
        });
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      this.logger.error('Worker哈希计算失败，降级到主线程', error);
      return this.calculateHashInMainThread(file, algorithm);
    });
  }

  /**
   * 计算缓冲区的哈希值
   * @param buffer 数据缓冲区
   * @param algorithm 哈希算法
   * @returns 哈希值
   */
  private async calculateBufferHash(
    buffer: ArrayBuffer,
    algorithm: string
  ): Promise<string> {
    if (window.crypto && window.crypto.subtle) {
      let hashAlgorithm: AlgorithmIdentifier;

      switch (algorithm) {
        case 'sha1':
          hashAlgorithm = 'SHA-1';
          break;
        case 'md5':
          // SubtleCrypto 不直接支持 MD5，使用 SHA-256 作为替代
          hashAlgorithm = 'SHA-256';
          break;
        default:
          hashAlgorithm = 'SHA-256';
      }

      const hashBuffer = await window.crypto.subtle.digest(
        hashAlgorithm,
        buffer
      );
      return this.arrayBufferToHex(hashBuffer);
    } else {
      // 如果不支持 SubtleCrypto，返回简单哈希
      return this.simpleBufferHash(buffer);
    }
  }

  /**
   * 生成简单哈希（基于文件基本信息）
   * @param file 文件对象
   * @returns 简单哈希值
   */
  private generateSimpleHash(file: File): string {
    // 使用文件名、大小和最后修改时间生成哈希
    const str = `${file.name}_${file.size}_${file.lastModified}`;
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }

    // 转为16进制字符串并确保唯一性
    return `simple_${hash.toString(16)}_${file.size}`;
  }

  /**
   * 对缓冲区进行简单哈希计算
   * @param buffer 数据缓冲区
   * @returns 哈希值
   */
  private simpleBufferHash(buffer: ArrayBuffer): string {
    const view = new DataView(buffer);
    let hash = 0;

    // 采样计算哈希，避免计算太多数据
    const step = Math.max(1, Math.floor(buffer.byteLength / 1024));

    for (let i = 0; i < buffer.byteLength; i += step) {
      if (i + 4 <= buffer.byteLength) {
        const value = view.getUint32(i, true);
        hash = (hash << 5) - hash + value;
      } else if (i < buffer.byteLength) {
        const value = view.getUint8(i);
        hash = (hash << 5) - hash + value;
      }
      hash = hash & hash; // 转换为32位整数
    }

    return hash.toString(16).padStart(8, '0');
  }

  /**
   * 读取文件的指定片段
   * @param file 文件对象
   * @param start 起始位置
   * @param end 结束位置
   * @returns 文件片段的ArrayBuffer
   */
  private async readFileSlice(
    file: File,
    start: number,
    end: number
  ): Promise<ArrayBuffer> {
    const slice = file.slice(start, end);
    return await slice.arrayBuffer();
  }

  /**
   * 合并两个ArrayBuffer
   * @param buffer1 第一个缓冲区
   * @param buffer2 第二个缓冲区
   * @returns 合并后的缓冲区
   */
  private concatenateArrayBuffers(
    buffer1: ArrayBuffer,
    buffer2: ArrayBuffer
  ): ArrayBuffer {
    const result = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    result.set(new Uint8Array(buffer1), 0);
    result.set(new Uint8Array(buffer2), buffer1.byteLength);
    return result.buffer;
  }

  /**
   * 将ArrayBuffer转换为十六进制字符串
   * @param buffer ArrayBuffer数据
   * @returns 十六进制字符串
   */
  private arrayBufferToHex(buffer: ArrayBuffer): string {
    const view = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < view.length; i++) {
      const value = view[i].toString(16);
      hex += value.length === 1 ? '0' + value : value;
    }
    return hex;
  }

  /**
   * 发送POST请求
   * @param url 请求URL
   * @param data 请求数据
   * @param headers 请求头
   * @returns 响应数据
   */
  private async sendPostRequest(
    url: string,
    data: any,
    headers: Record<string, string>
  ): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.options.timeout || 10000),
    });

    if (!response.ok) {
      throw new Error(
        `预检请求失败: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * 发送GET请求
   * @param url 请求URL
   * @param params 请求参数
   * @param headers 请求头
   * @returns 响应数据
   */
  private async sendGetRequest(
    url: string,
    params: any,
    headers: Record<string, string>
  ): Promise<any> {
    // 构建查询字符串
    const queryParams = new URLSearchParams();
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        queryParams.append(key, params[key].toString());
      }
    }

    const requestUrl = `${url}?${queryParams.toString()}`;

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(this.options.timeout || 10000),
    });

    if (!response.ok) {
      throw new Error(
        `预检请求失败: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * 发送HEAD请求
   * @param url 请求URL
   * @param fileHash 文件哈希
   * @param headers 请求头
   * @returns 响应数据
   */
  private async sendHeadRequest(
    url: string,
    fileHash: string,
    headers: Record<string, string>
  ): Promise<any> {
    const requestUrl = `${url}?fileHash=${encodeURIComponent(fileHash)}`;

    const response = await fetch(requestUrl, {
      method: 'HEAD',
      headers,
      signal: AbortSignal.timeout(this.options.timeout || 10000),
    });

    // 从响应头中解析结果
    const exists = response.headers.get('X-File-Exists') === 'true';
    const fileUrl = response.headers.get('X-File-URL') || '';
    const skipUpload = response.headers.get('X-Skip-Upload') === 'true';

    return {
      exists,
      url: fileUrl,
      skipUpload,
    };
  }
}

export default PrecheckPlugin;
