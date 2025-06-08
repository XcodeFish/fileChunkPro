/**
 * UploadProgress 组件
 * 文件上传进度和状态展示组件
 */

import React, { CSSProperties } from 'react';

import { UploadStatus } from '../hooks';

// 组件属性定义
export interface UploadProgressProps {
  // 上传进度（0-1的小数）
  progress: number;

  // 上传状态
  status: UploadStatus;

  // 文件名
  fileName?: string;

  // 错误信息
  error?: Error | null;

  // 宽度设置
  width?: string | number;

  // 高度设置
  height?: string | number;

  // 自定义样式
  style?: CSSProperties;

  // 样式类名
  className?: string;

  // 自定义状态文本
  statusText?: Partial<Record<UploadStatus, string>>;

  // 显示百分比
  showPercentage?: boolean;

  // 显示文件名
  showFileName?: boolean;

  // 显示状态文本
  showStatusText?: boolean;
}

// 默认状态文本
const DEFAULT_STATUS_TEXT = {
  [UploadStatus.IDLE]: '等待上传',
  [UploadStatus.UPLOADING]: '上传中',
  [UploadStatus.SUCCESS]: '上传成功',
  [UploadStatus.ERROR]: '上传失败',
  [UploadStatus.CANCELLED]: '已取消',
};

/**
 * 上传进度条组件
 */
export const UploadProgress: React.FC<UploadProgressProps> = ({
  progress,
  status,
  fileName,
  error,
  width = '100%',
  height = '8px',
  style,
  className = '',
  statusText = DEFAULT_STATUS_TEXT,
  showPercentage = true,
  showFileName = true,
  showStatusText = true,
}) => {
  // 合并状态文本
  const mergedStatusText = { ...DEFAULT_STATUS_TEXT, ...statusText };

  // 获取当前状态文本
  const currentStatusText = mergedStatusText[status];

  // 计算百分比值
  const percentage = Math.round(progress * 100);

  // 根据状态确定颜色
  const getStatusColor = (): string => {
    switch (status) {
      case UploadStatus.UPLOADING:
        return '#1890ff';
      case UploadStatus.SUCCESS:
        return '#52c41a';
      case UploadStatus.ERROR:
        return '#ff4d4f';
      case UploadStatus.CANCELLED:
        return '#faad14';
      default:
        return '#d9d9d9';
    }
  };

  // 容器样式
  const containerStyle: CSSProperties = {
    width,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '10px',
    ...style,
  };

  // 进度条外层样式
  const progressOuterStyle: CSSProperties = {
    width: '100%',
    height,
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    overflow: 'hidden',
    position: 'relative',
  };

  // 进度条内层样式
  const progressInnerStyle: CSSProperties = {
    height: '100%',
    width: `${percentage}%`,
    backgroundColor: getStatusColor(),
    transition: 'width 0.3s ease-in-out',
    borderRadius: '4px',
  };

  // 状态文本样式
  const textStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    marginTop: '5px',
  };

  // 文件名样式
  const fileNameStyle: CSSProperties = {
    maxWidth: '70%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: '5px',
    fontSize: '14px',
    color: '#333',
  };

  // 错误信息样式
  const errorStyle: CSSProperties = {
    color: '#ff4d4f',
    fontSize: '12px',
    marginTop: '5px',
  };

  return (
    <div
      className={`file-chunk-pro-progress ${className}`}
      style={containerStyle}
    >
      {showFileName && fileName && (
        <div style={fileNameStyle} title={fileName}>
          {fileName}
        </div>
      )}

      <div style={progressOuterStyle}>
        <div style={progressInnerStyle} />
      </div>

      <div style={textStyle}>
        {showStatusText && <span>{currentStatusText}</span>}
        {showPercentage && <span>{percentage}%</span>}
      </div>

      {status === UploadStatus.ERROR && error && (
        <div style={errorStyle}>{error.message}</div>
      )}
    </div>
  );
};

export default UploadProgress;
