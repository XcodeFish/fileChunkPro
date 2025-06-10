/**
 * WebStandardValidator - 验证Web标准的合规性
 * 提供对上传相关操作的合规性检查、安全头检测和跨浏览器兼容性测试
 */

import {
  WebStandardDetector,
  IWebStandardSupport,
} from './WebStandardDetector';

export interface IComplianceResult {
  compliant: boolean;
  issues: IComplianceIssue[];
  score: number; // 0-100 分数
}

export interface IComplianceIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  recommendation: string;
  standardReference?: string;
}

export interface IValidationOptions {
  strictMode?: boolean; // 是否启用严格模式，严格检查每个标准
  requiredFeatures?: string[]; // 必须支持的特性列表
  minScore?: number; // 最低分数要求
}

export class WebStandardValidator {
  private _detector: WebStandardDetector;
  private _lastResults: Map<string, IComplianceResult> = new Map();

  constructor(detector: WebStandardDetector) {
    this._detector = detector;
  }

  /**
   * 验证当前环境对Web标准的合规性
   */
  public async validateCompliance(
    options: IValidationOptions = {}
  ): Promise<IComplianceResult> {
    const support = await this._detector.detectSupport();

    // 收集合规性问题
    const issues: IComplianceIssue[] = [];

    // 验证必要的Web标准支持
    this.validateFileAPI(support, issues, options);
    this.validateStreamsAPI(support, issues, options);
    this.validateSecurityFeatures(support, issues, options);
    this.validateStorageFeatures(support, issues, options);
    this.validateWorkerFeatures(support, issues, options);
    this.validateNetworkFeatures(support, issues, options);

    // 检查必须支持的特性
    if (options.requiredFeatures && options.requiredFeatures.length > 0) {
      this.validateRequiredFeatures(support, issues, options.requiredFeatures);
    }

    // 计算合规性分数
    const score = this.calculateComplianceScore(issues);

    // 确定最终合规性状态
    const minScore = options.minScore ?? 70;
    const compliant =
      score >= minScore && !issues.some(issue => issue.severity === 'critical');

    const result: IComplianceResult = {
      compliant,
      issues,
      score,
    };

    // 缓存结果
    const cacheKey = this.generateCacheKey(options);
    this._lastResults.set(cacheKey, result);

    return result;
  }

  /**
   * 生成缓存键值
   */
  private generateCacheKey(options: IValidationOptions): string {
    return JSON.stringify({
      strictMode: options.strictMode || false,
      requiredFeatures: options.requiredFeatures || [],
      minScore: options.minScore || 70,
    });
  }

  /**
   * 验证文件API支持
   */
  private validateFileAPI(
    support: IWebStandardSupport,
    issues: IComplianceIssue[],
    _options: IValidationOptions
  ): void {
    // 文件API是必须的
    if (!support.fileAPI.supported) {
      issues.push({
        id: 'file-api-missing',
        severity: 'critical',
        description: '浏览器不支持基本的File API，上传功能无法正常工作',
        recommendation: '请使用支持File API的现代浏览器',
        standardReference: 'https://w3c.github.io/FileAPI/',
      });
    } else if (support.fileAPI.partialSupport) {
      issues.push({
        id: 'file-api-partial',
        severity: 'warning',
        description: '浏览器对File API的支持不完整，可能影响部分功能',
        recommendation: '考虑使用降级方案或提示用户升级浏览器',
        standardReference: 'https://w3c.github.io/FileAPI/',
      });
    }

    // Blob构造函数支持
    if (!support.blobConstructor.supported) {
      issues.push({
        id: 'blob-constructor-missing',
        severity: 'critical',
        description: 'Blob构造函数不可用，无法创建或处理二进制数据',
        recommendation: '请使用支持Blob API的现代浏览器',
        standardReference: 'https://w3c.github.io/FileAPI/#constructorBlob',
      });
    } else if (support.blobConstructor.partialSupport) {
      issues.push({
        id: 'blob-constructor-partial',
        severity: 'warning',
        description: 'Blob构造函数支持不完整，可能影响某些高级功能',
        recommendation: '对Blob操作使用降级处理方案',
        standardReference: 'https://w3c.github.io/FileAPI/#constructorBlob',
      });
    }
  }

  /**
   * 验证Streams API支持
   */
  private validateStreamsAPI(
    support: IWebStandardSupport,
    issues: IComplianceIssue[],
    options: IValidationOptions
  ): void {
    // Streams API对于高效流式处理很重要，但不是绝对必要的
    if (!support.streamsAPI.supported) {
      issues.push({
        id: 'streams-api-missing',
        severity: options.strictMode ? 'critical' : 'warning',
        description: '浏览器不支持Streams API，无法使用流式处理功能',
        recommendation: '将使用替代方法处理文件，可能会增加内存使用',
        standardReference: 'https://streams.spec.whatwg.org/',
      });
    } else if (support.streamsAPI.partialSupport) {
      issues.push({
        id: 'streams-api-partial',
        severity: 'info',
        description: 'Streams API支持不完整，部分流式处理功能可能不可用',
        recommendation: '检查具体缺失的API并提供降级方案',
        standardReference: 'https://streams.spec.whatwg.org/',
      });
    }
  }

  /**
   * 验证安全特性支持
   */
  private validateSecurityFeatures(
    support: IWebStandardSupport,
    issues: IComplianceIssue[],
    options: IValidationOptions
  ): void {
    // 安全上下文检查
    if (!support.secureContext.supported) {
      issues.push({
        id: 'not-secure-context',
        severity: 'warning',
        description: '应用未在安全上下文(HTTPS)中运行，某些安全功能将不可用',
        recommendation: '将应用部署在HTTPS环境下以启用所有Web安全特性',
        standardReference: 'https://w3c.github.io/webappsec-secure-contexts/',
      });
    }

    // Web Crypto API
    if (!support.webCrypto.supported) {
      issues.push({
        id: 'webcrypto-missing',
        severity: options.strictMode ? 'critical' : 'warning',
        description: 'Web Crypto API不可用，无法使用高效的加密功能',
        recommendation: '将使用JS实现的加密库作为降级方案，性能可能受影响',
        standardReference: 'https://w3c.github.io/webcrypto/',
      });
    } else if (support.webCrypto.partialSupport) {
      issues.push({
        id: 'webcrypto-partial',
        severity: 'info',
        description: 'Web Crypto API支持不完整，某些加密算法可能不可用',
        recommendation: '检查关键算法的可用性并提供替代方案',
        standardReference: 'https://w3c.github.io/webcrypto/',
      });
    }

    // SharedArrayBuffer安全头检查
    if (support.sharedArrayBuffer.partialSupport) {
      issues.push({
        id: 'sab-security-headers',
        severity: 'info',
        description: 'SharedArrayBuffer可用但可能缺少必要的安全头',
        recommendation:
          '确保服务器设置了Cross-Origin-Opener-Policy和Cross-Origin-Embedder-Policy头',
        standardReference:
          'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements',
      });
    }
  }

  /**
   * 验证存储特性支持
   */
  private validateStorageFeatures(
    support: IWebStandardSupport,
    issues: IComplianceIssue[],
    options: IValidationOptions
  ): void {
    // IndexedDB支持
    if (!support.indexedDB.supported) {
      issues.push({
        id: 'indexeddb-missing',
        severity: options.strictMode ? 'critical' : 'warning',
        description: 'IndexedDB不可用，本地存储和断点续传功能将受限',
        recommendation: '将使用内存存储或其他替代方案，但功能和性能可能受限',
        standardReference: 'https://www.w3.org/TR/IndexedDB/',
      });
    } else if (support.indexedDB.partialSupport) {
      issues.push({
        id: 'indexeddb-partial',
        severity: 'warning',
        description: 'IndexedDB支持不完整或存在问题，本地存储可能不稳定',
        recommendation: '提供内存存储作为备选，并监控IndexedDB操作',
        standardReference: 'https://www.w3.org/TR/IndexedDB/',
      });
    }
  }

  /**
   * 验证Worker特性支持
   */
  private validateWorkerFeatures(
    support: IWebStandardSupport,
    issues: IComplianceIssue[],
    options: IValidationOptions
  ): void {
    // Web Workers支持
    if (!support.webWorkers.supported) {
      issues.push({
        id: 'webworkers-missing',
        severity: 'warning',
        description:
          'Web Workers不可用，所有处理将在主线程执行，可能影响UI响应',
        recommendation: '将使用主线程处理，并考虑优化任务分片以避免UI阻塞',
        standardReference:
          'https://html.spec.whatwg.org/multipage/workers.html',
      });
    } else if (support.webWorkers.partialSupport) {
      issues.push({
        id: 'webworkers-partial',
        severity: 'info',
        description: 'Web Workers支持存在问题，多线程处理可能不稳定',
        recommendation: '实现带有降级方案的Worker使用策略',
        standardReference:
          'https://html.spec.whatwg.org/multipage/workers.html',
      });
    }

    // Service Workers支持
    if (!support.serviceWorkers.supported) {
      if (options.strictMode) {
        issues.push({
          id: 'serviceworkers-missing',
          severity: 'warning',
          description: 'Service Workers不可用，离线和后台上传功能将不可用',
          recommendation: '禁用依赖Service Workers的功能，或提供替代方案',
          standardReference: 'https://w3c.github.io/ServiceWorker/',
        });
      }
    } else if (support.serviceWorkers.partialSupport) {
      issues.push({
        id: 'serviceworkers-partial',
        severity: 'info',
        description: 'Service Workers支持不完整，离线和后台功能可能不稳定',
        recommendation: '检查Service Workers实际可用性，并实现降级方案',
        standardReference: 'https://w3c.github.io/ServiceWorker/',
      });
    }
  }

  /**
   * 验证网络特性支持
   */
  private validateNetworkFeatures(
    support: IWebStandardSupport,
    issues: IComplianceIssue[],
    options: IValidationOptions
  ): void {
    // Fetch API支持
    if (!support.fetch.supported) {
      issues.push({
        id: 'fetch-missing',
        severity: options.strictMode ? 'critical' : 'warning',
        description: 'Fetch API不可用，将使用XMLHttpRequest作为替代',
        recommendation: '使用XMLHttpRequest作为备选网络请求方式',
        standardReference: 'https://fetch.spec.whatwg.org/',
      });
    } else if (support.fetch.partialSupport) {
      issues.push({
        id: 'fetch-partial',
        severity: 'info',
        description: 'Fetch API支持不完整，高级功能可能不可用',
        recommendation: '检查AbortController等功能的可用性并提供替代方案',
        standardReference: 'https://fetch.spec.whatwg.org/',
      });
    }
  }

  /**
   * 验证必需特性支持
   */
  private validateRequiredFeatures(
    support: IWebStandardSupport,
    issues: IComplianceIssue[],
    requiredFeatures: string[]
  ): void {
    for (const feature of requiredFeatures) {
      if (feature in support) {
        const featureSupport = support[feature as keyof IWebStandardSupport];
        if (!featureSupport.supported) {
          issues.push({
            id: `required-${feature}-missing`,
            severity: 'critical',
            description: `必需的${feature}特性不可用，无法正常工作`,
            recommendation: '请使用支持此特性的现代浏览器',
            standardReference: this.getStandardReferenceForFeature(feature),
          });
        } else if (featureSupport.partialSupport) {
          issues.push({
            id: `required-${feature}-partial`,
            severity: 'warning',
            description: `必需的${feature}特性支持不完整，功能可能受限`,
            recommendation: '考虑实现降级方案或提示用户升级浏览器',
            standardReference: this.getStandardReferenceForFeature(feature),
          });
        }
      }
    }
  }

  /**
   * 获取特性的标准参考链接
   */
  private getStandardReferenceForFeature(feature: string): string {
    const referenceMap: Record<string, string> = {
      fileAPI: 'https://w3c.github.io/FileAPI/',
      streamsAPI: 'https://streams.spec.whatwg.org/',
      sharedArrayBuffer:
        'https://html.spec.whatwg.org/multipage/structured-data.html#sharedarraybuffer-objects',
      webWorkers: 'https://html.spec.whatwg.org/multipage/workers.html',
      serviceWorkers: 'https://w3c.github.io/ServiceWorker/',
      indexedDB: 'https://www.w3.org/TR/IndexedDB/',
      blobConstructor: 'https://w3c.github.io/FileAPI/#constructorBlob',
      arrayBuffer: 'https://tc39.es/ecma262/#sec-arraybuffer-objects',
      urlAPI: 'https://url.spec.whatwg.org/',
      webCrypto: 'https://w3c.github.io/webcrypto/',
      fetch: 'https://fetch.spec.whatwg.org/',
      secureContext: 'https://w3c.github.io/webappsec-secure-contexts/',
      permissions: 'https://w3c.github.io/permissions/',
    };

    return referenceMap[feature] || 'https://developer.mozilla.org/';
  }

  /**
   * 计算合规性分数 (0-100)
   */
  private calculateComplianceScore(issues: IComplianceIssue[]): number {
    // 基础分数100
    let score = 100;

    // 根据问题严重性扣分
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'warning':
          score -= 10;
          break;
        case 'info':
          score -= 5;
          break;
      }
    }

    // 确保分数在0-100范围内
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 获取合规性报告
   */
  public async getComplianceReport(
    options: IValidationOptions = {}
  ): Promise<string> {
    const result = await this.validateCompliance(options);

    let report = `## Web标准合规性报告\n\n`;
    report += `### 总体评分: ${result.score}/100\n\n`;
    report += `### 合规状态: ${result.compliant ? '✅ 合规' : '❌ 不合规'}\n\n`;

    if (result.issues.length === 0) {
      report += `✅ 没有发现合规性问题\n\n`;
    } else {
      report += `### 发现的问题\n\n`;

      // 按严重性分组显示问题
      const criticalIssues = result.issues.filter(
        i => i.severity === 'critical'
      );
      const warningIssues = result.issues.filter(i => i.severity === 'warning');
      const infoIssues = result.issues.filter(i => i.severity === 'info');

      if (criticalIssues.length > 0) {
        report += `#### 严重问题\n\n`;
        for (const issue of criticalIssues) {
          report += `- **${issue.id}**: ${issue.description}\n`;
          report += `  - 建议: ${issue.recommendation}\n`;
          if (issue.standardReference) {
            report += `  - 参考: ${issue.standardReference}\n`;
          }
          report += `\n`;
        }
      }

      if (warningIssues.length > 0) {
        report += `#### 警告\n\n`;
        for (const issue of warningIssues) {
          report += `- **${issue.id}**: ${issue.description}\n`;
          report += `  - 建议: ${issue.recommendation}\n`;
          if (issue.standardReference) {
            report += `  - 参考: ${issue.standardReference}\n`;
          }
          report += `\n`;
        }
      }

      if (infoIssues.length > 0) {
        report += `#### 信息\n\n`;
        for (const issue of infoIssues) {
          report += `- **${issue.id}**: ${issue.description}\n`;
          report += `  - 建议: ${issue.recommendation}\n`;
          if (issue.standardReference) {
            report += `  - 参考: ${issue.standardReference}\n`;
          }
          report += `\n`;
        }
      }
    }

    return report;
  }

  /**
   * 获取合规性修复建议
   */
  public async getComplianceRecommendations(
    options: IValidationOptions = {}
  ): Promise<Record<string, any>> {
    const result = await this.validateCompliance(options);

    // 根据不同问题提供的建议生成配置
    const recommendations: Record<string, any> = {
      optimizations: {},
      fallbacks: {},
      userWarnings: [],
    };

    // 处理文件API相关问题
    if (
      result.issues.some(
        i => i.id === 'file-api-missing' || i.id === 'file-api-partial'
      )
    ) {
      recommendations.fallbacks.useCustomFileAPI = true;
      recommendations.userWarnings.push(
        '浏览器对文件操作的支持有限，某些功能可能不可用'
      );
    }

    // 处理Streams API相关问题
    if (
      result.issues.some(
        i => i.id === 'streams-api-missing' || i.id === 'streams-api-partial'
      )
    ) {
      recommendations.fallbacks.useChunkedArrays = true;
      recommendations.optimizations.reduceChunkSize = true;
      recommendations.optimizations.optimizeMemoryUsage = true;
    }

    // 处理Worker相关问题
    if (
      result.issues.some(
        i => i.id === 'webworkers-missing' || i.id === 'webworkers-partial'
      )
    ) {
      recommendations.fallbacks.useMainThreadProcessing = true;
      recommendations.optimizations.useSmallChunks = true;
      recommendations.optimizations.useTimeSlicing = true;
    }

    // 处理存储相关问题
    if (
      result.issues.some(
        i => i.id === 'indexeddb-missing' || i.id === 'indexeddb-partial'
      )
    ) {
      recommendations.fallbacks.useMemoryStorage = true;
      recommendations.fallbacks.useSessionStorage = true;
      recommendations.optimizations.minimizePersistentData = true;
    }

    // 处理安全相关问题
    if (result.issues.some(i => i.id === 'not-secure-context')) {
      recommendations.userWarnings.push(
        '应用未在安全环境(HTTPS)运行，某些功能将不可用'
      );
      recommendations.fallbacks.disableHighSecurityFeatures = true;
    }

    // 处理加密相关问题
    if (
      result.issues.some(
        i => i.id === 'webcrypto-missing' || i.id === 'webcrypto-partial'
      )
    ) {
      recommendations.fallbacks.useJSCrypto = true;
      recommendations.optimizations.minimizeCryptoOperations = true;
    }

    return recommendations;
  }
}

export default WebStandardValidator;
