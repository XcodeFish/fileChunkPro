/**
 * ProgressPlugin - 进度监控插件
 * 负责计算上传进度并触发进度事件
 */

import { UploaderCore } from '../core/UploaderCore';
import { IPlugin, ChunkInfo } from '../types';
import {
  createAdaptiveThrottle,
  detectDevicePerformanceFactor,
} from '../utils/AdaptiveThrottle';

interface ProgressPluginOptions {
  /** 初始节流时间间隔（毫秒），将被自适应调整 */
  throttle?: number;
  /** 是否使用chunk事件计算进度 */
  useChunkEvent?: boolean;
  /** 进度精度，小数点位数 */
  progressDecimal?: number;
  /** 是否使用自适应节流 */
  adaptiveThrottle?: boolean;
  /** 最小节流时间(ms) */
  minThrottle?: number;
  /** 最大节流时间(ms) */
  maxThrottle?: number;
  /** 是否记录性能数据 */
  logPerformance?: boolean;
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
  private adaptiveThrottleFn: ReturnType<typeof createAdaptiveThrottle> | null =
    null;
  private devicePerformanceFactor: number;

  /**
   * 创建进度监控插件实例
   * @param options 进度插件选项
   */
  constructor(options: ProgressPluginOptions = {}) {
    // 检测设备性能因子
    this.devicePerformanceFactor = detectDevicePerformanceFactor();

    this.options = {
      throttle: 200, // 默认200ms节流
      useChunkEvent: true,
      progressDecimal: 2, // 默认保留2位小数
      adaptiveThrottle: true, // 默认启用自适应节流
      minThrottle: 50, // 最小节流时间
      maxThrottle: 500, // 最大节流时间
      logPerformance: false, // 默认不记录性能数据
      ...options,
    };
  }

  /**
   * 安装插件
   * @param uploader 上传器实例
   */
  public install(uploader: UploaderCore): void {
    this.uploader = uploader;
    const eventBus = uploader.getEventBus();

    // 初始化自适应节流函数
    if (this.options.adaptiveThrottle) {
      this.adaptiveThrottleFn = createAdaptiveThrottle(
        this.emitProgress.bind(this),
        {
          minDelay: this.options.minThrottle,
          maxDelay: this.options.maxThrottle,
          deviceFactor: this.devicePerformanceFactor,
          logPerformance: this.options.logPerformance,
          onThrottled: delay => {
            // 当节流延迟被调整时记录
            if (this.options.logPerformance) {
              console.log(`[ProgressPlugin] 节流延迟调整为: ${delay}ms`);
            }
          },
        }
      );
    }

    // 监听分片上传成功事件
    if (this.options.useChunkEvent) {
      eventBus.on('chunkSuccess', (_data: { chunkInfo: ChunkInfo }) => {
        if (!this.activeUpload) return;
        this.uploadedChunks++;
        this.calculateAndEmitProgress();
      });
    }

    // 监听上传开始事件
    eventBus.on('uploadStart', (data: { chunks: number }) => {
      this.reset();
      this.activeUpload = true;
      this.totalChunks = data.chunks || 0;
    });

    // 监听上传完成事件
    eventBus.on('uploadSuccess', () => {
      this.emitProgress(100); // 确保完成时发送100%进度
      this.activeUpload = false;
    });

    // 监听上传失败事件
    eventBus.on('uploadError', () => {
      this.activeUpload = false;
    });

    // 监听上传暂停事件
    eventBus.on('uploadPause', () => {
      this.activeUpload = false;
    });

    // 监听上传取消事件
    eventBus.on('uploadAbort', () => {
      this.activeUpload = false;
    });
  }

  /**
   * 重置进度状态
   */
  private reset(): void {
    this.totalChunks = 0;
    this.uploadedChunks = 0;
    this.lastProgress = 0;
    this.lastEmitTime = 0;
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
    const progressDecimal = this.options.progressDecimal ?? 2;
    const formatProgress = Number(progress.toFixed(progressDecimal));

    // 使用自适应节流或传统节流发送进度
    if (this.options.adaptiveThrottle && this.adaptiveThrottleFn) {
      // 使用自适应节流函数触发进度更新
      this.adaptiveThrottleFn(formatProgress);
    } else {
      // 使用传统节流方式
      const now = Date.now();
      const throttleTime = this.options.throttle ?? 200;

      if (
        now - this.lastEmitTime >= throttleTime ||
        formatProgress - this.lastProgress >= 1 // 进度变化超过1%时立即发送
      ) {
        this.emitProgress(formatProgress);
        this.lastEmitTime = now;
        this.lastProgress = formatProgress;
      }
    }
  }

  /**
   * 发送进度事件
   * @param progress 进度值(0-100)
   */
  private emitProgress(progress: number): void {
    if (!this.uploader || !this.activeUpload) return;

    // 避免发送相同进度
    if (progress === this.lastProgress && progress !== 100) return;

    this.lastProgress = progress;

    // 发送进度事件
    const eventBus = this.uploader.getEventBus();
    eventBus.emit('progress', {
      progress,
      timestamp: Date.now(),
    });
  }
}

export default ProgressPlugin;
