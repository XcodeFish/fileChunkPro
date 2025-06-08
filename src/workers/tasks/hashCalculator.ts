/**
 * hashCalculator.ts
 * 文件哈希计算模块
 */

/**
 * 计算文件哈希
 * @param data 包含文件数据的对象
 * @returns 哈希结果
 */
export async function calculateHash(data: { 
  fileData: ArrayBuffer | Uint8Array; 
  algorithm?: string;
}): Promise<string> {
  const { fileData, algorithm = 'SHA-256' } = data;
  
  // 参数验证
  if (!fileData || !(fileData instanceof ArrayBuffer || fileData instanceof Uint8Array)) {
    throw new Error('无效的文件数据');
  }
  
  try {
    // 使用Web Crypto API计算哈希
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // 确保数据是正确的类型
      const buffer = fileData instanceof Uint8Array 
        ? fileData 
        : new Uint8Array(fileData);
      
      // 计算哈希
      const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
      
      // 将ArrayBuffer转换为十六进制字符串
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } 
    // 浏览器不支持Web Crypto API，使用简单哈希算法
    else {
      console.warn('Web Crypto API不可用，使用简单哈希算法');
      return simpleHash(fileData);
    }
  } catch (error) {
    console.error('哈希计算失败:', error);
    // 回退到简单哈希
    return simpleHash(fileData);
  }
}

/**
 * 简单哈希算法（当Web Crypto API不可用时的回退方案）
 * 警告：这不是一个密码学安全的哈希函数，仅用于文件识别
 * @param data 文件数据
 * @returns 简单哈希结果
 */
function simpleHash(data: ArrayBuffer | Uint8Array): string {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  
  // 每512字节采样一次以提高性能
  const step = Math.max(1, Math.floor(view.length / 2048));
  
  for (let i = 0; i < view.length; i += step) {
    const val = view[i];
    h1 = Math.imul(h1 ^ val, 2654435761);
    h2 = Math.imul(h2 ^ val, 1597334677);
  }
  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(16, '0');
} 