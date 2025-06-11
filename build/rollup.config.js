/**
 * 简化的Rollup配置
 */

import { defineConfig } from 'rollup';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import babel from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import * as path from 'path';
import pkg from '../package.json';

const BUILD_TARGET = process.env.BUILD_TARGET || 'browser';
const NODE_ENV = process.env.NODE_ENV || 'production';
const isDev = NODE_ENV === 'development';

// 根据目标环境获取入口文件
const getEntry = target => {
  switch (target) {
    case 'browser':
      return 'src/index.browser.ts';
    case 'miniprogram':
      return 'src/index.miniprogram.ts';
    case 'taro':
      return 'src/index.taro.ts';
    case 'uni-app':
      return 'src/index.uni-app.ts';
    default:
      return 'src/index.browser.ts';
  }
};

// 获取输出目录
const getOutputDir = target => `dist/${target}`;

// 获取包名
const getPackageName = () => {
  const name = pkg.name.split('/').pop();
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 统一的输出配置
const outputs = target => {
  const outputDir = getOutputDir(target);

  return [
    // ESM 格式
    {
      file: `${outputDir}/index.js`,
      format: 'es',
      sourcemap: true,
    },
    // CommonJS 格式
    {
      file: `${outputDir}/index.cjs`,
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    // 仅在浏览器环境下构建UMD格式
    ...(target === 'browser'
      ? [
          // 开发UMD版本（非压缩）
          {
            file: `${outputDir}/${getPackageName()}.js`,
            format: 'umd',
            name: 'FileChunkPro',
            sourcemap: true,
            globals: {
              uuid: 'uuid',
              eventemitter3: 'EventEmitter3',
            },
          },
          // 生产UMD版本（压缩）
          {
            file: `${outputDir}/${getPackageName()}.min.js`,
            format: 'umd',
            name: 'FileChunkPro',
            sourcemap: true,
            plugins: [terser()],
            globals: {
              uuid: 'uuid',
              eventemitter3: 'EventEmitter3',
            },
          },
        ]
      : []),
  ];
};

// 插件配置
const getPlugins = target => [
  // 外部化对等依赖
  peerDepsExternal(),

  // 解析第三方依赖
  resolve({
    browser: target === 'browser',
    preferBuiltins: true,
  }),

  // 转换第三方依赖
  commonjs(),

  // 类型处理
  typescript({
    tsconfig: './tsconfig.json',
    sourceMap: true,
    declaration: false,
  }),

  // 环境变量替换
  replace({
    preventAssignment: true,
    'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
    'process.env.BUILD_TARGET': JSON.stringify(target),
  }),

  // 对浏览器构建使用Babel进行转译
  babel({
    babelHelpers: 'bundled',
    exclude: 'node_modules/**',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  }),

  // JSON支持
  json(),

  // 浏览器环境需要Node.js polyfills
  ...(target === 'browser' ? [nodePolyfills()] : []),
];

// 构建配置
const buildConfig = target => ({
  input: getEntry(target),
  output: outputs(target),
  plugins: getPlugins(target),
  external: Object.keys(pkg.dependencies || {}),
  watch: {
    include: 'src/**',
    exclude: 'node_modules/**',
  },
});

// 类型声明生成配置
const dtsConfig = target => ({
  input: getEntry(target),
  output: {
    file: `${getOutputDir(target)}/index.d.ts`,
    format: 'es',
  },
  plugins: [dts()],
});

// 插件导出配置
const pluginsConfig = {
  input: 'src/plugins/index.ts',
  output: [
    {
      dir: 'dist/plugins',
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src/plugins',
    },
    {
      dir: 'dist/plugins',
      format: 'cjs',
      entryFileNames: '[name].cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/plugins',
    },
  ],
  plugins: getPlugins('browser'),
};

// 适配器导出配置
const adaptersConfig = {
  input: 'src/adapters/index.ts',
  output: [
    {
      dir: 'dist/adapters',
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src/adapters',
    },
    {
      dir: 'dist/adapters',
      format: 'cjs',
      entryFileNames: '[name].cjs',
      preserveModules: true,
      preserveModulesRoot: 'src/adapters',
    },
  ],
  plugins: getPlugins('browser'),
};

// 导出配置
export default defineConfig([
  buildConfig(BUILD_TARGET),
  // 产品环境才构建类型声明、插件和适配器
  ...(isDev ? [] : [dtsConfig(BUILD_TARGET), pluginsConfig, adaptersConfig]),
]);
