/**
 * 国际化相关类型定义
 */

/**
 * 支持的语言代码类型
 */
export type LanguageCode = 
  | 'zh-CN'  // 简体中文
  | 'en-US'  // 英语(美国)
  | 'ja-JP'  // 日语
  | 'ko-KR'  // 韩语
  | 'fr-FR'  // 法语
  | 'de-DE'  // 德语
  | 'es-ES'  // 西班牙语
  | 'ru-RU'  // 俄语
  | 'ar-SA'  // 阿拉伯语(沙特)
  | 'pt-BR'  // 葡萄牙语(巴西)
  | 'it-IT'  // 意大利语
  | string;  // 其他语言

/**
 * 文字方向类型
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * RTL支持的语言列表
 */
export const RTL_LANGUAGES: LanguageCode[] = [
  'ar-SA',  // 阿拉伯语
  'he-IL',  // 希伯来语
  'ur-PK',  // 乌尔都语
  'fa-IR'   // 波斯语
];

/**
 * 国际化配置接口
 */
export interface II18nOptions {
  /** 当前语言 */
  currentLanguage: LanguageCode;
  /** 默认语言 */
  defaultLanguage: LanguageCode;
  /** 支持的语言列表 */
  supportedLanguages: LanguageCode[];
  /** 是否自动检测浏览器语言 */
  autoDetect?: boolean;
  /** 语言变化回调 */
  onLanguageChanged?: (language: LanguageCode) => void;
  /** 自定义翻译资源 */
  resources?: Record<LanguageCode, Record<string, string>>;
  /** 是否启用RTL支持 */
  rtlSupport?: boolean;
  /** 缺失翻译处理策略 */
  missingTranslationStrategy?: 'fallback' | 'key' | 'empty' | 'error';
  /** 资源加载策略 */
  resourceLoadStrategy?: 'all' | 'onDemand';
}

/**
 * 翻译函数类型
 */
export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
  options?: {
    ns?: string;
    lng?: LanguageCode;
    defaultValue?: string;
  }
) => string;

/**
 * 国际化上下文接口
 */
export interface II18nContext {
  /** 当前语言 */
  currentLanguage: LanguageCode;
  /** 文字方向 */
  direction: TextDirection;
  /** 翻译函数 */
  t: TranslateFn;
  /** 切换语言 */
  changeLanguage: (language: LanguageCode) => Promise<void>;
  /** 格式化日期 */
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
  /** 格式化数字 */
  formatNumber: (number: number, options?: Intl.NumberFormatOptions) => string;
  /** 格式化货币 */
  formatCurrency: (
    amount: number, 
    currency: string, 
    options?: Intl.NumberFormatOptions
  ) => string;
} 