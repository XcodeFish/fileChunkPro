import {
  IPipelineStep,
  IPipelineContext,
  IPipelineStepResult,
  PipelineStepType,
} from '../interfaces';
import { IFile } from '../../../types';

/**
 * 文件大小验证步骤 - 验证文件大小是否在允许范围内
 */
export class FileSizeValidationStep implements IPipelineStep {
  public id = 'file-size-validation';
  public name = '文件大小验证';
  public type = PipelineStepType.PRE_PROCESS;
  public priority = 10;

  private _maxSize: number;
  private _minSize: number;

  /**
   * 构造函数
   * @param maxSize 最大允许大小（字节）
   * @param minSize 最小允许大小（字节）
   */
  constructor(maxSize = Infinity, minSize = 0) {
    this._maxSize = maxSize;
    this._minSize = minSize;
  }

  /**
   * 执行步骤
   * @param data 输入文件
   * @param _context 上下文
   */
  public async execute(
    data: IFile,
    _context: IPipelineContext
  ): Promise<IPipelineStepResult> {
    const file = data;

    if (file.size > this._maxSize) {
      return {
        success: false,
        error: new Error(
          `文件大小超过限制：${file.size} > ${this._maxSize} 字节`
        ),
      };
    }

    if (file.size < this._minSize) {
      return {
        success: false,
        error: new Error(
          `文件大小小于最小限制：${file.size} < ${this._minSize} 字节`
        ),
      };
    }

    return {
      success: true,
      data: file,
    };
  }
}

/**
 * 文件类型验证步骤 - 验证文件MIME类型是否在允许列表中
 */
export class FileTypeValidationStep implements IPipelineStep {
  public id = 'file-type-validation';
  public name = '文件类型验证';
  public type = PipelineStepType.PRE_PROCESS;
  public priority = 20;

  private _allowedTypes: string[];

  /**
   * 构造函数
   * @param allowedTypes 允许的MIME类型数组
   */
  constructor(allowedTypes: string[] = []) {
    this._allowedTypes = allowedTypes;
  }

  /**
   * 执行步骤
   * @param data 输入文件
   * @param _context 上下文
   */
  public async execute(
    data: IFile,
    _context: IPipelineContext
  ): Promise<IPipelineStepResult> {
    const file = data;

    // 如果未指定允许的类型，则允许所有类型
    if (this._allowedTypes.length === 0) {
      return {
        success: true,
        data: file,
      };
    }

    const isAllowed = this._allowedTypes.some(type => {
      // 支持通配符匹配，如 "image/*"
      if (type.endsWith('/*')) {
        const mainType = type.split('/')[0];
        return file.type.startsWith(`${mainType}/`);
      }
      return file.type === type;
    });

    if (!isAllowed) {
      return {
        success: false,
        error: new Error(
          `文件类型不允许：${file.type}。允许的类型：${this._allowedTypes.join(', ')}`
        ),
      };
    }

    return {
      success: true,
      data: file,
    };
  }
}

/**
 * 文件名修改步骤 - 根据规则修改文件名
 */
export class FileRenameStep implements IPipelineStep {
  public id = 'file-rename';
  public name = '文件重命名';
  public type = PipelineStepType.PRE_PROCESS;
  public priority = 30;

  private _renameFn: (file: IFile) => string;

  /**
   * 构造函数
   * @param renameFn 重命名函数
   */
  constructor(renameFn: (file: IFile) => string) {
    this._renameFn = renameFn;
  }

  /**
   * 执行步骤
   * @param data 输入文件
   * @param _context 上下文
   */
  public async execute(
    data: IFile,
    _context: IPipelineContext
  ): Promise<IPipelineStepResult> {
    const file = { ...data };

    try {
      const newName = this._renameFn(file);
      file.name = newName;

      return {
        success: true,
        data: file,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('文件重命名失败'),
      };
    }
  }
}

/**
 * 上传日志记录步骤 - 在文件上传完成后记录上传信息
 */
export class UploadLoggingStep implements IPipelineStep {
  public id = 'upload-logging';
  public name = '上传日志记录';
  public type = PipelineStepType.POST_PROCESS;
  public priority = 10;

  private _logFn: (file: IFile, response: any) => void;

  /**
   * 构造函数
   * @param logFn 日志记录函数
   */
  constructor(logFn: (file: IFile, response: any) => void) {
    this._logFn = logFn;
  }

  /**
   * 执行步骤
   * @param data 输入数据
   * @param _context 上下文
   */
  public async execute(
    data: { file: IFile; response: any },
    _context: IPipelineContext
  ): Promise<IPipelineStepResult> {
    const { file, response } = data;

    try {
      this._logFn(file, response);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('日志记录失败'),
      };
    }
  }
}

/**
 * 通知发送步骤 - 在文件上传完成后发送通知
 */
export class NotificationStep implements IPipelineStep {
  public id = 'notification';
  public name = '发送通知';
  public type = PipelineStepType.POST_PROCESS;
  public priority = 20;

  private _notifyFn: (file: IFile, response: any) => Promise<void>;

  /**
   * 构造函数
   * @param notifyFn 通知函数
   */
  constructor(notifyFn: (file: IFile, response: any) => Promise<void>) {
    this._notifyFn = notifyFn;
  }

  /**
   * 执行步骤
   * @param data 输入数据
   * @param _context 上下文
   */
  public async execute(
    data: { file: IFile; response: any },
    _context: IPipelineContext
  ): Promise<IPipelineStepResult> {
    const { file, response } = data;

    try {
      await this._notifyFn(file, response);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('通知发送失败'),
      };
    }
  }
}
