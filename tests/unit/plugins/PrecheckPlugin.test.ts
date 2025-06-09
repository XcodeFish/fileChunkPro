/**
 * PrecheckPlugin 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import EventBus from '../../../src/core/EventBus';
import PrecheckPlugin from '../../../src/plugins/PrecheckPlugin';

// 模拟UploaderCore
vi.mock('../../../src/core/UploaderCore');

describe('PrecheckPlugin', () => {
  let plugin: PrecheckPlugin;
  let mockUploader: any;
  let mockEventBus: EventBus;
  let mockPluginManager: any;
  let mockRequest: any;

  beforeEach(() => {
    // 创建模拟对象
    mockEventBus = new EventBus();

    mockRequest = {
      send: vi.fn().mockResolvedValue({ exists: false }),
    };

    mockPluginManager = {
      registerHook: vi.fn(),
      removePluginHooks: vi.fn(),
    };

    mockUploader = {
      getEventBus: vi.fn().mockReturnValue(mockEventBus),
      getPluginManager: vi.fn().mockReturnValue(mockPluginManager),
      getConfig: vi.fn().mockReturnValue({
        endpoint: 'https://example.com/upload',
        hashCalculationEnabled: true,
        checkEndpoint: 'https://example.com/check',
      }),
      createRequest: vi.fn().mockReturnValue(mockRequest),
      emit: vi.fn(),
    };

    // 创建插件实例
    plugin = new PrecheckPlugin({
      hashAlgorithm: 'md5',
      endpoint: 'https://example.com/check',
      enabled: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基本功能', () => {
    it('应该能正确注册和安装', () => {
      // 安装插件
      plugin.install(mockUploader);

      // 验证事件总线和插件管理器被正确获取
      expect(mockUploader.getEventBus).toHaveBeenCalled();
      expect(mockUploader.getPluginManager).toHaveBeenCalled();

      // 验证钩子已注册
      expect(mockPluginManager.registerHook).toHaveBeenCalledWith(
        'beforeFileUpload',
        expect.any(Function),
        expect.objectContaining({ plugin: 'PrecheckPlugin' })
      );
    });

    it('应该能正确销毁插件', () => {
      // 先安装插件
      plugin.install(mockUploader);

      // 调用销毁方法
      plugin.destroy();

      // 验证清理工作
      expect(mockPluginManager.removePluginHooks).toHaveBeenCalledWith(
        'PrecheckPlugin'
      );
    });
  });

  describe('文件预检测', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);

      // 模拟哈希计算
      vi.spyOn(plugin as any, 'calculateFileHash').mockResolvedValue(
        'abcdef123456'
      );
    });

    it('应该对文件执行预检测', async () => {
      // 模拟文件
      const file = new File([new ArrayBuffer(1024)], 'test.txt', {
        type: 'text/plain',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file });

      // 验证哈希计算被调用
      expect((plugin as any).calculateFileHash).toHaveBeenCalledWith(file);

      // 验证向服务器发送了预检请求
      expect(mockRequest.send).toHaveBeenCalled();
      expect(mockRequest.send.mock.calls[0][0]).toHaveProperty(
        'hash',
        'abcdef123456'
      );

      // 由于模拟返回不存在，所以应该继续上传（不处理钩子）
      expect(result.handled).toBe(false);
    });

    it('当文件已存在时应跳过上传', async () => {
      // 改变模拟服务器响应，表示文件已存在
      mockRequest.send.mockResolvedValueOnce({
        exists: true,
        url: 'https://example.com/files/test.txt',
        fileId: '12345',
      });

      // 模拟文件
      const file = new File([new ArrayBuffer(1024)], 'test.txt', {
        type: 'text/plain',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file });

      // 验证哈希计算被调用
      expect((plugin as any).calculateFileHash).toHaveBeenCalledWith(file);

      // 验证向服务器发送了预检请求
      expect(mockRequest.send).toHaveBeenCalled();

      // 验证钩子已处理（中断正常上传流程）
      expect(result.handled).toBe(true);
      expect(result.result).toHaveProperty('success', true);
      expect(result.result).toHaveProperty(
        'url',
        'https://example.com/files/test.txt'
      );
      expect(result.result).toHaveProperty('fileId', '12345');

      // 验证发出了秒传事件
      expect(mockUploader.emit).toHaveBeenCalledWith(
        'instantUpload:success',
        expect.any(Object)
      );
    });
  });

  describe('配置选项', () => {
    it('应根据配置启用或禁用预检', async () => {
      // 禁用插件
      plugin = new PrecheckPlugin({
        hashAlgorithm: 'md5',
        endpoint: 'https://example.com/check',
        enabled: false,
      });
      plugin.install(mockUploader);

      // 模拟文件
      const file = new File([new ArrayBuffer(1024)], 'test.txt', {
        type: 'text/plain',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file });

      // 验证没有进行预检
      expect(mockRequest.send).not.toHaveBeenCalled();
      expect(result.handled).toBe(false);
    });

    it('应该使用配置中指定的端点', async () => {
      // 使用不同端点创建插件
      plugin = new PrecheckPlugin({
        hashAlgorithm: 'md5',
        endpoint: 'https://example.com/custom-check',
        enabled: true,
      });
      plugin.install(mockUploader);

      // 模拟哈希计算
      vi.spyOn(plugin as any, 'calculateFileHash').mockResolvedValue(
        'abcdef123456'
      );

      // 模拟文件
      const file = new File([new ArrayBuffer(1024)], 'test.txt', {
        type: 'text/plain',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      await beforeFileUploadHook({ file });

      // 验证使用了自定义端点
      expect(mockUploader.createRequest).toHaveBeenCalledWith({
        url: 'https://example.com/custom-check',
        method: 'POST',
        data: expect.any(Object),
      });
    });
  });

  describe('哈希计算', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    it('应支持不同的哈希算法', async () => {
      // 使用SHA-1算法的插件
      const sha1Plugin = new PrecheckPlugin({
        hashAlgorithm: 'sha1',
        endpoint: 'https://example.com/check',
        enabled: true,
      });
      sha1Plugin.install(mockUploader);

      // 模拟哈希计算方法
      vi.spyOn(sha1Plugin as any, 'calculateFileHash').mockImplementation(
        async _file => {
          return 'sha1-hash-value';
        }
      );

      // 模拟文件
      const file = new File([new ArrayBuffer(1024)], 'test.txt', {
        type: 'text/plain',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call =>
            call[0] === 'beforeFileUpload' &&
            call[2].plugin === 'PrecheckPlugin'
        )[1];

      // 调用钩子
      await beforeFileUploadHook({ file });

      // 验证使用了SHA-1算法
      expect((sha1Plugin as any).calculateFileHash).toHaveBeenCalledWith(file);
    });
  });

  describe('错误处理', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    it('当哈希计算失败时应正常处理', async () => {
      // 模拟哈希计算失败
      vi.spyOn(plugin as any, 'calculateFileHash').mockRejectedValue(
        new Error('计算哈希失败')
      );

      // 模拟文件
      const file = new File([new ArrayBuffer(1024)], 'test.txt', {
        type: 'text/plain',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file });

      // 验证错误被正确处理
      expect(result.handled).toBe(false);
      // 验证没有进行预检请求
      expect(mockRequest.send).not.toHaveBeenCalled();
    });

    it('当服务器请求失败时应正常处理', async () => {
      // 模拟哈希计算
      vi.spyOn(plugin as any, 'calculateFileHash').mockResolvedValue(
        'abcdef123456'
      );

      // 模拟服务器请求失败
      mockRequest.send.mockRejectedValueOnce(new Error('服务器错误'));

      // 模拟文件
      const file = new File([new ArrayBuffer(1024)], 'test.txt', {
        type: 'text/plain',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file });

      // 验证钩子未处理（允许继续上传）
      expect(result.handled).toBe(false);
      // 验证错误事件被触发
      expect(mockUploader.emit).toHaveBeenCalledWith(
        'instantUpload:error',
        expect.any(Object)
      );
    });
  });
});
