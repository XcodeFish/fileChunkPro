/**
 * 插件SDK使用示例
 * 展示如何注册和使用自定义插件
 */

import UploaderCore from '../../core/UploaderCore';
import { PluginSDK } from '../../plugins/SDK';
import { ExamplePlugin } from './ExamplePlugin';

/**
 * 演示插件SDK的使用
 */
export async function demoPluginSDK(): Promise<void> {
  // 创建上传器核心实例
  const uploader = new UploaderCore({
    endpoint: 'https://api.example.com/upload',
    chunkSize: 2 * 1024 * 1024, // 2MB分片
    concurrency: 3,
  });

  // 创建插件SDK实例
  const pluginSDK = new PluginSDK(uploader);

  // 创建并注册示例插件
  const examplePlugin = new ExamplePlugin();
  pluginSDK.registerPlugin(examplePlugin, {
    config: {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      enableLogging: true,
    },
  });

  console.log('插件已注册，准备初始化...');

  // 初始化所有插件
  await pluginSDK.initialize();

  console.log('所有插件初始化完成');

  // 获取插件元数据
  const metadata = pluginSDK.getPluginMetadata('example-plugin');
  console.log('插件元数据:', metadata);

  // 更新插件配置
  pluginSDK.updatePluginConfig('example-plugin', {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    enableNotifications: true,
  });

  console.log('插件配置已更新');

  // 上传文件（这里仅做演示，实际会触发插件中的钩子）
  try {
    // 创建一个测试文件
    const testFile = new File(['测试文件内容'], 'test.txt', {
      type: 'text/plain',
    });

    // 这将触发BEFORE_UPLOAD钩子，调用示例插件中的handleBeforeUpload方法
    console.log('准备上传文件...');

    // 这里假设UploaderCore有一个upload方法
    // 实际的upload方法会调用插件中注册的钩子
    await uploader.upload(testFile);

    console.log('文件上传完成');
  } catch (error) {
    console.error('上传失败:', error);
  }

  // 卸载插件
  const unregistered = pluginSDK.unregisterPlugin('example-plugin');
  console.log('插件卸载结果:', unregistered);

  // 销毁插件SDK
  await pluginSDK.destroy();
  console.log('插件SDK已销毁');
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  demoPluginSDK().catch(console.error);
}
