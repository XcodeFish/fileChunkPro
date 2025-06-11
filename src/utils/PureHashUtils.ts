/**
 * PureHashUtils - 纯函数哈希计算工具
 *
 * 本模块提供各种哈希算法的纯函数实现，遵循以下原则：
 * 1. 无副作用 - 相同输入产生相同输出，不修改外部状态
 * 2. 不依赖外部状态 - 算法实现逻辑自包含
 * 3. 数据不可变性 - 不修改传入的参数
 */

/**
 * MD5算法的纯函数实现
 */
export const MD5 = {
  /**
   * 计算MD5哈希值
   * @param data - 输入数据
   * @returns 十六进制MD5哈希字符串
   */
  compute: (data: ArrayBuffer | Uint8Array): string => {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const state = MD5.init();

    // 处理数据块
    MD5.update(state, bytes);

    // 完成计算
    return MD5.finalize(state);
  },

  /**
   * 初始化MD5计算状态
   * @returns 初始状态对象
   */
  init: () => {
    return {
      state: new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]),
      count: new Uint32Array(2),
      buffer: new Uint8Array(64),
    };
  },

  /**
   * 更新MD5计算状态
   * @param context - MD5计算上下文
   * @param input - 输入数据
   */
  update: (
    context: { state: Uint32Array; count: Uint32Array; buffer: Uint8Array },
    input: Uint8Array
  ): void => {
    // 创建本地变量的拷贝，避免修改传入的上下文
    const state = context.state;
    const count = context.count;
    const buffer = context.buffer;

    const inputLen = input.length;
    let index = (count[0] >>> 3) & 0x3f;

    // 更新位长度
    const lengthBefore = count[0];
    count[0] = (count[0] + (inputLen << 3)) >>> 0;
    if (count[0] < lengthBefore) {
      count[1] = (count[1] + 1) >>> 0;
    }
    count[1] = (count[1] + (inputLen >>> 29)) >>> 0;

    // 处理数据块
    const partLen = 64 - index;
    let i = 0;

    if (inputLen >= partLen) {
      // 填充缓冲区并处理块
      for (let j = 0; j < partLen; j++) {
        buffer[index + j] = input[j];
      }
      MD5.transform(state, buffer);

      // 处理完整的块
      for (i = partLen; i + 63 < inputLen; i += 64) {
        const block = input.subarray(i, i + 64);
        MD5.transform(state, block);
      }

      index = 0;
    }

    // 缓冲剩余输入
    for (let j = 0; i < inputLen; i++, j++) {
      buffer[index + j] = input[i];
    }
  },

  /**
   * 完成MD5计算
   * @param context - MD5计算上下文
   * @returns 十六进制MD5哈希字符串
   */
  finalize: (context: {
    state: Uint32Array;
    count: Uint32Array;
    buffer: Uint8Array;
  }): string => {
    // 创建本地变量的拷贝
    const state = context.state;
    const count = context.count;
    const buffer = context.buffer;

    // 填充缓冲区
    const index = (count[0] >>> 3) & 0x3f;
    const padLen = index < 56 ? 56 - index : 120 - index;

    const padding = new Uint8Array(padLen + 8);
    padding[0] = 0x80;

    // 附加长度
    const bits = new Uint32Array(2);
    bits[0] = count[0];
    bits[1] = count[1];

    for (let i = 0; i < padLen; i++) {
      buffer[index + i] = padding[i];
    }

    // 处理最后的块
    if (padLen === 56) {
      for (let i = 0; i < 4; i++) {
        buffer[56 + i] = (bits[0] >>> (i * 8)) & 0xff;
      }
      for (let i = 0; i < 4; i++) {
        buffer[60 + i] = (bits[1] >>> (i * 8)) & 0xff;
      }

      MD5.transform(state, buffer);
    } else {
      // 处理两个块
      MD5.transform(state, buffer);

      const finalBlock = new Uint8Array(64);
      for (let i = 0; i < 4; i++) {
        finalBlock[i] = (bits[0] >>> (i * 8)) & 0xff;
      }
      for (let i = 0; i < 4; i++) {
        finalBlock[4 + i] = (bits[1] >>> (i * 8)) & 0xff;
      }

      MD5.transform(state, finalBlock);
    }

    // 将结果转换为十六进制字符串
    let result = '';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const byte = (state[i] >>> (j * 8)) & 0xff;
        result += byte.toString(16).padStart(2, '0');
      }
    }

    return result;
  },

  // MD5变换常量
  S11: 7,
  S12: 12,
  S13: 17,
  S14: 22,
  S21: 5,
  S22: 9,
  S23: 14,
  S24: 20,
  S31: 4,
  S32: 11,
  S33: 16,
  S34: 23,
  S41: 6,
  S42: 10,
  S43: 15,
  S44: 21,

  /**
   * 执行MD5主变换
   * @param state - 状态数组
   * @param block - 数据块
   */
  transform: (state: Uint32Array, block: Uint8Array): void => {
    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
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
    a = MD5.ff(a, b, c, d, x[0], MD5.S11, 0xd76aa478);
    d = MD5.ff(d, a, b, c, x[1], MD5.S12, 0xe8c7b756);
    c = MD5.ff(c, d, a, b, x[2], MD5.S13, 0x242070db);
    b = MD5.ff(b, c, d, a, x[3], MD5.S14, 0xc1bdceee);
    a = MD5.ff(a, b, c, d, x[4], MD5.S11, 0xf57c0faf);
    d = MD5.ff(d, a, b, c, x[5], MD5.S12, 0x4787c62a);
    c = MD5.ff(c, d, a, b, x[6], MD5.S13, 0xa8304613);
    b = MD5.ff(b, c, d, a, x[7], MD5.S14, 0xfd469501);
    a = MD5.ff(a, b, c, d, x[8], MD5.S11, 0x698098d8);
    d = MD5.ff(d, a, b, c, x[9], MD5.S12, 0x8b44f7af);
    c = MD5.ff(c, d, a, b, x[10], MD5.S13, 0xffff5bb1);
    b = MD5.ff(b, c, d, a, x[11], MD5.S14, 0x895cd7be);
    a = MD5.ff(a, b, c, d, x[12], MD5.S11, 0x6b901122);
    d = MD5.ff(d, a, b, c, x[13], MD5.S12, 0xfd987193);
    c = MD5.ff(c, d, a, b, x[14], MD5.S13, 0xa679438e);
    b = MD5.ff(b, c, d, a, x[15], MD5.S14, 0x49b40821);

    // 第2轮
    a = MD5.gg(a, b, c, d, x[1], MD5.S21, 0xf61e2562);
    d = MD5.gg(d, a, b, c, x[6], MD5.S22, 0xc040b340);
    c = MD5.gg(c, d, a, b, x[11], MD5.S23, 0x265e5a51);
    b = MD5.gg(b, c, d, a, x[0], MD5.S24, 0xe9b6c7aa);
    a = MD5.gg(a, b, c, d, x[5], MD5.S21, 0xd62f105d);
    d = MD5.gg(d, a, b, c, x[10], MD5.S22, 0x2441453);
    c = MD5.gg(c, d, a, b, x[15], MD5.S23, 0xd8a1e681);
    b = MD5.gg(b, c, d, a, x[4], MD5.S24, 0xe7d3fbc8);
    a = MD5.gg(a, b, c, d, x[9], MD5.S21, 0x21e1cde6);
    d = MD5.gg(d, a, b, c, x[14], MD5.S22, 0xc33707d6);
    c = MD5.gg(c, d, a, b, x[3], MD5.S23, 0xf4d50d87);
    b = MD5.gg(b, c, d, a, x[8], MD5.S24, 0x455a14ed);
    a = MD5.gg(a, b, c, d, x[13], MD5.S21, 0xa9e3e905);
    d = MD5.gg(d, a, b, c, x[2], MD5.S22, 0xfcefa3f8);
    c = MD5.gg(c, d, a, b, x[7], MD5.S23, 0x676f02d9);
    b = MD5.gg(b, c, d, a, x[12], MD5.S24, 0x8d2a4c8a);

    // 第3轮
    a = MD5.hh(a, b, c, d, x[5], MD5.S31, 0xfffa3942);
    d = MD5.hh(d, a, b, c, x[8], MD5.S32, 0x8771f681);
    c = MD5.hh(c, d, a, b, x[11], MD5.S33, 0x6d9d6122);
    b = MD5.hh(b, c, d, a, x[14], MD5.S34, 0xfde5380c);
    a = MD5.hh(a, b, c, d, x[1], MD5.S31, 0xa4beea44);
    d = MD5.hh(d, a, b, c, x[4], MD5.S32, 0x4bdecfa9);
    c = MD5.hh(c, d, a, b, x[7], MD5.S33, 0xf6bb4b60);
    b = MD5.hh(b, c, d, a, x[10], MD5.S34, 0xbebfbc70);
    a = MD5.hh(a, b, c, d, x[13], MD5.S31, 0x289b7ec6);
    d = MD5.hh(d, a, b, c, x[0], MD5.S32, 0xeaa127fa);
    c = MD5.hh(c, d, a, b, x[3], MD5.S33, 0xd4ef3085);
    b = MD5.hh(b, c, d, a, x[6], MD5.S34, 0x4881d05);
    a = MD5.hh(a, b, c, d, x[9], MD5.S31, 0xd9d4d039);
    d = MD5.hh(d, a, b, c, x[12], MD5.S32, 0xe6db99e5);
    c = MD5.hh(c, d, a, b, x[15], MD5.S33, 0x1fa27cf8);
    b = MD5.hh(b, c, d, a, x[2], MD5.S34, 0xc4ac5665);

    // 第4轮
    a = MD5.ii(a, b, c, d, x[0], MD5.S41, 0xf4292244);
    d = MD5.ii(d, a, b, c, x[7], MD5.S42, 0x432aff97);
    c = MD5.ii(c, d, a, b, x[14], MD5.S43, 0xab9423a7);
    b = MD5.ii(b, c, d, a, x[5], MD5.S44, 0xfc93a039);
    a = MD5.ii(a, b, c, d, x[12], MD5.S41, 0x655b59c3);
    d = MD5.ii(d, a, b, c, x[3], MD5.S42, 0x8f0ccc92);
    c = MD5.ii(c, d, a, b, x[10], MD5.S43, 0xffeff47d);
    b = MD5.ii(b, c, d, a, x[1], MD5.S44, 0x85845dd1);
    a = MD5.ii(a, b, c, d, x[8], MD5.S41, 0x6fa87e4f);
    d = MD5.ii(d, a, b, c, x[15], MD5.S42, 0xfe2ce6e0);
    c = MD5.ii(c, d, a, b, x[6], MD5.S43, 0xa3014314);
    b = MD5.ii(b, c, d, a, x[13], MD5.S44, 0x4e0811a1);
    a = MD5.ii(a, b, c, d, x[4], MD5.S41, 0xf7537e82);
    d = MD5.ii(d, a, b, c, x[11], MD5.S42, 0xbd3af235);
    c = MD5.ii(c, d, a, b, x[2], MD5.S43, 0x2ad7d2bb);
    b = MD5.ii(b, c, d, a, x[9], MD5.S44, 0xeb86d391);

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
  },

  /**
   * 轮1操作
   */
  ff: (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number => {
    a = (a + ((b & c) | (~b & d)) + x + ac) >>> 0;
    return (((a << s) | (a >>> (32 - s))) + b) >>> 0;
  },

  /**
   * 轮2操作
   */
  gg: (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number => {
    a = (a + ((b & d) | (c & ~d)) + x + ac) >>> 0;
    return (((a << s) | (a >>> (32 - s))) + b) >>> 0;
  },

  /**
   * 轮3操作
   */
  hh: (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number => {
    a = (a + (b ^ c ^ d) + x + ac) >>> 0;
    return (((a << s) | (a >>> (32 - s))) + b) >>> 0;
  },

  /**
   * 轮4操作
   */
  ii: (
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number => {
    a = (a + (c ^ (b | ~d)) + x + ac) >>> 0;
    return (((a << s) | (a >>> (32 - s))) + b) >>> 0;
  },
};

/**
 * SHA哈希算法的纯函数包装
 * 使用Web Crypto API实现，但保持纯函数风格
 */
export const SHA = {
  /**
   * 计算SHA-1哈希
   * @param data - 输入数据
   * @returns Promise解析为十六进制哈希字符串
   */
  sha1: async (data: ArrayBuffer | Uint8Array): Promise<string> => {
    return SHA.compute(data, 'SHA-1');
  },

  /**
   * 计算SHA-256哈希
   * @param data - 输入数据
   * @returns Promise解析为十六进制哈希字符串
   */
  sha256: async (data: ArrayBuffer | Uint8Array): Promise<string> => {
    return SHA.compute(data, 'SHA-256');
  },

  /**
   * 计算SHA-384哈希
   * @param data - 输入数据
   * @returns Promise解析为十六进制哈希字符串
   */
  sha384: async (data: ArrayBuffer | Uint8Array): Promise<string> => {
    return SHA.compute(data, 'SHA-384');
  },

  /**
   * 计算SHA-512哈希
   * @param data - 输入数据
   * @returns Promise解析为十六进制哈希字符串
   */
  sha512: async (data: ArrayBuffer | Uint8Array): Promise<string> => {
    return SHA.compute(data, 'SHA-512');
  },

  /**
   * 通用SHA哈希计算
   * @param data - 输入数据
   * @param algorithm - 哈希算法
   * @returns Promise解析为十六进制哈希字符串
   */
  compute: async (
    data: ArrayBuffer | Uint8Array,
    algorithm: string
  ): Promise<string> => {
    // 确保我们有一个ArrayBuffer
    const buffer = data instanceof Uint8Array ? data.buffer : data;

    // 使用Web Crypto API计算哈希
    const hashBuffer = await crypto.subtle.digest(algorithm, buffer);

    // 转换为十六进制字符串
    return hashBufferToHex(hashBuffer);
  },
};

/**
 * 将哈希缓冲区转换为十六进制字符串
 * @param buffer - ArrayBuffer格式的哈希值
 * @returns 十六进制字符串
 */
function hashBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 用于文件哈希计算的纯函数
 */
export const FileHash = {
  /**
   * 计算文件的快速哈希（采样）
   * @param file - 文件对象
   * @param algorithm - 哈希算法
   * @param sampleSize - 采样大小（字节）
   * @returns Promise解析为哈希结果
   */
  quickHash: async (
    file: File,
    algorithm: 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512' = 'md5',
    sampleSize: number = 1024 * 1024
  ): Promise<string> => {
    // 验证输入
    if (!file) throw new Error('必须提供文件对象');
    if (sampleSize <= 0) throw new Error('采样大小必须大于0');

    // 调整采样大小
    const actualSampleSize = Math.min(sampleSize, file.size);

    // 读取文件头部
    const headerSample = await FileHash.readFileSlice(
      file,
      0,
      Math.min(actualSampleSize / 2, file.size)
    );

    // 如果文件足够大，读取文件尾部
    let footerSample = new ArrayBuffer(0);
    if (file.size > actualSampleSize / 2) {
      const footerStart = Math.max(0, file.size - actualSampleSize / 2);
      footerSample = await FileHash.readFileSlice(file, footerStart, file.size);
    }

    // 合并样本
    const combinedSample = FileHash.combineArrayBuffers([
      headerSample,
      footerSample,
    ]);

    // 计算哈希
    return algorithm === 'md5'
      ? MD5.compute(combinedSample)
      : await SHA.compute(
          combinedSample,
          algorithm.toUpperCase().replace('SHA', 'SHA-')
        );
  },

  /**
   * 计算完整文件哈希
   * @param file - 文件对象
   * @param algorithm - 哈希算法
   * @param chunkSize - 分块大小（字节）
   * @param onProgress - 进度回调
   * @returns Promise解析为哈希结果
   */
  fullHash: async (
    file: File,
    algorithm: 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512' = 'md5',
    chunkSize: number = 2 * 1024 * 1024,
    onProgress?: (percent: number) => void
  ): Promise<string> => {
    // 验证输入
    if (!file) throw new Error('必须提供文件对象');
    if (chunkSize <= 0) throw new Error('分块大小必须大于0');

    // 创建哈希上下文
    let context: any;
    let result: string;

    if (algorithm === 'md5') {
      // 使用本地MD5实现
      context = MD5.init();

      // 分块处理文件
      for (let start = 0; start < file.size; start += chunkSize) {
        const end = Math.min(start + chunkSize, file.size);
        const chunk = await FileHash.readFileSlice(file, start, end);

        // 更新哈希
        MD5.update(context, new Uint8Array(chunk));

        // 报告进度
        if (onProgress) {
          onProgress((end / file.size) * 100);
        }
      }

      // 完成计算
      result = MD5.finalize(context);
    } else {
      // 使用Web Crypto API
      // 但由于它不支持流式处理，我们需要读取整个文件
      // 为了节省内存，我们分块读取并使用SubtleCrypto.digest

      // 如果文件太小，直接计算
      if (file.size <= chunkSize) {
        const buffer = await FileHash.readFileSlice(file, 0, file.size);
        result = await SHA.compute(
          buffer,
          algorithm.toUpperCase().replace('SHA', 'SHA-')
        );

        if (onProgress) {
          onProgress(100);
        }
      } else {
        // 对于大文件，使用我们自己的分块处理
        const chunks: ArrayBuffer[] = [];
        for (let start = 0; start < file.size; start += chunkSize) {
          const end = Math.min(start + chunkSize, file.size);
          const chunk = await FileHash.readFileSlice(file, start, end);
          chunks.push(chunk);

          if (onProgress) {
            onProgress((end / file.size) * 100);
          }
        }

        // 合并所有块
        const fullBuffer = FileHash.combineArrayBuffers(chunks);

        // 计算最终哈希
        result = await SHA.compute(
          fullBuffer,
          algorithm.toUpperCase().replace('SHA', 'SHA-')
        );
      }
    }

    return result;
  },

  /**
   * 计算文件指纹（包含文件特征信息的哈希）
   * @param file - 文件对象
   * @param options - 指纹计算选项
   * @returns Promise解析为指纹字符串
   */
  fingerprint: async (
    file: File,
    options?: {
      algorithm?: 'md5' | 'sha1' | 'sha256';
      quick?: boolean;
      includeMetadata?: boolean;
      sampleSize?: number;
    }
  ): Promise<string> => {
    // 默认选项
    const opts = {
      algorithm: 'md5',
      quick: true,
      includeMetadata: true,
      sampleSize: 256 * 1024,
      ...options,
    };

    // 计算内容哈希
    const contentHash = opts.quick
      ? await FileHash.quickHash(file, opts.algorithm, opts.sampleSize)
      : await FileHash.fullHash(file, opts.algorithm);

    // 如果不包含元数据，直接返回内容哈希
    if (!opts.includeMetadata) {
      return contentHash;
    }

    // 包含元数据的指纹计算
    const metadata = `${file.name}|${file.size}|${file.lastModified}`;
    const metadataBuffer = new TextEncoder().encode(metadata);

    // 计算元数据哈希
    const metadataHash =
      opts.algorithm === 'md5'
        ? MD5.compute(metadataBuffer)
        : await SHA.compute(
            metadataBuffer,
            opts.algorithm.toUpperCase().replace('SHA', 'SHA-')
          );

    // 组合哈希
    return `${contentHash}_${metadataHash}`;
  },

  /**
   * 读取文件的一部分
   * @param file - 文件对象
   * @param start - 起始位置
   * @param end - 结束位置
   * @returns Promise解析为文件内容ArrayBuffer
   */
  readFileSlice: async (
    file: File,
    start: number,
    end: number
  ): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as ArrayBuffer);
      };

      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      reader.readAsArrayBuffer(file.slice(start, end));
    });
  },

  /**
   * 合并多个ArrayBuffer
   * @param buffers - ArrayBuffer数组
   * @returns 合并后的ArrayBuffer
   */
  combineArrayBuffers: (buffers: ArrayBuffer[]): ArrayBuffer => {
    // 计算总长度
    const totalLength = buffers.reduce(
      (sum, buffer) => sum + buffer.byteLength,
      0
    );

    // 创建结果缓冲区
    const result = new Uint8Array(totalLength);

    // 复制数据
    let offset = 0;
    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  },
};
