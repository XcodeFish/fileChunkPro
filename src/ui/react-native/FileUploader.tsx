/**
 * FileUploader.tsx
 * React Native 文件上传组件
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { v4 as uuidv4 } from 'uuid';

import { ReactNativeAdapter } from '../../adapters/ReactNativeAdapter';
import { UploaderCore } from '../../core/UploaderCore';
import { ChunkPlugin } from '../../plugins/ChunkPlugin';
import { ProgressPlugin } from '../../plugins/ProgressPlugin';
import { ResumePlugin } from '../../plugins/ResumePlugin';
import { UploadResult } from '../../types';

// 需要在项目中安装这些依赖
// import RNFS from 'react-native-fs';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import DocumentPicker from 'react-native-document-picker';

interface FileUploaderProps {
  endpoint: string;
  headers?: Record<string, string>;
  onUploadComplete?: (result: UploadResult) => void;
  onUploadError?: (error: Error) => void;
  chunkSize?: number;
  concurrency?: number;
  showFileList?: boolean;
  autoUpload?: boolean;
  maxFileSize?: number;
  allowedFileTypes?: string[];
}

interface UploadItem {
  id: string;
  name: string;
  size: number;
  type: string;
  uri: string;
  progress: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  endpoint,
  headers = {},
  onUploadComplete,
  onUploadError,
  chunkSize = 1024 * 1024, // 1MB
  concurrency = 3,
  showFileList = true,
  autoUpload = false,
  maxFileSize,
  allowedFileTypes,
}) => {
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [totalProgress, setTotalProgress] = useState(0);
  const uploaderRef = useRef<UploaderCore | null>(null);

  // 初始化上传器
  useEffect(() => {
    // 在实际使用时，从项目中导入这些模块
    const RNFS = { CachesDirectoryPath: '/tmp' }; // 示例，实际使用中替换为真实模块
    const AsyncStorage = {}; // 示例，实际使用中替换为真实模块

    // 创建 React Native 适配器
    const adapter = new ReactNativeAdapter({
      rnFileSystem: RNFS,
      rnAsyncStorage: AsyncStorage,
      tempFileDirectory: RNFS.CachesDirectoryPath,
    });

    // 创建上传器实例
    const uploader = new UploaderCore({
      adapter,
      endpoint,
      chunkSize,
      concurrency,
      headers,
      timeout: 30000,
      retryCount: 3,
      autoRetry: true,
    });

    // 注册插件
    uploader.use(new ChunkPlugin());
    uploader.use(new ProgressPlugin());
    uploader.use(new ResumePlugin());

    // 设置上传器引用
    uploaderRef.current = uploader;

    // 组件卸载时清理资源
    return () => {
      uploader.dispose();
      uploaderRef.current = null;
    };
  }, [endpoint, chunkSize, concurrency, headers]);

  // 计算总进度
  useEffect(() => {
    if (files.length === 0) {
      setTotalProgress(0);
      return;
    }

    const total = files.reduce((sum, file) => sum + file.progress, 0);
    setTotalProgress(total / files.length);
  }, [files]);

  // 实际上传处理函数
  const handleUploadFiles = useCallback(
    async (filesToUpload: UploadItem[]) => {
      if (!uploaderRef.current || filesToUpload.length === 0) {
        return;
      }

      setIsUploading(true);

      // 逐个上传文件
      for (const file of filesToUpload.filter(f => f.status !== 'completed')) {
        try {
          // 更新状态为上传中
          setFiles(prev =>
            prev.map(f =>
              f.id === file.id ? { ...f, status: 'uploading' } : f
            )
          );

          // 注册进度回调
          const onProgress = (progress: number) => {
            setFiles(prev =>
              prev.map(f => (f.id === file.id ? { ...f, progress } : f))
            );
          };

          // 执行上传
          const result = await uploaderRef.current.upload(file.uri, {
            onProgress,
            metadata: {
              fileName: file.name,
              fileType: file.type,
            },
          });

          // 更新状态为已完成
          setFiles(prev =>
            prev.map(f =>
              f.id === file.id ? { ...f, status: 'completed', progress: 1 } : f
            )
          );

          // 触发完成回调
          onUploadComplete?.(result);
        } catch (error) {
          console.error('上传文件错误:', error);

          // 更新状态为错误
          setFiles(prev =>
            prev.map(f =>
              f.id === file.id
                ? {
                    ...f,
                    status: 'error',
                    error: (error as Error).message,
                  }
                : f
            )
          );

          // 触发错误回调
          onUploadError?.(error as Error);
        }
      }

      setIsUploading(false);
    },
    [uploaderRef, onUploadComplete, onUploadError]
  );

  // 上传文件 - 公开方法
  const uploadFiles = useCallback(
    (filesToUpload = files) => {
      handleUploadFiles(filesToUpload);
    },
    [files, handleUploadFiles]
  );

  // 处理文件选择
  const handleFilePick = useCallback(async () => {
    try {
      const results = await DocumentPicker.pick({
        type: allowedFileTypes?.length
          ? allowedFileTypes
          : [DocumentPicker.types.allFiles],
        allowMultiSelection: true,
      });

      // 过滤文件大小
      const validFiles = maxFileSize
        ? results.filter(file => file.size <= maxFileSize)
        : results;

      if (validFiles.length < results.length) {
        Alert.alert('警告', '部分文件超出大小限制，已被忽略');
      }

      // 转换为上传项
      const newFiles = validFiles.map(file => ({
        id: uuidv4(),
        name: file.name || 'unknown',
        size: file.size,
        type: file.type || 'application/octet-stream',
        uri: file.uri,
        progress: 0,
        status: 'pending' as const,
      }));

      if (newFiles.length > 0) {
        // 添加到文件列表
        setFiles(prev => [...prev, ...newFiles]);

        // 自动上传
        if (autoUpload) {
          // 延迟一下，让UI先更新
          setTimeout(() => {
            // 直接使用handleUploadFiles而不是uploadFiles
            handleUploadFiles(newFiles);
          }, 500);
        }
      }
    } catch (err) {
      // 用户取消选择不处理
      if ((err as any).code !== 'DOCUMENT_PICKER_CANCELED') {
        console.error('选择文件错误:', err);
        Alert.alert('错误', '选择文件时发生错误');
      }
    }
  }, [maxFileSize, allowedFileTypes, autoUpload, handleUploadFiles]);

  // 暂停上传
  const pauseUpload = useCallback(() => {
    if (uploaderRef.current) {
      uploaderRef.current.pause();

      // 更新状态
      setFiles(prev =>
        prev.map(f =>
          f.status === 'uploading' ? { ...f, status: 'paused' } : f
        )
      );

      setIsUploading(false);
    }
  }, []);

  // 清除文件
  const clearFiles = useCallback(() => {
    if (!isUploading) {
      setFiles([]);
    } else {
      Alert.alert('警告', '上传进行中，请先暂停上传');
    }
  }, [isUploading]);

  // 渲染文件项
  const renderFileItem = (file: UploadItem) => {
    const getStatusText = () => {
      switch (file.status) {
        case 'pending':
          return '等待上传';
        case 'uploading':
          return `上传中 ${(file.progress * 100).toFixed(0)}%`;
        case 'paused':
          return '已暂停';
        case 'completed':
          return '上传完成';
        case 'error':
          return `错误: ${file.error || '未知错误'}`;
      }
    };

    return (
      <View key={file.id} style={styles.fileItem}>
        <View style={styles.fileInfo}>
          <Text
            style={styles.fileName}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {file.name}
          </Text>
          <Text style={styles.fileSize}>
            {(file.size / 1024).toFixed(0)} KB
          </Text>
          <Text
            style={[
              styles.fileStatus,
              file.status === 'error' && styles.errorText,
              file.status === 'completed' && styles.successText,
            ]}
          >
            {getStatusText()}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${file.progress * 100}%` },
              file.status === 'error' && styles.errorProgress,
              file.status === 'completed' && styles.successProgress,
            ]}
          />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 文件列表 */}
      {showFileList && files.length > 0 && (
        <View style={styles.fileList}>
          {files.map(renderFileItem)}
          {/* 总进度 */}
          <View style={styles.totalProgress}>
            <Text style={styles.totalProgressText}>
              总进度: {(totalProgress * 100).toFixed(0)}%
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${totalProgress * 100}%` },
                ]}
              />
            </View>
          </View>
        </View>
      )}

      {/* 操作按钮 */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleFilePick}
          disabled={isUploading}
        >
          <Text style={styles.buttonText}>选择文件</Text>
        </TouchableOpacity>

        {isUploading ? (
          <TouchableOpacity
            style={[styles.button, styles.pauseButton]}
            onPress={pauseUpload}
          >
            <Text style={styles.buttonText}>暂停</Text>
          </TouchableOpacity>
        ) : (
          files.length > 0 && (
            <TouchableOpacity
              style={[styles.button, styles.uploadButton]}
              onPress={() => uploadFiles()}
            >
              <Text style={styles.buttonText}>
                {files.some(f => f.status === 'paused') ? '继续' : '上传'}
              </Text>
            </TouchableOpacity>
          )
        )}

        {files.length > 0 && (
          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={clearFiles}
            disabled={isUploading}
          >
            <Text style={styles.buttonText}>清除</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 上传状态指示器 */}
      {isUploading && (
        <View style={styles.uploadingIndicator}>
          <ActivityIndicator size="small" color="#0066cc" />
          <Text style={styles.uploadingText}>上传中...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    width: '100%',
  },
  fileList: {
    marginBottom: 16,
  },
  fileItem: {
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fileInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fileName: {
    flex: 2,
    fontWeight: '500',
    fontSize: 14,
  },
  fileSize: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  fileStatus: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0066cc',
  },
  errorProgress: {
    backgroundColor: '#cc0000',
  },
  successProgress: {
    backgroundColor: '#00cc66',
  },
  totalProgress: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    padding: 12,
  },
  totalProgressText: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    backgroundColor: '#0066cc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '500',
    fontSize: 14,
  },
  uploadButton: {
    backgroundColor: '#00cc66',
  },
  pauseButton: {
    backgroundColor: '#ff9900',
  },
  clearButton: {
    backgroundColor: '#cc0000',
  },
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  uploadingText: {
    marginLeft: 8,
    color: '#0066cc',
  },
  errorText: {
    color: '#cc0000',
  },
  successText: {
    color: '#00cc66',
  },
});

export default FileUploader;
