/**
 * HashWorker - 哈希计算Worker
 * 用于在单独线程中计算文件哈希，避免阻塞主线程
 * 支持使用WebAssembly加速哈希计算
 */

import { MD5, HashCalculator } from '../utils/HashUtils';

// WebAssembly支持状态
let wasmSupported = false;
let wasmReady = false;
let wasmModules: {
  md5?: WebAssembly.Instance;
  sha1?: WebAssembly.Instance;
  sha256?: WebAssembly.Instance;
} = {};

// 在Worker环境中执行
const ctx: Worker = self as any;

/**
 * 检测WebAssembly支持情况
 */
function detectWasmSupport(): boolean {
  try {
    if (typeof WebAssembly !== 'undefined' && 
        typeof WebAssembly.instantiate === 'function' &&
        typeof WebAssembly.compile === 'function') {
      
      // 验证能否实例化一个简单模块
      const module = new WebAssembly.Module(new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, // WASM_BINARY_MAGIC
        0x01, 0x00, 0x00, 0x00  // WASM_BINARY_VERSION
      ]));
      
      if (module instanceof WebAssembly.Module) {
        // 检测内存API
        const memory = new WebAssembly.Memory({ initial: 1 });
        if (memory instanceof WebAssembly.Memory && memory.buffer instanceof ArrayBuffer) {
          return true;
        }
      }
    }
  } catch (e) {
    console.error('WebAssembly支持检测失败:', e);
  }
  
  return false;
}

/**
 * 加载WebAssembly模块
 * @param wasmBaseUrl WebAssembly模块基础URL
 */
async function loadWasmModules(wasmBaseUrl: string = '/wasm/'): Promise<void> {
  // 检测是否支持WebAssembly
  wasmSupported = detectWasmSupport();
  
  if (!wasmSupported) {
    ctx.postMessage({ status: 'wasm-support', supported: false });
    return;
  }
  
  ctx.postMessage({ status: 'wasm-support', supported: true });
  
  try {
    // 并行加载所有模块
    const loadPromises = [
      loadWasmModule('md5', wasmBaseUrl),
      loadWasmModule('sha1', wasmBaseUrl),
      loadWasmModule('sha256', wasmBaseUrl)
    ];
    
    await Promise.all(loadPromises);
    wasmReady = true;
    ctx.postMessage({ 
      status: 'wasm-ready', 
      modules: Object.keys(wasmModules) 
    });
  } catch (error) {
    console.error('WebAssembly模块加载失败:', error);
    ctx.postMessage({ 
      status: 'wasm-error', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * 加载单个WebAssembly模块
 * @param algorithm 算法名称
 * @param baseUrl 基础URL
 */
async function loadWasmModule(algorithm: string, baseUrl: string): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}${algorithm}.wasm`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${algorithm}.wasm: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(buffer);
    
    // 存储实例
    wasmModules[algorithm as keyof typeof wasmModules] = result.instance;
    
    ctx.postMessage({ status: 'wasm-module-loaded', algorithm });
  } catch (error) {
    console.error(`加载WebAssembly模块[${algorithm}]失败:`, error);
    ctx.postMessage({ 
      status: 'wasm-module-error', 
      algorithm, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

// 初始化检测WebAssembly支持
loadWasmModules();

// 监听主线程消息
ctx.addEventListener('message', async (event) => {
  try {
    const { file, algorithm, action, sampleSize, quick, useWasm, wasmOptions } = event.data;

    // 处理WebAssembly配置
    if (action === 'configureWasm' && wasmOptions) {
      try {
        await loadWasmModules(wasmOptions.baseUrl || '/wasm/');
        ctx.postMessage({ 
          status: 'wasm-configured',
          wasmSupported,
          wasmReady,
          modules: Object.keys(wasmModules)
        });
      } catch (error) {
        ctx.postMessage({ 
          status: 'wasm-config-error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }
    
    // 查询WebAssembly状态
    if (action === 'getWasmStatus') {
      ctx.postMessage({ 
        status: 'wasm-status',
        wasmSupported,
        wasmReady,
        modules: Object.keys(wasmModules)
      });
      return;
    }

    // 处理哈希计算请求
    if (action !== 'calculateHash' || !file) {
      throw new Error('无效的Worker请求');
    }

    // 记录开始时间
    const startTime = Date.now();
    
    // 确定是否应该使用WebAssembly
    const shouldUseWasm = useWasm !== false && wasmSupported && wasmReady;
    
    // 根据请求计算哈希
    let hash;
    let isQuickHash = false;
    let usingWasm = false;
    
    if (quick && sampleSize && file.size > 100 * 1024 * 1024) {
      // 使用快速哈希
      hash = await calculateQuickFileHash(file, algorithm || 'md5', sampleSize);
      isQuickHash = true;
      
      // 检查是否实际使用了WebAssembly
      if (shouldUseWasm) {
        const moduleKey = (algorithm || 'md5').toLowerCase() as keyof typeof wasmModules;
        usingWasm = moduleKey in wasmModules;
      }
    } else {
      // 计算完整文件哈希
      try {
        hash = await calculateFileHash(file, algorithm || 'md5');
        
        // 检查是否实际使用了WebAssembly
        if (shouldUseWasm) {
          const moduleKey = (algorithm || 'md5').toLowerCase() as keyof typeof wasmModules;
          usingWasm = moduleKey in wasmModules;
        }
      } catch (error) {
        console.error('哈希计算失败:', error);
        throw error;
      }
    }
    
    // 计算耗时
    const hashTime = Date.now() - startTime;
    
    // 返回结果给主线程
    ctx.postMessage({ 
      hash, 
      hashTime,
      isQuickHash,
      fileSize: file.size,
      usingWasm
    });
  } catch (error) {
    // 发送错误给主线程
    ctx.postMessage({ 
      error: error instanceof Error ? error.message : '哈希计算错误' 
    });
  }
});

/**
 * 使用WebAssembly计算大文件哈希
 * @param file 文件对象
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
async function calculateFileHashWasm(file: File, algorithm: string): Promise<string> {
  if (!wasmSupported || !wasmReady) {
    throw new Error('WebAssembly不支持或未准备好');
  }
  
  const moduleKey = algorithm.toLowerCase() as keyof typeof wasmModules;
  const module = wasmModules[moduleKey];
  
  if (!module) {
    throw new Error(`未加载WebAssembly模块: ${algorithm}`);
  }
  
  const exports = module.exports as any;
  const memory = exports.memory as WebAssembly.Memory;
  
  // 确定输出大小和初始化函数
  let outputSize: number;
  let initFn: any;
  let updateFn: any;
  let finalFn: any;
  
  switch (algorithm.toLowerCase()) {
    case 'md5':
      outputSize = 16;
      initFn = exports.md5_init;
      updateFn = exports.md5_update;
      finalFn = exports.md5_final;
      break;
    case 'sha1':
      outputSize = 20;
      initFn = exports.sha1_init;
      updateFn = exports.sha1_update;
      finalFn = exports.sha1_final;
      break;
    case 'sha256':
      outputSize = 32;
      initFn = exports.sha256_init;
      updateFn = exports.sha256_update;
      finalFn = exports.sha256_final;
      break;
    default:
      throw new Error(`不支持的哈希算法: ${algorithm}`);
  }
  
  if (!initFn || !updateFn || !finalFn) {
    throw new Error(`WebAssembly模块[${algorithm}]缺少必要的函数`);
  }
  
  // 初始化哈希上下文
  const ctxPtr = initFn();
  
  // 计算合适的块大小
  const chunkSize = 4 * 1024 * 1024; // 4MB chunks
  let offset = 0;
  
  // 分块处理
  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    const slice = file.slice(offset, end);
    const buffer = await slice.arrayBuffer();
    
    // 分配内存并复制数据
    const dataPtr = exports.__wbindgen_malloc(buffer.byteLength);
    const memoryView = new Uint8Array(memory.buffer);
    memoryView.set(new Uint8Array(buffer), dataPtr);
    
    // 更新哈希上下文
    updateFn(ctxPtr, dataPtr, buffer.byteLength);
    
    // 释放内存
    exports.__wbindgen_free(dataPtr, buffer.byteLength);
    
    offset = end;
    
    // 发送进度更新
    const progress = Math.min(100, Math.floor((offset / file.size) * 100));
    ctx.postMessage({ progress, type: 'progress' });
  }
  
  // 完成哈希计算
  const outputPtr = exports.__wbindgen_malloc(outputSize);
  finalFn(ctxPtr, outputPtr);
  
  // 读取结果
  const result = new Uint8Array(memory.buffer.slice(outputPtr, outputPtr + outputSize));
  
  // 释放内存
  exports.__wbindgen_free(outputPtr, outputSize);
  
  return arrayBufferToHex(result.buffer);
}

/**
 * 计算文件哈希
 * @param file 文件对象
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
async function calculateFileHash(file: File, algorithm: string): Promise<string> {
  try {
    // 尝试使用WebAssembly优化
    if (wasmSupported && wasmReady) {
      try {
        const moduleKey = algorithm.toLowerCase() as keyof typeof wasmModules;
        if (wasmModules[moduleKey]) {
          return await calculateFileHashWasm(file, algorithm);
        }
      } catch (error) {
        console.warn('WebAssembly文件哈希计算失败，回退到JS实现:', error);
        // 回退到JS实现
      }
    }
    
    // 使用流式处理计算大文件哈希
    const chunkSize = 2 * 1024 * 1024; // 2MB 分块
    
    if (algorithm.toLowerCase() === 'md5') {
      const md5 = new MD5();
      let offset = 0;
      
      // 分块读取并更新哈希
      while (offset < file.size) {
        const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
        const buffer = await slice.arrayBuffer();
        md5.update(buffer);
        
        offset += chunkSize;
        
        // 发送进度更新
        if (offset % (chunkSize * 10) === 0 || offset >= file.size) {
          const progress = Math.min(100, Math.floor((offset / file.size) * 100));
          ctx.postMessage({ progress, type: 'progress' });
        }
      }
      
      const digest = md5.finalize();
      return arrayBufferToHex(digest.buffer);
    } else {
      // 读取整个文件
      const buffer = await file.arrayBuffer();
      
      // 计算哈希
      return await calculateBufferHash(buffer, algorithm);
    }
  } catch (error) {
    console.error('文件哈希计算失败:', error);
    throw error;
  }
}

/**
 * 计算文件的快速哈希值（仅计算文件的头尾部分）
 * @param file 文件对象
 * @param algorithm 哈希算法
 * @param sampleSize 采样大小
 * @returns 快速哈希值
 */
async function calculateQuickFileHash(file: File, algorithm: string, sampleSize: number): Promise<string> {
  // 确保采样大小合理
  sampleSize = Math.min(sampleSize, Math.floor(file.size / 2));

  // 读取文件头部
  const headerSlice = file.slice(0, sampleSize);
  const headerChunk = await headerSlice.arrayBuffer();

  // 读取文件尾部
  let footerChunk;
  if (file.size > sampleSize * 2) {
    const footerSlice = file.slice(file.size - sampleSize, file.size);
    footerChunk = await footerSlice.arrayBuffer();
  } else {
    footerChunk = new ArrayBuffer(0);
  }

  // 合并头尾并计算哈希
  const combinedBuffer = concatenateArrayBuffers(headerChunk, footerChunk);
  
  // 尝试使用WebAssembly计算哈希
  let hash;
  if (wasmSupported && wasmReady) {
    try {
      const moduleKey = algorithm.toLowerCase() as keyof typeof wasmModules;
      if (wasmModules[moduleKey]) {
        hash = await calculateHashWasm(combinedBuffer, algorithm);
      } else {
        // 无可用的WebAssembly模块，使用JS实现
        hash = await calculateBufferHash(combinedBuffer, algorithm);
      }
    } catch (error) {
      console.warn('WebAssembly快速哈希计算失败，回退到JS实现:', error);
      // 回退到JS实现
      if (algorithm.toLowerCase() === 'md5') {
        const md5 = new MD5();
        md5.update(combinedBuffer);
        const digest = md5.finalize();
        hash = arrayBufferToHex(digest.buffer);
      } else {
        hash = await calculateBufferHash(combinedBuffer, algorithm);
      }
    }
  } else {
    // WebAssembly不可用，使用JS实现
    if (algorithm.toLowerCase() === 'md5') {
      const md5 = new MD5();
      md5.update(combinedBuffer);
      const digest = md5.finalize();
      hash = arrayBufferToHex(digest.buffer);
    } else {
      hash = await calculateBufferHash(combinedBuffer, algorithm);
    }
  }

  // 添加文件大小以增加唯一性
  return `${hash}_${file.size}`;
}

/**
 * 使用WebAssembly计算哈希
 * @param data 要计算哈希的数据
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
async function calculateHashWasm(data: ArrayBuffer, algorithm: string): Promise<string> {
  if (!wasmSupported || !wasmReady) {
    throw new Error('WebAssembly不支持或未准备好');
  }
  
  const moduleKey = algorithm.toLowerCase() as keyof typeof wasmModules;
  const module = wasmModules[moduleKey];
  
  if (!module) {
    throw new Error(`未加载WebAssembly模块: ${algorithm}`);
  }
  
  const exports = module.exports as any;
  const memory = exports.memory as WebAssembly.Memory;
  
  // 确定输出大小
  let outputSize: number;
  switch (algorithm.toLowerCase()) {
    case 'md5':
      outputSize = 16;
      break;
    case 'sha1':
      outputSize = 20;
      break;
    case 'sha256':
      outputSize = 32;
      break;
    default:
      throw new Error(`不支持的哈希算法: ${algorithm}`);
  }
  
  // 分配内存
  const inputPtr = exports.__wbindgen_malloc(data.byteLength);
  const outputPtr = exports.__wbindgen_malloc(outputSize);
  
  // 复制数据到WebAssembly内存
  const memoryView = new Uint8Array(memory.buffer);
  memoryView.set(new Uint8Array(data), inputPtr);
  
  // 调用相应的哈希函数
  switch (algorithm.toLowerCase()) {
    case 'md5':
      exports.md5_hash(inputPtr, data.byteLength, outputPtr);
      break;
    case 'sha1':
      exports.sha1_hash(inputPtr, data.byteLength, outputPtr);
      break;
    case 'sha256':
      exports.sha256_hash(inputPtr, data.byteLength, outputPtr);
      break;
  }
  
  // 读取结果
  const result = new Uint8Array(memory.buffer.slice(outputPtr, outputPtr + outputSize));
  
  // 释放内存
  exports.__wbindgen_free(inputPtr, data.byteLength);
  exports.__wbindgen_free(outputPtr, outputSize);
  
  // 转换为十六进制字符串
  return arrayBufferToHex(result.buffer);
}

/**
 * 计算缓冲区哈希值
 * @param buffer 数据缓冲区
 * @param algorithm 哈希算法
 * @returns 哈希值
 */
async function calculateBufferHash(buffer: ArrayBuffer, algorithm: string): Promise<string> {
  // 尝试使用WebAssembly计算哈希
  if (wasmSupported && wasmReady) {
    try {
      const moduleKey = algorithm.toLowerCase() as keyof typeof wasmModules;
      if (wasmModules[moduleKey]) {
        return await calculateHashWasm(buffer, algorithm);
      }
    } catch (error) {
      console.warn('WebAssembly哈希计算失败，回退到JS实现:', error);
      // 回退到JS实现
    }
  }
  
  // 处理MD5
  if (algorithm.toLowerCase() === 'md5') {
    const md5 = new MD5();
    md5.update(buffer);
    const digest = md5.finalize();
    return arrayBufferToHex(digest.buffer);
  }
  
  // 使用 Web Crypto API 计算其他哈希
  if (crypto && crypto.subtle) {
    let hashAlgorithm: AlgorithmIdentifier;
    
    switch (algorithm.toLowerCase()) {
      case 'sha1':
        hashAlgorithm = 'SHA-1';
        break;
      case 'sha256':
        hashAlgorithm = 'SHA-256';
        break;
      case 'sha384':
        hashAlgorithm = 'SHA-384';
        break;
      case 'sha512':
        hashAlgorithm = 'SHA-512';
        break;
      default:
        // 不支持的算法，降级到SHA-256
        hashAlgorithm = 'SHA-256';
        break;
    }
    
    const hashBuffer = await crypto.subtle.digest(hashAlgorithm, buffer);
    return arrayBufferToHex(hashBuffer);
  } else {
    // 如果不支持 Web Crypto API，使用简单哈希算法
    return simpleBufferHash(buffer);
  }
}

/**
 * 对缓冲区进行简单哈希计算
 * @param buffer 数据缓冲区
 * @returns 哈希值
 */
function simpleBufferHash(buffer: ArrayBuffer): string {
  const view = new DataView(buffer);
  let hash = 0;
  
  // 采样计算哈希，避免计算太多数据
  const step = Math.max(1, Math.floor(buffer.byteLength / 1024));
  
  for (let i = 0; i < buffer.byteLength; i += step) {
    if (i + 4 <= buffer.byteLength) {
      const value = view.getUint32(i, true);
      hash = ((hash << 5) - hash) + value;
    } else if (i < buffer.byteLength) {
      const value = view.getUint8(i);
      hash = ((hash << 5) - hash) + value;
    }
    hash = hash & hash; // 转换为32位整数
  }
  
  return hash.toString(16).padStart(8, '0');
}

/**
 * 合并两个ArrayBuffer
 * @param buffer1 第一个缓冲区
 * @param buffer2 第二个缓冲区
 * @returns 合并后的缓冲区
 */
function concatenateArrayBuffers(buffer1: ArrayBuffer, buffer2: ArrayBuffer): ArrayBuffer {
  const result = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  result.set(new Uint8Array(buffer1), 0);
  result.set(new Uint8Array(buffer2), buffer1.byteLength);
  return result.buffer;
}

/**
 * 将ArrayBuffer转换为十六进制字符串
 * @param buffer ArrayBuffer数据
 * @returns 十六进制字符串
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    const value = view[i].toString(16);
    hex += value.length === 1 ? '0' + value : value;
  }
  return hex;
}

// 向主线程发送就绪消息
ctx.postMessage({ status: 'ready' }); 