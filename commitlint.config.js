module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // 修复
        'docs', // 文档
        'style', // 样式调整，不影响代码逻辑
        'refactor', // 重构
        'perf', // 性能优化
        'test', // 测试
        'chore', // 构建过程或辅助工具的变动
        'revert', // 回退
        'build', // 打包构建
        'ci', // CI配置
      ],
    ],
    'scope-case': [0], // 范围格式不做严格要求
    'subject-case': [0], // 主题格式不做严格要求
    'subject-max-length': [2, 'always', 100], // 主题最大长度
  },
};
