/**
 * BasicSecurityPlugin 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../../src/core/EventBus';
import { BasicSecurityPlugin } from '../../../../src/plugins/security/BasicSecurityPlugin';
import { UploadError } from '../../../../src/core/error/UploadError';
import { SecurityErrorType } from '../../../../src/types/errors';

// 模拟 UploaderCore
class MockUploaderCore {
  private eventBus: EventBus;
  private config: any;
  private pluginManager: any;

  constructor(config = {}) {
    this.eventBus = new EventBus();
    this.config = config;
    this.pluginManager = {
      registerHook: vi.fn(),
      removePluginHooks: vi.fn(),
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
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该使用默认选项创建插件', () => {
      expect(plugin).toBeDefined();
      expect(plugin.options).toBeDefined();
      expect(plugin.options.maxFileSize).toBeDefined();
      expect(plugin.options.allowedFileTypes).toBeDefined();
    });

    it('应该用自定义选项覆盖默认选项', () => {
      const customOptions = {
        maxFileSize: 20 * 1024 * 1024,
        allowedFileTypes: ['image/png', 'application/pdf'],
      };
      plugin = new BasicSecurityPlugin(customOptions);
      expect(plugin.options.maxFileSize).toBe(customOptions.maxFileSize);
      expect(plugin.options.allowedFileTypes).toEqual(
        customOptions.allowedFileTypes
      );
    });
  });

  describe('安装/卸载', () => {
    it('应该正确安装插件', () => {
      plugin.install(uploader);
      expect(uploader.getPluginManager().registerHook).toHaveBeenCalled();
      expect(eventBus.on).toHaveBeenCalled();
    });

    it('应该正确卸载插件', () => {
      plugin.install(uploader);
      plugin.uninstall(uploader);
      expect(uploader.getPluginManager().removePluginHooks).toHaveBeenCalled();
      expect(eventBus.off).toHaveBeenCalled();
    });
  });

  describe('文件验证', () => {
    beforeEach(() => {
      plugin.install(uploader);
    });

    it('应该允许有效的文件上传', () => {
      const file = new File(['test content'], 'test.jpg', {
        type: 'image/jpeg',
      });
      const result = plugin.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('应该拒绝超过大小限制的文件', () => {
      // 模拟超过大小限制的文件
      const mockFile = {
        name: 'large-file.jpg',
        size: plugin.options.maxFileSize + 1024,
        type: 'image/jpeg',
      } as File;

      const result = plugin.validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(UploadError);
      expect(result.error?.type).toBe(SecurityErrorType.FILE_SIZE_EXCEEDED);
    });

    it('应该拒绝不允许的文件类型', () => {
      // 使用限制更严格的插件
      plugin = new BasicSecurityPlugin({
        allowedFileTypes: ['image/jpeg', 'image/png'],
      });
      plugin.install(uploader);

      const file = new File(['test content'], 'test.exe', {
        type: 'application/x-msdownload',
      });
      const result = plugin.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(UploadError);
      expect(result.error?.type).toBe(SecurityErrorType.FILE_TYPE_NOT_ALLOWED);
    });

    it('应该拒绝敏感文件后缀', () => {
      const file = new File(['test content'], 'script.exe', {
        type: 'application/octet-stream',
      });
      const result = plugin.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(UploadError);
      expect(result.error?.type).toBe(
        SecurityErrorType.SENSITIVE_FILE_EXTENSION
      );
    });

    it('应该检测MIME类型与后缀不匹配的文件', () => {
      // 创建一个扩展名和MIME类型不匹配的文件
      const file = new File(['test content'], 'fake-image.png', {
        type: 'application/javascript',
      });
      const result = plugin.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(UploadError);
      expect(result.error?.type).toBe(SecurityErrorType.MIME_TYPE_MISMATCH);
    });
  });

  describe('辅助方法', () => {
    it('_checkFileType应该正确处理通配符匹配', () => {
      plugin = new BasicSecurityPlugin({
        allowedFileTypes: ['image/*', 'application/pdf'],
      });

      // 直接测试内部方法
      expect(plugin['_checkFileType']('image/jpeg')).toBe(true);
      expect(plugin['_checkFileType']('image/png')).toBe(true);
      expect(plugin['_checkFileType']('application/pdf')).toBe(true);
      expect(plugin['_checkFileType']('video/mp4')).toBe(false);
    });

    it('_getFileExtension应该正确提取文件扩展名', () => {
      expect(plugin['_getFileExtension']('document.pdf')).toBe('pdf');
      expect(plugin['_getFileExtension']('image.with.multiple.dots.jpg')).toBe(
        'jpg'
      );
      expect(plugin['_getFileExtension']('noextension')).toBe('');
      expect(plugin['_getFileExtension']('.hiddenfile')).toBe('hiddenfile');
    });

    it('_validateFileExtensionWithMime应该正确验证扩展名与MIME类型的匹配', () => {
      expect(
        plugin['_validateFileExtensionWithMime']('image.jpg', 'image/jpeg')
      ).toBe(true);
      expect(
        plugin['_validateFileExtensionWithMime'](
          'document.pdf',
          'application/pdf'
        )
      ).toBe(true);
      expect(
        plugin['_validateFileExtensionWithMime'](
          'fake-image.jpg',
          'application/javascript'
        )
      ).toBe(false);
    });
  });

  describe('事件处理', () => {
    it('应该正确记录文件上传开始事件', () => {
      plugin.install(uploader);
      const fileInfo = { id: '123', name: 'test.jpg', size: 1024 };

      // 模拟文件上传开始事件
      const listener = plugin['_handleFileUploadStart'].bind(plugin);
      listener(fileInfo);

      expect(eventBus.emit).toHaveBeenCalledWith(
        'security:log',
        expect.objectContaining({
          file: fileInfo,
          action: 'file_upload_start',
        })
      );
    });

    it('应该正确处理安全相关的上传错误', () => {
      plugin.install(uploader);
      const error = new UploadError(
        SecurityErrorType.FILE_SIZE_EXCEEDED,
        '文件过大'
      );
      const fileInfo = {
        id: '123',
        name: 'large.jpg',
        size: 1024 * 1024 * 1024,
      };

      // 模拟上传错误事件
      const listener = plugin['_handleUploadError'].bind(plugin);
      listener({ error, file: fileInfo });

      expect(eventBus.emit).toHaveBeenCalledWith(
        'security:violation',
        expect.objectContaining({
          file: fileInfo,
          error,
        })
      );
    });
  });
});
