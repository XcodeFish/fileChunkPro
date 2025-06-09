/* eslint-disable */
/**
 * fileChunkPro浏览器环境使用示例
 */

// 导入浏览器环境包
import {
  FileChunkPro,
  PerformanceCollector,
} from '../../dist/browser/index.js';

// 初始化性能监控
const performanceCollector = PerformanceCollector.getInstance({
  enabled: true,
  samplingRate: 1.0, // 100%采样
  reportInterval: 30000, // 30秒自动上报
  onReport: metrics => {
    // 上报性能数据
    console.log('Performance metrics:', metrics);

    // 实际项目中应该发送到服务器
    fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics }),
      keepalive: true,
    }).catch(console.error);
  },
});

// 初始化上传器
const uploader = new FileChunkPro({
  // 基本配置
  target: 'https://api.example.com/upload',
  chunkSize: 2 * 1024 * 1024, // 2MB分片
  concurrency: 3, // 并发数

  // 高级配置
  retryCount: 3,
  retryDelay: 1000,
  timeout: 30000,
  headers: { Authorization: 'Bearer token' },
  withCredentials: true,

  // 开启性能监控
  performanceMonitoring: true,
  performanceCollector: performanceCollector,

  // 回调函数
  onProgress: (progress, file) => {
    console.log(`上传进度: ${progress}%`, file);
    updateProgressUI(progress);
  },
  onSuccess: (response, file) => {
    console.log('上传成功:', response, file);
    showSuccessMessage();
  },
  onError: (error, file) => {
    console.error('上传失败:', error, file);
    showErrorMessage(error);
  },
  onComplete: (successful, failed) => {
    console.log('上传完成', { successful, failed });
    updateUploadStatus(successful, failed);
  },
});

// UI交互函数
function setupUI() {
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-button');
  const progressBar = document.getElementById('progress-bar');
  const statusText = document.getElementById('status-text');

  // 文件选择
  fileInput.addEventListener('change', event => {
    const files = event.target.files;
    if (files.length > 0) {
      uploadBtn.disabled = false;
      statusText.textContent = `已选择 ${files.length} 个文件，准备上传`;
    }
  });

  // 上传按钮
  uploadBtn.addEventListener('click', () => {
    const files = fileInput.files;
    if (files.length === 0) return;

    // 添加文件到上传队列
    uploader.addFiles(files);

    // 开始上传
    uploader.startUpload();

    // 更新UI
    uploadBtn.disabled = true;
    statusText.textContent = '上传中...';
  });

  // 拖放上传
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', event => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', event => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      uploadBtn.disabled = false;
      statusText.textContent = `已选择 ${files.length} 个文件，准备上传`;
    }
  });
}

// 进度条更新
function updateProgressUI(progress) {
  const progressBar = document.getElementById('progress-bar');
  progressBar.style.width = `${progress}%`;
  progressBar.textContent = `${Math.round(progress)}%`;
}

// 成功消息
function showSuccessMessage() {
  const statusText = document.getElementById('status-text');
  statusText.textContent = '上传成功！';
  statusText.className = 'success';
}

// 错误消息
function showErrorMessage(error) {
  const statusText = document.getElementById('status-text');
  statusText.textContent = `上传失败: ${error.message}`;
  statusText.className = 'error';
}

// 更新上传状态
function updateUploadStatus(successful, failed) {
  const statusText = document.getElementById('status-text');
  const uploadBtn = document.getElementById('upload-button');

  if (failed.length === 0) {
    statusText.textContent = `全部 ${successful.length} 个文件上传成功！`;
    statusText.className = 'success';
  } else {
    statusText.textContent = `上传完成: ${successful.length} 成功, ${failed.length} 失败`;
    statusText.className = 'warning';
  }

  uploadBtn.disabled = false;
}

// 页面加载完成后初始化UI
document.addEventListener('DOMContentLoaded', setupUI);
