/* eslint-disable */
/**
 * 完整的Rollup配置文件
 * 支持多环境构建与条件编译
 */

const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const terser = require('@rollup/plugin-terser');
const replace = require('@rollup/plugin-replace');
const dtsPlugin = require('rollup-plugin-dts').default;
const esbuildPlugin = require('rollup-plugin-esbuild').default;
const alias = require('@rollup/plugin-alias');
const visualizer = require('rollup-plugin-visualizer').visualizer;
const path = require('path');

// 导入自定义插件
const environmentPlugin = require('./plugins/environment-plugin');
const workerPlugin = require('./plugins/worker-plugin');

// 导入Vue支持插件
const vuePlugin = require('rollup-plugin-vue');

const pkg = require('../package.json');

// 构建模式
const isProd = process.env.NODE_ENV === 'production';
const TARGET = process.env.TARGET || 'browser';

// 支持的环境目标
const targets = {
  BROWSER: 'browser',
  MINIPROGRAM: 'miniprogram',
  TARO: 'taro',
  UNIAPP: 'uni-app',
};

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

// 添加压缩插件
const addTerser = plugins =>
  isProd
    ? [
        ...plugins,
        terser({
          compress: {
            ecma: 2018,
            pure_getters: true,
            passes: 2,
          },
          format: {
            comments: (_, comment) =>
              comment.type === 'comment2' && /^\/*!/.test(comment.value),
          },
        }),
      ]
    : plugins;

// 浏览器构建配置 (ES Module)
const browserESMConfig = {
  input: 'src/index.ts',
  output: {
    file: 'dist/browser/fileChunkPro.esm.js',
    format: 'es',
    banner,
    sourcemap: true,
  },
  plugins: addTerser([
    ...createBasePlugins('browser'),
    isProd &&
      visualizer({
        filename: 'stats/browser-esm.html',
        title: 'FileChunkPro Browser ESM Bundle Analysis',
        gzipSize: true,
      }),
  ]),
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
  plugins: addTerser([
    ...createBasePlugins('browser'),
    isProd &&
      visualizer({
        filename: 'stats/browser-cjs.html',
        title: 'FileChunkPro Browser CJS Bundle Analysis',
        gzipSize: true,
      }),
  ]),
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
  plugins: addTerser([
    ...createBasePlugins('browser'),
    isProd &&
      visualizer({
        filename: 'stats/browser-umd.html',
        title: 'FileChunkPro Browser UMD Bundle Analysis',
        gzipSize: true,
      }),
  ]),
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
  plugins: addTerser([
    ...createBasePlugins('wechat'),
    isProd &&
      visualizer({
        filename: 'stats/wechat.html',
        title: 'FileChunkPro WeChat Bundle Analysis',
        gzipSize: true,
      }),
  ]),
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
  plugins: addTerser([
    ...createBasePlugins('alipay'),
    isProd &&
      visualizer({
        filename: 'stats/alipay.html',
        title: 'FileChunkPro Alipay Bundle Analysis',
        gzipSize: true,
      }),
  ]),
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
  plugins: addTerser([
    ...createBasePlugins('bytedance'),
    isProd &&
      visualizer({
        filename: 'stats/bytedance.html',
        title: 'FileChunkPro ByteDance Bundle Analysis',
        gzipSize: true,
      }),
  ]),
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
  plugins: addTerser([
    ...createBasePlugins('baidu'),
    isProd &&
      visualizer({
        filename: 'stats/baidu.html',
        title: 'FileChunkPro Baidu Bundle Analysis',
        gzipSize: true,
      }),
  ]),
  external: ['react', 'vue'],
};

// Taro构建配置
const taroConfig = {
  input: 'src/entries/taro.ts',
  output: [
    {
      file: 'dist/taro/index.js',
      format: 'cjs',
      banner,
      sourcemap: true,
      exports: 'named',
    },
    {
      file: 'dist/taro/index.mjs',
      format: 'es',
      banner,
      sourcemap: true,
    },
  ],
  plugins: addTerser([
    ...createBasePlugins('taro'),
    isProd &&
      visualizer({
        filename: 'stats/taro.html',
        title: 'FileChunkPro Taro Bundle Analysis',
        gzipSize: true,
      }),
  ]),
  external: ['@tarojs/taro', 'react', 'vue'],
};

// Uni-app构建配置
const uniAppConfig = {
  input: 'src/entries/uniapp.ts',
  output: [
    {
      file: 'dist/uni-app/index.js',
      format: 'cjs',
      banner,
      sourcemap: true,
      exports: 'named',
    },
    {
      file: 'dist/uni-app/index.mjs',
      format: 'es',
      banner,
      sourcemap: true,
    },
  ],
  plugins: addTerser([
    ...createBasePlugins('uni-app'),
    isProd &&
      visualizer({
        filename: 'stats/uni-app.html',
        title: 'FileChunkPro UniApp Bundle Analysis',
        gzipSize: true,
      }),
  ]),
  external: ['react', 'vue'],
};

// UI组件构建 (React)
const reactUIConfig = {
  input: 'src/ui/react/index.ts',
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
      sourcemap: true,
      exports: 'auto',
    },
  ],
  plugins: addTerser([
    ...createBasePlugins('browser'),
    esbuildPlugin({
      target: 'es2018',
      minify: isProd,
      jsx: 'automatic',
    }),
  ]),
  external: ['react', 'react-dom', '../../index'],
};

// 根据目标选择配置
let configs = [];

switch (TARGET) {
  case targets.BROWSER:
    configs = [
      browserESMConfig,
      browserCJSConfig,
      browserUMDConfig,
      reactUIConfig,
    ];
    break;

  case targets.MINIPROGRAM:
    configs = [
      miniprogramWechatConfig,
      miniprogramAlipayConfig,
      miniprogramBytedanceConfig,
      miniprogramBaiduConfig,
    ];
    break;

  case targets.TARO:
    configs = [taroConfig];
    break;

  case targets.UNIAPP:
    configs = [uniAppConfig];
    break;

  default:
    console.log(`Building for target: ${TARGET}`);
    configs = [
      browserESMConfig,
      browserCJSConfig,
      browserUMDConfig,
      miniprogramWechatConfig,
      miniprogramAlipayConfig,
      miniprogramBytedanceConfig,
      miniprogramBaiduConfig,
      taroConfig,
      uniAppConfig,
      reactUIConfig,
    ];
}

module.exports = configs;
