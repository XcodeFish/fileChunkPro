/* eslint-disable */
/**
 * 包大小报告工具
 * 用于分析和监控各个输出包的大小
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const chalk = require('chalk'); // 需要安装: pnpm add chalk -D

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的大小
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 获取文件大小信息
 * @param {string} filePath 文件路径
 * @returns {Object} 大小信息对象
 */
function getFileSizeInfo(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    const size = content.length;
    const gzippedSize = zlib.gzipSync(content).length;

    return {
      path: filePath,
      size,
      gzippedSize,
      sizeFormatted: formatSize(size),
      gzippedSizeFormatted: formatSize(gzippedSize),
    };
  } catch (error) {
    console.error(`读取文件 ${filePath} 失败:`, error);
    return null;
  }
}

/**
 * 生成构建大小报告
 * @param {string} distDir 输出目录
 * @param {Object} thresholds 大小阈值（警告/错误）
 */
function generateSizeReport(distDir = 'dist', thresholds = {}) {
  const defaultThresholds = {
    warning: 50 * 1024, // 50KB
    error: 100 * 1024, // 100KB
    ...thresholds,
  };

  console.log(chalk.bold('\n📦 包大小报告:\n'));
  console.log(
    chalk.gray('文件'.padEnd(60) + '大小'.padEnd(15) + 'Gzipped'.padEnd(15))
  );
  console.log(chalk.gray('-'.repeat(90)));

  // 递归遍历目录并收集所有JS文件
  function collectJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        collectJsFiles(filePath, fileList);
      } else if (
        file.endsWith('.js') &&
        !file.endsWith('.min.js') &&
        !file.includes('.map')
      ) {
        fileList.push(filePath);
      }
    });

    return fileList;
  }

  try {
    const jsFiles = collectJsFiles(distDir);
    const sizeInfos = jsFiles
      .map(getFileSizeInfo)
      .filter(Boolean)
      .sort((a, b) => b.size - a.size);

    let hasWarnings = false;
    let hasErrors = false;

    sizeInfos.forEach(info => {
      const relativePath = path.relative(process.cwd(), info.path);
      let sizeColor = chalk.green;

      if (info.size > defaultThresholds.error) {
        sizeColor = chalk.red;
        hasErrors = true;
      } else if (info.size > defaultThresholds.warning) {
        sizeColor = chalk.yellow;
        hasWarnings = true;
      }

      console.log(
        chalk.cyan(relativePath.padEnd(60)) +
          sizeColor(info.sizeFormatted.padEnd(15)) +
          chalk.blue(info.gzippedSizeFormatted.padEnd(15))
      );
    });

    console.log(chalk.gray('-'.repeat(90)));

    // 汇总信息
    const totalSize = sizeInfos.reduce((sum, info) => sum + info.size, 0);
    const totalGzippedSize = sizeInfos.reduce(
      (sum, info) => sum + info.gzippedSize,
      0
    );

    console.log(
      chalk.bold('总计:'.padEnd(60)) +
        chalk.bold(formatSize(totalSize).padEnd(15)) +
        chalk.bold(formatSize(totalGzippedSize).padEnd(15))
    );

    if (hasErrors) {
      console.log(chalk.red('\n⚠️ 警告: 某些包大小超过了错误阈值 (100KB)'));
    } else if (hasWarnings) {
      console.log(chalk.yellow('\n⚠️ 注意: 某些包大小超过了警告阈值 (50KB)'));
    } else {
      console.log(chalk.green('\n✅ 所有包大小都在合理范围内'));
    }

    return {
      totalSize,
      totalGzippedSize,
      files: sizeInfos,
      hasWarnings,
      hasErrors,
    };
  } catch (error) {
    console.error('生成大小报告时出错:', error);
    return null;
  }
}

module.exports = {
  formatSize,
  getFileSizeInfo,
  generateSizeReport,
};
