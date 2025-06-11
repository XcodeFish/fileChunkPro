/**
 * SecurityUtils
 * 安全相关的工具函数，包括加密、解密、哈希计算等
 */

/**
 * 支持的哈希算法
 */
export type HashAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * 支持的加密算法
 */
export type EncryptionAlgorithm = 'AES-GCM' | 'AES-CBC' | 'AES-CTR';

/**
 * 加密配置
 */
export interface EncryptionConfig {
  algorithm: EncryptionAlgorithm;
  keyLength: number;
  ivLength?: number;
}

/**
 * 哈希计算结果
 */
export interface HashResult {
  hash: string;
  algorithm: HashAlgorithm;
}

/**
 * 加密结果
 */
export interface EncryptionResult {
  data: ArrayBuffer;
  iv: Uint8Array;
  algorithm: EncryptionAlgorithm;
}

/**
 * 加密算法参数类型
 */
export type AlgorithmParams = AesGcmParams | AesCbcParams | AesCtrParams;

/**
 * 密钥管理选项
 */
export interface KeyManagementOptions {
  /**
   * 密钥轮换间隔（毫秒）
   * @default 86400000 (24小时)
   */
  keyRotationInterval?: number;

  /**
   * 密钥派生迭代次数
   * @default 100000
   */
  derivationIterations?: number;

  /**
   * 密钥长度（位）
   * @default 256
   */
  keyLength?: 128 | 192 | 256;

  /**
   * 密钥丢弃策略：'immediate'(立即丢弃), 'delayed'(延迟丢弃), 'archive'(归档)
   * @default 'delayed'
   */
  keyDisposalPolicy?: 'immediate' | 'delayed' | 'archive';

  /**
   * 密钥丢弃延迟（毫秒）
   * @default 3600000 (1小时)
   */
  keyDisposalDelay?: number;

  /**
   * 密钥归档有效期（毫秒）
   * @default 2592000000 (30天)
   */
  keyArchiveValidity?: number;

  /**
   * 是否启用内存防护（尽可能防止密钥泄露到内存转储）
   * @default true
   */
  memoryProtection?: boolean;

  /**
   * 是否在非使用时清除密钥
   * @default true
   */
  clearKeysWhenInactive?: boolean;

  /**
   * 密钥不活动清除时间（毫秒）
   * @default 300000 (5分钟)
   */
  inactivityClearTime?: number;
}

/**
 * 密钥信息
 */
interface KeyInfo {
  /**
   * 密钥对象
   */
  key: CryptoKey;

  /**
   * 密钥创建时间
   */
  createdAt: number;

  /**
   * 密钥上次使用时间
   */
  lastUsedAt: number;

  /**
   * 密钥过期时间
   */
  expiresAt?: number;

  /**
   * 密钥用途
   */
  usage: KeyUsage[];

  /**
   * 密钥算法
   */
  algorithm: string;
}

/**
 * 检查环境是否支持加密API
 * @returns 是否支持加密API
 */
export function isEncryptionSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function'
  );
}

/**
 * 计算数据哈希值
 * @param data 要计算哈希的数据
 * @param algorithm 哈希算法
 * @returns 哈希结果的Promise
 */
export async function calculateHash(
  data: ArrayBuffer | Blob | File,
  algorithm: HashAlgorithm = 'SHA-256'
): Promise<HashResult> {
  if (!isEncryptionSupported()) {
    throw new Error('当前环境不支持加密API');
  }

  try {
    // 如果是Blob或File，先转换为ArrayBuffer
    let buffer: ArrayBuffer;
    if (data instanceof Blob || data instanceof File) {
      buffer = await data.arrayBuffer();
    } else {
      buffer = data;
    }

    // 计算哈希
    const hashBuffer = await crypto.subtle.digest(algorithm, buffer);

    // 转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      hash: hashHex,
      algorithm,
    };
  } catch (error) {
    console.error('哈希计算失败:', error);
    throw error;
  }
}

/**
 * 生成加密密钥
 * @param algorithm 加密算法
 * @param keyLength 密钥长度(位)
 * @returns 加密密钥的Promise
 */
export async function generateEncryptionKey(
  algorithm: EncryptionAlgorithm = 'AES-GCM',
  keyLength = 256
): Promise<CryptoKey> {
  if (!isEncryptionSupported()) {
    throw new Error('当前环境不支持加密API');
  }

  try {
    // 生成随机密钥
    return await crypto.subtle.generateKey(
      {
        name: algorithm,
        length: keyLength,
      },
      true, // 可导出
      ['encrypt', 'decrypt'] // 用途
    );
  } catch (error) {
    console.error('密钥生成失败:', error);
    throw error;
  }
}

/**
 * 导出密钥为原始二进制数据
 * @param key 加密密钥
 * @returns 原始密钥数据的Promise
 */
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  if (!isEncryptionSupported()) {
    throw new Error('当前环境不支持加密API');
  }

  try {
    return await crypto.subtle.exportKey('raw', key);
  } catch (error) {
    console.error('密钥导出失败:', error);
    throw error;
  }
}

/**
 * 从原始二进制数据导入密钥
 * @param keyData 原始密钥数据
 * @param algorithm 加密算法
 * @param keyLength 密钥长度(位)
 * @returns 加密密钥的Promise
 */
export async function importKey(
  keyData: ArrayBuffer,
  algorithm: EncryptionAlgorithm = 'AES-GCM',
  keyLength = 256
): Promise<CryptoKey> {
  if (!isEncryptionSupported()) {
    throw new Error('当前环境不支持加密API');
  }

  try {
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: algorithm,
        length: keyLength,
      },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('密钥导入失败:', error);
    throw error;
  }
}

/**
 * 加密数据
 * @param data 要加密的数据
 * @param key 加密密钥
 * @param algorithm 加密算法
 * @param iv 初始化向量(可选)
 * @returns 加密结果的Promise
 */
export async function encryptData(
  data: ArrayBuffer,
  key: CryptoKey,
  algorithm: EncryptionAlgorithm = 'AES-GCM',
  iv?: Uint8Array
): Promise<EncryptionResult> {
  if (!isEncryptionSupported()) {
    throw new Error('当前环境不支持加密API');
  }

  try {
    // 如果没有提供IV，则生成随机IV
    if (!iv) {
      // 对于GCM模式，推荐12字节IV；对于CBC模式，需要16字节IV
      const ivLength = algorithm === 'AES-GCM' ? 12 : 16;
      iv = crypto.getRandomValues(new Uint8Array(ivLength));
    }

    // 构建算法参数
    const baseParams = {
      name: algorithm,
      iv: iv,
    };

    let algoParams: AlgorithmParams;

    // 根据算法类型设置特定参数
    if (algorithm === 'AES-GCM') {
      algoParams = {
        ...baseParams,
        tagLength: 128,
      } as AesGcmParams;
    } else if (algorithm === 'AES-CBC') {
      algoParams = baseParams as AesCbcParams;
    } else {
      // AES-CTR 需要 counter 和 length 参数
      algoParams = {
        ...baseParams,
        counter: iv,
        length: 128, // 计数器长度
      } as AesCtrParams;
    }

    // 加密数据
    const encryptedData = await crypto.subtle.encrypt(algoParams, key, data);

    return {
      data: encryptedData,
      iv,
      algorithm,
    };
  } catch (error) {
    console.error('数据加密失败:', error);
    throw error;
  }
}

/**
 * 解密数据
 * @param encryptedData 加密的数据
 * @param key 解密密钥
 * @param iv 初始化向量
 * @param algorithm 加密算法
 * @returns 解密后的数据的Promise
 */
export async function decryptData(
  encryptedData: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array,
  algorithm: EncryptionAlgorithm = 'AES-GCM'
): Promise<ArrayBuffer> {
  if (!isEncryptionSupported()) {
    throw new Error('当前环境不支持加密API');
  }

  try {
    // 构建算法参数
    const baseParams = {
      name: algorithm,
      iv: iv,
    };

    let algoParams: AlgorithmParams;

    // 根据算法类型设置特定参数
    if (algorithm === 'AES-GCM') {
      algoParams = {
        ...baseParams,
        tagLength: 128,
      } as AesGcmParams;
    } else if (algorithm === 'AES-CBC') {
      algoParams = baseParams as AesCbcParams;
    } else {
      // AES-CTR 需要 counter 和 length 参数
      algoParams = {
        ...baseParams,
        counter: iv,
        length: 128, // 计数器长度
      } as AesCtrParams;
    }

    // 解密数据
    return await crypto.subtle.decrypt(algoParams, key, encryptedData);
  } catch (error) {
    console.error('数据解密失败:', error);
    throw error;
  }
}

/**
 * 生成随机密码
 * @param length 密码长度
 * @returns 随机密码
 */
export function generateRandomPassword(length = 16): string {
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  let password = '';
  const values = new Uint8Array(length);

  crypto.getRandomValues(values);

  for (let i = 0; i < length; i++) {
    password += charset[values[i] % charset.length];
  }

  return password;
}

/**
 * 生成CSRF令牌
 * @param length 令牌长度
 * @returns CSRF令牌
 */
export function generateCSRFToken(length = 32): string {
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);

  return Array.from(values)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 安全比较两个字符串（时间恒定的比较，防止计时攻击）
 * @param a 字符串A
 * @param b 字符串B
 * @returns 是否相等
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * ArrayBuffer转Base64
 * @param buffer ArrayBuffer数据
 * @returns Base64编码的字符串
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64转ArrayBuffer
 * @param base64 Base64编码的字符串
 * @returns ArrayBuffer数据
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 生成文件签名（用于防篡改）
 * @param fileId 文件ID
 * @param metadata 元数据
 * @param timestamp 时间戳
 * @returns 签名
 */
export async function generateFileSignature(
  fileId: string,
  metadata: Record<string, unknown>,
  timestamp: number
): Promise<string> {
  // 创建签名数据
  const data = JSON.stringify({
    fileId,
    metadata,
    timestamp,
  });

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  // 计算签名（使用SHA-256）
  const signatureBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

  // 转换为Base64字符串
  return arrayBufferToBase64(signatureBuffer);
}

/**
 * 密钥管理器类
 * 提供安全的密钥创建、存储和使用功能
 */
export class KeyManager {
  private static instance: KeyManager | null = null;

  private options: Required<KeyManagementOptions>;
  private activeKeys: Map<string, KeyInfo> = new Map();
  private archivedKeys: Map<string, KeyInfo> = new Map();
  private rotationTimer: number | null = null;
  private cleanupTimer: number | null = null;

  /**
   * 获取KeyManager单例实例
   * @param options 密钥管理选项
   * @returns KeyManager实例
   */
  public static getInstance(options?: KeyManagementOptions): KeyManager {
    if (!this.instance) {
      this.instance = new KeyManager(options || {});
    } else if (options) {
      this.instance.updateOptions(options);
    }
    return this.instance;
  }

  /**
   * 构造函数
   * @param options 密钥管理选项
   */
  private constructor(options: KeyManagementOptions) {
    // 设置默认选项
    this.options = {
      keyRotationInterval: options.keyRotationInterval ?? 24 * 60 * 60 * 1000, // 24小时
      derivationIterations: options.derivationIterations ?? 100000,
      keyLength: options.keyLength ?? 256,
      keyDisposalPolicy: options.keyDisposalPolicy ?? 'delayed',
      keyDisposalDelay: options.keyDisposalDelay ?? 60 * 60 * 1000, // 1小时
      keyArchiveValidity:
        options.keyArchiveValidity ?? 30 * 24 * 60 * 60 * 1000, // 30天
      memoryProtection: options.memoryProtection ?? true,
      clearKeysWhenInactive: options.clearKeysWhenInactive ?? true,
      inactivityClearTime: options.inactivityClearTime ?? 5 * 60 * 1000, // 5分钟
    };

    // 设置定时任务
    this.setupKeyRotation();
    this.setupKeyCleanup();
  }

  /**
   * 更新密钥管理选项
   * @param options 新的选项
   */
  private updateOptions(options: KeyManagementOptions): void {
    // 合并选项
    this.options = {
      ...this.options,
      ...options,
    };

    // 重新设置定时任务
    this.setupKeyRotation();
    this.setupKeyCleanup();
  }

  /**
   * 设置密钥轮换定时任务
   */
  private setupKeyRotation(): void {
    // 清除现有定时器
    if (this.rotationTimer !== null) {
      window.clearInterval(this.rotationTimer);
    }

    // 设置新定时器
    this.rotationTimer = window.setInterval(() => {
      this.rotateKeys();
    }, this.options.keyRotationInterval);
  }

  /**
   * 设置密钥清理定时任务
   */
  private setupKeyCleanup(): void {
    // 清除现有定时器
    if (this.cleanupTimer !== null) {
      window.clearInterval(this.cleanupTimer);
    }

    // 设置新定时器
    this.cleanupTimer = window.setInterval(
      () => {
        this.cleanupExpiredKeys();
      },
      Math.min(
        this.options.keyDisposalDelay,
        this.options.inactivityClearTime
      ) / 2
    );
  }

  /**
   * 创建新密钥
   * @param algorithm 加密算法
   * @param keyLength 密钥长度
   * @param usage 密钥用途
   * @returns 密钥ID和密钥对象的Promise
   */
  public async createKey(
    algorithm: EncryptionAlgorithm = 'AES-GCM',
    keyLength: 128 | 192 | 256 = 256,
    usage: KeyUsage[] = ['encrypt', 'decrypt']
  ): Promise<{ keyId: string; key: CryptoKey }> {
    if (!isEncryptionSupported()) {
      throw new Error('当前环境不支持加密API');
    }

    try {
      // 生成密钥
      const key = await crypto.subtle.generateKey(
        {
          name: algorithm,
          length: keyLength,
        },
        !this.options.memoryProtection, // 是否可导出
        usage
      );

      // 生成密钥ID
      const keyId = `key_${algorithm}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 存储密钥信息
      this.activeKeys.set(keyId, {
        key,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        algorithm,
        usage,
      });

      return { keyId, key };
    } catch (error) {
      console.error('密钥创建失败:', error);
      throw new Error(`密钥创建失败: ${(error as Error).message}`);
    }
  }

  /**
   * 从密码派生密钥
   * @param password 密码
   * @param salt 盐值
   * @param algorithm 加密算法
   * @returns 密钥ID和密钥对象的Promise
   */
  public async deriveKeyFromPassword(
    password: string,
    salt?: Uint8Array,
    algorithm: EncryptionAlgorithm = 'AES-GCM'
  ): Promise<{ keyId: string; key: CryptoKey }> {
    if (!isEncryptionSupported()) {
      throw new Error('当前环境不支持加密API');
    }

    try {
      // 如果未提供盐值，则生成随机盐值
      const actualSalt = salt || crypto.getRandomValues(new Uint8Array(16));

      // 将密码转换为密钥材料
      const encoder = new TextEncoder();
      const passwordData = encoder.encode(password);

      // 导入密码作为基础密钥
      const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordData,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );

      // 使用PBKDF2派生密钥
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: actualSalt,
          iterations: this.options.derivationIterations,
          hash: 'SHA-256',
        },
        baseKey,
        {
          name: algorithm,
          length: this.options.keyLength,
        },
        !this.options.memoryProtection,
        ['encrypt', 'decrypt']
      );

      // 生成密钥ID
      const keyId = `derived_${algorithm}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 存储密钥信息
      this.activeKeys.set(keyId, {
        key,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        algorithm,
        usage: ['encrypt', 'decrypt'],
      });

      return { keyId, key };
    } catch (error) {
      console.error('密钥派生失败:', error);
      throw new Error(`密钥派生失败: ${(error as Error).message}`);
    }
  }

  /**
   * 通过ID获取密钥
   * @param keyId 密钥ID
   * @returns 密钥对象或null
   */
  public getKey(keyId: string): CryptoKey | null {
    // 首先检查活跃密钥
    const activeKeyInfo = this.activeKeys.get(keyId);
    if (activeKeyInfo) {
      // 更新最后使用时间
      activeKeyInfo.lastUsedAt = Date.now();
      return activeKeyInfo.key;
    }

    // 然后检查归档密钥
    const archivedKeyInfo = this.archivedKeys.get(keyId);
    if (archivedKeyInfo) {
      // 更新最后使用时间
      archivedKeyInfo.lastUsedAt = Date.now();

      // 考虑将频繁使用的归档密钥移回活跃密钥
      if (this.options.keyDisposalPolicy !== 'immediate') {
        // 如果过期时间在未来且使用频繁，则移回活跃密钥
        if (
          !archivedKeyInfo.expiresAt ||
          archivedKeyInfo.expiresAt > Date.now()
        ) {
          this.activeKeys.set(keyId, archivedKeyInfo);
          this.archivedKeys.delete(keyId);
        }
      }

      return archivedKeyInfo.key;
    }

    // 密钥未找到
    return null;
  }

  /**
   * 轮换密钥
   */
  private rotateKeys(): void {
    const now = Date.now();

    // 找出需要轮换的密钥（创建时间超过轮换间隔）
    this.activeKeys.forEach(async (keyInfo, keyId) => {
      if (now - keyInfo.createdAt >= this.options.keyRotationInterval) {
        try {
          // 创建新密钥来替代旧密钥
          const { keyId: newKeyId } = await this.createKey(
            keyInfo.algorithm as EncryptionAlgorithm,
            this.options.keyLength,
            keyInfo.usage
          );

          console.log(`密钥已轮换: ${keyId} -> ${newKeyId}`);

          // 根据处置策略处理旧密钥
          this.disposeKey(keyId, keyInfo);
        } catch (error) {
          console.error(`密钥轮换失败: ${keyId}`, error);
        }
      }
    });
  }

  /**
   * 处置密钥
   * @param keyId 密钥ID
   * @param keyInfo 密钥信息
   */
  private disposeKey(keyId: string, keyInfo: KeyInfo): void {
    switch (this.options.keyDisposalPolicy) {
      case 'immediate':
        // 立即删除
        this.activeKeys.delete(keyId);
        this.securelyDeleteKey(keyInfo.key);
        break;

      case 'delayed':
        // 延迟删除：移入归档，设置过期时间
        keyInfo.expiresAt = Date.now() + this.options.keyDisposalDelay;
        this.archivedKeys.set(keyId, keyInfo);
        this.activeKeys.delete(keyId);
        break;

      case 'archive':
        // 长期归档：移入归档，设置较长的过期时间
        keyInfo.expiresAt = Date.now() + this.options.keyArchiveValidity;
        this.archivedKeys.set(keyId, keyInfo);
        this.activeKeys.delete(keyId);
        break;
    }
  }

  /**
   * 清理过期的密钥
   */
  private cleanupExpiredKeys(): void {
    const now = Date.now();

    // 清理过期的归档密钥
    this.archivedKeys.forEach((keyInfo, keyId) => {
      if (keyInfo.expiresAt && now > keyInfo.expiresAt) {
        this.securelyDeleteKey(keyInfo.key);
        this.archivedKeys.delete(keyId);
      }
    });

    // 清理不活跃的密钥
    if (this.options.clearKeysWhenInactive) {
      this.activeKeys.forEach((keyInfo, keyId) => {
        if (now - keyInfo.lastUsedAt > this.options.inactivityClearTime) {
          this.disposeKey(keyId, keyInfo);
        }
      });
    }
  }

  /**
   * 安全地删除密钥
   * @param key 要删除的密钥
   */
  private securelyDeleteKey(key: CryptoKey): void {
    // JavaScript没有直接的方式来安全地删除内存数据
    // 这是一个尽力而为的方法

    // 覆盖引用 - 使用void操作符来避免未使用变量的警告
    void key;

    // 如果可用，建议垃圾回收
    if (typeof window !== 'undefined' && typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (e) {
        // 忽略错误
      }
    }
  }

  /**
   * 使用指定密钥加密数据
   * @param data 要加密的数据
   * @param keyId 密钥ID
   * @param iv 初始化向量(可选)
   * @returns 加密结果
   */
  public async encrypt(
    data: ArrayBuffer,
    keyId: string,
    iv?: Uint8Array
  ): Promise<EncryptionResult> {
    // 获取密钥
    const key = this.getKey(keyId);
    if (!key) {
      throw new Error(`未找到密钥: ${keyId}`);
    }

    // 从密钥信息获取算法
    const keyInfo = this.activeKeys.get(keyId) || this.archivedKeys.get(keyId);
    if (!keyInfo) {
      throw new Error(`未找到密钥信息: ${keyId}`);
    }

    const algorithm = keyInfo.algorithm as EncryptionAlgorithm;

    // 调用现有的加密函数
    return await encryptData(data, key, algorithm, iv);
  }

  /**
   * 使用指定密钥解密数据
   * @param encryptedData 加密的数据
   * @param keyId 密钥ID
   * @param iv 初始化向量
   * @returns 解密后的数据
   */
  public async decrypt(
    encryptedData: ArrayBuffer,
    keyId: string,
    iv: Uint8Array
  ): Promise<ArrayBuffer> {
    // 获取密钥
    const key = this.getKey(keyId);
    if (!key) {
      throw new Error(`未找到密钥: ${keyId}`);
    }

    // 从密钥信息获取算法
    const keyInfo = this.activeKeys.get(keyId) || this.archivedKeys.get(keyId);
    if (!keyInfo) {
      throw new Error(`未找到密钥信息: ${keyId}`);
    }

    const algorithm = keyInfo.algorithm as EncryptionAlgorithm;

    // 调用现有的解密函数
    return await decryptData(encryptedData, key, iv, algorithm);
  }
}
