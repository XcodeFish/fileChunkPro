/**
 * 跨环境集成测试
 * 测试不同环境下的上传适配
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  beforeAll,
} from 'vitest';
import { rest } from 'msw';

// 导入测试辅助工具
import {
  applyEnvironment,
  predefinedEnvironments,
  EnvironmentType,
  resetEnvironment,
} from './helpers/environmentManager';
import { createTestServer } from './helpers/testServer';
import { TestFileGenerator } from '../setup';

// 导入被测试模块
import { UploaderCore } from '../../src/core/UploaderCore';
import ChunkPlugin from '../../src/plugins/ChunkPlugin';
import BrowserAdapter from '../../src/adapters/BrowserAdapter';
import WechatAdapter from '../../src/adapters/WechatAdapter';
import AlipayAdapter from '../../src/adapters/AlipayAdapter';
import BytedanceAdapter from '../../src/adapters/BytedanceAdapter';
import BaiduAdapter from '../../src/adapters/BaiduAdapter';

// 测试配置
const TEST_ENDPOINT = 'https://api.example.com/upload';

describe('跨环境测试', () => {
  // 创建测试服务器
  const testServer = createTestServer({
    networkLatency: 50,
    errorRate: 0.02,
  });

  beforeAll(() => {
    testServer.server.listen({ onUnhandledRequest: 'warn' });
  });

  afterAll(() => {
    testServer.server.close();
    resetEnvironment();
  });

  afterEach(() => {
    testServer.server.resetHandlers();
    resetEnvironment();
  });

  /**
   * 在指定环境中运行上传测试
   * @param envType 环境类型
   */
  async function runUploadInEnvironment(envType: EnvironmentType) {
    // 应用目标环境
    applyEnvironment(predefinedEnvironments[envType]);

    // 创建上传实例，不指定适配器（应自动选择）
    const uploader = new UploaderCore({
      endpoint: TEST_ENDPOINT,
      chunkSize: 128 * 1024, // 使用较小的分片加快测试
    });

    // 添加基础插件
    uploader.use(new ChunkPlugin());

    // 创建测试文件
    const file = TestFileGenerator.createTextFile(
      250 * 1024,
      `test-${envType}.txt`
    );

    try {
      // 执行上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);

      // 根据环境类型验证特定适配器
      switch (envType) {
        case 'browser':
          expect(uploader.adapter).toBeInstanceOf(BrowserAdapter);
          break;
        case 'wechat':
          expect(uploader.adapter).toBeInstanceOf(WechatAdapter);
          break;
        case 'alipay':
          expect(uploader.adapter).toBeInstanceOf(AlipayAdapter);
          break;
        case 'bytedance':
          expect(uploader.adapter).toBeInstanceOf(BytedanceAdapter);
          break;
        case 'baidu':
          expect(uploader.adapter).toBeInstanceOf(BaiduAdapter);
          break;
        default:
          // 对于框架适配器，可能有不同的实现
          expect(uploader.adapter).toBeDefined();
      }

      return result;
    } finally {
      // 清理资源
      uploader.dispose();
    }
  }

  describe('自动环境适配', () => {
    it('应在浏览器环境下使用BrowserAdapter', async () => {
      await runUploadInEnvironment('browser');
    });

    it('应在微信小程序环境下使用WechatAdapter', async () => {
      await runUploadInEnvironment('wechat');
    });

    it('应在支付宝小程序环境下使用AlipayAdapter', async () => {
      await runUploadInEnvironment('alipay');
    });

    it('应在字节跳动小程序环境下使用BytedanceAdapter', async () => {
      await runUploadInEnvironment('bytedance');
    });

    it('应在百度小程序环境下使用BaiduAdapter', async () => {
      await runUploadInEnvironment('baidu');
    });
  });

  describe('跨环境特性检测', () => {
    it('应在缺少Worker支持的环境中自动降级', async () => {
      // 浏览器环境，但无Worker支持
      applyEnvironment({
        ...predefinedEnvironments.browser,
        features: {
          ...predefinedEnvironments.browser.features,
          supportWebWorker: false,
        },
      });

      const uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
        useWorker: true, // 尝试使用Worker但应自动降级
      });

      uploader.use(new ChunkPlugin());

      // 检查是否已降级处理（需要UploaderCore提供检测API）
      // expect(uploader.isUsingWorker()).toBe(false);

      // 创建测试文件
      const file = TestFileGenerator.createTextFile(
        100 * 1024,
        'no-worker-test.txt'
      );

      // 执行上传
      const result = await uploader.upload(file);

      // 验证结果
      expect(result.success).toBe(true);

      // 清理
      uploader.dispose();
    });

    it('应在缺少Blob构造函数的环境中使用替代方案', async () => {
      // 应用自定义环境：无Blob支持
      applyEnvironment({
        ...predefinedEnvironments.browser,
        features: {
          ...predefinedEnvironments.browser.features,
          supportBlobConstructor: false,
        },
      });

      const uploader = new UploaderCore({
        endpoint: TEST_ENDPOINT,
      });

      uploader.use(new ChunkPlugin());

      // 创建ArrayBuffer而非Blob
      const buffer = new ArrayBuffer(50 * 1024);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < buffer.byteLength; i++) {
        view[i] = i % 256;
      }

      // 执行上传
      const result = await uploader.upload(buffer, 'array-buffer-test.bin');

      // 验证结果
      expect(result.success).toBe(true);

      // 清理
      uploader.dispose();
    });
  });

  describe('跨环境错误处理', () => {
    beforeEach(() => {
      // 配置错误响应
      testServer.server.use(
        rest.post(`${TEST_ENDPOINT}/initialize`, (req, res, ctx) => {
          return res(
            ctx.status(500),
            ctx.json({
              success: false,
              error: 'Server error',
            })
          );
        })
      );
    });

    it('应在不同环境中保持一致的错误处理', async () => {
      // 测试多种环境
      const environments: EnvironmentType[] = ['browser', 'wechat', 'alipay'];

      for (const env of environments) {
        // 应用环境
        applyEnvironment(predefinedEnvironments[env]);

        // 创建上传实例
        const uploader = new UploaderCore({
          endpoint: TEST_ENDPOINT,
        });

        uploader.use(new ChunkPlugin());

        // 错误处理统一性验证
        try {
          const file = TestFileGenerator.createTextFile(
            10 * 1024,
            `error-test-${env}.txt`
          );
          await uploader.upload(file);
          // 不应到达这里
          expect(true).toBe(false);
        } catch (error: any) {
          // 所有环境应返回统一错误格式
          expect(error.code).toBeDefined();
          expect(error.message).toBeDefined();
          expect(error.originalError).toBeDefined();
        } finally {
          uploader.dispose();
        }
      }
    });
  });

  describe('跨环境默认配置适应', () => {
    it('应根据不同环境自动调整配置默认值', async () => {
      // 测试不同环境默认配置
      const environments: EnvironmentType[] = ['browser', 'wechat'];
      const configs: Record<string, any> = {};

      for (const env of environments) {
        // 应用环境
        applyEnvironment(predefinedEnvironments[env]);

        // 创建上传实例（不设置配置，使用默认值）
        const uploader = new UploaderCore({
          endpoint: TEST_ENDPOINT,
        });

        // 存储该环境下的默认配置
        configs[env] = {
          chunkSize: uploader.getOption('chunkSize'),
          concurrency: uploader.getOption('concurrency'),
          useWorker: uploader.getOption('useWorker'),
        };

        uploader.dispose();
      }

      // 浏览器环境应该有更大的默认分片和并发度
      expect(configs.browser.chunkSize).toBeGreaterThanOrEqual(
        configs.wechat.chunkSize
      );
      expect(configs.browser.concurrency).toBeGreaterThanOrEqual(
        configs.wechat.concurrency
      );

      // 浏览器环境默认应该启用Worker（如果支持）
      expect(configs.browser.useWorker).toBe(true);

      // 微信小程序环境默认不应启用Worker
      expect(configs.wechat.useWorker).toBe(false);
    });
  });
});
