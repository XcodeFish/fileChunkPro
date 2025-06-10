import {
  IPipeline,
  IPipelineStep,
  PipelineStepType,
  IPipelineContext,
  IPipelineStepResult,
} from './interfaces';

/**
 * 流水线上下文实现
 */
export class PipelineContext implements IPipelineContext {
  public uploader: any;
  public data: Record<string, any>;

  constructor(uploader: any, initialData: Record<string, any> = {}) {
    this.uploader = uploader;
    this.data = { ...initialData };
  }

  public get<T>(key: string): T | undefined {
    return this.data[key] as T;
  }

  public set<T>(key: string, value: T): void {
    this.data[key] = value;
  }

  public remove(key: string): void {
    delete this.data[key];
  }

  public has(key: string): boolean {
    return key in this.data;
  }
}

/**
 * 流水线核心实现
 */
export class Pipeline implements IPipeline {
  private _steps: Map<PipelineStepType, IPipelineStep[]> = new Map();

  /**
   * 构造函数
   */
  constructor() {
    // 初始化步骤类型映射
    Object.values(PipelineStepType).forEach(type => {
      this._steps.set(type, []);
    });
  }

  /**
   * 添加处理步骤
   * @param step 要添加的步骤
   */
  public addStep(step: IPipelineStep): void {
    const stepsOfType = this._steps.get(step.type) || [];

    // 检查是否已存在相同ID的步骤
    const existingIndex = stepsOfType.findIndex(s => s.id === step.id);
    if (existingIndex >= 0) {
      // 替换已存在的步骤
      stepsOfType[existingIndex] = step;
    } else {
      // 添加新步骤
      stepsOfType.push(step);
    }

    // 根据优先级排序
    stepsOfType.sort((a, b) => a.priority - b.priority);
    this._steps.set(step.type, stepsOfType);
  }

  /**
   * 移除处理步骤
   * @param stepId 要移除的步骤ID
   * @returns 是否成功移除
   */
  public removeStep(stepId: string): boolean {
    let removed = false;

    for (const [type, steps] of this._steps.entries()) {
      const initialLength = steps.length;
      const filteredSteps = steps.filter(step => step.id !== stepId);

      if (filteredSteps.length !== initialLength) {
        this._steps.set(type, filteredSteps);
        removed = true;
        break;
      }
    }

    return removed;
  }

  /**
   * 获取所有处理步骤
   * @param type 可选的步骤类型筛选
   * @returns 处理步骤数组
   */
  public getSteps(type?: PipelineStepType): IPipelineStep[] {
    if (type) {
      return [...(this._steps.get(type) || [])];
    }

    // 返回所有步骤
    const allSteps: IPipelineStep[] = [];
    for (const steps of this._steps.values()) {
      allSteps.push(...steps);
    }

    return allSteps;
  }

  /**
   * 执行指定类型的处理步骤
   * @param type 步骤类型
   * @param data 输入数据
   * @param context 执行上下文
   * @returns 处理后的数据
   */
  public async execute(
    type: PipelineStepType,
    data: any,
    context: IPipelineContext
  ): Promise<any> {
    const steps = this._steps.get(type) || [];
    if (steps.length === 0) {
      return data; // 如果没有步骤，直接返回原数据
    }

    let currentData = data;

    // 按顺序执行所有步骤
    for (const step of steps) {
      try {
        const result: IPipelineStepResult = await step.execute(
          currentData,
          context
        );

        if (!result.success) {
          // 如果步骤执行失败
          context.set('lastError', result.error);
          context.set('failedStep', step);

          if (result.error) {
            throw result.error;
          } else {
            throw new Error(`步骤 ${step.name} 执行失败`);
          }
        }

        // 更新数据为当前步骤的输出
        if (result.data !== undefined) {
          currentData = result.data;
        }
      } catch (error) {
        // 记录错误信息
        context.set('lastError', error);
        context.set('failedStep', step);
        throw error;
      }
    }

    return currentData;
  }
}
