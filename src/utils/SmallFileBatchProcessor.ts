/**
 * SmallFileBatchProcessor - 小文件批处理器
 * 提供批量上传小文件的性能优化，避免大量小文件对主线程造成压力
 */

import { EventBus } from '../core/EventBus';
import { Logger } from './Logger';
import { LoopSafetyChecker } from './LoopSafetyChecker';

/**
 * 批处理文件项
 */
export interface BatchFileItem {
  /** 唯一ID */
  id: string;
  /** 文件对象 */
  file: File | Blob;
  /** 自定义元数据 */
  metadata?: Record<string, any>;
  /** 进度(0-100) */
  progress?: number;
  /** 是否已完成 */
  completed?: boolean;
  /** 是否发生错误 */
  error?: any;
  /** 结果数据 */
  result?: any;
}

/**
 * 文件批次
 */
export interface FileBatch {
  /** 批次ID */
  id: string;
  /** 批次内的文件项 */
  files: BatchFileItem[];
  /** 总大小(字节) */
  totalSize: number;
  /** 总体进度(0-100) */
  progress: number;
  /** 已完成文件数 */
  completedCount: number;
  /** 失败文件数 */
  failedCount: number;
  /** 批次创建时间 */
  createdAt: number;
  /** 批次状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'aborted';
  /** 自定义元数据 */
  metadata?: Record<string, any>;
}

/**
 * 批处理选项
 */
export interface BatchProcessorOptions {
  /** 最大并行处理批次数 */
  maxConcurrentBatches?: number;
  /** 最大批次大小(单位:字节) */
  maxBatchSize?: number;
  /** 单个批次最大文件数 */
  maxFilesPerBatch?: number;
  /** 小文件最大大小阈值(字节)，超过此大小将单独处理 */
  smallFileThreshold?: number;
  /** 每批次处理文件完成后的暂停时间(ms)，避免占用过多资源 */
  batchIntervalMs?: number;
  /** 是否自动开始处理 */
  autoStart?: boolean;
  /** 事件总线 */
  eventBus?: EventBus;
  /** 日志级别 */
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'none';
}

/**
 * 小文件批处理器
 * 用于优化大量小文件的上传处理，减少主线程负担
 */
export class SmallFileBatchProcessor {
  /** 批次队列 */
  private batches: FileBatch[] = [];
  /** 正在处理的批次 */
  private processingBatches: Set<string> = new Set();
  /** 完成的批次 */
  private completedBatches: FileBatch[] = [];
  /** 批处理选项 */
  private options: Required<BatchProcessorOptions>;
  /** 是否正在处理 */
  private isProcessing = false;
  /** 是否已暂停 */
  private isPaused = false;
  /** 事件总线 */
  private eventBus: EventBus;
  /** 日志记录器 */
  private logger: Logger;
  /** 文件处理器函数 */
  private fileProcessor?: (
    file: BatchFileItem,
    batchId: string
  ) => Promise<any>;

  /**
   * 创建小文件批处理器
   * @param options 批处理选项
   */
  constructor(options: BatchProcessorOptions = {}) {
    // 合并默认选项
    this.options = {
      maxConcurrentBatches: 2,
      maxBatchSize: 10 * 1024 * 1024, // 10MB
      maxFilesPerBatch: 20,
      smallFileThreshold: 1024 * 1024, // 1MB
      batchIntervalMs: 100,
      autoStart: true,
      eventBus: options.eventBus || new EventBus(),
      logLevel: options.logLevel || 'info',
    };

    // 保存事件总线
    this.eventBus = this.options.eventBus;

    // 初始化日志记录器
    this.logger = new Logger('SmallFileBatchProcessor', {
      level: this.options.logLevel,
    });

    this.logger.debug('批处理器已初始化', this.options);
  }

  /**
   * 设置文件处理器
   * @param processor 文件处理函数
   */
  setFileProcessor(
    processor: (file: BatchFileItem, batchId: string) => Promise<any>
  ): void {
    this.fileProcessor = processor;
  }

  /**
   * 添加文件到批处理
   * @param files 文件数组
   * @param metadata 共享元数据
   * @returns 创建的批次ID
   */
  addFiles(files: Array<File | Blob>, metadata?: Record<string, any>): string {
    if (!files.length) return '';

    // 确保有文件处理器
    if (!this.fileProcessor) {
      throw new Error('未设置文件处理器，请先调用 setFileProcessor');
    }

    // 筛选小文件和大文件
    const smallFiles: File[] = [];
    const largeFiles: File[] = [];

    files.forEach(file => {
      if (file.size <= this.options.smallFileThreshold) {
        smallFiles.push(file as File);
      } else {
        largeFiles.push(file as File);
      }
    });

    const batches: FileBatch[] = [];

    // 处理小文件，将其分批
    if (smallFiles.length > 0) {
      const smallFileBatches = this.createBatchesForSmallFiles(
        smallFiles,
        metadata
      );
      batches.push(...smallFileBatches);
    }

    // 处理大文件，每个文件单独一个批次
    if (largeFiles.length > 0) {
      largeFiles.forEach(file => {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const fileItem: BatchFileItem = {
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          file,
          metadata: { ...metadata },
          progress: 0,
        };

        const batch: FileBatch = {
          id: batchId,
          files: [fileItem],
          totalSize: file.size,
          progress: 0,
          completedCount: 0,
          failedCount: 0,
          createdAt: Date.now(),
          status: 'pending',
          metadata: { ...metadata, isLargeFile: true },
        };

        batches.push(batch);
      });
    }

    // 添加批次到队列
    if (batches.length > 0) {
      this.batches.push(...batches);

      // 触发批次添加事件
      this.eventBus.emit('batches:added', {
        batchCount: batches.length,
        fileCount: files.length,
        totalSize: batches.reduce((sum, batch) => sum + batch.totalSize, 0),
      });

      this.logger.info(
        `添加了 ${batches.length} 个批次，共 ${files.length} 个文件`
      );

      // 如果设置了自动开始，则开始处理
      if (this.options.autoStart && !this.isPaused) {
        this.startProcessing();
      }

      // 返回第一个批次ID作为引用
      return batches[0].id;
    }

    return '';
  }

  /**
   * 为小文件创建批次
   * @param smallFiles 小文件数组
   * @param metadata 共享元数据
   * @returns 创建的批次数组
   */
  private createBatchesForSmallFiles(
    smallFiles: File[],
    metadata?: Record<string, any>
  ): FileBatch[] {
    const batches: FileBatch[] = [];
    let currentBatch: BatchFileItem[] = [];
    let currentBatchSize = 0;

    // 将小文件分组到批次中
    for (const file of smallFiles) {
      const fileItem: BatchFileItem = {
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        file,
        metadata: { ...metadata },
        progress: 0,
      };

      // 检查当前批次是否已满
      if (
        currentBatch.length >= this.options.maxFilesPerBatch ||
        currentBatchSize + file.size > this.options.maxBatchSize
      ) {
        // 创建新批次
        if (currentBatch.length > 0) {
          const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          batches.push({
            id: batchId,
            files: [...currentBatch],
            totalSize: currentBatchSize,
            progress: 0,
            completedCount: 0,
            failedCount: 0,
            createdAt: Date.now(),
            status: 'pending',
            metadata: { ...metadata, isSmallFileBatch: true },
          });
        }

        // 重置当前批次
        currentBatch = [fileItem];
        currentBatchSize = file.size;
      } else {
        // 添加到当前批次
        currentBatch.push(fileItem);
        currentBatchSize += file.size;
      }
    }

    // 处理最后一个未满的批次
    if (currentBatch.length > 0) {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      batches.push({
        id: batchId,
        files: [...currentBatch],
        totalSize: currentBatchSize,
        progress: 0,
        completedCount: 0,
        failedCount: 0,
        createdAt: Date.now(),
        status: 'pending',
        metadata: { ...metadata, isSmallFileBatch: true },
      });
    }

    return batches;
  }

  /**
   * 开始处理批次
   */
  startProcessing(): void {
    if (this.isProcessing || this.isPaused || !this.fileProcessor) {
      return;
    }

    this.isProcessing = true;
    this.processBatches();
  }

  /**
   * 处理批次
   */
  private async processBatches(): Promise<void> {
    if (!this.isProcessing || this.isPaused) {
      return;
    }

    // 获取待处理的批次
    const availableBatchCount =
      this.options.maxConcurrentBatches - this.processingBatches.size;

    if (availableBatchCount <= 0 || this.batches.length === 0) {
      // 没有可处理的批次，检查是否所有工作已完成
      if (this.processingBatches.size === 0 && this.batches.length === 0) {
        this.isProcessing = false;
        this.eventBus.emit('batches:allCompleted', {
          completedCount: this.completedBatches.length,
          timestamp: Date.now(),
        });

        this.logger.info('所有批次处理完成');
      }
      return;
    }

    // 选择要处理的批次
    const batchesToProcess = this.batches.splice(0, availableBatchCount);

    // 并行处理多个批次
    for (const batch of batchesToProcess) {
      this.processingBatches.add(batch.id);
      batch.status = 'processing';

      // 触发批次开始处理事件
      this.eventBus.emit('batch:processing', {
        batchId: batch.id,
        fileCount: batch.files.length,
        totalSize: batch.totalSize,
      });

      // 异步处理批次
      this.processBatch(batch).finally(() => {
        this.processingBatches.delete(batch.id);

        // 处理完一个批次后，检查队列中是否还有批次
        setTimeout(() => {
          this.processBatches();
        }, this.options.batchIntervalMs);
      });
    }
  }

  /**
   * 处理单个批次
   * @param batch 批次信息
   */
  private async processBatch(batch: FileBatch): Promise<void> {
    if (!this.fileProcessor) return;

    this.logger.debug(
      `开始处理批次 ${batch.id}，共 ${batch.files.length} 个文件`
    );

    try {
      // 使用 LoopSafetyChecker 分段处理文件，避免阻塞主线程
      await LoopSafetyChecker.executeNonBlocking(
        async yieldControl => {
          for (let i = 0; i < batch.files.length; i++) {
            if (this.isPaused) {
              this.logger.debug(`批次 ${batch.id} 处理已暂停`);
              return;
            }

            const fileItem = batch.files[i];

            try {
              // 处理单个文件
              const result = await this.fileProcessor!(fileItem, batch.id);

              // 更新文件状态
              fileItem.completed = true;
              fileItem.progress = 100;
              fileItem.result = result;
              batch.completedCount++;

              // 触发文件完成事件
              this.eventBus.emit('file:completed', {
                fileId: fileItem.id,
                batchId: batch.id,
                result,
              });
            } catch (error) {
              // 处理文件错误
              fileItem.error = error;
              batch.failedCount++;

              this.logger.warn(
                `批次 ${batch.id} 中的文件 ${fileItem.id} 处理失败:`,
                error
              );

              // 触发文件错误事件
              this.eventBus.emit('file:error', {
                fileId: fileItem.id,
                batchId: batch.id,
                error,
              });
            }

            // 更新批次进度
            this.updateBatchProgress(batch);

            // 每处理几个文件就让出主线程控制权
            if (i % 3 === 2) {
              await yieldControl();
            }
          }
        },
        { maxBlockTime: 50 }
      );

      // 更新批次状态
      if (batch.failedCount === 0) {
        batch.status = 'completed';
        this.eventBus.emit('batch:completed', {
          batchId: batch.id,
          fileCount: batch.files.length,
          completedCount: batch.completedCount,
        });
      } else if (batch.completedCount === 0) {
        batch.status = 'failed';
        this.eventBus.emit('batch:failed', {
          batchId: batch.id,
          fileCount: batch.files.length,
          failedCount: batch.failedCount,
        });
      } else {
        batch.status = 'completed';
        this.eventBus.emit('batch:partiallyCompleted', {
          batchId: batch.id,
          fileCount: batch.files.length,
          completedCount: batch.completedCount,
          failedCount: batch.failedCount,
        });
      }

      // 添加到已完成批次
      this.completedBatches.push(batch);

      this.logger.debug(
        `批次 ${batch.id} 处理完成，成功: ${batch.completedCount}，失败: ${batch.failedCount}`
      );
    } catch (error) {
      // 处理整个批次异常
      batch.status = 'failed';

      this.logger.error(`批次 ${batch.id} 处理过程中发生错误:`, error);

      this.eventBus.emit('batch:error', {
        batchId: batch.id,
        error,
      });
    }
  }

  /**
   * 更新批次进度
   * @param batch 批次信息
   */
  private updateBatchProgress(batch: FileBatch): void {
    const totalFiles = batch.files.length;
    if (totalFiles === 0) return;

    const progress =
      ((batch.completedCount + batch.failedCount) / totalFiles) * 100;
    batch.progress = Math.min(99.9, progress); // 保留一点进度给最终完成

    // 触发批次进度更新事件
    this.eventBus.emit('batch:progress', {
      batchId: batch.id,
      progress: batch.progress,
      completedCount: batch.completedCount,
      failedCount: batch.failedCount,
      totalCount: totalFiles,
    });
  }

  /**
   * 暂停处理
   */
  pause(): void {
    if (this.isPaused) return;

    this.isPaused = true;
    this.eventBus.emit('batches:paused', { timestamp: Date.now() });
    this.logger.info('批处理已暂停');
  }

  /**
   * 恢复处理
   */
  resume(): void {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.eventBus.emit('batches:resumed', { timestamp: Date.now() });
    this.logger.info('批处理已恢复');

    if (
      !this.isProcessing &&
      (this.batches.length > 0 || this.processingBatches.size > 0)
    ) {
      this.startProcessing();
    }
  }

  /**
   * 清空所有批次
   */
  clearAll(): void {
    this.batches = [];
    this.completedBatches = [];
    this.processingBatches.clear();
    this.isProcessing = false;

    this.eventBus.emit('batches:cleared', { timestamp: Date.now() });
    this.logger.info('所有批次已清空');
  }

  /**
   * 获取批次状态
   * @returns 批次状态统计
   */
  getBatchesStatus(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalFiles: number;
    processedFiles: number;
  } {
    const pendingBatches = this.batches.length;
    const processingBatches = this.processingBatches.size;
    const completedBatches = this.completedBatches.filter(
      b => b.status === 'completed'
    ).length;
    const failedBatches = this.completedBatches.filter(
      b => b.status === 'failed'
    ).length;

    const totalFiles =
      this.batches.reduce((sum, b) => sum + b.files.length, 0) +
      Array.from(this.processingBatches).reduce((sum, id) => {
        const batch = this.completedBatches.find(b => b.id === id);
        return sum + (batch ? batch.files.length : 0);
      }, 0) +
      this.completedBatches.reduce((sum, b) => sum + b.files.length, 0);

    const processedFiles = this.completedBatches.reduce(
      (sum, b) => sum + b.completedCount + b.failedCount,
      0
    );

    return {
      pending: pendingBatches,
      processing: processingBatches,
      completed: completedBatches,
      failed: failedBatches,
      totalFiles,
      processedFiles,
    };
  }
}
