/**
 * 安全插件模块
 * 导出不同安全级别的插件实现
 */

import { SecurityLevel } from '../../types';

import AdvancedSecurityPlugin from './AdvancedSecurityPlugin';
import type { AdvancedSecurityPluginOptions } from './AdvancedSecurityPlugin';
// 导出子系统
import AuditLogSystem from './audit/AuditLogSystem';
import type { AuditLogOptions, AuditLogEntry } from './audit/AuditLogSystem';
import type { BasicSecurityPluginOptions } from './BasicSecurityPlugin';
import BasicSecurityPlugin from './BasicSecurityPlugin';
import FileEncryptionSystem from './encryption/FileEncryptionSystem';
import type {
  EncryptionOptions,
  EncryptionResult,
} from './encryption/FileEncryptionSystem';
import ContentScannerEngine from './scanners/ContentScannerEngine';
import type {
  ContentScannerOptions,
  ScanResult,
} from './scanners/ContentScannerEngine';
import DigitalSignatureSystem from './signature/DigitalSignatureSystem';
import type {
  DigitalSignatureOptions,
  SignatureAlgorithm,
  HashAlgorithm,
  KeyPair,
  SignatureResult,
  VerificationResult,
} from './signature/DigitalSignatureSystem';
import type { StandardSecurityPluginOptions } from './StandardSecurityPlugin';
import { StandardSecurityPlugin } from './StandardSecurityPlugin';
import WatermarkProcessor from './watermark/WatermarkProcessor';
import type {
  WatermarkOptions,
  WatermarkPosition,
  WatermarkType,
} from './watermark/WatermarkProcessor';

/**
 * 根据安全级别获取对应的安全插件
 * @param level 安全级别
 * @returns 对应的安全插件
 */
export const getSecurityPluginByLevel = (level: SecurityLevel) => {
  switch (level) {
    case SecurityLevel.BASIC:
      return BasicSecurityPlugin;
    case SecurityLevel.STANDARD:
      return StandardSecurityPlugin;
    case SecurityLevel.ADVANCED:
      return AdvancedSecurityPlugin;
    default:
      return BasicSecurityPlugin;
  }
};

export {
  BasicSecurityPlugin,
  StandardSecurityPlugin,
  AdvancedSecurityPlugin,
  // 子系统导出
  AuditLogSystem,
  ContentScannerEngine,
  FileEncryptionSystem,
  WatermarkProcessor,
  DigitalSignatureSystem,
};

export type {
  BasicSecurityPluginOptions,
  StandardSecurityPluginOptions,
  AdvancedSecurityPluginOptions,
  // 子系统类型导出
  AuditLogOptions,
  AuditLogEntry,
  ContentScannerOptions,
  ScanResult,
  EncryptionOptions,
  EncryptionResult,
  WatermarkOptions,
  WatermarkPosition,
  WatermarkType,
  DigitalSignatureOptions,
  SignatureAlgorithm,
  HashAlgorithm,
  KeyPair,
  SignatureResult,
  VerificationResult,
};

export default {
  BasicSecurityPlugin,
  StandardSecurityPlugin,
  AdvancedSecurityPlugin,
  getSecurityPluginByLevel,
  // 子系统导出
  AuditLogSystem,
  ContentScannerEngine,
  FileEncryptionSystem,
  WatermarkProcessor,
  DigitalSignatureSystem,
};
