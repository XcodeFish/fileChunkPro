/**
 * StandardSecurityPlugin
 * 标准安全级别插件，提供更高级别的安全保障功能：
 * - 传输加密实现
 * - 文件完整性校验
 * - CSRF防护机制
 * - 内容类型验证
 */

import UploaderCore from '../../core/UploaderCore';
import { HookResult, SecurityLevel } from '../../types';
import UrlSafetyChecker from '../../utils/UrlSafetyChecker';

import BasicSecurityPlugin, {
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
 * 标准安全插件
 */
export default class StandardSecurityPlugin extends BasicSecurityPlugin {
  /**
   * 插件名称
   */
  public readonly name = 'StandardSecurityPlugin';

  /**
   * 插件版本
   */
  public readonly version = '1.0.0';

  /**
   * 插件选项
   */
  protected _options: StandardSecurityPluginOptions;

  /**
   * CSRF令牌
   */
  private _csrfToken: string | null = null;

  /**
   * 加密密钥
   */
  private _encryptionKey: CryptoKey | null = null;

  /**
   * URL安全检查器
   */
  private _urlSafetyChecker: UrlSafetyChecker;

  /**
   * 构造函数
   * @param options 标准安全插件选项
   */
  constructor(options: StandardSecurityPluginOptions = {}) {
    super({
      securityLevel: SecurityLevel.STANDARD,
      ...options,
    });

    this._options = {
      ...this._options,
      enableTransportEncryption: true,
      encryptionAlgorithm: 'AES-GCM',
      encryptionKeyLength: 256,
      enableIntegrityCheck: true,
      integrityAlgorithm: 'SHA-256',
      enableCSRFProtection: false,
      enableDeepContentValidation: true,
      validateChunkIntegrity: true,
      enableTransportSignature: false,
      ...options,
    };

    this._urlSafetyChecker = new UrlSafetyChecker();
  }

  /**
   * 注册事件处理程序
   */
  protected override registerEventHandlers(): void {
    // 调用父类的方法，注册基础事件处理程序
    super.registerEventHandlers();

    if (this._eventBus) {
      // 文件内容验证
      this._eventBus.on(
        'file:beforeUpload',
        this._validateFileContent.bind(this)
      );

      // 分片处理
      this._eventBus.on(
        'chunk:beforeUpload',
        this._processChunkBeforeUpload.bind(this)
      );
      this._eventBus.on(
        'chunk:afterUpload',
        this._verifyChunkIntegrity.bind(this)
      );

      // 文件合并前验证
      this._eventBus.on(
        'file:beforeMerge',
        this._finalizeIntegrityCheck.bind(this)
      );
    }
  }

  /**
   * 安装插件
   * @param uploader 上传器实例
   */
  public override install(uploader: UploaderCore): void {
    // 调用父类的安装方法
    super.install(uploader);

    // 初始化加密密钥
    if (this._options.enableTransportEncryption) {
      this._initEncryptionKey().catch(error => {
        this.logSecurityEvent('Failed to initialize encryption key', error);
      });
    }

    // 初始化CSRF令牌
    if (this._options.enableCSRFProtection && this._options.csrfTokenUrl) {
      this._fetchCSRFToken().catch(error => {
        this.logSecurityEvent('Failed to fetch CSRF token', error);
      });
    }

    this.logSecurityEvent('StandardSecurityPlugin installed', {
      level: SecurityLevel.STANDARD,
      options: { ...this._options },
    });
  }

  /**
   * 验证文件安全性
   * @param file 文件对象
   * @returns 验证结果
   */
  public override async validateSecurity(
    file: File | Blob
  ): Promise<{ valid: boolean; issues: any[] }> {
    // 首先调用基础安全验证
    const basicResult = await super.validateSecurity(file);

    // 如果基础验证失败，直接返回结果
    if (!basicResult.valid) {
      return basicResult;
    }

    // 执行标准级别的额外验证
    const additionalIssues: any[] = [];

    // 深度内容验证
    if (this._options.enableDeepContentValidation && 'name' in file) {
      try {
        // 执行深度内容验证
        const deepValidation = await this._performDeepContentValidation(file);
        if (!deepValidation.valid) {
          additionalIssues.push(...deepValidation.issues);
        }
      } catch (error) {
        additionalIssues.push({
          type: 'deep_validation_error',
          message: `深度内容验证失败: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
        });
      }
    }

    // 合并所有问题
    const allIssues = [...basicResult.issues, ...additionalIssues];
    const valid = allIssues.length === 0;

    return { valid, issues: allIssues };
  }

  /**
   * 执行深度内容验证
   * @param file 文件对象
   * @returns 验证结果
   * @private
   */
  private async _performDeepContentValidation(
    file: File
  ): Promise<{ valid: boolean; issues: any[] }> {
    const issues: any[] = [];

    // 这里实现更深入的内容检查逻辑
    // 例如：检测文件签名、魔数、格式完整性等

    try {
      // 读取文件头部来检测文件类型
      const header = await this._readFileHeader(file, 512);

      // 检查文件头部是否匹配声明的类型
      const headerMatch = await this._validateFileHeader(header, file.type);

      if (!headerMatch.valid) {
        issues.push({
          type: 'file_content_mismatch',
          message: `文件内容与类型不匹配: ${headerMatch.reason || '未知原因'}`,
          severity: 'high',
        });
      }

      // 检查文件是否包含潜在的危险内容
      const safetyCheck = await this._checkFileForMaliciousContent(file);

      if (!safetyCheck.safe) {
        issues.push({
          type: 'suspicious_content',
          message: `文件可能包含危险内容: ${safetyCheck.reason || '未知原因'}`,
          severity: 'critical',
        });
      }
    } catch (error) {
      issues.push({
        type: 'validation_error',
        message: `内容验证过程出错: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 读取文件头部
   * @param file 文件对象
   * @param size 读取大小(字节)
   * @returns 文件头部数据
   * @private
   */
  private async _readFileHeader(
    file: File,
    size: number
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file.slice(0, Math.min(size, file.size)));
    });
  }

  /**
   * 验证文件头部
   * @param header 文件头部数据
   * @param declaredType 声明的文件类型
   * @returns 验证结果
   * @private
   */
  private async _validateFileHeader(
    header: ArrayBuffer,
    declaredType: string
  ): Promise<{ valid: boolean; reason?: string }> {
    // 根据文件类型验证头部内容
    const view = new Uint8Array(header);

    // 检查常见文件类型的魔数
    if (declaredType === 'application/pdf') {
      // PDF文件的魔数: %PDF (25 50 44 46)
      if (
        !(
          view[0] === 0x25 &&
          view[1] === 0x50 &&
          view[2] === 0x44 &&
          view[3] === 0x46
        )
      ) {
        return {
          valid: false,
          reason: '不是有效的PDF文件',
        };
      }
    } else if (declaredType === 'image/jpeg') {
      // JPEG文件的魔数: FFD8
      if (!(view[0] === 0xff && view[1] === 0xd8)) {
        return {
          valid: false,
          reason: '不是有效的JPEG文件',
        };
      }
    } else if (declaredType === 'image/png') {
      // PNG文件的魔数: 89 50 4E 47 0D 0A 1A 0A
      if (
        !(
          view[0] === 0x89 &&
          view[1] === 0x50 &&
          view[2] === 0x4e &&
          view[3] === 0x47 &&
          view[4] === 0x0d &&
          view[5] === 0x0a &&
          view[6] === 0x1a &&
          view[7] === 0x0a
        )
      ) {
        return {
          valid: false,
          reason: '不是有效的PNG文件',
        };
      }
    } else if (declaredType === 'image/gif') {
      // GIF文件的魔数: GIF87a (47 49 46 38 37 61) 或 GIF89a (47 49 46 38 39 61)
      if (
        !(
          (view[0] === 0x47 &&
            view[1] === 0x49 &&
            view[2] === 0x46 &&
            view[3] === 0x38 &&
            view[4] === 0x37 &&
            view[5] === 0x61) ||
          (view[0] === 0x47 &&
            view[1] === 0x49 &&
            view[2] === 0x46 &&
            view[3] === 0x38 &&
            view[4] === 0x39 &&
            view[5] === 0x61)
        )
      ) {
        return {
          valid: false,
          reason: '不是有效的GIF文件',
        };
      }
    }

    // 默认情况，没有明确的检查规则时通过验证
    return { valid: true };
  }

  /**
   * 检查文件是否包含恶意内容
   * @param file 文件对象
   * @returns 检查结果
   * @private
   */
  private async _checkFileForMaliciousContent(
    file: File
  ): Promise<{ safe: boolean; reason?: string }> {
    // 实际实现应该包含更复杂的恶意内容检测逻辑
    // 这里只是一个简单的示例

    // 检查文件名中的危险模式
    const dangerousPatterns = [
      '.exe',
      '.php',
      '.jsp',
      '.asp',
      '.cgi',
      '.bat',
      '.cmd',
      '.sh',
      '.js',
    ];
    if (
      dangerousPatterns.some(pattern =>
        file.name.toLowerCase().endsWith(pattern)
      )
    ) {
      return {
        safe: false,
        reason: `文件扩展名(${file.name.split('.').pop()})可能具有安全风险`,
      };
    }

    // 如果是文本类型的文件，可以检查内容
    if (file.type.startsWith('text/')) {
      try {
        const text = await this._readFileAsText(file);

        // 检查是否包含潜在的恶意代码模式
        const suspiciousPatterns = [
          '<script',
          '<?php',
          'eval(',
          'exec(',
          'system(',
          'shell_exec(',
          'rm -rf',
          'DROP TABLE',
          'DELETE FROM',
        ];

        if (suspiciousPatterns.some(pattern => text.includes(pattern))) {
          return {
            safe: false,
            reason: '文件内容包含潜在的危险代码',
          };
        }
      } catch (error) {
        console.warn('检查文件内容失败:', error);
      }
    }

    return { safe: true };
  }

  /**
   * 将文件读取为文本
   * @param file 文件对象
   * @returns 文件内容
   * @private
   */
  private async _readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  /**
   * 验证文件内容
   * @param params 钩子参数
   * @returns 钩子结果
   * @private
   */
  private async _validateFileContent(params: any): Promise<HookResult> {
    try {
      // 如果未启用深度内容验证，则跳过
      if (!this._options.enableDeepContentValidation) {
        return {
          handled: false,
          result: params,
          modified: false,
        };
      }

      const file = params.file;
      if (!file) {
        return {
          handled: false,
          result: params,
          modified: false,
        };
      }

      // 执行深度内容验证
      const contentValidation = await this._performDeepContentValidation(file);

      // 如果验证不通过
      if (!contentValidation.valid) {
        const mainIssue = contentValidation.issues[0];
        throw this.createSecurityError(
          'CONTENT_SECURITY_VIOLATION',
          `文件内容安全验证失败: ${mainIssue.message}`,
          {
            severity: mainIssue.severity === 'critical' ? 'critical' : 'high',
            file: {
              name: file.name,
              size: file.size,
              type: file.type,
            },
          }
        );
      }

      return {
        handled: false,
        result: params,
        modified: false,
      };
    } catch (error) {
      this.logSecurityEvent('Content validation failed', {
        error: error instanceof Error ? error.message : String(error),
        file: params.file
          ? {
              name: params.file.name,
              size: params.file.size,
              type: params.file.type,
            }
          : null,
      });

      return {
        handled: true,
        result: error,
        modified: true,
        error: true,
      };
    }
  }

  /**
   * 处理分片上传前
   * @param params 钩子参数
   * @returns 钩子结果
   * @private
   */
  private async _processChunkBeforeUpload(params: any): Promise<HookResult> {
    try {
      // 如果启用了传输加密，对分片进行加密
      if (this._options.enableTransportEncryption && this._encryptionKey) {
        params.chunk = await this._encryptChunk(params.chunk);

        return {
          handled: false,
          result: params,
          modified: true,
        };
      }

      // 如果启用了CSRF保护，添加CSRF令牌
      if (this._options.enableCSRFProtection && this._csrfToken) {
        if (!params.headers) {
          params.headers = {};
        }

        const headerName = this._options.csrfTokenHeaderName || 'X-CSRF-Token';
        params.headers[headerName] = this._csrfToken;

        return {
          handled: false,
          result: params,
          modified: true,
        };
      }

      return {
        handled: false,
        result: params,
        modified: false,
      };
    } catch (error) {
      this.logSecurityEvent('Chunk pre-processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        handled: true,
        result: error,
        modified: true,
        error: true,
      };
    }
  }

  /**
   * 验证分片完整性
   * @param params 钩子参数
   * @returns 钩子结果
   * @private
   */
  private async _verifyChunkIntegrity(params: any): Promise<HookResult> {
    try {
      // 如果未启用分片完整性验证，则跳过
      if (!this._options.validateChunkIntegrity) {
        return {
          handled: false,
          result: params,
          modified: false,
        };
      }

      // 检查服务器返回的分片哈希与计算的哈希是否一致
      const response = params.response;
      if (response && response.chunkHash && params.chunk) {
        // 计算分片哈希
        const calculatedHash = await this._calculateHash(params.chunk);

        // 比较哈希值
        if (response.chunkHash !== calculatedHash) {
          throw this.createSecurityError(
            'INTEGRITY_CHECK_FAILURE',
            '分片完整性验证失败: 哈希不匹配',
            { severity: 'high' }
          );
        }
      }

      return {
        handled: false,
        result: params,
        modified: false,
      };
    } catch (error) {
      this.logSecurityEvent('Chunk integrity verification failed', {
        error: error instanceof Error ? error.message : String(error),
        chunk: params.chunk ? { size: params.chunk.byteLength } : null,
      });

      return {
        handled: true,
        result: error,
        modified: true,
        error: true,
      };
    }
  }

  /**
   * 最终完整性检查
   * @param params 钩子参数
   * @returns 钩子结果
   * @private
   */
  private async _finalizeIntegrityCheck(params: any): Promise<HookResult> {
    try {
      // 如果未启用完整性校验，则跳过
      if (!this._options.enableIntegrityCheck) {
        return {
          handled: false,
          result: params,
          modified: false,
        };
      }

      // 此处应该实现文件合并前的完整性校验逻辑
      // 例如：验证所有分片的哈希是否与预期一致

      return {
        handled: false,
        result: params,
        modified: false,
      };
    } catch (error) {
      this.logSecurityEvent('Final integrity check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        handled: true,
        result: error,
        modified: true,
        error: true,
      };
    }
  }

  /**
   * 初始化加密密钥
   * @private
   */
  private async _initEncryptionKey(): Promise<void> {
    if (!crypto.subtle) {
      throw new Error('当前环境不支持Web Crypto API');
    }

    // 生成随机密钥
    const keyLength = this._options.encryptionKeyLength || 256;
    const algorithm = this._options.encryptionAlgorithm || 'AES-GCM';

    // 创建一个随机值作为密钥材料
    const keyMaterial = crypto.getRandomValues(new Uint8Array(keyLength / 8));

    // 导入密钥
    this._encryptionKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      {
        name:
          algorithm === 'AES-CTR'
            ? 'AES-CTR'
            : algorithm === 'AES-CBC'
              ? 'AES-CBC'
              : 'AES-GCM',
        length: keyLength,
      },
      false, // 不可导出
      ['encrypt', 'decrypt']
    );

    this.logSecurityEvent('Encryption key initialized', {
      algorithm,
      keyLength,
    });
  }

  /**
   * 加密分片
   * @param chunk 分片数据
   * @returns 加密后的分片
   * @private
   */
  private async _encryptChunk(chunk: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this._encryptionKey) {
      throw new Error('加密密钥未初始化');
    }

    if (!crypto.subtle) {
      throw new Error('当前环境不支持Web Crypto API');
    }

    const algorithm = this._options.encryptionAlgorithm || 'AES-GCM';

    // 创建初始向量
    const iv = crypto.getRandomValues(new Uint8Array(12));

    let encryptParams: any;

    if (algorithm === 'AES-GCM') {
      encryptParams = {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      };
    } else if (algorithm === 'AES-CBC') {
      encryptParams = {
        name: 'AES-CBC',
        iv: iv,
      };
    } else if (algorithm === 'AES-CTR') {
      encryptParams = {
        name: 'AES-CTR',
        counter: iv,
        length: 128,
      };
    } else {
      throw new Error(`不支持的加密算法: ${algorithm}`);
    }

    // 执行加密
    const encryptedData = await crypto.subtle.encrypt(
      encryptParams,
      this._encryptionKey,
      chunk
    );

    // 将IV与加密数据合并
    const result = new Uint8Array(iv.byteLength + encryptedData.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encryptedData), iv.byteLength);

    return result.buffer;
  }

  /**
   * 解密分片
   * @param encryptedChunk 加密的分片
   * @returns 解密后的分片
   * @private
   */
  private async _decryptChunk(
    encryptedChunk: ArrayBuffer
  ): Promise<ArrayBuffer> {
    if (!this._encryptionKey) {
      throw new Error('加密密钥未初始化');
    }

    if (!crypto.subtle) {
      throw new Error('当前环境不支持Web Crypto API');
    }

    const algorithm = this._options.encryptionAlgorithm || 'AES-GCM';

    // 提取初始向量(前12字节)
    const iv = new Uint8Array(encryptedChunk.slice(0, 12));
    // 提取加密数据(剩余部分)
    const data = encryptedChunk.slice(12);

    let decryptParams: any;

    if (algorithm === 'AES-GCM') {
      decryptParams = {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      };
    } else if (algorithm === 'AES-CBC') {
      decryptParams = {
        name: 'AES-CBC',
        iv: iv,
      };
    } else if (algorithm === 'AES-CTR') {
      decryptParams = {
        name: 'AES-CTR',
        counter: iv,
        length: 128,
      };
    } else {
      throw new Error(`不支持的加密算法: ${algorithm}`);
    }

    // 执行解密
    return await crypto.subtle.decrypt(
      decryptParams,
      this._encryptionKey,
      data
    );
  }

  /**
   * 获取CSRF令牌
   * @private
   */
  private async _fetchCSRFToken(): Promise<void> {
    if (!this._options.csrfTokenUrl) {
      throw new Error('未配置CSRF令牌URL');
    }

    try {
      // 验证URL安全性
      const urlSafetyResult = await this._urlSafetyChecker.checkUrl(
        this._options.csrfTokenUrl
      );

      if (!urlSafetyResult.safe) {
        throw new Error(`不安全的CSRF令牌URL: ${urlSafetyResult.reason}`);
      }

      // 获取CSRF令牌
      const response = await fetch(this._options.csrfTokenUrl, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(
          `获取CSRF令牌失败: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.token) {
        throw new Error('CSRF令牌响应中缺少token字段');
      }

      this._csrfToken = data.token;

      this.logSecurityEvent('CSRF token fetched', {
        tokenLength: this._csrfToken.length,
      });
    } catch (error) {
      this._csrfToken = null;
      throw error;
    }
  }

  /**
   * 计算哈希
   * @param data 数据
   * @returns 哈希值(十六进制字符串)
   * @private
   */
  private async _calculateHash(data: ArrayBuffer): Promise<string> {
    if (!crypto.subtle) {
      throw new Error('当前环境不支持Web Crypto API');
    }

    // 根据配置选择哈希算法
    const algorithm = this._options.integrityAlgorithm || 'SHA-256';

    // 计算哈希值
    const hashBuffer = await crypto.subtle.digest(algorithm, data);

    // 将哈希值转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return hashHex;
  }
}
