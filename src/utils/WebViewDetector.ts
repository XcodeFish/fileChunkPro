/**
 * WebViewDetector - WebView环境检测工具
 * 提供精确的WebView环境检测、识别不同WebView引擎及其特性与限制
 */

export interface WebViewInfo {
  isWebView: boolean; // 是否为WebView环境
  type: WebViewType; // WebView类型
  engine: WebViewEngine; // WebView引擎
  version?: string; // 版本号（如果可检测）
  osType?: 'ios' | 'android' | 'other'; // 操作系统类型
  limitations: WebViewLimitation[]; // 功能限制列表
}

export enum WebViewType {
  NATIVE_BROWSER = 'native_browser', // 原生浏览器
  SYSTEM_WEBVIEW = 'system_webview', // 系统WebView
  IN_APP = 'in_app', // 应用内WebView
  MINI_PROGRAM = 'mini_program', // 小程序WebView
  HYBRID = 'hybrid', // 混合应用WebView
  UNKNOWN = 'unknown', // 未知类型
}

export enum WebViewEngine {
  WEBKIT = 'webkit', // iOS WKWebView
  BLINK = 'blink', // Android WebView (Chrome based)
  TRIDENT = 'trident', // IE WebView
  GECKO = 'gecko', // Firefox based
  UNKNOWN = 'unknown', // 未知引擎
}

export enum WebViewLimitation {
  FILE_SIZE_LIMIT = 'file_size_limit', // 文件大小限制
  NO_SERVICE_WORKER = 'no_service_worker', // 不支持Service Worker
  NO_INDEXEDDB = 'no_indexeddb', // 不支持IndexedDB
  LIMITED_STORAGE = 'limited_storage', // 存储空间限制
  FILE_UPLOAD_ISSUES = 'file_upload_issues', // 文件上传问题
  NO_BACKGROUND_PROCESSING = 'no_background_processing', // 不支持后台处理
  NO_SHARED_WORKER = 'no_shared_worker', // 不支持SharedWorker
  COOKIE_LIMITATIONS = 'cookie_limitations', // Cookie限制
  CACHING_ISSUES = 'caching_issues', // 缓存问题
}

/**
 * WebView环境检测类
 */
export class WebViewDetector {
  private static instance: WebViewDetector;
  private cachedInfo: WebViewInfo | null = null;

  /**
   * 获取WebViewDetector单例
   */
  public static getInstance(): WebViewDetector {
    if (!WebViewDetector.instance) {
      WebViewDetector.instance = new WebViewDetector();
    }
    return WebViewDetector.instance;
  }

  /**
   * 私有构造函数
   * 禁止外部直接实例化，应使用getInstance()方法获取实例
   */
  private constructor() {
    // 无需初始化逻辑，使用惰性加载策略
  }

  /**
   * 检测当前是否在WebView环境中
   * @returns WebView环境信息
   */
  public detectWebView(): WebViewInfo {
    // 使用缓存避免重复检测
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const userAgent =
      typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const result: WebViewInfo = {
      isWebView: false,
      type: WebViewType.NATIVE_BROWSER,
      engine: WebViewEngine.UNKNOWN,
      limitations: [],
    };

    // 检查是否为WebView环境
    this.detectIsWebView(result, userAgent);

    // 如果是WebView，进一步检测类型和引擎
    if (result.isWebView) {
      this.detectWebViewType(result, userAgent);
      this.detectWebViewEngine(result, userAgent);
      this.detectOSType(result, userAgent);
      this.detectLimitations(result);
    }

    this.cachedInfo = result;
    return result;
  }

  /**
   * 检测是否为WebView
   */
  private detectIsWebView(result: WebViewInfo, userAgent: string): void {
    // iOS WebView特征检测
    const isIOSWebView = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(
      userAgent
    );

    // Android WebView特征检测
    const isAndroidWebView =
      /; wv\)/i.test(userAgent) ||
      /Android.*Version\/[0-9]+\.[0-9]+/i.test(userAgent);

    // 其他常见WebView特征
    const hasWebViewTraits =
      /WebView|FBAV|FBAN|Line|Instagram|KAKAOTALK|NAVER|dolphin|BOLT|Touch/i.test(
        userAgent
      );

    // 检测是否有明确的WebView标识
    const hasExplicitWebViewFlag =
      typeof window !== 'undefined' &&
      // @ts-ignore - 检测常见的WebView标识
      (window.webkit?.messageHandlers !== undefined ||
        window.JavaScriptInterface !== undefined ||
        window.android !== undefined);

    result.isWebView =
      isIOSWebView ||
      isAndroidWebView ||
      hasWebViewTraits ||
      hasExplicitWebViewFlag;
  }

  /**
   * 检测WebView类型
   */
  private detectWebViewType(result: WebViewInfo, userAgent: string): void {
    if (/FBAV|FBAN/i.test(userAgent)) {
      result.type = WebViewType.IN_APP; // Facebook内嵌浏览器
    } else if (/Line\//i.test(userAgent)) {
      result.type = WebViewType.IN_APP; // Line内嵌浏览器
    } else if (/Instagram/i.test(userAgent)) {
      result.type = WebViewType.IN_APP; // Instagram内嵌浏览器
    } else if (/KAKAOTALK/i.test(userAgent)) {
      result.type = WebViewType.IN_APP; // KakaoTalk内嵌浏览器
    } else if (/NAVER/i.test(userAgent)) {
      result.type = WebViewType.IN_APP; // NAVER内嵌浏览器
    } else if (/MicroMessenger/i.test(userAgent)) {
      result.type = WebViewType.MINI_PROGRAM; // 微信内嵌浏览器/小程序
    } else if (/AlipayClient/i.test(userAgent)) {
      result.type = WebViewType.MINI_PROGRAM; // 支付宝内嵌浏览器/小程序
    } else if (/; wv\)/i.test(userAgent)) {
      result.type = WebViewType.SYSTEM_WEBVIEW; // Android System WebView
    } else if (/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(userAgent)) {
      result.type = WebViewType.SYSTEM_WEBVIEW; // iOS WKWebView
    } else {
      result.type = WebViewType.UNKNOWN;
    }
  }

  /**
   * 检测WebView引擎
   */
  private detectWebViewEngine(result: WebViewInfo, userAgent: string): void {
    if (/AppleWebKit/i.test(userAgent) && /iPhone|iPad|iPod/i.test(userAgent)) {
      result.engine = WebViewEngine.WEBKIT;

      // 尝试提取WebKit版本
      const webkitMatch = userAgent.match(/AppleWebKit\/([0-9]+\.[0-9]+)/i);
      if (webkitMatch && webkitMatch[1]) {
        result.version = webkitMatch[1];
      }
    } else if (/AppleWebKit/i.test(userAgent) && /Chrome/i.test(userAgent)) {
      result.engine = WebViewEngine.BLINK;

      // 尝试提取Chrome版本
      const chromeMatch = userAgent.match(/Chrome\/([0-9]+\.[0-9]+)/i);
      if (chromeMatch && chromeMatch[1]) {
        result.version = chromeMatch[1];
      }
    } else if (/Trident/i.test(userAgent)) {
      result.engine = WebViewEngine.TRIDENT;

      // 尝试提取IE版本
      const tridentMatch = userAgent.match(/Trident\/([0-9]+\.[0-9]+)/i);
      if (tridentMatch && tridentMatch[1]) {
        result.version = tridentMatch[1];
      }
    } else if (/Gecko/i.test(userAgent) && /Firefox/i.test(userAgent)) {
      result.engine = WebViewEngine.GECKO;

      // 尝试提取Firefox版本
      const firefoxMatch = userAgent.match(/Firefox\/([0-9]+\.[0-9]+)/i);
      if (firefoxMatch && firefoxMatch[1]) {
        result.version = firefoxMatch[1];
      }
    } else {
      result.engine = WebViewEngine.UNKNOWN;
    }
  }

  /**
   * 检测操作系统类型
   */
  private detectOSType(result: WebViewInfo, userAgent: string): void {
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      result.osType = 'ios';
    } else if (/Android/i.test(userAgent)) {
      result.osType = 'android';
    } else {
      result.osType = 'other';
    }
  }

  /**
   * 检测WebView限制
   */
  private detectLimitations(result: WebViewInfo): void {
    const limitations: WebViewLimitation[] = [];

    // iOS WKWebView的限制
    if (result.engine === WebViewEngine.WEBKIT && result.osType === 'ios') {
      // iOS WKWebView文件上传限制
      limitations.push(WebViewLimitation.FILE_UPLOAD_ISSUES);

      // iOS WKWebView的版本特定限制
      if (result.version && parseFloat(result.version) < 605) {
        limitations.push(WebViewLimitation.NO_INDEXEDDB);
      }

      // iOS通常有存储限制
      limitations.push(WebViewLimitation.LIMITED_STORAGE);
    }

    // 检查通用的WebView功能限制
    this.checkCommonLimitations(limitations);

    // Android WebView的特定限制
    if (result.engine === WebViewEngine.BLINK && result.osType === 'android') {
      // 旧版Android WebView可能不支持Service Worker
      if (result.version && parseFloat(result.version) < 40) {
        limitations.push(WebViewLimitation.NO_SERVICE_WORKER);
      }
    }

    // 应用内WebView通常有更多限制
    if (result.type === WebViewType.IN_APP) {
      limitations.push(WebViewLimitation.FILE_SIZE_LIMIT);
      limitations.push(WebViewLimitation.COOKIE_LIMITATIONS);
    }

    result.limitations = limitations;
  }

  /**
   * 检查通用WebView限制
   */
  private checkCommonLimitations(limitations: WebViewLimitation[]): void {
    // 检查Service Worker支持
    if (typeof navigator !== 'undefined' && !('serviceWorker' in navigator)) {
      limitations.push(WebViewLimitation.NO_SERVICE_WORKER);
    }

    // 检查IndexedDB支持
    if (typeof indexedDB === 'undefined') {
      limitations.push(WebViewLimitation.NO_INDEXEDDB);
    }

    // 检查SharedWorker支持
    if (typeof SharedWorker === 'undefined') {
      limitations.push(WebViewLimitation.NO_SHARED_WORKER);
    }

    // 检查后台处理支持
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.scheduling === 'undefined'
    ) {
      limitations.push(WebViewLimitation.NO_BACKGROUND_PROCESSING);
    }
  }

  /**
   * 获取推荐配置
   * @returns 根据WebView环境推荐的配置
   */
  public getRecommendedConfig(): Record<string, any> {
    const info = this.detectWebView();

    if (!info.isWebView) {
      return {}; // 非WebView环境，返回空配置
    }

    const config: Record<string, any> = {
      useWorker: true,
      useServiceWorker: false, // 大多数WebView不支持ServiceWorker
      maxConcurrentTasks: 3,
      retryCount: 3,
      chunkSize: 2 * 1024 * 1024, // 默认2MB分片
    };

    // 根据限制调整配置
    if (info.limitations.includes(WebViewLimitation.NO_SERVICE_WORKER)) {
      config.useServiceWorker = false;
    }

    if (info.limitations.includes(WebViewLimitation.LIMITED_STORAGE)) {
      config.resumable = false; // 禁用断点续传
      config.storageQuota = 5 * 1024 * 1024; // 限制存储用量
    }

    if (info.limitations.includes(WebViewLimitation.FILE_SIZE_LIMIT)) {
      config.maxFileSize = 100 * 1024 * 1024; // 限制最大文件大小为100MB
      config.chunkSize = 1 * 1024 * 1024; // 减小分片大小到1MB
    }

    if (info.limitations.includes(WebViewLimitation.FILE_UPLOAD_ISSUES)) {
      config.maxConcurrentTasks = 2; // 减少并发上传任务数
      config.retryCount = 5; // 增加重试次数
      config.progressInterval = 1000; // 降低进度更新频率
    }

    // iOS WKWebView特殊处理
    if (info.engine === WebViewEngine.WEBKIT && info.osType === 'ios') {
      config.validateProgress = false; // 由于iOS WKWebView的进度事件不可靠，禁用进度验证
      config.useNativeChunking = false; // 禁用原生分片，使用自定义分片
    }

    return config;
  }

  /**
   * 根据WebView环境重置配置，应用最佳实践
   * @param config 原始配置
   * @returns 调整后的配置
   */
  public applyWebViewOptimizations(
    config: Record<string, any>
  ): Record<string, any> {
    const info = this.detectWebView();

    if (!info.isWebView) {
      return config; // 非WebView环境，不做调整
    }

    // 创建配置的副本，避免修改原始配置
    const optimizedConfig = { ...config };

    // 应用WebView优化
    if (info.osType === 'ios' && info.engine === WebViewEngine.WEBKIT) {
      // iOS WKWebView优化
      optimizedConfig.chunks = optimizedConfig.chunks || {};
      optimizedConfig.chunks.forceIframeTransport = true; // 对iOS WKWebView使用iframe传输
      optimizedConfig.timeout = Math.max(optimizedConfig.timeout || 0, 60000); // 增加超时时间
    }

    // 应用通用WebView优化
    if (info.limitations.includes(WebViewLimitation.CACHING_ISSUES)) {
      optimizedConfig.cache = false; // 禁用缓存
    }

    if (info.limitations.includes(WebViewLimitation.NO_BACKGROUND_PROCESSING)) {
      optimizedConfig.backgroundProcessing = false; // 禁用后台处理
    }

    return optimizedConfig;
  }

  /**
   * 获取WebView环境的详细信息，用于调试
   */
  public getWebViewDetails(): Record<string, any> {
    const info = this.detectWebView();

    return {
      ...info,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      specificFeatures: this.detectSpecificWebViewFeatures(),
    };
  }

  /**
   * 检测特定WebView特性
   */
  private detectSpecificWebViewFeatures(): Record<string, boolean> {
    const features: Record<string, boolean> = {};

    // 检测是否可以全屏
    features.fullscreenSupport =
      (typeof document !== 'undefined' &&
        (document.fullscreenEnabled ||
          // @ts-ignore - 检测特定浏览器前缀
          document.webkitFullscreenEnabled ||
          document.mozFullScreenEnabled)) ||
      false;

    // 检测是否支持通知
    features.notificationSupport =
      typeof window !== 'undefined' && 'Notification' in window;

    // 检测是否支持振动
    features.vibrationSupport =
      typeof navigator !== 'undefined' && 'vibrate' in navigator;

    // 检测是否支持地理位置
    features.geolocationSupport =
      typeof navigator !== 'undefined' && 'geolocation' in navigator;

    // 检测是否支持WebRTC
    features.webRTCSupport =
      typeof window !== 'undefined' &&
      ('RTCPeerConnection' in window ||
        'webkitRTCPeerConnection' in window ||
        'mozRTCPeerConnection' in window);

    return features;
  }
}

export default WebViewDetector;
