/**
 * ErrorCenter - 统一错误处理中心
 * 负责错误的分类、封装与处理
 */

import { UploadErrorType } from '../types';

export class UploadError extends Error {
  // 错误发生时间
  public timestamp: number;

  // 重试计数（如果已重试过）
  public retryCount = 0;

  // 错误恢复历史
  public recoveryAttempts: {
    timestamp: number;
    successful: boolean;
    strategy: string;
  }[] = [];

  constructor(
    public type: UploadErrorType,
    public message: string,
    public originalError?: any,
    public chunkInfo?: { index: number; retryCount: number },
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'UploadError';
    this.timestamp = Date.now();

    // 捕获错误堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UploadError);
    }

    // 如果原始错误有更多信息，保留它
    if (originalError && typeof originalError === 'object') {
      // 复制原始错误的属性
      for (const key in originalError) {
        if (
          key !== 'name' &&
          key !== 'message' &&
          key !== 'stack' &&
          !Object.prototype.hasOwnProperty.call(this, key)
        ) {
          (this as any)[key] = originalError[key];
        }
      }
    }

    // 如果分片信息包含重试计数，复制到错误对象
    if (chunkInfo?.retryCount) {
      this.retryCount = chunkInfo.retryCount;
    }
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      chunkInfo: this.chunkInfo,
      context: this.context,
      stack: this.stack,
      timestamp: this.timestamp,
      retryCount: this.retryCount,
      recoveryAttempts: this.recoveryAttempts,
    };
  }

  /**
   * 为错误添加上下文信息
   * @param context 上下文信息
   */
  addContext(context: Record<string, any>): this {
    this.context = { ...this.context, ...context };
    return this;
  }

  /**
   * 记录恢复尝试
   * @param successful 是否成功恢复
   * @param strategy 使用的恢复策略
   */
  recordRecoveryAttempt(successful: boolean, strategy: string): this {
    this.recoveryAttempts.push({
      timestamp: Date.now(),
      successful,
      strategy,
    });

    // 如果成功恢复，增加重试计数
    if (successful) {
      this.retryCount++;
    }

    return this;
  }

  /**
   * 获取用户友好的错误消息
   */
  getFriendlyMessage(): string {
    // 根据重试次数调整消息
    const retryInfo =
      this.retryCount > 0 ? `（已重试${this.retryCount}次）` : '';

    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return `网络连接失败，请检查您的网络设置并重试${retryInfo}。`;
      case UploadErrorType.TIMEOUT_ERROR:
        return `请求超时，服务器响应时间过长，请稍后重试${retryInfo}。`;
      case UploadErrorType.SERVER_ERROR:
        return `服务器错误，请联系管理员或稍后重试${retryInfo}。`;
      case UploadErrorType.FILE_ERROR:
        return `文件处理失败，请确认文件完整且格式正确${retryInfo}。`;
      case UploadErrorType.PERMISSION_ERROR:
        return `权限不足，无法完成请求操作${retryInfo}。`;
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return `存储空间不足，请清理空间后重试${retryInfo}。`;
      case UploadErrorType.MEMORY_ERROR:
        return `内存不足，请尝试关闭其他应用或使用更小的文件${retryInfo}。`;
      case UploadErrorType.WORKER_ERROR:
        return `后台处理失败，已切换到备用模式，请重试${retryInfo}。`;
      case UploadErrorType.ENVIRONMENT_ERROR:
        return `当前环境不支持此操作，请尝试使用其他浏览器${retryInfo}。`;
      case UploadErrorType.UPLOAD_ERROR:
        return `上传失败${this.chunkInfo ? `(分片 ${this.chunkInfo.index})` : ''}${retryInfo}，请重试。`;
      case UploadErrorType.MERGE_ERROR:
        return `文件合并失败${retryInfo}，请重新上传。`;
      case UploadErrorType.VALIDATION_ERROR:
        return `文件验证失败，请检查文件类型和大小是否符合要求${retryInfo}。`;
      case UploadErrorType.CANCEL_ERROR:
        return `上传已取消${retryInfo}。`;
      case UploadErrorType.SECURITY_ERROR:
        return `安全检查失败，无法继续上传${retryInfo}。`;
      default:
        return this.message || `发生未知错误${retryInfo}，请重试。`;
    }
  }

  /**
   * 获取可能的解决方案
   */
  getPossibleSolutions(): string[] {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return [
          '检查网络连接是否正常',
          '尝试切换网络环境（如从Wi-Fi切换到移动网络）',
          '检查服务器地址是否正确',
          '检查是否有防火墙或代理阻止连接',
          '稍后重试上传',
        ];
      case UploadErrorType.TIMEOUT_ERROR:
        return [
          '检查网络速度',
          '尝试减小文件大小或分片大小',
          '稍后再试，服务器可能暂时繁忙',
          '如持续出现问题，请联系服务提供商',
        ];
      case UploadErrorType.SERVER_ERROR:
        return [
          '稍后重试，服务器可能暂时不可用',
          '联系服务提供商或管理员报告问题',
          '检查上传参数是否正确',
        ];
      case UploadErrorType.FILE_ERROR:
        return [
          '确认文件是否可以正常打开',
          '检查文件是否损坏',
          '重新选择文件上传',
        ];
      case UploadErrorType.PERMISSION_ERROR:
        return [
          '检查浏览器权限设置',
          '确认是否有文件访问权限',
          '重新登录尝试',
          '使用不同的浏览器尝试',
        ];
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return [
          '清理浏览器存储空间',
          '删除不需要的数据',
          '联系管理员增加存储配额',
        ];
      case UploadErrorType.MEMORY_ERROR:
        return [
          '关闭其他应用释放内存',
          '刷新页面后重试',
          '减小分片大小',
          '分多次上传小文件',
        ];
      case UploadErrorType.ENVIRONMENT_ERROR:
        return [
          '尝试使用最新版本的浏览器',
          '检查浏览器是否支持所需的API',
          '切换到桌面浏览器',
        ];
      case UploadErrorType.WORKER_ERROR:
        return [
          '禁用Web Worker选项后重试',
          '刷新页面后重试',
          '更新浏览器到最新版本',
        ];
      case UploadErrorType.MERGE_ERROR:
        return [
          '重新上传整个文件',
          '检查服务器合并逻辑',
          '联系服务提供商报告问题',
        ];
      case UploadErrorType.VALIDATION_ERROR:
        return [
          '检查文件类型是否在允许范围内',
          '检查文件大小是否超出限制',
          '确认文件格式是否正确',
        ];
      case UploadErrorType.SECURITY_ERROR:
        return [
          '检查文件是否包含恶意内容',
          '联系服务提供商了解安全限制',
          '使用加密后的连接重试',
        ];
      default:
        return [
          '刷新页面重试',
          '联系技术支持',
          '检查控制台是否有更详细的错误信息',
        ];
    }
  }

  /**
   * 判断错误是否可恢复（可重试）
   */
  isRecoverable(): boolean {
    // 可恢复的错误类型
    const recoverableTypes = [
      UploadErrorType.NETWORK_ERROR,
      UploadErrorType.TIMEOUT_ERROR,
      UploadErrorType.SERVER_ERROR,
      UploadErrorType.UPLOAD_ERROR,
      UploadErrorType.WORKER_ERROR,
      UploadErrorType.MERGE_ERROR,
    ];

    return recoverableTypes.includes(this.type);
  }

  /**
   * 获取错误恢复优先级（越高越应该尝试恢复）
   */
  getRecoveryPriority(): number {
    switch (this.type) {
      case UploadErrorType.NETWORK_ERROR:
        return 4; // 网络错误很可能是暂时的，高优先级恢复
      case UploadErrorType.TIMEOUT_ERROR:
        return 3; // 超时可能是暂时的，较高优先级
      case UploadErrorType.SERVER_ERROR:
        return 2; // 服务器错误可能需要等待，中等优先级
      case UploadErrorType.UPLOAD_ERROR:
        return 3; // 上传错误可能是暂时的，较高优先级
      case UploadErrorType.WORKER_ERROR:
        return 1; // Worker错误可能需要降级处理，低优先级
      case UploadErrorType.MERGE_ERROR:
        return 1; // 合并错误可能需要重新上传，低优先级
      default:
        return 0; // 其他错误可能不适合自动恢复
    }
  }
}

export class ErrorCenter {
  // 错误事件处理器
  private errorHandlers: Array<(error: UploadError) => void | boolean> = [];

  // 错误统计
  private errorStats: Map<UploadErrorType, number> = new Map();

  // 错误日志历史记录（最近的错误记录）
  private errorLogs: UploadError[] = [];

  // 最大保存的错误日志数量
  private maxErrorLogSize = 50;

  // 错误恢复策略
  private recoveryStrategies: Map<
    UploadErrorType,
    (error: UploadError) => Promise<boolean>
  > = new Map();

  // 网络状态记录
  private networkConditions: {
    timestamp: number;
    isOnline: boolean;
    avgRtt?: number;
    downlink?: number;
  }[] = [];

  // 高级重试设置
  private retrySettings = {
    // 退避算法系数
    backoffFactor: 1.5,
    // 初始重试延迟（毫秒）
    initialDelay: 1000,
    // 最大重试延迟（毫秒）
    maxDelay: 30000,
    // 抖动因子（0-1）用于避免重试风暴
    jitter: 0.2,
    // 每个错误类型的最大重试次数
    maxRetries: {
      [UploadErrorType.NETWORK_ERROR]: 5,
      [UploadErrorType.TIMEOUT_ERROR]: 3,
      [UploadErrorType.SERVER_ERROR]: 3,
      [UploadErrorType.UPLOAD_ERROR]: 3,
      [UploadErrorType.WORKER_ERROR]: 1,
      [UploadErrorType.MERGE_ERROR]: 2,
    },
  };

  constructor() {
    // 初始化默认恢复策略
    this.initDefaultRecoveryStrategies();

    // 初始化网络监听
    this.initNetworkMonitoring();
  }

  /**
   * 初始化网络状态监听
   */
  private initNetworkMonitoring(): void {
    // 仅在浏览器环境中设置网络监听
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      // 添加网络状态变化监听
      window.addEventListener('online', () => this.recordNetworkStatus(true));
      window.addEventListener('offline', () => this.recordNetworkStatus(false));

      // 记录初始状态
      this.recordNetworkStatus(navigator.onLine);

      // 如果支持网络信息API，设置监听
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        if (connection) {
          connection.addEventListener('change', () => {
            this.recordNetworkStatus(
              navigator.onLine,
              connection.rtt,
              connection.downlink
            );
          });

          // 记录初始状态
          this.recordNetworkStatus(
            navigator.onLine,
            connection.rtt,
            connection.downlink
          );
        }
      }
    }
  }

  /**
   * 记录当前网络状态
   */
  private recordNetworkStatus(
    isOnline: boolean,
    rtt?: number,
    downlink?: number
  ): void {
    this.networkConditions.push({
      timestamp: Date.now(),
      isOnline,
      avgRtt: rtt,
      downlink,
    });

    // 只保留最近100条记录
    if (this.networkConditions.length > 100) {
      this.networkConditions.shift();
    }
  }

  /**
   * 分析网络错误并添加上下文信息
   * @param error 上传错误
   * @returns 增强后的错误对象
   */
  public analyzeNetworkError(error: UploadError): UploadError {
    if (
      error.type !== UploadErrorType.NETWORK_ERROR &&
      error.type !== UploadErrorType.TIMEOUT_ERROR &&
      error.type !== UploadErrorType.SERVER_ERROR
    ) {
      return error; // 不是网络相关错误，直接返回
    }

    // 分析最近的网络状态
    const recentStatus = this.getRecentNetworkStatus();

    // 增强错误上下文
    error.addContext({
      networkAnalysis: {
        isCurrentlyOnline: recentStatus.isOnline,
        recentOfflineEvents: recentStatus.offlineEvents,
        connectionQuality: recentStatus.quality,
        averageRtt: recentStatus.avgRtt,
        averageDownlink: recentStatus.avgDownlink,
        networkChanges: recentStatus.changes,
        analysisTimestamp: Date.now(),
      },
    });

    // 更新错误消息
    if (!recentStatus.isOnline) {
      error.message = '当前网络已断开，请检查网络连接并重试';
    } else if (recentStatus.quality === 'poor') {
      error.message = '当前网络质量较差，可能导致上传失败，建议切换网络环境';
    } else if (recentStatus.changes > 3) {
      error.message = '网络连接不稳定，近期发生多次变化，建议使用更稳定的网络';
    }

    return error;
  }

  /**
   * 获取最近的网络状态分析
   */
  private getRecentNetworkStatus(): {
    isOnline: boolean;
    offlineEvents: number;
    quality: 'good' | 'medium' | 'poor';
    avgRtt?: number;
    avgDownlink?: number;
    changes: number;
  } {
    // 默认值
    const result = {
      isOnline: true,
      offlineEvents: 0,
      quality: 'good' as 'good' | 'medium' | 'poor',
      changes: 0,
    };

    // 如果没有记录，返回默认值
    if (this.networkConditions.length === 0) {
      return result;
    }

    // 当前是否在线
    result.isOnline =
      this.networkConditions[this.networkConditions.length - 1].isOnline;

    // 分析最近10分钟的网络状态
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recentConditions = this.networkConditions.filter(
      c => c.timestamp >= tenMinutesAgo
    );

    if (recentConditions.length > 0) {
      // 计算离线事件次数
      let lastStatus = recentConditions[0].isOnline;
      for (const condition of recentConditions) {
        if (lastStatus && !condition.isOnline) {
          result.offlineEvents++;
        }
        if (lastStatus !== condition.isOnline) {
          result.changes++;
        }
        lastStatus = condition.isOnline;
      }

      // 计算平均RTT和下行速度
      const validRtts = recentConditions
        .filter(c => typeof c.avgRtt === 'number')
        .map(c => c.avgRtt as number);
      const validDownlinks = recentConditions
        .filter(c => typeof c.downlink === 'number')
        .map(c => c.downlink as number);

      if (validRtts.length > 0) {
        result.avgRtt =
          validRtts.reduce((sum, rtt) => sum + rtt, 0) / validRtts.length;
      }

      if (validDownlinks.length > 0) {
        result.avgDownlink =
          validDownlinks.reduce((sum, dl) => sum + dl, 0) /
          validDownlinks.length;
      }

      // 评估网络质量
      if (result.offlineEvents > 2 || result.changes > 5) {
        result.quality = 'poor';
      } else if (
        (result.avgRtt && result.avgRtt > 500) ||
        (result.avgDownlink && result.avgDownlink < 1)
      ) {
        result.quality = 'poor';
      } else if (
        (result.avgRtt && result.avgRtt > 200) ||
        (result.avgDownlink && result.avgDownlink < 5)
      ) {
        result.quality = 'medium';
      }
    }

    return result;
  }

  /**
   * 初始化默认恢复策略
   */
  private initDefaultRecoveryStrategies(): void {
    // 网络错误恢复策略
    this.recoveryStrategies.set(
      UploadErrorType.NETWORK_ERROR,
      async (error: UploadError) => {
        // 检查是否超过最大重试次数
        if (this.shouldAbortRetry(error)) {
          return false;
        }

        // 网络状态分析
        const networkStatus = this.getRecentNetworkStatus();

        // 如果当前仍然离线，等待恢复在线状态
        if (!networkStatus.isOnline) {
          // 等待在线事件或一段时间后继续
          await this.waitForOnline(10000); // 最多等待10秒

          // 如果仍然离线，不要继续尝试
          if (!this.isCurrentlyOnline()) {
            return false;
          }
        }

        // 计算退避延迟时间
        const delay = this.calculateBackoffDelay(error.retryCount);

        // 等待重试
        await new Promise(resolve => setTimeout(resolve, delay));

        // 记录恢复尝试
        error.recordRecoveryAttempt(true, 'network_backoff');

        return true;
      }
    );

    // 超时错误恢复策略
    this.recoveryStrategies.set(
      UploadErrorType.TIMEOUT_ERROR,
      async (error: UploadError) => {
        // 检查是否超过最大重试次数
        if (this.shouldAbortRetry(error)) {
          return false;
        }

        // 网络状态分析
        const networkStatus = this.getRecentNetworkStatus();

        // 如果网络质量很差，延长等待时间
        let delayMultiplier = 1;
        if (networkStatus.quality === 'poor') {
          delayMultiplier = 2;
        }

        // 计算退避延迟时间
        const delay =
          this.calculateBackoffDelay(error.retryCount) * delayMultiplier;

        // 等待重试
        await new Promise(resolve => setTimeout(resolve, delay));

        // 记录恢复尝试
        error.recordRecoveryAttempt(true, 'timeout_backoff');

        return true;
      }
    );

    // 服务器错误恢复策略
    this.recoveryStrategies.set(
      UploadErrorType.SERVER_ERROR,
      async (error: UploadError) => {
        // 检查是否超过最大重试次数
        if (this.shouldAbortRetry(error)) {
          return false;
        }

        // 服务器错误可能需要更长的等待时间
        const delay = this.calculateBackoffDelay(error.retryCount) * 1.5;

        // 等待重试
        await new Promise(resolve => setTimeout(resolve, delay));

        // 记录恢复尝试
        error.recordRecoveryAttempt(true, 'server_backoff');

        return true;
      }
    );

    // 上传错误恢复策略
    this.recoveryStrategies.set(
      UploadErrorType.UPLOAD_ERROR,
      async (error: UploadError) => {
        // 检查是否超过最大重试次数
        if (this.shouldAbortRetry(error)) {
          return false;
        }

        // 针对分片的特殊处理
        if (error.chunkInfo) {
          // 记录分片重试信息
          error.addContext({
            retryingChunk: {
              index: error.chunkInfo.index,
              attempt: error.retryCount + 1,
            },
          });
        }

        // 计算退避延迟时间
        const delay = this.calculateBackoffDelay(error.retryCount);

        // 等待重试
        await new Promise(resolve => setTimeout(resolve, delay));

        // 记录恢复尝试
        error.recordRecoveryAttempt(true, 'upload_retry');

        return true;
      }
    );

    // Worker错误恢复策略
    this.recoveryStrategies.set(
      UploadErrorType.WORKER_ERROR,
      async (error: UploadError) => {
        // Worker错误通常需要降级处理，只尝试一次
        if (error.retryCount > 0) {
          return false;
        }

        // 可能需要在上下文中添加降级标记
        error.addContext({
          workerFallback: true,
          fallbackTimestamp: Date.now(),
        });

        // 短暂延迟后重试
        await new Promise(resolve => setTimeout(resolve, 500));

        // 记录恢复尝试
        error.recordRecoveryAttempt(true, 'worker_fallback');

        return true;
      }
    );

    // 合并错误恢复策略
    this.recoveryStrategies.set(
      UploadErrorType.MERGE_ERROR,
      async (error: UploadError) => {
        // 检查是否超过最大重试次数
        if (this.shouldAbortRetry(error)) {
          return false;
        }

        // 合并错误可能需要较长时间等待
        const delay = this.calculateBackoffDelay(error.retryCount) * 2;

        // 等待重试
        await new Promise(resolve => setTimeout(resolve, delay));

        // 记录恢复尝试
        error.recordRecoveryAttempt(true, 'merge_retry');

        return true;
      }
    );
  }

  /**
   * 计算指数退避延迟时间
   * @param retryCount 当前重试次数
   * @returns 延迟时间（毫秒）
   */
  private calculateBackoffDelay(retryCount: number): number {
    // 指数退避公式: initialDelay * (backoffFactor ^ retryCount)
    let delay =
      this.retrySettings.initialDelay *
      Math.pow(this.retrySettings.backoffFactor, retryCount);

    // 添加抖动以避免重试风暴
    const jitterAmount = delay * this.retrySettings.jitter;
    delay += Math.random() * jitterAmount * 2 - jitterAmount;

    // 不超过最大延迟
    delay = Math.min(delay, this.retrySettings.maxDelay);

    return Math.floor(delay);
  }

  /**
   * 检查是否应该终止重试
   * @param error 错误对象
   * @returns 是否应该终止重试
   */
  private shouldAbortRetry(error: UploadError): boolean {
    const maxRetries = this.retrySettings.maxRetries[error.type];

    // 如果没有为此错误类型指定最大重试次数，不重试
    if (maxRetries === undefined) {
      return true;
    }

    // 检查是否超过最大重试次数
    return error.retryCount >= maxRetries;
  }

  /**
   * 等待网络恢复在线
   * @param maxWaitTime 最大等待时间（毫秒）
   * @returns 是否成功恢复在线状态
   */
  private async waitForOnline(maxWaitTime: number): Promise<boolean> {
    // 如果已经在线，立即返回
    if (this.isCurrentlyOnline()) {
      return true;
    }

    return new Promise(resolve => {
      // 在线状态变化处理函数
      const onlineHandler = () => {
        cleanup();
        resolve(true);
      };

      // 超时处理
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(this.isCurrentlyOnline());
      }, maxWaitTime);

      // 清理函数
      const cleanup = () => {
        clearTimeout(timeoutId);
        window.removeEventListener('online', onlineHandler);
      };

      // 监听在线事件
      window.addEventListener('online', onlineHandler);
    });
  }

  /**
   * 检查当前是否在线
   */
  private isCurrentlyOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
  }

  /**
   * 处理并标准化各种错误
   * @param error 原始错误
   * @param context 错误上下文
   * @returns 标准化的上传错误
   */
  public handle(error: any, context?: Record<string, any>): UploadError {
    // 如果已经是UploadError，直接返回并更新上下文
    if (error instanceof UploadError) {
      if (context) {
        error.addContext(context);
      }

      // 如果是网络相关错误，进行额外分析
      if (
        error.type === UploadErrorType.NETWORK_ERROR ||
        error.type === UploadErrorType.TIMEOUT_ERROR ||
        error.type === UploadErrorType.SERVER_ERROR
      ) {
        error = this.analyzeNetworkError(error);
      }

      this.trackError(error);
      this.logError(error);
      return error;
    }

    // 处理不同类型的错误
    let uploadError: UploadError;

    // 网络错误处理
    if (
      error.name === 'NetworkError' ||
      error.message?.includes('network') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNABORTED' ||
      (typeof error.status === 'number' && error.status === 0) ||
      (error instanceof DOMException &&
        (error.name === 'NetworkError' || error.code === 19)) ||
      (error.message && /net::ERR_|network|connection/i.test(error.message))
    ) {
      uploadError = new UploadError(
        UploadErrorType.NETWORK_ERROR,
        '网络连接失败，请检查网络设置',
        error,
        undefined,
        context
      );
    }

    // Worker 相关错误处理
    else if (
      error.message?.includes('Worker') ||
      error.name === 'WorkerError' ||
      (error instanceof DOMException &&
        error.name === 'SecurityError' &&
        error.message?.includes('Worker'))
    ) {
      uploadError = new UploadError(
        UploadErrorType.WORKER_ERROR,
        '处理任务时发生错误，已降级为主线程处理',
        error,
        undefined,
        context
      );
    }

    // 超时错误
    else if (
      error.name === 'TimeoutError' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out')
    ) {
      uploadError = new UploadError(
        UploadErrorType.TIMEOUT_ERROR,
        '请求超时，请检查网络状况或服务器响应',
        error,
        undefined,
        context
      );
    }

    // 内存错误处理
    else if (
      error.name === 'OutOfMemoryError' ||
      error.message?.includes('memory') ||
      error.message?.includes('allocation failed') ||
      error.message?.includes('heap') ||
      error.code === 'ENOMEM'
    ) {
      uploadError = new UploadError(
        UploadErrorType.MEMORY_ERROR,
        '内存不足，请尝试使用更小的分片大小',
        error,
        undefined,
        context
      );
    }

    // 权限错误
    else if (
      error.name === 'NotAllowedError' ||
      error.message?.includes('permission') ||
      error.code === 'EPERM' ||
      error.code === 'EACCES' ||
      (error instanceof DOMException &&
        (error.name === 'SecurityError' || error.name === 'NotAllowedError'))
    ) {
      uploadError = new UploadError(
        UploadErrorType.PERMISSION_ERROR,
        '无权限访问文件，请检查文件权限',
        error,
        undefined,
        context
      );
    }

    // 文件错误处理
    else if (
      error.name === 'NotFoundError' ||
      error.name === 'NotReadableError' ||
      error.message?.includes('file') ||
      error.message?.includes('read') ||
      error.code === 'ENOENT' ||
      (error instanceof DOMException &&
        (error.name === 'NotFoundError' || error.name === 'NotReadableError'))
    ) {
      uploadError = new UploadError(
        UploadErrorType.FILE_ERROR,
        '文件访问失败，请确认文件存在且可读',
        error,
        undefined,
        context
      );
    }

    // 存储配额超出错误
    else if (
      error.name === 'QuotaExceededError' ||
      (error instanceof DOMException && error.name === 'QuotaExceededError')
    ) {
      uploadError = new UploadError(
        UploadErrorType.QUOTA_EXCEEDED_ERROR,
        '存储空间不足，无法保存上传进度',
        error,
        undefined,
        context
      );
    }

    // 服务端错误
    else if (error.status >= 500 || error.statusCode >= 500) {
      uploadError = new UploadError(
        UploadErrorType.SERVER_ERROR,
        `服务器错误(${error.status || error.statusCode})，请稍后重试`,
        error,
        undefined,
        context
      );
    }

    // 客户端错误
    else if (
      (error.status >= 400 && error.status < 500) ||
      (error.statusCode >= 400 && error.statusCode < 500)
    ) {
      let message = '请求错误';

      // 常见客户端错误特殊处理
      if (error.status === 401 || error.statusCode === 401) {
        message = '未授权，请重新登录';
      } else if (error.status === 403 || error.statusCode === 403) {
        message = '无权访问该资源';
      } else if (error.status === 404 || error.statusCode === 404) {
        message = '请求的资源不存在';
      } else if (error.status === 413 || error.statusCode === 413) {
        message = '文件过大，超出服务器限制';
      } else {
        message = `请求错误(${error.status || error.statusCode})`;
      }

      uploadError = new UploadError(
        UploadErrorType.SERVER_ERROR,
        message,
        error,
        undefined,
        context
      );
    }

    // 默认为未知错误
    else {
      uploadError = new UploadError(
        UploadErrorType.UNKNOWN_ERROR,
        error.message || '上传过程中发生未知错误',
        error,
        undefined,
        context
      );
    }

    // 跟踪错误
    this.trackError(uploadError);

    // 对网络错误进行分析
    if (
      uploadError.type === UploadErrorType.NETWORK_ERROR ||
      uploadError.type === UploadErrorType.TIMEOUT_ERROR ||
      uploadError.type === UploadErrorType.SERVER_ERROR
    ) {
      uploadError = this.analyzeNetworkError(uploadError);
    }

    // 记录错误日志
    this.logError(uploadError);

    // 触发错误处理器
    for (const handler of this.errorHandlers) {
      const result = handler(uploadError);
      // 如果处理器返回 false，中断处理链
      if (result === false) break;
    }

    return uploadError;
  }

  /**
   * 添加错误处理器
   * @param handler 错误处理函数
   */
  public addErrorHandler(
    handler: (error: UploadError) => void | boolean
  ): void {
    this.errorHandlers.push(handler);
  }

  /**
   * 移除错误处理器
   * @param handler 要移除的处理函数
   */
  public removeErrorHandler(
    handler: (error: UploadError) => void | boolean
  ): void {
    const index = this.errorHandlers.indexOf(handler);
    if (index !== -1) {
      this.errorHandlers.splice(index, 1);
    }
  }

  /**
   * 统计错误
   * @param error 上传错误
   */
  private trackError(error: UploadError): void {
    const count = this.errorStats.get(error.type) || 0;
    this.errorStats.set(error.type, count + 1);
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): Record<string, number> {
    const result: Record<string, number> = {};

    this.errorStats.forEach((count, type) => {
      result[UploadErrorType[type]] = count;
    });

    return result;
  }

  /**
   * 清除错误统计
   */
  public clearErrorStats(): void {
    this.errorStats.clear();
  }

  /**
   * 尝试恢复错误
   * @param error 上传错误
   * @returns 是否可以恢复
   */
  public async tryRecover(error: UploadError): Promise<boolean> {
    // 检查错误是否可恢复
    if (!error.isRecoverable()) {
      return false;
    }

    // 获取恢复策略
    const strategy = this.recoveryStrategies.get(error.type);
    if (!strategy) {
      return false;
    }

    // 执行恢复策略
    try {
      return await strategy(error);
    } catch (e) {
      // 恢复过程中出错
      return false;
    }
  }

  /**
   * 添加自定义恢复策略
   * @param errorType 错误类型
   * @param strategy 恢复策略函数
   */
  public addRecoveryStrategy(
    errorType: UploadErrorType,
    strategy: (error: UploadError) => Promise<boolean>
  ): void {
    this.recoveryStrategies.set(errorType, strategy);
  }

  /**
   * 获取错误的严重性级别
   * @param error 上传错误
   * @returns 严重性级别 (1-5，5最严重)
   */
  public getErrorSeverity(error: UploadError): number {
    switch (error.type) {
      case UploadErrorType.NETWORK_ERROR:
      case UploadErrorType.TIMEOUT_ERROR:
        return 2; // 暂时性问题，可能自动恢复

      case UploadErrorType.SERVER_ERROR:
        return 4; // 服务端问题，可能需要服务端修复

      case UploadErrorType.MEMORY_ERROR:
      case UploadErrorType.ENVIRONMENT_ERROR:
        return 5; // 严重问题，可能无法继续

      case UploadErrorType.FILE_ERROR:
      case UploadErrorType.VALIDATION_ERROR:
        return 3; // 需要用户修复的问题

      case UploadErrorType.PERMISSION_ERROR:
      case UploadErrorType.QUOTA_EXCEEDED_ERROR:
        return 3; // 需要用户交互的问题

      case UploadErrorType.UPLOAD_ERROR:
      case UploadErrorType.WORKER_ERROR:
        return 2; // 可能通过重试解决

      case UploadErrorType.CANCEL_ERROR:
        return 1; // 用户主动取消，不是错误

      case UploadErrorType.UNKNOWN_ERROR:
      default:
        return 3; // 未知问题，中等严重性
    }
  }

  /**
   * 获取分组的错误类型
   * @param error 上传错误
   * @returns 错误组
   */
  public getErrorGroup(error: UploadError): string {
    if (
      error.type === UploadErrorType.NETWORK_ERROR ||
      error.type === UploadErrorType.TIMEOUT_ERROR ||
      error.type === UploadErrorType.SERVER_ERROR
    ) {
      return 'network'; // 网络相关错误
    }

    if (
      error.type === UploadErrorType.FILE_ERROR ||
      error.type === UploadErrorType.VALIDATION_ERROR
    ) {
      return 'file'; // 文件相关错误
    }

    if (
      error.type === UploadErrorType.PERMISSION_ERROR ||
      error.type === UploadErrorType.QUOTA_EXCEEDED_ERROR
    ) {
      return 'permission'; // 权限相关错误
    }

    if (
      error.type === UploadErrorType.MEMORY_ERROR ||
      error.type === UploadErrorType.ENVIRONMENT_ERROR ||
      error.type === UploadErrorType.WORKER_ERROR
    ) {
      return 'environment'; // 环境相关错误
    }

    if (
      error.type === UploadErrorType.UPLOAD_ERROR ||
      error.type === UploadErrorType.MERGE_ERROR
    ) {
      return 'upload'; // 上传过程错误
    }

    if (error.type === UploadErrorType.CANCEL_ERROR) {
      return 'user'; // 用户操作错误
    }

    return 'unknown'; // 未知错误组
  }

  /**
   * 记录错误到日志历史
   * @param error 上传错误
   */
  private logError(error: UploadError): void {
    // 添加时间戳到错误上下文
    if (!error.context) {
      error.context = {};
    }

    if (!error.context.logTimestamp) {
      error.context.logTimestamp = Date.now();
    }

    // 添加到日志历史
    this.errorLogs.push(error);

    // 维持最大日志数量
    if (this.errorLogs.length > this.maxErrorLogSize) {
      this.errorLogs.shift();
    }
  }

  /**
   * 获取错误日志历史
   * @param count 要获取的最近错误数量，默认全部
   * @param type 可选的错误类型过滤
   * @returns 错误日志数组
   */
  public getErrorLogs(count?: number, type?: UploadErrorType): UploadError[] {
    let logs = [...this.errorLogs];

    // 按类型过滤
    if (type !== undefined) {
      logs = logs.filter(error => error.type === type);
    }

    // 按时间戳排序，最新的在前
    logs.sort((a, b) => {
      const timeA = a.context?.logTimestamp || 0;
      const timeB = b.context?.logTimestamp || 0;
      return timeB - timeA;
    });

    // 限制数量
    if (count !== undefined && count > 0) {
      logs = logs.slice(0, count);
    }

    return logs;
  }

  /**
   * 获取错误日志汇总报告
   */
  public getErrorSummary(): {
    totalErrors: number;
    byType: Record<string, number>;
    byGroup: Record<string, number>;
    bySeverity: Record<number, number>;
    mostFrequent: { type: string; count: number }[];
    mostRecent: { type: string; timestamp: number }[];
    networkRelated: number;
  } {
    const summary = {
      totalErrors: this.errorLogs.length,
      byType: {} as Record<string, number>,
      byGroup: {} as Record<string, number>,
      bySeverity: {} as Record<number, number>,
      mostFrequent: [] as { type: string; count: number }[],
      mostRecent: [] as { type: string; timestamp: number }[],
      networkRelated: 0,
    };

    // 统计各分类的错误数量
    for (const error of this.errorLogs) {
      // 按类型统计
      const typeName = UploadErrorType[error.type];
      summary.byType[typeName] = (summary.byType[typeName] || 0) + 1;

      // 按组统计
      const group = this.getErrorGroup(error);
      summary.byGroup[group] = (summary.byGroup[group] || 0) + 1;

      // 按严重性统计
      const severity = this.getErrorSeverity(error);
      summary.bySeverity[severity] = (summary.bySeverity[severity] || 0) + 1;

      // 网络相关错误计数
      if (group === 'network') {
        summary.networkRelated++;
      }
    }

    // 获取最常见的错误类型
    summary.mostFrequent = Object.entries(summary.byType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 最近的错误
    summary.mostRecent = this.errorLogs
      .filter(error => error.context?.logTimestamp)
      .map(error => ({
        type: UploadErrorType[error.type],
        timestamp: error.context?.logTimestamp as number,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    return summary;
  }

  /**
   * 配置智能重试参数
   * @param settings 重试设置参数
   */
  public configureRetrySettings(settings: {
    backoffFactor?: number;
    initialDelay?: number;
    maxDelay?: number;
    jitter?: number;
    maxRetries?: Partial<Record<UploadErrorType, number>>;
  }): void {
    // 更新退避系数
    if (settings.backoffFactor !== undefined && settings.backoffFactor > 1) {
      this.retrySettings.backoffFactor = settings.backoffFactor;
    }

    // 更新初始延迟
    if (settings.initialDelay !== undefined && settings.initialDelay > 0) {
      this.retrySettings.initialDelay = settings.initialDelay;
    }

    // 更新最大延迟
    if (settings.maxDelay !== undefined && settings.maxDelay > 0) {
      this.retrySettings.maxDelay = settings.maxDelay;
    }

    // 更新抖动因子
    if (
      settings.jitter !== undefined &&
      settings.jitter >= 0 &&
      settings.jitter <= 1
    ) {
      this.retrySettings.jitter = settings.jitter;
    }

    // 更新最大重试次数
    if (settings.maxRetries) {
      this.retrySettings.maxRetries = {
        ...this.retrySettings.maxRetries,
        ...settings.maxRetries,
      };
    }
  }

  /**
   * 基于环境和历史错误自适应调整重试策略
   */
  public adaptRetryStrategy(): void {
    // 获取网络状态
    const networkStatus = this.getRecentNetworkStatus();

    // 根据网络质量调整策略
    if (networkStatus.quality === 'poor') {
      // 网络质量差时使用更保守的策略
      this.configureRetrySettings({
        backoffFactor: 2.0,
        initialDelay: 2000,
        maxDelay: 60000,
        jitter: 0.3,
      });
    } else if (networkStatus.quality === 'medium') {
      // 网络质量中等时使用平衡策略
      this.configureRetrySettings({
        backoffFactor: 1.5,
        initialDelay: 1000,
        maxDelay: 30000,
        jitter: 0.2,
      });
    } else {
      // 网络质量好时使用激进策略
      this.configureRetrySettings({
        backoffFactor: 1.2,
        initialDelay: 500,
        maxDelay: 15000,
        jitter: 0.1,
      });
    }

    // 分析错误历史，调整特定类型错误的重试次数
    const errorSummary = this.getErrorSummary();

    // 如果网络错误频繁，增加网络错误的重试次数
    if (errorSummary.byGroup.network > 10 && networkStatus.isOnline) {
      this.retrySettings.maxRetries[UploadErrorType.NETWORK_ERROR] = 7;
      this.retrySettings.maxRetries[UploadErrorType.TIMEOUT_ERROR] = 5;
    }

    // 如果服务器错误频繁，可能服务器有问题，减少重试次数
    if (
      errorSummary.byType[UploadErrorType[UploadErrorType.SERVER_ERROR]] > 5
    ) {
      this.retrySettings.maxRetries[UploadErrorType.SERVER_ERROR] = 1;
    }
  }
}

export default ErrorCenter;
