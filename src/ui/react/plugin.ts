/**
 * React插件
 * 提供将FileChunkPro上传组件集成到React应用的方法
 */

import { UploaderOptions } from '../../types';
import UploadButton from './components/UploadButton';
import {
  UploadProgress,
  FileUploadStatus,
  FileInfo,
} from './components/UploadProgress';
import { useFileUpload, UploadStatus } from './hooks';
import MonitoringDashboard from './MonitoringDashboard';

/**
 * FileChunkPro for React插件
 */
class FileChunkProReact {
  /**
   * 获取上传按钮组件
   * @returns 上传按钮组件
   */
  static getUploadButton() {
    return UploadButton;
  }

  /**
   * 获取上传进度组件
   * @returns 上传进度组件
   */
  static getUploadProgress() {
    return UploadProgress;
  }

  /**
   * 获取监控面板组件
   * @returns 监控面板组件
   */
  static getMonitoringDashboard() {
    return MonitoringDashboard;
  }

  /**
   * 获取useFileUpload钩子
   * @param options 上传选项
   * @returns 文件上传钩子的结果
   */
  static useFileUpload(options: UploaderOptions) {
    // 注意：这个静态方法只是一个包装器，实际的 Hook 应该在函数组件内调用
    // 返回类型信息，而不是直接调用 Hook
    return {
      hook: useFileUpload,
      options,
    };
  }

  /**
   * 获取上传状态枚举
   * @returns 上传状态枚举
   */
  static getUploadStatus() {
    return UploadStatus;
  }

  /**
   * 获取文件上传状态枚举
   * @returns 文件上传状态枚举
   */
  static getFileUploadStatus() {
    return FileUploadStatus;
  }

  /**
   * 创建文件信息对象
   * @param file 文件对象
   * @param id 文件ID，默认使用随机生成的ID
   * @returns 文件信息对象
   */
  static createFileInfo(file: File, id?: string): FileInfo {
    return {
      id:
        id ||
        `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      status: FileUploadStatus.PENDING,
      progress: 0,
      startTime: Date.now(),
    };
  }

  /**
   * 创建文件列表
   * @param files 文件列表
   * @returns 文件信息对象数组
   */
  static createFileList(files: File[]): FileInfo[] {
    return files.map(file => this.createFileInfo(file));
  }

  /**
   * 更新文件信息对象的状态
   * @param fileInfo 文件信息对象
   * @param status 新状态
   * @param progress 新进度（可选）
   * @param error 错误信息（可选）
   * @param result 上传结果（可选）
   * @returns 更新后的文件信息对象
   */
  static updateFileInfo(
    fileInfo: FileInfo,
    status: FileUploadStatus,
    progress?: number,
    error?: Error,
    result?: any
  ): FileInfo {
    return {
      ...fileInfo,
      status,
      progress: progress !== undefined ? progress : fileInfo.progress,
      error: error || fileInfo.error,
      result: result || fileInfo.result,
      endTime: [
        FileUploadStatus.SUCCESS,
        FileUploadStatus.ERROR,
        FileUploadStatus.CANCELLED,
      ].includes(status)
        ? Date.now()
        : fileInfo.endTime,
    };
  }

  /**
   * 更新文件列表中特定文件的状态
   * @param files 文件列表
   * @param fileId 要更新的文件ID
   * @param status 新状态
   * @param progress 新进度（可选）
   * @param error 错误信息（可选）
   * @param result 上传结果（可选）
   * @returns 更新后的文件列表
   */
  static updateFileInList(
    files: FileInfo[],
    fileId: string,
    status: FileUploadStatus,
    progress?: number,
    error?: Error,
    result?: any
  ): FileInfo[] {
    return files.map(file => {
      if (file.id === fileId) {
        return this.updateFileInfo(file, status, progress, error, result);
      }
      return file;
    });
  }

  /**
   * 创建用于React组件的上传配置
   * @param options 上传选项
   * @param updateFilesState 文件状态更新函数
   * @returns 配置对象
   */
  static createUploadConfig(
    options: UploaderOptions,
    updateFilesState: (
      fileId: string,
      status: FileUploadStatus,
      progress?: number,
      error?: Error,
      result?: any
    ) => void
  ) {
    // 构建带有事件处理器的配置
    const enhancedOptions = {
      ...options,
      onProgress: (progress: number, fileId: string) => {
        updateFilesState(fileId, FileUploadStatus.UPLOADING, progress);
        if (options.onProgress) {
          options.onProgress(progress, fileId);
        }
      },
      onSuccess: (result: any, fileId: string) => {
        updateFilesState(
          fileId,
          FileUploadStatus.SUCCESS,
          100,
          undefined,
          result
        );
        if (options.onSuccess) {
          options.onSuccess(result, fileId);
        }
      },
      onError: (error: Error, fileId: string) => {
        updateFilesState(fileId, FileUploadStatus.ERROR, undefined, error);
        if (options.onError) {
          options.onError(error, fileId);
        }
      },
      onCancel: (fileId: string) => {
        updateFilesState(fileId, FileUploadStatus.CANCELLED);
        if (options.onCancel) {
          options.onCancel(fileId);
        }
      },
    };

    return enhancedOptions;
  }

  /**
   * 获取上传管理组件配置
   * 此方法返回用于快速集成的配置对象
   */
  static getUploadManagerConfig() {
    return {
      components: {
        UploadButton,
        UploadProgress,
        MonitoringDashboard,
      },
      hooks: {
        useFileUpload,
      },
      helpers: {
        createFileInfo: this.createFileInfo,
        createFileList: this.createFileList,
        updateFileInfo: this.updateFileInfo,
        updateFileInList: this.updateFileInList,
        createUploadConfig: this.createUploadConfig,
      },
      enums: {
        FileUploadStatus,
        UploadStatus,
      },
    };
  }
}

export default FileChunkProReact;

// 导出类型
export type { FileInfo } from './components/UploadProgress';
export { FileUploadStatus } from './components/UploadProgress';
export { UploadStatus } from './hooks';
export type { UploadButtonProps } from './components/UploadButton';
export type { UploadProgressProps } from './components/UploadProgress';
export type { UseFileUploadReturn } from './hooks';
