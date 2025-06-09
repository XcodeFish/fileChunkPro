/**
 * SecurityPlugin 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import EventBus from '../../../src/core/EventBus';
import SecurityPlugin from '../../../src/plugins/SecurityPlugin';
import { SecurityLevel } from '../../../src/types';

// 模拟UploaderCore
vi.mock('../../../src/core/UploaderCore');

describe('SecurityPlugin', () => {
  let plugin: SecurityPlugin;
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
        securityLevel: SecurityLevel.STANDARD,
        enableFileScan: true,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowFileTypes: ['image/*', 'application/pdf'],
      }),
    };

    // 创建插件实例
    plugin = new SecurityPlugin({
      level: SecurityLevel.STANDARD,
      enableContentValidation: true,
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
        expect.objectContaining({ plugin: 'SecurityPlugin' })
      );
      expect(mockPluginManager.registerHook).toHaveBeenCalledWith(
        'beforeChunkUpload',
        expect.any(Function),
        expect.objectContaining({ plugin: 'SecurityPlugin' })
      );
    });

    it('应该能正确销毁插件', () => {
      // 先安装插件
      plugin.install(mockUploader);

      // 调用销毁方法
      plugin.destroy();

      // 验证清理工作
      expect(mockPluginManager.removePluginHooks).toHaveBeenCalledWith(
        'SecurityPlugin'
      );
    });
  });

  describe('文件验证', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    it('应该拒绝超过大小限制的文件', async () => {
      // 模拟大文件
      const largeFile = new File(
        [new ArrayBuffer(150 * 1024 * 1024)], // 150MB
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
      expect(result.result.errors).toContain('文件大小超过限制');
    });

    it('应该拒绝不允许的文件类型', async () => {
      // 模拟不允许的文件类型
      const executableFile = new File(
        [new ArrayBuffer(1024)],
        'malicious.exe',
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
      expect(result.result.errors).toContain('文件类型不允许');
    });

    it('应该接受符合要求的文件', async () => {
      // 模拟符合要求的文件
      const validFile = new File(
        [new ArrayBuffer(1024 * 1024)], // 1MB
        'document.pdf',
        { type: 'application/pdf' }
      );

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      const result = await beforeFileUploadHook({ file: validFile });

      // 验证文件被接受
      expect(result.handled).toBe(true);
      expect(result.result.valid).toBe(true);
      expect(result.result.errors.length).toBe(0);
    });
  });

  describe('安全级别设置', () => {
    it('应该根据不同安全级别应用不同的规则', () => {
      // 创建基本安全级别的插件
      const basicPlugin = new SecurityPlugin({
        level: SecurityLevel.BASIC,
      });
      basicPlugin.install(mockUploader);

      // 创建高级安全级别的插件
      const advancedPlugin = new SecurityPlugin({
        level: SecurityLevel.ADVANCED,
        enableContentValidation: true,
        enableAntivirusScan: true,
      });
      advancedPlugin.install(mockUploader);

      // 检查钩子注册次数
      expect(mockPluginManager.registerHook).toHaveBeenCalledTimes(4);
    });
  });

  describe('内容检测功能', () => {
    beforeEach(() => {
      // 使用高级安全级别创建插件
      plugin = new SecurityPlugin({
        level: SecurityLevel.ADVANCED,
        enableContentValidation: true,
        enableAntivirusScan: true,
      });
      plugin.install(mockUploader);
    });

    it('应该检测文件内容签名', async () => {
      // 模拟文件检测方法
      vi.spyOn(plugin as any, 'validateFileContent').mockResolvedValue({
        valid: true,
        reason: '',
      });

      // 模拟符合要求的文件
      const file = new File([new ArrayBuffer(1024 * 1024)], 'document.pdf', {
        type: 'application/pdf',
      });

      // 模拟 beforeFileUpload 钩子函数
      const beforeFileUploadHook =
        mockPluginManager.registerHook.mock.calls.find(
          call => call[0] === 'beforeFileUpload'
        )[1];

      // 调用钩子
      await beforeFileUploadHook({ file });

      // 验证内容验证被调用
      expect((plugin as any).validateFileContent).toHaveBeenCalledWith(file);
    });
  });

  describe('防篡改保护', () => {
    beforeEach(() => {
      // 安装插件
      plugin.install(mockUploader);
    });

    it('应该正确计算和验证文件哈希', async () => {
      // 模拟哈希计算方法
      vi.spyOn(plugin as any, 'calculateFileHash').mockResolvedValue(
        'abc123hash'
      );

      // 模拟符合要求的文件
      const file = new File([new ArrayBuffer(1024 * 1024)], 'document.pdf', {
        type: 'application/pdf',
      });

      // 触发文件上传事件
      await mockEventBus.emit('fileUpload:start', { file });

      // 验证哈希计算被调用
      expect((plugin as any).calculateFileHash).toHaveBeenCalledWith(file);
    });
  });
});
