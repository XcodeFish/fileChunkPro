/**
 * IndexedDB存储适配器使用示例
 * 演示如何使用IndexedDB存储适配器进行大文件分块存储
 */
import { IndexedDBAdapter } from '../adapters';
import { FileMetadata } from '../types';

/**
 * 测试IndexedDB存储适配器
 */
async function testIndexedDBAdapter(): Promise<void> {
  console.log('开始测试IndexedDB存储适配器...');

  // 创建适配器实例
  const storageAdapter = new IndexedDBAdapter({
    dbName: 'fileChunkPro-storage',
    dbVersion: 1,
    storageQuota: 100 * 1024 * 1024, // 100MB配额
    cleanupInterval: 24 * 60 * 60 * 1000, // 每天清理一次
  });

  try {
    // 初始化存储
    await storageAdapter.init();
    console.log('存储初始化完成');

    // 模拟文件上传过程
    const fileId = `file_${Date.now()}`;
    const fileSize = 10 * 1024 * 1024; // 10MB文件
    const chunkSize = 1024 * 1024; // 1MB分块
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // 保存文件元数据
    const metadata: FileMetadata = {
      fileId,
      fileName: 'example.txt',
      fileSize,
      fileType: 'text/plain',
      chunkSize,
      totalChunks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storageAdapter.saveFileMetadata(fileId, metadata);
    console.log('文件元数据已保存');

    // 模拟保存文件块
    for (let i = 0; i < 3; i++) {
      const chunkData = new Blob([`Chunk ${i} data`.repeat(1000)]);
      await storageAdapter.saveChunk(fileId, i, chunkData);
      console.log(`文件块 ${i} 已保存`);
    }

    // 获取已保存的块列表
    const chunkList = await storageAdapter.getChunkList(fileId);
    console.log('已保存的块列表:', chunkList);

    // 检查块是否存在
    const hasChunk = await storageAdapter.hasChunk(fileId, 1);
    console.log('块1是否存在:', hasChunk);

    // 获取文件元数据
    const savedMetadata = await storageAdapter.getFileMetadata(fileId);
    console.log('获取的文件元数据:', savedMetadata);

    // 读取块数据
    const chunkData = await storageAdapter.getChunk(fileId, 0);
    if (chunkData) {
      const text = await chunkData.text();
      console.log(`块0数据片段: ${text.substring(0, 50)}...`);
    }

    // 清理一个块
    await storageAdapter.deleteChunk(fileId, 2);
    const updatedChunkList = await storageAdapter.getChunkList(fileId);
    console.log('删除块2后的块列表:', updatedChunkList);

    // 模拟清理过期数据
    await storageAdapter.cleanup(0); // 立即清理所有过期数据

    // 关闭连接
    await storageAdapter.close();
    console.log('存储连接已关闭');
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

// 在浏览器环境中运行示例
if (typeof window !== 'undefined') {
  // 添加UI元素
  const button = document.createElement('button');
  button.textContent = '运行IndexedDB存储测试';
  button.onclick = () => {
    testIndexedDBAdapter().catch(console.error);
  };
  document.body.appendChild(button);

  // 添加结果元素
  const results = document.createElement('pre');
  results.id = 'results';
  document.body.appendChild(results);

  // 重定向控制台输出到结果元素
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  console.log = (...args) => {
    originalConsoleLog(...args);
    results.textContent += args.join(' ') + '\n';
  };

  console.error = (...args) => {
    originalConsoleError(...args);
    results.textContent += '错误: ' + args.join(' ') + '\n';
  };
}

export { testIndexedDBAdapter };
