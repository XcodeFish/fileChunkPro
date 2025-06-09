/**
 * 简化的Rollup配置文件
 * 用于基础测试
 */

const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const path = require('path');

const config = {
  input: 'src/temp-index.ts',
  output: {
    file: 'dist/test.js',
    format: 'esm',
  },
  plugins: [
    resolve({
      extensions: ['.ts', '.js'],
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
    }),
  ],
};

module.exports = config;
