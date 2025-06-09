/**
 * BasicSecurityPlugin 单元测试
 */

import { EventBus } from '../../../../src/core/EventBus';
import { BasicSecurityPlugin } from '../../../../src/plugins/security';
import {
  ErrorGroup,
  ErrorSeverity,
  SecurityLevel,
} from '../../../../src/types';

// 模拟 UploaderCore
class MockUploaderCore {
  private eventBus: EventBus;
  private config: any;
  private pluginManager: any;

  constructor(config = {}) {
    this.eventBus = new EventBus();
    this.config = config;
    this.pluginManager = {
      registerHook: jest.fn(),
      removePluginHooks: jest.fn(),
    };
  }

  getEventBus() {
    return this.eventBus;
  }

  getConfig() {
    return this.config;
  }

  getPluginManager() {
    return this.pluginManager;
  }
}

describe('BasicSecurityPlugin', () => {
  let plugin: BasicSecurityPlugin;
  let uploader: MockUploaderCore;
  let eventBus: EventBus;

  beforeEach(() => {
    uploader = new MockUploaderCore({
      debug: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowFileTypes: ['image/*', 'application/pdf'],
    });
    eventBus = uploader.getEventBus();
    plugin = new BasicSecurityPlugin();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该使用默认选项创建插件', () => {
      const plugin = new BasicSecurityPlugin();
      // @ts-ignore - 访问私有属性进行测试
      expect(plugin._options).toBeDefined();
      // @ts-ignore
      expect(plugin._options.maxFileSize).toBe(100 * 1024 * 1024); // 默认100MB
    });

    it('应该用自定义选项覆盖默认选项', () => {
      const customOptions = {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ['image/jpeg'],
        maxFileNameLength: 50,
        enableSensitiveExtensionCheck: false,
      };
      const plugin = new BasicSecurityPlugin(customOptions);
      // @ts-ignore
      expect(plugin._options.maxFileSize).toBe(customOptions.maxFileSize);
      // @ts-ignore
      expect(plugin._options.allowedMimeTypes).toEqual(
        customOptions.allowedMimeTypes
      );
      // @ts-ignore
      expect(plugin._options.maxFileNameLength).toBe(
        customOptions.maxFileNameLength
      );
      // @ts-ignore
      expect(plugin._options.enableSensitiveExtensionCheck).toBe(
        customOptions.enableSensitiveExtensionCheck
      );
    });
  });

  describe('安装/卸载', () => {
    it('应该正确安装插件', () => {
      plugin.install(uploader as any);

      // 验证钩子注册
      expect(uploader.getPluginManager().registerHook).toHaveBeenCalledWith(
        'beforeFileUpload',
        expect.any(Function),
        expect.objectContaining({ plugin: 'BasicSecurityPlugin' })
      );

      // 验证事件监听器注册
      expect(eventBus.listenerCount('fileUpload:start')).toBe(1);
      expect(eventBus.listenerCount('fileUpload:error')).toBe(1);
    });

    it('应该正确卸载插件', () => {
      plugin.install(uploader as any);
      plugin.uninstall();

      // 验证钩子移除
      expect(
        uploader.getPluginManager().removePluginHooks
      ).toHaveBeenCalledWith('BasicSecurityPlugin');

      // 验证事件监听器移除
      expect(eventBus.listenerCount('fileUpload:start')).toBe(0);
      expect(eventBus.listenerCount('fileUpload:error')).toBe(0);
    });
  });

  describe('文件验证', () => {
    beforeEach(() => {
      plugin.install(uploader as any);
    });

    it('应该允许有效的文件上传', async () => {
      // 创建一个有效的文件对象
      const validFile = new File(
        [new ArrayBuffer(1024 * 1024)], // 1MB
        'test-image.jpg',
        { type: 'image/jpeg' }
      );

      // 执行钩子
      // @ts-ignore - 访问私有方法进行测试
      const result = await plugin._validateFile({ file: validFile });

      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(true);
      expect(result.result.errors.length).toBe(0);
    });

    it('应该拒绝超过大小限制的文件', async () => {
      // 创建一个超大文件对象
      const oversizedFile = new File(
        [new ArrayBuffer(10 * 1024 * 1024)], // 10MB, 超过5MB限制
        'large-image.jpg',
        { type: 'image/jpeg' }
      );

      // 监听安全事件
      const securityIssueHandler = jest.fn();
      eventBus.on('security:issue', securityIssueHandler);

      // 执行钩子
      // @ts-ignore
      const result = await plugin._validateFile({ file: oversizedFile });

      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain('文件大小超过限制');

      // 验证事件触发
      expect(securityIssueHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SecurityLevel.BASIC,
          message: '文件大小超过限制',
          severity: ErrorSeverity.HIGH,
          group: ErrorGroup.SECURITY,
        })
      );
    });

    it('应该拒绝不允许的文件类型', async () => {
      // 创建一个不允许类型的文件
      const executableFile = new File(
        [new ArrayBuffer(1024 * 1024)], // 1MB
        'script.js',
        { type: 'application/javascript' }
      );

      // 监听安全事件
      const securityIssueHandler = jest.fn();
      eventBus.on('security:issue', securityIssueHandler);

      // 执行钩子
      // @ts-ignore
      const result = await plugin._validateFile({ file: executableFile });

      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain('文件类型不允许');

      // 验证事件触发
      expect(securityIssueHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SecurityLevel.BASIC,
          message: '文件类型不允许',
          severity: ErrorSeverity.HIGH,
          group: ErrorGroup.SECURITY,
        })
      );
    });

    it('应该拒绝敏感文件后缀', async () => {
      // 使用默认启用敏感后缀检查的配置
      const plugin = new BasicSecurityPlugin({
        enableSensitiveExtensionCheck: true,
      });
      plugin.install(uploader as any);

      // 创建一个敏感后缀的文件
      const sensitiveFile = new File(
        [new ArrayBuffer(1024 * 1024)], // 1MB
        'dangerous.exe',
        { type: 'application/octet-stream' }
      );

      // 监听安全事件
      const securityIssueHandler = jest.fn();
      eventBus.on('security:issue', securityIssueHandler);

      // 执行钩子
      // @ts-ignore
      const result = await plugin._validateFile({ file: sensitiveFile });

      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain('文件类型可能存在安全风险');

      // 验证事件触发
      expect(securityIssueHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SecurityLevel.BASIC,
          message: '检测到敏感文件类型',
          severity: ErrorSeverity.HIGH,
          group: ErrorGroup.SECURITY,
        })
      );
    });

    it('应该检测MIME类型与后缀不匹配的文件', async () => {
      // 使用启用扩展名验证的配置
      const plugin = new BasicSecurityPlugin({
        validateFileExtension: true,
      });
      plugin.install(uploader as any);

      // 创建一个MIME类型与后缀不匹配的文件
      const mismatchFile = new File(
        [new ArrayBuffer(1024 * 1024)], // 1MB
        'fake.pdf', // PDF后缀
        { type: 'image/jpeg' } // 但实际是JPEG类型
      );

      // 监听安全事件
      const securityIssueHandler = jest.fn();
      eventBus.on('security:issue', securityIssueHandler);

      // 执行钩子
      // @ts-ignore
      const result = await plugin._validateFile({ file: mismatchFile });

      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(false);
      expect(result.result.errors).toContain('文件后缀与实际类型不匹配');

      // 验证事件触发
      expect(securityIssueHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SecurityLevel.BASIC,
          message: '文件后缀与MIME类型不匹配',
          severity: ErrorSeverity.HIGH,
          group: ErrorGroup.SECURITY,
        })
      );
    });
  });

  describe('辅助方法', () => {
    it('_checkFileType应该正确处理通配符匹配', () => {
      // @ts-ignore - 访问私有方法进行测试
      expect(plugin._checkFileType('image/jpeg', ['image/*'])).toBe(true);
      // @ts-ignore
      expect(plugin._checkFileType('video/mp4', ['image/*'])).toBe(false);
      // @ts-ignore
      expect(
        plugin._checkFileType('application/pdf', ['application/pdf'])
      ).toBe(true);
      // @ts-ignore
      expect(
        plugin._checkFileType('application/json', ['application/pdf'])
      ).toBe(false);
      // @ts-ignore
      expect(plugin._checkFileType('text/plain', ['*'])).toBe(true);
      // @ts-ignore
      expect(plugin._checkFileType('unknown/type', [])).toBe(true); // 空列表允许所有类型
    });

    it('_getFileExtension应该正确提取文件扩展名', () => {
      // @ts-ignore - 访问私有方法进行测试
      expect(plugin._getFileExtension('file.jpg')).toBe('jpg');
      // @ts-ignore
      expect(plugin._getFileExtension('document.pdf')).toBe('pdf');
      // @ts-ignore
      expect(plugin._getFileExtension('archive.tar.gz')).toBe('gz');
      // @ts-ignore
      expect(plugin._getFileExtension('noextension')).toBe('');
      // @ts-ignore
      expect(plugin._getFileExtension('.hidden')).toBe('hidden');
    });

    it('_validateFileExtensionWithMime应该正确验证扩展名与MIME类型的匹配', () => {
      // 创建测试文件
      const validFile = new File([], 'test.jpg', { type: 'image/jpeg' });
      const invalidFile = new File([], 'fake.jpg', { type: 'application/pdf' });
      const unknownExtFile = new File([], 'test.xyz', {
        type: 'application/octet-stream',
      });

      // @ts-ignore - 访问私有方法进行测试
      expect(plugin._validateFileExtensionWithMime(validFile)).toBe(true);
      // @ts-ignore
      expect(plugin._validateFileExtensionWithMime(invalidFile)).toBe(false);
      // @ts-ignore
      expect(plugin._validateFileExtensionWithMime(unknownExtFile)).toBe(true); // 未知扩展名不做验证
    });
  });

  describe('事件处理', () => {
    beforeEach(() => {
      plugin.install(uploader as any);
    });

    it('应该正确记录文件上传开始事件', () => {
      const securityEventHandler = jest.fn();
      eventBus.on('security:event', securityEventHandler);

      const file = new File([], 'test.jpg', { type: 'image/jpeg' });

      // @ts-ignore - 访问私有方法进行测试
      plugin._onFileUploadStart({ file });

      expect(securityEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SecurityLevel.BASIC,
          message: '文件上传开始',
          data: expect.objectContaining({
            fileName: 'test.jpg',
            fileType: 'image/jpeg',
          }),
        })
      );
    });

    it('应该正确处理安全相关的上传错误', () => {
      const securityIssueHandler = jest.fn();
      eventBus.on('security:issue', securityIssueHandler);

      const file = new File([], 'test.jpg', { type: 'image/jpeg' });
      const error = new Error('安全错误');
      (error as any).type = 'SECURITY_ERROR';

      // @ts-ignore - 访问私有方法进行测试
      plugin._onFileUploadError({ error, file });

      expect(securityIssueHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: SecurityLevel.BASIC,
          message: '上传安全错误',
          severity: ErrorSeverity.HIGH,
          group: ErrorGroup.SECURITY,
        })
      );
    });
  });
});
