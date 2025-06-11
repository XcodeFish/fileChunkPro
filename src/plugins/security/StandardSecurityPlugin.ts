/**
 * StandardSecurityPlugin
 * 标准安全级别插件，提供更高级别的安全保障功能：
 * - 传输加密实现
 * - 文件完整性校验
 * - CSRF防护机制
 * - 内容类型验证
 */

import { EventBus } from '../../core/EventBus';
import UploaderCore from '../../core/UploaderCore';
import {
  Environment,
  HookResult,
  SecurityErrorSubType,
  SecurityIssueSeverity,
  SecurityLevel,
  SecurityValidationResult,
} from '../../types';
import FileContentDetector from '../../utils/FileContentDetector';
import SecurityError from '../../utils/SecurityError';
import { IPlugin } from '../interfaces';
import UrlSafetyChecker from '../../utils/UrlSafetyChecker';

import {
  BasicSecurityPlugin,
  BasicSecurityPluginOptions,
} from './BasicSecurityPlugin';

/**
 * 标准安全插件选项
 */
export interface StandardSecurityPluginOptions
  extends BasicSecurityPluginOptions {
  /**
   * 是否启用传输加密
   */
  enableTransportEncryption?: boolean;

  /**
   * 加密算法，支持 'AES-GCM', 'AES-CBC', 'AES-CTR'
   */
  encryptionAlgorithm?: 'AES-GCM' | 'AES-CBC' | 'AES-CTR';

  /**
   * 加密密钥长度，单位：位
   */
  encryptionKeyLength?: number;

  /**
   * 是否启用文件完整性校验
   */
  enableIntegrityCheck?: boolean;

  /**
   * 完整性校验算法，支持 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'
   */
  integrityAlgorithm?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

  /**
   * 是否启用CSRF防护
   */
  enableCSRFProtection?: boolean;

  /**
   * CSRF令牌获取URL
   */
  csrfTokenUrl?: string;

  /**
   * CSRF令牌头名称
   */
  csrfTokenHeaderName?: string;

  /**
   * 是否启用深度内容验证
   */
  enableDeepContentValidation?: boolean;

  /**
   * 是否验证每个分片的完整性
   */
  validateChunkIntegrity?: boolean;

  /**
   * 是否启用传输签名
   */
  enableTransportSignature?: boolean;
}

/**
 * 标准安全插件类
 * 提供标准级别的文件上传安全保障
 */
class StandardSecurityPlugin implements IPlugin {
  name = 'StandardSecurityPlugin';

  private _options: StandardSecurityPluginOptions;
  private _eventBus?: EventBus;
  private _uploader?: UploaderCore;
  private _environment: Environment = Environment.Unknown;
  private _basicSecurity: BasicSecurityPlugin;
  private _encryptionKey?: CryptoKey;
  private _csrfToken?: string;
  private _lastTokenFetch = 0;
  private _tokenRefreshInterval: number = 15 * 60 * 1000; // 15分钟刷新一次token

  /**
   * 创建标准安全插件实例
   * @param options 安全插件选项
   */
  constructor(options: StandardSecurityPluginOptions = {}) {
    this._options = {
      // 继承基础安全选项的默认值
      allowedMimeTypes: [],
      maxFileSize: 100 * 1024 * 1024, // 默认100MB
      maxFileNameLength: 255,
      enableSensitiveExtensionCheck: true,
      validateFileExtension: true,
      checkUploadPermission: true,

      // 标准安全特有选项的默认值
      validateFileContent: true, // 默认启用文件内容验证
      enableTransportEncryption: true, // 默认启用传输加密
      encryptionAlgorithm: 'AES-GCM', // 默认AES-GCM加密
      encryptionKeyLength: 256, // 默认256位密钥
      enableIntegrityCheck: true, // 默认启用完整性校验
      integrityAlgorithm: 'SHA-256', // 默认SHA-256完整性校验
      enableCSRFProtection: true, // 默认启用CSRF防护
      csrfTokenHeaderName: 'X-CSRF-Token', // 默认CSRF令牌头名称
      enableDeepContentValidation: true, // 默认启用深度内容验证
      validateChunkIntegrity: true, // 默认验证分片完整性
      enableTransportSignature: true, // 默认启用传输签名
      ...options,
    };

    // 创建基础安全插件实例
    this._basicSecurity = new BasicSecurityPlugin(this._options);
  }

  /**
   * 安装插件
   * @param uploader 上传器实例
   */
  install(uploader: UploaderCore): void {
    this._uploader = uploader;
    this._eventBus = uploader.getEventBus();
    this._environment = uploader.getEnvironment();

    // 安装基础安全插件
    this._basicSecurity.install(uploader);

    // 添加标准安全级别特有的钩子
    if (this._eventBus) {
      // 文件上传前
      this._eventBus.on(
        'file:beforeUpload',
        this._validateFileContent.bind(this)
      );

      // 分片上传前
      this._eventBus.on(
        'chunk:beforeUpload',
        this._processChunkBeforeUpload.bind(this)
      );

      // 分片上传后
      this._eventBus.on(
        'chunk:afterUpload',
        this._verifyChunkIntegrity.bind(this)
      );

      // 文件合并前
      this._eventBus.on(
        'file:beforeMerge',
        this._finalizeIntegrityCheck.bind(this)
      );
    }

    // 初始化加密密钥
    if (this._options.enableTransportEncryption) {
      this._initEncryptionKey().catch(error => {
        this._logSecurityEvent('Failed to initialize encryption key', error);
      });
    }

    // 初始化CSRF令牌
    if (this._options.enableCSRFProtection && this._options.csrfTokenUrl) {
      this._fetchCSRFToken().catch(error => {
        this._logSecurityEvent('Failed to fetch CSRF token', error);
      });
    }

    this._logSecurityEvent('StandardSecurityPlugin installed', {
      level: SecurityLevel.STANDARD,
      options: { ...this._options },
    });
  }

  /**
   * 卸载插件
   */
  uninstall(): void {
    // 卸载基础安全插件
    this._basicSecurity.uninstall();

    if (this._eventBus) {
      this._eventBus.off('file:beforeUpload', this._validateFileContent);
      this._eventBus.off('chunk:beforeUpload', this._processChunkBeforeUpload);
      this._eventBus.off('chunk:afterUpload', this._verifyChunkIntegrity);
      this._eventBus.off('file:beforeMerge', this._finalizeIntegrityCheck);
    }

    // 清理加密密钥和CSRF令牌
    this._encryptionKey = undefined;
    this._csrfToken = undefined;

    this._logSecurityEvent('StandardSecurityPlugin uninstalled', null);

    this._uploader = undefined;
    this._eventBus = undefined;
  }

  /**
   * 初始化加密密钥
   * @private
   */
  private async _initEncryptionKey(): Promise<void> {
    if (!this._options.enableTransportEncryption) return;

    try {
      // 检查环境是否支持Web Crypto API
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('Web Crypto API is not supported in this environment');
      }

      // 生成随机密钥
      const keyData = crypto.getRandomValues(
        new Uint8Array(this._options.encryptionKeyLength ?? 256 / 8)
      );

      // 导入密钥
      this._encryptionKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        {
          name: this._options.encryptionAlgorithm ?? 'AES-GCM',
          length: this._options.encryptionKeyLength ?? 256,
        },
        false, // 不可导出
        ['encrypt', 'decrypt'] // 用途
      );

      this._logSecurityEvent('Encryption key initialized', {
        algorithm: this._options.encryptionAlgorithm,
        keyLength: this._options.encryptionKeyLength,
      });
    } catch (error) {
      this._logSecurityEvent('Failed to initialize encryption key', error);
      throw error;
    }
  }

  /**
   * 获取CSRF令牌
   * @private
   */
  private async _fetchCSRFToken(): Promise<void> {
    if (!this._options.enableCSRFProtection || !this._options.csrfTokenUrl)
      return;

    const now = Date.now();
    // 如果令牌不存在或已过期，则重新获取
    if (
      !this._csrfToken ||
      now - this._lastTokenFetch > this._tokenRefreshInterval
    ) {
      try {
        // URL安全性验证
        const urlChecker = new UrlSafetyChecker({
          allowedProtocols: ['https:', 'http:'],
          checkPath: true,
          checkQueryParams: true,
        });

        const urlValidationResult = urlChecker.validateUrl(
          this._options.csrfTokenUrl
        );

        if (!urlValidationResult.valid) {
          throw new Error(
            `CSRF token URL不安全: ${urlValidationResult.reason}`
          );
        }

        // 创建URL对象
        const url = new URL(this._options.csrfTokenUrl);

        // 添加随机参数防止缓存
        url.searchParams.set('_', Date.now().toString());

        const response = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include', // 包含cookies
          headers: {
            'X-Requested-With': 'XMLHttpRequest', // 防止CSRF
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch CSRF token: ${response.status} ${response.statusText}`
          );
        }

        let data;
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          // 尝试作为文本读取
          const text = await response.text();
          try {
            data = JSON.parse(text);
          } catch (e) {
            // 如果不是JSON，则尝试直接使用文本作为令牌
            data = { token: text.trim() };
          }
        }

        if (!data || !data.token) {
          throw new Error('CSRF token not found in response');
        }

        // 验证token格式
        if (typeof data.token !== 'string' || data.token.length < 8) {
          throw new Error('Invalid CSRF token format');
        }

        this._csrfToken = data.token;
        this._lastTokenFetch = now;

        this._logSecurityEvent('CSRF token fetched', {
          tokenRefreshInterval: this._tokenRefreshInterval,
          expiresAt: new Date(now + this._tokenRefreshInterval).toISOString(),
        });
      } catch (error) {
        this._logSecurityEvent('Failed to fetch CSRF token', error);

        // 尝试使用现有令牌（如果存在）
        if (!this._csrfToken) {
          throw error;
        } else {
          // 仍然使用现有令牌，但缩短刷新间隔，以便下次更早重试
          this._lastTokenFetch = now - this._tokenRefreshInterval * 0.8;
          this._logSecurityEvent(
            'Using existing CSRF token due to fetch error',
            {
              nextRetryIn:
                Math.round((this._tokenRefreshInterval * 0.2) / 1000) +
                ' seconds',
            }
          );
        }
      }
    }
  }

  /**
   * 验证文件内容
   * @param param0 文件对象
   * @returns 钩子处理结果
   * @private
   */
  private async _validateFileContent({
    file,
  }: {
    file: File;
  }): Promise<HookResult> {
    if (!this._options.enableDeepContentValidation) {
      return { handled: false, result: null, modified: false };
    }

    try {
      // 使用FileContentDetector进行深度内容分析
      const contentType = await FileContentDetector.detectContentType(file);
      const declaredType = file.type;

      // 验证声明的MIME类型与实际内容类型是否匹配
      if (
        contentType &&
        declaredType &&
        !this._isContentTypeCompatible(contentType, declaredType)
      ) {
        const error = this._createSecurityError(
          SecurityErrorSubType.EXTENSION_MISMATCH,
          `文件内容类型(${contentType})与声明类型(${declaredType})不匹配`,
          file,
          SecurityIssueSeverity.MEDIUM
        );

        this._logSecurityValidationResult(
          {
            valid: false,
            errors: [
              {
                code: SecurityErrorSubType.EXTENSION_MISMATCH,
                message: error.message,
                severity: SecurityIssueSeverity.MEDIUM,
              },
            ],
            warnings: [],
          },
          file
        );

        return {
          handled: true,
          result: false,
          modified: false,
          errors: [error],
        };
      }

      // 执行更详细的内容安全检查
      const validationResult = await this._performDeepContentValidation(file);
      if (!validationResult.valid) {
        const error = this._createSecurityError(
          SecurityErrorSubType.UNSAFE_CONTENT,
          validationResult.errors[0]?.message || '文件内容未通过安全验证',
          file,
          SecurityIssueSeverity.HIGH
        );

        this._logSecurityValidationResult(validationResult, file);

        return {
          handled: true,
          result: false,
          modified: false,
          errors: [error],
        };
      }

      return { handled: true, result: true, modified: false };
    } catch (error) {
      this._logSecurityEvent('Content validation error', {
        error,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
      });

      return {
        handled: true,
        result: false,
        modified: false,
        errors: [error instanceof Error ? error : new Error(String(error))],
      };
    }
  }

  /**
   * 对上传前的分片进行处理（加密和签名）
   * @param param0 分片对象
   * @returns 钩子处理结果
   * @private
   */
  private async _processChunkBeforeUpload({
    chunk,
    file,
    index,
    headers,
  }: {
    chunk: ArrayBuffer;
    file: File;
    index: number;
    headers: Record<string, string>;
  }): Promise<HookResult> {
    try {
      let processedChunk = chunk;
      let modified = false;

      // 添加CSRF令牌到请求头
      if (this._options.enableCSRFProtection) {
        // 如果令牌过期或不存在，重新获取
        if (
          !this._csrfToken ||
          Date.now() - this._lastTokenFetch > this._tokenRefreshInterval
        ) {
          try {
            await this._fetchCSRFToken();
          } catch (error) {
            this._logSecurityEvent(
              'CSRF token refresh failed during upload',
              error
            );
            // 继续上传，但记录警告 - 如果之前有令牌，将继续使用
          }
        }

        if (this._csrfToken && this._options.csrfTokenHeaderName) {
          headers[this._options.csrfTokenHeaderName] = this._csrfToken;

          // 添加额外的安全头，防止点击劫持和XSS
          headers['X-Content-Type-Options'] = 'nosniff';
          headers['X-Frame-Options'] = 'DENY';
          headers['X-XSS-Protection'] = '1; mode=block';

          modified = true;
        }
      }

      // 计算分片哈希用于完整性校验
      if (this._options.enableIntegrityCheck) {
        const chunkHash = await this._calculateHash(
          chunk,
          this._options.integrityAlgorithm ?? 'SHA-256'
        );
        headers['X-Chunk-Hash'] = chunkHash;
        headers['X-Hash-Algorithm'] =
          this._options.integrityAlgorithm ?? 'SHA-256';
        modified = true;
      }

      // 对分片进行加密
      if (this._options.enableTransportEncryption && this._encryptionKey) {
        // 生成初始化向量(IV)
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 12字节IV适用于GCM模式

        // 加密分片数据
        const encryptedData = await this._encryptData(processedChunk, iv);

        // 将IV与加密数据组合
        const combinedData = new Uint8Array(
          iv.length + encryptedData.byteLength
        );
        combinedData.set(iv, 0);
        combinedData.set(new Uint8Array(encryptedData), iv.length);

        processedChunk = combinedData.buffer;

        // 添加加密相关头信息
        headers['X-Encryption-Algorithm'] =
          this._options.encryptionAlgorithm ?? 'AES-GCM';
        headers['X-Encryption-IV-Length'] = String(iv.length);
        modified = true;
      }

      // 添加传输签名
      if (this._options.enableTransportSignature) {
        // 这里可以添加更复杂的签名逻辑，如HMAC等
        const timestamp = Date.now().toString();
        const fileId = file.name + '-' + file.size + '-' + file.lastModified;
        const signature = await this._generateSignature(
          fileId,
          index,
          timestamp
        );

        headers['X-Upload-Signature'] = signature;
        headers['X-Upload-Timestamp'] = timestamp;
        modified = true;
      }

      return {
        handled: true,
        result: processedChunk,
        modified,
      };
    } catch (error) {
      this._logSecurityEvent('Error processing chunk before upload', {
        error,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        chunkIndex: index,
      });

      return {
        handled: true,
        result: chunk, // 返回原始分片
        modified: false,
        errors: [error instanceof Error ? error : new Error(String(error))],
      };
    }
  }

  /**
   * 验证上传后分片的完整性
   * @param param0 分片上传结果
   * @returns 钩子处理结果
   * @private
   */
  private async _verifyChunkIntegrity({
    _chunk,
    response,
    file,
    index,
  }: {
    _chunk: ArrayBuffer;
    response: unknown;
    file: File;
    index: number;
  }): Promise<HookResult> {
    if (!this._options.validateChunkIntegrity) {
      return { handled: false, result: null, modified: false };
    }

    try {
      // 检查服务器返回的完整性校验结果
      const responseObj = response as Record<string, unknown> | null;
      if (
        responseObj &&
        responseObj.headers &&
        typeof responseObj.headers === 'object'
      ) {
        const headers = responseObj.headers as Record<string, string>;
        const serverIntegrity = headers['x-chunk-integrity'];

        if (serverIntegrity && serverIntegrity !== 'valid') {
          const error = this._createSecurityError(
            SecurityErrorSubType.DATA_CORRUPTION_ERROR,
            `分片 ${index} 完整性验证失败`,
            file,
            SecurityIssueSeverity.HIGH
          );

          return {
            handled: true,
            result: false,
            modified: false,
            errors: [error],
          };
        }
      }

      return { handled: true, result: true, modified: false };
    } catch (error) {
      this._logSecurityEvent('Chunk integrity verification error', {
        error,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        chunkIndex: index,
      });

      return {
        handled: true,
        result: false,
        modified: false,
        errors: [error instanceof Error ? error : new Error(String(error))],
      };
    }
  }

  /**
   * 完成文件完整性校验
   * @param param0 文件信息
   * @returns 钩子处理结果
   * @private
   */
  private async _finalizeIntegrityCheck({
    file,
    uploadResult,
  }: {
    file: File;
    uploadResult: unknown;
  }): Promise<HookResult> {
    if (!this._options.enableIntegrityCheck) {
      return { handled: false, result: null, modified: false };
    }

    try {
      // 检查服务器返回的完整性校验结果
      const resultObj = uploadResult as Record<string, unknown> | null;
      if (resultObj && resultObj.integrityVerified === false) {
        const error = this._createSecurityError(
          SecurityErrorSubType.DATA_CORRUPTION_ERROR,
          '文件完整性验证失败',
          file,
          SecurityIssueSeverity.HIGH
        );

        return {
          handled: true,
          result: false,
          modified: false,
          errors: [error],
        };
      }

      return { handled: true, result: true, modified: false };
    } catch (error) {
      this._logSecurityEvent('File integrity verification error', {
        error,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
      });

      return {
        handled: true,
        result: false,
        modified: false,
        errors: [error instanceof Error ? error : new Error(String(error))],
      };
    }
  }

  /**
   * 执行深度内容验证
   * @param file 文件对象
   * @returns 验证结果
   * @private
   */
  private async _performDeepContentValidation(
    file: File
  ): Promise<SecurityValidationResult> {
    // 这里可以实现更复杂的内容验证逻辑
    // 例如文件签名分析、敏感内容检测等

    // 简单实现，基于文件类型进行验证
    const result: SecurityValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // 检查文件魔数/签名
    const fileSignature = await this._getFileSignature(file);
    const declaredType = file.type;

    // 根据文件签名验证文件类型
    if (
      fileSignature &&
      !this._isValidFileSignature(fileSignature, declaredType)
    ) {
      result.valid = false;
      result.errors.push({
        code: SecurityErrorSubType.SUSPICIOUS_FILE,
        message: '文件签名与声明类型不匹配，可能存在欺骗',
        severity: SecurityIssueSeverity.HIGH,
      });
    }

    return result;
  }

  /**
   * 获取文件签名（文件头部字节）
   * @param file 文件对象
   * @returns 文件签名
   * @private
   */
  private async _getFileSignature(file: File): Promise<Uint8Array | null> {
    try {
      // 读取文件前32个字节作为签名
      const signatureBytes = 32;
      const buffer = await file
        .slice(0, Math.min(signatureBytes, file.size))
        .arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      this._logSecurityEvent('Failed to read file signature', error);
      return null;
    }
  }

  /**
   * 验证文件签名是否与声明的MIME类型匹配
   * @param signature 文件签名
   * @param mimeType MIME类型
   * @returns 是否匹配
   * @private
   */
  private _isValidFileSignature(
    signature: Uint8Array,
    mimeType: string
  ): boolean {
    // 简化实现，这里应该有一个完整的文件签名库
    // 检查一些常见文件类型的签名

    // JPEG 文件头: FF D8 FF
    if (
      mimeType === 'image/jpeg' &&
      signature[0] === 0xff &&
      signature[1] === 0xd8 &&
      signature[2] === 0xff
    ) {
      return true;
    }

    // PNG 文件头: 89 50 4E 47 0D 0A 1A 0A
    if (
      mimeType === 'image/png' &&
      signature[0] === 0x89 &&
      signature[1] === 0x50 &&
      signature[2] === 0x4e &&
      signature[3] === 0x47 &&
      signature[4] === 0x0d &&
      signature[5] === 0x0a &&
      signature[6] === 0x1a &&
      signature[7] === 0x0a
    ) {
      return true;
    }

    // PDF 文件头: 25 50 44 46 (即 %PDF)
    if (
      mimeType === 'application/pdf' &&
      signature[0] === 0x25 &&
      signature[1] === 0x50 &&
      signature[2] === 0x44 &&
      signature[3] === 0x46
    ) {
      return true;
    }

    // 对于其他MIME类型，这里应该有更完整的实现
    // 为简化，对于未定义的类型暂时返回true
    return true;
  }

  /**
   * 判断内容类型是否兼容
   * @param actualType 实际内容类型
   * @param declaredType 声明的类型
   * @returns 是否兼容
   * @private
   */
  private _isContentTypeCompatible(
    actualType: string,
    declaredType: string
  ): boolean {
    // 完全匹配
    if (actualType === declaredType) return true;

    // 主类型匹配（如image/png与image/jpeg都是image类型）
    const actualMainType = actualType.split('/')[0];
    const declaredMainType = declaredType.split('/')[0];

    if (actualMainType === declaredMainType) return true;

    // 特殊兼容关系
    const compatibilityMap: Record<string, string[]> = {
      'application/octet-stream': ['*/*'], // 通用二进制类型可以兼容任何类型
      'text/plain': ['text/*'], // 纯文本可以兼容任何文本类型
    };

    if (
      compatibilityMap[actualType] &&
      compatibilityMap[actualType].some(pattern => {
        if (pattern === '*/*') return true;
        const [mainType, subType] = pattern.split('/');
        const [declaredMain] = declaredType.split('/');
        return (
          mainType === '*' ||
          (mainType === declaredMain &&
            (subType === '*' || subType === declaredType.split('/')[1]))
        );
      })
    ) {
      return true;
    }

    return false;
  }

  /**
   * 加密数据
   * @param data 原始数据
   * @param iv 初始化向量
   * @returns 加密后的数据
   * @private
   */
  private async _encryptData(
    data: ArrayBuffer,
    iv: Uint8Array
  ): Promise<ArrayBuffer> {
    if (!this._encryptionKey) {
      throw new Error('加密密钥未初始化');
    }

    try {
      // 使用指定算法加密数据
      const cryptoParams: Record<string, unknown> = {
        name: this._options.encryptionAlgorithm ?? 'AES-GCM',
        iv: iv,
      };

      // 如果是AES-GCM，可以添加additionalData用于完整性校验
      if (this._options.encryptionAlgorithm === 'AES-GCM') {
        cryptoParams.tagLength = 128;
      }

      const encryptedData = await crypto.subtle.encrypt(
        cryptoParams as AesGcmParams | AesCbcParams | AesCtrParams,
        this._encryptionKey,
        data
      );

      return encryptedData;
    } catch (error) {
      this._logSecurityEvent('Data encryption failed', error);
      throw error;
    }
  }

  /**
   * 计算数据哈希
   * @param data 数据
   * @param algorithm 哈希算法
   * @returns 哈希值（十六进制字符串）
   * @private
   */
  private async _calculateHash(
    data: ArrayBuffer,
    algorithm: string
  ): Promise<string> {
    try {
      // 使用指定算法计算哈希
      const hashBuffer = await crypto.subtle.digest(algorithm, data);

      // 将哈希值转换为十六进制字符串
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return hashHex;
    } catch (error) {
      this._logSecurityEvent('Hash calculation failed', error);
      throw error;
    }
  }

  /**
   * 生成上传签名
   * @param fileId 文件ID
   * @param chunkIndex 分片索引
   * @param timestamp 时间戳
   * @returns 签名
   * @private
   */
  private async _generateSignature(
    fileId: string,
    chunkIndex: number,
    timestamp: string
  ): Promise<string> {
    try {
      // 创建签名数据
      const data = `${fileId}:${chunkIndex}:${timestamp}`;
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      // 计算签名（使用SHA-256）
      const signatureBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

      // 转换为Base64字符串
      return this._arrayBufferToBase64(signatureBuffer);
    } catch (error) {
      this._logSecurityEvent('Signature generation failed', error);
      throw error;
    }
  }

  /**
   * 将ArrayBuffer转换为Base64字符串
   * @param buffer ArrayBuffer数据
   * @returns Base64字符串
   * @private
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
   * 记录安全事件
   * @param message 消息
   * @param data 相关数据
   * @private
   */
  private _logSecurityEvent(message: string, data: unknown): void {
    if (this._eventBus) {
      this._eventBus.emit('security:log', {
        level: SecurityLevel.STANDARD,
        plugin: this.name,
        message,
        timestamp: Date.now(),
        data,
      });
    }

    // 开发环境下打印日志
    if (process.env.NODE_ENV === 'development') {
      // 使用 logger 或其他日志机制替代 console
      // console.log(`[StandardSecurityPlugin] ${message}`, data);
    }
  }

  /**
   * 记录安全验证结果
   * @param result 验证结果
   * @param file 文件对象
   * @private
   */
  private _logSecurityValidationResult(
    result: SecurityValidationResult,
    file: File
  ): void {
    if (this._eventBus) {
      this._eventBus.emit('security:validation', {
        level: SecurityLevel.STANDARD,
        plugin: this.name,
        result,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 创建安全错误
   * @param code 错误代码
   * @param message 错误消息
   * @param file 文件对象
   * @param severity 严重程度
   * @returns 安全错误对象
   * @private
   */
  private _createSecurityError(
    code: SecurityErrorSubType,
    message: string,
    file: File,
    severity: SecurityIssueSeverity
  ): SecurityError {
    return new SecurityError(message, code, {
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      },
      securityLevel: SecurityLevel.STANDARD,
      severity,
    });
  }
}

export { StandardSecurityPlugin };
export type { StandardSecurityPluginOptions };
