/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * PerformanceBenchmark - Web标准性能基准测试工具
 * 提供对文件上传关键操作的性能测试和基准比较
 */

import {
  WebStandardDetector,
  IWebStandardSupport,
} from './WebStandardDetector';

export interface IBenchmarkResult {
  name: string;
  duration: number; // 毫秒
  bytesProcessed?: number; // 处理的字节数
  operationsPerSecond?: number; // 每秒操作数
  bytesPerSecond?: number; // 每秒处理字节数
  iterations?: number; // 执行的迭代次数
  timePerIteration?: number; // 每次迭代的平均时间(ms)
  error?: string; // 错误信息（如果测试失败）
}

export interface IBenchmarkSuite {
  name: string;
  description: string;
  skip?: (standardsSupport: IWebStandardSupport) => boolean;
  setup?: () => Promise<void>;
  run: () => Promise<IBenchmarkResult[]>;
  cleanup?: () => Promise<void>;
}

export interface IBenchmarkOptions {
  iterations?: number; // 每个测试运行的迭代次数
  warmupIterations?: number; // 热身迭代次数（不计入结果）
  dataSize?: number; // 用于测试的数据大小（字节）
  async?: boolean; // 是否异步运行测试
  timeout?: number; // 超时时间（毫秒）
}

export interface IBenchmarkSuiteResult {
  name: string;
  description: string;
  results: IBenchmarkResult[];
  skipped: boolean;
  error?: string;
}

export interface IBenchmarkComparisonResult {
  browserInfo: string;
  timestamp: string;
  suiteResults: IBenchmarkSuiteResult[];
  environmentInfo: {
    hardwareConcurrency: number;
    deviceMemory?: number;
    platform: string;
    userAgent: string;
    standardsSupport: IWebStandardSupport;
  };
}

export class PerformanceBenchmark {
  private _detector: WebStandardDetector;
  private _suites: IBenchmarkSuite[] = [];
  private _defaultOptions: IBenchmarkOptions = {
    iterations: 5,
    warmupIterations: 2,
    dataSize: 1024 * 1024, // 1MB
    async: true,
    timeout: 30000, // 30秒
  };

  constructor(detector: WebStandardDetector) {
    this._detector = detector;
    this.registerDefaultSuites();
  }

  /**
   * 设置默认选项
   */
  public setDefaultOptions(options: Partial<IBenchmarkOptions>): void {
    this._defaultOptions = { ...this._defaultOptions, ...options };
  }

  /**
   * 注册基准测试套件
   */
  public registerSuite(suite: IBenchmarkSuite): void {
    this._suites.push(suite);
  }

  /**
   * 注册默认的基准测试套件
   */
  private registerDefaultSuites(): void {
    // 文件读取性能测试
    this.registerSuite({
      name: '文件读取基准测试',
      description: '测试文件读取操作的性能',
      skip: support => !support.fileAPI.supported,
      run: async () => {
        const results: IBenchmarkResult[] = [];
        const sizes = [1024, 1024 * 1024, 10 * 1024 * 1024]; // 1KB, 1MB, 10MB

        for (const size of sizes) {
          try {
            // 创建测试数据
            const buffer = new ArrayBuffer(size);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < view.length; i++) {
              view[i] = i % 256;
            }

            const file = new File([buffer], 'test.bin', {
              type: 'application/octet-stream',
            });

            // 测试 readAsArrayBuffer
            const arrayBufferResult = await this.measureFileRead(
              file,
              'readAsArrayBuffer',
              3
            );
            results.push({
              name: `readAsArrayBuffer (${this.formatSize(size)})`,
              duration: arrayBufferResult.duration,
              bytesProcessed: size,
              bytesPerSecond: size / (arrayBufferResult.duration / 1000),
              iterations: arrayBufferResult.iterations,
              timePerIteration: arrayBufferResult.timePerIteration,
            });

            // 测试 readAsDataURL
            const dataURLResult = await this.measureFileRead(
              file,
              'readAsDataURL',
              3
            );
            results.push({
              name: `readAsDataURL (${this.formatSize(size)})`,
              duration: dataURLResult.duration,
              bytesProcessed: size,
              bytesPerSecond: size / (dataURLResult.duration / 1000),
              iterations: dataURLResult.iterations,
              timePerIteration: dataURLResult.timePerIteration,
            });

            // 小文件才测试readAsText，大文件可能性能较差
            if (size <= 1024 * 1024) {
              const textResult = await this.measureFileRead(
                file,
                'readAsText',
                3
              );
              results.push({
                name: `readAsText (${this.formatSize(size)})`,
                duration: textResult.duration,
                bytesProcessed: size,
                bytesPerSecond: size / (textResult.duration / 1000),
                iterations: textResult.iterations,
                timePerIteration: textResult.timePerIteration,
              });
            }
          } catch (error) {
            results.push({
              name: `文件读取测试 (${this.formatSize(size)})`,
              duration: 0,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return results;
      },
    });

    // Blob操作性能测试
    this.registerSuite({
      name: 'Blob操作基准测试',
      description: '测试Blob创建和切片操作的性能',
      skip: support => !support.blobConstructor.supported,
      run: async () => {
        const results: IBenchmarkResult[] = [];
        const sizes = [1024, 1024 * 1024, 10 * 1024 * 1024]; // 1KB, 1MB, 10MB

        for (const size of sizes) {
          try {
            // 创建测试数据
            const buffer = new ArrayBuffer(size);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < view.length; i++) {
              view[i] = i % 256;
            }

            // 测试Blob创建
            const createResult = await this.benchmarkOperation(
              () => new Blob([buffer], { type: 'application/octet-stream' }),
              5
            );

            results.push({
              name: `创建Blob (${this.formatSize(size)})`,
              duration: createResult.duration,
              bytesProcessed: size,
              operationsPerSecond: 1000 / createResult.timePerIteration,
              iterations: createResult.iterations,
              timePerIteration: createResult.timePerIteration,
            });

            // 测试Blob切片
            const blob = new Blob([buffer], {
              type: 'application/octet-stream',
            });
            const sliceSize = Math.min(size, 1024 * 1024); // 最大切片1MB

            const sliceResult = await this.benchmarkOperation(
              () => blob.slice(0, sliceSize),
              10
            );

            results.push({
              name: `Blob切片 (${this.formatSize(sliceSize)})`,
              duration: sliceResult.duration,
              bytesProcessed: sliceSize,
              operationsPerSecond: 1000 / sliceResult.timePerIteration,
              iterations: sliceResult.iterations,
              timePerIteration: sliceResult.timePerIteration,
            });
          } catch (error) {
            results.push({
              name: `Blob操作测试 (${this.formatSize(size)})`,
              duration: 0,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return results;
      },
    });

    // ArrayBuffer操作性能测试
    this.registerSuite({
      name: 'ArrayBuffer操作基准测试',
      description: '测试ArrayBuffer和TypedArray操作的性能',
      skip: support => !support.arrayBuffer.supported,
      run: async () => {
        const results: IBenchmarkResult[] = [];
        const sizes = [1024 * 1024, 10 * 1024 * 1024]; // 1MB, 10MB

        for (const size of sizes) {
          try {
            // 测试创建ArrayBuffer
            const createResult = await this.benchmarkOperation(
              () => new ArrayBuffer(size),
              5
            );

            results.push({
              name: `创建ArrayBuffer (${this.formatSize(size)})`,
              duration: createResult.duration,
              bytesProcessed: size,
              operationsPerSecond: 1000 / createResult.timePerIteration,
              iterations: createResult.iterations,
              timePerIteration: createResult.timePerIteration,
            });

            // 测试TypedArray写入
            const writeResult = await this.benchmarkOperation(() => {
              const buffer = new ArrayBuffer(size);
              const view = new Uint8Array(buffer);
              for (let i = 0; i < view.length; i += 1024) {
                view[i] = i % 256;
              }
              return buffer;
            }, 3);

            results.push({
              name: `TypedArray写入 (${this.formatSize(size)})`,
              duration: writeResult.duration,
              bytesProcessed: size,
              bytesPerSecond: size / (writeResult.timePerIteration / 1000),
              iterations: writeResult.iterations,
              timePerIteration: writeResult.timePerIteration,
            });

            // 测试ArrayBuffer切片
            const buffer = new ArrayBuffer(size);
            const sliceSize = Math.min(size, 1024 * 1024); // 最大切片1MB

            const sliceResult = await this.benchmarkOperation(
              () => buffer.slice(0, sliceSize),
              10
            );

            results.push({
              name: `ArrayBuffer切片 (${this.formatSize(sliceSize)})`,
              duration: sliceResult.duration,
              bytesProcessed: sliceSize,
              operationsPerSecond: 1000 / sliceResult.timePerIteration,
              iterations: sliceResult.iterations,
              timePerIteration: sliceResult.timePerIteration,
            });
          } catch (error) {
            results.push({
              name: `ArrayBuffer操作测试 (${this.formatSize(size)})`,
              duration: 0,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return results;
      },
    });

    // Worker性能测试
    this.registerSuite({
      name: 'Worker性能基准测试',
      description: '测试Web Worker的性能特性',
      skip: support => !support.webWorkers.supported,
      run: async () => {
        const results: IBenchmarkResult[] = [];
        const dataSizes = [1024 * 1024, 10 * 1024 * 1024]; // 1MB, 10MB

        for (const size of dataSizes) {
          try {
            // 创建测试数据
            const buffer = new ArrayBuffer(size);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < view.length; i++) {
              view[i] = i % 256;
            }

            // 测试数据传输 (通过复制)
            const workerCode = `
              self.onmessage = function(e) {
                const data = e.data;
                // 简单计算校验和确保数据被处理
                let sum = 0;
                const view = new Uint8Array(data);
                for (let i = 0; i < view.length; i += 1024) {
                  sum += view[i];
                }
                self.postMessage({sum: sum});
              };
            `;

            const copyResult = await this.measureWorkerOperation(
              workerCode,
              buffer,
              false, // 不使用transferable
              3
            );

            results.push({
              name: `Worker数据传输-复制 (${this.formatSize(size)})`,
              duration: copyResult.duration,
              bytesProcessed: size,
              bytesPerSecond: size / (copyResult.duration / 1000),
              iterations: copyResult.iterations,
              timePerIteration: copyResult.timePerIteration,
            });

            // 测试数据传输 (通过transferable)
            if (
              typeof ArrayBuffer.prototype.transfer !== 'undefined' ||
              typeof ArrayBuffer.prototype.transferToFixedLength !== 'undefined'
            ) {
              const transferResult = await this.measureWorkerOperation(
                workerCode,
                buffer.slice(0), // 创建一个新的buffer以便可以多次测试
                true, // 使用transferable
                3
              );

              results.push({
                name: `Worker数据传输-transfer (${this.formatSize(size)})`,
                duration: transferResult.duration,
                bytesProcessed: size,
                bytesPerSecond: size / (transferResult.duration / 1000),
                iterations: transferResult.iterations,
                timePerIteration: transferResult.timePerIteration,
              });
            }
          } catch (error) {
            results.push({
              name: `Worker性能测试 (${this.formatSize(size)})`,
              duration: 0,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return results;
      },
    });

    // 网络请求性能测试
    this.registerSuite({
      name: '网络请求基准测试',
      description: '测试Fetch API和XMLHttpRequest的性能',
      skip: _support => false, // 总是运行，适当降级
      run: async () => {
        const results: IBenchmarkResult[] = [];
        const testData = 'test data '.repeat(1000); // 约10KB
        const blob = new Blob([testData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        try {
          // 测试Fetch API
          const fetchSupported = typeof fetch !== 'undefined';
          if (fetchSupported) {
            const fetchResult = await this.measureNetworkOperation(async () => {
              const response = await fetch(url);
              await response.text();
              return response.ok;
            }, 5);

            results.push({
              name: 'Fetch API请求',
              duration: fetchResult.duration,
              bytesProcessed: testData.length,
              bytesPerSecond:
                testData.length / (fetchResult.timePerIteration / 1000),
              iterations: fetchResult.iterations,
              timePerIteration: fetchResult.timePerIteration,
            });
          }

          // 测试XMLHttpRequest
          const xhrResult = await this.measureNetworkOperation(
            () =>
              new Promise<boolean>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url);
                xhr.onload = () => resolve(xhr.status === 200);
                xhr.onerror = () => reject(new Error('XHR failed'));
                xhr.send();
              }),
            5
          );

          results.push({
            name: 'XMLHttpRequest请求',
            duration: xhrResult.duration,
            bytesProcessed: testData.length,
            bytesPerSecond:
              testData.length / (xhrResult.timePerIteration / 1000),
            iterations: xhrResult.iterations,
            timePerIteration: xhrResult.timePerIteration,
          });
        } catch (error) {
          results.push({
            name: '网络请求测试',
            duration: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          URL.revokeObjectURL(url);
        }

        return results;
      },
    });
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  /**
   * 测量文件读取性能
   */
  private async measureFileRead(
    file: File,
    method: 'readAsArrayBuffer' | 'readAsText' | 'readAsDataURL',
    iterations = 5
  ): Promise<{
    duration: number;
    iterations: number;
    timePerIteration: number;
  }> {
    const times: number[] = [];

    // 热身运行
    await this.readFile(file, method);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.readFile(file, method);
      const end = performance.now();
      times.push(end - start);
    }

    const totalDuration = times.reduce((sum, time) => sum + time, 0);
    const avgTime = totalDuration / times.length;

    return {
      duration: totalDuration,
      iterations,
      timePerIteration: avgTime,
    };
  }

  /**
   * 读取文件
   */
  private readFile(
    file: File,
    method: 'readAsArrayBuffer' | 'readAsText' | 'readAsDataURL'
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result);
      reader.onerror = e => reject(e);
      reader[method](file);
    });
  }

  /**
   * 测量通用操作性能
   */
  private async benchmarkOperation<T>(
    operation: () => T,
    iterations = 5
  ): Promise<{
    duration: number;
    iterations: number;
    timePerIteration: number;
  }> {
    const times: number[] = [];

    // 热身运行
    operation();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      operation();
      const end = performance.now();
      times.push(end - start);
    }

    const totalDuration = times.reduce((sum, time) => sum + time, 0);
    const avgTime = totalDuration / times.length;

    return {
      duration: totalDuration,
      iterations,
      timePerIteration: avgTime,
    };
  }

  /**
   * 测量Worker操作性能
   */
  private async measureWorkerOperation(
    workerCode: string,
    data: ArrayBuffer,
    useTransferable: boolean,
    iterations = 3
  ): Promise<{
    duration: number;
    iterations: number;
    timePerIteration: number;
  }> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      // 为每次迭代创建新的worker
      const workerBlob = new Blob([workerCode], {
        type: 'application/javascript',
      });
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);

      const start = performance.now();

      await new Promise<void>(resolve => {
        worker.onmessage = () => {
          resolve();
        };

        // 复制数据以便在多次迭代中使用
        const dataCopy = data.slice(0);

        if (useTransferable) {
          worker.postMessage(dataCopy, [dataCopy]);
        } else {
          worker.postMessage(dataCopy);
        }
      });

      const end = performance.now();
      times.push(end - start);

      // 清理
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    }

    const totalDuration = times.reduce((sum, time) => sum + time, 0);
    const avgTime = totalDuration / times.length;

    return {
      duration: totalDuration,
      iterations,
      timePerIteration: avgTime,
    };
  }

  /**
   * 测量网络操作性能
   */
  private async measureNetworkOperation(
    operation: () => Promise<boolean>,
    iterations = 5
  ): Promise<{
    duration: number;
    iterations: number;
    timePerIteration: number;
  }> {
    const times: number[] = [];

    // 热身运行
    await operation();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      times.push(end - start);
    }

    const totalDuration = times.reduce((sum, time) => sum + time, 0);
    const avgTime = totalDuration / times.length;

    return {
      duration: totalDuration,
      iterations,
      timePerIteration: avgTime,
    };
  }

  /**
   * 运行所有基准测试
   */
  public async runAllBenchmarks(
    options?: Partial<IBenchmarkOptions>
  ): Promise<IBenchmarkComparisonResult> {
    const mergedOptions = { ...this._defaultOptions, ...options };
    const standardsSupport = await this._detector.detectSupport();
    const results: IBenchmarkSuiteResult[] = [];

    for (const suite of this._suites) {
      // 检查是否应该跳过此套件
      if (suite.skip && suite.skip(standardsSupport)) {
        results.push({
          name: suite.name,
          description: suite.description,
          results: [],
          skipped: true,
        });
        continue;
      }

      try {
        // 运行测试套件
        if (suite.setup) {
          await suite.setup();
        }

        const benchmarkResults = await suite.run();

        results.push({
          name: suite.name,
          description: suite.description,
          results: benchmarkResults,
          skipped: false,
        });

        if (suite.cleanup) {
          await suite.cleanup();
        }
      } catch (error) {
        results.push({
          name: suite.name,
          description: suite.description,
          results: [],
          skipped: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 获取设备内存（如果可用）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceMemory = (navigator as any).deviceMemory;

    return {
      browserInfo: navigator.userAgent,
      timestamp: new Date().toISOString(),
      suiteResults: results,
      environmentInfo: {
        hardwareConcurrency: navigator.hardwareConcurrency || 1,
        deviceMemory: deviceMemory,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        standardsSupport,
      },
    };
  }

  /**
   * 生成基准测试报告
   */
  public async generateBenchmarkReport(
    options?: Partial<IBenchmarkOptions>
  ): Promise<string> {
    const results = await this.runAllBenchmarks(options);
    let report = `## Web标准性能基准测试报告\n\n`;

    // 浏览器和环境信息
    report += `### 环境信息\n\n`;
    report += `- 浏览器: ${results.browserInfo}\n`;
    report += `- 平台: ${results.environmentInfo.platform}\n`;
    report += `- CPU核心数: ${results.environmentInfo.hardwareConcurrency}\n`;
    if (results.environmentInfo.deviceMemory) {
      report += `- 设备内存: ${results.environmentInfo.deviceMemory}GB\n`;
    }
    report += `- 测试时间: ${new Date(results.timestamp).toLocaleString()}\n\n`;

    // 测试套件结果
    for (const suite of results.suiteResults) {
      report += `### ${suite.name}\n\n`;
      report += `${suite.description}\n\n`;

      if (suite.skipped) {
        report += `❌ 已跳过: 当前环境不支持此测试\n\n`;
        continue;
      }

      if (suite.error) {
        report += `❌ 测试失败: ${suite.error}\n\n`;
        continue;
      }

      if (suite.results.length === 0) {
        report += `⚠️ 没有结果\n\n`;
        continue;
      }

      // 创建表格
      report += `| 测试 | 持续时间 | 每秒操作数 | 每秒处理数据 |\n`;
      report += `| --- | --- | --- | --- |\n`;

      for (const result of suite.results) {
        if (result.error) {
          report += `| ${result.name} | ❌ 错误: ${result.error} | - | - |\n`;
        } else {
          const duration = `${result.duration.toFixed(2)}ms`;
          const opsPerSec = result.operationsPerSecond
            ? `${result.operationsPerSecond.toFixed(2)}`
            : '-';
          const bytesPerSec = result.bytesPerSecond
            ? `${this.formatSize(result.bytesPerSecond)}/s`
            : '-';

          report += `| ${result.name} | ${duration} | ${opsPerSec} | ${bytesPerSec} |\n`;
        }
      }

      report += `\n`;
    }

    return report;
  }

  /**
   * 获取性能建议
   */
  public async getPerformanceRecommendations(): Promise<Record<string, any>> {
    const results = await this.runAllBenchmarks();

    const recommendations: Record<string, any> = {
      fileOperations: {},
      networkOperations: {},
      workerUsage: {},
      chunkSize: {},
      generalOptimizations: [],
    };

    // 分析文件操作性能
    const fileReaderSuite = results.suiteResults.find(
      s => s.name === '文件读取基准测试'
    );
    if (
      fileReaderSuite &&
      !fileReaderSuite.skipped &&
      fileReaderSuite.results.length > 0
    ) {
      // 找到最快的读取方法
      const readMethods = fileReaderSuite.results.filter(r => !r.error);
      const fastestMethod = readMethods.reduce(
        (fastest, current) =>
          !fastest ||
          (current.bytesPerSecond || 0) > (fastest.bytesPerSecond || 0)
            ? current
            : fastest,
        null as IBenchmarkResult | null
      );

      if (fastestMethod) {
        recommendations.fileOperations.preferredReadMethod =
          fastestMethod.name.includes('readAsArrayBuffer')
            ? 'arrayBuffer'
            : fastestMethod.name.includes('readAsDataURL')
              ? 'dataURL'
              : 'text';
      }
    }

    // 分析Blob操作性能
    const blobSuite = results.suiteResults.find(
      s => s.name === 'Blob操作基准测试'
    );
    if (blobSuite && !blobSuite.skipped && blobSuite.results.length > 0) {
      const sliceResults = blobSuite.results.filter(
        r => r.name.includes('切片') && !r.error
      );
      if (sliceResults.length > 0) {
        const avgSliceTime =
          sliceResults.reduce((sum, r) => sum + (r.timePerIteration || 0), 0) /
          sliceResults.length;

        if (avgSliceTime > 50) {
          // 如果切片操作平均超过50ms，建议较小的块
          recommendations.chunkSize.recommendation = 'smaller';
          recommendations.chunkSize.suggestedSize = '512KB';
          recommendations.generalOptimizations.push(
            '减小分片大小以优化Blob操作性能'
          );
        } else if (avgSliceTime < 10) {
          // 如果切片操作很快，可以用更大的块
          recommendations.chunkSize.recommendation = 'larger';
          recommendations.chunkSize.suggestedSize = '4MB';
        } else {
          recommendations.chunkSize.recommendation = 'medium';
          recommendations.chunkSize.suggestedSize = '2MB';
        }
      }
    }

    // 分析Worker性能
    const workerSuite = results.suiteResults.find(
      s => s.name === 'Worker性能基准测试'
    );
    if (workerSuite && !workerSuite.skipped && workerSuite.results.length > 0) {
      // 检查transferable性能
      const transferResult = workerSuite.results.find(
        r => r.name.includes('transfer') && !r.error
      );
      const copyResult = workerSuite.results.find(
        r => r.name.includes('复制') && !r.error
      );

      if (transferResult && copyResult) {
        const transferEfficiency =
          (transferResult.bytesPerSecond || 0) /
          (copyResult.bytesPerSecond || 1);

        if (transferEfficiency > 1.5) {
          recommendations.workerUsage.useTransferable = true;
          recommendations.generalOptimizations.push(
            '使用Transferable对象优化Worker通信性能'
          );
        } else {
          recommendations.workerUsage.useTransferable = false;
        }
      }

      // 根据Worker性能建议使用数量
      if (results.environmentInfo.hardwareConcurrency > 4) {
        const suggestedWorkers = Math.min(
          Math.floor(results.environmentInfo.hardwareConcurrency / 2),
          6
        );
        recommendations.workerUsage.recommendedCount = suggestedWorkers;
      } else {
        recommendations.workerUsage.recommendedCount = 2;
      }
    }

    // 分析网络请求性能
    const networkSuite = results.suiteResults.find(
      s => s.name === '网络请求基准测试'
    );
    if (
      networkSuite &&
      !networkSuite.skipped &&
      networkSuite.results.length > 0
    ) {
      const fetchResult = networkSuite.results.find(
        r => r.name.includes('Fetch') && !r.error
      );
      const xhrResult = networkSuite.results.find(
        r => r.name.includes('XMLHttpRequest') && !r.error
      );

      if (fetchResult && xhrResult) {
        const fetchPerf = fetchResult.bytesPerSecond || 0;
        const xhrPerf = xhrResult.bytesPerSecond || 0;

        recommendations.networkOperations.preferredMethod =
          fetchPerf > xhrPerf ? 'fetch' : 'xhr';
      } else if (fetchResult) {
        recommendations.networkOperations.preferredMethod = 'fetch';
      } else if (xhrResult) {
        recommendations.networkOperations.preferredMethod = 'xhr';
      }
    }

    // 根据硬件并发数添加建议
    if (results.environmentInfo.hardwareConcurrency <= 2) {
      recommendations.generalOptimizations.push(
        '检测到低核心数设备，减少并发任务以避免资源争用'
      );
      recommendations.chunkSize.adjustment = 'smaller';
    } else if (results.environmentInfo.hardwareConcurrency >= 8) {
      recommendations.generalOptimizations.push(
        '检测到多核设备，可以增加并发任务数提高吞吐量'
      );
      recommendations.chunkSize.adjustment = 'balanced';
    }

    return recommendations;
  }
}

export default PerformanceBenchmark;
