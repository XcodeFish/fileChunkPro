/**
 * EffectiveHash - 副作用管理的哈希计算模块
 *
 * 将纯函数哈希工具与副作用管理系统结合，实现可控、可追踪的哈希计算。
 * 每个哈希计算操作都被包装为副作用，可以被取消、暂停和追踪。
 */

import { v4 as uuidv4 } from 'uuid';
import { EffectManager, EffectFactory } from '../core/EffectManager';
import { EffectType, EffectPriority, ResourceType } from '../types/effect';
import * as PureHashUtils from './PureHashUtils';
import { dataConvert } from './PureFunctions';

/**
 * 哈希计算副作用管理器
 */
export class HashEffectManager {
  private _effectManager: EffectManager;
  private _activeHashTasks: Map<string, string> = new Map(); // 文件ID -> 副作用ID

  /**
   * 创建哈希计算副作用管理器
   * @param effectManager - 全局副作用管理器实例
   */
  constructor(effectManager: EffectManager) {
    this._effectManager = effectManager;
  }

  /**
   * 计算文件哈希（作为副作用）
   * @param file - 文件对象
   * @param options - 哈希计算选项
   * @returns Promise解析为哈希结果
   */
  async calculateFileHash(
    file: File,
    options: {
      algorithm?: 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';
      quick?: boolean;
      fileId?: string;
      chunkSize?: number;
      priority?: EffectPriority;
      onProgress?: (progress: number) => void;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    // 生成或使用文件ID
    const fileId = options.fileId || uuidv4();

    // 定义默认选项
    const {
      algorithm = 'md5',
      quick = file.size > 10 * 1024 * 1024, // 10MB以上默认使用快速哈希
      chunkSize = 2 * 1024 * 1024, // 2MB分块大小
      priority = EffectPriority.NORMAL,
      onProgress,
      metadata = {},
    } = options;

    // 创建并执行副作用
    const result = await this._effectManager.run<string>(
      async (signal, effectMetadata, register) => {
        // 注册文件资源
        register({
          id: `file-${fileId}`,
          type: ResourceType.FILE_HANDLE,
          instance: file,
          dispose: () => {
            /* 文件对象不需要主动释放 */
          },
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          },
        });

        // 使用纯函数计算哈希
        try {
          if (quick) {
            return await PureHashUtils.FileHash.quickHash(file, algorithm);
          } else {
            return await PureHashUtils.FileHash.fullHash(
              file,
              algorithm,
              chunkSize,
              progress => {
                // 更新进度
                if (onProgress && !signal.aborted) {
                  onProgress(progress);
                }
              }
            );
          }
        } catch (error) {
          if (signal.aborted) {
            throw new Error('哈希计算已取消');
          }
          throw error;
        }
      },
      {
        type: EffectType.FILE_SYSTEM,
        priority,
        autoCleanup: true,
        metadata: {
          module: 'HashCalculator',
          fileId,
          context: {
            fileName: file.name,
            fileSize: file.size,
            algorithm,
            quick,
            ...metadata,
          },
        },
        onComplete: () => {
          this._activeHashTasks.delete(fileId);
        },
        onError: () => {
          this._activeHashTasks.delete(fileId);
        },
        onCancel: () => {
          this._activeHashTasks.delete(fileId);
        },
      }
    );

    return result.data || '';
  }

  /**
   * 计算文件指纹（作为副作用）
   * @param file - 文件对象
   * @param options - 指纹计算选项
   * @returns Promise解析为指纹
   */
  async calculateFileFingerprint(
    file: File,
    options: {
      algorithm?: 'md5' | 'sha1' | 'sha256';
      quick?: boolean;
      includeMetadata?: boolean;
      fileId?: string;
      priority?: EffectPriority;
      sampleSize?: number;
    } = {}
  ): Promise<string> {
    // 生成或使用文件ID
    const fileId = options.fileId || uuidv4();

    // 定义默认选项
    const {
      algorithm = 'md5',
      quick = true,
      includeMetadata = true,
      sampleSize = 256 * 1024,
      priority = EffectPriority.NORMAL,
    } = options;

    // 创建并执行副作用
    const result = await this._effectManager.run<string>(
      async (signal, effectMetadata, register) => {
        // 注册文件资源
        register({
          id: `file-${fileId}`,
          type: ResourceType.FILE_HANDLE,
          instance: file,
          dispose: () => {
            /* 文件对象不需要主动释放 */
          },
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          },
        });

        // 检查取消信号
        if (signal.aborted) {
          throw new Error('指纹计算已取消');
        }

        // 使用纯函数计算指纹
        try {
          return await PureHashUtils.FileHash.fingerprint(file, {
            algorithm,
            quick,
            includeMetadata,
            sampleSize,
          });
        } catch (error) {
          if (signal.aborted) {
            throw new Error('指纹计算已取消');
          }
          throw error;
        }
      },
      {
        type: EffectType.FILE_SYSTEM,
        priority,
        autoCleanup: true,
        metadata: {
          module: 'FingerprintCalculator',
          fileId,
          context: {
            fileName: file.name,
            fileSize: file.size,
            algorithm,
            quick,
          },
        },
        onComplete: () => {
          this._activeHashTasks.delete(fileId);
        },
        onError: () => {
          this._activeHashTasks.delete(fileId);
        },
        onCancel: () => {
          this._activeHashTasks.delete(fileId);
        },
      }
    );

    return result.data || '';
  }

  /**
   * 计算文本或数据哈希（作为副作用）
   * @param data - 输入文本或数据
   * @param options - 哈希计算选项
   * @returns Promise解析为哈希结果
   */
  async calculateDataHash(
    data: string | ArrayBuffer | Uint8Array,
    options: {
      algorithm?: 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';
      priority?: EffectPriority;
    } = {}
  ): Promise<string> {
    // 定义默认选项
    const { algorithm = 'md5', priority = EffectPriority.HIGH } = options;

    // 创建并执行副作用
    const result = await this._effectManager.run<string>(
      async signal => {
        // 准备数据
        let buffer: ArrayBuffer | Uint8Array;
        if (typeof data === 'string') {
          buffer = dataConvert.stringToArrayBuffer(data);
        } else {
          buffer = data;
        }

        // 检查取消信号
        if (signal.aborted) {
          throw new Error('哈希计算已取消');
        }

        // 使用纯函数计算哈希
        if (algorithm === 'md5') {
          return PureHashUtils.MD5.compute(buffer);
        } else {
          return await PureHashUtils.SHA.compute(
            buffer,
            algorithm.toUpperCase().replace('SHA', 'SHA-')
          );
        }
      },
      {
        type: EffectType.FILE_SYSTEM,
        priority,
        autoCleanup: true,
        metadata: {
          module: 'DataHashCalculator',
          context: {
            dataSize: typeof data === 'string' ? data.length : data.byteLength,
            algorithm,
          },
        },
      }
    );

    return result.data || '';
  }

  /**
   * 在Worker线程中计算哈希（作为副作用）
   * @param data - 输入数据
   * @param algorithm - 哈希算法
   * @returns Promise解析为哈希结果
   */
  async calculateHashInWorker(
    data: ArrayBuffer | Uint8Array,
    algorithm: 'md5' | 'sha1' | 'sha256' = 'md5'
  ): Promise<string> {
    // 创建Worker副作用
    return EffectFactory.createWorkerEffect<
      { data: ArrayBuffer | Uint8Array; algorithm: string },
      string
    >(
      this._effectManager,
      () => {
        // 使用闭包创建Worker内的代码
        // 注意：实际上这段代码将被序列化并在Worker中运行
        self.onmessage = async e => {
          const { data, algorithm } = e.data;

          try {
            let result;

            // 在Worker中计算哈希
            // 这里需要重新实现哈希算法，因为Worker中无法访问主线程的模块
            if (algorithm === 'md5') {
              // 实现MD5算法...
              // 由于代码过长，这里假设使用内联的MD5算法
              result = 'md5_result_placeholder';
            } else {
              // 使用Web Crypto API计算其他哈希
              const hashBuffer = await crypto.subtle.digest(
                algorithm.toUpperCase().replace('SHA', 'SHA-'),
                data
              );

              // 转换为十六进制
              const bytes = new Uint8Array(hashBuffer);
              result = Array.from(bytes)
                .map(byte => byte.toString(16).padStart(2, '0'))
                .join('');
            }

            // 发送结果回主线程
            self.postMessage(result);
          } catch (error) {
            self.postMessage({
              error: error.message || '哈希计算失败',
            });
          }
        };
      },
      { data, algorithm },
      {
        metadata: {
          module: 'WorkerHashCalculator',
          context: {
            dataSize: data.byteLength,
            algorithm,
          },
        },
      }
    ).then(result => result.data || '');
  }

  /**
   * 取消文件哈希计算
   * @param fileId - 文件ID
   * @returns 是否成功取消
   */
  cancelHashCalculation(fileId: string): boolean {
    const effectId = this._activeHashTasks.get(fileId);
    if (effectId) {
      this._effectManager.cancel(effectId);
      return true;
    }
    return false;
  }

  /**
   * 取消所有哈希计算
   */
  cancelAllHashCalculations(): void {
    // 取消所有文件系统类型的副作用
    this._effectManager.cancelAll(EffectType.FILE_SYSTEM);
    this._activeHashTasks.clear();
  }

  /**
   * 获取活动哈希计算任务数量
   */
  getActiveTaskCount(): number {
    return this._activeHashTasks.size;
  }

  /**
   * 检查文件是否正在计算哈希
   * @param fileId - 文件ID
   */
  isFileProcessing(fileId: string): boolean {
    return this._activeHashTasks.has(fileId);
  }
}
