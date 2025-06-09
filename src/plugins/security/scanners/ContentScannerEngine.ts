/**
 * 内容扫描引擎
 * 提供文件内容安全分析和检测功能
 */
import { SecurityIssueSeverity } from '../../../types';

/**
 * 内容扫描选项
 */
export interface ContentScannerOptions {
  /**
   * 扫描深度
   * @default 'normal'
   */
  scanDepth?: 'minimal' | 'normal' | 'deep';

  /**
   * 自定义扫描规则
   */
  customRules?: Array<{
    pattern: string | RegExp;
    action: 'warn' | 'block';
    severity: SecurityIssueSeverity;
    description: string;
  }>;

  /**
   * 是否扫描元数据
   * @default true
   */
  scanMetadata?: boolean;

  /**
   * 扫描超时时间(毫秒)
   * @default 5000
   */
  scanTimeout?: number;
}

/**
 * 扫描结果
 */
export interface ScanResult {
  /**
   * 扫描是否通过
   */
  valid: boolean;

  /**
   * 扫描发现的问题
   */
  issues: Array<{
    type: string;
    severity: SecurityIssueSeverity;
    message: string;
    location?: {
      start?: number;
      end?: number;
    };
  }>;
}

/**
 * 敏感文件类型
 */
const SENSITIVE_FILE_TYPES = [
  'application/x-msdownload',
  'application/x-ms-dos-executable',
  'application/x-dosexec',
  'application/octet-stream',
  'application/x-executable',
  'application/x-elf',
  'application/x-sh',
  'application/x-bat',
  'application/x-com',
  'application/x-msi',
  'application/x-java-applet',
];

/**
 * 可疑文件扩展名
 */
const SUSPICIOUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.msi',
  '.vbs',
  '.ps1',
  '.sh',
  '.jar',
  '.jnlp',
  '.hta',
  '.dll',
  '.com',
  '.scr',
  '.pif',
  '.gadget',
  '.msc',
  '.sys',
];

/**
 * 常见文件签名（魔数）
 */
const FILE_SIGNATURES: { [key: string]: { type: string; bytes: number[] } } = {
  JPEG: { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  PNG: {
    type: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  GIF: { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  PDF: { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  ZIP: { type: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  RAR: {
    type: 'application/x-rar-compressed',
    bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],
  },
  EXE: { type: 'application/x-msdownload', bytes: [0x4d, 0x5a] },
};

/**
 * 内容扫描引擎
 * 提供文件内容安全检测功能
 */
export default class ContentScannerEngine {
  /**
   * 扫描配置选项
   */
  private options: ContentScannerOptions;

  /**
   * 扫描规则列表
   */
  private rules: Array<{
    pattern: RegExp;
    action: 'warn' | 'block';
    severity: SecurityIssueSeverity;
    description: string;
  }>;

  /**
   * 构造函数
   * @param options 扫描配置选项
   */
  constructor(options?: ContentScannerOptions) {
    this.options = {
      scanDepth: 'normal',
      scanMetadata: true,
      scanTimeout: 5000,
      ...options,
    };

    // 初始化默认规则
    this.rules = [
      {
        pattern: /<script[\s\S]*?>([\s\S]*?)<\/script>/gi,
        action: 'block',
        severity: SecurityIssueSeverity.HIGH,
        description: '文件中包含JavaScript代码',
      },
      {
        pattern: /<iframe[\s\S]*?>/gi,
        action: 'block',
        severity: SecurityIssueSeverity.MEDIUM,
        description: '文件中包含iframe标签',
      },
      {
        pattern: /eval\s*\(/gi,
        action: 'block',
        severity: SecurityIssueSeverity.HIGH,
        description: '文件中包含可疑的eval()调用',
      },
      {
        pattern: /document\.cookie/gi,
        action: 'block',
        severity: SecurityIssueSeverity.MEDIUM,
        description: '文件中包含对cookie的操作',
      },
      {
        pattern: /document\.location[\s\S]*?=/gi,
        action: 'block',
        severity: SecurityIssueSeverity.MEDIUM,
        description: '文件中包含对location的修改操作',
      },
      {
        pattern: /base64_decode|fromCharCode|String\.fromCharCode/gi,
        action: 'block',
        severity: SecurityIssueSeverity.MEDIUM,
        description: '文件中包含可疑的编码操作',
      },
    ];

    // 添加自定义规则
    if (this.options.customRules) {
      this.options.customRules.forEach(rule => {
        this.rules.push({
          pattern:
            rule.pattern instanceof RegExp
              ? rule.pattern
              : new RegExp(rule.pattern, 'gi'),
          action: rule.action,
          severity: rule.severity,
          description: rule.description,
        });
      });
    }
  }

  /**
   * 扫描文件内容
   * @param file 要扫描的文件
   * @returns 扫描结果
   */
  public async scanFile(file: File | Blob | any): Promise<ScanResult> {
    // 创建扫描结果
    const result: ScanResult = {
      valid: true,
      issues: [],
    };

    try {
      // 添加超时保护
      const scanPromise = this._scanFileContent(file, result);
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(
          () => reject(new Error('内容扫描超时')),
          this.options.scanTimeout
        );
      });

      await Promise.race([scanPromise, timeoutPromise]);

      // 确定最终结果
      result.valid = result.issues.every(
        issue =>
          issue.severity !== SecurityIssueSeverity.CRITICAL &&
          !(
            issue.severity === SecurityIssueSeverity.HIGH &&
            this.rules.find(r => r.pattern.toString() === issue.type)
              ?.action === 'block'
          )
      );

      return result;
    } catch (error) {
      result.valid = false;
      result.issues.push({
        type: 'scan_error',
        severity: SecurityIssueSeverity.MEDIUM,
        message: `扫描过程出错: ${(error as Error).message}`,
      });
      return result;
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.rules = [];
  }

  /**
   * 执行文件内容扫描
   * @param file 文件对象
   * @param result 扫描结果
   */
  private async _scanFileContent(
    file: File | Blob | any,
    result: ScanResult
  ): Promise<void> {
    // 首先检查文件类型和扩展名
    await this._checkFileType(file, result);

    // 检查文件签名
    if (this.options.scanDepth !== 'minimal') {
      await this._checkFileSignature(file, result);
    }

    // 如果是文本类型文件，检查内容
    const isTextFile =
      file.type &&
      (file.type.startsWith('text/') ||
        file.type.includes('javascript') ||
        file.type.includes('json') ||
        file.type.includes('xml') ||
        file.type.includes('html'));

    if (isTextFile || this.options.scanDepth === 'deep') {
      await this._scanTextContent(file, result);
    }

    // 扫描元数据
    if (this.options.scanMetadata) {
      this._scanMetadata(file, result);
    }
  }

  /**
   * 检查文件类型
   * @param file 文件对象
   * @param result 扫描结果
   */
  private async _checkFileType(
    file: File | Blob | any,
    result: ScanResult
  ): Promise<void> {
    // 检查MIME类型
    if (file.type && SENSITIVE_FILE_TYPES.includes(file.type)) {
      result.issues.push({
        type: 'sensitive_file_type',
        severity: SecurityIssueSeverity.HIGH,
        message: `敏感文件类型: ${file.type}`,
      });
    }

    // 检查文件扩展名
    if (file.name) {
      const fileExt = file.name
        .substring(file.name.lastIndexOf('.'))
        .toLowerCase();
      if (SUSPICIOUS_EXTENSIONS.includes(fileExt)) {
        result.issues.push({
          type: 'suspicious_extension',
          severity: SecurityIssueSeverity.HIGH,
          message: `可疑文件扩展名: ${fileExt}`,
        });
      }

      // 检查文件扩展名与MIME类型是否匹配
      if (file.type) {
        const isMatched = this._checkExtensionTypeMatch(fileExt, file.type);
        if (!isMatched) {
          result.issues.push({
            type: 'extension_type_mismatch',
            severity: SecurityIssueSeverity.MEDIUM,
            message: `文件扩展名(${fileExt})与类型(${file.type})不匹配`,
          });
        }
      }
    }
  }

  /**
   * 检查文件签名（魔数）
   * @param file 文件对象
   * @param result 扫描结果
   */
  private async _checkFileSignature(
    file: File | Blob | any,
    result: ScanResult
  ): Promise<void> {
    try {
      // 读取文件头部字节
      const headerBytes = await this._readFileHeader(file, 16);
      if (!headerBytes) return;

      // 检查文件签名是否与声明的类型匹配
      let signatureMatched = false;
      let actualType = '';

      for (const [, signature] of Object.entries(FILE_SIGNATURES)) {
        const isMatch = signature.bytes.every(
          (byte, index) => byte === headerBytes[index]
        );

        if (isMatch) {
          actualType = signature.type;
          signatureMatched = file.type === signature.type;
          break;
        }
      }

      if (actualType && !signatureMatched) {
        result.issues.push({
          type: 'file_signature_mismatch',
          severity: SecurityIssueSeverity.HIGH,
          message: `文件签名与声明类型不匹配，声明: ${file.type}，实际: ${actualType}`,
        });
      }

      // 检查是否为可执行文件
      if (headerBytes[0] === 0x4d && headerBytes[1] === 0x5a) {
        // MZ signature (DOS/PE)
        result.issues.push({
          type: 'executable_file',
          severity: SecurityIssueSeverity.CRITICAL,
          message: '检测到可执行文件',
        });
      }
    } catch (error) {
      console.error('文件签名检查失败:', error);
    }
  }

  /**
   * 扫描文本内容
   * @param file 文件对象
   * @param result 扫描结果
   */
  private async _scanTextContent(
    file: File | Blob | any,
    result: ScanResult
  ): Promise<void> {
    try {
      // 读取文件内容
      const content = await this._readFileAsText(file);
      if (!content) return;

      // 应用规则
      for (const rule of this.rules) {
        rule.pattern.lastIndex = 0; // 重置正则表达式
        const matches = Array.from(content.matchAll(rule.pattern));

        if (matches.length > 0) {
          for (const match of matches) {
            result.issues.push({
              type: rule.pattern.toString(),
              severity: rule.severity,
              message: rule.description,
              location:
                match.index !== undefined
                  ? {
                      start: match.index,
                      end: match.index + match[0].length,
                    }
                  : undefined,
            });
          }
        }
      }

      // 深度扫描时的额外检查
      if (this.options.scanDepth === 'deep') {
        this._deepScanTextContent(content, result);
      }
    } catch (error) {
      console.error('文本内容扫描失败:', error);
    }
  }

  /**
   * 深度扫描文本内容
   * @param content 文件内容
   * @param result 扫描结果
   */
  private _deepScanTextContent(content: string, result: ScanResult): void {
    // 检查是否包含base64编码的可执行文件
    const base64ExePatterns = [
      /TVqQAAMA/i, // MZ header in base64
      /UEsDBB/i, // PK header in base64
      /0M8R4KG/i, // DOC/XLS old format in base64
    ];

    for (const pattern of base64ExePatterns) {
      if (pattern.test(content)) {
        result.issues.push({
          type: 'base64_executable',
          severity: SecurityIssueSeverity.CRITICAL,
          message: '检测到Base64编码的可执行文件内容',
        });
        break;
      }
    }

    // 检查是否包含敏感命令
    const sensitiveCommands = [
      /rm\s+-rf/i,
      /format\s+c:/i,
      /del\s+.*\/[aqf]/i,
      /wget\s+.*\|.*sh/i,
      /curl\s+.*\|.*sh/i,
    ];

    for (const pattern of sensitiveCommands) {
      if (pattern.test(content)) {
        result.issues.push({
          type: 'sensitive_command',
          severity: SecurityIssueSeverity.HIGH,
          message: '检测到敏感系统命令',
        });
        break;
      }
    }

    // 检查是否包含敏感数据模式
    const sensitiveDataPatterns = [
      /\b\d{13,16}\b/, // 可能的信用卡号
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // 电子邮件
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN格式
      /password\s*[=:]\s*["'].*?["']/i, // 明文密码
    ];

    for (const pattern of sensitiveDataPatterns) {
      if (pattern.test(content)) {
        result.issues.push({
          type: 'sensitive_data',
          severity: SecurityIssueSeverity.MEDIUM,
          message: '检测到可能的敏感数据',
        });
        break;
      }
    }
  }

  /**
   * 扫描文件元数据
   * @param file 文件对象
   * @param result 扫描结果
   */
  private _scanMetadata(file: File | Blob | any, result: ScanResult): void {
    // 检查可疑的文件名
    if (file.name) {
      const suspiciousNamePatterns = [
        /password/i,
        /secret/i,
        /confidential/i,
        /private/i,
        /backup/i,
        /exploit/i,
        /hack/i,
        /root/i,
        /admin/i,
      ];

      for (const pattern of suspiciousNamePatterns) {
        if (pattern.test(file.name)) {
          result.issues.push({
            type: 'suspicious_filename',
            severity: SecurityIssueSeverity.LOW,
            message: `可疑文件名: ${file.name}`,
          });
          break;
        }
      }
    }

    // 检查文件大小异常
    if (file.size !== undefined) {
      // 检查空文件
      if (file.size === 0) {
        result.issues.push({
          type: 'empty_file',
          severity: SecurityIssueSeverity.LOW,
          message: '空文件',
        });
      }

      // 检查超大文件
      const maxFileSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxFileSize) {
        result.issues.push({
          type: 'large_file',
          severity: SecurityIssueSeverity.LOW,
          message: `文件过大: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
        });
      }
    }

    // 检查文件创建/修改时间
    if (file.lastModified) {
      const now = Date.now();
      const fileDate = new Date(file.lastModified);

      // 检查未来日期
      if (file.lastModified > now) {
        result.issues.push({
          type: 'future_date',
          severity: SecurityIssueSeverity.MEDIUM,
          message: `文件修改日期在未来: ${fileDate.toISOString()}`,
        });
      }

      // 检查很旧的文件
      const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
      if (file.lastModified < oneYearAgo) {
        result.issues.push({
          type: 'old_file',
          severity: SecurityIssueSeverity.LOW,
          message: `文件修改日期较旧: ${fileDate.toISOString()}`,
        });
      }
    }
  }

  /**
   * 读取文件头部字节
   * @param file 文件对象
   * @param count 要读取的字节数
   * @returns 字节数组
   */
  private async _readFileHeader(
    file: File | Blob | any,
    count: number
  ): Promise<Uint8Array | null> {
    try {
      // 仅读取文件的头部部分
      const headerBlob = file.slice(0, Math.min(count, file.size));
      return new Uint8Array(await headerBlob.arrayBuffer());
    } catch (error) {
      console.error('读取文件头部失败:', error);
      return null;
    }
  }

  /**
   * 读取文件为文本
   * @param file 文件对象
   * @returns 文件内容
   */
  private async _readFileAsText(
    file: File | Blob | any
  ): Promise<string | null> {
    try {
      // 对于大文件，只读取前100KB
      const maxReadSize = 100 * 1024; // 100KB
      const blobToRead =
        file.size > maxReadSize ? file.slice(0, maxReadSize) : file;

      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blobToRead);
      });
    } catch (error) {
      console.error('读取文件内容失败:', error);
      return null;
    }
  }

  /**
   * 检查文件扩展名与MIME类型是否匹配
   * @param extension 文件扩展名
   * @param mimeType MIME类型
   * @returns 是否匹配
   */
  private _checkExtensionTypeMatch(
    extension: string,
    mimeType: string
  ): boolean {
    const extensionTypeMappings: Record<string, string[]> = {
      '.jpg': ['image/jpeg', 'image/jpg'],
      '.jpeg': ['image/jpeg', 'image/jpg'],
      '.png': ['image/png'],
      '.gif': ['image/gif'],
      '.pdf': ['application/pdf'],
      '.doc': ['application/msword'],
      '.docx': [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      '.xls': ['application/vnd.ms-excel'],
      '.xlsx': [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      '.ppt': ['application/vnd.ms-powerpoint'],
      '.pptx': [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      '.txt': ['text/plain'],
      '.html': ['text/html'],
      '.htm': ['text/html'],
      '.css': ['text/css'],
      '.js': ['text/javascript', 'application/javascript'],
      '.json': ['application/json'],
      '.xml': ['application/xml', 'text/xml'],
      '.zip': ['application/zip', 'application/x-zip-compressed'],
      '.rar': ['application/x-rar-compressed'],
      '.mp3': ['audio/mpeg', 'audio/mp3'],
      '.mp4': ['video/mp4'],
      '.avi': ['video/x-msvideo'],
      '.mov': ['video/quicktime'],
      '.svg': ['image/svg+xml'],
    };

    return (
      extension &&
      mimeType &&
      extensionTypeMappings[extension] &&
      extensionTypeMappings[extension].includes(mimeType)
    );
  }
}
