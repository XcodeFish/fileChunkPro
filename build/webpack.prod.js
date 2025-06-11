const path = require('path');
const { merge } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');
const commonConfig = require('./webpack.common.js');
const HtmlMinimizerPlugin = require('html-minimizer-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { SourceMapDevToolPlugin } = require('webpack');
const { BANNER } = require('./constants');

/**
 * 源映射安全处理插件
 * 用于移除或修改源映射中的敏感路径信息
 */
class SourceMapSanitizerPlugin {
  constructor(options = {}) {
    this.options = {
      // 需要替换的路径前缀，例如本地绝对路径
      pathReplacements: options.pathReplacements || [
        { from: process.cwd(), to: '' },
      ],
      // 需要从源映射中完全移除的文件路径正则表达式
      excludeSourcePatterns: options.excludeSourcePatterns || [
        /node_modules\/.*\/secrets\//,
        /\/private\//,
        /\/config\/credentials\//,
      ],
      // 是否移除所有node_modules路径
      hideNodeModules:
        options.hideNodeModules !== undefined ? options.hideNodeModules : true,
      // 是否使用相对路径替换绝对路径
      useRelativePaths:
        options.useRelativePaths !== undefined
          ? options.useRelativePaths
          : true,
    };
  }

  apply(compiler) {
    // 在处理资源后执行
    compiler.hooks.afterCompile.tap('SourceMapSanitizerPlugin', compilation => {
      // 遍历所有生成的资源
      for (const asset of compilation.getAssets()) {
        // 只处理source map文件
        if (!asset.name.endsWith('.map')) {
          continue;
        }

        try {
          // 获取源映射内容
          const sourceMapContent = JSON.parse(asset.source.source().toString());

          // 处理sources字段中的路径
          if (Array.isArray(sourceMapContent.sources)) {
            sourceMapContent.sources = sourceMapContent.sources.map(
              sourcePath => {
                // 移除符合排除模式的源文件
                if (this.shouldExcludeSource(sourcePath)) {
                  return '[源文件已隐藏]';
                }

                // 处理node_modules路径
                if (
                  this.options.hideNodeModules &&
                  sourcePath.includes('node_modules')
                ) {
                  const parts = sourcePath.split('node_modules/');
                  if (parts.length > 1) {
                    return `~/npm/${parts[parts.length - 1]}`;
                  }
                }

                // 替换敏感路径
                let processedPath = sourcePath;
                for (const replacement of this.options.pathReplacements) {
                  if (processedPath.includes(replacement.from)) {
                    processedPath = processedPath.replace(
                      replacement.from,
                      replacement.to
                    );
                  }
                }

                // 使用相对路径
                if (
                  this.options.useRelativePaths &&
                  processedPath.startsWith('/')
                ) {
                  processedPath = processedPath.replace(/^\/+/, '');
                }

                return processedPath;
              }
            );
          }

          // 更新源映射资源
          compilation.updateAsset(
            asset.name,
            new compiler.webpack.sources.RawSource(
              JSON.stringify(sourceMapContent)
            )
          );
        } catch (error) {
          compilation.warnings.push(
            new Error(
              `[SourceMapSanitizerPlugin] Failed to process ${asset.name}: ${error.message}`
            )
          );
        }
      }
    });
  }

  shouldExcludeSource(sourcePath) {
    return this.options.excludeSourcePatterns.some(pattern =>
      pattern.test(sourcePath)
    );
  }
}

module.exports = merge(commonConfig, {
  mode: 'production',
  devtool: 'hidden-source-map', // 生成源映射但不在JS文件中添加引用注释
  output: {
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].chunk.js',
    // 确保清理之前的构建文件
    clean: true,
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false, // 删除注释
          },
          compress: {
            drop_console: true, // 移除console语句
            drop_debugger: true, // 移除debugger语句
          },
        },
        extractComments: false, // 不提取注释到单独文件
      }),
      new CssMinimizerPlugin(),
      new HtmlMinimizerPlugin(),
    ],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: -10,
        },
        common: {
          name: 'common',
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },
  plugins: [
    // 自定义源映射生成，不包含源码引用链接
    new SourceMapDevToolPlugin({
      filename: '[file].map',
      append: `\n//${BANNER}`,
      // 不添加sourceMappingURL注释到JS文件
      noSources: false,
      moduleFilenameTemplate: info => {
        // 处理源文件路径，移除敏感信息
        const relativePath = path
          .relative(process.cwd(), info.absoluteResourcePath)
          .replace(/\\/g, '/');
        return `webpack:///${relativePath}`;
      },
    }),
    // 源映射安全处理
    new SourceMapSanitizerPlugin({
      pathReplacements: [{ from: process.cwd(), to: 'fileChunkPro' }],
      excludeSourcePatterns: [/config\/credentials/, /secrets\//, /private\//],
      hideNodeModules: true,
      useRelativePaths: true,
    }),
  ],
});
