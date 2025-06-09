/**
 * 分片计算工具
 * 负责在Worker线程中进行文件分片计算
 */

export const chunkCalculator = {
  /**
   * 计算文件分片
   * @param data 任务数据 { fileSize:文件大小, chunkSize:分片大小, options:分片选项 }
   * @returns 计算出的分片信息数组
   */
  calculateChunks: (data: any): any[] => {
    const { fileSize, chunkSize, options = {} } = data;
    const { strategy = 'fixed' } = options;
    const chunks = [];

    // 在Worker中不能直接使用File对象，只处理大小信息
    if (strategy === 'fixed') {
      // 固定大小分片策略
      for (let start = 0; start < fileSize; start += chunkSize) {
        const end = Math.min(start + chunkSize, fileSize);
        chunks.push({
          index: chunks.length,
          start,
          end,
          size: end - start,
        });
      }
    } else if (strategy === 'adaptive') {
      // 自适应分片策略（示例，实际可以有更复杂的算法）
      const totalChunks = Math.ceil(fileSize / chunkSize);
      let remainingSize = fileSize;
      let start = 0;

      for (let i = 0; i < totalChunks; i++) {
        // 最后一块可能大小不同
        const isLastChunk = i === totalChunks - 1;
        let currentChunkSize;

        if (isLastChunk) {
          currentChunkSize = remainingSize;
        } else {
          currentChunkSize = chunkSize;
        }

        const end = start + currentChunkSize;
        chunks.push({
          index: i,
          start,
          end,
          size: currentChunkSize,
        });

        start = end;
        remainingSize -= currentChunkSize;
      }
    }

    return chunks;
  }
};

export default chunkCalculator; 