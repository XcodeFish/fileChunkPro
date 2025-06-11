/**
 * adapterExample.ts
 *
 * 展示如何使用重构后的适配器系统
 */

import { Logger } from '../utils/Logger';
import { AdapterFactory } from '../adapters/AdapterFactory';
import { EnvironmentType } from '../adapters/interfaces';
import { IUnifiedAdapter } from '../adapters/OptimizedAdapterInterfaces';

/**
 * 适配器使用示例类
 */
class AdapterExample {
  private logger: Logger;
  private adapterFactory: AdapterFactory;

  constructor() {
    this.logger = new Logger('AdapterExample');
    this.adapterFactory = AdapterFactory.getInstance();
  }

  /**
   * 获取最佳适配器
   */
  public async getBestAdapter(): Promise<IUnifiedAdapter | null> {
    try {
      this.logger.debug('获取最佳适配器');

      // 创建适合当前环境的最佳适配器
      const adapter = await this.adapterFactory.createBestAdapter({
        timeout: 30000,
        maxRetries: 3,
        withCredentials: true,
        debug: true,
      });

      this.logger.debug(`已创建${adapter.getName()}适配器`);

      // 输出适配器信息
      this.logger.debug('适配器信息', {
        name: adapter.getName(),
        priority: adapter.getPriority(),
        environmentType: adapter.getEnvironmentType(),
        environment: adapter.getEnvironment(),
        supportedEnvironments: adapter.getSupportedEnvironments(),
        supportedEnvironmentTypes: adapter.getSupportedEnvironmentTypes(),
        requiredFeatures: adapter.getRequiredFeatures(),
      });

      // 输出推荐配置
      this.logger.debug('推荐配置', adapter.getRecommendedConfig());

      return adapter;
    } catch (error) {
      this.logger.error('获取最佳适配器失败', error);
      return null;
    }
  }

  /**
   * 使用构建器模式创建适配器
   */
  public createAdapterWithBuilder(): IUnifiedAdapter | null {
    try {
      this.logger.debug('使用构建器创建适配器');

      // 获取浏览器环境适配器构建器
      const builder = this.adapterFactory.getBuilder(EnvironmentType.BROWSER);

      // 配置适配器
      const adapter = builder
        .withTimeout(30000)
        .withMaxRetries(3)
        .withCredentials(true)
        .withProgressCallback(progress => {
          this.logger.debug(`上传进度: ${progress}%`);
        })
        .build();

      this.logger.debug(`已创建${adapter.getName()}适配器`);
      return adapter;
    } catch (error) {
      this.logger.error('使用构建器创建适配器失败', error);
      return null;
    }
  }

  /**
   * 上传文件示例
   */
  public async uploadFile(
    adapter: IUnifiedAdapter,
    file: any,
    url: string
  ): Promise<void> {
    try {
      this.logger.debug('开始上传文件');

      // 获取文件信息
      const fileInfo = await adapter.getFileInfo(file);
      this.logger.debug('文件信息', fileInfo);

      // 计算最佳分片大小
      const chunkSize = 1024 * 1024; // 1MB
      const totalChunks = Math.ceil(fileInfo.size / chunkSize);

      this.logger.debug(`文件将分为${totalChunks}个分片上传`);

      // 上传所有分片
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileInfo.size);
        const size = end - start;

        // 读取分片数据
        const chunk = await adapter.readChunk(file, start, size);

        // 上传分片
        await adapter.uploadChunk(
          url,
          chunk,
          {
            'Content-Type': 'application/octet-stream',
          },
          {
            chunkIndex: i,
            totalChunks,
            fileName: fileInfo.name,
          }
        );

        this.logger.debug(`已上传分片 ${i + 1}/${totalChunks}`);
      }

      this.logger.debug('文件上传完成');
    } catch (error) {
      this.logger.error('文件上传失败', error);
    }
  }

  /**
   * 执行HTTP请求示例
   */
  public async executeRequest(
    adapter: IUnifiedAdapter,
    url: string
  ): Promise<void> {
    try {
      this.logger.debug(`发送请求到 ${url}`);

      const response = await adapter.request(url, {
        method: 'GET',
        timeout: 10000,
        responseType: 'json',
      });

      if (response.ok) {
        this.logger.debug('请求成功', {
          status: response.status,
          data: response.data,
        });
      } else {
        this.logger.warn('请求失败', {
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      this.logger.error('请求执行失败', error);
    }
  }

  /**
   * 存储操作示例
   */
  public async storageOperations(adapter: IUnifiedAdapter): Promise<void> {
    try {
      const storage = adapter.getStorage();

      // 检查存储是否可用
      if (!storage.isAvailable()) {
        this.logger.warn('存储不可用');
        return;
      }

      // 存储数据
      await storage.setItem('testKey', 'Hello World');
      this.logger.debug('数据已存储');

      // 获取数据
      const value = await storage.getItem('testKey');
      this.logger.debug(`获取的数据: ${value}`);

      // 获取所有键
      const keys = await storage.keys();
      this.logger.debug('所有存储键', keys);

      // 删除数据
      await storage.removeItem('testKey');
      this.logger.debug('数据已删除');

      // 验证删除
      const afterDelete = await storage.getItem('testKey');
      this.logger.debug(
        `删除后获取: ${afterDelete === null ? '已删除' : '删除失败'}`
      );
    } catch (error) {
      this.logger.error('存储操作失败', error);
    }
  }
}

/**
 * 运行示例
 */
async function runExample(): Promise<void> {
  const example = new AdapterExample();

  // 获取最佳适配器
  const adapter = await example.getBestAdapter();

  if (adapter) {
    // 执行HTTP请求示例
    await example.executeRequest(
      adapter,
      'https://jsonplaceholder.typicode.com/posts/1'
    );

    // 存储操作示例
    await example.storageOperations(adapter);

    // 文件上传示例 (仅浏览器环境)
    // 需要实际文件对象和上传URL
    // const file = ...; // 从文件输入或者其他来源获取
    // await example.uploadFile(adapter, file, 'https://upload.example.com/api');
  }

  // 使用构建器创建适配器
  example.createAdapterWithBuilder();
}

// 运行示例
runExample().catch(console.error);

export default AdapterExample;
