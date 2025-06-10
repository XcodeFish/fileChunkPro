/**
 * UploadButton 组件
 * 可定制化的文件上传按钮
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { UploaderCore } from '../../../core/UploaderCore';
import { UploaderOptions, UploadResult } from '../../../types';

// 上传按钮属性
export interface UploadButtonProps {
  // 上传选项
  options: UploaderOptions;
  // 自定义类名
  className?: string;
  // 自定义样式
  style?: React.CSSProperties;
  // 按钮标签文本
  label?: string;
  // 上传中文本
  loadingLabel?: string;
  // 拖拽提示文本
  dragLabel?: string;
  // 是否支持拖拽上传
  enableDrop?: boolean;
  // 是否禁用
  disabled?: boolean;
  // 是否支持多文件上传
  multiple?: boolean;
  // 允许的文件类型
  accept?: string;
  // 最大文件大小(字节)
  maxFileSize?: number;
  // 自定义渲染上传按钮
  renderButton?: (props: {
    onClick: () => void;
    loading: boolean;
    disabled: boolean;
  }) => React.ReactNode;
  // 成功回调
  onSuccess?: (result: UploadResult, file: File) => void;
  // 错误回调
  onError?: (error: Error, file: File) => void;
  // 进度回调
  onProgress?: (percent: number, file: File) => void;
  // 开始上传回调
  onStart?: (file: File) => void;
  // 文件选择回调
  onSelect?: (files: File[]) => void;
  // 取消上传回调
  onCancel?: () => void;
  // 超出大小限制回调
  onSizeExceed?: (file: File, maxSize: number) => void;
  // 类型不匹配回调
  onTypeInvalid?: (file: File, accept: string) => void;
  // 子组件
  children?: React.ReactNode;
}

/**
 * 文件上传按钮组件
 */
const UploadButton: React.FC<UploadButtonProps> = ({
  options,
  className = '',
  style,
  label = '选择文件',
  loadingLabel = '上传中...',
  dragLabel = '拖拽文件到此处，或点击选择文件',
  enableDrop = true,
  disabled = false,
  multiple = false,
  accept,
  maxFileSize,
  renderButton,
  onSuccess,
  onError,
  onProgress,
  onStart,
  onSelect,
  onCancel,
  onSizeExceed,
  onTypeInvalid,
  children,
}) => {
  // 引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploaderRef = useRef<UploaderCore | null>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);

  // 状态
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  // 初始化上传器
  useEffect(() => {
    const uploader = new UploaderCore(options);
    uploaderRef.current = uploader;

    // 注册事件监听
    uploader.on('progress', (progressData: { progress: number }) => {
      setProgress(progressData.progress);
      if (currentFile && onProgress) {
        onProgress(progressData.progress, currentFile);
      }
    });

    return () => {
      if (uploaderRef.current) {
        uploaderRef.current.dispose();
        uploaderRef.current = null;
      }
    };
  }, [options.endpoint, onProgress, currentFile]); // 仅当endpoint变更时重新创建

  // 处理文件上传
  const handleUpload = useCallback(
    async (file: File) => {
      if (!uploaderRef.current || loading || disabled) {
        return;
      }

      // 验证文件大小
      if (maxFileSize && file.size > maxFileSize) {
        if (onSizeExceed) {
          onSizeExceed(file, maxFileSize);
        }
        return;
      }

      // 验证文件类型
      if (accept && !isFileTypeValid(file, accept)) {
        if (onTypeInvalid) {
          onTypeInvalid(file, accept);
        }
        return;
      }

      // 开始上传
      setLoading(true);
      setProgress(0);
      setCurrentFile(file);

      if (onStart) {
        onStart(file);
      }

      try {
        // 执行上传
        const result = await uploaderRef.current.upload(file);

        // 上传成功
        if (onSuccess) {
          onSuccess(result, file);
        }
      } catch (error) {
        // 上传失败
        if (onError) {
          onError(error as Error, file);
        }
      } finally {
        // 清理状态
        setLoading(false);
        setProgress(0);
        setCurrentFile(null);

        // 重置文件输入，以便能够再次选择相同文件
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [
      loading,
      disabled,
      maxFileSize,
      accept,
      onStart,
      onSuccess,
      onError,
      onSizeExceed,
      onTypeInvalid,
    ]
  );

  // 处理文件选择
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      // 获取所有选择的文件
      const fileList = Array.from(files);

      // 文件选择回调
      if (onSelect) {
        onSelect(fileList);
      }

      // 如果是多文件上传，则只处理第一个文件
      // 实际多文件上传逻辑应该由外部控制
      handleUpload(fileList[0]);
    },
    [handleUpload, onSelect]
  );

  // 触发文件选择对话框
  const triggerFileInput = useCallback(() => {
    if (!disabled && !loading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled, loading]);

  // 取消上传
  const cancelUpload = useCallback(() => {
    if (uploaderRef.current && loading) {
      uploaderRef.current.cancel();
      setLoading(false);
      setProgress(0);

      if (onCancel) {
        onCancel();
      }
    }
  }, [loading, onCancel]);

  // 处理拖拽事件
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !loading) {
        setDragActive(true);
      }
    },
    [disabled, loading]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled || loading) return;

      // 处理拖放的文件
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        // 获取所有拖放的文件
        const fileList = Array.from(files);

        // 文件选择回调
        if (onSelect) {
          onSelect(fileList);
        }

        // 上传第一个文件（或根据需求处理多文件）
        handleUpload(fileList[0]);
      }
    },
    [disabled, loading, handleUpload, onSelect]
  );

  // 设置拖拽事件监听
  useEffect(() => {
    const dropArea = dropAreaRef.current;
    if (enableDrop && dropArea) {
      // 添加全局拖拽监听，以提高用户体验
      window.addEventListener('dragenter', handleDragEnter);
      window.addEventListener('dragover', handleDragOver);
      window.addEventListener('dragleave', handleDragLeave);
      window.addEventListener('drop', handleDrop);

      return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
      };
    }
  }, [
    enableDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  ]);

  // 检查文件类型是否有效
  const isFileTypeValid = (file: File, acceptTypes: string): boolean => {
    const types = acceptTypes.split(',').map(type => type.trim());
    const fileType = file.type;
    const fileName = file.name;
    const extension = fileName
      .substring(fileName.lastIndexOf('.'))
      .toLowerCase();

    return types.some(type => {
      // 检查MIME类型
      if (
        fileType &&
        type.includes('/') &&
        fileType.match(new RegExp(type.replace('*', '.*')))
      ) {
        return true;
      }
      // 检查文件扩展名
      if (type.startsWith('.') && extension === type) {
        return true;
      }
      return false;
    });
  };

  // 渲染按钮
  const buttonContent = loading ? (
    <>
      {loadingLabel} {progress > 0 && `${Math.round(progress)}%`}
    </>
  ) : (
    children || label
  );

  // 自定义按钮渲染
  const customButton = renderButton
    ? renderButton({
        onClick: triggerFileInput,
        loading,
        disabled,
      })
    : null;

  // 拖拽区域类名
  const dropAreaClass = `upload-drop-area ${className} ${
    dragActive ? 'active' : ''
  } ${loading ? 'loading' : ''} ${disabled ? 'disabled' : ''}`;

  return (
    <div
      ref={dropAreaRef}
      className={dropAreaClass}
      style={style}
      onClick={enableDrop ? undefined : triggerFileInput}
    >
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        multiple={multiple}
        accept={accept}
        disabled={disabled || loading}
      />

      {enableDrop ? (
        <div className="upload-content">
          <div className="upload-drag-area">
            {dragActive ? (
              <div className="upload-drag-hint">释放文件开始上传</div>
            ) : (
              <div className="upload-drag-label">{dragLabel}</div>
            )}
          </div>

          {!customButton && (
            <button
              type="button"
              className="upload-button"
              onClick={triggerFileInput}
              disabled={disabled || loading}
            >
              {buttonContent}
            </button>
          )}

          {customButton}

          {loading && (
            <div className="upload-progress">
              <div
                className="upload-progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
              <button
                type="button"
                className="upload-cancel-button"
                onClick={cancelUpload}
              >
                取消
              </button>
            </div>
          )}
        </div>
      ) : (
        customButton || (
          <button
            type="button"
            className="upload-button"
            disabled={disabled || loading}
          >
            {buttonContent}
          </button>
        )
      )}
    </div>
  );
};

export default UploadButton;
