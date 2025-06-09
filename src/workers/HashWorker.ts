/**
 * HashWorker - 哈希计算Worker
 * 用于在单独线程中计算文件哈希，避免阻塞主线程
 */

import { MD5, HashCalculator } from '../utils/HashUtils';

// 在Worker环境中执行
const ctx: Worker = self as any;

// 监听主线程消息
ctx.addEventListener('message', async (event) => {
  try {
    const { file, algorithm, action, sampleSize, quick } = event.data;

    if (action !== 'calculateHash' || !file) {
      throw new Error('无效的Worker请求');
    }

    // 记录开始时间
    const startTime = Date.now();
    
    // 根据请求计算哈希
    let hash;
    let isQuickHash = false;
    
    if (quick && sampleSize && file.size > 100 * 1024 * 1024) {
      // 使用快速哈希
      hash = await calculateQuickFileHash(file, algorithm || 'md5', sampleSize);
      isQuickHash = true;
    } else {
      // 计算完整文件哈希
      hash = await calculateFileHash(file, algorithm || 'md5');
    }
    
    // 计算耗时
    const hashTime = Date.now() - startTime;
    
    // 返回结果给主线程
    ctx.postMessage({ 
      hash, 
      hashTime,
      isQuickHash,
      fileSize: file.size 
    });
  } catch (error) {
    // 发送错误给主线程
    ctx.postMessage({ 
      error: error instanceof Error ? error.message : '哈希计算错误' 
    });
  }
});

/**
 * 计算文件哈希
 * @param file 文件对象
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
async function calculateFileHash(file: File, algorithm: string): Promise<string> {
  try {
    // 使用流式处理计算大文件哈希
    const chunkSize = 2 * 1024 * 1024; // 2MB 分块
    
    if (algorithm.toLowerCase() === 'md5') {
      const md5 = new MD5();
      let offset = 0;
      
      // 分块读取并更新哈希
      while (offset < file.size) {
        const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
        const buffer = await slice.arrayBuffer();
        md5.update(buffer);
        
        offset += chunkSize;
        
        // 发送进度更新
        if (offset % (chunkSize * 10) === 0 || offset >= file.size) {
          const progress = Math.min(100, Math.floor((offset / file.size) * 100));
          ctx.postMessage({ progress, type: 'progress' });
        }
      }
      
      const digest = md5.finalize();
      return arrayBufferToHex(digest.buffer);
    } else {
      // 读取整个文件
      const buffer = await file.arrayBuffer();
      
      // 计算哈希
      return await calculateBufferHash(buffer, algorithm);
    }
  } catch (error) {
    console.error('文件哈希计算失败:', error);
    throw error;
  }
}

/**
 * 计算文件的快速哈希值（仅计算文件的头尾部分）
 * @param file 文件对象
 * @param algorithm 哈希算法
 * @param sampleSize 采样大小
 * @returns 快速哈希值
 */
async function calculateQuickFileHash(file: File, algorithm: string, sampleSize: number): Promise<string> {
  // 确保采样大小合理
  sampleSize = Math.min(sampleSize, Math.floor(file.size / 2));

  // 读取文件头部
  const headerSlice = file.slice(0, sampleSize);
  const headerChunk = await headerSlice.arrayBuffer();

  // 读取文件尾部
  let footerChunk;
  if (file.size > sampleSize * 2) {
    const footerSlice = file.slice(file.size - sampleSize, file.size);
    footerChunk = await footerSlice.arrayBuffer();
  } else {
    footerChunk = new ArrayBuffer(0);
  }

  // 合并头尾并计算哈希
  const combinedBuffer = concatenateArrayBuffers(headerChunk, footerChunk);
  
  let hash;
  if (algorithm.toLowerCase() === 'md5') {
    const md5 = new MD5();
    md5.update(combinedBuffer);
    const digest = md5.finalize();
    hash = arrayBufferToHex(digest.buffer);
  } else {
    hash = await calculateBufferHash(combinedBuffer, algorithm);
  }

  // 添加文件大小以增加唯一性
  return `${hash}_${file.size}`;
}

/**
 * 计算缓冲区哈希值
 * @param buffer 数据缓冲区
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
async function calculateBufferHash(buffer: ArrayBuffer, algorithm: string): Promise<string> {
  // 处理MD5
  if (algorithm.toLowerCase() === 'md5') {
    const md5 = new MD5();
    md5.update(buffer);
    const digest = md5.finalize();
    return arrayBufferToHex(digest.buffer);
  }
  
  // 使用 Web Crypto API 计算其他哈希
  if (crypto && crypto.subtle) {
    let hashAlgorithm: AlgorithmIdentifier;
    
    switch (algorithm.toLowerCase()) {
      case 'sha1':
        hashAlgorithm = 'SHA-1';
        break;
      case 'sha256':
        hashAlgorithm = 'SHA-256';
        break;
      case 'sha384':
        hashAlgorithm = 'SHA-384';
        break;
      case 'sha512':
        hashAlgorithm = 'SHA-512';
        break;
      default:
        // 不支持的算法，降级到SHA-256
        hashAlgorithm = 'SHA-256';
        break;
    }
    
    const hashBuffer = await crypto.subtle.digest(hashAlgorithm, buffer);
    return arrayBufferToHex(hashBuffer);
  } else {
    // 如果不支持 Web Crypto API，使用简单哈希算法
    return simpleBufferHash(buffer);
  }
}

/**
 * 对缓冲区进行简单哈希计算
 * @param buffer 数据缓冲区
 * @returns 哈希值
 */
function simpleBufferHash(buffer: ArrayBuffer): string {
  const view = new DataView(buffer);
  let hash = 0;
  
  // 采样计算哈希，避免计算太多数据
  const step = Math.max(1, Math.floor(buffer.byteLength / 1024));
  
  for (let i = 0; i < buffer.byteLength; i += step) {
    if (i + 4 <= buffer.byteLength) {
      const value = view.getUint32(i, true);
      hash = ((hash << 5) - hash) + value;
    } else if (i < buffer.byteLength) {
      const value = view.getUint8(i);
      hash = ((hash << 5) - hash) + value;
    }
    hash = hash & hash; // 转换为32位整数
  }
  
  return hash.toString(16).padStart(8, '0');
}

/**
 * 合并两个ArrayBuffer
 * @param buffer1 第一个缓冲区
 * @param buffer2 第二个缓冲区
 * @returns 合并后的缓冲区
 */
function concatenateArrayBuffers(buffer1: ArrayBuffer, buffer2: ArrayBuffer): ArrayBuffer {
  const result = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  result.set(new Uint8Array(buffer1), 0);
  result.set(new Uint8Array(buffer2), buffer1.byteLength);
  return result.buffer;
}

/**
 * 将ArrayBuffer转换为十六进制字符串
 * @param buffer ArrayBuffer数据
 * @returns 十六进制字符串
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    const value = view[i].toString(16);
    hex += value.length === 1 ? '0' + value : value;
  }
  return hex;
}

// 向主线程发送就绪消息
ctx.postMessage({ status: 'ready' }); 