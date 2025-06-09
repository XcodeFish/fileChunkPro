/* eslint-disable no-console */
/**
 * StandardSecurityExample
 * 演示如何使用标准安全级别插件
 */

import UploaderCore from '../core/UploaderCore';
import { StandardSecurityPlugin } from '../plugins/security/StandardSecurityPlugin';
import { SecurityLevel } from '../types';
import { CSRFProtection, IntegrityCheck, SecurityUtils } from '../utils';

// 创建CSRFProtection实例并配置
const csrfProtection = CSRFProtection.getInstance({
  tokenUrl: '/api/csrf-token',
  headerName: 'X-CSRF-Token',
  tokenLifetime: 30 * 60 * 1000, // 30分钟
  includeCredentials: true,
  autoRefresh: true,
});

/**
 * 创建带有标准安全级别的上传器实例
 */
async function createSecureUploader() {
  // 创建上传器实例
  const uploader = new UploaderCore({
    endpoint: 'https://api.example.com/upload',
    chunkSize: 2 * 1024 * 1024, // 2MB
    concurrency: 3,
    timeout: 30000,
    retryCount: 3,
    securityLevel: SecurityLevel.STANDARD, // 设置安全级别为标准
  });

  // 创建标准安全插件实例
  const standardSecurityPlugin = new StandardSecurityPlugin({
    // 允许的文件类型
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'text/plain',
    ],
    // 最大文件大小（50MB）
    maxFileSize: 50 * 1024 * 1024,
    // 启用传输加密
    enableTransportEncryption: true,
    encryptionAlgorithm: 'AES-GCM',
    encryptionKeyLength: 256,
    // 启用完整性校验
    enableIntegrityCheck: true,
    integrityAlgorithm: 'SHA-256',
    // 启用CSRF防护
    enableCSRFProtection: true,
    csrfTokenUrl: '/api/csrf-token',
    csrfTokenHeaderName: 'X-CSRF-Token',
    // 启用深度内容验证
    enableDeepContentValidation: true,
    // 验证分片完整性
    validateChunkIntegrity: true,
  });

  // 注册标准安全插件
  uploader.use(standardSecurityPlugin);

  return uploader;
}

/**
 * 示例：使用标准安全级别上传文件
 */
async function uploadFileWithStandardSecurity(file: File) {
  try {
    console.log('创建标准安全级别上传器...');
    const uploader = await createSecureUploader();

    console.log('计算文件完整性校验值...');
    const integrityResult = await IntegrityCheck.calculateChecksum(file, {
      algorithm: 'SHA-256',
      useWorker: true,
    });
    console.log('文件完整性校验值:', integrityResult.checksum);

    console.log('开始上传文件...');
    const result = await uploader.upload(file, {
      onProgress: progress => {
        console.log(`上传进度: ${Math.round(progress.percent)}%`);
      },
      onError: error => {
        console.error('上传错误:', error);
      },
      metadata: {
        // 添加完整性校验信息
        integrity: `sha256-${integrityResult.checksum}`,
        // 添加其他元数据
        filename: file.name,
        contentType: file.type,
        size: file.size,
      },
    });

    console.log('上传完成:', result);
    return result;
  } catch (error) {
    console.error('安全上传失败:', error);
    throw error;
  }
}

/**
 * 示例：演示传输加密
 */
async function demonstrateTransportEncryption() {
  // 生成加密密钥
  const key = await SecurityUtils.generateEncryptionKey('AES-GCM', 256);

  // 要加密的数据
  const data = new TextEncoder().encode('这是要加密的敏感数据');

  // 加密数据
  console.log('加密数据...');
  const encryptedResult = await SecurityUtils.encryptData(data.buffer, key);
  console.log('加密结果:', {
    encryptedDataSize: encryptedResult.data.byteLength,
    algorithm: encryptedResult.algorithm,
    ivSize: encryptedResult.iv.byteLength,
  });

  // 解密数据
  console.log('解密数据...');
  const decryptedBuffer = await SecurityUtils.decryptData(
    encryptedResult.data,
    key,
    encryptedResult.iv,
    encryptedResult.algorithm
  );

  // 验证解密结果
  const decryptedText = new TextDecoder().decode(decryptedBuffer);
  console.log('解密结果:', decryptedText);

  return {
    originalText: '这是要加密的敏感数据',
    decryptedText,
    success: decryptedText === '这是要加密的敏感数据',
  };
}

/**
 * 示例：演示CSRF防护
 */
async function demonstrateCSRFProtection() {
  // 获取CSRF令牌
  console.log('获取CSRF令牌...');
  const token = await csrfProtection.getToken();
  console.log('CSRF令牌:', token);

  // 获取包含CSRF令牌的请求头
  const headers = await csrfProtection.getCSRFHeader();
  console.log('CSRF请求头:', headers);

  // 将CSRF令牌添加到现有请求头
  const existingHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const combinedHeaders = await csrfProtection.appendToHeaders(existingHeaders);
  console.log('合并后的请求头:', combinedHeaders);

  return {
    token,
    headers: combinedHeaders,
  };
}

/**
 * 示例：演示文件完整性校验
 */
async function demonstrateIntegrityCheck(file: File) {
  console.log('计算文件完整性校验值...');

  // 使用不同算法计算校验值
  const algorithms: ('SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512')[] = [
    'SHA-1',
    'SHA-256',
    'SHA-384',
    'SHA-512',
  ];
  const results: Record<string, string> = {};

  for (const algorithm of algorithms) {
    console.log(`使用 ${algorithm} 算法计算...`);
    const startTime = Date.now();

    const result = await IntegrityCheck.calculateChecksum(file, {
      algorithm,
      useWorker: true,
    });

    const duration = Date.now() - startTime;
    results[algorithm] = result.checksum;
    console.log(`${algorithm}: ${result.checksum} (耗时: ${duration}ms)`);
  }

  // 创建标准完整性校验字符串
  const integrityInfo = await IntegrityCheck.createIntegrityInfo(file, {
    algorithm: 'SHA-256',
  });

  console.log('标准完整性校验信息:', integrityInfo);

  return {
    checksums: results,
    integrityString: integrityInfo.integrity,
  };
}

// 导出示例函数
export {
  createSecureUploader,
  uploadFileWithStandardSecurity,
  demonstrateTransportEncryption,
  demonstrateCSRFProtection,
  demonstrateIntegrityCheck,
};
