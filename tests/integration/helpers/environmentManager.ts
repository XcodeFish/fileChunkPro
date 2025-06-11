/**
 * 集成测试环境管理器
 * 用于模拟和测试不同的运行环境
 */
import { vi } from 'vitest';
import { NetworkQuality } from '../../../src/types';

// 环境类型
export type EnvironmentType =
  | 'browser'
  | 'wechat'
  | 'alipay'
  | 'bytedance'
  | 'baidu'
  | 'taro'
  | 'uni-app';

// 环境配置
export interface EnvironmentConfig {
  name: EnvironmentType;
  features: {
    supportWebWorker: boolean;
    supportSharedArrayBuffer: boolean;
    supportBlobConstructor: boolean;
    supportFileReader: boolean;
    supportProgressEvent: boolean;
    supportStreams: boolean;
    supportCryptoSubtle: boolean;
  };
  memory: {
    isLowMemory: boolean;
    isLowMemoryDevice: boolean;
    isLowPowerDevice: boolean;
    memoryStats: {
      usage: number;
      limit: number;
      usageRatio: number;
    };
  };
  network: {
    quality: NetworkQuality;
    type: string;
    downlink: number;
    rtt: number;
  };
}

// 预定义环境
export const predefinedEnvironments: Record<
  EnvironmentType,
  EnvironmentConfig
> = {
  browser: {
    name: 'browser',
    features: {
      supportWebWorker: true,
      supportSharedArrayBuffer: true,
      supportBlobConstructor: true,
      supportFileReader: true,
      supportProgressEvent: true,
      supportStreams: true,
      supportCryptoSubtle: true,
    },
    memory: {
      isLowMemory: false,
      isLowMemoryDevice: false,
      isLowPowerDevice: false,
      memoryStats: {
        usage: 100 * 1024 * 1024, // 100MB
        limit: 2 * 1024 * 1024 * 1024, // 2GB
        usageRatio: 0.05,
      },
    },
    network: {
      quality: 'good',
      type: 'wifi',
      downlink: 10,
      rtt: 50,
    },
  },
  wechat: {
    name: 'wechat',
    features: {
      supportWebWorker: false,
      supportSharedArrayBuffer: false,
      supportBlobConstructor: true,
      supportFileReader: true,
      supportProgressEvent: true,
      supportStreams: false,
      supportCryptoSubtle: false,
    },
    memory: {
      isLowMemory: false,
      isLowMemoryDevice: true,
      isLowPowerDevice: true,
      memoryStats: {
        usage: 60 * 1024 * 1024, // 60MB
        limit: 250 * 1024 * 1024, // 250MB
        usageRatio: 0.24,
      },
    },
    network: {
      quality: 'good',
      type: 'wifi',
      downlink: 8,
      rtt: 80,
    },
  },
  alipay: {
    name: 'alipay',
    features: {
      supportWebWorker: false,
      supportSharedArrayBuffer: false,
      supportBlobConstructor: true,
      supportFileReader: true,
      supportProgressEvent: true,
      supportStreams: false,
      supportCryptoSubtle: false,
    },
    memory: {
      isLowMemory: false,
      isLowMemoryDevice: true,
      isLowPowerDevice: true,
      memoryStats: {
        usage: 65 * 1024 * 1024, // 65MB
        limit: 280 * 1024 * 1024, // 280MB
        usageRatio: 0.23,
      },
    },
    network: {
      quality: 'good',
      type: 'wifi',
      downlink: 7,
      rtt: 90,
    },
  },
  bytedance: {
    name: 'bytedance',
    features: {
      supportWebWorker: false,
      supportSharedArrayBuffer: false,
      supportBlobConstructor: true,
      supportFileReader: true,
      supportProgressEvent: true,
      supportStreams: false,
      supportCryptoSubtle: false,
    },
    memory: {
      isLowMemory: false,
      isLowMemoryDevice: true,
      isLowPowerDevice: true,
      memoryStats: {
        usage: 55 * 1024 * 1024, // 55MB
        limit: 230 * 1024 * 1024, // 230MB
        usageRatio: 0.24,
      },
    },
    network: {
      quality: 'good',
      type: 'wifi',
      downlink: 7,
      rtt: 85,
    },
  },
  baidu: {
    name: 'baidu',
    features: {
      supportWebWorker: false,
      supportSharedArrayBuffer: false,
      supportBlobConstructor: true,
      supportFileReader: true,
      supportProgressEvent: true,
      supportStreams: false,
      supportCryptoSubtle: false,
    },
    memory: {
      isLowMemory: false,
      isLowMemoryDevice: true,
      isLowPowerDevice: true,
      memoryStats: {
        usage: 50 * 1024 * 1024, // 50MB
        limit: 200 * 1024 * 1024, // 200MB
        usageRatio: 0.25,
      },
    },
    network: {
      quality: 'fair',
      type: 'wifi',
      downlink: 6,
      rtt: 100,
    },
  },
  taro: {
    name: 'taro',
    features: {
      supportWebWorker: false,
      supportSharedArrayBuffer: false,
      supportBlobConstructor: true,
      supportFileReader: true,
      supportProgressEvent: true,
      supportStreams: false,
      supportCryptoSubtle: false,
    },
    memory: {
      isLowMemory: false,
      isLowMemoryDevice: true,
      isLowPowerDevice: true,
      memoryStats: {
        usage: 60 * 1024 * 1024, // 60MB
        limit: 240 * 1024 * 1024, // 240MB
        usageRatio: 0.25,
      },
    },
    network: {
      quality: 'fair',
      type: '4g',
      downlink: 5,
      rtt: 110,
    },
  },
  'uni-app': {
    name: 'uni-app',
    features: {
      supportWebWorker: false,
      supportSharedArrayBuffer: false,
      supportBlobConstructor: true,
      supportFileReader: true,
      supportProgressEvent: true,
      supportStreams: false,
      supportCryptoSubtle: false,
    },
    memory: {
      isLowMemory: false,
      isLowMemoryDevice: true,
      isLowPowerDevice: true,
      memoryStats: {
        usage: 62 * 1024 * 1024, // 62MB
        limit: 245 * 1024 * 1024, // 245MB
        usageRatio: 0.25,
      },
    },
    network: {
      quality: 'fair',
      type: '4g',
      downlink: 4.8,
      rtt: 120,
    },
  },
};

// 当前活动环境
let activeEnvironment: EnvironmentConfig | null = null;

// 备份的全局对象
const globalBackups: Record<string, any> = {};

/**
 * 应用环境配置
 * @param config 环境配置
 */
export function applyEnvironment(config: EnvironmentConfig): void {
  // 备份并清除当前环境
  if (activeEnvironment) {
    resetEnvironment();
  }

  // 设置当前环境
  activeEnvironment = config;

  // 应用特性
  if (typeof window !== 'undefined') {
    // Worker支持
    if (!config.features.supportWebWorker) {
      globalBackups.Worker = window.Worker;
      delete (window as any).Worker;
    }

    // SharedArrayBuffer支持
    if (!config.features.supportSharedArrayBuffer) {
      globalBackups.SharedArrayBuffer = window.SharedArrayBuffer;
      delete (window as any).SharedArrayBuffer;
    }

    // Blob构造函数
    if (!config.features.supportBlobConstructor) {
      globalBackups.Blob = window.Blob;
      delete (window as any).Blob;
    }

    // FileReader
    if (!config.features.supportFileReader) {
      globalBackups.FileReader = window.FileReader;
      delete (window as any).FileReader;
    }

    // ProgressEvent
    if (!config.features.supportProgressEvent) {
      globalBackups.ProgressEvent = window.ProgressEvent;
      delete (window as any).ProgressEvent;
    }

    // Streams API
    if (!config.features.supportStreams && window.ReadableStream) {
      globalBackups.ReadableStream = window.ReadableStream;
      globalBackups.WritableStream = window.WritableStream;
      globalBackups.TransformStream = window.TransformStream;
      delete (window as any).ReadableStream;
      delete (window as any).WritableStream;
      delete (window as any).TransformStream;
    }

    // Crypto Subtle
    if (!config.features.supportCryptoSubtle && window.crypto?.subtle) {
      globalBackups.cryptoSubtle = window.crypto.subtle;
      delete (window.crypto as any).subtle;
    }
  }

  // 应用内存配置
  if (typeof global !== 'undefined' && (global as any).MemoryManager) {
    const MM = (global as any).MemoryManager;

    // 模拟内存管理器方法
    vi.spyOn(MM, 'isLowMemory').mockImplementation(
      () => config.memory.isLowMemory
    );
    vi.spyOn(MM, 'isLowMemoryDevice').mockImplementation(
      () => config.memory.isLowMemoryDevice
    );
    vi.spyOn(MM, 'isLowPowerDevice').mockImplementation(
      () => config.memory.isLowPowerDevice
    );
    vi.spyOn(MM, 'getMemoryStats').mockImplementation(() => ({
      ...config.memory.memoryStats,
      growthRate: 0,
      trend: 'stable',
    }));
  }

  // 应用网络配置
  if (typeof global !== 'undefined' && (global as any).NetworkDetector) {
    const ND = (global as any).NetworkDetector;

    if (ND.prototype) {
      // 类模拟
      vi.spyOn(ND.prototype, 'detectNetworkQuality').mockImplementation(() =>
        Promise.resolve(config.network.quality)
      );
      vi.spyOn(ND.prototype, 'detectNetworkCondition').mockImplementation(() =>
        Promise.resolve({
          type: config.network.type,
          effectiveType:
            config.network.type === 'wifi' ? '4g' : config.network.type,
          downlink: config.network.downlink,
          rtt: config.network.rtt,
        })
      );
      vi.spyOn(ND.prototype, 'getNetworkStatus').mockImplementation(() =>
        config.network.type === 'none' ? 'offline' : 'online'
      );
    }
  }

  // 应用平台特定模拟
  switch (config.name) {
    case 'wechat':
      if (typeof global !== 'undefined' && !(global as any).wx) {
        (global as any).wx = {
          getFileSystemManager: vi.fn().mockReturnValue({
            readFile: vi.fn(),
            writeFile: vi.fn(),
          }),
          request: vi.fn(),
          uploadFile: vi.fn(),
        };
      }
      break;

    case 'alipay':
      if (typeof global !== 'undefined' && !(global as any).my) {
        (global as any).my = {
          getFileSystemManager: vi.fn().mockReturnValue({
            readFile: vi.fn(),
            writeFile: vi.fn(),
          }),
          request: vi.fn(),
          uploadFile: vi.fn(),
        };
      }
      break;

    case 'bytedance':
      if (typeof global !== 'undefined' && !(global as any).tt) {
        (global as any).tt = {
          getFileSystemManager: vi.fn(),
          request: vi.fn(),
          uploadFile: vi.fn(),
        };
      }
      break;

    case 'baidu':
      if (typeof global !== 'undefined' && !(global as any).swan) {
        (global as any).swan = {
          getFileSystemManager: vi.fn(),
          request: vi.fn(),
          uploadFile: vi.fn(),
        };
      }
      break;

    default:
      break;
  }
}

/**
 * 重置环境为原始状态
 */
export function resetEnvironment(): void {
  if (!activeEnvironment) {
    return;
  }

  // 恢复全局对象
  if (typeof window !== 'undefined') {
    Object.keys(globalBackups).forEach(key => {
      // 针对嵌套属性的特殊处理
      if (key === 'cryptoSubtle' && window.crypto) {
        (window.crypto as any).subtle = globalBackups[key];
      } else {
        (window as any)[key] = globalBackups[key];
      }
    });
  }

  // 重置模拟
  vi.restoreAllMocks();

  // 清空备份
  Object.keys(globalBackups).forEach(key => {
    delete globalBackups[key];
  });

  // 清除当前环境
  activeEnvironment = null;
}

/**
 * 创建自定义环境配置
 */
export function createEnvironmentConfig(
  base: EnvironmentType | EnvironmentConfig,
  overrides?: Partial<EnvironmentConfig>
): EnvironmentConfig {
  const baseConfig =
    typeof base === 'string' ? predefinedEnvironments[base] : base;

  return {
    ...baseConfig,
    ...overrides,
    features: {
      ...baseConfig.features,
      ...(overrides?.features || {}),
    },
    memory: {
      ...baseConfig.memory,
      ...(overrides?.memory || {}),
      memoryStats: {
        ...baseConfig.memory.memoryStats,
        ...(overrides?.memory?.memoryStats || {}),
      },
    },
    network: {
      ...baseConfig.network,
      ...(overrides?.network || {}),
    },
  };
}

/**
 * 获取当前活动环境
 */
export function getActiveEnvironment(): EnvironmentConfig | null {
  return activeEnvironment;
}

/**
 * 模拟环境变化
 */
export function simulateEnvironmentChange(changes: {
  network?: Partial<EnvironmentConfig['network']>;
  memory?: Partial<EnvironmentConfig['memory']>;
}): void {
  if (!activeEnvironment) {
    throw new Error('No active environment to change');
  }

  const config = { ...activeEnvironment };

  // 更新网络状态
  if (changes.network) {
    config.network = {
      ...config.network,
      ...changes.network,
    };

    // 应用网络变化
    if (typeof global !== 'undefined' && (global as any).NetworkDetector) {
      const ND = (global as any).NetworkDetector;

      // 主动触发网络变化事件
      if (ND.prototype && ND.prototype.mockNetworkChange) {
        const instance = new ND();
        instance.mockNetworkChange(config.network.quality, config.network.type);
      }
    }
  }

  // 更新内存状态
  if (changes.memory) {
    config.memory = {
      ...config.memory,
      ...changes.memory,
      memoryStats: {
        ...config.memory.memoryStats,
        ...(changes.memory.memoryStats || {}),
      },
    };

    // 应用内存变化
    if (typeof global !== 'undefined' && (global as any).MemoryManager) {
      const MM = (global as any).MemoryManager;

      if (changes.memory.isLowMemory !== undefined) {
        vi.spyOn(MM, 'isLowMemory').mockImplementation(
          () => changes.memory!.isLowMemory
        );
      }

      if (changes.memory.memoryStats) {
        vi.spyOn(MM, 'getMemoryStats').mockImplementation(() => ({
          ...config.memory.memoryStats,
          growthRate: 0,
          trend: 'stable',
        }));
      }
    }
  }

  // 更新当前环境
  activeEnvironment = config;
}
