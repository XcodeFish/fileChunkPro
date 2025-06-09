import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { MemoryManager } from '../../../src/utils/MemoryManager';

describe('MemoryManager', () => {
  // 模拟performance.memory API
  const originalWindow = global.window;

  beforeEach(() => {
    // 模拟window和performance对象
    global.window = {
      performance: {
        memory: {
          jsHeapSizeLimit: 2 * 1024 * 1024 * 1024, // 2GB堆大小限制
          usedJSHeapSize: 512 * 1024 * 1024, // 512MB已使用堆
          totalJSHeapSize: 1 * 1024 * 1024 * 1024, // 1GB总堆大小
        },
      },
      dispatchEvent: vi.fn(),
    } as any;

    // 重置MemoryManager的内部状态
    // 停止之前可能运行的监控
    MemoryManager.stopMonitoring();

    // 模拟部分方法
    vi.spyOn(MemoryManager, 'getMemoryGrowthRate').mockImplementation(() => 0);
  });

  afterEach(() => {
    // 恢复全局对象
    global.window = originalWindow;

    // 停止监控
    MemoryManager.stopMonitoring();

    // 清理模拟
    vi.restoreAllMocks();
  });

  it('should detect low memory condition', () => {
    // 模拟高内存使用率
    (window.performance.memory as any).usedJSHeapSize =
      1.5 * 1024 * 1024 * 1024; // 1.5GB

    expect(MemoryManager.isLowMemory()).toBe(true);

    // 模拟低内存使用率
    (window.performance.memory as any).usedJSHeapSize =
      0.2 * 1024 * 1024 * 1024; // 200MB

    expect(MemoryManager.isLowMemory()).toBe(false);
  });

  it('should detect critical memory condition', () => {
    // 模拟危急内存使用率 (>85%)
    (window.performance.memory as any).usedJSHeapSize =
      1.8 * 1024 * 1024 * 1024; // 1.8GB

    expect(MemoryManager.isCriticalMemory()).toBe(true);

    // 模拟正常内存使用率
    (window.performance.memory as any).usedJSHeapSize =
      1.0 * 1024 * 1024 * 1024; // 1.0GB

    expect(MemoryManager.isCriticalMemory()).toBe(false);
  });

  it('should calculate adaptive chunk size based on file size', () => {
    // 小文件测试
    const smallFileSize = 5 * 1024 * 1024; // 5MB
    const smallFileChunkSize = MemoryManager.getOptimalChunkSize(smallFileSize);
    expect(smallFileChunkSize).toBeGreaterThanOrEqual(1 * 1024 * 1024); // 至少1MB
    expect(smallFileChunkSize).toBeLessThanOrEqual(5 * 1024 * 1024); // 不超过5MB

    // 中等文件测试
    const mediumFileSize = 50 * 1024 * 1024; // 50MB
    const mediumFileChunkSize =
      MemoryManager.getOptimalChunkSize(mediumFileSize);
    expect(mediumFileChunkSize).toBeGreaterThanOrEqual(1 * 1024 * 1024); // 至少1MB

    // 大文件测试
    const largeFileSize = 500 * 1024 * 1024; // 500MB
    const largeFileChunkSize = MemoryManager.getOptimalChunkSize(largeFileSize);
    expect(largeFileChunkSize).toBeGreaterThanOrEqual(1 * 1024 * 1024); // 至少1MB
  });

  it('should respect user-defined chunk size', () => {
    const fileSize = 100 * 1024 * 1024; // 100MB
    const userDefinedSize = 3 * 1024 * 1024; // 3MB

    const chunkSize = MemoryManager.getOptimalChunkSize(
      fileSize,
      userDefinedSize
    );
    expect(chunkSize).toBe(userDefinedSize);
  });

  it('should handle "auto" chunk size parameter', () => {
    const fileSize = 100 * 1024 * 1024; // 100MB

    const chunkSize = MemoryManager.getOptimalChunkSize(fileSize, 'auto');
    expect(chunkSize).toBeGreaterThanOrEqual(1 * 1024 * 1024); // 至少1MB
  });

  it('should get memory statistics', () => {
    const stats = MemoryManager.getMemoryStats();

    expect(stats).toHaveProperty('used');
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('limit');
    expect(stats).toHaveProperty('usageRatio');
    expect(stats).toHaveProperty('growthRate');
    expect(stats).toHaveProperty('trend');

    expect(stats.used).toBe(512 * 1024 * 1024); // 512MB
    expect(stats.limit).toBe(2 * 1024 * 1024 * 1024); // 2GB
    expect(stats.usageRatio).toBe(0.25); // 25%
  });

  it('should calculate memory growth rate when samples are available', () => {
    // 重置之前的模拟
    vi.restoreAllMocks();

    // 直接设置内存使用数据而不是模拟内部属性
    const memoryUsage = [
      100 * 1024 * 1024, // 初始100MB
      150 * 1024 * 1024, // 增长到150MB
      200 * 1024 * 1024, // 增长到200MB
    ];

    const memoryTimestamps = [
      1000, // 初始时间
      2000, // 1秒后
      3000, // 再过1秒
    ];

    // 使用setter方法设置内部数据
    MemoryManager.memoryUsage = memoryUsage;
    MemoryManager.memoryTimestamps = memoryTimestamps;

    // 内存增长率应该是 (200MB - 100MB) / 2秒 = 50MB/秒
    const growthRate = MemoryManager.getMemoryGrowthRate();
    const expected = 50 * 1024 * 1024;

    // 使用近似比较，允许一定误差
    expect(Math.abs(growthRate - expected) / expected).toBeLessThan(0.1); // 误差小于10%
  });

  it('should recommend chunk count based on file size', () => {
    const fileSize = 100 * 1024 * 1024; // 100MB
    const maxConcurrent = 4;

    const chunkCount = MemoryManager.getRecommendedChunkCount(
      fileSize,
      maxConcurrent
    );
    expect(chunkCount).toBeGreaterThanOrEqual(maxConcurrent);

    // 非常小的文件测试
    const tinyFileSize = 2 * 1024 * 1024; // 2MB
    const tinyFileChunkCount = MemoryManager.getRecommendedChunkCount(
      tinyFileSize,
      maxConcurrent
    );
    expect(tinyFileChunkCount).toBeGreaterThanOrEqual(2);
  });

  it('should recommend concurrency based on memory usage', () => {
    // 模拟正常内存使用率(50%)
    vi.spyOn(MemoryManager, 'getMemoryStats').mockImplementation(() => ({
      used: 1024 * 1024 * 1024, // 1GB used
      total: 2 * 1024 * 1024 * 1024, // 2GB total
      limit: 2 * 1024 * 1024 * 1024, // 2GB limit
      usageRatio: 0.5, // 50%
      growthRate: 0,
      trend: 'stable' as const,
    }));

    const defaultConcurrent = 4;
    let recommended =
      MemoryManager.getRecommendedConcurrency(defaultConcurrent);
    expect(recommended).toBe(defaultConcurrent);

    // 模拟高内存使用率(75%)
    vi.spyOn(MemoryManager, 'getMemoryStats').mockImplementation(() => ({
      used: 1.5 * 1024 * 1024 * 1024, // 1.5GB used
      total: 2 * 1024 * 1024 * 1024, // 2GB total
      limit: 2 * 1024 * 1024 * 1024, // 2GB limit
      usageRatio: 0.75, // 75%
      growthRate: 0,
      trend: 'stable' as const,
    }));

    recommended = MemoryManager.getRecommendedConcurrency(defaultConcurrent);
    expect(recommended).toBe(2); // 按照实际实现，大于70%时减半

    // 模拟低内存使用率(20%)
    vi.spyOn(MemoryManager, 'getMemoryStats').mockImplementation(() => ({
      used: 0.4 * 1024 * 1024 * 1024, // 0.4GB used
      total: 2 * 1024 * 1024 * 1024, // 2GB total
      limit: 2 * 1024 * 1024 * 1024, // 2GB limit
      usageRatio: 0.2, // 20%
      growthRate: 0,
      trend: 'stable' as const,
    }));

    recommended = MemoryManager.getRecommendedConcurrency(defaultConcurrent);
    expect(recommended).toBe(6); // 150% of 4, rounded down
  });

  it('should detect when memory cleanup is needed', () => {
    // 高内存使用率
    (window.performance.memory as any).usedJSHeapSize =
      1.7 * 1024 * 1024 * 1024; // 85%

    expect(MemoryManager.needsMemoryCleanup()).toBe(true);

    // 低内存使用率
    (window.performance.memory as any).usedJSHeapSize =
      0.4 * 1024 * 1024 * 1024; // 20%

    // 但内存增长迅速
    vi.spyOn(MemoryManager, 'getMemoryGrowthRate').mockImplementation(
      () => 10 * 1024 * 1024
    ); // 10MB/s

    expect(MemoryManager.needsMemoryCleanup()).toBe(true);

    // 重置内存增长率
    vi.spyOn(MemoryManager, 'getMemoryGrowthRate').mockImplementation(
      () => 10 * 1024
    ); // 10KB/s

    expect(MemoryManager.needsMemoryCleanup()).toBe(false);
  });

  it('should safely calculate memory growth rate without samples', () => {
    // 确保没有样本
    MemoryManager._clearMemoryData();

    const growthRate = MemoryManager.getMemoryGrowthRate();
    expect(growthRate).toBe(0);
  });

  it('should safely handle garbage collection', () => {
    // 确保函数不会抛出错误
    expect(() => {
      MemoryManager.suggestGarbageCollection();
    }).not.toThrow();

    // 验证事件派发
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it('should safely handle non-browser environments', () => {
    // 移除window.performance.memory对象
    global.window = {
      dispatchEvent: vi.fn(),
    } as any;

    // 不应抛出错误
    expect(() => {
      MemoryManager.startMonitoring();
      MemoryManager.getMemoryStats();
      MemoryManager.isLowMemory();
      MemoryManager.getOptimalChunkSize(1024 * 1024);
      MemoryManager.suggestGarbageCollection();
    }).not.toThrow();
  });

  // 测试启动监控
  it('should start memory monitoring', () => {
    // 启动监控
    MemoryManager.startMonitoring();

    // 验证监控已启动（通过间接方法）
    expect(() => MemoryManager.stopMonitoring()).not.toThrow();
  });

  // 测试内存监控
  it('should monitor memory correctly', () => {
    // 启动监控
    MemoryManager.startMonitoring();

    // 验证监控已启动
    expect(() => MemoryManager.stopMonitoring()).not.toThrow();

    // 停止监控
    MemoryManager.stopMonitoring();
  });
});
