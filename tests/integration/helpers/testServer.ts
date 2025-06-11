/**
 * 集成测试服务器模拟
 * 用于模拟各种网络情况和服务器响应
 */
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { nanoid } from 'nanoid';

// 默认服务器状态
interface ServerState {
  files: Record<
    string,
    {
      chunks: Record<
        string,
        {
          data: Uint8Array;
          uploadedAt: number;
        }
      >;
      fileInfo: {
        name: string;
        size: number;
        type: string;
        lastModified: number;
      };
      status: 'uploading' | 'completed' | 'failed';
      uploadedChunks: number;
      totalChunks: number;
    }
  >;
  tokens: Record<
    string,
    {
      fileId: string;
      expiresAt: number;
    }
  >;
  serverConfig: {
    maxFileSize: number;
    maxChunkSize: number;
    supportedTypes: string[];
    concurrencyLimit: number;
  };
}

// 默认配置
const DEFAULT_CONFIG = {
  maxFileSize: 1024 * 1024 * 1024, // 1GB
  maxChunkSize: 10 * 1024 * 1024, // 10MB
  supportedTypes: ['*/*'],
  concurrencyLimit: 3,
};

/**
 * 创建测试服务器
 */
export function createTestServer(options: {
  networkLatency?: number;
  errorRate?: number;
  failedChunks?: number[];
  initialState?: Partial<ServerState>;
  uploadPath?: string;
}) {
  const {
    networkLatency = 50,
    errorRate = 0,
    failedChunks = [],
    initialState = {},
    uploadPath = '/upload',
  } = options;

  // 服务器状态
  const serverState: ServerState = {
    files: {},
    tokens: {},
    serverConfig: DEFAULT_CONFIG,
    ...initialState,
  };

  // 创建MSW服务器
  const server = setupServer(
    // 获取上传配置
    rest.get('/upload/config', (req, res, ctx) => {
      return res(
        ctx.delay(networkLatency),
        ctx.json({
          success: true,
          config: serverState.serverConfig,
        })
      );
    }),

    // 初始化上传
    rest.post('/upload/initialize', (req, res, ctx) => {
      // 随机错误
      if (Math.random() < errorRate) {
        return res(
          ctx.delay(networkLatency),
          ctx.status(500),
          ctx.json({
            success: false,
            error: 'Server error',
          })
        );
      }

      // 生成文件ID
      const fileId = nanoid();
      const token = nanoid();

      // 获取请求体
      const body = req.body as any;

      // 保存文件信息
      serverState.files[fileId] = {
        chunks: {},
        fileInfo: {
          name: body.fileName,
          size: body.fileSize,
          type: body.fileType,
          lastModified: body.lastModified,
        },
        status: 'uploading',
        uploadedChunks: 0,
        totalChunks: body.totalChunks,
      };

      // 保存token
      serverState.tokens[token] = {
        fileId,
        expiresAt: Date.now() + 1000 * 60 * 60, // 1小时过期
      };

      return res(
        ctx.delay(networkLatency),
        ctx.json({
          success: true,
          fileId,
          token,
          uploadUrls: Array.from({ length: body.totalChunks }, (_, i) => ({
            chunkIndex: i,
            url: `${uploadPath}/chunks/${fileId}/${i}`,
          })),
        })
      );
    }),

    // 上传分片
    rest.put(
      `${uploadPath}/chunks/:fileId/:chunkIndex`,
      async (req, res, ctx) => {
        const { fileId, chunkIndex } = req.params;
        const chunkIdxNum = parseInt(chunkIndex as string, 10);

        // 检查token
        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (
          !token ||
          !serverState.tokens[token] ||
          serverState.tokens[token].fileId !== fileId
        ) {
          return res(
            ctx.delay(networkLatency),
            ctx.status(401),
            ctx.json({
              success: false,
              error: 'Invalid token',
            })
          );
        }

        // 模拟特定分片失败
        if (failedChunks.includes(chunkIdxNum)) {
          return res(
            ctx.delay(networkLatency),
            ctx.status(500),
            ctx.json({
              success: false,
              error: `Chunk ${chunkIndex} failed`,
            })
          );
        }

        // 随机错误
        if (Math.random() < errorRate) {
          return res(
            ctx.delay(networkLatency),
            ctx.status(500),
            ctx.json({
              success: false,
              error: 'Server error',
            })
          );
        }

        // 读取分片数据
        const arrayBuffer = await req.arrayBuffer();
        const chunk = new Uint8Array(arrayBuffer);

        // 保存分片
        const file = serverState.files[fileId as string];
        if (file) {
          file.chunks[chunkIdxNum] = {
            data: chunk,
            uploadedAt: Date.now(),
          };
          file.uploadedChunks += 1;

          // 检查是否全部上传完成
          if (file.uploadedChunks === file.totalChunks) {
            file.status = 'completed';
          }

          return res(
            ctx.delay(networkLatency),
            ctx.json({
              success: true,
              chunkIndex: chunkIdxNum,
              received: chunk.length,
            })
          );
        }

        return res(
          ctx.delay(networkLatency),
          ctx.status(404),
          ctx.json({
            success: false,
            error: 'File not found',
          })
        );
      }
    ),

    // 完成上传
    rest.post('/upload/complete', (req, res, ctx) => {
      // 获取请求体
      const body = req.body as any;
      const { fileId, token } = body;

      // 验证token
      if (
        !token ||
        !serverState.tokens[token] ||
        serverState.tokens[token].fileId !== fileId
      ) {
        return res(
          ctx.delay(networkLatency),
          ctx.status(401),
          ctx.json({
            success: false,
            error: 'Invalid token',
          })
        );
      }

      const file = serverState.files[fileId];
      if (!file) {
        return res(
          ctx.delay(networkLatency),
          ctx.status(404),
          ctx.json({
            success: false,
            error: 'File not found',
          })
        );
      }

      // 检查所有分片是否都已上传
      if (file.uploadedChunks !== file.totalChunks) {
        return res(
          ctx.delay(networkLatency),
          ctx.status(400),
          ctx.json({
            success: false,
            error: 'Not all chunks uploaded',
            uploaded: file.uploadedChunks,
            total: file.totalChunks,
          })
        );
      }

      // 标记为完成
      file.status = 'completed';

      return res(
        ctx.delay(networkLatency),
        ctx.json({
          success: true,
          fileId,
          url: `/files/${fileId}`,
          fileName: file.fileInfo.name,
        })
      );
    }),

    // 查询上传状态
    rest.get('/upload/status/:fileId', (req, res, ctx) => {
      const { fileId } = req.params;

      // 检查token
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (
        !token ||
        !serverState.tokens[token] ||
        serverState.tokens[token].fileId !== fileId
      ) {
        return res(
          ctx.delay(networkLatency),
          ctx.status(401),
          ctx.json({
            success: false,
            error: 'Invalid token',
          })
        );
      }

      const file = serverState.files[fileId as string];
      if (!file) {
        return res(
          ctx.delay(networkLatency),
          ctx.status(404),
          ctx.json({
            success: false,
            error: 'File not found',
          })
        );
      }

      return res(
        ctx.delay(networkLatency),
        ctx.json({
          success: true,
          status: file.status,
          uploadedChunks: file.uploadedChunks,
          totalChunks: file.totalChunks,
          progress: file.uploadedChunks / file.totalChunks,
        })
      );
    })
  );

  // 添加服务器控制方法
  return {
    server,
    // 获取服务器状态
    getState: () => ({ ...serverState }),
    // 修改状态
    setState: (newState: Partial<ServerState>) => {
      Object.assign(serverState, newState);
    },
    // 模拟网络中断
    simulateNetworkFailure: (duration: number) => {
      server.use(
        rest.all('*', (req, res, ctx) => {
          return res(ctx.status(0));
        })
      );

      setTimeout(() => {
        server.resetHandlers();
      }, duration);
    },
    // 更改服务器配置
    updateConfig: (config: Partial<typeof DEFAULT_CONFIG>) => {
      Object.assign(serverState.serverConfig, config);
    },
    // 模拟特定文件上传完成
    completeFile: (fileId: string) => {
      const file = serverState.files[fileId];
      if (file) {
        file.status = 'completed';
        file.uploadedChunks = file.totalChunks;
      }
    },
  };
}
