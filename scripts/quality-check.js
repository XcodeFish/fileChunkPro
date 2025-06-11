#!/usr/bin/env node
/**
 * 代码质量检测脚本
 * 用于检测构建产物中的冗余代码和未使用代码
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

// 配置项
const config = {
  // 构建目录
  buildDir: 'dist',
  // 源代码目录
  sourceDir: 'src',
  // 体积阈值(KB)
  sizeThresholds: {
    warning: 50, // 50KB
    error: 100, // 100KB
  },
  // 重复代码检测阈值
  duplicationThreshold: 5, // 5行以上的重复代码
};

/**
 * 递归获取所有JS文件
 * @param {string} dir 目录
 * @param {Array} fileList 文件列表
 * @returns {Array} 文件列表
 */
function collectJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      collectJsFiles(filePath, fileList);
    } else if (file.endsWith('.js') && !file.includes('.map')) {
      fileList.push({
        path: filePath,
        size: stat.size,
        sizeKB: (stat.size / 1024).toFixed(2),
      });
    }
  });

  return fileList;
}

/**
 * 显示脚本使用方法
 */
function showUsage() {
  console.log(`
${chalk.cyan('代码质量检测工具')}

使用方法:
  node scripts/quality-check.js [options]

选项:
  --check-unused       检测未使用的代码
  --check-duplicated   检测重复代码
  --check-size         检测体积异常的文件
  --check-all          执行所有检查
  --fix                尝试自动修复问题
  --help               显示帮助信息
  `);
}

/**
 * 检测构建产物中可能的未使用代码
 * 使用ts-prune检测源码中未导出的代码
 * @param {boolean} fix 是否尝试修复
 */
async function checkUnusedCode(fix = false) {
  console.log(chalk.cyan('\n正在检测未使用的代码...'));

  try {
    // 检查是否安装了ts-prune
    try {
      execSync('npx ts-prune --version', { stdio: 'ignore' });
    } catch (e) {
      console.log(chalk.yellow('ts-prune未安装, 正在安装...'));
      execSync('npm install -D ts-prune', { stdio: 'inherit' });
    }

    // 运行ts-prune检测未使用的导出
    const unusedExports = execSync('npx ts-prune', { encoding: 'utf-8' });

    // 对结果进行分析
    const lines = unusedExports
      .split('\n')
      .filter(line => line.trim() && !line.includes('used in module'));

    if (lines.length > 0) {
      console.log(chalk.yellow(`\n检测到${lines.length}个未使用的导出:`));
      lines.forEach(line => {
        console.log(chalk.gray(`  - ${line}`));
      });

      if (fix) {
        console.log(
          chalk.yellow(
            '\n注意: 自动修复未使用代码需要人工确认，请手动检查以上文件。'
          )
        );
      }
    } else {
      console.log(chalk.green('✓ 未检测到未使用的导出'));
    }

    return lines.length === 0;
  } catch (error) {
    console.error(chalk.red(`检测未使用代码时出错: ${error.message}`));
    return false;
  }
}

/**
 * 检测重复代码
 * @param {boolean} fix 是否尝试修复
 */
async function checkDuplicatedCode(fix = false) {
  console.log(chalk.cyan('\n正在检测重复代码...'));

  try {
    // 检查是否安装了jscpd
    try {
      execSync('npx jscpd --version', { stdio: 'ignore' });
    } catch (e) {
      console.log(chalk.yellow('jscpd未安装, 正在安装...'));
      execSync('npm install -D jscpd', { stdio: 'inherit' });
    }

    // 创建临时报告目录
    const reportDir = path.join(process.cwd(), 'temp-report');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // 运行jscpd检测重复代码
    execSync(
      `npx jscpd src --output ${reportDir} --min-lines ${config.duplicationThreshold} --reporters json`,
      { encoding: 'utf-8' }
    );

    // 解析JSON报告
    const reportFile = path.join(reportDir, 'jscpd-report.json');
    if (fs.existsSync(reportFile)) {
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf-8'));

      if (report.statistics.total.duplicatedLines > 0) {
        const dupPercent = (
          (report.statistics.total.duplicatedLines /
            report.statistics.total.lines) *
          100
        ).toFixed(2);

        console.log(chalk.yellow(`\n检测到代码重复率: ${dupPercent}%`));
        console.log(
          chalk.yellow(
            `重复行数: ${report.statistics.total.duplicatedLines} / ${report.statistics.total.lines}`
          )
        );
        console.log(
          chalk.yellow(`重复块数: ${report.statistics.total.duplicates}`)
        );

        // 显示前10个重复代码片段
        if (report.duplicates && report.duplicates.length > 0) {
          console.log(chalk.yellow('\n重复代码片段示例:'));

          const topDuplicates = report.duplicates.slice(0, 10);
          topDuplicates.forEach((duplicate, index) => {
            console.log(chalk.gray(`\n重复片段 #${index + 1}:`));
            console.log(
              chalk.gray(
                `  - 来源文件: ${duplicate.firstFile.name}:${duplicate.firstFile.start}-${duplicate.firstFile.end}`
              )
            );
            console.log(
              chalk.gray(
                `  - 重复文件: ${duplicate.secondFile.name}:${duplicate.secondFile.start}-${duplicate.secondFile.end}`
              )
            );
            console.log(chalk.gray(`  - 重复行数: ${duplicate.lines}`));
          });
        }

        if (fix) {
          console.log(
            chalk.yellow(
              '\n注意: 修复重复代码需要人工介入，请检查上述文件并考虑抽取共享函数。'
            )
          );
        }
      } else {
        console.log(chalk.green('✓ 未检测到重复代码'));
      }

      // 删除临时报告目录
      fs.rmSync(reportDir, { recursive: true, force: true });

      return report.statistics.total.duplicatedLines === 0;
    } else {
      console.log(chalk.yellow('未生成重复代码报告，可能没有检测到重复代码'));

      // 删除临时报告目录
      if (fs.existsSync(reportDir)) {
        fs.rmSync(reportDir, { recursive: true, force: true });
      }

      return true;
    }
  } catch (error) {
    console.error(chalk.red(`检测重复代码时出错: ${error.message}`));
    return false;
  }
}

/**
 * 检测体积异常的文件
 * @param {boolean} fix 是否尝试修复
 */
async function checkFileSizes(fix = false) {
  console.log(chalk.cyan('\n正在检测构建产物体积...'));

  try {
    if (!fs.existsSync(config.buildDir)) {
      console.log(
        chalk.yellow(`构建目录 ${config.buildDir} 不存在，请先构建项目`)
      );
      return false;
    }

    const jsFiles = collectJsFiles(config.buildDir);

    // 按体积排序
    jsFiles.sort((a, b) => b.size - a.size);

    // 检测超出阈值的文件
    const errorFiles = jsFiles.filter(
      file => file.size > config.sizeThresholds.error * 1024
    );
    const warningFiles = jsFiles.filter(
      file =>
        file.size > config.sizeThresholds.warning * 1024 &&
        file.size <= config.sizeThresholds.error * 1024
    );

    // 显示结果
    if (errorFiles.length > 0 || warningFiles.length > 0) {
      console.log(chalk.yellow('\n检测到体积异常的文件:'));

      if (errorFiles.length > 0) {
        console.log(chalk.red('\n错误: 以下文件超出体积错误阈值 (100KB):'));
        errorFiles.forEach(file => {
          console.log(chalk.red(`  - ${file.path}: ${file.sizeKB} KB`));
        });
      }

      if (warningFiles.length > 0) {
        console.log(chalk.yellow('\n警告: 以下文件超出体积警告阈值 (50KB):'));
        warningFiles.forEach(file => {
          console.log(chalk.yellow(`  - ${file.path}: ${file.sizeKB} KB`));
        });
      }

      if (fix) {
        console.log(chalk.yellow('\n优化建议:'));
        console.log(chalk.gray('1. 检查是否包含未使用的依赖'));
        console.log(chalk.gray('2. 考虑拆分大文件为多个小模块'));
        console.log(chalk.gray('3. 确保启用了代码压缩和tree-shaking'));
        console.log(chalk.gray('4. 使用动态导入拆分代码'));
      }
    } else {
      console.log(chalk.green('✓ 所有文件体积在合理范围内'));
    }

    return errorFiles.length === 0;
  } catch (error) {
    console.error(chalk.red(`检测文件体积时出错: ${error.message}`));
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);

  // 显示帮助
  if (args.includes('--help')) {
    showUsage();
    process.exit(0);
  }

  // 是否尝试修复
  const shouldFix = args.includes('--fix');

  // 执行哪些检查
  const shouldCheckAll = args.includes('--check-all');
  const shouldCheckUnused = shouldCheckAll || args.includes('--check-unused');
  const shouldCheckDuplicated =
    shouldCheckAll || args.includes('--check-duplicated');
  const shouldCheckSize = shouldCheckAll || args.includes('--check-size');

  // 如果没有指定任何检查，显示帮助
  if (!shouldCheckUnused && !shouldCheckDuplicated && !shouldCheckSize) {
    showUsage();
    process.exit(1);
  }

  console.log(chalk.bold.cyan('🔍 开始代码质量检查'));

  let allPassed = true;

  // 按顺序执行检查
  if (shouldCheckUnused) {
    const unusedPassed = await checkUnusedCode(shouldFix);
    allPassed = allPassed && unusedPassed;
  }

  if (shouldCheckDuplicated) {
    const duplicatedPassed = await checkDuplicatedCode(shouldFix);
    allPassed = allPassed && duplicatedPassed;
  }

  if (shouldCheckSize) {
    const sizePassed = await checkFileSizes(shouldFix);
    allPassed = allPassed && sizePassed;
  }

  // 总结
  console.log('\n' + '-'.repeat(50));
  if (allPassed) {
    console.log(chalk.green.bold('✅ 所有检查通过!'));
  } else {
    console.log(chalk.yellow.bold('⚠️ 检查发现一些问题，请查看上面的报告。'));
    console.log(chalk.gray('提示: 使用 --fix 参数可获取修复建议'));
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error(chalk.red(`执行过程中出错: ${error.message}`));
  process.exit(1);
});
