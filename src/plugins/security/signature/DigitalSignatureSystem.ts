/**
 * 数字签名系统
 * 为文件提供完整性验证和身份认证
 */

/**
 * 签名算法类型
 */
export type SignatureAlgorithm = 'RSA' | 'ECDSA' | 'Ed25519';

/**
 * 哈希算法类型
 */
export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * 密钥对
 */
export interface KeyPair {
  /**
   * 公钥
   */
  publicKey: string;

  /**
   * 私钥
   */
  privateKey?: string;
}

/**
 * 签名结果
 */
export interface SignatureResult {
  /**
   * 签名值
   */
  signature: string;

  /**
   * 签名时间戳
   */
  timestamp: number;

  /**
   * 签名算法
   */
  algorithm: SignatureAlgorithm;

  /**
   * 哈希算法
   */
  hashAlgorithm: HashAlgorithm;

  /**
   * 签名者ID
   */
  signerId?: string;

  /**
   * 签名内容的哈希值
   */
  contentHash: string;

  /**
   * 签名元数据
   */
  metadata?: Record<string, any>;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  /**
   * 验证是否成功
   */
  isValid: boolean;

  /**
   * 错误信息（如果验证失败）
   */
  error?: string;

  /**
   * 签名信息
   */
  signatureInfo?: SignatureResult;

  /**
   * 验证时间戳
   */
  verificationTimestamp: number;
}

/**
 * 数字签名选项
 */
export interface DigitalSignatureOptions {
  /**
   * 签名算法
   * @default 'ECDSA'
   */
  algorithm?: SignatureAlgorithm;

  /**
   * 哈希算法
   * @default 'SHA-256'
   */
  hashAlgorithm?: HashAlgorithm;

  /**
   * 自定义密钥对
   */
  customKeyPair?: KeyPair;

  /**
   * 签名包含的字段
   * @default ['fileName', 'fileSize', 'fileType', 'timestamp']
   */
  signedFields?: string[];

  /**
   * 签名者ID
   */
  signerId?: string;

  /**
   * 是否验证服务器签名
   * @default true
   */
  verifyServerSignature?: boolean;

  /**
   * 服务器公钥
   */
  serverPublicKey?: string;

  /**
   * 自定义签名函数
   */
  customSignFunction?: (data: ArrayBuffer) => Promise<string>;

  /**
   * 自定义验证函数
   */
  customVerifyFunction?: (
    data: ArrayBuffer,
    signature: string,
    publicKey: string
  ) => Promise<boolean>;
}

/**
 * 数字签名系统
 * 为文件提供完整性验证和身份认证
 */
export default class DigitalSignatureSystem {
  /**
   * 签名选项
   */
  private options: DigitalSignatureOptions;

  /**
   * 密钥对
   * 如果不提供自定义密钥对，将在构造函数中生成
   */
  private keyPair: KeyPair | null = null;

  /**
   * 构造函数
   * @param options 签名选项
   */
  constructor(options?: DigitalSignatureOptions) {
    this.options = {
      algorithm: 'ECDSA',
      hashAlgorithm: 'SHA-256',
      signedFields: ['fileName', 'fileSize', 'fileType', 'timestamp'],
      verifyServerSignature: true,
      ...options,
    };

    // 初始化签名系统
    this.initialize();
  }

  /**
   * 初始化签名系统
   */
  private async initialize(): Promise<void> {
    try {
      // 如果提供了自定义密钥对，使用它
      if (this.options.customKeyPair) {
        this.keyPair = this.options.customKeyPair;
      } else {
        // 否则生成新的密钥对
        this.keyPair = await this.generateKeyPair();
      }
    } catch (error) {
      console.error('数字签名系统初始化失败:', error);
      throw new Error(`数字签名系统初始化失败: ${(error as Error).message}`);
    }
  }

  /**
   * 生成密钥对
   * @returns 密钥对
   */
  private async generateKeyPair(): Promise<KeyPair> {
    try {
      // 检查Web Crypto API是否可用
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('当前环境不支持Web Crypto API');
      }

      let algorithm: any;
      let exportParams: any;

      // 根据选择的算法设置参数
      switch (this.options.algorithm) {
        case 'RSA':
          algorithm = {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
            hash: { name: this.getSubtleHashAlgorithm() },
          };
          exportParams = ['spki', 'pkcs8'];
          break;
        case 'ECDSA':
          algorithm = {
            name: 'ECDSA',
            namedCurve: 'P-256',
          };
          exportParams = ['spki', 'pkcs8'];
          break;
        case 'Ed25519':
          // Web Crypto API目前不直接支持Ed25519
          // 这里使用ECDSA作为替代，实际项目中可能需要使用第三方库
          console.warn('Web Crypto API不直接支持Ed25519，使用ECDSA P-256代替');
          algorithm = {
            name: 'ECDSA',
            namedCurve: 'P-256',
          };
          exportParams = ['spki', 'pkcs8'];
          break;
        default:
          algorithm = {
            name: 'ECDSA',
            namedCurve: 'P-256',
          };
          exportParams = ['spki', 'pkcs8'];
      }

      // 生成密钥对
      const keyPair = await crypto.subtle.generateKey(algorithm, true, [
        'sign',
        'verify',
      ]);

      // 导出公钥
      const publicKeyBuffer = await crypto.subtle.exportKey(
        exportParams[0],
        keyPair.publicKey
      );
      const publicKey = this.arrayBufferToBase64(publicKeyBuffer);

      // 导出私钥
      const privateKeyBuffer = await crypto.subtle.exportKey(
        exportParams[1],
        keyPair.privateKey
      );
      const privateKey = this.arrayBufferToBase64(privateKeyBuffer);

      return {
        publicKey,
        privateKey,
      };
    } catch (error) {
      console.error('生成密钥对失败:', error);
      throw new Error(`生成密钥对失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取Web Crypto API支持的哈希算法名称
   * @returns 哈希算法名称
   */
  private getSubtleHashAlgorithm(): string {
    switch (this.options.hashAlgorithm) {
      case 'SHA-256':
        return 'SHA-256';
      case 'SHA-384':
        return 'SHA-384';
      case 'SHA-512':
        return 'SHA-512';
      default:
        return 'SHA-256';
    }
  }

  /**
   * 为文件生成签名
   * @param file 文件对象
   * @param fileInfo 文件信息
   * @returns 签名结果
   */
  public async signFile(
    file: File | Blob,
    fileInfo: Record<string, any>
  ): Promise<SignatureResult> {
    try {
      if (!this.keyPair?.privateKey) {
        throw new Error('私钥不可用，无法生成签名');
      }

      // 准备签名数据
      const signatureData = await this.prepareSignatureData(file, fileInfo);

      // 计算内容哈希
      const contentHash = await this.calculateHash(signatureData);

      // 生成签名
      let signature: string;
      if (this.options.customSignFunction) {
        // 使用自定义签名函数
        signature = await this.options.customSignFunction(signatureData);
      } else {
        // 使用Web Crypto API生成签名
        signature = await this.signWithWebCrypto(signatureData);
      }

      // 构建签名结果
      return {
        signature,
        timestamp: Date.now(),
        algorithm: this.options.algorithm || 'ECDSA',
        hashAlgorithm: this.options.hashAlgorithm || 'SHA-256',
        signerId: this.options.signerId,
        contentHash,
        metadata: {
          signedFields: this.options.signedFields,
          ...this.extractSignedFields(fileInfo),
        },
      };
    } catch (error) {
      console.error('文件签名失败:', error);
      throw new Error(`文件签名失败: ${(error as Error).message}`);
    }
  }

  /**
   * 验证文件签名
   * @param file 文件对象
   * @param fileInfo 文件信息
   * @param signatureResult 签名结果
   * @param publicKey 用于验证的公钥，如果不提供则使用当前系统的公钥
   * @returns 验证结果
   */
  public async verifySignature(
    file: File | Blob,
    fileInfo: Record<string, any>,
    signatureResult: SignatureResult,
    publicKey?: string
  ): Promise<VerificationResult> {
    try {
      // 使用提供的公钥或系统公钥
      const verificationKey = publicKey || this.keyPair?.publicKey;
      if (!verificationKey) {
        throw new Error('公钥不可用，无法验证签名');
      }

      // 准备验证数据
      const verificationData = await this.prepareSignatureData(file, fileInfo);

      // 计算内容哈希并检查是否匹配
      const contentHash = await this.calculateHash(verificationData);
      if (contentHash !== signatureResult.contentHash) {
        return {
          isValid: false,
          error: '内容哈希不匹配，文件可能已被修改',
          verificationTimestamp: Date.now(),
        };
      }

      // 验证签名
      let isValid: boolean;
      if (this.options.customVerifyFunction) {
        // 使用自定义验证函数
        isValid = await this.options.customVerifyFunction(
          verificationData,
          signatureResult.signature,
          verificationKey
        );
      } else {
        // 使用Web Crypto API验证签名
        isValid = await this.verifyWithWebCrypto(
          verificationData,
          signatureResult.signature,
          verificationKey
        );
      }

      return {
        isValid,
        signatureInfo: signatureResult,
        verificationTimestamp: Date.now(),
        error: isValid ? undefined : '签名验证失败，文件可能已被篡改',
      };
    } catch (error) {
      console.error('签名验证失败:', error);
      return {
        isValid: false,
        error: `签名验证失败: ${(error as Error).message}`,
        verificationTimestamp: Date.now(),
      };
    }
  }

  /**
   * 验证服务器签名
   * @param data 数据
   * @param serverSignature 服务器签名
   * @returns 验证结果
   */
  public async verifyServerSignature(
    data: ArrayBuffer,
    serverSignature: string
  ): Promise<VerificationResult> {
    try {
      if (!this.options.serverPublicKey) {
        throw new Error('未提供服务器公钥，无法验证服务器签名');
      }

      // 验证签名
      let isValid: boolean;
      if (this.options.customVerifyFunction) {
        // 使用自定义验证函数
        isValid = await this.options.customVerifyFunction(
          data,
          serverSignature,
          this.options.serverPublicKey
        );
      } else {
        // 使用Web Crypto API验证签名
        isValid = await this.verifyWithWebCrypto(
          data,
          serverSignature,
          this.options.serverPublicKey
        );
      }

      return {
        isValid,
        verificationTimestamp: Date.now(),
        error: isValid ? undefined : '服务器签名验证失败，响应可能已被篡改',
      };
    } catch (error) {
      console.error('服务器签名验证失败:', error);
      return {
        isValid: false,
        error: `服务器签名验证失败: ${(error as Error).message}`,
        verificationTimestamp: Date.now(),
      };
    }
  }

  /**
   * 准备签名数据
   * @param file 文件对象
   * @param fileInfo 文件信息
   * @returns 签名数据
   */
  private async prepareSignatureData(
    file: File | Blob,
    fileInfo: Record<string, any>
  ): Promise<ArrayBuffer> {
    try {
      // 1. 从文件中读取内容
      const fileContent = await this.readFileAsArrayBuffer(file);

      // 2. 提取需要签名的字段
      const signedFields = this.extractSignedFields(fileInfo);

      // 3. 将字段信息转换为JSON字符串，再转换为ArrayBuffer
      const fieldsString = JSON.stringify(signedFields);
      const fieldsBuffer = this.stringToArrayBuffer(fieldsString);

      // 4. 合并文件内容和字段信息
      const mergedBuffer = this.concatenateArrayBuffers(
        fileContent,
        fieldsBuffer
      );

      return mergedBuffer;
    } catch (error) {
      console.error('准备签名数据失败:', error);
      throw new Error(`准备签名数据失败: ${(error as Error).message}`);
    }
  }

  /**
   * 提取需要签名的字段
   * @param fileInfo 文件信息
   * @returns 提取的字段
   */
  private extractSignedFields(
    fileInfo: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};
    const fields = this.options.signedFields || [];

    for (const field of fields) {
      if (field in fileInfo) {
        result[field] = fileInfo[field];
      }
    }

    // 添加时间戳（如果不在指定字段中）
    if (!result.timestamp) {
      result.timestamp = Date.now();
    }

    return result;
  }

  /**
   * 使用Web Crypto API生成签名
   * @param data 要签名的数据
   * @returns 签名字符串
   */
  private async signWithWebCrypto(data: ArrayBuffer): Promise<string> {
    try {
      if (!this.keyPair?.privateKey) {
        throw new Error('私钥不可用，无法生成签名');
      }

      // 导入私钥
      const privateKey = await this.importPrivateKey(this.keyPair.privateKey);

      // 签名参数
      let algorithm: any;
      switch (this.options.algorithm) {
        case 'RSA':
          algorithm = {
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
          break;
        case 'ECDSA':
        case 'Ed25519': // 用ECDSA代替
          algorithm = {
            name: 'ECDSA',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
          break;
        default:
          algorithm = {
            name: 'ECDSA',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
      }

      // 使用私钥签名
      const signatureBuffer = await crypto.subtle.sign(
        algorithm,
        privateKey,
        data
      );

      // 转换为Base64字符串
      return this.arrayBufferToBase64(signatureBuffer);
    } catch (error) {
      console.error('Web Crypto API签名失败:', error);
      throw new Error(`Web Crypto API签名失败: ${(error as Error).message}`);
    }
  }

  /**
   * 使用Web Crypto API验证签名
   * @param data 原始数据
   * @param signature Base64编码的签名
   * @param publicKeyBase64 Base64编码的公钥
   * @returns 验证结果
   */
  private async verifyWithWebCrypto(
    data: ArrayBuffer,
    signature: string,
    publicKeyBase64: string
  ): Promise<boolean> {
    try {
      // 导入公钥
      const publicKey = await this.importPublicKey(publicKeyBase64);

      // 转换签名
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      // 验证参数
      let algorithm: any;
      switch (this.options.algorithm) {
        case 'RSA':
          algorithm = {
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
          break;
        case 'ECDSA':
        case 'Ed25519': // 用ECDSA代替
          algorithm = {
            name: 'ECDSA',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
          break;
        default:
          algorithm = {
            name: 'ECDSA',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
      }

      // 验证签名
      return await crypto.subtle.verify(
        algorithm,
        publicKey,
        signatureBuffer,
        data
      );
    } catch (error) {
      console.error('Web Crypto API验证失败:', error);
      throw new Error(`Web Crypto API验证失败: ${(error as Error).message}`);
    }
  }

  /**
   * 导入公钥
   * @param publicKeyBase64 Base64编码的公钥
   * @returns CryptoKey对象
   */
  private async importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
    try {
      const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyBase64);

      let algorithm: any;
      switch (this.options.algorithm) {
        case 'RSA':
          algorithm = {
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
          break;
        case 'ECDSA':
        case 'Ed25519': // 用ECDSA代替
          algorithm = {
            name: 'ECDSA',
            namedCurve: 'P-256',
          };
          break;
        default:
          algorithm = {
            name: 'ECDSA',
            namedCurve: 'P-256',
          };
      }

      return await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        algorithm,
        true,
        ['verify']
      );
    } catch (error) {
      console.error('导入公钥失败:', error);
      throw new Error(`导入公钥失败: ${(error as Error).message}`);
    }
  }

  /**
   * 导入私钥
   * @param privateKeyBase64 Base64编码的私钥
   * @returns CryptoKey对象
   */
  private async importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
    try {
      const privateKeyBuffer = this.base64ToArrayBuffer(privateKeyBase64);

      let algorithm: any;
      switch (this.options.algorithm) {
        case 'RSA':
          algorithm = {
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: this.getSubtleHashAlgorithm() },
          };
          break;
        case 'ECDSA':
        case 'Ed25519': // 用ECDSA代替
          algorithm = {
            name: 'ECDSA',
            namedCurve: 'P-256',
          };
          break;
        default:
          algorithm = {
            name: 'ECDSA',
            namedCurve: 'P-256',
          };
      }

      return await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        algorithm,
        true,
        ['sign']
      );
    } catch (error) {
      console.error('导入私钥失败:', error);
      throw new Error(`导入私钥失败: ${(error as Error).message}`);
    }
  }

  /**
   * 计算数据哈希值
   * @param data 要计算哈希的数据
   * @returns 哈希值的Base64字符串
   */
  private async calculateHash(data: ArrayBuffer): Promise<string> {
    try {
      const hashBuffer = await crypto.subtle.digest(
        this.getSubtleHashAlgorithm(),
        data
      );
      return this.arrayBufferToBase64(hashBuffer);
    } catch (error) {
      console.error('计算哈希失败:', error);
      throw new Error(`计算哈希失败: ${(error as Error).message}`);
    }
  }

  /**
   * 将文件读取为ArrayBuffer
   * @param file 文件对象
   * @returns 文件内容的ArrayBuffer
   */
  private async readFileAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('文件读取结果不是ArrayBuffer'));
        }
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 将字符串转换为ArrayBuffer
   * @param str 字符串
   * @returns ArrayBuffer
   */
  private stringToArrayBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }

  /**
   * 连接两个ArrayBuffer
   * @param buffer1 第一个ArrayBuffer
   * @param buffer2 第二个ArrayBuffer
   * @returns 连接后的ArrayBuffer
   */
  private concatenateArrayBuffers(
    buffer1: ArrayBuffer,
    buffer2: ArrayBuffer
  ): ArrayBuffer {
    const result = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    result.set(new Uint8Array(buffer1), 0);
    result.set(new Uint8Array(buffer2), buffer1.byteLength);
    return result.buffer;
  }

  /**
   * 将ArrayBuffer转换为Base64字符串
   * @param buffer ArrayBuffer
   * @returns Base64字符串
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    // 在浏览器环境中使用btoa
    if (typeof btoa === 'function') {
      const binary = Array.from(new Uint8Array(buffer))
        .map(b => String.fromCharCode(b))
        .join('');
      return btoa(binary);
    }

    // 在Node.js环境中使用Buffer
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(buffer).toString('base64');
    }

    throw new Error('无法转换ArrayBuffer为Base64：环境不支持btoa或Buffer');
  }

  /**
   * 将Base64字符串转换为ArrayBuffer
   * @param base64 Base64字符串
   * @returns ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    // 在浏览器环境中使用atob
    if (typeof atob === 'function') {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    // 在Node.js环境中使用Buffer
    if (typeof Buffer !== 'undefined') {
      const buffer = Buffer.from(base64, 'base64');
      return new Uint8Array(buffer).buffer;
    }

    throw new Error('无法转换Base64为ArrayBuffer：环境不支持atob或Buffer');
  }

  /**
   * 获取公钥
   * @returns 公钥的Base64字符串
   */
  public getPublicKey(): string | null {
    return this.keyPair?.publicKey || null;
  }

  /**
   * 设置服务器公钥
   * @param publicKey 服务器公钥
   */
  public setServerPublicKey(publicKey: string): void {
    this.options.serverPublicKey = publicKey;
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    // 清除敏感信息
    if (this.keyPair?.privateKey) {
      this.keyPair.privateKey = '';
    }
    this.keyPair = null;
  }
}
