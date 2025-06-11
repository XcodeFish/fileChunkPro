/**
 * 小程序环境优化器
 * 用于增强小程序环境下的文件上传能力，优化API差异处理
 */

import { Logger } from './Logger';
import { EnvironmentDetectionSystem } from './EnvironmentDetectionSystem';
import { Environment } from '../types/environment';
import { IUploadParameters } from '../types/AdaptiveUploadTypes';

// 小程序平台类型
export enum MiniProgramPlatform {
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  BYTEDANCE = 'bytedance',
  BAIDU = 'baidu',
  QQ = 'qq',
  UNKNOWN = 'unknown',
}

// API兼容性映射表接口
export interface ApiCompatMap {
  [key: string]: {
    wechat?: string;
    alipay?: string;
    bytedance?: string;
    baidu?: string;
    qq?: string;
    default?: string;
    parameterMap?: Record<string, string>;
    resultMap?: Record<string, string>;
  };
}

// 小程序限制信息接口
export interface MiniProgramLimitation {
  type: string;
  description: string;
  value?: number | string;
  affectedPlatforms: MiniProgramPlatform[];
  workaround?: string;
}

// 小程序配置建议接口
export interface MiniProgramRecommendation {
  chunkSize: number;
  concurrency: number;
  retryCount: number;
  timeout: number;
  useChunks: boolean;
  storageStrategy: string;
  apiMode: 'native' | 'compatible';
}

/**
 * 小程序环境优化器类
 * 提供小程序环境的优化和API适配
 */
export class MiniProgramOptimizer {
  private static instance: MiniProgramOptimizer;
  private logger: Logger;
  private envDetectionSystem: EnvironmentDetectionSystem;
  private currentPlatform: MiniProgramPlatform = MiniProgramPlatform.UNKNOWN;
  private compatibilityMode = false;

  // 小程序API兼容性映射表
  private apiCompatMap: ApiCompatMap = {
    // 上传文件API
    uploadFile: {
      wechat: 'wx.uploadFile',
      alipay: 'my.uploadFile',
      bytedance: 'tt.uploadFile',
      baidu: 'swan.uploadFile',
      qq: 'qq.uploadFile',
      default: 'uploadFile',
      parameterMap: {
        alipay: {
          name: 'fileName',
          filePath: 'filePath',
        },
      },
    },

    // 下载文件API
    downloadFile: {
      wechat: 'wx.downloadFile',
      alipay: 'my.downloadFile',
      bytedance: 'tt.downloadFile',
      baidu: 'swan.downloadFile',
      qq: 'qq.downloadFile',
      default: 'downloadFile',
    },

    // 获取文件信息API
    getFileInfo: {
      wechat: 'wx.getFileInfo',
      alipay: 'my.getFileInfo',
      bytedance: 'tt.getFileInfo',
      baidu: 'swan.getFileInfo',
      qq: 'qq.getFileInfo',
      default: 'getFileInfo',
    },

    // 文件系统API
    getFileSystemManager: {
      wechat: 'wx.getFileSystemManager',
      alipay: 'my.getFileSystemManager',
      bytedance: 'tt.getFileSystemManager',
      baidu: 'swan.getFileSystemManager',
      qq: 'qq.getFileSystemManager',
      default: 'getFileSystemManager',
    },

    // 存储API
    setStorage: {
      wechat: 'wx.setStorage',
      alipay: 'my.setStorage',
      bytedance: 'tt.setStorage',
      baidu: 'swan.setStorage',
      qq: 'qq.setStorage',
      default: 'setStorage',
    },

    getStorage: {
      wechat: 'wx.getStorage',
      alipay: 'my.getStorage',
      bytedance: 'tt.getStorage',
      baidu: 'swan.getStorage',
      qq: 'qq.getStorage',
      default: 'getStorage',
    },

    // 网络请求API
    request: {
      wechat: 'wx.request',
      alipay: 'my.request',
      bytedance: 'tt.request',
      baidu: 'swan.request',
      qq: 'qq.request',
      default: 'request',
    },

    // Worker API
    createWorker: {
      wechat: 'wx.createWorker',
      alipay: undefined, // 支付宝小程序不支持Worker
      bytedance: 'tt.createWorker',
      baidu: 'swan.createWorker',
      qq: 'qq.createWorker',
      default: 'createWorker',
    },
  };

  // 小程序限制信息
  private limitations: MiniProgramLimitation[] = [
    {
      type: 'max_upload_size',
      description: '微信小程序单个文件上传大小限制为10MB',
      value: 10 * 1024 * 1024,
      affectedPlatforms: [MiniProgramPlatform.WECHAT],
      workaround: '使用分片上传绕过限制',
    },
    {
      type: 'max_upload_size',
      description: '支付宝小程序单个文件上传大小限制为20MB',
      value: 20 * 1024 * 1024,
      affectedPlatforms: [MiniProgramPlatform.ALIPAY],
      workaround: '使用分片上传绕过限制',
    },
    {
      type: 'max_download_size',
      description: '字节跳动小程序下载文件大小限制为50MB',
      value: 50 * 1024 * 1024,
      affectedPlatforms: [MiniProgramPlatform.BYTEDANCE],
    },
    {
      type: 'no_worker_support',
      description: '支付宝小程序不支持Worker',
      affectedPlatforms: [MiniProgramPlatform.ALIPAY],
      workaround: '在主线程中执行计算，避免密集计算',
    },
    {
      type: 'max_storage',
      description: '微信小程序存储空间限制为10MB',
      value: 10 * 1024 * 1024,
      affectedPlatforms: [MiniProgramPlatform.WECHAT],
      workaround: '使用文件系统临时存储或分段存储',
    },
    {
      type: 'max_concurrency',
      description: '百度小程序并发网络请求数限制为5',
      value: 5,
      affectedPlatforms: [MiniProgramPlatform.BAIDU],
    },
    {
      type: 'timeout_limit',
      description: '小程序网络请求默认超时时间为60秒',
      value: 60000,
      affectedPlatforms: [
        MiniProgramPlatform.WECHAT,
        MiniProgramPlatform.ALIPAY,
        MiniProgramPlatform.BYTEDANCE,
        MiniProgramPlatform.BAIDU,
        MiniProgramPlatform.QQ,
      ],
    },
    {
      type: 'file_types',
      description: '小程序文件上传只支持特定的文件类型',
      affectedPlatforms: [
        MiniProgramPlatform.WECHAT,
        MiniProgramPlatform.ALIPAY,
        MiniProgramPlatform.BYTEDANCE,
        MiniProgramPlatform.BAIDU,
        MiniProgramPlatform.QQ,
      ],
      workaround: '检查并转换文件类型',
    },
  ];

  /**
   * 获取单例实例
   */
  public static getInstance(): MiniProgramOptimizer {
    if (!MiniProgramOptimizer.instance) {
      MiniProgramOptimizer.instance = new MiniProgramOptimizer();
    }
    return MiniProgramOptimizer.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this.logger = new Logger('MiniProgramOptimizer');
    this.envDetectionSystem = EnvironmentDetectionSystem.getInstance();
  }

  /**
   * 初始化小程序环境优化器
   * @param options 初始化选项
   */
  public async initialize(
    options: {
      forcePlatform?: MiniProgramPlatform;
      enableCompatibilityMode?: boolean;
      customApiCompatMap?: Partial<ApiCompatMap>;
    } = {}
  ): Promise<MiniProgramPlatform> {
    this.logger.debug('初始化小程序环境优化器');

    // 设置选项
    if (options.forcePlatform) {
      this.currentPlatform = options.forcePlatform;
    } else {
      await this.detectMiniProgramPlatform();
    }

    this.compatibilityMode = options.enableCompatibilityMode ?? true;

    // 合并自定义API映射
    if (options.customApiCompatMap) {
      this.apiCompatMap = {
        ...this.apiCompatMap,
        ...options.customApiCompatMap,
      };
    }

    this.logger.debug('小程序环境优化器初始化完成', {
      platform: this.currentPlatform,
      compatibilityMode: this.compatibilityMode,
    });

    return this.currentPlatform;
  }

  /**
   * 检测当前小程序平台
   */
  private async detectMiniProgramPlatform(): Promise<MiniProgramPlatform> {
    try {
      const envDetection = await this.envDetectionSystem.detectEnvironment();

      // 根据环境确定平台
      switch (envDetection.environment) {
        case Environment.WechatMP:
          this.currentPlatform = MiniProgramPlatform.WECHAT;
          break;
        case Environment.AlipayMP:
          this.currentPlatform = MiniProgramPlatform.ALIPAY;
          break;
        case Environment.BytedanceMP:
          this.currentPlatform = MiniProgramPlatform.BYTEDANCE;
          break;
        case Environment.BaiduMP:
          this.currentPlatform = MiniProgramPlatform.BAIDU;
          break;
        default:
          // 尝试通过全局对象检测
          if (typeof wx !== 'undefined') {
            this.currentPlatform = MiniProgramPlatform.WECHAT;
          } else if (typeof my !== 'undefined') {
            this.currentPlatform = MiniProgramPlatform.ALIPAY;
          } else if (typeof tt !== 'undefined') {
            this.currentPlatform = MiniProgramPlatform.BYTEDANCE;
          } else if (typeof swan !== 'undefined') {
            this.currentPlatform = MiniProgramPlatform.BAIDU;
          } else if (typeof qq !== 'undefined') {
            this.currentPlatform = MiniProgramPlatform.QQ;
          } else {
            this.currentPlatform = MiniProgramPlatform.UNKNOWN;
          }
      }

      this.logger.debug('检测到小程序平台', { platform: this.currentPlatform });
      return this.currentPlatform;
    } catch (error) {
      this.logger.warn('检测小程序平台失败', error);
      this.currentPlatform = MiniProgramPlatform.UNKNOWN;
      return MiniProgramPlatform.UNKNOWN;
    }
  }

  /**
   * 获取针对当前小程序环境优化的上传参数
   */
  public getOptimizedUploadParameters(): IUploadParameters {
    const config: IUploadParameters = {
      chunkSize: 2 * 1024 * 1024, // 默认2MB
      concurrency: 3,
      retryCount: 3,
      retryDelay: 1000,
      timeout: 60000,
      precheckEnabled: true,
      useWorker: false,
    };

    // 根据平台进行参数优化
    switch (this.currentPlatform) {
      case MiniProgramPlatform.WECHAT:
        config.chunkSize = 2 * 1024 * 1024; // 2MB
        config.concurrency = 3;
        config.useWorker = true; // 微信支持Worker
        break;

      case MiniProgramPlatform.ALIPAY:
        config.chunkSize = 4 * 1024 * 1024; // 4MB
        config.concurrency = 2;
        config.useWorker = false; // 支付宝不支持Worker
        break;

      case MiniProgramPlatform.BYTEDANCE:
        config.chunkSize = 5 * 1024 * 1024; // 5MB
        config.concurrency = 2;
        config.useWorker = true;
        break;

      case MiniProgramPlatform.BAIDU:
        config.chunkSize = 2 * 1024 * 1024; // 2MB
        config.concurrency = 3;
        config.useWorker = true;
        break;

      case MiniProgramPlatform.QQ:
        config.chunkSize = 3 * 1024 * 1024; // 3MB
        config.concurrency = 2;
        config.useWorker = true;
        break;
    }

    return config;
  }

  /**
   * 获取API调用映射
   * @param apiName API名称
   */
  public getApiMapping(apiName: string): string | undefined {
    if (this.currentPlatform === MiniProgramPlatform.UNKNOWN) {
      return this.apiCompatMap[apiName]?.default;
    }

    const platformKey =
      this.currentPlatform.toLowerCase() as keyof (typeof this.apiCompatMap)[typeof apiName];
    return (
      this.apiCompatMap[apiName]?.[platformKey] ||
      this.apiCompatMap[apiName]?.default
    );
  }

  /**
   * 获取API参数映射
   * @param apiName API名称
   * @param params 原始参数
   */
  public mapApiParameters(
    apiName: string,
    params: Record<string, any>
  ): Record<string, any> {
    if (
      this.currentPlatform === MiniProgramPlatform.UNKNOWN ||
      !this.compatibilityMode
    ) {
      return params;
    }

    const apiConfig = this.apiCompatMap[apiName];
    const platformKey = this.currentPlatform.toLowerCase() as string;
    const parameterMap = apiConfig?.parameterMap?.[platformKey];

    if (!parameterMap) {
      return params;
    }

    const mappedParams: Record<string, any> = { ...params };

    // 映射参数名称
    for (const [originalKey, mappedKey] of Object.entries(parameterMap)) {
      if (Object.prototype.hasOwnProperty.call(mappedParams, originalKey)) {
        mappedParams[mappedKey] = mappedParams[originalKey];
        if (originalKey !== mappedKey) {
          delete mappedParams[originalKey];
        }
      }
    }

    return mappedParams;
  }

  /**
   * 映射API结果
   * @param apiName API名称
   * @param result 原始结果
   */
  public mapApiResult(
    apiName: string,
    result: Record<string, any>
  ): Record<string, any> {
    if (
      this.currentPlatform === MiniProgramPlatform.UNKNOWN ||
      !this.compatibilityMode
    ) {
      return result;
    }

    const apiConfig = this.apiCompatMap[apiName];
    const platformKey = this.currentPlatform.toLowerCase() as string;
    const resultMap = apiConfig?.resultMap?.[platformKey];

    if (!resultMap) {
      return result;
    }

    const mappedResult: Record<string, any> = { ...result };

    // 映射结果字段
    for (const [platformKey, commonKey] of Object.entries(resultMap)) {
      if (Object.prototype.hasOwnProperty.call(mappedResult, platformKey)) {
        mappedResult[commonKey] = mappedResult[platformKey];
        if (platformKey !== commonKey) {
          delete mappedResult[platformKey];
        }
      }
    }

    return mappedResult;
  }

  /**
   * 统一上传文件接口
   * @param options 上传选项
   */
  public uploadFile(options: {
    url: string;
    filePath: string;
    name: string;
    header?: Record<string, string>;
    formData?: Record<string, any>;
    timeout?: number;
    success?: (res: any) => void;
    fail?: (error: any) => void;
    complete?: () => void;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const apiName = this.getApiMapping('uploadFile');

      if (!apiName) {
        reject(new Error('当前平台不支持文件上传API'));
        return;
      }

      // 映射参数
      const mappedOptions = this.mapApiParameters('uploadFile', {
        ...options,
        success: (res: any) => {
          const mappedResult = this.mapApiResult('uploadFile', res);
          options.success?.(mappedResult);
          resolve(mappedResult);
        },
        fail: (error: any) => {
          options.fail?.(error);
          reject(error);
        },
      });

      // 调用平台API
      this.invokeMiniProgramApi(apiName, mappedOptions);
    });
  }

  /**
   * 统一下载文件接口
   * @param options 下载选项
   */
  public downloadFile(options: {
    url: string;
    header?: Record<string, string>;
    filePath?: string;
    timeout?: number;
    success?: (res: any) => void;
    fail?: (error: any) => void;
    complete?: () => void;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const apiName = this.getApiMapping('downloadFile');

      if (!apiName) {
        reject(new Error('当前平台不支持文件下载API'));
        return;
      }

      // 映射参数
      const mappedOptions = this.mapApiParameters('downloadFile', {
        ...options,
        success: (res: any) => {
          const mappedResult = this.mapApiResult('downloadFile', res);
          options.success?.(mappedResult);
          resolve(mappedResult);
        },
        fail: (error: any) => {
          options.fail?.(error);
          reject(error);
        },
      });

      // 调用平台API
      this.invokeMiniProgramApi(apiName, mappedOptions);
    });
  }

  /**
   * 获取小程序平台限制信息
   */
  public getPlatformLimitations(): MiniProgramLimitation[] {
    if (this.currentPlatform === MiniProgramPlatform.UNKNOWN) {
      return this.limitations;
    }

    return this.limitations.filter(limitation =>
      limitation.affectedPlatforms.includes(this.currentPlatform)
    );
  }

  /**
   * 获取小程序优化建议
   */
  public getOptimizationRecommendations(): MiniProgramRecommendation {
    const base: MiniProgramRecommendation = {
      chunkSize: 2 * 1024 * 1024,
      concurrency: 2,
      retryCount: 3,
      timeout: 60000,
      useChunks: true,
      storageStrategy: 'hybrid',
      apiMode: 'compatible',
    };

    // 根据平台调整建议
    switch (this.currentPlatform) {
      case MiniProgramPlatform.WECHAT:
        return {
          ...base,
          chunkSize: 1 * 1024 * 1024, // 微信小程序上传较小分片更稳定
          storageStrategy: 'filesystem',
        };

      case MiniProgramPlatform.ALIPAY:
        return {
          ...base,
          chunkSize: 4 * 1024 * 1024,
          concurrency: 1, // 支付宝小程序并发较低更稳定
          storageStrategy: 'storage',
        };

      case MiniProgramPlatform.BYTEDANCE:
        return {
          ...base,
          chunkSize: 5 * 1024 * 1024,
          storageStrategy: 'filesystem',
        };

      case MiniProgramPlatform.BAIDU:
        return {
          ...base,
          concurrency: 3,
          timeout: 30000, // 百度小程序建议较短超时
          storageStrategy: 'hybrid',
        };

      case MiniProgramPlatform.QQ:
        return {
          ...base,
          chunkSize: 3 * 1024 * 1024,
          storageStrategy: 'filesystem',
        };

      default:
        return base;
    }
  }

  /**
   * 执行分片上传优化
   * @param fileSize 文件大小
   */
  public getOptimizedChunkConfig(fileSize: number): {
    chunkSize: number;
    concurrency: number;
  } {
    // 根据文件大小和平台特性优化分片配置
    let chunkSize = 2 * 1024 * 1024; // 默认2MB
    let concurrency = 2;

    // 小文件无需分片
    if (fileSize < 5 * 1024 * 1024) {
      // 5MB以下
      return {
        chunkSize: fileSize,
        concurrency: 1,
      };
    }

    // 根据平台调整分片大小
    switch (this.currentPlatform) {
      case MiniProgramPlatform.WECHAT:
        // 微信小程序建议对大文件使用较小分片
        if (fileSize > 50 * 1024 * 1024) {
          // 50MB以上
          chunkSize = 1 * 1024 * 1024; // 1MB
          concurrency = 3;
        } else {
          chunkSize = 2 * 1024 * 1024; // 2MB
          concurrency = 2;
        }
        break;

      case MiniProgramPlatform.ALIPAY:
        // 支付宝小程序可以使用较大分片
        chunkSize = Math.min(5 * 1024 * 1024, fileSize / 10);
        concurrency = 1;
        break;

      case MiniProgramPlatform.BYTEDANCE:
        // 字节跳动小程序网络较好，可以用更大分片
        chunkSize = Math.min(8 * 1024 * 1024, fileSize / 8);
        concurrency = 2;
        break;

      case MiniProgramPlatform.BAIDU:
        // 百度小程序适中
        chunkSize = Math.min(4 * 1024 * 1024, fileSize / 10);
        concurrency = 3;
        break;

      case MiniProgramPlatform.QQ:
        // QQ小程序类似微信
        chunkSize = Math.min(3 * 1024 * 1024, fileSize / 10);
        concurrency = 2;
        break;
    }

    // 确保至少分4片，最多50片
    const minChunks = 4;
    const maxChunks = 50;
    const calculatedChunks = Math.ceil(fileSize / chunkSize);

    if (calculatedChunks < minChunks) {
      chunkSize = Math.ceil(fileSize / minChunks);
    } else if (calculatedChunks > maxChunks) {
      chunkSize = Math.ceil(fileSize / maxChunks);
    }

    return { chunkSize, concurrency };
  }

  /**
   * 检查API是否可用
   * @param apiName API名称
   */
  public isApiAvailable(apiName: string): boolean {
    const mappedApi = this.getApiMapping(apiName);
    if (!mappedApi) {
      return false;
    }

    // 检查API是否存在
    try {
      const apiParts = mappedApi.split('.');
      let obj: any = global;

      for (const part of apiParts) {
        if (!obj[part]) {
          return false;
        }
        obj = obj[part];
      }

      return typeof obj === 'function';
    } catch (error) {
      return false;
    }
  }

  /**
   * 安全调用小程序API
   * @param apiPath API路径
   * @param params API参数
   */
  private invokeMiniProgramApi(apiPath: string, params: any): any {
    try {
      const apiParts = apiPath.split('.');
      let obj: any = global;

      // 定位到API所在对象
      for (let i = 0; i < apiParts.length - 1; i++) {
        obj = obj[apiParts[i]];
      }

      // 获取API函数
      const apiFunc = obj[apiParts[apiParts.length - 1]];

      if (typeof apiFunc === 'function') {
        return apiFunc.call(obj, params);
      } else {
        throw new Error(`API ${apiPath} is not a function`);
      }
    } catch (error) {
      this.logger.error(`调用小程序API失败: ${apiPath}`, error);
      params.fail?.(error);
      return null;
    }
  }

  /**
   * 获取当前平台
   */
  public getCurrentPlatform(): MiniProgramPlatform {
    return this.currentPlatform;
  }
}

export default MiniProgramOptimizer;
