/**
 * 文件加密系统
 * 提供文件内容加密和解密功能
 */

import { encryptWithChaCha20, decryptWithChaCha20 } from './ChaCha20Encryption';

/**
 * 文件加密选项
 */
export interface FileEncryptionOptions {
  /**
   * 加密算法
   * @default 'AES-GCM'
   */
  algorithm?: 'AES-GCM' | 'AES-CBC' | 'ChaCha20';

  /**
   * 密钥长度(位)
   * @default 256
   */
  keyLength?: 128 | 192 | 256;

  /**
   * 是否加密文件元数据
   * @default false
   */
  encryptMetadata?: boolean;

  /**
   * 密钥派生函数迭代次数
   * @default 100000
   */
  pbkdf2Iterations?: number;

  /**
   * 自定义加密密钥
   * 如果提供，将使用此密钥而不是生成新密钥
   */
  customKey?: CryptoKey | string;

  /**
   * 加密密码
   * 如果提供，将使用此密码派生密钥
   */
  password?: string;

  /**
   * 自定义盐值
   * 如果提供，将用于密钥派生
   */
  salt?: Uint8Array | string;
}

/**
 * 加密元数据
 */
export interface EncryptionMetadata {
  /**
   * 算法
   */
  algorithm: string;

  /**
   * 初始化向量
   */
  iv: string;

  /**
   * 盐值(用于密钥派生)
   */
  salt: string;

  /**
   * 密钥参数
   */
  keyParams: {
    iterations: number;
    keyLength: number;
  };

  /**
   * 验证标签(仅用于GCM模式)
   */
  authTag?: string;

  /**
   * 加密版本
   */
  version: string;
}

/**
 * 文件加密系统
 * 提供文件内容加密和解密功能
 */
export default class FileEncryptionSystem {
  /**
   * 加密选项
   */
  private options: FileEncryptionOptions;

  /**
   * 加密密钥
   */
  private encryptionKey: CryptoKey | null = null;

  /**
   * 当前使用的初始化向量(IV)
   */
  private currentIV: Uint8Array | null = null;

  /**
   * 盐值
   */
  private salt: Uint8Array | null = null;

  /**
   * 加密元数据
   */
  private metadata: EncryptionMetadata | null = null;

  /**
   * 构造函数
   * @param options 加密选项
   */
  constructor(options?: FileEncryptionOptions) {
    this.options = {
      algorithm: 'AES-GCM',
      keyLength: 256,
      encryptMetadata: false,
      pbkdf2Iterations: 100000,
      ...options,
    };

    // 初始化加密系统
    this.initialize();
  }

  /**
   * 初始化加密系统
   */
  private async initialize(): Promise<void> {
    try {
      // 初始化盐值
      if (this.options.salt) {
        if (typeof this.options.salt === 'string') {
          // 将Base64字符串转换为Uint8Array
          this.salt = this.base64ToUint8Array(this.options.salt);
        } else {
          this.salt = this.options.salt;
        }
      } else {
        // 生成随机盐值
        this.salt = crypto.getRandomValues(new Uint8Array(16));
      }

      // 初始化密钥
      if (this.options.customKey) {
        if (typeof this.options.customKey === 'string') {
          // 将Base64字符串转换为密钥
          const keyData = this.base64ToUint8Array(this.options.customKey);
          this.encryptionKey = await this.importKey(keyData);
        } else {
          this.encryptionKey = this.options.customKey;
        }
      } else if (this.options.password) {
        // 使用密码派生密钥
        this.encryptionKey = await this.deriveKeyFromPassword(
          this.options.password,
          this.salt,
          this.options.pbkdf2Iterations || 100000,
          this.options.keyLength || 256
        );
      } else {
        // 生成随机密钥
        this.encryptionKey = await this.generateKey(
          this.options.keyLength || 256
        );
      }

      // 初始化元数据
      this.metadata = {
        algorithm: this.options.algorithm || 'AES-GCM',
        iv: '',
        salt: this.uint8ArrayToBase64(this.salt),
        keyParams: {
          iterations: this.options.pbkdf2Iterations || 100000,
          keyLength: this.options.keyLength || 256,
        },
        version: '1.0',
      };
    } catch (error) {
      console.error('加密系统初始化失败:', error);
      throw new Error(`加密系统初始化失败: ${(error as Error).message}`);
    }
  }

  /**
   * 加密分片数据
   * @param chunk 要加密的分片数据
   * @param chunkInfo 分片信息
   * @returns 加密后的分片数据
   */
  public async encryptChunk(
    chunk: ArrayBuffer,
    chunkInfo: { fileId: string; chunkIndex: number }
  ): Promise<ArrayBuffer> {
    try {
      if (!this.encryptionKey) {
        await this.initialize();
      }

      if (!this.encryptionKey) {
        throw new Error('加密密钥未初始化');
      }

      // 为每个分片生成唯一的IV
      this.currentIV = this.generateIV(chunkInfo.fileId, chunkInfo.chunkIndex);

      // 更新元数据
      if (this.metadata) {
        this.metadata.iv = this.uint8ArrayToBase64(this.currentIV);
      }

      // 根据选择的算法执行加密
      let encryptedData: ArrayBuffer;

      switch (this.options.algorithm) {
        case 'AES-GCM':
          encryptedData = await this.encryptWithAesGcm(chunk);
          break;
        case 'AES-CBC':
          encryptedData = await this.encryptWithAesCbc(chunk);
          break;
        case 'ChaCha20':
          encryptedData = await this.encryptWithChaCha20(chunk);
          break;
        default:
          encryptedData = await this.encryptWithAesGcm(chunk);
      }

      return encryptedData;
    } catch (error) {
      console.error('分片加密失败:', error);
      throw new Error(`分片加密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 解密分片数据
   * @param encryptedChunk 加密的分片数据
   * @param metadata 加密元数据
   * @returns 解密后的分片数据
   */
  public async decryptChunk(
    encryptedChunk: ArrayBuffer,
    metadata: EncryptionMetadata
  ): Promise<ArrayBuffer> {
    try {
      if (!this.encryptionKey) {
        throw new Error('加密密钥未初始化');
      }

      // 获取IV
      const iv = this.base64ToUint8Array(metadata.iv);

      // 根据选择的算法执行解密
      let decryptedData: ArrayBuffer;

      switch (metadata.algorithm) {
        case 'AES-GCM':
          decryptedData = await this.decryptWithAesGcm(
            encryptedChunk,
            iv,
            metadata.authTag
          );
          break;
        case 'AES-CBC':
          decryptedData = await this.decryptWithAesCbc(encryptedChunk, iv);
          break;
        case 'ChaCha20':
          decryptedData = await this.decryptWithChaCha20(encryptedChunk, iv);
          break;
        default:
          throw new Error(`不支持的加密算法: ${metadata.algorithm}`);
      }

      return decryptedData;
    } catch (error) {
      console.error('分片解密失败:', error);
      throw new Error(`分片解密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取加密元数据
   * @returns 加密元数据
   */
  public getEncryptionMetadata(): EncryptionMetadata | null {
    return this.metadata;
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.encryptionKey = null;
    this.currentIV = null;
    this.salt = null;
    this.metadata = null;
  }

  /**
   * 使用AES-GCM加密数据
   * @param data 要加密的数据
   * @returns 加密后的数据
   */
  private async encryptWithAesGcm(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.encryptionKey || !this.currentIV) {
      throw new Error('加密密钥或IV未初始化');
    }

    try {
      // 执行加密
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: this.currentIV,
          tagLength: 128, // 认证标签长度(位)
        },
        this.encryptionKey,
        data
      );

      // 从加密结果中提取认证标签
      // GCM模式的加密结果是原始密文后面跟着认证标签
      const encryptedLength = encryptedData.byteLength;
      const tagLength = 16; // 128位 = 16字节

      // 提取认证标签
      const authTag = new Uint8Array(
        encryptedData.slice(encryptedLength - tagLength)
      );

      // 更新元数据
      if (this.metadata) {
        this.metadata.authTag = this.uint8ArrayToBase64(authTag);
      }

      return encryptedData;
    } catch (error) {
      console.error('AES-GCM加密失败:', error);
      throw new Error(`AES-GCM加密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 使用AES-CBC加密数据
   * @param data 要加密的数据
   * @returns 加密后的数据
   */
  private async encryptWithAesCbc(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.encryptionKey || !this.currentIV) {
      throw new Error('加密密钥或IV未初始化');
    }

    try {
      // 执行加密
      return await crypto.subtle.encrypt(
        {
          name: 'AES-CBC',
          iv: this.currentIV,
        },
        this.encryptionKey,
        data
      );
    } catch (error) {
      console.error('AES-CBC加密失败:', error);
      throw new Error(`AES-CBC加密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 使用ChaCha20加密数据
   * @param data 要加密的数据
   * @returns 加密后的数据
   */
  private async encryptWithChaCha20(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.encryptionKey) {
      throw new Error('加密密钥未初始化');
    }

    try {
      // 确保IV已初始化 - 对ChaCha20使用12字节nonce
      if (!this.currentIV) {
        this.currentIV = crypto.getRandomValues(new Uint8Array(12));
      }

      // 从CryptoKey中导出原始密钥
      const rawKey = await crypto.subtle.exportKey('raw', this.encryptionKey);
      const keyBytes = new Uint8Array(rawKey);

      // 使用我们的ChaCha20实现加密数据
      const { encrypted, nonce } = encryptWithChaCha20(
        data,
        keyBytes,
        this.currentIV
      );

      // 更新元数据中的IV信息
      if (this.metadata) {
        this.metadata.iv = this.uint8ArrayToBase64(nonce);
      }

      return encrypted.buffer;
    } catch (error) {
      console.error('ChaCha20加密失败:', error);
      throw new Error(`ChaCha20加密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 使用AES-GCM解密数据
   * @param encryptedData 加密的数据
   * @param iv 初始化向量
   * @param authTag 认证标签
   * @returns 解密后的数据
   */
  private async decryptWithAesGcm(
    encryptedData: ArrayBuffer,
    iv: Uint8Array,
    authTag?: string
  ): Promise<ArrayBuffer> {
    if (!this.encryptionKey) {
      throw new Error('加密密钥未初始化');
    }

    try {
      // 在实际项目中，如果需要处理分离的authTag，需要将其重新附加到密文末尾
      let dataToDecrypt = encryptedData;

      if (authTag) {
        // 如果提供了单独的authTag，将其附加到密文末尾
        const tagBytes = this.base64ToUint8Array(authTag);
        const combinedLength = encryptedData.byteLength + tagBytes.length;
        const combined = new Uint8Array(combinedLength);

        combined.set(new Uint8Array(encryptedData), 0);
        combined.set(tagBytes, encryptedData.byteLength);

        dataToDecrypt = combined.buffer;
      }

      // 执行解密
      return await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          tagLength: 128,
        },
        this.encryptionKey,
        dataToDecrypt
      );
    } catch (error) {
      console.error('AES-GCM解密失败:', error);
      throw new Error(`AES-GCM解密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 使用AES-CBC解密数据
   * @param encryptedData 加密的数据
   * @param iv 初始化向量
   * @returns 解密后的数据
   */
  private async decryptWithAesCbc(
    encryptedData: ArrayBuffer,
    iv: Uint8Array
  ): Promise<ArrayBuffer> {
    if (!this.encryptionKey) {
      throw new Error('加密密钥未初始化');
    }

    try {
      // 执行解密
      return await crypto.subtle.decrypt(
        {
          name: 'AES-CBC',
          iv,
        },
        this.encryptionKey,
        encryptedData
      );
    } catch (error) {
      console.error('AES-CBC解密失败:', error);
      throw new Error(`AES-CBC解密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 使用ChaCha20解密数据
   * @param encryptedData 加密的数据
   * @param iv 初始化向量
   * @returns 解密后的数据
   */
  private async decryptWithChaCha20(
    encryptedData: ArrayBuffer,
    iv: Uint8Array
  ): Promise<ArrayBuffer> {
    if (!this.encryptionKey) {
      throw new Error('加密密钥未初始化');
    }

    try {
      // 从CryptoKey中导出原始密钥
      const rawKey = await crypto.subtle.exportKey('raw', this.encryptionKey);
      const keyBytes = new Uint8Array(rawKey);

      // 使用我们的ChaCha20实现解密数据
      const decrypted = decryptWithChaCha20(encryptedData, keyBytes, iv);

      return decrypted.buffer;
    } catch (error) {
      console.error('ChaCha20解密失败:', error);
      throw new Error(`ChaCha20解密失败: ${(error as Error).message}`);
    }
  }

  /**
   * 生成初始化向量(IV)
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   * @returns 初始化向量
   */
  private generateIV(fileId: string, chunkIndex: number): Uint8Array {
    // 创建一个16字节(128位)的IV
    const iv = new Uint8Array(16);

    // 使用随机数填充前12字节
    crypto.getRandomValues(iv.subarray(0, 12));

    // 使用分片索引填充后4字节，确保每个分片有唯一的IV
    const indexBytes = new Uint8Array(4);
    const dataView = new DataView(indexBytes.buffer);
    dataView.setUint32(0, chunkIndex, false);

    iv.set(indexBytes, 12);

    return iv;
  }

  /**
   * 生成加密密钥
   * @param keyLength 密钥长度(位)
   * @returns 加密密钥
   */
  private async generateKey(keyLength: number): Promise<CryptoKey> {
    try {
      return await crypto.subtle.generateKey(
        {
          name: this.options.algorithm === 'AES-CBC' ? 'AES-CBC' : 'AES-GCM',
          length: keyLength,
        },
        true, // 可导出
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('生成加密密钥失败:', error);
      throw new Error(`生成加密密钥失败: ${(error as Error).message}`);
    }
  }

  /**
   * 从密码派生密钥
   * @param password 密码
   * @param salt 盐值
   * @param iterations 迭代次数
   * @param keyLength 密钥长度(位)
   * @returns 派生的密钥
   */
  private async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number,
    keyLength: number
  ): Promise<CryptoKey> {
    try {
      // 首先将密码转换为密钥材料
      const encoder = new TextEncoder();
      const passwordData = encoder.encode(password);

      const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordData,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      // 使用PBKDF2派生密钥
      return await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations,
          hash: 'SHA-256',
        },
        baseKey,
        {
          name: this.options.algorithm === 'AES-CBC' ? 'AES-CBC' : 'AES-GCM',
          length: keyLength,
        },
        true,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('从密码派生密钥失败:', error);
      throw new Error(`从密码派生密钥失败: ${(error as Error).message}`);
    }
  }

  /**
   * 导入密钥
   * @param keyData 密钥数据
   * @returns 导入的密钥
   */
  private async importKey(keyData: Uint8Array): Promise<CryptoKey> {
    try {
      return await crypto.subtle.importKey(
        'raw',
        keyData,
        {
          name: this.options.algorithm === 'AES-CBC' ? 'AES-CBC' : 'AES-GCM',
          length: this.options.keyLength,
        },
        true,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('导入密钥失败:', error);
      throw new Error(`导入密钥失败: ${(error as Error).message}`);
    }
  }

  /**
   * 将Uint8Array转换为Base64字符串
   * @param buffer 要转换的Uint8Array
   * @returns Base64字符串
   */
  private uint8ArrayToBase64(buffer: Uint8Array): string {
    // 使用标准的浏览器API
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 将Base64字符串转换为Uint8Array
   * @param base64 Base64字符串
   * @returns Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    // 使用标准的浏览器API
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
