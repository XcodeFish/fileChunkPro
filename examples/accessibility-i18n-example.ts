/**
 * fileChunkPro 无障碍与国际化功能示例
 */
import { UploaderCore } from '../src/core/UploaderCore';
import { BrowserAdapter } from '../src/adapters/BrowserAdapter';
import { AccessibilityPlugin } from '../src/plugins/AccessibilityPlugin';
import { I18nPlugin } from '../src/plugins/I18nPlugin';
import { LanguageCode } from '../src/types/i18n';
import { RTLHelper } from '../src/utils/RTLHelper';

// 创建上传器实例
const uploader = new UploaderCore({
  adapter: new BrowserAdapter(),
  endpoint: 'https://your-upload-api.com/upload',
  chunkSize: 1024 * 1024 * 2, // 2MB
  maxConcurrentUploads: 3,
  retryCount: 3,
  autoStart: true,
});

// 添加无障碍插件
const accessibilityPlugin = new AccessibilityPlugin({
  enabled: true,
  keyboardNavigation: true,
  screenReaderSupport: true,
  // 自定义ARIA标签
  ariaLabels: {
    uploader: '高级文件上传器',
    dropZone: '将文件拖放到此处上传，或按下回车键选择文件',
    fileList: '上传文件列表',
    uploadButton: '选择文件上传',
    removeButton: '删除此文件',
    cancelButton: '取消上传',
    retryButton: '重试上传',
    progress: '上传进度指示器',
  },
});

// 添加英语资源
const enResources = {
  'upload.title': 'File Uploader',
  'upload.dropzone': 'Drop files here or click to upload',
  'upload.button': 'Select Files',
  'upload.dragHint': 'Drag files here',
  'error.network': 'Network error occurred during upload',
  'error.server': 'Server error occurred',
  'error.fileType': 'File type not allowed',
  'error.fileSize': 'File is too large',
  'status.uploading': 'Uploading...',
  'status.success': 'Upload successful',
  'status.error': 'Upload failed',
  'action.cancel': 'Cancel',
  'action.retry': 'Retry',
  'action.remove': 'Remove',
};

// 添加法语资源
const frResources = {
  'upload.title': 'Téléchargeur de fichiers',
  'upload.dropzone': 'Déposez des fichiers ici ou cliquez pour télécharger',
  'upload.button': 'Sélectionner des fichiers',
  'upload.dragHint': 'Faites glisser les fichiers ici',
  'error.network': 'Erreur réseau lors du téléchargement',
  'error.server': 'Erreur du serveur',
  'error.fileType': 'Type de fichier non autorisé',
  'error.fileSize': 'Le fichier est trop volumineux',
  'status.uploading': 'Téléchargement en cours...',
  'status.success': 'Téléchargement réussi',
  'status.error': 'Échec du téléchargement',
  'action.cancel': 'Annuler',
  'action.retry': 'Réessayer',
  'action.remove': 'Supprimer',
};

// 添加阿拉伯语资源 (RTL语言)
const arResources = {
  'upload.title': 'أداة رفع الملفات',
  'upload.dropzone': 'أفلت الملفات هنا أو انقر للتحميل',
  'upload.button': 'اختر الملفات',
  'upload.dragHint': 'اسحب الملفات إلى هنا',
  'error.network': 'حدث خطأ في الشبكة أثناء التحميل',
  'error.server': 'حدث خطأ في الخادم',
  'error.fileType': 'نوع الملف غير مسموح به',
  'error.fileSize': 'الملف كبير جدًا',
  'status.uploading': 'جارٍ التحميل...',
  'status.success': 'تم التحميل بنجاح',
  'status.error': 'فشل التحميل',
  'action.cancel': 'إلغاء',
  'action.retry': 'إعادة المحاولة',
  'action.remove': 'إزالة',
};

// 添加国际化插件
const i18nPlugin = new I18nPlugin({
  currentLanguage: 'zh-CN', // 默认中文
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

// 注册插件
uploader.use(accessibilityPlugin);
uploader.use(i18nPlugin);

// 当DOM加载完成后初始化UI
document.addEventListener('DOMContentLoaded', () => {
  // 获取国际化上下文
  const i18n = uploader.getFeature('i18n');

  // 创建上传区域
  const container = document.createElement('div');
  container.className = 'file-uploader-container';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', i18n.t('upload.title'));

  // 设置文字方向
  RTLHelper.applyDirectionAttributes(container, i18n.direction);

  // 创建标题
  const title = document.createElement('h1');
  title.textContent = i18n.t('upload.title');
  container.appendChild(title);

  // 创建语言选择器
  const langSelector = document.createElement('select');
  langSelector.setAttribute('aria-label', '选择语言 / Select Language');
  langSelector.className = 'language-selector';

  // 添加语言选项
  const languages: [LanguageCode, string][] = [
    ['zh-CN', '中文'],
    ['en-US', 'English'],
    ['fr-FR', 'Français'],
    ['ar-SA', 'العربية'],
  ];

  languages.forEach(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    option.selected = code === i18n.currentLanguage;
    langSelector.appendChild(option);
  });

  // 语言切换事件
  langSelector.addEventListener('change', async () => {
    const newLanguage = langSelector.value as LanguageCode;
    await i18n.changeLanguage(newLanguage);

    // 更新UI文本
    updateUITexts();

    // 更新方向
    RTLHelper.applyDirectionAttributes(container, i18n.direction);
  });

  container.appendChild(langSelector);

  // 创建拖放区域
  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZone.tabIndex = 0;
  dropZone.setAttribute('role', 'button');
  dropZone.setAttribute('aria-label', i18n.t('upload.dropzone'));

  const dropText = document.createElement('p');
  dropText.className = 'drop-text';
  dropText.textContent = i18n.t('upload.dropzone');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.className = 'file-input';
  fileInput.setAttribute('aria-hidden', 'true');
  fileInput.style.display = 'none';

  dropZone.appendChild(dropText);
  dropZone.appendChild(fileInput);
  container.appendChild(dropZone);

  // 创建上传按钮
  const uploadButton = document.createElement('button');
  uploadButton.className = 'upload-button';
  uploadButton.textContent = i18n.t('upload.button');
  uploadButton.setAttribute('aria-label', i18n.t('upload.button'));
  container.appendChild(uploadButton);

  // 创建文件列表容器
  const fileListContainer = document.createElement('div');
  fileListContainer.className = 'file-list-container';
  fileListContainer.setAttribute('role', 'region');
  fileListContainer.setAttribute('aria-label', i18n.t('file.status.pending'));
  container.appendChild(fileListContainer);

  // 添加到页面
  document.body.appendChild(container);

  // 拖放事件处理
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
    dropText.textContent = i18n.t('upload.dragHint');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
    dropText.textContent = i18n.t('upload.dropzone');
  });

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    dropText.textContent = i18n.t('upload.dropzone');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
  });

  // 点击拖放区域时触发文件选择
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // 键盘回车/空格激活拖放区域
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // 文件选择事件
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFiles(Array.from(fileInput.files));
      // 重置文件输入，以便能够重复选择相同文件
      fileInput.value = '';
    }
  });

  // 上传按钮点击事件
  uploadButton.addEventListener('click', () => {
    fileInput.click();
  });

  // 更新UI文本的函数
  function updateUITexts() {
    title.textContent = i18n.t('upload.title');
    dropText.textContent = i18n.t('upload.dropzone');
    uploadButton.textContent = i18n.t('upload.button');
    dropZone.setAttribute('aria-label', i18n.t('upload.dropzone'));
    uploadButton.setAttribute('aria-label', i18n.t('upload.button'));
  }

  // 处理文件上传
  function handleFiles(files: File[]) {
    files.forEach(file => {
      // 添加文件到上传器
      const fileId = uploader.addFile(file);

      // 创建文件项UI
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.id = `file-item-${fileId}`;
      fileItem.setAttribute('role', 'listitem');
      fileItem.setAttribute(
        'aria-label',
        `${file.name}, ${formatFileSize(file.size)}`
      );

      // 文件名
      const fileName = document.createElement('div');
      fileName.className = 'file-name';
      fileName.textContent = file.name;

      // 文件大小
      const fileSize = document.createElement('div');
      fileSize.className = 'file-size';
      fileSize.textContent = formatFileSize(file.size);

      // 状态文本
      const statusText = document.createElement('div');
      statusText.className = 'file-status';
      statusText.textContent = i18n.t('status.uploading');
      statusText.setAttribute('aria-live', 'polite');

      // 进度条容器
      const progressContainer = document.createElement('div');
      progressContainer.className = 'progress-container';

      // 进度条
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      progressBar.style.width = '0%';
      progressBar.id = `progress-${fileId}`;
      progressBar.setAttribute('role', 'progressbar');
      progressBar.setAttribute('aria-valuemin', '0');
      progressBar.setAttribute('aria-valuemax', '100');
      progressBar.setAttribute('aria-valuenow', '0');
      progressBar.setAttribute('aria-valuetext', '0%已上传');

      progressContainer.appendChild(progressBar);

      // 操作按钮容器
      const actionButtons = document.createElement('div');
      actionButtons.className = 'action-buttons';

      // 取消按钮
      const cancelButton = document.createElement('button');
      cancelButton.className = 'cancel-button';
      cancelButton.textContent = i18n.t('action.cancel');
      cancelButton.setAttribute('aria-label', i18n.t('action.cancel'));
      cancelButton.id = `cancel-button-${fileId}`;

      // 重试按钮 (初始隐藏)
      const retryButton = document.createElement('button');
      retryButton.className = 'retry-button';
      retryButton.textContent = i18n.t('action.retry');
      retryButton.setAttribute('aria-label', i18n.t('action.retry'));
      retryButton.id = `retry-button-${fileId}`;
      retryButton.style.display = 'none';

      // 删除按钮
      const removeButton = document.createElement('button');
      removeButton.className = 'remove-button';
      removeButton.textContent = i18n.t('action.remove');
      removeButton.setAttribute('aria-label', i18n.t('action.remove'));
      removeButton.id = `remove-button-${fileId}`;

      actionButtons.appendChild(cancelButton);
      actionButtons.appendChild(retryButton);
      actionButtons.appendChild(removeButton);

      fileItem.appendChild(fileName);
      fileItem.appendChild(fileSize);
      fileItem.appendChild(statusText);
      fileItem.appendChild(progressContainer);
      fileItem.appendChild(actionButtons);

      fileListContainer.appendChild(fileItem);

      // 注册上传事件处理
      uploader.on('upload:progress', ({ file, progress }) => {
        if (file.id === fileId) {
          const percent = Math.round(progress);
          progressBar.style.width = `${percent}%`;
          progressBar.setAttribute('aria-valuenow', String(percent));
          progressBar.setAttribute('aria-valuetext', `${percent}%已上传`);
        }
      });

      uploader.on('upload:success', ({ file }) => {
        if (file.id === fileId) {
          statusText.textContent = i18n.t('status.success');
          statusText.classList.add('success');
          cancelButton.style.display = 'none';
          fileItem.setAttribute(
            'aria-label',
            `${file.name}, ${i18n.t('status.success')}`
          );
        }
      });

      uploader.on('upload:error', ({ file, error }) => {
        if (file.id === fileId) {
          statusText.textContent = `${i18n.t('status.error')}: ${i18n.t(`error.${error.type.toLowerCase()}`)}`;
          statusText.classList.add('error');
          cancelButton.style.display = 'none';
          retryButton.style.display = 'inline-block';
          fileItem.setAttribute(
            'aria-label',
            `${file.name}, ${i18n.t('status.error')}`
          );
        }
      });

      // 取消按钮点击事件
      cancelButton.addEventListener('click', () => {
        uploader.cancelUpload(fileId);
        cancelButton.style.display = 'none';
        statusText.textContent = i18n.t('action.cancel');
      });

      // 重试按钮点击事件
      retryButton.addEventListener('click', () => {
        uploader.retryUpload(fileId);
        retryButton.style.display = 'none';
        cancelButton.style.display = 'inline-block';
        statusText.textContent = i18n.t('status.uploading');
        statusText.classList.remove('error');
      });

      // 删除按钮点击事件
      removeButton.addEventListener('click', () => {
        uploader.removeFile(fileId);
        fileListContainer.removeChild(fileItem);
      });
    });
  }

  // 格式化文件大小
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
});

// 添加样式
const style = document.createElement('style');
style.textContent = `
  .file-uploader-container {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    background-color: #fff;
  }
  
  h1 {
    color: #333;
    margin-bottom: 20px;
  }
  
  .language-selector {
    padding: 8px 12px;
    margin-bottom: 20px;
    border-radius: 4px;
    border: 1px solid #ddd;
  }
  
  .drop-zone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 40px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-bottom: 20px;
  }
  
  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: #0077ff;
    background-color: rgba(0, 119, 255, 0.05);
  }
  
  .drop-text {
    font-size: 18px;
    color: #666;
    margin: 0;
  }
  
  .upload-button {
    background-color: #0077ff;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    font-size: 16px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    margin-bottom: 20px;
  }
  
  .upload-button:hover {
    background-color: #0066dd;
  }
  
  .file-list-container {
    border-radius: 4px;
    border: 1px solid #eee;
    overflow: hidden;
  }
  
  .file-item {
    display: flex;
    align-items: center;
    padding: 15px;
    border-bottom: 1px solid #eee;
    position: relative;
  }
  
  .file-item:last-child {
    border-bottom: none;
  }
  
  .file-name {
    flex: 2;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .file-size {
    flex: 1;
    color: #666;
    font-size: 14px;
  }
  
  .file-status {
    flex: 1;
    font-size: 14px;
  }
  
  .file-status.success {
    color: #4caf50;
  }
  
  .file-status.error {
    color: #f44336;
  }
  
  .progress-container {
    flex: 3;
    height: 6px;
    background-color: #f5f5f5;
    border-radius: 3px;
    margin: 0 15px;
    overflow: hidden;
  }
  
  .progress-bar {
    height: 100%;
    background-color: #0077ff;
    transition: width 0.3s ease;
  }
  
  .action-buttons {
    display: flex;
    gap: 8px;
  }
  
  .action-buttons button {
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  
  .cancel-button {
    background-color: #f5f5f5;
    color: #666;
  }
  
  .retry-button {
    background-color: #ff9800;
    color: white;
  }
  
  .remove-button {
    background-color: #f44336;
    color: white;
  }
  
  /* RTL特定样式 */
  [dir="rtl"] .file-item {
    flex-direction: row-reverse;
  }
  
  [dir="rtl"] .action-buttons {
    flex-direction: row-reverse;
  }
  
  /* 键盘焦点样式 */
  :focus {
    outline: 2px solid #0077ff;
    outline-offset: 2px;
  }
  
  /* 无障碍支持 - 隐藏元素但保持屏幕阅读器可访问 */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;

// 添加样式到文档头部
document.head.appendChild(style);
