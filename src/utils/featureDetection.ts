/**
 * 环境特性检测工具
 * 提供运行时环境能力检测，替代静态环境判断
 */

export interface FeatureSupport {
  webWorker: boolean;
  fileAccess: boolean;
  storage: boolean;
  fetch: boolean;
  webAssembly: boolean;
  arrayBuffer: boolean;
  mediaCapture: boolean;
  canvas: boolean;
  permissions: boolean;
  webGL: boolean;
  browserSpecific: {
    isChrome: boolean;
    isFirefox: boolean;
    isSafari: boolean;
    isEdge: boolean;
  };
  mobileSpecific: {
    isTouchDevice: boolean;
    hasDeviceMotion: boolean;
  };
  miniprogramSpecific: {
    isWechat: boolean;
    isAlipay: boolean;
    isBytedance: boolean;
    isBaidu: boolean;
  };
}

/**
 * 检测当前运行环境的特性支持情况
 * @returns {FeatureSupport} 特性支持情况对象
 */
export function detectFeatures(): FeatureSupport {
  // 默认所有特性不支持
  const features: FeatureSupport = {
    webWorker: false,
    fileAccess: false,
    storage: false,
    fetch: false,
    webAssembly: false,
    arrayBuffer: false,
    mediaCapture: false,
    canvas: false,
    permissions: false,
    webGL: false,
    browserSpecific: {
      isChrome: false,
      isFirefox: false,
      isSafari: false,
      isEdge: false,
    },
    mobileSpecific: {
      isTouchDevice: false,
      hasDeviceMotion: false,
    },
    miniprogramSpecific: {
      isWechat: false,
      isAlipay: false,
      isBytedance: false,
      isBaidu: false,
    },
  };

  // 检测全局环境
  const globalObj =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : typeof global !== 'undefined'
          ? global
          : typeof self !== 'undefined'
            ? self
            : ({} as any);

  // Web Worker 支持
  features.webWorker = typeof Worker !== 'undefined';

  // 文件访问支持
  features.fileAccess =
    typeof FileReader !== 'undefined' ||
    typeof globalObj.wx?.getFileSystemManager === 'function';

  // 存储支持
  features.storage =
    typeof localStorage !== 'undefined' ||
    typeof globalObj.wx?.setStorageSync === 'function' ||
    typeof globalObj.my?.setStorageSync === 'function';

  // Fetch 支持
  features.fetch =
    typeof fetch !== 'undefined' ||
    typeof globalObj.wx?.request === 'function' ||
    typeof globalObj.my?.request === 'function';

  // WebAssembly 支持
  features.webAssembly = typeof WebAssembly !== 'undefined';

  // ArrayBuffer 支持
  features.arrayBuffer = typeof ArrayBuffer !== 'undefined';

  // 媒体捕获支持
  features.mediaCapture =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  // Canvas 支持
  features.canvas =
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    Boolean(document.createElement('canvas').getContext);

  // Permissions API 支持
  features.permissions =
    typeof navigator !== 'undefined' &&
    typeof navigator.permissions !== 'undefined';

  // WebGL 支持
  features.webGL = (function () {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!(
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      );
    } catch (e) {
      return false;
    }
  })();

  // 浏览器特定检测
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string'
  ) {
    const ua = navigator.userAgent;
    features.browserSpecific.isChrome = /Chrome/.test(ua) && !/Edge/.test(ua);
    features.browserSpecific.isFirefox = /Firefox/.test(ua);
    features.browserSpecific.isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    features.browserSpecific.isEdge = /Edg/.test(ua);
  }

  // 移动设备特性
  features.mobileSpecific.isTouchDevice =
    'ontouchstart' in globalObj ||
    (globalObj.DocumentTouch && document instanceof globalObj.DocumentTouch);
  features.mobileSpecific.hasDeviceMotion =
    typeof DeviceMotionEvent !== 'undefined';

  // 小程序环境检测
  features.miniprogramSpecific.isWechat =
    typeof globalObj.wx !== 'undefined' &&
    typeof globalObj.wx.getSystemInfo === 'function';
  features.miniprogramSpecific.isAlipay =
    typeof globalObj.my !== 'undefined' &&
    typeof globalObj.my.getSystemInfo === 'function';
  features.miniprogramSpecific.isBytedance =
    typeof globalObj.tt !== 'undefined' &&
    typeof globalObj.tt.getSystemInfo === 'function';
  features.miniprogramSpecific.isBaidu =
    typeof globalObj.swan !== 'undefined' &&
    typeof globalObj.swan.getSystemInfo === 'function';

  return features;
}

/**
 * 特性能力检测结果缓存
 */
let cachedFeatures: FeatureSupport | null = null;

/**
 * 获取特性支持情况，使用缓存提高性能
 * @returns {FeatureSupport} 特性支持情况对象
 */
export function getFeatures(): FeatureSupport {
  if (!cachedFeatures) {
    cachedFeatures = detectFeatures();
  }
  return cachedFeatures;
}

/**
 * 重置特性检测缓存（用于测试或环境变化场景）
 */
export function resetFeatureDetection(): void {
  cachedFeatures = null;
}

/**
 * 检查是否支持指定特性
 * @param {keyof FeatureSupport} featureName 特性名称
 * @returns {boolean} 是否支持
 */
export function hasFeature<K extends keyof FeatureSupport>(
  featureName: K
): boolean {
  const features = getFeatures();
  return Boolean(features[featureName]);
}

/**
 * 获取当前运行的环境类型
 * @returns {string} 环境类型标识
 */
export function getEnvironmentType(): string {
  const features = getFeatures();

  if (features.miniprogramSpecific.isWechat) return 'wechat';
  if (features.miniprogramSpecific.isAlipay) return 'alipay';
  if (features.miniprogramSpecific.isBytedance) return 'bytedance';
  if (features.miniprogramSpecific.isBaidu) return 'baidu';

  // 判断是否为Taro或uni-app环境的逻辑需要根据实际项目调整
  if (typeof globalThis !== 'undefined' && (globalThis as any).__TARO__)
    return 'taro';
  if (typeof globalThis !== 'undefined' && (globalThis as any).__UNI__)
    return 'uni-app';

  // 默认认为是浏览器环境
  return 'browser';
}
