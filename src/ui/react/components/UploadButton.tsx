/**
 * UploadButton 组件
 * 可定制化的文件上传按钮
 */

import React, { useRef, useCallback, CSSProperties } from 'react';

import { UploaderOptions } from '../../../types';
import { useFileUpload, UploadStatus } from '../hooks';

// 按钮状态对应的文本
const DEFAULT_TEXTS = {
  [UploadStatus.IDLE]: '选择文件',
  [UploadStatus.UPLOADING]: '上传中...',
  [UploadStatus.SUCCESS]: '上传成功',
  [UploadStatus.ERROR]: '上传失败',
  [UploadStatus.CANCELLED]: '已取消',
};

// 组件属性定义
export interface UploadButtonProps {
  // 上传器配置
  options: UploaderOptions;

  // 允许的文件类型
  accept?: string;

  // 是否允许多文件选择
  multiple?: boolean;

  // 按钮文字
  buttonTexts?: Partial<Record<UploadStatus, string>>;

  // 按钮样式
  buttonStyle?: CSSProperties;

  // 按钮CSS类名
  className?: string;

  // 是否禁用
  disabled?: boolean;

  // 自定义事件处理器
  onUploadStart?: (file: File) => void;
  onUploadProgress?: (progress: number) => void;
  onUploadSuccess?: (result: any) => void;
  onUploadError?: (error: Error) => void;
  onUploadCancel?: () => void;
}

/**
 * 文件上传按钮组件
 */
export const UploadButton: React.FC<UploadButtonProps> = ({
  options,
  accept,
  multiple = false,
  buttonTexts = {},
  buttonStyle,
  className = '',
  disabled = false,
  onUploadStart,
  onUploadProgress,
  onUploadSuccess,
  onUploadError,
  onUploadCancel,
}) => {
  // 使用文件上传hook
  const { status, progress, upload, cancel } = useFileUpload(options);

  // 文件输入引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 合并默认文本与自定义文本
  const texts = { ...DEFAULT_TEXTS, ...buttonTexts };

  // 当前按钮文本
  const buttonText = texts[status];

  // 处理文件选择
  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const file = files[0]; // 暂时只处理单个文件，即使允许多选

      // 调用开始上传回调
      onUploadStart?.(file);

      try {
        // 开始上传
        const result = await upload(file);

        // 调用成功回调
        onUploadSuccess?.(result);
      } catch (err) {
        // 调用错误回调
        onUploadError?.(err as Error);
      } finally {
        // 重置文件输入框，允许重新选择相同文件
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [upload, onUploadStart, onUploadSuccess, onUploadError]
  );

  // 处理按钮点击
  const handleButtonClick = useCallback(() => {
    if (status === UploadStatus.UPLOADING) {
      // 如果正在上传，则取消上传
      cancel();
      onUploadCancel?.();
    } else {
      // 触发文件选择对话框
      fileInputRef.current?.click();
    }
  }, [status, cancel, onUploadCancel]);

  // 监听进度变化
  React.useEffect(() => {
    if (onUploadProgress) {
      onUploadProgress(progress);
    }
  }, [progress, onUploadProgress]);

  // 默认按钮样式
  const defaultButtonStyle: CSSProperties = {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    backgroundColor:
      status === UploadStatus.UPLOADING
        ? '#1890ff'
        : status === UploadStatus.SUCCESS
          ? '#52c41a'
          : status === UploadStatus.ERROR
            ? '#ff4d4f'
            : '#1890ff',
    border: 'none',
    borderRadius: '4px',
    cursor:
      disabled || status === UploadStatus.UPLOADING ? 'not-allowed' : 'pointer',
    transition: 'all 0.3s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '40px',
    opacity: disabled ? 0.7 : 1,
    ...buttonStyle,
  };

  return (
    <React.Fragment>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled || status === UploadStatus.UPLOADING}
      />
      <button
        className={`file-chunk-pro-upload-button ${className}`}
        style={defaultButtonStyle}
        onClick={handleButtonClick}
        disabled={disabled}
      >
        {status === UploadStatus.UPLOADING && (
          <span className="file-chunk-pro-upload-progress">
            {Math.round(progress * 100)}%
          </span>
        )}
        <span>{buttonText}</span>
      </button>
    </React.Fragment>
  );
};

export default UploadButton;
