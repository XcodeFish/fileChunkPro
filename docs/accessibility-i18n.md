# fileChunkPro 无障碍与国际化支持

## 概述

fileChunkPro 3.0 版本引入了全面的无障碍与国际化支持，使上传组件能够满足企业级应用的多样化需求。本文档详细介绍了这些功能的实现方式、配置选项以及最佳实践。

## 无障碍支持

无障碍支持通过 `AccessibilityPlugin` 插件提供，该插件实现了以下功能：

- ARIA 标签支持
- 键盘导航
- 屏幕阅读器兼容
- 焦点管理

### 使用方法

1. 安装插件：

```typescript
import { AccessibilityPlugin } from 'file-chunk-pro/plugins';

const accessibilityPlugin = new AccessibilityPlugin({
  enabled: true,
  keyboardNavigation: true,
  screenReaderSupport: true,
  // 自定义 ARIA 标签
  ariaLabels: {
    uploader: '文件上传器',
    dropZone: '拖放区域',
    // ...其他标签
  },
});

uploader.use(accessibilityPlugin);
```

### 配置选项

| 选项                  | 类型                     | 默认值   | 说明                   |
| --------------------- | ------------------------ | -------- | ---------------------- |
| `enabled`             | `boolean`                | `true`   | 是否启用无障碍支持     |
| `keyboardNavigation`  | `boolean`                | `true`   | 是否启用键盘导航       |
| `screenReaderSupport` | `boolean`                | `true`   | 是否启用屏幕阅读器支持 |
| `focusManagement`     | `'auto' \| 'manual'`     | `'auto'` | 焦点管理策略           |
| `ariaLabels`          | `Record<string, string>` | -        | 自定义 ARIA 标签       |
| `handlers`            | `object`                 | -        | 自定义事件处理函数     |

### 自定义 ARIA 标签

可以通过配置 `ariaLabels` 选项来自定义各元素的 ARIA 标签：

```typescript
const accessibilityPlugin = new AccessibilityPlugin({
  ariaLabels: {
    uploader: '高级文件上传器',
    dropZone: '将文件拖放到此处上传，或按下回车键选择文件',
    fileList: '上传文件列表',
    fileItem: '文件项',
    uploadButton: '选择文件上传',
    removeButton: '删除此文件',
    cancelButton: '取消上传',
    retryButton: '重试上传',
    progress: '上传进度指示器',
  },
});
```

### 键盘导航

默认支持以下键盘操作：

- `Tab`: 在可聚焦元素间切换
- `Enter` / `Space`: 激活按钮或可点击元素
- `Escape`: 取消当前操作

### 屏幕阅读器支持

插件会在关键事件发生时自动发布通知，如：

- 文件添加时
- 上传开始时
- 上传完成时
- 上传失败时

## 国际化支持

国际化支持通过 `I18nPlugin` 插件提供，该插件实现了以下功能：

- 多语言支持
- RTL（从右到左）布局支持
- 自定义翻译资源
- 格式化日期、数字和货币

### 使用方法

1. 安装插件：

```typescript
import { I18nPlugin } from 'file-chunk-pro/plugins';

const i18nPlugin = new I18nPlugin({
  currentLanguage: 'zh-CN',
  defaultLanguage: 'en-US',
  supportedLanguages: ['zh-CN', 'en-US', 'fr-FR', 'ar-SA'],
  autoDetect: true,
  rtlSupport: true,
  resources: {
    'en-US': enResources,
    'fr-FR': frResources,
    'ar-SA': arResources,
  },
});

uploader.use(i18nPlugin);
```

2. 获取国际化上下文并使用：

```typescript
const i18n = uploader.getFeature('i18n');

// 翻译文本
const translatedText = i18n.t('upload.title');

// 切换语言
await i18n.changeLanguage('fr-FR');

// 获取当前文字方向
const direction = i18n.direction; // 'ltr' 或 'rtl'

// 格式化日期
const formattedDate = i18n.formatDate(new Date());

// 格式化数字
const formattedNumber = i18n.formatNumber(1000.5);

// 格式化货币
const formattedCurrency = i18n.formatCurrency(1000, 'USD');
```

### 配置选项

| 选项                         | 类型                                           | 默认值               | 说明                   |
| ---------------------------- | ---------------------------------------------- | -------------------- | ---------------------- |
| `currentLanguage`            | `LanguageCode`                                 | `'en-US'`            | 当前语言               |
| `defaultLanguage`            | `LanguageCode`                                 | `'en-US'`            | 默认语言（作为回退）   |
| `supportedLanguages`         | `LanguageCode[]`                               | `['en-US', 'zh-CN']` | 支持的语言列表         |
| `autoDetect`                 | `boolean`                                      | `true`               | 是否自动检测浏览器语言 |
| `rtlSupport`                 | `boolean`                                      | `true`               | 是否启用 RTL 支持      |
| `resources`                  | `Record<LanguageCode, Record<string, string>>` | -                    | 自定义翻译资源         |
| `missingTranslationStrategy` | `'fallback' \| 'key' \| 'empty' \| 'error'`    | `'fallback'`         | 缺失翻译处理策略       |
| `resourceLoadStrategy`       | `'all' \| 'onDemand'`                          | `'all'`              | 资源加载策略           |

### 添加新语言

可以随时添加新的语言资源：

```typescript
i18nPlugin.addResources('es-ES', {
  'upload.title': 'Cargador de archivos',
  'upload.dropzone': 'Suelta archivos aquí o haz clic para cargar',
  // ...其他翻译
});

// 切换到新语言
await i18n.changeLanguage('es-ES');
```

### RTL 支持

对于阿拉伯语、希伯来语等从右到左书写的语言，插件会自动识别并应用相应的样式。

RTL 语言列表：

- `ar-SA`（阿拉伯语）
- `he-IL`（希伯来语）
- `ur-PK`（乌尔都语）
- `fa-IR`（波斯语）

可以使用 `RTLHelper` 工具类来辅助处理 RTL 相关的样式：

```typescript
import { RTLHelper } from 'file-chunk-pro/utils';

// 判断语言是否为 RTL
const isRTL = RTLHelper.isRTL('ar-SA'); // true

// 获取语言方向
const direction = RTLHelper.getDirection('ar-SA'); // 'rtl'

// 应用方向属性
RTLHelper.applyDirectionAttributes(element, direction);

// 转换样式
const rtlStyles = RTLHelper.transformStyles(
  {
    marginLeft: '10px',
    textAlign: 'left',
  },
  true
); // { marginRight: '10px', textAlign: 'right' }
```

## 实现案例

以下是一个完整的示例，展示如何同时使用无障碍和国际化功能：

```typescript
import { UploaderCore, BrowserAdapter } from 'file-chunk-pro';
import { AccessibilityPlugin, I18nPlugin } from 'file-chunk-pro/plugins';

// 创建上传器实例
const uploader = new UploaderCore({
  adapter: new BrowserAdapter(),
  endpoint: 'https://api.example.com/upload',
});

// 添加无障碍插件
uploader.use(
  new AccessibilityPlugin({
    keyboardNavigation: true,
    screenReaderSupport: true,
  })
);

// 添加国际化插件
uploader.use(
  new I18nPlugin({
    currentLanguage: 'zh-CN',
    supportedLanguages: ['zh-CN', 'en-US', 'ar-SA'],
    rtlSupport: true,
    resources: {
      'en-US': {
        'upload.button': 'Upload Files',
        'error.network': 'Network error occurred',
        // ...更多翻译
      },
      'zh-CN': {
        'upload.button': '上传文件',
        'error.network': '发生网络错误',
        // ...更多翻译
      },
      'ar-SA': {
        'upload.button': 'تحميل الملفات',
        'error.network': 'حدث خطأ في الشبكة',
        // ...更多翻译
      },
    },
  })
);

// 使用翻译
const i18n = uploader.getFeature('i18n');
document.getElementById('uploadBtn').textContent = i18n.t('upload.button');

// 切换语言
document.getElementById('langSelector').addEventListener('change', async e => {
  const language = e.target.value;
  await i18n.changeLanguage(language);

  // 更新界面文本
  document.getElementById('uploadBtn').textContent = i18n.t('upload.button');

  // 更新方向
  document.documentElement.setAttribute('dir', i18n.direction);
});
```

## 最佳实践

### 无障碍最佳实践

1. **保持键盘导航的逻辑性**：确保Tab键的导航顺序合理，遵循从上到下、从左到右的顺序。

2. **提供足够的上下文**：为复杂操作提供充分的描述性文本，不要仅依赖于图标或颜色传达信息。

3. **测试屏幕阅读器**：使用NVDA、JAWS或VoiceOver等屏幕阅读器测试您的应用程序。

4. **处理焦点管理**：在模态对话框、文件添加或错误提示等操作后，将焦点移动到逻辑位置。

### 国际化最佳实践

1. **使用占位符**：使用参数化的翻译文本，而不是字符串拼接。

   ```typescript
   // 好的做法
   i18n.t('error.fileSize', { size: '2MB' });

   // 不好的做法
   i18n.t('error.fileSize') + ': 2MB';
   ```

2. **考虑文本扩展**：翻译后的文本可能比原文更长，确保UI能够适应不同长度的文本。

3. **分离文本和逻辑**：将所有用户可见的文本放在翻译资源中，不要在代码中硬编码文本。

4. **提供上下文**：为翻译人员提供足够的上下文信息，以确保准确翻译。

5. **测试RTL布局**：确保您的UI在RTL模式下正常工作，特别是对于复杂组件。

## 注意事项

- 无障碍插件和国际化插件需要在DOM操作之前安装，以确保它们能够正确应用。
- RTL支持可能需要调整CSS，特别是对于自定义UI组件。
- 使用自定义主题时，确保保留无障碍相关的样式，如焦点轮廓。
- 某些语言可能需要特殊的字体支持，请确保提供或测试相应的字体。
