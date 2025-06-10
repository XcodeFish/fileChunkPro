/**
 * ResumeStateManager - 断点续传状态管理器
 *
 * 负责上传状态的变更、追踪和管理
 */

import { Logger } from '../utils/Logger';
import { EventBus } from '../core/EventBus';
import {
  ResumeData,
  ChunkMeta,
  ChunkStatus,
  UploadStatus,
} from '../types/resume';

/**
 * 断点续传状态管理器选项
 */
export interface ResumeStateManagerOptions {
  /** 实例ID */
  instanceId: string;
  /** 要保存的分片元数据字段 */
  chunkMetaFields?: string[];
  /** 是否校验分片完整性 */
  validateChunks?: boolean;
  /** 数据过期时间(毫秒) */
  expirationTime?: number;
}

/**
 * 断点续传状态管理器
 * 管理文件上传状态、分片状态及进度
 */
export class ResumeStateManager {
  private logger: Logger;
  private eventBus: EventBus;
  private options: Required<ResumeStateManagerOptions>;
  private resumeDataMap: Map<string, ResumeData> = new Map();
  private sessionFiles: Set<string> = new Set();

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options: ResumeStateManagerOptions) {
    this.logger = new Logger('ResumeStateManager');
    this.eventBus = EventBus.getInstance();

    // 设置默认选项
    this.options = {
      instanceId: options.instanceId,
      chunkMetaFields: options.chunkMetaFields || [
        'index',
        'start',
        'end',
        'size',
        'md5',
      ],
      validateChunks:
        options.validateChunks !== undefined ? options.validateChunks : true,
      expirationTime: options.expirationTime || 7 * 24 * 60 * 60 * 1000, // 默认7天
    };
  }

  /**
   * 创建新的上传状态
   */
  public createResumeData(
    fileId: string,
    file: File,
    chunks: any[]
  ): ResumeData {
    const resumeData: ResumeData = {
      fileId,
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalChunks: chunks.length,
      uploadedChunks: [],
      chunkMeta: this.extractChunkMeta(chunks),
      status: UploadStatus.PENDING,
      progress: 0,
      uploadedSize: 0,
      sessionId: this.options.instanceId,
      customData: {},
    };

    this.resumeDataMap.set(fileId, resumeData);
    this.sessionFiles.add(fileId);

    this.logger.debug('创建新的上传状态', { fileId, fileName: file.name });
    return resumeData;
  }

  /**
   * 更新已上传分片信息
   */
  public updateChunkStatus(
    fileId: string,
    chunkIndex: number,
    status: ChunkStatus,
    responseData?: any
  ): boolean {
    const resumeData = this.resumeDataMap.get(fileId);
    if (!resumeData) {
      return false;
    }

    // 更新已上传分片信息
    const existingIndex = resumeData.uploadedChunks.findIndex(
      chunk => chunk.index === chunkIndex
    );

    if (existingIndex >= 0) {
      // 更新已存在的分片信息
      resumeData.uploadedChunks[existingIndex] = {
        index: chunkIndex,
        status,
        uploadedAt: Date.now(),
        responseData,
      };
    } else {
      // 添加新的分片信息
      resumeData.uploadedChunks.push({
        index: chunkIndex,
        status,
        uploadedAt: Date.now(),
        responseData,
      });
    }

    // 更新上传进度
    this.updateProgress(fileId);

    return true;
  }

  /**
   * 更新上传进度
   */
  private updateProgress(fileId: string): void {
    const resumeData = this.resumeDataMap.get(fileId);
    if (!resumeData) return;

    // 计算已上传的分片数量
    const uploadedChunksCount = resumeData.uploadedChunks.filter(
      chunk => chunk.status === ChunkStatus.UPLOADED
    ).length;

    // 更新进度
    resumeData.progress = uploadedChunksCount / resumeData.totalChunks;
    resumeData.uploadedSize = this.calculateUploadedSize(resumeData);
    resumeData.updatedAt = Date.now();

    // 如果全部分片都已上传，将状态设为完成
    if (uploadedChunksCount === resumeData.totalChunks) {
      resumeData.status = UploadStatus.COMPLETED;
    } else if (
      resumeData.status !== UploadStatus.PAUSED &&
      resumeData.status !== UploadStatus.ERROR
    ) {
      resumeData.status = UploadStatus.UPLOADING;
    }
  }

  /**
   * 计算已上传大小
   */
  private calculateUploadedSize(resumeData: ResumeData): number {
    let uploadedSize = 0;

    // 遍历已上传的分片
    for (const uploadedChunk of resumeData.uploadedChunks) {
      if (
        uploadedChunk.status === ChunkStatus.UPLOADED &&
        resumeData.chunkMeta &&
        uploadedChunk.index < resumeData.chunkMeta.length
      ) {
        // 获取分片大小
        const chunkSize = resumeData.chunkMeta[uploadedChunk.index].size;
        uploadedSize += chunkSize;
      }
    }

    return uploadedSize;
  }

  /**
   * 更新上传状态
   */
  public updateStatus(
    fileId: string,
    status: UploadStatus,
    error?: any
  ): boolean {
    const resumeData = this.resumeDataMap.get(fileId);
    if (!resumeData) {
      return false;
    }

    resumeData.status = status;
    resumeData.updatedAt = Date.now();

    // 如果有错误信息，保存错误信息
    if (error && status === UploadStatus.ERROR) {
      resumeData.error = {
        message: error.message || '上传失败',
        code: error.code,
        timestamp: Date.now(),
      };
    }

    this.logger.debug('更新上传状态', { fileId, status });
    return true;
  }

  /**
   * 更新上传响应
   */
  public updateResponse(fileId: string, response: any): boolean {
    const resumeData = this.resumeDataMap.get(fileId);
    if (!resumeData) {
      return false;
    }

    resumeData.responseData = response;
    resumeData.updatedAt = Date.now();
    return true;
  }

  /**
   * 设置自定义数据
   */
  public setCustomData(fileId: string, key: string, value: any): boolean {
    const resumeData = this.resumeDataMap.get(fileId);
    if (!resumeData) {
      return false;
    }

    if (!resumeData.customData) {
      resumeData.customData = {};
    }

    resumeData.customData[key] = value;
    resumeData.updatedAt = Date.now();
    return true;
  }

  /**
   * 获取自定义数据
   */
  public getCustomData(fileId: string, key: string): any {
    const resumeData = this.resumeDataMap.get(fileId);
    if (!resumeData || !resumeData.customData) {
      return null;
    }

    return resumeData.customData[key] !== undefined
      ? resumeData.customData[key]
      : null;
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

      // 添加配置中指定的其他元数据字段
      for (const field of this.options.chunkMetaFields) {
        if (
          field !== 'index' &&
          field !== 'start' &&
          field !== 'end' &&
          field !== 'size'
        ) {
          if (field in chunk) {
            (meta as any)[field] = (chunk as any)[field];
          }
        }
      }

      return meta;
    });
  }

  /**
   * 校验恢复数据有效性
   */
  public isResumeDataValid(
    resumeData: ResumeData,
    file: File,
    chunks: any[]
  ): boolean {
    // 检查基本信息是否匹配
    if (
      resumeData.fileSize !== file.size ||
      resumeData.lastModified !== file.lastModified ||
      resumeData.fileName !== file.name
    ) {
      this.logger.debug('恢复数据与文件不匹配', {
        expected: {
          fileSize: file.size,
          lastModified: file.lastModified,
          fileName: file.name,
        },
        actual: {
          fileSize: resumeData.fileSize,
          lastModified: resumeData.lastModified,
          fileName: resumeData.fileName,
        },
      });
      return false;
    }

    // 检查分片数量是否匹配
    if (resumeData.totalChunks !== chunks.length) {
      this.logger.debug('分片数量不匹配', {
        expected: chunks.length,
        actual: resumeData.totalChunks,
      });
      return false;
    }

    // 如果需要校验分片完整性
    if (this.options.validateChunks && resumeData.chunkMeta) {
      // 检查分片元数据是否匹配
      const currentChunkMeta = this.extractChunkMeta(chunks);

      for (let i = 0; i < currentChunkMeta.length; i++) {
        const current = currentChunkMeta[i];
        const saved = resumeData.chunkMeta[i];

        if (
          !saved ||
          current.size !== saved.size ||
          current.start !== saved.start ||
          current.end !== saved.end
        ) {
          this.logger.debug('分片元数据不匹配', {
            index: i,
            expected: current,
            actual: saved,
          });
          return false;
        }
      }
    }

    // 检查数据是否过期
    const now = Date.now();
    if (now - resumeData.updatedAt > this.options.expirationTime) {
      this.logger.debug('恢复数据已过期', {
        updatedAt: new Date(resumeData.updatedAt).toISOString(),
        expirationTime: `${this.options.expirationTime / (24 * 60 * 60 * 1000)}天`,
      });
      return false;
    }

    return true;
  }

  /**
   * 应用恢复数据到当前上传
   */
  public applyResumeData(resumeData: ResumeData, chunks: any[]): void {
    // 将恢复数据加入状态管理
    this.resumeDataMap.set(resumeData.fileId, resumeData);
    this.sessionFiles.add(resumeData.fileId);

    // 遍历已上传的分片
    for (const uploadedChunk of resumeData.uploadedChunks) {
      const { index, status } = uploadedChunk;

      // 只处理已成功上传的分片
      if (status === ChunkStatus.UPLOADED && index < chunks.length) {
        // 标记分片为已上传
        chunks[index].uploaded = true;
      }
    }

    this.logger.debug('应用恢复数据', {
      fileId: resumeData.fileId,
      uploadedChunks: resumeData.uploadedChunks.length,
    });
  }

  /**
   * 获取上传状态
   */
  public getUploadStatus(fileId: string): UploadStatus | null {
    const resumeData = this.resumeDataMap.get(fileId);
    return resumeData ? resumeData.status : null;
  }

  /**
   * 获取上传进度
   */
  public getUploadProgress(fileId: string): number {
    const resumeData = this.resumeDataMap.get(fileId);
    return resumeData ? resumeData.progress : 0;
  }

  /**
   * 获取已上传分片
   */
  public getUploadedChunks(fileId: string): number[] {
    const resumeData = this.resumeDataMap.get(fileId);
    if (!resumeData) {
      return [];
    }

    return resumeData.uploadedChunks
      .filter(chunk => chunk.status === ChunkStatus.UPLOADED)
      .map(chunk => chunk.index);
  }

  /**
   * 获取恢复数据
   */
  public getResumeData(fileId: string): ResumeData | null {
    return this.resumeDataMap.get(fileId) || null;
  }

  /**
   * 检查文件是否在当前会话
   */
  public isInCurrentSession(fileId: string): boolean {
    return this.sessionFiles.has(fileId);
  }

  /**
   * 设置文件到当前会话
   */
  public addToCurrentSession(fileId: string): void {
    this.sessionFiles.add(fileId);
  }

  /**
   * 设置恢复数据
   */
  public setResumeData(fileId: string, resumeData: ResumeData): void {
    this.resumeDataMap.set(fileId, resumeData);
  }

  /**
   * 移除恢复数据
   */
  public removeResumeData(fileId: string): void {
    this.resumeDataMap.delete(fileId);
    this.sessionFiles.delete(fileId);
  }

  /**
   * 清空所有恢复数据
   */
  public clearAllResumeData(): void {
    this.resumeDataMap.clear();
    this.sessionFiles.clear();
  }

  /**
   * 获取所有恢复数据
   */
  public getAllResumeData(): Map<string, ResumeData> {
    return this.resumeDataMap;
  }
}

export default ResumeStateManager;
