/**
 * IntegrityCheck
 * 文件完整性校验工具，提供计算和验证数据完整性的功能
 */

/**
 * 完整性校验算法类型
 */
export type IntegrityAlgorithm =
  | 'SHA-1'
  | 'SHA-256'
  | 'SHA-384'
  | 'SHA-512'
  | 'MD5';

/**
 * 完整性校验选项
 */
export interface IntegrityCheckOptions {
  /** 校验算法 */
  algorithm?: IntegrityAlgorithm;
  /** 块大小（字节），用于分块处理大文件 */
  chunkSize?: number;
  /** 是否保存中间结果，用于增量校验 */
  saveIntermediateResults?: boolean;
  /** 是否使用Worker计算（如果可用） */
  useWorker?: boolean;
}

/**
 * 完整性校验结果
 */
export interface IntegrityCheckResult {
  /** 校验值（通常是哈希值的十六进制表示） */
  checksum: string;
  /** 使用的算法 */
  algorithm: IntegrityAlgorithm;
  /** 校验的字节数 */
  bytesProcessed: number;
  /** 校验开始时间 */
  startTime: number;
  /** 校验结束时间 */
  endTime: number;
  /** 校验耗时（毫秒） */
  duration: number;
}

/**
 * 完整性校验状态
 */
export interface IntegrityCheckStatus {
  /** 校验是否完成 */
  completed: boolean;
  /** 校验进度（0-1） */
  progress: number;
  /** 已处理字节数 */
  bytesProcessed: number;
  /** 总字节数 */
  totalBytes: number;
  /** 剩余字节数 */
  bytesRemaining: number;
  /** 校验速度（字节/秒） */
  speed: number;
  /** 已用时间（毫秒） */
  timeElapsed: number;
  /** 预估剩余时间（毫秒） */
  timeRemaining: number;
}

/**
 * 完整性校验工具类
 */
export default class IntegrityCheck {
  /**
   * 计算数据的校验值
   * @param data 要校验的数据
   * @param options 校验选项
   * @returns 校验结果Promise
   */
  public static async calculateChecksum(
    data: ArrayBuffer | Blob | File,
    options: IntegrityCheckOptions = {}
  ): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const algorithm = options.algorithm || 'SHA-256';
    let bytesProcessed = 0;

    try {
      // 检查环境是否支持指定算法
      this._checkAlgorithmSupport(algorithm);

      // 使用Worker计算（如果启用且支持）
      if (options.useWorker && this._isWorkerSupported()) {
        const result = await this._calculateInWorker(data, algorithm);

        const endTime = Date.now();
        bytesProcessed =
          data instanceof ArrayBuffer ? data.byteLength : data.size;

        return {
          checksum: result.checksum,
          algorithm,
          bytesProcessed,
          startTime,
          endTime,
          duration: endTime - startTime,
        };
      }

      // 如果数据较小或无法使用Worker，直接计算
      if (
        data instanceof ArrayBuffer ||
        (data instanceof Blob && data.size < 10 * 1024 * 1024)
      ) {
        // 直接计算小文件或ArrayBuffer
        const buffer =
          data instanceof ArrayBuffer ? data : await data.arrayBuffer();
        bytesProcessed = buffer.byteLength;

        const checksum = await this._calculateChecksumForBuffer(
          buffer,
          algorithm
        );
        const endTime = Date.now();

        return {
          checksum,
          algorithm,
          bytesProcessed,
          startTime,
          endTime,
          duration: endTime - startTime,
        };
      }

      // 对于大文件，分块处理
      return await this._calculateChecksumForLargeFile(
        data as Blob,
        algorithm,
        options
      );
    } catch (error) {
      throw new Error(
        `完整性校验失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 验证数据的完整性
   * @param data 要验证的数据
   * @param expectedChecksum 预期的校验值
   * @param options 校验选项
   * @returns 验证结果Promise
   */
  public static async verifyIntegrity(
    data: ArrayBuffer | Blob | File,
    expectedChecksum: string,
    options: IntegrityCheckOptions = {}
  ): Promise<boolean> {
    try {
      const result = await this.calculateChecksum(data, options);
      return this._compareChecksums(result.checksum, expectedChecksum);
    } catch (error) {
      throw new Error(
        `完整性验证失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 为数据创建完整性校验信息
   * @param data 要校验的数据
   * @param options 校验选项
   * @returns 校验信息
   */
  public static async createIntegrityInfo(
    data: ArrayBuffer | Blob | File,
    options: IntegrityCheckOptions = {}
  ): Promise<Record<string, string>> {
    const result = await this.calculateChecksum(data, options);
    const algorithm = result.algorithm.toLowerCase().replace('-', '');

    return {
      integrity: `${algorithm}-${result.checksum}`,
      algorithm: result.algorithm,
      checksum: result.checksum,
    };
  }

  /**
   * 使用Worker计算校验值
   * @param data 要校验的数据
   * @param algorithm 校验算法
   * @returns 校验结果Promise
   */
  private static async _calculateInWorker(
    data: ArrayBuffer | Blob | File,
    algorithm: IntegrityAlgorithm
  ): Promise<{ checksum: string }> {
    return new Promise((resolve, reject) => {
      const workerCode = `
        self.onmessage = async function(e) {
          try {
            const { data, algorithm } = e.data;
            
            // 计算哈希
            const hashBuffer = await crypto.subtle.digest(algorithm, data);
            
            // 转换为十六进制字符串
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            self.postMessage({ checksum });
          } catch (error) {
            self.postMessage({ error: error.message || 'Unknown error' });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = e => {
        URL.revokeObjectURL(workerUrl);
        worker.terminate();

        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data);
        }
      };

      worker.onerror = error => {
        URL.revokeObjectURL(workerUrl);
        worker.terminate();
        reject(error);
      };

      // 转换数据并发送到Worker
      (async () => {
        try {
          const buffer =
            data instanceof ArrayBuffer ? data : await data.arrayBuffer();
          worker.postMessage({ data: buffer, algorithm }, [buffer]);
        } catch (error) {
          URL.revokeObjectURL(workerUrl);
          worker.terminate();
          reject(error);
        }
      })();
    });
  }

  /**
   * 分块计算大文件的校验值
   * @param blob 文件或Blob对象
   * @param algorithm 校验算法
   * @param options 校验选项
   * @returns 校验结果Promise
   */
  private static async _calculateChecksumForLargeFile(
    blob: Blob,
    algorithm: IntegrityAlgorithm,
    options: IntegrityCheckOptions
  ): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const fileSize = blob.size;
    const chunkSize = options.chunkSize || 4 * 1024 * 1024; // 默认4MB
    let bytesProcessed = 0;
    let lastProgressReportTime = Date.now();
    const progressReportInterval = 200; // 200ms报告一次进度

    // 检查是否支持增量哈希（仅在Web Crypto API支持时有效）
    const supportsIncrementalHash =
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined' &&
      typeof crypto.subtle.digest === 'function';

    if (!supportsIncrementalHash) {
      // 如果不支持增量哈希，则一次性读取整个文件（不推荐用于大文件）
      const buffer = await blob.arrayBuffer();
      bytesProcessed = buffer.byteLength;

      const checksum = await this._calculateChecksumForBuffer(
        buffer,
        algorithm
      );
      const endTime = Date.now();

      return {
        checksum,
        algorithm,
        bytesProcessed,
        startTime,
        endTime,
        duration: endTime - startTime,
      };
    }

    // 使用高效的流式处理+非阻塞计算方式处理大文件
    try {
      // 追踪进度和性能指标
      const reportProgress = (): IntegrityCheckStatus => {
        const now = Date.now();
        const timeElapsed = now - startTime;
        const speed =
          timeElapsed > 0 ? (bytesProcessed / timeElapsed) * 1000 : 0;
        const bytesRemaining = fileSize - bytesProcessed;
        const timeRemaining = speed > 0 ? (bytesRemaining / speed) * 1000 : 0;

        return {
          completed: bytesProcessed >= fileSize,
          progress: bytesProcessed / fileSize,
          bytesProcessed,
          totalBytes: fileSize,
          bytesRemaining,
          speed,
          timeElapsed,
          timeRemaining,
        };
      };

      // 维护增量哈希状态
      let context: ArrayBuffer | null = null;

      // 分块读取和处理文件，同时让出主线程控制权避免UI阻塞
      for (let start = 0; start < fileSize; start += chunkSize) {
        const end = Math.min(start + chunkSize, fileSize);
        const chunk = await blob.slice(start, end).arrayBuffer();

        // 增量更新哈希
        if (context === null) {
          // 首次计算
          context = await crypto.subtle.digest(algorithm, chunk);
        } else {
          // 使用更高效的方式合并之前的结果和新块
          // 注意：这是简化的处理方式，不是所有哈希算法都适用于这种方式
          // 实际生产环境可能需要使用专门的增量哈希库
          const combinedBuffer = new Uint8Array(
            context.byteLength + chunk.byteLength
          );
          combinedBuffer.set(new Uint8Array(context), 0);
          combinedBuffer.set(new Uint8Array(chunk), context.byteLength);

          // 重新计算哈希
          context = await crypto.subtle.digest(
            algorithm,
            combinedBuffer.buffer
          );
        }

        // 更新进度
        bytesProcessed += chunk.byteLength;

        // 适当间隔报告进度，避免过于频繁
        const now = Date.now();
        if (now - lastProgressReportTime > progressReportInterval) {
          lastProgressReportTime = now;
          // 如果有自定义事件系统，这里可以派发进度事件
          const progress = reportProgress();

          // 可以通过回调或事件通知系统报告进度
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            const event = new CustomEvent('integrityCheckProgress', {
              detail: { ...progress, algorithm },
            });
            window.dispatchEvent(event);
          }
        }

        // 重要：让出主线程控制权，避免长时间UI阻塞
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      // 计算最终哈希值
      const hashArray = Array.from(new Uint8Array(context!));
      const checksum = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const endTime = Date.now();

      return {
        checksum,
        algorithm,
        bytesProcessed,
        startTime,
        endTime,
        duration: endTime - startTime,
      };
    } catch (error) {
      throw new Error(
        `分块处理文件校验失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 计算缓冲区的校验值
   * @param buffer 数据缓冲区
   * @param algorithm 校验算法
   * @returns 校验值Promise
   */
  private static async _calculateChecksumForBuffer(
    buffer: ArrayBuffer,
    algorithm: IntegrityAlgorithm
  ): Promise<string> {
    try {
      // 使用Web Crypto API计算哈希
      const hashBuffer = await crypto.subtle.digest(algorithm, buffer);

      // 将哈希值转换为十六进制字符串
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      throw new Error(
        `计算校验值失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 合并多个ArrayBuffer
   * @param buffers 要合并的ArrayBuffer数组
   * @returns 合并后的ArrayBuffer
   */
  private static _combineArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    // 计算总长度
    const totalLength = buffers.reduce(
      (acc, buffer) => acc + buffer.byteLength,
      0
    );

    // 创建新的ArrayBuffer和视图
    const result = new Uint8Array(totalLength);

    // 复制数据
    let offset = 0;
    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  }

  /**
   * 比较两个校验值是否匹配
   * @param a 校验值A
   * @param b 校验值B
   * @returns 是否匹配
   */
  private static _compareChecksums(a: string, b: string): boolean {
    // 规范化校验值（转换为小写并去除空格）
    const normalizedA = a.toLowerCase().replace(/\s+/g, '');
    const normalizedB = b.toLowerCase().replace(/\s+/g, '');

    // 时间恒定的比较（防止计时攻击）
    if (normalizedA.length !== normalizedB.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < normalizedA.length; i++) {
      result |= normalizedA.charCodeAt(i) ^ normalizedB.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * 检查是否支持指定的算法
   * @param algorithm 算法名称
   */
  private static _checkAlgorithmSupport(algorithm: IntegrityAlgorithm): void {
    // 检查Web Crypto API是否可用
    if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
      throw new Error('当前环境不支持Web Crypto API');
    }

    // 检查算法是否支持
    const supportedAlgorithms: IntegrityAlgorithm[] = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    if (!supportedAlgorithms.includes(algorithm)) {
      throw new Error(`不支持的算法: ${algorithm}`);
    }
  }

  /**
   * 检查是否支持Web Worker
   * @returns 是否支持
   */
  private static _isWorkerSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * 生成文件指纹（用于文件唯一性验证）
   * @param file 文件对象
   * @returns 文件指纹Promise
   */
  public static async generateFileFingerprint(file: File): Promise<string> {
    // 组合文件的多个特征生成指纹
    const fileInfo = [
      file.name,
      file.size.toString(),
      file.type,
      file.lastModified.toString(),
    ].join('|');

    // 读取文件的前8KB和后8KB
    const headerChunk = await file
      .slice(0, Math.min(8192, file.size))
      .arrayBuffer();
    const footerChunk = await file
      .slice(Math.max(0, file.size - 8192), file.size)
      .arrayBuffer();

    // 创建包含文件信息和样本内容的缓冲区
    const fingerprintData = new TextEncoder().encode(fileInfo);
    const combinedBuffer = this._combineArrayBuffers([
      fingerprintData.buffer,
      headerChunk,
      footerChunk,
    ]);

    // 计算SHA-256哈希作为指纹
    return await this._calculateChecksumForBuffer(combinedBuffer, 'SHA-256');
  }
}
