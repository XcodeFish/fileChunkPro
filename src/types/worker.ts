/**
 * Worker线程通信消息类型定义
 */

// Worker支持的操作类型
export enum WorkerTaskType {
  FILE_HASH = 'FILE_HASH',
  CHUNK_HASH = 'CHUNK_HASH',
  FILE_SLICE = 'FILE_SLICE',
  FILE_VALIDATE = 'FILE_VALIDATE',
  ENCRYPTION = 'ENCRYPTION',
  DECRYPTION = 'DECRYPTION'
}

// 基础消息接口
export interface IWorkerMessage {
  id: string;
  type: WorkerTaskType;
}

// 从主线程到Worker的请求消息
export interface IWorkerRequestMessage extends IWorkerMessage {
  payload: unknown;
}

// 从Worker到主线程的响应消息
export interface IWorkerResponseMessage extends IWorkerMessage {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

// 文件哈希计算请求
export interface IFileHashRequest extends IWorkerRequestMessage {
  type: WorkerTaskType.FILE_HASH;
  payload: {
    fileData: ArrayBuffer;
    algorithm: 'md5' | 'sha1' | 'sha256';
  };
}

// 文件哈希计算响应
export interface IFileHashResponse extends IWorkerResponseMessage {
  type: WorkerTaskType.FILE_HASH;
  result?: {
    hash: string;
    duration: number;
  };
}

// 分片哈希计算请求
export interface IChunkHashRequest extends IWorkerRequestMessage {
  type: WorkerTaskType.CHUNK_HASH;
  payload: {
    chunkData: ArrayBuffer;
    chunkIndex: number;
    algorithm: 'md5' | 'sha1' | 'sha256';
  };
}

// 分片哈希计算响应
export interface IChunkHashResponse extends IWorkerResponseMessage {
  type: WorkerTaskType.CHUNK_HASH;
  result?: {
    hash: string;
    chunkIndex: number;
    duration: number;
  };
}

// 文件分片请求
export interface IFileSliceRequest extends IWorkerRequestMessage {
  type: WorkerTaskType.FILE_SLICE;
  payload: {
    fileData: ArrayBuffer;
    chunkSize: number;
    strategy: 'fixed' | 'dynamic';
  };
}

// 文件分片响应
export interface IFileSliceResponse extends IWorkerResponseMessage {
  type: WorkerTaskType.FILE_SLICE;
  result?: {
    chunks: Array<{
      index: number;
      size: number;
      offset: number;
    }>;
    totalChunks: number;
  };
}

// 文件校验请求
export interface IFileValidateRequest extends IWorkerRequestMessage {
  type: WorkerTaskType.FILE_VALIDATE;
  payload: {
    fileData: ArrayBuffer;
    validations: Array<{
      type: 'size' | 'type' | 'hash';
      value: string | number;
    }>;
  };
}

// 文件校验响应
export interface IFileValidateResponse extends IWorkerResponseMessage {
  type: WorkerTaskType.FILE_VALIDATE;
  result?: {
    valid: boolean;
    failedChecks: string[];
  };
}

// 加密请求
export interface IEncryptionRequest extends IWorkerRequestMessage {
  type: WorkerTaskType.ENCRYPTION;
  payload: {
    data: ArrayBuffer;
    algorithm: 'aes-256-gcm' | 'aes-128-cbc';
    key: string;
    iv?: string;
  };
}

// 加密响应
export interface IEncryptionResponse extends IWorkerResponseMessage {
  type: WorkerTaskType.ENCRYPTION;
  result?: {
    data: ArrayBuffer;
    iv?: string;
  };
}

// 解密请求
export interface IDecryptionRequest extends IWorkerRequestMessage {
  type: WorkerTaskType.DECRYPTION;
  payload: {
    data: ArrayBuffer;
    algorithm: 'aes-256-gcm' | 'aes-128-cbc';
    key: string;
    iv: string;
  };
}

// 解密响应
export interface IDecryptionResponse extends IWorkerResponseMessage {
  type: WorkerTaskType.DECRYPTION;
  result?: {
    data: ArrayBuffer;
  };
}

// Worker任务处理器类型
export type WorkerTaskHandler<T extends IWorkerRequestMessage, R extends IWorkerResponseMessage> = 
  (message: T) => Promise<Omit<R, 'id' | 'type' | 'success'>>;

// Worker管理器接口
export interface IWorkerManager {
  spawn(count?: number): Promise<void>;
  terminate(): void;
  postTask<T extends IWorkerRequestMessage, R extends IWorkerResponseMessage>(
    taskType: WorkerTaskType,
    payload: T['payload']
  ): Promise<R['result']>;
  getAvailableWorkers(): number;
} 