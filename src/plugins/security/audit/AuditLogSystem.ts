/**
 * 审计日志系统
 * 提供安全操作的详细记录功能
 */

/**
 * 审计日志选项
 */
export interface AuditLogOptions {
  /**
   * 日志级别
   * @default 'normal'
   */
  logLevel?: 'minimal' | 'normal' | 'verbose';

  /**
   * 是否记录用户信息
   * @default true
   */
  logUserInfo?: boolean;

  /**
   * 是否记录IP地址
   * @default true
   */
  logIpAddress?: boolean;

  /**
   * 是否记录地理位置信息
   * @default false
   */
  logGeoLocation?: boolean;

  /**
   * 是否记录设备信息
   * @default true
   */
  logDeviceInfo?: boolean;

  /**
   * 自定义日志处理函数
   * 如果提供，将使用此函数处理日志而不是默认的处理方式
   */
  customLogHandler?: (logEntry: AuditLogEntry) => void;

  /**
   * 日志存储配置
   */
  storage?: {
    /**
     * 存储类型
     * @default 'memory'
     */
    type: 'memory' | 'localStorage' | 'indexedDB' | 'custom';

    /**
     * 自定义存储器
     * 当type为'custom'时必须提供
     */
    customStorage?: {
      save: (data: any) => Promise<void>;
      load: () => Promise<any[]>;
      clear: () => Promise<void>;
    };

    /**
     * 最大日志条目数
     * @default 1000
     */
    maxEntries?: number;

    /**
     * 存储键名
     * @default 'fileChunkPro_audit_logs'
     */
    storageKey?: string;
  };

  /**
   * 远程日志服务器
   */
  remoteServer?: {
    /**
     * 服务器URL
     */
    url: string;

    /**
     * 请求头
     */
    headers?: Record<string, string>;

    /**
     * 批处理配置
     */
    batchConfig?: {
      /**
       * 是否启用批处理
       * @default true
       */
      enabled: boolean;

      /**
       * 批次大小
       * @default 10
       */
      size: number;

      /**
       * 发送间隔(毫秒)
       * @default 30000
       */
      interval: number;
    };
  };

  /**
   * 自定义审计字段
   */
  customFields?: Record<string, any>;
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /**
   * 日志唯一标识
   */
  id: string;

  /**
   * 事件类型
   */
  eventType: string;

  /**
   * 事件详情
   */
  details: Record<string, any>;

  /**
   * 时间戳
   */
  timestamp: number;

  /**
   * 用户信息
   */
  user?: {
    /**
     * 用户ID
     */
    id?: string;

    /**
     * 用户名
     */
    username?: string;

    /**
     * 角色
     */
    roles?: string[];
  };

  /**
   * IP地址
   */
  ipAddress?: string;

  /**
   * 地理位置信息
   */
  geoLocation?: {
    /**
     * 国家/地区
     */
    country?: string;

    /**
     * 城市
     */
    city?: string;

    /**
     * 经度
     */
    longitude?: number;

    /**
     * 纬度
     */
    latitude?: number;
  };

  /**
   * 设备信息
   */
  deviceInfo?: {
    /**
     * 用户代理
     */
    userAgent?: string;

    /**
     * 操作系统
     */
    os?: string;

    /**
     * 浏览器
     */
    browser?: string;

    /**
     * 设备类型
     */
    deviceType?: string;
  };

  /**
   * 严重性级别
   */
  severity?: 'info' | 'warning' | 'error' | 'critical';

  /**
   * 自定义字段
   */
  customFields?: Record<string, any>;
}

/**
 * 审计日志系统
 * 提供安全操作的详细记录功能
 */
export default class AuditLogSystem {
  /**
   * 日志选项
   */
  private options: AuditLogOptions;

  /**
   * 内存中的日志条目
   */
  private memoryLogs: AuditLogEntry[] = [];

  /**
   * 批处理队列
   */
  private batchQueue: AuditLogEntry[] = [];

  /**
   * 批处理定时器
   */
  private batchTimer: number | null = null;

  /**
   * 用户信息
   */
  private userInfo: { id?: string; username?: string; roles?: string[] } = {};

  /**
   * 构造函数
   * @param options 日志选项
   */
  constructor(options?: AuditLogOptions) {
    this.options = {
      logLevel: 'normal',
      logUserInfo: true,
      logIpAddress: true,
      logGeoLocation: false,
      logDeviceInfo: true,
      storage: {
        type: 'memory',
        maxEntries: 1000,
        storageKey: 'fileChunkPro_audit_logs',
      },
      ...options,
    };

    // 初始化审计系统
    this.initialize();
  }

  /**
   * 初始化审计系统
   */
  private async initialize(): Promise<void> {
    try {
      // 从存储中加载日志
      await this.loadLogs();

      // 如果配置了远程服务器和批处理，启动批处理定时器
      if (
        this.options.remoteServer &&
        this.options.remoteServer.batchConfig?.enabled
      ) {
        this.startBatchProcessing();
      }
    } catch (error) {
      console.error('审计日志系统初始化失败:', error);
    }
  }

  /**
   * 设置用户信息
   * @param userInfo 用户信息
   */
  public setUserInfo(userInfo: {
    id?: string;
    username?: string;
    roles?: string[];
  }): void {
    this.userInfo = { ...userInfo };
  }

  /**
   * 记录审计日志
   * @param eventType 事件类型
   * @param details 事件详情
   * @param severity 严重性级别
   */
  public log(
    eventType: string,
    details: Record<string, any>,
    severity: 'info' | 'warning' | 'error' | 'critical' = 'info'
  ): void {
    try {
      // 创建日志条目
      const logEntry: AuditLogEntry = {
        id: this.generateId(),
        eventType,
        details,
        timestamp: Date.now(),
        severity,
      };

      // 添加用户信息
      if (this.options.logUserInfo && Object.keys(this.userInfo).length > 0) {
        logEntry.user = { ...this.userInfo };
      }

      // 添加IP地址
      if (this.options.logIpAddress) {
        logEntry.ipAddress = this.getIpAddress();
      }

      // 添加地理位置信息
      if (this.options.logGeoLocation) {
        logEntry.geoLocation = this.getGeoLocation();
      }

      // 添加设备信息
      if (this.options.logDeviceInfo) {
        logEntry.deviceInfo = this.getDeviceInfo();
      }

      // 添加自定义字段
      if (this.options.customFields) {
        logEntry.customFields = { ...this.options.customFields };
      }

      // 处理日志条目
      this.processLogEntry(logEntry);
    } catch (error) {
      console.error('记录审计日志失败:', error);
    }
  }

  /**
   * 获取所有日志
   * @returns 日志条目数组
   */
  public async getLogs(): Promise<AuditLogEntry[]> {
    switch (this.options.storage?.type) {
      case 'localStorage':
        return this.getLogsFromLocalStorage();
      case 'indexedDB':
        return this.getLogsFromIndexedDB();
      case 'custom':
        if (this.options.storage?.customStorage) {
          return this.options.storage.customStorage.load();
        }
        return this.memoryLogs;
      case 'memory':
      default:
        return this.memoryLogs;
    }
  }

  /**
   * 清除所有日志
   */
  public async clearLogs(): Promise<void> {
    try {
      switch (this.options.storage?.type) {
        case 'localStorage':
          localStorage.removeItem(
            this.options.storage.storageKey || 'fileChunkPro_audit_logs'
          );
          break;
        case 'indexedDB':
          await this.clearLogsFromIndexedDB();
          break;
        case 'custom':
          if (this.options.storage?.customStorage) {
            await this.options.storage.customStorage.clear();
          }
          break;
      }

      // 清空内存日志
      this.memoryLogs = [];
    } catch (error) {
      console.error('清除审计日志失败:', error);
      throw new Error(`清除审计日志失败: ${(error as Error).message}`);
    }
  }

  /**
   * 导出日志为JSON字符串
   * @returns JSON格式的日志
   */
  public async exportLogs(): Promise<string> {
    try {
      const logs = await this.getLogs();
      return JSON.stringify(logs, null, 2);
    } catch (error) {
      console.error('导出审计日志失败:', error);
      throw new Error(`导出审计日志失败: ${(error as Error).message}`);
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    // 停止批处理定时器
    if (this.batchTimer !== null) {
      window.clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // 如果队列中还有日志，立即发送
    if (this.batchQueue.length > 0 && this.options.remoteServer) {
      this.sendBatchToRemoteServer(this.batchQueue);
    }

    // 清空内存队列
    this.batchQueue = [];

    // 清空内存日志(可选，取决于需求)
    // this.memoryLogs = [];
  }

  /**
   * 处理日志条目
   * @param logEntry 日志条目
   */
  private processLogEntry(logEntry: AuditLogEntry): void {
    // 如果设置了自定义处理函数，则使用它
    if (this.options.customLogHandler) {
      this.options.customLogHandler(logEntry);
      return;
    }

    // 添加到内存中
    this.addLogToMemory(logEntry);

    // 保存到存储
    this.saveLogToStorage(logEntry);

    // 如果配置了远程服务器，发送到远程
    if (this.options.remoteServer) {
      if (this.options.remoteServer.batchConfig?.enabled) {
        // 批处理模式
        this.addToBatchQueue(logEntry);
      } else {
        // 立即发送模式
        this.sendToRemoteServer(logEntry);
      }
    }

    // 根据日志级别决定是否输出到控制台
    this.logToConsole(logEntry);
  }

  /**
   * 添加日志到内存
   * @param logEntry 日志条目
   */
  private addLogToMemory(logEntry: AuditLogEntry): void {
    this.memoryLogs.push(logEntry);

    // 如果超过最大条目数，删除最旧的
    const maxEntries = this.options.storage?.maxEntries || 1000;
    if (this.memoryLogs.length > maxEntries) {
      this.memoryLogs = this.memoryLogs.slice(-maxEntries);
    }
  }

  /**
   * 保存日志到存储
   * @param logEntry 日志条目
   */
  private async saveLogToStorage(logEntry: AuditLogEntry): Promise<void> {
    try {
      switch (this.options.storage?.type) {
        case 'localStorage':
          this.saveLogToLocalStorage(logEntry);
          break;
        case 'indexedDB':
          await this.saveLogToIndexedDB(logEntry);
          break;
        case 'custom':
          if (this.options.storage?.customStorage) {
            await this.options.storage.customStorage.save(logEntry);
          }
          break;
        // 内存存储不需要额外操作
      }
    } catch (error) {
      console.error('保存审计日志到存储失败:', error);
    }
  }

  /**
   * 保存日志到LocalStorage
   * @param logEntry 日志条目
   */
  private saveLogToLocalStorage(logEntry: AuditLogEntry): void {
    try {
      const storageKey =
        this.options.storage?.storageKey || 'fileChunkPro_audit_logs';
      const storedLogsJson = localStorage.getItem(storageKey);
      let storedLogs: AuditLogEntry[] = [];

      if (storedLogsJson) {
        storedLogs = JSON.parse(storedLogsJson);
      }

      storedLogs.push(logEntry);

      // 如果超过最大条目数，删除最旧的
      const maxEntries = this.options.storage?.maxEntries || 1000;
      if (storedLogs.length > maxEntries) {
        storedLogs = storedLogs.slice(-maxEntries);
      }

      localStorage.setItem(storageKey, JSON.stringify(storedLogs));
    } catch (error) {
      console.error('保存审计日志到LocalStorage失败:', error);
    }
  }

  /**
   * 保存日志到IndexedDB
   * @param logEntry 日志条目
   */
  private async saveLogToIndexedDB(_logEntry: AuditLogEntry): Promise<void> {
    try {
      // 由于IndexedDB操作比较复杂，此处仅为示例
      // 实际项目中可能需要使用更完善的IndexedDB包装库
      console.warn('IndexedDB存储未完全实现，将回退到内存存储');

      // 此处可以添加IndexedDB实现
      // 例如，打开数据库，创建事务，添加日志等
    } catch (error) {
      console.error('保存审计日志到IndexedDB失败:', error);
    }
  }

  /**
   * 从LocalStorage获取日志
   * @returns 日志条目数组
   */
  private getLogsFromLocalStorage(): AuditLogEntry[] {
    try {
      const storageKey =
        this.options.storage?.storageKey || 'fileChunkPro_audit_logs';
      const storedLogsJson = localStorage.getItem(storageKey);

      if (storedLogsJson) {
        return JSON.parse(storedLogsJson);
      }
    } catch (error) {
      console.error('从LocalStorage获取审计日志失败:', error);
    }

    return [];
  }

  /**
   * 从IndexedDB获取日志
   * @returns 日志条目数组
   */
  private async getLogsFromIndexedDB(): Promise<AuditLogEntry[]> {
    try {
      // 由于IndexedDB操作比较复杂，此处仅为示例
      console.warn('IndexedDB获取未完全实现，将返回内存日志');

      // 此处可以添加IndexedDB实现
      // 例如，打开数据库，创建事务，获取所有日志等
    } catch (error) {
      console.error('从IndexedDB获取审计日志失败:', error);
    }

    return this.memoryLogs;
  }

  /**
   * 清除IndexedDB中的日志
   */
  private async clearLogsFromIndexedDB(): Promise<void> {
    try {
      // 由于IndexedDB操作比较复杂，此处仅为示例
      console.warn('IndexedDB清除未完全实现');

      // 此处可以添加IndexedDB实现
      // 例如，打开数据库，清除存储对象等
    } catch (error) {
      console.error('清除IndexedDB审计日志失败:', error);
    }
  }

  /**
   * 加载日志
   */
  private async loadLogs(): Promise<void> {
    try {
      switch (this.options.storage?.type) {
        case 'localStorage':
          this.memoryLogs = this.getLogsFromLocalStorage();
          break;
        case 'indexedDB':
          this.memoryLogs = await this.getLogsFromIndexedDB();
          break;
        case 'custom':
          if (this.options.storage?.customStorage) {
            this.memoryLogs = await this.options.storage.customStorage.load();
          }
          break;
        // 内存存储不需要加载操作
      }
    } catch (error) {
      console.error('加载审计日志失败:', error);
    }
  }

  /**
   * 添加日志到批处理队列
   * @param logEntry 日志条目
   */
  private addToBatchQueue(logEntry: AuditLogEntry): void {
    if (
      !this.options.remoteServer ||
      !this.options.remoteServer.batchConfig?.enabled
    ) {
      return;
    }

    this.batchQueue.push(logEntry);

    // 如果达到批次大小，立即发送
    const batchSize = this.options.remoteServer.batchConfig?.size || 10;
    if (this.batchQueue.length >= batchSize) {
      const batchToSend = [...this.batchQueue];
      this.batchQueue = [];
      this.sendBatchToRemoteServer(batchToSend);
    }
  }

  /**
   * 开始批处理
   */
  private startBatchProcessing(): void {
    if (this.batchTimer !== null) {
      return;
    }

    const interval = this.options.remoteServer?.batchConfig?.interval || 30000;
    this.batchTimer = window.setInterval(() => {
      if (this.batchQueue.length > 0) {
        const batchToSend = [...this.batchQueue];
        this.batchQueue = [];
        this.sendBatchToRemoteServer(batchToSend);
      }
    }, interval);
  }

  /**
   * 立即发送日志到远程服务器
   * @param logEntry 日志条目
   */
  private async sendToRemoteServer(logEntry: AuditLogEntry): Promise<void> {
    if (!this.options.remoteServer) {
      return;
    }

    try {
      await fetch(this.options.remoteServer.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.remoteServer.headers,
        },
        body: JSON.stringify(logEntry),
      });
    } catch (error) {
      console.error('发送审计日志到远程服务器失败:', error);
    }
  }

  /**
   * 发送批量日志到远程服务器
   * @param logs 日志条目数组
   */
  private async sendBatchToRemoteServer(logs: AuditLogEntry[]): Promise<void> {
    if (!this.options.remoteServer || logs.length === 0) {
      return;
    }

    try {
      await fetch(this.options.remoteServer.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.remoteServer.headers,
        },
        body: JSON.stringify(logs),
      });
    } catch (error) {
      console.error('批量发送审计日志到远程服务器失败:', error);
    }
  }

  /**
   * 根据日志级别输出到控制台
   * @param logEntry 日志条目
   */
  private logToConsole(logEntry: AuditLogEntry): void {
    // 根据日志级别决定是否输出
    if (this.options.logLevel === 'minimal' && logEntry.severity === 'info') {
      return;
    }

    // 根据严重性级别选择不同的输出方式
    switch (logEntry.severity) {
      case 'critical':
      case 'error':
        console.error(`[Audit] ${logEntry.eventType}:`, logEntry);
        break;
      case 'warning':
        console.warn(`[Audit] ${logEntry.eventType}:`, logEntry);
        break;
      case 'info':
      default:
        if (this.options.logLevel === 'verbose') {
          console.info(`[Audit] ${logEntry.eventType}:`, logEntry);
        }
        break;
    }
  }

  /**
   * 生成唯一ID
   * @returns 唯一ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * 获取IP地址
   * @returns IP地址
   */
  private getIpAddress(): string {
    // 在浏览器环境中，无法直接获取客户端IP
    // 此处返回空字符串，实际项目中可能需要通过服务器获取
    return '';
  }

  /**
   * 获取地理位置信息
   * @returns 地理位置信息
   */
  private getGeoLocation(): {
    country?: string;
    city?: string;
    longitude?: number;
    latitude?: number;
  } {
    // 在实际项目中，可能需要使用地理位置API或第三方服务
    return {};
  }

  /**
   * 获取设备信息
   * @returns 设备信息
   */
  private getDeviceInfo(): {
    userAgent?: string;
    os?: string;
    browser?: string;
    deviceType?: string;
  } {
    if (typeof navigator === 'undefined') {
      return {};
    }

    const userAgent = navigator.userAgent;

    // 简单解析操作系统
    let os = 'Unknown';
    if (/Windows/.test(userAgent)) {
      os = 'Windows';
    } else if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(userAgent)) {
      os = 'Mac';
    } else if (/iPad|iPhone|iPod/.test(userAgent)) {
      os = 'iOS';
    } else if (/Android/.test(userAgent)) {
      os = 'Android';
    } else if (/Linux/.test(userAgent)) {
      os = 'Linux';
    }

    // 简单解析浏览器
    let browser = 'Unknown';
    if (/Edge/.test(userAgent)) {
      browser = 'Edge';
    } else if (/Chrome/.test(userAgent)) {
      browser = 'Chrome';
    } else if (/Firefox/.test(userAgent)) {
      browser = 'Firefox';
    } else if (/Safari/.test(userAgent)) {
      browser = 'Safari';
    } else if (/MSIE|Trident/.test(userAgent)) {
      browser = 'Internet Explorer';
    }

    // 简单解析设备类型
    let deviceType = 'Desktop';
    if (/Mobi|Android|iPad|iPhone|iPod/.test(userAgent)) {
      deviceType = 'Mobile';
    } else if (/Tablet|iPad/.test(userAgent)) {
      deviceType = 'Tablet';
    }

    return {
      userAgent,
      os,
      browser,
      deviceType,
    };
  }
}
