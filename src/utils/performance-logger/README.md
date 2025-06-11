# 性能日志关联器 (PerformanceLogAssociator)

## 重构说明

`PerformanceLogAssociator` 模块已经进行了全面重构，采用了模块化设计，提高了性能、可维护性和可扩展性。主要优化点包括：

1. **模块化设计**：将单个大文件拆分为多个专注于特定功能的模块：

   - `PerformanceLogAssociator`: 核心协调类，提供对外API
   - `AssociationAlgorithm`: 关联算法实现，负责计算日志与性能数据关联的权重和类型
   - `AssociationStorage`: 高效的关联数据存储和索引系统

2. **性能优化**：

   - 实现多维索引系统，支持高效查询
   - 使用LRU缓存策略减少重复计算
   - 支持增量处理和批量操作，减少内存使用
   - 优化关联算法，使用更精确的关联权重计算

3. **查询能力增强**：
   - 支持多条件复合查询
   - 提供更丰富的过滤和排序选项
   - 支持分页和限制结果集大小

## 使用指南

### 基本用法

```typescript
import { PerformanceLogAssociator } from '../utils/performance-logger';
import { LogStorage } from '../utils/LogStorage';
import { PerformanceCollector } from '../utils/PerformanceCollector';

// 创建实例
const logStorage = new LogStorage();
const performanceCollector = PerformanceCollector.getInstance();
const associator = new PerformanceLogAssociator(
  logStorage,
  performanceCollector
);

// 手动关联日志和性能指标
const association = await associator.associate(logEntry, performanceMetric);

// 查询相关日志
const relatedLogs = await associator.getLogsByMetricId('metric-123');

// 查询相关性能指标
const relatedMetrics = await associator.getMetricsByLogId('log-456');

// 高级查询
const results = await associator.query({
  associationTypes: [PerformanceLogAssociationType.CAUSAL],
  timeRange: { start: Date.now() - 3600000, end: Date.now() },
  minAssociationWeight: 0.7,
  sort: 'timestamp',
  order: 'desc',
  pagination: { offset: 0, limit: 20 },
});
```

### 自动关联

```typescript
// 自动分析并关联日志与相关性能指标
const associatedCount = await associator.autoAssociateLog(logEntry);

// 自动分析并关联性能指标与相关日志
const associatedCount = await associator.autoAssociateMetric(performanceMetric);
```

### 配置选项

可以通过配置对象自定义关联器的行为：

```typescript
const associator = new PerformanceLogAssociator(
  logStorage,
  performanceCollector,
  {
    // 自动关联相关选项
    enableAutoAssociation: true,
    autoAssociateMinWeight: 0.6,

    // 存储相关选项
    storageOptions: {
      maxAssociations: 20000,
      lruCacheSize: 200,
      enablePersistence: true,
      persistKey: 'log-metric-associations',
    },

    // 算法相关选项
    algorithmOptions: {
      defaultTimeWindow: 10000,
      timeDecayFactor: 0.3,
      contextMatchWeight: 0.4,
    },

    // 缓存相关选项
    cacheEnhancedResults: true,
    enhancedResultsCacheSize: 100,

    // 性能相关选项
    batchSize: 50,
  }
);
```

## 关联算法说明

关联算法基于以下几个维度对日志和性能指标的关联进行评分：

1. **时间接近度**：日志和性能指标的时间戳接近程度
2. **上下文匹配**：共享的文件ID、块索引、请求ID等
3. **内容相似性**：日志消息和性能指标元数据的关键词重叠
4. **模块相关性**：日志模块和性能指标模块的关系

算法会为每组日志和性能指标生成关联权重(0-1)和关联类型：

- `DIRECT`: 直接关联，如日志中包含性能快照ID或反之
- `CAUSAL`: 因果关联，如错误ID匹配或有明确的因果标记
- `CONTEXTUAL`: 上下文关联，共享上下文信息
- `TEMPORAL`: 基于时间的关联，仅时间临近但无其他明显关联

## 兼容性说明

为保持向后兼容，原有的导入路径仍然可用：

```typescript
import PerformanceLogAssociator from '../utils/PerformanceLogAssociator';
```

但建议使用新的导入路径以获得更好的性能和类型支持：

```typescript
import { PerformanceLogAssociator } from '../utils/performance-logger';
```
