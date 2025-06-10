import { IPlugin } from './interfaces';
import { IStorageAdapter, StoragePluginOptions } from '../types/storage';
import UploaderCore from '../core/UploaderCore';

/**
 * 存储插件
 * 提供通过插件注册自定义存储适配器的能力
 */
export class StoragePlugin implements IPlugin {
  /**
   * 插件名称
   */
  public name = 'StoragePlugin';

  /**
   * 存储适配器
   */
  private _storageAdapter: IStorageAdapter;

  /**
   * 插件选项
   */
  private _options: StoragePluginOptions;

  /**
   * UploaderCore实例
   */
  private _core: UploaderCore | null = null;

  /**
   * 构造函数
   * @param storageAdapter 自定义存储适配器
   * @param options 插件选项
   */
  constructor(
    storageAdapter: IStorageAdapter,
    options: StoragePluginOptions = {}
  ) {
    this._storageAdapter = storageAdapter;
    this._options = {
      overrideDefault: false,
      storageKey: 'custom-storage',
      ...options,
    };
  }

  /**
   * 安装插件
   * @param core UploaderCore实例
   */
  public async install(core: UploaderCore): Promise<void> {
    this._core = core;

    // 初始化存储适配器
    await this._storageAdapter.init();

    // 注册存储适配器
    if (this._options.overrideDefault) {
      // 覆盖默认存储适配器
      core.setStorageAdapter(this._storageAdapter);
    } else {
      // 添加为附加存储适配器
      core.addStorageAdapter(this._options.storageKey, this._storageAdapter);
    }

    // 注册插件事件监听
    this._registerEventListeners();

    // 记录日志
    core.logger.info(`[${this.name}] 插件安装成功`);
  }

  /**
   * 卸载插件
   */
  public async uninstall(): Promise<void> {
    if (!this._core) return;

    // 移除事件监听
    this._unregisterEventListeners();

    // 移除存储适配器
    if (this._options.overrideDefault) {
      // 恢复默认存储适配器
      this._core.resetStorageAdapter();
    } else {
      // 移除附加存储适配器
      this._core.removeStorageAdapter(this._options.storageKey);
    }

    // 关闭存储连接
    await this._storageAdapter.close();

    // 记录日志
    this._core.logger.info(`[${this.name}] 插件卸载成功`);

    this._core = null;
  }

  /**
   * 注册事件监听
   */
  private _registerEventListeners(): void {
    if (!this._core) return;

    // 监听上传完成事件，可以在这里做一些清理工作
    this._core.on('uploadComplete', this._handleUploadComplete.bind(this));

    // 监听文件添加事件，可以在这里做一些初始化工作
    this._core.on('fileAdded', this._handleFileAdded.bind(this));
  }

  /**
   * 移除事件监听
   */
  private _unregisterEventListeners(): void {
    if (!this._core) return;

    this._core.off('uploadComplete', this._handleUploadComplete.bind(this));
    this._core.off('fileAdded', this._handleFileAdded.bind(this));
  }

  /**
   * 处理上传完成事件
   * @param data 事件数据
   */
  private async _handleUploadComplete(data: any): Promise<void> {
    if (!this._core) return;

    // 上传完成后根据配置决定是否清理存储数据
    if (this._options.cleanupOnComplete) {
      const { fileId } = data;
      try {
        await this._storageAdapter.deleteFileChunks(fileId);
        await this._storageAdapter.deleteFileMetadata(fileId);
        this._core.logger.debug(
          `[${this.name}] 已清理文件 ${fileId} 的存储数据`
        );
      } catch (error) {
        this._core.logger.warn(
          `[${this.name}] 清理存储数据失败: ${error.message}`
        );
      }
    }
  }

  /**
   * 处理文件添加事件
   * @param data 事件数据
   */
  private async _handleFileAdded(data: any): Promise<void> {
    if (!this._core) return;

    // 文件添加后可以在自定义存储中初始化一些数据
    const { fileId, file } = data;

    try {
      // 初始化文件元数据
      const metadata = {
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        chunkSize: this._core.options.chunkSize,
        totalChunks: Math.ceil(file.size / this._core.options.chunkSize),
        uploadedChunks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        customData: this._options.fileMetadataExtension
          ? this._options.fileMetadataExtension(file)
          : {},
      };

      await this._storageAdapter.saveFileMetadata(fileId, metadata);
      this._core.logger.debug(`[${this.name}] 已初始化文件 ${fileId} 的元数据`);
    } catch (error) {
      this._core.logger.warn(
        `[${this.name}] 初始化文件元数据失败: ${error.message}`
      );
    }
  }

  /**
   * 获取存储适配器
   */
  public getStorageAdapter(): IStorageAdapter {
    return this._storageAdapter;
  }
}

export default StoragePlugin;
