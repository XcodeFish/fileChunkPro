/**
 * StorageManager - 断点续传存储管理器
 *
 * 提供统一的存储API，支持多种存储引擎（LocalStorage、SessionStorage、IndexedDB、内存存储）
 */

import { Logger } from './Logger';
import { StorageEngine, StorageOptions } from '../types/resume';

/**
 * 存储接口定义
 */
export interface IStorage {
  /**
   * 获取存储项
   * @param key 键
   * @returns 值（反序列化后的对象）或null
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * 设置存储项
   * @param key 键
   * @param value 值
   */
  set<T = any>(key: string, value: T): Promise<void>;

  /**
   * 移除存储项
   * @param key 键
   */
  remove(key: string): Promise<void>;

  /**
   * 清除所有存储项
   */
  clear(): Promise<void>;

  /**
   * 获取所有键
   */
  keys(): Promise<string[]>;
}

/**
 * 存储管理器 - 为断点续传插件提供存储服务
 */
export class StorageManager implements IStorage {
  private logger: Logger;
  private options: StorageOptions;
  private storage: IStorage | null = null;
  private isInitialized = false;

  /**
   * 构造函数
   * @param options 存储选项
   */
  constructor(options: StorageOptions) {
    this.logger = new Logger('StorageManager');
    this.options = options;
  }

  /**
   * 初始化存储
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.storage = await this.createStorage();
      this.isInitialized = true;
      this.logger.info('存储初始化成功', { engine: this.options.engine });
    } catch (error) {
      this.logger.error('存储初始化失败', { error });
      throw error;
    }
  }

  /**
   * 创建存储实例
   */
  private async createStorage(): Promise<IStorage> {
    switch (this.options.engine) {
      case StorageEngine.LOCAL_STORAGE:
        return new LocalStorageAdapter(
          this.options.path,
          this.options.namespace
        );
      case StorageEngine.SESSION_STORAGE:
        return new SessionStorageAdapter(
          this.options.path,
          this.options.namespace
        );
      case StorageEngine.INDEXED_DB:
        return new IndexedDBAdapter(this.options.path, this.options.namespace);
      case StorageEngine.CUSTOM:
        if (!this.options.customStorage) {
          throw new Error('未提供自定义存储实现');
        }
        return this.options.customStorage;
      case StorageEngine.MEMORY:
      default:
        return new MemoryStorageAdapter(
          this.options.path,
          this.options.namespace
        );
    }
  }

  /**
   * 获取存储项
   * @param key 键
   */
  public async get<T = any>(key: string): Promise<T | null> {
    await this.ensureInitialized();
    try {
      return await this.storage!.get<T>(key);
    } catch (error) {
      this.logger.error('获取存储项失败', { key, error });
      return null;
    }
  }

  /**
   * 设置存储项
   * @param key 键
   * @param value 值
   */
  public async set<T = any>(key: string, value: T): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.storage!.set<T>(key, value);
    } catch (error) {
      this.logger.error('设置存储项失败', { key, error });
      throw error;
    }
  }

  /**
   * 移除存储项
   * @param key 键
   */
  public async remove(key: string): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.storage!.remove(key);
    } catch (error) {
      this.logger.error('移除存储项失败', { key, error });
      throw error;
    }
  }

  /**
   * 清除所有存储项
   */
  public async clear(): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.storage!.clear();
    } catch (error) {
      this.logger.error('清除存储项失败', { error });
      throw error;
    }
  }

  /**
   * 获取所有键
   */
  public async keys(): Promise<string[]> {
    await this.ensureInitialized();
    try {
      return await this.storage!.keys();
    } catch (error) {
      this.logger.error('获取所有键失败', { error });
      return [];
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
}

/**
 * localStorage 存储适配器
 */
class LocalStorageAdapter implements IStorage {
  private prefix: string;

  constructor(path: string, namespace: string) {
    this.prefix = `${path}_${namespace}_`;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const fullKey = this.prefix + key;
    const value = localStorage.getItem(fullKey);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    const fullKey = this.prefix + key;
    const stringValue = JSON.stringify(value);
    localStorage.setItem(fullKey, stringValue);
  }

  async remove(key: string): Promise<void> {
    const fullKey = this.prefix + key;
    localStorage.removeItem(fullKey);
  }

  async clear(): Promise<void> {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }
}

/**
 * sessionStorage 存储适配器
 */
class SessionStorageAdapter implements IStorage {
  private prefix: string;

  constructor(path: string, namespace: string) {
    this.prefix = `${path}_${namespace}_`;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const fullKey = this.prefix + key;
    const value = sessionStorage.getItem(fullKey);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    const fullKey = this.prefix + key;
    const stringValue = JSON.stringify(value);
    sessionStorage.setItem(fullKey, stringValue);
  }

  async remove(key: string): Promise<void> {
    const fullKey = this.prefix + key;
    sessionStorage.removeItem(fullKey);
  }

  async clear(): Promise<void> {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }
}

/**
 * IndexedDB 存储适配器
 */
class IndexedDBAdapter implements IStorage {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;

  constructor(path: string, namespace: string) {
    this.dbName = path;
    this.storeName = namespace;
  }

  private async openDatabase(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = event => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = event => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async get<T = any>(key: string): Promise<T | null> {
    const db = await this.openDatabase();
    return new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    const db = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.openDatabase();
    return new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(Array.from(request.result).map(key => key.toString()));
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

/**
 * 内存存储适配器
 */
class MemoryStorageAdapter implements IStorage {
  private storage = new Map<string, string>();
  private prefix: string;

  constructor(path: string, namespace: string) {
    this.prefix = `${path}_${namespace}_`;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const fullKey = this.prefix + key;
    const value = this.storage.get(fullKey);
    if (value === undefined) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    const fullKey = this.prefix + key;
    const stringValue = JSON.stringify(value);
    this.storage.set(fullKey, stringValue);
  }

  async remove(key: string): Promise<void> {
    const fullKey = this.prefix + key;
    this.storage.delete(fullKey);
  }

  async clear(): Promise<void> {
    const keysToRemove: string[] = [];
    for (const key of this.storage.keys()) {
      if (key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.storage.delete(key);
    }
  }

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

export { StorageEngine };
export default StorageManager;
