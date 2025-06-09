/**
 * 断点续传功能示例
 * 演示如何使用 ResumePlugin 实现断点续传功能
 */

import { UploaderCore, plugins } from '../src';
const { ResumePlugin, ChunkPlugin, ProgressPlugin } = plugins;

// 模拟网络中断
let networkInterrupted = false;
const toggleNetworkInterruption = () => {
  networkInterrupted = !networkInterrupted;
  // eslint-disable-next-line no-console
  console.log(`网络状态: ${networkInterrupted ? '已中断' : '已恢复'}`);
  return networkInterrupted;
};

// 创建断点续传插件实例
const resumePlugin = new ResumePlugin({
  enabled: true,
  storageType: 'localStorage', // 使用localStorage存储上传状态
  keyPrefix: 'my_app_upload_', // 自定义键前缀
  expiryTime: 24 * 60 * 60 * 1000, // 1天过期
  fingerprintAlgorithm: 'simple', // 使用简单指纹算法
  autoResume: true, // 自动恢复上传
  persistProgressInterval: 2000, // 每2秒持久化一次进度
  enableCrossSession: true, // 启用跨会话支持
  partialDetection: true, // 启用部分上传检测
  logLevel: 'info', // 显示信息级别日志
});

// 创建分片处理插件实例
const chunkPlugin = new ChunkPlugin({
  chunkSize: 1 * 1024 * 1024, // 设置1MB的分片大小用于演示
});

// 创建进度插件实例
const progressPlugin = new ProgressPlugin();

// 创建上传器实例
const uploader = new UploaderCore({
  endpoint: 'https://example.com/upload', // 替换为实际的上传端点
  retryCount: 3, // 最多重试3次
  retryDelay: 1000, // 重试间隔1秒
  timeout: 30000, // 超时时间30秒
  autoRetry: true, // 自动重试
  concurrency: 3, // 并发上传3个分片
});

// 注册插件
uploader.use(resumePlugin);
uploader.use(chunkPlugin);
uploader.use(progressPlugin);

// 自定义上传端点适配
uploader.setRequestAdapter({
  uploadChunk: async (url, data, headers, onProgress) => {
    // 模拟网络请求和中断
    return new Promise((resolve, reject) => {
      // 如果网络中断，则模拟请求失败
      if (networkInterrupted) {
        reject(new Error('网络连接中断'));
        return;
      }

      // 模拟上传进度
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        if (onProgress) {
          onProgress(progress);
        }

        // 中途可能发生网络中断
        if (networkInterrupted) {
          clearInterval(interval);
          reject(new Error('网络连接中断'));
          return;
        }

        if (progress >= 100) {
          clearInterval(interval);
          // 模拟服务器响应
          resolve({
            success: true,
            chunkIndex: data.chunkIndex,
          });
        }
      }, 300);
    });
  },

  mergeChunks: async (url, fileInfo) => {
    // 模拟合并请求
    if (networkInterrupted) {
      throw new Error('网络连接中断');
    }

    // 模拟成功响应
    return {
      success: true,
      url: `https://example.com/files/${fileInfo.fileId}`,
      fileName: fileInfo.fileName,
    };
  },
});

// 监听上传事件
uploader.on('uploadStart', info => {
  // eslint-disable-next-line no-console
  console.log('上传开始:', info);
  updateUI('上传开始', info);
});

uploader.on('progress', info => {
  // eslint-disable-next-line no-console
  console.log(`上传进度: ${info.progress.toFixed(2)}%`);
  updateUI('进度', info);
});

uploader.on('chunkSuccess', info => {
  // eslint-disable-next-line no-console
  console.log(`分片 ${info.chunk.index} 上传成功`);
  updateUI('分片成功', info);
});

uploader.on('uploadComplete', result => {
  // eslint-disable-next-line no-console
  console.log('上传完成:', result);
  updateUI('上传完成', result);
});

uploader.on('error', error => {
  // eslint-disable-next-line no-console
  console.error('上传错误:', error);
  updateUI('错误', error);
});

// 开始上传函数
async function startUpload(file) {
  try {
    updateUI('状态', { message: '准备上传...' });
    const result = await uploader.upload(file);
    updateUI('状态', { message: '上传成功!' });
    return result;
  } catch (error) {
    updateUI('状态', { message: `上传失败: ${error.message}` });
    throw error;
  }
}

// 暂停上传
function pauseUpload() {
  uploader.pause();
  updateUI('状态', { message: '上传已暂停' });
}

// 恢复上传
function resumeUpload() {
  uploader.resume();
  updateUI('状态', { message: '上传已恢复' });
}

// 取消上传
function cancelUpload() {
  uploader.cancel();
  updateUI('状态', { message: '上传已取消' });
}

// UI更新函数 (在实际应用中替换为实际的UI更新)
function updateUI(type, data) {
  // 在实际应用中，这里应该更新DOM元素
  // eslint-disable-next-line no-console
  console.log(`UI更新 [${type}]:`, data);
}

// 浏览器环境下的事件绑定
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const networkBtn = document.getElementById('networkBtn');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');

    // 绑定事件
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        if (fileInput && fileInput.files.length > 0) {
          startUpload(fileInput.files[0]);
        } else {
          // eslint-disable-next-line no-alert
          alert('请先选择文件');
        }
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', pauseUpload);
    }

    if (resumeBtn) {
      resumeBtn.addEventListener('click', resumeUpload);
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', cancelUpload);
    }

    if (networkBtn) {
      networkBtn.addEventListener('click', () => {
        const status = toggleNetworkInterruption();
        networkBtn.textContent = status ? '恢复网络' : '模拟断网';
      });
    }

    // 重写UI更新函数
    window.updateUI = function (type, data) {
      switch (type) {
        case '进度':
          if (progressBar) {
            progressBar.value = data.progress;
            progressBar.textContent = `${data.progress.toFixed(2)}%`;
          }
          break;
        case '状态':
          if (statusText) {
            statusText.textContent = data.message;
          }
          break;
      }

      // eslint-disable-next-line no-console
      console.log(`UI更新 [${type}]:`, data);
    };
  });
}

// 导出公共API供示例HTML使用
export {
  startUpload,
  pauseUpload,
  resumeUpload,
  cancelUpload,
  toggleNetworkInterruption,
};
