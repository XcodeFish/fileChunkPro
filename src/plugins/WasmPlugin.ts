/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WasmPlugin - WebAssembly优化插件
 * 提供基于WebAssembly的性能优化，加速哈希计算和二进制处理
 */

import { UploaderCore } from '../core/UploaderCore';
import { UploadError } from '../core/ErrorCenter';
import {
  UploadErrorType,
  PluginPriority,
  IWasmAcceleratorOptions,
  IWasmBenchmarkResult,
} from '../types';
import { Logger } from '../utils/Logger';
import { WebAssemblyAccelerator } from '../utils/WebAssemblyAccelerator';
import { IPlugin } from './interfaces';

export interface WasmPluginOptions {
  /**
   * 是否启用WebAssembly优化
   * @default true
   */
  enabled?: boolean;

  /**
   * WebAssembly模块基础URL
   * @default '/wasm/'
   */
  baseUrl?: string;

  /**
   * 是否自动检测性能并决定是否使用WebAssembly
   * @default true
   */
  autoDetectPerformance?: boolean;

  /**
   * 在初始化时预加载所有模块
   * @default false
   */
  preloadModules?: boolean;

  /**
   * 在WebAssembly不可用时回退到JS实现
   * @default true
   */
  fallbackToJS?: boolean;
}

/**
 * 文件处理上下文接口
 */
interface IFileProcessContext {
  /**
   * 是否使用WebAssembly
   */
  useWasm?: boolean;

  /**
   * WebAssembly配置选项
   */
  wasmOptions?: {
    /**
     * WebAssembly模块基础URL
     */
    baseUrl: string;
  };

  /**
   * 其他任意附加数据
   */
  [key: string]: unknown;
}

/**
 * 性能指标接口
 */
interface IPerformanceMetrics {
  /**
   * WebAssembly相关指标
   */
  wasm?: {
    /**
     * 是否支持WebAssembly
     */
    supported: boolean;

    /**
     * 已加载的模块列表
     */
    modules: string[];

    /**
     * 基准测试结果
     */
    benchmarks: Map<string, IWasmBenchmarkResult>;
  };

  /**
   * 其他任意附加指标数据
   */
  [key: string]: unknown;
}

/**
 * WebAssembly优化插件
 * 提供基于WebAssembly的性能优化，加速哈希计算和二进制处理
 */
export class WasmPlugin implements IPlugin {
  /**
   * 插件名称
   */
  public static readonly pluginName = 'WasmPlugin';

  /**
   * 插件版本
   */
  public readonly version = '1.0.0';

  /**
   * 插件优先级
   */
  public readonly priority = PluginPriority.NORMAL;

  /**
   * 插件配置选项
   */
  private options: WasmPluginOptions;

  /**
   * WebAssembly加速器实例
   */
  private accelerator: WebAssemblyAccelerator;

  /**
   * 上传器核心实例
   */
  private uploader: UploaderCore;

  /**
   * 日志记录器
   */
  private logger: Logger;

  /**
   * 是否支持WebAssembly
   */
  private wasmSupported = false;

  /**
   * 创建WebAssembly优化插件实例
   * @param options 插件配置选项
   */
  constructor(options: WasmPluginOptions = {}) {
    this.options = {
      enabled: options.enabled !== false,
      baseUrl: options.baseUrl || '/wasm/',
      autoDetectPerformance: options.autoDetectPerformance !== false,
      preloadModules: options.preloadModules || false,
      fallbackToJS: options.fallbackToJS !== false,
    };

    this.logger = new Logger('WasmPlugin');
  }

  /**
   * 初始化并安装插件
   * @param uploader 上传器核心实例
   */
  public install(uploader: UploaderCore): void {
    this.uploader = uploader;

    if (!this.options.enabled) {
      this.logger.info('WebAssembly优化已禁用');
      return;
    }

    try {
      // 创建WebAssembly加速器
      this.accelerator = new WebAssemblyAccelerator({
        enabled: this.options.enabled,
        baseUrl: this.options.baseUrl,
        autoDetectPerformance: this.options.autoDetectPerformance,
        preloadModules: this.options.preloadModules,
        fallbackToJS: this.options.fallbackToJS,
      });

      // 检测WebAssembly支持
      this.wasmSupported = this.accelerator.isWasmSupported();

      if (this.wasmSupported) {
        this.logger.info('WebAssembly支持已检测');

        // 注册钩子
        this.registerHooks();

        // 配置Worker
        this.configureWorkers();

        this.logger.info('WebAssembly优化插件已初始化');
      } else {
        this.logger.warn('当前环境不支持WebAssembly，性能优化将被禁用');
      }
    } catch (error) {
      this.logger.error('WebAssembly优化插件初始化失败:', error);
      throw new UploadError(
        UploadErrorType.ENVIRONMENT_ERROR,
        'WebAssembly优化插件初始化失败',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 注册钩子函数
   */
  private registerHooks(): void {
    // 注册文件处理前钩子
    this.uploader.hooks.beforeFileProcess.tap(
      WasmPlugin.pluginName,
      this.beforeFileProcess.bind(this)
    );

    // 注册性能监控钩子
    this.uploader.hooks.measurePerformance.tap(
      WasmPlugin.pluginName,
      this.measurePerformance.bind(this)
    );
  }

  /**
   * 配置Worker以支持WebAssembly
   */
  private configureWorkers(): void {
    // 获取WorkerManager
    const workerManager = this.uploader.getWorkerManager();

    if (!workerManager) {
      this.logger.warn('WorkerManager不可用，无法配置WebAssembly');
      return;
    }

    // 配置哈希Worker
    const hashWorker = workerManager.getWorker('hash');
    if (hashWorker) {
      hashWorker.postMessage({
        action: 'configureWasm',
        wasmOptions: {
          baseUrl: this.options.baseUrl,
        },
      });
    }
  }

  /**
   * 文件处理前钩子函数
   * @param file 文件对象
   * @param context 上下文数据
   */
  private beforeFileProcess(file: File, context: IFileProcessContext): void {
    if (!this.wasmSupported || !this.options.enabled) {
      return;
    }

    // 设置使用WebAssembly
    context.useWasm = true;
    context.wasmOptions = {
      baseUrl: this.options.baseUrl,
    };

    this.logger.debug('为文件启用WebAssembly优化:', file.name);
  }

  /**
   * 性能监控钩子函数
   * @param metrics 性能指标
   */
  private measurePerformance(metrics: IPerformanceMetrics): void {
    if (!this.wasmSupported || !this.options.enabled) {
      return;
    }

    // 添加WebAssembly相关指标
    metrics.wasm = {
      supported: this.wasmSupported,
      modules: this.accelerator.getLoadedModules(),
      benchmarks: this.accelerator.getBenchmarkResults(),
    };
  }

  /**
   * 获取WebAssembly加速器实例
   * @returns WebAssembly加速器实例
   */
  public getAccelerator(): WebAssemblyAccelerator {
    return this.accelerator;
  }

  /**
   * 检查是否支持WebAssembly
   * @returns 是否支持WebAssembly
   */
  public isWasmSupported(): boolean {
    return this.wasmSupported;
  }

  /**
   * 销毁插件并释放资源
   */
  public dispose(): void {
    if (this.accelerator) {
      this.accelerator.dispose();
    }

    this.logger.info('WebAssembly优化插件已销毁');
  }
}
