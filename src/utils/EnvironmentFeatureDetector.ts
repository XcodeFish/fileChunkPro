/**
 * EnvironmentFeatureDetector.ts
 * 环境特性检测器，用于检测当前环境支持的API和功能
 */

import { Environment } from '../types/environment';

/**
 * API支持级别枚举
 */
export enum SupportLevel {
  /**
   * 完全支持
   */
  FULL = 'full',

  /**
   * 部分支持（有限制或需要polyfill）
   */
  PARTIAL = 'partial',

  /**
   * 不支持
   */
  NONE = 'none',

  /**
   * 未知
   */
  UNKNOWN = 'unknown',
}

/**
 * API类别枚举
 */
export enum APICategory {
  /**
   * 文件系统API
   */
  FILE_SYSTEM = 'file_system',

  /**
   * 网络API
   */
  NETWORK = 'network',

  /**
   * 存储API
   */
  STORAGE = 'storage',

  /**
   * 多媒体API
   */
  MEDIA = 'media',

  /**
   * 安全API
   */
  SECURITY = 'security',

  /**
   * 性能API
   */
  PERFORMANCE = 'performance',

  /**
   * 多线程API
   */
  THREADING = 'threading',

  /**
   * 用户界面API
   */
  UI = 'ui',

  /**
   * 其他API
   */
  OTHER = 'other',
}

/**
 * 特性检测结果接口
 */
export interface FeatureDetectionResult {
  /**
   * 特性名称
   */
  name: string;

  /**
   * 特性类别
   */
  category: APICategory;

  /**
   * 支持级别
   */
  supportLevel: SupportLevel;

  /**
   * 详细说明
   */
  details: string;

  /**
   * 兼容方案（如果需要）
   */
  compatibility?: string;

  /**
   * 兼容性信息链接
   */
  infoUrl?: string;
}

/**
 * 环境特性检测器类
 * 用于检测当前环境支持的API和功能
 */
class EnvironmentFeatureDetector {
  private static instance: EnvironmentFeatureDetector | null = null;

  /**
   * 特性检测结果缓存
   */
  private _featureCache: Map<string, FeatureDetectionResult> = new Map();

  /**
   * 获取EnvironmentFeatureDetector单例
   */
  public static getInstance(): EnvironmentFeatureDetector {
    if (!this.instance) {
      this.instance = new EnvironmentFeatureDetector();
    }
    return this.instance;
  }

  /**
   * 构造函数
   */
  private constructor() {
    // 私有构造函数，防止直接实例化
  }

  /**
   * 检测特定功能支持情况
   * @param featureName 功能名称
   * @returns 特性检测结果
   */
  public detectFeature(featureName: string): FeatureDetectionResult {
    // 检查缓存
    if (this._featureCache.has(featureName)) {
      return this._featureCache.get(featureName)!;
    }

    let result: FeatureDetectionResult;

    switch (featureName) {
      case 'FileReader':
        result = this.detectFileReaderAPI();
        break;
      case 'Blob':
        result = this.detectBlobAPI();
        break;
      case 'File':
        result = this.detectFileAPI();
        break;
      case 'IndexedDB':
        result = this.detectIndexedDB();
        break;
      case 'LocalStorage':
        result = this.detectLocalStorage();
        break;
      case 'WebWorkers':
        result = this.detectWebWorkers();
        break;
      case 'Fetch':
        result = this.detectFetchAPI();
        break;
      case 'XHR':
        result = this.detectXHR();
        break;
      case 'WebCrypto':
        result = this.detectWebCryptoAPI();
        break;
      default:
        result = {
          name: featureName,
          category: APICategory.OTHER,
          supportLevel: SupportLevel.UNKNOWN,
          details: `未知特性: ${featureName}`,
        };
    }

    // 缓存结果
    this._featureCache.set(featureName, result);

    return result;
  }

  /**
   * 检测一组API特性的支持情况
   * @param features 特性名称数组
   * @returns 特性检测结果映射
   */
  public detectFeatures(
    features: string[]
  ): Map<string, FeatureDetectionResult> {
    const results = new Map<string, FeatureDetectionResult>();

    features.forEach(feature => {
      results.set(feature, this.detectFeature(feature));
    });

    return results;
  }

  /**
   * 检测基本环境特性
   * @param environment 运行时环境
   * @returns 特性检测结果列表
   */
  public detectBasicFeatures(
    environment: Environment
  ): FeatureDetectionResult[] {
    const results: FeatureDetectionResult[] = [];

    // 基本特性检测
    results.push(this.detectFeature('Blob'));
    results.push(this.detectFeature('File'));
    results.push(this.detectFeature('FileReader'));

    // 根据环境类型添加特定检测
    if (environment === Environment.Browser) {
      results.push(this.detectFeature('IndexedDB'));
      results.push(this.detectFeature('LocalStorage'));
      results.push(this.detectFeature('WebWorkers'));
      results.push(this.detectFeature('WebCrypto'));
    }

    return results;
  }

  /**
   * 判断上传功能在当前环境的支持级别
   * @returns 支持级别及详情
   */
  public detectUploadCapabilities(): {
    level: SupportLevel;
    details: string;
    missingFeatures: string[];
  } {
    const requiredFeatures = ['File', 'Blob', 'XHR'];
    const desirableFeatures = ['FileReader', 'WebWorkers', 'Fetch'];

    const missingRequired: string[] = [];
    const missingDesirable: string[] = [];

    // 检查必要特性
    requiredFeatures.forEach(feature => {
      const result = this.detectFeature(feature);
      if (result.supportLevel === SupportLevel.NONE) {
        missingRequired.push(feature);
      }
    });

    // 检查理想特性
    desirableFeatures.forEach(feature => {
      const result = this.detectFeature(feature);
      if (result.supportLevel === SupportLevel.NONE) {
        missingDesirable.push(feature);
      }
    });

    if (missingRequired.length > 0) {
      return {
        level: SupportLevel.NONE,
        details: `环境缺少上传功能必要的API: ${missingRequired.join(', ')}`,
        missingFeatures: [...missingRequired, ...missingDesirable],
      };
    } else if (missingDesirable.length > 0) {
      return {
        level: SupportLevel.PARTIAL,
        details: `环境支持基本上传功能，但缺少增强特性: ${missingDesirable.join(', ')}`,
        missingFeatures: missingDesirable,
      };
    } else {
      return {
        level: SupportLevel.FULL,
        details: '环境完全支持所有上传相关功能',
        missingFeatures: [],
      };
    }
  }

  /**
   * 检测本地存储能力
   * @returns 支持级别及详情
   */
  public detectStorageCapabilities(): {
    level: SupportLevel;
    details: string;
    bestOption: string;
  } {
    const hasIndexedDB =
      this.detectFeature('IndexedDB').supportLevel === SupportLevel.FULL;
    const hasLocalStorage =
      this.detectFeature('LocalStorage').supportLevel === SupportLevel.FULL;

    if (hasIndexedDB) {
      return {
        level: SupportLevel.FULL,
        details: '环境支持IndexedDB，可以存储大量数据',
        bestOption: 'IndexedDB',
      };
    } else if (hasLocalStorage) {
      return {
        level: SupportLevel.PARTIAL,
        details: '环境支持LocalStorage，但存储容量有限',
        bestOption: 'LocalStorage',
      };
    } else {
      return {
        level: SupportLevel.NONE,
        details: '环境不支持本地存储功能',
        bestOption: 'Memory',
      };
    }
  }

  /**
   * 清除特性检测缓存
   */
  public clearCache(): void {
    this._featureCache.clear();
  }

  // 以下是各特性检测的私有方法

  private detectFileReaderAPI(): FeatureDetectionResult {
    const isSupported = typeof FileReader !== 'undefined';

    return {
      name: 'FileReader',
      category: APICategory.FILE_SYSTEM,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported
        ? '环境支持FileReader API'
        : '环境不支持FileReader API',
      compatibility: isSupported
        ? undefined
        : '可以使用自定义适配器实现类似功能',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/FileReader',
    };
  }

  private detectBlobAPI(): FeatureDetectionResult {
    const isSupported = typeof Blob !== 'undefined';

    return {
      name: 'Blob',
      category: APICategory.FILE_SYSTEM,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported ? '环境支持Blob API' : '环境不支持Blob API',
      compatibility: isSupported ? undefined : '可以使用ArrayBuffer代替',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/Blob',
    };
  }

  private detectFileAPI(): FeatureDetectionResult {
    const isSupported = typeof File !== 'undefined';

    return {
      name: 'File',
      category: APICategory.FILE_SYSTEM,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported ? '环境支持File API' : '环境不支持File API',
      compatibility: isSupported ? undefined : '可以使用自定义对象模拟文件特性',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/File',
    };
  }

  private detectIndexedDB(): FeatureDetectionResult {
    const isSupported = typeof indexedDB !== 'undefined';

    return {
      name: 'IndexedDB',
      category: APICategory.STORAGE,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported ? '环境支持IndexedDB' : '环境不支持IndexedDB',
      compatibility: isSupported
        ? undefined
        : '可以使用localStorage或内存存储代替',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/IndexedDB_API',
    };
  }

  private detectLocalStorage(): FeatureDetectionResult {
    let isSupported = false;

    try {
      isSupported = typeof localStorage !== 'undefined';
      if (isSupported) {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
      }
    } catch (e) {
      isSupported = false;
    }

    return {
      name: 'LocalStorage',
      category: APICategory.STORAGE,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported ? '环境支持localStorage' : '环境不支持localStorage',
      compatibility: isSupported ? undefined : '可以使用内存存储代替',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/Window/localStorage',
    };
  }

  private detectWebWorkers(): FeatureDetectionResult {
    const isSupported = typeof Worker !== 'undefined';

    return {
      name: 'WebWorkers',
      category: APICategory.THREADING,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported ? '环境支持Web Workers' : '环境不支持Web Workers',
      compatibility: isSupported ? undefined : '需要在主线程中执行所有操作',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/Web_Workers_API',
    };
  }

  private detectFetchAPI(): FeatureDetectionResult {
    const isSupported = typeof fetch !== 'undefined';

    return {
      name: 'Fetch',
      category: APICategory.NETWORK,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported ? '环境支持Fetch API' : '环境不支持Fetch API',
      compatibility: isSupported ? undefined : '可以使用XMLHttpRequest代替',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/Fetch_API',
    };
  }

  private detectXHR(): FeatureDetectionResult {
    const isSupported = typeof XMLHttpRequest !== 'undefined';

    return {
      name: 'XHR',
      category: APICategory.NETWORK,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported
        ? '环境支持XMLHttpRequest'
        : '环境不支持XMLHttpRequest',
      compatibility: isSupported ? undefined : '需要使用平台特定的网络请求API',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/XMLHttpRequest',
    };
  }

  private detectWebCryptoAPI(): FeatureDetectionResult {
    const isSupported =
      typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

    return {
      name: 'WebCrypto',
      category: APICategory.SECURITY,
      supportLevel: isSupported ? SupportLevel.FULL : SupportLevel.NONE,
      details: isSupported
        ? '环境支持Web Crypto API'
        : '环境不支持Web Crypto API',
      compatibility: isSupported ? undefined : '建议使用JS实现的加密库',
      infoUrl: 'https://developer.mozilla.org/docs/Web/API/Web_Crypto_API',
    };
  }
}

// 导出环境特性检测器单例
export const featureDetector = EnvironmentFeatureDetector.getInstance();
