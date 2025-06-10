import { IPlugin } from '../interfaces';
import { UploaderCore } from '../../core';
import {
  IPipelinePluginOptions,
  PipelineStepType,
  IPipelineStep,
} from './interfaces';
import { Pipeline, PipelineContext } from './Pipeline';
import { IFile, IPluginHooks } from '../../types';

/**
 * 文件处理流水线插件
 * 负责在文件上传前、上传中和上传后执行注册的处理步骤
 */
export class PipelinePlugin implements IPlugin {
  /** 插件名称 */
  public static readonly pluginName = 'PipelinePlugin';

  /** 流水线实例 */
  private _pipeline: Pipeline;
  /** 插件配置 */
  private _options: IPipelinePluginOptions;
  /** 上传器实例引用 */
  private _uploader?: UploaderCore;

  /**
   * 构造函数
   * @param options 插件配置
   */
  constructor(options: Partial<IPipelinePluginOptions> = {}) {
    this._options = {
      enabled: true,
      abortOnPreProcessFail: true,
      abortOnProcessFail: true,
      abortOnPostProcessFail: false,
      ...options,
    };

    this._pipeline = new Pipeline();
  }

  /**
   * 安装插件到UploaderCore
   * @param uploader UploaderCore实例
   */
  public install(uploader: UploaderCore): void {
    if (!this._options.enabled) {
      return; // 如果插件未启用，直接返回
    }

    this._uploader = uploader;

    // 注册各个生命周期钩子
    this._registerHooks(uploader);
  }

  /**
   * 获取插件名称
   * @returns 插件名称
   */
  public getName(): string {
    return PipelinePlugin.pluginName;
  }

  /**
   * 获取流水线实例
   * @returns Pipeline实例
   */
  public getPipeline(): Pipeline {
    return this._pipeline;
  }

  /**
   * 添加处理步骤
   * @param step 步骤实例
   * @returns this实例，支持链式调用
   */
  public addStep(step: IPipelineStep): PipelinePlugin {
    this._pipeline.addStep(step);
    return this;
  }

  /**
   * 移除处理步骤
   * @param stepId 步骤ID
   * @returns 是否成功移除
   */
  public removeStep(stepId: string): boolean {
    return this._pipeline.removeStep(stepId);
  }

  /**
   * 获取特定类型的所有步骤
   * @param type 步骤类型
   * @returns 步骤数组
   */
  public getSteps(type?: PipelineStepType): IPipelineStep[] {
    return this._pipeline.getSteps(type);
  }

  /**
   * 注册上传器生命周期钩子
   * @param uploader UploaderCore实例
   * @private
   */
  private _registerHooks(uploader: UploaderCore): void {
    const hooks: Partial<IPluginHooks> = {};

    // 预处理钩子：在文件开始上传前执行
    hooks.beforeFileUpload = async (file: IFile) => {
      if (!this._pipeline.getSteps(PipelineStepType.PRE_PROCESS).length) {
        return file; // 如果没有预处理步骤，直接返回原文件
      }

      try {
        const context = new PipelineContext(this._uploader, { file });
        const processedFile = await this._pipeline.execute(
          PipelineStepType.PRE_PROCESS,
          file,
          context
        );
        return processedFile;
      } catch (error) {
        console.error('文件预处理失败:', error);

        // 如果配置为预处理失败时中断上传
        if (this._options.abortOnPreProcessFail) {
          throw error; // 抛出错误将中断上传
        }

        return file; // 否则继续使用原始文件
      }
    };

    // 处理钩子：在分片上传前执行
    hooks.beforeChunkUpload = async (chunk, file) => {
      if (!this._pipeline.getSteps(PipelineStepType.PROCESS).length) {
        return chunk; // 如果没有处理步骤，直接返回原分片
      }

      try {
        const context = new PipelineContext(this._uploader, { chunk, file });
        const processedChunk = await this._pipeline.execute(
          PipelineStepType.PROCESS,
          chunk,
          context
        );
        return processedChunk;
      } catch (error) {
        console.error('分片处理失败:', error);

        // 如果配置为处理失败时中断上传
        if (this._options.abortOnProcessFail) {
          throw error; // 抛出错误将中断上传
        }

        return chunk; // 否则继续使用原始分片
      }
    };

    // 后处理钩子：在文件上传完成后执行
    hooks.afterFileUpload = async (file, response) => {
      if (!this._pipeline.getSteps(PipelineStepType.POST_PROCESS).length) {
        return; // 如果没有后处理步骤，直接返回
      }

      try {
        const context = new PipelineContext(this._uploader, { file, response });
        await this._pipeline.execute(
          PipelineStepType.POST_PROCESS,
          { file, response },
          context
        );
      } catch (error) {
        console.error('文件后处理失败:', error);

        // 如果配置为后处理失败时抛出错误
        if (this._options.abortOnPostProcessFail) {
          throw error;
        }
        // 否则静默失败，继续后续流程
      }
    };

    // 注册所有钩子
    uploader.registerHooks(hooks);
  }
}
