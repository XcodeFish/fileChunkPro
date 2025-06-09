/**
 * HashUtils - 哈希计算工具类
 * 提供各种哈希算法实现和哈希计算优化功能
 */

/**
 * MD5 算法实现
 * 由于 Web Crypto API 不支持 MD5，这里提供纯 JavaScript 实现
 */
export class MD5 {
  private static readonly S11 = 7;
  private static readonly S12 = 12;
  private static readonly S13 = 17;
  private static readonly S14 = 22;
  private static readonly S21 = 5;
  private static readonly S22 = 9;
  private static readonly S23 = 14;
  private static readonly S24 = 20;
  private static readonly S31 = 4;
  private static readonly S32 = 11;
  private static readonly S33 = 16;
  private static readonly S34 = 23;
  private static readonly S41 = 6;
  private static readonly S42 = 10;
  private static readonly S43 = 15;
  private static readonly S44 = 21;

  private state: Uint32Array;
  private count: Uint32Array;
  private buffer: Uint8Array;
  private digest: Uint8Array | null;

  constructor() {
    this.state = new Uint32Array(4);
    this.count = new Uint32Array(2);
    this.buffer = new Uint8Array(64);
    this.digest = null;
    this.init();
  }

  /**
   * 初始化MD5上下文
   */
  private init(): void {
    this.count[0] = 0;
    this.count[1] = 0;
    this.state[0] = 0x67452301;
    this.state[1] = 0xefcdab89;
    this.state[2] = 0x98badcfe;
    this.state[3] = 0x10325476;
    this.digest = null;
  }

  /**
   * 更新MD5上下文
   * @param input 输入数据
   */
  update(input: ArrayBuffer | Uint8Array): void {
    let inputArray: Uint8Array;
    if (input instanceof ArrayBuffer) {
      inputArray = new Uint8Array(input);
    } else {
      inputArray = input;
    }

    const inputLen = inputArray.length;
    let index = (this.count[0] >>> 3) & 0x3f;
    let i = 0;

    // 更新位长度
    const lengthBefore = this.count[0];
    this.count[0] = (this.count[0] + (inputLen << 3)) >>> 0;
    if (this.count[0] < lengthBefore) {
      this.count[1] = (this.count[1] + 1) >>> 0;
    }
    this.count[1] = (this.count[1] + (inputLen >>> 29)) >>> 0;

    const partLen = 64 - index;
    if (inputLen >= partLen) {
      this.buffer.set(inputArray.subarray(0, partLen), index);
      this.transform(this.buffer);

      for (i = partLen; i + 63 < inputLen; i += 64) {
        this.transform(inputArray.subarray(i, i + 64));
      }
      index = 0;
    } else {
      i = 0;
    }

    // 缓冲剩余输入
    this.buffer.set(inputArray.subarray(i, inputLen), index);
  }

  /**
   * 完成MD5计算，返回摘要
   */
  finalize(): Uint8Array {
    if (this.digest !== null) {
      return this.digest;
    }

    const padding = new Uint8Array(64);
    padding[0] = 0x80;

    // 保存位长度
    const lengthLow = this.count[0] >>> 0;
    const lengthHigh = this.count[1] >>> 0;

    const index = (this.count[0] >>> 3) & 0x3f;
    const padLen = index < 56 ? 56 - index : 120 - index;

    // 填充
    this.update(padding.subarray(0, padLen));

    // 附加长度
    const bits = new Uint8Array(8);
    for (let i = 0; i < 4; i++) {
      bits[i] = (lengthLow >>> (i * 8)) & 0xff;
    }
    for (let i = 0; i < 4; i++) {
      bits[i + 4] = (lengthHigh >>> (i * 8)) & 0xff;
    }
    this.update(bits);

    // 计算结果
    this.digest = new Uint8Array(16);
    let n = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        this.digest[n++] = (this.state[i] >>> (j * 8)) & 0xff;
      }
    }

    return this.digest;
  }

  /**
   * 转换块
   * @param block 数据块
   */
  private transform(block: Uint8Array): void {
    let a = this.state[0],
      b = this.state[1],
      c = this.state[2],
      d = this.state[3];
    const x = new Uint32Array(16);

    // 将字节转换为字
    for (let i = 0, j = 0; i < 16; i++, j += 4) {
      x[i] =
        block[j] |
        (block[j + 1] << 8) |
        (block[j + 2] << 16) |
        (block[j + 3] << 24);
    }

    // 第1轮
    a = this.ff(a, b, c, d, x[0], MD5.S11, 0xd76aa478);
    d = this.ff(d, a, b, c, x[1], MD5.S12, 0xe8c7b756);
    c = this.ff(c, d, a, b, x[2], MD5.S13, 0x242070db);
    b = this.ff(b, c, d, a, x[3], MD5.S14, 0xc1bdceee);
    a = this.ff(a, b, c, d, x[4], MD5.S11, 0xf57c0faf);
    d = this.ff(d, a, b, c, x[5], MD5.S12, 0x4787c62a);
    c = this.ff(c, d, a, b, x[6], MD5.S13, 0xa8304613);
    b = this.ff(b, c, d, a, x[7], MD5.S14, 0xfd469501);
    a = this.ff(a, b, c, d, x[8], MD5.S11, 0x698098d8);
    d = this.ff(d, a, b, c, x[9], MD5.S12, 0x8b44f7af);
    c = this.ff(c, d, a, b, x[10], MD5.S13, 0xffff5bb1);
    b = this.ff(b, c, d, a, x[11], MD5.S14, 0x895cd7be);
    a = this.ff(a, b, c, d, x[12], MD5.S11, 0x6b901122);
    d = this.ff(d, a, b, c, x[13], MD5.S12, 0xfd987193);
    c = this.ff(c, d, a, b, x[14], MD5.S13, 0xa679438e);
    b = this.ff(b, c, d, a, x[15], MD5.S14, 0x49b40821);

    // 第2轮
    a = this.gg(a, b, c, d, x[1], MD5.S21, 0xf61e2562);
    d = this.gg(d, a, b, c, x[6], MD5.S22, 0xc040b340);
    c = this.gg(c, d, a, b, x[11], MD5.S23, 0x265e5a51);
    b = this.gg(b, c, d, a, x[0], MD5.S24, 0xe9b6c7aa);
    a = this.gg(a, b, c, d, x[5], MD5.S21, 0xd62f105d);
    d = this.gg(d, a, b, c, x[10], MD5.S22, 0x2441453);
    c = this.gg(c, d, a, b, x[15], MD5.S23, 0xd8a1e681);
    b = this.gg(b, c, d, a, x[4], MD5.S24, 0xe7d3fbc8);
    a = this.gg(a, b, c, d, x[9], MD5.S21, 0x21e1cde6);
    d = this.gg(d, a, b, c, x[14], MD5.S22, 0xc33707d6);
    c = this.gg(c, d, a, b, x[3], MD5.S23, 0xf4d50d87);
    b = this.gg(b, c, d, a, x[8], MD5.S24, 0x455a14ed);
    a = this.gg(a, b, c, d, x[13], MD5.S21, 0xa9e3e905);
    d = this.gg(d, a, b, c, x[2], MD5.S22, 0xfcefa3f8);
    c = this.gg(c, d, a, b, x[7], MD5.S23, 0x676f02d9);
    b = this.gg(b, c, d, a, x[12], MD5.S24, 0x8d2a4c8a);

    // 第3轮
    a = this.hh(a, b, c, d, x[5], MD5.S31, 0xfffa3942);
    d = this.hh(d, a, b, c, x[8], MD5.S32, 0x8771f681);
    c = this.hh(c, d, a, b, x[11], MD5.S33, 0x6d9d6122);
    b = this.hh(b, c, d, a, x[14], MD5.S34, 0xfde5380c);
    a = this.hh(a, b, c, d, x[1], MD5.S31, 0xa4beea44);
    d = this.hh(d, a, b, c, x[4], MD5.S32, 0x4bdecfa9);
    c = this.hh(c, d, a, b, x[7], MD5.S33, 0xf6bb4b60);
    b = this.hh(b, c, d, a, x[10], MD5.S34, 0xbebfbc70);
    a = this.hh(a, b, c, d, x[13], MD5.S31, 0x289b7ec6);
    d = this.hh(d, a, b, c, x[0], MD5.S32, 0xeaa127fa);
    c = this.hh(c, d, a, b, x[3], MD5.S33, 0xd4ef3085);
    b = this.hh(b, c, d, a, x[6], MD5.S34, 0x4881d05);
    a = this.hh(a, b, c, d, x[9], MD5.S31, 0xd9d4d039);
    d = this.hh(d, a, b, c, x[12], MD5.S32, 0xe6db99e5);
    c = this.hh(c, d, a, b, x[15], MD5.S33, 0x1fa27cf8);
    b = this.hh(b, c, d, a, x[2], MD5.S34, 0xc4ac5665);

    // 第4轮
    a = this.ii(a, b, c, d, x[0], MD5.S41, 0xf4292244);
    d = this.ii(d, a, b, c, x[7], MD5.S42, 0x432aff97);
    c = this.ii(c, d, a, b, x[14], MD5.S43, 0xab9423a7);
    b = this.ii(b, c, d, a, x[5], MD5.S44, 0xfc93a039);
    a = this.ii(a, b, c, d, x[12], MD5.S41, 0x655b59c3);
    d = this.ii(d, a, b, c, x[3], MD5.S42, 0x8f0ccc92);
    c = this.ii(c, d, a, b, x[10], MD5.S43, 0xffeff47d);
    b = this.ii(b, c, d, a, x[1], MD5.S44, 0x85845dd1);
    a = this.ii(a, b, c, d, x[8], MD5.S41, 0x6fa87e4f);
    d = this.ii(d, a, b, c, x[15], MD5.S42, 0xfe2ce6e0);
    c = this.ii(c, d, a, b, x[6], MD5.S43, 0xa3014314);
    b = this.ii(b, c, d, a, x[13], MD5.S44, 0x4e0811a1);
    a = this.ii(a, b, c, d, x[4], MD5.S41, 0xf7537e82);
    d = this.ii(d, a, b, c, x[11], MD5.S42, 0xbd3af235);
    c = this.ii(c, d, a, b, x[2], MD5.S43, 0x2ad7d2bb);
    b = this.ii(b, c, d, a, x[9], MD5.S44, 0xeb86d391);

    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
  }

  // 辅助函数
  private ff(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = (a + ((b & c) | (~b & d)) + x + ac) >>> 0;
    a = ((a << s) | (a >>> (32 - s))) >>> 0;
    return (a + b) >>> 0;
  }

  private gg(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = (a + ((b & d) | (c & ~d)) + x + ac) >>> 0;
    a = ((a << s) | (a >>> (32 - s))) >>> 0;
    return (a + b) >>> 0;
  }

  private hh(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = (a + (b ^ c ^ d) + x + ac) >>> 0;
    a = ((a << s) | (a >>> (32 - s))) >>> 0;
    return (a + b) >>> 0;
  }

  private ii(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = (a + (c ^ (b | ~d)) + x + ac) >>> 0;
    a = ((a << s) | (a >>> (32 - s))) >>> 0;
    return (a + b) >>> 0;
  }
}

/**
 * 哈希计算类
 */
export class HashCalculator {
  /**
   * 计算数据的MD5哈希值
   * @param data 要计算哈希的数据
   * @returns MD5哈希值（16进制字符串）
   */
  static calculateMD5(data: ArrayBuffer | Uint8Array): string {
    const md5 = new MD5();
    md5.update(data);
    const digest = md5.finalize();
    return this.arrayBufferToHex(digest.buffer);
  }

  /**
   * 使用Web Crypto API计算SHA系列哈希
   * @param data 要计算哈希的数据
   * @param algorithm 哈希算法 ('SHA-1', 'SHA-256', 'SHA-384', 'SHA-512')
   * @returns 哈希值（16进制字符串）
   */
  static async calculateSHA(
    data: ArrayBuffer | Uint8Array,
    algorithm: string
  ): Promise<string> {
    if (crypto && crypto.subtle) {
      const dataBuffer = data instanceof ArrayBuffer ? data : data.buffer;
      const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
      return this.arrayBufferToHex(hashBuffer);
    }
    throw new Error(`不支持的哈希算法: ${algorithm}`);
  }

  /**
   * 根据指定算法计算哈希值
   * @param data 要计算哈希的数据
   * @param algorithm 哈希算法 ('md5', 'sha1', 'sha256', 'sha384', 'sha512')
   * @returns 哈希值（16进制字符串）
   */
  static async calculateHash(
    data: ArrayBuffer | Uint8Array,
    algorithm: string
  ): Promise<string> {
    switch (algorithm.toLowerCase()) {
      case 'md5':
        return this.calculateMD5(data);
      case 'sha1':
        return await this.calculateSHA(data, 'SHA-1');
      case 'sha256':
        return await this.calculateSHA(data, 'SHA-256');
      case 'sha384':
        return await this.calculateSHA(data, 'SHA-384');
      case 'sha512':
        return await this.calculateSHA(data, 'SHA-512');
      default:
        throw new Error(`不支持的哈希算法: ${algorithm}`);
    }
  }

  /**
   * 计算文件的快速哈希值
   * @param file 文件对象
   * @param algorithm 哈希算法
   * @param sampleSize 采样大小（字节）
   * @returns 哈希值
   */
  static async calculateQuickFileHash(
    file: File,
    algorithm: string,
    sampleSize: number
  ): Promise<string> {
    // 确保采样大小合理
    sampleSize = Math.min(sampleSize, Math.floor(file.size / 2));

    // 读取文件头部
    const headerChunk = await this.readFileSlice(file, 0, sampleSize);

    // 读取文件尾部
    let footerChunk;
    if (file.size > sampleSize * 2) {
      footerChunk = await this.readFileSlice(
        file,
        file.size - sampleSize,
        file.size
      );
    } else {
      footerChunk = new ArrayBuffer(0);
    }

    // 合并头尾并计算哈希
    const combinedBuffer = this.concatenateArrayBuffers(
      headerChunk,
      footerChunk
    );
    const hash = await this.calculateHash(combinedBuffer, algorithm);

    // 添加文件大小以增加唯一性
    return `${hash}_${file.size}`;
  }

  /**
   * 流式计算大文件哈希值
   * @param file 文件对象
   * @param algorithm 哈希算法
   * @param chunkSize 每次处理的块大小
   * @param onProgress 进度回调
   * @returns 哈希值
   */
  static async calculateLargeFileHash(
    file: File,
    algorithm: string,
    chunkSize: number = 2 * 1024 * 1024,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    let hash;

    if (algorithm.toLowerCase() === 'md5') {
      const md5 = new MD5();
      let offset = 0;

      while (offset < file.size) {
        const slice = await this.readFileSlice(
          file,
          offset,
          Math.min(offset + chunkSize, file.size)
        );
        md5.update(slice);

        offset += chunkSize;

        if (onProgress) {
          onProgress(Math.min(100, Math.floor((offset / file.size) * 100)));
        }
      }

      const digest = md5.finalize();
      hash = this.arrayBufferToHex(digest.buffer);
    } else if (crypto && crypto.subtle) {
      // 使用标准Web Crypto API时，必须读取整个文件
      // 这里仍然分块读取，减少内存压力，但需要合并后再计算
      const buffer = await file.arrayBuffer();

      let hashAlgorithm: AlgorithmIdentifier;
      switch (algorithm.toLowerCase()) {
        case 'sha1':
          hashAlgorithm = 'SHA-1';
          break;
        case 'sha256':
          hashAlgorithm = 'SHA-256';
          break;
        case 'sha384':
          hashAlgorithm = 'SHA-384';
          break;
        case 'sha512':
          hashAlgorithm = 'SHA-512';
          break;
        default:
          throw new Error(`不支持的哈希算法: ${algorithm}`);
      }

      const hashBuffer = await crypto.subtle.digest(hashAlgorithm, buffer);
      hash = this.arrayBufferToHex(hashBuffer);
    } else {
      throw new Error(`当前环境不支持计算 ${algorithm} 哈希值`);
    }

    return hash;
  }

  /**
   * 读取文件片段
   * @param file 文件对象
   * @param start 起始位置
   * @param end 结束位置
   * @returns 文件片段的ArrayBuffer
   */
  static async readFileSlice(
    file: File,
    start: number,
    end: number
  ): Promise<ArrayBuffer> {
    const slice = file.slice(start, end);
    return await slice.arrayBuffer();
  }

  /**
   * 合并两个ArrayBuffer
   * @param buffer1 第一个缓冲区
   * @param buffer2 第二个缓冲区
   * @returns 合并后的缓冲区
   */
  static concatenateArrayBuffers(
    buffer1: ArrayBuffer,
    buffer2: ArrayBuffer
  ): ArrayBuffer {
    const result = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    result.set(new Uint8Array(buffer1), 0);
    result.set(new Uint8Array(buffer2), buffer1.byteLength);
    return result.buffer;
  }

  /**
   * 将ArrayBuffer转换为十六进制字符串
   * @param buffer ArrayBuffer数据
   * @returns 十六进制字符串
   */
  static arrayBufferToHex(buffer: ArrayBuffer): string {
    const view = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < view.length; i++) {
      const value = view[i].toString(16);
      hex += value.length === 1 ? '0' + value : value;
    }
    return hex;
  }
}

/**
 * 文件指纹工具类
 */
export class FileFingerprint {
  /**
   * 计算文件指纹
   * @param file 文件对象
   * @param options 计算选项
   * @returns 文件指纹
   */
  static async calculate(
    file: File,
    options: FingerprintOptions = {}
  ): Promise<FingerprintResult> {
    const startTime = Date.now();

    const {
      algorithm = 'md5',
      quick = true,
      sampleSize = 1024 * 1024,
      includeFilename = true,
      includeLastModified = true,
      chunkSize = 2 * 1024 * 1024,
      onProgress,
    } = options;

    let fileHash: string;
    let isQuickHash = false;

    try {
      // 针对大文件或启用快速哈希时使用快速哈希
      if (quick && file.size > 100 * 1024 * 1024) {
        fileHash = await HashCalculator.calculateQuickFileHash(
          file,
          algorithm,
          sampleSize
        );
        isQuickHash = true;
      } else {
        // 为大文件使用分块处理
        fileHash = await HashCalculator.calculateLargeFileHash(
          file,
          algorithm,
          chunkSize,
          onProgress
        );
      }

      // 增强指纹的唯一性
      if (includeFilename) {
        fileHash += `_${encodeURIComponent(file.name)}`;
      }

      if (includeLastModified && file.lastModified) {
        fileHash += `_${file.lastModified}`;
      }

      return {
        hash: fileHash,
        algorithm,
        isQuickHash,
        size: file.size,
        time: Date.now() - startTime,
      };
    } catch (error) {
      // 失败时降级到简单哈希
      const simpleHash = this.generateSimpleHash(file);

      return {
        hash: simpleHash,
        algorithm: 'simple',
        isQuickHash: true,
        size: file.size,
        time: Date.now() - startTime,
        error: error instanceof Error ? error.message : '哈希计算失败',
      };
    }
  }

  /**
   * 生成简单哈希（基于文件基本信息）
   * @param file 文件对象
   * @returns 简单哈希值
   */
  static generateSimpleHash(file: File): string {
    // 使用文件名、大小和最后修改时间生成哈希
    const str = `${file.name}_${file.size}_${file.lastModified}`;
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }

    // 转为16进制字符串并确保唯一性
    return `simple_${hash.toString(16)}_${file.size}`;
  }
}

/**
 * 文件指纹计算选项
 */
export interface FingerprintOptions {
  algorithm?: string; // 哈希算法，默认 'md5'
  quick?: boolean; // 是否使用快速哈希，默认 true
  sampleSize?: number; // 快速哈希采样大小，默认 1MB
  includeFilename?: boolean; // 是否在指纹中包含文件名，默认 true
  includeLastModified?: boolean; // 是否包含最后修改时间，默认 true
  chunkSize?: number; // 分块处理大小，默认 2MB
  onProgress?: (progress: number) => void; // 进度回调
}

/**
 * 文件指纹计算结果
 */
export interface FingerprintResult {
  hash: string; // 哈希值
  algorithm: string; // 使用的算法
  isQuickHash: boolean; // 是否为快速哈希
  size: number; // 文件大小
  time: number; // 计算耗时（毫秒）
  error?: string; // 错误信息（如果有）
}
