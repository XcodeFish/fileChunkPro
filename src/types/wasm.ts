/**
 * WebAssembly相关类型定义
 */

/**
 * WebAssembly模块类型枚举
 */
export enum WasmModuleType {
  /** MD5哈希模块 */
  MD5 = 'md5',
  
  /** SHA1哈希模块 */
  SHA1 = 'sha1',
  
  /** SHA256哈希模块 */
  SHA256 = 'sha256',
  
  /** 二进制处理模块 */
  BINARY_PROCESSOR = 'binary_processor'
}

/**
 * WebAssembly哈希算法枚举
 */
export enum WasmHashAlgorithm {
  /** MD5哈希算法 */
  MD5 = 'md5',
  
  /** SHA1哈希算法 */
  SHA1 = 'sha1',
  
  /** SHA256哈希算法 */
  SHA256 = 'sha256'
}

/**
 * WebAssembly模块状态枚举
 */
export enum WasmModuleStatus {
  /** 未加载 */
  UNLOADED = 'unloaded',
  
  /** 加载中 */
  LOADING = 'loading',
  
  /** 已加载 */
  LOADED = 'loaded',
  
  /** 加载错误 */
  ERROR = 'error'
}

/**
 * WebAssembly优化级别枚举
 */
export enum WasmOptimizationLevel {
  /** 优先速度 */
  SPEED = 'speed',
  
  /** 平衡速度与大小 */
  BALANCED = 'balanced',
  
  /** 优先大小 */
  SIZE = 'size'
}

/**
 * WebAssembly加速器配置选项
 */
export interface IWasmAcceleratorOptions {
  /** 是否启用WebAssembly优化 */
  enabled?: boolean;
  
  /** WebAssembly模块基础URL */
  baseUrl?: string;
  
  /** 要加载的模块列表 */
  modules?: WasmModuleType[];
  
  /** 是否自动检测性能并决定是否使用WebAssembly */
  autoDetectPerformance?: boolean;
  
  /** 是否在初始化时预加载所有模块 */
  preloadModules?: boolean;
  
  /** 在WebAssembly不可用时是否回退到JS实现 */
  fallbackToJS?: boolean;
  
  /** 优化级别 */
  optimizationLevel?: WasmOptimizationLevel | string;
  
  /** 是否启用调试信息 */
  debug?: boolean;
}

/**
 * WebAssembly模块实例
 */
export interface IWasmModule {
  /** 模块名称 */
  name: string;
  
  /** 模块类型 */
  type: WasmModuleType;
  
  /** 模块状态 */
  status: WasmModuleStatus;
  
  /** WebAssembly实例 */
  instance: WebAssembly.Instance | null;
  
  /** 导出函数 */
  exports: any | null;
  
  /** 内存 */
  memory: WebAssembly.Memory | null;
  
  /** 错误信息 */
  error?: Error;
}

/**
 * WebAssembly模块配置
 */
export interface IWasmModuleConfig {
  /** 模块名称 */
  name: string;
  
  /** 模块URL */
  url: string;
  
  /** 模块类型 */
  type: WasmModuleType;
  
  /** 是否支持回退到JS实现 */
  fallback: boolean;
  
  /** 导入对象 */
  importObject?: WebAssembly.Imports;
}

/**
 * WebAssembly性能基准测试结果
 */
export interface IWasmBenchmarkResult {
  /** 测试的算法/模块类型 */
  type: WasmModuleType;
  
  /** WebAssembly执行时间(毫秒) */
  wasmTime: number;
  
  /** JavaScript执行时间(毫秒) */
  jsTime: number;
  
  /** 加速比率 (JS时间 / WASM时间) */
  speedupRatio: number;
  
  /** 数据大小(字节) */
  dataSize: number;
  
  /** 是否应该使用WebAssembly (根据性能测试) */
  shouldUseWasm: boolean;
  
  /** 测试时间戳 */
  timestamp: number;
} 