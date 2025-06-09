/**
 * 基础安全级别插件使用示例
 * 演示如何配置和使用基础安全级别插件
 */

import { UploaderCore } from '../core';
import {
  BasicSecurityPlugin,
  getSecurityPluginByLevel,
} from '../plugins/security';
import { SecurityLevel } from '../types';

/**
 * 基础安全级别示例
 */
async function basicSecurityExample() {
  console.log('基础安全级别示例');

  // 创建上传器实例
  const uploader = new UploaderCore({
    endpoint: 'https://example.com/upload',
    chunkSize: 1024 * 1024, // 1MB分片
    allowFileTypes: ['image/*', 'application/pdf'], // 允许的文件类型
    maxFileSize: 10 * 1024 * 1024, // 最大10MB
    debug: true, // 启用调试模式以查看安全日志
  });

  // 创建并注册基础安全插件
  const securityPlugin = new BasicSecurityPlugin({
    // 自定义配置
    maxFileNameLength: 100, // 限制文件名长度
    enableSensitiveExtensionCheck: true, // 启用敏感文件扩展名检查
    validateFileExtension: true, // 验证文件扩展名与MIME类型是否匹配
  });

  // 注册插件
  uploader.use(securityPlugin);

  // 注册安全事件监听
  uploader.on('security:event', event => {
    console.log('安全事件:', event);
  });

  uploader.on('security:issue', issue => {
    console.error('安全问题:', issue);
  });

  // 模拟上传安全文件
  try {
    // 创建安全的图片文件
    const safeImageFile = new File(
      [new Uint8Array(1024 * 1024)], // 1MB的空数据
      'safe-image.jpg',
      { type: 'image/jpeg' }
    );

    console.log('上传安全文件:', safeImageFile.name);
    const safeResult = await uploader.upload(safeImageFile);
    console.log('安全文件上传结果:', safeResult);
  } catch (error) {
    console.error('安全文件上传失败:', error);
  }

  // 模拟上传不安全的文件（超过大小限制）
  try {
    // 创建超过大小限制的文件
    const oversizedFile = new File(
      [new Uint8Array(15 * 1024 * 1024)], // 15MB的空数据，超过10MB限制
      'oversized-file.jpg',
      { type: 'image/jpeg' }
    );

    console.log('上传超大文件:', oversizedFile.name);
    const oversizedResult = await uploader.upload(oversizedFile);
    console.log('超大文件上传结果:', oversizedResult);
  } catch (error) {
    console.error('超大文件上传失败:', error);
  }

  // 模拟上传不安全的文件（类型不允许）
  try {
    // 创建不允许类型的文件
    const executableFile = new File(
      [new Uint8Array(1024 * 1024)], // 1MB的空数据
      'malicious.exe',
      { type: 'application/x-msdownload' }
    );

    console.log('上传可执行文件:', executableFile.name);
    const executableResult = await uploader.upload(executableFile);
    console.log('可执行文件上传结果:', executableResult);
  } catch (error) {
    console.error('可执行文件上传失败:', error);
  }

  // 模拟上传不安全的文件（MIME类型与扩展名不匹配）
  try {
    // 创建MIME类型与扩展名不匹配的文件
    const mismatchFile = new File(
      [new Uint8Array(1024 * 1024)], // 1MB的空数据
      'fake.pdf', // 看起来像PDF
      { type: 'text/html' } // 但实际是HTML
    );

    console.log('上传类型不匹配文件:', mismatchFile.name);
    const mismatchResult = await uploader.upload(mismatchFile);
    console.log('类型不匹配文件上传结果:', mismatchResult);
  } catch (error) {
    console.error('类型不匹配文件上传失败:', error);
  }
}

/**
 * 使用工厂方法获取安全插件示例
 */
function securityPluginFactoryExample() {
  console.log('使用工厂方法创建安全插件示例');

  // 创建上传器实例
  const uploader = new UploaderCore({
    endpoint: 'https://example.com/upload',
    chunkSize: 1024 * 1024, // 1MB分片
  });

  // 使用工厂方法获取基础安全级别插件
  const BasicSecurityPluginClass = getSecurityPluginByLevel(
    SecurityLevel.BASIC
  );
  const securityPlugin = new BasicSecurityPluginClass({
    maxFileSize: 20 * 1024 * 1024, // 20MB
    allowedMimeTypes: ['image/*', 'application/pdf', 'text/plain'],
  });

  // 注册插件
  uploader.use(securityPlugin);

  console.log('基础安全插件已注册');
}

// 运行示例
(async () => {
  await basicSecurityExample();
  console.log('-----------------');
  securityPluginFactoryExample();
})().catch(error => {
  console.error('示例运行失败:', error);
});

export { basicSecurityExample, securityPluginFactoryExample };
