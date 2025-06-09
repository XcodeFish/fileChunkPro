/* eslint-disable */
/**
 * 环境变量处理插件
 * 用于处理代码中的条件编译标记，根据当前构建目标移除不相关的代码
 */

/**
 * 创建环境变量处理插件
 * @param {string} currentTarget 当前构建目标
 * @returns {import('rollup').Plugin} Rollup插件
 */
function environmentPlugin(currentTarget) {
  return {
    name: 'environment-plugin',

    transform(code, _id) {
      // 检查文件是否包含条件编译标记
      if (
        !code.includes('/* #if TARGET=') &&
        !code.includes('/* #if TARGET!=')
      ) {
        return null;
      }

      let result = code;

      // 处理匹配当前环境的代码块: /* #if TARGET=xxx */
      const includeRegex = new RegExp(
        `\\/\\* #if TARGET=${currentTarget} \\*\\/([\\s\\S]*?)\\/\\* #endif \\*\\/`,
        'g'
      );
      result = result.replace(includeRegex, '$1');

      // 处理排除当前环境的代码块: /* #if TARGET!=xxx */
      const excludeRegex = new RegExp(
        `\\/\\* #if TARGET!=${currentTarget} \\*\\/([\\s\\S]*?)\\/\\* #endif \\*\\/`,
        'g'
      );
      result = result.replace(excludeRegex, '');

      // 移除其他所有目标环境的代码块
      const remainingRegex =
        /\/\* #if TARGET=.*? \*\/([\s\S]*?)\/\* #endif \*\//g;
      result = result.replace(remainingRegex, '');

      // 移除所有剩余的排除特定环境的代码块
      const remainingExcludeRegex =
        /\/\* #if TARGET!=.*? \*\/([\s\S]*?)\/\* #endif \*\//g;
      result = result.replace(remainingExcludeRegex, '');

      if (result !== code) {
        return { code: result, map: null };
      }

      return null;
    },
  };
}

module.exports = environmentPlugin;
