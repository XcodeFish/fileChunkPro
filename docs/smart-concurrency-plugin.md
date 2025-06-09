# SmartConcurrencyPlugin - 智能并发控制插件

## 简介

SmartConcurrencyPlugin 是 fileChunkPro 上传库的高级网络优化插件，它通过实时监测网络状况、设备性能和上传进度，智能调整上传并发数和策略，以实现最佳的上传性能与稳定性。

智能并发控制插件特别适用于复杂网络环境、不稳定网络连接或大文件上传场景，可以显著提升上传成功率和整体性能。

## 主要功能

1. **网络状况自适应**：实时监测网络质量，根据当前状况动态调整上传策略
2. **动态并发调整**：基于网络性能和设备状态智能调整最佳并发数
3. **优先级队列实现**：支持任务优先级，确保重要分片优先上传
4. **带宽监控与优化**：监控带宽使用情况，避免网络饱和，优化上传速率
5. **自适应发送窗口**：根据网络延迟和抖动动态调整发送窗口大小
6. **设备能力感知**：根据设备内存、CPU核心数和电池状态调整策略
7. **性能数据分析**：收集并分析上传性能数据，持续优化并发策略

## 工作原理

### 网络质量检测

插件通过以下几种方式检测网络质量：

- **速度采样**：实时记录上传速度，计算当前速度、平均速度和峰值速度
- **延迟监测**：跟踪分片上传的往返时间（RTT），计算平均延迟和抖动
- **稳定性评估**：分析网络质量的一致性，判断网络环境是否稳定
- **错误率统计**：记录不同并发数下的分片上传错误率

### 动态并发控制

基于网络质量和错误率分析，插件通过以下算法动态调整最佳并发数：

1. **基础映射**：根据网络质量等级（POOR、LOW、MEDIUM、GOOD、EXCELLENT）映射初始并发数
2. **稳定性调整**：网络不稳定时适当降低并发数，提高成功率
3. **错误自适应**：出现上传错误时智能降低并发数，避免雪崩效应
4. **性能学习**：记录每种网络质量下不同并发数的性能表现，逐渐学习最佳设置
5. **平滑变化**：避免并发数剧烈波动，采用渐进式调整策略

### 优先级队列

插件实现了高级的任务优先级机制：

- **首分片优先**：优先上传第一个分片，加快初始预览
- **末分片优先**：优先上传最后一个分片，加快文件合成
- **元数据优先**：确保文件元数据最先到达
- **重试提升**：对失败重试的分片提高优先级

### 发送窗口控制

基于TCP拥塞控制原理，实现智能发送窗口控制：

- **RTT监测**：跟踪往返时间变化趋势
- **抖动分析**：计算网络抖动并适当调整窗口大小
- **拥塞避免**：检测到网络拥塞时主动减小窗口
- **带宽探测**：网络状况良好时平滑增加窗口大小

## 使用方法

### 基本用法

```typescript
import { UploaderCore } from 'fileChunkPro';
import { SmartConcurrencyPlugin } from 'fileChunkPro/plugins';

const uploader = new UploaderCore({
  endpoint: 'https://your-upload-endpoint.com',
  chunkSize: 2 * 1024 * 1024, // 2MB分片
  concurrency: 3, // 初始并发数
});

// 添加智能并发控制插件
uploader.use(new SmartConcurrencyPlugin());

// 开始上传
uploader.upload(file);
```

### 高级配置

```typescript
const smartConcurrency = new SmartConcurrencyPlugin({
  // 并发配置
  minConcurrency: 1, // 最小并发数
  maxConcurrency: 8, // 最大并发数
  baseConcurrency: 3, // 基础并发数
  adaptationEnabled: true, // 是否启用并发自适应

  // 采样配置
  sampleInterval: 2000, // 采样间隔(毫秒)

  // 网络质量阈值(KB/s)
  networkQualityThresholds: {
    POOR: 60, // 低于60KB/s判断为差网络
    LOW: 250, // 低于250KB/s判断为较差网络
    MEDIUM: 600, // 低于600KB/s判断为中等网络
    GOOD: 1200, // 低于1.2MB/s判断为良好网络
    EXCELLENT: 2500, // 高于2.5MB/s判断为极好网络
  },

  // 稳定性阈值
  stabilityThreshold: 3, // 连续多少次相同质量判定为稳定

  // 优先级配置
  priorityConfig: {
    firstChunk: 2, // 首个分片优先级
    lastChunk: 2, // 最后分片优先级
    metadataChunk: 3, // 元数据分片优先级
    retryIncrement: 1, // 重试后提升的优先级增量
  },

  // 带宽利用
  targetUtilization: 0.85, // 目标带宽利用率(0-1)
});

uploader.use(smartConcurrency);
```

### 事件监听

插件会触发以下事件，可以通过 UploaderCore 的事件系统监听：

```typescript
// 监听网络质量变化
uploader.on('network:quality', data => {
  console.log(
    `网络质量: ${data.quality}, 稳定性: ${data.stable ? '稳定' : '不稳定'}`
  );
});

// 监听网络速度更新
uploader.on('network:speed', data => {
  console.log(
    `当前速度: ${formatBytes(data.current)}/s, 平均: ${formatBytes(data.average)}/s`
  );
});

// 监听并发数调整
uploader.on('concurrency:adjusted', data => {
  console.log(`并发数从 ${data.from} 调整到 ${data.to}, 原因: ${data.reason}`);
});

// 监听窗口大小变化
uploader.on('window:size:change', data => {
  console.log(`发送窗口调整为: ${data.windowSize}, 平均RTT: ${data.avgRtt}ms`);
});
```

### 手动调整

插件也提供了手动控制接口：

```typescript
// 获取插件实例
const plugin = uploader.getPlugin('SmartConcurrencyPlugin');

// 手动设置基础并发数
plugin.setBaseConcurrency(4);

// 禁用自适应功能
plugin.setAdaptationEnabled(false);

// 获取当前网络质量
const quality = plugin.getCurrentNetworkQuality();

// 获取速度信息
const speedInfo = plugin.getSpeedInfo();
console.log(`当前速度: ${formatBytes(speedInfo.current)}/s`);

// 获取设备能力评估
const deviceCapabilities = plugin.getDeviceCapabilities();

// 手动触发网络检测
plugin.forceNetworkDetection();
```

## 最佳实践

1. **让插件自动控制**：大多数情况下，启用插件的默认配置即可获得良好效果
2. **合理设置最大并发**：虽然插件会动态调整，但设置合理的上限可避免资源浪费
3. **优先级设置**：对于关键分片，合理设置优先级可提高用户体验
4. **移动设备优化**：在移动设备上，建议设置较低的 maxConcurrency 以节省资源
5. **大文件上传**：对于超大文件上传，确保 autoRetry 功能和断点续传功能同时启用

## 性能对比

以下是与固定并发数策略相比的性能数据（基于内部测试）：

| 网络环境   | 固定并发 | 智能并发 | 提升         |
| ---------- | -------- | -------- | ------------ |
| 高质量网络 | 基准     | +5-15%   | 速度提升     |
| 不稳定网络 | 基准     | +30-50%  | 成功率提升   |
| 移动网络   | 基准     | +20-40%  | 速度与稳定性 |
| 弱网环境   | 基准     | +40-60%  | 成功率提升   |

## 注意事项

1. 插件依赖于 TaskScheduler，确保您的 UploaderCore 实例支持任务调度功能
2. 在低端设备上，大量性能监控可能导致额外开销，请根据设备能力适当调整
3. 网络质量评估可能需要几秒钟的"学习期"，才能达到最佳效果
4. 如遇特殊网络环境导致的异常行为，可通过 setAdaptationEnabled(false) 关闭自适应功能

## 版本历史

- v2.0.0：添加设备能力感知、网络质量学习和窗口控制
- v1.0.0：初始版本，实现基本的智能并发控制

## 未来计划

1. 引入基于机器学习的网络质量预测
2. 添加更精细的设备资源监控
3. 实现地理位置感知的网络策略优化
4. 扩展多CDN负载均衡支持
