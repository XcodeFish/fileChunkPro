/**
 * 数据加密器
 * 负责文件和数据的加密处理
 */

/**
 * 加密算法类型
 */
export enum EncryptionAlgorithm {
  AES = 'aes',
  RSA = 'rsa',
  CUSTOM = 'custom',
}

/**
 * 加密密钥格式
 */
export enum KeyFormat {
  RAW = 'raw',
  JWK = 'jwk',
  PKCS8 = 'pkcs8',
  SPKI = 'spki',
}

/**
 * 加密选项
 */
export interface EncryptionOptions {
  /**
   * 加密算法
   * @default EncryptionAlgorithm.AES
   */
  algorithm?: EncryptionAlgorithm;

  /**
   * 密钥
   * 对于AES，可以是字符串或ArrayBuffer
   * 对于RSA，应该是CryptoKey对象或JSON Web Key
   */
  key?: string | ArrayBuffer | CryptoKey | JsonWebKey;

  /**
   * 密钥格式
   * @default KeyFormat.RAW
   */
  keyFormat?: KeyFormat;

  /**
   * 初始化向量
   * 用于AES-CBC模式
   */
  iv?: Uint8Array;

  /**
   * 加密强度（位数）
   * AES: 128, 192, 256
   * RSA: 1024, 2048, 4096
   * @default 256 (AES) 或 2048 (RSA)
   */
  strength?: number;

  /**
   * 自定义加密处理函数
   * 当algorithm为CUSTOM时使用
   */
  customEncrypt?: (data: ArrayBuffer) => Promise<ArrayBuffer>;

  /**
   * 自定义解密处理函数
   * 当algorithm为CUSTOM时使用
   */
  customDecrypt?: (data: ArrayBuffer) => Promise<ArrayBuffer>;

  /**
   * 是否对文件名也进行加密
   * @default false
   */
  encryptFilename?: boolean;

  /**
   * 是否在上传前加密
   * @default true
   */
  encryptBeforeUpload?: boolean;

  /**
   * 是否缓存解密后的数据
   * @default false
   */
  cacheDecryptedData?: boolean;

  /**
   * 是否对元数据加密
   * @default false
   */
  encryptMetadata?: boolean;
}

/**
 * 加密上下文，包含加密所需的所有状态
 */
export interface EncryptionContext {
  /**
   * 算法名称
   */
  algorithm: string;

  /**
   * 密钥
   */
  key: CryptoKey;

  /**
   * 初始化向量
   */
  iv?: Uint8Array;

  /**
   * 额外参数
   */
  additionalParams?: Record<string, any>;
}

/**
 * 数据加密器
 */
export default class DataEncryptor {
  /**
   * 默认选项
   */
  private static readonly DEFAULT_OPTIONS: EncryptionOptions = {
    algorithm: EncryptionAlgorithm.AES,
    keyFormat: KeyFormat.RAW,
    strength: 256,
    encryptFilename: false,
    encryptBeforeUpload: true,
    cacheDecryptedData: false,
    encryptMetadata: false,
  };

  /**
   * 选项
   */
  private _options: EncryptionOptions;

  /**
   * 已经准备好的加密上下文
   */
  private _encryptionContext: EncryptionContext | null = null;

  /**
   * 解密数据缓存
   */
  private _decryptedCache: Map<string, ArrayBuffer> = new Map();

  /**
   * 构造函数
   * @param options 加密选项
   */
  constructor(options: EncryptionOptions = {}) {
    this._options = { ...DataEncryptor.DEFAULT_OPTIONS, ...options };
  }

  /**
   * 准备加密上下文
   */
  public async prepareEncryptionContext(): Promise<EncryptionContext> {
    // 如果已经准备好，直接返回
    if (this._encryptionContext) {
      return this._encryptionContext;
    }

    const { algorithm, key, keyFormat, strength, iv } = this._options;

    switch (algorithm) {
      case EncryptionAlgorithm.AES:
        return this._prepareAesContext(key, keyFormat, strength, iv);
      case EncryptionAlgorithm.RSA:
        return this._prepareRsaContext(key, keyFormat, strength);
      case EncryptionAlgorithm.CUSTOM:
        if (!this._options.customEncrypt || !this._options.customDecrypt) {
          throw new Error(
            '使用自定义加密算法时必须提供customEncrypt和customDecrypt函数'
          );
        }
        // 对于自定义算法，返回一个简单的上下文
        return {
          algorithm: 'custom',
          key: null as unknown as CryptoKey,
          additionalParams: { customHandler: true },
        };
      default:
        throw new Error(`不支持的加密算法: ${algorithm}`);
    }
  }

  /**
   * 准备AES加密上下文
   */
  private async _prepareAesContext(
    key?: string | ArrayBuffer | CryptoKey | JsonWebKey,
    keyFormat?: KeyFormat,
    strength?: number,
    iv?: Uint8Array
  ): Promise<EncryptionContext> {
    const cryptoKey = await this._resolveAesKey(key, keyFormat, strength);

    // 如果没有提供初始化向量，生成一个随机的
    const initVector = iv || this._generateRandomIV();

    const context: EncryptionContext = {
      algorithm: 'AES-CBC',
      key: cryptoKey,
      iv: initVector,
    };

    // 缓存上下文
    this._encryptionContext = context;

    return context;
  }

  /**
   * 准备RSA加密上下文
   */
  private async _prepareRsaContext(
    key?: string | ArrayBuffer | CryptoKey | JsonWebKey,
    keyFormat?: KeyFormat,
    strength?: number
  ): Promise<EncryptionContext> {
    const cryptoKey = await this._resolveRsaKey(key, keyFormat, strength);

    const context: EncryptionContext = {
      algorithm: 'RSA-OAEP',
      key: cryptoKey,
    };

    // 缓存上下文
    this._encryptionContext = context;

    return context;
  }

  /**
   * 解析AES密钥
   */
  private async _resolveAesKey(
    key?: string | ArrayBuffer | CryptoKey | JsonWebKey,
    keyFormat?: KeyFormat,
    strength?: number
  ): Promise<CryptoKey> {
    // 默认强度
    const keyStrength = strength || 256;

    // 如果已经是CryptoKey，直接返回
    if (key && typeof key === 'object' && 'type' in key) {
      return key as CryptoKey;
    }

    // 如果是JWK格式
    if (
      keyFormat === KeyFormat.JWK &&
      typeof key === 'object' &&
      !ArrayBuffer.isView(key)
    ) {
      return await crypto.subtle.importKey(
        'jwk',
        key as JsonWebKey,
        { name: 'AES-CBC', length: keyStrength },
        false,
        ['encrypt', 'decrypt']
      );
    }

    // 如果是字符串，转换为ArrayBuffer
    let keyData: ArrayBuffer;
    if (typeof key === 'string') {
      const encoder = new TextEncoder();
      keyData = encoder.encode(key).buffer;
    } else if (key) {
      keyData = key as ArrayBuffer;
    } else {
      // 如果没有提供密钥，生成一个随机密钥
      keyData = await this._generateRandomKey(keyStrength);
    }

    // 导入密钥
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-CBC', length: keyStrength },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 解析RSA密钥
   */
  private async _resolveRsaKey(
    key?: string | ArrayBuffer | CryptoKey | JsonWebKey,
    keyFormat?: KeyFormat,
    strength?: number
  ): Promise<CryptoKey> {
    // 如果已经是CryptoKey，直接返回
    if (key && typeof key === 'object' && 'type' in key) {
      return key as CryptoKey;
    }

    // 如果是JWK格式
    if (
      keyFormat === KeyFormat.JWK &&
      typeof key === 'object' &&
      !ArrayBuffer.isView(key)
    ) {
      return await crypto.subtle.importKey(
        'jwk',
        key as JsonWebKey,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt', 'decrypt']
      );
    }

    // 如果是PKCS8或SPKI格式
    if (
      key &&
      (keyFormat === KeyFormat.PKCS8 || keyFormat === KeyFormat.SPKI)
    ) {
      let keyData: ArrayBuffer;
      if (typeof key === 'string') {
        // 假设是base64编码的DER格式
        keyData = this._base64ToArrayBuffer(key);
      } else {
        keyData = key as ArrayBuffer;
      }

      return await crypto.subtle.importKey(
        keyFormat === KeyFormat.PKCS8 ? 'pkcs8' : 'spki',
        keyData,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        keyFormat === KeyFormat.PKCS8 ? ['decrypt'] : ['encrypt']
      );
    }

    // 如果没有提供密钥或格式不支持，生成一个新密钥对
    const keyStrength = strength || 2048;
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: keyStrength,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    // 返回公钥用于加密
    return keyPair.publicKey;
  }

  /**
   * 生成随机密钥
   */
  private async _generateRandomKey(bits: number): Promise<ArrayBuffer> {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-CBC',
        length: bits,
      },
      true,
      ['encrypt', 'decrypt']
    );

    return await crypto.subtle.exportKey('raw', key);
  }

  /**
   * 生成随机初始化向量
   */
  private _generateRandomIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  /**
   * Base64字符串转ArrayBuffer
   */
  private _base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * ArrayBuffer转Base64字符串
   */
  private _arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 加密数据
   * @param data 要加密的数据
   * @param _id 可选的标识符，用于缓存
   * @returns 加密后的数据
   */
  public async encrypt(
    data: ArrayBuffer | Blob | File,
    _id?: string
  ): Promise<ArrayBuffer> {
    // 处理不同类型的输入
    let buffer: ArrayBuffer;
    if (data instanceof Blob || data instanceof File) {
      buffer = await data.arrayBuffer();
    } else {
      buffer = data;
    }

    // 获取加密上下文
    const context = await this.prepareEncryptionContext();

    // 根据算法进行加密
    let encrypted: ArrayBuffer;

    if (
      this._options.algorithm === EncryptionAlgorithm.CUSTOM &&
      this._options.customEncrypt
    ) {
      // 使用自定义加密
      encrypted = await this._options.customEncrypt(buffer);
    } else if (context.algorithm === 'AES-CBC') {
      // 使用AES-CBC加密
      encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-CBC',
          iv: context.iv!,
        },
        context.key,
        buffer
      );

      // 为了解密时能够使用相同的IV，将IV附加到加密数据的前面
      const result = new Uint8Array(16 + encrypted.byteLength);
      result.set(context.iv!);
      result.set(new Uint8Array(encrypted), 16);
      encrypted = result.buffer;
    } else if (context.algorithm === 'RSA-OAEP') {
      // RSA有大小限制，可能需要分块加密
      // 对于大文件，应该使用混合加密（RSA加密AES密钥，AES加密数据）
      if (buffer.byteLength > 190) {
        // RSA-2048最大可加密约245字节，留些余量
        throw new Error('RSA加密数据过大，请使用AES算法或实现混合加密');
      }

      encrypted = await crypto.subtle.encrypt(
        {
          name: 'RSA-OAEP',
        },
        context.key,
        buffer
      );
    } else {
      throw new Error(`不支持的加密算法: ${context.algorithm}`);
    }

    return encrypted;
  }

  /**
   * 解密数据
   * @param data 要解密的数据
   * @param id 可选的标识符，用于缓存
   * @returns 解密后的数据
   */
  public async decrypt(data: ArrayBuffer, id?: string): Promise<ArrayBuffer> {
    // 如果启用了缓存且有缓存数据，直接返回
    if (
      this._options.cacheDecryptedData &&
      id &&
      this._decryptedCache.has(id)
    ) {
      return this._decryptedCache.get(id)!;
    }

    // 获取加密上下文
    const context = await this.prepareEncryptionContext();

    // 根据算法进行解密
    let decrypted: ArrayBuffer;

    if (
      this._options.algorithm === EncryptionAlgorithm.CUSTOM &&
      this._options.customDecrypt
    ) {
      // 使用自定义解密
      decrypted = await this._options.customDecrypt(data);
    } else if (context.algorithm === 'AES-CBC') {
      // 从加密数据中提取IV（前16字节）
      const iv = new Uint8Array(data.slice(0, 16));
      const encryptedData = data.slice(16);

      // 使用AES-CBC解密
      decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-CBC',
          iv,
        },
        context.key,
        encryptedData
      );
    } else if (context.algorithm === 'RSA-OAEP') {
      // 使用RSA-OAEP解密
      decrypted = await crypto.subtle.decrypt(
        {
          name: 'RSA-OAEP',
        },
        context.key,
        data
      );
    } else {
      throw new Error(`不支持的解密算法: ${context.algorithm}`);
    }

    // 如果启用了缓存，存储解密后的数据
    if (this._options.cacheDecryptedData && id) {
      this._decryptedCache.set(id, decrypted);
    }

    return decrypted;
  }

  /**
   * 加密文件名
   * @param filename 文件名
   * @returns 加密后的文件名
   */
  public async encryptFilename(filename: string): Promise<string> {
    if (!this._options.encryptFilename) {
      return filename;
    }

    // 将文件名转换为ArrayBuffer
    const encoder = new TextEncoder();
    const data = encoder.encode(filename).buffer;

    // 加密文件名
    const encrypted = await this.encrypt(data);

    // 将加密后的数据转换为Base64字符串
    return this._arrayBufferToBase64(encrypted);
  }

  /**
   * 解密文件名
   * @param encryptedFilename 加密后的文件名
   * @returns 解密后的文件名
   */
  public async decryptFilename(encryptedFilename: string): Promise<string> {
    if (!this._options.encryptFilename) {
      return encryptedFilename;
    }

    try {
      // 将Base64字符串转换为ArrayBuffer
      const data = this._base64ToArrayBuffer(encryptedFilename);

      // 解密文件名
      const decrypted = await this.decrypt(data);

      // 将解密后的数据转换为字符串
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('解密文件名失败:', error);
      return encryptedFilename;
    }
  }

  /**
   * 加密元数据
   * @param metadata 元数据对象
   * @returns 加密后的元数据字符串
   */
  public async encryptMetadata(metadata: Record<string, any>): Promise<string> {
    if (!this._options.encryptMetadata) {
      return JSON.stringify(metadata);
    }

    // 将元数据转换为JSON字符串
    const metadataString = JSON.stringify(metadata);

    // 将JSON字符串转换为ArrayBuffer
    const encoder = new TextEncoder();
    const data = encoder.encode(metadataString).buffer;

    // 加密元数据
    const encrypted = await this.encrypt(data);

    // 将加密后的数据转换为Base64字符串
    return this._arrayBufferToBase64(encrypted);
  }

  /**
   * 解密元数据
   * @param encryptedMetadata 加密后的元数据字符串
   * @returns 解密后的元数据对象
   */
  public async decryptMetadata(
    encryptedMetadata: string
  ): Promise<Record<string, any>> {
    if (!this._options.encryptMetadata) {
      try {
        return JSON.parse(encryptedMetadata);
      } catch {
        return {};
      }
    }

    try {
      // 将Base64字符串转换为ArrayBuffer
      const data = this._base64ToArrayBuffer(encryptedMetadata);

      // 解密元数据
      const decrypted = await this.decrypt(data);

      // 将解密后的数据转换为字符串
      const decoder = new TextDecoder();
      const metadataString = decoder.decode(decrypted);

      // 将JSON字符串转换为对象
      return JSON.parse(metadataString);
    } catch (error) {
      console.error('解密元数据失败:', error);
      return {};
    }
  }

  /**
   * 清除解密数据缓存
   */
  public clearCache(): void {
    this._decryptedCache.clear();
  }

  /**
   * 更新加密选项
   * @param options 新选项
   */
  public updateOptions(options: Partial<EncryptionOptions>): void {
    this._options = { ...this._options, ...options };

    // 如果算法或密钥发生变化，清除上下文缓存
    if (
      options.algorithm ||
      options.key ||
      options.keyFormat ||
      options.strength ||
      options.iv
    ) {
      this._encryptionContext = null;
    }

    // 如果缓存设置发生变化且禁用缓存，清除缓存
    if (options.cacheDecryptedData === false) {
      this.clearCache();
    }
  }
}
