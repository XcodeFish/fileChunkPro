/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * NetworkManager - 网络管理模块
 * 负责所有网络请求的处理、重试、并发控制等
 */

import {
  RequestOptions,
  RequestMethod,
  ResponseType,
  NetworkResponse,
  RetryStrategy,
  NetworkErrorType,
  NetworkEvent,
  NetworkQuality,
  ProgressCallback,
} from '../types/network';
import { EnvironmentType } from '../adapters/interfaces';
import { EventBus } from './EventBus';
import { DependencyContainer } from './DependencyContainer';
import { UploadError } from './ErrorCenter';
import { NetworkDetector } from '../utils/NetworkDetector';
import { Logger } from '../utils/Logger';

/**
 * 网络管理器接口
 */
export interface INetworkManager {
  /**
   * 发送网络请求
   * @param url 请求URL
   * @param options 请求选项
   * @returns 响应结果
   */
  request<T = any>(
    url: string,
    options?: RequestOptions
  ): Promise<NetworkResponse<T>>;

  /**
   * 上传文件
   * @param url 上传URL
   * @param file 文件对象
   * @param options 上传选项
   * @returns 上传结果
   */
  uploadFile<T = any>(
    url: string,
    file: File | Blob,
    options?: RequestOptions
  ): Promise<NetworkResponse<T>>;

  /**
   * 上传文件分片
   * @param url 上传URL
   * @param chunk 文件分片
   * @param options 上传选项
   * @returns 上传结果
   */
  uploadChunk<T = any>(
    url: string,
    chunk: Blob | ArrayBuffer,
    options?: RequestOptions
  ): Promise<NetworkResponse<T>>;

  /**
   * 中止指定请求
   * @param requestId 请求ID
   * @returns 是否成功中止
   */
  abort(requestId: string): boolean;

  /**
   * 中止所有请求
   */
  abortAll(): void;

  /**
   * 设置默认请求选项
   * @param options 默认请求选项
   */
  setDefaultOptions(options: Partial<RequestOptions>): void;

  /**
   * 获取当前网络质量
   * @returns 网络质量级别
   */
  getNetworkQuality(): NetworkQuality;

  /**
   * 设置重试策略
   * @param strategy 重试策略
   */
  setRetryStrategy(strategy: RetryStrategy): void;

  /**
   * 获取当前活跃请求数量
   * @returns 活跃请求数量
   */
  getActiveRequestCount(): number;

  /**
   * 检查URL是否有效
   * @param url 要检查的URL
   * @returns 是否有效
   */
  isValidUrl(url: string): boolean;
}

/**
 * 网络请求实例接口
 */
interface INetworkRequest {
  id: string;
  url: string;
  method: RequestMethod;
  startTime: number;
  abortController: AbortController;
  options: RequestOptions;
  progress: number;
  status: 'pending' | 'completed' | 'failed' | 'aborted';
  retryCount: number;
}

/**
 * 网络管理器实现
 */
export class NetworkManager implements INetworkManager {
  private activeRequests: Map<string, INetworkRequest> = new Map();
  private defaultOptions: RequestOptions = {
    method: 'GET',
    timeout: 30000,
    responseType: 'json',
    retries: 3,
    retryDelay: 1000,
  };
  private networkDetector: NetworkDetector;
  private eventBus: EventBus;
  private logger: Logger;
  private retryStrategy: RetryStrategy = {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
    retryableStatusCodes: [408, 500, 502, 503, 504, 429],
    retryableNetworkErrors: true,
    retryOnTimeout: true,
  };
  private requestIdCounter = 0;

  /**
   * 创建网络管理器实例
   * @param container 依赖容器
   * @param options 配置选项
   */
  constructor(
    private container: DependencyContainer,
    options: {
      defaultOptions?: Partial<RequestOptions>;
      retryStrategy?: Partial<RetryStrategy>;
    } = {}
  ) {
    this.eventBus = container.resolve<EventBus>('eventBus');
    this.logger = new Logger('NetworkManager');

    // 合并默认选项
    if (options.defaultOptions) {
      this.defaultOptions = {
        ...this.defaultOptions,
        ...options.defaultOptions,
      };
    }

    // 合并重试策略
    if (options.retryStrategy) {
      this.retryStrategy = { ...this.retryStrategy, ...options.retryStrategy };
    }

    // 初始化网络检测器
    try {
      this.networkDetector =
        container.resolve<NetworkDetector>('networkDetector') ||
        NetworkDetector.create();

      // 监听网络状态变化
      this.networkDetector.on('qualityChange', (quality: NetworkQuality) => {
        this.handleNetworkQualityChange(quality);
      });

      this.networkDetector.on('offline', () => {
        this.handleNetworkOffline();
      });

      this.networkDetector.on('online', () => {
        this.handleNetworkOnline();
      });
    } catch (error) {
      this.logger.warn('初始化网络检测器失败', error);
      this.networkDetector = NetworkDetector.create();
    }
  }

  /**
   * 处理网络质量变化
   * @param quality 新的网络质量
   */
  private handleNetworkQualityChange(quality: NetworkQuality): void {
    this.logger.debug(`网络质量变化: ${quality}`);

    // 调整重试策略
    if (quality === NetworkQuality.POOR) {
      // 网络质量差时，增加重试间隔，减少最大重试次数
      this.retryStrategy = {
        ...this.retryStrategy,
        retryDelay: 2000,
        maxRetries: 5,
      };
    } else if (
      quality === NetworkQuality.GOOD ||
      quality === NetworkQuality.EXCELLENT
    ) {
      // 网络质量好时，恢复默认重试配置
      this.retryStrategy = {
        ...this.retryStrategy,
        retryDelay: 1000,
        maxRetries: 3,
      };
    }

    // 发出网络质量变化事件
    this.eventBus.emit('network:qualityChange', { quality });
  }

  /**
   * 处理网络离线
   */
  private handleNetworkOffline(): void {
    this.logger.warn('网络连接已断开');

    // 暂停所有非关键请求
    this.activeRequests.forEach(request => {
      if (!request.options.critical) {
        this.abort(request.id);
      }
    });

    // 发出网络离线事件
    this.eventBus.emit('network:offline');
  }

  /**
   * 处理网络恢复在线
   */
  private handleNetworkOnline(): void {
    this.logger.info('网络连接已恢复');
    // 发出网络在线事件
    this.eventBus.emit('network:online');
  }

  /**
   * 发送网络请求
   * @param url 请求URL
   * @param options 请求选项
   * @returns 响应结果
   */
  public async request<T = any>(
    url: string,
    options: RequestOptions = {}
  ): Promise<NetworkResponse<T>> {
    // 验证URL
    if (!this.isValidUrl(url)) {
      throw new UploadError(NetworkErrorType.INVALID_URL, `无效的URL: ${url}`);
    }

    // 合并选项
    const mergedOptions: RequestOptions = {
      ...this.defaultOptions,
      ...options,
    };

    // 创建中止控制器
    const abortController = new AbortController();

    // 生成请求ID
    const requestId = this.generateRequestId();

    // 创建请求对象
    const request: INetworkRequest = {
      id: requestId,
      url,
      method: mergedOptions.method || 'GET',
      startTime: Date.now(),
      abortController,
      options: mergedOptions,
      progress: 0,
      status: 'pending',
      retryCount: 0,
    };

    // 添加到活跃请求列表
    this.activeRequests.set(requestId, request);

    try {
      // 发出请求开始事件
      this.eventBus.emit('network:requestStart', {
        requestId,
        url,
        method: request.method,
        options: mergedOptions,
      });

      // 设置请求超时
      let timeoutId: NodeJS.Timeout | null = null;
      if (mergedOptions.timeout) {
        timeoutId = setTimeout(() => {
          this.abort(requestId);
          if (timeoutId) clearTimeout(timeoutId);
        }, mergedOptions.timeout);
      }

      // 获取适配器
      const adapter = this.container.resolve('currentAdapter');
      if (!adapter) {
        throw new UploadError(
          NetworkErrorType.ADAPTER_NOT_FOUND,
          '未找到有效的网络适配器'
        );
      }

      // 构建请求配置
      const requestConfig = {
        method: mergedOptions.method,
        headers: mergedOptions.headers || {},
        body: mergedOptions.body,
        signal: abortController.signal,
        timeout: mergedOptions.timeout,
        responseType: mergedOptions.responseType,
        withCredentials: mergedOptions.withCredentials,
        onProgress: (progress: number) => {
          // 更新进度
          request.progress = progress;

          // 触发进度回调
          if (mergedOptions.onProgress) {
            mergedOptions.onProgress(progress);
          }

          // 发出进度事件
          this.eventBus.emit('network:progress', {
            requestId,
            url,
            progress,
          });
        },
      };

      // 使用适配器发送请求
      const response = await adapter.request(url, requestConfig);

      // 清除超时计时器
      if (timeoutId) clearTimeout(timeoutId);

      // 标记请求完成
      request.status = 'completed';
      this.activeRequests.delete(requestId);

      // 构建响应对象
      const networkResponse: NetworkResponse<T> = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText || '',
        data: response.data as T,
        headers: response.headers || {},
        requestId,
        url,
        method: request.method,
        duration: Date.now() - request.startTime,
      };

      // 发出请求完成事件
      this.eventBus.emit('network:requestEnd', {
        requestId,
        url,
        response: networkResponse,
        success: true,
      });

      return networkResponse;
    } catch (error) {
      // 清除超时计时器
      if (timeoutId) clearTimeout(timeoutId);

      // 处理错误
      const shouldRetry = this.shouldRetry(error, request);

      if (shouldRetry) {
        return this.retryRequest<T>(request);
      }

      // 标记请求失败
      request.status = 'failed';
      this.activeRequests.delete(requestId);

      // 转换错误
      const networkError = this.normalizeError(error, request);

      // 发出请求失败事件
      this.eventBus.emit('network:requestError', {
        requestId,
        url,
        error: networkError,
      });

      throw networkError;
    }
  }

  /**
   * 重试请求
   * @param request 原始请求
   * @returns 重试结果
   */
  private async retryRequest<T = any>(
    request: INetworkRequest
  ): Promise<NetworkResponse<T>> {
    // 递增重试计数
    request.retryCount++;

    // 计算延迟时间
    const delay = this.calculateRetryDelay(request.retryCount);

    // 发出重试事件
    this.eventBus.emit('network:requestRetry', {
      requestId: request.id,
      url: request.url,
      retryCount: request.retryCount,
      delay,
    });

    // 等待重试延迟
    this.logger.debug(
      `重试请求: ${request.url} (第${request.retryCount}次尝试), 延迟: ${delay}ms`
    );
    await new Promise(resolve => setTimeout(resolve, delay));

    // 重置请求状态
    request.startTime = Date.now();
    request.progress = 0;
    request.status = 'pending';

    // 创建新的中止控制器
    request.abortController = new AbortController();

    try {
      // 重新发送请求
      return this.request<T>(request.url, {
        ...request.options,
        signal: request.abortController.signal,
      });
    } catch (error) {
      // 如果还有重试机会，继续重试
      if (this.shouldRetry(error, request)) {
        return this.retryRequest<T>(request);
      }

      // 超过重试次数，抛出错误
      throw this.normalizeError(error, request);
    }
  }

  /**
   * 判断是否应该重试请求
   * @param error 错误对象
   * @param request 请求对象
   * @returns 是否应该重试
   */
  private shouldRetry(error: any, request: INetworkRequest): boolean {
    // 如果已达到最大重试次数，不再重试
    if (
      request.retryCount >=
      (request.options.retries || this.retryStrategy.maxRetries)
    ) {
      return false;
    }

    // 如果请求已被手动中止，不再重试
    if (request.status === 'aborted') {
      return false;
    }

    // 如果错误是网络错误且配置了网络错误重试
    if (
      error.name === 'NetworkError' &&
      this.retryStrategy.retryableNetworkErrors
    ) {
      return true;
    }

    // 如果错误是超时错误且配置了超时重试
    if (error.name === 'TimeoutError' && this.retryStrategy.retryOnTimeout) {
      return true;
    }

    // 如果错误带有HTTP状态码，检查是否在可重试状态码列表中
    if (
      error.status &&
      this.retryStrategy.retryableStatusCodes.includes(error.status)
    ) {
      return true;
    }

    return false;
  }

  /**
   * 计算重试延迟时间
   * @param retryCount 当前重试次数
   * @returns 延迟时间(毫秒)
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.retryStrategy.retryDelay;

    if (this.retryStrategy.exponentialBackoff) {
      // 指数退避算法
      return Math.min(
        baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 1000,
        30000 // 最大30秒
      );
    }

    // 线性延迟
    return baseDelay * retryCount;
  }

  /**
   * 标准化错误对象
   * @param error 原始错误
   * @param request 相关请求
   * @returns 标准化的错误
   */
  private normalizeError(error: any, request: INetworkRequest): UploadError {
    // 已经是UploadError类型，直接返回
    if (error instanceof UploadError) {
      return error;
    }

    // 中止错误
    if (error.name === 'AbortError') {
      return new UploadError(
        NetworkErrorType.REQUEST_ABORTED,
        `请求已中止: ${request.url}`,
        { requestId: request.id, url: request.url }
      );
    }

    // 超时错误
    if (error.name === 'TimeoutError') {
      return new UploadError(
        NetworkErrorType.REQUEST_TIMEOUT,
        `请求超时: ${request.url}`,
        {
          requestId: request.id,
          url: request.url,
          timeout: request.options.timeout,
        }
      );
    }

    // 网络错误
    if (
      !navigator.onLine ||
      error.name === 'NetworkError' ||
      error.message?.includes('network')
    ) {
      return new UploadError(
        NetworkErrorType.NETWORK_ERROR,
        `网络连接错误: ${error.message || '未知错误'}`,
        { requestId: request.id, url: request.url }
      );
    }

    // HTTP状态错误
    if (error.status) {
      return new UploadError(
        NetworkErrorType.HTTP_ERROR,
        `HTTP错误 ${error.status}: ${error.statusText || '未知错误'}`,
        { requestId: request.id, url: request.url, status: error.status }
      );
    }

    // 默认未知错误
    return new UploadError(
      NetworkErrorType.UNKNOWN_ERROR,
      `请求失败: ${error.message || '未知错误'}`,
      { requestId: request.id, url: request.url }
    );
  }

  /**
   * 上传文件
   * @param url 上传URL
   * @param file 文件对象
   * @param options 上传选项
   * @returns 上传结果
   */
  public async uploadFile<T = any>(
    url: string,
    file: File | Blob,
    options: RequestOptions = {}
  ): Promise<NetworkResponse<T>> {
    // 创建FormData
    const formData = new FormData();

    // 添加文件
    const fieldName = options.fileFieldName || 'file';
    const fileName =
      options.fileName || (file instanceof File ? file.name : 'blob');

    formData.append(fieldName, file, fileName);

    // 添加额外数据
    if (options.formData) {
      Object.entries(options.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // 发送请求
    return this.request<T>(url, {
      method: 'POST',
      body: formData,
      ...options,
    });
  }

  /**
   * 上传文件分片
   * @param url 上传URL
   * @param chunk 文件分片
   * @param options 上传选项
   * @returns 上传结果
   */
  public async uploadChunk<T = any>(
    url: string,
    chunk: Blob | ArrayBuffer,
    options: RequestOptions = {}
  ): Promise<NetworkResponse<T>> {
    // 获取正确的请求体
    let body: FormData | Blob | ArrayBuffer;
    let contentType: string | undefined;

    if (options.isDirectUpload) {
      // 直接上传二进制数据
      body = chunk;
      contentType = options.contentType || 'application/octet-stream';
    } else {
      // 使用FormData
      const formData = new FormData();

      // 添加分片数据
      const fieldName = options.fileFieldName || 'chunk';
      formData.append(
        fieldName,
        chunk instanceof Blob ? chunk : new Blob([chunk])
      );

      // 添加元数据
      if (options.formData) {
        Object.entries(options.formData).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      body = formData;
    }

    // 构建请求头
    const headers = { ...options.headers };
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    // 发送请求
    return this.request<T>(url, {
      method: 'POST',
      body,
      headers,
      ...options,
    });
  }

  /**
   * 中止指定请求
   * @param requestId 请求ID
   * @returns 是否成功中止
   */
  public abort(requestId: string): boolean {
    const request = this.activeRequests.get(requestId);

    if (request) {
      // 调用中止控制器中止请求
      request.abortController.abort();

      // 更新请求状态
      request.status = 'aborted';

      // 从活跃请求列表中移除
      this.activeRequests.delete(requestId);

      // 发出中止事件
      this.eventBus.emit('network:requestAbort', {
        requestId,
        url: request.url,
      });

      return true;
    }

    return false;
  }

  /**
   * 中止所有请求
   */
  public abortAll(): void {
    // 遍历并中止所有活跃请求
    this.activeRequests.forEach(request => {
      this.abort(request.id);
    });

    // 清空活跃请求列表
    this.activeRequests.clear();
  }

  /**
   * 设置默认请求选项
   * @param options 默认请求选项
   */
  public setDefaultOptions(options: Partial<RequestOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * 获取当前网络质量
   * @returns 网络质量级别
   */
  public getNetworkQuality(): NetworkQuality {
    return this.networkDetector.getQuality();
  }

  /**
   * 设置重试策略
   * @param strategy 重试策略
   */
  public setRetryStrategy(strategy: RetryStrategy): void {
    this.retryStrategy = { ...this.retryStrategy, ...strategy };
  }

  /**
   * 获取当前活跃请求数量
   * @returns 活跃请求数量
   */
  public getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  /**
   * 检查URL是否有效
   * @param url 要检查的URL
   * @returns 是否有效
   */
  public isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成唯一请求ID
   * @returns 请求ID
   */
  private generateRequestId(): string {
    this.requestIdCounter += 1;
    return `req_${Date.now()}_${this.requestIdCounter}`;
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    // 中止所有请求
    this.abortAll();

    // 停止网络检测器
    if (this.networkDetector) {
      this.networkDetector.stopMonitoring();
    }
  }
}

// 导出默认实例
export default NetworkManager;
