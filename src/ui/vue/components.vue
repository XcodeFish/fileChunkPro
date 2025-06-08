<template>
  <div class="file-uploader">
    <input
      type="file"
      ref="fileInput"
      style="display: none"
      @change="handleFileChange"
    />
    <button
      @click="triggerFileInput"
      :disabled="loading"
      :class="buttonClass"
    >
      <slot v-if="!loading">选择文件</slot>
      <span v-else>上传中 {{ progress }}%</span>
    </button>

    <div v-if="error" class="error-message">
      {{ error.message }}
    </div>

    <div v-if="result && result.success" class="success-message">
      <slot name="success" :result="result">
        上传成功
      </slot>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, PropType, onMounted, onUnmounted } from 'vue';
import FileChunkPro from '../../index';
import { UploaderOptions, UploadResult } from '../../types';
import { UploadError } from '../../core/ErrorCenter';

export default defineComponent({
  name: 'FileUploader',

  props: {
    // 上传选项
    options: {
      type: Object as PropType<UploaderOptions>,
      required: true
    },
    // 按钮自定义样式类
    buttonClass: {
      type: String,
      default: ''
    }
  },

  emits: [
    'progress', 
    'success', 
    'error', 
    'cancel'
  ],

  setup(props, { emit }) {
    const fileInput = ref<HTMLInputElement | null>(null);
    const uploader = ref<FileChunkPro | null>(null);
    const loading = ref(false);
    const progress = ref(0);
    const error = ref<UploadError | null>(null);
    const result = ref<UploadResult | null>(null);

    // 初始化上传器
    onMounted(() => {
      uploader.value = new FileChunkPro(props.options);

      // 注册事件监听
      uploader.value.on('progress', (percent: number) => {
        progress.value = percent;
        emit('progress', percent);
      });

      uploader.value.on('error', (err: UploadError) => {
        error.value = err;
        emit('error', err);
      });
    });

    // 清理资源
    onUnmounted(() => {
      if (uploader.value) {
        uploader.value.dispose();
      }
    });

    // 触发文件选择框
    const triggerFileInput = () => {
      if (fileInput.value) {
        fileInput.value.click();
      }
    };

    // 处理文件选择变化
    const handleFileChange = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file || !uploader.value) return;

      try {
        loading.value = true;
        error.value = null;
        progress.value = 0;

        result.value = await uploader.value.upload(file);
        emit('success', result.value);
      } catch (err) {
        const uploadError = err as UploadError;
        error.value = uploadError;
        emit('error', uploadError);
      } finally {
        loading.value = false;
        // 重置input，允许再次选择相同文件
        if (input) {
          input.value = '';
        }
      }
    };

    // 取消上传
    const cancelUpload = () => {
      if (uploader.value) {
        uploader.value.cancel();
        loading.value = false;
        emit('cancel');
      }
    };

    return {
      fileInput,
      loading,
      progress,
      error,
      result,
      triggerFileInput,
      handleFileChange,
      cancelUpload
    };
  }
});
</script>

<style scoped>
.file-uploader {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-message {
  color: #f56c6c;
  font-size: 14px;
  margin-top: 5px;
}

.success-message {
  color: #67c23a;
  font-size: 14px;
  margin-top: 5px;
}
</style> 