/**
 * MiniProgramStorage - 小程序存储适配器
 * 实现小程序环境下的存储功能
 */

import { UploadError } from '../../core/ErrorCenter';
import { UploadErrorType } from '../../types';
import { IStorage } from '../interfaces';

/**
 * 小程序存储适配器配置选项
 */
export interface MiniProgramStorageOptions {
  storageApi: any; // 小程序平台提供的存储API
  keyPrefix?: string; // 键前缀
}

/**
 * 小程序存储适配器
 * 适配各种小程序环境的存储API
 */
export class MiniProgramStorage implements IStorage {
  private storageApi: any;
  private keyPrefix: string;

  /**
   * 创建小程序存储适配器实例
   * @param options 配置选项
   */
  constructor(options: MiniProgramStorageOptions) {
    if (!options.storageApi) {
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        '未提供小程序存储API'
      );
    }
    this.storageApi = options.storageApi;
    this.keyPrefix = options.keyPrefix || 'fileChunkPro_';

    // 验证必要的API
    this.validateStorageApi();
  }

  /**
   * 验证存储API是否可用
   * @private
   */
  private validateStorageApi(): void {
    const requiredMethods = ['setStorage', 'getStorage', 'removeStorage'];

    for (const method of requiredMethods) {
      if (typeof this.storageApi[method] !== 'function') {
        throw new UploadError(
          UploadErrorType.ENVIRONMENT_ERROR,
          `小程序存储API缺少必要方法: ${method}`
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
      // 尝试使用同步API
      if (typeof this.storageApi.setStorageSync === 'function') {
        this.storageApi.setStorageSync(formattedKey, value);
        return;
      }

      // 回退到异步API
      await this.promisify(this.storageApi.setStorage)({
        key: formattedKey,
        data: value,
      });
    } catch (error: any) {
      // 处理存储已满错误
      if (
        error.errMsg?.includes('exceed') ||
        error.errMsg?.includes('full') ||
        error.errMsg?.includes('quota') ||
        error.message?.includes('exceed') ||
        error.message?.includes('full') ||
        error.message?.includes('quota')
      ) {
        throw new UploadError(
          UploadErrorType.QUOTA_EXCEEDED_ERROR,
          '小程序存储空间已满',
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
      // 尝试使用同步API
      if (typeof this.storageApi.getStorageSync === 'function') {
        const value = this.storageApi.getStorageSync(formattedKey);
        return value === '' || value === undefined || value === null
          ? null
          : value;
      }

      // 回退到异步API
      try {
        const res = await this.promisify(this.storageApi.getStorage)({
          key: formattedKey,
        });
        return res.data === '' || res.data === undefined || res.data === null
          ? null
          : res.data;
      } catch (error: any) {
        // 大多数小程序平台在键不存在时会抛出异常
        if (
          error.errMsg?.includes('not exist') ||
          error.errMsg?.includes('not found') ||
          error.message?.includes('not exist') ||
          error.message?.includes('not found')
        ) {
          return null;
        }
        throw error;
      }
    } catch (error) {
      // 键不存在通常不视为错误
      if (
        error instanceof Error &&
        (error.message.includes('not exist') ||
          error.message.includes('not found'))
      ) {
        return null;
      }

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
      // 尝试使用同步API
      if (typeof this.storageApi.removeStorageSync === 'function') {
        this.storageApi.removeStorageSync(formattedKey);
        return;
      }

      // 回退到异步API
      await this.promisify(this.storageApi.removeStorage)({
        key: formattedKey,
      });
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
   * 注意：只清除带有特定前缀的键
   */
  async clear(): Promise<void> {
    try {
      const allKeys = await this.keys();

      // 使用前缀过滤后的键
      for (const key of allKeys) {
        await this.removeItem(key);
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
      let storageInfo: { keys: string[] } | null = null;

      // 尝试使用信息API
      if (typeof this.storageApi.getStorageInfo === 'function') {
        // 异步API
        storageInfo = await this.promisify(this.storageApi.getStorageInfo)();
      } else if (typeof this.storageApi.getStorageInfoSync === 'function') {
        // 同步API
        storageInfo = this.storageApi.getStorageInfoSync();
      } else {
        throw new UploadError(
          UploadErrorType.ENVIRONMENT_ERROR,
          '小程序存储API不支持获取所有键名'
        );
      }

      if (!storageInfo || !Array.isArray(storageInfo.keys)) {
        return [];
      }

      // 过滤出带有前缀的键并移除前缀
      return storageInfo.keys
        .filter(key => key.startsWith(this.keyPrefix))
        .map(key => key.substring(this.keyPrefix.length));
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
      const testKey = this.getKey('__test__');

      // 尝试写入测试值
      if (typeof this.storageApi.setStorageSync === 'function') {
        this.storageApi.setStorageSync(testKey, '1');
        this.storageApi.removeStorageSync(testKey);
        return true;
      } else if (typeof this.storageApi.setStorage === 'function') {
        // 异步API无法在同步函数中测试可用性
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 将回调风格API转为Promise
   * @param fn 原始API函数
   * @returns Promise包装的函数
   * @private
   */
  private promisify<T, U extends Record<string, any>>(
    fn: (options: Record<string, any>) => void
  ): (options: U) => Promise<T> {
    return (options: U): Promise<T> => {
      return new Promise((resolve, reject) => {
        const callback = {
          success: (res: T) => {
            resolve(res);
          },
          fail: (error: any) => {
            reject(error);
          },
        };

        fn({
          ...options,
          ...callback,
        });
      });
    };
  }
}
