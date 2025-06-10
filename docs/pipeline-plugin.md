# 文件处理流水线插件使用指南

## 介绍

文件处理流水线插件是fileChunkPro 3.0的企业级特性之一，提供了一个灵活、可扩展的文件处理架构，允许开发者定义文件上传前、上传中和上传后的处理步骤。通过流水线插件，您可以实现以下功能：

- 上传前的文件预处理（如尺寸验证、类型检查、自动重命名等）
- 上传中的分片处理（如分片数据加密、数据压缩等）
- 上传后的后处理操作（如日志记录、通知发送、文件归档等）

## 基本概念

### 流水线（Pipeline）

流水线是一系列按特定顺序执行的处理步骤的集合，按照处理阶段分为三种类型：

- **预处理（PRE_PROCESS）**：在文件开始上传前执行
- **处理（PROCESS）**：在分片上传前执行
- **后处理（POST_PROCESS）**：在文件上传完成后执行

### 处理步骤（Step）

处理步骤是流水线中的核心单元，每个步骤都实现特定的处理逻辑，具有唯一ID、名称、类型和优先级。步骤按照优先级顺序执行，优先级数字越小越先执行。

### 上下文（Context）

上下文是在流水线执行过程中传递的数据容器，包含上传器实例和可以在步骤间共享的数据。

## 安装与配置

### 基本安装

```typescript
import { UploaderCore, plugins } from 'fileChunkPro';
const { PipelinePlugin } = plugins;

const uploader = new UploaderCore({
  // 基本配置
});

// 创建并配置流水线插件
const pipelinePlugin = new PipelinePlugin({
  enabled: true, // 是否启用流水线
  abortOnPreProcessFail: true, // 预处理失败时是否中断上传
  abortOnProcessFail: true, // 处理失败时是否中断上传
  abortOnPostProcessFail: false, // 后处理失败时是否继续后续处理
});

// 注册插件
uploader.use(pipelinePlugin);
```

### 添加处理步骤

```typescript
import {
  PipelinePlugin,
  PipelineStepType,
  FileSizeValidationStep,
  FileTypeValidationStep,
} from 'fileChunkPro';

// 使用内置步骤
const sizeValidation = new FileSizeValidationStep(10 * 1024 * 1024, 1024); // 最大10MB，最小1KB
pipelinePlugin.addStep(sizeValidation);

// 添加类型验证步骤
const typeValidation = new FileTypeValidationStep([
  'image/*',
  'application/pdf',
]);
pipelinePlugin.addStep(typeValidation);

// 添加自定义重命名步骤
pipelinePlugin.addStep({
  id: 'custom-rename',
  name: '自定义文件名',
  type: PipelineStepType.PRE_PROCESS,
  priority: 30, // 在验证步骤之后执行
  async execute(file, context) {
    // 添加时间戳到文件名
    const nameParts = file.name.split('.');
    const ext = nameParts.pop() || '';
    const baseName = nameParts.join('.');
    const timestamp = new Date().getTime();

    const newFile = { ...file };
    newFile.name = `${baseName}_${timestamp}.${ext}`;

    return {
      success: true,
      data: newFile,
    };
  },
});
```

### 添加后处理步骤

```typescript
import { PipelineStepType, NotificationStep } from 'fileChunkPro';

// 添加通知步骤
const notificationStep = new NotificationStep(async (file, response) => {
  // 发送上传完成通知
  await fetch('/api/notify', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      uploadResult: response,
      timestamp: new Date().toISOString(),
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  console.log(`文件 ${file.name} 上传通知已发送`);
});

pipelinePlugin.addStep(notificationStep);

// 添加自定义后处理步骤
pipelinePlugin.addStep({
  id: 'custom-post-process',
  name: '自定义后处理',
  type: PipelineStepType.POST_PROCESS,
  priority: 30,
  async execute(data, context) {
    const { file, response } = data;

    // 执行自定义后处理逻辑
    console.log(`文件 ${file.name} 上传完成，响应:`, response);

    // 在上下文中存储处理结果
    context.set('processedAt', new Date().toISOString());

    return {
      success: true,
      data,
    };
  },
});
```

## 高级用法

### 创建自定义处理步骤

您可以通过实现`IPipelineStep`接口创建自定义处理步骤：

```typescript
import {
  IPipelineStep,
  PipelineStepType,
  IPipelineContext,
  IPipelineStepResult,
} from 'fileChunkPro';

class ImageCompressionStep implements IPipelineStep {
  public id = 'image-compression';
  public name = '图片压缩';
  public type = PipelineStepType.PRE_PROCESS;
  public priority = 40;

  private _quality: number;
  private _maxWidth: number;

  constructor(quality: number = 0.8, maxWidth: number = 1920) {
    this._quality = quality;
    this._maxWidth = maxWidth;
  }

  public async execute(
    file: File,
    context: IPipelineContext
  ): Promise<IPipelineStepResult> {
    // 如果不是图片，跳过处理
    if (!file.type.startsWith('image/')) {
      return { success: true, data: file };
    }

    try {
      // 图片压缩逻辑
      const compressedFile = await this._compressImage(file);

      return {
        success: true,
        data: compressedFile,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('图片压缩失败'),
      };
    }
  }

  private async _compressImage(file: File): Promise<File> {
    // 图片压缩实现（示例）
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = e => {
        const img = new Image();

        img.onload = () => {
          // 计算压缩后的尺寸
          let width = img.width;
          let height = img.height;

          if (width > this._maxWidth) {
            const ratio = this._maxWidth / width;
            width = this._maxWidth;
            height = height * ratio;
          }

          // 压缩图片
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建Canvas上下文'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 转换为Blob
          canvas.toBlob(
            blob => {
              if (!blob) {
                reject(new Error('图片压缩失败'));
                return;
              }

              // 创建新的File对象
              const compressedFile = new File([blob], file.name, {
                type: file.type,
              });

              resolve(compressedFile);
            },
            file.type,
            this._quality
          );
        };

        img.onerror = () => {
          reject(new Error('图片加载失败'));
        };

        img.src = e.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsDataURL(file);
    });
  }
}

// 使用自定义步骤
const imageCompression = new ImageCompressionStep(0.7, 1280);
pipelinePlugin.addStep(imageCompression);
```

### 使用上下文在步骤间共享数据

通过上下文对象，您可以在不同的步骤之间共享数据：

```typescript
// 第一个步骤：存储数据到上下文
pipelinePlugin.addStep({
  id: 'metadata-extractor',
  name: '元数据提取',
  type: PipelineStepType.PRE_PROCESS,
  priority: 10,
  async execute(file, context) {
    // 提取文件元数据并存储到上下文
    const metadata = {
      originalName: file.name,
      extension: file.name.split('.').pop() || '',
      timestamp: new Date().getTime(),
      category: this._detectCategory(file.type),
    };

    context.set('metadata', metadata);

    return { success: true, data: file };
  },

  _detectCategory(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'document';
    return 'other';
  },
});

// 第二个步骤：使用上下文中的数据
pipelinePlugin.addStep({
  id: 'category-based-naming',
  name: '基于类别的命名',
  type: PipelineStepType.PRE_PROCESS,
  priority: 20,
  async execute(file, context) {
    // 从上下文获取元数据
    const metadata = context.get('metadata');

    if (!metadata) {
      return { success: true, data: file };
    }

    // 使用元数据创建新文件名
    const { category, timestamp, extension } = metadata;
    const newFile = { ...file };
    newFile.name = `${category}_${timestamp}.${extension}`;

    return { success: true, data: newFile };
  },
});
```

### 动态管理步骤

您可以根据需要动态添加或移除处理步骤：

```typescript
// 获取插件实例
const pipelinePlugin = uploader.getPlugin('PipelinePlugin');

if (pipelinePlugin) {
  // 添加步骤
  pipelinePlugin.addStep(new FileSizeValidationStep(20 * 1024 * 1024));

  // 移除步骤
  pipelinePlugin.removeStep('file-type-validation');

  // 获取所有预处理步骤
  const preProcessSteps = pipelinePlugin.getSteps(PipelineStepType.PRE_PROCESS);
  console.log('当前预处理步骤:', preProcessSteps);

  // 获取所有步骤
  const allSteps = pipelinePlugin.getSteps();
  console.log('所有处理步骤:', allSteps);
}
```

## 最佳实践

1. **优先级管理**：合理设置步骤优先级，确保步骤按正确顺序执行。通常，验证类步骤应先执行，转换类步骤后执行。

2. **错误处理**：根据业务需求决定是否在步骤失败时中断上传。对于必要的验证步骤，应设置失败时中断；对于可选的处理步骤，可以允许失败后继续。

3. **性能考虑**：

   - 避免在处理步骤中执行过重的计算，考虑使用Web Worker。
   - 对于大文件，特别是在PRE_PROCESS阶段的处理，注意内存使用。
   - 使用异步操作时，确保正确处理Promise和错误。

4. **复用与组合**：

   - 创建小型、单一职责的步骤，便于复用和组合。
   - 使用工厂函数或构建器模式创建常用的步骤组合。

5. **上下文使用**：
   - 使用上下文存储步骤间需要共享的数据。
   - 使用命名约定避免上下文数据键冲突。
   - 不要在上下文中存储过大的数据结构。

## 示例场景

### 场景一：图片上传预处理

```typescript
// 1. 验证图片类型
pipelinePlugin.addStep(new FileTypeValidationStep(['image/*']));

// 2. 验证图片尺寸限制
pipelinePlugin.addStep(new FileSizeValidationStep(5 * 1024 * 1024)); // 最大5MB

// 3. 图片压缩处理
pipelinePlugin.addStep(new ImageCompressionStep(0.8, 1920));

// 4. 添加水印
pipelinePlugin.addStep({
  id: 'watermark',
  name: '添加水印',
  type: PipelineStepType.PRE_PROCESS,
  priority: 40,
  // 水印实现逻辑...
});

// 5. 重命名文件
pipelinePlugin.addStep(
  new FileRenameStep(file => {
    return `img_${new Date().getTime()}.${file.name.split('.').pop()}`;
  })
);
```

### 场景二：文档上传审核流程

```typescript
// 1. 验证文档类型
pipelinePlugin.addStep(
  new FileTypeValidationStep(['application/pdf', 'application/msword'])
);

// 2. 文档内容扫描
pipelinePlugin.addStep({
  id: 'document-scan',
  name: '文档内容扫描',
  type: PipelineStepType.PRE_PROCESS,
  priority: 20,
  // 内容扫描实现...
});

// 3. 上传后通知审核人员
pipelinePlugin.addStep(
  new NotificationStep(async (file, response) => {
    await fetch('/api/notify-review', {
      method: 'POST',
      body: JSON.stringify({
        fileId: response.fileId,
        fileName: file.name,
        uploadTime: new Date().toISOString(),
      }),
    });
  })
);

// 4. 记录审核日志
pipelinePlugin.addStep({
  id: 'audit-log',
  name: '审核日志记录',
  type: PipelineStepType.POST_PROCESS,
  priority: 20,
  // 日志记录实现...
});
```

## 总结

文件处理流水线插件提供了一个灵活、可扩展的架构，使开发者能够自定义文件上传的各个处理阶段。通过合理配置处理步骤，可以满足各种复杂的文件处理需求，如文件验证、转换、压缩、记录和通知等。

无论是简单的文件上传还是复杂的企业级应用，流水线插件都能提供强大的扩展性和灵活性，帮助开发者构建高质量的文件上传功能。
