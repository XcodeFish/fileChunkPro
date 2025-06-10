/**
 * ChunkWorker.ts
 * 文件分片处理Worker
 */

// 导入任务处理函数
import { chunkCalculator } from './tasks/chunkCalculator';

// 分片处理进度跟踪
interface ProgressTracker {
  totalChunks: number;
  processedChunks: number;
  startTime: number;
  lastUpdateTime?: number;
  bytesProcessed?: number;
  currentSpeed?: number;
  averageSpeed?: number;
  estimatedTimeRemaining?: number;
}

// 网络状况评估结果
interface NetworkAssessment {
  condition: 'slow' | 'normal' | 'fast';
  averageSpeed: number; // 字节/秒
  stability: number;   // 0-1，值越高表示越稳定
  latency: number;     // 毫秒
  timestamp: number;
}

// 保存当前进度
const progressTracker: Record<string, ProgressTracker> = {};

// 保存最近的网络评估结果
let lastNetworkAssessment: NetworkAssessment | null = null;

// 保存环境配置
let environmentConfig: {
  isMemoryConstrained: boolean;
  maxConcurrency: number;
  devicePerformance: 'low' | 'medium' | 'high';
} = {
  isMemoryConstrained: false,
  maxConcurrency: 3,
  devicePerformance: 'medium'
};

// 监听消息
self.addEventListener('message', (event) => {
  const { taskId, type, data } = event.data;

  // 根据任务类型处理
  switch (type) {
    case 'calculateChunks':
      handleCalculateChunks(taskId, data);
      break;
    case 'calculateAdaptiveChunks':
      handleCalculateAdaptiveChunks(taskId, data);
      break;
    case 'processChunk':
      handleProcessChunk(taskId, data);
      break;
    case 'resumeChunks':
      handleResumeChunks(taskId, data);
      break;
    case 'validateChunks':
      handleValidateChunks(taskId, data);
      break;
    case 'getProgress':
      handleGetProgress(taskId, data);
      break;
    case 'ping':
      handlePing(taskId);
      break;
    case 'updateNetworkAssessment':
      handleUpdateNetworkAssessment(taskId, data);
      break;
    case 'updateEnvironmentConfig':
      handleUpdateEnvironmentConfig(taskId, data);
      break;
    default:
      sendError(taskId, `未知任务类型: ${type}`);
  }
});

/**
 * 处理分片计算任务
 */
function handleCalculateChunks(taskId: string, data: any): void {
  try {
    // 执行分片计算
    const chunks = chunkCalculator.calculateChunks(data);
    
    // 初始化进度跟踪
    progressTracker[taskId] = {
      totalChunks: chunks.length,
      processedChunks: 0,
      startTime: Date.now()
    };
    
    // 发送结果
    sendSuccess(taskId, chunks);
  } catch (error) {
    sendError(taskId, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 处理自适应分片计算
 * 根据网络状况、文件类型等智能计算最佳分片大小
 */
function handleCalculateAdaptiveChunks(taskId: string, data: any): void {
  try {
    // 解构参数
    const { 
      fileSize, 
      fileType, 
      networkCondition, 
      memoryLimit,
      devicePerformance,
      resumeInfo,
      priorityLevel,
      targetTimeframe
    } = data;
    
    // 获取当前网络状况
    const networkStatus = networkCondition || 
      (lastNetworkAssessment ? lastNetworkAssessment.condition : 'normal');
    
    // 获取当前设备性能
    const performance = devicePerformance || environmentConfig.devicePerformance;
    
    // 计算自适应分片
    const adaptiveChunkSize = calculateAdaptiveChunkSize({
      fileSize,
      fileType,
      networkCondition: networkStatus,
      memoryLimit: memoryLimit || (environmentConfig.isMemoryConstrained ? 100 * 1024 * 1024 : 0),
      devicePerformance: performance,
      resumeInfo,
      priorityLevel,
      targetTimeframe
    });
    
    // 使用计算得到的分片大小生成分片信息
    const chunks = chunkCalculator.calculateChunks({
      fileSize,
      chunkSize: adaptiveChunkSize,
      options: { strategy: 'adaptive' }
    });
    
    // 初始化进度跟踪
    progressTracker[taskId] = {
      totalChunks: chunks.length,
      processedChunks: 0,
      startTime: Date.now(),
      bytesProcessed: 0,
      currentSpeed: 0,
      averageSpeed: 0
    };
    
    // 计算估计的上传时间
    const estimatedUploadTime = calculateEstimatedUploadTime(
      fileSize, 
      adaptiveChunkSize, 
      networkStatus,
      performance
    );
    
    // 发送结果
    sendSuccess(taskId, {
      chunks,
      adaptiveChunkSize,
      estimatedChunkCount: chunks.length,
      estimations: {
        totalTime: estimatedUploadTime,
        chunkUploadTime: estimatedUploadTime / chunks.length,
        successProbability: calculateSuccessProbability(adaptiveChunkSize, networkStatus)
      },
      recommendations: {
        concurrency: recommendConcurrency(networkStatus, performance),
        retryStrategy: recommendRetryStrategy(networkStatus),
        cacheStrategy: recommendCacheStrategy(fileSize, adaptiveChunkSize)
      }
    });
  } catch (error) {
    sendError(taskId, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 计算自适应分片大小
 * 根据多种因素动态计算最优分片大小
 */
function calculateAdaptiveChunkSize(options: {
  fileSize: number,
  fileType?: string,
  networkCondition?: string,
  memoryLimit?: number,
  devicePerformance?: string,
  resumeInfo?: any,
  priorityLevel?: string,
  targetTimeframe?: number
}): number {
  const { 
    fileSize, 
    fileType = '', 
    networkCondition = 'normal',
    memoryLimit = 0,
    devicePerformance = 'medium',
    resumeInfo,
    priorityLevel = 'normal',
    targetTimeframe = 0
  } = options;
  
  // 基础分片大小
  let baseChunkSize = 2 * 1024 * 1024; // 默认2MB
  
  // 根据文件大小调整
  if (fileSize > 1024 * 1024 * 1024) { // > 1GB
    baseChunkSize = 10 * 1024 * 1024; // 10MB
  } else if (fileSize > 100 * 1024 * 1024) { // > 100MB
    baseChunkSize = 5 * 1024 * 1024; // 5MB
  } else if (fileSize < 10 * 1024 * 1024) { // < 10MB
    baseChunkSize = 1 * 1024 * 1024; // 1MB
  }
  
  // 根据文件类型调整
  if (fileType.includes('video') || fileType.includes('audio')) {
    // 媒体文件使用较大分片
    baseChunkSize = Math.max(baseChunkSize, 5 * 1024 * 1024);
  } else if (fileType.includes('image')) {
    // 图片文件使用中等分片
    baseChunkSize = Math.min(baseChunkSize, 4 * 1024 * 1024);
  } else if (fileType.includes('text') || fileType.includes('json')) {
    // 文本文件使用较小分片
    baseChunkSize = Math.min(baseChunkSize, 2 * 1024 * 1024);
  }
  
  // 根据网络条件调整
  switch (networkCondition) {
    case 'slow':
      baseChunkSize = Math.min(baseChunkSize, 1 * 1024 * 1024); // 最大1MB
      break;
    case 'fast':
      baseChunkSize = Math.max(baseChunkSize, 8 * 1024 * 1024); // 最小8MB
      break;
    // normal保持不变
  }

  // 根据设备性能调整
  switch (devicePerformance) {
    case 'low':
      // 低性能设备使用较小分片
      baseChunkSize = Math.min(baseChunkSize, 2 * 1024 * 1024);
      break;
    case 'high':
      // 高性能设备可以使用较大分片
      if (networkCondition === 'fast') {
        baseChunkSize = Math.max(baseChunkSize, 10 * 1024 * 1024);
      }
      break;
  }
  
  // 考虑内存限制
  if (memoryLimit > 0) {
    // 确保分片大小不超过内存限制的1/4
    const maxChunkSize = memoryLimit / 4;
    baseChunkSize = Math.min(baseChunkSize, maxChunkSize);
  }
  
  // 如果有续传信息，根据历史上传速度调整
  if (resumeInfo && resumeInfo.averageSpeed) {
    // 如果历史上传速度较快，可以适当增大分片
    if (resumeInfo.averageSpeed > 1024 * 1024) { // > 1MB/s
      baseChunkSize = Math.min(baseChunkSize * 1.2, 20 * 1024 * 1024);
    } 
    // 如果历史上传速度较慢，适当减小分片
    else if (resumeInfo.averageSpeed < 100 * 1024) { // < 100KB/s
      baseChunkSize = Math.max(baseChunkSize * 0.8, 512 * 1024);
    }
  }
  
  // 根据优先级调整
  switch (priorityLevel) {
    case 'high':
      // 高优先级任务使用较小分片，提高成功率
      baseChunkSize = Math.min(baseChunkSize, 2 * 1024 * 1024);
      break;
    case 'low':
      // 低优先级任务可以使用较大分片，减少请求数
      baseChunkSize = Math.max(baseChunkSize, 4 * 1024 * 1024);
      break;
  }
  
  // 如果指定了目标上传时间
  if (targetTimeframe > 0 && lastNetworkAssessment) {
    // 估算理想分片大小
    const idealChunkCount = targetTimeframe / 2; // 假设每个分片上传需要2秒
    const idealChunkSize = fileSize / idealChunkCount;
    
    // 在合理范围内调整
    if (idealChunkSize > 512 * 1024 && idealChunkSize < 20 * 1024 * 1024) {
      baseChunkSize = idealChunkSize;
    }
  }
  
  // 确保分片数量在合理范围内
  const chunkCount = Math.ceil(fileSize / baseChunkSize);
  
  // 如果分片数量过多，增大分片大小
  if (chunkCount > 1000) {
    baseChunkSize = Math.ceil(fileSize / 1000);
  }
  
  // 如果分片数量过少，减小分片大小
  if (chunkCount < 5 && fileSize > 10 * 1024 * 1024) {
    baseChunkSize = Math.ceil(fileSize / 5);
  }
  
  return baseChunkSize;
}

/**
 * 处理单个分片处理任务
 */
function handleProcessChunk(taskId: string, data: any): void {
  try {
    const { chunkData, chunkIndex, options } = data;
    
    // 处理分片数据 (这里只是示例)
    const processedData = {
      index: chunkIndex,
      size: chunkData.byteLength,
      hash: simpleHash(chunkData),
      processed: true
    };
    
    // 更新进度
    if (progressTracker[taskId]) {
      progressTracker[taskId].processedChunks++;
      
      // 更新已处理字节数
      if (progressTracker[taskId].bytesProcessed !== undefined) {
        progressTracker[taskId].bytesProcessed! += chunkData.byteLength;
      } else {
        progressTracker[taskId].bytesProcessed = chunkData.byteLength;
      }
      
      // 更新当前时间和速度
      const now = Date.now();
      if (progressTracker[taskId].lastUpdateTime) {
        const timeDiff = now - progressTracker[taskId].lastUpdateTime!;
        if (timeDiff > 0) {
          // 计算当前速度 (字节/秒)
          progressTracker[taskId].currentSpeed = chunkData.byteLength / (timeDiff / 1000);
          
          // 更新平均速度
          if (progressTracker[taskId].averageSpeed !== undefined) {
            progressTracker[taskId].averageSpeed = 
              (progressTracker[taskId].averageSpeed! * 0.7) + 
              (progressTracker[taskId].currentSpeed! * 0.3);
          } else {
            progressTracker[taskId].averageSpeed = progressTracker[taskId].currentSpeed;
          }
        }
      }
      progressTracker[taskId].lastUpdateTime = now;
      
      // 发送进度更新
      sendProgressUpdate(taskId, progressTracker[taskId]);
    }
    
    // 发送结果
    sendSuccess(taskId, processedData);
  } catch (error) {
    sendError(taskId, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 处理断点续传相关的分片计算
 */
function handleResumeChunks(taskId: string, data: any): void {
  try {
    const { fileSize, chunkSize, uploadedChunks = [], uploadStartTime, uploadedBytes } = data;
    
    // 计算所有分片
    const allChunks = chunkCalculator.calculateChunks({
      fileSize, 
      chunkSize
    });
    
    // 过滤出未上传的分片
    const remainingChunks = allChunks.filter(
      chunk => !uploadedChunks.includes(chunk.index)
    );
    
    // 初始化进度跟踪（只考虑剩余分片）
    progressTracker[taskId] = {
      totalChunks: remainingChunks.length,
      processedChunks: 0,
      startTime: Date.now()
    };
    
    // 计算历史上传速度
    let historicalSpeed: number | undefined;
    if (uploadStartTime && uploadedBytes) {
      const uploadDuration = (Date.now() - uploadStartTime) / 1000; // 秒
      if (uploadDuration > 0) {
        historicalSpeed = uploadedBytes / uploadDuration; // 字节/秒
      }
    }
    
    // 估算剩余时间
    let estimatedTimeRemaining: number | undefined;
    if (historicalSpeed && historicalSpeed > 0) {
      const remainingBytes = fileSize - (uploadedBytes || 0);
      estimatedTimeRemaining = remainingBytes / historicalSpeed * 1000; // 毫秒
    }
    
    // 发送结果
    sendSuccess(taskId, {
      totalChunks: allChunks.length,
      uploadedChunks: uploadedChunks.length,
      remainingChunks,
      resumeInfo: {
        percent: (uploadedChunks.length / allChunks.length) * 100,
        isPartiallyUploaded: uploadedChunks.length > 0,
        averageSpeed: historicalSpeed,
        estimatedTimeRemaining
      }
    });
  } catch (error) {
    sendError(taskId, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 校验分片列表的完整性和一致性
 */
function validateChunkList(chunks: any[], fileSize: number, expectedCount?: number): any {
  const issues: string[] = [];
  
  // 计算分片总大小
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  
  // 检查分片总大小是否等于文件大小
  if (totalSize !== fileSize) {
    issues.push(`分片总大小(${totalSize})与文件大小(${fileSize})不一致`);
  }
  
  // 检查分片数量
  if (expectedCount && chunks.length !== expectedCount) {
    issues.push(`分片数量(${chunks.length})与预期数量(${expectedCount})不一致`);
  }
  
  // 检查分片索引连续性
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].index !== i) {
      issues.push(`分片索引不连续，期望索引${i}，实际索引${chunks[i].index}`);
    }
  }
  
  // 检查分片范围是否覆盖整个文件
  let coveredRanges: [number, number][] = [];
  chunks.forEach(chunk => {
    coveredRanges.push([chunk.start, chunk.end]);
  });
  
  // 排序分片范围
  coveredRanges.sort((a, b) => a[0] - b[0]);
  
  // 检查范围连续性
  let expectedStart = 0;
  for (const [start, end] of coveredRanges) {
    if (start !== expectedStart) {
      issues.push(`分片范围不连续，在位置${expectedStart}有间隙`);
    }
    expectedStart = end;
  }
  
  // 确保最后一个分片结束于文件大小
  if (coveredRanges.length > 0 && coveredRanges[coveredRanges.length - 1][1] !== fileSize) {
    issues.push(`最后一个分片结束位置(${coveredRanges[coveredRanges.length - 1][1]})不等于文件大小(${fileSize})`);
  }
  
  // 检查分片大小是否合理
  const chunkSizes = chunks.map(chunk => chunk.size);
  const avgChunkSize = totalSize / chunks.length;
  const sizeVariance = calculateVariance(chunkSizes);
  
  // 如果分片大小方差过大，可能是分片划分不均匀
  if (sizeVariance / avgChunkSize > 0.5) {
    issues.push(`分片大小差异过大，可能影响上传稳定性`);
  }
  
  return {
    valid: issues.length === 0,
    issues,
    totalSize,
    chunkCount: chunks.length,
    sizeStats: {
      min: Math.min(...chunkSizes),
      max: Math.max(...chunkSizes),
      avg: avgChunkSize,
      variance: sizeVariance
    }
  };
}

/**
 * 计算方差
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(val => (val - avg) ** 2);
  return squareDiffs.reduce((sum, sq) => sum + sq, 0) / values.length;
}

/**
 * 获取分片处理进度
 */
function handleGetProgress(taskId: string, data: any): void {
  const progress = progressTracker[taskId] || {
    totalChunks: 0,
    processedChunks: 0,
    startTime: Date.now()
  };
  
  // 计算进度百分比和估计剩余时间
  const percent = progress.totalChunks > 0 
    ? (progress.processedChunks / progress.totalChunks) * 100 
    : 0;
    
  // 计算估计剩余时间
  let estimatedTimeRemaining = null;
  if (progress.totalChunks > 0 && progress.processedChunks > 0) {
    const elapsedTime = Date.now() - progress.startTime;
    
    if (progress.averageSpeed && progress.bytesProcessed) {
      // 如果有平均速度和已处理字节数，使用这些计算
      const totalBytes = data.fileSize || (progress.bytesProcessed / (progress.processedChunks / progress.totalChunks));
      const remainingBytes = totalBytes - progress.bytesProcessed;
      
      if (progress.averageSpeed > 0) {
        estimatedTimeRemaining = remainingBytes / progress.averageSpeed * 1000;
      }
    } else {
      // 回退到基于处理分片数量的估算
      const chunkTimeAvg = elapsedTime / progress.processedChunks;
      estimatedTimeRemaining = chunkTimeAvg * (progress.totalChunks - progress.processedChunks);
    }
  }
  
  sendSuccess(taskId, {
    taskId: data.originalTaskId || taskId,
    percent,
    processed: progress.processedChunks,
    total: progress.totalChunks,
    bytesProcessed: progress.bytesProcessed,
    currentSpeed: progress.currentSpeed,
    averageSpeed: progress.averageSpeed,
    estimatedTimeRemaining,
    elapsedTime: Date.now() - progress.startTime
  });
}

/**
 * 发送进度更新
 */
function sendProgressUpdate(taskId: string, progress: ProgressTracker): void {
  const percent = progress.totalChunks > 0 
    ? (progress.processedChunks / progress.totalChunks) * 100 
    : 0;
    
  // 计算估计剩余时间
  let estimatedTimeRemaining = null;
  if (progress.totalChunks > 0 && progress.processedChunks > 0) {
    if (progress.averageSpeed && progress.bytesProcessed) {
      // 如果有平均速度和已处理字节数，使用这些计算
      const totalBytes = progress.bytesProcessed / (progress.processedChunks / progress.totalChunks);
      const remainingBytes = totalBytes - progress.bytesProcessed;
      
      if (progress.averageSpeed > 0) {
        estimatedTimeRemaining = remainingBytes / progress.averageSpeed * 1000;
      }
    } else {
      // 回退到基于处理分片数量的估算
      const elapsedTime = Date.now() - progress.startTime;
      const chunkTimeAvg = elapsedTime / progress.processedChunks;
      estimatedTimeRemaining = chunkTimeAvg * (progress.totalChunks - progress.processedChunks);
    }
  }
    
  self.postMessage({
    type: 'progress',
    taskId,
    data: {
      percent,
      processed: progress.processedChunks,
      total: progress.totalChunks,
      bytesProcessed: progress.bytesProcessed,
      currentSpeed: progress.currentSpeed,
      averageSpeed: progress.averageSpeed,
      estimatedTimeRemaining
    }
  });
}

/**
 * 处理网络状况更新
 */
function handleUpdateNetworkAssessment(taskId: string, assessment: NetworkAssessment): void {
  // 保存网络评估结果
  lastNetworkAssessment = assessment;
  
  // 确认接收
  sendSuccess(taskId, {
    received: true,
    timestamp: Date.now()
  });
}

/**
 * 处理环境配置更新
 */
function handleUpdateEnvironmentConfig(taskId: string, config: any): void {
  // 更新环境配置
  environmentConfig = {
    ...environmentConfig,
    ...config
  };
  
  // 确认接收
  sendSuccess(taskId, {
    updated: true,
    currentConfig: environmentConfig
  });
}

/**
 * 处理分片验证
 */
function handleValidateChunks(taskId: string, data: any): void {
  try {
    const { chunks, fileSize, expectedCount } = data;
    
    // 校验分片列表
    const validationResult = validateChunkList(chunks, fileSize, expectedCount);
    
    // 发送结果
    sendSuccess(taskId, validationResult);
  } catch (error) {
    sendError(taskId, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 处理ping请求
 */
function handlePing(taskId: string): void {
  sendSuccess(taskId, { 
    status: 'ok', 
    timestamp: Date.now(),
    memory: getMemoryUsage(),
    workerStatus: {
      activeTasksCount: Object.keys(progressTracker).length,
      networkStatus: lastNetworkAssessment?.condition || 'unknown'
    }
  });
}

/**
 * 获取Worker内存使用情况
 */
function getMemoryUsage(): any {
  // 在支持performance.memory的环境中获取内存使用情况
  if (typeof performance !== 'undefined' && performance.memory) {
    return {
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      usedJSHeapSize: performance.memory.usedJSHeapSize
    };
  }
  return null;
}

/**
 * 简单哈希函数（用于示例）
 */
function simpleHash(data: ArrayBuffer): string {
  const view = new Uint8Array(data);
  let hash = 0;
  
  // 只处理部分数据以提高性能
  const step = Math.max(1, Math.floor(view.length / 1000));
  
  for (let i = 0; i < view.length; i += step) {
    hash = ((hash << 5) - hash) + view[i];
    hash |= 0; // 转为32位整数
  }
  
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * 发送成功响应
 */
function sendSuccess(taskId: string, result: any): void {
  self.postMessage({
    taskId,
    success: true,
    result
  });
}

/**
 * 发送错误响应
 */
function sendError(taskId: string, error: string): void {
  self.postMessage({
    taskId,
    success: false,
    error
  });
}

/**
 * 估算上传时间（秒）
 */
function calculateEstimatedUploadTime(
  fileSize: number, 
  chunkSize: number, 
  networkCondition: string,
  devicePerformance: string
): number {
  // 根据网络状况估算上传速度（字节/秒）
  let estimatedSpeed: number;
  
  if (lastNetworkAssessment) {
    // 使用最近的网络评估结果
    estimatedSpeed = lastNetworkAssessment.averageSpeed;
  } else {
    // 使用默认估算
    switch (networkCondition) {
      case 'slow':
        estimatedSpeed = 50 * 1024; // 50 KB/s
        break;
      case 'fast':
        estimatedSpeed = 2 * 1024 * 1024; // 2 MB/s
        break;
      default: // normal
        estimatedSpeed = 500 * 1024; // 500 KB/s
    }
  }
  
  // 根据设备性能调整
  switch (devicePerformance) {
    case 'low':
      estimatedSpeed *= 0.8; // 低性能设备可能处理较慢
      break;
    case 'high':
      estimatedSpeed *= 1.2; // 高性能设备可能处理较快
      break;
  }
  
  // 计算预估时间（秒）
  return fileSize / estimatedSpeed;
}

/**
 * 计算上传成功概率
 */
function calculateSuccessProbability(
  chunkSize: number, 
  networkCondition: string
): number {
  // 基础成功概率
  let baseProbability = 0.95;
  
  // 根据分片大小调整
  if (chunkSize > 10 * 1024 * 1024) {
    baseProbability -= 0.1; // 大分片失败概率高
  } else if (chunkSize < 1 * 1024 * 1024) {
    baseProbability += 0.03; // 小分片成功概率高
  }
  
  // 根据网络状况调整
  switch (networkCondition) {
    case 'slow':
      baseProbability -= 0.15; // 慢网络失败概率高
      break;
    case 'fast':
      baseProbability += 0.04; // 快网络成功概率高
      break;
  }
  
  // 如果有网络评估数据，根据稳定性调整
  if (lastNetworkAssessment) {
    baseProbability += (lastNetworkAssessment.stability - 0.5) * 0.1;
  }
  
  // 确保概率在合理范围内
  return Math.max(0.5, Math.min(0.99, baseProbability));
}

/**
 * 推荐并发数
 */
function recommendConcurrency(
  networkCondition: string, 
  devicePerformance: string
): number {
  // 基础并发数
  let baseConcurrency = 3;
  
  // 根据网络状况调整
  switch (networkCondition) {
    case 'slow':
      baseConcurrency = 2; // 慢网络使用较低并发
      break;
    case 'fast':
      baseConcurrency = 6; // 快网络可以使用较高并发
      break;
  }
  
  // 根据设备性能调整
  switch (devicePerformance) {
    case 'low':
      baseConcurrency = Math.max(1, baseConcurrency - 1); // 低性能设备降低并发
      break;
    case 'high':
      baseConcurrency += 2; // 高性能设备可以增加并发
      break;
  }
  
  // 考虑环境配置的最大并发限制
  return Math.min(baseConcurrency, environmentConfig.maxConcurrency);
}

/**
 * 推荐重试策略
 */
function recommendRetryStrategy(networkCondition: string): {
  maxRetries: number;
  backoffFactor: number;
  initialDelay: number;
} {
  switch (networkCondition) {
    case 'slow':
      // 慢网络使用更多重试次数和较长延迟
      return {
        maxRetries: 5,
        backoffFactor: 2,
        initialDelay: 2000
      };
    case 'fast':
      // 快网络使用较少重试次数和较短延迟
      return {
        maxRetries: 2,
        backoffFactor: 1.5,
        initialDelay: 500
      };
    default:
      // 普通网络使用中等策略
      return {
        maxRetries: 3,
        backoffFactor: 1.5,
        initialDelay: 1000
      };
  }
}

/**
 * 推荐缓存策略
 */
function recommendCacheStrategy(fileSize: number, chunkSize: number): {
  cacheChunks: boolean;
  maxCachedChunks: number;
  persistCache: boolean;
} {
  const chunkCount = Math.ceil(fileSize / chunkSize);
  
  // 大文件，缓存一部分分片
  if (fileSize > 100 * 1024 * 1024) {
    return {
      cacheChunks: true,
      maxCachedChunks: Math.min(10, Math.ceil(chunkCount * 0.1)),
      persistCache: true
    };
  }
  // 中等文件，根据分片数量决定
  else if (fileSize > 10 * 1024 * 1024) {
    return {
      cacheChunks: true,
      maxCachedChunks: Math.min(20, Math.ceil(chunkCount * 0.2)),
      persistCache: chunkCount > 10
    };
  }
  // 小文件，可以完全缓存
  else {
    return {
      cacheChunks: true,
      maxCachedChunks: chunkCount,
      persistCache: false
    };
  }
}

// 发送就绪消息
self.postMessage({ type: 'READY' }); 