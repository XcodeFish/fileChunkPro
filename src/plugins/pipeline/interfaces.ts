import { IFile, IChunk } from '../../types';
import { UploaderCore } from '../../core';

/**
 * 处理步骤的执行上下文
 */
export interface IPipelineContext {
  /** 关联的上传器实例 */
  uploader: UploaderCore;
  /** 额外的上下文数据 */
  data: Record<string, any>;
  /** 获取上下文数据 */
  get<T>(key: string): T | undefined;
  /** 设置上下文数据 */
  set<T>(key: string, value: T): void;
  /** 移除上下文数据 */
  remove(key: string): void;
  /** 判断是否存在某个上下文数据 */
  has(key: string): boolean;
}

/**
 * 流水线步骤类型
 */
export enum PipelineStepType {
  /** 上传前的预处理步骤 */
  PRE_PROCESS = 'preProcess',
  /** 上传中的处理步骤 */
  PROCESS = 'process',
  /** 上传后的后处理步骤 */
  POST_PROCESS = 'postProcess',
}

/**
 * 流水线步骤执行结果
 */
export interface IPipelineStepResult {
  /** 是否成功 */
  success: boolean;
  /** 处理后的文件/分片 (可选) */
  data?: IFile | IChunk | any;
  /** 错误信息 (可选) */
  error?: Error;
}

/**
 * 流水线步骤接口
 */
export interface IPipelineStep {
  /** 步骤的唯一ID */
  id: string;
  /** 步骤名称 */
  name: string;
  /** 步骤类型 */
  type: PipelineStepType;
  /** 步骤优先级，数字越小优先级越高 */
  priority: number;
  /**
   * 执行步骤
   * @param data 输入数据
   * @param context 执行上下文
   * @returns 处理结果
   */
  execute(data: any, context: IPipelineContext): Promise<IPipelineStepResult>;
}

/**
 * 流水线接口
 */
export interface IPipeline {
  /** 添加处理步骤 */
  addStep(step: IPipelineStep): void;
  /** 移除处理步骤 */
  removeStep(stepId: string): boolean;
  /** 获取所有处理步骤 */
  getSteps(type?: PipelineStepType): IPipelineStep[];
  /** 执行指定类型的处理步骤 */
  execute(
    type: PipelineStepType,
    data: any,
    context: IPipelineContext
  ): Promise<any>;
}

/**
 * 流水线插件配置
 */
export interface IPipelinePluginOptions {
  /** 是否启用流水线 */
  enabled: boolean;
  /** 预处理失败时是否中断上传 */
  abortOnPreProcessFail: boolean;
  /** 处理失败时是否中断上传 */
  abortOnProcessFail: boolean;
  /** 后处理失败时是否中断后续处理 */
  abortOnPostProcessFail: boolean;
}
