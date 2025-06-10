import { UploaderCore } from '../core/UploaderCore';
import { AdaptiveUploadPlugin } from '../plugins/AdaptiveUploadPlugin';
import { BrowserAdapter } from '../adapters/BrowserAdapter';

/**
 * 自适应上传策略插件使用示例
 */
const createUploaderWithAdaptiveStrategy = () => {
  // 创建上传器实例
  const uploader = new UploaderCore({
    adapter: new BrowserAdapter(),
    target: 'https://api.example.com/upload',
    chunkSize: 1024 * 1024, // 1MB
    simultaneousUploads: 3,
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
  });

  // 自定义路径列表示例
  const customPaths = [
    {
      url: 'https://upload-east.example.com/upload',
      weight: 0.8,
      region: 'east',
      tags: ['main'],
    },
    {
      url: 'https://upload-west.example.com/upload',
      weight: 0.7,
      region: 'west',
      tags: ['backup'],
    },
    {
      url: 'https://cdn-upload.example.com/upload',
      weight: 0.9,
      region: 'global',
      tags: ['cdn'],
    },
  ];

  // 自定义CDN节点示例
  const customCDNNodes = [
    {
      id: 'cdn1',
      url: 'https://cdn1.example.com/upload',
      region: 'global',
      provider: 'provider1',
      enabled: true,
    },
    {
      id: 'cdn2',
      url: 'https://cdn2.example.com/upload',
      region: 'asia',
      provider: 'provider2',
      enabled: true,
    },
    {
      id: 'cdn3',
      url: 'https://cdn3.example.com/upload',
      region: 'europe',
      provider: 'provider3',
      enabled: true,
    },
  ];

  // 创建并注册自适应上传策略插件
  const adaptivePlugin = new AdaptiveUploadPlugin({
    enableNetworkDetection: true,
    networkMonitoringInterval: 30000, // 30秒检测一次
    enableParameterAdjustment: true,
    enablePathOptimization: true,
    enableCDNSelection: true,
    initialParameters: {
      chunkSize: 512 * 1024, // 初始分片大小
      concurrency: 3, // 初始并发数
    },
    customPaths: customPaths,
    customCDNNodes: customCDNNodes,
    minChunkSize: 256 * 1024, // 最小256KB
    maxChunkSize: 4 * 1024 * 1024, // 最大4MB
    minConcurrency: 1,
    maxConcurrency: 5,
    perFileStrategy: true, // 每个文件单独应用策略
    debug: true, // 开启调试日志
  });

  // 注册插件
  uploader.use(adaptivePlugin);

  // 监听自适应策略事件
  uploader.events.on('adaptiveStrategy', (event: any) => {
    console.log(`自适应策略事件: ${event.type}`, event.data);

    // 根据不同的事件类型做不同处理
    switch (event.type) {
      case 'network_quality_change': {
        // 网络质量变化时的处理
        const quality = event.data.networkQuality.qualityLevel;
        console.log(`网络质量变为: ${quality}`);
        break;
      }

      case 'parameters_adjusted':
        // 参数调整时的处理
        console.log('参数已调整:', event.data.parameters);
        break;

      case 'path_optimized':
        // 路径优化时的处理
        console.log('已选择最佳上传路径:', event.data.path.url);
        break;

      case 'cdn_selected':
        // CDN选择时的处理
        console.log('已选择最佳CDN节点:', event.data.cdn.url);
        break;
    }
  });

  return uploader;
};

/**
 * 使用示例
 */
const startUpload = () => {
  const uploader = createUploaderWithAdaptiveStrategy();

  // 模拟文件选择
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileInput?.addEventListener('change', event => {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (files && files.length > 0) {
      // 上传所有选择的文件
      Array.from(files).forEach(file => {
        // 添加文件到上传器
        uploader.addFile(file);
      });

      // 开始上传
      uploader.start();
    }
  });

  // 监听上传进度
  uploader.events.on('fileProgress', (file: any, progress: number) => {
    console.log(`文件 ${file.name} 上传进度: ${Math.round(progress * 100)}%`);
    // 更新UI进度条
    updateProgressBar(file.id, progress);
  });

  // 监听上传成功
  uploader.events.on('fileSuccess', (file: any, response: any) => {
    console.log(`文件 ${file.name} 上传成功:`, response);
    showSuccess(file.name);
  });

  // 监听上传错误
  uploader.events.on('fileError', (file: any, error: any) => {
    console.error(`文件 ${file.name} 上传失败:`, error);
    showError(file.name, error);
  });

  return uploader;
};

/**
 * 更新进度条UI
 * @param fileId 文件ID
 * @param progress 进度(0-1)
 */
const updateProgressBar = (fileId: string, progress: number) => {
  const progressBar = document.querySelector(
    `[data-file-id="${fileId}"] .progress-bar`
  ) as HTMLElement;
  if (progressBar) {
    progressBar.style.width = `${Math.round(progress * 100)}%`;
    progressBar.textContent = `${Math.round(progress * 100)}%`;
  }
};

/**
 * 显示上传成功消息
 * @param fileName 文件名
 */
const showSuccess = (fileName: string) => {
  const successElement = document.getElementById('upload-messages');
  if (successElement) {
    const message = document.createElement('div');
    message.className = 'alert alert-success';
    message.textContent = `文件 ${fileName} 上传成功!`;
    successElement.appendChild(message);

    // 3秒后自动移除消息
    setTimeout(() => {
      message.remove();
    }, 3000);
  }
};

/**
 * 显示上传错误消息
 * @param fileName 文件名
 * @param error 错误信息
 */
const showError = (fileName: string, error: any) => {
  const errorElement = document.getElementById('upload-messages');
  if (errorElement) {
    const message = document.createElement('div');
    message.className = 'alert alert-danger';
    message.textContent = `文件 ${fileName} 上传失败: ${error.message || '未知错误'}`;
    errorElement.appendChild(message);
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化上传器
  const uploader = startUpload();

  // 绑定暂停按钮事件
  const pauseButton = document.getElementById('pause-button');
  pauseButton?.addEventListener('click', () => {
    uploader.pause();
  });

  // 绑定恢复按钮事件
  const resumeButton = document.getElementById('resume-button');
  resumeButton?.addEventListener('click', () => {
    uploader.resume();
  });

  // 绑定取消按钮事件
  const cancelButton = document.getElementById('cancel-button');
  cancelButton?.addEventListener('click', () => {
    uploader.cancel();
  });
});

// 导出上传器创建函数，方便其他地方使用
export { createUploaderWithAdaptiveStrategy };
