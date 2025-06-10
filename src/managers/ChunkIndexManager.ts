/**
 * ChunkIndexManager - 分片索引管理器
 *
 * 负责管理和优化分片上传顺序、优先级和依赖关系
 */

import { Logger } from '../utils/Logger';
import { TaskScheduler } from '../core/TaskScheduler';
import { EventBus } from '../core/EventBus';
import { ChunkMeta, ChunkStatus, ResumeData } from '../types/resume';
import { TaskPriority } from '../types';

/**
 * 分片索引管理器选项
 */
export interface ChunkIndexManagerOptions {
  /** 是否启用优先级调度 */
  enablePriorityScheduling?: boolean;
  /** 首个分片优先级 */
  firstChunkPriority?: TaskPriority;
  /** 末尾分片优先级 */
  lastChunkPriority?: TaskPriority;
  /** 元数据分片优先级 */
  metadataChunkPriority?: TaskPriority;
  /** 重试分片优先级递增值 */
  retryPriorityIncrement?: number;
}

/**
 * 分片索引管理器
 * 管理上传分片的索引、优先级和调度顺序
 */
export class ChunkIndexManager {
  private logger: Logger;
  private eventBus: EventBus;
  private taskScheduler: TaskScheduler | null = null;
  private options: Required<ChunkIndexManagerOptions>;
  private chunkMetaMap: Map<string, ChunkMeta[]> = new Map();
  private chunkStatusMap: Map<string, Map<number, ChunkStatus>> = new Map();

  /**
   * 构造函数
   * @param taskScheduler 任务调度器实例
   * @param options 配置选项
   */
  constructor(
    taskScheduler: TaskScheduler | null = null,
    options: ChunkIndexManagerOptions = {}
  ) {
    this.logger = new Logger('ChunkIndexManager');
    this.eventBus = EventBus.getInstance();
    this.taskScheduler = taskScheduler;

    // 默认配置
    this.options = {
      enablePriorityScheduling:
        options.enablePriorityScheduling !== undefined
          ? options.enablePriorityScheduling
          : true,
      firstChunkPriority: options.firstChunkPriority ?? TaskPriority.HIGH,
      lastChunkPriority: options.lastChunkPriority ?? TaskPriority.HIGH,
      metadataChunkPriority:
        options.metadataChunkPriority ?? TaskPriority.CRITICAL,
      retryPriorityIncrement: options.retryPriorityIncrement ?? 1,
    };
  }

  /**
   * 注册文件分片
   * @param fileId 文件ID
   * @param chunks 分片列表
   */
  public registerFileChunks(fileId: string, chunks: any[]): void {
    // 提取分片元数据
    const chunkMeta = this.extractChunkMeta(chunks);
    this.chunkMetaMap.set(fileId, chunkMeta);

    // 初始化分片状态
    const statusMap = new Map<number, ChunkStatus>();
    for (let i = 0; i < chunks.length; i++) {
      statusMap.set(i, ChunkStatus.PENDING);
    }
    this.chunkStatusMap.set(fileId, statusMap);

    this.logger.debug('注册文件分片', {
      fileId,
      totalChunks: chunks.length,
    });
  }

  /**
   * 提取分片元数据
   */
  private extractChunkMeta(chunks: any[]): ChunkMeta[] {
    return chunks.map((chunk, index) => {
      const meta: ChunkMeta = {
        index,
        start: chunk.start,
        end: chunk.end,
        size: chunk.end - chunk.start,
      };

      // 如果有MD5值，添加到元数据
      if ('md5' in chunk) {
        meta.md5 = chunk.md5;
      }

      return meta;
    });
  }

  /**
   * 应用恢复数据
   * @param fileId 文件ID
   * @param resumeData 恢复数据
   */
  public applyResumeData(fileId: string, resumeData: ResumeData): void {
    // 恢复分片元数据
    if (resumeData.chunkMeta && resumeData.chunkMeta.length > 0) {
      this.chunkMetaMap.set(fileId, resumeData.chunkMeta);
    }

    // 初始化分片状态
    const statusMap = new Map<number, ChunkStatus>();
    for (let i = 0; i < resumeData.totalChunks; i++) {
      statusMap.set(i, ChunkStatus.PENDING);
    }

    // 更新上传成功的分片状态
    for (const chunk of resumeData.uploadedChunks) {
      if (chunk.status === ChunkStatus.UPLOADED) {
        statusMap.set(chunk.index, ChunkStatus.UPLOADED);
      }
    }

    this.chunkStatusMap.set(fileId, statusMap);

    this.logger.debug('应用恢复数据', {
      fileId,
      totalChunks: resumeData.totalChunks,
      uploadedChunks: resumeData.uploadedChunks.length,
    });
  }

  /**
   * 更新分片状态
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   * @param status 分片状态
   */
  public updateChunkStatus(
    fileId: string,
    chunkIndex: number,
    status: ChunkStatus
  ): boolean {
    const statusMap = this.chunkStatusMap.get(fileId);
    if (!statusMap) {
      return false;
    }

    statusMap.set(chunkIndex, status);
    return true;
  }

  /**
   * 获取分片状态
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   */
  public getChunkStatus(
    fileId: string,
    chunkIndex: number
  ): ChunkStatus | null {
    const statusMap = this.chunkStatusMap.get(fileId);
    if (!statusMap) {
      return null;
    }

    return statusMap.get(chunkIndex) || null;
  }

  /**
   * 获取已上传分片索引列表
   * @param fileId 文件ID
   */
  public getUploadedChunks(fileId: string): number[] {
    const statusMap = this.chunkStatusMap.get(fileId);
    if (!statusMap) {
      return [];
    }

    const uploadedChunks: number[] = [];
    for (const [index, status] of statusMap.entries()) {
      if (status === ChunkStatus.UPLOADED) {
        uploadedChunks.push(index);
      }
    }

    return uploadedChunks;
  }

  /**
   * 获取待上传分片索引列表
   * @param fileId 文件ID
   */
  public getPendingChunks(fileId: string): number[] {
    const statusMap = this.chunkStatusMap.get(fileId);
    if (!statusMap) {
      return [];
    }

    const pendingChunks: number[] = [];
    for (const [index, status] of statusMap.entries()) {
      if (status === ChunkStatus.PENDING) {
        pendingChunks.push(index);
      }
    }

    return pendingChunks;
  }

  /**
   * 计算分片优先级
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   * @param metadata 任务元数据
   */
  public calculateChunkPriority(
    fileId: string,
    chunkIndex: number,
    metadata?: any
  ): TaskPriority {
    // 如果未启用优先级调度，返回普通优先级
    if (!this.options.enablePriorityScheduling || !this.taskScheduler) {
      return TaskPriority.NORMAL;
    }

    const statusMap = this.chunkStatusMap.get(fileId);
    if (!statusMap) {
      return TaskPriority.NORMAL;
    }

    const totalChunks = statusMap.size;

    // 计算基本优先级
    let priority = TaskPriority.NORMAL;

    // 首个分片
    if (chunkIndex === 0) {
      priority = this.options.firstChunkPriority;
    }
    // 最后一个分片
    else if (chunkIndex === totalChunks - 1) {
      priority = this.options.lastChunkPriority;
    }

    // 元数据分片
    if (metadata?.isMetadata) {
      priority = this.options.metadataChunkPriority;
    }

    // 重试分片
    if (metadata?.retryCount && metadata.retryCount > 0) {
      priority = Math.min(
        priority + metadata.retryCount * this.options.retryPriorityIncrement,
        TaskPriority.CRITICAL
      );
    }

    return priority;
  }

  /**
   * 获取最优上传顺序
   * @param fileId 文件ID
   */
  public getOptimalUploadOrder(fileId: string): number[] {
    const pendingChunks = this.getPendingChunks(fileId);
    const statusMap = this.chunkStatusMap.get(fileId);

    if (!statusMap || pendingChunks.length === 0) {
      return [];
    }

    const totalChunks = statusMap.size;

    // 基于优先级排序
    const orderedChunks = [...pendingChunks].sort((a, b) => {
      // 首块优先
      if (a === 0) return -1;
      if (b === 0) return 1;

      // 末块次优先
      if (a === totalChunks - 1) return -1;
      if (b === totalChunks - 1) return 1;

      // 其他分片按索引顺序
      return a - b;
    });

    return orderedChunks;
  }

  /**
   * 检查分片是否均已上传
   * @param fileId 文件ID
   */
  public areAllChunksUploaded(fileId: string): boolean {
    const statusMap = this.chunkStatusMap.get(fileId);
    if (!statusMap) {
      return false;
    }

    for (const status of statusMap.values()) {
      if (status !== ChunkStatus.UPLOADED) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取上传进度
   * @param fileId 文件ID
   */
  public getUploadProgress(fileId: string): number {
    const statusMap = this.chunkStatusMap.get(fileId);
    if (!statusMap || statusMap.size === 0) {
      return 0;
    }

    let uploadedCount = 0;
    for (const status of statusMap.values()) {
      if (status === ChunkStatus.UPLOADED) {
        uploadedCount++;
      }
    }

    return uploadedCount / statusMap.size;
  }

  /**
   * 获取分片元数据
   * @param fileId 文件ID
   */
  public getChunkMeta(fileId: string): ChunkMeta[] | null {
    return this.chunkMetaMap.get(fileId) || null;
  }

  /**
   * 清理文件数据
   * @param fileId 文件ID
   */
  public cleanupFile(fileId: string): void {
    this.chunkMetaMap.delete(fileId);
    this.chunkStatusMap.delete(fileId);
  }

  /**
   * 清理所有数据
   */
  public cleanupAll(): void {
    this.chunkMetaMap.clear();
    this.chunkStatusMap.clear();
  }
}

export default ChunkIndexManager;
