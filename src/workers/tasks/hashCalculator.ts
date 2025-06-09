/**
 * 哈希计算工具
 * 负责在Worker线程中进行文件哈希计算
 */

export const hashCalculator = {
  /**
   * 计算哈希值
   * @param data 计算哈希所需数据 { file:文件数据, algorithm:算法 }
   * @returns 计算出的哈希值
   */
  calculateHash: async (data: any): Promise<string> => {
    const { fileData, algorithm = 'SHA-256' } = data;
    
    try {
      // 如果支持Web Crypto API
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // 转换为ArrayBuffer
        const buffer = fileData instanceof ArrayBuffer 
          ? fileData 
          : await fileData.arrayBuffer();
          
        // 使用指定的哈希算法
        const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
        
        // 转换为十六进制字符串
        return Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } 
      
      // 回退到简单哈希 (仅用于演示)
      return simpleHash(fileData);
    } catch (error) {
      console.error('哈希计算错误:', error);
      // 回退方案
      return simpleHash(fileData);
    }
  }
};

/**
 * 简单哈希算法 (仅用于演示)
 */
function simpleHash(data: ArrayBuffer | Blob): string {
  let hash = 0;
  
  // 将数据转换为Uint8Array
  const bufferView = data instanceof ArrayBuffer 
    ? new Uint8Array(data) 
    : new Uint8Array(data.size);
  
  // 简单哈希计算
  const len = bufferView.length;
  const step = Math.max(1, Math.floor(len / 1000)); // 采样以提高性能
  
  for (let i = 0; i < len; i += step) {
    const byte = bufferView[i];
    hash = ((hash << 5) - hash) + byte;
    hash |= 0; // 转换为32位整数
  }
  
  // 添加时间戳使结果更唯一
  const timestamp = Date.now().toString(36);
  const hashStr = Math.abs(hash).toString(36);
  
  return `${hashStr}-${timestamp}`;
}

export default hashCalculator; 