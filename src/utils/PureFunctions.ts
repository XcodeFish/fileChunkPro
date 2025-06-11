/**
 * PureFunctions - 纯函数工具集
 *
 * 本模块包含各种纯函数工具，遵循以下原则：
 * 1. 无副作用 - 不修改外部状态，不进行I/O操作
 * 2. 确定性 - 相同输入总是产生相同输出
 * 3. 透明性 - 函数调用可以被其结果替换而不影响程序行为
 */

/**
 * 数据类型转换纯函数
 */
export const dataConvert = {
  /**
   * 将ArrayBuffer转换为十六进制字符串
   * @param buffer - 输入的ArrayBuffer
   * @returns 十六进制字符串
   */
  arrayBufferToHex: (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * 将字符串转换为ArrayBuffer
   * @param str - 输入字符串
   * @returns ArrayBuffer对象
   */
  stringToArrayBuffer: (str: string): ArrayBuffer => {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  },

  /**
   * 将ArrayBuffer转换为Base64字符串
   * @param buffer - 输入的ArrayBuffer
   * @returns Base64编码的字符串
   */
  arrayBufferToBase64: (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
  },

  /**
   * 将Base64字符串转换为ArrayBuffer
   * @param base64 - Base64编码的字符串
   * @returns ArrayBuffer对象
   */
  base64ToArrayBuffer: (base64: string): ArrayBuffer => {
    const binary =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('binary');
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },
};

/**
 * 数据处理纯函数
 */
export const dataProcess = {
  /**
   * 将两个ArrayBuffer连接在一起
   * @param buffer1 - 第一个ArrayBuffer
   * @param buffer2 - 第二个ArrayBuffer
   * @returns 合并后的ArrayBuffer
   */
  concatenateArrayBuffers: (
    buffer1: ArrayBuffer,
    buffer2: ArrayBuffer
  ): ArrayBuffer => {
    const result = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    result.set(new Uint8Array(buffer1), 0);
    result.set(new Uint8Array(buffer2), buffer1.byteLength);
    return result.buffer;
  },

  /**
   * 将ArrayBuffer分割成固定大小的块
   * @param buffer - 输入的ArrayBuffer
   * @param chunkSize - 每个块的大小（字节）
   * @returns ArrayBuffer数组
   */
  chunkArrayBuffer: (buffer: ArrayBuffer, chunkSize: number): ArrayBuffer[] => {
    const chunks: ArrayBuffer[] = [];
    const totalSize = buffer.byteLength;

    for (let i = 0; i < totalSize; i += chunkSize) {
      const end = Math.min(i + chunkSize, totalSize);
      chunks.push(buffer.slice(i, end));
    }

    return chunks;
  },

  /**
   * 计算数据的CRC32校验和
   * @param data - 输入的ArrayBuffer数据
   * @returns CRC32校验和（十六进制字符串）
   */
  crc32: (data: ArrayBuffer): string => {
    const bytes = new Uint8Array(data);
    let crc = 0xffffffff;

    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }

    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  },
};

/**
 * 验证函数
 */
export const validate = {
  /**
   * 验证文件名是否合法
   * @param fileName - 文件名
   * @returns 是否合法
   */
  isValidFileName: (fileName: string): boolean => {
    if (!fileName || typeof fileName !== 'string') return false;

    // 文件名不能包含特定字符
    const invalidChars = /[\\/:*?"<>|]/;
    return !invalidChars.test(fileName);
  },

  /**
   * 验证MIME类型格式
   * @param mimeType - MIME类型字符串
   * @returns 是否有效
   */
  isValidMimeType: (mimeType: string): boolean => {
    if (!mimeType || typeof mimeType !== 'string') return false;

    // 基本MIME类型格式: type/subtype
    const mimePattern = /^[\w.-]+\/[\w.-]+$/;
    return mimePattern.test(mimeType);
  },

  /**
   * 验证URL格式
   * @param url - URL字符串
   * @returns 是否有效
   */
  isValidUrl: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 验证文件扩展名是否在允许列表中
   * @param fileName - 文件名
   * @param allowedExtensions - 允许的扩展名数组
   * @returns 是否允许
   */
  hasAllowedExtension: (
    fileName: string,
    allowedExtensions: string[]
  ): boolean => {
    if (!fileName || !allowedExtensions || !Array.isArray(allowedExtensions))
      return false;

    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    return allowedExtensions.some(
      ext =>
        ext.toLowerCase() === extension || ext.toLowerCase() === `.${extension}`
    );
  },
};

/**
 * 数学与计算纯函数
 */
export const mathUtils = {
  /**
   * 计算指数退避时间
   * @param attempt - 尝试次数
   * @param baseDelay - 基本延迟时间（毫秒）
   * @param maxDelay - 最大延迟时间（毫秒）
   * @returns 计算后的延迟时间（毫秒）
   */
  calculateExponentialBackoff: (
    attempt: number,
    baseDelay: number,
    maxDelay: number
  ): number => {
    const delay = baseDelay * Math.pow(2, attempt);
    return Math.min(delay, maxDelay);
  },

  /**
   * 计算上传进度百分比
   * @param uploaded - 已上传大小
   * @param total - 总大小
   * @returns 进度百分比（0-100）
   */
  calculateProgress: (uploaded: number, total: number): number => {
    if (total <= 0) return 0;
    return Math.min(Math.round((uploaded / total) * 100), 100);
  },

  /**
   * 计算最佳分片大小
   * @param fileSize - 文件大小（字节）
   * @param minChunk - 最小分片大小（字节）
   * @param maxChunk - 最大分片大小（字节）
   * @param targetChunks - 目标分片数量
   * @returns 计算后的分片大小（字节）
   */
  calculateOptimalChunkSize: (
    fileSize: number,
    minChunk: number,
    maxChunk: number,
    targetChunks = 100
  ): number => {
    // 计算理想分片大小
    const idealChunkSize = Math.ceil(fileSize / targetChunks);

    // 确保在最小和最大分片大小之间
    return Math.min(Math.max(idealChunkSize, minChunk), maxChunk);
  },

  /**
   * 估计剩余上传时间
   * @param uploadSpeed - 当前上传速度（字节/秒）
   * @param remaining - 剩余字节数
   * @returns 剩余时间（秒）
   */
  estimateRemainingTime: (uploadSpeed: number, remaining: number): number => {
    if (uploadSpeed <= 0) return Infinity;
    return Math.ceil(remaining / uploadSpeed);
  },
};

/**
 * 对象处理纯函数
 */
export const objectUtils = {
  /**
   * 深度冻结对象，使其不可变
   * @param obj - 需要冻结的对象
   * @returns 冻结后的对象
   */
  deepFreeze: <T extends object>(obj: T): Readonly<T> => {
    // 获取对象的属性名
    const propNames = Object.getOwnPropertyNames(obj);

    // 在冻结自身之前冻结属性
    for (const name of propNames) {
      const value = (obj as any)[name];

      if (value && typeof value === 'object') {
        objectUtils.deepFreeze(value);
      }
    }

    return Object.freeze(obj);
  },

  /**
   * 深度合并对象
   * @param target - 目标对象
   * @param source - 源对象
   * @returns 合并后的新对象
   */
  deepMerge: <T>(target: T, source: Partial<T>): T => {
    // 创建目标对象的克隆
    const output = { ...target };

    if (objectUtils.isObject(target) && objectUtils.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (objectUtils.isObject((source as any)[key])) {
          if (!(key in target)) {
            (output as any)[key] = (source as any)[key];
          } else {
            (output as any)[key] = objectUtils.deepMerge(
              (target as any)[key],
              (source as any)[key]
            );
          }
        } else {
          (output as any)[key] = (source as any)[key];
        }
      });
    }

    return output;
  },

  /**
   * 检查值是否为对象
   * @param item - 需要检查的值
   * @returns 是否为对象
   */
  isObject: (item: any): boolean => {
    return item && typeof item === 'object' && !Array.isArray(item);
  },

  /**
   * 从对象中提取指定属性
   * @param obj - 源对象
   * @param keys - 需要提取的属性名数组
   * @returns 提取的属性对象
   */
  pick: <T extends object, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Pick<T, K> => {
    return keys.reduce(
      (result, key) => {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = obj[key];
        }
        return result;
      },
      {} as Pick<T, K>
    );
  },
};
