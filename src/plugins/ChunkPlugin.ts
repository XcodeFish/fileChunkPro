/**
 * ChunkPlugin - 分片处理插件
 * 负责实现基础分片策略，固定大小分片，分片生成与管理
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, ChunkInfo, UploadFile, ChunkData } from '../types';
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
  useStreams?: boolean; // 是否使用流式处理
}

/**
 * 分片处理插件，实现文件分片策略
 */
export class ChunkPlugin implements IPlugin {
  private readonly name = 'ChunkPlugin';
  private core: UploaderCore | null = null;
  private chunkSize: number | 'auto';
  private useStreams: boolean;
  private streamChunkSize: number = 2 * 1024 * 1024; // 2MB
  private readonly MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MIN_CHUNK_SIZE = 512 * 1024; // 512KB

  /**
   * 创建分片处理插件实例
   * @param options 分片插件选项
   */
  constructor(options: ChunkPluginOptions = {}) {
    this.chunkSize = options.chunkSize || 'auto';
    this.useStreams =
      options.useStreams !== undefined
        ? options.useStreams
        : typeof ReadableStream !== 'undefined'; // 如果支持流API则默认启用
  }

  /**
   * 插件安装方法
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this.core = uploader;

    // 注册钩子，在文件上传前处理分片
    uploader.hook('beforeUpload', this.handleBeforeUpload.bind(this));
    uploader.hook('beforeChunk', this.handleBeforeChunk.bind(this));
    uploader.hook('dispose', this.handleDispose.bind(this));
  }

  /**
   * 处理上传前钩子
   * @param file 上传文件
   * @returns 处理后的文件
   */
  private async handleBeforeUpload(file: UploadFile): Promise<UploadFile> {
    // 检查文件大小，判断是否需要分片和计算最佳分片大小
    if (!file.size || file.size <= 0) {
      throw new Error('文件大小无效');
    }

    // 确定分片大小
    const optimalChunkSize = this.getOptimalChunkSize(file.size);

    // 将分片大小保存到文件元数据
    file.meta = {
      ...file.meta,
      chunkSize: optimalChunkSize,
      totalChunks: Math.ceil(file.size / optimalChunkSize),
      useStreams: this.shouldUseStreams(file),
    };

    return file;
  }

  /**
   * 处理分片前钩子
   * @param file 上传文件
   * @returns 文件分片数据
   */
  private async handleBeforeChunk(file: UploadFile): Promise<ChunkData[]> {
    if (!file.size) {
      throw new Error('文件大小无效');
    }

    const chunkSize =
      file.meta?.chunkSize || this.getOptimalChunkSize(file.size);
    const useStreams = this.shouldUseStreams(file);

    // 根据使用流还是常规分片方式进行处理
    if (useStreams && typeof ReadableStream !== 'undefined') {
      return this.createStreamChunks(file, chunkSize);
    } else {
      return this.createRegularChunks(file, chunkSize);
    }
  }

  /**
   * 处理插件销毁
   */
  private handleDispose(): void {
    this.core = null;
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
    if (this.core && this.core.adapter?.readChunk) {
      return await this.core.adapter.readChunk(
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
    // 如果指定了chunkSize且不是'auto'，则使用指定值
    if (this.chunkSize !== 'auto') {
      return this.chunkSize;
    }

    // 使用MemoryManager获取最优分片大小
    return MemoryManager.getOptimalChunkSize(fileSize);
  }

  /**
   * 判断是否应该使用流式处理
   * @param file 上传文件
   */
  private shouldUseStreams(file: UploadFile): boolean {
    // 如果显式设置了useStreams，则遵循设置
    if (typeof this.useStreams === 'boolean') {
      return this.useStreams;
    }

    // 检查是否支持流API
    const supportsStreams =
      typeof ReadableStream !== 'undefined' &&
      typeof Blob.prototype.stream === 'function';

    if (!supportsStreams) return false;

    // 对于大文件（>100MB），优先使用流
    return file.size > 100 * 1024 * 1024;
  }

  /**
   * 常规方式创建文件分片
   * @param file 上传文件
   * @param chunkSize 分片大小
   */
  private async createRegularChunks(
    file: UploadFile,
    chunkSize: number
  ): Promise<ChunkData[]> {
    const chunks: ChunkData[] = [];
    const totalChunks = Math.ceil(file.size / chunkSize);

    // 如果文件过大且分片数量很多，提前建议进行垃圾回收
    if (totalChunks > 100 || file.size > 100 * 1024 * 1024) {
      MemoryManager.suggestGarbageCollection();
    }

    // 创建分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkBlob = file.source.slice(start, end);

      chunks.push({
        index: i,
        start,
        end,
        size: end - start,
        blob: chunkBlob,
        status: 'pending',
        progress: 0,
        retries: 0,
      });

      // 每50个分片检查一次内存状态，如果内存不足，建议进行垃圾回收
      if ((i + 1) % 50 === 0 && MemoryManager.isLowMemory()) {
        MemoryManager.suggestGarbageCollection();
        // 适当暂停，给GC一些时间
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return chunks;
  }

  /**
   * 流式方式创建文件分片
   * @param file 上传文件
   * @param suggestedChunkSize 建议分片大小
   */
  private async createStreamChunks(
    file: UploadFile,
    suggestedChunkSize: number
  ): Promise<ChunkData[]> {
    // 使用较小的分片大小进行流式处理，避免一次性加载过大内容
    const streamChunkSize = Math.min(suggestedChunkSize, this.streamChunkSize);
    const totalChunks = Math.ceil(file.size / streamChunkSize);
    const chunks: ChunkData[] = [];

    // 仅创建分片元数据，不实际加载分片内容
    for (let i = 0; i < totalChunks; i++) {
      const start = i * streamChunkSize;
      const end = Math.min(start + streamChunkSize, file.size);

      chunks.push({
        index: i,
        start,
        end,
        size: end - start,
        // 延迟创建blob，使用函数惰性求值
        get blob() {
          return file.source.slice(this.start, this.end);
        },
        status: 'pending',
        progress: 0,
        retries: 0,
        // 标记为流式分片
        isStream: true,
        // 添加获取流的方法
        getStream: function () {
          if (typeof Blob.prototype.stream === 'function') {
            return file.source.slice(this.start, this.end).stream();
          }
          return null;
        },
      });
    }

    return chunks;
  }

  /**
   * 动态调整分片大小
   * @param fileSize 文件大小
   * @param networkSpeed 网络速度（字节/秒）
   * @param memoryUsage 内存使用情况（0-1）
   */
  private dynamicChunkSizeAdjustment(
    fileSize: number,
    networkSpeed: number,
    memoryUsage: number
  ): number {
    // 基础分片大小
    const baseSize = this.getOptimalChunkSize(fileSize);

    // 网络速度调整因子（网络越快，分片可以更大）
    let networkFactor = 1.0;
    if (networkSpeed > 10 * 1024 * 1024) {
      // > 10MB/s
      networkFactor = 1.5;
    } else if (networkSpeed < 1 * 1024 * 1024) {
      // < 1MB/s
      networkFactor = 0.7;
    }

    // 内存使用调整因子（内存使用越高，分片应越小）
    let memoryFactor = 1.0;
    if (memoryUsage > 0.7) {
      // > 70%
      memoryFactor = 0.5;
    } else if (memoryUsage < 0.3) {
      // < 30%
      memoryFactor = 1.2;
    }

    // 计算最终分片大小
    let finalChunkSize = baseSize * networkFactor * memoryFactor;

    // 确保在最小和最大范围内
    finalChunkSize = Math.max(
      this.MIN_CHUNK_SIZE,
      Math.min(this.MAX_CHUNK_SIZE, finalChunkSize)
    );

    return Math.floor(finalChunkSize);
  }

  /**
   * 获取内存使用率
   */
  private getMemoryUsage(): number {
    if (
      typeof window !== 'undefined' &&
      window.performance &&
      (
        window.performance as {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory
    ) {
      const memory = (
        window.performance as {
          memory: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory;
      return memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    }
    return 0.5; // 默认假设50%内存使用率
  }

  /**
   * 计算大文件处理策略
   * @param fileSize 文件大小（字节）
   */
  private calculateLargeFileStrategy(fileSize: number): {
    useStreams: boolean;
    chunkSize: number;
    concurrency: number;
    useWorker: boolean;
  } {
    // 默认策略
    const strategy = {
      useStreams: this.shouldUseStreams({ size: fileSize } as UploadFile),
      chunkSize: this.getOptimalChunkSize(fileSize),
      concurrency: 3,
      useWorker: true,
    };

    // 文件大小梯度调整
    if (fileSize > 1 * 1024 * 1024 * 1024) {
      // > 1GB
      strategy.chunkSize = Math.min(strategy.chunkSize, 20 * 1024 * 1024); // 最大20MB分片
      strategy.concurrency = 2; // 减少并发
      strategy.useStreams = true; // 强制使用流
    } else if (fileSize > 500 * 1024 * 1024) {
      // > 500MB
      strategy.chunkSize = Math.min(strategy.chunkSize, 15 * 1024 * 1024); // 最大15MB分片
      strategy.concurrency = 2;
      strategy.useStreams = true;
    } else if (fileSize > 100 * 1024 * 1024) {
      // > 100MB
      strategy.chunkSize = Math.min(strategy.chunkSize, 10 * 1024 * 1024); // 最大10MB分片
      strategy.concurrency = 3;
    } else {
      // 小文件
      strategy.useStreams = false; // 小文件不使用流
      strategy.concurrency = 4;
    }

    // 检查设备内存状况
    if (MemoryManager.isLowMemory()) {
      strategy.chunkSize = Math.min(strategy.chunkSize, 5 * 1024 * 1024); // 最大5MB分片
      strategy.concurrency = 1; // 最低并发
      strategy.useWorker = false; // 不使用worker
    }

    return strategy;
  }
}

export default ChunkPlugin;
