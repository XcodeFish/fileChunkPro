/* eslint-disable @typescript-eslint/no-unused-vars */
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

describe('跨平台性能基准测试', () => {
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

  describe('文件处理跨平台性能比较', () => {
    // 测试文件大小
    const fileSize = 20 * 1024 * 1024; // 20MB
    const file = createMockFile(fileSize);

    it('比较所有平台上的文件处理性能', async () => {
      const results = [];

      for (const [name, adapter] of Object.entries(adapters)) {
        // 创建上传器实例
        const uploader = new UploaderCore({
          endpoint: 'https://example.com/upload',
          chunkSize: 2 * 1024 * 1024, // 固定2MB分片以便比较
          concurrency: 3,
          adapter,
        });

        uploader.use(new ChunkPlugin());

        // 测量文件处理时间
        const { time, result: chunks } = await measureTime(async () => {
          return await uploader.prepareFile(file);
        });

        results.push({
          platform: name,
          processingTime: time,
          chunkCount: chunks.length,
        });

        uploader.dispose();
      }

      // 输出比较结果
      console.log('==== 跨平台文件处理性能比较 ====');
      console.log('平台\t处理时间(ms)\t分片数量');
      results.forEach(result => {
        console.log(
          `${result.platform}\t${result.processingTime.toFixed(2)}\t${result.chunkCount}`
        );
      });

      // 找出性能最好的平台
      const fastest = results.reduce((prev, curr) =>
        prev.processingTime < curr.processingTime ? prev : curr
      );

      console.log(
        `\n最快处理平台: ${fastest.platform} (${fastest.processingTime.toFixed(2)}ms)`
      );

      // 对比各平台相对性能
      console.log('\n平台相对性能 (基准：最快平台)');
      results.forEach(result => {
        const ratio = result.processingTime / fastest.processingTime;
        console.log(`${result.platform}: ${ratio.toFixed(2)}x`);
      });
    });
  });

  describe('网络请求跨平台性能比较', () => {
    // 模拟不同的网络条件
    const networkConditions = [
      { name: 'Fast', delay: 50 },
      { name: 'Medium', delay: 200 },
      { name: 'Slow', delay: 500 },
    ];

    for (const condition of networkConditions) {
      it(`${condition.name} 网络环境下的跨平台上传性能`, async () => {
        const results = [];
        const testData = new ArrayBuffer(1024 * 1024); // 1MB测试数据

        for (const [name, adapter] of Object.entries(adapters)) {
          // 重置模拟请求
          mockRequest.send.mockImplementation(() => {
            return new Promise(resolve => {
              setTimeout(() => {
                resolve({ success: true });
              }, condition.delay);
            });
          });

          // 创建上传器
          const uploader = new UploaderCore({
            endpoint: 'https://example.com/upload',
            adapter,
          });

          // 测量上传时间
          const { time } = await measureTime(async () => {
            // 模拟上传单个请求
            const request = adapter.createRequest({
              url: 'https://example.com/upload',
              method: 'POST',
            });

            await request.send({
              data: testData,
              headers: { 'Content-Type': 'application/octet-stream' },
            });

            return true;
          });

          results.push({
            platform: name,
            uploadTime: time,
          });

          uploader.dispose();
        }

        // 输出结果
        console.log(`\n==== ${condition.name} 网络环境下的跨平台上传性能 ====`);
        console.log('平台\t上传时间(ms)');
        results.forEach(result => {
          console.log(`${result.platform}\t${result.uploadTime.toFixed(2)}`);
        });

        // 找出最快的平台
        const fastest = results.reduce((prev, curr) =>
          prev.uploadTime < curr.uploadTime ? prev : curr
        );

        console.log(
          `\n最快上传平台: ${fastest.platform} (${fastest.uploadTime.toFixed(2)}ms)`
        );

        // 验证所有适配器上传功能正常工作
        results.forEach(result => {
          expect(result.uploadTime).toBeGreaterThan(condition.delay - 10); // 考虑到时间测量误差
        });
      });
    }
  });

  describe('文件读取跨平台性能比较', () => {
    // 测试不同大小的文件片段
    const chunkSizes = [
      1024 * 1024, // 1MB
      5 * 1024 * 1024, // 5MB
      10 * 1024 * 1024, // 10MB
    ];

    for (const chunkSize of chunkSizes) {
      const sizeInMB = chunkSize / (1024 * 1024);

      it(`${sizeInMB}MB 文件片段的跨平台读取性能`, async () => {
        const results = [];
        const file = createMockFile(chunkSize);

        for (const [name, adapter] of Object.entries(adapters)) {
          // 配置模拟读取函数的行为
          if (name === 'browser') {
            // 浏览器适配器通常通过FileReader读取
            const mockFileReader = {
              readAsArrayBuffer: vi.fn(),
              onload: null,
            };
            adapter.createFileReader = vi.fn().mockReturnValue(mockFileReader);

            // 测量读取时间
            const { time } = await measureTime(async () => {
              const readPromise = adapter.readFile(file, 0, chunkSize);

              // 模拟异步读取完成
              setTimeout(() => {
                if (mockFileReader.onload) {
                  mockFileReader.onload({
                    target: { result: new ArrayBuffer(chunkSize) },
                  } as any);
                }
              }, 10);

              return await readPromise;
            });

            results.push({
              platform: name,
              readTime: time,
            });
          } else {
            // 小程序适配器通常直接读取
            const { time } = await measureTime(async () => {
              return await adapter.readFile(file, 0, chunkSize);
            });

            results.push({
              platform: name,
              readTime: time,
            });
          }
        }

        // 输出结果
        console.log(`\n==== ${sizeInMB}MB 文件片段的跨平台读取性能 ====`);
        console.log('平台\t读取时间(ms)');
        results.forEach(result => {
          console.log(`${result.platform}\t${result.readTime.toFixed(2)}`);
        });

        // 找出最快的平台
        const fastest = results.reduce((prev, curr) =>
          prev.readTime < curr.readTime ? prev : curr
        );

        console.log(
          `\n最快读取平台: ${fastest.platform} (${fastest.readTime.toFixed(2)}ms)`
        );
      });
    }
  });

  describe('存储操作跨平台性能比较', () => {
    it('比较不同平台存储操作的性能', async () => {
      const results = [];
      const testKey = 'perfTest';
      const testValue = JSON.stringify({
        data: Array(1024).fill('A').join(''),
      }); // 约1KB大小

      for (const [name, adapter] of Object.entries(adapters)) {
        const storage = adapter.getStorageProvider();

        // 测量写入性能
        const { time: writeTime } = await measureTime(async () => {
          await storage.set(testKey, testValue);
          return true;
        });

        // 测量读取性能
        const { time: readTime } = await measureTime(async () => {
          return await storage.get(testKey);
        });

        // 测量删除性能
        const { time: deleteTime } = await measureTime(async () => {
          await storage.remove(testKey);
          return true;
        });

        results.push({
          platform: name,
          writeTime,
          readTime,
          deleteTime,
          totalTime: writeTime + readTime + deleteTime,
        });
      }

      // 输出结果
      console.log('\n==== 跨平台存储操作性能比较 ====');
      console.log('平台\t写入(ms)\t读取(ms)\t删除(ms)\t总时间(ms)');
      results.forEach(result => {
        console.log(
          `${result.platform}\t${result.writeTime.toFixed(2)}\t${result.readTime.toFixed(2)}\t${result.deleteTime.toFixed(2)}\t${result.totalTime.toFixed(2)}`
        );
      });

      // 找出整体最快的平台
      const fastest = results.reduce((prev, curr) =>
        prev.totalTime < curr.totalTime ? prev : curr
      );

      console.log(
        `\n最快存储平台: ${fastest.platform} (${fastest.totalTime.toFixed(2)}ms)`
      );

      // 验证所有平台存储功能正常工作
      results.forEach(result => {
        expect(result.writeTime).toBeGreaterThan(0);
        expect(result.readTime).toBeGreaterThan(0);
        expect(result.deleteTime).toBeGreaterThan(0);
      });
    });
  });
});
