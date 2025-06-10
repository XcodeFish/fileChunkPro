/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WebAssemblyAccelerator单元测试
 */

import { WebAssemblyAccelerator } from '../../src/utils/WebAssemblyAccelerator';
import { WasmHashAlgorithm, WasmModuleType } from '../../src/types';

describe('WebAssemblyAccelerator', () => {
  let accelerator: WebAssemblyAccelerator;

  beforeEach(() => {
    // 每个测试之前创建新的实例
    accelerator = new WebAssemblyAccelerator({
      baseUrl: '/dist/wasm/',
      fallbackToJS: true,
    });
  });

  afterEach(() => {
    // 每个测试之后释放资源
    accelerator.dispose();
  });

  test('应该正确检测WebAssembly支持', () => {
    const isSupported = accelerator.isWasmSupported();
    expect(typeof isSupported).toBe('boolean');
  });

  test('应该能够加载MD5模块', async () => {
    const module = await accelerator.loadModule(WasmModuleType.MD5);

    if (accelerator.isWasmSupported()) {
      expect(module).not.toBeNull();
    } else {
      expect(module).toBeNull();
    }
  });

  test('应该能够计算MD5哈希', async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = await accelerator.calculateHash(
      testData,
      WasmHashAlgorithm.MD5
    );

    // MD5哈希值应该是一个32字符的十六进制字符串
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  test('应该能够处理二进制数据', async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const chunkSize = 2;
    const index = 0;

    const result = await accelerator.processChunk(testData, chunkSize, index);

    // 第一个分片应该包含2个字节
    expect(result.byteLength).toBe(chunkSize);
  });

  test('计算性能基准', async () => {
    const testData = new Uint8Array(
      new Array(1024).fill(0).map((_, i) => i % 256)
    );

    // 运行MD5基准测试
    const benchmark = await accelerator['runBenchmark'](WasmModuleType.MD5);

    if (accelerator.isWasmSupported()) {
      expect(benchmark).not.toBeNull();
      if (benchmark) {
        expect(benchmark.type).toBe(WasmModuleType.MD5);
        expect(benchmark.wasmTime).toBeGreaterThan(0);
        expect(benchmark.jsTime).toBeGreaterThan(0);
      }
    } else {
      expect(benchmark).toBeNull();
    }
  });

  test('应该在WebAssembly不可用时回退到JavaScript', async () => {
    // 创建一个不使用WebAssembly的加速器
    const jsAccelerator = new WebAssemblyAccelerator({
      enabled: false,
      fallbackToJS: true,
    });

    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = await jsAccelerator.calculateHash(
      testData,
      WasmHashAlgorithm.MD5
    );

    // 即使禁用了WebAssembly，也应该能够计算哈希
    expect(hash).toMatch(/^[0-9a-f]{32}$/);

    jsAccelerator.dispose();
  });
});
