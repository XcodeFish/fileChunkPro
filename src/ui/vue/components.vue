<template>
  <div class="file-uploader">
    <div class="upload-area" @click="triggerFileInput" @drop.prevent="onDrop" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave">
      <slot name="upload-icon">
        <div class="upload-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V16M12 4L8 8M12 4L16 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 17V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </slot>
      <slot name="upload-text">
        <div class="upload-text">
          <p v-if="isDragging">释放文件开始上传</p>
          <p v-else>点击或拖拽文件到此处</p>
        </div>
      </slot>
    </div>
    <input ref="fileInput" type="file" class="file-input" :accept="accept" :multiple="multiple" @change="handleFileChange" />
    
    <div v-if="showProgress && uploads.length > 0" class="upload-list">
      <div v-for="(file, index) in uploads" :key="index" class="upload-item">
        <div class="file-info">
          <span class="file-name">{{ file.name }}</span>
          <span class="file-size">{{ formatFileSize(file.size) }}</span>
        </div>
        <div class="progress-bar">
          <div class="progress" :style="{ width: file.progress + '%' }"></div>
        </div>
        <div class="file-status">
          <span v-if="file.status === 'error'" class="status-error">失败</span>
          <span v-else-if="file.status === 'success'" class="status-success">完成</span>
          <span v-else class="status-uploading">{{ file.progress }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, PropType } from 'vue';

export default defineComponent({
  name: 'FileUploader',
  props: {
    accept: {
      type: String,
      default: '*/*'
    },
    multiple: {
      type: Boolean,
      default: false
    },
    showProgress: {
      type: Boolean,
      default: true
    },
    uploader: {
      type: Object,
      required: true
    }
  },
  setup(props, { emit }) {
    const fileInput = ref<HTMLInputElement | null>(null);
    const isDragging = ref(false);
    const uploads = ref<Array<any>>([]);
    
    // 触发文件选择
    const triggerFileInput = () => {
      if (fileInput.value) {
        fileInput.value.click();
      }
    };
    
    // 处理文件选择
    const handleFileChange = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        const selectedFiles = Array.from(input.files);
        uploadFiles(selectedFiles);
        input.value = '';
      }
    };
    
    // 上传文件
    const uploadFiles = (files: File[]) => {
      files.forEach(file => {
        const fileInfo = {
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'uploading'
        };
        
        uploads.value.push(fileInfo);
        const index = uploads.value.length - 1;
        
        // 使用uploader实例上传文件
        props.uploader
          .upload(file, {
            onProgress: (progress: number) => {
              uploads.value[index].progress = Math.round(progress * 100);
            }
          })
          .then(() => {
            uploads.value[index].status = 'success';
            uploads.value[index].progress = 100;
            emit('success', file);
          })
          .catch((error: Error) => {
            uploads.value[index].status = 'error';
            emit('error', { file, error });
          });
      });
      
      emit('files-selected', files);
    };
    
    // 格式化文件大小
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // 拖拽相关处理
    const onDragOver = () => {
      isDragging.value = true;
    };
    
    const onDragLeave = () => {
      isDragging.value = false;
    };
    
    const onDrop = (event: DragEvent) => {
      isDragging.value = false;
      if (event.dataTransfer && event.dataTransfer.files.length > 0) {
        const files = Array.from(event.dataTransfer.files);
        uploadFiles(files);
      }
    };
    
    return {
      fileInput,
      isDragging,
      uploads,
      triggerFileInput,
      handleFileChange,
      formatFileSize,
      onDragOver,
      onDragLeave,
      onDrop
    };
  }
});
</script>

<style scoped>
.file-uploader {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.upload-area {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.upload-area:hover {
  border-color: #2196f3;
  background-color: rgba(33, 150, 243, 0.05);
}

.upload-icon {
  color: #757575;
  margin-bottom: 16px;
}

.upload-text p {
  margin: 0;
  color: #757575;
  font-size: 16px;
}

.file-input {
  display: none;
}

.upload-list {
  margin-top: 16px;
}

.upload-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 8px;
}

.file-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.file-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
}

.file-size {
  color: #757575;
  font-size: 12px;
}

.progress-bar {
  height: 4px;
  background-color: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress {
  height: 100%;
  background-color: #2196f3;
  transition: width 0.3s ease;
}

.file-status {
  font-size: 12px;
  text-align: right;
}

.status-uploading {
  color: #2196f3;
}

.status-success {
  color: #4caf50;
}

.status-error {
  color: #f44336;
}
</style> 