/**
 * Vue插件 - 为Vue应用提供FileChunkPro集成
 */

import type { App } from 'vue';
import type { UploaderOptions } from '../../types';
import FileUploader from './components.vue';

/**
 * Vue插件选项
 */
export interface FileChunkProVuePluginOptions extends UploaderOptions {
  /**
   * 是否注册全局组件
   */
  registerComponents?: boolean;

  /**
   * 自定义全局组件名称
   */
  componentNames?: {
    FileUploader?: string;
  };
}

/**
 * 创建FileChunkPro Vue插件
 */
export function createFileChunkProPlugin(
  options: FileChunkProVuePluginOptions = {}
) {
  const {
    registerComponents = true,
    componentNames = {},
    ...uploaderOptions
  } = options;

  return {
    /**
     * 安装Vue插件
     */
    install(app: App) {
      // 注册全局组件
      if (registerComponents) {
        app.component(
          componentNames.FileUploader || 'FileUploader',
          FileUploader
        );
      }

      // 注入全局配置
      app.provide('fileChunkProOptions', uploaderOptions);

      // 添加全局属性
      app.config.globalProperties.$fileChunkPro = {
        options: uploaderOptions,
      };
    },
  };
}

/**
 * FileChunkPro Vue插件
 * 使用默认配置
 */
export const FileChunkProPlugin = createFileChunkProPlugin();
