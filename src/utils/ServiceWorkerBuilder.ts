/**
 * ServiceWorkerBuilder - ServiceWorker 生成工具
 * 提供构建和定制 ServiceWorker 功能
 */

import * as fs from 'fs';
import * as path from 'path';

import { Logger } from './Logger';

export interface SWBuildOptions {
  /**
   * 缓存版本
   */
  cacheVersion?: string;

  /**
   * 缓存名称前缀
   */
  cachePrefix?: string;

  /**
   * 需要预缓存的资源
   */
  precacheResources?: string[];

  /**
   * 网络优先的资源匹配模式
   */
  networkFirstPatterns?: string[];

  /**
   * 缓存优先的资源匹配模式
   */
  cacheFirstPatterns?: string[];

  /**
   * 输出文件路径
   */
  outputPath?: string;

  /**
   * 是否启用推送通知
   */
  enablePushNotifications?: boolean;

  /**
   * 是否启用离线页面
   */
  enableOfflinePage?: boolean;

  /**
   * 离线页面路径
   */
  offlinePagePath?: string;

  /**
   * 通知图标路径
   */
  notificationIconPath?: string;

  /**
   * 通知徽章路径
   */
  notificationBadgePath?: string;
}

export class ServiceWorkerBuilder {
  private logger: Logger;
  private swTemplatePath: string;

  constructor(templatePath?: string) {
    this.logger = new Logger('ServiceWorkerBuilder');
    this.swTemplatePath =
      templatePath || path.resolve(__dirname, '../workers/sw-template.js');
  }

  /**
   * 从模板构建 ServiceWorker
   */
  public async buildFromTemplate(
    options: SWBuildOptions = {}
  ): Promise<string> {
    try {
      // 默认值
      const cacheVersion = options.cacheVersion || '1.0.0';
      const cachePrefix = options.cachePrefix || 'fileChunkPro-';
      const outputPath = options.outputPath || 'sw.js';
      const enablePushNotifications = options.enablePushNotifications !== false;
      const enableOfflinePage = options.enableOfflinePage !== false;
      const offlinePagePath = options.offlinePagePath || '/offline.html';
      const notificationIconPath =
        options.notificationIconPath || '/icons/icon-192x192.png';
      const notificationBadgePath =
        options.notificationBadgePath || '/icons/badge-72x72.png';

      // 读取模板文件
      let template = await this.readTemplate();

      // 替换配置
      template = template
        .replace(
          "const CACHE_VERSION = '1.0.0';",
          `const CACHE_VERSION = '${cacheVersion}';`
        )
        .replace(
          "const CACHE_NAME = 'fileChunkPro-cache-v' + CACHE_VERSION;",
          `const CACHE_NAME = '${cachePrefix}cache-v' + CACHE_VERSION;`
        );

      // 替换预缓存资源
      if (options.precacheResources && options.precacheResources.length > 0) {
        const resourcesStr = this.generateArrayString(
          options.precacheResources
        );
        template = template.replace(
          /const PRECACHE_RESOURCES = \[([\s\S]*?)\];/m,
          `const PRECACHE_RESOURCES = ${resourcesStr};`
        );
      }

      // 替换网络优先模式
      if (
        options.networkFirstPatterns &&
        options.networkFirstPatterns.length > 0
      ) {
        const patternsStr = this.generateRegExpArrayString(
          options.networkFirstPatterns
        );
        template = template.replace(
          /const NETWORK_FIRST_PATTERNS = \[([\s\S]*?)\];/m,
          `const NETWORK_FIRST_PATTERNS = ${patternsStr};`
        );
      }

      // 替换缓存优先模式
      if (options.cacheFirstPatterns && options.cacheFirstPatterns.length > 0) {
        const patternsStr = this.generateRegExpArrayString(
          options.cacheFirstPatterns
        );
        template = template.replace(
          /const CACHE_FIRST_PATTERNS = \[([\s\S]*?)\];/m,
          `const CACHE_FIRST_PATTERNS = ${patternsStr};`
        );
      }

      // 配置推送通知
      if (!enablePushNotifications) {
        // 移除推送通知相关代码
        template = template.replace(
          /\/\/ 推送通知事件处理[\s\S]*?push[\s\S]*?}\);/m,
          '// 推送通知已禁用'
        );
        template = template.replace(
          /\/\/ 通知点击事件处理[\s\S]*?notificationclick[\s\S]*?}\);/m,
          '// 通知点击处理已禁用'
        );
      } else {
        // 更新通知图标
        template = template
          .replace(
            /icon: data\.icon \|\| '\/icons\/icon-192x192\.png',/g,
            `icon: data.icon || '${notificationIconPath}',`
          )
          .replace(
            /badge: data\.badge \|\| '\/icons\/badge-72x72\.png',/g,
            `badge: data.badge || '${notificationBadgePath}',`
          );
      }

      // 配置离线页面
      if (!enableOfflinePage) {
        // 移除离线页面相关代码
        template = template.replace(
          /\/\/ 如果是页面请求，返回离线页面[\s\S]*?return caches\.match\('\/offline\.html'\);/m,
          '// 离线页面已禁用'
        );
      } else {
        // 更新离线页面路径
        template = template.replace(
          /return caches\.match\('\/offline\.html'\);/g,
          `return caches.match('${offlinePagePath}');`
        );
      }

      // 写入输出文件（如果在Node环境）
      if (typeof process !== 'undefined' && fs.writeFileSync) {
        fs.writeFileSync(outputPath, template);
        this.logger.info(`ServiceWorker 已生成: ${outputPath}`);
      }

      return template;
    } catch (error) {
      this.logger.error('构建 ServiceWorker 失败:', error);
      throw error;
    }
  }

  /**
   * 读取模板文件
   */
  private async readTemplate(): Promise<string> {
    // 在 Node 环境中直接读取文件
    if (typeof process !== 'undefined' && fs.readFileSync) {
      return fs.readFileSync(this.swTemplatePath, 'utf8');
    }

    // 在浏览器环境中使用 fetch
    if (typeof fetch !== 'undefined') {
      const response = await fetch(this.swTemplatePath);
      return await response.text();
    }

    throw new Error('无法读取 ServiceWorker 模板');
  }

  /**
   * 生成数组字符串
   */
  private generateArrayString(items: string[]): string {
    return '[\n  ' + items.map(item => `'${item}'`).join(',\n  ') + '\n]';
  }

  /**
   * 生成正则表达式数组字符串
   */
  private generateRegExpArrayString(patterns: string[]): string {
    return (
      '[\n  ' +
      patterns
        .map(pattern => {
          // 检查是否已经是正则表达式格式
          if (pattern.startsWith('/') && pattern.indexOf('/', 1) > 0) {
            return pattern;
          }
          // 转义特殊字符
          const escaped = pattern
            .replace(/\./g, '\\.')
            .replace(/\//g, '\\/')
            .replace(/\+/g, '\\+')
            .replace(/\*/g, '\\*')
            .replace(/\?/g, '\\?')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}')
            .replace(/\^/g, '\\^')
            .replace(/\$/g, '\\$');

          // 支持通配符转换
          const regexPattern = escaped.replace(/\\\*/g, '.*'); // 将 \* 转换为 .*

          return `/${regexPattern}/`;
        })
        .join(',\n  ') +
      '\n]'
    );
  }

  /**
   * 生成默认离线页面内容
   */
  public static generateOfflinePageHTML(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>离线 - FileChunkPro</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
      color: #333;
      background-color: #f8f9fa;
    }
    .container {
      max-width: 500px;
      padding: 40px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    h1 {
      color: #2979ff;
      margin-bottom: 10px;
    }
    p {
      margin-bottom: 20px;
      line-height: 1.5;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    .retry-button {
      padding: 10px 20px;
      background-color: #2979ff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      transition: background-color 0.3s;
    }
    .retry-button:hover {
      background-color: #2062cc;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📶</div>
    <h1>您当前处于离线状态</h1>
    <p>无法连接到网络。请检查您的网络连接，然后重试。</p>
    <p>已保存的内容和文件仍可使用。</p>
    <button class="retry-button" onclick="window.location.reload()">重新连接</button>
  </div>
</body>
</html>`;
  }

  /**
   * 生成Web App Manifest内容
   */
  public static generateWebAppManifest(
    options: {
      name?: string;
      shortName?: string;
      description?: string;
      backgroundColor?: string;
      themeColor?: string;
      icons?: Array<{
        src: string;
        sizes: string;
        type: string;
      }>;
      startUrl?: string;
    } = {}
  ): string {
    const manifest = {
      name: options.name || 'FileChunkPro',
      short_name: options.shortName || 'FileChunkPro',
      description: options.description || '高性能文件分片上传工具',
      start_url: options.startUrl || '/',
      display: 'standalone',
      background_color: options.backgroundColor || '#ffffff',
      theme_color: options.themeColor || '#2979ff',
      icons: options.icons || [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    };

    return JSON.stringify(manifest, null, 2);
  }
}

export default ServiceWorkerBuilder;
