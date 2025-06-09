/**
 * HashWorker - 哈希计算Worker
 * 用于在单独线程中计算文件哈希，避免阻塞主线程
 */

// 在Worker环境中执行
const ctx: Worker = self as any;

// 监听主线程消息
ctx.addEventListener('message', async (event) => {
  try {
    const { file, algorithm, action } = event.data;

    if (action !== 'calculateHash' || !file) {
      throw new Error('无效的Worker请求');
    }

    // 计算文件哈希
    const hash = await calculateFileHash(file, algorithm || 'md5');
    
    // 返回结果给主线程
    ctx.postMessage({ hash });
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
    // 读取文件内容
    const buffer = await file.arrayBuffer();
    
    // 根据算法计算哈希
    return await calculateBufferHash(buffer, algorithm);
  } catch (error) {
    console.error('文件哈希计算失败:', error);
    throw error;
  }
}

/**
 * 计算缓冲区哈希值
 * @param buffer 数据缓冲区
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
async function calculateBufferHash(buffer: ArrayBuffer, algorithm: string): Promise<string> {
  // 使用 Web Crypto API 计算哈希
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
      case 'md5':
      default:
        // Web Crypto API 不直接支持 MD5
        // 这里使用 SHA-256 代替，或者可以引入第三方MD5库
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