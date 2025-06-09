import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AlipayAdapter } from '../../src/adapters/AlipayAdapter';
import { BrowserAdapter } from '../../src/adapters/BrowserAdapter';
import { BytedanceAdapter } from '../../src/adapters/BytedanceAdapter';
import { IAdapter } from '../../src/adapters/interfaces';
import { TaroAdapter } from '../../src/adapters/TaroAdapter';
import { UniAppAdapter } from '../../src/adapters/UniAppAdapter';
import { WechatAdapter } from '../../src/adapters/WechatAdapter';
import { UploaderCore } from '../../src/core/UploaderCore';
import ChunkPlugin from '../../src/plugins/ChunkPlugin';
import { MemoryManager } from '../../src/utils/MemoryManager';

// 创建指定大小的Mock文件
function createMockFile(
  size: number,
  name = 'test.mp4',
  type = 'video/mp4'
): File {
  // 创建一个指定大小的ArrayBuffer
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);

  // 填充一些随机数据（减少性能开销，只填充部分数据）
  for (let i = 0; i < size; i += 1024 * 1024) {
    const value = Math.floor(Math.random() * 256);
    for (let j = 0; j < Math.min(1024 * 1024, size - i); j++) {
      view[i + j] = value;
    }
  }

  // 创建Blob然后转为File对象
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

// 测量函数执行时间
async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; time: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return {
    result,
    time: end - start,
  };
}

// 测量内存使用情况
function measureMemory(): {
  used: number;
  total: number;
  limit: number;
} | null {
  if (
    typeof window !== 'undefined' &&
    window.performance &&
    (window.performance as any).memory
  ) {
    const memory = (window.performance as any).memory;
    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
    };
  }
  return null;
}

describe('性能基准测试', () => {
  // 模拟的请求对象
  let mockRequest: any;

  // 模拟不同环境的适配器
  const adapters: Record<string, IAdapter> = {};

  beforeEach(() => {
    // 模拟window对象
    if (typeof window === 'undefined') {
      Object.defineProperty(global, 'window', {
        value: {
          navigator: {
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          performance: {
            now: performance.now,
            memory: {
              jsHeapSizeLimit: 2 * 1024 * 1024 * 1024, // 2GB
              usedJSHeapSize: 100 * 1024 * 1024, // 100MB
              totalJSHeapSize: 1 * 1024 * 1024 * 1024, // 1GB
            },
          },
          Blob: vi.fn(),
          File: vi.fn(),
          FileReader: vi.fn().mockImplementation(() => ({
            readAsArrayBuffer: vi.fn(),
            onload: null,
            onerror: null,
          })),
          XMLHttpRequest: vi.fn().mockImplementation(() => ({
            open: vi.fn(),
            send: vi.fn(),
            setRequestHeader: vi.fn(),
            upload: {
              addEventListener: vi.fn(),
            },
            addEventListener: vi.fn(),
          })),
        },
        writable: true,
      });
    }

    // 模拟小程序环境
    global.wx = {
      uploadFile: vi.fn(),
      request: vi.fn(),
      getFileSystemManager: vi.fn().mockReturnValue({
        readFile: vi.fn((options: any) => {
          if (options.success) {
            options.success({ data: new ArrayBuffer(1024) });
          }
        }),
      }),
    } as any;

    global.my = {
      uploadFile: vi.fn(),
      request: vi.fn(),
      getFileSystemManager: vi.fn().mockReturnValue({
        readFile: vi.fn((options: any) => {
          if (options.success) {
            options.success({ data: new ArrayBuffer(1024) });
          }
        }),
      }),
    } as any;

    global.tt = {
      uploadFile: vi.fn(),
      request: vi.fn(),
      getFileSystemManager: vi.fn().mockReturnValue({
        readFile: vi.fn((options: any) => {
          if (options.success) {
            options.success({ data: new ArrayBuffer(1024) });
          }
        }),
      }),
    } as any;

    global.Taro = {
      uploadFile: vi.fn(),
      request: vi.fn(),
      getEnv: vi.fn().mockReturnValue('WEAPP'),
    } as any;

    global.uni = {
      uploadFile: vi.fn(),
      request: vi.fn(),
    } as any;

    // 创建适配器实例
    adapters.browser = new BrowserAdapter();
    adapters.wechat = new WechatAdapter();
    adapters.alipay = new AlipayAdapter();
    adapters.bytedance = new BytedanceAdapter();
    adapters.taro = new TaroAdapter();
    adapters.uniapp = new UniAppAdapter();

    // 模拟请求对象
    mockRequest = {
      send: vi.fn().mockResolvedValue({ success: true }),
      abort: vi.fn(),
      on: vi.fn(),
    };

    // 模拟各适配器方法
    Object.values(adapters).forEach(adapter => {
      vi.spyOn(adapter, 'createRequest').mockReturnValue(mockRequest);
      vi.spyOn(adapter, 'readFile').mockResolvedValue(new ArrayBuffer(1024));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('不同环境文件处理性能', () => {
    // 不同大小的测试文件
    const testFileSizes = [
      5 * 1024 * 1024, // 5MB
      20 * 1024 * 1024, // 20MB
      50 * 1024 * 1024, // 50MB
    ];

    for (const [name, adapter] of Object.entries(adapters)) {
      describe(`${name} 环境`, () => {
        for (const fileSize of testFileSizes) {
          const fileSizeMB = fileSize / (1024 * 1024);

          it(`处理 ${fileSizeMB}MB 文件的性能`, async () => {
            // 创建测试文件
            const file = createMockFile(fileSize);

            // 创建上传器并使用特定适配器
            const uploader = new UploaderCore({
              endpoint: 'https://example.com/upload',
              chunkSize: 'auto', // 自动选择分片大小
              concurrency: 3,
              adapter,
            });

            // 添加分片插件
            uploader.use(new ChunkPlugin());

            // 监测内存使用前
            const memoryBefore = measureMemory();

            // 测量文件处理时间
            const { time: processingTime } = await measureTime(async () => {
              return await uploader.prepareFile(file);
            });

            // 监测内存使用后
            const memoryAfter = measureMemory();

            // 输出性能数据
            console.log(`==== ${name} 环境处理 ${fileSizeMB}MB 文件 ====`);
            console.log(`处理时间: ${processingTime.toFixed(2)}ms`);

            if (memoryBefore && memoryAfter) {
              const memoryUsed =
                (memoryAfter.used - memoryBefore.used) / (1024 * 1024);
              console.log(`内存增长: ${memoryUsed.toFixed(2)}MB`);
            }

            // 验证处理时间在合理范围内（根据实际情况调整）
            // 由于这是一个基准测试，主要比较不同环境的相对性能，所以这里不做严格断言
            expect(processingTime).toBeGreaterThan(0);

            // 清理资源
            uploader.dispose();
          }, 60000);
        }
      });
    }
  });

  describe('分片策略性能比较', () => {
    it('比较不同分片大小的性能差异', async () => {
      // 测试50MB文件
      const fileSize = 50 * 1024 * 1024;
      const file = createMockFile(fileSize);

      // 不同的分片大小配置
      const chunkSizes = [
        1 * 1024 * 1024, // 1MB
        2 * 1024 * 1024, // 2MB
        4 * 1024 * 1024, // 4MB
        8 * 1024 * 1024, // 8MB
        'auto', // 自动配置
      ];

      const results = [];

      for (const chunkSize of chunkSizes) {
        const uploader = new UploaderCore({
          endpoint: 'https://example.com/upload',
          chunkSize,
          concurrency: 3,
        });

        uploader.use(new ChunkPlugin());

        // 测量分片生成时间
        const { time, result: chunks } = await measureTime(async () => {
          return await uploader.prepareFile(file);
        });

        results.push({
          chunkSize:
            chunkSize === 'auto' ? 'auto' : `${chunkSize / (1024 * 1024)}MB`,
          processingTime: time,
          chunkCount: chunks.length,
          avgChunkSize: fileSize / chunks.length / (1024 * 1024),
        });

        uploader.dispose();
      }

      // 输出结果
      console.log('==== 分片策略性能比较 ====');
      results.forEach(result => {
        console.log(
          `${result.chunkSize}: 处理时间 ${result.processingTime.toFixed(2)}ms, ` +
            `分片数量 ${result.chunkCount}, 平均分片大小 ${result.avgChunkSize.toFixed(2)}MB`
        );
      });

      // 验证自动分片策略的有效性
      const autoResult = results.find(r => r.chunkSize === 'auto');
      expect(autoResult).toBeDefined();
    });
  });

  describe('并发策略性能比较', () => {
    it('比较不同并发数的上传性能', async () => {
      // 模拟不同的上传延迟
      const uploadDelays = [50, 100, 200, 500]; // 模拟不同网络状况下的延迟（毫秒）

      // 测试20MB文件
      const fileSize = 20 * 1024 * 1024;
      const file = createMockFile(fileSize);
      const chunkSize = 2 * 1024 * 1024; // 固定分片大小为2MB

      const concurrencyLevels = [1, 2, 3, 5, 8];

      for (const delay of uploadDelays) {
        console.log(`\n==== 网络延迟 ${delay}ms 时的并发性能 ====`);
        const results = [];

        for (const concurrency of concurrencyLevels) {
          // 重置模拟请求对象
          mockRequest.send.mockImplementation(() => {
            return new Promise(resolve => {
              setTimeout(() => {
                resolve({ success: true });
              }, delay);
            });
          });

          const uploader = new UploaderCore({
            endpoint: 'https://example.com/upload',
            chunkSize,
            concurrency,
          });

          uploader.use(new ChunkPlugin());

          // 准备文件分片
          const chunks = await uploader.prepareFile(file);
          const chunkCount = chunks.length;

          // 测量上传时间
          const { time: uploadTime } = await measureTime(async () => {
            // 模拟上传过程
            const promises = chunks.map(chunk => mockRequest.send(chunk));
            await Promise.all(promises);
            return true;
          });

          // 计算理论上的最优时间
          // 假设完全并行，则时间为 (分片数 / 并发数) * 延迟时间
          const theoreticalOptimalTime =
            Math.ceil(chunkCount / concurrency) * delay;

          results.push({
            concurrency,
            uploadTime,
            chunkCount,
            theoreticalOptimalTime,
            efficiency: theoreticalOptimalTime / uploadTime,
          });

          uploader.dispose();
        }

        // 输出结果
        results.forEach(result => {
          console.log(
            `并发数 ${result.concurrency}: 上传时间 ${result.uploadTime.toFixed(2)}ms, ` +
              `理论最优 ${result.theoreticalOptimalTime}ms, 效率 ${(result.efficiency * 100).toFixed(2)}%`
          );
        });

        // 验证结果
        const bestResult = results.reduce((prev, curr) =>
          prev.uploadTime < curr.uploadTime ? prev : curr
        );
        console.log(`最佳并发数: ${bestResult.concurrency}`);
      }
    });
  });

  describe('内存使用优化', () => {
    it('测试动态分片调整对内存的影响', async () => {
      // 测试大文件
      const fileSize = 100 * 1024 * 1024; // 100MB
      const file = createMockFile(fileSize);

      // 模拟不同内存状况
      const memoryScenarios = [
        { name: '充足内存', usedRatio: 0.3, limit: 2 * 1024 * 1024 * 1024 },
        { name: '中等内存', usedRatio: 0.6, limit: 2 * 1024 * 1024 * 1024 },
        { name: '紧张内存', usedRatio: 0.8, limit: 2 * 1024 * 1024 * 1024 },
      ];

      for (const scenario of memoryScenarios) {
        console.log(`\n==== ${scenario.name}场景 ====`);

        // 模拟内存状况
        if (window.performance && (window.performance as any).memory) {
          (window.performance as any).memory.jsHeapSizeLimit = scenario.limit;
          (window.performance as any).memory.usedJSHeapSize =
            scenario.limit * scenario.usedRatio;
          (window.performance as any).memory.totalJSHeapSize = scenario.limit;
        }

        // 创建上传器
        const uploader = new UploaderCore({
          endpoint: 'https://example.com/upload',
          chunkSize: 'auto', // 自动调整分片大小
          concurrency: 3,
          memoryOptimization: true, // 启用内存优化
        });

        uploader.use(new ChunkPlugin());

        // 取得内存优化前的推荐分片大小
        const recommendedChunkSize =
          MemoryManager.getOptimalChunkSize(fileSize);

        // 记录内存使用前
        const memoryBefore = measureMemory();

        // 处理文件
        const { result: chunks, time: processingTime } = await measureTime(
          async () => {
            return await uploader.prepareFile(file);
          }
        );

        // 记录内存使用后
        const memoryAfter = measureMemory();

        // 输出结果
        console.log(
          `推荐分片大小: ${(recommendedChunkSize / (1024 * 1024)).toFixed(2)}MB`
        );
        console.log(`分片数量: ${chunks.length}`);
        console.log(`处理时间: ${processingTime.toFixed(2)}ms`);

        if (memoryBefore && memoryAfter) {
          const memoryUsed =
            (memoryAfter.used - memoryBefore.used) / (1024 * 1024);
          console.log(`内存增长: ${memoryUsed.toFixed(2)}MB`);
          console.log(
            `内存使用率: ${((memoryAfter.used / memoryAfter.limit) * 100).toFixed(2)}%`
          );
        }

        // 在紧张内存场景，验证分片大小是否合理减小
        if (scenario.usedRatio >= 0.8) {
          expect(chunks.length).toBeGreaterThan(fileSize / (8 * 1024 * 1024)); // 分片应比8MB小
        }

        uploader.dispose();
      }
    });
  });
});
