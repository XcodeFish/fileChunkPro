import { ref, onMounted, onUnmounted, Ref } from 'vue';

import { UploadError } from '../../core/ErrorCenter';
import UploaderCore from '../../core/UploaderCore';
import { UploaderOptions, UploadResult } from '../../types';

interface FileUploadHook {
  upload: (file: File) => Promise<UploadResult>;
  cancelUpload: () => void;
  loading: Ref<boolean>;
  progress: Ref<number>;
  error: Ref<UploadError | null>;
  result: Ref<UploadResult | null>;
  uploader: Ref<UploaderCore | null>;
}

/**
 * 文件上传钩子
 * 提供Vue Composition API风格的文件上传功能
 * @param options 上传配置选项
 */
export function useFileUpload(options: UploaderOptions): FileUploadHook {
  const uploader = ref<UploaderCore | null>(null);
  const loading = ref<boolean>(false);
  const progress = ref<number>(0);
  const error = ref<UploadError | null>(null);
  const result = ref<UploadResult | null>(null);

  // 初始化上传器
  onMounted(() => {
    uploader.value = new UploaderCore(options);

    // 注册事件监听
    uploader.value.on('progress', (percent: number) => {
      progress.value = percent;
    });

    uploader.value.on('error', (err: UploadError) => {
      error.value = err;
    });
  });

  // 清理资源
  onUnmounted(() => {
    if (uploader.value) {
      uploader.value.dispose();
    }
  });

  /**
   * 上传文件
   * @param file 要上传的文件
   * @returns 上传结果Promise
   */
  const upload = async (file: File): Promise<UploadResult> => {
    if (!uploader.value) {
      throw new Error('上传器未初始化');
    }

    try {
      loading.value = true;
      error.value = null;
      progress.value = 0;

      result.value = await uploader.value.upload(file);
      return result.value;
    } catch (err) {
      error.value = err as UploadError;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 取消当前上传
   */
  const cancelUpload = (): void => {
    if (!uploader.value) return;
    uploader.value.cancel();
    loading.value = false;
  };

  return {
    upload,
    cancelUpload,
    loading,
    progress,
    error,
    result,
    uploader: uploader as Ref<UploaderCore | null>,
  };
}
