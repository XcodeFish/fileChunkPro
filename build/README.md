# fileChunkPro 构建系统

本文档详细介绍了 fileChunkPro 的构建系统配置及使用方法。

## 一、构建输出目录结构

构建后将生成以下目录结构：

```
├── dist/
│   ├── browser/               # 浏览器环境构建
│   │   ├── fileChunkPro.esm.js      # ESM模块
│   │   ├── fileChunkPro.cjs.js      # CommonJS模块
│   │   └── fileChunkPro.umd.js      # UMD (可直接用<script>引入)
│   ├── miniprogram/           # 小程序环境构建
│   │   ├── wechat/            # 微信小程序专用
│   │   ├── alipay/            # 支付宝小程序专用
│   │   ├── bytedance/         # 字节跳动小程序专用
│   │   └── baidu/             # 百度小程序专用
│   ├── taro/                  # Taro专用打包
│   └── uni-app/               # uni-app专用打包
├── workers/                   # Worker构建输出
│   └── default/
│       ├── worker.js          # 主Worker文件
│       ├── ChunkWorker.js     # 分片处理Worker文件
│       └── HashWorker.js      # 哈希计算Worker文件
├── types/                     # 类型声明文件
```

## 二、构建命令

项目提供以下几个构建命令：

```bash
# 清理构建产物
pnpm clean

# 类型检查
pnpm type-check

# 生成类型声明文件
pnpm type-declarations

# 标准构建 (包含类型检查和类型声明)
pnpm build

# 构建Worker文件
pnpm build:workers

# 开发模式构建 (不压缩代码)
pnpm build:dev

# 生产模式构建 (压缩代码，包含Worker文件)
pnpm build:prod

# 分析包大小
pnpm analyze
```

## 三、构建配置文件

构建系统使用以下配置文件：

- `build/rollup.config.js` - Rollup主配置文件
- `build/worker.config.js` - Worker文件构建配置

## 四、构建模块说明

### 4.1 浏览器环境构建

浏览器环境构建了三种格式的模块：

1. **ESM模块 (fileChunkPro.esm.js)**

   - 现代浏览器和构建工具使用
   - 支持 Tree-shaking
   - 通过 `import` 导入

2. **CommonJS模块 (fileChunkPro.cjs.js)**

   - Node.js 环境使用
   - 通过 `require()` 导入

3. **UMD模块 (fileChunkPro.umd.js)**
   - 可直接通过 `<script>` 标签引入
   - 定义全局变量 `FileChunkPro`

### 4.2 小程序环境构建

为各大小程序平台构建了专用的模块：

1. **微信小程序**
2. **支付宝小程序**
3. **字节跳动小程序**
4. **百度小程序**

### 4.3 框架集成构建

为流行的跨端框架构建了专用模块：

1. **Taro框架**
2. **uni-app框架**

### 4.4 Worker文件构建

Worker文件使用 esbuild 单独构建，以提高构建效率：

1. **ChunkWorker.js** - 负责文件分片处理
2. **HashWorker.js** - 负责哈希计算

## 五、使用示例

### 5.1 浏览器环境

```html
<!-- UMD方式 -->
<script src="./dist/browser/fileChunkPro.umd.js"></script>
<script>
  const uploader = new FileChunkPro({
    endpoint: 'https://api.example.com/upload',
  });
</script>

<!-- ESM方式 -->
<script type="module">
  import FileChunkPro from './dist/browser/fileChunkPro.esm.js';

  const uploader = new FileChunkPro({
    endpoint: 'https://api.example.com/upload',
  });
</script>
```

### 5.2 Node.js环境

```js
// CommonJS
const FileChunkPro = require('file-chunk-pro');

// ESM
import FileChunkPro from 'file-chunk-pro';
```

### 5.3 微信小程序环境

```js
const FileChunkPro = require('file-chunk-pro/miniprogram/wechat');

Page({
  uploadFile() {
    const uploader = new FileChunkPro({
      endpoint: 'https://api.example.com/upload',
    });
    // ...
  },
});
```

## 六、自定义构建

如需自定义构建，可修改以下配置文件：

- `build/rollup.config.js` - 主构建配置
- `build/worker.config.js` - Worker构建配置
- `tsconfig.json` - TypeScript配置
