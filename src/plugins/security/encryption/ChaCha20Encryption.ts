/**
 * ChaCha20Encryption.ts
 * ChaCha20加密算法的实现，用于提供在不支持原生ChaCha20的环境中的加密能力
 */

/**
 * ChaCha20加密配置接口
 */
export interface ChaCha20Config {
  /**
   * 密钥(32字节)
   */
  key: Uint8Array;

  /**
   * 随机数(8或12字节)
   */
  nonce: Uint8Array;

  /**
   * 计数器初始值(默认为0)
   */
  counter?: number;
}

/**
 * ChaCha20加密结果
 */
export interface ChaCha20Result {
  /**
   * 加密后的数据
   */
  data: Uint8Array;

  /**
   * 使用的nonce
   */
  nonce: Uint8Array;

  /**
   * 最终的计数器值
   */
  counter: number;
}

/**
 * ChaCha20加密类
 * 基于ChaCha20流加密算法实现
 * 参考RFC 8439: https://datatracker.ietf.org/doc/html/rfc8439
 */
export class ChaCha20 {
  private readonly key: Uint8Array;
  private readonly nonce: Uint8Array;
  private counter: number;

  /**
   * 构建ChaCha20加密实例
   * @param config 加密配置
   */
  constructor(config: ChaCha20Config) {
    // 验证参数
    if (config.key.length !== 32) {
      throw new Error('ChaCha20密钥必须为32字节(256位)');
    }

    if (config.nonce.length !== 8 && config.nonce.length !== 12) {
      throw new Error('ChaCha20 nonce必须为8字节或12字节');
    }

    this.key = config.key;
    this.nonce = config.nonce;
    this.counter = config.counter || 0;
  }

  /**
   * 加密或解密数据(ChaCha20是对称加密，加密和解密操作相同)
   * @param data 要加密/解密的数据
   * @returns 加密/解密结果
   */
  public process(data: Uint8Array): ChaCha20Result {
    // 创建输出数组
    const output = new Uint8Array(data.length);
    let keyStreamBlock = new Uint8Array(64); // ChaCha20的块大小为64字节
    let keyStreamPos = 64; // 强制生成第一个密钥流块

    // 处理每个字节
    for (let i = 0; i < data.length; i++) {
      // 如果用完了当前密钥流块，生成新的块
      if (keyStreamPos === 64) {
        keyStreamBlock = this.generateKeyStreamBlock(this.counter++);
        keyStreamPos = 0;
      }

      // 对数据进行异或运算
      output[i] = data[i] ^ keyStreamBlock[keyStreamPos++];
    }

    return {
      data: output,
      nonce: this.nonce,
      counter: this.counter,
    };
  }

  /**
   * 加密数据
   * @param data 要加密的数据
   * @returns 加密结果
   */
  public encrypt(data: Uint8Array): ChaCha20Result {
    return this.process(data);
  }

  /**
   * 解密数据
   * @param data 要解密的数据
   * @returns 解密结果
   */
  public decrypt(data: Uint8Array): ChaCha20Result {
    return this.process(data);
  }

  /**
   * 生成密钥流块
   * @param counter 块计数器
   * @returns 64字节的密钥流块
   */
  private generateKeyStreamBlock(counter: number): Uint8Array {
    // ChaCha20 初始状态
    // 前4个字为常量，后面为密钥、计数器和nonce
    const state = new Uint32Array(16);

    // 设置ChaCha20常量 "expand 32-byte k"
    state[0] = 0x61707865; // 'expa'
    state[1] = 0x3320646e; // 'nd 3'
    state[2] = 0x79622d32; // '2-by'
    state[3] = 0x6b206574; // 'te k'

    // 设置密钥 (8个32位字)
    for (let i = 0; i < 8; i++) {
      state[4 + i] = this.u8ToU32(this.key, i * 4);
    }

    // 设置计数器
    state[12] = counter;

    // 设置nonce (3个32位字)
    if (this.nonce.length === 12) {
      state[13] = this.u8ToU32(this.nonce, 0);
      state[14] = this.u8ToU32(this.nonce, 4);
      state[15] = this.u8ToU32(this.nonce, 8);
    } else {
      // 8字节nonce，根据RFC对32位计数器进行扩展
      state[13] = 0;
      state[14] = this.u8ToU32(this.nonce, 0);
      state[15] = this.u8ToU32(this.nonce, 4);
    }

    // 复制初始状态
    const initialState = new Uint32Array(state);

    // 执行20轮ChaCha操作
    for (let i = 0; i < 10; i++) {
      this.quarterRound(state, 0, 4, 8, 12);
      this.quarterRound(state, 1, 5, 9, 13);
      this.quarterRound(state, 2, 6, 10, 14);
      this.quarterRound(state, 3, 7, 11, 15);
      this.quarterRound(state, 0, 5, 10, 15);
      this.quarterRound(state, 1, 6, 11, 12);
      this.quarterRound(state, 2, 7, 8, 13);
      this.quarterRound(state, 3, 4, 9, 14);
    }

    // 与初始状态相加
    for (let i = 0; i < 16; i++) {
      state[i] += initialState[i];
    }

    // 转换为字节数组
    const output = new Uint8Array(64);
    for (let i = 0; i < 16; i++) {
      this.u32ToU8(output, i * 4, state[i]);
    }

    return output;
  }

  /**
   * ChaCha20四分之一轮函数
   */
  private quarterRound(
    state: Uint32Array,
    a: number,
    b: number,
    c: number,
    d: number
  ): void {
    state[a] += state[b];
    state[d] = this.rotl32(state[d] ^ state[a], 16);
    state[c] += state[d];
    state[b] = this.rotl32(state[b] ^ state[c], 12);
    state[a] += state[b];
    state[d] = this.rotl32(state[d] ^ state[a], 8);
    state[c] += state[d];
    state[b] = this.rotl32(state[b] ^ state[c], 7);
  }

  /**
   * 32位整数左旋转
   */
  private rotl32(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0; // >>> 0 确保结果为无符号32位整数
  }

  /**
   * 从Uint8Array转换为32位无符号整数(小端序)
   */
  private u8ToU32(bytes: Uint8Array, offset: number): number {
    return (
      (bytes[offset + 0] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
      0
    );
  }

  /**
   * 将32位无符号整数转换为Uint8Array(小端序)
   */
  private u32ToU8(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset + 0] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  /**
   * 生成随机nonce
   * @param length nonce长度(8或12字节)
   * @returns 随机nonce
   */
  public static generateNonce(length: 8 | 12 = 12): Uint8Array {
    const nonce = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(nonce);
    } else {
      // 如果没有可用的安全随机数生成器，使用Math.random
      // 注意：这种方式在安全要求高的场景下不推荐
      for (let i = 0; i < length; i++) {
        nonce[i] = Math.floor(Math.random() * 256);
      }
    }
    return nonce;
  }

  /**
   * 从密码派生ChaCha20密钥
   * @param password 密码
   * @param salt 盐(可选，如果不提供会生成随机盐)
   * @returns 包含密钥和盐的对象
   */
  public static async deriveKey(
    password: string,
    salt?: Uint8Array
  ): Promise<{ key: Uint8Array; salt: Uint8Array }> {
    // 如果没有提供盐，生成随机盐
    const actualSalt = salt || new Uint8Array(16);
    if (!salt) {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(actualSalt);
      } else {
        for (let i = 0; i < 16; i++) {
          actualSalt[i] = Math.floor(Math.random() * 256);
        }
      }
    }

    // 将密码转为字节数组
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);

    // 使用PBKDF2派生密钥
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const baseKey = await crypto.subtle.importKey(
          'raw',
          passwordBytes,
          { name: 'PBKDF2' },
          false,
          ['deriveBits']
        );

        const keyBuffer = await crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt: actualSalt,
            iterations: 100000,
            hash: 'SHA-256',
          },
          baseKey,
          256
        );

        return {
          key: new Uint8Array(keyBuffer),
          salt: actualSalt,
        };
      }
    } catch (e) {
      // Web Crypto API可能不支持或受到限制
      console.warn('Web Crypto API不可用，使用备用方法派生密钥');
    }

    // 备用密钥派生方法(仅在Web Crypto API不可用时使用)
    // 注意：这种方法安全性较低，仅作为降级方案
    const key = new Uint8Array(32);

    // 简单的密钥派生方法，通过反复哈希密码和盐的组合
    const combined = new Uint8Array(passwordBytes.length + actualSalt.length);
    combined.set(passwordBytes);
    combined.set(actualSalt, passwordBytes.length);

    // 简单模拟哈希派生
    for (let i = 0; i < 32; i++) {
      // 通过索引创建不同的哈希结果
      let hash = 0;
      for (let j = 0; j < combined.length; j++) {
        hash = (hash * 31 + combined[j]) % 65537;
      }
      key[i] = hash % 256;
      // 向combined添加新的派生结果，影响下一轮
      combined[i % combined.length] = key[i];
    }

    return {
      key,
      salt: actualSalt,
    };
  }
}

/**
 * 实用工具函数：将ArrayBuffer转换为Uint8Array
 * @param buffer 要转换的ArrayBuffer
 * @returns Uint8Array视图
 */
export function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  return new Uint8Array(buffer);
}

/**
 * 实用工具函数：将字符串转换为Uint8Array
 * @param str 要转换的字符串
 * @returns Uint8Array表示
 */
export function stringToUint8Array(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * 实用工具函数：将Uint8Array转换为字符串
 * @param array 要转换的Uint8Array
 * @returns 字符串表示
 */
export function uint8ArrayToString(array: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(array);
}

/**
 * 使用ChaCha20加密ArrayBuffer数据
 * @param data 要加密的数据
 * @param key 加密密钥(32字节)
 * @param nonce 可选nonce，如不提供将自动生成
 * @returns 加密结果和nonce
 */
export function encryptWithChaCha20(
  data: ArrayBuffer,
  key: Uint8Array,
  nonce?: Uint8Array
): { encrypted: Uint8Array; nonce: Uint8Array } {
  // 转换ArrayBuffer为Uint8Array
  const dataArray = toUint8Array(data);

  // 如果没有提供nonce，生成一个
  const actualNonce = nonce || ChaCha20.generateNonce(12);

  // 创建ChaCha20实例
  const chacha = new ChaCha20({
    key,
    nonce: actualNonce,
  });

  // 加密数据
  const result = chacha.encrypt(dataArray);

  return {
    encrypted: result.data,
    nonce: result.nonce,
  };
}

/**
 * 使用ChaCha20解密ArrayBuffer数据
 * @param encryptedData 加密的数据
 * @param key 解密密钥(32字节)
 * @param nonce 加密时使用的nonce
 * @returns 解密后的数据
 */
export function decryptWithChaCha20(
  encryptedData: ArrayBuffer,
  key: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  // 转换ArrayBuffer为Uint8Array
  const dataArray = toUint8Array(encryptedData);

  // 创建ChaCha20实例
  const chacha = new ChaCha20({
    key,
    nonce,
  });

  // 解密数据
  const result = chacha.decrypt(dataArray);

  return result.data;
}

export default {
  ChaCha20,
  encryptWithChaCha20,
  decryptWithChaCha20,
  toUint8Array,
  stringToUint8Array,
  uint8ArrayToString,
};
