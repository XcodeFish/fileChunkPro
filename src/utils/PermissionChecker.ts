/**
 * PermissionChecker
 * 权限检查工具类，用于进行上传权限检查
 */

import { Environment } from '../types';

/**
 * 权限检查选项
 */
export interface PermissionCheckOptions {
  /** 要检查的环境 */
  environment: Environment;

  /** 是否检查存储权限 */
  checkStorage?: boolean;

  /** 是否检查网络权限 */
  checkNetwork?: boolean;

  /** 是否检查文件系统权限 */
  checkFileSystem?: boolean;

  /** 附加权限检查 */
  additionalChecks?: Array<() => Promise<boolean>>;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 是否拥有权限 */
  granted: boolean;

  /** 详细权限检查结果 */
  details: {
    storage?: boolean;
    network?: boolean;
    fileSystem?: boolean;
    additional?: boolean[];
  };

  /** 权限拒绝原因 */
  deniedReason?: string;
}

/**
 * 权限检查工具类
 */
class PermissionChecker {
  /**
   * 检查上传权限
   * @param options 权限检查选项
   * @returns Promise解析为权限检查结果
   */
  public static async checkUploadPermission(
    options: PermissionCheckOptions
  ): Promise<PermissionCheckResult> {
    const result: PermissionCheckResult = {
      granted: true,
      details: {},
    };

    // 检查存储权限
    if (options.checkStorage) {
      result.details.storage = await this.checkStoragePermission(
        options.environment
      );
      if (!result.details.storage) {
        result.granted = false;
        result.deniedReason = '存储权限被拒绝';
      }
    }

    // 检查网络权限
    if (options.checkNetwork) {
      result.details.network = await this.checkNetworkPermission(
        options.environment
      );
      if (!result.details.network) {
        result.granted = false;
        result.deniedReason = result.deniedReason || '网络权限被拒绝';
      }
    }

    // 检查文件系统权限
    if (options.checkFileSystem) {
      result.details.fileSystem = await this.checkFileSystemPermission(
        options.environment
      );
      if (!result.details.fileSystem) {
        result.granted = false;
        result.deniedReason = result.deniedReason || '文件系统权限被拒绝';
      }
    }

    // 执行附加检查
    if (options.additionalChecks && options.additionalChecks.length > 0) {
      result.details.additional = [];
      for (const check of options.additionalChecks) {
        try {
          const checkResult = await check();
          result.details.additional.push(checkResult);
          if (!checkResult) {
            result.granted = false;
            result.deniedReason = result.deniedReason || '附加权限检查失败';
          }
        } catch (error) {
          result.details.additional.push(false);
          result.granted = false;
          result.deniedReason =
            result.deniedReason ||
            `附加权限检查异常: ${(error as Error).message}`;
        }
      }
    }

    return result;
  }

  /**
   * 检查存储权限
   * @param environment 运行环境
   * @returns Promise解析为是否有权限
   */
  private static async checkStoragePermission(
    environment: Environment
  ): Promise<boolean> {
    switch (environment) {
      case Environment.Browser:
        return this.checkBrowserStoragePermission();
      case Environment.WechatMP:
      case Environment.AlipayMP:
      case Environment.BytedanceMP:
      case Environment.BaiduMP:
      case Environment.TaroMP:
      case Environment.UniAppMP:
        return this.checkMiniProgramStoragePermission();
      case Environment.ReactNative:
        return this.checkReactNativeStoragePermission();
      case Environment.NodeJS:
        return true; // Node.js环境默认有权限
      default:
        return true; // 未知环境默认有权限
    }
  }

  /**
   * 检查浏览器存储权限
   * @returns Promise解析为是否有权限
   */
  private static async checkBrowserStoragePermission(): Promise<boolean> {
    try {
      // 尝试写入并读取一个测试值到localStorage
      const testKey = '_upload_permission_test';
      localStorage.setItem(testKey, 'test');
      const value = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      return value === 'test';
    } catch (error) {
      // 隐私模式或禁用存储的情况
      return false;
    }
  }

  /**
   * 检查小程序存储权限
   * @returns Promise解析为是否有权限
   */
  private static async checkMiniProgramStoragePermission(): Promise<boolean> {
    try {
      // 检查小程序环境是否支持存储API
      if (typeof wx !== 'undefined' && wx.setStorageSync && wx.getStorageSync) {
        const testKey = '_upload_permission_test';
        wx.setStorageSync(testKey, 'test');
        const value = wx.getStorageSync(testKey);
        wx.removeStorageSync(testKey);
        return value === 'test';
      } else if (
        typeof my !== 'undefined' &&
        my.setStorageSync &&
        my.getStorageSync
      ) {
        const testKey = '_upload_permission_test';
        my.setStorageSync({
          key: testKey,
          data: 'test',
        });
        const value = my.getStorageSync({
          key: testKey,
        }).data;
        my.removeStorageSync({
          key: testKey,
        });
        return value === 'test';
      } else if (
        typeof tt !== 'undefined' &&
        tt.setStorageSync &&
        tt.getStorageSync
      ) {
        const testKey = '_upload_permission_test';
        tt.setStorageSync(testKey, 'test');
        const value = tt.getStorageSync(testKey);
        tt.removeStorageSync(testKey);
        return value === 'test';
      } else if (
        typeof swan !== 'undefined' &&
        swan.setStorageSync &&
        swan.getStorageSync
      ) {
        const testKey = '_upload_permission_test';
        swan.setStorageSync(testKey, 'test');
        const value = swan.getStorageSync(testKey);
        swan.removeStorageSync(testKey);
        return value === 'test';
      }

      // 其他未知小程序环境，默认假设有权限
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查React Native存储权限
   * @returns Promise解析为是否有权限
   */
  private static async checkReactNativeStoragePermission(): Promise<boolean> {
    // TODO这里应该集成RN的AsyncStorage检查
    // 由于无法直接引入React Native的依赖，此处仅作示例
    try {
      // 假设AsyncStorage已全局可用
      if (typeof global.AsyncStorage !== 'undefined') {
        const testKey = '_upload_permission_test';
        await global.AsyncStorage.setItem(testKey, 'test');
        const value = await global.AsyncStorage.getItem(testKey);
        await global.AsyncStorage.removeItem(testKey);
        return value === 'test';
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查网络权限
   * @param environment 运行环境
   * @returns Promise解析为是否有权限
   */
  private static async checkNetworkPermission(
    environment: Environment
  ): Promise<boolean> {
    // 在浏览器环境中检查网络状态
    if (environment === Environment.Browser) {
      return (
        typeof navigator !== 'undefined' &&
        (navigator.onLine === undefined || navigator.onLine)
      );
    }

    // 在小程序环境中检查网络状态
    if (this.isMiniProgramEnvironment(environment)) {
      try {
        if (typeof wx !== 'undefined' && wx.getNetworkType) {
          return new Promise(resolve => {
            wx.getNetworkType({
              success: res => resolve(res.networkType !== 'none'),
              fail: () => resolve(true), // 无法获取时默认有权限
            });
          });
        } else if (typeof my !== 'undefined' && my.getNetworkType) {
          return new Promise(resolve => {
            my.getNetworkType({
              success: res => resolve(res.networkType !== 'UNKNOWN'),
              fail: () => resolve(true),
            });
          });
        }
      } catch (error) {
        return true; // 发生错误时默认有权限
      }
    }

    // 其他环境默认有网络权限
    return true;
  }

  /**
   * 检查文件系统权限
   * @param environment 运行环境
   * @returns Promise解析为是否有权限
   */
  private static async checkFileSystemPermission(
    environment: Environment
  ): Promise<boolean> {
    // 在现代浏览器中检查文件系统访问API权限
    if (environment === Environment.Browser) {
      // 检查File System Access API是否可用
      if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
        // 仅检查API是否可用，不实际请求权限
        return true;
      }
      // 不支持File System Access API的浏览器默认为有权限
      return true;
    }

    // 在Node.js环境中检查文件系统权限
    if (environment === Environment.NodeJS) {
      try {
        // 在Node.js环境中，我们假设有权限
        // TODO注意：实际的Node.js权限检查应在服务端实现
        // 这里避免使用require以符合linter规则
        return true;
      } catch (error) {
        return false;
      }
    }

    // 小程序环境不直接检查文件系统权限
    return true;
  }

  /**
   * 判断是否为小程序环境
   * @param environment 环境类型
   * @returns 是否为小程序环境
   */
  private static isMiniProgramEnvironment(environment: Environment): boolean {
    return [
      Environment.WechatMP,
      Environment.AlipayMP,
      Environment.BytedanceMP,
      Environment.BaiduMP,
      Environment.TaroMP,
      Environment.UniAppMP,
    ].includes(environment);
  }
}

export default PermissionChecker;
