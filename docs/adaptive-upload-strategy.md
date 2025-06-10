# 自适应上传策略功能

## 概述

自适应上传策略是fileChunkPro 3.0版本的一项核心智能化功能，它能够根据当前网络环境的质量和特点，自动调整上传参数、选择最优上传路径和CDN节点，从而提高上传速度、成功率和用户体验。

该功能包含四个主要组件：

1. **网络质量检测** - 实时监测和评估网络质量
2. **参数动态调整** - 根据网络状况调整上传参数
3. **上传路径优化** - 选择最优的上传路径
4. **CDN智能选择** - 选择最适合当前网络的CDN节点

## 核心功能

### 1. 网络质量检测

网络质量检测模块负责监测和评估当前网络环境的各项指标，包括：

- **下载速度** - 测量当前网络的下载速度
- **上传速度** - 测量当前网络的上传速度
- **延迟** - 测量网络请求的延迟时间
- **丢包率** - 估算网络的丢包情况
- **带宽** - 估算网络带宽
- **稳定性** - 评估网络是否稳定

基于这些指标，系统将网络质量分为五个等级：

- `VERY_POOR` - 极差网络
- `POOR` - 较差网络
- `MODERATE` - 一般网络
- `GOOD` - 良好网络
- `EXCELLENT` - 极好网络

网络质量检测支持自动定期监测，当网络状况发生变化时，会触发相应的事件，以便其他组件作出反应。

### 2. 参数动态调整

参数调整器根据当前检测到的网络质量，智能调整以下上传参数：

- **分片大小** - 在不同网络环境下调整分片大小，平衡上传速度和成功率
- **并发数** - 动态调整并发上传数量，充分利用带宽并避免网络拥塞
- **重试次数** - 根据网络稳定性调整重试次数
- **重试延迟** - 网络不稳定时增加重试延迟
- **超时时间** - 根据网络质量调整请求超时时间
- **预检功能** - 在差网络下启用预检功能避免无效上传
- **Worker使用** - 根据网络状况决定是否使用Worker处理

参数调整支持两种策略：

- **全局策略** - 对所有文件应用统一的参数调整
- **文件级策略** - 为每个文件单独调整最优参数

此外，参数调整器还支持自适应学习功能，通过记录历史上传结果不断优化参数选择。

### 3. 上传路径优化

路径优化器负责从多个可用的上传路径中选择最佳路径。它会考虑以下因素：

- **路径延迟** - 测量各路径的网络延迟
- **可用性** - 评估路径的可用性和稳定性
- **区域** - 考虑地理位置因素
- **路径权重** - 结合历史表现评估路径权重

针对不同网络质量，路径优化器采用不同的选择策略：

- **糟糕网络** - 优先考虑低延迟路径
- **一般网络** - 平衡考虑延迟和权重
- **良好网络** - 优先考虑高权重路径

### 4. CDN智能选择

CDN选择器用于从多个CDN节点中选择最优节点，它会考虑：

- **节点延迟** - 测量CDN节点的响应延迟
- **节点可用性** - 评估节点的可用性
- **地理位置** - 考虑用户与节点的地理位置关系
- **提供商** - 考虑不同CDN提供商的性能特点
- **文件大小** - 对大文件优先考虑区域匹配的CDN

同样，CDN选择器也会根据网络质量采用不同策略：

- **糟糕网络** - 优先选择低延迟节点
- **中等网络** - 平衡考虑延迟和可用性
- **良好网络** - 对大文件考虑地理位置，对小文件优先考虑高可用性

## 技术原理

### 网络质量检测原理

网络质量检测通过以下步骤进行：

1. **下载速度测试** - 请求小文件并测量下载时间
2. **上传速度测试** - 上传测试数据并测量时间
3. **延迟测试** - 发送HEAD请求并测量往返时间
4. **丢包估算** - 通过多次请求统计成功率
5. **网络稳定性评估** - 通过多次测量的方差分析稳定性

系统综合考虑多项指标，通过加权计算得出最终的网络质量等级。

### 参数调整策略

参数调整基于以下策略：

1. **网络质量映射** - 每个网络质量等级对应一组预设参数
2. **平滑过渡** - 避免参数突变，采用渐进式调整
3. **安全限制** - 确保参数在安全范围内
4. **不稳定网络特殊处理** - 对不稳定网络采用更保守的策略
5. **自适应学习** - 记录历史成功参数，优化未来选择

### 路径优化算法

路径优化采用以下算法：

1. **路径测试** - 定期测试所有路径的延迟和可用性
2. **权重计算** - 基于延迟、可用性等因素计算路径权重
3. **网络质量适配** - 根据不同网络质量选择不同优化策略
4. **实时更新** - 动态更新路径状态和权重

### CDN选择算法

CDN选择基于以下算法：

1. **节点测试** - 测试CDN节点的延迟和可用性
2. **地理位置检测** - 尝试检测用户所在地区
3. **综合评分** - 根据多种因素计算节点评分
4. **动态调整** - 基于历史表现动态调整节点权重
5. **文件大小策略** - 大文件优先考虑区域匹配

## 使用方法

### 1. 基本使用

```typescript
import { UploaderCore } from 'fileChunkPro/core';
import { AdaptiveUploadPlugin } from 'fileChunkPro/plugins';
import { BrowserAdapter } from 'fileChunkPro/adapters';

// 创建上传器实例
const uploader = new UploaderCore({
  adapter: new BrowserAdapter(),
  target: 'https://api.example.com/upload',
});

// 创建并注册自适应上传策略插件
uploader.use(
  new AdaptiveUploadPlugin({
    enableNetworkDetection: true,
    enableParameterAdjustment: true,
    enablePathOptimization: true,
    enableCDNSelection: true,
  })
);

// 使用上传器
uploader.addFile(file);
uploader.start();
```

### 2. 高级配置

```typescript
// 完整配置示例
const adaptivePlugin = new AdaptiveUploadPlugin({
  // 网络检测配置
  enableNetworkDetection: true,
  networkMonitoringInterval: 30000, // 30秒检测一次

  // 参数调整配置
  enableParameterAdjustment: true,
  minChunkSize: 256 * 1024, // 最小256KB
  maxChunkSize: 4 * 1024 * 1024, // 最大4MB
  minConcurrency: 1,
  maxConcurrency: 5,

  // 路径优化配置
  enablePathOptimization: true,
  customPaths: [
    {
      url: 'https://upload-east.example.com/upload',
      weight: 0.8,
      region: 'east',
      tags: ['main'],
    },
    {
      url: 'https://upload-west.example.com/upload',
      weight: 0.7,
      region: 'west',
      tags: ['backup'],
    },
  ],

  // CDN选择配置
  enableCDNSelection: true,
  customCDNNodes: [
    {
      id: 'cdn1',
      url: 'https://cdn1.example.com/upload',
      region: 'global',
      provider: 'provider1',
      enabled: true,
    },
  ],

  // 其他设置
  initialParameters: {
    chunkSize: 512 * 1024,
    concurrency: 3,
  },
  perFileStrategy: true, // 每个文件单独应用策略
  debug: true, // 开启调试日志
});
```

### 3. 事件监听

```typescript
// 监听自适应策略事件
uploader.events.on('adaptiveStrategy', event => {
  switch (event.type) {
    case 'network_quality_change':
      console.log(`网络质量变为: ${event.data.networkQuality.qualityLevel}`);
      break;

    case 'parameters_adjusted':
      console.log('参数已调整:', event.data.parameters);
      break;

    case 'path_optimized':
      console.log('已选择最佳上传路径:', event.data.path.url);
      break;

    case 'cdn_selected':
      console.log('已选择最佳CDN节点:', event.data.cdn.url);
      break;
  }
});
```

## 最佳实践

1. **启用文件级策略** - 对不同大小的文件采用不同的上传策略
2. **提供多个上传路径** - 提供多个上传路径以便系统选择最优路径
3. **定期监控网络** - 在长时间上传过程中监测网络变化
4. **设置合理的参数范围** - 根据业务场景设置合理的参数上下限
5. **利用自适应学习** - 允许系统学习和优化参数选择
6. **监听策略事件** - 监听自适应策略事件以便了解系统工作状态
7. **合理使用调试模式** - 在开发阶段开启调试模式了解系统工作原理

## 兼容性和限制

- **浏览器支持** - 支持所有现代浏览器
- **Node.js支持** - 支持Node.js环境下使用
- **网络API要求** - 需要浏览器支持Fetch API
- **跨域限制** - 受同源策略限制，测速URL需支持CORS
- **移动设备** - 在移动设备上测速可能受到限制
- **网络检测精度** - 网络检测为估算值，不保证100%准确

## 未来优化方向

1. **机器学习增强** - 引入机器学习算法进一步优化参数选择
2. **预测性网络分析** - 增加网络趋势预测能力
3. **多源测速** - 增加多个测速源以提高准确性
4. **用户行为分析** - 考虑用户行为对上传策略的影响
5. **更多定制化选项** - 提供更多自定义选项以满足特定需求
6. **支持更多网络环境** - 增强对复杂网络环境的适应能力

## 常见问题

### Q: 如何知道自适应上传策略是否正常工作？

A: 开启debug选项并监听'adaptiveStrategy'事件，查看网络质量检测和参数调整日志。

### Q: 网络检测会消耗多少带宽？

A: 默认情况下，每次网络检测消耗约200KB的数据。可以通过调整检测间隔和测试数据大小来控制。

### Q: 如何测试不同网络环境下的表现？

A: 可以使用浏览器开发工具的网络节流功能模拟不同网络环境。

### Q: 为什么我的上传参数没有自动调整？

A: 检查是否启用了参数调整功能，并确保网络检测模块正常工作。

### Q: 能否保存自适应学习的结果以便下次使用？

A: 当前版本不支持持久化存储学习结果，未来版本将考虑增加此功能。
