/**
 * fileChunkPro React组件示例
 */
import React, { useState } from 'react';

import {
  UploadButton,
  UploadProgress,
  useFileUpload,
  UploadStatus,
} from '../src/ui/react';

/**
 * 示例1: 使用UploadButton组件
 */
const UploadButtonExample: React.FC = () => {
  // 定义上传选项
  const uploadOptions = {
    endpoint: 'https://api.example.com/upload',
    chunkSize: 2 * 1024 * 1024, // 2MB分片
    concurrency: 3, // 同时上传3个分片
    retryCount: 3, // 失败重试3次
  };

  // 处理上传成功
  const handleSuccess = (result: any) => {
    console.log('上传成功:', result);
    alert(`文件上传成功，文件ID: ${result.fileId}`);
  };

  // 处理上传错误
  const handleError = (error: Error) => {
    console.error('上传失败:', error);
    alert(`上传失败: ${error.message}`);
  };

  return (
    <div>
      <h2>上传按钮示例</h2>
      <UploadButton
        options={uploadOptions}
        accept="image/*,application/pdf"
        onUploadSuccess={handleSuccess}
        onUploadError={handleError}
        buttonTexts={{
          idle: '选择文件上传',
          success: '上传完成!',
        }}
      />
    </div>
  );
};

/**
 * 示例2: 使用useFileUpload Hook
 */
const UseFileUploadExample: React.FC = () => {
  // 使用自定义Hook
  const { status, progress, result, error, upload, cancel, reset } =
    useFileUpload({
      endpoint: 'https://api.example.com/upload',
      chunkSize: 'auto', // 自动计算最佳分片大小
      concurrency: 4,
      retryCount: 3,
    });

  // 文件选择状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 处理文件选择
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  // 开始上传
  const handleUpload = async () => {
    if (selectedFile) {
      try {
        const uploadResult = await upload(selectedFile);
        console.log('上传结果:', uploadResult);
      } catch (err) {
        console.error('上传失败:', err);
      }
    }
  };

  return (
    <div>
      <h2>使用Hook示例</h2>
      <div>
        <input type="file" onChange={handleFileChange} />
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || status === UploadStatus.UPLOADING}
          >
            开始上传
          </button>
          {status === UploadStatus.UPLOADING && (
            <button onClick={cancel}>取消上传</button>
          )}
          {(status === UploadStatus.SUCCESS ||
            status === UploadStatus.ERROR) && (
            <button onClick={reset}>重置</button>
          )}
        </div>

        {selectedFile && (
          <UploadProgress
            status={status}
            progress={progress}
            fileName={selectedFile.name}
            error={error}
            width="400px"
          />
        )}

        {result && status === UploadStatus.SUCCESS && (
          <div>
            <h3>上传成功</h3>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 示例3: 自定义上传UI
 */
const CustomUploadExample: React.FC = () => {
  // 使用Hook
  const { status, progress, upload, cancel } = useFileUpload({
    endpoint: 'https://api.example.com/upload',
    chunkSize: 5 * 1024 * 1024, // 5MB分片
    concurrency: 2,
  });

  // 拖放状态
  const [isDragging, setIsDragging] = useState(false);

  // 处理拖放
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      try {
        await upload(file);
        alert('文件上传成功!');
      } catch (err) {
        alert(`上传失败: ${(err as Error).message}`);
      }
    }
  };

  // 自定义样式
  const dropZoneStyle: React.CSSProperties = {
    border: `2px dashed ${isDragging ? '#1890ff' : '#d9d9d9'}`,
    borderRadius: '4px',
    padding: '20px',
    textAlign: 'center',
    cursor: 'pointer',
    backgroundColor: isDragging ? 'rgba(24, 144, 255, 0.1)' : 'transparent',
    transition: 'all 0.3s',
  };

  return (
    <div>
      <h2>自定义拖放上传示例</h2>

      <div
        style={dropZoneStyle}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {status === UploadStatus.UPLOADING ? (
          <div>
            <div>上传中... {Math.round(progress * 100)}%</div>
            <progress value={progress} max={1} style={{ width: '100%' }} />
            <button onClick={cancel}>取消上传</button>
          </div>
        ) : (
          <div>
            <p>拖放文件到此处上传</p>
            <p>或</p>
            <input type="file" />
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 完整示例
 */
const ReactExamples: React.FC = () => {
  return (
    <div>
      <h1>fileChunkPro React组件示例</h1>

      <section style={{ marginBottom: '30px' }}>
        <UploadButtonExample />
      </section>

      <section style={{ marginBottom: '30px' }}>
        <UseFileUploadExample />
      </section>

      <section style={{ marginBottom: '30px' }}>
        <CustomUploadExample />
      </section>
    </div>
  );
};

export default ReactExamples;
