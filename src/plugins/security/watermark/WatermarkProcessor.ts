/**
 * 水印处理器
 * 用于给图像和文档添加水印
 */

import { Logger } from '../../../utils/Logger';

/**
 * 水印选项
 */
export interface WatermarkOptions {
  /**
   * 水印文本
   */
  text?: string;

  /**
   * 水印透明度 (0-1)
   */
  opacity?: number;

  /**
   * 水印角度
   */
  angle?: number;

  /**
   * 水印位置
   */
  position?:
    | 'center'
    | 'topLeft'
    | 'topRight'
    | 'bottomLeft'
    | 'bottomRight'
    | 'mosaic';

  /**
   * 水印颜色
   */
  color?: string;

  /**
   * 水印字体
   */
  fontFamily?: string;

  /**
   * 水印字体大小
   */
  fontSize?: number;

  /**
   * 水印重复次数（网格）
   */
  repeat?: boolean;

  /**
   * 是否应用水印到图像内容
   */
  applyToImages?: boolean;

  /**
   * 是否应用水印到文档内容
   */
  applyToDocuments?: boolean;

  /**
   * 自定义水印数据URL
   */
  customWatermarkUrl?: string;
}

/**
 * 水印处理器
 */
export default class WatermarkProcessor {
  /**
   * 默认选项
   */
  private static DEFAULT_OPTIONS: WatermarkOptions = {
    text: 'CONFIDENTIAL',
    opacity: 0.2,
    angle: -30,
    position: 'center',
    color: 'rgba(200, 0, 0, 0.5)',
    fontFamily: 'Arial, sans-serif',
    fontSize: 24,
    repeat: true,
    applyToImages: true,
    applyToDocuments: true,
  };

  /**
   * 水印选项
   */
  private _options: WatermarkOptions;

  /**
   * 日志记录器
   */
  private _logger: Logger;

  /**
   * 构造函数
   * @param options 水印选项
   */
  constructor(options: WatermarkOptions = {}) {
    this._options = { ...WatermarkProcessor.DEFAULT_OPTIONS, ...options };
    this._logger = new Logger('WatermarkProcessor');
  }

  /**
   * 给图像添加水印
   * @param imageFile 图像文件
   * @returns 带水印的图像Blob
   */
  public async applyToImage(imageFile: File | Blob): Promise<Blob> {
    if (!this._options.applyToImages) {
      return imageFile;
    }

    try {
      // 检查文件类型
      const isImage = this._isImageFile(imageFile);
      if (!isImage) {
        this._logger.warn('尝试给非图像文件添加水印');
        return imageFile;
      }

      // 创建图像对象
      const image = await this._createImageFromFile(imageFile);

      // 创建Canvas
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      // 获取上下文
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法获取Canvas上下文');
      }

      // 绘制原始图像
      ctx.drawImage(image, 0, 0);

      // 应用水印
      this._applyWatermarkToCanvas(ctx, canvas.width, canvas.height);

      // 将Canvas转换回Blob
      const outputType =
        imageFile instanceof File ? imageFile.type : 'image/png';
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          blob => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('无法创建带水印的图像'));
            }
          },
          outputType,
          0.92 // 质量
        );
      });

      return blob;
    } catch (error) {
      this._logger.error('添加图像水印失败:', error);
      return imageFile; // 出错时返回原始文件
    }
  }

  /**
   * 给PDF文档添加水印（简化实现）
   * @param pdfFile PDF文件
   * @returns 带水印的PDF Blob
   */
  public async applyToPdf(pdfFile: File | Blob): Promise<Blob> {
    if (!this._options.applyToDocuments) {
      return pdfFile;
    }

    try {
      // 检查文件类型
      if (
        !(pdfFile instanceof File && pdfFile.type === 'application/pdf') &&
        !(pdfFile instanceof Blob && pdfFile.type === 'application/pdf')
      ) {
        this._logger.warn('尝试给非PDF文件添加水印');
        return pdfFile;
      }

      // 注意：实际的PDF水印添加需要PDF处理库
      // 这里仅作为示例，返回原始文件
      this._logger.info('PDF水印功能需要集成PDF处理库');
      return pdfFile;
    } catch (error) {
      this._logger.error('添加PDF水印失败:', error);
      return pdfFile;
    }
  }

  /**
   * 创建水印图像
   * @returns 水印图像的Data URL
   */
  public createWatermarkImage(width: number, height: number): string {
    // 如果有自定义水印URL，直接返回
    if (this._options.customWatermarkUrl) {
      return this._options.customWatermarkUrl;
    }

    // 创建Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width || 300;
    canvas.height = height || 150;

    // 获取上下文
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取Canvas上下文');
    }

    // 清空Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 设置水印样式
    this._applyWatermarkToCanvas(ctx, canvas.width, canvas.height);

    // 返回Data URL
    return canvas.toDataURL('image/png');
  }

  /**
   * 将水印应用到Canvas上下文
   * @param ctx Canvas上下文
   * @param width 宽度
   * @param height 高度
   */
  private _applyWatermarkToCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    const {
      text,
      opacity,
      angle,
      position,
      color,
      fontFamily,
      fontSize,
      repeat,
    } = this._options;

    // 保存当前状态
    ctx.save();

    // 设置字体和颜色
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color || 'rgba(200, 0, 0, 0.5)';
    ctx.globalAlpha = opacity || 0.2;

    // 测量文本宽度
    const textWidth = ctx.measureText(text || 'CONFIDENTIAL').width;

    // 根据位置确定坐标
    if (!repeat) {
      let x: number, y: number;

      switch (position) {
        case 'topLeft':
          x = 20;
          y = 40;
          break;
        case 'topRight':
          x = width - textWidth - 20;
          y = 40;
          break;
        case 'bottomLeft':
          x = 20;
          y = height - 20;
          break;
        case 'bottomRight':
          x = width - textWidth - 20;
          y = height - 20;
          break;
        case 'center':
        default:
          x = width / 2 - textWidth / 2;
          y = height / 2;
          break;
      }

      // 应用旋转
      if (angle) {
        ctx.translate(x + textWidth / 2, y);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.fillText(text || 'CONFIDENTIAL', -textWidth / 2, 0);
      } else {
        ctx.fillText(text || 'CONFIDENTIAL', x, y);
      }
    } else {
      // 重复水印
      const xStep = textWidth + 60;
      const yStep = (fontSize || 24) * 3;

      for (let x = -xStep; x < width + xStep; x += xStep) {
        for (let y = -yStep; y < height + yStep; y += yStep) {
          ctx.save();
          ctx.translate(x + textWidth / 2, y);
          ctx.rotate(((angle || -30) * Math.PI) / 180);
          ctx.fillText(text || 'CONFIDENTIAL', -textWidth / 2, 0);
          ctx.restore();
        }
      }
    }

    // 恢复状态
    ctx.restore();
  }

  /**
   * 检查文件是否为图像
   * @param file 文件对象
   */
  private _isImageFile(file: File | Blob): boolean {
    const imageTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',
    ];

    // 检查MIME类型
    if (file instanceof File) {
      return (
        imageTypes.includes(file.type) ||
        /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file.name)
      );
    } else {
      return imageTypes.includes(file.type);
    }
  }

  /**
   * 从文件创建Image对象
   * @param file 文件对象
   * @returns Image对象
   */
  private _createImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('无法加载图像'));
      };

      image.src = url;
    });
  }

  /**
   * 更新水印选项
   * @param options 新选项
   */
  public updateOptions(options: Partial<WatermarkOptions>): void {
    this._options = { ...this._options, ...options };
  }
}
