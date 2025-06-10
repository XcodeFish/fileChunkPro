/**
 * IndexedDB存储适配器单元测试
 */
import { IndexedDBAdapter } from '../../src/adapters';
import { FileMetadata } from '../../src/types';

// 模拟indexedDB
const mockIDBDatabase = {
  objectStoreNames: {
    contains: jest.fn().mockReturnValue(false),
  },
  createObjectStore: jest.fn().mockReturnValue({
    createIndex: jest.fn(),
  }),
  transaction: jest.fn().mockReturnValue({
    objectStore: jest.fn().mockReturnValue({
      index: jest.fn().mockReturnValue({
        openCursor: jest.fn(),
      }),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      openCursor: jest.fn(),
    }),
  }),
  close: jest.fn(),
};

// 模拟IDB事件
const mockSuccessEvent = {
  target: {
    result: mockIDBDatabase,
  },
};

// 模拟indexedDB.open
const mockIDBOpenDBRequest = {
  onupgradeneeded: null as ((event: any) => void) | null,
  onsuccess: null as ((event: any) => void) | null,
  onerror: null as ((event: any) => void) | null,
  error: null as Error | null,
};

// 模拟请求结果
const mockRequest = {
  onsuccess: null as ((event: any) => void) | null,
  onerror: null as ((event: any) => void) | null,
  error: null as Error | null,
  result: null as any,
};

// 模拟全局indexedDB对象
(global as any).indexedDB = {
  open: jest.fn().mockImplementation(() => {
    setTimeout(() => {
      if (mockIDBOpenDBRequest.onupgradeneeded) {
        mockIDBOpenDBRequest.onupgradeneeded(mockSuccessEvent);
      }
      if (mockIDBOpenDBRequest.onsuccess) {
        mockIDBOpenDBRequest.onsuccess(mockSuccessEvent);
      }
    }, 0);
    return mockIDBOpenDBRequest;
  }),
};

// 模拟IDBKeyRange
(global as any).IDBKeyRange = {
  only: jest.fn().mockReturnValue({}),
  upperBound: jest.fn().mockReturnValue({}),
};

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter;

  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();

    // 创建适配器实例
    adapter = new IndexedDBAdapter({
      dbName: 'test-db',
      dbVersion: 1,
    });
  });

  describe('初始化', () => {
    it('应成功初始化数据库', async () => {
      // 准备模拟
      const initStorageStatsSpy = jest
        .spyOn(adapter as any, '_initStorageStats')
        .mockResolvedValue();

      // 调用方法
      await adapter.init();

      // 验证结果
      expect(global.indexedDB.open).toHaveBeenCalledWith('test-db', 1);
      expect(initStorageStatsSpy).toHaveBeenCalled();
    });
  });

  describe('文件块操作', () => {
    beforeEach(() => {
      // 模拟_ensureDbReady方法
      jest.spyOn(adapter as any, '_ensureDbReady').mockResolvedValue();

      // 模拟_checkStorageQuota方法
      jest.spyOn(adapter as any, '_checkStorageQuota').mockResolvedValue();

      // 模拟_updateStorageStats方法
      jest.spyOn(adapter as any, '_updateStorageStats').mockResolvedValue();

      // 模拟_getChunkSize方法
      jest.spyOn(adapter as any, '_getChunkSize').mockResolvedValue(1024);

      // 模拟_getFileChunksSize方法
      jest.spyOn(adapter as any, '_getFileChunksSize').mockResolvedValue(2048);
    });

    it('应成功保存文件块', async () => {
      // 准备模拟
      const putMock = jest.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockRequest.onsuccess) {
            mockRequest.onsuccess({});
          }
        }, 0);
        return mockRequest;
      });

      (adapter as any)._db = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            put: putMock,
          }),
        }),
      };

      // 调用方法
      const fileId = 'test-file';
      const chunkIndex = 0;
      const chunkData = new Blob(['test data']);
      await adapter.saveChunk(fileId, chunkIndex, chunkData);

      // 验证结果
      expect(putMock).toHaveBeenCalled();
      expect((adapter as any)._updateStorageStats).toHaveBeenCalled();
    });

    it('应成功获取文件块', async () => {
      // 准备模拟
      const blobData = new Blob(['test data']);
      const getMock = jest.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockRequest.onsuccess) {
            mockRequest.result = { data: blobData };
            mockRequest.onsuccess({});
          }
        }, 0);
        return mockRequest;
      });

      (adapter as any)._db = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: getMock,
          }),
        }),
      };

      // 调用方法
      const fileId = 'test-file';
      const chunkIndex = 0;
      const result = await adapter.getChunk(fileId, chunkIndex);

      // 验证结果
      expect(getMock).toHaveBeenCalledWith([fileId, chunkIndex]);
      expect(result).toBe(blobData);
    });
  });

  describe('文件元数据操作', () => {
    beforeEach(() => {
      // 模拟_ensureDbReady方法
      jest.spyOn(adapter as any, '_ensureDbReady').mockResolvedValue();
    });

    it('应成功保存文件元数据', async () => {
      // 准备模拟
      const putMock = jest.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockRequest.onsuccess) {
            mockRequest.onsuccess({});
          }
        }, 0);
        return mockRequest;
      });

      (adapter as any)._db = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            put: putMock,
          }),
        }),
      };

      // 调用方法
      const fileId = 'test-file';
      const metadata: FileMetadata = {
        fileId,
        fileName: 'test.txt',
        fileSize: 1024,
        fileType: 'text/plain',
        chunkSize: 512,
        totalChunks: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await adapter.saveFileMetadata(fileId, metadata);

      // 验证结果
      expect(putMock).toHaveBeenCalled();
    });

    it('应成功获取文件元数据', async () => {
      // 准备模拟
      const metadata: FileMetadata = {
        fileId: 'test-file',
        fileName: 'test.txt',
        fileSize: 1024,
        fileType: 'text/plain',
        chunkSize: 512,
        totalChunks: 2,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const getMock = jest.fn().mockImplementation(() => {
        setTimeout(() => {
          if (mockRequest.onsuccess) {
            mockRequest.result = metadata;
            mockRequest.onsuccess({});
          }
        }, 0);
        return mockRequest;
      });

      (adapter as any)._db = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: getMock,
          }),
        }),
      };

      // 调用方法
      const fileId = 'test-file';
      const result = await adapter.getFileMetadata(fileId);

      // 验证结果
      expect(getMock).toHaveBeenCalledWith(fileId);
      expect(result).toBe(metadata);
    });
  });

  describe('清理和关闭', () => {
    it('应正确关闭数据库连接', async () => {
      // 准备模拟
      const dbMock = { close: jest.fn() };
      (adapter as any)._db = dbMock;
      (adapter as any)._cleanupTimerId = 123;

      // 模拟clearInterval
      const originalClearInterval = global.clearInterval;
      global.clearInterval = jest.fn();

      // 调用方法
      await adapter.close();

      // 验证结果
      expect(dbMock.close).toHaveBeenCalled();
      expect(global.clearInterval).toHaveBeenCalledWith(123);
      expect((adapter as any)._db).toBeNull();
      expect((adapter as any)._cleanupTimerId).toBeNull();

      // 恢复原始方法
      global.clearInterval = originalClearInterval;
    });
  });
});
