/**
 * StateLock - 状态锁工具类
 * 用于确保关键状态更新的原子性，防止异步操作中的状态竞争
 */

/**
 * 状态锁类，提供异步操作的原子性保证
 * 通过虚拟锁和操作队列确保状态一致性
 */
export class StateLock {
  private locked = false;
  private pendingOperations: Array<() => void> = [];
  private lockId: string;
  private lockVersion = 0;

  /**
   * 创建状态锁实例
   * @param lockId 锁ID，用于标识和调试
   */
  constructor(lockId = 'default') {
    this.lockId = lockId;
  }

  /**
   * 在锁保护下执行异步操作
   * @param operation 需要执行的异步操作
   * @returns 操作结果
   */
  async withLock<T>(operation: () => Promise<T>): Promise<T> {
    if (this.locked) {
      return new Promise<T>((resolve, reject) => {
        this.pendingOperations.push(async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    this.locked = true;
    this.lockVersion++; // 增加版本号，帮助追踪状态变化

    try {
      return await operation();
    } finally {
      this.locked = false;

      // 处理队列中的下一个操作
      if (this.pendingOperations.length > 0) {
        const nextOperation = this.pendingOperations.shift();
        nextOperation && nextOperation();
      }
    }
  }

  /**
   * 在锁保护下执行同步操作
   * @param operation 需要执行的同步操作
   * @returns 操作结果
   */
  withLockSync<T>(operation: () => T): T {
    if (this.locked) {
      throw new Error(`状态锁(${this.lockId})已被占用，无法立即执行同步操作`);
    }

    this.locked = true;
    this.lockVersion++;

    try {
      return operation();
    } finally {
      this.locked = false;

      // 处理队列中的下一个操作
      if (this.pendingOperations.length > 0) {
        setTimeout(() => {
          if (!this.locked && this.pendingOperations.length > 0) {
            const nextOperation = this.pendingOperations.shift();
            nextOperation && nextOperation();
          }
        }, 0);
      }
    }
  }

  /**
   * 检查锁是否被占用
   * @returns 是否被锁定
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * 获取当前锁版本
   * 可用于检测状态是否已更改
   * @returns 当前版本号
   */
  getVersion(): number {
    return this.lockVersion;
  }

  /**
   * 获取等待操作的数量
   * @returns 等待中的操作数
   */
  getPendingCount(): number {
    return this.pendingOperations.length;
  }
}

/**
 * 创建状态锁管理器，在应用中全局使用
 */
export class StateLockManager {
  private static locks = new Map<string, StateLock>();

  /**
   * 获取指定ID的锁，如不存在则创建
   * @param lockId 锁ID
   * @returns StateLock实例
   */
  static getLock(lockId: string): StateLock {
    if (!this.locks.has(lockId)) {
      this.locks.set(lockId, new StateLock(lockId));
    }
    return this.locks.get(lockId)!;
  }

  /**
   * 释放指定ID的锁
   * @param lockId 锁ID
   * @returns 是否成功释放
   */
  static releaseLock(lockId: string): boolean {
    return this.locks.delete(lockId);
  }

  /**
   * 获取所有当前活动的锁
   * @returns 锁ID数组
   */
  static getActiveLocks(): string[] {
    return Array.from(this.locks.keys());
  }
}
