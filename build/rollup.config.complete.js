/* eslint-disable */
/**
 * 完整的Rollup配置文件
 * 支持多环境构建与条件编译
 */

const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const replace = require('@rollup/plugin-replace');
const dtsPlugin = require('rollup-plugin-dts').default;
const esbuildPlugin = require('rollup-plugin-esbuild').default;
const alias = require('@rollup/plugin-alias');
const visualizer = require('rollup-plugin-visualizer').visualizer;
const path = require('path');

// 导入自定义插件
const environmentPlugin = require('./plugins/environment-plugin');
const workerPlugin = require('./plugins/worker-plugin');
const { getOptimizationForTarget } = require('./config/optimization');

// 导入Vue支持插件
const vuePlugin = require('rollup-plugin-vue');

const pkg = require('../package.json');
const { TARGETS } = require('../src/utils/constants');

// 构建模式
const isProd = process.env.NODE_ENV === 'production';
const TARGET = process.env.TARGET || 'browser';

// Banner
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * (c) ${new Date().getFullYear()} ${pkg.author}
 * Released under the ${pkg.license} License.
 */`;

// 基础配置
const baseConfig = {
  treeshake: {
    moduleSideEffects: false,
  },
};

// 创建基础插件配置
const createBasePlugins = (target = 'browser') => [
  // 环境变量替换
  replace({
    preventAssignment: true,
    values: {
      'process.env.NODE_ENV': JSON.stringify(
        isProd ? 'production' : 'development'
      ),
      __VERSION__: JSON.stringify(pkg.version),
    },
  }),

  // 路径别名
  alias({
    entries: [{ find: '@', replacement: path.resolve(__dirname, '../src') }],
  }),

  // 环境检测与条件编译
  environmentPlugin({
    target,
    isProd,
  }),

  // Web Worker 处理
  workerPlugin({
    targetDir: 'workers',
    inline: false,
  }),

  // TypeScript 编译
  typescript({
    tsconfig: './tsconfig.json',
    sourceMap: true,
    compilerOptions: {
      noEmit: false,
      declarationDir: undefined,
      declaration: false,
    },
  }),

  // 解析依赖
  resolve({
    browser: target === 'browser',
    extensions: ['.ts', '.tsx', '.js'],
    preferBuiltins: true,
  }),

  // 转换CommonJS模块
  commonjs(),
];

// 添加环境优化插件
const addOptimization = (plugins, target) =>
  isProd ? [...plugins, getOptimizationForTarget(target, { isProd })] : plugins;

// 浏览器构建配置 (ES Module)
const browserESMConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/browser/fileChunkPro.esm.js',
    format: 'es',
    banner,
    sourcemap: true,
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.BROWSER),
      isProd &&
        visualizer({
          filename: 'stats/browser-esm.html',
          title: 'FileChunkPro Browser ESM Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.BROWSER
  ),
  external: Object.keys(pkg.peerDependencies || {}),
};

// 浏览器构建配置 (CommonJS)
const browserCJSConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/browser/fileChunkPro.cjs.js',
    format: 'cjs',
    banner,
    exports: 'named',
    sourcemap: true,
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.BROWSER),
      isProd &&
        visualizer({
          filename: 'stats/browser-cjs.html',
          title: 'FileChunkPro Browser CJS Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.BROWSER
  ),
  external: Object.keys(pkg.peerDependencies || {}),
};

// 浏览器构建配置 (UMD)
const browserUMDConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/browser/fileChunkPro.umd.js',
    format: 'umd',
    name: 'FileChunkPro',
    banner,
    globals: {
      react: 'React',
      vue: 'Vue',
    },
    sourcemap: true,
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.BROWSER),
      isProd &&
        visualizer({
          filename: 'stats/browser-umd.html',
          title: 'FileChunkPro Browser UMD Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.BROWSER
  ),
  external: Object.keys(pkg.peerDependencies || {}),
};

// 微信小程序构建配置
const miniprogramWechatConfig = {
  input: 'src/entries/wechat.ts',
  output: {
    file: 'dist/miniprogram/wechat/index.js',
    format: 'cjs',
    banner,
    sourcemap: true,
    exports: 'named',
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.WECHAT),
      isProd &&
        visualizer({
          filename: 'stats/wechat.html',
          title: 'FileChunkPro WeChat Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.WECHAT
  ),
  external: ['react', 'vue'],
};

// 支付宝小程序构建配置
const miniprogramAlipayConfig = {
  input: 'src/entries/alipay.ts',
  output: {
    file: 'dist/miniprogram/alipay/index.js',
    format: 'cjs',
    banner,
    sourcemap: true,
    exports: 'named',
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.ALIPAY),
      isProd &&
        visualizer({
          filename: 'stats/alipay.html',
          title: 'FileChunkPro Alipay Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.ALIPAY
  ),
  external: ['react', 'vue'],
};

// 字节跳动小程序构建配置
const miniprogramBytedanceConfig = {
  input: 'src/entries/bytedance.ts',
  output: {
    file: 'dist/miniprogram/bytedance/index.js',
    format: 'cjs',
    banner,
    sourcemap: true,
    exports: 'named',
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.BYTEDANCE),
      isProd &&
        visualizer({
          filename: 'stats/bytedance.html',
          title: 'FileChunkPro Bytedance Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.BYTEDANCE
  ),
  external: ['react', 'vue'],
};

// 百度小程序构建配置
const miniprogramBaiduConfig = {
  input: 'src/entries/baidu.ts',
  output: {
    file: 'dist/miniprogram/baidu/index.js',
    format: 'cjs',
    banner,
    sourcemap: true,
    exports: 'named',
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.BAIDU),
      isProd &&
        visualizer({
          filename: 'stats/baidu.html',
          title: 'FileChunkPro Baidu Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.BAIDU
  ),
  external: ['react', 'vue'],
};

// Taro框架构建配置
const taroConfig = {
  input: 'src/entries/taro.ts',
  output: {
    file: 'dist/taro/index.js',
    format: 'cjs',
    banner,
    sourcemap: true,
    exports: 'named',
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.TARO),
      isProd &&
        visualizer({
          filename: 'stats/taro.html',
          title: 'FileChunkPro Taro Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.TARO
  ),
  external: ['react', 'vue', '@tarojs/taro', '@tarojs/components'],
};

// 同时生成ES Module格式的Taro构建
const taroESMConfig = {
  input: 'src/entries/taro.ts',
  output: {
    file: 'dist/taro/index.mjs',
    format: 'es',
    banner,
    sourcemap: true,
  },
  plugins: addOptimization([...createBasePlugins(TARGETS.TARO)], TARGETS.TARO),
  external: ['react', 'vue', '@tarojs/taro', '@tarojs/components'],
};

// UniApp框架构建配置
const uniAppConfig = {
  input: 'src/entries/uni-app.ts',
  output: {
    file: 'dist/uni-app/index.js',
    format: 'cjs',
    banner,
    sourcemap: true,
    exports: 'named',
  },
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.UNIAPP),
      isProd &&
        visualizer({
          filename: 'stats/uni-app.html',
          title: 'FileChunkPro UniApp Bundle Analysis',
          gzipSize: true,
        }),
    ],
    TARGETS.UNIAPP
  ),
  external: ['react', 'vue', 'uni-app'],
};

// 同时生成ES Module格式的UniApp构建
const uniAppESMConfig = {
  input: 'src/entries/uni-app.ts',
  output: {
    file: 'dist/uni-app/index.mjs',
    format: 'es',
    banner,
    sourcemap: true,
  },
  plugins: addOptimization(
    [...createBasePlugins(TARGETS.UNIAPP)],
    TARGETS.UNIAPP
  ),
  external: ['react', 'vue', 'uni-app'],
};

// React组件构建配置
const reactComponentConfig = {
  input: 'src/ui/react/index.tsx',
  output: [
    {
      file: 'dist/browser/ui/react/index.js',
      format: 'es',
      banner,
      sourcemap: true,
    },
    {
      file: 'dist/browser/ui/react/index.cjs',
      format: 'cjs',
      banner,
      exports: 'named',
      sourcemap: true,
    },
  ],
  plugins: addOptimization(
    [...createBasePlugins(TARGETS.BROWSER)],
    TARGETS.BROWSER
  ),
  external: ['react', 'react-dom'],
};

// Vue组件构建配置
const vueComponentConfig = {
  input: 'src/ui/vue/index.ts',
  output: [
    {
      file: 'dist/browser/ui/vue/index.js',
      format: 'es',
      banner,
      sourcemap: true,
    },
    {
      file: 'dist/browser/ui/vue/index.cjs',
      format: 'cjs',
      banner,
      exports: 'named',
      sourcemap: true,
    },
  ],
  plugins: addOptimization(
    [
      ...createBasePlugins(TARGETS.BROWSER),
      vuePlugin(), // Vue文件处理
    ],
    TARGETS.BROWSER
  ),
  external: ['vue'],
};

// 类型声明构建配置
const dtsConfig = {
  input: 'src/index.ts',
  output: {
    file: 'types/index.d.ts',
    format: 'es',
    banner,
  },
  plugins: [dtsPlugin()],
};

// React组件类型声明
const reactDtsConfig = {
  input: 'src/ui/react/index.tsx',
  output: {
    file: 'types/ui/react.d.ts',
    format: 'es',
    banner,
  },
  plugins: [dtsPlugin()],
};

// Vue组件类型声明
const vueDtsConfig = {
  input: 'src/ui/vue/index.ts',
  output: {
    file: 'types/ui/vue.d.ts',
    format: 'es',
    banner,
  },
  plugins: [dtsPlugin()],
};

// 根据目标选择配置
const selectConfigs = () => {
  // 浏览器构建
  if (TARGET === 'browser') {
    return [
      browserESMConfig,
      browserCJSConfig,
      browserUMDConfig,
      reactComponentConfig,
      vueComponentConfig,
      dtsConfig,
      reactDtsConfig,
      vueDtsConfig,
    ];
  }

  // 小程序构建
  if (TARGET === 'miniprogram') {
    return [
      miniprogramWechatConfig,
      miniprogramAlipayConfig,
      miniprogramBytedanceConfig,
      miniprogramBaiduConfig,
      dtsConfig,
    ];
  }

  // Taro构建
  if (TARGET === 'taro') {
    return [taroConfig, taroESMConfig, dtsConfig];
  }

  // UniApp构建
  if (TARGET === 'uni-app') {
    return [uniAppConfig, uniAppESMConfig, dtsConfig];
  }

  // 默认返回所有配置
  return [
    browserESMConfig,
    browserCJSConfig,
    browserUMDConfig,
    miniprogramWechatConfig,
    miniprogramAlipayConfig,
    miniprogramBytedanceConfig,
    miniprogramBaiduConfig,
    taroConfig,
    taroESMConfig,
    uniAppConfig,
    uniAppESMConfig,
    reactComponentConfig,
    vueComponentConfig,
    dtsConfig,
    reactDtsConfig,
    vueDtsConfig,
  ];
};

module.exports = selectConfigs();
