/**
 * WasmPlugin单元测试
 */

import { WasmPlugin } from '../../src/plugins/WasmPlugin';
import { UploaderCore } from '../../src/core/UploaderCore';

// 模拟UploaderCore
jest.mock('../../src/core/UploaderCore', () => {
  return {
    UploaderCore: jest.fn().mockImplementation(() => {
      return {
        hooks: {
          beforeFileProcess: {
            tap: jest.fn(),
          },
          measurePerformance: {
            tap: jest.fn(),
          },
        },
        getWorkerManager: jest.fn().mockReturnValue({
          getWorker: jest.fn().mockReturnValue({
            postMessage: jest.fn(),
          }),
        }),
      };
    }),
  };
});

describe('WasmPlugin', () => {
  let plugin: WasmPlugin;
  let uploader: UploaderCore;

  beforeEach(() => {
    // 每个测试之前创建新的实例
    plugin = new WasmPlugin({
      baseUrl: '/dist/wasm/',
      fallbackToJS: true,
    });
    uploader = new UploaderCore();
  });

  test('应该正确初始化插件', () => {
    expect(plugin).toBeInstanceOf(WasmPlugin);
    expect(plugin.version).toBeDefined();
  });

  test('应该正确安装插件', () => {
    plugin.install(uploader);

    expect(uploader.hooks.beforeFileProcess.tap).toHaveBeenCalled();
    expect(uploader.hooks.measurePerformance.tap).toHaveBeenCalled();
    expect(uploader.getWorkerManager).toHaveBeenCalled();
  });

  test('应该能够检测WebAssembly支持', () => {
    plugin.install(uploader);

    const isSupported = plugin.isWasmSupported();
    expect(typeof isSupported).toBe('boolean');
  });

  test('应该能够获取WebAssembly加速器', () => {
    plugin.install(uploader);

    const accelerator = plugin.getAccelerator();
    expect(accelerator).toBeDefined();
  });

  test('应该能够释放资源', () => {
    plugin.install(uploader);

    expect(() => {
      plugin.dispose();
    }).not.toThrow();
  });
});
