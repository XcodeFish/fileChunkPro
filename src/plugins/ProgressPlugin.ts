/**
 * ProgressPlugin - 进度监控插件
 * 负责计算上传进度并触发进度事件
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, ChunkInfo } from '../types';

interface ProgressPluginOptions {
  throttle?: number; // 节流时间间隔（毫秒）
  useChunkEvent?: boolean; // 是否使用chunk事件计算进度
  progressDecimal?: number; // 进度精度，小数点位数
}

/**
 * 进度监控插件，计算上传进度并触发事件
 */
export class ProgressPlugin implements IPlugin {
  private options: ProgressPluginOptions;
  private uploader: UploaderCore | null = null;
  private totalChunks = 0;
  private uploadedChunks = 0;
  private lastProgress = 0;
  private lastEmitTime = 0;
  private activeUpload = false;

  /**
   * 创建进度监控插件实例
   * @param options 进度插件选项
   */
  constructor(options: ProgressPluginOptions = {}) {
    this.options = {
      throttle: 200, // 默认200ms节流
      useChunkEvent: true,
      progressDecimal: 2, // 默认保留2位小数
      ...options,
    };
  }

  /**
   * 插件安装方法
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this.uploader = uploader;

    // 注册事件监听
    uploader.on('uploadStart', this.handleUploadStart.bind(this));
    uploader.on('chunkSuccess', this.handleChunkSuccess.bind(this));
    uploader.on('uploadComplete', this.handleUploadComplete.bind(this));
    // 添加对complete事件的监听，确保在上传完成时也处理进度
    uploader.on('complete', this.handleUploadComplete.bind(this));
    uploader.on('error', this.handleError.bind(this));

    // 注册钩子，获取分片总数
    uploader.hook('afterChunksGenerated', this.setTotalChunks.bind(this));
  }

  /**
   * 处理上传开始事件
   */
  private handleUploadStart(): void {
    this.uploadedChunks = 0;
    this.lastProgress = 0;
    this.activeUpload = true;

    // 发送初始进度
    this.emitProgress(0);
  }

  /**
   * 设置总分片数
   * @param chunks 分片信息
   */
  private setTotalChunks(chunks: ChunkInfo[]): void {
    this.totalChunks = chunks.length;
  }

  /**
   * 处理分片上传成功事件
   */
  private handleChunkSuccess(): void {
    if (!this.activeUpload) return;

    this.uploadedChunks++;
    this.calculateAndEmitProgress();
  }

  /**
   * 处理上传完成事件
   */
  private handleUploadComplete(): void {
    this.activeUpload = false;

    // 确保发送100%进度，并且强制设置上传分片数等于总分片数
    this.uploadedChunks = this.totalChunks;
    this.emitProgress(100);
  }

  /**
   * 处理错误事件
   */
  private handleError(): void {
    this.activeUpload = false;
  }

  /**
   * 计算并发送进度
   */
  private calculateAndEmitProgress(): void {
    if (this.totalChunks === 0) return;

    const progress = Math.min(
      (this.uploadedChunks / this.totalChunks) * 100,
      99.99 // 不发送100%，留给上传完成事件
    );

    // 进度格式化，保留指定小数位
    const progressDecimal = this.options.progressDecimal ?? 2; // 使用空值合并操作符替代非空断言
    const formatProgress = Number(progress.toFixed(progressDecimal));

    // 节流发送进度
    const now = Date.now();
    const throttleTime = this.options.throttle ?? 200; // 使用空值合并操作符替代非空断言

    if (
      now - this.lastEmitTime >= throttleTime ||
      formatProgress - this.lastProgress >= 1 // 进度变化超过1%时立即发送
    ) {
      this.emitProgress(formatProgress);
      this.lastEmitTime = now;
      this.lastProgress = formatProgress;
    }
  }

  /**
   * 发送进度事件
   * @param progress 进度值(0-100)
   */
  private emitProgress(progress: number): void {
    if (this.uploader) {
      this.uploader.emit('progress', progress);
    }
  }
}

export default ProgressPlugin;
