<template>
  <div class="file-uploader">
    <div class="upload-area" @click="triggerFileInput" @drop.prevent="onDrop" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave">
      <input
        ref="fileInput"
        type="file"
        class="file-input"
        :accept="accept"
        :multiple="multiple"
        @change="onFileSelected"
      />
      <slot name="uploadArea">
        <div class="upload-placeholder" :class="{ 'drag-over': isDragOver }">
          <span>点击或拖拽文件到此处上传</span>
        </div>
      </slot>
    </div>
    
    <div v-if="files.length > 0" class="file-list">
      <div v-for="(file, index) in files" :key="index" class="file-item">
        <div class="file-info">
          <div class="file-name">{{ file.name }}</div>
          <div class="file-size">{{ formatSize(file.size) }}</div>
        </div>
        <div class="file-progress">
          <div class="progress-bar">
            <div class="progress" :style="{ width: (file.progress || 0) + '%' }"></div>
          </div>
          <div class="progress-text">{{ Math.floor(file.progress || 0) }}%</div>
        </div>
        <div class="file-actions">
          <button v-if="file.status !== 'uploading'" @click="uploadFile(file, index)">上传</button>
          <button v-if="file.status === 'uploading'" @click="cancelUpload(file, index)">取消</button>
          <button @click="removeFile(index)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, reactive } from 'vue';
import UploaderCore from '../../core/UploaderCore';

export default defineComponent({
  name: 'FileUploader',
  props: {
    accept: {
      type: String,
      default: '*'
    },
    multiple: {
      type: Boolean,
      default: false
    },
    autoUpload: {
      type: Boolean,
      default: false
    },
    uploaderOptions: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props, { emit }) {
    const fileInput = ref<HTMLInputElement | null>(null);
    const isDragOver = ref(false);
    const files = reactive<Array<any>>([]);
    const uploader = new UploaderCore(props.uploaderOptions);
    
    // 文件大小格式化
    const formatSize = (size: number): string => {
      if (size < 1024) return size + ' B';
      if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
      if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + ' MB';
      return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    // 触发文件选择
    const triggerFileInput = () => {
      fileInput.value?.click();
    };

    // 文件选择处理
    const onFileSelected = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        addFiles(Array.from(input.files));
        input.value = ''; // 重置文件输入，允许再次选择相同文件
      }
    };

    // 添加文件到列表
    const addFiles = (selectedFiles: File[]) => {
      selectedFiles.forEach(file => {
        const fileObj = {
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'ready',
          progress: 0,
          uploadId: null
        };
        
        files.push(fileObj);
        emit('file-added', fileObj);
        
        if (props.autoUpload) {
          uploadFile(fileObj, files.length - 1);
        }
      });
    };

    // 拖拽相关
    const onDragOver = () => {
      isDragOver.value = true;
    };
    
    const onDragLeave = () => {
      isDragOver.value = false;
    };
    
    const onDrop = (event: DragEvent) => {
      isDragOver.value = false;
      if (event.dataTransfer?.files) {
        addFiles(Array.from(event.dataTransfer.files));
      }
    };

    // 上传文件
    const uploadFile = async (file: any, index: number) => {
      if (file.status === 'uploading') return;
      
      file.status = 'uploading';
      file.progress = 0;
      
      try {
        // 初始化上传
        const uploadId = await uploader.upload(file.file, {
          onProgress: (progress: number) => {
            file.progress = progress * 100;
            emit('upload-progress', { file, progress });
          },
          onSuccess: (result: any) => {
            file.status = 'success';
            file.result = result;
            emit('upload-success', { file, result });
          },
          onError: (error: Error) => {
            file.status = 'error';
            file.error = error;
            emit('upload-error', { file, error });
          }
        });
        
        file.uploadId = uploadId;
      } catch (error) {
        file.status = 'error';
        file.error = error;
        emit('upload-error', { file, error });
      }
    };

    // 取消上传
    const cancelUpload = (file: any, index: number) => {
      if (file.uploadId) {
        uploader.cancel(file.uploadId);
        file.status = 'canceled';
        file.progress = 0;
        emit('upload-canceled', file);
      }
    };

    // 移除文件
    const removeFile = (index: number) => {
      const file = files[index];
      
      if (file.status === 'uploading' && file.uploadId) {
        uploader.cancel(file.uploadId);
      }
      
      files.splice(index, 1);
      emit('file-removed', file);
    };

    return {
      fileInput,
      files,
      isDragOver,
      formatSize,
      triggerFileInput,
      onFileSelected,
      uploadFile,
      cancelUpload,
      removeFile,
      onDragOver,
      onDragLeave,
      onDrop
    };
  }
});
</script>

<style scoped>
.file-uploader {
  font-family: Arial, sans-serif;
}

.upload-area {
  position: relative;
  margin-bottom: 1rem;
  cursor: pointer;
}

.file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}

.upload-placeholder {
  padding: 2rem;
  border: 2px dashed #ccc;
  border-radius: 4px;
  text-align: center;
  transition: all 0.2s;
}

.drag-over {
  border-color: #2196f3;
  background-color: rgba(33, 150, 243, 0.1);
}

.file-list {
  margin-top: 1rem;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  border: 1px solid #eee;
  border-radius: 4px;
}

.file-info {
  flex: 1;
}

.file-name {
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.file-size {
  color: #666;
  font-size: 0.8rem;
}

.file-progress {
  width: 150px;
  margin: 0 1rem;
  display: flex;
  align-items: center;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background-color: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.progress {
  height: 100%;
  background-color: #2196f3;
  transition: width 0.2s;
}

.progress-text {
  margin-left: 0.5rem;
  font-size: 0.8rem;
}

.file-actions {
  display: flex;
  gap: 0.5rem;
}

.file-actions button {
  padding: 0.25rem 0.5rem;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 0.8rem;
  cursor: pointer;
}

.file-actions button:hover {
  background-color: #e5e5e5;
}
</style> 