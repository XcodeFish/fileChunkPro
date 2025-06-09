/**
 * BrowserStorage - 浏览器存储适配器
 * 实现浏览器环境下的本地存储功能
 */

import { UploadError } from '../../core/ErrorCenter';
import { UploadErrorType } from '../../types';
import { IStorage } from '../interfaces';

/**
 * 浏览器存储适配器配置选项
 */
export interface BrowserStorageOptions {
  storageType?: 'localStorage' | 'sessionStorage' | 'indexedDB';
  keyPrefix?: string;
  dbName?: string; // 仅用于indexedDB
  storeName?: string; // 仅用于indexedDB
}

/**
 * 浏览器本地存储适配器
 * 支持 localStorage、sessionStorage 和 indexedDB
 */
export class BrowserStorage implements IStorage {
  private storageType: 'localStorage' | 'sessionStorage' | 'indexedDB';
  private keyPrefix: string;
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;
  private dbInitPromise: Promise<void> | null = null;

  /**
   * 创建浏览器存储适配器实例
   * @param options 配置选项
   */
  constructor(options: BrowserStorageOptions = {}) {
    this.storageType = options.storageType || 'localStorage';
    this.keyPrefix = options.keyPrefix || 'fileChunkPro_';
    this.dbName = options.dbName || 'fileChunkProUploadDB';
    this.storeName = options.storeName || 'uploadStates';

    // 如果使用IndexedDB，初始化数据库
    if (this.storageType === 'indexedDB') {
      this.dbInitPromise = this.initIndexedDB();
    }
  }

  /**
   * 初始化IndexedDB
   * @private
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('浏览器不支持IndexedDB'));
        return;
      }

      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error('无法打开IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * 确保IndexedDB已初始化
   * @private
   */
  private async ensureDBInitialized(): Promise<void> {
    if (this.storageType === 'indexedDB' && this.dbInitPromise) {
      await this.dbInitPromise;
      if (!this.db) {
        throw new UploadError(
          UploadErrorType.STORAGE_ERROR,
          'IndexedDB未初始化'
        );
      }
    }
  }

  /**
   * 获取格式化的键名
   * @param key 原始键名
   * @private
   */
  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * 存储数据
   * @param key 键名
   * @param value 值
   */
  async setItem(key: string, value: string): Promise<void> {
    const formattedKey = this.getKey(key);

    try {
      if (this.storageType === 'indexedDB') {
        await this.ensureDBInitialized();

        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject(new Error('IndexedDB未初始化'));
            return;
          }

          const transaction = this.db.transaction(
            [this.storeName],
            'readwrite'
          );
          const store = transaction.objectStore(this.storeName);
          const request = store.put({ key: formattedKey, value });

          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error('存储数据失败'));
        });
      } else {
        // localStorage 或 sessionStorage
        const storage = window[this.storageType];
        storage.setItem(formattedKey, value);
      }
    } catch (error: any) {
      if (error.name === 'QuotaExceededError') {
        throw new UploadError(
          UploadErrorType.QUOTA_EXCEEDED_ERROR,
          '存储空间已满',
          error
        );
      }
      throw new UploadError(
        UploadErrorType.STORAGE_ERROR,
        '存储数据失败',
        error
      );
    }
  }

  /**
   * 获取数据
   * @param key 键名
   * @returns 存储的值，不存在则返回null
   */
  async getItem(key: string): Promise<string | null> {
    const formattedKey = this.getKey(key);

    try {
      if (this.storageType === 'indexedDB') {
        await this.ensureDBInitialized();

        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject(new Error('IndexedDB未初始化'));
            return;
          }

          const transaction = this.db.transaction([this.storeName], 'readonly');
          const store = transaction.objectStore(this.storeName);
          const request = store.get(formattedKey);

          request.onsuccess = () => {
            const result = request.result;
            resolve(result ? result.value : null);
          };

          request.onerror = () => reject(new Error('获取数据失败'));
        });
      } else {
        // localStorage 或 sessionStorage
        const storage = window[this.storageType];
        return storage.getItem(formattedKey);
      }
    } catch (error) {
      throw new UploadError(
        UploadErrorType.STORAGE_ERROR,
        '获取数据失败',
        error as Error
      );
    }
  }

  /**
   * 删除数据
   * @param key 键名
   */
  async removeItem(key: string): Promise<void> {
    const formattedKey = this.getKey(key);

    try {
      if (this.storageType === 'indexedDB') {
        await this.ensureDBInitialized();

        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject(new Error('IndexedDB未初始化'));
            return;
          }

          const transaction = this.db.transaction(
            [this.storeName],
            'readwrite'
          );
          const store = transaction.objectStore(this.storeName);
          const request = store.delete(formattedKey);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error('删除数据失败'));
        });
      } else {
        // localStorage 或 sessionStorage
        const storage = window[this.storageType];
        storage.removeItem(formattedKey);
      }
    } catch (error) {
      throw new UploadError(
        UploadErrorType.STORAGE_ERROR,
        '删除数据失败',
        error as Error
      );
    }
  }

  /**
   * 清除所有数据
   */
  async clear(): Promise<void> {
    try {
      if (this.storageType === 'indexedDB') {
        await this.ensureDBInitialized();

        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject(new Error('IndexedDB未初始化'));
            return;
          }

          const transaction = this.db.transaction(
            [this.storeName],
            'readwrite'
          );
          const store = transaction.objectStore(this.storeName);
          const request = store.clear();

          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error('清除数据失败'));
        });
      } else {
        // localStorage 或 sessionStorage
        const storage = window[this.storageType];

        // 只清除带有前缀的键
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith(this.keyPrefix)) {
            storage.removeItem(key);
          }
        }
      }
    } catch (error) {
      throw new UploadError(
        UploadErrorType.STORAGE_ERROR,
        '清除数据失败',
        error as Error
      );
    }
  }

  /**
   * 获取所有键名
   * @returns 键名列表
   */
  async keys(): Promise<string[]> {
    try {
      if (this.storageType === 'indexedDB') {
        await this.ensureDBInitialized();

        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject(new Error('IndexedDB未初始化'));
            return;
          }

          const transaction = this.db.transaction([this.storeName], 'readonly');
          const store = transaction.objectStore(this.storeName);
          const request = store.getAllKeys();

          request.onsuccess = () => {
            const keys = Array.from(request.result as IDBValidKey[])
              .map(key => String(key))
              .filter(key => key.startsWith(this.keyPrefix))
              .map(key => key.substring(this.keyPrefix.length));
            resolve(keys);
          };

          request.onerror = () => reject(new Error('获取键名列表失败'));
        });
      } else {
        // localStorage 或 sessionStorage
        const storage = window[this.storageType];
        const keys: string[] = [];

        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith(this.keyPrefix)) {
            keys.push(key.substring(this.keyPrefix.length));
          }
        }

        return keys;
      }
    } catch (error) {
      throw new UploadError(
        UploadErrorType.STORAGE_ERROR,
        '获取键名列表失败',
        error as Error
      );
    }
  }

  /**
   * 检查存储是否可用
   * @returns 存储是否可用
   */
  isAvailable(): boolean {
    try {
      if (this.storageType === 'indexedDB') {
        return !!window.indexedDB;
      } else {
        const storage = window[this.storageType];
        const testKey = this.getKey('__test__');
        storage.setItem(testKey, '1');
        storage.removeItem(testKey);
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 获取数据（别名，兼容旧接口）
   * @param key 键名
   * @returns 存储的值，不存在则返回null
   */
  async get(key: string): Promise<string | null> {
    return this.getItem(key);
  }

  /**
   * 存储数据（别名，兼容旧接口）
   * @param key 键名
   * @param value 值
   */
  async set(key: string, value: string): Promise<void> {
    return this.setItem(key, value);
  }

  /**
   * 删除数据（别名，兼容旧接口）
   * @param key 键名
   */
  async remove(key: string): Promise<void> {
    return this.removeItem(key);
  }
}
