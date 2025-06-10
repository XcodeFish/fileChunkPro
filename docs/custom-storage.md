# 自定义存储接口使用指南

fileChunkPro 3.0 引入了插件化存储架构，允许您自定义文件块和元数据的存储方式。这为高级用例提供了极大的灵活性，例如将文件块存储在自定义后端服务器、云存储服务或其他特定环境中。

## 目录

- [自定义存储接口使用指南](#自定义存储接口使用指南)
  - [目录](#目录)
  - [架构概述](#架构概述)
  - [基本使用方法](#基本使用方法)
  - [创建自定义存储适配器](#创建自定义存储适配器)
    - [1. 实现 IStorageAdapter 接口](#1-实现-istorageadapter-接口)
    - [2. 继承 AbstractStorageAdapter 类（推荐）](#2-继承-abstractstorageadapter-类推荐)
  - [StoragePlugin 配置选项](#storageplugin-配置选项)
  - [多存储适配器场景](#多存储适配器场景)
  - [示例实现](#示例实现)
    - [内存存储适配器（已内置）](#内存存储适配器已内置)
    - [LocalStorage 适配器示例](#localstorage-适配器示例)
  - [最佳实践](#最佳实践)
  - [API 参考](#api-参考)

## 架构概述

自定义存储功能基于以下核心组件：

1. **IStorageAdapter 接口**: 定义所有存储适配器必须实现的方法
2. **AbstractStorageAdapter 抽象类**: 提供基础实现和辅助方法
3. **StoragePlugin 插件**: 用于将自定义存储适配器集成到上传器核心中

整体架构流程：

1. 创建自定义存储适配器，实现 IStorageAdapter 接口或继承 AbstractStorageAdapter
2. 实例化您的存储适配器
3. 使用 StoragePlugin 将适配器注册到 UploaderCore
4. UploaderCore 将使用您的自定义存储处理文件块与元数据

## 基本使用方法

以下是使用自定义存储适配器的基本示例：

```typescript
import { UploaderCore, plugins, adapters } from 'file-chunk-pro';
import { MyCustomStorageAdapter } from './my-storage';

// 创建自定义存储适配器实例
const customStorage = new MyCustomStorageAdapter({
  // 您的存储配置选项
});

// 创建存储插件
const storagePlugin = new plugins.StoragePlugin(customStorage, {
  // 是否替换默认存储适配器
  overrideDefault: true,
  // 上传完成后是否清理数据
  cleanupOnComplete: false,
});

// 创建上传器实例
const uploader = new UploaderCore({
  // 上传配置...
});

// 注册存储插件
uploader.use(storagePlugin);

// 现在上传器将使用您的自定义存储
```

## 创建自定义存储适配器

要创建自定义存储适配器，您有两种选择：

### 1. 实现 IStorageAdapter 接口

```typescript
import { IStorageAdapter, FileMetadata } from 'file-chunk-pro';

export class MyStorageAdapter implements IStorageAdapter {
  // 实现所有必需的接口方法
  async init(): Promise<void> {
    // 初始化您的存储
  }

  async saveChunk(
    fileId: string,
    chunkIndex: number,
    chunkData: Blob
  ): Promise<void> {
    // 保存文件块
  }

  // ... 实现其他必需方法
}
```

### 2. 继承 AbstractStorageAdapter 类（推荐）

```typescript
import { AbstractStorageAdapter, StorageEngineType } from 'file-chunk-pro';

export class MyStorageAdapter extends AbstractStorageAdapter {
  constructor(options) {
    // 为您的存储指定类型和名称
    super(StorageEngineType.CUSTOM, 'my-storage');
    // 初始化您的属性
  }

  // 覆盖必需的抽象方法
  async init(): Promise<void> {
    // 初始化实现
    this._initialized = true;
  }

  // ... 实现其他必需方法
}
```

## StoragePlugin 配置选项

StoragePlugin 支持以下配置选项：

| 选项                    | 类型     | 默认值           | 说明                             |
| ----------------------- | -------- | ---------------- | -------------------------------- |
| `overrideDefault`       | boolean  | false            | 是否覆盖默认存储适配器           |
| `storageKey`            | string   | 'custom-storage' | 存储键名，用于管理多个存储适配器 |
| `cleanupOnComplete`     | boolean  | false            | 上传完成后是否自动清理存储数据   |
| `fileMetadataExtension` | Function | undefined        | 文件元数据扩展函数               |
| `priority`              | number   | 100              | 存储优先级，数字越小优先级越高   |

## 多存储适配器场景

fileChunkPro 3.0 支持同时注册多个存储适配器，用于不同的使用场景：

```typescript
// 创建内存存储（用于小文件或临时存储）
const memoryStorage = new adapters.MemoryStorageAdapter();
const memoryPlugin = new plugins.StoragePlugin(memoryStorage, {
  storageKey: 'memory',
  priority: 100,
});

// 创建 IndexedDB 存储（用于大文件持久化）
const indexedDBStorage = new adapters.IndexedDBAdapter();
const indexedDBPlugin = new plugins.StoragePlugin(indexedDBStorage, {
  storageKey: 'indexeddb',
  priority: 200,
});

// 创建自定义云存储（用于指定文件类型）
const cloudStorage = new MyCloudStorageAdapter();
const cloudPlugin = new plugins.StoragePlugin(cloudStorage, {
  storageKey: 'cloud',
  priority: 300,
});

// 注册所有存储插件
uploader.use(memoryPlugin);
uploader.use(indexedDBPlugin);
uploader.use(cloudPlugin);

// 使用指定的存储上传
uploader.upload(file, { storageKey: 'cloud' });
```

## 示例实现

### 内存存储适配器（已内置）

内存存储适配器是一个简单的参考实现，用于临时存储文件块和元数据：

```typescript
import { MemoryStorageAdapter } from 'file-chunk-pro';

const memoryStorage = new MemoryStorageAdapter({
  // 最大存储大小，默认 100MB
  maxSize: 200 * 1024 * 1024,
  // 数据过期时间，默认 24 小时
  expirationTime: 12 * 60 * 60 * 1000,
});

const storagePlugin = new plugins.StoragePlugin(memoryStorage);
uploader.use(storagePlugin);
```

### LocalStorage 适配器示例

以下是一个使用浏览器 LocalStorage 的简化示例：

```typescript
import { AbstractStorageAdapter, StorageEngineType } from 'file-chunk-pro';

class LocalStorageAdapter extends AbstractStorageAdapter {
  constructor(options = {}) {
    super(StorageEngineType.LOCAL_STORAGE, 'localstorage');
  }

  async init(): Promise<void> {
    // 检查 LocalStorage 是否可用
    if (typeof localStorage === 'undefined') {
      throw new Error('LocalStorage 在当前环境不可用');
    }
    this._initialized = true;
  }

  async saveChunk(
    fileId: string,
    chunkIndex: number,
    chunkData: Blob
  ): Promise<void> {
    // 将 Blob 转换为 base64 字符串
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = () => {
        try {
          const key = this._getChunkKey(fileId, chunkIndex);
          localStorage.setItem(key, reader.result as string);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(chunkData);
    });
  }

  // 实现其他方法...
}
```

## 最佳实践

1. **性能考虑**：

   - 对于大文件或大量文件，避免使用内存存储
   - 对于生产环境，推荐使用 IndexedDB 或自定义服务器存储
   - 考虑实现缓存机制来减少存储操作

2. **错误处理**：

   - 实现适当的错误处理和回退机制
   - 监控存储容量限制
   - 定期清理过期数据

3. **安全性**：

   - 对敏感数据实施加密
   - 避免在客户端存储敏感信息
   - 实现数据校验以确保完整性

4. **用户体验**：
   - 提供清晰的存储使用反馈
   - 当接近存储限制时提供警告
   - 考虑自动清理策略

## API 参考

有关完整的 API 参考，请参阅以下类型定义：

- `IStorageAdapter` 接口: 定义所有存储方法
- `AbstractStorageAdapter` 类: 提供基础功能实现
- `StoragePlugin` 类: 用于注册自定义存储
- `StoragePluginOptions` 接口: 插件配置选项
- `FileMetadata` 接口: 文件元数据结构
- `StorageStats` 接口: 存储统计信息结构
