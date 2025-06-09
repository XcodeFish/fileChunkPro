/**
 * ContentValidator
 * 文件内容验证工具，用于深度分析文件内容并验证其安全性
 */

import { ContentValidationResult } from '../types';

/**
 * 文件签名定义
 */
interface FileSignature {
  /** 文件类型 */
  type: string;
  /** 十六进制签名 */
  hex: string;
  /** 签名描述 */
  description: string;
  /** 签名偏移量 */
  offset?: number;
}

/**
 * 常见文件类型的文件头签名
 */
const FILE_SIGNATURES: FileSignature[] = [
  // 图片文件
  { type: 'image/jpeg', hex: 'ffd8ff', description: 'JPEG/JPG' },
  { type: 'image/png', hex: '89504e47', description: 'PNG' },
  { type: 'image/gif', hex: '474946', description: 'GIF' },
  { type: 'image/webp', hex: '52494646', description: 'WEBP' },
  { type: 'image/svg+xml', hex: '3c737667', description: 'SVG' },
  { type: 'image/x-icon', hex: '00000100', description: 'ICO' },
  { type: 'image/bmp', hex: '424d', description: 'BMP' },
  { type: 'image/tiff', hex: '49492a00', description: 'TIFF (little endian)' },
  { type: 'image/tiff', hex: '4d4d002a', description: 'TIFF (big endian)' },

  // 文档文件
  { type: 'application/pdf', hex: '25504446', description: 'PDF' },
  { type: 'application/msword', hex: 'd0cf11e0', description: 'DOC' },
  {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hex: '504b0304',
    description: 'DOCX/XLSX/PPTX (ZIP格式)',
  },
  { type: 'application/rtf', hex: '7b5c72746631', description: 'RTF' },

  // 压缩文件
  { type: 'application/zip', hex: '504b0304', description: 'ZIP' },
  {
    type: 'application/x-rar-compressed',
    hex: '526172211a07',
    description: 'RAR',
  },
  { type: 'application/gzip', hex: '1f8b08', description: 'GZIP' },
  {
    type: 'application/x-7z-compressed',
    hex: '377abcaf271c',
    description: '7Z',
  },

  // 音频文件
  { type: 'audio/mpeg', hex: '494433', description: 'MP3 (ID3标签)' },
  { type: 'audio/wav', hex: '52494646', description: 'WAV' },
  { type: 'audio/ogg', hex: '4f676753', description: 'OGG' },
  { type: 'audio/aac', hex: 'fff15c40', description: 'AAC' },
  { type: 'audio/midi', hex: '4d546864', description: 'MIDI' },

  // 视频文件
  { type: 'video/mp4', hex: '00000020667479706d70', description: 'MP4' },
  { type: 'video/mp4', hex: '0000001866747970', description: 'MP4' },
  { type: 'video/x-matroska', hex: '1a45dfa3', description: 'MKV' },
  { type: 'video/webm', hex: '1a45dfa3', description: 'WEBM' },
  { type: 'video/x-flv', hex: '464c5601', description: 'FLV' },
  { type: 'video/avi', hex: '52494646', description: 'AVI' },

  // 可执行文件
  { type: 'application/x-msdownload', hex: '4d5a', description: 'EXE/DLL' },
  { type: 'application/x-elf', hex: '7f454c46', description: 'ELF' },
  { type: 'application/x-mach-o', hex: 'cafebabe', description: 'MACH-O' },

  // 其他文件
  { type: 'application/x-shockwave-flash', hex: '435753', description: 'SWF' },
  { type: 'application/sql', hex: '2d2d20', description: 'SQL' },
  { type: 'application/xml', hex: '3c3f786d6c', description: 'XML' },
  { type: 'application/json', hex: '7b', description: 'JSON', offset: 0 },
  {
    type: 'application/json',
    hex: '5b',
    description: 'JSON (数组)',
    offset: 0,
  },
];

/**
 * 内容验证器类
 */
export default class ContentValidator {
  /**
   * 验证文件内容
   * @param file 要验证的文件
   * @returns 验证结果Promise
   */
  public static async validateContent(
    file: File
  ): Promise<ContentValidationResult> {
    try {
      // 1. 验证文件类型
      const fileTypeValid = await this.validateFileType(file);
      if (!fileTypeValid.valid) {
        return {
          valid: false,
          reason: fileTypeValid.reason,
        };
      }

      // 2. 检查恶意内容特征
      const maliciousCheck = await this.checkMaliciousContent(file);
      if (!maliciousCheck.valid) {
        return maliciousCheck;
      }

      // 3. 执行格式特定验证
      const formatCheck = await this.performFormatSpecificValidation(file);
      if (!formatCheck.valid) {
        return formatCheck;
      }

      return { valid: true, reason: '' };
    } catch (error) {
      return {
        valid: false,
        reason: `内容验证失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 验证文件类型
   * @param file 要验证的文件
   * @returns 验证结果Promise
   */
  private static async validateFileType(
    file: File
  ): Promise<ContentValidationResult> {
    try {
      // 读取文件头部用于识别类型
      const headerBytes = await this.readFileHeader(file, 16);
      if (!headerBytes) {
        return { valid: false, reason: '无法读取文件头' };
      }

      // 将二进制数据转换为十六进制字符串
      const hexString = Array.from(new Uint8Array(headerBytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // 声明的MIME类型
      const declaredType = file.type;

      // 根据文件头识别实际类型
      const detectedSignature = this.detectFileType(hexString);

      // 如果检测到文件类型，验证与声明的类型是否匹配
      if (detectedSignature) {
        // 如果文件没有声明类型，或者声明类型与检测类型匹配，则通过验证
        if (
          !declaredType ||
          this.isCompatibleMimeType(detectedSignature.type, declaredType)
        ) {
          return { valid: true, reason: '' };
        } else {
          return {
            valid: false,
            reason: `文件类型不匹配: 声明为 ${declaredType}, 但检测到 ${detectedSignature.type} (${detectedSignature.description})`,
          };
        }
      }

      // 如果无法识别文件类型，但也没有声明类型，则通过验证
      if (!declaredType) {
        return { valid: true, reason: '' };
      }

      // 如果无法识别文件类型，但声明了类型，则尝试进行简单内容验证
      return this.performBasicContentValidation(file, declaredType);
    } catch (error) {
      return {
        valid: false,
        reason: `文件类型验证失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 检查恶意内容特征
   * @param file 要检查的文件
   * @returns 检查结果Promise
   */
  private static async checkMaliciousContent(
    file: File
  ): Promise<ContentValidationResult> {
    // 危险特征模式
    const dangerousPatterns = [
      // 脚本注入
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
      // SQL注入
      /\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b.*\b(FROM|INTO|WHERE|TABLE|DATABASE)\b/i,
      // 命令注入
      /\b(cmd\.exe|powershell\.exe|bash|sh|sudo)\b/i,
      // 恶意代码混淆
      /eval\s*\(/i,
      // 系统命令执行
      /\bexec\s*\(/i,
      // iframe注入
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/i,
    ];

    try {
      // 对于小文件，检查整个文件内容
      if (file.size <= 5 * 1024 * 1024) {
        // 5MB以下
        const text = await this.readFileAsText(file);

        for (const pattern of dangerousPatterns) {
          if (pattern.test(text)) {
            return {
              valid: false,
              reason: `检测到潜在恶意内容特征: ${pattern.toString()}`,
            };
          }
        }
      } else {
        // 对于大文件，只检查开头和结尾部分
        const headText = await this.readFileChunkAsText(file, 0, 256 * 1024);
        const tailText = await this.readFileChunkAsText(
          file,
          Math.max(0, file.size - 256 * 1024),
          256 * 1024
        );

        for (const pattern of dangerousPatterns) {
          if (pattern.test(headText) || pattern.test(tailText)) {
            return {
              valid: false,
              reason: `检测到潜在恶意内容特征: ${pattern.toString()}`,
            };
          }
        }
      }

      return { valid: true, reason: '' };
    } catch (error) {
      // 如果无法读取为文本，忽略此检查
      return { valid: true, reason: '' };
    }
  }

  /**
   * 执行格式特定的验证
   * @param file 要验证的文件
   * @returns 验证结果Promise
   */
  private static async performFormatSpecificValidation(
    file: File
  ): Promise<ContentValidationResult> {
    const mimeType = file.type.toLowerCase();

    // 根据文件类型执行特定验证
    if (mimeType.startsWith('image/')) {
      return this.validateImageFile(file);
    } else if (mimeType === 'application/pdf') {
      return this.validatePdfFile(file);
    } else if (
      mimeType.startsWith('application/vnd.openxmlformats-officedocument')
    ) {
      return this.validateOfficeFile(file);
    } else if (mimeType === 'application/zip') {
      return this.validateZipFile(file);
    }

    // 对于其他类型，暂时不做特殊验证
    return { valid: true, reason: '' };
  }

  /**
   * 验证图像文件
   * @param file 要验证的文件
   * @returns 验证结果Promise
   */
  private static async validateImageFile(
    file: File
  ): Promise<ContentValidationResult> {
    try {
      // 创建一个Promise来验证图像
      return new Promise(resolve => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        // 图像加载成功
        img.onload = () => {
          URL.revokeObjectURL(url);

          // 检查图像尺寸是否合理
          if (img.width === 0 || img.height === 0) {
            resolve({
              valid: false,
              reason: '图像尺寸无效',
            });
            return;
          }

          // 检查图像尺寸是否过大
          if (img.width > 15000 || img.height > 15000) {
            resolve({
              valid: false,
              reason: `图像尺寸过大 (${img.width}x${img.height})`,
            });
            return;
          }

          resolve({ valid: true, reason: '' });
        };

        // 图像加载失败
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({
            valid: false,
            reason: '图像格式无效或已损坏',
          });
        };

        img.src = url;
      });
    } catch (error) {
      return {
        valid: false,
        reason: `图像验证失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 验证PDF文件
   * @param file 要验证的文件
   * @returns 验证结果Promise
   */
  private static async validatePdfFile(
    file: File
  ): Promise<ContentValidationResult> {
    try {
      // 读取文件头
      const headerBytes = await this.readFileHeader(file, 1024);
      if (!headerBytes) {
        return { valid: false, reason: '无法读取PDF文件头' };
      }

      const headerText = new TextDecoder().decode(headerBytes);

      // 检查PDF头部标记
      if (!headerText.startsWith('%PDF-')) {
        return {
          valid: false,
          reason: 'PDF文件头无效',
        };
      }

      // 检查是否包含可疑的JavaScript代码
      if (headerText.includes('/JS') || headerText.includes('/JavaScript')) {
        return {
          valid: false,
          reason: '检测到PDF可能包含JavaScript代码',
        };
      }

      // 检查是否包含可执行文件
      if (
        headerText.includes('/Launch') ||
        headerText.includes('/OpenAction')
      ) {
        return {
          valid: false,
          reason: '检测到PDF可能包含自动执行操作',
        };
      }

      return { valid: true, reason: '' };
    } catch (error) {
      return {
        valid: false,
        reason: `PDF验证失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 验证Office文件
   * @param file 要验证的文件
   * @returns 验证结果Promise
   */
  private static async validateOfficeFile(
    file: File
  ): Promise<ContentValidationResult> {
    // Office文件本质上是ZIP文件，验证ZIP文件头
    const headerBytes = await this.readFileHeader(file, 4);
    if (!headerBytes) {
      return { valid: false, reason: '无法读取Office文件头' };
    }

    const signature = new Uint8Array(headerBytes);
    if (
      signature[0] !== 0x50 ||
      signature[1] !== 0x4b ||
      signature[2] !== 0x03 ||
      signature[3] !== 0x04
    ) {
      return {
        valid: false,
        reason: 'Office文件格式无效',
      };
    }

    return { valid: true, reason: '' };
  }

  /**
   * 验证ZIP文件
   * @param file 要验证的文件
   * @returns 验证结果Promise
   */
  private static async validateZipFile(
    file: File
  ): Promise<ContentValidationResult> {
    try {
      // 检查文件头
      const headerBytes = await this.readFileHeader(file, 4);
      if (!headerBytes) {
        return { valid: false, reason: '无法读取ZIP文件头' };
      }

      const signature = new Uint8Array(headerBytes);
      if (
        signature[0] !== 0x50 ||
        signature[1] !== 0x4b ||
        signature[2] !== 0x03 ||
        signature[3] !== 0x04
      ) {
        return {
          valid: false,
          reason: 'ZIP文件格式无效',
        };
      }

      // 检查文件结尾是否有中央目录结束记录
      const tailBytes = await this.readFileTail(file, 22);
      if (!tailBytes) {
        return { valid: false, reason: '无法读取ZIP文件尾' };
      }

      const tail = new Uint8Array(tailBytes);
      let found = false;

      // 查找中央目录结束记录签名 (0x06054b50)
      for (let i = 0; i < tail.length - 4; i++) {
        if (
          tail[i] === 0x50 &&
          tail[i + 1] === 0x4b &&
          tail[i + 2] === 0x05 &&
          tail[i + 3] === 0x06
        ) {
          found = true;
          break;
        }
      }

      if (!found) {
        return {
          valid: false,
          reason: 'ZIP文件中央目录结束记录无效',
        };
      }

      return { valid: true, reason: '' };
    } catch (error) {
      return {
        valid: false,
        reason: `ZIP验证失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 执行基本内容验证
   * @param file 要验证的文件
   * @param declaredType 声明的MIME类型
   * @returns 验证结果Promise
   */
  private static async performBasicContentValidation(
    file: File,
    declaredType: string
  ): Promise<ContentValidationResult> {
    // 对于一些常见类型进行简单验证
    if (declaredType.startsWith('text/')) {
      try {
        // 尝试读取为文本
        await this.readFileChunkAsText(file, 0, Math.min(file.size, 1024));
        return { valid: true, reason: '' };
      } catch (error) {
        return {
          valid: false,
          reason: `声明为文本类型但无法读取为文本: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // 对于其他类型，暂时不做验证
    return { valid: true, reason: '' };
  }

  /**
   * 检测文件类型
   * @param hexString 文件头的十六进制字符串
   * @returns 检测到的文件签名，未检测到则返回null
   */
  private static detectFileType(hexString: string): FileSignature | null {
    for (const signature of FILE_SIGNATURES) {
      const offset = signature.offset || 0;
      if (hexString.substring(offset * 2).startsWith(signature.hex)) {
        return signature;
      }
    }
    return null;
  }

  /**
   * 判断两个MIME类型是否兼容
   * @param type1 类型1
   * @param type2 类型2
   * @returns 是否兼容
   */
  private static isCompatibleMimeType(type1: string, type2: string): boolean {
    // 完全匹配
    if (type1 === type2) return true;

    // 检查主类型匹配
    const [mainType1] = type1.split('/');
    const [mainType2] = type2.split('/');

    if (mainType1 === mainType2) return true;

    // 特殊兼容关系
    const compatibilityMap: Record<string, string[]> = {
      'application/octet-stream': ['*/*'],
      'application/zip': [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/java-archive',
      ],
    };

    if (compatibilityMap[type1] && compatibilityMap[type1].includes(type2)) {
      return true;
    }

    if (compatibilityMap[type2] && compatibilityMap[type2].includes(type1)) {
      return true;
    }

    return false;
  }

  /**
   * 读取文件头部
   * @param file 要读取的文件
   * @param bytes 要读取的字节数
   * @returns 文件头部数据的Promise
   */
  private static async readFileHeader(
    file: File,
    bytes: number
  ): Promise<ArrayBuffer | null> {
    if (file.size === 0) return null;

    try {
      const chunk = file.slice(0, Math.min(bytes, file.size));
      return await chunk.arrayBuffer();
    } catch (error) {
      console.error('读取文件头失败:', error);
      return null;
    }
  }

  /**
   * 读取文件尾部
   * @param file 要读取的文件
   * @param bytes 要读取的字节数
   * @returns 文件尾部数据的Promise
   */
  private static async readFileTail(
    file: File,
    bytes: number
  ): Promise<ArrayBuffer | null> {
    if (file.size === 0) return null;

    try {
      const chunk = file.slice(Math.max(0, file.size - bytes), file.size);
      return await chunk.arrayBuffer();
    } catch (error) {
      console.error('读取文件尾失败:', error);
      return null;
    }
  }

  /**
   * 将文件读取为文本
   * @param file 要读取的文件
   * @returns 文件文本内容的Promise
   */
  private static async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(new Error('读取文件为文本失败'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * 读取文件块为文本
   * @param file 要读取的文件
   * @param start 起始位置
   * @param length 长度
   * @returns 文件块文本内容的Promise
   */
  private static async readFileChunkAsText(
    file: File,
    start: number,
    length: number
  ): Promise<string> {
    const chunk = file.slice(start, start + length);
    return this.readFileAsText(chunk);
  }
}
