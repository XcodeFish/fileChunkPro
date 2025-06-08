import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { UploadError } from '../../../src/core/ErrorCenter';
import { UploaderCore } from '../../../src/core/UploaderCore';

// 模拟文件对象
const createMockFile = (name: string, size: number, type: string) => {
  return {
    name,
    size,
    type,
    slice: vi.fn((start, end) => ({
      size: end - start,
    })),
  };
};

describe('UploaderCore', () => {
  let uploader: UploaderCore;

  beforeEach(() => {
    uploader = new UploaderCore({
      endpoint: 'https://example.com/upload',
      chunkSize: 1024 * 1024, // 1MB
      concurrency: 3,
      timeout: 5000,
    });
  });

  afterEach(() => {
    uploader.dispose();
    vi.clearAllMocks();
  });

  it('should create an instance with default options', () => {
    expect(uploader).toBeInstanceOf(UploaderCore);
  });

  it('should throw error when endpoint is not provided', () => {
    expect(() => new UploaderCore({} as any)).toThrow(UploadError);
  });

  it('should register and call event handlers', () => {
    const mockHandler = vi.fn();
    uploader.on('test', mockHandler);
    uploader.emit('test', { data: 'test' });

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { data: 'test' },
      })
    );
  });

  it('should register and use plugins', () => {
    const mockPlugin = {
      install: vi.fn(),
    };

    uploader.registerPlugin('testPlugin', mockPlugin);

    expect(mockPlugin.install).toHaveBeenCalledWith(uploader);
  });

  it('should cancel upload', async () => {
    const cancelSpy = vi.spyOn(uploader, 'cancel');
    const emitSpy = vi.spyOn(uploader, 'emit');

    // 模拟上传过程
    const uploadPromise = uploader
      .upload(createMockFile('test.txt', 1024 * 1024, 'text/plain'))
      .catch(e => e); // 捕获取消错误

    // 立即取消
    uploader.cancel();

    const result = await uploadPromise;

    expect(cancelSpy).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('cancel', expect.anything());
    expect(result).toBeInstanceOf(UploadError);
  });
});
