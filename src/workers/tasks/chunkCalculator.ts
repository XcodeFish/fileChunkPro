/**
 * chunkCalculator.ts
 * 文件分片计算模块
 */

// 分片信息接口
export interface ChunkInfo {
  index: number;   // 分片序号
  start: number;   // 分片起始位置
  end: number;     // 分片结束位置
  size: number;    // 分片大小
  fileSize: number; // 原始文件大小
}

/**
 * 计算文件分片
 * @param data 分片计算所需数据
 * @returns 分片信息数组
 */
export function calculateChunks(data: { fileSize: number; chunkSize: number }): ChunkInfo[] {
  const { fileSize, chunkSize } = data;
  const chunks: ChunkInfo[] = [];
  
  // 参数验证
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('无效的文件大小');
  }
  
  if (typeof chunkSize !== 'number' || chunkSize <= 0) {
    throw new Error('无效的分片大小');
  }

  // 计算分片
  for (let start = 0; start < fileSize; start += chunkSize) {
    const end = Math.min(start + chunkSize, fileSize);
    chunks.push({
      index: chunks.length,
      start,
      end,
      size: end - start,
      fileSize
    });
  }
  
  return chunks;
} 