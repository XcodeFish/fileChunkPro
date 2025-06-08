<template>
  <div class="file-uploader">
    <div class="file-uploader__header">
      <label class="file-uploader__button">
        选择文件
        <input
          type="file"
          @change="handleFileChange"
          style="display: none"
          :disabled="status === 'uploading'"
        />
      </label>
      <button
        v-if="status === 'uploading'"
        class="file-uploader__cancel"
        @click="handleCancel"
      >
        取消
      </button>
    </div>

    <div v-if="fileName" class="file-uploader__file">
      <span class="file-uploader__filename">{{ fileName }}</span>
      <span class="file-uploader__status">
        {{ statusText }}
      </span>
    </div>

    <div v-if="status === 'uploading'" class="file-uploader__progress-container">
      <div class="file-uploader__progress-bar">
        <div
          class="file-uploader__progress-fill"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
      <span class="file-uploader__progress-text">{{ Math.round(progress) }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFileUpload } from 'file-chunk-pro/ui/vue';

const props = defineProps({
  endpoint: {
    type: String,
    required: true
  },
  maxFileSize: {
    type: Number,
    default: 1024 * 1024 * 100 // 默认100MB
  },
  allowFileTypes: {
    type: Array as () => string[],
    default: () => ['image/*', 'application/pdf', 'video/*']
  }
});

const emit = defineEmits(['success', 'error']);

const progress = ref(0);
const status = ref<'idle' | 'uploading' | 'success' | 'error'>('idle');
const fileName = ref('');

const statusText = computed(() => {
  switch (status.value) {
    case 'uploading':
      return '上传中...';
    case 'success':
      return '上传成功';
    case 'error':
      return '上传失败';
    default:
      return '';
  }
});

const { upload, cancelUpload } = useFileUpload({
  endpoint: props.endpoint,
  maxFileSize: props.maxFileSize,
  allowFileTypes: props.allowFileTypes,
  onProgress: (p) => {
    progress.value = p;
  },
  onSuccess: (result) => {
    status.value = 'success';
    progress.value = 100;
    emit('success', result);
  },
  onError: (error) => {
    status.value = 'error';
    emit('error', error);
  }
});

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  fileName.value = file.name;
  status.value = 'uploading';
  progress.value = 0;

  try {
    await upload(file);
  } catch (error) {
    // 错误已在onError回调中处理
    console.error('上传失败:', error);
  }
};

const handleCancel = () => {
  cancelUpload();
  status.value = 'idle';
  progress.value = 0;
};
</script>

<style scoped>
.file-uploader {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #f9f9f9;
}

.file-uploader__header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.file-uploader__button {
  display: inline-block;
  padding: 10px 16px;
  background-color: #4a90e2;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.file-uploader__button:hover {
  background-color: #3a80d2;
}

.file-uploader__cancel {
  padding: 10px 16px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.file-uploader__cancel:hover {
  background-color: #d73c2c;
}

.file-uploader__file {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-bottom: 16px;
}

.file-uploader__filename {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
}

.file-uploader__status {
  font-size: 14px;
  color: #666;
}

.file-uploader__progress-container {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.file-uploader__progress-bar {
  flex-grow: 1;
  height: 8px;
  background-color: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-right: 12px;
}

.file-uploader__progress-fill {
  height: 100%;
  background-color: #4a90e2;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.file-uploader__progress-text {
  font-size: 14px;
  font-weight: 500;
  min-width: 40px;
  text-align: right;
}
</style> 