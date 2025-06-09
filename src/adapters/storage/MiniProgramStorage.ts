/**
 * MiniProgramStorage - 小程序存储适配器
 * 实现小程序环境下的存储功能
 */

import { UploadError } from '../../core/ErrorCenter';
import { UploadErrorType } from '../../types';
import { Logger } from '../../utils/Logger';
import { IStorage } from '../interfaces';

/**
 * 小程序存储适配器配置选项
 */
export interface MiniProgramStorageOptions {
  storageApi?: any; // 小程序平台提供的存储API
  keyPrefix?: string; // 键前缀
}

/**
 * 小程序存储适配器
 * 适配各种小程序环境的存储API
 */
export class MiniProgramStorage implements IStorage {
  private storageApi: any;
  private keyPrefix: string;
  private logger: Logger;

  /**
   * 创建小程序存储适配器实例
   * @param options 配置选项或平台名称
   */
  constructor(options: MiniProgramStorageOptions | string) {
    let storageApi: any;
    let keyPrefix = 'fileChunkPro_';

    this.logger = new Logger('MiniProgramStorage');

    // 处理字符串参数，表示平台名称
    if (typeof options === 'string') {
      const platform = options;
      keyPrefix = `fileChunkPro_${platform}_`;

      // 根据平台名称获取对应的存储API
      switch (platform) {
        case 'wechat':
          storageApi =
            typeof wx !== 'undefined' ? wx : this.createMockStorage();
          break;
        case 'alipay':
          storageApi =
            typeof my !== 'undefined' ? my : this.createMockStorage();
          break;
        case 'bytedance':
          storageApi =
            typeof tt !== 'undefined' ? tt : this.createMockStorage();
          break;
        case 'baidu':
          storageApi =
            typeof swan !== 'undefined' ? swan : this.createMockStorage();
          break;
        case 'taro':
        case 'uni-app':
          // 对于框架类型，使用模拟存储
          storageApi = this.createMockStorage();
          break;
        default:
          storageApi = this.createMockStorage();
      }
    } else {
      // 处理对象参数
      storageApi = options.storageApi || this.createMockStorage();
      keyPrefix = options.keyPrefix || 'fileChunkPro_';
    }

    this.storageApi = storageApi;
    this.keyPrefix = keyPrefix;

    // 验证必要的API
    this.validateStorageApi();
  }

  /**
   * 创建模拟存储API，用于测试环境
   * @private
   */
  private createMockStorage(): any {
    const storage: Record<string, string> = {};

    return {
      _isMock: true, // 标记为模拟存储API
      setStorage: ({ key, data, success, fail }: any) => {
        try {
          storage[key] = data;
          if (success) success({ errMsg: 'setStorage:ok' });
        } catch (e) {
          if (fail) fail({ errMsg: 'setStorage:fail' });
        }
      },
      getStorage: ({ key, success, fail }: any) => {
        try {
          const data = storage[key];
          if (data !== undefined) {
            if (success) success({ data, errMsg: 'getStorage:ok' });
          } else {
            if (fail) fail({ errMsg: 'getStorage:fail data not found' });
          }
        } catch (e) {
          if (fail) fail({ errMsg: 'getStorage:fail' });
        }
      },
      removeStorage: ({ key, success, fail }: any) => {
        try {
          delete storage[key];
          if (success) success({ errMsg: 'removeStorage:ok' });
        } catch (e) {
          if (fail) fail({ errMsg: 'removeStorage:fail' });
        }
      },
      setStorageSync: (key: string, data: string) => {
        storage[key] = data;
      },
      getStorageSync: (key: string) => {
        return storage[key];
      },
      removeStorageSync: (key: string) => {
        delete storage[key];
      },
      getStorageInfo: ({ success, fail }: any) => {
        try {
          const keys = Object.keys(storage);
          const currentSize = keys.reduce((size, key) => {
            return size + (storage[key]?.length || 0);
          }, 0);
          if (success)
            success({
              keys,
              currentSize,
              limitSize: 10 * 1024 * 1024, // 10MB
              errMsg: 'getStorageInfo:ok',
            });
        } catch (e) {
          if (fail) fail({ errMsg: 'getStorageInfo:fail' });
        }
      },
      getStorageInfoSync: () => {
        const keys = Object.keys(storage);
        const currentSize = keys.reduce((size, key) => {
          return size + (storage[key]?.length || 0);
        }, 0);
        return {
          keys,
          currentSize,
          limitSize: 10 * 1024 * 1024, // 10MB
        };
      },
    };
  }

  /**
   * 验证存储API是否可用
   * @private
   */
  private validateStorageApi(): void {
    // 如果是模拟存储API，则不需要验证
    if (this.storageApi && this.storageApi._isMock) {
      return;
    }

    const requiredMethods = ['setStorage', 'getStorage', 'removeStorage'];

    // 检查并尝试添加别名方法
    if (
      typeof this.storageApi.setStorageSync === 'function' &&
      typeof this.storageApi.setStorage !== 'function'
    ) {
      this.storageApi.setStorage = ({ key, data, success, fail }: any) => {
        try {
          this.storageApi.setStorageSync(key, data);
          if (success) success({ errMsg: 'setStorage:ok' });
        } catch (e) {
          if (fail) fail({ errMsg: 'setStorage:fail' });
        }
      };
    }

    if (
      typeof this.storageApi.getStorageSync === 'function' &&
      typeof this.storageApi.getStorage !== 'function'
    ) {
      this.storageApi.getStorage = ({ key, success, fail }: any) => {
        try {
          const data = this.storageApi.getStorageSync(key);
          if (data !== undefined) {
            if (success) success({ data, errMsg: 'getStorage:ok' });
          } else {
            if (fail) fail({ errMsg: 'getStorage:fail data not found' });
          }
        } catch (e) {
          if (fail) fail({ errMsg: 'getStorage:fail' });
        }
      };
    }

    if (
      typeof this.storageApi.removeStorageSync === 'function' &&
      typeof this.storageApi.removeStorage !== 'function'
    ) {
      this.storageApi.removeStorage = ({ key, success, fail }: any) => {
        try {
          this.storageApi.removeStorageSync(key);
          if (success) success({ errMsg: 'removeStorage:ok' });
        } catch (e) {
          if (fail) fail({ errMsg: 'removeStorage:fail' });
        }
      };
    }

    // 如果存在set/get/remove方法但缺少setStorage/getStorage/removeStorage方法，添加别名
    if (
      typeof this.storageApi.set === 'function' &&
      typeof this.storageApi.setStorage !== 'function'
    ) {
      this.storageApi.setStorage = this.storageApi.set;
    }

    if (
      typeof this.storageApi.get === 'function' &&
      typeof this.storageApi.getStorage !== 'function'
    ) {
      this.storageApi.getStorage = this.storageApi.get;
    }

    if (
      typeof this.storageApi.remove === 'function' &&
      typeof this.storageApi.removeStorage !== 'function'
    ) {
      this.storageApi.removeStorage = this.storageApi.remove;
    }

    // 最后检查必需方法
    for (const method of requiredMethods) {
      if (typeof this.storageApi[method] !== 'function') {
        // 创建一个模拟存储API并使用它
        const mockStorage = this.createMockStorage();
        this.storageApi = {
          ...this.storageApi,
          ...mockStorage,
          _isMock: true,
        };
        this.logger.warn(
          `小程序存储API缺少必要方法: ${method}，已使用模拟存储`
        );
        return;
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
