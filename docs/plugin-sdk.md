# fileChunkPro 3.0 插件SDK使用指南

## 概述

fileChunkPro 3.0 插件SDK是一个强大的扩展系统，允许开发者创建自定义插件来扩展fileChunkPro的功能。通过SDK，开发者可以挂载到系统的各个生命周期钩子，添加自定义处理逻辑，并通过扩展点机制提供可替换的功能实现。

本文档介绍了如何使用插件SDK创建、注册和管理自定义插件，以及SDK的核心概念和API。

## 核心概念

### 插件生命周期

插件在fileChunkPro中经历以下生命周期：

1. **注册(Registration)**: 插件被添加到系统中
2. **安装(Installation)**: 插件的`install`方法被调用
3. **初始化(Initialization)**: 所有插件安装完成后，调用插件的`init`方法
4. **运行(Running)**: 插件处理各种钩子事件
5. **卸载(Uninstallation)**: 插件被移除，调用`uninstall`方法
6. **销毁(Destruction)**: fileChunkPro实例销毁前，调用插件的`destroy`方法

### 钩子系统

钩子是插件与核心系统交互的主要方式。插件可以注册处理函数到以下钩子点：

- `beforeInit`: 初始化前
- `afterInit`: 初始化后
- `beforeAddFile`: 添加文件前
- `afterAddFile`: 添加文件后
- `beforeUpload`: 上传前
- `afterUpload`: 上传后
- `beforeChunk`: 分片前
- `beforeUploadChunk`: 上传分片前
- `afterUploadChunk`: 上传分片后
- `beforeMerge`: 合并前
- `afterMerge`: 合并后
- `onProgress`: 进度更新
- `onError`: 错误发生
- `onSuccess`: 成功完成
- ...等更多钩子

### 扩展点系统

扩展点允许插件提供可替换的功能实现。核心扩展点包括：

- `fileProcessor`: 文件处理
- `networkHandler`: 网络请求处理
- `storageProvider`: 存储提供者
- `securityValidator`: 安全验证
- `uiComponent`: UI组件
- `analyticsProvider`: 分析提供者
- `errorHandler`: 错误处理
- `eventHandler`: 事件处理

## 快速开始

### 创建一个基本插件

创建一个插件需要实现`ISDKPlugin`接口，或者更简单地，继承`PluginBase`类：

```typescript
import {
  PluginBase,
  createPluginMetadata,
  PluginLifecycleHook,
} from 'file-chunk-pro/plugins/SDK';

export class MyCustomPlugin extends PluginBase {
  constructor() {
    super(
      createPluginMetadata('my-custom-plugin', '1.0.0', {
        description: '我的自定义插件',
        author: '您的名字',
        tags: ['custom'],
      })
    );
  }

  protected onInstall(): void {
    const context = this.getContext();

    // 注册钩子
    this.registerHook(
      PluginLifecycleHook.BEFORE_UPLOAD,
      this.handleBeforeUpload.bind(this)
    );

    context.log('info', '我的插件安装完成');
  }

  private handleBeforeUpload(args: { file: File }): any {
    console.log(`准备上传文件: ${args.file.name}`);
    // 可以修改文件或阻止上传
    return { handled: true, modified: false };
  }
}
```

### 注册并使用插件

```typescript
import UploaderCore from 'file-chunk-pro/core/UploaderCore';
import { PluginSDK } from 'file-chunk-pro/plugins/SDK';
import { MyCustomPlugin } from './MyCustomPlugin';

// 创建上传器实例
const uploader = new UploaderCore({
  endpoint: 'https://api.example.com/upload',
});

// 创建SDK实例
const pluginSDK = new PluginSDK(uploader);

// 注册插件
const myPlugin = new MyCustomPlugin();
pluginSDK.registerPlugin(myPlugin, {
  config: {
    // 插件初始配置
    someOption: true,
  },
});

// 初始化插件
await pluginSDK.initialize();

// 使用上传器
await uploader.upload(file);

// 卸载插件
pluginSDK.unregisterPlugin('my-custom-plugin');

// 销毁SDK
await pluginSDK.destroy();
```

## 高级功能

### 创建扩展点实现

```typescript
import {
  PluginBase,
  ExtensionPoint,
  createPluginMetadata,
} from 'file-chunk-pro/plugins/SDK';

// 自定义文件处理器
class MyFileProcessor {
  async processFile(file: File): Promise<File> {
    // 处理文件的逻辑
    console.log(`处理文件: ${file.name}`);
    return file;
  }
}

export class FileProcessorPlugin extends PluginBase {
  private processor: MyFileProcessor;

  constructor() {
    super(createPluginMetadata('file-processor-plugin', '1.0.0'));
    this.processor = new MyFileProcessor();
  }

  protected onInstall(): void {
    // 注册扩展点实现
    this.registerExtension(ExtensionPoint.FILE_PROCESSOR, this.processor, {
      name: 'my-file-processor',
      priority: 2, // 高优先级
      description: '自定义文件处理器',
    });
  }
}
```

### 插件依赖

插件可以依赖其他插件，SDK会确保按正确的顺序加载它们：

```typescript
constructor() {
  super(createPluginMetadata(
    'dependent-plugin',
    '1.0.0',
    {
      dependencies: ['base-plugin', 'utility-plugin']
    }
  ));
}
```

### 访问其他插件

插件可以通过上下文访问其他已注册的插件：

```typescript
protected onInstall(): void {
  const context = this.getContext();

  if (context.hasPlugin('other-plugin')) {
    const otherPlugin = context.getPlugin('other-plugin');
    // 使用其他插件
  }
}
```

### 配置管理

插件可以通过上下文获取和更新配置：

```typescript
// 获取配置
const config = this.getContext().getConfig();
const someValue = this.getContext().getConfig<string>('someKey');

// 更新配置
this.getContext().setConfig('newKey', 'newValue');
```

## 最佳实践

1. **遵循单一职责原则**：每个插件应该专注于一个功能领域。
2. **妥善处理异常**：捕获并记录可能发生的错误，避免影响核心功能。
3. **延迟加载资源**：在`onInit`方法中加载大型资源，而不是构造函数中。
4. **清理资源**：在`onUninstall`和`onDestroy`方法中释放所有资源。
5. **优先使用钩子**：通过钩子系统与核心交互，而不是直接修改核心实例。
6. **适当使用日志**：使用上下文提供的日志方法记录关键操作。
7. **版本兼容性**：在插件元数据中指定兼容的核心版本。

## API参考

### PluginBase

基础插件类，提供了大部分插件需要的功能。

#### 核心方法

- `install(context)`: 安装插件
- `uninstall()`: 卸载插件
- `init()`: 初始化插件
- `destroy()`: 销毁插件
- `updateConfig(config)`: 更新配置

#### 保护方法

- `onInstall()`: 子类应重写此方法提供安装逻辑
- `onUninstall()`: 子类应重写此方法提供卸载逻辑
- `onInit()`: 子类应重写此方法提供初始化逻辑
- `onDestroy()`: 子类应重写此方法提供销毁逻辑
- `onConfigUpdate(oldConfig, newConfig)`: 配置更新时调用
- `registerHook(hookName, handler, priority)`: 注册钩子处理函数
- `registerExtension(point, implementation, options)`: 注册扩展点实现
- `getContext()`: 获取插件上下文

### PluginSDK

插件SDK管理器，负责插件的注册、初始化和生命周期管理。

#### 核心方法

- `registerPlugin(plugin, options)`: 注册插件
- `unregisterPlugin(name)`: 卸载插件
- `getPlugin(name)`: 获取插件实例
- `hasPlugin(name)`: 检查插件是否已注册
- `getPluginMetadata(name)`: 获取插件元数据
- `updatePluginConfig(name, config)`: 更新插件配置
- `initialize()`: 初始化所有插件
- `destroy()`: 销毁所有插件

### IPluginContext

插件上下文接口，提供插件与系统交互的API。

#### 核心方法

- `getCore()`: 获取上传器核心实例
- `getPluginManager()`: 获取插件管理器
- `getEventBus()`: 获取事件总线
- `getTaskScheduler()`: 获取任务调度器
- `getPlugin(name)`: 获取其他插件实例
- `hasPlugin(name)`: 检查插件是否存在
- `registerHook(hookName, handler, priority)`: 注册钩子
- `removeHook(hookName, handler)`: 移除钩子
- `runHook(hookName, args)`: 运行钩子
- `registerExtension(point, implementation, options)`: 注册扩展点
- `getExtensions(point)`: 获取扩展点实现
- `getConfig(key)`: 获取配置
- `setConfig(key, value)`: 设置配置
- `log(level, message, data)`: 记录日志

## 故障排查

### 常见问题

1. **插件未执行**：

   - 检查插件是否正确注册
   - 确认钩子名称拼写正确
   - 验证钩子处理函数是否抛出异常

2. **插件初始化失败**：

   - 检查依赖插件是否存在
   - 查看异步初始化是否正确处理异常

3. **插件冲突**：
   - 检查多个插件是否修改了相同的对象
   - 使用适当的优先级确保按正确顺序执行

### 调试技巧

1. 启用调试日志：

   ```typescript
   uploader.setLogLevel('debug');
   ```

2. 监听插件事件：

   ```typescript
   uploader.getEventBus().on('plugin:registered', e => {
     console.log('插件已注册:', e);
   });
   ```

3. 检查插件状态：

   ```typescript
   console.log(pluginSDK.getPluginNames());
   console.log(pluginSDK.getPluginMetadata('my-plugin'));
   ```

## 示例

更多示例请参考`src/examples/plugins`目录：

- `ExamplePlugin.ts`: 基础插件示例
- `FileProcessorPlugin.ts`: 文件处理器扩展点示例
- `SecurityPlugin.ts`: 安全验证插件示例
- `UIExtensionPlugin.ts`: UI扩展插件示例

## 结语

fileChunkPro 3.0 插件SDK提供了强大而灵活的扩展机制，允许开发者自定义和增强文件上传功能。通过合理使用钩子和扩展点，您可以创建适应各种特定需求的插件，而无需修改核心代码。
