import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { TestFileGenerator } from '../setup';
import { UploaderCore } from '../../src/core/UploaderCore';
import { ResumePlugin } from '../../src/plugins/ResumePlugin';
import { EventBus } from '../../src/core/EventBus';

// 模拟React上传组件
// 这个组件将在测试中被渲染，以便测试上传功能
const FileUploader = ({ uploader }: { uploader: UploaderCore }) => {
  const [files, setFiles] = React.useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<
    Record<string, number>
  >({});
  const [uploadStatus, setUploadStatus] = React.useState<
    Record<string, string>
  >({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // 注册事件监听器
    const progressHandler = (event: any) => {
      const { fileId, progress } = event.data;
      setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
    };

    const statusHandler = (event: any) => {
      const { fileId, status } = event.data;
      setUploadStatus(prev => ({ ...prev, [fileId]: status }));
    };

    const fileAddedHandler = (event: any) => {
      const { file } = event.data;
      setFiles(prev => [...prev, file]);
    };

    // 监听上传事件
    uploader.on('progress', progressHandler);
    uploader.on('statusChange', statusHandler);
    uploader.on('fileAdded', fileAddedHandler);

    return () => {
      // 清理事件监听器
      uploader.off('progress', progressHandler);
      uploader.off('statusChange', statusHandler);
      uploader.off('fileAdded', fileAddedHandler);
    };
  }, [uploader]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      // 添加文件到上传器
      Array.from(selectedFiles).forEach(file => {
        uploader.addFile(file);
      });
    }
  };

  const handleStartUpload = () => {
    uploader.startUpload();
  };

  const handlePauseFile = (fileId: string) => {
    uploader.pauseFile(fileId);
  };

  const handleResumeFile = (fileId: string) => {
    uploader.resumeFile(fileId);
  };

  const handleCancelFile = (fileId: string) => {
    uploader.cancelFile(fileId);
    setFiles(files.filter(file => file.id !== fileId));
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        data-testid="file-input"
      />
      <button onClick={handleStartUpload} data-testid="start-upload-btn">
        开始上传
      </button>

      <div data-testid="file-list">
        {files.map(file => (
          <div key={file.id} data-testid={`file-item-${file.id}`}>
            <span data-testid={`file-name-${file.id}`}>{file.name}</span>
            <div data-testid={`progress-${file.id}`}>
              {uploadProgress[file.id]
                ? `${Math.round(uploadProgress[file.id] * 100)}%`
                : '0%'}
            </div>
            <div data-testid={`status-${file.id}`}>
              {uploadStatus[file.id] || 'pending'}
            </div>
            <button
              onClick={() => handlePauseFile(file.id)}
              data-testid={`pause-btn-${file.id}`}
            >
              暂停
            </button>
            <button
              onClick={() => handleResumeFile(file.id)}
              data-testid={`resume-btn-${file.id}`}
            >
              恢复
            </button>
            <button
              onClick={() => handleCancelFile(file.id)}
              data-testid={`cancel-btn-${file.id}`}
            >
              取消
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// 模拟UploaderCore
vi.mock('../../src/core/UploaderCore', () => {
  return {
    UploaderCore: vi.fn().mockImplementation(() => {
      const eventBus = new EventBus();
      const files = new Map();
      let isUploading = false;
      const uploadPromises = new Map();

      return {
        addFile: vi.fn(file => {
          const fileId = `file-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const fileInfo = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            file: file,
            status: 'pending',
            progress: 0,
          };
          files.set(fileId, fileInfo);

          eventBus.emit('fileAdded', { file: fileInfo });
          return fileId;
        }),

        startUpload: vi.fn(() => {
          isUploading = true;

          files.forEach((fileInfo, fileId) => {
            if (fileInfo.status !== 'pending') return;

            fileInfo.status = 'uploading';
            eventBus.emit('statusChange', { fileId, status: 'uploading' });

            // 模拟上传进度
            let progress = 0;
            const intervalId = setInterval(() => {
              progress += 0.1;
              if (progress >= 1) {
                clearInterval(intervalId);
                fileInfo.status = 'completed';
                fileInfo.progress = 1;
                eventBus.emit('progress', { fileId, progress: 1 });
                eventBus.emit('statusChange', { fileId, status: 'completed' });
                eventBus.emit('fileUploaded', { fileId });
                return;
              }

              if (fileInfo.status === 'paused') {
                clearInterval(intervalId);
                return;
              }

              fileInfo.progress = progress;
              eventBus.emit('progress', { fileId, progress });
            }, 100);

            uploadPromises.set(fileId, { intervalId });
          });

          return Promise.resolve();
        }),

        pauseFile: vi.fn(fileId => {
          const fileInfo = files.get(fileId);
          if (!fileInfo) return;

          fileInfo.status = 'paused';
          eventBus.emit('statusChange', { fileId, status: 'paused' });

          const uploadInfo = uploadPromises.get(fileId);
          if (uploadInfo && uploadInfo.intervalId) {
            clearInterval(uploadInfo.intervalId);
          }
        }),

        resumeFile: vi.fn(fileId => {
          const fileInfo = files.get(fileId);
          if (!fileInfo || fileInfo.status !== 'paused') return;

          fileInfo.status = 'uploading';
          eventBus.emit('statusChange', { fileId, status: 'uploading' });

          // 继续模拟上传进度
          let progress = fileInfo.progress;
          const intervalId = setInterval(() => {
            progress += 0.1;
            if (progress >= 1) {
              clearInterval(intervalId);
              fileInfo.status = 'completed';
              fileInfo.progress = 1;
              eventBus.emit('progress', { fileId, progress: 1 });
              eventBus.emit('statusChange', { fileId, status: 'completed' });
              eventBus.emit('fileUploaded', { fileId });
              return;
            }

            if (fileInfo.status === 'paused') {
              clearInterval(intervalId);
              return;
            }

            fileInfo.progress = progress;
            eventBus.emit('progress', { fileId, progress });
          }, 100);

          uploadPromises.set(fileId, { intervalId });
        }),

        cancelFile: vi.fn(fileId => {
          const fileInfo = files.get(fileId);
          if (!fileInfo) return;

          const uploadInfo = uploadPromises.get(fileId);
          if (uploadInfo && uploadInfo.intervalId) {
            clearInterval(uploadInfo.intervalId);
          }

          files.delete(fileId);
          uploadPromises.delete(fileId);
          eventBus.emit('fileCancelled', { fileId });
        }),

        on: vi.fn((event, handler) => {
          eventBus.on(event, handler);
        }),

        off: vi.fn((event, handler) => {
          eventBus.off(event, handler);
        }),

        // 插件相关方法
        registerPlugin: vi.fn(),
        use: vi.fn(),

        // 获取上传状态
        getFile: vi.fn(fileId => files.get(fileId)),
        getFiles: vi.fn(() => Array.from(files.values())),
        isUploading: vi.fn(() => isUploading),
      };
    }),
  };
});

describe('React 集成测试', () => {
  let uploader: UploaderCore;
  let testFile: File;

  beforeEach(() => {
    // 创建上传器实例
    uploader = new UploaderCore();

    // 添加断点续传插件
    const resumePlugin = new ResumePlugin({
      storage: { engine: 'memory' },
    });
    uploader.use(resumePlugin);

    // 创建测试文件
    testFile = TestFileGenerator.createTextFile(1024 * 1024, 'test.txt');

    // 重置模拟
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该渲染上传组件并显示文件列表', async () => {
    // 渲染组件
    render(<FileUploader uploader={uploader} />);

    // 验证文件输入框和上传按钮存在
    expect(screen.getByTestId('file-input')).toBeInTheDocument();
    expect(screen.getByTestId('start-upload-btn')).toBeInTheDocument();

    // 模拟文件选择
    const fileInput = screen.getByTestId('file-input');

    // 设置选择的文件并触发change事件
    // 注意：jsdom环境中无法直接操作File对象，所以这里模拟onChange事件
    fireEvent.change(fileInput, {
      target: { files: [testFile] },
    });

    // 等待文件添加到列表中
    await waitFor(() => {
      expect(uploader.addFile).toHaveBeenCalledWith(testFile);
    });

    // 由于模拟的文件ID是动态生成的，我们需要找到文件列表项
    // 等待文件列表更新
    await waitFor(() => {
      const fileItems = screen.getAllByTestId(/^file-item-/);
      expect(fileItems.length).toBeGreaterThan(0);
    });
  });

  it('应该开始、暂停和恢复上传', async () => {
    // 渲染组件
    render(<FileUploader uploader={uploader} />);

    // 添加文件
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [testFile] },
    });

    // 等待文件添加
    await waitFor(() => {
      const fileItems = screen.getAllByTestId(/^file-item-/);
      expect(fileItems.length).toBeGreaterThan(0);
    });

    // 开始上传
    fireEvent.click(screen.getByTestId('start-upload-btn'));
    expect(uploader.startUpload).toHaveBeenCalled();

    // 等待状态变为 "uploading"
    await waitFor(() => {
      const statusElements = screen.getAllByTestId(/^status-/);
      expect(statusElements[0]).toHaveTextContent('uploading');
    });

    // 获取暂停按钮
    const pauseButton = screen.getByTestId(/^pause-btn-/);
    expect(pauseButton).toBeInTheDocument();

    // 点击暂停按钮
    fireEvent.click(pauseButton);

    // 等待状态变为 "paused"
    await waitFor(() => {
      const statusElements = screen.getAllByTestId(/^status-/);
      expect(statusElements[0]).toHaveTextContent('paused');
    });

    // 获取恢复按钮
    const resumeButton = screen.getByTestId(/^resume-btn-/);
    expect(resumeButton).toBeInTheDocument();

    // 点击恢复按钮
    fireEvent.click(resumeButton);

    // 等待状态再次变为 "uploading"
    await waitFor(() => {
      const statusElements = screen.getAllByTestId(/^status-/);
      expect(statusElements[0]).toHaveTextContent('uploading');
    });
  });

  it('应该取消上传并从列表中移除文件', async () => {
    // 渲染组件
    render(<FileUploader uploader={uploader} />);

    // 添加文件
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [testFile] },
    });

    // 等待文件添加
    await waitFor(() => {
      const fileItems = screen.getAllByTestId(/^file-item-/);
      expect(fileItems.length).toBeGreaterThan(0);
    });

    // 开始上传
    fireEvent.click(screen.getByTestId('start-upload-btn'));
    expect(uploader.startUpload).toHaveBeenCalled();

    // 获取文件项数量
    const fileItemsBefore = screen.getAllByTestId(/^file-item-/);
    const fileCountBefore = fileItemsBefore.length;

    // 获取取消按钮
    const cancelButton = screen.getByTestId(/^cancel-btn-/);
    expect(cancelButton).toBeInTheDocument();

    // 点击取消按钮
    fireEvent.click(cancelButton);

    // 验证取消方法被调用
    expect(uploader.cancelFile).toHaveBeenCalled();

    // 等待文件从列表中移除
    // 如果只有一个文件，则列表应为空
    if (fileCountBefore === 1) {
      await waitFor(() => {
        expect(screen.queryAllByTestId(/^file-item-/)).toHaveLength(0);
      });
    } else {
      // 如果有多个文件，则列表长度应减少1
      await waitFor(() => {
        const fileItemsAfter = screen.queryAllByTestId(/^file-item-/);
        expect(fileItemsAfter.length).toBe(fileCountBefore - 1);
      });
    }
  });

  it('应该正确显示上传进度', async () => {
    // 设置长一点的超时时间，因为需要等待进度更新
    vi.useFakeTimers();

    // 渲染组件
    render(<FileUploader uploader={uploader} />);

    // 添加文件
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [testFile] },
    });

    // 等待文件添加
    await waitFor(() => {
      const fileItems = screen.getAllByTestId(/^file-item-/);
      expect(fileItems.length).toBeGreaterThan(0);
    });

    // 开始上传
    fireEvent.click(screen.getByTestId('start-upload-btn'));

    // 初始进度应为0%
    const progressElement = screen.getByTestId(/^progress-/);
    expect(progressElement).toHaveTextContent('0%');

    // 前进时间以便模拟进度更新
    await vi.advanceTimersByTimeAsync(150);

    // 进度应更新为10%
    await waitFor(() => {
      expect(screen.getByTestId(/^progress-/)).toHaveTextContent('10%');
    });

    // 再前进时间
    await vi.advanceTimersByTimeAsync(300);

    // 进度应更新为30%
    await waitFor(() => {
      expect(screen.getByTestId(/^progress-/)).toHaveTextContent('30%');
    });

    // 恢复真实计时器
    vi.useRealTimers();
  });
});
