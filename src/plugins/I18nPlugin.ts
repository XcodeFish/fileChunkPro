/**
 * 国际化插件 - 提供多语言支持、RTL布局支持和区域设置适配
 */
import {
  LanguageCode,
  TextDirection,
  RTL_LANGUAGES,
  II18nOptions,
  II18nContext,
  TranslateFn,
} from '../types/i18n';
import { IPlugin, PluginType } from '../types/plugins';
import { UploaderCore } from '../core/UploaderCore';
import { EventBus } from '../core/EventBus';

/**
 * 默认英文错误信息
 */
const DEFAULT_EN_MESSAGES = {
  'error.network': 'Network error',
  'error.server': 'Server error',
  'error.timeout': 'Upload timeout',
  'error.fileSize': 'File is too large',
  'error.fileType': 'File type not allowed',
  'error.maxFiles': 'Too many files',
  'button.upload': 'Upload',
  'button.cancel': 'Cancel',
  'button.retry': 'Retry',
  'button.remove': 'Remove',
  'dropzone.text': 'Drop files here or click to upload',
  'file.status.pending': 'Pending',
  'file.status.uploading': 'Uploading',
  'file.status.success': 'Success',
  'file.status.error': 'Error',
  'file.status.canceled': 'Canceled',
};

/**
 * 默认中文错误信息
 */
const DEFAULT_ZH_MESSAGES = {
  'error.network': '网络错误',
  'error.server': '服务器错误',
  'error.timeout': '上传超时',
  'error.fileSize': '文件太大',
  'error.fileType': '文件类型不允许',
  'error.maxFiles': '文件数量过多',
  'button.upload': '上传',
  'button.cancel': '取消',
  'button.retry': '重试',
  'button.remove': '移除',
  'dropzone.text': '将文件拖放到此处或点击上传',
  'file.status.pending': '等待中',
  'file.status.uploading': '上传中',
  'file.status.success': '成功',
  'file.status.error': '错误',
  'file.status.canceled': '已取消',
};

/**
 * 默认语言资源
 */
const DEFAULT_RESOURCES: Record<LanguageCode, Record<string, string>> = {
  'en-US': DEFAULT_EN_MESSAGES,
  'zh-CN': DEFAULT_ZH_MESSAGES,
};

/**
 * 默认国际化配置
 */
const DEFAULT_I18N_OPTIONS: II18nOptions = {
  currentLanguage: 'en-US',
  defaultLanguage: 'en-US',
  supportedLanguages: ['en-US', 'zh-CN'],
  autoDetect: true,
  rtlSupport: true,
  missingTranslationStrategy: 'fallback',
  resourceLoadStrategy: 'all',
  resources: DEFAULT_RESOURCES,
};

/**
 * 国际化插件类
 */
export class I18nPlugin implements IPlugin {
  /** 插件名称 */
  public readonly name: string = 'I18nPlugin';
  /** 插件类型 */
  public readonly type: PluginType = PluginType.CORE;
  /** 插件版本 */
  public readonly version: string = '1.0.0';
  /** 插件依赖 */
  public readonly dependencies: string[] = [];

  /** 国际化配置选项 */
  private _options: II18nOptions;
  /** 核心实例引用 */
  private _core: UploaderCore | null = null;
  /** 事件总线引用 */
  private _eventBus: EventBus | null = null;
  /** 国际化上下文 */
  private _i18nContext: II18nContext | null = null;
  /** 当前文字方向 */
  private _direction: TextDirection = 'ltr';
  /** 语言资源 */
  private _resources: Record<LanguageCode, Record<string, string>> = {};
  /** 自定义日期格式化器 */
  private _dateFormatters: Record<LanguageCode, Intl.DateTimeFormat> = {};
  /** 自定义数字格式化器 */
  private _numberFormatters: Record<LanguageCode, Intl.NumberFormat> = {};
  /** RTL样式元素 */
  private _rtlStyleElement: HTMLStyleElement | null = null;

  /**
   * 构造函数
   * @param options 国际化配置选项
   */
  constructor(options?: Partial<II18nOptions>) {
    this._options = {
      ...DEFAULT_I18N_OPTIONS,
      ...options,
    };

    // 合并语言资源
    this._resources = {
      ...DEFAULT_RESOURCES,
      ...(this._options.resources || {}),
    };

    // 自动检测浏览器语言
    if (this._options.autoDetect) {
      this._detectBrowserLanguage();
    }

    // 设置文字方向
    this._setDirection(this._options.currentLanguage);
  }

  /**
   * 安装插件
   * @param core 上传核心实例
   */
  public install(core: UploaderCore): void {
    this._core = core;
    this._eventBus = core.getEventBus();

    // 创建国际化上下文
    this._createI18nContext();

    // 暴露国际化上下文
    core.addFeature('i18n', this._i18nContext);

    // 添加国际化错误信息处理
    core.addHook('formatErrorMessage', this._formatErrorMessage.bind(this));

    // 如果启用RTL支持，则应用RTL样式
    if (this._options.rtlSupport && this._direction === 'rtl') {
      this._applyRTLStyles();
    }

    // 注册DOM类以标识文字方向
    document.documentElement.setAttribute('dir', this._direction);
    document.documentElement.classList.add(`file-chunk-pro-${this._direction}`);
  }

  /**
   * 卸载插件
   */
  public uninstall(): void {
    if (!this._core) return;

    // 移除RTL样式
    this._removeRTLStyles();

    // 移除DOM类和属性
    document.documentElement.removeAttribute('dir');
    document.documentElement.classList.remove(
      `file-chunk-pro-ltr`,
      `file-chunk-pro-rtl`
    );

    this._core = null;
    this._eventBus = null;
    this._i18nContext = null;
  }

  /**
   * 获取国际化配置
   */
  public getOptions(): II18nOptions {
    return { ...this._options };
  }

  /**
   * 更新国际化配置
   * @param options 新的配置选项
   */
  public updateOptions(options: Partial<II18nOptions>): void {
    const oldLanguage = this._options.currentLanguage;

    this._options = {
      ...this._options,
      ...options,
    };

    // 更新语言资源
    if (options.resources) {
      this._resources = {
        ...this._resources,
        ...options.resources,
      };
    }

    // 如果语言发生变化，更新方向并重新创建上下文
    if (options.currentLanguage && options.currentLanguage !== oldLanguage) {
      this._setDirection(options.currentLanguage);
      this._createI18nContext();

      // 触发语言变化回调
      if (this._options.onLanguageChanged) {
        this._options.onLanguageChanged(options.currentLanguage);
      }

      // 如果插件已安装且RTL支持已启用，则更新RTL样式
      if (this._core && this._options.rtlSupport) {
        this._removeRTLStyles();
        if (this._direction === 'rtl') {
          this._applyRTLStyles();
        }

        // 更新DOM属性
        document.documentElement.setAttribute('dir', this._direction);
        document.documentElement.classList.remove(
          `file-chunk-pro-ltr`,
          `file-chunk-pro-rtl`
        );
        document.documentElement.classList.add(
          `file-chunk-pro-${this._direction}`
        );
      }
    }
  }

  /**
   * 获取国际化上下文
   */
  public getI18nContext(): II18nContext | null {
    return this._i18nContext;
  }

  /**
   * 获取翻译函数
   */
  public getTranslate(): TranslateFn | null {
    return this._i18nContext?.t || null;
  }

  /**
   * 获取当前文字方向
   */
  public getDirection(): TextDirection {
    return this._direction;
  }

  /**
   * 切换语言
   * @param language 目标语言
   */
  public async changeLanguage(language: LanguageCode): Promise<void> {
    // 验证语言是否支持
    if (!this._options.supportedLanguages.includes(language)) {
      console.warn(`语言 ${language} 不在支持的语言列表中`);
      return;
    }

    // 更新配置
    this.updateOptions({ currentLanguage: language });

    // 如果有核心实例，重新应用配置
    if (this._core) {
      // 触发语言变化事件
      this._eventBus?.emit('i18n:languageChanged', {
        language,
        direction: this._direction,
      });
    }
  }

  /**
   * 添加语言资源
   * @param language 语言代码
   * @param resources 资源对象
   */
  public addResources(
    language: LanguageCode,
    resources: Record<string, string>
  ): void {
    if (!this._resources[language]) {
      this._resources[language] = {};
    }

    this._resources[language] = {
      ...this._resources[language],
      ...resources,
    };

    // 更新已创建的上下文
    if (this._i18nContext) {
      this._createI18nContext();
    }
  }

  /**
   * 检测浏览器语言
   */
  private _detectBrowserLanguage(): void {
    if (typeof navigator === 'undefined') return;

    // 获取浏览器语言
    const browserLanguage = navigator.language;

    // 检查是否支持该语言
    if (this._options.supportedLanguages.includes(browserLanguage)) {
      this._options.currentLanguage = browserLanguage;
    } else {
      // 尝试匹配语言前缀（例如，如果不支持zh-TW但支持zh-CN）
      const prefix = browserLanguage.split('-')[0];
      const matchedLanguage = this._options.supportedLanguages.find(lang =>
        lang.startsWith(prefix)
      );

      if (matchedLanguage) {
        this._options.currentLanguage = matchedLanguage;
      }
    }
  }

  /**
   * 设置文字方向
   * @param language 语言代码
   */
  private _setDirection(language: LanguageCode): void {
    this._direction = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
  }

  /**
   * 创建国际化上下文
   */
  private _createI18nContext(): void {
    // 创建翻译函数
    const t: TranslateFn = (key, params = {}, options = {}) => {
      const language = options.lng || this._options.currentLanguage;
      const fallbackLanguage = this._options.defaultLanguage;

      // 获取翻译文本
      let text = this._getTranslation(key, language, fallbackLanguage);

      // 应用参数替换
      if (params && Object.keys(params).length > 0) {
        text = this._interpolate(text, params);
      }

      return text;
    };

    // 创建日期格式化函数
    const formatDate = (
      date: Date,
      options?: Intl.DateTimeFormatOptions
    ): string => {
      const language = this._options.currentLanguage;

      if (!this._dateFormatters[language]) {
        this._dateFormatters[language] = new Intl.DateTimeFormat(language, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          ...options,
        });
      }

      return this._dateFormatters[language].format(date);
    };

    // 创建数字格式化函数
    const formatNumber = (
      number: number,
      options?: Intl.NumberFormatOptions
    ): string => {
      const language = this._options.currentLanguage;

      if (!this._numberFormatters[language]) {
        this._numberFormatters[language] = new Intl.NumberFormat(
          language,
          options
        );
      }

      return this._numberFormatters[language].format(number);
    };

    // 创建货币格式化函数
    const formatCurrency = (
      amount: number,
      currency: string,
      options?: Intl.NumberFormatOptions
    ): string => {
      const language = this._options.currentLanguage;

      const formatter = new Intl.NumberFormat(language, {
        style: 'currency',
        currency,
        ...options,
      });

      return formatter.format(amount);
    };

    // 创建上下文对象
    this._i18nContext = {
      currentLanguage: this._options.currentLanguage,
      direction: this._direction,
      t,
      changeLanguage: this.changeLanguage.bind(this),
      formatDate,
      formatNumber,
      formatCurrency,
    };
  }

  /**
   * 获取翻译文本
   * @param key 翻译键
   * @param language 当前语言
   * @param fallbackLanguage 备用语言
   */
  private _getTranslation(
    key: string,
    language: LanguageCode,
    fallbackLanguage: LanguageCode
  ): string {
    // 检查当前语言是否有该翻译
    if (
      this._resources[language] &&
      this._resources[language][key] !== undefined
    ) {
      return this._resources[language][key];
    }

    // 如果没有找到，根据策略处理
    switch (this._options.missingTranslationStrategy) {
      case 'fallback':
        // 尝试从备用语言获取
        if (
          language !== fallbackLanguage &&
          this._resources[fallbackLanguage] &&
          this._resources[fallbackLanguage][key] !== undefined
        ) {
          return this._resources[fallbackLanguage][key];
        }
        // 如果备用语言也没有，返回键名
        return key;

      case 'key':
        // 返回键名
        return key;

      case 'empty':
        // 返回空字符串
        return '';

      case 'error':
        // 抛出错误
        console.error(
          `Missing translation for key: ${key} in language: ${language}`
        );
        return `[MISSING: ${key}]`;

      default:
        return key;
    }
  }

  /**
   * 插值替换参数
   * @param text 文本模板
   * @param params 参数对象
   */
  private _interpolate(
    text: string,
    params: Record<string, string | number>
  ): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const value = params[key.trim()];
      return value !== undefined ? String(value) : `{{${key}}}`;
    });
  }

  /**
   * 格式化错误信息
   * @param error 错误对象
   * @param defaultMessage 默认错误信息
   */
  private _formatErrorMessage(error: any, defaultMessage: string): string {
    if (!this._i18nContext) return defaultMessage;

    // 尝试根据错误类型获取翻译的错误信息
    if (error.type) {
      const errorKey = `error.${error.type.toLowerCase()}`;
      const translated = this._i18nContext.t(
        errorKey,
        {},
        {
          defaultValue: defaultMessage,
        }
      );

      return translated;
    }

    return defaultMessage;
  }

  /**
   * 应用RTL样式
   */
  private _applyRTLStyles(): void {
    if (typeof document === 'undefined') return;

    // 创建样式元素
    this._rtlStyleElement = document.createElement('style');
    this._rtlStyleElement.id = 'file-chunk-pro-rtl-styles';
    this._rtlStyleElement.textContent = `
      .file-chunk-pro-rtl * {
        direction: rtl;
        text-align: right;
      }
      
      .file-chunk-pro-rtl .uploader-progress-bar {
        transform: scaleX(-1);
      }
      
      .file-chunk-pro-rtl .uploader-file-item {
        flex-direction: row-reverse;
      }
      
      .file-chunk-pro-rtl .uploader-control-buttons {
        flex-direction: row-reverse;
      }
      
      .file-chunk-pro-rtl .uploader-dropzone-icon {
        margin-right: 0;
        margin-left: 8px;
      }
    `;

    // 添加到文档头部
    document.head.appendChild(this._rtlStyleElement);
  }

  /**
   * 移除RTL样式
   */
  private _removeRTLStyles(): void {
    if (
      this._rtlStyleElement &&
      document.head.contains(this._rtlStyleElement)
    ) {
      document.head.removeChild(this._rtlStyleElement);
      this._rtlStyleElement = null;
    }
  }
}
