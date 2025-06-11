/**
 * DeviceCapabilityDetector - 设备能力检测工具
 * 提供更精确的设备性能检测，特别关注低配置设备识别和优化
 */

import { CapabilityLevel } from '../types';
import { Logger } from './Logger';

export interface DeviceMemoryInfo {
  totalMemory?: number; // 总内存(MB)
  deviceMemory?: number; // Device Memory API返回值(GB)
  jsHeapLimit?: number; // JS堆内存限制(B)
  estimatedTier: 'low' | 'medium' | 'high'; // 估计的内存等级
  isLowMemoryDevice: boolean; // 是否为低内存设备
}

export interface ProcessorInfo {
  hardwareConcurrency?: number; // 硬件并发数
  estimatedPerformance?: number; // 性能估计值(0-100)
  estimatedTier: 'low' | 'medium' | 'high'; // 估计的处理器等级
  isLowPowerDevice: boolean; // 是否为低性能设备
}

export interface DeviceProfile {
  memory: DeviceMemoryInfo;
  processor: ProcessorInfo;
  batteryStatus?: {
    level: number; // 电池电量(0-1)
    charging: boolean; // 是否充电中
    chargingTime?: number; // 充满所需时间(s)
    dischargingTime?: number; // 剩余可用时间(s)
  };
  screenInfo: {
    width: number;
    height: number;
    pixelRatio: number;
    isHighResolution: boolean;
  };
  lowEndDevice: boolean; // 综合判断是否为低端设备
  recommendedSettings: {
    // 推荐设置
    maxConcurrency: number; // 推荐最大并发数
    chunkSize: number; // 推荐分片大小
    useWorker: boolean; // 是否使用Worker
    memoryOptimizations: boolean; // 是否启用内存优化
    progressInterval: number; // 进度更新间隔
  };
}

/**
 * 设备能力检测类，优化对低配置设备的识别
 */
export class DeviceCapabilityDetector {
  private static instance: DeviceCapabilityDetector;
  private logger: Logger;
  private cachedProfile: DeviceProfile | null = null;

  // 性能基准测试结果缓存
  private benchmarkResults: {
    processingSpeed?: number; // 处理速度(MB/s)
    parsingSpeed?: number; // 解析速度(MB/s)
    renderingRate?: number; // 渲染性能(fps)
  } = {};

  // 已知低端设备型号匹配
  private readonly LOW_END_DEVICE_PATTERNS = [
    /iPhone\s(5S?|6|7|SE)/i, // 旧款iPhone
    /iPad\s(Mini|Air\s1)/i, // 旧款iPad
    /Android.*SM-[GJ][0-9]{3}[0-6]/i, // 低端三星设备
    /Android.*Moto\s[GE]/i, // 低端Moto设备
    /Android.*Redmi\s[1-6]/i, // 低端红米设备
    /Android.*HUAWEI\sMT[0-7]/i, // 低端华为设备
  ];

  // 已知CPU型号与能力映射
  private readonly CPU_CAPABILITY_MAP: Record<string, CapabilityLevel> = {
    'apple a7': 'low',
    'apple a8': 'low',
    'apple a9': 'medium',
    'apple a10': 'medium',
    'apple a11': 'high',
    'exynos 7570': 'low',
    'exynos 7870': 'low',
    'snapdragon 410': 'low',
    'snapdragon 425': 'low',
    'snapdragon 430': 'low',
    'snapdragon 450': 'low',
    'snapdragon 625': 'medium',
    'snapdragon 652': 'medium',
    'snapdragon 820': 'medium',
    'snapdragon 835': 'high',
    'snapdragon 845': 'high',
    'kirin 650': 'low',
    'kirin 655': 'low',
    'kirin 659': 'low',
    'kirin 710': 'medium',
    'kirin 970': 'high',
    'mediatek mt6735': 'low',
    'mediatek mt6750': 'low',
    'mediatek mt6757': 'medium',
    'mediatek helio p60': 'medium',
    'mediatek helio x20': 'medium',
    'intel atom': 'low',
    'intel celeron': 'low',
  };

  /**
   * 获取DeviceCapabilityDetector单例
   */
  public static getInstance(): DeviceCapabilityDetector {
    if (!DeviceCapabilityDetector.instance) {
      DeviceCapabilityDetector.instance = new DeviceCapabilityDetector();
    }
    return DeviceCapabilityDetector.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this.logger = new Logger('DeviceCapabilityDetector');
  }

  /**
   * 获取设备详细能力配置，增强对低配置设备的识别
   */
  public async detectDeviceProfile(): Promise<DeviceProfile> {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }

    const memoryInfo = this.detectMemoryCapabilities();
    const processorInfo = await this.detectProcessorCapabilities();
    const screenInfo = this.getScreenInfo();
    const batteryStatus = await this.getBatteryStatus();

    // 检查是否匹配已知的低端设备型号
    const isKnownLowEndDevice = this.isKnownLowEndDevice();

    // 综合判断是否为低端设备
    const lowEndDevice =
      isKnownLowEndDevice ||
      memoryInfo.isLowMemoryDevice ||
      processorInfo.isLowPowerDevice;

    // 根据设备能力生成推荐设置
    const recommendedSettings = this.generateRecommendedSettings(
      memoryInfo,
      processorInfo,
      batteryStatus,
      lowEndDevice
    );

    const profile: DeviceProfile = {
      memory: memoryInfo,
      processor: processorInfo,
      batteryStatus,
      screenInfo,
      lowEndDevice,
      recommendedSettings,
    };

    this.cachedProfile = profile;
    return profile;
  }

  /**
   * 检测内存能力
   */
  private detectMemoryCapabilities(): DeviceMemoryInfo {
    let totalMemory: number | undefined;
    let deviceMemory: number | undefined;
    let jsHeapLimit: number | undefined;

    try {
      // 尝试通过Performance API获取内存信息
      if (
        typeof performance !== 'undefined' &&
        'memory' in performance &&
        // @ts-ignore - performance.memory在标准中不存在，但Chrome支持
        performance.memory
      ) {
        // @ts-ignore
        jsHeapLimit = performance.memory.jsHeapSizeLimit;
      }

      // 尝试通过Device Memory API获取内存信息
      if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
        // @ts-ignore - deviceMemory在标准中不存在，但Chrome支持
        deviceMemory = navigator.deviceMemory;
      }
    } catch (error) {
      this.logger.warn('获取内存信息失败', error);
    }

    // 确定内存等级
    let estimatedTier: 'low' | 'medium' | 'high' = 'medium';

    if (deviceMemory !== undefined) {
      // Device Memory API返回的是GB单位
      if (deviceMemory <= 1) {
        estimatedTier = 'low';
      } else if (deviceMemory <= 4) {
        estimatedTier = 'medium';
      } else {
        estimatedTier = 'high';
      }
    } else if (jsHeapLimit !== undefined) {
      // JS堆内存限制通常是MB或GB级别
      const heapLimitMB = jsHeapLimit / (1024 * 1024);
      if (heapLimitMB < 512) {
        estimatedTier = 'low';
      } else if (heapLimitMB < 2048) {
        estimatedTier = 'medium';
      } else {
        estimatedTier = 'high';
      }
    } else {
      // 如果没有可靠的内存信息，尝试通过其他方式估计
      const userAgent = navigator.userAgent;

      // 检查是否为旧款/低端移动设备
      if (
        /iPhone\s(5S?|6|SE)/i.test(userAgent) ||
        /Android.*([45]\.0|4\.4)/i.test(userAgent)
      ) {
        estimatedTier = 'low';
      }

      // 检查是否为较新的移动设备
      else if (
        /iPhone\s(X|1[0-9])/i.test(userAgent) ||
        /Android.*([89]\.0|1[0-9]\.0)/i.test(userAgent)
      ) {
        estimatedTier = 'high';
      }
    }

    // 判断是否为低内存设备
    const isLowMemoryDevice = estimatedTier === 'low';

    return {
      totalMemory,
      deviceMemory,
      jsHeapLimit,
      estimatedTier,
      isLowMemoryDevice,
    };
  }

  /**
   * 检测处理器能力
   */
  private async detectProcessorCapabilities(): Promise<ProcessorInfo> {
    let hardwareConcurrency: number | undefined;
    let estimatedPerformance: number | undefined;

    try {
      // 检查硬件并发数
      if (
        typeof navigator !== 'undefined' &&
        'hardwareConcurrency' in navigator
      ) {
        hardwareConcurrency = navigator.hardwareConcurrency;
      }

      // 运行简单的性能测试
      estimatedPerformance = await this.runPerformanceTest();
    } catch (error) {
      this.logger.warn('获取处理器信息失败', error);
    }

    // 确定处理器等级
    let estimatedTier: 'low' | 'medium' | 'high' = 'medium';

    if (hardwareConcurrency !== undefined) {
      if (hardwareConcurrency <= 2) {
        estimatedTier = 'low';
      } else if (hardwareConcurrency <= 4) {
        estimatedTier = 'medium';
      } else {
        estimatedTier = 'high';
      }
    }

    // 如果有性能测试结果，根据测试结果调整等级
    if (estimatedPerformance !== undefined) {
      if (estimatedPerformance < 30) {
        estimatedTier = 'low';
      } else if (estimatedPerformance < 60) {
        estimatedTier = 'medium';
      } else {
        estimatedTier = 'high';
      }
    }

    // 检查是否为低性能设备
    const isLowPowerDevice = this.detectIsLowPowerDevice(
      estimatedTier,
      hardwareConcurrency
    );

    return {
      hardwareConcurrency,
      estimatedPerformance,
      estimatedTier,
      isLowPowerDevice,
    };
  }

  /**
   * 运行简易性能测试
   */
  private async runPerformanceTest(): Promise<number> {
    // 如果已经有测试结果，直接返回
    if (this.benchmarkResults.processingSpeed !== undefined) {
      return this.benchmarkResults.processingSpeed;
    }

    return new Promise<number>(resolve => {
      // 计算开始时间
      const startTime = performance.now();

      // 执行计算密集型操作
      const iterations = 5000000;
      let result = 0;

      for (let i = 0; i < iterations; i++) {
        result += Math.sqrt(i * Math.sin(i) * Math.cos(i));
      }

      // 计算结束时间
      const endTime = performance.now();
      const duration = endTime - startTime;

      // 计算性能得分 (0-100)，时间越短越好
      // 归一化处理: 10ms为100分，2000ms为0分
      const score = Math.max(0, Math.min(100, 100 - (duration - 10) / 20));

      // 缓存结果
      this.benchmarkResults.processingSpeed = score;

      // 防止优化编译器移除计算
      if (result === 0) {
        console.log('Performance test completed');
      }

      resolve(score);
    });
  }

  /**
   * 获取屏幕信息
   */
  private getScreenInfo() {
    const width = typeof screen !== 'undefined' ? screen.width : 0;
    const height = typeof screen !== 'undefined' ? screen.height : 0;
    const pixelRatio =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // 高分辨率屏幕可能需要更多资源
    const isHighResolution = pixelRatio > 1.5 || width * height > 1920 * 1080;

    return {
      width,
      height,
      pixelRatio,
      isHighResolution,
    };
  }

  /**
   * 获取电池状态
   */
  private async getBatteryStatus() {
    try {
      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        // @ts-ignore - getBattery在标准中不存在，但部分浏览器支持
        const battery = await navigator.getBattery();

        return {
          level: battery.level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        };
      }
    } catch (error) {
      this.logger.debug('获取电池信息失败', error);
    }

    return undefined;
  }

  /**
   * 检查是否为已知的低端设备
   */
  private isKnownLowEndDevice(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    const userAgent = navigator.userAgent;

    // 检查是否匹配已知的低端设备型号
    return this.LOW_END_DEVICE_PATTERNS.some(pattern =>
      pattern.test(userAgent)
    );
  }

  /**
   * 检查是否为低性能设备
   */
  private detectIsLowPowerDevice(
    estimatedTier: 'low' | 'medium' | 'high',
    hardwareConcurrency?: number
  ): boolean {
    // 检查是否为低端处理器
    if (estimatedTier === 'low') {
      return true;
    }

    // 检查是否为低核心数设备
    if (hardwareConcurrency !== undefined && hardwareConcurrency <= 2) {
      return true;
    }

    // 检查CPU型号
    const cpuInfo = this.detectCPUInfo();
    if (cpuInfo && this.CPU_CAPABILITY_MAP[cpuInfo.toLowerCase()] === 'low') {
      return true;
    }

    return false;
  }

  /**
   * 尝试检测CPU信息
   */
  private detectCPUInfo(): string | null {
    const userAgent =
      typeof navigator !== 'undefined' ? navigator.userAgent : '';

    // 从User Agent尝试提取CPU信息
    // 例如：iPhone10,1 = iPhone 8 = Apple A11
    // 或 SM-G950F = Samsung Galaxy S8 = Exynos 8895

    let cpuInfo = null;

    // iPhone设备芯片映射
    if (/iPhone/i.test(userAgent)) {
      if (/iPhone\s*1[12]/i.test(userAgent)) {
        cpuInfo = 'Apple A12';
      } else if (/iPhone\s*X/i.test(userAgent)) {
        cpuInfo = 'Apple A11';
      } else if (/iPhone\s*[78]/i.test(userAgent)) {
        cpuInfo = 'Apple A10';
      } else if (/iPhone\s*[56]/i.test(userAgent)) {
        cpuInfo = 'Apple A9';
      } else if (/iPhone\s*5/i.test(userAgent)) {
        cpuInfo = 'Apple A7';
      }
    }

    return cpuInfo;
  }

  /**
   * 生成推荐设置
   */
  private generateRecommendedSettings(
    memoryInfo: DeviceMemoryInfo,
    processorInfo: ProcessorInfo,
    batteryStatus?: {
      level: number;
      charging: boolean;
    },
    lowEndDevice?: boolean
  ) {
    // 默认推荐设置
    const settings = {
      maxConcurrency: 3,
      chunkSize: 2 * 1024 * 1024, // 2MB
      useWorker: true,
      memoryOptimizations: false,
      progressInterval: 300, // 默认进度回调间隔(ms)
    };

    // 低端设备配置
    if (lowEndDevice) {
      settings.maxConcurrency = 1;
      settings.chunkSize = 512 * 1024; // 512KB
      settings.progressInterval = 1000; // 降低进度更新频率以减少UI压力
      settings.memoryOptimizations = true;
    }
    // 中端设备配置
    else if (
      memoryInfo.estimatedTier === 'medium' ||
      processorInfo.estimatedTier === 'medium'
    ) {
      settings.maxConcurrency = 2;
      settings.chunkSize = 1 * 1024 * 1024; // 1MB
      settings.memoryOptimizations = false;
    }
    // 高端设备配置
    else {
      settings.maxConcurrency = 4;
      settings.chunkSize = 4 * 1024 * 1024; // 4MB
      settings.memoryOptimizations = false;
    }

    // 根据电池状态调整
    if (batteryStatus && batteryStatus.level < 0.2 && !batteryStatus.charging) {
      // 电池电量低且未充电，降低资源消耗
      settings.maxConcurrency = Math.max(1, settings.maxConcurrency - 1);
      settings.progressInterval *= 2; // 降低进度更新频率
    }

    // 检查处理器能力决定是否使用Worker
    if (
      processorInfo.estimatedTier === 'low' ||
      processorInfo.hardwareConcurrency === 1
    ) {
      // 对于单核或低性能处理器，Worker可能导致性能下降
      settings.useWorker = false;
    }

    return settings;
  }

  /**
   * 根据文件大小调整推荐设置
   * @param fileSize 文件大小(bytes)
   * @returns 调整后的推荐设置
   */
  public async getOptimizedSettingsForFile(
    fileSize: number
  ): Promise<Record<string, any>> {
    const profile = await this.detectDeviceProfile();
    const settings = { ...profile.recommendedSettings };

    // 对非常小的文件，减小分片大小并减少并发数
    if (fileSize < 1024 * 1024) {
      // < 1MB
      settings.chunkSize = Math.min(settings.chunkSize, 256 * 1024); // 最大256KB
      settings.maxConcurrency = 1;
    }
    // 对大文件，根据设备能力调整分片大小
    else if (fileSize > 100 * 1024 * 1024) {
      // > 100MB
      if (profile.lowEndDevice) {
        // 低端设备处理大文件
        settings.chunkSize = 1 * 1024 * 1024; // 固定1MB分片
        settings.maxConcurrency = 1;
      } else if (profile.memory.estimatedTier === 'high') {
        // 高内存设备可以使用较大分片
        settings.chunkSize = 8 * 1024 * 1024; // 8MB
      }
    }

    return settings;
  }

  /**
   * 重置缓存的设备能力信息
   */
  public resetCache(): void {
    this.cachedProfile = null;
    this.benchmarkResults = {};
  }
}

export default DeviceCapabilityDetector;
