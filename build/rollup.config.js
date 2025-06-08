import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import alias from '@rollup/plugin-alias';
import { visualizer } from 'rollup-plugin-visualizer';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// 环境变量
const isProd = process.env.NODE_ENV === 'production';
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * (c) ${new Date().getFullYear()} ${pkg.author}
 * @license ${pkg.license}
 */`;

// 基础配置
const baseConfig = {
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
  },
  plugins: [
    alias({
      entries: [
        { find: '@', replacement: new URL('../src', import.meta.url).pathname },
      ],
    }),
  ],
};

// 浏览器构建配置
const browserBuilds = [
  // ESM构建
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/browser/fileChunkPro.esm.js',
      format: 'es',
      banner,
      sourcemap: true,
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(
          isProd ? 'production' : 'development'
        ),
        'process.env.TARGET': JSON.stringify('browser'),
      }),
      resolve({
        browser: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        sourceMap: true,
        declaration: false,
      }),
      esbuild({
        target: 'es2018',
        minify: isProd,
      }),
      isProd &&
        terser({
          compress: {
            ecma: 2018,
            pure_getters: true,
          },
          format: {
            comments: function (_, comment) {
              return comment.type === 'comment2' && /^\/*!/.test(comment.value);
            },
          },
        }),
      isProd &&
        visualizer({
          filename: 'stats/browser-esm.html',
          title: 'fileChunkPro Browser ESM',
        }),
    ],
    external: Object.keys(pkg.peerDependencies || {}),
    ...baseConfig,
  },

  // CommonJS构建
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/browser/fileChunkPro.cjs.js',
      format: 'cjs',
      banner,
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(
          isProd ? 'production' : 'development'
        ),
        'process.env.TARGET': JSON.stringify('browser'),
      }),
      resolve({
        browser: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        sourceMap: true,
        declaration: false,
      }),
      esbuild({
        target: 'es2018',
        minify: isProd,
      }),
      isProd &&
        terser({
          compress: {
            ecma: 2018,
            pure_getters: true,
          },
          format: {
            comments: function (_, comment) {
              return comment.type === 'comment2' && /^\/*!/.test(comment.value);
            },
          },
        }),
    ],
    external: Object.keys(pkg.peerDependencies || {}),
    ...baseConfig,
  },

  // UMD构建
  {
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
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(
          isProd ? 'production' : 'development'
        ),
        'process.env.TARGET': JSON.stringify('browser'),
      }),
      resolve({
        browser: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        sourceMap: true,
        declaration: false,
      }),
      esbuild({
        target: 'es2018',
        minify: isProd,
      }),
      isProd &&
        terser({
          compress: {
            ecma: 2018,
            pure_getters: true,
          },
          format: {
            comments: function (_, comment) {
              return comment.type === 'comment2' && /^\/*!/.test(comment.value);
            },
          },
        }),
      isProd &&
        visualizer({
          filename: 'stats/browser-umd.html',
          title: 'fileChunkPro Browser UMD',
        }),
    ],
    external: Object.keys(pkg.peerDependencies || {}),
    ...baseConfig,
  },
];

// 类型声明构建
const dtsBuilds = [
  {
    input: 'src/index.ts',
    output: {
      file: 'types/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
  {
    input: 'src/ui/react/index.ts',
    output: {
      file: 'types/ui/react.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
  {
    input: 'src/ui/vue/index.ts',
    output: {
      file: 'types/ui/vue.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
];

// 小程序构建
const miniprogramBuilds = [
  // 微信小程序
  {
    input: 'src/entries/wechat.ts',
    output: {
      file: 'dist/miniprogram/wechat/index.js',
      format: 'cjs',
      banner,
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(
          isProd ? 'production' : 'development'
        ),
        'process.env.TARGET': JSON.stringify('wechat'),
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      esbuild({
        target: 'es2018',
        minify: isProd,
      }),
    ],
    ...baseConfig,
  },

  // 其他小程序平台类似...
];

// Taro构建
const taroBuilds = [
  {
    input: 'src/entries/taro.ts',
    output: [
      {
        file: 'dist/taro/index.js',
        format: 'cjs',
        banner,
      },
      {
        file: 'dist/taro/index.mjs',
        format: 'es',
        banner,
      },
    ],
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(
          isProd ? 'production' : 'development'
        ),
        'process.env.TARGET': JSON.stringify('taro'),
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      esbuild({
        target: 'es2018',
        minify: isProd,
      }),
    ],
    external: ['@tarojs/taro'],
    ...baseConfig,
  },
];

// uni-app构建
const uniappBuilds = [
  {
    input: 'src/entries/uniapp.ts',
    output: [
      {
        file: 'dist/uni-app/index.js',
        format: 'cjs',
        banner,
      },
      {
        file: 'dist/uni-app/index.mjs',
        format: 'es',
        banner,
      },
    ],
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(
          isProd ? 'production' : 'development'
        ),
        'process.env.TARGET': JSON.stringify('uni-app'),
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      esbuild({
        target: 'es2018',
        minify: isProd,
      }),
    ],
    external: ['uni-app'],
    ...baseConfig,
  },
];

// 合并所有构建
export default [
  ...browserBuilds,
  ...miniprogramBuilds,
  ...taroBuilds,
  ...uniappBuilds,
  ...dtsBuilds,
];
