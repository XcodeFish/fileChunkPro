/**
 * 上传进度组件
 * 用于显示文件上传进度、文件列表和上传状态
 */

import React, { useState } from 'react';
import { UploadResult } from '../../../types';

// 文件上传状态
export enum FileUploadStatus {
  PENDING = 'pending', // 等待上传
  UPLOADING = 'uploading', // 上传中
  SUCCESS = 'success', // 上传成功
  ERROR = 'error', // 上传失败
  CANCELLED = 'cancelled', // 已取消
}

// 文件信息
export interface FileInfo {
  id: string; // 文件唯一标识
  file: File; // 文件对象
  status: FileUploadStatus; // 上传状态
  progress: number; // 上传进度 (0-100)
  result?: UploadResult; // 上传结果
  error?: Error; // 错误信息
  startTime?: number; // 开始上传时间
  endTime?: number; // 结束上传时间
}

// 组件属性
export interface UploadProgressProps {
  // 文件列表
  files: FileInfo[];
  // 自定义样式
  style?: React.CSSProperties;
  // 自定义类名
  className?: string;
  // 是否显示文件列表
  showList?: boolean;
  // 是否显示文件大小
  showSize?: boolean;
  // 是否显示上传时间
  showTime?: boolean;
  // 是否显示上传速度
  showSpeed?: boolean;
  // 是否显示缩略图
  showThumbnail?: boolean;
  // 点击文件项回调
  onFileClick?: (file: FileInfo) => void;
  // 重试上传回调
  onRetry?: (file: FileInfo) => void;
  // 取消上传回调
  onCancel?: (file: FileInfo) => void;
  // 删除文件回调
  onDelete?: (file: FileInfo) => void;
  // 清空列表回调
  onClear?: () => void;
  // 自定义渲染文件项
  renderFileItem?: (
    file: FileInfo,
    defaultRender: React.ReactNode
  ) => React.ReactNode;
  // 空列表渲染
  renderEmpty?: () => React.ReactNode;
  // 是否允许拖拽排序
  draggable?: boolean;
  // 拖拽排序回调
  onDragSort?: (newFiles: FileInfo[]) => void;
  // 总进度条位置
  progressPosition?: 'top' | 'bottom';
  // 状态文本
  statusTexts?: Record<FileUploadStatus, string>;
  // 是否允许重试
  allowRetry?: boolean;
  // 是否允许取消
  allowCancel?: boolean;
  // 是否允许删除
  allowDelete?: boolean;
  // 子元素
  children?: React.ReactNode;
}

/**
 * 上传进度组件
 */
const UploadProgress: React.FC<UploadProgressProps> = ({
  files = [],
  style,
  className = '',
  showList = true,
  showSize = true,
  showTime = false,
  showSpeed = false,
  showThumbnail = true,
  onFileClick,
  onRetry,
  onCancel,
  onDelete,
  onClear,
  renderFileItem,
  renderEmpty,
  draggable = false,
  onDragSort,
  progressPosition = 'top',
  statusTexts = {
    [FileUploadStatus.PENDING]: '等待上传',
    [FileUploadStatus.UPLOADING]: '上传中',
    [FileUploadStatus.SUCCESS]: '上传成功',
    [FileUploadStatus.ERROR]: '上传失败',
    [FileUploadStatus.CANCELLED]: '已取消',
  },
  allowRetry = true,
  allowCancel = true,
  allowDelete = true,
  children,
}) => {
  // 记录拖拽状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // 计算总进度
  const totalProgress = files.length
    ? Math.round(
        files.reduce((sum, file) => sum + file.progress, 0) / files.length
      )
    : 0;

  // 计算各种状态的文件数量
  const pendingCount = files.filter(
    file => file.status === FileUploadStatus.PENDING
  ).length;
  const uploadingCount = files.filter(
    file => file.status === FileUploadStatus.UPLOADING
  ).length;
  const successCount = files.filter(
    file => file.status === FileUploadStatus.SUCCESS
  ).length;
  const errorCount = files.filter(
    file => file.status === FileUploadStatus.ERROR
  ).length;
  const cancelledCount = files.filter(
    file => file.status === FileUploadStatus.CANCELLED
  ).length;

  // 处理拖拽开始
  const handleDragStart = (index: number) => {
    if (!draggable) return;
    setDragIndex(index);
  };

  // 处理拖拽结束
  const handleDragEnd = () => {
    if (!draggable || dragIndex === null || dropIndex === null) return;

    // 创建新的排序
    const newFiles = [...files];
    const [draggedFile] = newFiles.splice(dragIndex, 1);
    newFiles.splice(dropIndex, 0, draggedFile);

    // 回调通知
    if (onDragSort) {
      onDragSort(newFiles);
    }

    // 重置拖拽状态
    setDragIndex(null);
    setDropIndex(null);
  };

  // 处理拖拽悬停
  const handleDragOver = (index: number) => {
    if (!draggable || dragIndex === null || dragIndex === index) return;
    setDropIndex(index);
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化用时
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}毫秒`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}秒`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };

  // 计算上传速度
  const calculateSpeed = (file: FileInfo): string => {
    if (!file.startTime || !file.progress) return '计算中...';

    const elapsedMs = file.endTime
      ? file.endTime - file.startTime
      : Date.now() - file.startTime;

    if (elapsedMs <= 0) return '计算中...';

    // 根据进度估算已上传的字节数
    const uploadedBytes = (file.file.size * file.progress) / 100;
    const bytesPerSecond = uploadedBytes / (elapsedMs / 1000);

    return `${formatFileSize(bytesPerSecond)}/s`;
  };

  // 获取文件图标或缩略图
  const getFileThumbnail = (file: FileInfo): React.ReactNode => {
    // 图片类型显示缩略图
    if (showThumbnail && file.file.type.startsWith('image/')) {
      return (
        <div className="upload-thumbnail">
          <img
            src={URL.createObjectURL(file.file)}
            alt={file.file.name}
            onLoad={e => {
              // 释放对象URL以避免内存泄漏
              URL.revokeObjectURL((e.target as HTMLImageElement).src);
            }}
          />
        </div>
      );
    }

    // 其他文件类型显示图标
    return (
      <div className="upload-file-icon">
        <FileIcon fileType={file.file.type} />
      </div>
    );
  };

  // 文件类型图标
  const FileIcon: React.FC<{ fileType: string }> = ({ fileType }) => {
    // 根据文件类型返回不同的图标
    const getIconClass = (): string => {
      if (fileType.startsWith('image/')) return 'icon-image';
      if (fileType.startsWith('video/')) return 'icon-video';
      if (fileType.startsWith('audio/')) return 'icon-audio';
      if (fileType.includes('pdf')) return 'icon-pdf';
      if (fileType.includes('word')) return 'icon-word';
      if (fileType.includes('excel') || fileType.includes('sheet'))
        return 'icon-excel';
      if (
        fileType.includes('zip') ||
        fileType.includes('rar') ||
        fileType.includes('tar')
      )
        return 'icon-archive';
      return 'icon-file';
    };

    return <span className={`file-icon ${getIconClass()}`} />;
  };

  // 渲染单个文件项
  const renderFile = (file: FileInfo, index: number): React.ReactNode => {
    // 默认渲染
    const defaultRender = (
      <div
        className={`upload-file-item ${file.status} ${
          dragIndex === index ? 'dragging' : ''
        } ${dropIndex === index ? 'drop-target' : ''}`}
        key={file.id}
        onClick={() => onFileClick && onFileClick(file)}
        draggable={draggable}
        onDragStart={() => handleDragStart(index)}
        onDragEnd={handleDragEnd}
        onDragOver={e => {
          e.preventDefault();
          handleDragOver(index);
        }}
      >
        {getFileThumbnail(file)}

        <div className="upload-file-info">
          <div className="upload-file-name" title={file.file.name}>
            {file.file.name}
          </div>

          {showSize && (
            <div className="upload-file-size">
              {formatFileSize(file.file.size)}
            </div>
          )}

          <div className="upload-file-status">
            {statusTexts[file.status]}
            {file.status === FileUploadStatus.UPLOADING &&
              ` (${Math.round(file.progress)}%)`}
          </div>

          {showTime && file.startTime && (
            <div className="upload-file-time">
              用时:{' '}
              {formatTime(
                file.endTime
                  ? file.endTime - file.startTime
                  : Date.now() - file.startTime
              )}
            </div>
          )}

          {showSpeed && file.status === FileUploadStatus.UPLOADING && (
            <div className="upload-file-speed">{calculateSpeed(file)}</div>
          )}

          {file.status === FileUploadStatus.UPLOADING && (
            <div className="upload-file-progress">
              <div
                className="upload-file-progress-bar"
                style={{ width: `${file.progress}%` }}
              />
            </div>
          )}
        </div>

        <div className="upload-file-actions">
          {file.status === FileUploadStatus.ERROR && allowRetry && (
            <button
              type="button"
              className="upload-retry-button"
              onClick={e => {
                e.stopPropagation();
                onRetry && onRetry(file);
              }}
            >
              重试
            </button>
          )}

          {file.status === FileUploadStatus.UPLOADING && allowCancel && (
            <button
              type="button"
              className="upload-cancel-button"
              onClick={e => {
                e.stopPropagation();
                onCancel && onCancel(file);
              }}
            >
              取消
            </button>
          )}

          {(file.status === FileUploadStatus.SUCCESS ||
            file.status === FileUploadStatus.ERROR ||
            file.status === FileUploadStatus.CANCELLED) &&
            allowDelete && (
              <button
                type="button"
                className="upload-delete-button"
                onClick={e => {
                  e.stopPropagation();
                  onDelete && onDelete(file);
                }}
              >
                删除
              </button>
            )}
        </div>
      </div>
    );

    // 如果提供了自定义渲染，则使用自定义渲染
    return renderFileItem ? renderFileItem(file, defaultRender) : defaultRender;
  };

  // 渲染总进度条
  const renderTotalProgress = () => {
    if (files.length === 0) return null;

    return (
      <div className="upload-total-progress">
        <div className="upload-total-progress-info">
          <span>总进度: {totalProgress}%</span>
          <span>
            {successCount}/{files.length} 完成
          </span>
          {errorCount > 0 && (
            <span className="upload-error-count">{errorCount} 失败</span>
          )}
        </div>
        <div className="upload-total-progress-bar">
          <div
            className="upload-total-progress-bar-inner"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
        <div className="upload-total-progress-status">
          {pendingCount > 0 && (
            <span className="upload-status-pending">
              待上传: {pendingCount}
            </span>
          )}
          {uploadingCount > 0 && (
            <span className="upload-status-uploading">
              上传中: {uploadingCount}
            </span>
          )}
          {successCount > 0 && (
            <span className="upload-status-success">成功: {successCount}</span>
          )}
          {errorCount > 0 && (
            <span className="upload-status-error">失败: {errorCount}</span>
          )}
          {cancelledCount > 0 && (
            <span className="upload-status-cancelled">
              已取消: {cancelledCount}
            </span>
          )}
        </div>
      </div>
    );
  };

  // 渲染文件列表
  const renderFileList = () => {
    if (!showList) return null;

    if (files.length === 0) {
      return renderEmpty ? (
        renderEmpty()
      ) : (
        <div className="upload-empty-list">暂无文件</div>
      );
    }

    return (
      <div className="upload-file-list">
        {files.map((file, index) => renderFile(file, index))}
      </div>
    );
  };

  // 渲染清空按钮
  const renderClearButton = () => {
    if (files.length === 0 || !onClear) return null;

    return (
      <div className="upload-clear-container">
        <button type="button" className="upload-clear-button" onClick={onClear}>
          清空列表
        </button>
      </div>
    );
  };

  return (
    <div className={`upload-progress-container ${className}`} style={style}>
      {progressPosition === 'top' && renderTotalProgress()}

      {renderFileList()}

      {progressPosition === 'bottom' && renderTotalProgress()}

      {renderClearButton()}

      {children}
    </div>
  );
};

export default UploadProgress;
