/**
 * BrowserCompatibilityTester - 跨浏览器兼容性测试工具
 * 提供对上传功能在不同浏览器环境中兼容性的测试
 */

import {
  WebStandardDetector,
  IWebStandardSupport,
} from './WebStandardDetector';

export interface IBrowserInfo {
  name: string;
  version: string;
  engine: string;
  engineVersion: string;
  os: string;
  mobile: boolean;
  tablet: boolean;
  userAgent: string;
}

export interface ICompatibilityTestResult {
  browser: IBrowserInfo;
  passed: boolean;
  skipped: boolean;
  failedTests: ITestFailure[];
  passedTests: string[];
  standardsSupport: IWebStandardSupport;
}

export interface ITestFailure {
  testId: string;
  description: string;
  expected: string;
  actual: string;
  critical: boolean;
}

export interface ITestCase {
  id: string;
  name: string;
  description: string;
  requiredStandards: string[];
  skip?: (
    browserInfo: IBrowserInfo,
    standardsSupport: IWebStandardSupport
  ) => boolean;
  run: (
    browserInfo: IBrowserInfo,
    standardsSupport: IWebStandardSupport
  ) => Promise<boolean>;
  cleanup?: () => Promise<void>;
  isCritical: boolean;
}

export class BrowserCompatibilityTester {
  private _detector: WebStandardDetector;
  private _testCases: ITestCase[] = [];
  private _browserInfo: IBrowserInfo;

  constructor(detector?: WebStandardDetector) {
    this._detector = detector || new WebStandardDetector();
    this._browserInfo = this.detectBrowser();
    this.registerDefaultTests();
  }

  /**
   * 获取当前浏览器信息
   */
  public getBrowserInfo(): IBrowserInfo {
    return this._browserInfo;
  }

  /**
   * 检测当前浏览器信息
   */
  private detectBrowser(): IBrowserInfo {
    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = 'Unknown';
    let engine = 'Unknown';
    let engineVersion = 'Unknown';
    let os = 'Unknown';
    let mobile = false;
    let tablet = false;

    // 检测浏览器
    if (ua.indexOf('Firefox') > -1) {
      name = 'Firefox';
      version = ua.match(/Firefox\/([0-9.]+)/)?.[1] || 'Unknown';
      engine = 'Gecko';
      engineVersion = ua.match(/rv:([0-9.]+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg/') > -1) {
      name = 'Edge';
      version =
        (ua.match(/Edge\/([0-9.]+)/) || ua.match(/Edg\/([0-9.]+)/))?.[1] ||
        'Unknown';
      engine = 'EdgeHTML';
      engineVersion = version;
      if (ua.indexOf('Edg/') > -1) {
        engine = 'Blink';
      }
    } else if (ua.indexOf('Chrome') > -1) {
      name = 'Chrome';
      version = ua.match(/Chrome\/([0-9.]+)/)?.[1] || 'Unknown';
      engine = 'Blink';
      engineVersion = version;
    } else if (ua.indexOf('Safari') > -1) {
      name = 'Safari';
      version = ua.match(/Version\/([0-9.]+)/)?.[1] || 'Unknown';
      engine = 'WebKit';
      engineVersion = ua.match(/WebKit\/([0-9.]+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('MSIE') > -1 || ua.indexOf('Trident') > -1) {
      name = 'Internet Explorer';
      if (ua.indexOf('MSIE') > -1) {
        version = ua.match(/MSIE ([0-9.]+)/)?.[1] || 'Unknown';
      } else {
        version = ua.match(/rv:([0-9.]+)/)?.[1] || 'Unknown';
      }
      engine = 'Trident';
      engineVersion = ua.match(/Trident\/([0-9.]+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) {
      name = 'Opera';
      if (ua.indexOf('Opera') > -1) {
        version = ua.match(/Opera\/([0-9.]+)/)?.[1] || 'Unknown';
      } else {
        version = ua.match(/OPR\/([0-9.]+)/)?.[1] || 'Unknown';
      }
      engine = 'Blink';
    }

    // 检测操作系统
    if (ua.indexOf('Windows') > -1) {
      os = 'Windows';
    } else if (ua.indexOf('Mac OS X') > -1) {
      os = 'macOS';
    } else if (ua.indexOf('Linux') > -1) {
      os = 'Linux';
    } else if (ua.indexOf('Android') > -1) {
      os = 'Android';
      mobile = true;
      if (ua.indexOf('Mobile') === -1) {
        tablet = true;
      }
    } else if (
      ua.indexOf('iOS') > -1 ||
      ua.indexOf('iPhone') > -1 ||
      ua.indexOf('iPad') > -1
    ) {
      os = 'iOS';
      mobile = true;
      if (ua.indexOf('iPad') > -1) {
        tablet = true;
      }
    }

    return {
      name,
      version,
      engine,
      engineVersion,
      os,
      mobile,
      tablet,
      userAgent: ua,
    };
  }

  /**
   * 注册默认测试用例
   */
  private registerDefaultTests(): void {
    // 测试文件读取
    this.registerTest({
      id: 'file-read',
      name: '文件读取测试',
      description: '测试基本的文件读取功能',
      requiredStandards: ['fileAPI'],
      isCritical: true,
      skip: (_, support) => !support.fileAPI.supported,
      run: async () => {
        try {
          // 创建一个内存文件用于测试
          const testData = 'Test file content';
          const file = new File([testData], 'test.txt', { type: 'text/plain' });

          // 测试文件读取
          return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
              const result = e.target?.result as string;
              resolve(result === testData);
            };
            reader.onerror = () => resolve(false);
            reader.readAsText(file);
          });
        } catch (error) {
          return false;
        }
      },
    });

    // 测试Blob操作
    this.registerTest({
      id: 'blob-operations',
      name: 'Blob操作测试',
      description: '测试Blob创建和切片操作',
      requiredStandards: ['blobConstructor'],
      isCritical: true,
      skip: (_, support) => !support.blobConstructor.supported,
      run: async () => {
        try {
          // 创建测试Blob
          const testData = 'Blob test content';
          const blob = new Blob([testData], { type: 'text/plain' });

          // 测试属性和切片
          if (blob.size !== testData.length) return false;
          if (blob.type !== 'text/plain') return false;

          // 测试切片
          const slice = blob.slice(0, 4, 'text/plain');

          return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
              const result = e.target?.result as string;
              resolve(result === 'Blob');
            };
            reader.onerror = () => resolve(false);
            reader.readAsText(slice);
          });
        } catch (error) {
          return false;
        }
      },
    });

    // 测试ArrayBuffer操作
    this.registerTest({
      id: 'arraybuffer-operations',
      name: 'ArrayBuffer操作测试',
      description: '测试ArrayBuffer和TypedArray操作',
      requiredStandards: ['arrayBuffer'],
      isCritical: true,
      skip: (_, support) => !support.arrayBuffer.supported,
      run: async () => {
        try {
          // 创建和操作ArrayBuffer
          const buffer = new ArrayBuffer(16);
          const view = new Uint8Array(buffer);

          // 写入数据
          for (let i = 0; i < view.length; i++) {
            view[i] = i;
          }

          // 验证数据
          for (let i = 0; i < view.length; i++) {
            if (view[i] !== i) return false;
          }

          // 测试切片
          const slice = buffer.slice(4, 8);
          const sliceView = new Uint8Array(slice);

          for (let i = 0; i < sliceView.length; i++) {
            if (sliceView[i] !== i + 4) return false;
          }

          return true;
        } catch (error) {
          return false;
        }
      },
    });

    // 测试Web Worker
    this.registerTest({
      id: 'web-worker',
      name: 'Web Worker测试',
      description: '测试基本的Web Worker功能',
      requiredStandards: ['webWorkers'],
      isCritical: false,
      skip: (_, support) => !support.webWorkers.supported,
      run: async () => {
        try {
          return new Promise(resolve => {
            try {
              // 创建简单的worker
              const workerBlob = new Blob(
                [
                  `
                self.onmessage = function(e) {
                  self.postMessage('worker:' + e.data);
                };
              `,
                ],
                { type: 'application/javascript' }
              );

              const workerUrl = URL.createObjectURL(workerBlob);
              const worker = new Worker(workerUrl);

              worker.onmessage = e => {
                URL.revokeObjectURL(workerUrl);
                worker.terminate();
                resolve(e.data === 'worker:test');
              };

              worker.onerror = () => {
                URL.revokeObjectURL(workerUrl);
                worker.terminate();
                resolve(false);
              };

              worker.postMessage('test');
            } catch (error) {
              resolve(false);
            }
          });
        } catch (error) {
          return false;
        }
      },
    });

    // 测试URL操作
    this.registerTest({
      id: 'url-operations',
      name: 'URL操作测试',
      description: '测试URL对象和Blob URL操作',
      requiredStandards: ['urlAPI'],
      isCritical: false,
      skip: (_, support) => !support.urlAPI.supported,
      run: async () => {
        try {
          // 测试URL解析
          const url = new URL('https://example.com/path?query=value#hash');
          if (url.protocol !== 'https:') return false;
          if (url.host !== 'example.com') return false;
          if (url.pathname !== '/path') return false;
          if (url.search !== '?query=value') return false;
          if (url.hash !== '#hash') return false;

          // 测试createObjectURL
          const blob = new Blob(['test'], { type: 'text/plain' });
          const objectUrl = URL.createObjectURL(blob);

          if (!objectUrl.startsWith('blob:')) {
            return false;
          }

          // 释放URL
          URL.revokeObjectURL(objectUrl);

          return true;
        } catch (error) {
          return false;
        }
      },
    });

    // 测试Fetch API
    this.registerTest({
      id: 'fetch-api',
      name: 'Fetch API测试',
      description: '测试Fetch API基本功能',
      requiredStandards: ['fetch'],
      isCritical: false,
      skip: (_, support) => !support.fetch.supported,
      run: async () => {
        try {
          // 创建一个简单的Blob URL来获取数据
          const testData = 'Test fetch data';
          const blob = new Blob([testData], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);

          try {
            const response = await fetch(url);
            if (!response.ok) {
              URL.revokeObjectURL(url);
              return false;
            }

            const text = await response.text();
            URL.revokeObjectURL(url);
            return text === testData;
          } catch (error) {
            URL.revokeObjectURL(url);
            return false;
          }
        } catch (error) {
          return false;
        }
      },
    });
  }

  /**
   * 注册测试用例
   */
  public registerTest(testCase: ITestCase): void {
    this._testCases.push(testCase);
  }

  /**
   * 运行所有兼容性测试
   */
  public async runCompatibilityTests(): Promise<ICompatibilityTestResult> {
    const browserInfo = this.getBrowserInfo();
    const standardsSupport = await this._detector.detectSupport();

    const result: ICompatibilityTestResult = {
      browser: browserInfo,
      passed: true,
      skipped: false,
      failedTests: [],
      passedTests: [],
      standardsSupport,
    };

    for (const test of this._testCases) {
      // 检查是否应该跳过此测试
      if (test.skip && test.skip(browserInfo, standardsSupport)) {
        continue;
      }

      try {
        // 运行测试
        const passed = await test.run(browserInfo, standardsSupport);

        if (passed) {
          result.passedTests.push(test.id);
        } else {
          result.failedTests.push({
            testId: test.id,
            description: test.description,
            expected: '测试通过',
            actual: '测试失败',
            critical: test.isCritical,
          });

          if (test.isCritical) {
            result.passed = false;
          }
        }

        // 运行清理函数
        if (test.cleanup) {
          await test.cleanup();
        }
      } catch (error) {
        result.failedTests.push({
          testId: test.id,
          description: test.description,
          expected: '测试正常执行',
          actual: `测试执行异常: ${error instanceof Error ? error.message : String(error)}`,
          critical: test.isCritical,
        });

        if (test.isCritical) {
          result.passed = false;
        }
      }
    }

    return result;
  }

  /**
   * 生成兼容性测试报告
   */
  public async generateCompatibilityReport(): Promise<string> {
    const result = await this.runCompatibilityTests();
    let report = `## 浏览器兼容性测试报告\n\n`;

    // 浏览器信息
    report += `### 浏览器信息\n\n`;
    report += `- 浏览器: ${result.browser.name} ${result.browser.version}\n`;
    report += `- 引擎: ${result.browser.engine} ${result.browser.engineVersion}\n`;
    report += `- 操作系统: ${result.browser.os}\n`;
    report += `- 设备类型: ${result.browser.mobile ? (result.browser.tablet ? '平板' : '移动设备') : '桌面'}\n\n`;

    // 测试结果摘要
    report += `### 测试结果摘要\n\n`;
    report += `- 测试状态: ${result.passed ? '✅ 通过' : '❌ 未通过'}\n`;
    report += `- 通过测试: ${result.passedTests.length}\n`;
    report += `- 失败测试: ${result.failedTests.length}\n\n`;

    // 测试详情
    if (result.failedTests.length > 0) {
      report += `### 失败测试详情\n\n`;

      for (const failure of result.failedTests) {
        report += `#### ${failure.testId} ${failure.critical ? '(关键)' : ''}\n\n`;
        report += `- 描述: ${failure.description}\n`;
        report += `- 预期: ${failure.expected}\n`;
        report += `- 实际: ${failure.actual}\n\n`;
      }
    }

    return report;
  }

  /**
   * 获取建议的浏览器配置
   */
  public async getRecommendedBrowserConfig(): Promise<Record<string, any>> {
    const result = await this.runCompatibilityTests();

    // 根据测试结果生成推荐配置
    const config: Record<string, any> = {
      browserFeatures: {
        fileAPI: result.standardsSupport.fileAPI.supported,
        blobOperations: result.passedTests.includes('blob-operations'),
        arrayBufferOperations: result.passedTests.includes(
          'arraybuffer-operations'
        ),
        webWorkers: result.passedTests.includes('web-worker'),
        urlOperations: result.passedTests.includes('url-operations'),
        fetchAPI: result.passedTests.includes('fetch-api'),
      },
      recommendations: {
        useWorkers: result.passedTests.includes('web-worker'),
        useFetch: result.passedTests.includes('fetch-api'),
        blobSlicing: result.passedTests.includes('blob-operations'),
        useNativeAPI: result.passed,
      },
    };

    // 根据失败的测试添加警告
    if (result.failedTests.length > 0) {
      config.warnings = result.failedTests.map(failure => ({
        feature: failure.testId,
        description: failure.description,
        critical: failure.critical,
      }));
    }

    return config;
  }

  /**
   * 获取当前浏览器环境支持的最大上传文件大小
   * 不同浏览器和版本对文件大小有不同的限制
   * @returns 字节为单位的最大文件大小，如果无法确定则返回null
   */
  public getMaxUploadFileSize(): number | null {
    const { name, version } = this._browserInfo;

    // 不同浏览器的文件大小限制
    switch (name.toLowerCase()) {
      case 'chrome':
        return 2 * 1024 * 1024 * 1024; // Chrome: 2GB

      case 'firefox': {
        const majorVersion = parseInt(version.split('.')[0], 10);
        if (majorVersion >= 70) {
          return 5 * 1024 * 1024 * 1024; // Firefox 70+: 5GB
        } else if (majorVersion >= 50) {
          return 2 * 1024 * 1024 * 1024; // Firefox 50-69: 2GB
        }
        return 800 * 1024 * 1024; // 旧版Firefox: 800MB
      }

      case 'safari': {
        const majorVersion = parseInt(version.split('.')[0], 10);
        if (majorVersion >= 15) {
          return 4 * 1024 * 1024 * 1024; // Safari 15+: 4GB
        } else if (majorVersion >= 13) {
          return 2 * 1024 * 1024 * 1024; // Safari 13-14: 2GB
        }
        return 1 * 1024 * 1024 * 1024; // 旧版Safari: 1GB
      }

      case 'edge':
        return 4 * 1024 * 1024 * 1024; // Edge (基于Chromium): 4GB

      case 'internet explorer':
        return 4 * 1024 * 1024 * 1024; // IE11: 4GB (理论上，实际可能更小)

      case 'opera':
        return 2 * 1024 * 1024 * 1024; // Opera: 2GB

      default:
        // 默认较为保守的估计
        return 1 * 1024 * 1024 * 1024; // 默认: 1GB
    }
  }
}

export default BrowserCompatibilityTester;
