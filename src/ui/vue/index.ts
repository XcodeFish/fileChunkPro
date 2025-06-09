/**
 * Vue组件导出
 */
import FileUploader from './components.vue';
import { useFileUpload } from './hooks';

// 导出组件
export { FileUploader, useFileUpload };

// 默认导出
export default {
  install(app: any) {
    app.component('FileUploader', FileUploader);
  },
};
