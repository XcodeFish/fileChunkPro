/**
 * FileContentDetector - 文件内容检测工具
 * 负责通过文件头部特征识别文件真实类型，分析文件是否包含潜在恶意内容
 */

export interface FileSignature {
  mimeType: string;
  extension: string;
  description: string;
  offset: number;
  signature: Uint8Array | number[];
  mask?: Uint8Array | number[];
}

export interface FileContentInfo {
  mimeType?: string;
  extension?: string;
  description?: string;
  isText: boolean;
  isBinary: boolean;
  potentiallyMalicious: boolean;
  warnings: string[];
}

/**
 * 文件内容检测工具类
 */
export class FileContentDetector {
  // 常见文件格式头部特征码
  private readonly signatures: FileSignature[] = [
    // 图像格式
    {
      mimeType: 'image/jpeg',
      extension: 'jpg',
      description: 'JPEG image',
      offset: 0,
      signature: [0xff, 0xd8, 0xff],
    },
    {
      mimeType: 'image/png',
      extension: 'png',
      description: 'PNG image',
      offset: 0,
      signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    },
    {
      mimeType: 'image/gif',
      extension: 'gif',
      description: 'GIF image',
      offset: 0,
      signature: [0x47, 0x49, 0x46, 0x38],
    },
    {
      mimeType: 'image/webp',
      extension: 'webp',
      description: 'WebP image',
      offset: 8,
      signature: [0x57, 0x45, 0x42, 0x50],
    },
    {
      mimeType: 'image/svg+xml',
      extension: 'svg',
      description: 'SVG image',
      offset: 0,
      signature: [0x3c, 0x73, 0x76, 0x67], // "<svg"
    },

    // 文档格式
    {
      mimeType: 'application/pdf',
      extension: 'pdf',
      description: 'PDF document',
      offset: 0,
      signature: [0x25, 0x50, 0x44, 0x46], // "%PDF"
    },
    {
      mimeType: 'application/zip',
      extension: 'zip',
      description: 'ZIP archive',
      offset: 0,
      signature: [0x50, 0x4b, 0x03, 0x04],
    },
    {
      mimeType: 'application/x-rar-compressed',
      extension: 'rar',
      description: 'RAR archive',
      offset: 0,
      signature: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],
    },
    {
      mimeType: 'application/x-7z-compressed',
      extension: '7z',
      description: '7-Zip archive',
      offset: 0,
      signature: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
    },
    {
      mimeType: 'application/msword',
      extension: 'doc',
      description: 'MS Word document',
      offset: 0,
      signature: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    },
    {
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      description: 'MS Word document (OpenXML)',
      offset: 0,
      signature: [0x50, 0x4b, 0x03, 0x04],
    },

    // 音频格式
    {
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      description: 'MP3 audio',
      offset: 0,
      signature: [0x49, 0x44, 0x33], // "ID3" tag
    },
    {
      mimeType: 'audio/wav',
      extension: 'wav',
      description: 'WAV audio',
      offset: 0,
      signature: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    },
    {
      mimeType: 'audio/flac',
      extension: 'flac',
      description: 'FLAC audio',
      offset: 0,
      signature: [0x66, 0x4c, 0x61, 0x43], // "fLaC"
    },

    // 视频格式
    {
      mimeType: 'video/mp4',
      extension: 'mp4',
      description: 'MP4 video',
      offset: 4,
      signature: [0x66, 0x74, 0x79, 0x70], // "ftyp"
    },
    {
      mimeType: 'video/quicktime',
      extension: 'mov',
      description: 'QuickTime video',
      offset: 4,
      signature: [0x6d, 0x6f, 0x6f, 0x76], // "moov"
    },
    {
      mimeType: 'video/webm',
      extension: 'webm',
      description: 'WebM video',
      offset: 0,
      signature: [0x1a, 0x45, 0xdf, 0xa3],
    },

    // 可执行文件格式
    {
      mimeType: 'application/x-msdownload',
      extension: 'exe',
      description: 'Windows executable',
      offset: 0,
      signature: [0x4d, 0x5a], // "MZ"
    },
    {
      mimeType: 'application/x-elf',
      extension: 'elf',
      description: 'ELF executable',
      offset: 0,
      signature: [0x7f, 0x45, 0x4c, 0x46], // "ELF"
    },

    // 字体格式
    {
      mimeType: 'font/woff',
      extension: 'woff',
      description: 'WOFF font',
      offset: 0,
      signature: [0x77, 0x4f, 0x46, 0x46], // "wOFF"
    },
    {
      mimeType: 'font/woff2',
      extension: 'woff2',
      description: 'WOFF2 font',
      offset: 0,
      signature: [0x77, 0x4f, 0x46, 0x32], // "wOF2"
    },
    {
      mimeType: 'font/ttf',
      extension: 'ttf',
      description: 'TrueType font',
      offset: 0,
      signature: [0x00, 0x01, 0x00, 0x00],
    },

    // 其他格式
    {
      mimeType: 'application/x-sqlite3',
      extension: 'sqlite',
      description: 'SQLite database',
      offset: 0,
      signature: [
        0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
        0x74,
      ],
    },
    {
      mimeType: 'application/x-mach-binary',
      extension: 'dylib',
      description: 'Mach-O binary',
      offset: 0,
      signature: [0xfe, 0xed, 0xfa, 0xce],
    },
    {
      mimeType: 'application/xml',
      extension: 'xml',
      description: 'XML document',
      offset: 0,
      signature: [0x3c, 0x3f, 0x78, 0x6d, 0x6c], // "<?xml"
    },
  ];

  // 潜在恶意脚本标记
  private readonly maliciousPatterns = [
    // 可执行脚本标记
    {
      pattern: /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      description: '可能包含脚本代码',
    },
    { pattern: /eval\s*\(/i, description: '动态执行JS代码' },
    { pattern: /document\.write\s*\(/i, description: 'DOM修改操作' },
    { pattern: /new\s+Function\s*\(/i, description: '动态函数创建' },

    // 潜在恶意Windows脚本
    { pattern: /(powershell|cmd)\.exe/i, description: '包含Windows命令行引用' },
    { pattern: /ActiveXObject/i, description: 'ActiveX对象引用' },

    // 潜在恶意代码特征
    {
      pattern: /shell_exec|system\s*\(|passthru\s*\(|exec\s*\(/i,
      description: '系统命令执行',
    },
    { pattern: /base64_decode\s*\(/i, description: 'BASE64解码操作' },
    { pattern: /fromCharCode|unescape|escape/i, description: '字符转换操作' },

    // 可疑URL引用
    { pattern: /https?:\/\/[^\s/$.?#].[^\s]*/i, description: '包含URL引用' },
  ];

  /**
   * 检测文件MIME类型
   * @param file 文件对象
   * @returns 检测到的MIME类型，如果无法确定返回null
   */
  public async detectMimeType(file: Blob): Promise<string | null> {
    try {
      // 读取文件头部（最多读取前512字节）
      const headerBytes = await this.readFileHeader(file, 512);
      if (!headerBytes || headerBytes.length === 0) {
        return null;
      }

      // 尝试通过文件头部特征码识别文件类型
      for (const sig of this.signatures) {
        if (this.matchSignature(headerBytes, sig)) {
          return sig.mimeType;
        }
      }

      // 如果无法通过特征码识别，尝试检测文本/二进制
      const isText = this.isTextFile(headerBytes);
      return isText ? 'text/plain' : 'application/octet-stream';
    } catch (error) {
      console.error('检测文件MIME类型时出错:', error);
      return null;
    }
  }

  /**
   * 分析文件内容
   * @param file 文件对象
   * @returns 文件内容分析信息
   */
  public async analyzeFile(file: Blob): Promise<FileContentInfo> {
    const result: FileContentInfo = {
      isText: false,
      isBinary: true,
      potentiallyMalicious: false,
      warnings: [],
    };

    try {
      // 检测文件类型
      const headerBytes = await this.readFileHeader(file, 512);
      if (!headerBytes || headerBytes.length === 0) {
        result.warnings.push('无法读取文件头部');
        return result;
      }

      // 识别文件类型
      for (const sig of this.signatures) {
        if (this.matchSignature(headerBytes, sig)) {
          result.mimeType = sig.mimeType;
          result.extension = sig.extension;
          result.description = sig.description;
          break;
        }
      }

      // 检测是否为文本文件
      result.isText = this.isTextFile(headerBytes);
      result.isBinary = !result.isText;

      // 对危险文件类型进行警告
      if (result.mimeType && this.isDangerousFileType(result.mimeType)) {
        result.potentiallyMalicious = true;
        result.warnings.push(`文件类型 ${result.mimeType} 可能包含可执行代码`);
      }

      // 对文本文件进行内容检查
      if (result.isText && file.size < 1024 * 1024) {
        // 仅检查小于1MB的文本文件
        const content = await this.readTextFile(file);
        const maliciousDetection = this.detectMaliciousContent(content);

        if (maliciousDetection.length > 0) {
          result.potentiallyMalicious = true;
          result.warnings = [...result.warnings, ...maliciousDetection];
        }
      }

      return result;
    } catch (error) {
      console.error('分析文件内容时出错:', error);
      result.warnings.push(
        `分析过程出错: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  /**
   * 读取文件头部字节
   * @param file 文件对象
   * @param byteCount 要读取的字节数
   * @returns ArrayBuffer格式的文件头部数据
   */
  private async readFileHeader(
    file: Blob,
    byteCount: number
  ): Promise<Uint8Array> {
    // 确保读取的字节数不超过文件大小
    const size = Math.min(byteCount, file.size);
    if (size === 0) {
      return new Uint8Array(0);
    }

    // 读取文件的前N个字节
    const headerBlob = file.slice(0, size);
    const buffer = await headerBlob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * 判断文件头部是否匹配特定签名
   * @param bytes 文件头部字节
   * @param signature 签名定义
   * @returns 是否匹配
   */
  private matchSignature(bytes: Uint8Array, signature: FileSignature): boolean {
    if (bytes.length < signature.offset + signature.signature.length) {
      return false;
    }

    for (let i = 0; i < signature.signature.length; i++) {
      const byteValue = bytes[signature.offset + i];
      const sigValue = signature.signature[i];

      // 如果定义了掩码，应用掩码后比较
      if (signature.mask) {
        const maskValue = signature.mask[i];
        if ((byteValue & maskValue) !== (sigValue & maskValue)) {
          return false;
        }
      } else if (byteValue !== sigValue) {
        // 无掩码直接比较
        return false;
      }
    }
    return true;
  }

  /**
   * 判断是否为文本文件（基于字节分析）
   * @param bytes 文件头部字节
   * @returns 是否为文本文件
   */
  private isTextFile(bytes: Uint8Array): boolean {
    // 检查前100个字节是否都是可打印ASCII字符或常见控制字符
    const checkLength = Math.min(100, bytes.length);
    let nonTextChars = 0;

    for (let i = 0; i < checkLength; i++) {
      const byte = bytes[i];
      // 可打印ASCII字符(32-126)、常见控制字符(换行\n、回车\r、制表符\t等)
      if (
        (byte >= 32 && byte <= 126) ||
        byte === 9 ||
        byte === 10 ||
        byte === 13
      ) {
        // 文本字符，继续
        continue;
      } else {
        // 非文本字符
        nonTextChars++;
      }
    }

    // 如果非文本字符超过一定比例，则判定为二进制文件
    return nonTextChars < checkLength * 0.1; // 10%的阈值
  }

  /**
   * 读取整个文件为文本
   * @param file 文件对象
   * @returns 文件文本内容
   */
  private async readTextFile(file: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  }

  /**
   * 检测文本内容中的潜在恶意模式
   * @param content 文本内容
   * @returns 发现的潜在问题描述列表
   */
  private detectMaliciousContent(content: string): string[] {
    const warnings: string[] = [];

    // 检查内容中是否包含已知的危险模式
    for (const pattern of this.maliciousPatterns) {
      if (pattern.pattern.test(content)) {
        warnings.push(pattern.description);
      }
    }

    return warnings;
  }

  /**
   * 判断文件类型是否为危险类型
   * @param mimeType MIME类型
   * @returns 是否为危险类型
   */
  private isDangerousFileType(mimeType: string): boolean {
    const dangerousMimeTypes = [
      'application/x-msdownload', // .exe
      'application/x-msdos-program', // .com, .exe
      'application/x-elf', // Linux可执行文件
      'application/java-archive', // .jar
      'application/x-shockwave-flash', // .swf
      'application/hta', // .hta
      'application/x-msmetafile', // .wmf (可能包含恶意代码)
      'application/x-ms-shortcut', // .lnk
      'application/x-msi', // Windows安装包
      'application/x-javascript', // 可能存在XSS风险
    ];

    return dangerousMimeTypes.includes(mimeType);
  }
}

export default FileContentDetector;
