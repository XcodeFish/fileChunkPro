/**
 * 示例应用构建配置
 */

const { resolve } = require('path');
const { defineConfig } = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const nodeResolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const terser = require('@rollup/plugin-terser');
const replace = require('@rollup/plugin-replace');
const esbuildPlugin = require('rollup-plugin-esbuild').default;

const isProd = process.env.NODE_ENV === 'production';

/**
 * 创建示例应用的Rollup配置
 * @param {string} input 入口文件路径
 * @param {string} output 输出文件路径
 */
function createExampleConfig(input, output) {
  return defineConfig({
    input,
    output: {
      file: output,
      format: 'iife',
      name: 'FileChunkProExample',
      sourcemap: !isProd,
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(
          isProd ? 'production' : 'development'
        ),
      }),
      nodeResolve({
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        browser: true,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        sourceMap: !isProd,
      }),
      esbuildPlugin({
        target: 'es2018',
        minify: isProd,
      }),
      isProd &&
        terser({
          compress: {
            ecma: 2018,
            pure_getters: true,
          },
        }),
    ],
  });
}

// 构建断点续传示例
const resumeUploadExample = createExampleConfig(
  'examples/resume-upload.js',
  'dist/browser/resume-example.js'
);

// 导出所有示例配置
module.exports = [resumeUploadExample];
