/**
 * ChunkPlugin - 分片处理插件
 * 负责实现基础分片策略，固定大小分片，分片生成与管理
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, ChunkInfo, NetworkQuality } from '../types';
import { Logger } from '../utils/Logger';
import { MemoryManager } from '../utils/MemoryManager';
import { NetworkDetector } from '../utils/NetworkDetector';

// 定义通用文件接口，兼容File和小程序文件对象
interface IFileObject {
  size: number;
  name: string;
  type?: string;
  path?: string;
  slice?: (start: number, end: number) => Blob;
  meta?: {
    chunkSize?: number;
    totalChunks?: number;
    useStreams?: boolean;
    [key: string]: any;
  };
}

// 定义ChunkData接口
interface ChunkData {
  index: number;
  data: ArrayBuffer | Blob;
  size: number;
  start: number;
  end: number;
}

interface ChunkPluginOptions {
  chunkSize?: number | 'auto'; // 分片大小，'auto'表示自动计算
  generateFileId?: (file: IFileObject) => Promise<string>; // 自定义生成文件ID的方法
  maxParallelChunkGeneration?: number; // 并行生成分片的最大数量
  useStreams?: boolean; // 是否使用流式处理
  adaptiveStrategy?: 'performance' | 'memory' | 'network' | 'balanced'; // 自适应策略类型
  enableOptimization?: boolean; // 是否启用优化
}

/**
 * 分片处理插件，实现文件分片策略
 */
export class ChunkPlugin implements IPlugin {
  public readonly version = '1.1.0';
  private core: UploaderCore | null = null;
  private chunkSize: number | 'auto';
  private useStreams: boolean;
  private streamChunkSize: number = 2 * 1024 * 1024; // 2MB
  private readonly MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MIN_CHUNK_SIZE = 512 * 1024; // 512KB
  private enableOptimization: boolean;
  private networkDetector: NetworkDetector | null = null;
  private logger: Logger;

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
    this.logger = new Logger('ChunkPlugin');
    this.enableOptimization = options.enableOptimization !== false;

    if (this.enableOptimization) {
      try {
        this.networkDetector = NetworkDetector.create();
      } catch (error) {
        this.logger.warn('无法初始化NetworkDetector', error);
        this.networkDetector = null;
      }
    }
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
    uploader.hook(
      'beforeCreateChunks',
      this.handleBeforeCreateChunks.bind(this)
    );
    uploader.hook('dispose', this.handleDispose.bind(this));

    // 优化相关的钩子
    if (this.enableOptimization) {
      uploader.hook(
        'networkQualityChanged',
        this.handleNetworkQualityChanged.bind(this)
      );
      uploader.hook('memoryWarning', this.handleMemoryWarning.bind(this));
    }
  }

  /**
   * 处理创建分片前钩子
   */
  private async handleBeforeCreateChunks(data: {
    file: any;
    chunkSize: number;
  }): Promise<{
    file: any;
    chunkSize: number;
  }> {
    // 如果启用了优化，根据当前环境状况动态调整分片大小
    if (this.enableOptimization) {
      const optimalChunkSize = await this.getOptimalChunkSize(data.file);

      // 如果计算的最优分片大小与传入的不同，则更新
      if (optimalChunkSize !== data.chunkSize) {
        this.logger.info(
          `动态调整分片大小：${data.chunkSize} -> ${optimalChunkSize}`
        );
        return {
          ...data,
          chunkSize: optimalChunkSize,
        };
      }
    }

    return data;
  }

  /**
   * 处理网络质量变化事件
   */
  private async handleNetworkQualityChanged(data: {
    quality: NetworkQuality;
  }): Promise<void> {
    if (!this.core || !this.enableOptimization) return;

    const { quality } = data;
    this.logger.debug(`网络质量变化：${quality}`);

    // 当网络质量变差时，可以动态调整未上传分片的大小
    if (quality === NetworkQuality.POOR) {
      // 减小分片大小以提高成功率
      this.logger.info('网络质量较差，调整为较小的分片大小');

      // 这里可以触发事件让UploaderCore重新计算剩余分片
      this.core.emit('suggestChunkSizeChange', {
        reason: 'poorNetwork',
        suggestedChunkSize: Math.max(this.MIN_CHUNK_SIZE, 1 * 1024 * 1024), // 1MB
      });
    } else if (quality === NetworkQuality.EXCELLENT) {
      // 增大分片大小以提高吞吐量
      this.logger.info('网络质量优良，调整为较大的分片大小');

      this.core.emit('suggestChunkSizeChange', {
        reason: 'excellentNetwork',
        suggestedChunkSize: Math.min(10 * 1024 * 1024, this.MAX_CHUNK_SIZE), // 10MB
      });
    }
  }

  /**
   * 处理内存警告事件
   */
  private handleMemoryWarning(data: { usageRatio: number }): void {
    if (!this.core || !this.enableOptimization) return;

    const { usageRatio } = data;
    this.logger.warn(
      `内存使用率较高(${(usageRatio * 100).toFixed(1)}%)，调整分片策略`
    );

    // 当内存使用率高时，减小分片大小和并发数
    if (usageRatio > 0.8) {
      this.core.emit('suggestChunkSizeChange', {
        reason: 'highMemory',
        suggestedChunkSize: Math.max(this.MIN_CHUNK_SIZE, 1 * 1024 * 1024), // 1MB
        suggestedConcurrency: 2, // 降低并发数
      });
    }
  }

  /**
   * 处理上传前钩子
   * @param file 上传文件
   * @returns 处理后的文件
   */
  private async handleBeforeUpload(file: IFileObject): Promise<IFileObject> {
    // 检查文件大小，判断是否需要分片和计算最佳分片大小
    if (!file.size || file.size <= 0) {
      throw new Error('文件大小无效');
    }

    // 确定分片大小
    const optimalChunkSize = await this.getOptimalChunkSize(file);

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
  private async handleBeforeChunk(file: IFileObject): Promise<ChunkData[]> {
    if (!file.size) {
      throw new Error('文件大小无效');
    }

    const chunkSize =
      file.meta?.chunkSize || (await this.getOptimalChunkSize(file));
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
    if (this.networkDetector) {
      this.networkDetector.dispose();
      this.networkDetector = null;
    }
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
    const chunkSize = await this.getOptimalChunkSize(file);

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
    if (this.core && (this.core as any).adapter?.readChunk) {
      return await (this.core as any).adapter.readChunk(
        file.path || file.name,
        start,
        chunkInfo.size
      );
    }

    throw new Error('无法读取文件分片，不支持的文件类型或缺少适配器');
  }

  /**
   * 获取最优分片大小
   * @param fileSize 文件大小
   * @returns 最优分片大小
   */
  private async getOptimalChunkSize(file: IFileObject): Promise<number> {
    // 如果指定了chunkSize且不是'auto'，则使用指定值
    if (this.chunkSize !== 'auto') {
      return Math.max(
        this.MIN_CHUNK_SIZE,
        Math.min(this.chunkSize as number, this.MAX_CHUNK_SIZE)
      );
    }

    // 如果不启用优化，使用基础的内存管理计算分片大小
    if (!this.enableOptimization) {
      try {
        // 尝试调用MemoryManager的方法，如果方法不存在则使用默认值
        if (typeof MemoryManager.getOptimalChunkSize === 'function') {
          return MemoryManager.getOptimalChunkSize(file.size);
        }
        // 默认值，根据文件大小选择合适的分片大小
        return Math.min(
          Math.max(2 * 1024 * 1024, file.size / 100),
          this.MAX_CHUNK_SIZE
        );
      } catch (error) {
        // 出错时使用默认值
        console.error('无法获取最优分片大小', error);
        return 2 * 1024 * 1024; // 默认2MB
      }
    }

    // 根据策略类型计算最优分片大小
    let baseChunkSize = 2 * 1024 * 1024; // 默认2MB

    // 获取网络质量
    let networkQuality: NetworkQuality = NetworkQuality.UNKNOWN;
    if (
      this.networkDetector &&
      typeof this.networkDetector.getNetworkQuality === 'function'
    ) {
      try {
        networkQuality = this.networkDetector.getNetworkQuality();
      } catch (error) {
        // 如果网络检测失败，使用默认的网络质量
        console.error('网络质量检测失败', error);
        networkQuality = NetworkQuality.UNKNOWN;
      }
    }

    // 根据网络质量调整基础分片大小
    switch (networkQuality) {
      case NetworkQuality.POOR:
        baseChunkSize = 1 * 1024 * 1024; // 1MB
        break;
      case NetworkQuality.MEDIUM:
        baseChunkSize = 2 * 1024 * 1024; // 2MB
        break;
      case NetworkQuality.GOOD:
        baseChunkSize = 4 * 1024 * 1024; // 4MB
        break;
      case NetworkQuality.EXCELLENT:
        baseChunkSize = 8 * 1024 * 1024; // 8MB
        break;
    }

    // 根据文件大小进一步调整
    if (file.size < 10 * 1024 * 1024) {
      // 小于10MB
      baseChunkSize = Math.min(baseChunkSize, 1 * 1024 * 1024);
    } else if (file.size > 1 * 1024 * 1024 * 1024) {
      // 大于1GB
      baseChunkSize = Math.max(baseChunkSize, 4 * 1024 * 1024);
    }

    // 确保分片大小在有效范围内
    return Math.max(
      this.MIN_CHUNK_SIZE,
      Math.min(baseChunkSize, this.MAX_CHUNK_SIZE)
    );
  }

  /**
   * 判断是否应该使用流式处理
   * @param file 上传文件
   */
  private shouldUseStreams(file: IFileObject): boolean {
    // 如果显式设置了useStreams，则遵循设置
    if (typeof this.useStreams === 'boolean') {
      return this.useStreams;
    }

    // 检查环境是否支持流式处理
    const supportsStreams = typeof ReadableStream !== 'undefined';
    if (!supportsStreams) {
      return false;
    }

    // 根据文件大小判断
    // 只有大文件才使用流式处理，小文件使用普通方式更简单高效
    return file.size > 100 * 1024 * 1024; // 大于100MB使用流
  }

  /**
   * 创建常规分片
   * @param file 文件对象
   * @param chunkSize 分片大小
   */
  private async createRegularChunks(
    file: IFileObject,
    chunkSize: number
  ): Promise<ChunkData[]> {
    const chunks: ChunkData[] = [];
    const chunkCount = Math.ceil(file.size / chunkSize);

    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(file.size, start + chunkSize);

      // 对于浏览器环境
      if (file instanceof Blob) {
        chunks.push({
          index: i,
          data: file.slice(start, end),
          size: end - start,
          start,
          end,
        });
      }
      // 对于其他环境，例如小程序
      else if (this.core && (this.core as any).adapter?.readChunk) {
        const buffer = await (this.core as any).adapter.readChunk(
          file.path || file.name,
          start,
          end - start
        );

        chunks.push({
          index: i,
          data: buffer,
          size: end - start,
          start,
          end,
        });
      } else {
        throw new Error('无法创建文件分片：不支持的文件类型或缺少适配器');
      }
    }

    return chunks;
  }

  /**
   * 创建流式分片
   * @param file 文件对象
   * @param suggestedChunkSize 建议的分片大小
   */
  private async createStreamChunks(
    file: IFileObject,
    suggestedChunkSize: number
  ): Promise<ChunkData[]> {
    // 使用更小的分片大小进行流式处理
    const chunkSize = Math.min(suggestedChunkSize, this.streamChunkSize);

    // 流式处理当前仅在浏览器环境下支持
    if (!(file instanceof Blob) || !('stream' in Blob.prototype)) {
      // 回退到常规分片
      return this.createRegularChunks(file, chunkSize);
    }

    // 在实际项目中，这里应该实现真正的流式处理
    // 这里为了示例，仍使用常规分片
    return this.createRegularChunks(file, chunkSize);
  }

  /**
   * 动态调整分片大小
   * @param reason 调整原因
   * @param suggestion 建议值
   */
  public adjustChunkSize(reason: string, suggestion?: number): void {
    if (!this.enableOptimization) return;

    if (
      suggestion &&
      suggestion >= this.MIN_CHUNK_SIZE &&
      suggestion <= this.MAX_CHUNK_SIZE
    ) {
      this.logger.info(`根据${reason}调整分片大小为${suggestion}字节`);
      if (this.chunkSize === 'auto') {
        // 仍保持自动模式，但记录建议值供下次计算使用
        this.streamChunkSize = suggestion; // 用streamChunkSize存储上次建议值
      } else {
        // 直接修改固定分片大小
        this.chunkSize = suggestion;
      }
    }
  }
}

export default ChunkPlugin;
