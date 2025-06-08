/**
 * ChunkPlugin - 分片处理插件
 * 负责实现基础分片策略，固定大小分片，分片生成与管理
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, ChunkInfo } from '../types';
import { MemoryManager } from '../utils/MemoryManager';

// 定义通用文件接口，兼容File和小程序文件对象
interface IFileObject {
  size: number;
  name: string;
  type?: string;
  path?: string;
  slice?: (start: number, end: number) => Blob;
}

interface ChunkPluginOptions {
  chunkSize?: number | 'auto'; // 分片大小，'auto'表示自动计算
  generateFileId?: (file: IFileObject) => Promise<string>; // 自定义生成文件ID的方法
  maxParallelChunkGeneration?: number; // 并行生成分片的最大数量
}

/**
 * 分片处理插件，实现文件分片策略
 */
export class ChunkPlugin implements IPlugin {
  private options: ChunkPluginOptions;
  private uploader: UploaderCore | null = null;

  /**
   * 创建分片处理插件实例
   * @param options 分片插件选项
   */
  constructor(options: ChunkPluginOptions = {}) {
    this.options = {
      chunkSize: 'auto',
      maxParallelChunkGeneration: 1,
      ...options,
    };
  }

  /**
   * 插件安装方法
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this.uploader = uploader;

    // 注册钩子，在文件上传前处理分片
    uploader.hooks?.beforeUpload?.tap(
      'ChunkPlugin',
      this.onBeforeUpload.bind(this)
    );
  }

  /**
   * 在上传前处理文件分片
   * @param _file 待上传文件
   * @returns 处理后的结果
   */
  private async onBeforeUpload(_file: IFileObject): Promise<void> {
    // 分片处理逻辑将在实际上传过程中调用
    return;
  }

  /**
   * 创建文件分片
   * @param file 待分片文件
   * @returns 分片信息数组
   */
  public async createChunks(file: IFileObject): Promise<ChunkInfo[]> {
    const fileSize = file.size;
    // 获取最优分片大小
    const chunkSize = this.getOptimalChunkSize(fileSize);

    const chunks: ChunkInfo[] = [];
    const chunkCount = Math.ceil(fileSize / chunkSize);

    // 创建分片信息
    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(fileSize, start + chunkSize);

      chunks.push({
        index: i,
        start,
        end,
        size: end - start,
        fileSize,
      });
    }

    return chunks;
  }

  /**
   * 获取文件分片
   * @param file 文件对象
   * @param chunkInfo 分片信息
   * @returns 文件分片数据
   */
  public async getChunkData(
    file: IFileObject,
    chunkInfo: ChunkInfo
  ): Promise<ArrayBuffer | Blob> {
    const { start, end } = chunkInfo;

    // 浏览器环境
    if (file instanceof File || file instanceof Blob) {
      return file.slice(start, end);
    }

    // 小程序环境或其他环境，通过适配器读取
    if (this.uploader && this.uploader.adapter?.readChunk) {
      return await this.uploader.adapter.readChunk(
        file.path || file.name,
        start,
        chunkInfo.size
      );
    }

    throw new Error('无法读取文件分片，不支持的文件类型');
  }

  /**
   * 获取最优分片大小
   * @param fileSize 文件大小
   * @returns 最优分片大小
   */
  private getOptimalChunkSize(fileSize: number): number {
    const preferredSize =
      typeof this.options.chunkSize === 'number' ? this.options.chunkSize : 0;

    // 使用内存管理器获取最优分片大小
    if (
      MemoryManager &&
      typeof MemoryManager.getOptimalChunkSize === 'function'
    ) {
      return MemoryManager.getOptimalChunkSize(fileSize, preferredSize);
    }

    // 回退到基础逻辑
    if (preferredSize > 0) {
      return preferredSize;
    }

    // 根据文件大小动态调整
    if (fileSize < 10 * 1024 * 1024) {
      return 1 * 1024 * 1024; // <10MB: 使用1MB分片
    } else if (fileSize < 100 * 1024 * 1024) {
      return 5 * 1024 * 1024; // <100MB: 使用5MB分片
    } else if (fileSize < 1024 * 1024 * 1024) {
      return 10 * 1024 * 1024; // <1GB: 使用10MB分片
    } else {
      return 20 * 1024 * 1024; // >1GB: 使用20MB分片
    }
  }
}
