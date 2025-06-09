/**
 * 微信小程序环境入口文件
 */

// 导出类型定义
export * from '../types';

// 导入核心模块和适配器
import { WechatAdapter } from '../adapters';
import { UploaderCore } from '../core/UploaderCore';
import { ChunkPlugin } from '../plugins/ChunkPlugin';
import { ProgressPlugin } from '../plugins/ProgressPlugin';
import { ResumePlugin } from '../plugins/ResumePlugin';
import { ValidatorPlugin } from '../plugins/ValidatorPlugin';

/**
 * 创建预配置的微信小程序上传器
 * @param options 上传器配置选项
 * @returns 配置好的上传器实例
 */
export function createWechatUploader(options = {}) {
  // 创建微信小程序适配器
  const adapter = new WechatAdapter(options);

  // 创建上传器实例
  const uploader = new UploaderCore({
    ...options,
    adapter,
  });

  // 注册基础插件
  uploader.use(new ChunkPlugin());
  uploader.use(new ProgressPlugin());
  uploader.use(new ResumePlugin());
  uploader.use(new ValidatorPlugin());

  return uploader;
}

// 导出默认工厂函数
export default createWechatUploader;
