/**
 * 核心模块与插件协作集成测试
 * 测试核心模块与各插件的协同工作
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { rest } from 'msw';

// 导入测试辅助工具
import { createTestServer } from './helpers/testServer';
import {
  applyEnvironment,
  predefinedEnvironments,
  simulateEnvironmentChange,
} from './helpers/environmentManager';
import { mswServer } from '../setup';
import { TestFileGenerator } from '../setup';

// 导入被测试模块
import { UploaderCore } from '../../src/core/UploaderCore';
import ChunkPlugin from '../../src/plugins/ChunkPlugin';
import ResumePlugin from '../../src/plugins/ResumePlugin';
import SmartConcurrencyPlugin from '../../src/plugins/ConcurrencyPlugin';
import PrecheckPlugin from '../../src/plugins/PrecheckPlugin';

// 定义测试配置
const TEST_ENDPOINT = 'https://api.example.com/upload';

describe('核心模块与插件协作测试', () => {
  // 创建测试服务器
  const testServer = createTestServer({
    networkLatency: 50,
    errorRate: 0.1,
    failedChunks: [2, 5], // 指定第2和第5个分片会失败
  });

  // 在所有测试之前启动服务器
  beforeAll(() => {
    testServer.server.listen({ onUnhandledRequest: 'warn' });
  });

  // 在所有测试之后关闭服务器
  afterAll(() => {
    testServer.server.close();
  });

  // 每个测试之后重置处理程序
  afterEach(() => {
    testServer.server.resetHandlers();
  });

  describe('基础环境下的插件协作', () => {
    let uploader: UploaderCore;

    beforeEach(() => {
      // 应用浏览器环境
      applyEnvironment(predefinedEnvironments.browser);

      // 创建上传实例
      uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        chunkSize: 256 * 1024, // 256KB
        retries: 3,
        retryDelay: 500,
        timeout: 30000,
        headers: {
          'X-Test-Header': 'test-value',
        },
      });

      // 添加插件
      uploader.use(new ChunkPlugin());
      uploader.use(new ResumePlugin());
      uploader.use(
        new SmartConcurrencyPlugin({
          minConcurrency: 2,
          maxConcurrency: 5,
          adaptationEnabled: true,
        })
      );
      uploader.use(new PrecheckPlugin());
    });

    afterEach(() => {
      uploader.dispose();
    });

    it('应正确协调多插件完成上传流程', async () => {
      // 模拟服务器响应
      mswServer.use(
        rest.post(`${TEST_ENDPOINT}/initialize`, (req, res, ctx) => {
          return res(
            ctx.json({
              fileId: 'test-file-123',
              token: 'test-token-abc',
              uploadUrls: [
                { chunkIndex: 0, url: `${TEST_ENDPOINT}/chunks/0` },
                { chunkIndex: 1, url: `${TEST_ENDPOINT}/chunks/1` },
                { chunkIndex: 2, url: `${TEST_ENDPOINT}/chunks/2` },
              ],
            })
          );
        }),

        rest.put(`${TEST_ENDPOINT}/chunks/:id`, (req, res, ctx) => {
          const { id } = req.params;

          // 模拟第2个分片上传失败后重试成功
          if (id === '2' && Math.random() < 0.5) {
            return res(ctx.status(500));
          }

          return res(
            ctx.json({
              success: true,
              chunkIndex: Number(id),
            })
          );
        }),

        rest.post(`${TEST_ENDPOINT}/complete`, (req, res, ctx) => {
          return res(
            ctx.json({
              success: true,
              url: 'https://example.com/files/test-file-123',
            })
          );
        })
      );

      // 创建测试文件
      const file = TestFileGenerator.createTextFile(600 * 1024, 'test.txt');

      // 监听上传事件
      const events: Record<string, number> = {
        progress: 0,
        error: 0,
        retry: 0,
        complete: 0,
      };

      uploader.on('progress', () => events.progress++);
      uploader.on('error', () => events.error++);
      uploader.on('retry', () => events.retry++);
      uploader.on('complete', () => events.complete++);

      // 执行上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/files/test-file-123');

      // 验证事件触发
      expect(events.progress).toBeGreaterThan(0);
      expect(events.complete).toBe(1);
      expect(events.error).toBe(0);
    });

    it('应能处理网络变化并动态调整并发数', async () => {
      // 创建测试文件
      const file = TestFileGenerator.createTextFile(1024 * 1024, 'test.txt');

      // 开始上传但不等待完成
      const uploadPromise = uploader.upload(file);

      // 模拟网络质量变差
      await new Promise(resolve => setTimeout(resolve, 200));
      simulateEnvironmentChange({
        network: {
          quality: 'poor',
          type: '3g',
          downlink: 1,
          rtt: 300,
        },
      });

      // 等待上传完成
      const result = await uploadPromise;

      // 验证结果
      expect(result.success).toBe(true);

      // 获取插件实例并验证其是否调整了并发数
      const concurrencyPlugin = uploader.getPlugin('SmartConcurrencyPlugin');
      expect(concurrencyPlugin).toBeDefined();

      // 注意：这里我们无法直接访问插件内部状态，需要通过其他方式验证
      // 例如，可以通过监听事件或添加专门用于测试的API
    });
  });

  describe('多环境测试', () => {
    let uploader: UploaderCore;

    it('应在浏览器环境中使用Worker特性', async () => {
      // 应用浏览器环境
      applyEnvironment(predefinedEnvironments.browser);

      // 创建上传实例
      uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        useWorker: true, // 启用Worker
      });

      uploader.use(new ChunkPlugin());

      // 创建小文件以便快速测试
      const file = TestFileGenerator.createTextFile(100 * 1024, 'test.txt');

      // 执行上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);
    });

    it('应在小程序环境中降级处理', async () => {
      // 应用微信小程序环境
      applyEnvironment(predefinedEnvironments.wechat);

      // 创建上传实例
      uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        useWorker: true, // 尽管设置为true，在小程序中应该自动降级
      });

      uploader.use(new ChunkPlugin());

      // 创建小文件以便快速测试
      const file = TestFileGenerator.createTextFile(100 * 1024, 'test.txt');

      // 执行上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);

      // 验证是否正确降级（这里需要UploaderCore提供特定API来检查）
      // 例如：expect(uploader.isUsingWorker()).toBe(false);
    });
  });

  describe('错误恢复与状态持久化', () => {
    let uploader: UploaderCore;

    beforeEach(() => {
      // 应用浏览器环境
      applyEnvironment(predefinedEnvironments.browser);

      // 创建上传实例
      uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        chunkSize: 256 * 1024,
        retries: 3,
        persistent: true, // 启用持久化
      });

      // 添加插件
      uploader.use(new ChunkPlugin());
      uploader.use(new ResumePlugin());
    });

    afterEach(() => {
      uploader.dispose();
    });

    it('应能在页面刷新后恢复上传', async () => {
      // 创建测试文件
      const file = TestFileGenerator.createTextFile(
        1024 * 1024,
        'test-resume.txt'
      );

      // 模拟文件ID和已上传分片
      const mockFileId = 'resume-test-file-123';
      const mockToken = 'resume-test-token-abc';

      // 第一次上传，模拟中断
      const firstUploader = uploader;

      // 模拟初始化成功但后续上传中断
      mswServer.use(
        rest.post(`${TEST_ENDPOINT}/initialize`, (req, res, ctx) => {
          return res(
            ctx.json({
              fileId: mockFileId,
              token: mockToken,
              uploadUrls: Array(4)
                .fill(0)
                .map((_, i) => ({
                  chunkIndex: i,
                  url: `${TEST_ENDPOINT}/chunks/${i}`,
                })),
            })
          );
        }),

        rest.put(`${TEST_ENDPOINT}/chunks/:id`, (req, res, ctx) => {
          const { id } = req.params;

          // 只允许上传前两个分片，模拟中断
          if (Number(id) < 2) {
            return res(
              ctx.json({
                success: true,
                chunkIndex: Number(id),
              })
            );
          }

          return res(ctx.status(0)); // 连接中断
        })
      );

      // 开始第一次上传（会被中断）
      try {
        await firstUploader.upload(file);
      } catch (error) {
        // 预期会失败
      }

      // 释放第一个上传器
      firstUploader.dispose();

      // 创建新的上传器模拟页面刷新
      const secondUploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        chunkSize: 256 * 1024,
        retries: 3,
        persistent: true,
      });

      secondUploader.use(new ChunkPlugin());
      secondUploader.use(new ResumePlugin());

      // 修改处理器允许所有分片上传成功
      mswServer.use(
        rest.put(`${TEST_ENDPOINT}/chunks/:id`, (req, res, ctx) => {
          return res(
            ctx.json({
              success: true,
              chunkIndex: Number(req.params.id),
            })
          );
        }),

        rest.post(`${TEST_ENDPOINT}/complete`, (req, res, ctx) => {
          return res(
            ctx.json({
              success: true,
              url: `https://example.com/files/${mockFileId}`,
            })
          );
        })
      );

      // 尝试恢复上传
      const result = await secondUploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.fileId).toBe(mockFileId);

      // 清理
      secondUploader.dispose();
    });
  });
});
