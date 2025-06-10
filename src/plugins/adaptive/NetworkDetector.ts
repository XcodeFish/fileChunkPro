import {
  INetworkDetector,
  INetworkQualityResult,
  NetworkDetectorOptions,
  NetworkQualityLevel,
} from '../../types/AdaptiveUploadTypes';

/**
 * 网络质量检测器
 * 提供网络质量检测和监控功能
 */
export class NetworkDetector implements INetworkDetector {
  private options: Required<NetworkDetectorOptions>;
  private latestResult: INetworkQualityResult | null = null;
  private monitoringInterval = 0;
  private monitoringTimer: any = null;
  private networkChangeCallbacks: Array<
    (result: INetworkQualityResult) => void
  > = [];
  private isMonitoring = false;
  private sampleResults: INetworkQualityResult[] = [];
  private readonly MAX_SAMPLES = 5;

  /**
   * 网络质量检测器构造函数
   * @param options 配置选项
   */
  constructor(options?: NetworkDetectorOptions) {
    // 默认配置
    this.options = {
      speedTestUrl: 'https://www.gstatic.com/generate_204',
      testDataSize: 100 * 1024, // 100KB
      pingUrl: 'https://www.gstatic.com/generate_204',
      sampleCount: 3,
      timeout: 10000,
      autoStart: false,
      monitoringInterval: 60000, // 默认1分钟检测一次
      ...options,
    };

    if (this.options.autoStart) {
      this.startMonitoring(this.options.monitoringInterval);
    }
  }

  /**
   * 检测网络质量
   * @returns 网络质量检测结果
   */
  public async detectNetworkQuality(): Promise<INetworkQualityResult> {
    try {
      // 测量延迟
      const latency = await this.measureLatency();

      // 测量下载速度
      const downloadSpeed = await this.measureDownloadSpeed();

      // 测量上传速度
      const uploadSpeed = await this.measureUploadSpeed();

      // 检测网络稳定性
      const isUnstable = this.detectNetworkInstability();

      // 估算丢包率
      const packetLoss = await this.estimatePacketLoss();

      // 估算带宽
      const bandwidth = this.estimateBandwidth(downloadSpeed, uploadSpeed);

      // 确定网络质量等级
      const qualityLevel = this.determineQualityLevel({
        latency,
        downloadSpeed,
        uploadSpeed,
        packetLoss,
        bandwidth,
      });

      // 创建结果对象
      const result: INetworkQualityResult = {
        qualityLevel,
        downloadSpeed,
        uploadSpeed,
        latency,
        packetLoss,
        bandwidth,
        timestamp: Date.now(),
        isUnstable,
      };

      // 保存最新结果
      this.latestResult = result;

      // 添加到样本
      this.addSampleResult(result);

      // 触发回调
      this.notifyNetworkChange(result);

      return result;
    } catch (error) {
      console.error('网络质量检测失败:', error);

      // 返回降级结果
      const fallbackResult: INetworkQualityResult = {
        qualityLevel: NetworkQualityLevel.MODERATE, // 假设中等网络
        downloadSpeed: 500, // 假设500KB/s
        uploadSpeed: 200, // 假设200KB/s
        latency: 200, // 假设200ms
        timestamp: Date.now(),
        isUnstable: true,
      };

      this.latestResult = fallbackResult;
      return fallbackResult;
    }
  }

  /**
   * 开始持续监控网络质量
   * @param interval 监控间隔(毫秒)
   */
  public startMonitoring(interval: number): void {
    if (this.isMonitoring) {
      this.stopMonitoring();
    }

    this.monitoringInterval = interval;
    this.isMonitoring = true;

    // 立即执行一次检测
    this.detectNetworkQuality();

    // 设置定时器
    this.monitoringTimer = setInterval(() => {
      this.detectNetworkQuality();
    }, this.monitoringInterval);
  }

  /**
   * 停止网络监控
   */
  public stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    this.isMonitoring = false;
  }

  /**
   * 获取最近的网络质量结果
   * @returns 网络质量结果或null
   */
  public getLatestResult(): INetworkQualityResult | null {
    return this.latestResult;
  }

  /**
   * 设置网络变化回调
   * @param callback 回调函数
   */
  public onNetworkChange(
    callback: (result: INetworkQualityResult) => void
  ): void {
    this.networkChangeCallbacks.push(callback);
  }

  /**
   * 移除网络变化回调
   * @param callback 回调函数
   */
  public offNetworkChange(
    callback: (result: INetworkQualityResult) => void
  ): void {
    const index = this.networkChangeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.networkChangeCallbacks.splice(index, 1);
    }
  }

  /**
   * 清除所有网络变化回调
   */
  public clearNetworkChangeCallbacks(): void {
    this.networkChangeCallbacks = [];
  }

  /**
   * 测量网络延迟
   * @returns 延迟(毫秒)
   * @private
   */
  private async measureLatency(): Promise<number> {
    const samples: number[] = [];
    const maxSamples = this.options.sampleCount;

    for (let i = 0; i < maxSamples; i++) {
      const start = Date.now();
      try {
        await fetch(this.options.pingUrl, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          mode: 'cors',
          signal: AbortSignal.timeout(this.options.timeout),
        });
        const end = Date.now();
        samples.push(end - start);
      } catch (error) {
        console.warn('延迟测量样本失败:', error);
      }
    }

    if (samples.length === 0) {
      return 500; // 降级默认值
    }

    // 计算平均延迟（排除最高值）
    if (samples.length > 1) {
      samples.sort((a, b) => a - b);
      samples.pop(); // 去除最高值
    }

    const avgLatency =
      samples.reduce((sum, val) => sum + val, 0) / samples.length;
    return Math.round(avgLatency);
  }

  /**
   * 测量下载速度
   * @returns 下载速度(KB/s)
   * @private
   */
  private async measureDownloadSpeed(): Promise<number> {
    try {
      // 使用时间戳参数避免缓存
      const testUrl = `${this.options.speedTestUrl}?_=${Date.now()}`;
      const start = Date.now();

      const response = await fetch(testUrl, {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(this.options.timeout),
      });

      // 获取响应数据
      const data = await response.arrayBuffer();
      const end = Date.now();

      // 计算下载速度 (KB/s)
      const timeTakenSeconds = (end - start) / 1000;
      const fileSizeKB = data.byteLength / 1024;

      if (timeTakenSeconds <= 0) {
        return 1000; // 降级默认值
      }

      return Math.round(fileSizeKB / timeTakenSeconds);
    } catch (error) {
      console.warn('下载速度测量失败:', error);
      return 500; // 降级默认值
    }
  }

  /**
   * 测量上传速度
   * @returns 上传速度(KB/s)
   * @private
   */
  private async measureUploadSpeed(): Promise<number> {
    try {
      // 创建测试数据
      const testData = new ArrayBuffer(this.options.testDataSize);
      const testBlob = new Blob([testData]);

      // 使用时间戳参数避免缓存
      const testUrl = `${this.options.speedTestUrl}?_=${Date.now()}`;
      const start = Date.now();

      await fetch(testUrl, {
        method: 'POST',
        body: testBlob,
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(this.options.timeout),
      });

      const end = Date.now();

      // 计算上传速度 (KB/s)
      const timeTakenSeconds = (end - start) / 1000;
      const fileSizeKB = this.options.testDataSize / 1024;

      if (timeTakenSeconds <= 0) {
        return 800; // 降级默认值
      }

      return Math.round(fileSizeKB / timeTakenSeconds);
    } catch (error) {
      console.warn('上传速度测量失败:', error);
      return 400; // 降级默认值
    }
  }

  /**
   * 估算丢包率
   * @returns 丢包率(0-1)
   * @private
   */
  private async estimatePacketLoss(): Promise<number> {
    const testCount = 10;
    let successCount = 0;

    for (let i = 0; i < testCount; i++) {
      try {
        await fetch(`${this.options.pingUrl}?_=${Date.now() + i}`, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
          signal: AbortSignal.timeout(1000), // 快速超时
        });
        successCount++;
      } catch (error) {
        // 请求失败，视为丢包
      }
    }

    return (testCount - successCount) / testCount;
  }

  /**
   * 估算带宽
   * @param downloadSpeed 下载速度
   * @param uploadSpeed 上传速度
   * @returns 估算带宽(KB/s)
   * @private
   */
  private estimateBandwidth(
    downloadSpeed: number,
    uploadSpeed: number
  ): number {
    // 简单估算，以下载速度为主
    return Math.max(downloadSpeed, uploadSpeed * 0.8);
  }

  /**
   * 检测网络不稳定性
   * @returns 是否不稳定
   * @private
   */
  private detectNetworkInstability(): boolean {
    // 如果样本不足，无法判断稳定性
    if (this.sampleResults.length < 3) {
      return false;
    }

    // 计算延迟波动
    const latencies = this.sampleResults.map(result => result.latency);
    const avgLatency =
      latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
    const latencyVariance =
      latencies.reduce((sum, val) => sum + Math.pow(val - avgLatency, 2), 0) /
      latencies.length;
    const latencyStdDev = Math.sqrt(latencyVariance);

    // 延迟标准差超过平均值的50%，视为不稳定
    if (latencyStdDev > avgLatency * 0.5) {
      return true;
    }

    // 计算速度波动
    const speeds = this.sampleResults.map(result => result.downloadSpeed);
    const avgSpeed = speeds.reduce((sum, val) => sum + val, 0) / speeds.length;
    const speedVariance =
      speeds.reduce((sum, val) => sum + Math.pow(val - avgSpeed, 2), 0) /
      speeds.length;
    const speedStdDev = Math.sqrt(speedVariance);

    // 速度标准差超过平均值的40%，视为不稳定
    return speedStdDev > avgSpeed * 0.4;
  }

  /**
   * 确定网络质量等级
   * @param metrics 网络指标
   * @returns 网络质量等级
   * @private
   */
  private determineQualityLevel(metrics: {
    latency: number;
    downloadSpeed: number;
    uploadSpeed: number;
    packetLoss?: number;
    bandwidth?: number;
  }): NetworkQualityLevel {
    const { latency, downloadSpeed, uploadSpeed, packetLoss } = metrics;

    // 基于延迟的得分 (0-100)
    const latencyScore = this.calculateLatencyScore(latency);

    // 基于下载速度的得分 (0-100)
    const downloadScore = this.calculateDownloadScore(downloadSpeed);

    // 基于上传速度的得分 (0-100)
    const uploadScore = this.calculateUploadScore(uploadSpeed);

    // 基于丢包率的得分 (0-100)
    const packetLossScore = this.calculatePacketLossScore(packetLoss || 0);

    // 综合得分 (权重可调整)
    const totalScore =
      latencyScore * 0.3 +
      downloadScore * 0.4 +
      uploadScore * 0.2 +
      packetLossScore * 0.1;

    // 根据综合得分确定质量等级
    if (totalScore >= 80) {
      return NetworkQualityLevel.EXCELLENT;
    } else if (totalScore >= 60) {
      return NetworkQualityLevel.GOOD;
    } else if (totalScore >= 40) {
      return NetworkQualityLevel.MODERATE;
    } else if (totalScore >= 20) {
      return NetworkQualityLevel.POOR;
    } else {
      return NetworkQualityLevel.VERY_POOR;
    }
  }

  /**
   * 计算延迟得分
   * @param latency 延迟(毫秒)
   * @returns 得分(0-100)
   * @private
   */
  private calculateLatencyScore(latency: number): number {
    if (latency <= 50) return 100;
    if (latency <= 100) return 90;
    if (latency <= 150) return 80;
    if (latency <= 200) return 70;
    if (latency <= 300) return 60;
    if (latency <= 400) return 50;
    if (latency <= 500) return 40;
    if (latency <= 700) return 30;
    if (latency <= 1000) return 20;
    if (latency <= 1500) return 10;
    return 0;
  }

  /**
   * 计算下载速度得分
   * @param downloadSpeed 下载速度(KB/s)
   * @returns 得分(0-100)
   * @private
   */
  private calculateDownloadScore(downloadSpeed: number): number {
    if (downloadSpeed >= 10000) return 100; // 10MB/s
    if (downloadSpeed >= 5000) return 90; // 5MB/s
    if (downloadSpeed >= 2000) return 80; // 2MB/s
    if (downloadSpeed >= 1000) return 70; // 1MB/s
    if (downloadSpeed >= 500) return 60; // 500KB/s
    if (downloadSpeed >= 250) return 50; // 250KB/s
    if (downloadSpeed >= 100) return 40; // 100KB/s
    if (downloadSpeed >= 50) return 30; // 50KB/s
    if (downloadSpeed >= 20) return 20; // 20KB/s
    if (downloadSpeed >= 10) return 10; // 10KB/s
    return 0;
  }

  /**
   * 计算上传速度得分
   * @param uploadSpeed 上传速度(KB/s)
   * @returns 得分(0-100)
   * @private
   */
  private calculateUploadScore(uploadSpeed: number): number {
    if (uploadSpeed >= 5000) return 100; // 5MB/s
    if (uploadSpeed >= 2000) return 90; // 2MB/s
    if (uploadSpeed >= 1000) return 80; // 1MB/s
    if (uploadSpeed >= 500) return 70; // 500KB/s
    if (uploadSpeed >= 250) return 60; // 250KB/s
    if (uploadSpeed >= 100) return 50; // 100KB/s
    if (uploadSpeed >= 50) return 40; // 50KB/s
    if (uploadSpeed >= 25) return 30; // 25KB/s
    if (uploadSpeed >= 10) return 20; // 10KB/s
    if (uploadSpeed >= 5) return 10; // 5KB/s
    return 0;
  }

  /**
   * 计算丢包率得分
   * @param packetLoss 丢包率(0-1)
   * @returns 得分(0-100)
   * @private
   */
  private calculatePacketLossScore(packetLoss: number): number {
    if (packetLoss <= 0.01) return 100; // 1%以下
    if (packetLoss <= 0.02) return 90; // 2%以下
    if (packetLoss <= 0.05) return 80; // 5%以下
    if (packetLoss <= 0.1) return 60; // 10%以下
    if (packetLoss <= 0.15) return 40; // 15%以下
    if (packetLoss <= 0.2) return 20; // 20%以下
    if (packetLoss <= 0.3) return 10; // 30%以下
    return 0;
  }

  /**
   * 添加样本结果
   * @param result 网络质量结果
   * @private
   */
  private addSampleResult(result: INetworkQualityResult): void {
    this.sampleResults.push(result);

    // 保持样本数量限制
    if (this.sampleResults.length > this.MAX_SAMPLES) {
      this.sampleResults.shift();
    }
  }

  /**
   * 通知网络变化
   * @param result 网络质量结果
   * @private
   */
  private notifyNetworkChange(result: INetworkQualityResult): void {
    this.networkChangeCallbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        console.error('网络变化回调执行失败:', error);
      }
    });
  }
}
