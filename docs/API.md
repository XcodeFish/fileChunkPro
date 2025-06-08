# fileChunkPro API 文档

## 核心模块

### UploaderCore

`UploaderCore` 是文件上传库的核心类，负责文件分片、上传流程控制等基础功能。

#### 创建实例

```javascript
import { UploaderCore } from 'file-chunk-pro';

const uploader = new UploaderCore({
  endpoint: 'https://example.com/upload',
  chunkSize: 2 * 1024 * 1024, // 2MB
  concurrency: 3,
  timeout: 30000,
  retryCount: 3,
  retryDelay: 1000,
  headers: {
    'X-Custom-Header': 'value',
  },
  useWorker: true,
});
```

#### 配置选项

| 参数           | 类型             | 默认值   | 说明                                 |
| -------------- | ---------------- | -------- | ------------------------------------ |
| endpoint       | string           | -        | 上传端点URL（必填）                  |
| chunkSize      | number \| 'auto' | 'auto'   | 分片大小（字节）或'auto'（自动计算） |
| concurrency    | number           | 自动计算 | 并发上传数量                         |
| timeout        | number           | 30000    | 请求超时时间（毫秒）                 |
| retryCount     | number           | 3        | 失败重试次数                         |
| retryDelay     | number           | 1000     | 重试延迟时间（毫秒）                 |
| headers        | object           | {}       | 自定义请求头                         |
| useWorker      | boolean          | true     | 是否使用Worker线程                   |
| autoRetry      | boolean          | true     | 是否自动重试                         |
| maxFileSize    | number           | -        | 最大文件大小限制（字节）             |
| allowFileTypes | string[]         | -        | 允许的文件类型                       |

#### 方法

##### upload(file)

上传文件。

```javascript
uploader
  .upload(file)
  .then(result => console.log('上传成功:', result))
  .catch(error => console.error('上传失败:', error));
```

- **参数**
  - `file`: File对象或类似File的对象（必须包含name和size属性）
- **返回值**
  - Promise<UploadResult>

##### cancel()

取消当前上传。

```javascript
uploader.cancel();
```

##### registerPlugin(name, plugin)

注册插件。

```javascript
uploader.registerPlugin('validator', new ValidatorPlugin());
```

- **参数**
  - `name`: 插件名称
  - `plugin`: 插件实例

##### on(event, handler)

注册事件监听器。

```javascript
uploader.on('progress', progress => console.log(`上传进度: ${progress}%`));
```

- **参数**
  - `event`: 事件名称
  - `handler`: 处理函数

##### off(event, handler)

移除事件监听器。

```javascript
uploader.off('progress', handler);
```

- **参数**
  - `event`: 事件名称
  - `handler`: 处理函数（可选，不提供则移除该事件所有监听器）

##### dispose()

释放资源。

```javascript
uploader.dispose();
```

#### 事件

| 事件名称     | 回调参数                         | 说明              |
| ------------ | -------------------------------- | ----------------- |
| progress     | number                           | 上传进度（0-100） |
| chunkSuccess | {chunkIndex, chunkCount, fileId} | 分片上传成功      |
| complete     | UploadResult                     | 上传完成          |
| error        | UploadError                      | 上传错误          |
| cancel       | {fileId}                         | 上传取消          |

## 插件

### ChunkPlugin

文件分片处理插件，负责实现分片策略。

```javascript
import { ChunkPlugin } from 'file-chunk-pro';

const chunkPlugin = new ChunkPlugin({
  chunkSize: 2 * 1024 * 1024, // 2MB
  maxParallelChunkGeneration: 2,
});

uploader.registerPlugin('chunk', chunkPlugin);
```

#### 配置选项

| 参数                       | 类型             | 默认值 | 说明                                 |
| -------------------------- | ---------------- | ------ | ------------------------------------ |
| chunkSize                  | number \| 'auto' | 'auto' | 分片大小（字节）或'auto'（自动计算） |
| generateFileId             | function         | -      | 自定义生成文件ID的方法               |
| maxParallelChunkGeneration | number           | 1      | 并行生成分片的最大数量               |

### ProgressPlugin

进度监控插件，计算上传进度并触发进度事件。

```javascript
import { ProgressPlugin } from 'file-chunk-pro';

const progressPlugin = new ProgressPlugin({
  throttle: 200,
  progressDecimal: 2,
});

uploader.registerPlugin('progress', progressPlugin);
```

#### 配置选项

| 参数            | 类型    | 默认值 | 说明                      |
| --------------- | ------- | ------ | ------------------------- |
| throttle        | number  | 200    | 节流时间间隔（毫秒）      |
| useChunkEvent   | boolean | true   | 是否使用chunk事件计算进度 |
| progressDecimal | number  | 2      | 进度精度，小数点位数      |

### ValidatorPlugin

文件验证插件，验证文件类型和大小。

```javascript
import { ValidatorPlugin } from 'file-chunk-pro';

const validatorPlugin = new ValidatorPlugin({
  maxFileSize: 1024 * 1024 * 100, // 100MB
  allowFileTypes: ['image/*', 'application/pdf'],
  validateFileNames: true,
});

uploader.registerPlugin('validator', validatorPlugin);
```

#### 配置选项

| 参数               | 类型     | 默认值 | 说明                   |
| ------------------ | -------- | ------ | ---------------------- |
| maxFileSize        | number   | -      | 最大文件大小（字节）   |
| minFileSize        | number   | -      | 最小文件大小（字节）   |
| allowFileTypes     | string[] | -      | 允许的文件类型MIME     |
| allowExtensions    | string[] | -      | 允许的文件扩展名       |
| disallowFileTypes  | string[] | -      | 不允许的文件类型MIME   |
| disallowExtensions | string[] | -      | 不允许的文件扩展名     |
| validateFileNames  | boolean  | false  | 是否验证文件名         |
| allowFileNames     | RegExp   | -      | 允许的文件名正则表达式 |
| onValidationFailed | function | -      | 验证失败回调           |

## UI组件

### React组件

#### useFileUpload Hook

```jsx
import { useFileUpload } from 'file-chunk-pro/ui/react';

function MyComponent() {
  const { upload, cancelUpload, uploading, progress } = useFileUpload({
    endpoint: 'https://example.com/upload',
    maxFileSize: 1024 * 1024 * 100,
    onProgress: p => console.log(`Progress: ${p}%`),
    onSuccess: result => console.log('Upload success:', result),
    onError: error => console.error('Upload error:', error),
  });

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (file) {
      upload(file);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      {uploading && (
        <>
          <div>上传进度: {progress}%</div>
          <button onClick={cancelUpload}>取消</button>
        </>
      )}
    </div>
  );
}
```

### Vue组件

#### useFileUpload Composition API

```vue
<script setup>
import { useFileUpload } from 'file-chunk-pro/ui/vue';

const { upload, cancelUpload, uploading, progress } = useFileUpload({
  endpoint: 'https://example.com/upload',
  maxFileSize: 1024 * 1024 * 100,
  onProgress: p => console.log(`Progress: ${p}%`),
  onSuccess: result => console.log('Upload success:', result),
  onError: error => console.error('Upload error:', error),
});

const handleFileChange = e => {
  const file = e.target.files[0];
  if (file) {
    upload(file);
  }
};
</script>

<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <div v-if="uploading">
      <div>上传进度: {{ progress }}%</div>
      <button @click="cancelUpload">取消</button>
    </div>
  </div>
</template>
```

## 工具类

### StorageUtils

存储工具类，提供多种存储方式的统一接口实现。

```javascript
import { StorageUtils } from 'file-chunk-pro';

// 创建存储实例
const storage = StorageUtils.createStorage('local', { prefix: 'myApp_' });

// 存储数据
await storage.setItem('key', { value: 'data' });

// 获取数据
const data = await storage.getItem('key');

// 删除数据
await storage.removeItem('key');

// 清除所有数据
await storage.clear();
```

#### 方法

##### createStorage(type, options)

创建存储实例。

- **参数**
  - `type`: 存储类型，可选值: 'local', 'session', 'memory', 'auto'
  - `options`: 配置选项
    - `prefix`: 键前缀

##### isLocalStorageAvailable()

检查localStorage是否可用。

##### isSessionStorageAvailable()

检查sessionStorage是否可用。

### EnvUtils

环境工具类，用于检测运行环境和特性。

```javascript
import { EnvUtils } from 'file-chunk-pro';

// 检测环境
const env = EnvUtils.detectEnvironment();

// 检查Worker支持
const workerSupported = EnvUtils.isWorkerSupported();

// 获取推荐的并发数
const concurrency = EnvUtils.getRecommendedConcurrency();
```

#### 方法

##### detectEnvironment()

检测当前运行环境。

##### isWorkerSupported()

检查是否支持Web Worker。

##### getRecommendedConcurrency()

获取推荐的并发数。

## 错误处理

### UploadError

上传错误类。

```javascript
import { UploadError, UploadErrorType } from 'file-chunk-pro';

try {
  // 上传操作
} catch (error) {
  if (error instanceof UploadError) {
    console.log(`错误类型: ${error.type}`);
    console.log(`错误信息: ${error.message}`);
  }
}
```

#### 错误类型

| 类型                 | 说明         |
| -------------------- | ------------ |
| NETWORK_ERROR        | 网络错误     |
| FILE_ERROR           | 文件错误     |
| SERVER_ERROR         | 服务端错误   |
| ENVIRONMENT_ERROR    | 环境错误     |
| WORKER_ERROR         | Worker错误   |
| TIMEOUT_ERROR        | 超时错误     |
| MEMORY_ERROR         | 内存不足错误 |
| PERMISSION_ERROR     | 权限错误     |
| QUOTA_EXCEEDED_ERROR | 存储配额超出 |
| SECURITY_ERROR       | 安全错误     |
| UNKNOWN_ERROR        | 未知错误     |
