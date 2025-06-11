/**
 * 抽象安全插件基类
 * 为所有安全级别插件提供通用功能和接口定义
 */

import { EventBus } from '../../core/EventBus';
import UploaderCore from '../../core/UploaderCore';
import { ISecurityPlugin } from '../../types/plugin';
import { Environment, SecurityLevel } from '../../types';
import SecurityError from '../../utils/SecurityError';
import { ErrorContextData, SecurityErrorSubType } from '../../types';

/**
 * 安全插件基础选项
 */
export interface AbstractSecurityPluginOptions {
  /**
   * 允许的文件MIME类型
   */
  allowedMimeTypes?: string[];

  /**
   * 最大文件大小 (字节)
   */
  maxFileSize?: number;

  /**
   * 是否启用严格文件类型检查
   */
  strictTypeChecking?: boolean;

  /**
   * 是否验证文件内容
   */
  validateFileContent?: boolean;

  /**
   * 安全级别
   */
  securityLevel?: SecurityLevel;

  /**
   * 自定义验证器
   */
  customValidators?: Array<(file: File | Blob) => Promise<boolean>>;
}

/**
 * 安全日志记录项
 */
interface SecurityLogEntry {
  level: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * 抽象安全插件基类
 */
export abstract class AbstractSecurityPlugin implements ISecurityPlugin {
  /**
   * 插件名称
   */
  public abstract readonly name: string;

  /**
   * 插件版本
   */
  public abstract readonly version: string;

  /**
   * 安全级别
   */
  protected _securityLevel: SecurityLevel;

  /**
   * 事件总线
   */
  protected _eventBus?: EventBus;

  /**
   * 上传器实例
   */
  protected _uploader?: UploaderCore;

  /**
   * 运行环境
   */
  protected _environment?: Environment;

  /**
   * 已验证的文件缓存
   */
  protected _validatedFiles: Map<string, boolean> = new Map();

  /**
   * 插件选项
   */
  protected _options: AbstractSecurityPluginOptions;

  /**
   * 安全相关日志
   */
  protected _securityLogs: SecurityLogEntry[] = [];

  /**
   * 日志最大数量
   */
  protected _maxLogEntries = 100;

  /**
   * 构造函数
   * @param options 安全插件选项
   */
  constructor(options: AbstractSecurityPluginOptions = {}) {
    this._options = {
      allowedMimeTypes: [],
      maxFileSize: 100 * 1024 * 1024, // 默认100MB
      strictTypeChecking: false,
      validateFileContent: true,
      ...options,
    };

    this._securityLevel = options.securityLevel || SecurityLevel.BASIC;
  }

  /**
   * 安装插件
   * @param uploader 上传器实例
   */
  public install(uploader: UploaderCore): void {
    this._uploader = uploader;
    this._eventBus = uploader.getEventBus();
    this._environment = uploader.getEnvironment();

    this.registerEventHandlers();

    this.logSecurityEvent('SecurityPlugin installed', {
      level: this._securityLevel,
      options: { ...this._options },
    });
  }

  /**
   * 注册事件处理程序
   * 子类应重写此方法以注册特定级别的事件处理程序
   */
  protected abstract registerEventHandlers(): void;

  /**
   * 验证文件安全性
   * @param file 文件对象
   */
  public async validateSecurity(
    file: File | Blob
  ): Promise<{ valid: boolean; issues: any[] }> {
    // 基本实现，子类应重写此方法
    const issues: any[] = [];

    // 文件大小检查
    if (this._options.maxFileSize && file.size > this._options.maxFileSize) {
      issues.push({
        type: 'file_size_exceeded',
        message: `文件大小超过限制: ${file.size} > ${this._options.maxFileSize}`,
        severity: 'error',
      });
    }

    const valid = issues.length === 0;

    // 缓存验证结果
    const fileId = this.getFileIdentifier(file);
    this._validatedFiles.set(fileId, valid);

    return { valid, issues };
  }

  /**
   * 获取文件唯一标识符
   * @param file 文件对象
   */
  protected getFileIdentifier(file: File | Blob): string {
    if ('name' in file) {
      return `${file.name}_${file.size}_${file.type}`;
    }
    return `blob_${file.size}_${file.type}_${Date.now()}`;
  }

  /**
   * 记录安全事件
   * @param level 日志级别
   * @param message 日志消息
   * @param data 相关数据
   * @protected
   */
  protected logSecurityEvent(
    level: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const logEntry: SecurityLogEntry = {
      level,
      message,
      timestamp: Date.now(),
      data,
    };

    this._securityLogs.push(logEntry);

    // 如果日志数量超过限制，删除最早的日志
    if (this._securityLogs.length > this._maxLogEntries) {
      this._securityLogs.shift();
    }

    // 发送安全事件
    if (this._eventBus) {
      this._eventBus.emit('security:event', {
        plugin: this.name,
        level: this._securityLevel,
        message,
        data,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 创建安全错误
   * @param code 错误代码
   * @param message 错误消息
   * @param context 错误上下文
   */
  protected createSecurityError(
    code: SecurityErrorSubType,
    message: string,
    context?: ErrorContextData
  ): SecurityError {
    return new SecurityError(message, code, {
      ...context,
      securityLevel: this._securityLevel,
      plugin: this.name,
    });
  }

  /**
   * 获取安全级别
   */
  public getSecurityLevel(): SecurityLevel {
    return this._securityLevel;
  }

  /**
   * 设置安全级别
   * @param level 安全级别
   */
  public setSecurityLevel(level: SecurityLevel): void {
    this._securityLevel = level;
    this.logSecurityEvent('Security level changed', { level });
  }

  /**
   * 卸载插件
   */
  public uninstall?(): void {
    // 清理资源
    this._validatedFiles.clear();
    this.logSecurityEvent('SecurityPlugin uninstalled', {});
  }
}
