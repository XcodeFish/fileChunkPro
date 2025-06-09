# fileChunkPro 智能内存管理功能

## 概述

智能内存管理是 fileChunkPro 2.0 版本的核心功能之一，旨在解决大文件上传过程中的内存占用问题，确保上传过程高效、稳定，同时避免内存溢出和浏览器崩溃。

该功能通过动态监控内存使用情况，自适应调整分片大小、并发数和处理策略，为不同设备、不同文件大小提供最优的上传体验。

## 主要功能

### 1. 内存监控与预警

- **实时内存监控**：持续监控应用内存使用情况
- **内存使用趋势分析**：分析内存增长/减少趋势
- **多级预警机制**：提供普通、警告、临界三级预警
- **预警事件通知**：通过事件系统通知应用层采取措施

### 2. 设备能力检测

- **内存容量检测**：检测设备可用内存总量
- **内存容量分级**：将设备分为极低、低、中等、高、极高五个级别
- **性能水平评估**：综合评估设备性能水平
- **跨平台兼容**：支持浏览器、小程序等多种环境

### 3. 动态分片策略

- **自适应分片大小**：根据文件大小、内存状况动态调整分片大小
- **内存友好的分片计划**：为大文件生成内存占用最优的分片计划
- **分片优先级排序**：优化分片处理顺序，提升用户体验
- **流式处理支持**：超大文件自动启用流式处理

### 4. 智能资源管理

- **内存分配控制**：控制上传任务可使用的最大内存比例
- **并发数动态调整**：根据内存状况调整并发上传数量
- **垃圾回收建议**：在内存紧张时建议进行垃圾回收
- **资源释放策略**：提供资源及时释放的最佳实践

### 5. 大文件处理优化

- **分部处理策略**：对超大文件采用分部处理方式
- **混合处理模式**：支持顺序、并行、混合三种处理模式
- **内存限制保护**：确保大文件处理不会耗尽内存
- **计算任务卸载**：支持将计算密集型任务卸载到Worker

## 使用方法

### 基础使用

```javascript
import { UploaderCore } from 'filechunkpro';
import { ChunkPlugin } from 'filechunkpro/plugins';

// 创建上传器实例，启用内存监控
const uploader = new UploaderCore({
  endpoint: 'https://example.com/upload',
  chunkSize: 'auto', // 使用自动分片大小
  enableMemoryMonitoring: true, // 启用内存监控
});

// 添加分片插件，同样启用内存监控
uploader.use(
  new ChunkPlugin({
    enableMemoryMonitoring: true,
  })
);

// 上传文件
uploader.upload(file);
```

### 监听内存警告

```javascript
// 监听内存警告事件
window.addEventListener('memoryWarning', event => {
  const { level, stats, recommendations } = event.detail;

  console.log(
    `内存警告(${level}): 使用率 ${(stats.usageRatio * 100).toFixed(1)}%`
  );

  // 根据警告级别采取措施
  if (level === 'critical') {
    // 严重内存不足，暂停上传
    uploader.pause();

    // 应用建议的设置
    if (recommendations.chunkSize) {
      uploader.setOption('chunkSize', recommendations.chunkSize);
    }

    if (recommendations.concurrency) {
      uploader.setOption('concurrency', recommendations.concurrency);
    }

    // 稍后恢复上传
    setTimeout(() => uploader.resume(), 3000);
  }
});
```

### 直接使用 MemoryManager

MemoryManager 也可以作为独立工具使用：

```javascript
import { MemoryManager } from 'filechunkpro/utils';

// 初始化内存管理器
MemoryManager.initialize();

// 开始内存监控
MemoryManager.startMonitoring();

// 获取内存统计信息
const stats = MemoryManager.getMemoryStats();
console.log('内存使用率:', (stats.usageRatio * 100).toFixed(1) + '%');
console.log('设备内存容量级别:', stats.capacity);

// 为特定文件大小获取最优分片大小
const fileSize = 100 * 1024 * 1024; // 100MB
const optimalChunkSize = MemoryManager.getOptimalChunkSize(fileSize);
console.log('推荐分片大小:', optimalChunkSize);

// 获取完整的分片处理策略
const strategy = MemoryManager.getChunkProcessingStrategy(fileSize);
console.log('处理策略:', strategy);

// 对于超大文件，获取特殊处理策略
const largeFileSize = 2 * 1024 * 1024 * 1024; // 2GB
const largeFileStrategy = MemoryManager.getLargeFileStrategy(largeFileSize);
console.log('大文件策略:', largeFileStrategy);

// 停止内存监控
MemoryManager.stopMonitoring();
```

## 配置选项

### UploaderCore 选项

| 选项                     | 类型             | 默认值   | 描述                         |
| ------------------------ | ---------------- | -------- | ---------------------------- |
| `enableMemoryMonitoring` | boolean          | `false`  | 是否启用内存监控             |
| `maxMemoryUsage`         | number           | `0.7`    | 最大内存使用率 (0-1)         |
| `chunkSize`              | number \| 'auto' | `'auto'` | 分片大小，'auto'表示自动计算 |
| `adaptiveStrategies`     | object           | `{}`     | 自适应策略选项               |

### ChunkPlugin 选项

| 选项                     | 类型    | 默认值       | 描述             |
| ------------------------ | ------- | ------------ | ---------------- |
| `enableMemoryMonitoring` | boolean | `true`       | 是否启用内存监控 |
| `enableOptimization`     | boolean | `true`       | 是否启用优化     |
| `adaptiveStrategy`       | string  | `'balanced'` | 自适应策略类型   |

## 事件

| 事件名称               | 说明                 | 详情对象                            |
| ---------------------- | -------------------- | ----------------------------------- |
| `memoryWarning`        | 内存使用达到警告阈值 | `{ level, stats, recommendations }` |
| `memoryRecommendation` | 内存使用建议         | `{ ...stats, recommendations }`     |
| `memoryPressurePause`  | 因内存压力建议暂停   | `{ reason, shouldPause }`           |

## 技术细节

### 1. 内存使用率计算

内存使用率通过以下方式计算：

```javascript
usageRatio = usedJSHeapSize / jsHeapSizeLimit;
```

### 2. 趋势分析算法

通过比较连续多个采样点的内存使用量，计算增长趋势：

```javascript
changePercent = (lastSample - firstSample) / firstSample;

if (changePercent > 0.05) {
  // 增长超过5%
  trend = 'growing';
} else if (changePercent < -0.05) {
  // 减少超过5%
  trend = 'decreasing';
} else {
  trend = 'stable';
}
```

### 3. 自适应分片大小

分片大小基于多种因素计算：

```javascript
// 基础分片大小
baseChunkSize = 2MB; // 根据设备内存容量调整

// 调整因子
adjustmentFactor = 1.0; // 根据内存使用率调整
fileSizeFactor = 1.0; // 根据文件大小调整
concurrencyFactor = 1.0; // 根据并发数调整

// 最终分片大小
adaptiveChunkSize = baseChunkSize * adjustmentFactor * fileSizeFactor * concurrencyFactor;
```

## 注意事项

1. 内存监控功能在浏览器端基于 `performance.memory` API，该 API 在某些浏览器中可能不可用或需要特殊标志启用。

2. 小程序环境下，内存监控基于平台提供的 API，如微信小程序的 `wx.onMemoryWarning`。

3. 对于低内存设备，系统会自动调整为更保守的上传策略，包括更小的分片和更低的并发。

4. 垃圾回收建议不保证立即执行，实际回收行为由浏览器的垃圾回收机制决定。

5. 在处理超大文件（>1GB）时，强烈建议启用内存监控功能，以避免浏览器崩溃。

## 兼容性

| 环境         | 支持情况 | 限制                                                      |
| ------------ | -------- | --------------------------------------------------------- |
| 现代浏览器   | 完全支持 | Chrome 需要 `--enable-precise-memory-info` 获取更精确数据 |
| IE11         | 部分支持 | 无法获取精确内存数据，使用保守估计                        |
| 微信小程序   | 支持     | 仅支持内存警告事件，无法获取精确内存数据                  |
| 支付宝小程序 | 支持     | 仅支持内存警告事件，无法获取精确内存数据                  |
| Node.js      | 支持     | 使用 `process.memoryUsage()` 获取内存数据                 |

## 性能影响

- 内存监控功能本身的性能开销极小，监控间隔默认为1秒
- 在内存紧张情况下，系统会自动降低监控频率以减少开销
- 监控逻辑使用防抖和节流技术，确保不会频繁触发警告事件
