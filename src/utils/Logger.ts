/**
 * Logger - 日志工具类
 * 提供统一的日志记录功能，支持不同级别的日志
 */

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

// 日志配置接口
export interface LoggerConfig {
  level?: LogLevel; // 日志级别
  prefix?: string; // 日志前缀
  includeTimestamp?: boolean; // 是否包含时间戳
  maxLogSize?: number; // 最大日志大小
  colorize?: boolean; // 是否着色
  enableConsoleClear?: boolean; // 是否允许清除控制台
  persist?: boolean; // 是否持久化
  logToServer?: boolean; // 是否发送到服务器
  serverUrl?: string; // 服务器地址
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

  /**
   * 构造函数
   * @param moduleName 模块名称
   * @param config 日志配置
   */
  constructor(moduleName: string, config: LoggerConfig = {}) {
    this.moduleName = moduleName;
    this.config = { ...globalConfig, ...config };
  }

  /**
   * 设置全局日志配置
   * @param config 日志配置
   */
  public static setGlobalConfig(config: LoggerConfig): void {
    Object.assign(globalConfig, config);
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
    if (level < (this.config.level ?? globalConfig.level!)) {
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
    const levelStr = LogLevel[level];
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
    return (
      (this.config.logToServer ?? globalConfig.logToServer ?? false) &&
      !!(this.config.serverUrl ?? globalConfig.serverUrl)
    );
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
      data: data.length > 0 ? data : undefined,
    });

    // 限制缓存大小
    const maxSize = this.config.maxLogSize ?? globalConfig.maxLogSize ?? 1000;
    if (logCache.length > maxSize) {
      logCache.splice(0, logCache.length - maxSize);
    }
  }

  /**
   * 发送日志到服务器
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据
   */
  private sendToServer(level: LogLevel, message: string, data: any[]): void {
    const serverUrl = this.config.serverUrl ?? globalConfig.serverUrl;
    if (!serverUrl) return;

    try {
      const payload = {
        level: LogLevel[level],
        message,
        module: this.moduleName,
        timestamp: new Date().toISOString(),
        data: data.length > 0 ? data : undefined,
      };

      // 使用 fetch API 或 XMLHttpRequest 发送日志
      if (typeof fetch !== 'undefined') {
        fetch(serverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          // 使用 keepalive 以确保请求在页面关闭后仍然完成
          keepalive: true,
        }).catch(() => {
          // 忽略错误，避免日志系统本身产生更多错误
        });
      }
    } catch (error) {
      // 忽略错误，避免日志系统本身产生更多错误
    }
  }

  /**
   * 获取缓存的日志
   * @returns 日志缓存
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
   * 导出日志到JSON字符串
   * @returns JSON格式的日志
   */
  public static exportLogs(): string {
    return JSON.stringify(logCache);
  }
}

export default Logger;
