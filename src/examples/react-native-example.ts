/**
 * React Native 适配器使用示例
 *
 * 本示例展示如何在 React Native 环境中使用 fileChunkPro 上传文件
 * 需要安装以下依赖:
 * - react-native-fs
 * - @react-native-async-storage/async-storage
 * - @react-native-community/netinfo (可选，用于网络检测)
 */

import { ReactNativeAdapter } from '../adapters';
import { UploaderCore } from '../core/UploaderCore';
import { ChunkPlugin } from '../plugins/ChunkPlugin';
import { ProgressPlugin } from '../plugins/ProgressPlugin';
import { ResumePlugin } from '../plugins/ResumePlugin';

/**
 * 初始化 React Native 适配器并使用
 *
 * @param rnfs React Native FS 模块
 * @param asyncStorage React Native AsyncStorage 模块
 * @param netInfo React Native NetInfo 模块 (可选)
 */
export const initializeReactNativeUploader = (
  rnfs: any,
  asyncStorage: any,
  netInfo?: any
) => {
  // 创建 React Native 适配器
  const adapter = new ReactNativeAdapter({
    rnFileSystem: rnfs,
    rnAsyncStorage: asyncStorage,
    rnNetInfo: netInfo,
    // 其他配置选项
    tempFileDirectory: rnfs.CachesDirectoryPath,
    maxNetworkRetries: 3,
    networkRetryDelay: 1000,
    useBackgroundUpload: true,
  });

  // 创建上传器核心实例
  const uploader = new UploaderCore({
    // 使用 React Native 适配器
    adapter,
    // 设置上传端点
    endpoint: 'https://api.example.com/upload',
    // 配置上传选项
    chunkSize: 1024 * 1024, // 1MB 分片大小
    concurrency: 3, // 并发上传数量
    timeout: 30000, // 30秒超时
    retryCount: 3, // 失败重试次数
    headers: {
      Authorization: 'Bearer YOUR_AUTH_TOKEN',
    },
    // 其他选项
    autoRetry: true,
    smartRetry: true,
  });

  // 注册插件
  uploader.use(new ChunkPlugin()); // 分片处理插件
  uploader.use(new ProgressPlugin()); // 进度监控插件
  uploader.use(new ResumePlugin()); // 断点续传插件

  return uploader;
};

/**
 * 上传文件示例
 *
 * @param uploader UploaderCore 实例
 * @param filePath 文件路径 (在 React Native 中通常是 file:// URI)
 */
export const uploadFile = async (uploader: UploaderCore, filePath: string) => {
  try {
    // 添加进度回调
    const progressCallback = (progress: number) => {
      console.log(`上传进度: ${(progress * 100).toFixed(2)}%`);
    };

    // 开始上传
    const result = await uploader.upload(filePath, {
      onProgress: progressCallback,
      // 上传时的附加参数
      metadata: {
        userId: 'user123',
        fileType: 'document',
        // 其他自定义元数据
      },
    });

    console.log('上传成功:', result);
    return result;
  } catch (error) {
    console.error('上传失败:', error);
    throw error;
  }
};

/**
 * React Native 组件中使用示例
 *
 * 以下代码展示如何在 React Native 组件中集成
 *
 * import React, { useEffect, useState } from 'react';
 * import { Button, Text, View } from 'react-native';
 * import RNFS from 'react-native-fs';
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import NetInfo from '@react-native-community/netinfo';
 * import { initializeReactNativeUploader, uploadFile } from './uploader';
 *
 * const FileUploadComponent = () => {
 *   const [uploader, setUploader] = useState(null);
 *   const [uploadProgress, setUploadProgress] = useState(0);
 *   const [uploadStatus, setUploadStatus] = useState('idle');
 *
 *   useEffect(() => {
 *     // 初始化上传器
 *     const uploaderInstance = initializeReactNativeUploader(
 *       RNFS,
 *       AsyncStorage,
 *       NetInfo
 *     );
 *
 *     // 监听上传进度
 *     uploaderInstance.on('progress', (progress) => {
 *       setUploadProgress(progress);
 *     });
 *
 *     setUploader(uploaderInstance);
 *
 *     return () => {
 *       // 清理资源
 *       uploaderInstance.dispose();
 *     };
 *   }, []);
 *
 *   const handleUpload = async () => {
 *     try {
 *       setUploadStatus('uploading');
 *
 *       // 假设这是用户选择的文件路径
 *       const filePath = `${RNFS.DocumentDirectoryPath}/example.pdf`;
 *
 *       // 开始上传
 *       const result = await uploadFile(uploader, filePath);
 *
 *       setUploadStatus('success');
 *       console.log('上传结果:', result);
 *     } catch (error) {
 *       setUploadStatus('error');
 *       console.error('上传错误:', error);
 *     }
 *   };
 *
 *   return (
 *     <View>
 *       <Text>上传状态: {uploadStatus}</Text>
 *       <Text>上传进度: {(uploadProgress * 100).toFixed(2)}%</Text>
 *       <Button
 *         title="上传文件"
 *         onPress={handleUpload}
 *         disabled={uploadStatus === 'uploading' || !uploader}
 *       />
 *     </View>
 *   );
 * };
 *
 * export default FileUploadComponent;
 */
