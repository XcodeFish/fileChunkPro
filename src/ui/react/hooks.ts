/**
 * React Hooks for fileChunkPro
 * 提供文件上传功能相关的React Hook
 */

import { useRef, useEffect, useState, useCallback } from 'react';

import { UploaderCore } from '../../core/UploaderCore';
import { UploaderOptions, UploadResult } from '../../types';

// 上传状态枚举
export enum UploadStatus {
  IDLE = 'idle', // 空闲状态
  UPLOADING = 'uploading', // 上传中
  SUCCESS = 'success', // 上传成功
  ERROR = 'error', // 上传失败
  CANCELLED = 'cancelled', // 已取消
}

// Hook返回值类型
export interface UseFileUploadReturn {
  // 状态
  status: UploadStatus;
  progress: number;
  result: UploadResult | null;
  error: Error | null;
  uploader: UploaderCore | null;

  // 方法
  upload: (file: File) => Promise<UploadResult>;
  cancel: () => void;
  reset: () => void;
}

/**
 * 大文件分片上传Hook
 * @param options 上传选项
 * @returns 上传控制对象
 */
export function useFileUpload(options: UploaderOptions): UseFileUploadReturn {
  // 记录上传器实例
  const uploaderRef = useRef<UploaderCore | null>(null);

  // 上传状态
  const [status, setStatus] = useState<UploadStatus>(UploadStatus.IDLE);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // 初始化上传器
  useEffect(() => {
    // 创建上传器实例
    const uploader = new UploaderCore(options);
    uploaderRef.current = uploader;

    // 设置进度回调
    uploader.on('progress', (progressData: { progress: number }) => {
      setProgress(progressData.progress);
    });

    // 设置完成回调
    uploader.on('complete', (uploadResult: UploadResult) => {
      setResult(uploadResult);
      setStatus(UploadStatus.SUCCESS);
    });

    // 设置错误回调
    uploader.on('error', (err: Error) => {
      setError(err);
      setStatus(UploadStatus.ERROR);
    });

    // 设置取消回调
    uploader.on('cancel', () => {
      setStatus(UploadStatus.CANCELLED);
    });

    // 组件卸载时清理资源
    return () => {
      if (uploaderRef.current) {
        uploaderRef.current.dispose();
        uploaderRef.current = null;
      }
    };
  }, [options.endpoint]); // 仅在endpoint变更时重建上传器

  // 上传文件
  const upload = useCallback(async (file: File): Promise<UploadResult> => {
    if (!uploaderRef.current) {
      throw new Error('上传器未初始化');
    }

    try {
      // 重置状态
      setStatus(UploadStatus.UPLOADING);
      setProgress(0);
      setError(null);
      setResult(null);

      // 执行上传
      const uploadResult = await uploaderRef.current.upload(file);
      return uploadResult;
    } catch (err) {
      setError(err as Error);
      setStatus(UploadStatus.ERROR);
      throw err;
    }
  }, []);

  // 取消上传
  const cancel = useCallback(() => {
    if (uploaderRef.current) {
      uploaderRef.current.cancel();
      setStatus(UploadStatus.CANCELLED);
    }
  }, []);

  // 重置状态
  const reset = useCallback(() => {
    setStatus(UploadStatus.IDLE);
    setProgress(0);
    setError(null);
    setResult(null);
  }, []);

  return {
    status,
    progress,
    result,
    error,
    uploader: uploaderRef.current,
    upload,
    cancel,
    reset,
  };
}
