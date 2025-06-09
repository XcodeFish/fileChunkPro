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

export default {
  calculateHash,
  encryptData,
  decryptData,
  generateEncryptionKey,
  exportKey,
  importKey,
  isEncryptionSupported,
  generateRandomPassword,
  generateCSRFToken,
  secureCompare,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateFileSignature,
};
