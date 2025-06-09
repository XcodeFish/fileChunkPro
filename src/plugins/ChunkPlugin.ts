/**
 * ChunkPlugin - 分片处理插件
 * 负责实现基础分片策略，固定大小分片，分片生成与管理
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, ChunkInfo, NetworkQuality, MemoryTrend } from '../types';
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
  enableMemoryMonitoring?: boolean; // 是否启用内存监控
}

/**
 * 分片处理插件，实现文件分片策略
 */
class ChunkPlugin implements IPlugin {
  public readonly version = '2.0.0';
  private core: UploaderCore | null = null;
  private chunkSize: number | 'auto';
  private useStreams: boolean;
  private streamChunkSize: number = 2 * 1024 * 1024; // 2MB
  private readonly MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MIN_CHUNK_SIZE = 512 * 1024; // 512KB
  private enableOptimization: boolean;
  private enableMemoryMonitoring: boolean;
  private networkDetector: NetworkDetector | null = null;
  private logger: Logger;
  private memoryEventHandler: ((event: any) => void) | null = null;

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
    this.enableMemoryMonitoring = options.enableMemoryMonitoring !== false;

    // 确保MemoryManager初始化
    if (this.enableMemoryMonitoring) {
      try {
        MemoryManager.initialize();
      } catch (error) {
        this.logger.warn('无法初始化MemoryManager', error);
      }
    }

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
    }

    // 启用内存监控
    if (this.enableMemoryMonitoring) {
      // 开始内存监控
      MemoryManager.startMonitoring();

      // 注册内存警告处理函数
      this.memoryEventHandler = this.handleMemoryWarning.bind(this);
      MemoryManager.addEventListener('memoryWarning', this.memoryEventHandler);
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
  private handleMemoryWarning(data: any): void {
    if (!this.core || !this.enableMemoryMonitoring) return;

    const warningEvent = data;
    this.logger.warn(
      `内存警告(${warningEvent.level}): 使用率${(warningEvent.stats.usageRatio * 100).toFixed(1)}%`
    );

    // 获取优化建议
    const recommendations = warningEvent.recommendations;

    // 应用推荐的优化设置
    if (recommendations) {
      if (recommendations.chunkSize) {
        this.core.emit('suggestChunkSizeChange', {
          reason: 'memoryWarning',
          suggestedChunkSize: recommendations.chunkSize,
        });
      }

      if (recommendations.concurrency) {
        this.core.emit('suggestConcurrencyChange', {
          reason: 'memoryWarning',
          suggestedConcurrency: recommendations.concurrency,
        });
      }

      // 如果内存极度紧张，建议暂停上传
      if (recommendations.shouldPause) {
        this.logger.warn('内存极度紧张，建议暂停上传');
        this.core.emit('memoryPressurePause', {
          reason: 'criticalMemory',
          shouldPause: true,
        });
      }

      // 如果需要释放内存，尝试执行垃圾回收
      if (recommendations.shouldReleaseMemory) {
        MemoryManager.suggestGarbageCollection();
      }
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

    // 如果文件尺寸较大，预先计算最佳分片策略
    if (file.size > 10 * 1024 * 1024) {
      // 10MB
      // 获取基于内存的优化分片策略
      const strategy = MemoryManager.getChunkProcessingStrategy(file.size);

      // 将策略应用到文件元数据
      if (!file.meta) {
        file.meta = {};
      }

      file.meta.chunkSize = strategy.chunkSize;
      file.meta.useStreams = strategy.useStreaming;
      file.meta.processingMode = strategy.processingMode;
      file.meta.preloadChunks = strategy.preloadChunks;

      // 记录日志
      this.logger.info(
        `为大文件设置优化策略: 分片大小=${strategy.chunkSize}字节, 处理模式=${strategy.processingMode}`
      );

      // 如果是超大文件，考虑使用分部处理策略
      if (file.size > 500 * 1024 * 1024) {
        // 500MB
        const largeFileStrategy = MemoryManager.getLargeFileStrategy(file.size);
        file.meta.useParts = largeFileStrategy.shouldUseParts;
        file.meta.partSize = largeFileStrategy.partSize;
        file.meta.maxPartsInMemory = largeFileStrategy.maxPartsInMemory;
        file.meta.offloadCalculation =
          largeFileStrategy.shouldOffloadCalculation;

        this.logger.info(
          `为超大文件设置分部处理策略: 分部大小=${largeFileStrategy.partSize}字节`
        );
      }
    }

    return file;
  }

  /**
   * 处理分片钩子
   */
  private async handleBeforeChunk(file: IFileObject): Promise<ChunkData[]> {
    // 使用优化的分片计划
    if (file.meta?.useParts) {
      // 对于超大文件，使用分部处理
      this.logger.info('使用大文件分部处理策略');
      return this.createLargeFileChunks(file);
    } else if (this.shouldUseStreams(file)) {
      // 使用流式处理
      this.logger.info('使用流式处理分片');
      return this.createStreamChunks(file, this.determineChunkSize(file));
    } else {
      // 常规分片处理
      return this.createRegularChunks(file, this.determineChunkSize(file));
    }
  }

  /**
   * 处理插件销毁
   */
  private handleDispose(): void {
    // 清理资源
    if (this.enableMemoryMonitoring && this.memoryEventHandler) {
      MemoryManager.removeEventListener(
        'memoryWarning',
        this.memoryEventHandler
      );
      this.memoryEventHandler = null;
      MemoryManager.stopMonitoring();
    }

    this.core = null;
  }

  /**
   * 创建分片信息
   */
  public async createChunks(file: IFileObject): Promise<ChunkInfo[]> {
    const chunkSize = this.determineChunkSize(file);
    const fileSize = file.size;
    const chunks: ChunkInfo[] = [];

    // 对于大文件，使用内存优化的分片计划
    if (fileSize > 100 * 1024 * 1024) {
      // 100MB
      const chunkPlan = MemoryManager.getMemoryEfficientChunkPlan(
        fileSize,
        chunkSize
      );

      // 使用优化的分片计划
      return chunkPlan.chunks.map(chunk => ({
        index: chunk.index,
        start: chunk.start,
        end: chunk.end,
        size: chunk.size,
        fileSize,
      }));
    }

    // 常规分片计算
    let start = 0;
    let index = 0;

    while (start < fileSize) {
      const end = Math.min(start + chunkSize, fileSize);
      const size = end - start;

      chunks.push({
        index,
        start,
        end,
        size,
        fileSize,
      });

      start = end;
      index++;
    }

    return chunks;
  }

  /**
   * 获取分片数据
   */
  public async getChunkData(
    file: IFileObject,
    chunkInfo: ChunkInfo
  ): Promise<ArrayBuffer | Blob> {
    const { start, end } = chunkInfo;

    // 如果是浏览器File对象
    if (file.slice && typeof file.slice === 'function') {
      return file.slice(start, end);
    }
    // 如果是小程序文件对象
    else if (file.path && typeof file.path === 'string') {
      // 需要上层适配器支持readChunk
      if (this.core && typeof this.core.readChunk === 'function') {
        return this.core.readChunk(file.path, start, end - start);
      }
      throw new Error('当前环境不支持文件分片读取');
    }

    throw new Error('无法获取文件分片数据');
  }

  /**
   * 获取最优分片大小
   */
  private async getOptimalChunkSize(file: IFileObject): Promise<number> {
    // 如果文件元数据中已有分片大小，则优先使用
    if (file.meta && file.meta.chunkSize && file.meta.chunkSize > 0) {
      return Math.min(
        Math.max(file.meta.chunkSize, this.MIN_CHUNK_SIZE),
        this.MAX_CHUNK_SIZE
      );
    }

    // 如果设置了固定分片大小且不是auto，则使用设置的值
    if (this.chunkSize !== 'auto' && typeof this.chunkSize === 'number') {
      return Math.min(
        Math.max(this.chunkSize, this.MIN_CHUNK_SIZE),
        this.MAX_CHUNK_SIZE
      );
    }

    // 获取当前内存和网络情况
    const memoryStats = MemoryManager.getMemoryStats();
    let networkQuality = NetworkQuality.MEDIUM;

    if (this.networkDetector) {
      networkQuality = await this.networkDetector.detectNetworkQuality();
    }

    // 使用MemoryManager获取最优分片大小
    let optimalSize = MemoryManager.getOptimalChunkSize(file.size);

    // 根据网络质量进一步调整
    switch (networkQuality) {
      case NetworkQuality.POOR:
        optimalSize = Math.min(optimalSize, 1 * 1024 * 1024); // 最大1MB
        break;
      case NetworkQuality.LOW:
        optimalSize = Math.min(optimalSize, 2 * 1024 * 1024); // 最大2MB
        break;
      case NetworkQuality.EXCELLENT:
        optimalSize = Math.min(
          Math.max(optimalSize, 5 * 1024 * 1024), // 至少5MB
          this.MAX_CHUNK_SIZE
        );
        break;
    }

    // 内存增长趋势监控，如果内存增长迅速，降低分片大小
    if (
      memoryStats.trend === MemoryTrend.GROWING &&
      memoryStats.growthRate &&
      memoryStats.growthRate > 2 * 1024 * 1024
    ) {
      optimalSize = Math.min(optimalSize, 2 * 1024 * 1024); // 最大2MB
    }

    // 确保分片大小在有效范围内
    return Math.min(
      Math.max(optimalSize, this.MIN_CHUNK_SIZE),
      this.MAX_CHUNK_SIZE
    );
  }

  /**
   * 判断是否应该使用流式处理
   */
  private shouldUseStreams(file: IFileObject): boolean {
    // 如果文件元数据中明确指定了是否使用流，则遵循设置
    if (file.meta && file.meta.useStreams !== undefined) {
      return file.meta.useStreams;
    }

    // 如果配置中明确指定了是否使用流，则遵循配置
    if (this.useStreams !== undefined) {
      return this.useStreams;
    }

    // 默认大文件使用流处理，小文件不使用
    const largeFile = file.size > 50 * 1024 * 1024; // 50MB
    return largeFile && typeof ReadableStream !== 'undefined';
  }

  /**
   * 确定使用的分片大小
   */
  private determineChunkSize(file: IFileObject): number {
    // 如果文件元数据中已有分片大小，则优先使用
    if (file.meta && file.meta.chunkSize && file.meta.chunkSize > 0) {
      return Math.min(
        Math.max(file.meta.chunkSize, this.MIN_CHUNK_SIZE),
        this.MAX_CHUNK_SIZE
      );
    }

    // 如果设置了固定分片大小且不是auto，则使用设置的值
    if (this.chunkSize !== 'auto' && typeof this.chunkSize === 'number') {
      return Math.min(
        Math.max(this.chunkSize, this.MIN_CHUNK_SIZE),
        this.MAX_CHUNK_SIZE
      );
    }

    // 使用MemoryManager获取最优分片大小
    const optimalSize = MemoryManager.getOptimalChunkSize(file.size);

    // 确保分片大小在有效范围内
    return Math.min(
      Math.max(optimalSize, this.MIN_CHUNK_SIZE),
      this.MAX_CHUNK_SIZE
    );
  }

  /**
   * 创建常规分片
   */
  private async createRegularChunks(
    file: IFileObject,
    chunkSize: number
  ): Promise<ChunkData[]> {
    const fileSize = file.size;
    const result: ChunkData[] = [];
    let start = 0;
    let index = 0;

    while (start < fileSize) {
      const end = Math.min(start + chunkSize, fileSize);
      const chunkData = await this.getChunkData(file, {
        index,
        start,
        end,
        size: end - start,
        fileSize,
      });

      result.push({
        index,
        data: chunkData,
        size: end - start,
        start,
        end,
      });

      start = end;
      index++;
    }

    return result;
  }

  /**
   * 创建流式分片
   */
  private async createStreamChunks(
    file: IFileObject,
    suggestedChunkSize: number
  ): Promise<ChunkData[]> {
    // 在实际开发中实现流式处理
    // 这里简化为普通分片处理
    return this.createRegularChunks(file, suggestedChunkSize);
  }

  /**
   * 创建大文件分片处理
   */
  private async createLargeFileChunks(file: IFileObject): Promise<ChunkData[]> {
    // 获取大文件处理策略
    const strategy = MemoryManager.getLargeFileStrategy(file.size);
    const chunkSize = strategy.partSize;

    // 使用分片策略创建分片
    return this.createRegularChunks(file, chunkSize);
  }

  /**
   * 调整分片大小
   */
  public adjustChunkSize(reason: string, suggestion?: number): void {
    this.logger.info(`调整分片大小，原因: ${reason}`);

    if (suggestion && suggestion > 0) {
      // 将建议的分片大小限制在合理范围内
      const newChunkSize = Math.min(
        Math.max(suggestion, this.MIN_CHUNK_SIZE),
        this.MAX_CHUNK_SIZE
      );

      this.chunkSize = newChunkSize;
      this.logger.info(`新的分片大小: ${newChunkSize} 字节`);
    } else {
      // 如果没有提供具体建议，则根据原因自动调整
      if (reason === 'memoryWarning' || reason === 'poorNetwork') {
        // 内存警告或网络差，减小分片大小
        this.chunkSize = Math.max(
          typeof this.chunkSize === 'number'
            ? this.chunkSize / 2
            : 1 * 1024 * 1024,
          this.MIN_CHUNK_SIZE
        );
      } else if (
        reason === 'excellentNetwork' ||
        reason === 'memoryAvailable'
      ) {
        // 网络良好或内存充足，增大分片大小
        this.chunkSize = Math.min(
          typeof this.chunkSize === 'number'
            ? this.chunkSize * 1.5
            : 5 * 1024 * 1024,
          this.MAX_CHUNK_SIZE
        );
      }

      this.logger.info(`自动调整后的分片大小: ${this.chunkSize} 字节`);
    }
  }
}

export default ChunkPlugin;
