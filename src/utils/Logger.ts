/**
 * Logger - 日志工具类
 * 提供统一的日志记录功能，支持不同级别的日志
 */

import {
  LogLevel,
  LogLevelString,
  LogLevelStringType,
  logLevelFromString,
} from '../types/debug';

// 日志配置接口
export interface LoggerConfig {
  level?: LogLevel | LogLevelStringType;
  prefix?: string; // 日志前缀
  includeTimestamp?: boolean; // 是否包含时间戳
  maxLogSize?: number; // 最大日志大小
  colorize?: boolean; // 是否着色
  enableConsoleClear?: boolean; // 是否允许清除控制台
  persist?: boolean; // 是否持久化
  logToServer?: boolean; // 是否发送到服务器
  serverUrl?: string; // 服务器地址
  enableConsole?: boolean;
  enableStorage?: boolean;
}

// 全局日志配置
const globalConfig: LoggerConfig = {
  level: LogLevel.INFO,
  includeTimestamp: true,
  maxLogSize: 1000,
  colorize: true,
  enableConsoleClear: false,
  persist: false,
  logToServer: false,
};

// 内存中的日志缓存
const logCache: Array<{
  level: LogLevel;
  message: string;
  module: string;
  timestamp: number;
  data?: any;
}> = [];

/**
 * Logger类 - 提供按模块分组的日志功能
 */
export class Logger {
  private moduleName: string;
  private config: LoggerConfig;
  private logLevel: LogLevel = LogLevel.INFO;
  private rateLimitCache: Map<string, number> = new Map(); // 日志限流缓存

  /**
   * 创建日志记录器
   * @param moduleName 模块名称
   * @param config 日志配置
   */
  constructor(moduleName: string, config: LoggerConfig = {}) {
    this.moduleName = moduleName;
    this.config = {
      level: config.level || LogLevel.INFO,
      enableConsole: config.enableConsole !== false,
      enableStorage: !!config.enableStorage,
      maxLogSize: config.maxLogSize || 1000,
    };

    // 使用新的辅助函数处理字符串日志级别
    if (typeof this.config.level === 'string') {
      this.logLevel = logLevelFromString(this.config.level);
    } else if (typeof this.config.level === 'number') {
      this.logLevel = this.config.level;
    }
  }

  /**
   * 设置全局日志配置
   * @param config 日志配置
   */
  public static setGlobalConfig(config: LoggerConfig): void {
    Object.assign(globalConfig, config);

    // 处理日志级别
    if (typeof config.level === 'string') {
      globalConfig.level = logLevelFromString(config.level);
    }
  }

  /**
   * 获取当前全局日志配置
   * @returns 当前配置
   */
  public static getGlobalConfig(): LoggerConfig {
    return { ...globalConfig };
  }

  /**
   * 清除控制台
   */
  public static clear(): void {
    if (globalConfig.enableConsoleClear && typeof console !== 'undefined') {
      console.clear();
    }
  }

  /**
   * 记录调试级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public debug(message: string, ...data: any[]): void {
    this.log(LogLevel.DEBUG, message, ...data);
  }

  /**
   * 记录信息级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public info(message: string, ...data: any[]): void {
    this.log(LogLevel.INFO, message, ...data);
  }

  /**
   * 记录警告级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public warn(message: string, ...data: any[]): void {
    this.log(LogLevel.WARN, message, ...data);
  }

  /**
   * 记录错误级别日志
   * @param message 日志消息
   * @param data 附加数据
   */
  public error(message: string, ...data: any[]): void {
    this.log(LogLevel.ERROR, message, ...data);
  }

  /**
   * 记录日志
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据
   */
  private log(level: LogLevel, message: string, ...data: any[]): void {
    // 检查日志级别
    const effectiveLevel = this.config.level ?? globalConfig.level;
    const logLevel =
      typeof effectiveLevel === 'string'
        ? logLevelFromString(effectiveLevel)
        : effectiveLevel!;

    if (level < logLevel) {
      return;
    }

    // 格式化消息
    const timestamp = new Date();
    const prefix = this.getPrefix(level, timestamp);
    const formattedMessage = `${prefix} ${message}`;

    // 记录到缓存
    if (this.shouldPersist()) {
      this.addToCache(level, message, data);
    }

    // 输出到控制台
    if (typeof console !== 'undefined') {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage, ...data);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage, ...data);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, ...data);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage, ...data);
          break;
      }
    }

    // 发送到服务器
    if (this.shouldLogToServer()) {
      this.sendToServer(level, message, data);
    }
  }

  /**
   * 获取日志前缀
   * @param level 日志级别
   * @param timestamp 时间戳
   * @returns 格式化的前缀
   */
  private getPrefix(level: LogLevel, timestamp: Date): string {
    const parts: string[] = [];

    // 添加时间戳
    if (this.config.includeTimestamp ?? globalConfig.includeTimestamp) {
      parts.push(`[${timestamp.toISOString()}]`);
    }

    // 添加日志级别
    const levelStr = LogLevelString[level];
    if (this.config.colorize ?? globalConfig.colorize) {
      parts.push(this.colorizeLevel(levelStr, level));
    } else {
      parts.push(`[${levelStr}]`);
    }

    // 添加模块名
    parts.push(`[${this.moduleName}]`);

    return parts.join(' ');
  }

  /**
   * 给日志级别添加颜色
   * @param levelStr 级别字符串
   * @param level 日志级别
   * @returns 带颜色的字符串
   */
  private colorizeLevel(levelStr: string, level: LogLevel): string {
    if (typeof window === 'undefined') {
      // 服务端环境（Node.js）
      switch (level) {
        case LogLevel.DEBUG:
          return `\x1b[34m[${levelStr}]\x1b[0m`; // 蓝色
        case LogLevel.INFO:
          return `\x1b[32m[${levelStr}]\x1b[0m`; // 绿色
        case LogLevel.WARN:
          return `\x1b[33m[${levelStr}]\x1b[0m`; // 黄色
        case LogLevel.ERROR:
          return `\x1b[31m[${levelStr}]\x1b[0m`; // 红色
        default:
          return `[${levelStr}]`;
      }
    } else {
      // 浏览器环境
      // 在浏览器中，console 本身已经为不同级别提供了颜色
      return `[${levelStr}]`;
    }
  }

  /**
   * 是否应该持久化日志
   * @returns 是否持久化
   */
  private shouldPersist(): boolean {
    return this.config.persist ?? globalConfig.persist ?? false;
  }

  /**
   * 是否应该发送日志到服务器
   * @returns 是否发送
   */
  private shouldLogToServer(): boolean {
    return this.config.logToServer ?? globalConfig.logToServer ?? false;
  }

  /**
   * 添加日志到缓存
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据
   */
  private addToCache(level: LogLevel, message: string, data: any[]): void {
    logCache.push({
      level,
      message,
      module: this.moduleName,
      timestamp: Date.now(),
      data: data.length > 0 ? JSON.parse(JSON.stringify(data)) : undefined,
    });

    // 控制缓存大小
    const maxSize = this.config.maxLogSize ?? globalConfig.maxLogSize ?? 1000;
    if (logCache.length > maxSize) {
      // 移除最老的日志
      logCache.shift();
    }
  }

  /**
   * 发送日志到服务器
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据
   */
  private sendToServer(level: LogLevel, message: string, data: any[]): void {
    // 优化：使用批处理和重试机制发送日志
    const serverUrl = this.config.serverUrl ?? globalConfig.serverUrl;
    if (!serverUrl) return;

    const logData = {
      level,
      message,
      module: this.moduleName,
      timestamp: Date.now(),
      data: data.length > 0 ? data : undefined,
    };

    // 实际发送逻辑（可以使用批处理优化）
    try {
      if (typeof fetch !== 'undefined') {
        fetch(serverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(logData),
        }).catch(error => {
          console.error('发送日志到服务器失败:', error);
        });
      }
    } catch (error) {
      console.error('发送日志到服务器出错:', error);
    }
  }

  /**
   * 获取日志缓存
   * @returns 日志缓存副本
   */
  public static getLogCache(): any[] {
    return [...logCache];
  }

  /**
   * 清除日志缓存
   */
  public static clearLogCache(): void {
    logCache.length = 0;
  }

  /**
   * 导出日志
   * @returns 格式化的日志字符串
   */
  public static exportLogs(): string {
    return JSON.stringify(logCache, null, 2);
  }

  /**
   * 限制日志频率
   * @param key 限制键
   * @param interval 最小间隔(ms)
   * @returns 是否应该记录
   */
  public rateLimit(key: string, interval = 1000): boolean {
    const now = Date.now();
    const lastTime = this.rateLimitCache.get(key) || 0;

    if (now - lastTime < interval) {
      return false;
    }

    this.rateLimitCache.set(key, now);
    return true;
  }

  /**
   * 获取当前日志级别
   * @returns 日志级别
   */
  getLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * 设置日志级别
   * @param level 日志级别
   */
  setLevel(level: LogLevel | LogLevelStringType): void {
    if (typeof level === 'string') {
      this.logLevel = logLevelFromString(level);
    } else {
      this.logLevel = level;
    }
  }
}

export default Logger;
