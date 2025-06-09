/**
 * 简化的Rollup配置
 */

const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const terser = require('@rollup/plugin-terser');
const replace = require('@rollup/plugin-replace');
const dtsPlugin = require('rollup-plugin-dts').default;
const esbuildPlugin = require('rollup-plugin-esbuild').default;
const path = require('path');

const pkg = require('../package.json');

// 环境变量
const isProd = process.env.NODE_ENV === 'production';
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * (c) ${new Date().getFullYear()} ${pkg.author}
 * @license ${pkg.license}
 */`;

// 基础插件配置
const createBasePlugins = target => [
  replace({
    preventAssignment: true,
    'process.env.NODE_ENV': JSON.stringify(
      isProd ? 'production' : 'development'
    ),
    'process.env.TARGET': JSON.stringify(target),
  }),
  resolve({
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    browser: target === 'browser',
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    sourceMap: true,
  }),
  esbuildPlugin({
    target: 'es2018',
    minify: isProd,
  }),
];

// 浏览器构建
const browserConfig = {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/browser/fileChunkPro.esm.js',
      format: 'es',
      banner,
      sourcemap: true,
    },
    {
      file: 'dist/browser/fileChunkPro.cjs.js',
      format: 'cjs',
      banner,
      exports: 'named',
      sourcemap: true,
    },
    {
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
  ],
  plugins: [
    ...createBasePlugins('browser'),
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
};

// 类型声明构建
const dtsConfig = {
  input: 'src/index.ts',
  output: {
    file: 'types/index.d.ts',
    format: 'es',
  },
  plugins: [dtsPlugin()],
};

// 导出所有配置
module.exports = [browserConfig, dtsConfig];
