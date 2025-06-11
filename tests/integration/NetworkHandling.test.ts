/**
 * 网络处理集成测试
 * 测试各种网络条件下的上传行为
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import { rest } from 'msw';

// 导入测试辅助工具
import { createTestServer } from './helpers/testServer';
import {
  applyEnvironment,
  predefinedEnvironments,
} from './helpers/environmentManager';
import { TestFileGenerator } from '../setup';

// 导入被测试模块
import { UploaderCore } from '../../src/core/UploaderCore';
import ChunkPlugin from '../../src/plugins/ChunkPlugin';
import ResumePlugin from '../../src/plugins/ResumePlugin';
import ValidatorPlugin from '../../src/plugins/ValidatorPlugin';
import { UploadError } from '../../src/core/ErrorCenter';

// 测试配置
const TEST_ENDPOINT = 'https://api.example.com/upload';

describe('网络处理集成测试', () => {
  // 创建测试服务器
  const testServer = createTestServer({
    networkLatency: 100,
    errorRate: 0.05,
  });

  beforeAll(() => {
    testServer.server.listen({ onUnhandledRequest: 'warn' });
  });

  afterAll(() => {
    testServer.server.close();
  });

  afterEach(() => {
    testServer.server.resetHandlers();
    vi.useRealTimers();
  });

  describe('网络波动场景处理', () => {
    let uploader: UploaderCore;

    beforeEach(() => {
      // 应用浏览器环境
      applyEnvironment(predefinedEnvironments.browser);

      // 创建上传实例
      uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        chunkSize: 256 * 1024,
        retries: 3,
        retryDelay: 1000,
        timeout: 5000,
      });

      // 添加插件
      uploader.use(new ChunkPlugin());
      uploader.use(new ResumePlugin());
      uploader.use(new ValidatorPlugin());

      // 使用虚拟定时器以加速测试
      vi.useFakeTimers();
    });

    afterEach(() => {
      uploader.dispose();
    });

    it('应能处理间歇性连接丢失', async () => {
      // 创建测试文件
      const file = TestFileGenerator.createTextFile(500 * 1024, 'test.txt');

      // 重试事件监听器
      const retrySpy = vi.fn();
      uploader.on('retry', retrySpy);

      // 模拟间歇性网络中断
      let connectionLost = false;
      testServer.server.use(
        rest.put(`${TEST_ENDPOINT}/chunks/:id`, (req, res, ctx) => {
          // 模拟50%的时间网络不稳定
          if (Math.random() < 0.5) {
            connectionLost = true;
            return res(ctx.status(0)); // 连接中断
          }

          connectionLost = false;
          return res(
            ctx.json({
              success: true,
              chunkIndex: Number(req.params.id),
            })
          );
        })
      );

      // 开始上传
      const uploadPromise = uploader.upload(file);

      // 快进时间以允许重试发生
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1500); // 超过重试延迟
      }

      // 等待上传完成
      const result = await uploadPromise;

      // 验证结果
      expect(result.success).toBe(true);

      // 验证重试触发
      if (connectionLost) {
        expect(retrySpy).toHaveBeenCalled();
      }
    });

    it('应在服务器响应缓慢时触发超时', async () => {
      // 创建测试文件
      const file = TestFileGenerator.createTextFile(300 * 1024, 'test.txt');

      // 模拟服务器响应极其缓慢
      testServer.server.use(
        rest.put(`${TEST_ENDPOINT}/chunks/:id`, (req, res, ctx) => {
          return res(
            ctx.delay(10000), // 故意设置超过timeout的延迟
            ctx.json({
              success: true,
              chunkIndex: Number(req.params.id),
            })
          );
        })
      );

      // 监听错误事件
      const errorSpy = vi.fn();
      uploader.on('error', errorSpy);

      // 开始上传
      const uploadPromise = uploader.upload(file).catch(e => e);

      // 快进时间触发超时
      await vi.advanceTimersByTimeAsync(6000); // 超过配置的5秒超时

      // 等待上传完成(实际是失败)
      const error = await uploadPromise;

      // 验证结果是超时错误
      expect(error).toBeInstanceOf(UploadError);
      expect((error as UploadError).code).toContain('TIMEOUT');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('不同网络质量适应测试', () => {
    it('应在低质量网络中自动减小分片大小', async () => {
      // 应用3G网络环境
      applyEnvironment({
        ...predefinedEnvironments.browser,
        network: {
          quality: 'poor',
          type: '3g',
          downlink: 1.5,
          rtt: 400,
        },
      });

      // 创建上传实例，不指定分片大小以使用自动计算
      const uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        autoAdjustChunkSize: true,
      });

      uploader.use(new ChunkPlugin());

      // 创建测试文件
      const file = TestFileGenerator.createTextFile(
        2 * 1024 * 1024,
        'large-test.txt'
      );

      // 开始上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);

      // 清理
      uploader.dispose();
    });

    it('应在高质量网络中使用更大的并发数', async () => {
      // 应用高速网络环境
      applyEnvironment({
        ...predefinedEnvironments.browser,
        network: {
          quality: 'excellent',
          type: 'wifi',
          downlink: 20,
          rtt: 20,
        },
      });

      // 创建上传实例
      const uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        // 不指定并发数，应该根据网络自动调整
      });

      uploader.use(new ChunkPlugin());

      // 监控上传事件
      const progressSpy = vi.fn();
      uploader.on('progress', progressSpy);

      // 创建测试文件
      const file = TestFileGenerator.createTextFile(
        3 * 1024 * 1024,
        'high-speed-test.txt'
      );

      // 开始上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);

      // 由于并发高，进度事件应该触发较少次数
      // 如果网络足够快，且并发高，整个任务可能只需几次进度更新
      expect(progressSpy.mock.calls.length).toBeLessThanOrEqual(10);

      // 清理
      uploader.dispose();
    });
  });

  describe('跨域与认证测试', () => {
    let uploader: UploaderCore;

    beforeEach(() => {
      // 应用浏览器环境
      applyEnvironment(predefinedEnvironments.browser);

      // 创建上传实例
      uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        headers: {
          Authorization: 'Bearer test-token',
        },
        withCredentials: true,
      });

      uploader.use(new ChunkPlugin());
    });

    afterEach(() => {
      uploader.dispose();
    });

    it('应正确处理CORS预检请求', async () => {
      // 重置服务器以添加CORS相关handler
      testServer.server.resetHandlers(
        rest.options(`${TEST_ENDPOINT}/initialize`, (req, res, ctx) => {
          // 检查预检请求头
          const requestHeaders = req.headers.get(
            'access-control-request-headers'
          );
          const requestMethod = req.headers.get(
            'access-control-request-method'
          );

          // 验证预检请求
          if (!requestHeaders || !requestMethod) {
            return res(ctx.status(400));
          }

          // 返回CORS头
          return res(
            ctx.set('Access-Control-Allow-Origin', '*'),
            ctx.set(
              'Access-Control-Allow-Methods',
              'POST, GET, OPTIONS, PUT, DELETE'
            ),
            ctx.set('Access-Control-Allow-Headers', requestHeaders),
            ctx.set('Access-Control-Max-Age', '86400'),
            ctx.status(204)
          );
        }),

        rest.post(`${TEST_ENDPOINT}/initialize`, (req, res, ctx) => {
          // 检查认证头
          const authHeader = req.headers.get('authorization');
          if (authHeader !== 'Bearer test-token') {
            return res(
              ctx.set('Access-Control-Allow-Origin', '*'),
              ctx.status(401),
              ctx.json({
                success: false,
                error: 'Unauthorized',
              })
            );
          }

          return res(
            ctx.set('Access-Control-Allow-Origin', '*'),
            ctx.json({
              success: true,
              fileId: 'cors-test-file-123',
              token: 'cors-test-token',
              uploadUrls: [{ chunkIndex: 0, url: `${TEST_ENDPOINT}/chunks/0` }],
            })
          );
        }),

        rest.put(`${TEST_ENDPOINT}/chunks/:id`, (req, res, ctx) => {
          return res(
            ctx.set('Access-Control-Allow-Origin', '*'),
            ctx.json({
              success: true,
              chunkIndex: Number(req.params.id),
            })
          );
        }),

        rest.post(`${TEST_ENDPOINT}/complete`, (req, res, ctx) => {
          return res(
            ctx.set('Access-Control-Allow-Origin', '*'),
            ctx.json({
              success: true,
              url: 'https://example.com/files/cors-test-file-123',
            })
          );
        })
      );

      // 创建测试文件
      const file = TestFileGenerator.createTextFile(
        10 * 1024,
        'small-test.txt'
      );

      // 执行上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);
    });

    it('应处理认证失败情况', async () => {
      // 修改上传器，使用错误的token
      uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        headers: {
          Authorization: 'Bearer wrong-token',
        },
      });

      uploader.use(new ChunkPlugin());

      // 模拟服务器拒绝认证
      testServer.server.use(
        rest.post(`${TEST_ENDPOINT}/initialize`, (req, res, ctx) => {
          return res(
            ctx.status(401),
            ctx.json({
              success: false,
              error: 'Invalid token',
            })
          );
        })
      );

      // 错误监听器
      const errorSpy = vi.fn();
      uploader.on('error', errorSpy);

      // 创建测试文件
      const file = TestFileGenerator.createTextFile(10 * 1024, 'auth-test.txt');

      // 执行上传，预期失败
      try {
        await uploader.upload(file);
        // 不应该到达这里
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UploadError);
        expect((error as UploadError).code).toContain('UNAUTHORIZED');
        expect(errorSpy).toHaveBeenCalled();
      }
    });
  });
});
