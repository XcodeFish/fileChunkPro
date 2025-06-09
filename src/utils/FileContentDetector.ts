/**
 * FileContentDetector
 * 文件内容检测工具，用于增强文件类型验证
 */

/**
 * 文件签名信息
 */
interface FileSignature {
  /** 文件类型描述 */
  description: string;

  /** 对应的MIME类型 */
  mimeTypes: string[];

  /** 对应的文件扩展名 */
  extensions: string[];

  /** 文件头部魔数特征 */
  signature: number[];

  /** 特征偏移量，默认为0 */
  offset?: number;
}

/**
 * 文件内容检测结果
 */
export interface FileContentDetectionResult {
  /** 是否检测成功 */
  success: boolean;

  /** 检测到的MIME类型 */
  detectedMimeType?: string;

  /** 检测到的文件类型描述 */
  detectedType?: string;

  /** 是否与声明的MIME类型匹配 */
  matchesDeclared: boolean;

  /** 检测到的文件扩展名 */
  detectedExtensions?: string[];
}

/**
 * 文件内容检测工具类
 */
class FileContentDetector {
  /**
   * 常见文件类型的魔数签名表
   * 参考: https://en.wikipedia.org/wiki/List_of_file_signatures
   */
  private static readonly FILE_SIGNATURES: FileSignature[] = [
    {
      description: 'JPEG图像',
      mimeTypes: ['image/jpeg'],
      extensions: ['jpg', 'jpeg', 'jpe'],
      signature: [0xff, 0xd8, 0xff],
    },
    {
      description: 'PNG图像',
      mimeTypes: ['image/png'],
      extensions: ['png'],
      signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    },
    {
      description: 'GIF图像',
      mimeTypes: ['image/gif'],
      extensions: ['gif'],
      signature: [0x47, 0x49, 0x46, 0x38],
    },
    {
      description: 'WebP图像',
      mimeTypes: ['image/webp'],
      extensions: ['webp'],
      signature: [0x52, 0x49, 0x46, 0x46],
    },
    {
      description: 'PDF文档',
      mimeTypes: ['application/pdf'],
      extensions: ['pdf'],
      signature: [0x25, 0x50, 0x44, 0x46],
    },
    {
      description: 'ZIP压缩文件',
      mimeTypes: ['application/zip', 'application/x-zip-compressed'],
      extensions: ['zip'],
      signature: [0x50, 0x4b, 0x03, 0x04],
    },
    {
      description: 'RAR压缩文件',
      mimeTypes: ['application/x-rar-compressed', 'application/vnd.rar'],
      extensions: ['rar'],
      signature: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],
    },
    {
      description: 'MP3音频',
      mimeTypes: ['audio/mpeg'],
      extensions: ['mp3'],
      signature: [0x49, 0x44, 0x33],
    },
    {
      description: 'MP4视频',
      mimeTypes: ['video/mp4'],
      extensions: ['mp4'],
      signature: [0x66, 0x74, 0x79, 0x70],
      offset: 4,
    },
    {
      description: 'WebM视频',
      mimeTypes: ['video/webm'],
      extensions: ['webm'],
      signature: [0x1a, 0x45, 0xdf, 0xa3],
    },
    {
      description: 'DOCX文档',
      mimeTypes: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      extensions: ['docx'],
      signature: [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00],
    },
    {
      description: 'XLSX电子表格',
      mimeTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      extensions: ['xlsx'],
      signature: [0x50, 0x4b, 0x03, 0x04],
    },
    {
      description: 'PPTX演示文稿',
      mimeTypes: [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      extensions: ['pptx'],
      signature: [0x50, 0x4b, 0x03, 0x04],
    },
    {
      description: 'EXE可执行文件',
      mimeTypes: ['application/x-msdownload', 'application/octet-stream'],
      extensions: ['exe'],
      signature: [0x4d, 0x5a],
    },
    {
      description: 'Shell脚本',
      mimeTypes: ['application/x-sh', 'text/x-sh'],
      extensions: ['sh'],
      signature: [0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e, 0x2f], // #!/bin/
    },
  ];

  /**
   * 检测文件内容类型
   * @param file 文件对象
   * @returns Promise解析为检测结果
   */
  public static async detectContentType(
    file: File
  ): Promise<FileContentDetectionResult> {
    try {
      // 读取文件头部字节
      const headerBytes = await this.readFileHeader(file, 32); // 读取前32字节用于识别

      // 匹配文件签名
      for (const signature of this.FILE_SIGNATURES) {
        const offset = signature.offset || 0;
        if (this.matchesSignature(headerBytes, signature.signature, offset)) {
          return {
            success: true,
            detectedMimeType: signature.mimeTypes[0],
            detectedType: signature.description,
            matchesDeclared: signature.mimeTypes.includes(file.type),
            detectedExtensions: signature.extensions,
          };
        }
      }

      // 无法识别文件类型
      return {
        success: false,
        matchesDeclared: false,
      };
    } catch (error) {
      console.error('文件内容检测失败:', error);
      return {
        success: false,
        matchesDeclared: false,
      };
    }
  }

  /**
   * 读取文件头部字节
   * @param file 文件对象
   * @param byteCount 要读取的字节数
   * @returns Promise解析为Uint8Array
   */
  private static async readFileHeader(
    file: File,
    byteCount: number
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        resolve(new Uint8Array(arrayBuffer));
      };

      reader.onerror = () => {
        reject(new Error('读取文件头部失败'));
      };

      // 只读取文件头部指定字节
      const blob = file.slice(0, Math.min(byteCount, file.size));
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * 检查字节数组是否匹配指定签名
   * @param bytes 要检查的字节数组
   * @param signature 要匹配的签名
   * @param offset 签名的偏移量
   * @returns 是否匹配
   */
  private static matchesSignature(
    bytes: Uint8Array,
    signature: number[],
    offset = 0
  ): boolean {
    if (bytes.length < offset + signature.length) {
      return false;
    }

    for (let i = 0; i < signature.length; i++) {
      if (bytes[offset + i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * 验证文件扩展名与检测到的内容类型是否匹配
   * @param filename 文件名
   * @param detectionResult 检测结果
   * @returns 是否匹配
   */
  public static validateExtensionWithContent(
    filename: string,
    detectionResult: FileContentDetectionResult
  ): boolean {
    if (!detectionResult.success || !detectionResult.detectedExtensions) {
      return true; // 无法检测时默认通过
    }

    const extension = this.getFileExtension(filename).toLowerCase();
    return detectionResult.detectedExtensions.includes(extension);
  }

  /**
   * 获取文件扩展名
   * @param filename 文件名
   * @returns 文件扩展名
   */
  private static getFileExtension(filename: string): string {
    return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2);
  }
}

export default FileContentDetector;
