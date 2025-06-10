/**
 * Vue Composition API钩子函数
 * 提供上传相关的响应式功能
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { UploaderCore } from '../../core/UploaderCore';
import type { UploaderOptions, UploadError, UploadResult } from '../../types';

// 全局类型声明，用于动态导入
declare global {
  interface Window {
    FileChunkPro: any;
  }
}

/**
 * 文件上传钩子函数
 * @param options - 上传器配置选项
 * @returns 上传相关的响应式状态和方法
 */
export function useFileUpload(options: UploaderOptions) {
  // 响应式状态
  const uploader = ref<UploaderCore | null>(null);
  const loading = ref(false);
  const progress = ref(0);
  const error = ref<UploadError | null>(null);
  const result = ref<UploadResult | null>(null);
  const fileList = ref<Array<any>>([]);
  const totalBytes = ref(0);
  const uploadedBytes = ref(0);
  const speed = ref(0);
  const remainingTime = ref(0);
  const lastUpdateTime = ref(Date.now());
  const lastUploadedBytes = ref(0);

  let intervalId: NodeJS.Timeout | null = null;

  // 计算属性
  const uploadComplete = computed(() => progress.value === 100);
  const formattedSpeed = computed(() => formatBytes(speed.value) + '/s');
  const formattedRemainingTime = computed(() =>
    formatTime(remainingTime.value)
  );

  // 初始化上传器
  onMounted(() => {
    try {
      // 动态导入FileChunkPro
      const FileChunkPro =
        typeof window !== 'undefined' && window.FileChunkPro
          ? window.FileChunkPro
          : // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('file-chunk-pro').default;

      uploader.value = new FileChunkPro(options);

      // 注册事件监听
      uploader.value.on('progress', handleProgress);
      uploader.value.on('error', handleError);
      uploader.value.on('beforeUpload', handleBeforeUpload);
      uploader.value.on('afterUpload', handleAfterUpload);
    } catch (err) {
      console.error('FileChunkPro初始化失败:', err);
      error.value = err as UploadError;
    }
  });

  // 清理资源
  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }

    if (uploader.value) {
      uploader.value.dispose();
    }
  });

  // 事件处理函数
  const handleProgress = (
    percent: number,
    loadedBytes?: number,
    totalFileSize?: number
  ) => {
    progress.value = percent;

    if (loadedBytes && totalFileSize) {
      uploadedBytes.value = loadedBytes;
      totalBytes.value = totalFileSize;

      // 计算上传速度
      const now = Date.now();
      const timeDiff = now - lastUpdateTime.value;

      if (timeDiff > 1000) {
        // 每秒更新一次速度
        const bytesDiff = uploadedBytes.value - lastUploadedBytes.value;
        speed.value = (bytesDiff / timeDiff) * 1000; // 字节/秒

        // 计算剩余时间
        const remainingBytes = totalBytes.value - uploadedBytes.value;
        remainingTime.value =
          speed.value > 0 ? remainingBytes / speed.value : 0;

        lastUpdateTime.value = now;
        lastUploadedBytes.value = uploadedBytes.value;
      }
    }
  };

  const handleError = (err: UploadError) => {
    error.value = err;
    loading.value = false;
  };

  const handleBeforeUpload = () => {
    // 初始化上传统计数据
    lastUpdateTime.value = Date.now();
    lastUploadedBytes.value = 0;
    speed.value = 0;
    remainingTime.value = 0;

    // 开始定时更新
    if (intervalId) {
      clearInterval(intervalId);
    }

    intervalId = setInterval(() => {
      // 如果上传速度接近于0，可能是暂停或网络问题
      if (
        speed.value < 10 &&
        uploadedBytes.value > 0 &&
        uploadedBytes.value < totalBytes.value
      ) {
        const now = Date.now();
        // 如果超过5秒没有更新，重置速度
        if (now - lastUpdateTime.value > 5000) {
          speed.value = 0;
          remainingTime.value = 0;
        }
      }
    }, 1000);
  };

  const handleAfterUpload = (res: UploadResult) => {
    result.value = res;
    loading.value = false;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  // 上传文件方法
  const upload = async (file: File) => {
    if (!uploader.value) {
      throw new Error('上传器未初始化');
    }

    try {
      loading.value = true;
      error.value = null;
      progress.value = 0;
      result.value = null;

      // 将文件添加到文件列表
      const fileItem = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        uploading: true,
        uploaded: false,
        progress: 0,
        error: null,
      };

      fileList.value = [fileItem];
      totalBytes.value = file.size;

      // 开始上传
      const uploadResult = await uploader.value.upload(file);

      // 更新状态
      result.value = uploadResult;
      fileList.value[0].uploaded = true;
      fileList.value[0].uploading = false;

      return uploadResult;
    } catch (err) {
      error.value = err as UploadError;

      if (fileList.value.length > 0) {
        fileList.value[0].error = err;
        fileList.value[0].uploading = false;
      }

      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 上传多个文件
  const uploadMultiple = async (files: File[]) => {
    if (!uploader.value) {
      throw new Error('上传器未初始化');
    }

    if (!files.length) return [];

    try {
      loading.value = true;
      error.value = null;
      progress.value = 0;
      result.value = null;

      // 准备文件列表
      fileList.value = files.map(file => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        uploading: false,
        uploaded: false,
        progress: 0,
        error: null,
      }));

      // 计算总大小
      totalBytes.value = files.reduce((total, file) => total + file.size, 0);

      const results = [];

      // 逐个上传文件
      for (let i = 0; i < fileList.value.length; i++) {
        const fileItem = fileList.value[i];
        fileItem.uploading = true;

        try {
          // 设置进度处理
          uploader.value.on('progress', (percent: number) => {
            fileItem.progress = percent;

            // 计算总进度
            const totalProgress = Math.floor(
              (i * 100 + percent) / fileList.value.length
            );
            progress.value = totalProgress;
          });

          // 上传文件
          const fileResult = await uploader.value.upload(fileItem.file);

          // 更新状态
          fileItem.uploaded = true;
          fileItem.uploading = false;
          fileItem.progress = 100;

          results.push(fileResult);
        } catch (err) {
          fileItem.error = err;
          fileItem.uploading = false;
          error.value = err as UploadError;
        }
      }

      // 最终结果
      if (results.length === 1) {
        result.value = results[0];
      } else {
        result.value = {
          success: results.length === files.length,
          results,
        } as unknown as UploadResult;
      }

      return results;
    } catch (err) {
      error.value = err as UploadError;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 取消上传
  const cancelUpload = () => {
    if (!uploader.value) return;

    uploader.value.cancel();
    loading.value = false;

    // 更新文件状态
    fileList.value.forEach(fileItem => {
      if (fileItem.uploading) {
        fileItem.uploading = false;
      }
    });
  };

  // 重置状态
  const reset = () => {
    progress.value = 0;
    error.value = null;
    result.value = null;
    fileList.value = [];
    totalBytes.value = 0;
    uploadedBytes.value = 0;
    speed.value = 0;
    remainingTime.value = 0;
  };

  // 工具函数 - 格式化字节大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // 工具函数 - 格式化时间（秒）
  const formatTime = (seconds: number): string => {
    if (seconds < 1) return '不到1秒';
    if (seconds < 60) return `${Math.ceil(seconds)}秒`;
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.ceil(seconds % 60);
      return `${minutes}分${secs}秒`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分`;
  };

  return {
    // 状态
    uploader,
    loading,
    progress,
    error,
    result,
    fileList,
    totalBytes,
    uploadedBytes,
    speed,
    remainingTime,
    uploadComplete,
    formattedSpeed,
    formattedRemainingTime,

    // 方法
    upload,
    uploadMultiple,
    cancelUpload,
    reset,
    formatBytes,
    formatTime,
  };
}

/**
 * 上传进度钩子函数
 * 提供轻量级的进度监控
 */
export function useUploadProgress() {
  const progress = ref(0);
  const isUploading = ref(false);
  const isComplete = computed(() => progress.value === 100);

  // 更新进度的函数
  const updateProgress = (percent: number) => {
    progress.value = percent;
    isUploading.value = percent > 0 && percent < 100;
  };

  // 重置进度
  const resetProgress = () => {
    progress.value = 0;
    isUploading.value = false;
  };

  return {
    progress,
    isUploading,
    isComplete,
    updateProgress,
    resetProgress,
  };
}

/**
 * ServiceWorker上传钩子函数
 * 提供ServiceWorker上传状态监控
 */
export function useServiceWorkerUpload(
  options: UploaderOptions & { serviceWorkerOptions?: any }
) {
  const uploader = ref<UploaderCore | null>(null);
  const isServiceWorkerEnabled = ref(false);
  const pendingUploads = ref<Array<any>>([]);
  const swRegistration = ref<ServiceWorkerRegistration | null>(null);

  // 初始化
  onMounted(async () => {
    try {
      // 动态导入FileChunkPro
      const FileChunkPro =
        typeof window !== 'undefined' && window.FileChunkPro
          ? window.FileChunkPro
          : // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('file-chunk-pro').default;

      const { ServiceWorkerPlugin } = FileChunkPro.Plugins;

      // 创建上传器实例
      uploader.value = new FileChunkPro({
        ...options,
        // 确保ServiceWorker可用
        enableServiceWorker: true,
      });

      // 判断是否支持ServiceWorker
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        isServiceWorkerEnabled.value = true;

        // 使用ServiceWorkerPlugin
        const swPlugin = new ServiceWorkerPlugin(
          options.serviceWorkerOptions || {
            scriptURL: '/sw.js',
            enableOfflineUpload: true,
            enableBackgroundUpload: true,
          }
        );

        uploader.value.use(swPlugin);

        // 监听离线上传任务
        uploader.value.on('swPendingUploads', data => {
          pendingUploads.value = data.tasks;
        });
      }
    } catch (err) {
      console.error('ServiceWorker上传初始化失败:', err);
    }
  });

  // 清理资源
  onUnmounted(() => {
    if (uploader.value) {
      uploader.value.dispose();
    }
  });

  // 上传文件（后台）
  const uploadInBackground = async (file: File) => {
    if (!uploader.value || !isServiceWorkerEnabled.value) {
      throw new Error('ServiceWorker不可用');
    }

    return uploader.value.upload(file, {
      useServiceWorker: true,
      background: true,
    });
  };

  // 获取待处理的上传任务
  const getPendingUploads = () => {
    if (!uploader.value || !isServiceWorkerEnabled.value) {
      return { offline: [], background: [] };
    }

    const serviceWorker = uploader.value['_internalPlugins'].serviceWorker;
    if (serviceWorker) {
      return serviceWorker.getActiveUploads();
    }

    return { offline: [], background: [] };
  };

  // 取消后台上传
  const cancelBackgroundUpload = (fileId: string) => {
    if (!uploader.value || !isServiceWorkerEnabled.value) {
      return;
    }

    const serviceWorker = uploader.value['_internalPlugins'].serviceWorker;
    if (serviceWorker) {
      serviceWorker.cancelUpload(fileId);
    }
  };

  return {
    uploader,
    isServiceWorkerEnabled,
    pendingUploads,
    swRegistration,
    uploadInBackground,
    getPendingUploads,
    cancelBackgroundUpload,
  };
}
