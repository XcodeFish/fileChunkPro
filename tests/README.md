# fileChunkPro 测试指南

本文档介绍 fileChunkPro 项目的测试结构、运行方法和测试约定。

## 测试结构

测试目录结构如下：

```
tests/
├── unit/                   # 单元测试目录
│   ├── core/               # 核心模块单元测试
│   ├── adapters/           # 适配器单元测试
│   ├── plugins/            # 插件单元测试
│   └── utils/              # 工具函数单元测试
├── integration/            # 集成测试目录
│   ├── ModuleCoop.test.ts  # 模块协作测试
│   ├── NetworkHandling.test.ts  # 网络处理测试
│   ├── CrossEnvironment.test.ts # 跨环境测试
│   ├── ErrorRecovery.test.ts    # 错误恢复测试
│   ├── CrossPlatformAdapter.test.ts # 跨平台适配测试
│   └── helpers/            # 测试辅助工具
│       ├── testServer.ts   # 模拟服务器
│       └── environmentManager.ts # 环境管理工具
├── performance/            # 性能测试目录
├── setup.ts                # 全局测试设置
├── run-tests.sh            # 测试运行脚本
└── TEST-SUMMARY.md         # 测试结果摘要
```

## 运行测试

### 安装依赖

```bash
pnpm install
```

### 运行单元测试

```bash
pnpm test
```

### 运行集成测试

```bash
pnpm test:integration
```

### 监视模式运行集成测试

```bash
pnpm test:integration:watch
```

### 运行测试并生成覆盖率报告

```bash
pnpm test:coverage
```

## 测试框架与工具

- **测试框架**: Vitest
- **模拟库**: MSW (Mock Service Worker)
- **DOM 环境**: JSDOM
- **测试辅助工具**:
  - `testServer.ts`: 模拟服务器，支持自定义网络延迟、错误率等
  - `environmentManager.ts`: 环境模拟工具，支持模拟不同的运行环境
  - 内置测试文件生成器：`TestFileGenerator`

## 集成测试框架

集成测试专注于验证模块间协作、跨环境兼容性和真实场景模拟。我们提供了以下测试辅助工具：

### 1. 测试服务器模拟 (`testServer.ts`)

模拟上传服务器，支持以下特性：

- 可配置网络延迟
- 可设置随机错误率
- 支持指定特定分片失败
- 提供完整的上传流程API
- 支持模拟网络中断
- 支持修改服务器配置
- 跟踪文件和分片上传状态

使用示例：

```typescript
const testServer = createTestServer({
  networkLatency: 100,  // 100ms延迟
  errorRate: 0.1,       // 10%的请求会失败
  failedChunks: [2, 5]  // 第2和第5个分片会失败
});

// 开始监听
testServer.server.listen();

// 模拟网络中断5秒
testServer.simulateNetworkFailure(5000);

// 获取服务器状态
const state = testServer.getState();

// 清理
testServer.server.close();
```

### 2. 环境管理器 (`environmentManager.ts`)

模拟不同运行环境，支持以下特性：

- 预定义多种环境（浏览器、微信、支付宝等）
- 控制环境功能特性（如Worker、Blob支持）
- 模拟网络状况
- 模拟内存限制
- 动态变更环境状态

使用示例：

```typescript
// 应用浏览器环境
applyEnvironment(predefinedEnvironments.browser);

// 应用自定义环境
applyEnvironment({
  ...predefinedEnvironments.wechat,
  network: {
    quality: 'poor',
    type: '3g',
    downlink: 1,
    rtt: 300
  }
});

// 模拟环境变化
simulateEnvironmentChange({
  network: { quality: 'poor', type: '3g' },
  memory: { isLowMemory: true }
});

// 重置环境
resetEnvironment();
```

### 3. 测试文件生成器

创建各种类型的测试文件：

```typescript
// 创建文本文件
const textFile = TestFileGenerator.createTextFile(1024 * 1024, 'test.txt');

// 创建二进制文件
const binaryFile = TestFileGenerator.createBinaryFile(2 * 1024 * 1024, 'test.bin');

// 创建图片文件
const imageFile = await TestFileGenerator.createImageFile(400, 'test.png');
```

## 测试覆盖场景

集成测试覆盖以下关键场景：

### 1. 模块协作测试

- 核心模块与插件系统协同工作
- 状态共享和事件传播
- 插件间的互操作性

### 2. 网络处理测试

- 弱网络/网络波动场景
- 超时和重试机制
- 并发控制
- 跨域和认证

### 3. 跨环境测试

- 自动环境适配
- 特性检测与降级
- 统一错误处理
- 环境特定配置

### 4. 错误恢复测试

- 断点续传
- 错误重试策略
- 资源释放
- 状态持久化

## 测试约定

1. **测试命名**:
   - 模块测试文件：`模块名.test.ts`
   - 集成场景测试：`场景名.test.ts`

2. **测试结构**:
   - 使用`describe`嵌套按功能组织测试
   - 测试标题使用"应该..."/"应..."风格描述预期行为

3. **模拟与桩**:
   - 单元测试中尽量模拟依赖
   - 集成测试中尽量使用真实实现
   - 使用`beforeEach`/`afterEach`设置和清理模拟

4. **异步测试**:
   - 使用`async/await`处理异步测试
   - 对于定时器相关测试，使用`vi.useFakeTimers()`和`vi.advanceTimersByTime()`

5. **环境隔离**:
   - 每个测试后重置环境
   - 使用独立的上传实例，避免状态共享
   - 测试后释放资源

## 贡献测试

添加新测试时，请确保：

1. 遵循现有测试的结构和命名约定
2. 测试覆盖常规使用和边界情况
3. 测试设置清晰，预期结果明确
4. 测试后清理所有资源
5. 测试应独立可重复运行

## 调试测试

如果测试失败，可以使用以下方法调试：

```bash
# 仅运行特定测试文件
pnpm vitest run tests/integration/ModuleCoop.test.ts

# 使用调试模式
pnpm vitest --inspect-brk tests/integration/ErrorRecovery.test.ts
```
