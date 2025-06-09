import { describe, it, expect, vi } from 'vitest';

import { UploaderCore } from '../../src/core/UploaderCore';
import ChunkPlugin from '../../src/plugins/ChunkPlugin';
import ProgressPlugin from '../../src/plugins/ProgressPlugin';

/**
 * 创建指定大小的Mock文件
 * @param size 文件大小（字节）
 * @param name 文件名
 * @param type 文件MIME类型
 */
function createMockFile(
  size: number,
  name = 'test.mp4',
  type = 'video/mp4'
): File {
  // 创建一个指定大小的ArrayBuffer
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);

  // 填充一些随机数据
  for (let i = 0; i < size; i += 1024 * 1024) {
    // 每MB填充一次，减少性能开销
    const value = Math.floor(Math.random() * 256);
    for (let j = 0; j < Math.min(1024 * 1024, size - i); j++) {
      view[i + j] = value;
    }
  }

  // 创建Blob然后转为File对象
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

/**
 * 测量函数执行时间
 * @param fn 要测量的函数
 */
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

/**
 * 测量内存使用情况
 */
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

describe.skip('上传性能测试', () => {
  // 模拟的XHR请求
  let mockXHR: any;

  beforeEach(() => {
    // 模拟XMLHttpRequest
    mockXHR = {
      open: vi.fn(),
      send: vi.fn(),
      upload: {
        addEventListener: vi.fn(),
      },
      setRequestHeader: vi.fn(),
      addEventListener: vi.fn(),
    };

    // 替换全局XMLHttpRequest
    global.XMLHttpRequest = vi.fn(() => mockXHR) as any;

    // 模拟XHR成功响应
    mockXHR.responseText = JSON.stringify({ success: true });
    mockXHR.status = 200;
    mockXHR.readyState = 4;
  });

  describe('大文件处理性能', () => {
    it('应能高效处理100MB文件', async () => {
      // 创建100MB测试文件
      const fileSize = 100 * 1024 * 1024; // 100MB
      const file = createMockFile(fileSize);

      // 内存使用前
      const memoryBefore = measureMemory();

      // 创建上传器实例
      const uploader = new UploaderCore({
        endpoint: 'https://example.com/upload',
        chunkSize: 5 * 1024 * 1024, // 5MB分片
        concurrency: 3,
      });

      // 加载插件
      uploader.use(new ChunkPlugin({ useStreams: true }));
      uploader.use(new ProgressPlugin());

      // 测量初始化分片的时间
      let chunks: any[] = [];
      const chunkingResult = await measureTime(async () => {
        // 触发内部分片生成
        chunks = await uploader.prepareFile(file);
        return chunks;
      });

      // 验证分片数量
      expect(chunks.length).toBe(Math.ceil(fileSize / (5 * 1024 * 1024)));

      // 内存使用后
      const memoryAfter = measureMemory();

      // 输出性能数据
      console.log('===== 100MB文件处理性能 =====');
      console.log(`分片生成时间: ${chunkingResult.time.toFixed(2)}ms`);
      console.log(`分片数量: ${chunks.length}`);

      if (memoryBefore && memoryAfter) {
        const memoryUsed =
          (memoryAfter.used - memoryBefore.used) / (1024 * 1024);
        console.log(`内存增长: ${memoryUsed.toFixed(2)}MB`);
        console.log(
          `内存使用率: ${((memoryAfter.used / memoryAfter.limit) * 100).toFixed(2)}%`
        );
      }

      // 清理资源
      uploader.dispose();
    }, 30000);

    it('应能高效处理500MB文件', async () => {
      // 创建500MB测试文件
      const fileSize = 500 * 1024 * 1024; // 500MB
      const file = createMockFile(fileSize);

      // 内存使用前
      const memoryBefore = measureMemory();

      // 创建上传器实例
      const uploader = new UploaderCore({
        endpoint: 'https://example.com/upload',
        chunkSize: 'auto', // 自动选择分片大小
        concurrency: 2,
      });

      // 加载插件
      uploader.use(new ChunkPlugin({ useStreams: true }));
      uploader.use(new ProgressPlugin());

      // 测量初始化分片的时间
      let chunks: any[] = [];
      const chunkingResult = await measureTime(async () => {
        // 触发内部分片生成
        chunks = await uploader.prepareFile(file);
        return chunks;
      });

      // 内存使用后
      const memoryAfter = measureMemory();

      // 输出性能数据
      console.log('===== 500MB文件处理性能 =====');
      console.log(`分片生成时间: ${chunkingResult.time.toFixed(2)}ms`);
      console.log(`分片数量: ${chunks.length}`);
      console.log(
        `平均每分片大小: ${(fileSize / chunks.length / (1024 * 1024)).toFixed(2)}MB`
      );

      if (memoryBefore && memoryAfter) {
        const memoryUsed =
          (memoryAfter.used - memoryBefore.used) / (1024 * 1024);
        console.log(`内存增长: ${memoryUsed.toFixed(2)}MB`);
        console.log(
          `内存使用率: ${((memoryAfter.used / memoryAfter.limit) * 100).toFixed(2)}%`
        );
      }

      // 检查内存使用是否合理
      if (memoryBefore && memoryAfter) {
        const memoryUsed = memoryAfter.used - memoryBefore.used;
        // 理想情况下，内存使用不应超过文件大小的20%
        const expectedMaxMemory = fileSize * 0.2;
        expect(memoryUsed).toBeLessThan(expectedMaxMemory);
      }

      // 清理资源
      uploader.dispose();
    }, 60000);
  });

  describe('上传性能模拟', () => {
    it('应能高效并发上传多个分片', async () => {
      // 创建50MB测试文件
      const fileSize = 50 * 1024 * 1024; // 50MB
      const file = createMockFile(fileSize);

      // 创建上传器实例
      const uploader = new UploaderCore({
        endpoint: 'https://example.com/upload',
        chunkSize: 5 * 1024 * 1024, // 5MB分片
        concurrency: 3,
        timeout: 5000,
      });

      // 加载插件
      uploader.use(new ChunkPlugin());
      uploader.use(new ProgressPlugin());

      // 模拟成功响应
      const sendPromiseResolvers: ((value: unknown) => void)[] = [];
      mockXHR.send.mockImplementation(() => {
        const promise = new Promise(resolve => {
          sendPromiseResolvers.push(resolve);
        });
        return promise;
      });

      // 启动上传但不等待完成
      const uploadPromise = uploader.upload(file);

      // 让前3个请求立即完成
      for (let i = 0; i < 3; i++) {
        if (sendPromiseResolvers[i]) {
          // 获取最后一次进度回调的值
          const lastProgress = mockXHR.upload.addEventListener.mock.calls[
            mockXHR.upload.addEventListener.mock.calls.length - 1
          ].find((call: any[]) => call[0] === 'progress')?.[1];

          if (lastProgress) {
            lastProgress({ loaded: 5 * 1024 * 1024, total: 5 * 1024 * 1024 });
          }

          // 触发加载完成事件
          const loadHandler = mockXHR.addEventListener.mock.calls.find(
            (call: any[]) => call[0] === 'load'
          )?.[1];

          if (loadHandler) {
            loadHandler();
          }

          sendPromiseResolvers[i](true);
        }
      }

      // 等待上传进行到一半
      await new Promise(resolve => setTimeout(resolve, 100));

      // 完成剩余请求
      for (let i = 3; i < sendPromiseResolvers.length; i++) {
        if (mockXHR.upload.addEventListener.mock.calls[i]) {
          // 获取最后一次进度回调的值
          const lastProgress = mockXHR.upload.addEventListener.mock.calls[
            i
          ].find((call: any[]) => call[0] === 'progress')?.[1];

          if (lastProgress) {
            lastProgress({ loaded: 5 * 1024 * 1024, total: 5 * 1024 * 1024 });
          }

          // 触发加载完成事件
          const loadHandler = mockXHR.addEventListener.mock.calls[i].find(
            (call: any[]) => call[0] === 'load'
          )?.[1];

          if (loadHandler) {
            loadHandler();
          }
        }

        sendPromiseResolvers[i](true);
      }

      // 等待上传完成
      await uploadPromise;

      // 验证所有分片都被发送
      const expectedChunks = Math.ceil(fileSize / (5 * 1024 * 1024));
      expect(mockXHR.send.mock.calls.length).toBe(expectedChunks);

      // 清理资源
      uploader.dispose();
    });
  });
});
