# IndexedDB存储适配器

## 功能介绍

IndexedDB存储适配器是fileChunkPro 3.0中的新功能，它提供了一种高效的方法在浏览器环境中持久化存储大文件的分块数据。该适配器利用浏览器的IndexedDB API，实现了结构化数据存储和高性能的读写操作，特别适合于断点续传、离线上传等场景。

## 核心特性

1. **大文件分块存储**：将大文件分割成小块并独立存储，支持更高效的读写操作和更好的内存管理。
2. **结构化数据存储**：不仅能存储文件块数据，还能存储相关元数据，便于文件管理和状态追踪。
3. **存储空间管理**：提供自动配额监控和过期数据清理，避免无限制使用用户磁盘空间。
4. **高性能索引优化**：通过合理的索引设计，提高数据查询效率。
5. **事务支持**：基于IndexedDB的事务能力，确保数据操作的一致性和完整性。
6. **自动清理机制**：周期性清理过期数据和孤立数据，保持存储健康状态。

## 数据库设计

IndexedDB存储适配器使用了以下对象存储（Object Stores）结构：

1. **chunks**：存储文件块数据

   - 主键（Key Path）：`['fileId', 'chunkIndex']`
   - 索引：
     - `fileId`：按文件ID查询块
     - `updatedAt`：按更新时间查询块（用于过期数据清理）

2. **metadata**：存储文件元数据

   - 主键（Key Path）：`fileId`
   - 索引：
     - `updatedAt`：按更新时间查询元数据（用于过期数据清理）
     - `fileHash`：按文件哈希查询元数据（用于秒传功能）

3. **stats**：存储使用统计信息
   - 主键（Key Path）：`id`
   - 存储项：存储空间使用量、块数量等

## 使用示例

### 基本使用

```typescript
import { IndexedDBAdapter } from 'fileChunkPro';

// 创建适配器实例
const storageAdapter = new IndexedDBAdapter({
  dbName: 'my-upload-storage',
  dbVersion: 1,
  storageQuota: 100 * 1024 * 1024, // 100MB配额
  cleanupInterval: 24 * 60 * 60 * 1000, // 每天清理一次
});

// 初始化存储
await storageAdapter.init();

// 保存文件元数据
await storageAdapter.saveFileMetadata('file-123', {
  fileId: 'file-123',
  fileName: 'large-document.pdf',
  fileSize: 15000000,
  fileType: 'application/pdf',
  chunkSize: 1048576,
  totalChunks: 15,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// 保存文件块
const chunk = new Blob(['...chunk data...']);
await storageAdapter.saveChunk('file-123', 0, chunk);

// 检查文件块是否存在
const exists = await storageAdapter.hasChunk('file-123', 0);

// 获取文件块
const chunkData = await storageAdapter.getChunk('file-123', 0);

// 获取已上传的块列表
const chunkList = await storageAdapter.getChunkList('file-123');

// 关闭连接
await storageAdapter.close();
```

### 与UploaderCore集成

```typescript
import { UploaderCore, IndexedDBAdapter } from 'fileChunkPro';

// 创建存储适配器
const storageAdapter = new IndexedDBAdapter({
  dbName: 'upload-storage',
});

// 创建上传器实例
const uploader = new UploaderCore({
  // ... 其他配置 ...
  storageAdapter, // 传入存储适配器
});

// 现在上传器将使用IndexedDB存储分片数据
uploader.addFile(file);
uploader.start();
```

## 配置选项

| 选项            | 类型   | 默认值 | 说明                                     |
| --------------- | ------ | ------ | ---------------------------------------- |
| dbName          | string | -      | 数据库名称（必需）                       |
| dbVersion       | number | 1      | 数据库版本                               |
| storageQuota    | number | 1GB    | 存储空间最大值（字节）                   |
| expirationTime  | number | 7天    | 数据过期时间（毫秒）                     |
| cleanupInterval | number | -      | 自动清理间隔（毫秒），不设置则不自动清理 |

## 断点续传支持

IndexedDB存储适配器特别适合实现断点续传功能。上传过程中的每个分块都可以独立存储和检索，这样即使上传中断，也可以在下次继续从断点处恢复：

```typescript
// 获取已上传的分片列表
const uploadedChunks = await storageAdapter.getChunkList(fileId);

// 更新文件元数据，记录已上传分片
const metadata = await storageAdapter.getFileMetadata(fileId);
metadata.uploadedChunks = uploadedChunks;
metadata.updatedAt = Date.now();
await storageAdapter.saveFileMetadata(fileId, metadata);

// 仅上传未完成的分片
const remainingChunks = Array.from(
  { length: metadata.totalChunks },
  (_, i) => i
).filter(i => !uploadedChunks.includes(i));

for (const chunkIndex of remainingChunks) {
  // 上传分片...
}
```

## 存储空间管理

索引DDB存储适配器提供了自动的存储空间管理功能：

1. **配额监控**：每次保存数据前会检查是否超过配额限制。
2. **使用统计**：跟踪当前存储使用量和总块数。
3. **过期数据清理**：自动清理过期的文件元数据和分块。
4. **孤立数据清理**：清理没有对应元数据的孤立分块。

可以手动触发清理过程：

```typescript
// 立即清理过期数据
await storageAdapter.cleanup();

// 指定过期时间
await storageAdapter.cleanup(3 * 24 * 60 * 60 * 1000); // 清理3天前的数据
```

## 性能优化

为了获得最佳性能，IndexedDB存储适配器采用了以下优化措施：

1. **索引设计**：为常用查询创建索引，提高查询效率。
2. **事务优化**：合理使用事务，减少数据库连接开销。
3. **延迟初始化**：只有在实际需要时才初始化数据库。
4. **批量操作**：特定场景下使用游标进行批量操作。
5. **异步处理**：所有操作都是异步的，不会阻塞主线程。

## 浏览器兼容性

IndexedDB存储适配器支持所有现代浏览器，包括：

- Chrome 58+
- Firefox 51+
- Safari 11.1+
- Edge 17+
- Opera 45+
- iOS Safari 11.3+
- Android Browser 67+
- Chrome for Android 105+

## 注意事项

1. IndexedDB的存储空间受浏览器限制，通常在几百MB到几GB之间，具体取决于浏览器和用户磁盘空间。
2. 某些隐私模式（如Safari的隐私浏览）可能不支持或限制IndexedDB的使用。
3. 在使用前应检查浏览器是否支持IndexedDB。
4. 应定期清理过期数据，避免无限增长消耗用户磁盘空间。
5. 大量数据操作可能会影响页面性能，考虑使用Web Worker进行处理。

## 未来发展

未来计划对IndexedDB存储适配器进行以下增强：

1. Web Worker集成，将数据存储操作放入独立线程。
2. 数据压缩选项，减少存储空间占用。
3. 加密存储能力，提高数据安全性。
4. 更细粒度的存储配额控制。
5. 更丰富的数据统计和分析功能。
