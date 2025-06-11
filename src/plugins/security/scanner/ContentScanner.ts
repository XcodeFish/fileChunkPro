/**
 * 内容扫描器
 * 负责分析文件内容，检测恶意软件、敏感信息和恶意内容
 */

import { EventBus } from '../../../core/EventBus';
import { Logger } from '../../../utils/Logger';

/**
 * 扫描结果
 */
export interface ScanResult {
  /**
   * 是否通过扫描
   */
  passed: boolean;

  /**
   * 检测到的威胁或问题
   */
  threats: Threat[];

  /**
   * 扫描时间
   */
  scanTime: number;

  /**
   * 文件指纹
   */
  fileHash?: string;

  /**
   * 文件元数据
   */
  metadata?: Record<string, any>;
}

/**
 * 威胁信息
 */
export interface Threat {
  /**
   * 威胁类型
   */
  type: ThreatType;

  /**
   * 威胁级别
   */
  severity: ThreatSeverity;

  /**
   * 威胁描述
   */
  description: string;

  /**
   * 威胁位置（如果适用）
   */
  location?: {
    start: number;
    end: number;
  };

  /**
   * 其他详细信息
   */
  details?: Record<string, any>;
}

/**
 * 威胁类型
 */
export enum ThreatType {
  MALWARE = 'malware',
  VIRUS = 'virus',
  RANSOMWARE = 'ransomware',
  SENSITIVE_INFO = 'sensitive_info',
  PERSONAL_DATA = 'personal_data',
  MALICIOUS_CODE = 'malicious_code',
  SUSPICIOUS_CONTENT = 'suspicious_content',
  POLICY_VIOLATION = 'policy_violation',
  OTHER = 'other',
}

/**
 * 威胁级别
 */
export enum ThreatSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 内容扫描器配置
 */
export interface ContentScannerOptions {
  /**
   * 扫描级别
   */
  scanLevel?: 'basic' | 'standard' | 'advanced';

  /**
   * 是否扫描恶意软件
   */
  scanMalware?: boolean;

  /**
   * 是否扫描敏感信息
   */
  scanSensitiveInfo?: boolean;

  /**
   * 是否扫描恶意内容
   */
  scanMaliciousContent?: boolean;

  /**
   * 自定义敏感内容模式
   */
  customSensitivePatterns?: RegExp[];

  /**
   * 最大文件大小（字节）
   */
  maxFileSize?: number;

  /**
   * 忽略的文件类型
   */
  ignoredFileTypes?: string[];

  /**
   * 扫描超时时间（毫秒）
   */
  scanTimeout?: number;

  /**
   * 是否在后台进行扫描
   */
  backgroundScan?: boolean;
}

/**
 * 内容扫描器
 * 用于检测文件中的恶意软件、敏感信息和恶意内容
 */
export default class ContentScanner {
  /**
   * 扫描器选项
   */
  private _options: ContentScannerOptions;

  /**
   * 事件总线
   */
  private _eventBus?: EventBus;

  /**
   * 日志记录器
   */
  private _logger: Logger;

  /**
   * 默认配置
   */
  private static DEFAULT_OPTIONS: ContentScannerOptions = {
    scanLevel: 'standard',
    scanMalware: true,
    scanSensitiveInfo: true,
    scanMaliciousContent: true,
    customSensitivePatterns: [],
    maxFileSize: 100 * 1024 * 1024, // 100MB
    ignoredFileTypes: [],
    scanTimeout: 30000, // 30秒
    backgroundScan: false,
  };

  /**
   * 敏感信息检测的内置正则表达式
   */
  private _sensitivePatterns = {
    // 信用卡
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    // 社会安全号码 (US SSN)
    ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    // 电子邮件
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // 电话号码
    phone:
      /\b(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\b/g,
    // IP地址
    ip: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    // 密码
    password: /\b(?:password|passwd|pwd)[=:]\s*[^\s]{6,}/gi,
    // API密钥模式
    apiKey: /\b(?:api[_-]?key|access[_-]?token)[=:]\s*[^\s]{8,}/gi,
  };

  /**
   * 恶意代码检测的内置正则表达式
   */
  private _maliciousPatterns = {
    // 常见的JavaScript恶意代码模式
    evalWithBase64: /eval\(atob\(/g,
    evalWithUnescape: /eval\(unescape\(/g,
    documentWrite: /<script>document\.write\(/g,
    iframeInjection: /<iframe[^>]*src=[^>]*display:none/g,
    // 执行系统命令的模式
    systemExecution: /\b(?:exec|spawn|execSync|spawnSync|system)\s*\(/gi,
    // SQL注入模式
    sqlInjection:
      /(?:'|")(?:\s*(?:OR|AND)\s*(?:'|")?\s*\d+\s*(?:'|")?\s*(?:=|LIKE)\s*(?:'|")?\s*\d+\s*(?:--|#|\/\*|;))/gi,
  };

  /**
   * 构造函数
   * @param options 扫描选项
   */
  constructor(options: ContentScannerOptions = {}) {
    this._options = { ...ContentScanner.DEFAULT_OPTIONS, ...options };
    this._logger = new Logger('ContentScanner');
  }

  /**
   * 设置事件总线
   * @param eventBus 事件总线实例
   */
  public setEventBus(eventBus: EventBus): void {
    this._eventBus = eventBus;
  }

  /**
   * 扫描文件内容
   * @param file 文件对象
   * @returns 扫描结果
   */
  public async scan(file: File | Blob | ArrayBuffer): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // 检查文件大小
      if (file instanceof File || file instanceof Blob) {
        if (file.size > (this._options.maxFileSize || Infinity)) {
          return this._createScanResult(
            false,
            [
              {
                type: ThreatType.POLICY_VIOLATION,
                severity: ThreatSeverity.MEDIUM,
                description: `文件大小 ${file.size} 超过最大限制 ${this._options.maxFileSize} 字节`,
              },
            ],
            startTime
          );
        }
      }

      // 检查文件类型
      if (file instanceof File) {
        const fileType = this._getFileType(file);
        if (this._options.ignoredFileTypes?.includes(fileType)) {
          return this._createScanResult(true, [], startTime);
        }
      }

      // 将文件转换为ArrayBuffer
      const buffer = await this._getFileContent(file);

      // 收集威胁
      const threats: Threat[] = [];

      // 根据扫描级别和配置决定执行哪些扫描
      if (this._options.scanMalware) {
        const malwareThreats = await this._scanForMalware(buffer, file);
        threats.push(...malwareThreats);
      }

      if (
        this._options.scanSensitiveInfo &&
        (file instanceof File || file instanceof Blob)
      ) {
        const sensitiveThreats = await this._scanForSensitiveInfo(buffer, file);
        threats.push(...sensitiveThreats);
      }

      if (
        this._options.scanMaliciousContent &&
        (file instanceof File || file instanceof Blob)
      ) {
        const maliciousThreats = await this._scanForMaliciousContent(
          buffer,
          file
        );
        threats.push(...maliciousThreats);
      }

      // 生成扫描结果
      const passed = threats.length === 0;

      // 创建最终结果
      const result = this._createScanResult(passed, threats, startTime);

      // 触发事件
      if (this._eventBus) {
        this._eventBus.emit('security:contentScanComplete', result);

        if (!passed) {
          this._eventBus.emit('security:contentThreatDetected', {
            threats: result.threats,
            fileName: file instanceof File ? file.name : undefined,
            fileType: file instanceof File ? file.type : undefined,
            fileSize:
              file instanceof File || file instanceof Blob
                ? file.size
                : buffer.byteLength,
          });
        }
      }

      return result;
    } catch (error) {
      this._logger.error('文件扫描过程中发生错误', error);

      return this._createScanResult(
        false,
        [
          {
            type: ThreatType.OTHER,
            severity: ThreatSeverity.MEDIUM,
            description:
              '文件扫描过程中发生错误: ' +
              (error instanceof Error ? error.message : String(error)),
          },
        ],
        startTime
      );
    }
  }

  /**
   * 创建扫描结果
   */
  private _createScanResult(
    passed: boolean,
    threats: Threat[],
    startTime: number
  ): ScanResult {
    return {
      passed,
      threats,
      scanTime: Date.now() - startTime,
    };
  }

  /**
   * 获取文件内容
   */
  private async _getFileContent(
    file: File | Blob | ArrayBuffer
  ): Promise<ArrayBuffer> {
    if (file instanceof ArrayBuffer) {
      return file;
    }

    return await file.arrayBuffer();
  }

  /**
   * 获取文件类型
   */
  private _getFileType(file: File): string {
    return (
      file.type ||
      this._getTypeFromExtension(file.name) ||
      'application/octet-stream'
    );
  }

  /**
   * 从文件扩展名获取类型
   */
  private _getTypeFromExtension(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension) return '';

    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      zip: 'application/zip',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      wav: 'audio/wav',
      avi: 'video/x-msvideo',
    };

    return mimeTypes[extension] || '';
  }

  /**
   * 扫描恶意软件
   * 简化实现，实际应该使用更复杂的方法
   */
  private async _scanForMalware(
    _buffer: ArrayBuffer,
    _file: File | Blob | ArrayBuffer
  ): Promise<Threat[]> {
    // 在实际应用中，此处应调用专业的恶意软件检测引擎
    // 此处仅为演示，返回空结果
    return [];
  }

  /**
   * 扫描敏感信息
   */
  private async _scanForSensitiveInfo(
    buffer: ArrayBuffer,
    file: File | Blob
  ): Promise<Threat[]> {
    const threats: Threat[] = [];

    // 仅扫描特定的文本文件类型
    const textTypes = [
      'text/plain',
      'text/html',
      'application/json',
      'application/xml',
      'application/javascript',
    ];

    let isTextFile = false;
    if (file instanceof File) {
      isTextFile =
        textTypes.includes(file.type) ||
        file.name.match(/\.(txt|html|htm|json|xml|js|jsx|ts|tsx|md|csv)$/i) !==
          null;
    }

    if (!isTextFile) {
      return threats;
    }

    try {
      // 转换为文本
      const text = await this._bufferToText(buffer);

      // 检查内置敏感模式
      for (const [key, pattern] of Object.entries(this._sensitivePatterns)) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          threats.push({
            type: ThreatType.SENSITIVE_INFO,
            severity:
              key === 'email' ? ThreatSeverity.LOW : ThreatSeverity.MEDIUM,
            description: `检测到敏感信息: ${key}`,
            details: { matchCount: matches.length },
          });
        }
      }

      // 检查自定义敏感模式
      if (this._options.customSensitivePatterns) {
        for (const pattern of this._options.customSensitivePatterns) {
          const matches = text.match(pattern);
          if (matches && matches.length > 0) {
            threats.push({
              type: ThreatType.SENSITIVE_INFO,
              severity: ThreatSeverity.MEDIUM,
              description: '检测到自定义敏感信息模式',
              details: {
                pattern: pattern.toString(),
                matchCount: matches.length,
              },
            });
          }
        }
      }
    } catch (error) {
      this._logger.warn('敏感信息扫描过程中发生错误', error);
    }

    return threats;
  }

  /**
   * 扫描恶意内容
   */
  private async _scanForMaliciousContent(
    buffer: ArrayBuffer,
    file: File | Blob
  ): Promise<Threat[]> {
    const threats: Threat[] = [];

    // 仅扫描特定的可能包含恶意代码的文件类型
    const suspiciousTypes = [
      'text/html',
      'application/javascript',
      'application/xhtml+xml',
    ];

    let isSuspiciousFile = false;
    if (file instanceof File) {
      isSuspiciousFile =
        suspiciousTypes.includes(file.type) ||
        file.name.match(/\.(html|htm|js|jsx|php|asp|aspx|jsp|svg)$/i) !== null;
    }

    if (!isSuspiciousFile) {
      return threats;
    }

    try {
      // 转换为文本
      const text = await this._bufferToText(buffer);

      // 检查恶意代码模式
      for (const [key, pattern] of Object.entries(this._maliciousPatterns)) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
          threats.push({
            type: ThreatType.MALICIOUS_CODE,
            severity: ThreatSeverity.HIGH,
            description: `检测到潜在恶意代码模式: ${key}`,
            details: {
              matchCount: matches.length,
            },
          });
        }
      }
    } catch (error) {
      this._logger.warn('恶意内容扫描过程中发生错误', error);
    }

    return threats;
  }

  /**
   * 将ArrayBuffer转换为文本
   */
  private async _bufferToText(buffer: ArrayBuffer): Promise<string> {
    try {
      return new TextDecoder('utf-8').decode(buffer);
    } catch (error) {
      // 尝试其他编码
      return new TextDecoder('iso-8859-1').decode(buffer);
    }
  }
}
