import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileManager } from '../../../src/core/FileManager';
import { EventBus } from '../../../src/core/EventBus';
import { DependencyContainer } from '../../../src/core/DependencyContainer';
import { TestFileGenerator } from '../../setup';

describe('FileManager', () => {
  let fileManager: FileManager;
  let mockContainer: DependencyContainer;
  let mockEventBus: EventBus;
  let mockPluginManager: any;

  // 模拟依赖
  beforeEach(() => {
    mockEventBus = new EventBus();

    mockPluginManager = {
      applyHook: vi.fn().mockResolvedValue({ result: {} }),
    };

    mockContainer = {
      resolve: vi.fn((token: string) => {
        if (token === 'eventBus') return mockEventBus;
        if (token === 'pluginManager') return mockPluginManager;
        return null;
      }),
    } as unknown as DependencyContainer;

    fileManager = new FileManager(mockContainer);
  });

  afterEach(() => {
    fileManager.dispose();
    vi.clearAllMocks();
  });

  describe('validateFile', () => {
    it('应该验证文件大小', async () => {
      const smallFile = TestFileGenerator.createTextFile(1024 * 1024); // 1MB
      const largeFile = TestFileGenerator.createTextFile(
        2 * 1024 * 1024 * 1024
      ); // 2GB

      // 创建文件管理器，设置文件大小限制为1GB
      const limitedFileManager = new FileManager(mockContainer, {
        maxFileSize: 1024 * 1024 * 1024, // 1GB
      });

      // 验证文件大小在限制范围内
      const smallResult = await limitedFileManager.validateFile(smallFile);
      expect(smallResult.valid).toBe(true);
      expect(smallResult.errors.length).toBe(0);

      // 验证文件大小超出限制
      const largeResult = await limitedFileManager.validateFile(largeFile);
      expect(largeResult.valid).toBe(false);
      expect(largeResult.errors.length).toBeGreaterThan(0);
      expect(largeResult.errors[0]).toContain('文件大小超过限制');
    });

    it('应该验证允许的文件类型', async () => {
      const textFile = new File(['测试内容'], 'test.txt', {
        type: 'text/plain',
      });
      const imgFile = new File(['图片数据'], 'test.png', { type: 'image/png' });

      // 创建文件管理器，只允许文本文件
      const typeRestrictedManager = new FileManager(mockContainer, {
        allowedFileTypes: ['text/plain', '*.txt'],
      });

      // 验证允许的文件类型
      const textResult = await typeRestrictedManager.validateFile(textFile);
      expect(textResult.valid).toBe(true);
      expect(textResult.errors.length).toBe(0);

      // 验证不允许的文件类型
      const imgResult = await typeRestrictedManager.validateFile(imgFile);
      expect(imgResult.valid).toBe(false);
      expect(imgResult.errors.length).toBeGreaterThan(0);
      expect(imgResult.errors[0]).toContain('不支持的文件类型');
    });

    it('应该验证不允许的文件类型', async () => {
      const jsFile = new File(['alert("test")'], 'script.js', {
        type: 'application/javascript',
      });
      const textFile = new File(['普通文本'], 'text.txt', {
        type: 'text/plain',
      });

      // 创建文件管理器，禁止脚本文件
      const typeRestrictedManager = new FileManager(mockContainer, {
        disallowedFileTypes: ['application/javascript', '*.js'],
      });

      // 验证不允许的文件类型
      const jsResult = await typeRestrictedManager.validateFile(jsFile);
      expect(jsResult.valid).toBe(false);
      expect(jsResult.errors.length).toBeGreaterThan(0);
      expect(jsResult.errors[0]).toContain('文件类型不被允许');

      // 验证允许的文件类型
      const textResult = await typeRestrictedManager.validateFile(textFile);
      expect(textResult.valid).toBe(true);
      expect(textResult.errors.length).toBe(0);
    });

    it('应该运行插件钩子进行额外验证', async () => {
      const file = new File(['测试'], 'test.txt', { type: 'text/plain' });

      // 模拟插件返回错误
      mockPluginManager.applyHook.mockResolvedValue({
        result: {
          errors: ['插件验证错误'],
          warnings: ['插件验证警告'],
        },
      });

      const result = await fileManager.validateFile(file);

      expect(mockPluginManager.applyHook).toHaveBeenCalledWith('validateFile', {
        file,
        result: expect.any(Object),
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('插件验证错误');
      expect(result.warnings).toContain('插件验证警告');
    });
  });

  describe('getFileType', () => {
    it('应该从File对象获取MIME类型', () => {
      const file = new File(['测试'], 'test.txt', { type: 'text/plain' });
      const type = fileManager.getFileType(file);
      expect(type).toBe('text/plain');
    });

    it('应该从文件名获取MIME类型（无类型File）', () => {
      const file = new File(['测试'], 'test.pdf', { type: '' });
      const type = fileManager.getFileType(file);
      expect(type).toContain('application/pdf');
    });

    it('应该从Blob对象获取MIME类型', () => {
      const blob = new Blob(['测试'], { type: 'text/plain' });
      const type = fileManager.getFileType(blob);
      expect(type).toBe('text/plain');
    });

    it('应该处理未知类型', () => {
      const blob = new Blob(['测试'], { type: '' });
      const type = fileManager.getFileType(blob);
      expect(type).toBe('application/octet-stream');
    });
  });

  describe('prepareFile', () => {
    it('应该生成文件信息和元数据', async () => {
      const file = new File(['测试内容'], 'test.txt', { type: 'text/plain' });

      const { info, metadata } = await fileManager.prepareFile(file);

      expect(info).toBeDefined();
      expect(info.name).toBe('test.txt');
      expect(info.size).toBe(12); // '测试内容' 的字节长度
      expect(info.type).toBe('text/plain');
      expect(info.id).toBeDefined();

      expect(metadata).toBeDefined();
      expect(metadata.createdAt).toBeDefined();
      expect(metadata.extension).toBe('txt');
    });

    it('应该在文件无效时抛出错误', async () => {
      const file = new File([''], 'invalid.exe', {
        type: 'application/octet-stream',
      });

      // 模拟验证失败
      vi.spyOn(fileManager, 'validateFile').mockResolvedValue({
        valid: false,
        errors: ['文件验证错误'],
        warnings: [],
      });

      await expect(fileManager.prepareFile(file)).rejects.toThrow(
        '文件验证错误'
      );

      // 恢复原始实现
      (fileManager.validateFile as any).mockRestore();
    });
  });

  describe('createChunks', () => {
    it('应该将文件分成正确数量的分片', async () => {
      const fileSize = 1024 * 1024; // 1MB
      const chunkSize = 256 * 1024; // 256KB
      const expectedChunks = 4; // 1MB / 256KB = 4

      const file = TestFileGenerator.createTextFile(fileSize);

      const chunks = await fileManager.createChunks(file, chunkSize);

      expect(chunks.length).toBe(expectedChunks);

      // 验证前3个分片大小
      for (let i = 0; i < expectedChunks - 1; i++) {
        expect(chunks[i].size).toBe(chunkSize);
      }

      // 验证最后一个分片大小
      expect(chunks[expectedChunks - 1].size).toBe(chunkSize);
    });

    it('应该为每个分片生成唯一的ID和索引', async () => {
      const file = TestFileGenerator.createTextFile(1024 * 1024); // 1MB
      const chunkSize = 512 * 1024; // 512KB

      const chunks = await fileManager.createChunks(file, chunkSize);

      expect(chunks.length).toBe(2);

      // 验证索引
      expect(chunks[0].index).toBe(0);
      expect(chunks[1].index).toBe(1);

      // 验证ID唯一性
      expect(chunks[0].id).not.toBe(chunks[1].id);
    });

    it('应该将分片关联到文件ID', async () => {
      const file = TestFileGenerator.createTextFile(1024 * 1024); // 1MB

      // 先准备文件获取ID
      const { info } = await fileManager.prepareFile(file);
      const fileId = info.id;

      // 创建分片
      const chunks = await fileManager.createChunks(file, 512 * 1024);

      // 验证所有分片都关联到正确的文件ID
      chunks.forEach(chunk => {
        expect(chunk.fileId).toBe(fileId);
      });

      // 释放分片并验证清理
      fileManager.releaseFileChunks(fileId);
    });
  });

  describe('getOptimalChunkSize', () => {
    it('应该根据文件大小返回最佳分片大小', async () => {
      // 小文件
      const smallSize = await fileManager.getOptimalChunkSize(1024 * 1024); // 1MB
      expect(smallSize).toBeGreaterThanOrEqual(512 * 1024); // 至少512KB

      // 中等大小文件
      const mediumSize = await fileManager.getOptimalChunkSize(
        100 * 1024 * 1024
      ); // 100MB
      expect(mediumSize).toBeGreaterThan(smallSize);

      // 大文件
      const largeSize = await fileManager.getOptimalChunkSize(
        1024 * 1024 * 1024
      ); // 1GB
      expect(largeSize).toBeGreaterThanOrEqual(mediumSize);

      // 确保最大不超过50MB（默认上限）
      expect(largeSize).toBeLessThanOrEqual(50 * 1024 * 1024);
    });

    it('应该考虑设置的最小和最大分片大小', async () => {
      // 创建文件管理器，设置分片大小范围
      const customFileManager = new FileManager(mockContainer, {
        minChunkSize: 1024 * 1024, // 1MB
        maxChunkSize: 5 * 1024 * 1024, // 5MB
      });

      // 测试最小值
      const smallFile = await customFileManager.getOptimalChunkSize(1024 * 512); // 512KB
      expect(smallFile).toBeGreaterThanOrEqual(1024 * 1024); // 至少1MB

      // 测试最大值
      const largeFile = await customFileManager.getOptimalChunkSize(
        1024 * 1024 * 1024
      ); // 1GB
      expect(largeFile).toBeLessThanOrEqual(5 * 1024 * 1024); // 最多5MB
    });
  });

  describe('generateFileId', () => {
    it('应该生成唯一的文件ID', async () => {
      const file1 = new File(['测试1'], 'test1.txt');
      const file2 = new File(['测试2'], 'test2.txt');

      const id1 = await fileManager.generateFileId(file1);
      const id2 = await fileManager.generateFileId(file2);

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('应该为相同内容的文件生成相同ID', async () => {
      const content = 'identical content';
      const file1 = new File([content], 'file1.txt');
      const file2 = new File([content], 'file2.txt');

      const id1 = await fileManager.generateFileId(file1);
      const id2 = await fileManager.generateFileId(file2);

      expect(id1).toBe(id2);
    });
  });

  describe('资源管理', () => {
    it('应该释放文件分片资源', async () => {
      const file = TestFileGenerator.createTextFile(1024 * 1024); // 1MB

      // 准备文件获取ID
      const { info } = await fileManager.prepareFile(file);
      const fileId = info.id;

      // 创建分片
      await fileManager.createChunks(file, 256 * 1024);

      // 释放分片
      fileManager.releaseFileChunks(fileId);

      // 再次创建分片验证不影响新创建
      const newChunks = await fileManager.createChunks(file, 256 * 1024);
      expect(newChunks.length).toBe(4);
    });

    it('应该清理所有与文件相关的资源', async () => {
      const file = TestFileGenerator.createTextFile(1024 * 1024); // 1MB

      // 准备文件获取ID
      const { info } = await fileManager.prepareFile(file);
      const fileId = info.id;

      // 创建分片
      await fileManager.createChunks(file, 256 * 1024);

      // 模拟发送清理事件的函数
      const emitSpy = vi.spyOn(mockEventBus, 'emit');

      // 清理文件
      fileManager.cleanup(fileId);

      // 验证事件触发
      expect(emitSpy).toHaveBeenCalledWith(
        'file:cleanup',
        expect.objectContaining({
          fileId,
        })
      );

      emitSpy.mockRestore();
    });

    it('应该销毁管理器时释放所有资源', () => {
      // 模拟发送销毁事件的函数
      const emitSpy = vi.spyOn(mockEventBus, 'emit');

      fileManager.dispose();

      // 验证事件触发
      expect(emitSpy).toHaveBeenCalledWith(
        'fileManager:dispose',
        expect.any(Object)
      );

      emitSpy.mockRestore();
    });
  });
});
