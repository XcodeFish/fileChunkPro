/**
 * HashGenerator - 哈希生成器
 *
 * 用于生成文件和数据的哈希值
 */

/**
 * 哈希生成器选项
 */
export interface HashGeneratorOptions {
  /** 使用简单哈希而非crypto API（兼容性更好） */
  useSimpleHash?: boolean;
}

/**
 * 哈希生成器
 */
export class HashGenerator {
  private options: Required<HashGeneratorOptions>;

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options: HashGeneratorOptions = {}) {
    this.options = {
      useSimpleHash:
        options.useSimpleHash !== undefined ? options.useSimpleHash : true,
    };
  }

  /**
   * 为文件生成哈希值
   * @param file 文件对象
   * @param algorithm 哈希算法（仅在支持SubtleCrypto时有效）
   */
  public async generateFileHash(
    file: File,
    algorithm: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256'
  ): Promise<string> {
    // 对小文件直接计算哈希
    if (file.size < 50 * 1024 * 1024) {
      return this.hashFile(file, algorithm);
    }

    // 对大文件计算采样哈希
    return this.generateSampledFileHash(file, algorithm);
  }

  /**
   * 计算文件的哈希值
   * @param file 文件对象
   * @param algorithm 哈希算法
   */
  private async hashFile(
    file: File,
    algorithm: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
  ): Promise<string> {
    // 使用简单哈希或环境不支持SubtleCrypto时
    if (this.options.useSimpleHash || !this.isCryptoAvailable()) {
      // 创建基于文件属性的简单哈希，用于标识符
      const fileInfo = `${file.name}_${file.size}_${file.lastModified}`;
      return this.generateSimpleHash(fileInfo);
    }

    // 使用SubtleCrypto计算完整哈希
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
      return this.bufferToHex(hashBuffer);
    } catch (error) {
      // 失败时回退到简单哈希
      const fileInfo = `${file.name}_${file.size}_${file.lastModified}`;
      return this.generateSimpleHash(fileInfo);
    }
  }

  /**
   * 计算大文件的采样哈希
   * @param file 文件对象
   * @param algorithm 哈希算法
   */
  private async generateSampledFileHash(
    file: File,
    algorithm: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
  ): Promise<string> {
    // 如果使用简单哈希或环境不支持SubtleCrypto
    if (this.options.useSimpleHash || !this.isCryptoAvailable()) {
      const fileInfo = `${file.name}_${file.size}_${file.lastModified}`;
      return this.generateSimpleHash(fileInfo);
    }

    try {
      // 从文件的开始、中间和结束部分各取一块样本
      const chunkSize = 1024 * 1024; // 1MB
      const chunks: ArrayBuffer[] = [];

      // 文件开头
      chunks.push(await this.readFileChunk(file, 0, chunkSize));

      // 文件中间
      if (file.size > chunkSize) {
        const middleOffset =
          Math.floor(file.size / 2) - Math.floor(chunkSize / 2);
        chunks.push(await this.readFileChunk(file, middleOffset, chunkSize));
      }

      // 文件结尾
      if (file.size > chunkSize * 2) {
        const endOffset = file.size - chunkSize;
        chunks.push(await this.readFileChunk(file, endOffset, chunkSize));
      }

      // 合并样本数据
      const sampledData = await this.concatArrayBuffers(chunks);

      // 添加文件元数据
      const metadataBuffer = new TextEncoder().encode(
        `${file.name}_${file.size}_${file.lastModified}`
      ).buffer;
      const finalBuffer = await this.concatArrayBuffers([
        sampledData,
        metadataBuffer,
      ]);

      // 计算哈希
      const hashBuffer = await crypto.subtle.digest(algorithm, finalBuffer);
      return this.bufferToHex(hashBuffer);
    } catch (error) {
      // 失败时回退到简单哈希
      const fileInfo = `${file.name}_${file.size}_${file.lastModified}`;
      return this.generateSimpleHash(fileInfo);
    }
  }

  /**
   * 读取文件块
   * @param file 文件对象
   * @param offset 起始位置
   * @param size 读取大小
   */
  private async readFileChunk(
    file: File,
    offset: number,
    size: number
  ): Promise<ArrayBuffer> {
    const slice = file.slice(offset, offset + size);
    return await slice.arrayBuffer();
  }

  /**
   * 合并ArrayBuffer数组
   * @param buffers ArrayBuffer数组
   */
  private async concatArrayBuffers(
    buffers: ArrayBuffer[]
  ): Promise<ArrayBuffer> {
    // 计算总长度
    const totalLength = buffers.reduce(
      (acc, buffer) => acc + buffer.byteLength,
      0
    );

    // 创建合并后的ArrayBuffer
    const result = new Uint8Array(totalLength);

    // 合并数据
    let offset = 0;
    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  }

  /**
   * 生成简单哈希值（用于标识符，非加密用途）
   * @param data 输入字符串
   */
  public async generateSimpleHash(data: string): Promise<string> {
    // 简单的字符串哈希函数
    let hash = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }

    // 转为16进制并补足8位
    const hashHex = (hash >>> 0).toString(16).padStart(8, '0');

    // 加入时间戳，确保唯一性
    const timestamp = Date.now().toString(16).padStart(12, '0');

    // 随机数，增加唯一性
    const random = Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');

    return `${hashHex}${timestamp}${random}`;
  }

  /**
   * 检查环境是否支持SubtleCrypto
   */
  private isCryptoAvailable(): boolean {
    return (
      typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
    );
  }

  /**
   * 将ArrayBuffer转为十六进制字符串
   * @param buffer ArrayBuffer对象
   */
  private bufferToHex(buffer: ArrayBuffer): string {
    const arr = Array.from(new Uint8Array(buffer));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

export default HashGenerator;
