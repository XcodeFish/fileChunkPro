/**
 * ExamplePlugin - 示例插件
 * 展示如何使用插件SDK创建自定义插件
 */

import {
  PluginBase,
  PluginLifecycleHook,
  ExtensionPoint,
  createPluginMetadata,
  IPluginContext,
} from '../../plugins/SDK';

/**
 * 自定义文件处理器
 */
class CustomFileProcessor {
  /**
   * 处理文件
   * @param file 文件对象
   */
  public processFile(file: File | Blob): Promise<File | Blob> {
    console.log(
      `[CustomFileProcessor] 处理文件: ${(file as File).name || '未命名文件'}`
    );
    // 在实际应用中，这里可以进行文件压缩、格式转换等处理
    return Promise.resolve(file);
  }
}

/**
 * 自定义上传前验证器
 */
class CustomValidator {
  /**
   * 验证文件
   * @param file 文件对象
   */
  public validate(
    file: File | Blob
  ): Promise<{ valid: boolean; message?: string }> {
    const fileSize = file.size;
    const isValid = fileSize < 100 * 1024 * 1024; // 100MB限制

    console.log(
      `[CustomValidator] 验证文件大小: ${fileSize}字节, 结果: ${isValid ? '通过' : '未通过'}`
    );

    return Promise.resolve({
      valid: isValid,
      message: isValid ? undefined : '文件大小超过100MB限制',
    });
  }
}

/**
 * 示例插件实现
 * 展示插件SDK的主要功能和用法
 */
export class ExamplePlugin extends PluginBase {
  private fileProcessor: CustomFileProcessor;
  private validator: CustomValidator;

  /**
   * 构造函数
   */
  constructor() {
    // 创建插件元数据
    super(
      createPluginMetadata('example-plugin', '1.0.0', {
        description: '示例插件，展示SDK功能',
        author: 'fileChunkPro团队',
        tags: ['example', 'demo'],
        extensionPoints: [ExtensionPoint.FILE_PROCESSOR],
        hooks: [
          PluginLifecycleHook.BEFORE_UPLOAD,
          PluginLifecycleHook.AFTER_UPLOAD,
        ],
      })
    );

    // 创建处理器实例
    this.fileProcessor = new CustomFileProcessor();
    this.validator = new CustomValidator();
  }

  /**
   * 插件安装时调用
   * 在这里注册钩子和扩展点
   */
  protected onInstall(): void {
    const context = this.getContext();

    // 注册钩子处理函数
    this.registerHook(
      PluginLifecycleHook.BEFORE_UPLOAD,
      this.handleBeforeUpload.bind(this)
    );
    this.registerHook(
      PluginLifecycleHook.AFTER_UPLOAD,
      this.handleAfterUpload.bind(this)
    );

    // 注册扩展点实现
    this.registerExtension(ExtensionPoint.FILE_PROCESSOR, this.fileProcessor, {
      name: 'example-file-processor',
      description: '示例文件处理器',
    });

    context.log('info', '示例插件安装完成，已注册钩子和扩展点');
  }

  /**
   * 插件初始化时调用
   * 在这里执行一些异步初始化操作
   */
  protected async onInit(): Promise<void> {
    const context = this.getContext();

    // 模拟异步初始化操作
    await new Promise(resolve => setTimeout(resolve, 100));

    // 获取配置
    const config = context.getConfig();
    context.log('info', '示例插件初始化完成', { config });
  }

  /**
   * 插件卸载时调用
   * 在这里清理资源
   */
  protected onUninstall(): void {
    const context = this.getContext();
    context.log('info', '示例插件已卸载，资源已清理');
  }

  /**
   * 插件配置更新时调用
   * @param _oldConfig 旧配置
   * @param newConfig 新配置
   */
  protected onConfigUpdate(
    _oldConfig: Record<string, any>,
    newConfig: Record<string, any>
  ): void {
    const context = this.getContext();
    context.log('info', '示例插件配置已更新', { newConfig });
  }

  /**
   * 上传前钩子处理函数
   * @param args 钩子参数
   */
  private async handleBeforeUpload(args: {
    file: File | Blob;
    context: IPluginContext;
  }): Promise<any> {
    const { file, context } = args;

    // 验证文件
    const validationResult = await this.validator.validate(file);
    if (!validationResult.valid) {
      context.log('warn', `文件验证失败: ${validationResult.message}`);
      return {
        handled: true,
        result: {
          success: false,
          error: validationResult.message,
        },
        modified: true,
      };
    }

    // 处理文件
    const processedFile = await this.fileProcessor.processFile(file);

    context.log('info', '文件已处理，准备上传');

    // 返回处理结果
    return {
      handled: true,
      result: {
        file: processedFile,
      },
      modified: true,
    };
  }

  /**
   * 上传后钩子处理函数
   * @param args 钩子参数
   */
  private handleAfterUpload(args: {
    result: any;
    context: IPluginContext;
  }): void {
    const { result, context } = args;

    context.log('info', '文件上传完成', { result });

    // 这里可以执行上传后的操作，如发送通知、更新UI等
  }
}
