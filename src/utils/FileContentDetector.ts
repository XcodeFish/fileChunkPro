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
  confidence?: number; // 添加检测置信度
  detectedFeatures?: string[]; // 添加检测到的特征
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
    // 添加新现代图像格式
    {
      mimeType: 'image/avif',
      extension: 'avif',
      description: 'AVIF image',
      offset: 4,
      signature: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], // ftyp + avif
    },
    {
      mimeType: 'image/heic',
      extension: 'heic',
      description: 'HEIC image',
      offset: 4,
      signature: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // ftyp + heic
    },
    {
      mimeType: 'image/heif',
      extension: 'heif',
      description: 'HEIF image',
      offset: 4,
      signature: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x66], // ftyp + heif
    },
    {
      mimeType: 'image/jxl',
      extension: 'jxl',
      description: 'JPEG XL image',
      offset: 0,
      signature: [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20], // JXL header
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
    // 添加新音频格式
    {
      mimeType: 'audio/webm',
      extension: 'weba',
      description: 'WebM audio',
      offset: 0,
      signature: [0x1a, 0x45, 0xdf, 0xa3],
    },
    {
      mimeType: 'audio/ogg',
      extension: 'oga',
      description: 'OGG audio',
      offset: 0,
      signature: [0x4f, 0x67, 0x67, 0x53], // "OggS"
    },
    {
      mimeType: 'audio/opus',
      extension: 'opus',
      description: 'Opus audio',
      offset: 0,
      signature: [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], // "OpusHead"
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
    // 添加新视频格式
    {
      mimeType: 'video/ogg',
      extension: 'ogv',
      description: 'OGG video',
      offset: 0,
      signature: [0x4f, 0x67, 0x67, 0x53], // "OggS"
    },
    {
      mimeType: 'video/x-matroska',
      extension: 'mkv',
      description: 'Matroska video',
      offset: 0,
      signature: [0x1a, 0x45, 0xdf, 0xa3],
    },
    {
      mimeType: 'video/avi',
      extension: 'avi',
      description: 'AVI video',
      offset: 0,
      signature: [0x52, 0x49, 0x46, 0x46], // "RIFF"
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
    {
      mimeType: 'application/x-mach-binary',
      extension: 'macho',
      description: 'Mach-O binary',
      offset: 0,
      signature: [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 32-bit Little Endian
    },
    {
      mimeType: 'application/x-mach-binary',
      extension: 'macho',
      description: 'Mach-O binary',
      offset: 0,
      signature: [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32-bit Big Endian
    },
    {
      mimeType: 'application/x-mach-binary',
      extension: 'macho',
      description: 'Mach-O binary',
      offset: 0,
      signature: [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64-bit Little Endian
    },
    {
      mimeType: 'application/x-mach-binary',
      extension: 'macho',
      description: 'Mach-O binary',
      offset: 0,
      signature: [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64-bit Big Endian
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
    // 添加字体格式
    {
      mimeType: 'font/otf',
      extension: 'otf',
      description: 'OpenType font',
      offset: 0,
      signature: [0x4f, 0x54, 0x54, 0x4f], // "OTTO"
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
      mimeType: 'application/xml',
      extension: 'xml',
      description: 'XML document',
      offset: 0,
      signature: [0x3c, 0x3f, 0x78, 0x6d, 0x6c], // "<?xml"
    },
    // 添加新文件格式
    {
      mimeType: 'application/json',
      extension: 'json',
      description: 'JSON file',
      offset: 0,
      signature: [0x7b], // "{"
    },
    {
      mimeType: 'application/wasm',
      extension: 'wasm',
      description: 'WebAssembly binary',
      offset: 0,
      signature: [0x00, 0x61, 0x73, 0x6d], // "\0asm"
    },
    {
      mimeType: 'application/x-photoshop',
      extension: 'psd',
      description: 'Photoshop document',
      offset: 0,
      signature: [0x38, 0x42, 0x50, 0x53], // "8BPS"
    },
    {
      mimeType: 'application/illustrator',
      extension: 'ai',
      description: 'Adobe Illustrator',
      offset: 0,
      signature: [0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f], // "%!PS-Ado"
    },
    {
      mimeType: 'application/vnd.tcpdump.pcap',
      extension: 'pcap',
      description: 'PCAP file',
      offset: 0,
      signature: [0xd4, 0xc3, 0xb2, 0xa1], // PCAP magic number
    },
  ];

  // 潜在恶意脚本标记
  private readonly maliciousPatterns = [
    // 可执行脚本标记
    {
      pattern: /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      description: '可能包含脚本代码',
      severity: 'medium',
    },
    {
      pattern: /eval\s*\(/i,
      description: '动态执行JS代码',
      severity: 'high',
    },
    {
      pattern: /document\.write\s*\(/i,
      description: 'DOM修改操作',
      severity: 'medium',
    },
    {
      pattern: /new\s+Function\s*\(/i,
      description: '动态函数创建',
      severity: 'high',
    },

    // 潜在恶意Windows脚本
    {
      pattern: /(powershell|cmd)\.exe/i,
      description: '包含Windows命令行引用',
      severity: 'high',
    },
    {
      pattern: /ActiveXObject/i,
      description: 'ActiveX对象引用',
      severity: 'high',
    },

    // 潜在恶意代码特征
    {
      pattern: /shell_exec|system\s*\(|passthru\s*\(|exec\s*\(/i,
      description: '系统命令执行',
      severity: 'critical',
    },
    {
      pattern: /base64_decode\s*\(/i,
      description: 'BASE64解码操作',
      severity: 'high',
    },
    {
      pattern: /fromCharCode|unescape|escape/i,
      description: '字符转换操作',
      severity: 'medium',
    },

    // 可疑URL引用
    {
      pattern: /https?:\/\/[^\s/$.?#].[^\s]*/i,
      description: '包含URL引用',
      severity: 'low',
    },

    // 新增检测模式 - 编码形式恶意代码
    {
      pattern: /(?:atob|btoa)\s*\(['"]([\w+/=]+)['"]\)/i,
      description: 'Base64编码/解码操作',
      severity: 'high',
    },

    // 新增检测模式 - XSS攻击模式
    {
      pattern: /<img[^>]+onerror\s*=\s*['"]/i,
      description: 'img标签事件处理可能包含XSS',
      severity: 'high',
    },
    {
      pattern: /on(?:load|error|click|mouseover|focus)\s*=\s*["']/i,
      description: '可疑的事件处理属性',
      severity: 'high',
    },

    // 新增检测模式 - SQL注入模式
    {
      pattern: /';\s*(?:DROP|DELETE|UPDATE|INSERT)\s+/i,
      description: '可能的SQL注入攻击',
      severity: 'critical',
    },
    {
      pattern: /UNION\s+(?:ALL\s+)?SELECT\s+/i,
      description: '可能的SQL注入语法',
      severity: 'critical',
    },

    // 新增检测模式 - 命令注入模式
    {
      pattern: /[&|;`]\s*(?:rm|wget|curl|bash|sh)\s+/i,
      description: '可能的命令注入',
      severity: 'critical',
    },
    {
      pattern: /\$\(\s*[`'"]/i,
      description: '命令替换语法',
      severity: 'high',
    },
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
      confidence: 0,
      detectedFeatures: [],
    };

    try {
      // 检测文件类型
      const headerBytes = await this.readFileHeader(file, 512);
      if (!headerBytes || headerBytes.length === 0) {
        result.warnings.push('无法读取文件头部');
        return result;
      }

      // 识别文件类型
      let highestConfidence = 0;
      for (const sig of this.signatures) {
        if (this.matchSignature(headerBytes, sig)) {
          // 如果找到多个匹配，选择最高置信度的
          const confidence = this.calculateConfidence(headerBytes, sig);
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            result.mimeType = sig.mimeType;
            result.extension = sig.extension;
            result.description = sig.description;
          }
        }
      }

      if (highestConfidence > 0) {
        result.confidence = highestConfidence;
      }

      // 检测是否为文本文件
      result.isText = this.isTextFile(headerBytes);
      result.isBinary = !result.isText;

      // 对危险文件类型进行警告
      if (result.mimeType && this.isDangerousFileType(result.mimeType)) {
        result.potentiallyMalicious = true;
        result.warnings.push(`文件类型 ${result.mimeType} 可能包含可执行代码`);
        result.detectedFeatures?.push('dangerous_file_type');
      }

      // 对文本文件进行内容检查
      if (result.isText) {
        // 采用分块检查逻辑处理大文件
        await this.analyzeTextContent(file, result);
      } else if (file.size < 10 * 1024 * 1024) {
        // 限制10MB以下二进制文件
        // 二进制文件的浅度内容检查，检测是否包含恶意代码片段
        await this.analyzeBinaryContent(file, result);
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
   * 计算特征匹配的置信度
   * @param bytes 文件字节
   * @param signature 文件特征
   * @returns 置信度(0-100)
   */
  private calculateConfidence(
    bytes: Uint8Array,
    signature: FileSignature
  ): number {
    // 完全匹配特征的基础置信度是80%
    let confidence = 80;

    // 特征长度越长，置信度越高
    confidence += Math.min(signature.signature.length * 2, 15);

    // 检查更多的字节内容是否一致
    const extendedCheck = this.performExtendedCheck(bytes, signature);
    confidence += extendedCheck ? 5 : 0;

    return Math.min(confidence, 100);
  }

  /**
   * 执行扩展验证
   */
  private performExtendedCheck(
    _bytes: Uint8Array,
    _signature: FileSignature
  ): boolean {
    // 实际应用中，可以对特定文件格式实现更详细的验证
    // 例如，对 PNG 检查 IHDR 块，对 PDF 检查版本号等
    return true;
  }

  /**
   * 分块分析文本内容
   * @param file 文件对象
   * @param result 结果对象
   */
  private async analyzeTextContent(
    file: Blob,
    result: FileContentInfo
  ): Promise<void> {
    const MAX_CHUNK_SIZE = 1024 * 1024; // 1MB
    const CHUNK_COUNT = Math.min(5, Math.ceil(file.size / MAX_CHUNK_SIZE)); // 最多检查5个区块

    // 策略性选择文件的不同部分
    const chunks: Blob[] = [];

    // 始终检查文件头部
    chunks.push(file.slice(0, MAX_CHUNK_SIZE));

    if (file.size > MAX_CHUNK_SIZE) {
      // 检查文件中间部分
      for (let i = 1; i < CHUNK_COUNT - 1; i++) {
        const start = Math.floor((file.size / CHUNK_COUNT) * i);
        chunks.push(file.slice(start, start + MAX_CHUNK_SIZE));
      }

      // 检查文件尾部
      if (file.size > 2 * MAX_CHUNK_SIZE) {
        chunks.push(
          file.slice(Math.max(0, file.size - MAX_CHUNK_SIZE), file.size)
        );
      }
    }

    // 分析每个区块
    let maliciousContentDetected = false;
    for (const chunk of chunks) {
      const content = await this.readTextFile(chunk);
      const maliciousDetection = this.detectMaliciousContent(content);

      if (maliciousDetection.length > 0) {
        maliciousContentDetected = true;
        // 去重添加警告
        for (const warning of maliciousDetection) {
          if (!result.warnings.includes(warning)) {
            result.warnings.push(warning);
          }
        }

        // 添加检测到的特征
        if (result.detectedFeatures) {
          result.detectedFeatures.push('malicious_code_pattern');
        }
      }
    }

    result.potentiallyMalicious =
      maliciousContentDetected || result.potentiallyMalicious;
  }

  /**
   * 分析二进制内容
   */
  private async analyzeBinaryContent(
    file: Blob,
    result: FileContentInfo
  ): Promise<void> {
    // 对二进制文件中可能包含的字符串进行检查
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 简单的字符串提取和检查
    const extractedStrings = this.extractStringsFromBinary(bytes);
    let maliciousContentDetected = false;

    for (const str of extractedStrings) {
      if (str.length > 4) {
        // 忽略过短的字符串
        const maliciousDetection = this.detectMaliciousContent(str);
        if (maliciousDetection.length > 0) {
          maliciousContentDetected = true;
          // 去重添加警告
          for (const warning of maliciousDetection) {
            if (!result.warnings.includes(warning)) {
              result.warnings.push(warning);
            }
          }

          // 添加检测到的特征
          if (result.detectedFeatures) {
            result.detectedFeatures.push('binary_malicious_strings');
          }
        }
      }
    }

    result.potentiallyMalicious =
      maliciousContentDetected || result.potentiallyMalicious;
  }

  /**
   * 从二进制数据中提取可能的字符串
   */
  private extractStringsFromBinary(bytes: Uint8Array): string[] {
    const strings: string[] = [];
    let currentString = '';

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      // 可打印ASCII字符范围
      if (byte >= 32 && byte <= 126) {
        currentString += String.fromCharCode(byte);
      } else if (currentString.length >= 4) {
        // 只保留较长的字符串
        strings.push(currentString);
        currentString = '';
      } else {
        currentString = '';
      }
    }

    if (currentString.length >= 4) {
      strings.push(currentString);
    }

    return strings;
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
    const highSeverityWarnings: string[] = [];
    const criticalWarnings: string[] = [];

    // 检查内容中是否包含已知的危险模式
    for (const pattern of this.maliciousPatterns) {
      if (pattern.pattern.test(content)) {
        const warning = pattern.description;

        // 根据严重程度分类
        switch (pattern.severity) {
          case 'critical':
            criticalWarnings.push(warning);
            break;
          case 'high':
            highSeverityWarnings.push(warning);
            break;
          default:
            warnings.push(warning);
            break;
        }
      }
    }

    // 优先返回高严重性警告
    return [...criticalWarnings, ...highSeverityWarnings, ...warnings];
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
      'application/vnd.microsoft.portable-executable', // PE文件
      'application/x-dosexec', // DOS可执行文件
      'application/vnd.appimage', // AppImage Linux包装执行文件
      'application/x-executable', // 一般可执行文件
      'application/x-python-code', // Python字节码
      'application/x-mach-binary', // macOS可执行文件
    ];

    return dangerousMimeTypes.includes(mimeType);
  }

  /**
   * 跨平台文件类型检测
   */
  static async detectContentType(file: File | Blob): Promise<string> {
    const detector = new FileContentDetector();
    const mimeType = await detector.detectMimeType(file);
    return mimeType || 'application/octet-stream';
  }

  /**
   * 检验扩展名与内容类型是否匹配
   */
  static validateExtensionWithContent(
    fileName: string,
    contentResult: { success: boolean; detectedMimeType?: string }
  ): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (!ext || !contentResult.detectedMimeType) {
      return true; // 无法确定，默认通过
    }

    // 获取扩展名对应的预期MIME类型列表
    const extensionToMimeMap: Record<string, string[]> = {
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      gif: ['image/gif'],
      webp: ['image/webp'],
      svg: ['image/svg+xml'],
      pdf: ['application/pdf'],
      doc: ['application/msword'],
      docx: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      // ... 其他映射
    };

    const expectedMimeTypes = extensionToMimeMap[ext];
    if (!expectedMimeTypes) {
      return true; // 未知扩展名，默认通过
    }

    return expectedMimeTypes.includes(contentResult.detectedMimeType);
  }
}

export default FileContentDetector;
