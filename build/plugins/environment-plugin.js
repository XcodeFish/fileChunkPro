/* eslint-disable */
/**
 * 环境变量处理插件
 * 用于处理代码中的条件编译标记，根据当前构建目标移除不相关的代码
 * 支持嵌套条件、AND/OR逻辑
 */

/**
 * 创建环境变量处理插件
 * @param {Object} options 插件选项
 * @param {string} options.target 当前构建目标
 * @param {boolean} options.isProd 是否为生产环境
 * @returns {import('rollup').Plugin} Rollup插件
 */
function environmentPlugin(options) {
  const { target, isProd } =
    typeof options === 'string'
      ? { target: options, isProd: process.env.NODE_ENV === 'production' }
      : options;

  const currentTarget = target;

  return {
    name: 'environment-plugin',

    transform(code, _id) {
      // 检查文件是否包含任何条件编译标记
      if (!hasAnyConditionalFlag(code)) {
        return null;
      }

      // 处理条件标记并保存结果
      let result = processConditionals(code, currentTarget, isProd);

      // 如果代码没有被修改，返回null（Rollup优化）
      if (result === code) {
        return null;
      }

      return {
        code: result,
        map: null,
      };
    },
  };
}

/**
 * 检查代码是否包含任何条件编译标记
 * @param {string} code 源代码
 * @returns {boolean} 是否包含条件编译标记
 */
function hasAnyConditionalFlag(code) {
  return code.includes('/* #if ') && code.includes(' #endif */');
}

/**
 * 处理所有条件编译标记
 * @param {string} code 源代码
 * @param {string} currentTarget 当前构建目标
 * @param {boolean} isProd 是否为生产环境
 * @returns {string} 处理后的代码
 */
function processConditionals(code, currentTarget, isProd) {
  // 保持迭代直到没有更多的条件标记被处理
  let result = code;
  let iterations = 0;
  let maxIterations = 20; // 防止无限循环
  let modified = false;

  // 正则表达式匹配最内层条件编译块
  const innerConditionRegex = /\/\* #if (.*?) \*\/([\s\S]*?)\/\* #endif \*\//g;

  do {
    modified = false;
    result = result.replace(
      innerConditionRegex,
      (match, condition, content) => {
        // 评估条件
        const isConditionMet = evaluateCondition(
          condition,
          currentTarget,
          isProd
        );

        // 返回条件满足时的内容，否则返回空字符串
        const replacement = isConditionMet ? content : '';

        // 如果发生了替换，标记为修改
        if (replacement !== match) {
          modified = true;
        }

        return replacement;
      }
    );

    iterations++;
  } while (
    modified &&
    iterations < maxIterations &&
    hasAnyConditionalFlag(result)
  );

  // 如果达到最大迭代次数但仍有条件标记，记录警告
  if (iterations >= maxIterations && hasAnyConditionalFlag(result)) {
    console.warn('警告: 可能存在循环嵌套条件或未正确闭合的条件编译标记。');
  }

  return result;
}

/**
 * 评估条件表达式
 * @param {string} condition 条件表达式
 * @param {string} currentTarget 当前构建目标
 * @param {boolean} isProd 是否为生产环境
 * @returns {boolean} 条件是否满足
 */
function evaluateCondition(condition, currentTarget, isProd) {
  // 支持AND条件
  if (condition.includes('&&')) {
    const subConditions = condition.split('&&').map(c => c.trim());
    return subConditions.every(cond =>
      evaluateSimpleCondition(cond, currentTarget, isProd)
    );
  }

  // 支持OR条件
  if (condition.includes('||')) {
    const subConditions = condition.split('||').map(c => c.trim());
    return subConditions.some(cond =>
      evaluateSimpleCondition(cond, currentTarget, isProd)
    );
  }

  // 简单条件
  return evaluateSimpleCondition(condition, currentTarget, isProd);
}

/**
 * 评估简单条件
 * @param {string} condition 简单条件表达式
 * @param {string} currentTarget 当前构建目标
 * @param {boolean} isProd 是否为生产环境
 * @returns {boolean} 条件是否满足
 */
function evaluateSimpleCondition(condition, currentTarget, isProd) {
  // 处理TARGET=xxx条件
  if (condition.startsWith('TARGET=')) {
    const targetValue = condition.substring('TARGET='.length);
    return currentTarget === targetValue;
  }

  // 处理TARGET!=xxx条件
  if (condition.startsWith('TARGET!=')) {
    const targetValue = condition.substring('TARGET!='.length);
    return currentTarget !== targetValue;
  }

  // 处理ENV=production/development条件
  if (condition.startsWith('ENV=')) {
    const envValue = condition.substring('ENV='.length);
    return (
      (envValue === 'production' && isProd) ||
      (envValue === 'development' && !isProd)
    );
  }

  // 处理ENV!=production/development条件
  if (condition.startsWith('ENV!=')) {
    const envValue = condition.substring('ENV!='.length);
    return (
      (envValue === 'production' && !isProd) ||
      (envValue === 'development' && isProd)
    );
  }

  // 处理BROWSER条件（当目标是浏览器时为真）
  if (condition === 'BROWSER') {
    return currentTarget === 'browser';
  }

  // 处理MINIPROGRAM条件（当目标是任何小程序时为真）
  if (condition === 'MINIPROGRAM') {
    return ['wechat', 'alipay', 'bytedance', 'baidu'].includes(currentTarget);
  }

  // 处理PROD条件（生产环境时为真）
  if (condition === 'PROD') {
    return isProd;
  }

  // 处理DEV条件（开发环境时为真）
  if (condition === 'DEV') {
    return !isProd;
  }

  // 未知条件，默认为false
  console.warn(`警告: 遇到未知条件: "${condition}"`);
  return false;
}

module.exports = environmentPlugin;
