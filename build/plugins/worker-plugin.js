/* eslint-disable */
/**
 * Worker 处理插件
 * 支持 Worker 文件的内联与外部加载
 */

const fs = require('fs');
const path = require('path');

/**
 * 创建Worker处理插件
 * @param {Object} options 插件选项
 * @param {boolean} options.inline 是否内联Worker脚本
 * @param {string} options.dir Worker文件目录
 * @returns {import('rollup').Plugin} Rollup插件
 */
function workerPlugin(options = {}) {
  const { inline = true, dir = 'workers/default' } = options;

  // Worker文件目录的绝对路径
  const workerDir = path.resolve(process.cwd(), dir);

  return {
    name: 'worker-plugin',

    /**
     * 修改代码中的Worker加载逻辑
     */
    transform(code, _id) {
      // 检查文件是否有Worker加载逻辑
      if (!code.includes('WorkerManager') || !code.includes('loadWorker')) {
        return null;
      }

      // 内联模式下，将Worker脚本内联到代码中
      if (inline) {
        // 构建Worker脚本内联对象
        let inlineWorkerScripts = 'const workerScripts = {\n';

        try {
          // 读取Worker目录中的所有JS文件
          const workerFiles = fs
            .readdirSync(workerDir)
            .filter(file => file.endsWith('.js'));

          // 将每个Worker文件的内容添加到内联对象中
          for (const file of workerFiles) {
            const workerName = path.basename(file, '.js');
            const workerContent = fs.readFileSync(
              path.join(workerDir, file),
              'utf-8'
            );

            // 将Worker内容转为字符串函数
            inlineWorkerScripts += `  ${workerName}: function() { ${workerContent} },\n`;
          }

          inlineWorkerScripts += '};\n';

          // 在代码中插入内联Worker脚本
          // 查找WorkerManager类的结束位置
          const classEndIndex = code.indexOf(
            '}\n\nexport default WorkerManager;'
          );
          if (classEndIndex !== -1) {
            // 在类定义结束后插入内联Worker脚本
            const updatedCode =
              code.substring(0, classEndIndex + 1) +
              '\n\n// 内联Worker脚本\n' +
              inlineWorkerScripts +
              code.substring(classEndIndex + 1);

            return {
              code: updatedCode,
              map: null,
            };
          }
        } catch (error) {
          console.error('Worker脚本内联失败:', error);
        }
      }

      return null;
    },
  };
}

module.exports = workerPlugin;
