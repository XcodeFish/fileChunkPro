/**
 * 水印处理系统
 * 为文件添加可识别的标记，防止未授权分发
 */

/**
 * 水印位置
 */
export type WatermarkPosition =
  | 'topLeft'
  | 'topRight'
  | 'center'
  | 'bottomLeft'
  | 'bottomRight';

/**
 * 水印类型
 */
export type WatermarkType = 'text' | 'image' | 'mixed';

/**
 * 水印选项
 */
export interface WatermarkOptions {
  /**
   * 水印类型
   * @default 'text'
   */
  type?: WatermarkType;

  /**
   * 水印文本
   * 当type为'text'或'mixed'时使用
   */
  text?: string;

  /**
   * 水印图片URL
   * 当type为'image'或'mixed'时使用
   */
  imageUrl?: string;

  /**
   * 水印透明度
   * @default 0.5
   */
  opacity?: number;

  /**
   * 水印位置
   * @default 'center'
   */
  position?: WatermarkPosition;

  /**
   * 水印旋转角度
   * @default 0
   */
  rotation?: number;

  /**
   * 水印文本样式
   */
  textStyle?: {
    /**
     * 字体
     * @default 'Arial, sans-serif'
     */
    fontFamily?: string;

    /**
     * 字体大小
     * @default '20px'
     */
    fontSize?: string;

    /**
     * 字体颜色
     * @default 'rgba(0, 0, 0, 0.5)'
     */
    color?: string;

    /**
     * 字体粗细
     * @default 'normal'
     */
    fontWeight?: string;
  };

  /**
   * 水印图片样式
   */
  imageStyle?: {
    /**
     * 图片宽度
     * @default 100
     */
    width?: number;

    /**
     * 图片高度
     * @default 100
     */
    height?: number;
  };

  /**
   * 水印间距
   * 用于平铺水印
   */
  spacing?: {
    /**
     * 水平间距
     * @default 150
     */
    horizontal?: number;

    /**
     * 垂直间距
     * @default 150
     */
    vertical?: number;
  };

  /**
   * 是否平铺水印
   * @default false
   */
  tiled?: boolean;

  /**
   * 是否跳过小于指定尺寸的文件
   */
  skipFilesBelow?: {
    /**
     * 文件大小(字节)
     * @default 10240 (10KB)
     */
    size?: number;

    /**
     * 图片宽度(像素)
     */
    width?: number;

    /**
     * 图片高度(像素)
     */
    height?: number;
  };
}

/**
 * 水印处理系统
 * 为图片、文档、视频等添加水印
 */
export default class WatermarkProcessor {
  /**
   * 水印选项
   */
  private options: WatermarkOptions;

  /**
   * 缓存的水印画布
   * 用于提高性能
   */
  private cachedWatermarkCanvas: HTMLCanvasElement | null = null;

  /**
   * 构造函数
   * @param options 水印选项
   */
  constructor(options?: WatermarkOptions) {
    this.options = {
      type: 'text',
      opacity: 0.5,
      position: 'center',
      rotation: 0,
      tiled: false,
      textStyle: {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: 'rgba(0, 0, 0, 0.5)',
        fontWeight: 'normal',
      },
      imageStyle: {
        width: 100,
        height: 100,
      },
      spacing: {
        horizontal: 150,
        vertical: 150,
      },
      skipFilesBelow: {
        size: 10240, // 10KB
      },
      ...options,
    };
  }

  /**
   * 添加水印到文件
   * @param file 文件对象
   * @returns 添加水印后的文件
   */
  public async addWatermark(file: File | Blob): Promise<File | Blob> {
    // 检查文件类型
    const fileType = this.getFileType(file);
    if (!this.isSupportedFileType(fileType)) {
      console.warn(`不支持的文件类型: ${fileType}`);
      return file;
    }

    // 检查文件大小
    if (
      this.options.skipFilesBelow?.size &&
      file.size < this.options.skipFilesBelow.size
    ) {
      console.log(`文件过小，跳过水印处理: ${file.size} bytes`);
      return file;
    }

    try {
      // 根据文件类型处理
      if (this.isImageFile(fileType)) {
        return await this.addWatermarkToImage(file);
      } else if (this.isPdfFile(fileType)) {
        return await this.addWatermarkToPdf(file);
      } else if (this.isVideoFile(fileType)) {
        return await this.addWatermarkToVideo(file);
      }

      // 不支持的类型
      return file;
    } catch (error) {
      console.error('添加水印失败:', error);
      // 水印处理失败，返回原文件
      return file;
    }
  }

  /**
   * 添加水印到图片
   * @param file 图片文件
   * @returns 添加水印后的图片
   */
  private async addWatermarkToImage(file: File | Blob): Promise<File | Blob> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        try {
          // 检查图片尺寸
          if (
            this.options.skipFilesBelow?.width &&
            this.options.skipFilesBelow?.height &&
            (img.width < this.options.skipFilesBelow.width ||
              img.height < this.options.skipFilesBelow.height)
          ) {
            console.log(
              `图片尺寸过小，跳过水印处理: ${img.width}x${img.height}`
            );
            URL.revokeObjectURL(url);
            resolve(file);
            return;
          }

          // 创建画布
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          // 绘制原始图片
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('无法获取Canvas上下文');
          }

          ctx.drawImage(img, 0, 0);

          // 添加水印
          this.applyWatermarkToCanvas(ctx, img.width, img.height);

          // 转换回Blob
          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('Canvas转换为Blob失败'));
              return;
            }

            // 创建新File或Blob
            let result: File | Blob;
            if (file instanceof File) {
              result = new File([blob], file.name, { type: file.type });
            } else {
              result = blob;
            }

            URL.revokeObjectURL(url);
            resolve(result);
          }, file.type);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败'));
      };

      img.src = url;
    });
  }

  /**
   * 添加水印到PDF
   * @param file PDF文件
   * @returns 添加水印后的PDF
   */
  private async addWatermarkToPdf(file: File | Blob): Promise<File | Blob> {
    // PDF水印处理需要专门的PDF处理库
    // 此处为示例实现，实际项目中应当集成PDF.js或其他库
    console.warn('PDF水印功能需要额外的PDF处理库支持');

    // 返回原文件
    return file;
  }

  /**
   * 添加水印到视频
   * @param file 视频文件
   * @returns 添加水印后的视频
   */
  private async addWatermarkToVideo(file: File | Blob): Promise<File | Blob> {
    // 视频水印处理需要专门的视频处理库
    // 此处为示例实现，实际项目中应当集成FFmpeg.js或其他库
    console.warn('视频水印功能需要额外的视频处理库支持');

    // 返回原文件
    return file;
  }

  /**
   * 在画布上应用水印
   * @param ctx Canvas上下文
   * @param width 画布宽度
   * @param height 画布高度
   */
  private applyWatermarkToCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    // 保存当前状态
    ctx.save();

    // 设置全局透明度
    ctx.globalAlpha = this.options.opacity || 0.5;

    // 平铺水印还是单个水印
    if (this.options.tiled) {
      this.applyTiledWatermark(ctx, width, height);
    } else {
      this.applySingleWatermark(ctx, width, height);
    }

    // 恢复状态
    ctx.restore();
  }

  /**
   * 应用单个水印
   * @param ctx Canvas上下文
   * @param width 画布宽度
   * @param height 画布高度
   */
  private applySingleWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    // 计算水印位置
    const position = this.calculateWatermarkPosition(width, height);

    // 移动到位置并旋转
    ctx.translate(position.x, position.y);
    ctx.rotate(((this.options.rotation || 0) * Math.PI) / 180);

    // 根据类型绘制水印
    switch (this.options.type) {
      case 'text':
        this.drawTextWatermark(ctx);
        break;
      case 'image':
        this.drawImageWatermark(ctx);
        break;
      case 'mixed':
        this.drawTextWatermark(ctx);
        this.drawImageWatermark(ctx, 0, 30); // 图片在文字下方
        break;
      default:
        this.drawTextWatermark(ctx);
    }
  }

  /**
   * 应用平铺水印
   * @param ctx Canvas上下文
   * @param width 画布宽度
   * @param height 画布高度
   */
  private applyTiledWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    // 获取或创建水印画布
    const watermarkCanvas = this.getWatermarkCanvas();

    // 创建图案
    const pattern = ctx.createPattern(watermarkCanvas, 'repeat');
    if (!pattern) {
      console.warn('创建水印图案失败');
      return;
    }

    // 填充图案
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * 获取缓存的水印画布
   * @returns 水印画布
   */
  private getWatermarkCanvas(): HTMLCanvasElement {
    if (this.cachedWatermarkCanvas) {
      return this.cachedWatermarkCanvas;
    }

    // 创建水印画布
    const canvas = document.createElement('canvas');
    const spacing = this.options.spacing || { horizontal: 150, vertical: 150 };
    canvas.width = spacing.horizontal;
    canvas.height = spacing.vertical;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取Canvas上下文');
    }

    // 清除背景
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 在中心绘制水印
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(((this.options.rotation || 0) * Math.PI) / 180);

    // 绘制水印
    switch (this.options.type) {
      case 'text':
        this.drawTextWatermark(ctx);
        break;
      case 'image':
        this.drawImageWatermark(ctx);
        break;
      case 'mixed':
        this.drawTextWatermark(ctx);
        this.drawImageWatermark(ctx, 0, 30);
        break;
      default:
        this.drawTextWatermark(ctx);
    }

    // 缓存画布
    this.cachedWatermarkCanvas = canvas;
    return canvas;
  }

  /**
   * 绘制文本水印
   * @param ctx Canvas上下文
   * @param offsetX X偏移
   * @param offsetY Y偏移
   */
  private drawTextWatermark(
    ctx: CanvasRenderingContext2D,
    offsetX = 0,
    offsetY = 0
  ): void {
    if (!this.options.text) {
      return;
    }

    const textStyle = this.options.textStyle || {};

    ctx.font = `${textStyle.fontWeight || 'normal'} ${
      textStyle.fontSize || '20px'
    } ${textStyle.fontFamily || 'Arial, sans-serif'}`;

    ctx.fillStyle = textStyle.color || 'rgba(0, 0, 0, 0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(this.options.text, offsetX, offsetY);
  }

  /**
   * 绘制图片水印
   * @param ctx Canvas上下文
   * @param offsetX X偏移
   * @param offsetY Y偏移
   */
  private drawImageWatermark(
    ctx: CanvasRenderingContext2D,
    offsetX = 0,
    offsetY = 0
  ): void {
    if (!this.options.imageUrl) {
      return;
    }

    // 注意: 此处为简化实现，实际项目中应该预加载图片
    const img = new Image();
    img.src = this.options.imageUrl;

    const imageStyle = this.options.imageStyle || {};
    const width = imageStyle.width || 100;
    const height = imageStyle.height || 100;

    // 尝试绘制图片
    // 在实际项目中，应该使用预加载的图片
    try {
      if (img.complete) {
        ctx.drawImage(
          img,
          offsetX - width / 2,
          offsetY - height / 2,
          width,
          height
        );
      }
    } catch (error) {
      console.error('绘制水印图片失败:', error);
    }
  }

  /**
   * 计算水印位置
   * @param width 画布宽度
   * @param height 画布高度
   * @returns 位置坐标
   */
  private calculateWatermarkPosition(
    width: number,
    height: number
  ): { x: number; y: number } {
    const position = this.options.position || 'center';

    // 边距
    const margin = 20;

    switch (position) {
      case 'topLeft':
        return { x: margin, y: margin };
      case 'topRight':
        return { x: width - margin, y: margin };
      case 'bottomLeft':
        return { x: margin, y: height - margin };
      case 'bottomRight':
        return { x: width - margin, y: height - margin };
      case 'center':
      default:
        return { x: width / 2, y: height / 2 };
    }
  }

  /**
   * 获取文件类型
   * @param file 文件
   * @returns 文件类型
   */
  private getFileType(file: File | Blob): string {
    if (file instanceof File) {
      return file.type || this.getTypeFromName(file.name);
    }
    return file.type || '';
  }

  /**
   * 从文件名获取类型
   * @param fileName 文件名
   * @returns 文件类型
   */
  private getTypeFromName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    // 常见扩展名映射
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
    };

    return mimeTypes[extension] || '';
  }

  /**
   * 检查是否为支持的文件类型
   * @param fileType 文件类型
   * @returns 是否支持
   */
  private isSupportedFileType(fileType: string): boolean {
    return (
      this.isImageFile(fileType) ||
      this.isPdfFile(fileType) ||
      this.isVideoFile(fileType)
    );
  }

  /**
   * 检查是否为图片文件
   * @param fileType 文件类型
   * @returns 是否为图片
   */
  private isImageFile(fileType: string): boolean {
    return /^image\//.test(fileType);
  }

  /**
   * 检查是否为PDF文件
   * @param fileType 文件类型
   * @returns 是否为PDF
   */
  private isPdfFile(fileType: string): boolean {
    return fileType === 'application/pdf';
  }

  /**
   * 检查是否为视频文件
   * @param fileType 文件类型
   * @returns 是否为视频
   */
  private isVideoFile(fileType: string): boolean {
    return /^video\//.test(fileType);
  }

  /**
   * 设置水印选项
   * @param options 新选项
   */
  public setOptions(options: Partial<WatermarkOptions>): void {
    this.options = {
      ...this.options,
      ...options,
      textStyle: {
        ...this.options.textStyle,
        ...options.textStyle,
      },
      imageStyle: {
        ...this.options.imageStyle,
        ...options.imageStyle,
      },
      spacing: {
        ...this.options.spacing,
        ...options.spacing,
      },
      skipFilesBelow: {
        ...this.options.skipFilesBelow,
        ...options.skipFilesBelow,
      },
    };

    // 更新选项后清除缓存
    this.cachedWatermarkCanvas = null;
  }

  /**
   * 生成文本水印
   * @param text 水印文本
   * @param options 水印选项
   * @returns 水印处理器实例
   */
  public static createTextWatermark(
    text: string,
    options?: Partial<WatermarkOptions>
  ): WatermarkProcessor {
    return new WatermarkProcessor({
      type: 'text',
      text,
      ...options,
    });
  }

  /**
   * 生成图片水印
   * @param imageUrl 水印图片URL
   * @param options 水印选项
   * @returns 水印处理器实例
   */
  public static createImageWatermark(
    imageUrl: string,
    options?: Partial<WatermarkOptions>
  ): WatermarkProcessor {
    return new WatermarkProcessor({
      type: 'image',
      imageUrl,
      ...options,
    });
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    // 释放缓存的画布
    this.cachedWatermarkCanvas = null;
  }
}
