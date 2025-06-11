/**
 * SecurityConfigValidator
 * 安全配置验证器，验证不同安全级别的配置选项有效性
 */

import { BasicSecurityPluginOptions } from '../BasicSecurityPlugin';
import { StandardSecurityPluginOptions } from '../StandardSecurityPlugin';
import { AdvancedSecurityPluginOptions } from '../AdvancedSecurityPlugin';

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /**
   * 是否验证通过
   */
  valid: boolean;

  /**
   * 问题列表
   */
  issues: ValidationIssue[];
}

/**
 * 验证问题接口
 */
export interface ValidationIssue {
  /**
   * 问题字段
   */
  field: string;

  /**
   * 问题描述
   */
  message: string;

  /**
   * 问题严重程度
   */
  severity: 'warning' | 'error';

  /**
   * 建议修复方案
   */
  suggestion?: string;
}

/**
 * 安全配置验证器
 */
export default class SecurityConfigValidator {
  /**
   * 验证基础安全配置
   * @param options 基础安全配置选项
   */
  public validateBasicConfig(
    options?: BasicSecurityPluginOptions
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    // 跳过空配置验证
    if (!options) {
      return { valid: true, issues: [] };
    }

    // 验证最大文件大小
    if (options.maxFileSize !== undefined) {
      if (options.maxFileSize <= 0) {
        issues.push({
          field: 'maxFileSize',
          message: '最大文件大小必须大于0',
          severity: 'error',
          suggestion:
            '设置一个合理的最大文件大小，例如 100 * 1024 * 1024 (100MB)',
        });
      } else if (options.maxFileSize > 2 * 1024 * 1024 * 1024) {
        issues.push({
          field: 'maxFileSize',
          message: '最大文件大小超过2GB可能导致内存问题',
          severity: 'warning',
          suggestion: '考虑使用较小的文件大小限制，或启用分片上传',
        });
      }
    }

    // 验证允许的MIME类型
    if (options.allowedMimeTypes !== undefined) {
      // 检查是否有无效的MIME类型
      const invalidMimeTypes = (options.allowedMimeTypes || []).filter(type => {
        return (
          typeof type !== 'string' || (!type.includes('/') && type !== '*')
        );
      });

      if (invalidMimeTypes.length > 0) {
        issues.push({
          field: 'allowedMimeTypes',
          message: `发现无效的MIME类型: ${invalidMimeTypes.join(', ')}`,
          severity: 'warning',
          suggestion: '确保所有MIME类型格式为 "type/subtype" 或通配符 "*"',
        });
      }
    }

    // 验证最大文件名长度
    if (options.maxFileNameLength !== undefined) {
      if (options.maxFileNameLength < 10) {
        issues.push({
          field: 'maxFileNameLength',
          message: '最大文件名长度过短',
          severity: 'warning',
          suggestion: '建议设置更合理的文件名长度限制，例如255',
        });
      } else if (options.maxFileNameLength > 255) {
        issues.push({
          field: 'maxFileNameLength',
          message: '最大文件名长度超过常见文件系统限制',
          severity: 'warning',
          suggestion: '多数文件系统最大文件名长度为255字符，建议不要超过此值',
        });
      }
    }

    // 验证敏感文件后缀配置
    if (
      options.sensitiveExtensions !== undefined &&
      options.enableSensitiveExtensionCheck
    ) {
      if (options.sensitiveExtensions.length === 0) {
        issues.push({
          field: 'sensitiveExtensions',
          message: '已启用敏感文件后缀检查，但敏感后缀列表为空',
          severity: 'warning',
          suggestion: '添加常见的敏感文件后缀，如exe、bat、php等',
        });
      }
    }

    return {
      valid: issues.filter(issue => issue.severity === 'error').length === 0,
      issues,
    };
  }

  /**
   * 验证标准安全配置
   * @param options 标准安全配置选项
   */
  public validateStandardConfig(
    options?: StandardSecurityPluginOptions
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    // 跳过空配置验证
    if (!options) {
      return { valid: true, issues: [] };
    }

    // 首先验证基础配置部分
    const basicValidation = this.validateBasicConfig(options);
    issues.push(...basicValidation.issues);

    // 验证传输加密配置
    if (options.enableTransportEncryption) {
      // 验证加密算法
      if (options.encryptionAlgorithm) {
        const validAlgorithms = ['AES-GCM', 'AES-CBC', 'AES-CTR'];
        if (!validAlgorithms.includes(options.encryptionAlgorithm)) {
          issues.push({
            field: 'encryptionAlgorithm',
            message: `不支持的加密算法: ${options.encryptionAlgorithm}`,
            severity: 'error',
            suggestion: `使用以下算法之一: ${validAlgorithms.join(', ')}`,
          });
        }
      }

      // 验证加密密钥长度
      if (options.encryptionKeyLength) {
        const validKeyLengths = [128, 192, 256];
        if (!validKeyLengths.includes(options.encryptionKeyLength)) {
          issues.push({
            field: 'encryptionKeyLength',
            message: `无效的加密密钥长度: ${options.encryptionKeyLength}`,
            severity: 'error',
            suggestion: `使用以下密钥长度之一: ${validKeyLengths.join(', ')}`,
          });
        }
      }
    }

    // 验证完整性校验配置
    if (options.enableIntegrityCheck) {
      // 验证完整性算法
      if (options.integrityAlgorithm) {
        const validAlgorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
        if (!validAlgorithms.includes(options.integrityAlgorithm)) {
          issues.push({
            field: 'integrityAlgorithm',
            message: `不支持的完整性校验算法: ${options.integrityAlgorithm}`,
            severity: 'error',
            suggestion: `使用以下算法之一: ${validAlgorithms.join(', ')}`,
          });
        } else if (options.integrityAlgorithm === 'SHA-1') {
          issues.push({
            field: 'integrityAlgorithm',
            message: 'SHA-1算法存在已知安全弱点',
            severity: 'warning',
            suggestion: '建议使用更安全的SHA-256或更高级别算法',
          });
        }
      }
    }

    // 验证CSRF防护配置
    if (options.enableCSRFProtection) {
      // 检查是否配置了令牌URL
      if (!options.csrfTokenUrl) {
        issues.push({
          field: 'csrfTokenUrl',
          message: '启用了CSRF防护，但未配置令牌获取URL',
          severity: 'error',
          suggestion: '配置有效的CSRF令牌获取URL',
        });
      } else {
        try {
          // 验证URL格式
          new URL(options.csrfTokenUrl);
        } catch (e) {
          issues.push({
            field: 'csrfTokenUrl',
            message: `无效的URL格式: ${options.csrfTokenUrl}`,
            severity: 'error',
            suggestion: '提供有效的完整URL，包含协议(http/https)',
          });
        }
      }

      // 检查令牌头名称
      if (!options.csrfTokenHeaderName) {
        issues.push({
          field: 'csrfTokenHeaderName',
          message: '未指定CSRF令牌头名称',
          severity: 'warning',
          suggestion: '建议设置明确的令牌头名称，例如 "X-CSRF-Token"',
        });
      }
    }

    return {
      valid: issues.filter(issue => issue.severity === 'error').length === 0,
      issues,
    };
  }

  /**
   * 验证高级安全配置
   * @param options 高级安全配置选项
   */
  public validateAdvancedConfig(
    options?: AdvancedSecurityPluginOptions
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    // 跳过空配置验证
    if (!options) {
      return { valid: true, issues: [] };
    }

    // 首先验证标准配置部分
    const standardValidation = this.validateStandardConfig(options);
    issues.push(...standardValidation.issues);

    // 验证水印配置
    if (options.enableWatermark) {
      const watermarkOptions = options.watermarkOptions || {};

      // 检查水印文本
      if (!watermarkOptions.text && watermarkOptions.text !== '') {
        issues.push({
          field: 'watermarkOptions.text',
          message: '启用了水印但未设置水印文本',
          severity: 'warning',
          suggestion: '设置有意义的水印文本，例如公司名称或用户ID',
        });
      }

      // 检查透明度
      if (watermarkOptions.opacity !== undefined) {
        if (watermarkOptions.opacity < 0 || watermarkOptions.opacity > 1) {
          issues.push({
            field: 'watermarkOptions.opacity',
            message: `无效的水印透明度: ${watermarkOptions.opacity}`,
            severity: 'warning',
            suggestion: '透明度应在0到1之间',
          });
        }
      }

      // 检查水印位置
      if (watermarkOptions.position !== undefined) {
        const validPositions = [
          'center',
          'topLeft',
          'topRight',
          'bottomLeft',
          'bottomRight',
          'mosaic',
        ];
        if (!validPositions.includes(watermarkOptions.position)) {
          issues.push({
            field: 'watermarkOptions.position',
            message: `无效的水印位置: ${watermarkOptions.position}`,
            severity: 'warning',
            suggestion: `使用有效的位置值: ${validPositions.join(', ')}`,
          });
        }
      }
    }

    // 验证审计日志配置
    if (options.enableAuditLog) {
      const auditOptions = options.auditLogOptions || {};

      // 检查日志级别
      if (auditOptions.level !== undefined) {
        const validLevels = ['info', 'warning', 'error', 'critical'];
        if (!validLevels.includes(auditOptions.level)) {
          issues.push({
            field: 'auditLogOptions.level',
            message: `无效的审计日志级别: ${auditOptions.level}`,
            severity: 'warning',
            suggestion: `使用有效的日志级别: ${validLevels.join(', ')}`,
          });
        }
      }

      // 检查存储类型
      if (auditOptions.storageType !== undefined) {
        const validTypes = ['local', 'remote', 'both'];
        if (!validTypes.includes(auditOptions.storageType)) {
          issues.push({
            field: 'auditLogOptions.storageType',
            message: `无效的审计日志存储类型: ${auditOptions.storageType}`,
            severity: 'warning',
            suggestion: `使用有效的存储类型: ${validTypes.join(', ')}`,
          });
        }
      }

      // 检查远程URL
      if (
        auditOptions.storageType === 'remote' ||
        auditOptions.storageType === 'both'
      ) {
        if (!auditOptions.remoteUrl) {
          issues.push({
            field: 'auditLogOptions.remoteUrl',
            message: '选择了远程审计日志存储，但未提供远程URL',
            severity: 'error',
            suggestion: '提供有效的审计日志远程存储URL',
          });
        } else {
          try {
            // 验证URL格式
            new URL(auditOptions.remoteUrl);
          } catch (e) {
            issues.push({
              field: 'auditLogOptions.remoteUrl',
              message: `无效的URL格式: ${auditOptions.remoteUrl}`,
              severity: 'error',
              suggestion: '提供有效的完整URL，包含协议(http/https)',
            });
          }
        }
      }
    }

    // 验证数字签名配置
    if (options.enableDigitalSignature) {
      const signatureOptions = options.digitalSignatureOptions || {};

      // 检查签名算法
      if (signatureOptions.algorithm !== undefined) {
        const validAlgorithms = ['RSASSA-PKCS1-v1_5', 'RSA-PSS', 'ECDSA'];
        if (!validAlgorithms.includes(signatureOptions.algorithm)) {
          issues.push({
            field: 'digitalSignatureOptions.algorithm',
            message: `不支持的签名算法: ${signatureOptions.algorithm}`,
            severity: 'error',
            suggestion: `使用以下算法之一: ${validAlgorithms.join(', ')}`,
          });
        }
      }

      // 检查密钥长度
      if (signatureOptions.keyLength !== undefined) {
        const validRsaLengths = [1024, 2048, 4096];
        const validEcdsaLengths = [256, 384, 521];

        const algorithm = signatureOptions.algorithm || 'RSASSA-PKCS1-v1_5';
        const validLengths = algorithm.startsWith('RSA')
          ? validRsaLengths
          : validEcdsaLengths;

        if (!validLengths.includes(signatureOptions.keyLength)) {
          issues.push({
            field: 'digitalSignatureOptions.keyLength',
            message: `对于${algorithm}算法，无效的密钥长度: ${signatureOptions.keyLength}`,
            severity: 'error',
            suggestion: `使用以下密钥长度之一: ${validLengths.join(', ')}`,
          });
        } else if (
          algorithm.startsWith('RSA') &&
          signatureOptions.keyLength === 1024
        ) {
          issues.push({
            field: 'digitalSignatureOptions.keyLength',
            message: '1024位RSA密钥长度存在安全风险',
            severity: 'warning',
            suggestion: '建议使用至少2048位的RSA密钥长度',
          });
        }
      }

      // 检查散列算法
      if (signatureOptions.hashAlgorithm !== undefined) {
        const validAlgorithms = ['SHA-256', 'SHA-384', 'SHA-512'];
        if (!validAlgorithms.includes(signatureOptions.hashAlgorithm)) {
          issues.push({
            field: 'digitalSignatureOptions.hashAlgorithm',
            message: `不支持的散列算法: ${signatureOptions.hashAlgorithm}`,
            severity: 'error',
            suggestion: `使用以下算法之一: ${validAlgorithms.join(', ')}`,
          });
        }
      }
    }

    // 验证内容扫描配置
    if (options.enableContentScanning) {
      const scanningOptions = options.contentScanningOptions || {};

      // 检查扫描级别
      if (scanningOptions.scanLevel !== undefined) {
        const validLevels = ['basic', 'standard', 'advanced'];
        if (!validLevels.includes(scanningOptions.scanLevel)) {
          issues.push({
            field: 'contentScanningOptions.scanLevel',
            message: `无效的内容扫描级别: ${scanningOptions.scanLevel}`,
            severity: 'warning',
            suggestion: `使用有效的扫描级别: ${validLevels.join(', ')}`,
          });
        }
      }

      // 检查自定义敏感内容模式
      if (scanningOptions.customSensitivePatterns) {
        if (!Array.isArray(scanningOptions.customSensitivePatterns)) {
          issues.push({
            field: 'contentScanningOptions.customSensitivePatterns',
            message: '自定义敏感内容模式必须是正则表达式数组',
            severity: 'error',
            suggestion: '提供有效的正则表达式数组',
          });
        } else {
          // 检查每个模式是否是有效的正则表达式
          scanningOptions.customSensitivePatterns.forEach((pattern, index) => {
            if (!(pattern instanceof RegExp)) {
              issues.push({
                field: `contentScanningOptions.customSensitivePatterns[${index}]`,
                message: `无效的正则表达式: ${String(pattern)}`,
                severity: 'error',
                suggestion: '确保所有模式都是有效的正则表达式',
              });
            }
          });
        }
      }
    }

    // 验证文件加密配置
    if (options.enableFileEncryption) {
      const encryptionOptions = options.fileEncryptionOptions || {};

      // 检查加密算法
      if (encryptionOptions.algorithm !== undefined) {
        const validAlgorithms = ['AES-GCM', 'AES-CBC', 'ChaCha20'];
        if (!validAlgorithms.includes(encryptionOptions.algorithm)) {
          issues.push({
            field: 'fileEncryptionOptions.algorithm',
            message: `不支持的加密算法: ${encryptionOptions.algorithm}`,
            severity: 'error',
            suggestion: `使用以下算法之一: ${validAlgorithms.join(', ')}`,
          });
        }
      }

      // 检查密钥长度
      if (encryptionOptions.keyLength !== undefined) {
        const validKeyLengths = [128, 192, 256];
        const algorithm = encryptionOptions.algorithm || 'AES-GCM';

        if (!validKeyLengths.includes(encryptionOptions.keyLength)) {
          issues.push({
            field: 'fileEncryptionOptions.keyLength',
            message: `对于${algorithm}算法，无效的密钥长度: ${encryptionOptions.keyLength}`,
            severity: 'error',
            suggestion: `使用以下密钥长度之一: ${validKeyLengths.join(', ')}`,
          });
        } else if (encryptionOptions.keyLength === 128) {
          issues.push({
            field: 'fileEncryptionOptions.keyLength',
            message: '128位加密密钥长度提供较低的安全性',
            severity: 'warning',
            suggestion: '建议使用256位密钥长度以获得更高的安全性',
          });
        }
      }

      // 检查密钥存储
      if (encryptionOptions.keyStorage !== undefined) {
        const validStorages = ['local', 'remote', 'both'];
        if (!validStorages.includes(encryptionOptions.keyStorage)) {
          issues.push({
            field: 'fileEncryptionOptions.keyStorage',
            message: `无效的密钥存储类型: ${encryptionOptions.keyStorage}`,
            severity: 'error',
            suggestion: `使用以下存储类型之一: ${validStorages.join(', ')}`,
          });
        } else if (encryptionOptions.keyStorage === 'local') {
          issues.push({
            field: 'fileEncryptionOptions.keyStorage',
            message: '本地密钥存储可能存在安全风险',
            severity: 'warning',
            suggestion: '建议使用远程密钥存储或密钥派生方案',
          });
        }
      }
    }

    return {
      valid: issues.filter(issue => issue.severity === 'error').length === 0,
      issues,
    };
  }
}
