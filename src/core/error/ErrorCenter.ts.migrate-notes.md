# ErrorCenter迁移指南

## 背景

原版`ErrorCenter`与`ErrorHandlingSystem`存在功能重叠和代码冗余，为了优化代码结构，我们对错误处理系统进行了重构。新的设计使用组合模式拆分了多个专注的模块，并采用单例模式简化使用。

## 主要变更

1. **架构调整**：

   - 从单一大文件转为多模块组合设计
   - 从依赖注入转为单例模式
   - 更清晰的职责分离和模块化

2. **模块拆分**：

   - `ErrorCenter` - 核心协调器和主要API
   - `ErrorContext` - 上下文收集
   - `ErrorStorage` - 错误存储与统计
   - `ErrorTelemetry` - 错误远程上报

3. **API更新**：
   - 使用单例模式 `ErrorCenter.getInstance()`
   - 提供更丰富的查询和过滤错误的能力
   - 增强的统计功能

## 迁移步骤

### 1. 基本用法迁移

**旧代码**:

```typescript
// 使用依赖注入创建错误中心
const eventBus = new EventBus();
const errorCenter = new ErrorCenter(eventBus, options);

// 处理错误
errorCenter.handleError(error);
```

**新代码**:

```typescript
// 使用单例模式
import { ErrorCenter } from '../core/error';

// 获取实例并初始化
const errorCenter = ErrorCenter.getInstance(options);

// 处理错误
errorCenter.handleError(error);
```

### 2. 配置迁移

**旧配置**:

```typescript
const options = {
  autoRecover: true,
  logToConsole: true,
  telemetryUrl: 'https://api.example.com/telemetry',
  maxCachedErrors: 100,
  networkQualityEvaluator: myEvaluator,
};
```

**新配置**:

```typescript
const options = {
  autoRecover: true,
  logToConsole: true,
  telemetryOptions: {
    endpoint: 'https://api.example.com/telemetry',
    batchSize: 10,
    reportInterval: 60000,
  },
  contextOptions: {
    collectNetworkInfo: true,
    networkQualityEvaluator: myEvaluator,
  },
  storageOptions: {
    maxCachedErrors: 100,
    persistToLocalStorage: true,
  },
};
```

### 3. 扩展功能迁移

**旧代码 - 查询错误**:

```typescript
const allErrors = errorCenter.getErrorCache();
const typeErrors = allErrors.filter(
  err => err.type === UploadErrorType.NETWORK_ERROR
);
```

**新代码 - 查询错误**:

```typescript
// 更灵活的查询API
const typeErrors = errorCenter.queryErrors({
  type: UploadErrorType.NETWORK_ERROR,
  limit: 10,
  startTime: Date.now() - 3600000,
  includeRecovered: false,
});
```

## 兼容性

为了支持平滑迁移，我们提供了兼容层：

```typescript
// 旧方式创建错误中心
import { createErrorCenter } from '../core/error';

// 它会调用单例方法并发出警告
const errorCenter = createErrorCenter(eventBus, options);
```

## 移除旧版实现

建议在项目中逐步过渡到新的错误处理系统实现，在系统稳定后移除以下冗余文件：

- `src/core/error/ErrorHandlingSystem.ts` (与新版功能重叠)

## 更多示例

更多详细用法示例，请参考文档和单元测试。
