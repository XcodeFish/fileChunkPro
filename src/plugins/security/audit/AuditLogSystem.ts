/**
 * 审计日志系统
 * 用于记录和管理安全相关的操作日志
 */

import { Logger } from '../../../utils/Logger';
import { EventBus } from '../../../core/EventBus';

/**
 * 审计日志级别
 */
export enum AuditLogLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * 审计日志存储类型
 */
export enum AuditLogStorageType {
  LOCAL = 'local',
  REMOTE = 'remote',
  BOTH = 'both',
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /**
   * 日志ID
   */
  id: string;

  /**
   * 时间戳
   */
  timestamp: number;

  /**
   * 操作类型
   */
  action: string;

  /**
   * 目标对象
   */
  target?: string;

  /**
   * 用户标识
   */
  userId?: string;

  /**
   * 日志级别
   */
  level: AuditLogLevel;

  /**
   * 操作状态
   */
  status: 'success' | 'failure';

  /**
   * 详细信息
   */
  details?: Record<string, any>;

  /**
   * 用户信息
   */
  userInfo?: Record<string, any>;

  /**
   * 环境信息
   */
  environmentInfo?: Record<string, any>;

  /**
   * 地理位置信息
   */
  geoLocation?: {
    latitude?: number;
    longitude?: number;
    country?: string;
    city?: string;
    ip?: string;
  };
}

/**
 * 审计日志系统选项
 */
export interface AuditLogSystemOptions {
  /**
   * 审计日志级别
   */
  level?: AuditLogLevel;

  /**
   * 审计日志存储位置
   */
  storageType?: AuditLogStorageType;

  /**
   * 远程审计日志URL
   */
  remoteUrl?: string;

  /**
   * 是否包含用户信息
   */
  includeUserInfo?: boolean;

  /**
   * 是否包含环境信息
   */
  includeEnvironmentInfo?: boolean;

  /**
   * 是否包含地理位置
   */
  includeGeoLocation?: boolean;

  /**
   * 最大本地存储日志数量
   */
  maxLocalLogEntries?: number;

  /**
   * 批量上传大小
   */
  batchSize?: number;

  /**
   * 是否定期自动上传
   */
  autoUpload?: boolean;

  /**
   * 自动上传间隔（毫秒）
   */
  autoUploadInterval?: number;
}

/**
 * 审计日志系统
 */
export default class AuditLogSystem {
  /**
   * 默认选项
   */
  private static DEFAULT_OPTIONS: AuditLogSystemOptions = {
    level: AuditLogLevel.INFO,
    storageType: AuditLogStorageType.LOCAL,
    includeUserInfo: true,
    includeEnvironmentInfo: true,
    includeGeoLocation: false,
    maxLocalLogEntries: 1000,
    batchSize: 50,
    autoUpload: true,
    autoUploadInterval: 60000, // 1分钟
  };

  /**
   * 选项
   */
  private _options: AuditLogSystemOptions;

  /**
   * 本地日志条目
   */
  private _localLogEntries: AuditLogEntry[] = [];

  /**
   * 待上传日志条目
   */
  private _pendingUploadEntries: AuditLogEntry[] = [];

  /**
   * 日志记录器
   */
  private _logger: Logger;

  /**
   * 事件总线
   */
  private _eventBus?: EventBus;

  /**
   * 自动上传定时器
   */
  private _autoUploadTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * 构造函数
   * @param options 选项
   */
  constructor(options: AuditLogSystemOptions = {}) {
    this._options = { ...AuditLogSystem.DEFAULT_OPTIONS, ...options };
    this._logger = new Logger('AuditLogSystem');

    // 初始化
    this._initialize();
  }

  /**
   * 初始化审计日志系统
   */
  private _initialize(): void {
    // 从本地存储加载日志
    this._loadFromLocalStorage();

    // 设置自动上传
    if (
      this._options.autoUpload &&
      this._options.storageType !== AuditLogStorageType.LOCAL
    ) {
      this._setupAutoUpload();
    }
  }

  /**
   * 设置事件总线
   * @param eventBus 事件总线实例
   */
  public setEventBus(eventBus: EventBus): void {
    this._eventBus = eventBus;
  }

  /**
   * 记录审计日志
   * @param action 操作类型
   * @param level 日志级别
   * @param status 操作状态
   * @param details 详细信息
   * @param target 目标对象
   * @returns 日志条目
   */
  public log(
    action: string,
    level: AuditLogLevel = AuditLogLevel.INFO,
    status: 'success' | 'failure' = 'success',
    details?: Record<string, any>,
    target?: string
  ): AuditLogEntry {
    // 检查日志级别
    if (this._isLevelEnabled(level)) {
      // 创建日志条目
      const entry = this._createLogEntry(
        action,
        level,
        status,
        details,
        target
      );

      // 存储日志
      this._storeLogEntry(entry);

      // 触发事件
      if (this._eventBus) {
        this._eventBus.emit('security:auditLog', entry);
      }

      return entry;
    }

    // 创建空日志条目（不记录）
    return this._createLogEntry(action, level, status, details, target);
  }

  /**
   * 创建日志条目
   * @param action 操作类型
   * @param level 日志级别
   * @param status 操作状态
   * @param details 详细信息
   * @param target 目标对象
   * @returns 日志条目
   */
  private _createLogEntry(
    action: string,
    level: AuditLogLevel,
    status: 'success' | 'failure',
    details?: Record<string, any>,
    target?: string
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this._generateId(),
      timestamp: Date.now(),
      action,
      target,
      level,
      status,
      details,
    };

    // 添加用户信息
    if (this._options.includeUserInfo) {
      entry.userInfo = this._getUserInfo();
      entry.userId = entry.userInfo?.id;
    }

    // 添加环境信息
    if (this._options.includeEnvironmentInfo) {
      entry.environmentInfo = this._getEnvironmentInfo();
    }

    // 添加地理位置信息
    if (this._options.includeGeoLocation) {
      entry.geoLocation = this._getGeoLocation();
    }

    return entry;
  }

  /**
   * 存储日志条目
   * @param entry 日志条目
   */
  private _storeLogEntry(entry: AuditLogEntry): void {
    const { storageType } = this._options;

    // 本地存储
    if (
      storageType === AuditLogStorageType.LOCAL ||
      storageType === AuditLogStorageType.BOTH
    ) {
      this._storeLocally(entry);
    }

    // 远程存储
    if (
      storageType === AuditLogStorageType.REMOTE ||
      storageType === AuditLogStorageType.BOTH
    ) {
      this._pendingUploadEntries.push(entry);

      // 如果达到批量大小，立即上传
      if (
        this._pendingUploadEntries.length >= (this._options.batchSize || 50)
      ) {
        this._uploadPendingEntries();
      }
    }
  }

  /**
   * 本地存储日志条目
   * @param entry 日志条目
   */
  private _storeLocally(entry: AuditLogEntry): void {
    // 添加到内存缓存
    this._localLogEntries.push(entry);

    // 限制最大条目数
    const maxEntries = this._options.maxLocalLogEntries || 1000;
    if (this._localLogEntries.length > maxEntries) {
      this._localLogEntries = this._localLogEntries.slice(-maxEntries);
    }

    // 保存到localStorage
    this._saveToLocalStorage();
  }

  /**
   * 上传待处理的日志条目
   */
  private async _uploadPendingEntries(): Promise<void> {
    if (this._pendingUploadEntries.length === 0) {
      return;
    }

    const entriesToUpload = [...this._pendingUploadEntries];
    this._pendingUploadEntries = [];

    try {
      await this._uploadToRemote(entriesToUpload);
      this._logger.info(`成功上传 ${entriesToUpload.length} 条审计日志`);
    } catch (error) {
      this._logger.error('上传审计日志失败', error);
      // 失败时放回队列
      this._pendingUploadEntries = [
        ...entriesToUpload,
        ...this._pendingUploadEntries,
      ];
    }
  }

  /**
   * 上传日志到远程服务器
   * @param entries 日志条目
   */
  private async _uploadToRemote(entries: AuditLogEntry[]): Promise<void> {
    if (!this._options.remoteUrl) {
      this._logger.warn('未配置远程审计日志URL');
      return;
    }

    try {
      const response = await fetch(this._options.remoteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entries),
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this._logger.error('上传审计日志失败', error);
      throw error;
    }
  }

  /**
   * 保存日志到本地存储
   */
  private _saveToLocalStorage(): void {
    try {
      localStorage.setItem('auditLogs', JSON.stringify(this._localLogEntries));
    } catch (error) {
      this._logger.error('保存审计日志到本地存储失败', error);
    }
  }

  /**
   * 从本地存储加载日志
   */
  private _loadFromLocalStorage(): void {
    try {
      const storedLogs = localStorage.getItem('auditLogs');
      if (storedLogs) {
        this._localLogEntries = JSON.parse(storedLogs);
      }
    } catch (error) {
      this._logger.error('从本地存储加载审计日志失败', error);
    }
  }

  /**
   * 设置自动上传
   */
  private _setupAutoUpload(): void {
    // 清除现有定时器
    if (this._autoUploadTimer) {
      clearInterval(this._autoUploadTimer);
    }

    // 设置新定时器
    const interval = this._options.autoUploadInterval || 60000;
    this._autoUploadTimer = setInterval(() => {
      this._uploadPendingEntries();
    }, interval);
  }

  /**
   * 检查日志级别是否启用
   * @param level 日志级别
   * @returns 是否启用
   */
  private _isLevelEnabled(level: AuditLogLevel): boolean {
    const levels: Record<AuditLogLevel, number> = {
      [AuditLogLevel.INFO]: 0,
      [AuditLogLevel.WARNING]: 1,
      [AuditLogLevel.ERROR]: 2,
      [AuditLogLevel.CRITICAL]: 3,
    };

    const configLevel = this._options.level || AuditLogLevel.INFO;
    return levels[level] >= levels[configLevel];
  }

  /**
   * 生成唯一ID
   * @returns 唯一ID
   */
  private _generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * 获取用户信息
   * @returns 用户信息
   */
  private _getUserInfo(): Record<string, any> {
    // 实际项目中，应从认证系统获取
    return {
      id: 'anonymous',
      role: 'guest',
    };
  }

  /**
   * 获取环境信息
   * @returns 环境信息
   */
  private _getEnvironmentInfo(): Record<string, any> {
    const env: Record<string, any> = {
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      platform:
        typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      timestamp: Date.now(),
    };

    if (typeof window !== 'undefined') {
      env.screenSize = `${window.screen.width}x${window.screen.height}`;
      env.language = navigator.language;
    }

    return env;
  }

  /**
   * 获取地理位置信息
   * @returns 地理位置信息
   */
  private _getGeoLocation(): AuditLogEntry['geoLocation'] {
    // 实际项目中应当使用地理位置API或IP地理位置服务
    return {};
  }

  /**
   * 获取所有本地日志
   * @returns 日志条目数组
   */
  public getLocalLogs(): AuditLogEntry[] {
    return [...this._localLogEntries];
  }

  /**
   * 清除本地日志
   */
  public clearLocalLogs(): void {
    this._localLogEntries = [];
    this._saveToLocalStorage();
  }

  /**
   * 手动上传所有待处理日志
   */
  public async uploadPendingLogs(): Promise<void> {
    await this._uploadPendingEntries();
  }

  /**
   * 更新选项
   * @param options 新选项
   */
  public updateOptions(options: Partial<AuditLogSystemOptions>): void {
    this._options = { ...this._options, ...options };

    // 如果更新了自动上传设置，需要重新设置
    if (
      options.autoUpload !== undefined ||
      options.autoUploadInterval !== undefined ||
      options.storageType !== undefined
    ) {
      if (
        this._options.autoUpload &&
        this._options.storageType !== AuditLogStorageType.LOCAL
      ) {
        this._setupAutoUpload();
      } else if (this._autoUploadTimer) {
        clearInterval(this._autoUploadTimer);
        this._autoUploadTimer = null;
      }
    }
  }

  /**
   * 销毁实例
   */
  public destroy(): void {
    if (this._autoUploadTimer) {
      clearInterval(this._autoUploadTimer);
      this._autoUploadTimer = null;
    }
  }
}
