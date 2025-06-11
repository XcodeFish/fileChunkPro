/**
 * 针对不同环境的构建优化配置
 */

const terser = require('@rollup/plugin-terser');
const { TARGETS } = require('../../src/utils/constants');

/**
 * 基本压缩配置工厂
 * @param {Object} options 压缩选项
 * @returns {Object} terser配置对象
 */
const createBaseTerserConfig = (options = {}) => ({
  compress: {
    ecma: 2018,
    pure_getters: true,
    passes: 2,
    drop_console: options.dropConsole || false,
    drop_debugger: options.dropDebugger !== false,
    pure_funcs: options.pureFuncs || [],
    // 移除无用代码
    unused: true,
    // 移除无用变量
    dead_code: true,
    ...options.compress,
  },
  mangle: {
    safari10: true,
    ...options.mangle,
  },
  format: {
    comments: (_, comment) =>
      comment.type === 'comment2' && /^\/*!/.test(comment.value),
    ...options.format,
  },
  ...options.terser,
});

/**
 * 浏览器环境优化配置
 * @param {Object} options 附加配置选项
 * @returns {Object} terser插件实例
 */
const createBrowserOptimization = (options = {}) => {
  const isProd = options.isProd !== false;

  return terser(
    createBaseTerserConfig({
      dropConsole: isProd,
      compress: {
        // 浏览器支持更多性能优化
        inline: 3,
        hoist_props: true,
        pure_funcs: [
          'console.debug',
          'console.log',
          ...(options.pureFuncs || []),
        ],
      },
      mangle: {
        // 属性名混淆（需要谨慎使用）
        properties:
          options.mangleProperties === true
            ? {
                regex: /^_/,
              }
            : false,
      },
      // 模块特定配置
      module: true,
    })
  );
};

/**
 * 小程序环境优化配置
 * @param {string} type 小程序类型
 * @param {Object} options 附加配置选项
 * @returns {Object} terser插件实例
 */
const createMiniprogramOptimization = (type, options = {}) => {
  const isProd = options.isProd !== false;
  const ecmaVersion = (() => {
    // 不同小程序平台的ES支持有差异
    switch (type) {
      case TARGETS.WECHAT:
      case TARGETS.ALIPAY:
        return 2018;
      case TARGETS.BYTEDANCE:
        return 2017;
      case TARGETS.BAIDU:
        return 2016;
      default:
        return 2015; // 最保守选择
    }
  })();

  return terser(
    createBaseTerserConfig({
      dropConsole: isProd,
      compress: {
        // 小程序环境需要更保守的优化
        ecma: ecmaVersion,
        inline: 1, // 小程序环境中内联更保守
        hoist_vars: false, // 避免变量提升导致的问题
        sequences: false, // 避免语句序列化
        // 微信小程序中禁止使用Function构造函数
        negate_iife: type !== TARGETS.WECHAT,
        pure_funcs: [
          'console.debug',
          ...(isProd ? ['console.log'] : []),
          ...(options.pureFuncs || []),
        ],
      },
      // 不混淆属性名（小程序框架可能依赖特定属性名）
      mangle: {
        properties: false,
        safari10: true,
        // 一些小程序预留关键字，不要混淆
        reserved: [
          'Page',
          'App',
          'Component',
          'getApp',
          'getCurrentPages',
          'wx',
          'my',
          'tt',
          'swan',
        ],
        ...options.mangle,
      },
    })
  );
};

/**
 * Taro框架优化配置
 * @param {Object} options 附加配置选项
 * @returns {Object} terser插件实例
 */
const createTaroOptimization = (options = {}) => {
  const isProd = options.isProd !== false;

  return terser(
    createBaseTerserConfig({
      dropConsole: isProd,
      compress: {
        ecma: 2018,
        // Taro特定优化
        pure_funcs: [
          'console.debug',
          ...(isProd ? ['console.log'] : []),
          ...(options.pureFuncs || []),
        ],
      },
      mangle: {
        // 不混淆Taro框架特定属性
        properties: false,
        reserved: ['Taro', '__taroMethod', '__taroComponent'],
        ...options.mangle,
      },
    })
  );
};

/**
 * UniApp框架优化配置
 * @param {Object} options 附加配置选项
 * @returns {Object} terser插件实例
 */
const createUniAppOptimization = (options = {}) => {
  const isProd = options.isProd !== false;

  return terser(
    createBaseTerserConfig({
      dropConsole: isProd,
      compress: {
        ecma: 2018,
        // UniApp特定优化
        pure_funcs: [
          'console.debug',
          ...(isProd ? ['console.log'] : []),
          ...(options.pureFuncs || []),
        ],
      },
      mangle: {
        // 不混淆UniApp框架特定属性
        properties: false,
        reserved: ['uni', '__uniConfig', '__uniApp'],
        ...options.mangle,
      },
    })
  );
};

/**
 * 根据目标环境获取优化配置
 * @param {string} target 目标环境
 * @param {Object} options 附加配置选项
 * @returns {Object} terser插件实例
 */
const getOptimizationForTarget = (target, options = {}) => {
  switch (target) {
    case TARGETS.BROWSER:
      return createBrowserOptimization(options);

    case TARGETS.WECHAT:
    case TARGETS.ALIPAY:
    case TARGETS.BYTEDANCE:
    case TARGETS.BAIDU:
      return createMiniprogramOptimization(target, options);

    case TARGETS.TARO:
      return createTaroOptimization(options);

    case TARGETS.UNIAPP:
      return createUniAppOptimization(options);

    default:
      // 默认使用最保守的优化
      return terser(
        createBaseTerserConfig({
          compress: { ecma: 2015 },
        })
      );
  }
};

module.exports = {
  createBaseTerserConfig,
  createBrowserOptimization,
  createMiniprogramOptimization,
  createTaroOptimization,
  createUniAppOptimization,
  getOptimizationForTarget,
};
