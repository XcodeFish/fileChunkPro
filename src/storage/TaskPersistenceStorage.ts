/**
 * TaskPersistenceStorage - 任务持久化存储服务
 *
 * 功能：
 * 1. 使用IndexedDB存储断网期间的上传任务
 * 2. 网络恢复后自动恢复任务
 * 3. 提供任务优先级管理
 * 4. 提供持久化配置选项
 */

import { Logger } from '../utils/Logger';

interface PersistentTask {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
  file?: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  chunks?: Array<{
    index: number;
    start: number;
    end: number;
    uploaded: boolean;
  }>;
  priority: number;
  createdAt: number;
  retryCount: number;
  status: 'pending' | 'uploading' | 'paused' | 'failed';
  errorDetails?: {
    code: string;
    message: string;
    timestamp: number;
  };
  metadata?: Record<string, any>;
}

export interface TaskPersistenceConfig {
  enabled: boolean;
  maxStoredTasks: number;
  storageQuota: number; // 单位：MB
  persistChunks: boolean;
  autoResumeOnConnect: boolean;
  cleanupAfterDays: number;
}

export class TaskPersistenceStorage {
  private logger: Logger;
  private dbName = 'fileChunkProTasks';
  private dbVersion = 1;
  private taskStoreName = 'uploadTasks';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<boolean> | null = null;
  private config: TaskPersistenceConfig;

  constructor(config?: Partial<TaskPersistenceConfig>) {
    this.logger = new Logger('TaskPersistenceStorage');

    // 默认配置
    this.config = {
      enabled: true,
      maxStoredTasks: 100,
      storageQuota: 50, // 50MB
      persistChunks: true,
      autoResumeOnConnect: true,
      cleanupAfterDays: 7,
      ...config,
    };

    // 初始化数据库
    this.initPromise = this.initDatabase();

    // 监听网络状态变化
    if (this.config.autoResumeOnConnect) {
      this.setupNetworkListener();
    }
  }

  /**
   * 初始化IndexedDB数据库
   */
  private async initDatabase(): Promise<boolean> {
    if (!this.isIndexedDBAvailable()) {
      this.logger.warn('IndexedDB不可用，任务持久化功能将被禁用');
      return false;
    }

    try {
      return new Promise<boolean>(resolve => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = event => {
          this.logger.error(
            '打开IndexedDB失败',
            (event.target as IDBRequest).error
          );
          resolve(false);
        };

        request.onupgradeneeded = event => {
          const db = (event.target as IDBOpenDBRequest).result;

          // 创建任务存储表
          if (!db.objectStoreNames.contains(this.taskStoreName)) {
            const store = db.createObjectStore(this.taskStoreName, {
              keyPath: 'id',
            });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('priority', 'priority', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };

        request.onsuccess = event => {
          this.db = (event.target as IDBOpenDBRequest).result;
          this.logger.debug('IndexedDB连接成功');

          // 设置数据库关闭处理
          this.db.onclose = () => {
            this.logger.debug('IndexedDB连接关闭');
            this.db = null;
          };

          // 清理过期任务
          this.cleanupExpiredTasks();

          resolve(true);
        };
      });
    } catch (error) {
      this.logger.error('初始化任务持久化存储失败', error);
      return false;
    }
  }

  /**
   * 检查IndexedDB是否可用
   */
  private isIndexedDBAvailable(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDatabase(): Promise<boolean> {
    if (this.db) return true;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initDatabase();
    return this.initPromise;
  }

  /**
   * 保存上传任务
   * @param task 要保存的任务
   * @returns 是否保存成功
   */
  public async saveTask(task: PersistentTask): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      const dbReady = await this.ensureDatabase();
      if (!dbReady || !this.db) return false;

      // 检查存储配额
      if (await this.checkStorageQuota(task)) {
        // 存储任务
        return new Promise<boolean>(resolve => {
          const transaction = this.db!.transaction(
            [this.taskStoreName],
            'readwrite'
          );
          const store = transaction.objectStore(this.taskStoreName);

          const request = store.put(task);

          request.onsuccess = () => {
            this.logger.debug('任务已保存到持久化存储', { taskId: task.id });
            resolve(true);
          };

          request.onerror = event => {
            this.logger.error(
              '保存任务失败',
              (event.target as IDBRequest).error
            );
            resolve(false);
          };
        });
      }

      return false;
    } catch (error) {
      this.logger.error('保存任务失败', error);
      return false;
    }
  }

  /**
   * 检查存储配额并管理存储空间
   */
  private async checkStorageQuota(): Promise<boolean> {
    try {
      // 1. 检查任务数量限制
      const taskCount = await this.getTaskCount();
      if (taskCount >= this.config.maxStoredTasks) {
        // 删除最旧或最低优先级的任务
        await this.removeOldestOrLowestPriorityTask();
      }

      // 2. 检查存储空间使用情况
      // 这里可以使用Storage API或其他方法估算存储使用量
      // 简化实现，实际应使用更精确的方法

      return true;
    } catch (error) {
      this.logger.error('检查存储配额失败', error);
      return false;
    }
  }

  /**
   * 获取已保存的任务数量
   */
  private async getTaskCount(): Promise<number> {
    if (!this.db) return 0;

    return new Promise<number>(resolve => {
      const transaction = this.db!.transaction(
        [this.taskStoreName],
        'readonly'
      );
      const store = transaction.objectStore(this.taskStoreName);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(0);
      };
    });
  }

  /**
   * 删除最旧或最低优先级的任务
   */
  private async removeOldestOrLowestPriorityTask(): Promise<boolean> {
    if (!this.db) return false;

    return new Promise<boolean>(resolve => {
      const transaction = this.db!.transaction(
        [this.taskStoreName],
        'readwrite'
      );
      const store = transaction.objectStore(this.taskStoreName);

      // 使用索引获取按创建时间排序的任务
      const index = store.index('createdAt');
      const request = index.openCursor();

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          // 删除找到的第一个（最旧的）任务
          store.delete(cursor.primaryKey);
          this.logger.debug('已删除一个旧任务以释放存储空间');
          resolve(true);
        } else {
          resolve(false);
        }
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }

  /**
   * 获取任务
   * @param taskId 任务ID
   * @returns 任务对象
   */
  public async getTask(taskId: string): Promise<PersistentTask | null> {
    if (!this.config.enabled) return null;

    try {
      const dbReady = await this.ensureDatabase();
      if (!dbReady || !this.db) return null;

      return new Promise<PersistentTask | null>(resolve => {
        const transaction = this.db!.transaction(
          [this.taskStoreName],
          'readonly'
        );
        const store = transaction.objectStore(this.taskStoreName);
        const request = store.get(taskId);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          this.logger.error('获取任务失败', taskId);
          resolve(null);
        };
      });
    } catch (error) {
      this.logger.error('获取任务失败', error);
      return null;
    }
  }

  /**
   * 获取所有待处理任务
   * @returns 任务列表
   */
  public async getPendingTasks(): Promise<PersistentTask[]> {
    if (!this.config.enabled) return [];

    try {
      const dbReady = await this.ensureDatabase();
      if (!dbReady || !this.db) return [];

      return new Promise<PersistentTask[]>(resolve => {
        const transaction = this.db!.transaction(
          [this.taskStoreName],
          'readonly'
        );
        const store = transaction.objectStore(this.taskStoreName);
        const index = store.index('status');
        const request = index.getAll('pending');

        request.onsuccess = () => {
          // 按优先级排序
          const tasks = request.result || [];
          tasks.sort((a, b) => b.priority - a.priority);
          resolve(tasks);
        };

        request.onerror = () => {
          this.logger.error('获取待处理任务失败');
          resolve([]);
        };
      });
    } catch (error) {
      this.logger.error('获取待处理任务失败', error);
      return [];
    }
  }

  /**
   * 更新任务状态
   * @param taskId 任务ID
   * @param status 新状态
   * @returns 是否更新成功
   */
  public async updateTaskStatus(
    taskId: string,
    status: PersistentTask['status'],
    errorDetails?: PersistentTask['errorDetails']
  ): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      const dbReady = await this.ensureDatabase();
      if (!dbReady || !this.db) return false;

      const task = await this.getTask(taskId);
      if (!task) return false;

      task.status = status;
      if (errorDetails) {
        task.errorDetails = errorDetails;
      }

      return this.saveTask(task);
    } catch (error) {
      this.logger.error('更新任务状态失败', error);
      return false;
    }
  }

  /**
   * 更新分片上传状态
   * @param taskId 任务ID
   * @param chunkIndex 分片索引
   * @param uploaded 是否已上传
   * @returns 是否更新成功
   */
  public async updateChunkStatus(
    taskId: string,
    chunkIndex: number,
    uploaded: boolean
  ): Promise<boolean> {
    if (!this.config.enabled || !this.config.persistChunks) return false;

    try {
      const dbReady = await this.ensureDatabase();
      if (!dbReady || !this.db) return false;

      const task = await this.getTask(taskId);
      if (!task || !task.chunks) return false;

      const chunk = task.chunks.find(c => c.index === chunkIndex);
      if (chunk) {
        chunk.uploaded = uploaded;
        return this.saveTask(task);
      }

      return false;
    } catch (error) {
      this.logger.error('更新分片状态失败', error);
      return false;
    }
  }

  /**
   * 删除任务
   * @param taskId 任务ID
   * @returns 是否删除成功
   */
  public async deleteTask(taskId: string): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      const dbReady = await this.ensureDatabase();
      if (!dbReady || !this.db) return false;

      return new Promise<boolean>(resolve => {
        const transaction = this.db!.transaction(
          [this.taskStoreName],
          'readwrite'
        );
        const store = transaction.objectStore(this.taskStoreName);
        const request = store.delete(taskId);

        request.onsuccess = () => {
          this.logger.debug('任务已从持久化存储中删除', { taskId });
          resolve(true);
        };

        request.onerror = () => {
          this.logger.error('删除任务失败', taskId);
          resolve(false);
        };
      });
    } catch (error) {
      this.logger.error('删除任务失败', error);
      return false;
    }
  }

  /**
   * 清理过期任务
   */
  private async cleanupExpiredTasks(): Promise<void> {
    if (!this.config.enabled || !this.db) return;

    try {
      const expiryTime =
        Date.now() - this.config.cleanupAfterDays * 24 * 60 * 60 * 1000;

      const transaction = this.db.transaction(
        [this.taskStoreName],
        'readwrite'
      );
      const store = transaction.objectStore(this.taskStoreName);
      const index = store.index('createdAt');
      const range = IDBKeyRange.upperBound(expiryTime);

      const request = index.openCursor(range);
      let deletedCount = 0;

      request.onsuccess = event => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          deletedCount++;
          cursor.continue();
        } else if (deletedCount > 0) {
          this.logger.debug(`已清理 ${deletedCount} 个过期任务`);
        }
      };
    } catch (error) {
      this.logger.error('清理过期任务失败', error);
    }
  }

  /**
   * 设置网络监听器
   * 在网络恢复时自动恢复上传任务
   */
  private setupNetworkListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.logger.debug('网络已恢复，开始恢复上传任务');
        this.emitRecoverTasks();
      });
    }
  }

  /**
   * 发送恢复任务事件
   * 实际项目中应与事件总线集成
   */
  private async emitRecoverTasks(): Promise<void> {
    try {
      const pendingTasks = await this.getPendingTasks();
      if (pendingTasks.length > 0) {
        this.logger.info(`找到 ${pendingTasks.length} 个待恢复的上传任务`);

        // 在实际项目中，这里应该触发事件总线中的恢复任务事件
        // eventBus.emit('taskPersistence:recoveryNeeded', pendingTasks);

        // 示例：在控制台输出待恢复的任务
        pendingTasks.forEach(task => {
          this.logger.debug('待恢复任务:', {
            id: task.id,
            url: task.url,
            priority: task.priority,
          });
        });
      }
    } catch (error) {
      this.logger.error('恢复任务失败', error);
    }
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.debug('持久化存储数据库已关闭');
    }
  }
}

export default TaskPersistenceStorage;
