/**
 * MemoryManager 功能演示示例
 * 展示如何使用智能内存管理功能优化文件上传
 */

// 导入需要的模块
import { UploaderCore } from '../src/core';
import { ChunkPlugin } from '../src/plugins';
import { MemoryManager } from '../src/utils';

// 初始化MemoryManager
MemoryManager.initialize();

// 创建上传器实例
const uploader = new UploaderCore({
  endpoint: 'https://example.com/upload',
  chunkSize: 'auto', // 使用自动分片大小
  enableMemoryMonitoring: true, // 启用内存监控
  enableAdaptiveUploads: true, // 启用自适应上传
});

// 添加分片插件，启用内存监控
uploader.use(
  new ChunkPlugin({
    enableMemoryMonitoring: true,
  })
);

// 监听内存警告事件
window.addEventListener('memoryWarning', event => {
  console.log('内存警告:', event.detail);

  // 根据内存警告采取措施
  const { level, recommendations } = event.detail;

  if (level === 'critical') {
    // 暂停上传
    console.log('内存紧张，暂停上传');
    uploader.pause();

    // 根据建议调整上传参数
    if (recommendations) {
      console.log('采用建议设置:', recommendations);

      // 应用建议的分片大小
      if (recommendations.chunkSize) {
        uploader.setOption('chunkSize', recommendations.chunkSize);
      }

      // 应用建议的并发数
      if (recommendations.concurrency) {
        uploader.setOption('concurrency', recommendations.concurrency);
      }
    }

    // 延迟后恢复
    setTimeout(() => {
      console.log('恢复上传');
      uploader.resume();
    }, 5000);
  }
});

// 演示不同文件大小的处理策略
function demonstrateChunkStrategies() {
  const fileSizes = [
    5 * 1024 * 1024, // 5MB
    50 * 1024 * 1024, // 50MB
    500 * 1024 * 1024, // 500MB
    2 * 1024 * 1024 * 1024, // 2GB
  ];

  fileSizes.forEach(size => {
    // 获取适合该文件大小的处理策略
    const strategy = MemoryManager.getChunkProcessingStrategy(size);

    console.log(`文件大小: ${formatSize(size)}`);
    console.log('推荐策略:', {
      chunkSize: formatSize(strategy.chunkSize),
      concurrency: strategy.concurrency,
      processingMode: strategy.processingMode,
      useStreaming: strategy.useStreaming,
      preloadChunks: strategy.preloadChunks,
    });

    // 对于大文件，展示更多优化策略
    if (size > 100 * 1024 * 1024) {
      const largeFileStrategy = MemoryManager.getLargeFileStrategy(size);
      console.log('大文件优化策略:', {
        partSize: formatSize(largeFileStrategy.partSize),
        maxPartsInMemory: largeFileStrategy.maxPartsInMemory,
        processingMode: largeFileStrategy.processingMode,
        shouldUseStreaming: largeFileStrategy.shouldUseStreaming,
        shouldOffloadCalculation: largeFileStrategy.shouldOffloadCalculation,
      });

      // 显示分片计划
      const chunkPlan = MemoryManager.getMemoryEfficientChunkPlan(size);
      console.log('分片计划:', {
        totalChunks: chunkPlan.totalChunks,
        estimatedMemoryUsage: formatSize(chunkPlan.estimatedMemoryUsage),
        processingOrderSample: chunkPlan.processingOrder.slice(0, 5), // 只显示前5个处理顺序
      });
    }

    console.log('-----------------------------------');
  });
}

// 模拟内存压力
function simulateMemoryPressure() {
  console.log('模拟内存压力...');

  // 获取当前内存状态
  const beforeStats = MemoryManager.getMemoryStats();
  console.log('内存使用前:', {
    usageRatio: (beforeStats.usageRatio * 100).toFixed(1) + '%',
    used: formatSize(beforeStats.used),
    available: formatSize(beforeStats.limit - beforeStats.used),
  });

  // 分配大量内存制造压力
  const memoryHogs = [];
  for (let i = 0; i < 20; i++) {
    memoryHogs.push(new Array(1000000).fill('x'));
    console.log(`分配内存块 ${i + 1}/20`);

    // 显示当前内存状态
    if (i % 5 === 0) {
      const currentStats = MemoryManager.getMemoryStats();
      console.log('当前内存使用:', {
        usageRatio: (currentStats.usageRatio * 100).toFixed(1) + '%',
        used: formatSize(currentStats.used),
      });
    }
  }

  // 获取内存压力下的状态
  const afterStats = MemoryManager.getMemoryStats();
  console.log('内存压力下:', {
    usageRatio: (afterStats.usageRatio * 100).toFixed(1) + '%',
    used: formatSize(afterStats.used),
    available: formatSize(afterStats.limit - afterStats.used),
  });

  // 获取压力下的建议
  const recommendations = MemoryManager.getRecommendedConcurrency();
  console.log('压力下推荐并发数:', recommendations);

  // 清理内存
  console.log('清理内存...');
  memoryHogs.length = 0;

  // 建议垃圾回收
  MemoryManager.suggestGarbageCollection();

  // 获取清理后状态
  setTimeout(() => {
    const cleanupStats = MemoryManager.getMemoryStats();
    console.log('清理后内存:', {
      usageRatio: (cleanupStats.usageRatio * 100).toFixed(1) + '%',
      used: formatSize(cleanupStats.used),
      available: formatSize(cleanupStats.limit - cleanupStats.used),
    });
  }, 1000);
}

// 格式化字节大小为人类可读格式
function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 执行演示
console.log('===== MemoryManager 功能演示 =====');
console.log('设备内存容量:', MemoryManager.getMemoryStats().capacity);
console.log('是否低内存设备:', MemoryManager.isLowMemoryDevice());
console.log('是否低性能设备:', MemoryManager.isLowPowerDevice());
console.log('');

// 展示不同文件大小的处理策略
console.log('===== 不同文件大小的处理策略 =====');
demonstrateChunkStrategies();

// 模拟内存压力
console.log('===== 模拟内存压力测试 =====');
simulateMemoryPressure();

// 停止内存监控
setTimeout(() => {
  MemoryManager.stopMonitoring();
  console.log('内存监控已停止');
}, 10000);
