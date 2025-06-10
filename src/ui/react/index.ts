/**
 * React UI组件库入口文件
 * 统一导出所有React组件和Hooks
 */

// 导出Hooks
export { useFileUpload, UploadStatus } from './hooks';

// 导出组件
export { default as UploadButton } from './components/UploadButton';
export { default as UploadProgress } from './components/UploadProgress';
export { default as MonitoringDashboard } from './MonitoringDashboard';

// 导出组件Props类型
export type { UseFileUploadReturn } from './hooks';
export type { UploadButtonProps } from './components/UploadButton';
export type { UploadProgressProps } from './components/UploadProgress';

/**
 * React 组件与钩子导出
 * 这是一个占位文件，将在后续开发中实现
 */

// 占位导出，待完善
export const React = {
  // 将在未来实现
};

export default React;
