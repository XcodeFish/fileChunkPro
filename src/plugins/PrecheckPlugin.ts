/**
 * PrecheckPlugin - 文件预检与秒传插件
 * 通过文件指纹计算、服务端文件检查，实现文件秒传功能
 */

import { IPlugin, PluginPriority } from '../types';
import { EnvUtils } from '../utils/EnvUtils';
import {
  FileFingerprint,
  FingerprintOptions,
  FingerprintResult,
} from '../utils/HashUtils';
import { Logger } from '../utils/Logger';

/**
 * 预检插件配置选项
 */
export interface PrecheckOptions {
  enabled?: boolean; // 是否启用秒传功能
  algorithm?: 'md5' | 'sha1' | 'sha256' | 'simple'; // 文件指纹算法
  quickHash?: boolean; // 是否使用快速哈希（仅计算文件部分内容）
  quickHashSize?: number; // 快速哈希采样大小（字节）
  requestMethod?: 'POST' | 'HEAD' | 'GET'; // 秒传检查请求方法
  endpointSuffix?: string; // 秒传检查接口后缀
  customEndpoint?: string; // 自定义秒传检查接口
  headers?: Record<string, string>; // 自定义请求头
  useWorker?: boolean; // 是否使用 Worker 进行哈希计算
  timeout?: number; // 请求超时时间
  retryCount?: number; // 重试次数
  retryDelay?: number; // 重试间隔（毫秒）
  checkBeforeUpload?: boolean; // 是否在上传前检查
  localCacheExpiry?: number; // 本地缓存过期时间（毫秒）
  maxFileSizeForFullHash?: number; // 执行完整哈希的最大文件大小限制
  additionalParams?: Record<string, any>; // 附加请求参数
  onPrecheck?: (result: PrecheckResult) => void; // 预检结果回调
  onHashProgress?: (fileId: string, progress: number) => void; // 哈希计算进度回调
  includeFilenameInHash?: boolean; // 是否在哈希中包含文件名，增强唯一性
  includeLastModifiedInHash?: boolean; // 是否在哈希中包含最后修改时间
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
  retryCount?: number; // 重试次数
}

/**
 * 文件预检与秒传插件实现
 */
export class PrecheckPlugin implements IPlugin {
  public version = '2.0.0';
  private options: PrecheckOptions;
  private logger: Logger;
  private cache: Map<string, PrecheckResult>;
  private pendingChecks: Map<string, Promise<PrecheckResult>>;
  private uploader: any;

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
      retryDelay: 2000, // 两秒后重试
      checkBeforeUpload: true,
      localCacheExpiry: 24 * 60 * 60 * 1000, // 默认24小时
      maxFileSizeForFullHash: 100 * 1024 * 1024, // 默认100MB
      includeFilenameInHash: true,
      includeLastModifiedInHash: false,
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

    this.uploader = uploader;
    this.logger.info('秒传插件已安装');

    // 注册文件上传前预检钩子
    uploader.hooks.beforeUpload.tap(
      {
        name: 'PrecheckPlugin',
        priority: PluginPriority.HIGH, // 高优先级，确保在分片生成之前执行
      },
      async (file: File) => {
        if (!this.options.checkBeforeUpload) {
          return null;
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

    // 监听进度回调
    uploader.on('hashProgress', (fileId: string, progress: number) => {
      if (this.options.onHashProgress) {
        this.options.onHashProgress(fileId, progress);
      }
    });
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
    const fileId = this.uploader
      ? await this.uploader.generateFileId(file)
      : file.name;
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
    const checkPromise = this.performCheck(
      file,
      baseEndpoint,
      headers,
      fileId
    ).finally(() => {
      // 无论成功还是失败，都从待处理列表中移除
      this.pendingChecks.delete(cacheKey);
    });

    // 添加到待处理列表
    this.pendingChecks.set(cacheKey, checkPromise);

    return checkPromise;
  }

  /**
   * 执行文件预检
   * @param file 文件对象
   * @param baseEndpoint 基础上传端点
   * @param headers 请求头
   * @param fileId 文件ID
   * @returns 预检结果
   */
  private async performCheck(
    file: File,
    baseEndpoint: string,
    headers: Record<string, string>,
    fileId: string
  ): Promise<PrecheckResult> {
    this.logger.debug(`开始预检文件: ${file.name}`);

    // 计算文件哈希
    const fingerprintResult = await this.calculateFileHash(file, fileId);
    const fileHash = fingerprintResult.hash;
    const hashTime = fingerprintResult.time;
    const isQuickHash = fingerprintResult.isQuickHash;

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
      isQuickHash: isQuickHash,
      fileId: fileId,
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
      fileId: fileId,
      fileName: file.name,
      fileSize: file.size,
      fileHash: fileHash,
      exists: false,
      skipUpload: false,
      hashType: this.options.algorithm,
      hashTime,
      isQuickHash,
      retryCount: 0,
    };

    try {
      const requestStartTime = Date.now();
      let response = null;
      let retryCount = 0;

      // 实现重试逻辑
      while (retryCount <= this.options.retryCount!) {
        try {
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

          // 请求成功，跳出重试循环
          break;
        } catch (error) {
          retryCount++;

          // 如果已达到最大重试次数，抛出最后一个错误
          if (retryCount > this.options.retryCount!) {
            throw error;
          }

          // 等待指定时间后重试
          this.logger.warn(
            `预检请求失败，${this.options.retryDelay}ms后重试 (${retryCount}/${this.options.retryCount})`,
            error
          );
          await new Promise(resolve =>
            setTimeout(resolve, this.options.retryDelay)
          );
        }
      }

      result.requestTime = Date.now() - requestStartTime;
      result.retryCount = retryCount;

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
   * @param fileId 文件ID，用于进度回调
   * @returns 文件哈希值
   */
  private async calculateFileHash(
    file: File,
    fileId: string
  ): Promise<FingerprintResult> {
    // 配置指纹计算选项
    const options: FingerprintOptions = {
      algorithm: this.options.algorithm,
      quick: this.options.quickHash,
      sampleSize: this.options.quickHashSize,
      includeFilename: this.options.includeFilenameInHash,
      includeLastModified: this.options.includeLastModifiedInHash,
      onProgress: (progress: number) => {
        if (this.uploader) {
          this.uploader.emit('hashProgress', fileId, progress);
        }
      },
    };

    try {
      // 判断是否使用Worker
      if (this.options.useWorker && EnvUtils.supportsWorker()) {
        return await this.calculateHashInWorker(file, options);
      } else {
        // 主线程中计算哈希
        return await FileFingerprint.calculate(file, options);
      }
    } catch (error) {
      this.logger.error('哈希计算失败', error);
      // 降级方案：使用文件基本信息作为标识
      return {
        hash: FileFingerprint.generateSimpleHash(file),
        algorithm: 'simple',
        isQuickHash: true,
        size: file.size,
        time: 0,
        error: error instanceof Error ? error.message : '哈希计算失败',
      };
    }
  }

  /**
   * 在Worker中计算哈希
   * @param file 文件对象
   * @param options 哈希计算选项
   * @returns 哈希结果
   */
  private async calculateHashInWorker(
    file: File,
    options: FingerprintOptions
  ): Promise<FingerprintResult> {
    return new Promise<FingerprintResult>((resolve, reject) => {
      try {
        const worker = new Worker('/src/workers/HashWorker.js');
        const startTime = Date.now();

        worker.onmessage = e => {
          if (e.data.error) {
            reject(new Error(e.data.error));
            worker.terminate();
            return;
          }

          if (e.data.type === 'progress' && options.onProgress) {
            options.onProgress(e.data.progress);
            return;
          }

          worker.terminate();
          resolve({
            hash: e.data.hash,
            algorithm: options.algorithm || 'md5',
            isQuickHash: e.data.isQuickHash || false,
            size: file.size,
            time: e.data.hashTime || Date.now() - startTime,
          });
        };

        worker.onerror = e => {
          worker.terminate();
          reject(new Error(`Worker error: ${e.message}`));
        };

        worker.postMessage({
          file,
          algorithm: options.algorithm,
          action: 'calculateHash',
          quick: options.quick,
          sampleSize: options.sampleSize,
        });
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      this.logger.error('Worker哈希计算失败，降级到主线程', error);
      return FileFingerprint.calculate(file, options);
    });
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

    if (!response.ok) {
      throw new Error(
        `预检请求失败: ${response.status} ${response.statusText}`
      );
    }

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
