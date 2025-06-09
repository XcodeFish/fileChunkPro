/**
 * ValidatorPlugin 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import EventBus from '../../../src/core/EventBus';
import ValidatorPlugin from '../../../src/plugins/ValidatorPlugin';

// 模拟UploaderCore
vi.mock('../../../src/core/UploaderCore');

describe('ValidatorPlugin', () => {
  let plugin: ValidatorPlugin;
  let mockUploader: any;
  let mockEventBus: EventBus;
  let mockPluginManager: any;

  beforeEach(() => {
    // 创建模拟对象
    mockEventBus = new EventBus();

    mockPluginManager = {
      registerHook: vi.fn(),
      removePluginHooks: vi.fn(),
    };

    mockUploader = {
      getEventBus: vi.fn().mockReturnValue(mockEventBus),
      getPluginManager: vi.fn().mockReturnValue(mockPluginManager),
      getConfig: vi.fn().mockReturnValue({
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowFileTypes: ['image/*', 'application/pdf'],
        minFileSize: 1024, // 1KB
      }),
      emit: vi.fn(),
    };

    // 创建插件实例
    plugin = new ValidatorPlugin({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      minFileSize: 1024, // 1KB
      allowedTypes: ['image/*', 'application/pdf', 'text/plain'],
      validateName: true,
      maxFileNameLength: 100,
      disallowedChars: ['/', '\\', ':', '*', '?', '"', '<', '>', '|'],
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
        expect.objectContaining({ plugin: 'ValidatorPlugin' })
      );
    });

    it('应该能正确销毁插件', () => {
      // 先安装插件
      plugin.install(mockUploader);

      // 调用销毁方法
      plugin.destroy();

      // 验证清理工作
      expect(mockPluginManager.removePluginHooks).toHaveBeenCalledWith(
        'ValidatorPlugin'
      );
    });
  });

  describe('文件验证', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    it('应该接受有效的文件', async () => {
      // 模拟有效文件
      const validFile = new File(
        [new ArrayBuffer(1024 * 1024)], // 1MB
        'valid-image.jpg',
        { type: 'image/jpeg' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: validFile });

      // 验证文件被接受（钩子未处理）
      expect(result.handled).toBe(false);
    });

    it('应该拒绝超过大小限制的文件', async () => {
      // 模拟超大文件
      const largeFile = new File(
        [new ArrayBuffer(60 * 1024 * 1024)], // 60MB > 50MB限制
        'large-file.jpg',
        { type: 'image/jpeg' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: largeFile });

      // 验证文件被拒绝
      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain('文件大小超过最大限制 50MB');
      expect(mockUploader.emit).toHaveBeenCalledWith(
        'validation:error',
        expect.any(Object)
      );
    });

    it('应该拒绝小于最小大小限制的文件', async () => {
      // 模拟过小文件
      const smallFile = new File(
        [new ArrayBuffer(512)], // 512B < 1KB限制
        'small-file.txt',
        { type: 'text/plain' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: smallFile });

      // 验证文件被拒绝
      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain('文件大小小于最小限制 1KB');
    });

    it('应该拒绝不允许的文件类型', async () => {
      // 模拟不允许的文件类型
      const executableFile = new File(
        [new ArrayBuffer(1024 * 1024)],
        'program.exe',
        { type: 'application/x-msdownload' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: executableFile });

      // 验证文件被拒绝
      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain(
        '不支持的文件类型 application/x-msdownload'
      );
    });
  });

  describe('文件名验证', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    it('应该拒绝包含非法字符的文件名', async () => {
      // 模拟文件名包含非法字符
      const fileWithInvalidName = new File(
        [new ArrayBuffer(1024 * 1024)],
        'invalid/file:name.jpg', // 包含 / 和 :
        { type: 'image/jpeg' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: fileWithInvalidName });

      // 验证文件被拒绝
      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors[0]).toContain('文件名包含非法字符');
    });

    it('应该拒绝超长文件名', async () => {
      // 创建超长文件名
      const longName = 'a'.repeat(150) + '.jpg'; // 150 > 100限制
      const fileWithLongName = new File(
        [new ArrayBuffer(1024 * 1024)],
        longName,
        { type: 'image/jpeg' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: fileWithLongName });

      // 验证文件被拒绝
      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors[0]).toContain('文件名长度超过最大限制');
    });
  });

  describe('配置选项', () => {
    it('应该使用插件选项而非上传器配置', async () => {
      // 安装插件
      plugin.install(mockUploader);

      // 模拟文件大小在上传器限制内但超出插件限制
      const file = new File(
        [new ArrayBuffer(80 * 1024 * 1024)], // 80MB > 插件的50MB限制，但 < 上传器的100MB限制
        'test.jpg',
        { type: 'image/jpeg' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file });

      // 验证使用了插件配置的限制
      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain('文件大小超过最大限制 50MB');
    });

    it('当禁用文件名验证时应跳过文件名检查', async () => {
      // 创建不验证文件名的插件
      const pluginWithoutNameValidation = new ValidatorPlugin({
        maxFileSize: 50 * 1024 * 1024,
        allowedTypes: ['image/*'],
        validateName: false, // 禁用文件名验证
      });
      pluginWithoutNameValidation.install(mockUploader);

      // 模拟文件名包含非法字符
      const fileWithInvalidName = new File(
        [new ArrayBuffer(1024 * 1024)],
        'invalid/file:name.jpg', // 包含 / 和 :
        { type: 'image/jpeg' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call =>
            call[0] === 'beforeFileUpload' &&
            call[2].plugin === 'ValidatorPlugin'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: fileWithInvalidName });

      // 验证文件被接受（只验证了类型和大小，没验证文件名）
      expect(result.handled).toBe(false);
    });
  });

  describe('自定义验证器', () => {
    it('应该支持自定义验证函数', async () => {
      // 创建带有自定义验证器的插件
      const customValidator = vi.fn(file => {
        // 模拟特定业务规则：只允许名称以"project-"开头的文件
        if (!file.name.startsWith('project-')) {
          return {
            valid: false,
            errors: ['文件名必须以"project-"开头'],
          };
        }
        return { valid: true, errors: [] };
      });

      const pluginWithCustomValidator = new ValidatorPlugin({
        customValidators: [customValidator],
      });
      pluginWithCustomValidator.install(mockUploader);

      // 模拟不符合自定义规则的文件
      const invalidFile = new File(
        [new ArrayBuffer(1024 * 1024)],
        'document.pdf',
        { type: 'application/pdf' }
      );

      // 模拟符合自定义规则的文件
      const validFile = new File(
        [new ArrayBuffer(1024 * 1024)],
        'project-document.pdf',
        { type: 'application/pdf' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call =>
            call[0] === 'beforeFileUpload' &&
            call[2].plugin === 'ValidatorPlugin'
        )[1];

      // 测试不符合规则的文件
      const invalidResult = await beforeFileUploadHook({ file: invalidFile });
      expect(invalidResult.handled).toBe(true);
      expect(invalidResult.result.valid).toBe(false);
      expect(invalidResult.result.errors).toContain(
        '文件名必须以"project-"开头'
      );

      // 验证自定义验证器被调用
      expect(customValidator).toHaveBeenCalledWith(invalidFile);

      // 测试符合规则的文件
      const validResult = await beforeFileUploadHook({ file: validFile });
      expect(validResult.handled).toBe(false); // 通过验证
    });
  });
});
