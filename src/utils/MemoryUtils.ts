/**
 * MemoryUtils - 内存管理工具集
 * 提供增强的内存管理功能，改进大对象的释放和处理
 */

import { Logger } from './Logger';

export interface MemoryStats {
  // 内存使用情况
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
  // 内存使用百分比
  usagePercentage?: number;
  // 是否处于内存压力状态
  isUnderMemoryPressure: boolean;
  // 设备类型分类
  deviceClass?: 'low' | 'medium' | 'high';
}

/**
 * 内存管理工具类
 * 提供内存相关的工具方法，包括手动垃圾回收触发、大对象释放等
 */
export class MemoryUtils {
  private static logger = new Logger('MemoryUtils');

  /**
   * 深度清理对象引用，帮助垃圾回收器回收对象
   * @param obj 要清理的对象
   * @param depth 最大递归深度，默认为1
   */
  static deepCleanup(obj: any, depth = 1): void {
    if (!obj || typeof obj !== 'object' || depth < 0) {
      return;
    }

    // 特殊处理不同类型的对象
    if (obj instanceof Blob || obj instanceof File) {
      // 对于File/Blob对象，使用revokeObjectURL释放
      if (obj._url) {
        URL.revokeObjectURL(obj._url);
        delete obj._url;
      }
    } else if (obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)) {
      // 对于ArrayBuffer，不需要特殊处理，直接让垃圾回收器处理即可
      return;
    } else {
      // 常规对象：清理所有属性
      const props = Object.keys(obj);

      props.forEach(prop => {
        const value = obj[prop];

        if (value && typeof value === 'object') {
          if (depth > 0) {
            // 递归处理对象类型属性
            this.deepCleanup(value, depth - 1);
          }
          obj[prop] = null;
        } else if (typeof value === 'function' && prop.startsWith('on')) {
          // 清理事件处理函数
          obj[prop] = null;
        }
      });
    }
  }

  /**
   * 安全释放Blob/File对象
   * @param blob Blob或File对象
   * @returns 是否成功释放
   */
  static releaseBlob(blob: Blob | File | null): boolean {
    if (!blob) return false;

    try {
      // 如果blob有关联的URL，释放它
      const objAny = blob as any;
      if (objAny._url) {
        URL.revokeObjectURL(objAny._url);
        delete objAny._url;
      }

      // 清空对象的内部引用（虽然在严格意义上这可能没有效果）
      this.deepCleanup(blob);

      return true;
    } catch (error) {
      this.logger.error('释放Blob对象失败', error);
      return false;
    }
  }

  /**
   * 释放文件块Blob对象数组
   * @param chunks 文件块对象数组
   * @returns 成功释放的块数量
   */
  static releaseFileChunks(
    chunks: Array<{ blob?: Blob | null; [key: string]: any } | null>
  ): number {
    if (!chunks || !Array.isArray(chunks)) return 0;

    let releasedCount = 0;

    chunks.forEach(chunk => {
      if (chunk && chunk.blob) {
        if (this.releaseBlob(chunk.blob)) {
          releasedCount++;
        }

        // 清除对象引用
        chunk.blob = null;
      }

      // 清理块对象的其他引用
      if (chunk) {
        this.deepCleanup(chunk);
      }
    });

    return releasedCount;
  }

  /**
   * 分块处理大对象，避免阻塞主线程
   * @param largeObject 要处理的大对象(如大型数组、大文件等)
   * @param processFn 处理函数，接收分块并返回处理结果
   * @param chunkSize 每个分块的大小
   * @returns 处理结果的Promise
   */
  static async processInChunks<T, R>(
    largeObject: T,
    processFn: (chunk: any, index: number) => Promise<R>,
    chunkSize = 1024 * 1024 // 默认1MB
  ): Promise<R[]> {
    // 根据对象类型确定处理方式
    if (largeObject instanceof Blob || largeObject instanceof File) {
      return this.processBlobInChunks(largeObject, processFn, chunkSize);
    } else if (Array.isArray(largeObject)) {
      return this.processArrayInChunks(largeObject, processFn, chunkSize);
    } else if (
      largeObject instanceof ArrayBuffer ||
      ArrayBuffer.isView(largeObject)
    ) {
      return this.processBufferInChunks(largeObject, processFn, chunkSize);
    } else {
      throw new Error('不支持的大对象类型，无法分块处理');
    }
  }

  /**
   * 分块处理Blob/File对象
   */
  private static async processBlobInChunks<R>(
    blob: Blob,
    processFn: (chunk: ArrayBuffer, index: number) => Promise<R>,
    chunkSize: number
  ): Promise<R[]> {
    const results: R[] = [];
    const totalSize = blob.size;
    let processedSize = 0;
    let chunkIndex = 0;

    while (processedSize < totalSize) {
      const end = Math.min(processedSize + chunkSize, totalSize);
      const chunk = blob.slice(processedSize, end);

      // 转换为ArrayBuffer以便处理
      const buffer = await chunk.arrayBuffer();

      // 处理分块
      const result = await processFn(buffer, chunkIndex);
      results.push(result);

      // 释放临时对象
      // buffer会被自动回收，这里不需要特殊处理

      // 更新进度
      processedSize = end;
      chunkIndex++;

      // 让出主线程，避免阻塞UI
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  /**
   * 分块处理数组
   */
  private static async processArrayInChunks<T, R>(
    array: T[],
    processFn: (chunk: T[], index: number) => Promise<R>,
    chunkSize: number
  ): Promise<R[]> {
    const results: R[] = [];
    const totalLength = array.length;
    let processed = 0;
    let chunkIndex = 0;

    while (processed < totalLength) {
      const end = Math.min(processed + chunkSize, totalLength);
      const chunk = array.slice(processed, end);

      // 处理分块
      const result = await processFn(chunk, chunkIndex);
      results.push(result);

      // 更新进度
      processed = end;
      chunkIndex++;

      // 让出主线程，避免阻塞UI
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  /**
   * 分块处理ArrayBuffer
   */
  private static async processBufferInChunks<R>(
    buffer: ArrayBuffer | ArrayBufferView,
    processFn: (chunk: ArrayBuffer, index: number) => Promise<R>,
    chunkSize: number
  ): Promise<R[]> {
    // 获取底层ArrayBuffer
    const arrayBuffer = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;

    const results: R[] = [];
    const totalSize = arrayBuffer.byteLength;
    let processed = 0;
    let chunkIndex = 0;

    while (processed < totalSize) {
      const end = Math.min(processed + chunkSize, totalSize);
      const chunk = arrayBuffer.slice(processed, end);

      // 处理分块
      const result = await processFn(chunk, chunkIndex);
      results.push(result);

      // 更新进度
      processed = end;
      chunkIndex++;

      // 让出主线程，避免阻塞UI
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  /**
   * 获取内存使用情况统计
   * @returns 内存统计信息
   */
  static getMemoryStats(): MemoryStats {
    const stats: MemoryStats = {
      isUnderMemoryPressure: false,
    };

    try {
      // 尝试获取性能内存信息(在支持的浏览器中)
      const performance = globalThis.performance as any;

      if (performance && performance.memory) {
        stats.jsHeapSizeLimit = performance.memory.jsHeapSizeLimit;
        stats.totalJSHeapSize = performance.memory.totalJSHeapSize;
        stats.usedJSHeapSize = performance.memory.usedJSHeapSize;

        // 计算使用百分比
        if (stats.totalJSHeapSize && stats.usedJSHeapSize) {
          stats.usagePercentage = stats.usedJSHeapSize / stats.totalJSHeapSize;

          // 判断是否处于内存压力状态
          stats.isUnderMemoryPressure = stats.usagePercentage > 0.85; // 85%为警戒线
        }
      }

      // 尝试获取设备内存(在支持的浏览器中)
      const navigator = globalThis.navigator as any;
      if (navigator && navigator.deviceMemory) {
        // 根据设备内存对设备分类
        const deviceMemoryGB = navigator.deviceMemory;

        if (deviceMemoryGB <= 2) {
          stats.deviceClass = 'low';
        } else if (deviceMemoryGB <= 4) {
          stats.deviceClass = 'medium';
        } else {
          stats.deviceClass = 'high';
        }
      }
    } catch (error) {
      this.logger.error('获取内存统计信息失败', error);
    }

    return stats;
  }

  /**
   * 优化的内存清理方法
   * 尝试通过创建临时对象然后释放来帮助触发垃圾回收
   * 比直接触发垃圾回收更加跨平台和安全
   */
  static suggestGarbageCollection(): void {
    try {
      if (typeof global !== 'undefined' && typeof global.gc === 'function') {
        // Node.js 环境下可以直接调用 gc
        this.logger.debug('触发垃圾回收');
        global.gc();
        return;
      }

      // 浏览器环境：创建临时大对象并释放，辅助GC
      // 使用闭包隔离，减少对现有变量的影响
      (() => {
        // 创建两个大数组并立即置空，避免linter警告未使用的变量
        const createAndDestroy = () => {
          const arr = new Array(10000).fill(0).map((_, i) => ({
            index: i,
            data: new Array(1000).fill('x'),
          }));
          return arr;
        };

        // 创建大对象并立即调度清理
        createAndDestroy();
        createAndDestroy();

        // 在下一轮事件循环中尝试再次触发垃圾回收
        setTimeout(() => {
          const temp = createAndDestroy();
          // 立即设为null以帮助垃圾回收
          temp.length = 0;
        }, 0);
      })();

      // 在请求动画帧中再次尝试帮助GC
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          // 创建并立即释放另一个临时对象
          const temp = new Array(10000).fill(0);
          temp.length = 0;
        });
      }
    } catch (error) {
      this.logger.warn('辅助垃圾回收操作失败', error);
    }
  }
}
