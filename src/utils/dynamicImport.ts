/**
 * 动态导入工具
 * 提供跨环境的动态导入能力，降低初始加载体积
 */

import { getFeatures } from './featureDetection';
import { SECURITY_LEVELS } from './constants';

/**
 * 动态导入选项
 */
export interface DynamicImportOptions {
  /**
   * 超时时间（毫秒），超过此时间将reject
   */
  timeout?: number;

  /**
   * 加载失败时是否重试
   */
  retry?: boolean;

  /**
   * 最大重试次数
   */
  maxRetries?: number;

  /**
   * 重试间隔（毫秒）
   */
  retryDelay?: number;

  /**
   * 错误回调
   */
  onError?: (error: Error) => void;

  /**
   * 进度回调（仅在部分环境支持）
   */
  onProgress?: (progress: number) => void;
}

/**
 * 默认选项
 */
const defaultOptions: DynamicImportOptions = {
  timeout: 30000,
  retry: true,
  maxRetries: 3,
  retryDelay: 1000,
};

/**
 * 动态导入模块
 * @param moduleId 模块路径或标识符
 * @param options 导入选项
 * @returns 模块的Promise
 */
export async function importModule<T = any>(
  moduleId: string,
  options: DynamicImportOptions = {}
): Promise<T> {
  const mergedOptions = { ...defaultOptions, ...options };
  let retries = 0;

  const tryImport = async (): Promise<T> => {
    try {
      // 创建一个超时Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (mergedOptions.timeout) {
          setTimeout(() => {
            reject(new Error(`动态导入超时: ${moduleId}`));
          }, mergedOptions.timeout);
        }
      });

      // 实际导入Promise
      const importPromise = (async () => {
        // 检测环境特性
        const features = getFeatures();

        // 根据不同的环境使用不同的导入策略
        if (features.webWorker && typeof importScripts === 'function') {
          // Worker环境使用importScripts
          // eslint-disable-next-line no-restricted-globals
          importScripts(moduleId);
          return (self as any)[
            moduleId.split('/').pop()?.split('.')[0] || ''
          ] as T;
        } else if (
          features.miniprogramSpecific.isWechat &&
          typeof wx !== 'undefined'
        ) {
          // 微信小程序环境
          return new Promise<T>((resolve, reject) => {
            wx.request({
              url: moduleId,
              success: res => {
                // 执行代码
                try {
                  const moduleFunc = new Function(
                    'exports',
                    'module',
                    'require',
                    res.data as string
                  );
                  const exports = {};
                  const module = { exports };
                  moduleFunc(exports, module, () => ({}));
                  resolve(module.exports as T);
                } catch (e) {
                  reject(e);
                }
              },
              fail: reject,
            });
          });
        } else {
          // 浏览器环境使用动态import
          return import(/* @vite-ignore */ moduleId);
        }
      })();

      // 竞争超时和导入
      return await Promise.race([importPromise, timeoutPromise]);
    } catch (error) {
      // 处理重试逻辑
      if (mergedOptions.retry && retries < (mergedOptions.maxRetries || 0)) {
        retries++;

        // 调用错误回调
        if (mergedOptions.onError) {
          mergedOptions.onError(error as Error);
        }

        // 等待延时后重试
        await new Promise(resolve =>
          setTimeout(resolve, mergedOptions.retryDelay)
        );
        return tryImport();
      }
      throw error;
    }
  };

  return tryImport();
}

/**
 * 动态导入安全插件
 * @param level 安全级别
 */
export async function importSecurityPlugin(level: string): Promise<any> {
  switch (level) {
    case SECURITY_LEVELS.BASIC:
      return import('../plugins/security/BasicSecurityPlugin').then(
        m => m.default
      );
    case SECURITY_LEVELS.STANDARD:
      return import('../plugins/security/StandardSecurityPlugin').then(
        m => m.default
      );
    case SECURITY_LEVELS.ADVANCED:
      return import('../plugins/security/AdvancedSecurityPlugin').then(
        m => m.default
      );
    default:
      throw new Error(`未知的安全级别: ${level}`);
  }
}

/**
 * 动态导入哈希算法实现
 * @param algorithm 算法名称
 */
export async function importHashAlgorithm(algorithm: string): Promise<any> {
  const normalizedAlg = algorithm.toLowerCase();

  switch (normalizedAlg) {
    case 'md5':
      return import('../utils/hash/md5').then(m => m.default);
    case 'sha1':
      return import('../utils/hash/sha1').then(m => m.default);
    case 'sha256':
      return import('../utils/hash/sha256').then(m => m.default);
    default:
      throw new Error(`未支持的哈希算法: ${algorithm}`);
  }
}

/**
 * 动态导入压缩算法
 * @param algorithm 压缩算法名称
 */
export async function importCompressionAlgorithm(
  algorithm: string
): Promise<any> {
  const normalizedAlg = algorithm.toLowerCase();

  switch (normalizedAlg) {
    case 'gzip':
      return import('../utils/compression/gzip').then(m => m.default);
    case 'deflate':
      return import('../utils/compression/deflate').then(m => m.default);
    default:
      throw new Error(`未支持的压缩算法: ${algorithm}`);
  }
}

/**
 * 动态加载WASM模块
 * @param moduleName WASM模块名称
 */
export async function loadWasmModule(moduleName: string): Promise<any> {
  const features = getFeatures();

  // 检查WASM支持
  if (!features.webAssembly) {
    throw new Error('当前环境不支持WebAssembly');
  }

  // 动态导入WASM
  return import(`../workers/wasm/${moduleName}.js`).then(module => {
    return module.default();
  });
}

/**
 * 动态导入UI组件
 * 基于当前环境和框架选择合适的UI组件
 * @param componentName 组件名称
 */
export async function importUIComponent(componentName: string): Promise<any> {
  const features = getFeatures();

  // 检测React
  if (typeof window !== 'undefined' && (window as any).React) {
    return import(`../ui/react/${componentName}`).then(m => m.default);
  }
  // 检测Vue
  else if (typeof window !== 'undefined' && (window as any).Vue) {
    return import(`../ui/vue/${componentName}.vue`).then(m => m.default);
  }
  // 小程序环境
  else if (features.miniprogramSpecific.isWechat) {
    // 小程序环境下不支持动态导入组件，返回一个描述对象
    return Promise.resolve({
      type: 'miniprogram',
      name: componentName,
      path: `components/${componentName}/${componentName}`,
    });
  }

  throw new Error(`无法为当前环境加载UI组件: ${componentName}`);
}
