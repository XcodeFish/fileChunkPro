/**
 * SecurityValidator - 集中式安全验证工具类
 * 提供文件名、URL、内容等验证功能，支持智能识别和自适应安全策略
 */

import { Environment, SecurityLevel } from '../types';
import FileContentDetector from './FileContentDetector';
import UrlSafetyChecker, { UrlSafetyOptions } from './UrlSafetyChecker';

export interface ValidationResult<T = any> {
  valid: boolean;
  reason?: string;
  issues?: string[];
  modifiedData?: T;
  safetyScore?: number; // 0-100 的安全分数
  riskLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  adaptiveSuggestion?: AdaptiveSecuritySuggestion;
}

export interface FileValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
  disallowedTypes?: string[];
  disallowedExtensions?: string[];
  validateContent?: boolean;
  strictTypeChecking?: boolean;
  allowEmptyFiles?: boolean;
  maxFileNameLength?: number;
  securityLevel?: SecurityLevel;
  adaptiveMode?: boolean; // 是否使用自适应安全模式
  environment?: Environment; // 运行环境
}

export interface AdaptiveSecuritySuggestion {
  suggestedLevel?: SecurityLevel;
  suggestedActions?: string[];
  reason?: string;
}

/**
 * 集中式安全验证工具类
 */
export class SecurityValidator {
  // 风险模式缓存 - 记录检测到的风险模式，用于智能适配安全策略
  private static _riskPatternCache: Map<
    string,
    {
      count: number;
      lastSeen: number;
      pattern: string;
      severity: string;
    }
  > = new Map();

  // 上传历史统计 - 用于自适应安全策略
  private static _uploadStats = {
    totalAttempts: 0,
    validUploads: 0,
    rejectedUploads: 0,
    riskDistribution: {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    lastAttackTime: 0,
    consecutiveSafeUploads: 0,
  };

  // 环境风险评估结果缓存
  private static _environmentRiskCache: Map<Environment, number> = new Map();

  /**
   * 文件名称安全验证
   * @param fileName 文件名
   * @returns 验证结果
   */
  static validateFileName(fileName: string): ValidationResult<string> {
    if (!fileName) {
      return { valid: false, reason: '文件名不能为空', riskLevel: 'medium' };
    }

    const issues: string[] = [];
    let modifiedFileName = fileName;
    let needsModification = false;

    if (fileName.length > 255) {
      issues.push('文件名长度超出限制(255字符)');
      modifiedFileName = fileName.substring(0, 255);
      needsModification = true;
    }

    // 检查危险字符
    if (/[<>:"/\\|?*]/.test(fileName)) {
      issues.push('文件名包含非法字符 (< > : " / \\ | ? *)');
      modifiedFileName = modifiedFileName.replace(/[<>:"/\\|?*]/g, '_');
      needsModification = true;
    }

    // 检查控制字符
    const hasControlChars = [...fileName].some(
      char =>
        char.charCodeAt(0) <= 31 ||
        (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
    );
    if (hasControlChars) {
      issues.push('文件名包含控制字符');
      modifiedFileName = [...modifiedFileName]
        .filter(
          char =>
            !(
              char.charCodeAt(0) <= 31 ||
              (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
            )
        )
        .join('');
      needsModification = true;
    }

    // 检查路径遍历
    if (
      /\.\.[/\\]/.test(fileName) ||
      fileName.includes('../') ||
      fileName.includes('..\\')
    ) {
      issues.push('文件名包含非法路径序列');
      modifiedFileName = modifiedFileName.replace(/\.\.[/\\]/g, '__');
      needsModification = true;
    }

    // 检查隐藏字符
    if (/[\u200B-\u200D\uFEFF]/.test(fileName)) {
      issues.push('文件名包含隐藏字符');
      modifiedFileName = modifiedFileName.replace(/[\u200B-\u200D\uFEFF]/g, '');
      needsModification = true;
    }

    // 检查文件名是否以点开头（隐藏文件）
    if (fileName.startsWith('.') && !fileName.startsWith('..')) {
      issues.push('文件名以点开头（隐藏文件）');
      // 这里不做修改，只是警告
    }

    // 检查连续空格
    if (/\s{2,}/.test(fileName)) {
      modifiedFileName = modifiedFileName.replace(/\s+/g, ' ');
      needsModification = true;
    }

    // 检查首尾空格
    if (fileName !== fileName.trim()) {
      modifiedFileName = modifiedFileName.trim();
      needsModification = true;
    }

    const valid = issues.length === 0;
    let riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';

    if (issues.length > 0) {
      riskLevel = issues.some(i => i.includes('路径序列')) ? 'high' : 'medium';
    }

    return {
      valid,
      reason: issues.join('; '),
      issues: issues.length > 0 ? issues : undefined,
      modifiedData: needsModification ? modifiedFileName : undefined,
      riskLevel,
    };
  }

  /**
   * URL安全验证
   * @param url URL字符串
   * @param options URL安全选项
   * @returns 验证结果
   */
  static validateUrl(
    url: string,
    options?: UrlSafetyOptions
  ): ValidationResult<string> {
    const checker = new UrlSafetyChecker(options);
    const result = checker.validateUrl(url);

    if (!result.valid) {
      return {
        valid: false,
        reason: result.reason,
        riskLevel: (result.riskLevel as any) || 'medium',
        modifiedData: result.valid
          ? undefined
          : UrlSafetyChecker.sanitizeUrl(url),
      };
    }

    return { valid: true };
  }

  /**
   * 综合文件安全检查
   * @param file 文件对象
   * @param options 验证选项
   * @returns 验证结果
   */
  static async validateFile(
    file: File,
    options: FileValidationOptions = {}
  ): Promise<ValidationResult<File>> {
    // 更新上传统计
    this._uploadStats.totalAttempts++;

    const issues: string[] = [];
    let riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    let safetyScore = 100; // 从100分开始，根据各种风险因素减分

    // 1. 文件名检查
    const nameCheck = this.validateFileName(file.name);
    if (!nameCheck.valid && nameCheck.issues) {
      issues.push(...nameCheck.issues);
      safetyScore -= nameCheck.issues.length * 5;
      if (nameCheck.riskLevel && nameCheck.riskLevel !== 'none') {
        riskLevel = this._determineHigherRiskLevel(
          riskLevel,
          nameCheck.riskLevel
        );
      }
    }

    // 2. 文件大小检查
    if (options.maxSize && file.size > options.maxSize) {
      issues.push(
        `文件大小超出限制: ${file.size} 字节 > ${options.maxSize} 字节`
      );
      safetyScore -= 10;
      riskLevel = this._determineHigherRiskLevel(riskLevel, 'medium');
    }

    // 3. 空文件检查
    if (file.size === 0 && options.allowEmptyFiles === false) {
      issues.push('不允许上传空文件');
      safetyScore -= 5;
      riskLevel = this._determineHigherRiskLevel(riskLevel, 'low');
    }

    // 4. 文件类型检查
    // 先检查黑名单
    if (options.disallowedTypes && options.disallowedTypes.length > 0) {
      const isDisallowed = this._isFileTypeMatch(
        file.type,
        options.disallowedTypes
      );
      if (isDisallowed) {
        issues.push(`不允许的文件类型: ${file.type}`);
        safetyScore -= 30;
        riskLevel = this._determineHigherRiskLevel(riskLevel, 'high');
      }
    }

    // 再检查白名单
    if (options.allowedTypes && options.allowedTypes.length > 0) {
      const isAllowed = this._isFileTypeMatch(file.type, options.allowedTypes);
      if (!isAllowed) {
        issues.push(`不支持的文件类型: ${file.type}`);
        safetyScore -= 20;
        riskLevel = this._determineHigherRiskLevel(riskLevel, 'medium');
      }
    }

    // 5. 文件扩展名检查
    const extension = this._getFileExtension(file.name).toLowerCase();

    // 先检查黑名单扩展名
    if (
      options.disallowedExtensions &&
      options.disallowedExtensions.length > 0
    ) {
      if (options.disallowedExtensions.includes(extension)) {
        issues.push(`不允许的文件扩展名: ${extension}`);
        safetyScore -= 30;
        riskLevel = this._determineHigherRiskLevel(riskLevel, 'high');
      }
    }

    // 再检查白名单扩展名
    if (options.allowedExtensions && options.allowedExtensions.length > 0) {
      if (!options.allowedExtensions.includes(extension)) {
        issues.push(`不支持的文件扩展名: ${extension}`);
        safetyScore -= 20;
        riskLevel = this._determineHigherRiskLevel(riskLevel, 'medium');
      }
    }

    // 6. 文件内容检查
    if (options.validateContent) {
      try {
        const contentDetector = new FileContentDetector();
        const contentInfo = await contentDetector.analyzeFile(file);

        // 6.1 检查文件是否包含恶意内容
        if (contentInfo.potentiallyMalicious) {
          issues.push(
            `文件可能包含恶意内容: ${contentInfo.warnings.join(', ')}`
          );
          safetyScore -= 40;
          riskLevel = this._determineHigherRiskLevel(riskLevel, 'high');

          // 记录风险模式到缓存中，用于智能适配
          for (const warning of contentInfo.warnings) {
            this._recordRiskPattern(warning, 'high');
          }
        }

        // 6.2 检查文件类型与内容是否匹配
        if (options.strictTypeChecking && contentInfo.mimeType) {
          if (
            file.type &&
            contentInfo.mimeType !== file.type &&
            !this._isCompatibleMimeType(contentInfo.mimeType, file.type)
          ) {
            issues.push(
              `文件内容类型(${contentInfo.mimeType})与声明类型(${file.type})不匹配`
            );
            safetyScore -= 25;
            riskLevel = this._determineHigherRiskLevel(riskLevel, 'medium');
          }

          // 检查扩展名与检测到的MIME类型是否匹配
          const expectedExtensions = this._getExtensionsForMimeType(
            contentInfo.mimeType
          );
          if (
            expectedExtensions.length > 0 &&
            !expectedExtensions.includes(extension)
          ) {
            issues.push(
              `文件扩展名(${extension})与实际内容类型(${contentInfo.mimeType})不匹配`
            );
            safetyScore -= 25;
            riskLevel = this._determineHigherRiskLevel(riskLevel, 'medium');
          }
        }
      } catch (e) {
        issues.push(
          `文件内容检查失败: ${e instanceof Error ? e.message : String(e)}`
        );
        safetyScore -= 10;
      }
    }

    // 7. 环境风险评估
    if (options.environment) {
      const environmentRisk = this._assessEnvironmentRisk(options.environment);
      safetyScore -= environmentRisk.riskScore;

      if (environmentRisk.riskScore > 20) {
        issues.push(
          `当前环境(${options.environment})存在安全风险: ${environmentRisk.reason}`
        );
        riskLevel = this._determineHigherRiskLevel(riskLevel, 'medium');
      }
    }

    // 限制安全分数范围为0-100
    safetyScore = Math.max(0, Math.min(100, safetyScore));

    // 生成自适应安全建议
    let adaptiveSuggestion: AdaptiveSecuritySuggestion | undefined;
    if (options.adaptiveMode) {
      adaptiveSuggestion = this._generateAdaptiveSuggestion(
        safetyScore,
        riskLevel,
        options.securityLevel || SecurityLevel.STANDARD
      );
    }

    // 更新上传统计
    const valid = issues.length === 0;
    if (valid) {
      this._uploadStats.validUploads++;
      this._uploadStats.consecutiveSafeUploads++;
    } else {
      this._uploadStats.rejectedUploads++;
      this._uploadStats.consecutiveSafeUploads = 0;

      if (riskLevel) {
        this._uploadStats.riskDistribution[riskLevel]++;
      }

      if (riskLevel === 'high' || riskLevel === 'critical') {
        this._uploadStats.lastAttackTime = Date.now();
      }
    }

    return {
      valid,
      reason: issues.join('; '),
      issues: issues.length > 0 ? issues : undefined,
      safetyScore,
      riskLevel,
      adaptiveSuggestion,
    };
  }

  /**
   * 生成自适应安全建议
   * 根据文件安全评分、风险级别和当前安全级别生成建议
   */
  private static _generateAdaptiveSuggestion(
    safetyScore: number,
    riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical',
    currentSecurityLevel: SecurityLevel
  ): AdaptiveSecuritySuggestion {
    const suggestion: AdaptiveSecuritySuggestion = {
      suggestedActions: [],
    };

    // 根据安全分数和风险级别提出建议
    if (safetyScore < 50 || riskLevel === 'critical' || riskLevel === 'high') {
      // 如果安全分数低或风险高，建议提高安全级别
      if (currentSecurityLevel === SecurityLevel.BASIC) {
        suggestion.suggestedLevel = SecurityLevel.STANDARD;
        suggestion.reason = `检测到${riskLevel}级别风险，建议提升安全级别`;
      } else if (currentSecurityLevel === SecurityLevel.STANDARD) {
        suggestion.suggestedLevel = SecurityLevel.ADVANCED;
        suggestion.reason = `检测到${riskLevel}级别风险，建议提升至高级安全级别`;
      }

      // 添加具体行动建议
      suggestion.suggestedActions!.push('启用深度文件内容验证');
      suggestion.suggestedActions!.push('启用严格MIME类型检查');

      if (riskLevel === 'critical') {
        suggestion.suggestedActions!.push('临时禁用敏感操作');
        suggestion.suggestedActions!.push('启用传输加密');
      }
    } else if (
      safetyScore > 90 &&
      this._uploadStats.consecutiveSafeUploads > 20 &&
      Date.now() - this._uploadStats.lastAttackTime > 24 * 60 * 60 * 1000
    ) {
      // 如果长时间没有风险且安全分数高，可以考虑降低安全级别以提高性能
      if (currentSecurityLevel === SecurityLevel.ADVANCED) {
        suggestion.suggestedLevel = SecurityLevel.STANDARD;
        suggestion.reason = '长时间未发现威胁，可降级安全级别以提高性能';
      } else if (
        currentSecurityLevel === SecurityLevel.STANDARD &&
        this._uploadStats.consecutiveSafeUploads > 50
      ) {
        suggestion.suggestedLevel = SecurityLevel.BASIC;
        suggestion.reason =
          '长时间未发现任何威胁，可使用基础安全级别以获得最佳性能';
      }
    }

    // 根据风险模式缓存提供更具体的建议
    const topRiskPatterns = this._getTopRiskPatterns();
    if (topRiskPatterns.length > 0) {
      for (const pattern of topRiskPatterns) {
        if (pattern.severity === 'high' || pattern.severity === 'critical') {
          suggestion.suggestedActions!.push(
            `针对"${pattern.pattern}"添加特定检测规则`
          );
        }
      }
    }

    return suggestion.suggestedLevel || suggestion.suggestedActions!.length > 0
      ? suggestion
      : { suggestedLevel: currentSecurityLevel };
  }

  /**
   * 记录风险模式
   */
  private static _recordRiskPattern(pattern: string, severity: string): void {
    const now = Date.now();
    const key = pattern.substring(0, 100); // 限制长度

    if (this._riskPatternCache.has(key)) {
      const record = this._riskPatternCache.get(key)!;
      record.count++;
      record.lastSeen = now;
    } else {
      this._riskPatternCache.set(key, {
        count: 1,
        lastSeen: now,
        pattern: key,
        severity,
      });
    }

    // 清理过期的风险模式（超过7天未见）
    if (this._riskPatternCache.size > 100) {
      // 限制缓存大小
      for (const [k, v] of this._riskPatternCache.entries()) {
        if (now - v.lastSeen > 7 * 24 * 60 * 60 * 1000) {
          this._riskPatternCache.delete(k);
        }
      }
    }
  }

  /**
   * 获取顶部风险模式
   */
  private static _getTopRiskPatterns(
    limit = 5
  ): Array<{ pattern: string; count: number; severity: string }> {
    return Array.from(this._riskPatternCache.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * 环境风险评估
   */
  private static _assessEnvironmentRisk(env: Environment): {
    riskScore: number;
    reason?: string;
  } {
    // 检查是否有缓存结果
    if (this._environmentRiskCache.has(env)) {
      return {
        riskScore: this._environmentRiskCache.get(env)!,
        reason: '缓存评估结果',
      };
    }

    let riskScore = 0;
    let reason = '';

    // 根据环境类型评估风险
    switch (env) {
      case Environment.Browser:
        riskScore = 10; // 基础风险
        reason = '浏览器环境可能面临XSS和CSRF风险';
        break;
      case Environment.WechatMiniProgram:
      case Environment.AlipayMiniProgram:
        riskScore = 15;
        reason = '小程序环境可能受平台安全策略限制';
        break;
      case Environment.UniApp:
      case Environment.Taro:
        riskScore = 20;
        reason = '跨平台环境面临多种环境安全风险';
        break;
      case Environment.NodeJS:
        riskScore = 5;
        reason = 'Node.js环境相对可控';
        break;
      case Environment.ReactNative:
        riskScore = 25;
        reason = '移动应用环境可能面临设备权限风险';
        break;
      case Environment.Unknown:
        riskScore = 30;
        reason = '未知环境存在不确定安全风险';
        break;
      default:
        riskScore = 20;
        reason = '其他环境存在不确定安全风险';
    }

    // 缓存结果（1小时有效期）
    this._environmentRiskCache.set(env, riskScore);
    setTimeout(
      () => {
        this._environmentRiskCache.delete(env);
      },
      60 * 60 * 1000
    );

    return { riskScore, reason };
  }

  /**
   * 从文件名获取扩展名
   */
  private static _getFileExtension(fileName: string): string {
    return fileName.split('.').pop() || '';
  }

  /**
   * 检查文件类型是否匹配
   */
  private static _isFileTypeMatch(
    mimeType: string,
    allowedTypes: string[]
  ): boolean {
    // 处理空MIME类型
    if (!mimeType) return false;

    return allowedTypes.some(type => {
      // 完全匹配
      if (type === '*' || type === mimeType) {
        return true;
      }

      // 通配符匹配 (例如 "image/*")
      if (type.endsWith('/*')) {
        const mainType = type.split('/')[0];
        return mimeType.startsWith(`${mainType}/`);
      }

      return false;
    });
  }

  /**
   * 检查两个MIME类型是否兼容
   */
  private static _isCompatibleMimeType(
    mimeTypeA: string,
    mimeTypeB: string
  ): boolean {
    // 如果完全相同
    if (mimeTypeA === mimeTypeB) return true;

    // 如果主类型相同
    const mainTypeA = mimeTypeA.split('/')[0];
    const mainTypeB = mimeTypeB.split('/')[0];

    if (mainTypeA === mainTypeB) return true;

    // 特殊情况的兼容性处理
    const compatibilityMap: Record<string, string[]> = {
      'application/zip': ['application/x-zip-compressed', 'application/x-zip'],
      'application/pdf': ['application/x-pdf'],
      'text/plain': ['text/x-log', 'text/x-markdown', 'text/markdown'],
      'application/json': ['application/ld+json', 'text/json'],
      'image/jpeg': ['image/pjpeg', 'image/jpg'],
    };

    // 检查A是否与B兼容
    if (
      compatibilityMap[mimeTypeA] &&
      compatibilityMap[mimeTypeA].includes(mimeTypeB)
    ) {
      return true;
    }

    // 检查B是否与A兼容
    if (
      compatibilityMap[mimeTypeB] &&
      compatibilityMap[mimeTypeB].includes(mimeTypeA)
    ) {
      return true;
    }

    return false;
  }

  /**
   * 获取MIME类型对应的扩展名列表
   */
  private static _getExtensionsForMimeType(mimeType: string): string[] {
    // MIME类型到扩展名的映射
    const mimeToExtMap: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg', 'jpe'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'image/webp': ['webp'],
      'image/avif': ['avif'],
      'image/svg+xml': ['svg'],

      'application/pdf': ['pdf'],
      'text/plain': ['txt', 'text', 'log'],
      'text/html': ['html', 'htm'],
      'text/css': ['css'],
      'text/javascript': ['js'],
      'application/javascript': ['js'],
      'application/json': ['json'],

      'application/zip': ['zip'],
      'application/x-zip-compressed': ['zip'],
      'application/x-rar-compressed': ['rar'],

      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['docx'],
      'application/msword': ['doc'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        'xlsx',
      ],
      'application/vnd.ms-excel': ['xls'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        ['pptx'],
      'application/vnd.ms-powerpoint': ['ppt'],

      'audio/mpeg': ['mp3'],
      'audio/wav': ['wav'],
      'audio/ogg': ['oga', 'ogg'],

      'video/mp4': ['mp4', 'm4v'],
      'video/webm': ['webm'],
      'video/ogg': ['ogv'],
    };

    return mimeToExtMap[mimeType] || [];
  }

  /**
   * 确定更高的风险级别
   */
  private static _determineHigherRiskLevel(
    currentLevel: 'none' | 'low' | 'medium' | 'high' | 'critical',
    newLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    const levels = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    return levels[currentLevel] >= levels[newLevel] ? currentLevel : newLevel;
  }

  /**
   * 重置风险统计
   */
  static resetStats(): void {
    this._uploadStats = {
      totalAttempts: 0,
      validUploads: 0,
      rejectedUploads: 0,
      riskDistribution: {
        none: 0,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      lastAttackTime: 0,
      consecutiveSafeUploads: 0,
    };
    this._riskPatternCache.clear();
  }

  /**
   * 获取安全统计数据
   */
  static getSecurityStats(): any {
    return {
      uploads: {
        total: this._uploadStats.totalAttempts,
        valid: this._uploadStats.validUploads,
        rejected: this._uploadStats.rejectedUploads,
        consecutiveSafe: this._uploadStats.consecutiveSafeUploads,
      },
      riskDistribution: { ...this._uploadStats.riskDistribution },
      lastAttackTime: this._uploadStats.lastAttackTime,
      topRiskPatterns: this._getTopRiskPatterns(),
      timestamp: Date.now(),
    };
  }
}

export default SecurityValidator;
