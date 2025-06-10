<!-- 
  文件上传Vue组件
  提供文件选择、上传进度、错误处理等功能
-->
<template>
  <div :class="['file-uploader', customClass]">
    <!-- 隐藏的文件输入框 -->
    <input
      type="file"
      ref="fileInput"
      class="file-uploader__input"
      :accept="accept"
      :multiple="multiple"
      :webkitdirectory="directory"
      @change="handleFileChange"
      v-show="false"
    />

    <!-- 上传按钮 -->
    <slot name="trigger">
      <button
        :class="['file-uploader__button', buttonClass, { 'is-loading': loading }]"
        @click="triggerFileInput"
        :disabled="loading || disabled"
        type="button"
      >
        <slot name="button-content">
          <span v-if="loading">
            <slot name="loading-text">{{ loadingText }}</slot>
          </span>
          <span v-else>
            <slot name="button-text">{{ buttonText }}</slot>
          </span>
        </slot>
      </button>
    </slot>

    <!-- 拖拽区域 -->
    <div
      v-if="enableDrop"
      :class="['file-uploader__drop-area', dropAreaClass, { 'is-dragging': isDragging }]"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <slot name="drop-area">
        <div class="file-uploader__drop-label">
          <slot name="drop-label">{{ dropText }}</slot>
        </div>
      </slot>
    </div>

    <!-- 进度条 -->
    <div v-if="showProgress && loading" :class="['file-uploader__progress', progressClass]">
      <slot name="progress" :progress="progress">
        <div class="file-uploader__progress-bar">
          <div class="file-uploader__progress-inner" :style="{ width: `${progress}%` }"></div>
        </div>
        <div class="file-uploader__progress-text">{{ progress }}%</div>
      </slot>
    </div>

    <!-- 文件列表 -->
    <div v-if="showFileList && fileList.length > 0" :class="['file-uploader__file-list', fileListClass]">
      <slot name="file-list" :files="fileList">
        <ul class="file-uploader__files">
          <li v-for="(file, index) in fileList" :key="index" class="file-uploader__file">
            <div class="file-uploader__file-info">
              <span class="file-uploader__file-name">{{ file.name }}</span>
              <span class="file-uploader__file-size">{{ formatFileSize(file.size) }}</span>
            </div>
            <button
              v-if="!file.uploading && !file.uploaded"
              @click="removeFile(index)"
              type="button"
              class="file-uploader__remove-button"
            >
              <slot name="remove-icon">×</slot>
            </button>
            <div v-else-if="file.uploading" class="file-uploader__file-progress">
              <div class="file-uploader__file-progress-inner" :style="{ width: `${file.progress || 0}%` }"></div>
            </div>
            <div v-else-if="file.uploaded" class="file-uploader__file-success">
              <slot name="success-icon">✓</slot>
            </div>
          </li>
        </ul>
      </slot>
    </div>

    <!-- 错误信息 -->
    <div v-if="error" :class="['file-uploader__error', errorClass]">
      <slot name="error" :error="error">{{ error.message || error }}</slot>
    </div>

    <!-- 额外的自定义内容 -->
    <slot></slot>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, onUnmounted, watch } from 'vue';

export default defineComponent({
  name: 'FileUploader',

  props: {
    // 上传配置
    options: {
      type: Object,
      required: true,
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      default: false,
    },
    // 是否允许多选
    multiple: {
      type: Boolean,
      default: false,
    },
    // 是否允许选择目录
    directory: {
      type: Boolean,
      default: false,
    },
    // 接受的文件类型
    accept: {
      type: String,
      default: '',
    },
    // 是否自动上传
    autoUpload: {
      type: Boolean,
      default: true,
    },
    // 是否显示文件列表
    showFileList: {
      type: Boolean,
      default: true,
    },
    // 是否显示进度
    showProgress: {
      type: Boolean,
      default: true,
    },
    // 是否启用拖放上传
    enableDrop: {
      type: Boolean,
      default: false,
    },
    // 按钮文本
    buttonText: {
      type: String,
      default: '选择文件',
    },
    // 加载中文本
    loadingText: {
      type: String,
      default: '上传中...',
    },
    // 拖放提示文本
    dropText: {
      type: String,
      default: '拖放文件到此处',
    },
    // CSS类
    customClass: {
      type: String,
      default: '',
    },
    buttonClass: {
      type: String,
      default: '',
    },
    dropAreaClass: {
      type: String,
      default: '',
    },
    progressClass: {
      type: String,
      default: '',
    },
    fileListClass: {
      type: String,
      default: '',
    },
    errorClass: {
      type: String,
      default: '',
    },
  },

  emits: [
    'select',
    'before-upload',
    'progress',
    'success',
    'error',
    'cancel',
    'change',
  ],

  setup(props, { emit, expose }) {
    // 状态变量
    const fileInput = ref(null);
    const uploader = ref(null);
    const loading = ref(false);
    const progress = ref(0);
    const error = ref(null);
    const result = ref(null);
    const fileList = ref([]);
    const isDragging = ref(false);
    const pendingFiles = ref([]);

    // 组件挂载时创建上传器
    onMounted(() => {
      try {
        // 动态导入FileChunkPro
        const FileChunkPro = window.FileChunkPro || require('file-chunk-pro').default;
        uploader.value = new FileChunkPro(props.options);

        // 注册事件监听
        uploader.value.on('progress', (percent) => {
          progress.value = percent;
          emit('progress', percent);
        });

        uploader.value.on('error', (err) => {
          error.value = err;
          emit('error', err);
        });
      } catch (err) {
        console.error('FileChunkPro初始化失败:', err);
        error.value = { message: '上传组件初始化失败' };
      }
    });

    // 组件卸载时清理资源
    onUnmounted(() => {
      if (uploader.value) {
        uploader.value.dispose();
      }
    });

    // 触发文件选择
    const triggerFileInput = () => {
      if (!loading.value && fileInput.value) {
        fileInput.value.click();
      }
    };

    // 处理文件变化
    const handleFileChange = async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      // 清空文件输入，以便能够再次选择相同文件
      event.target.value = '';

      emit('select', files);

      // 添加到文件列表
      const newFiles = files.map((file) => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        uploading: false,
        uploaded: false,
        progress: 0,
      }));

      // 更新文件列表
      if (props.multiple) {
        fileList.value = [...fileList.value, ...newFiles];
      } else {
        fileList.value = newFiles;
      }

      emit('change', fileList.value);

      // 自动上传
      if (props.autoUpload) {
        await uploadFiles(newFiles);
      } else {
        pendingFiles.value = [...pendingFiles.value, ...newFiles];
      }
    };

    // 上传文件
    const uploadFiles = async (filesToUpload = pendingFiles.value) => {
      if (!uploader.value || !filesToUpload.length) return;

      try {
        loading.value = true;
        error.value = null;
        progress.value = 0;

        // 上传前检查
        emit('before-upload', filesToUpload);

        // 更新状态
        filesToUpload.forEach((fileItem, index) => {
          const fileIndex = fileList.value.findIndex((item) => item === fileItem);
          if (fileIndex !== -1) {
            fileList.value[fileIndex].uploading = true;
          }
        });

        // 如果只有一个文件，使用简单的进度更新
        if (filesToUpload.length === 1) {
          const fileItem = filesToUpload[0];
          const fileIndex = fileList.value.findIndex((item) => item === fileItem);

          // 设置进度更新处理函数
          const originalOnProgress = uploader.value.events.listeners.progress || [];
          uploader.value.on('progress', (percent) => {
            progress.value = percent;
            if (fileIndex !== -1) {
              fileList.value[fileIndex].progress = percent;
            }
            emit('progress', percent);
          });

          // 上传文件
          result.value = await uploader.value.upload(fileItem.file);
          
          // 更新状态
          if (fileIndex !== -1) {
            fileList.value[fileIndex].uploading = false;
            fileList.value[fileIndex].uploaded = true;
            fileList.value[fileIndex].progress = 100;
            fileList.value[fileIndex].result = result.value;
          }

          // 发送成功事件
          emit('success', result.value, fileItem.file);
        } else {
          // 多文件上传，逐个处理
          for (let i = 0; i < filesToUpload.length; i++) {
            const fileItem = filesToUpload[i];
            const fileIndex = fileList.value.findIndex((item) => item === fileItem);

            try {
              // 设置当前文件的进度更新
              uploader.value.on('progress', (percent) => {
                if (fileIndex !== -1) {
                  fileList.value[fileIndex].progress = percent;
                }
                // 计算总体进度
                const totalProgress = Math.floor(
                  (i * 100 + percent) / filesToUpload.length
                );
                progress.value = totalProgress;
                emit('progress', totalProgress);
              });

              // 上传文件
              const fileResult = await uploader.value.upload(fileItem.file);
              
              // 更新状态
              if (fileIndex !== -1) {
                fileList.value[fileIndex].uploading = false;
                fileList.value[fileIndex].uploaded = true;
                fileList.value[fileIndex].progress = 100;
                fileList.value[fileIndex].result = fileResult;
              }

              // 发送单个文件成功事件
              emit('success', fileResult, fileItem.file);
            } catch (err) {
              // 处理单个文件错误
              if (fileIndex !== -1) {
                fileList.value[fileIndex].uploading = false;
                fileList.value[fileIndex].error = err;
              }
              emit('error', err, fileItem.file);
            }
          }
        }

        // 清空待上传队列
        pendingFiles.value = [];
      } catch (err) {
        error.value = err;
        emit('error', err);
      } finally {
        loading.value = false;
      }
    };

    // 取消上传
    const cancelUpload = () => {
      if (!uploader.value) return;
      
      uploader.value.cancel();
      loading.value = false;
      
      // 更新状态
      fileList.value.forEach((fileItem) => {
        if (fileItem.uploading) {
          fileItem.uploading = false;
        }
      });
      
      emit('cancel');
    };

    // 移除文件
    const removeFile = (index) => {
      const removedFile = fileList.value[index];
      fileList.value.splice(index, 1);
      
      // 同时从待上传队列中移除
      const pendingIndex = pendingFiles.value.findIndex(
        (f) => f === removedFile
      );
      if (pendingIndex !== -1) {
        pendingFiles.value.splice(pendingIndex, 1);
      }
      
      emit('change', fileList.value);
    };

    // 拖拽事件处理
    const onDragOver = () => {
      if (props.enableDrop && !props.disabled) {
        isDragging.value = true;
      }
    };

    const onDragLeave = () => {
      isDragging.value = false;
    };

    const onDrop = (event) => {
      if (!props.enableDrop || props.disabled) return;
      
      isDragging.value = false;
      
      const files = Array.from(event.dataTransfer.files || []);
      if (!files.length) return;
      
      // 添加到文件列表
      const newFiles = files.map((file) => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        uploading: false,
        uploaded: false,
        progress: 0,
      }));
      
      // 更新文件列表
      if (props.multiple) {
        fileList.value = [...fileList.value, ...newFiles];
      } else {
        fileList.value = newFiles;
      }
      
      emit('select', files);
      emit('change', fileList.value);
      
      // 自动上传
      if (props.autoUpload) {
        uploadFiles(newFiles);
      } else {
        pendingFiles.value = [...pendingFiles.value, ...newFiles];
      }
    };

    // 工具函数 - 格式化文件大小
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    };

    // 暴露方法
    expose({
      triggerFileInput,
      uploadFiles,
      cancelUpload,
      removeFile,
      uploader: () => uploader.value,
    });

    return {
      fileInput,
      loading,
      progress,
      error,
      result,
      fileList,
      isDragging,
      triggerFileInput,
      handleFileChange,
      uploadFiles,
      cancelUpload,
      removeFile,
      onDragOver,
      onDragLeave,
      onDrop,
      formatFileSize,
    };
  },
});
</script>

<style>
.file-uploader {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  margin-bottom: 16px;
}

.file-uploader__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dcdfe6;
  background-color: #ffffff;
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 4px;
  color: #606266;
  cursor: pointer;
  transition: all 0.3s;
}

.file-uploader__button:hover {
  color: #409eff;
  border-color: #c6e2ff;
  background-color: #ecf5ff;
}

.file-uploader__button:disabled {
  color: #c0c4cc;
  cursor: not-allowed;
  background-image: none;
  background-color: #f5f7fa;
  border-color: #e4e7ed;
}

.file-uploader__button.is-loading {
  position: relative;
  pointer-events: none;
}

.file-uploader__drop-area {
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  text-align: center;
  padding: 40px 20px;
  margin: 10px 0;
  color: #606266;
  transition: all 0.3s;
}

.file-uploader__drop-area.is-dragging {
  border-color: #409eff;
  background-color: #ecf5ff;
}

.file-uploader__progress {
  margin-top: 15px;
}

.file-uploader__progress-bar {
  width: 100%;
  height: 6px;
  background-color: #ebeef5;
  border-radius: 100px;
  overflow: hidden;
}

.file-uploader__progress-inner {
  height: 100%;
  background-color: #409eff;
  border-radius: 100px;
  transition: width 0.3s ease;
}

.file-uploader__progress-text {
  margin-top: 5px;
  font-size: 12px;
  color: #606266;
  text-align: center;
}

.file-uploader__file-list {
  margin-top: 15px;
}

.file-uploader__files {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-uploader__file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 4px;
  margin-bottom: 5px;
  border: 1px solid #ebeef5;
  background-color: #f5f7fa;
}

.file-uploader__file-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.file-uploader__file-name {
  color: #303133;
  font-size: 14px;
  margin-bottom: 2px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.file-uploader__file-size {
  color: #909399;
  font-size: 12px;
}

.file-uploader__remove-button {
  background: none;
  border: none;
  color: #909399;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
}

.file-uploader__remove-button:hover {
  color: #f56c6c;
}

.file-uploader__file-progress {
  width: 60px;
  height: 4px;
  background-color: #ebeef5;
  border-radius: 100px;
  overflow: hidden;
}

.file-uploader__file-progress-inner {
  height: 100%;
  background-color: #409eff;
  border-radius: 100px;
}

.file-uploader__file-success {
  color: #67c23a;
  font-size: 16px;
}

.file-uploader__error {
  margin-top: 10px;
  padding: 8px 16px;
  border-radius: 4px;
  background-color: #fef0f0;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.5;
}
</style> 