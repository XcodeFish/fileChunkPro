/**
 * RTL(从右到左)布局辅助工具
 */
import { TextDirection, RTL_LANGUAGES, LanguageCode } from '../types/i18n';

/**
 * RTL辅助工具类
 */
export class RTLHelper {
  /**
   * 判断语言是否为RTL布局
   * @param language 语言代码
   */
  public static isRTL(language: LanguageCode): boolean {
    return RTL_LANGUAGES.includes(language);
  }

  /**
   * 获取指定语言的文字方向
   * @param language 语言代码
   */
  public static getDirection(language: LanguageCode): TextDirection {
    return RTLHelper.isRTL(language) ? 'rtl' : 'ltr';
  }

  /**
   * 转换CSS值用于RTL
   * 将left转为right，right转为left
   * @param property CSS属性名
   * @param value CSS值
   * @param isRTL 是否为RTL模式
   */
  public static transformCSSValue(
    property: string,
    value: string | number,
    isRTL: boolean
  ): string | number {
    if (!isRTL) return value;

    // 转换方向值
    if (typeof value === 'string') {
      if (property.includes('left') || property.includes('right')) {
        if (value === 'left') return 'right';
        if (value === 'right') return 'left';
      }

      // 转换margin和padding的快捷属性
      if (
        property === 'margin' ||
        property === 'padding' ||
        property === 'border-width' ||
        property === 'border-style' ||
        property === 'border-color'
      ) {
        const parts = value.split(' ');
        if (parts.length === 4) {
          // top right bottom left -> top left bottom right
          return `${parts[0]} ${parts[3]} ${parts[2]} ${parts[1]}`;
        }
      }

      // 转换位置值 (例如: transform: translate(10px, 0))
      if (property === 'transform' && value.includes('translate')) {
        return value.replace(/translate\(([^,]+)(.*)\)/, (match, x, rest) => {
          // 水平翻转x轴的值
          const xValue = parseFloat(x);
          if (!isNaN(xValue) && x.includes('px')) {
            const newX = -xValue + 'px';
            return `translate(${newX}${rest})`;
          }
          return match;
        });
      }
    }

    return value;
  }

  /**
   * 获取RTL调整后的CSS属性名
   * @param property CSS属性名
   * @param isRTL 是否为RTL模式
   */
  public static transformCSSProperty(property: string, isRTL: boolean): string {
    if (!isRTL) return property;

    // 转换常见的方向性属性
    switch (property) {
      case 'margin-left':
        return 'margin-right';
      case 'margin-right':
        return 'margin-left';
      case 'padding-left':
        return 'padding-right';
      case 'padding-right':
        return 'padding-left';
      case 'border-left':
        return 'border-right';
      case 'border-right':
        return 'border-left';
      case 'border-left-color':
        return 'border-right-color';
      case 'border-right-color':
        return 'border-left-color';
      case 'border-left-width':
        return 'border-right-width';
      case 'border-right-width':
        return 'border-left-width';
      case 'border-left-style':
        return 'border-right-style';
      case 'border-right-style':
        return 'border-left-style';
      case 'border-top-left-radius':
        return 'border-top-right-radius';
      case 'border-top-right-radius':
        return 'border-top-left-radius';
      case 'border-bottom-left-radius':
        return 'border-bottom-right-radius';
      case 'border-bottom-right-radius':
        return 'border-bottom-left-radius';
      case 'left':
        return 'right';
      case 'right':
        return 'left';
      case 'text-align':
        // 文本对齐特殊处理
        return property;
      default:
        return property;
    }
  }

  /**
   * 根据当前方向调整样式对象
   * @param styles 原始样式对象
   * @param isRTL 是否为RTL模式
   */
  public static transformStyles(
    styles: Record<string, string | number>,
    isRTL: boolean
  ): Record<string, string | number> {
    if (!isRTL) return styles;

    const result: Record<string, string | number> = {};

    // 处理每个样式属性
    Object.entries(styles).forEach(([property, value]) => {
      const newProperty = RTLHelper.transformCSSProperty(property, isRTL);
      const newValue = RTLHelper.transformCSSValue(property, value, isRTL);

      result[newProperty] = newValue;
    });

    // 特殊处理文本对齐
    if (styles.textAlign === 'left') {
      result.textAlign = 'right';
    } else if (styles.textAlign === 'right') {
      result.textAlign = 'left';
    }

    return result;
  }

  /**
   * 为元素应用RTL样式
   * @param element DOM元素
   * @param styles 样式对象
   * @param isRTL 是否为RTL模式
   */
  public static applyStyles(
    element: HTMLElement,
    styles: Record<string, string | number>,
    isRTL: boolean
  ): void {
    const transformedStyles = RTLHelper.transformStyles(styles, isRTL);

    // 应用样式到元素
    Object.entries(transformedStyles).forEach(([property, value]) => {
      (element.style as any)[property] = value;
    });
  }

  /**
   * 创建RTL适配的样式表
   * @param selector CSS选择器
   * @param styles 样式对象
   * @param isRTL 是否为RTL模式
   */
  public static createStylesheet(
    selector: string,
    styles: Record<string, string | number>,
    isRTL: boolean
  ): string {
    const transformedStyles = RTLHelper.transformStyles(styles, isRTL);

    let css = `${selector} {\n`;

    // 构建CSS规则
    Object.entries(transformedStyles).forEach(([property, value]) => {
      // 转换驼峰命名为连字符命名
      const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
      css += `  ${cssProperty}: ${value};\n`;
    });

    css += `}\n`;

    return css;
  }

  /**
   * 应用RTL相关的属性到DOM元素
   * @param element DOM元素
   * @param direction 文字方向
   */
  public static applyDirectionAttributes(
    element: HTMLElement,
    direction: TextDirection
  ): void {
    // 设置dir属性
    element.setAttribute('dir', direction);

    // 添加方向类
    element.classList.remove('rtl', 'ltr');
    element.classList.add(direction);
  }

  /**
   * 创建适配RTL的样式表并添加到文档
   * @param styles RTL和LTR样式映射
   * @param id 样式表ID
   */
  public static createAndApplyStylesheet(
    styles: {
      ltr: Record<string, Record<string, string | number>>;
      rtl: Record<string, Record<string, string | number>>;
    },
    id: string
  ): HTMLStyleElement {
    // 创建样式元素
    const styleElement = document.createElement('style');
    styleElement.id = id;

    // 构建样式内容
    let styleContent = '';

    // 添加LTR样式
    Object.entries(styles.ltr).forEach(([selector, rules]) => {
      styleContent += RTLHelper.createStylesheet(selector, rules, false);
    });

    // 添加RTL样式
    Object.entries(styles.rtl).forEach(([selector, rules]) => {
      styleContent += RTLHelper.createStylesheet(selector, rules, true);
    });

    // 设置样式内容
    styleElement.textContent = styleContent;

    // 添加到文档头部
    document.head.appendChild(styleElement);

    return styleElement;
  }
}
