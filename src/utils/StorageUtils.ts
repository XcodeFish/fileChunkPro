/**
 * StorageUtils - 存储工具类
 * 提供多种存储方式的统一接口实现
 */

import { UploadError } from '../core/ErrorCenter';
import { Environment, UploadErrorType } from '../types';

import EnvUtils from './EnvUtils';

/**
 * 存储接口定义
 * 提供统一的数据存取方法
 */
export interface IStorage {
  /**
   * 获取存储项
   * @param key 键
   * @returns 值（反序列化后的对象）或null（不存在时）
   */
  getItem: <T = any>(key: string) => Promise<T | null>;

  /**
   * 设置存储项
   * @param key 键
   * @param value 值（会被序列化为JSON存储）
   */
  setItem: <T = any>(key: string, value: T) => Promise<void>;

  /**
   * 移除存储项
   * @param key 键
   */
  removeItem: (key: string) => Promise<void>;

  /**
   * 清除所有存储项
   */
  clear: () => Promise<void>;

  /**
   * 获取所有键
   * @returns 键列表
   */
  keys: () => Promise<string[]>;
}

/**
 * LocalStorage适配器
 * 封装浏览器localStorage API
 */
export class LocalStorageAdapter implements IStorage {
  private prefix: string;

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix || 'fileChunkPro_';
  }

  /**
   * 获取存储项
   * @param key 键
   */
  async getItem<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = this.prefix + key;
      const value = localStorage.getItem(fullKey);
      if (value === null) return null;
      return JSON.parse(value) as T;
    } catch (error: any) {
      console.warn(
        `[StorageUtils] 从localStorage获取数据失败: ${error.message}`
      );
      return null;
    }
  }

  /**
   * 设置存储项
   * @param key 键
   * @param value 值
   */
  async setItem<T = any>(key: string, value: T): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      const stringValue = JSON.stringify(value);
      localStorage.setItem(fullKey, stringValue);
    } catch (error: any) {
      if (error.name === 'QuotaExceededError') {
        throw new UploadError(
          UploadErrorType.QUOTA_EXCEEDED_ERROR,
          '存储空间不足，无法保存数据',
          error
        );
      }
      throw new UploadError(
        UploadErrorType.UNKNOWN_ERROR,
        `保存数据到localStorage失败: ${error.message}`,
        error
      );
    }
  }

  /**
   * 移除存储项
   * @param key 键
   */
  async removeItem(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      localStorage.removeItem(fullKey);
    } catch (error: any) {
      console.warn(
        `[StorageUtils] 从localStorage移除数据失败: ${error.message}`
      );
    }
  }

  /**
   * 清除所有本前缀的存储项
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.keys();
      for (const key of keys) {
        await this.removeItem(key);
      }
    } catch (error: any) {
      console.warn(`[StorageUtils] 清除localStorage数据失败: ${error.message}`);
    }
  }

  /**
   * 获取所有键
   * @returns 键列表（不包含前缀）
   */
  async keys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keys.push(key.substring(this.prefix.length));
        }
      }
      return keys;
    } catch (error: any) {
      console.warn(
        `[StorageUtils] 获取localStorage键列表失败: ${error.message}`
      );
      return [];
    }
  }
}

/**
 * SessionStorage适配器
 * 封装浏览器sessionStorage API
 */
export class SessionStorageAdapter implements IStorage {
  private prefix: string;

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix || 'fileChunkPro_';
  }

  /**
   * 获取存储项
   * @param key 键
   */
  async getItem<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = this.prefix + key;
      const value = sessionStorage.getItem(fullKey);
      if (value === null) return null;
      return JSON.parse(value) as T;
    } catch (error: any) {
      console.warn(
        `[StorageUtils] 从sessionStorage获取数据失败: ${error.message}`
      );
      return null;
    }
  }

  /**
   * 设置存储项
   * @param key 键
   * @param value 值
   */
  async setItem<T = any>(key: string, value: T): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      const stringValue = JSON.stringify(value);
      sessionStorage.setItem(fullKey, stringValue);
    } catch (error: any) {
      if (error.name === 'QuotaExceededError') {
        throw new UploadError(
          UploadErrorType.QUOTA_EXCEEDED_ERROR,
          '存储空间不足，无法保存数据',
          error
        );
      }
      throw new UploadError(
        UploadErrorType.UNKNOWN_ERROR,
        `保存数据到sessionStorage失败: ${error.message}`,
        error
      );
    }
  }

  /**
   * 移除存储项
   * @param key 键
   */
  async removeItem(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      sessionStorage.removeItem(fullKey);
    } catch (error: any) {
      console.warn(
        `[StorageUtils] 从sessionStorage移除数据失败: ${error.message}`
      );
    }
  }

  /**
   * 清除所有本前缀的存储项
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.keys();
      for (const key of keys) {
        await this.removeItem(key);
      }
    } catch (error: any) {
      console.warn(
        `[StorageUtils] 清除sessionStorage数据失败: ${error.message}`
      );
    }
  }

  /**
   * 获取所有键
   * @returns 键列表（不包含前缀）
   */
  async keys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keys.push(key.substring(this.prefix.length));
        }
      }
      return keys;
    } catch (error: any) {
      console.warn(
        `[StorageUtils] 获取sessionStorage键列表失败: ${error.message}`
      );
      return [];
    }
  }
}

/**
 * 内存存储适配器
 * 使用JS对象实现的内存存储，用于不支持localStorage/sessionStorage的环境
 */
export class MemoryStorageAdapter implements IStorage {
  private storage: Map<string, string>;
  private prefix: string;

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options: { prefix?: string } = {}) {
    this.storage = new Map<string, string>();
    this.prefix = options.prefix || 'fileChunkPro_';
  }

  /**
   * 获取存储项
   * @param key 键
   */
  async getItem<T = any>(key: string): Promise<T | null> {
    const fullKey = this.prefix + key;
    const value = this.storage.get(fullKey);
    if (value === undefined) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * 设置存储项
   * @param key 键
   * @param value 值
   */
  async setItem<T = any>(key: string, value: T): Promise<void> {
    const fullKey = this.prefix + key;
    const stringValue = JSON.stringify(value);
    this.storage.set(fullKey, stringValue);
  }

  /**
   * 移除存储项
   * @param key 键
   */
  async removeItem(key: string): Promise<void> {
    const fullKey = this.prefix + key;
    this.storage.delete(fullKey);
  }

  /**
   * 清除所有存储项
   */
  async clear(): Promise<void> {
    this.storage.clear();
  }

  /**
   * 获取所有键
   * @returns 键列表（不包含前缀）
   */
  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (const key of this.storage.keys()) {
      if (key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }
}

/**
 * StorageUtils 存储工具类
 * 根据运行环境提供适合的存储实现
 */
export class StorageUtils {
  /**
   * 创建适合当前环境的存储实例
   * @param type 存储类型，可选 'local'|'session'|'memory'|'auto'
   * @param options 配置选项
   * @returns 存储实例
   */
  static createStorage(
    type: 'local' | 'session' | 'memory' | 'auto' = 'auto',
    options: { prefix?: string } = {}
  ): IStorage {
    const env = EnvUtils.detectEnvironment();

    // 优先使用指定的存储类型
    if (type !== 'auto') {
      switch (type) {
        case 'local':
          if (this.isLocalStorageAvailable()) {
            return new LocalStorageAdapter(options);
          }
          console.warn('[StorageUtils] localStorage不可用，回退到内存存储');
          return new MemoryStorageAdapter(options);

        case 'session':
          if (this.isSessionStorageAvailable()) {
            return new SessionStorageAdapter(options);
          }
          console.warn('[StorageUtils] sessionStorage不可用，回退到内存存储');
          return new MemoryStorageAdapter(options);

        case 'memory':
          return new MemoryStorageAdapter(options);
      }
    }

    // 自动选择最适合的存储类型
    if (env === Environment.Browser) {
      if (this.isLocalStorageAvailable()) {
        return new LocalStorageAdapter(options);
      } else if (this.isSessionStorageAvailable()) {
        return new SessionStorageAdapter(options);
      }
    }

    // 默认回退到内存存储
    return new MemoryStorageAdapter(options);
  }

  /**
   * 检查localStorage是否可用
   * @returns 是否可用
   */
  static isLocalStorageAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      const result = localStorage.getItem(testKey) === testKey;
      localStorage.removeItem(testKey);
      return result;
    } catch (e) {
      return false;
    }
  }

  /**
   * 检查sessionStorage是否可用
   * @returns 是否可用
   */
  static isSessionStorageAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      sessionStorage.setItem(testKey, testKey);
      const result = sessionStorage.getItem(testKey) === testKey;
      sessionStorage.removeItem(testKey);
      return result;
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取存储示例的可用大小估计
   * @param type 存储类型
   * @returns 估计的可用大小（字节）
   */
  static getStorageSizeEstimate(type: 'local' | 'session'): number {
    try {
      // 测试增量大小
      const incrementSize = 1024 * 10; // 10KB
      const testPrefix = 'ST';
      let totalSize = 0;
      let i = 0;
      const storage = type === 'local' ? localStorage : sessionStorage;

      // 清理可能存在的旧测试数据
      for (let j = 0; j < storage.length; j++) {
        const key = storage.key(j);
        if (key && key.startsWith(testPrefix)) {
          storage.removeItem(key);
        }
      }

      // 逐步增加数据直到异常
      try {
        for (i = 0; i < 1000; i++) {
          // 限制最大测试次数
          let testString = '';
          for (let j = 0; j < incrementSize; j++) {
            testString += 'a';
          }
          storage.setItem(`${testPrefix}${i}`, testString);
          totalSize += incrementSize;
        }
      } catch (e) {
        // 达到限制，清理测试数据
      }

      // 清理测试数据
      for (let j = 0; j < i; j++) {
        storage.removeItem(`${testPrefix}${j}`);
      }

      return totalSize;
    } catch (e) {
      // 如果无法执行测试，返回保守估计
      return 5 * 1024 * 1024; // 5MB
    }
  }
}

export default StorageUtils;
