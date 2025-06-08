import React, { useState, useCallback } from 'react';

import { useFileUpload } from '../../src/ui/react';

interface FileUploaderProps {
  endpoint: string;
  onSuccess?: (result: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
  maxFileSize?: number;
  allowFileTypes?: string[];
}

const FileUploader: React.FC<FileUploaderProps> = ({
  endpoint,
  onSuccess,
  onError,
  maxFileSize = 1024 * 1024 * 100, // 默认100MB
  allowFileTypes = ['image/*', 'application/pdf', 'video/*'],
}) => {
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<
    'idle' | 'uploading' | 'success' | 'error'
  >('idle');
  const [fileName, setFileName] = useState<string>('');

  const { upload, cancelUpload } = useFileUpload({
    endpoint,
    maxFileSize,
    allowFileTypes,
    onProgress: p => {
      setProgress(p);
    },
    onSuccess: result => {
      setStatus('success');
      setProgress(100);
      onSuccess?.(result);
    },
    onError: error => {
      setStatus('error');
      onError?.(error);
    },
  });

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      setStatus('uploading');
      setProgress(0);

      try {
        await upload(file);
      } catch (error) {
        // 错误已在onError回调中处理
        console.error('上传失败:', error);
      }
    },
    [upload]
  );

  const handleCancel = useCallback(() => {
    cancelUpload();
    setStatus('idle');
    setProgress(0);
  }, [cancelUpload]);

  return (
    <div className="file-uploader">
      <div className="file-uploader__header">
        <label className="file-uploader__button">
          选择文件
          <input
            type="file"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            disabled={status === 'uploading'}
          />
        </label>
        {status === 'uploading' && (
          <button className="file-uploader__cancel" onClick={handleCancel}>
            取消
          </button>
        )}
      </div>

      {fileName && (
        <div className="file-uploader__file">
          <span className="file-uploader__filename">{fileName}</span>
          <span className="file-uploader__status">
            {status === 'uploading' && '上传中...'}
            {status === 'success' && '上传成功'}
            {status === 'error' && '上传失败'}
          </span>
        </div>
      )}

      {status === 'uploading' && (
        <div className="file-uploader__progress-container">
          <div className="file-uploader__progress-bar">
            <div
              className="file-uploader__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="file-uploader__progress-text">
            {Math.round(progress)}%
          </span>
        </div>
      )}

      <style>
        {`
        .file-uploader {
          font-family:
            -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
            Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          max-width: 500px;
          margin: 0 auto;
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background-color: #f9f9f9;
        }

        .file-uploader__header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .file-uploader__button {
          display: inline-block;
          padding: 10px 16px;
          background-color: #4a90e2;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .file-uploader__button:hover {
          background-color: #3a80d2;
        }

        .file-uploader__cancel {
          padding: 10px 16px;
          background-color: #e74c3c;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .file-uploader__cancel:hover {
          background-color: #d73c2c;
        }

        .file-uploader__file {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          background-color: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          margin-bottom: 16px;
        }

        .file-uploader__filename {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 70%;
        }

        .file-uploader__status {
          font-size: 14px;
          color: #666;
        }

        .file-uploader__progress-container {
          display: flex;
          align-items: center;
          margin-top: 12px;
        }

        .file-uploader__progress-bar {
          flex-grow: 1;
          height: 8px;
          background-color: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          margin-right: 12px;
        }

        .file-uploader__progress-fill {
          height: 100%;
          background-color: #4a90e2;
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .file-uploader__progress-text {
          font-size: 14px;
          font-weight: 500;
          min-width: 40px;
          text-align: right;
        }
        `}
      </style>
    </div>
  );
};

export default FileUploader;
