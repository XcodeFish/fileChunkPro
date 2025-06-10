/**
 * 智能重试系统使用示例
 */
import { UploaderCore } from '../src/core/UploaderCore';
import { SmartRetryPlugin } from '../src/plugins/smartRetry';
import { RetryStrategyType, UploadErrorType } from '../src/types';

// 创建上传器实例
const uploader = new UploaderCore({
  endpoint: 'https://api.example.com/upload',
  timeout: 30000,
  retryCount: 3,
  // 禁用默认重试，由智能重试插件接管
  autoRetry: false,
});

// 创建智能重试插件实例（使用自定义配置）
const smartRetryPlugin = new SmartRetryPlugin({
  // 启用插件
  enabled: true,
  // 最大重试次数
  maxRetries: 5,
  // 启用历史数据分析
  enableHistoricalAnalysis: true,
  // 历史数据保留30分钟
  historicalDataRetention: 30 * 60 * 1000,
  // 开启调试日志
  debug: true,

  // 自定义策略选择器配置
  strategySelectorConfig: {
    // 默认使用指数退避策略
    defaultStrategyType: RetryStrategyType.EXPONENTIAL_BACKOFF,
    // 为特定错误类型设置策略
    errorTypeStrategies: {
      [UploadErrorType.NETWORK_ERROR]: RetryStrategyType.JITTERED_BACKOFF,
      [UploadErrorType.TIMEOUT_ERROR]: RetryStrategyType.EXPONENTIAL_BACKOFF,
      [UploadErrorType.SERVER_ERROR]: RetryStrategyType.STEPPED_INTERVAL,
      [UploadErrorType.RATE_LIMIT_ERROR]: RetryStrategyType.STEPPED_INTERVAL,
    },
    // 启用自适应选择
    enableAdaptiveSelection: true,
    // 使用历史数据
    useHistoricalData: true,
  },

  // 自定义指数退避配置
  exponentialBackoffConfig: {
    initialDelay: 500, // 初始延迟500毫秒
    maxDelay: 30000, // 最大延迟30秒
    factor: 2, // 指数因子2
    jitter: 0.2, // 20%随机抖动
  },

  // 自定义阶梯间隔配置
  steppedIntervalConfig: {
    intervals: [500, 1000, 3000, 7000, 15000], // 自定义延迟时间序列
  },

  // 为特定错误类型设置最大重试次数
  errorTypeMaxRetries: {
    [UploadErrorType.NETWORK_ERROR]: 5, // 网络错误最多重试5次
    [UploadErrorType.TIMEOUT_ERROR]: 4, // 超时错误最多重试4次
    [UploadErrorType.SERVER_ERROR]: 3, // 服务器错误最多重试3次
    [UploadErrorType.RATE_LIMIT_ERROR]: 3, // 速率限制错误最多重试3次
  },

  // 配置哪些错误类型应该重试
  shouldRetryMap: {
    [UploadErrorType.SECURITY_ERROR]: false, // 安全错误不重试
    [UploadErrorType.PERMISSION_ERROR]: false, // 权限错误不重试
    [UploadErrorType.VALIDATION_ERROR]: false, // 验证错误不重试
    [UploadErrorType.CANCEL_ERROR]: false, // 取消错误不重试
  },
});

// 注册插件
uploader.use(smartRetryPlugin);

// 监听智能重试事件
uploader.on('smartRetry', event => {
  console.log(
    `智能重试: 文件ID=${event.fileId}, 分片=${event.chunkIndex}, 尝试=${event.attempt}`
  );
  console.log(`使用策略: ${event.strategyType}, 延迟: ${event.delay}ms`);
  console.log(`错误类型: ${event.errorType}`);
});

// 上传示例
async function upload() {
  try {
    // 选择一个文件上传
    const file = new File(['测试文件内容'], 'test.txt', { type: 'text/plain' });

    // 启动上传
    const result = await uploader.upload(file);

    console.log('上传完成:', result);

    // 获取重试统计信息
    const retryStats = smartRetryPlugin.getRetryStats();
    console.log('重试统计:', retryStats);

    // 获取最近10条重试历史
    const retryHistory = smartRetryPlugin.getRetryHistory(10);
    console.log('重试历史:', retryHistory);
  } catch (error) {
    console.error('上传失败:', error);
  }
}

// 执行上传
upload();

// 清理资源（注释掉以避免未使用错误）
/*
function cleanup() {
  // 清除重试历史数据
  smartRetryPlugin.clearHistory();
  
  // 卸载插件
  uploader.dispose();
}

// 模拟退出时清理
// window.addEventListener('beforeunload', cleanup);
*/

// 也可以直接在退出前调用
// window.addEventListener('beforeunload', () => {
//   smartRetryPlugin.clearHistory();
//   uploader.dispose();
// });
