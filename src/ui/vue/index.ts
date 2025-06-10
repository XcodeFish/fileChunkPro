/**
 * Vue组件入口文件
 * 导出所有Vue相关组件
 */

import FileUploader from './components.vue';

// 导出组件
export { FileUploader };

// 默认导出
export default {
  FileUploader,
};

/**
 * Vue组件与钩子函数导出
 */

// 导出Composition API钩子
import {
  useFileUpload,
  useUploadProgress,
  useServiceWorkerUpload,
} from './hooks';

// 导出Vue插件
import {
  createFileChunkProPlugin,
  FileChunkProPlugin,
  FileChunkProVuePluginOptions,
} from './plugin';

export {
  // 组件
  FileUploader,

  // Hooks
  useFileUpload,
  useUploadProgress,
  useServiceWorkerUpload,

  // 插件
  createFileChunkProPlugin,
  FileChunkProPlugin,
  FileChunkProVuePluginOptions,
};
