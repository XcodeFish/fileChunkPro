/**
 * WebStandardDetector - 检测并验证当前环境对最新Web标准的支持情况
 * 提供API可用性检测、特性测试和降级策略
 */

import { logger } from './logger';
import { EventBus } from '../core/EventBus';

export interface IFeatureSupport {
  supported: boolean;
  partialSupport?: boolean;
  details?: string;
}

export interface IWebStandardSupport {
  fileAPI: IFeatureSupport;
  streamsAPI: IFeatureSupport;
  sharedArrayBuffer: IFeatureSupport;
  webWorkers: IFeatureSupport;
  serviceWorkers: IFeatureSupport;
  indexedDB: IFeatureSupport;
  blobConstructor: IFeatureSupport;
  arrayBuffer: IFeatureSupport;
  urlAPI: IFeatureSupport;
  webCrypto: IFeatureSupport;
  fetch: IFeatureSupport;
  secureContext: IFeatureSupport;
  permissions: IFeatureSupport;
}

export class WebStandardDetector {
  private _supportCache: IWebStandardSupport | null = null;
  private _eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this._eventBus = eventBus;
  }

  /**
   * 检测当前环境对所有关键Web标准的支持情况
   */
  public async detectSupport(): Promise<IWebStandardSupport> {
    if (this._supportCache) {
      return this._supportCache;
    }

    const support: IWebStandardSupport = {
      fileAPI: this.detectFileAPI(),
      streamsAPI: this.detectStreamsAPI(),
      sharedArrayBuffer: this.detectSharedArrayBuffer(),
      webWorkers: this.detectWebWorkers(),
      serviceWorkers: this.detectServiceWorkers(),
      indexedDB: this.detectIndexedDB(),
      blobConstructor: this.detectBlobConstructor(),
      arrayBuffer: this.detectArrayBuffer(),
      urlAPI: this.detectUrlAPI(),
      webCrypto: this.detectWebCrypto(),
      fetch: this.detectFetch(),
      secureContext: this.detectSecureContext(),
      permissions: this.detectPermissionsAPI(),
    };

    this._supportCache = support;
    this._eventBus.emit('webstandard:detected', support);

    return support;
  }

  /**
   * 检测是否支持现代File API
   */
  private detectFileAPI(): IFeatureSupport {
    try {
      const hasFileAPI =
        typeof File !== 'undefined' &&
        typeof FileReader !== 'undefined' &&
        typeof FileList !== 'undefined';
      const hasSlice =
        typeof Blob !== 'undefined' &&
        typeof Blob.prototype.slice !== 'undefined';

      if (!hasFileAPI) {
        return { supported: false, details: 'File API not supported' };
      }

      if (!hasSlice) {
        return {
          supported: true,
          partialSupport: true,
          details: 'Blob.slice method not available',
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting File API support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持Streams API
   */
  private detectStreamsAPI(): IFeatureSupport {
    try {
      const hasReadableStream = typeof ReadableStream !== 'undefined';
      const hasWritableStream = typeof WritableStream !== 'undefined';
      const hasTransformStream = typeof TransformStream !== 'undefined';

      if (!hasReadableStream && !hasWritableStream) {
        return { supported: false, details: 'Streams API not supported' };
      }

      if (!hasReadableStream || !hasWritableStream || !hasTransformStream) {
        return {
          supported: true,
          partialSupport: true,
          details: `Missing: ${!hasReadableStream ? 'ReadableStream ' : ''}${!hasWritableStream ? 'WritableStream ' : ''}${!hasTransformStream ? 'TransformStream' : ''}`,
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting Streams API support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持SharedArrayBuffer
   */
  private detectSharedArrayBuffer(): IFeatureSupport {
    try {
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

      // 检测是否有必要的安全头（可能需要后端配合）
      const securityHeaders = this.checkSecurityHeaders();

      if (!hasSharedArrayBuffer) {
        return { supported: false, details: 'SharedArrayBuffer not supported' };
      }

      if (!securityHeaders) {
        return {
          supported: true,
          partialSupport: true,
          details:
            'SharedArrayBuffer available but required security headers may be missing',
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting SharedArrayBuffer support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持Web Workers
   */
  private detectWebWorkers(): IFeatureSupport {
    try {
      const hasWorker = typeof Worker !== 'undefined';

      if (!hasWorker) {
        return { supported: false, details: 'Web Workers not supported' };
      }

      // 实际尝试创建Worker以验证功能完整性
      try {
        const workerBlob = new Blob(
          ['self.onmessage = function() { self.postMessage("test"); }'],
          { type: 'application/javascript' }
        );
        const workerUrl = URL.createObjectURL(workerBlob);
        const worker = new Worker(workerUrl);

        worker.terminate();
        URL.revokeObjectURL(workerUrl);

        return { supported: true };
      } catch (workerError) {
        return {
          supported: true,
          partialSupport: true,
          details:
            'Web Workers API available but could not instantiate: ' +
            workerError.message,
        };
      }
    } catch (error) {
      logger.error('Error detecting Web Workers support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持Service Workers
   */
  private detectServiceWorkers(): IFeatureSupport {
    try {
      const hasServiceWorker = 'serviceWorker' in navigator;

      if (!hasServiceWorker) {
        return { supported: false, details: 'Service Workers not supported' };
      }

      // 检查是否是安全上下文
      if (!window.isSecureContext) {
        return {
          supported: true,
          partialSupport: true,
          details:
            'Service Workers available but requires secure context (HTTPS)',
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting Service Workers support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持IndexedDB
   */
  private detectIndexedDB(): IFeatureSupport {
    try {
      const hasIndexedDB = typeof indexedDB !== 'undefined';

      if (!hasIndexedDB) {
        return { supported: false, details: 'IndexedDB not supported' };
      }

      // 尝试打开数据库以验证功能
      try {
        const request = indexedDB.open('test_db', 1);
        request.onerror = () => {
          // 错误处理在外部catch中
        };
        request.onsuccess = () => {
          const db = request.result;
          db.close();
          indexedDB.deleteDatabase('test_db');
        };

        return { supported: true };
      } catch (dbError) {
        return {
          supported: true,
          partialSupport: true,
          details:
            'IndexedDB API available but could not be used: ' + dbError.message,
        };
      }
    } catch (error) {
      logger.error('Error detecting IndexedDB support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持Blob构造函数
   */
  private detectBlobConstructor(): IFeatureSupport {
    try {
      const hasBlob = typeof Blob !== 'undefined';

      if (!hasBlob) {
        return { supported: false, details: 'Blob constructor not supported' };
      }

      // 验证Blob构造函数的完整功能
      try {
        const testBlob = new Blob(['test'], { type: 'text/plain' });
        const hasType = testBlob.type === 'text/plain';
        const hasSize = testBlob.size === 4;

        if (!hasType || !hasSize) {
          return {
            supported: true,
            partialSupport: true,
            details: 'Blob constructor available but with partial support',
          };
        }

        return { supported: true };
      } catch (blobError) {
        return {
          supported: true,
          partialSupport: true,
          details:
            'Blob constructor available but could not be used: ' +
            blobError.message,
        };
      }
    } catch (error) {
      logger.error('Error detecting Blob constructor support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持ArrayBuffer
   */
  private detectArrayBuffer(): IFeatureSupport {
    try {
      const hasArrayBuffer = typeof ArrayBuffer !== 'undefined';
      const hasViews =
        typeof Uint8Array !== 'undefined' && typeof DataView !== 'undefined';

      if (!hasArrayBuffer) {
        return { supported: false, details: 'ArrayBuffer not supported' };
      }

      if (!hasViews) {
        return {
          supported: true,
          partialSupport: true,
          details: 'ArrayBuffer available but typed arrays or DataView missing',
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting ArrayBuffer support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持URL API
   */
  private detectUrlAPI(): IFeatureSupport {
    try {
      const hasURL = typeof URL !== 'undefined';
      const hasCreateObjectURL = typeof URL.createObjectURL !== 'undefined';
      const hasRevokeObjectURL = typeof URL.revokeObjectURL !== 'undefined';

      if (!hasURL) {
        return { supported: false, details: 'URL API not supported' };
      }

      if (!hasCreateObjectURL || !hasRevokeObjectURL) {
        return {
          supported: true,
          partialSupport: true,
          details:
            'URL API available but missing createObjectURL or revokeObjectURL',
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting URL API support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持Web Crypto API
   */
  private detectWebCrypto(): IFeatureSupport {
    try {
      const hasWebCrypto =
        typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

      if (!hasWebCrypto) {
        return { supported: false, details: 'Web Crypto API not supported' };
      }

      // 检查常用算法可用性
      const hasRequiredAlgorithms = 'digest' in crypto.subtle;

      if (!hasRequiredAlgorithms) {
        return {
          supported: true,
          partialSupport: true,
          details: 'Web Crypto API available but missing required algorithms',
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting Web Crypto API support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否支持Fetch API
   */
  private detectFetch(): IFeatureSupport {
    try {
      const hasFetch = typeof fetch !== 'undefined';
      const hasAbortController = typeof AbortController !== 'undefined';

      if (!hasFetch) {
        return { supported: false, details: 'Fetch API not supported' };
      }

      if (!hasAbortController) {
        return {
          supported: true,
          partialSupport: true,
          details: 'Fetch API available but AbortController missing',
        };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting Fetch API support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检测是否在安全上下文中运行
   */
  private detectSecureContext(): IFeatureSupport {
    try {
      const isSecure = window.isSecureContext === true;

      return {
        supported: isSecure,
        details: isSecure
          ? undefined
          : 'Not running in a secure context (HTTPS)',
      };
    } catch (error) {
      logger.error('Error detecting secure context', error);
      return { supported: false, details: 'Error detecting secure context' };
    }
  }

  /**
   * 检测是否支持Permissions API
   */
  private detectPermissionsAPI(): IFeatureSupport {
    try {
      const hasPermissionsAPI = typeof navigator.permissions !== 'undefined';

      if (!hasPermissionsAPI) {
        return { supported: false, details: 'Permissions API not supported' };
      }

      return { supported: true };
    } catch (error) {
      logger.error('Error detecting Permissions API support', error);
      return { supported: false, details: 'Error detecting support' };
    }
  }

  /**
   * 检查安全头（用于SharedArrayBuffer等需要安全头的功能）
   * 注意：这个检测不总是可靠的，因为JS无法直接访问HTTP头
   */
  private checkSecurityHeaders(): boolean {
    // 这里只能做一个估计，因为JS不能直接读取响应头
    // 对于实际项目，可以通过向自己的服务器发送请求，然后检查响应中的header
    return window.isSecureContext === true;
  }

  /**
   * 获取当前环境支持的Web标准详细报告
   */
  public async getSupportReport(): Promise<string> {
    const support = await this.detectSupport();

    let report = '## Web标准支持报告\n\n';

    for (const [key, value] of Object.entries(support)) {
      report += `### ${key}\n`;
      report += `- 支持状态: ${value.supported ? '✅ 支持' : '❌ 不支持'}`;
      report += value.partialSupport ? ' (部分支持)' : '';
      report += '\n';

      if (value.details) {
        report += `- 详情: ${value.details}\n`;
      }

      report += '\n';
    }

    return report;
  }

  /**
   * 获取建议的配置，基于当前环境支持的特性
   */
  public async getRecommendedConfig(): Promise<Record<string, any>> {
    const support = await this.detectSupport();

    // 根据支持情况生成推荐配置
    const config: Record<string, any> = {
      useStreams: support.streamsAPI.supported,
      useSharedArrayBuffer:
        support.sharedArrayBuffer.supported &&
        !support.sharedArrayBuffer.partialSupport,
      useServiceWorker:
        support.serviceWorkers.supported &&
        !support.serviceWorkers.partialSupport,
      useWebWorkers: support.webWorkers.supported,
      useIndexedDB: support.indexedDB.supported,
      maxConcurrency: this.getRecommendedConcurrency(support),
      chunkSize: this.getRecommendedChunkSize(support),
      useWebCrypto: support.webCrypto.supported,
    };

    return config;
  }

  /**
   * 根据环境特性推荐最佳并发数
   */
  private getRecommendedConcurrency(support: IWebStandardSupport): number {
    // 根据设备能力推荐并发数
    if (support.webWorkers.supported && navigator.hardwareConcurrency) {
      // 使用硬件核心数作为参考，但设置上限
      return Math.min(navigator.hardwareConcurrency, 6);
    }

    // 降级推荐
    return 3;
  }

  /**
   * 根据环境特性推荐最佳分片大小
   */
  private getRecommendedChunkSize(support: IWebStandardSupport): number {
    // 如果有强大的特性支持，可以使用更大的分片
    if (support.sharedArrayBuffer.supported && support.webWorkers.supported) {
      return 5 * 1024 * 1024; // 5MB
    }

    // 标准设置
    if (support.webWorkers.supported) {
      return 2 * 1024 * 1024; // 2MB
    }

    // 降级设置
    return 1 * 1024 * 1024; // 1MB
  }
}

export default WebStandardDetector;
