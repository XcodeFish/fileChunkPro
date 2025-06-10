# 智能重试系统

## 简介

智能重试系统是 fileChunkPro 3.0 的一项核心功能，它使用先进的错误分析和自适应策略来优化上传重试过程。与传统的简单重试机制相比，智能重试系统可以根据错误类型、网络环境和历史数据动态调整重试策略，显著提高上传成功率并减少资源浪费。

## 主要特性

### 1. 错误分析引擎

- **错误类型分类**：将错误精确分类为24种不同的错误类型（如网络错误、超时错误、服务器错误等）
- **错误可恢复性评估**：自动判断错误是否可恢复，避免对不可恢复的错误进行无谓重试
- **错误上下文分析**：收集错误发生时的上下文信息，用于更准确的决策
- **优先级评估**：为不同类型的错误分配重试优先级，保证关键操作优先恢复

### 2. 策略选择器

- **多种策略映射**：根据错误类型和错误组选择最佳重试策略
- **网络质量感知**：基于当前网络状况动态调整重试策略
- **历史数据分析**：学习历史重试成功率，优先选择更有效的策略
- **自定义策略选择**：支持开发者实现自定义策略选择逻辑

### 3. 指数退避实现

- **多种退避算法**：
  - 固定间隔退避
  - 指数退避
  - 随机指数退避（带抖动）
  - 线性退避
  - 阶梯间隔退避
  - 网络自适应退避
  - 错误类型自适应退避
- **抖动机制**：防止同步重试导致的请求风暴
- **最大延迟限制**：避免过长的重试等待时间

### 4. 最佳实践算法

- **网络状态优化**：针对不同网络状态采用不同重试策略
- **策略历史记录**：记录并分析不同策略的成功率
- **自动退化**：连续失败后自动切换到更保守的策略
- **资源消耗控制**：避免重试过程占用过多系统资源

## 工作原理

智能重试系统的工作流程如下：

1. **错误捕获**：当上传过程中发生错误时，系统捕获错误并传递给智能重试系统
2. **错误分析**：错误分析引擎对错误进行分类、评估可恢复性并收集上下文信息
3. **策略选择**：策略选择器根据错误分析结果、网络状态和历史数据选择最佳重试策略
4. **延迟计算**：根据选定的策略和当前重试次数计算适当的延迟时间
5. **执行重试**：在计算的延迟时间后执行重试操作
6. **结果记录**：记录重试结果，更新历史数据以优化未来的决策

## 使用方法

### 基本使用

```typescript
import { UploaderCore } from 'fileChunkPro';
import { SmartRetryPlugin } from 'fileChunkPro/plugins/smartRetry';

// 创建上传器实例
const uploader = new UploaderCore({
  endpoint: 'https://api.example.com/upload',
  // 禁用默认重试，由智能重试插件接管
  autoRetry: false,
});

// 注册智能重试插件（使用默认配置）
uploader.use(new SmartRetryPlugin());

// 开始上传
uploader.upload(file);
```

### 高级配置

```typescript
import { UploaderCore } from 'fileChunkPro';
import { SmartRetryPlugin } from 'fileChunkPro/plugins/smartRetry';
import { RetryStrategyType, UploadErrorType } from 'fileChunkPro/types';

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

  // 为特定错误类型设置最大重试次数
  errorTypeMaxRetries: {
    [UploadErrorType.NETWORK_ERROR]: 5, // 网络错误最多重试5次
    [UploadErrorType.TIMEOUT_ERROR]: 4, // 超时错误最多重试4次
    [UploadErrorType.SERVER_ERROR]: 3, // 服务器错误最多重试3次
  },

  // 配置哪些错误类型应该重试
  shouldRetryMap: {
    [UploadErrorType.SECURITY_ERROR]: false, // 安全错误不重试
    [UploadErrorType.PERMISSION_ERROR]: false, // 权限错误不重试
  },
});

// 注册插件
uploader.use(smartRetryPlugin);
```

### 事件监听

```typescript
// 监听智能重试事件
uploader.on('smartRetry', event => {
  console.log(
    `智能重试: 文件ID=${event.fileId}, 分片=${event.chunkIndex}, 尝试=${event.attempt}`
  );
  console.log(`使用策略: ${event.strategyType}, 延迟: ${event.delay}ms`);
  console.log(`错误类型: ${event.errorType}`);
});
```

### 获取统计信息

```typescript
// 获取重试统计信息
const retryStats = smartRetryPlugin.getRetryStats();
console.log('重试统计:', retryStats);

// 获取最近10条重试历史
const retryHistory = smartRetryPlugin.getRetryHistory(10);
console.log('重试历史:', retryHistory);
```

### 手动清理历史数据

```typescript
// 清除重试历史数据
smartRetryPlugin.clearHistory();
```

## 配置选项

### SmartRetryPluginOptions

| 选项                     | 类型                                     | 默认值       | 描述                           |
| ------------------------ | ---------------------------------------- | ------------ | ------------------------------ |
| enabled                  | boolean                                  | true         | 是否启用插件                   |
| maxRetries               | number                                   | 5            | 默认最大重试次数               |
| enableHistoricalAnalysis | boolean                                  | true         | 是否启用历史错误分析           |
| historicalDataRetention  | number                                   | 30 _60_ 1000 | 历史数据保留时长（毫秒）       |
| debug                    | boolean                                  | false        | 是否启用调试日志               |
| strategySelectorConfig   | Partial\<RetryStrategySelectorConfig\>   | -            | 策略选择器配置                 |
| exponentialBackoffConfig | Partial\<ExponentialBackoffConfig\>      | -            | 指数退避配置                   |
| linearBackoffConfig      | Partial\<LinearBackoffConfig\>           | -            | 线性退避配置                   |
| steppedIntervalConfig    | Partial\<SteppedIntervalConfig\>         | -            | 阶梯间隔配置                   |
| networkAdaptiveConfig    | Partial\<NetworkAdaptiveConfig\>         | -            | 网络自适应配置                 |
| errorTypeMaxRetries      | Record\<UploadErrorType, number\>        | -            | 错误类型特定最大重试次数       |
| errorGroupMaxRetries     | Record\<ErrorGroup, number\>             | -            | 错误组特定最大重试次数         |
| shouldRetryMap           | Record\<UploadErrorType, boolean\>       | -            | 根据错误类型是否应该重试的映射 |
| shouldRetryFn            | (error: Error, context?: any) => boolean | -            | 自定义是否应该重试的判断函数   |

## 使用场景

智能重试系统特别适用于以下场景：

1. **不稳定网络环境**：移动网络、弱网环境下的上传，系统会自动调整策略以适应网络波动
2. **大文件上传**：大文件分片上传过程中出现错误，系统会智能判断重试策略，避免全部重新开始
3. **高可靠性要求**：对上传成功率有高要求的场景，系统会尽最大努力完成上传任务
4. **有限网络资源**：在带宽有限的环境下，系统会选择更节约资源的重试策略
5. **高并发上传**：大量文件同时上传时，系统会使用抖动机制避免重试风暴
6. **跨地区上传**：跨地区或国际上传场景，可能面临不同类型的网络问题，系统会根据具体情况选择合适的策略

## 最佳实践

1. **启用历史数据分析**：这有助于系统学习并优化重试策略
2. **为关键错误类型定制策略**：根据您的应用场景，为最常见的错误类型配置专门的策略
3. **合理设置最大重试次数**：避免过多的重试占用资源或过少的重试影响成功率
4. **结合网络监测**：确保 UploaderCore 的网络监测功能开启，以便智能重试系统能获取网络质量信息
5. **监听重试事件**：通过监听 `smartRetry` 事件了解重试情况，便于调试和优化
6. **清理历史数据**：在适当的时候（如用户退出应用时）清理历史数据，避免占用过多存储空间

## 扩展与定制

智能重试系统设计为高度可扩展的，您可以：

1. **实现自定义退避策略**：继承 `BackoffStrategy` 类实现自己的退避算法
2. **自定义策略选择逻辑**：通过 `strategySelectorConfig.customSelector` 提供自定义选择函数
3. **扩展错误分析引擎**：在错误分析引擎的基础上增加更多的错误模式识别
4. **集成业务特定逻辑**：结合业务场景，为特定操作设计专门的重试策略

## 性能考量

智能重试系统在设计时充分考虑了性能因素：

1. **历史数据自动清理**：过期数据会自动清理，避免内存占用过大
2. **懒加载策略**：只有在需要时才会创建和计算具体的重试策略
3. **轻量级实现**：核心算法经过优化，运行效率高
4. **资源使用监控**：系统会考虑当前资源使用情况，避免重试过程占用过多资源

## 兼容性

智能重试系统兼容所有 fileChunkPro 3.0 支持的环境，包括：

- 现代浏览器
- 小程序环境
- React Native
- Node.js
