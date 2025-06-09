/**
 * FileChunkPro PWA 功能使用示例
 */

import { BrowserAdapter } from '../adapters/BrowserAdapter';
import { UploaderCore } from '../core/UploaderCore';
import { ChunkPlugin, PWAPlugin, ProgressPlugin } from '../plugins';
import { ServiceWorkerBuilder } from '../utils/ServiceWorkerBuilder';

// 创建 PWA 支持示例
async function initializePWAUploader() {
  try {
    // 1. 初始化上传核心
    const uploader = new UploaderCore({
      adapter: new BrowserAdapter(),
      autoStart: true,
      retryCount: 3,
      chunkSize: 2 * 1024 * 1024, // 2MB 分片
    });

    // 2. 安装基本插件
    uploader.use(new ChunkPlugin());
    uploader.use(
      new ProgressPlugin({
        onProgress: progress => {
          console.log(`上传进度: ${progress}%`);
          // 更新UI进度条
          const progressBar = document.getElementById('progress-bar');
          if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${progress}%`;
          }
        },
      })
    );

    // 3. 安装 PWA 插件
    const pwaPlugin = new PWAPlugin({
      enabled: true,
      swPath: '/sw.js',
      cachePrefix: 'file-uploader-',
      autoRegister: true,
      manifestPath: '/manifest.json',
    });
    uploader.use(pwaPlugin);

    // 4. 生成 ServiceWorker 文件
    const swBuilder = new ServiceWorkerBuilder();
    await swBuilder.buildFromTemplate({
      cacheVersion: '1.0.0',
      outputPath: './public/sw.js',
      precacheResources: [
        '/',
        '/index.html',
        '/css/main.css',
        '/js/main.js',
        '/offline.html',
        '/icons/icon-192x192.png',
        '/icons/icon-512x512.png',
      ],
      enablePushNotifications: true,
      enableOfflinePage: true,
      offlinePagePath: '/offline.html',
    });

    // 5. 监听 PWA 相关事件
    uploader.on('pwa:sw-registered', registration => {
      console.log('ServiceWorker 已注册:', registration);
      // 显示UI通知
      showNotification('PWA 已准备就绪', '应用现在可以离线使用');
    });

    uploader.on('pwa:offline', () => {
      console.log('检测到网络离线');
      // 更新UI显示离线状态
      setOfflineStatus(true);
    });

    uploader.on('pwa:online', () => {
      console.log('网络已连接');
      // 更新UI显示在线状态
      setOfflineStatus(false);

      // 恢复之前暂停的上传
      resumePendingUploads();
    });

    // 6. 添加安装PWA按钮事件
    const installButton = document.getElementById('install-pwa');
    if (installButton) {
      // 检查PWA是否可安装
      const pwaStatus = pwaPlugin.getPWAStatus();
      installButton.style.display = pwaStatus.isInstallable ? 'block' : 'none';

      installButton.addEventListener('click', async () => {
        const installed = await pwaPlugin.promptInstall();
        if (installed) {
          installButton.style.display = 'none';
          showNotification('应用已安装', '感谢安装我们的应用');
        }
      });
    }

    // 7. 捕获beforeinstallprompt事件以便后续使用
    window.addEventListener('beforeinstallprompt', e => {
      // 阻止Chrome 67及更早版本自动显示安装提示
      e.preventDefault();
      // 保存事件以便稍后触发
      // @ts-ignore: 保存deferredPrompt事件
      window.deferredPrompt = e;

      // 更新UI显示安装按钮
      const installButton = document.getElementById('install-pwa');
      if (installButton) {
        installButton.style.display = 'block';
      }
    });

    return uploader;
  } catch (error) {
    console.error('初始化PWA上传器失败:', error);
    throw error;
  }
}

// 显示通知
function showNotification(title: string, message: string) {
  // 检查是否支持通知API
  if ('Notification' in window) {
    // 请求通知权限
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        // 创建通知
        new Notification(title, {
          body: message,
          icon: '/icons/icon-192x192.png',
        });
      }
    });
  }

  // 显示UI通知
  const notificationElement = document.createElement('div');
  notificationElement.className = 'notification';
  notificationElement.innerHTML = `
    <div class="notification-header">${title}</div>
    <div class="notification-body">${message}</div>
  `;

  document.body.appendChild(notificationElement);

  // 5秒后移除通知
  setTimeout(() => {
    notificationElement.classList.add('notification-hide');
    setTimeout(() => {
      document.body.removeChild(notificationElement);
    }, 300);
  }, 5000);
}

// 设置离线状态UI
function setOfflineStatus(isOffline: boolean) {
  const statusElement = document.getElementById('network-status');
  if (statusElement) {
    statusElement.className = isOffline ? 'status-offline' : 'status-online';
    statusElement.textContent = isOffline ? '离线' : '在线';
  }

  // 设置上传按钮状态
  const uploadButton = document.getElementById('upload-button');
  if (uploadButton) {
    uploadButton.disabled = isOffline;
    uploadButton.title = isOffline ? '离线状态下无法上传文件' : '上传文件';
  }
}

// 恢复暂停的上传
function resumePendingUploads() {
  // 这里可以实现从本地存储中读取暂停的上传任务并恢复
  const pendingUploads = localStorage.getItem('pendingUploads');
  if (pendingUploads) {
    try {
      const uploads = JSON.parse(pendingUploads);
      console.log('发现待恢复上传任务:', uploads.length);

      // 这里可以实现恢复逻辑
      // ...

      // 清空待恢复队列
      localStorage.removeItem('pendingUploads');
    } catch (error) {
      console.error('解析待恢复上传任务失败:', error);
    }
  }
}

// 启动示例
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const uploader = await initializePWAUploader();
    console.log('PWA上传器初始化成功', uploader);

    // 设置文件选择和上传逻辑
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const uploadButton = document.getElementById('upload-button');

    if (fileInput && uploadButton) {
      uploadButton.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', async _event => {
        const files = fileInput.files;
        if (files && files.length > 0) {
          try {
            for (let i = 0; i < files.length; i++) {
              await uploader.addFile(files[i]);
            }
            console.log(`已添加 ${files.length} 个文件到上传队列`);
          } catch (error) {
            console.error('添加文件失败:', error);
            showNotification('上传失败', '无法添加文件到上传队列');
          }
        }
      });
    }

    // 设置初始网络状态
    setOfflineStatus(!navigator.onLine);
  } catch (error) {
    console.error('初始化应用失败:', error);
    // 显示错误UI
    const errorElement = document.getElementById('error-container');
    if (errorElement) {
      errorElement.style.display = 'block';
      errorElement.textContent = `初始化应用失败: ${error.message || '未知错误'}`;
    }
  }
});

// 导出函数以便可以从HTML中直接调用
(window as any).fileUploaderApp = {
  initializePWAUploader,
  showNotification,
  setOfflineStatus,
};
