/**
 * 构建系统使用的常量定义
 */

module.exports = {
  // 添加到生成文件的版权信息
  BANNER: '© fileChunkPro - 高性能、跨环境文件上传解决方案',

  // 构建目标环境
  BUILD_TARGETS: {
    BROWSER: 'browser',
    NODE: 'node',
    MINIPROGRAM: 'miniprogram',
    TARO: 'taro',
    UNI_APP: 'uni-app',
  },

  // 环境变量名称
  ENV_VARS: {
    NODE_ENV: 'NODE_ENV',
    BUILD_TARGET: 'BUILD_TARGET',
    SOURCEMAP: 'SOURCEMAP',
    DEBUG: 'DEBUG',
  },

  // 构建模式
  BUILD_MODES: {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test',
  },

  // 源映射选项
  SOURCEMAP_OPTIONS: {
    NONE: 'none', // 不生成源映射
    DEVELOPMENT: 'eval-source-map', // 开发环境
    PRODUCTION: 'hidden-source-map', // 生产环境
    DEBUGGING: 'source-map', // 调试专用
  },
};
