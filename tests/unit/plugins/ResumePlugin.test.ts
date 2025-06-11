import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResumePlugin } from '../../../src/plugins/ResumePlugin';
import { UploaderCore } from '../../../src/core/UploaderCore';
import { EventBus } from '../../../src/core/EventBus';
import { StorageEngine } from '../../../src/utils/StorageManager';
import { ResumeStorageAdapter } from '../../../src/adapters/ResumeStorageAdapter';
import { ResumeStateManager } from '../../../src/managers/ResumeStateManager';
import { ChunkStatus, UploadStatus } from '../../../src/types/resume';
import { TestFileGenerator } from '../../setup';

// 为依赖模块创建模拟
vi.mock('../../../src/utils/StorageManager', () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    getItem: vi.fn().mockImplementation(key => {
      if (key.includes('chunks')) {
        return Promise.resolve(
          JSON.stringify([
            { index: 0, status: 'completed', md5: 'hash1' },
            { index: 1, status: 'pending', md5: 'hash2' },
          ])
        );
      } else if (key.includes('fileRecord')) {
        return Promise.resolve(
          JSON.stringify({
            id: 'test-file-id',
            name: 'test-file.txt',
            size: 1024,
            type: 'text/plain',
            lastModified: Date.now(),
          })
        );
      }
      return Promise.resolve(null);
    }),
    setItem: vi.fn().mockResolvedValue(true),
    removeItem: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue(['test-key-1', 'test-key-2']),
    getEngine: vi.fn().mockReturnValue(StorageEngine.MEMORY),
  })),
  StorageEngine: {
    LOCAL_STORAGE: 'localStorage',
    SESSION_STORAGE: 'sessionStorage',
    MEMORY: 'memory',
    INDEXED_DB: 'indexedDB',
  },
}));

vi.mock('../../../src/adapters/ResumeStorageAdapter', () => ({
  ResumeStorageAdapter: vi.fn().mockImplementation(() => ({
    saveChunksState: vi.fn().mockResolvedValue(true),
    getChunksState: vi.fn().mockResolvedValue([
      { index: 0, status: ChunkStatus.COMPLETED, md5: 'hash1' },
      { index: 1, status: ChunkStatus.PENDING, md5: 'hash2' },
    ]),
    saveFileRecord: vi.fn().mockResolvedValue(true),
    getFileRecord: vi.fn().mockResolvedValue({
      id: 'test-file-id',
      name: 'test-file.txt',
      size: 1024,
      type: 'text/plain',
      lastModified: Date.now(),
    }),
    saveUploadStatus: vi.fn().mockResolvedValue(true),
    getUploadStatus: vi.fn().mockResolvedValue(UploadStatus.PAUSED),
    hasResumeData: vi.fn().mockResolvedValue(true),
    cleanupFile: vi.fn().mockResolvedValue(true),
    cleanupExpiredData: vi.fn().mockResolvedValue(true),
    getAllFileIds: vi
      .fn()
      .mockResolvedValue(['test-file-id-1', 'test-file-id-2']),
    getStorageStatistics: vi.fn().mockResolvedValue({
      totalFiles: 2,
      totalSize: 2048,
      oldestRecord: new Date().toISOString(),
    }),
  })),
}));

vi.mock('../../../src/managers/ResumeStateManager', () => ({
  ResumeStateManager: vi.fn().mockImplementation(() => ({
    initializeFileState: vi.fn().mockResolvedValue(true),
    updateChunkState: vi.fn().mockResolvedValue(true),
    getFileState: vi.fn().mockResolvedValue({
      fileId: 'test-file-id',
      status: UploadStatus.PAUSED,
      progress: 0.5,
      chunks: [
        { index: 0, status: ChunkStatus.COMPLETED },
        { index: 1, status: ChunkStatus.PENDING },
      ],
    }),
    markChunkCompleted: vi.fn().mockResolvedValue(true),
    markChunkFailed: vi.fn().mockResolvedValue(true),
    markFileCompleted: vi.fn().mockResolvedValue(true),
    markFileFailed: vi.fn().mockResolvedValue(true),
    saveState: vi.fn().mockResolvedValue(true),
    pauseFile: vi.fn().mockResolvedValue(true),
    resumeFile: vi.fn().mockResolvedValue(true),
    cancelFile: vi.fn().mockResolvedValue(true),
    checkStateConsistency: vi.fn().mockResolvedValue({
      isConsistent: true,
      issues: [],
    }),
  })),
}));

vi.mock('../../../src/managers/ChunkIndexManager', () => ({
  ChunkIndexManager: vi.fn().mockImplementation(() => ({
    getCompletedChunks: vi.fn().mockReturnValue([0]),
    getPendingChunks: vi.fn().mockReturnValue([1]),
    isChunkCompleted: vi
      .fn()
      .mockImplementation((fileId, chunkIndex) => chunkIndex === 0),
    markChunkCompleted: vi.fn(),
    markChunkPending: vi.fn(),
    markChunkFailed: vi.fn(),
    getChunksStatus: vi.fn().mockReturnValue({
      total: 2,
      completed: 1,
      pending: 1,
      failed: 0,
    }),
  })),
}));

vi.mock('../../../src/managers/FileRecordManager', () => ({
  FileRecordManager: vi.fn().mockImplementation(() => ({
    addFile: vi.fn().mockResolvedValue(true),
    getFile: vi.fn().mockResolvedValue({
      id: 'test-file-id',
      name: 'test-file.txt',
      size: 1024,
      type: 'text/plain',
      lastModified: Date.now(),
    }),
    removeFile: vi.fn().mockResolvedValue(true),
    getAllFiles: vi.fn().mockResolvedValue([
      {
        id: 'test-file-id-1',
        name: 'test-file-1.txt',
        size: 1024,
        type: 'text/plain',
      },
      {
        id: 'test-file-id-2',
        name: 'test-file-2.txt',
        size: 1024,
        type: 'text/plain',
      },
    ]),
    cleanupOldRecords: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('../../../src/managers/ResumeSessionManager', () => ({
  ResumeSessionManager: vi.fn().mockImplementation(() => ({
    startSession: vi.fn().mockResolvedValue({
      sessionId: 'test-session-id',
      startTime: Date.now(),
    }),
    endSession: vi.fn().mockResolvedValue(true),
    saveCheckpoint: vi.fn().mockResolvedValue(true),
    getSessionInfo: vi.fn().mockReturnValue({
      sessionId: 'test-session-id',
      startTime: Date.now(),
      lastCheckpoint: Date.now(),
    }),
    destroy: vi.fn(),
  })),
}));

// 模拟核心类
const mockCore = {
  resumeFile: vi.fn().mockResolvedValue(true),
  getFile: vi.fn().mockReturnValue({
    id: 'test-file-id',
    name: 'test-file.txt',
    size: 1024,
    type: 'text/plain',
    status: 'paused',
  }),
  getChunks: vi.fn().mockReturnValue([
    {
      index: 0,
      start: 0,
      end: 511,
      status: 'completed',
    },
    {
      index: 1,
      start: 512,
      end: 1023,
      status: 'pending',
    },
  ]),
  on: vi.fn(),
  off: vi.fn(),
} as unknown as UploaderCore;

describe('ResumePlugin', () => {
  let resumePlugin: ResumePlugin;
  let eventBus: EventBus;

  beforeEach(() => {
    // 创建新的事件总线实例
    eventBus = new EventBus();

    // 为EventBus.getInstance创建模拟
    vi.spyOn(EventBus, 'getInstance').mockReturnValue(eventBus);

    // 创建插件实例
    resumePlugin = new ResumePlugin({
      enabled: true,
      storage: {
        engine: StorageEngine.MEMORY,
        path: 'test-path',
        namespace: 'test-namespace',
      },
      maxFileRecords: 50,
      checkpointInterval: 5000,
      expirationTime: 24 * 60 * 60 * 1000, // 1天
      autoSaveOnUnload: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基本功能', () => {
    it('应该正确安装插件', () => {
      resumePlugin.install(mockCore);

      // 验证事件监听器已注册
      expect(mockCore.on).toHaveBeenCalledTimes(8);

      // 验证监听了关键事件
      expect(mockCore.on).toHaveBeenCalledWith(
        'beforeFileAdd',
        expect.any(Function)
      );
      expect(mockCore.on).toHaveBeenCalledWith(
        'afterFileAdd',
        expect.any(Function)
      );
      expect(mockCore.on).toHaveBeenCalledWith(
        'beforeChunkUpload',
        expect.any(Function)
      );
      expect(mockCore.on).toHaveBeenCalledWith(
        'afterChunkUpload',
        expect.any(Function)
      );
      expect(mockCore.on).toHaveBeenCalledWith(
        'chunkUploadError',
        expect.any(Function)
      );
      expect(mockCore.on).toHaveBeenCalledWith(
        'afterFileUpload',
        expect.any(Function)
      );
      expect(mockCore.on).toHaveBeenCalledWith(
        'fileUploadError',
        expect.any(Function)
      );
      expect(mockCore.on).toHaveBeenCalledWith(
        'filePause',
        expect.any(Function)
      );
    });

    it('应该正确卸载插件', async () => {
      // 首先安装插件
      resumePlugin.install(mockCore);

      // 卸载插件
      resumePlugin.uninstall();

      // 验证事件监听器已移除
      expect(mockCore.off).toHaveBeenCalledTimes(8);
    });

    it('应该跳过重复安装', () => {
      // 首次安装
      resumePlugin.install(mockCore);

      // 清除模拟计数
      (mockCore.on as jest.Mock).mockClear();

      // 重复安装
      resumePlugin.install(mockCore);

      // 验证没有再次注册监听器
      expect(mockCore.on).not.toHaveBeenCalled();
    });
  });

  describe('断点续传功能', () => {
    beforeEach(() => {
      // 安装插件
      resumePlugin.install(mockCore);
    });

    it('应该检查文件是否具有续传数据', async () => {
      const hasData = await resumePlugin.hasResumeData('test-file-id');
      expect(hasData).toBe(true);
    });

    it('应该获取可恢复的上传列表', async () => {
      const uploads = await resumePlugin.getResumableUploads();
      expect(uploads).toHaveLength(2);
      expect(uploads[0].id).toBe('test-file-id-1');
    });

    it('应该继续上传已暂停的文件', async () => {
      const file = TestFileGenerator.createTextFile(1024, 'test-file.txt');
      const resumed = await resumePlugin.resumeUpload('test-file-id', file);

      expect(resumed).toBe(true);
      expect(mockCore.resumeFile).toHaveBeenCalledWith('test-file-id');
    });

    it('应该清理过期数据', async () => {
      await resumePlugin.cleanupExpiredData();

      // 验证存储适配器的清理方法被调用
      const adapter = ResumeStorageAdapter.mock.instances[0];
      expect(adapter.cleanupExpiredData).toHaveBeenCalled();
    });

    it('应该清除指定文件的数据', async () => {
      const cleared = await resumePlugin.clearFileData('test-file-id');

      expect(cleared).toBe(true);
      const adapter = ResumeStorageAdapter.mock.instances[0];
      expect(adapter.cleanupFile).toHaveBeenCalledWith('test-file-id');
    });

    it('应该获取文件上传进度', async () => {
      const progress = await resumePlugin.getFileProgress('test-file-id');

      expect(progress).toBe(0.5); // 50%进度
    });
  });

  describe('事件处理', () => {
    beforeEach(() => {
      // 安装插件
      resumePlugin.install(mockCore);
    });

    it('应该处理分片上传完成事件', async () => {
      // 模拟触发afterChunkUpload事件
      const event = {
        fileId: 'test-file-id',
        chunkIndex: 1,
        response: { success: true },
      };

      // 手动调用事件处理程序
      const handler = mockCore.on.mock.calls.find(
        call => call[0] === 'afterChunkUpload'
      )[1];

      await handler(event);

      // 验证状态管理器更新了分片状态
      const stateManager = ResumeStateManager.mock.instances[0];
      expect(stateManager.markChunkCompleted).toHaveBeenCalledWith(
        'test-file-id',
        1,
        expect.any(Object)
      );
    });

    it('应该处理文件暂停事件', async () => {
      // 模拟触发filePause事件
      const event = { fileId: 'test-file-id' };

      // 手动调用事件处理程序
      const handler = mockCore.on.mock.calls.find(
        call => call[0] === 'filePause'
      )[1];

      await handler(event);

      // 验证状态管理器更新了文件状态
      const stateManager = ResumeStateManager.mock.instances[0];
      expect(stateManager.pauseFile).toHaveBeenCalledWith('test-file-id');
    });

    it('应该处理文件上传错误事件', async () => {
      // 模拟触发fileUploadError事件
      const event = {
        fileId: 'test-file-id',
        error: new Error('测试错误'),
      };

      // 手动调用事件处理程序
      const handler = mockCore.on.mock.calls.find(
        call => call[0] === 'fileUploadError'
      )[1];

      await handler(event);

      // 验证状态管理器更新了文件状态
      const stateManager = ResumeStateManager.mock.instances[0];
      expect(stateManager.markFileFailed).toHaveBeenCalledWith(
        'test-file-id',
        expect.any(Object)
      );
    });
  });

  describe('导入导出功能', () => {
    beforeEach(() => {
      // 安装插件
      resumePlugin.install(mockCore);
    });

    it('应该导出所有续传数据', async () => {
      const jsonData = await resumePlugin.exportAllResumeData();

      expect(typeof jsonData).toBe('string');
      const parsedData = JSON.parse(jsonData);
      expect(parsedData).toHaveProperty('files');
      expect(parsedData).toHaveProperty('version');
      expect(parsedData).toHaveProperty('timestamp');
    });

    it('应该导入续传数据', async () => {
      const mockData = {
        files: [
          {
            id: 'import-file-id',
            record: {
              name: 'imported-file.txt',
              size: 2048,
              type: 'text/plain',
            },
            chunks: [
              { index: 0, status: 'completed' },
              { index: 1, status: 'pending' },
            ],
            status: 'paused',
          },
        ],
        version: '1.0.0',
        timestamp: Date.now(),
      };

      const importedCount = await resumePlugin.importResumeData(
        JSON.stringify(mockData)
      );

      expect(importedCount).toBe(1);
      const adapter = ResumeStorageAdapter.mock.instances[0];
      expect(adapter.saveFileRecord).toHaveBeenCalled();
      expect(adapter.saveChunksState).toHaveBeenCalled();
      expect(adapter.saveUploadStatus).toHaveBeenCalled();
    });
  });

  describe('状态一致性检查', () => {
    beforeEach(() => {
      // 安装插件
      resumePlugin.install(mockCore);
    });

    it('应该检查文件状态一致性', async () => {
      const result = await resumePlugin.checkStateConsistency(
        'test-file-id',
        false
      );

      expect(result.isConsistent).toBe(true);
      const stateManager = ResumeStateManager.mock.instances[0];
      expect(stateManager.checkStateConsistency).toHaveBeenCalledWith(
        'test-file-id',
        false
      );
    });

    it('应该获取文件状态', () => {
      const status = resumePlugin.getFileStatus('test-file-id');

      // 由于我们没有模拟这个方法，它应该返回null
      // 如果要测试具体值，需要单独模拟这个方法
      expect(status).toBeNull();
    });

    it('应该获取剩余分片数量', () => {
      const remainingChunks = resumePlugin.getRemainingChunks('test-file-id');

      // 模拟数据是2个分片，1个已完成，1个待上传
      expect(remainingChunks).toBe(1);
    });

    it('应该获取已上传分片数量', () => {
      const uploadedChunks = resumePlugin.getUploadedChunks('test-file-id');

      // 模拟数据是2个分片，1个已完成
      expect(uploadedChunks).toBe(1);
    });
  });

  describe('存储引擎管理', () => {
    beforeEach(() => {
      // 安装插件
      resumePlugin.install(mockCore);
    });

    it('应该切换存储引擎', async () => {
      const result = await resumePlugin.setStorageEngine(
        StorageEngine.INDEXED_DB
      );

      expect(result).toBe(true);
      // 需要深入模拟内部逻辑才能彻底测试这个功能
    });

    it('应该获取存储统计信息', () => {
      const stats = resumePlugin.getStats();

      expect(stats).toHaveProperty('filesCount');
      expect(stats).toHaveProperty('storageEngine');
    });
  });
});
