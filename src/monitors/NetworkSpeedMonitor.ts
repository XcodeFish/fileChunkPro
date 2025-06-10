/**
 * NetworkSpeedMonitor - 网络速度监测器
 *
 * 功能：
 * 1. 测量下载速度
 * 2. 测量上传速度
 * 3. 记录并计算平均速度
 * 4. 速度样本收集与处理
 * 5. 带宽估算
 */

import { Logger } from '../utils/Logger';

export interface SpeedTestResult {
  downloadSpeed: number; // KB/s
  uploadSpeed: number; // KB/s
  latency: number; // ms
  timestamp: number; // 测试时间
  dataSize: number; // 测试的数据大小(KB)
}

export interface SpeedSample {
  timestamp: number; // 采样时间
  speed: number; // 速度 (KB/s)
  direction: 'upload' | 'download'; // 上传或下载
  dataSize: number; // 数据大小(KB)
  latency?: number; // 延迟(ms)
}

export class NetworkSpeedMonitor {
  private logger: Logger;

  private readonly MAX_SAMPLES = 50; // 最大样本数
  private speedSamples: SpeedSample[] = [];

  // 存储平均速度数据
  private averageUploadSpeed = 0; // KB/s
  private averageDownloadSpeed = 0; // KB/s
  private currentUploadSpeed = 0; // KB/s
  private currentDownloadSpeed = 0; // KB/s
  private uploadBandwidth = 0; // KB/s
  private downloadBandwidth = 0; // KB/s
  private averageLatency = 0; // ms

  private readonly SPEED_DECAY_FACTOR = 0.8; // 指数衰减因子

  constructor() {
    this.logger = new Logger('NetworkSpeedMonitor');
  }

  /**
   * 添加速度样本
   * @param sample 速度样本
   */
  public addSpeedSample(sample: SpeedSample): void {
    // 添加新样本到队列
    this.speedSamples.push(sample);

    // 如果超出最大样本数，移除最早的样本
    if (this.speedSamples.length > this.MAX_SAMPLES) {
      this.speedSamples.shift();
    }

    // 更新平均速度
    this.updateAverages();

    this.logger.debug('添加速度样本', {
      direction: sample.direction,
      speed: sample.speed,
      avgUpload: this.averageUploadSpeed,
      avgDownload: this.averageDownloadSpeed,
    });
  }

  /**
   * 更新平均速度
   */
  private updateAverages(): void {
    const uploadSamples = this.speedSamples.filter(
      sample => sample.direction === 'upload'
    );
    const downloadSamples = this.speedSamples.filter(
      sample => sample.direction === 'download'
    );

    // 只用最近的样本计算当前速度
    if (uploadSamples.length > 0) {
      this.currentUploadSpeed = this.calculateRecentSpeed(uploadSamples, 3);
    }

    if (downloadSamples.length > 0) {
      this.currentDownloadSpeed = this.calculateRecentSpeed(downloadSamples, 3);
    }

    // 计算总平均速度
    if (uploadSamples.length > 0) {
      this.averageUploadSpeed = this.calculateAverageSpeed(uploadSamples);
    }

    if (downloadSamples.length > 0) {
      this.averageDownloadSpeed = this.calculateAverageSpeed(downloadSamples);
    }

    // 计算平均延迟
    const latencySamples = this.speedSamples.filter(
      sample => sample.latency !== undefined
    );
    if (latencySamples.length > 0) {
      this.averageLatency =
        latencySamples.reduce((sum, sample) => sum + (sample.latency || 0), 0) /
        latencySamples.length;
    }

    // 更新带宽估计
    this.estimateBandwidth();
  }

  /**
   * 计算最近样本的平均速度
   * @param samples 速度样本
   * @param count 最近几个样本
   * @returns 平均速度
   */
  private calculateRecentSpeed(samples: SpeedSample[], count: number): number {
    if (samples.length === 0) {
      return 0;
    }

    // 按时间排序，获取最近几个样本
    const sortedSamples = [...samples].sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const recentSamples = sortedSamples.slice(
      0,
      Math.min(count, sortedSamples.length)
    );

    // 计算平均速度
    return (
      recentSamples.reduce((sum, sample) => sum + sample.speed, 0) /
      recentSamples.length
    );
  }

  /**
   * 计算平均速度(带权重)
   * @param samples 速度样本
   * @returns 平均速度
   */
  private calculateAverageSpeed(samples: SpeedSample[]): number {
    if (samples.length === 0) {
      return 0;
    }

    // 按时间排序
    const sortedSamples = [...samples].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // 使用指数加权平均，新样本权重更大
    let weightedSum = 0;
    let weightSum = 0;
    let weight = 1.0;

    for (const sample of sortedSamples) {
      weightedSum += sample.speed * weight;
      weightSum += weight;
      weight *= this.SPEED_DECAY_FACTOR;
    }

    return weightedSum / weightSum;
  }

  /**
   * 估算网络带宽
   * 带宽通常高于平均速度，使用样本中的最高速度并考虑稳定性
   */
  private estimateBandwidth(): void {
    // 如果样本数量太少，我们使用保守估计
    if (this.speedSamples.length < 3) {
      this.uploadBandwidth = this.averageUploadSpeed * 1.2;
      this.downloadBandwidth = this.averageDownloadSpeed * 1.2;
      return;
    }

    const uploadSamples = this.speedSamples.filter(
      sample => sample.direction === 'upload'
    );
    const downloadSamples = this.speedSamples.filter(
      sample => sample.direction === 'download'
    );

    // 上传带宽估算：使用最快3个样本的平均值并加上余量
    if (uploadSamples.length > 0) {
      const sortedUploadSamples = [...uploadSamples].sort(
        (a, b) => b.speed - a.speed
      );
      const fastUploadSamples = sortedUploadSamples.slice(
        0,
        Math.min(3, sortedUploadSamples.length)
      );
      const fastUploadAvg =
        fastUploadSamples.reduce((sum, sample) => sum + sample.speed, 0) /
        fastUploadSamples.length;

      // 平滑更新，避免带宽估计大幅波动
      this.uploadBandwidth =
        this.uploadBandwidth === 0
          ? fastUploadAvg * 1.1 // 初次估计带宽加10%余量
          : this.uploadBandwidth * 0.7 + fastUploadAvg * 1.1 * 0.3; // 权重更新
    }

    // 下载带宽估算：类似逻辑
    if (downloadSamples.length > 0) {
      const sortedDownloadSamples = [...downloadSamples].sort(
        (a, b) => b.speed - a.speed
      );
      const fastDownloadSamples = sortedDownloadSamples.slice(
        0,
        Math.min(3, sortedDownloadSamples.length)
      );
      const fastDownloadAvg =
        fastDownloadSamples.reduce((sum, sample) => sum + sample.speed, 0) /
        fastDownloadSamples.length;

      this.downloadBandwidth =
        this.downloadBandwidth === 0
          ? fastDownloadAvg * 1.1
          : this.downloadBandwidth * 0.7 + fastDownloadAvg * 1.1 * 0.3;
    }
  }

  /**
   * 获取当前上传速度
   * @returns 当前上传速度 (KB/s)
   */
  public getCurrentUploadSpeed(): number {
    return this.currentUploadSpeed;
  }

  /**
   * 获取当前下载速度
   * @returns 当前下载速度 (KB/s)
   */
  public getCurrentDownloadSpeed(): number {
    return this.currentDownloadSpeed;
  }

  /**
   * 获取平均上传速度
   * @returns 平均上传速度 (KB/s)
   */
  public getAverageUploadSpeed(): number {
    return this.averageUploadSpeed;
  }

  /**
   * 获取平均下载速度
   * @returns 平均下载速度 (KB/s)
   */
  public getAverageDownloadSpeed(): number {
    return this.averageDownloadSpeed;
  }

  /**
   * 获取上传带宽估计值
   * @returns 估计的上传带宽 (KB/s)
   */
  public getUploadBandwidth(): number {
    return this.uploadBandwidth;
  }

  /**
   * 获取下载带宽估计值
   * @returns 估计的下载带宽 (KB/s)
   */
  public getDownloadBandwidth(): number {
    return this.downloadBandwidth;
  }

  /**
   * 获取平均延迟
   * @returns 平均延迟 (ms)
   */
  public getAverageLatency(): number {
    return this.averageLatency;
  }

  /**
   * 获取全部速度样本
   * @returns 速度样本数组
   */
  public getSpeedSamples(): SpeedSample[] {
    return [...this.speedSamples];
  }

  /**
   * 清除所有样本
   */
  public clearSamples(): void {
    this.speedSamples = [];
    this.logger.debug('已清除所有速度样本');
  }

  /**
   * 进行速度测试（模拟实现）
   * 实际应用中，这应该发送真实的网络请求来测量速度
   * @param testUrl 测试用URL
   * @param dataSize 测试数据大小(KB)
   * @returns 测试结果Promise
   */
  public async runSpeedTest(
    testUrl: string,
    dataSize = 100
  ): Promise<SpeedTestResult> {
    this.logger.info('开始网络速度测试', { testUrl, dataSize });

    try {
      // 模拟发送网络请求
      // 实际应用中，这里应该是一个真实的网络请求，记录时间和大小
      const testResult = await this.simulateSpeedTest(testUrl, dataSize);

      // 记录结果
      const uploadSample: SpeedSample = {
        timestamp: Date.now(),
        speed: testResult.uploadSpeed,
        direction: 'upload',
        dataSize,
        latency: testResult.latency,
      };

      const downloadSample: SpeedSample = {
        timestamp: Date.now(),
        speed: testResult.downloadSpeed,
        direction: 'download',
        dataSize,
        latency: testResult.latency,
      };

      // 添加样本
      this.addSpeedSample(uploadSample);
      this.addSpeedSample(downloadSample);

      this.logger.info('速度测试完成', {
        downloadSpeed: testResult.downloadSpeed.toFixed(2) + ' KB/s',
        uploadSpeed: testResult.uploadSpeed.toFixed(2) + ' KB/s',
        latency: testResult.latency.toFixed(0) + ' ms',
      });

      return testResult;
    } catch (error) {
      this.logger.error('速度测试失败', { testUrl, error });
      throw error;
    }
  }

  /**
   * 模拟速度测试
   * 实际应用中应替换为真实的网络请求测量
   */
  private async simulateSpeedTest(
    testUrl: string,
    dataSize: number
  ): Promise<SpeedTestResult> {
    // 这里只是模拟，实际应用中需要真实测量
    return new Promise(resolve => {
      setTimeout(() => {
        // 模拟测试结果
        const downloadSpeed = Math.floor(Math.random() * 5000) + 500; // 500-5500 KB/s
        const uploadSpeed = Math.floor(Math.random() * 2000) + 200; // 200-2200 KB/s
        const latency = Math.floor(Math.random() * 150) + 20; // 20-170 ms

        resolve({
          downloadSpeed,
          uploadSpeed,
          latency,
          timestamp: Date.now(),
          dataSize,
        });
      }, 500); // 延迟500ms表示测试时间
    });
  }
}

export default NetworkSpeedMonitor;
