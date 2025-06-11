/**
 * 权限管理器
 * 负责管理和验证上传文件的权限控制
 */

import { Logger } from '../../../utils/Logger';
import { EventBus } from '../../../core/EventBus';

/**
 * 权限级别
 */
export enum PermissionLevel {
  /**
   * 禁止访问
   */
  DENY = 'deny',

  /**
   * 只读权限
   */
  READ = 'read',

  /**
   * 读写权限
   */
  WRITE = 'write',

  /**
   * 完全控制权限
   */
  FULL = 'full',
}

/**
 * 权限规则
 */
export interface PermissionRule {
  /**
   * 规则ID
   */
  id: string;

  /**
   * 规则名称
   */
  name: string;

  /**
   * 规则描述
   */
  description?: string;

  /**
   * 规则应用的条件
   */
  condition: PermissionCondition;

  /**
   * 授予的权限级别
   */
  level: PermissionLevel;

  /**
   * 规则优先级
   * 数字越大优先级越高
   */
  priority: number;

  /**
   * 是否启用
   */
  enabled: boolean;

  /**
   * 过期时间
   */
  expiresAt?: number;

  /**
   * 创建时间
   */
  createdAt: number;

  /**
   * 创建者
   */
  createdBy?: string;

  /**
   * 规则元数据
   */
  metadata?: Record<string, any>;
}

/**
 * 权限条件
 */
export interface PermissionCondition {
  /**
   * 用户ID或角色ID
   */
  subject?: string | string[];

  /**
   * 文件扩展名
   */
  fileExtension?: string | string[];

  /**
   * 文件MIME类型
   */
  mimeType?: string | string[];

  /**
   * 文件大小范围（字节）
   */
  fileSize?: {
    min?: number;
    max?: number;
  };

  /**
   * 文件名匹配模式
   */
  fileNamePattern?: string | RegExp;

  /**
   * IP地址范围
   */
  ipRange?: string | string[];

  /**
   * 时间范围
   */
  timeRange?: {
    start?: number;
    end?: number;
  };

  /**
   * 自定义条件检查函数
   */
  customCheck?: (context: PermissionContext) => boolean | Promise<boolean>;

  /**
   * 额外条件，所有条件必须满足
   */
  allOf?: PermissionCondition[];

  /**
   * 额外条件，任一条件满足即可
   */
  anyOf?: PermissionCondition[];

  /**
   * 额外条件，条件不能满足
   */
  not?: PermissionCondition;
}

/**
 * 权限上下文
 */
export interface PermissionContext {
  /**
   * 用户ID
   */
  userId?: string;

  /**
   * 用户角色
   */
  userRoles?: string[];

  /**
   * 文件信息
   */
  file?: {
    /**
     * 文件名
     */
    name: string;

    /**
     * 文件大小（字节）
     */
    size: number;

    /**
     * 文件类型
     */
    type: string;

    /**
     * 文件扩展名
     */
    extension?: string;
  };

  /**
   * 操作类型
   */
  action:
    | 'upload'
    | 'download'
    | 'delete'
    | 'view'
    | 'list'
    | 'pause'
    | 'resume'
    | 'cancel';

  /**
   * IP地址
   */
  ipAddress?: string;

  /**
   * 客户端信息
   */
  client?: {
    /**
     * 用户代理
     */
    userAgent?: string;

    /**
     * 设备类型
     */
    deviceType?: string;

    /**
     * 浏览器
     */
    browser?: string;
  };

  /**
   * 当前时间
   */
  timestamp: number;

  /**
   * 额外信息
   */
  extra?: Record<string, any>;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /**
   * 是否允许
   */
  allowed: boolean;

  /**
   * 应用的规则
   */
  appliedRule?: PermissionRule;

  /**
   * 结果信息
   */
  message?: string;

  /**
   * 结果元数据
   */
  metadata?: Record<string, any>;
}

/**
 * 权限管理器选项
 */
export interface PermissionManagerOptions {
  /**
   * 默认权限级别
   * @default PermissionLevel.DENY
   */
  defaultPermission?: PermissionLevel;

  /**
   * 是否启用规则缓存
   * @default true
   */
  enableRuleCache?: boolean;

  /**
   * 规则缓存过期时间（毫秒）
   * @default 60000 (1分钟)
   */
  ruleCacheExpiry?: number;

  /**
   * 权限检查超时时间（毫秒）
   * @default 3000 (3秒)
   */
  permissionCheckTimeout?: number;

  /**
   * 是否记录权限检查
   * @default true
   */
  logPermissionChecks?: boolean;

  /**
   * 自定义用户解析函数
   */
  userResolver?: (
    context: Partial<PermissionContext>
  ) => Promise<{ userId?: string; userRoles?: string[] }>;
}

/**
 * 权限管理器
 */
export default class PermissionManager {
  /**
   * 默认选项
   */
  private static readonly DEFAULT_OPTIONS: PermissionManagerOptions = {
    defaultPermission: PermissionLevel.DENY,
    enableRuleCache: true,
    ruleCacheExpiry: 60000,
    permissionCheckTimeout: 3000,
    logPermissionChecks: true,
  };

  /**
   * 选项
   */
  private _options: PermissionManagerOptions;

  /**
   * 权限规则列表
   */
  private _rules: PermissionRule[] = [];

  /**
   * 权限规则缓存
   */
  private _ruleCache: Map<
    string,
    { result: PermissionCheckResult; timestamp: number }
  > = new Map();

  /**
   * 日志记录器
   */
  private _logger: Logger;

  /**
   * 事件总线
   */
  private _eventBus?: EventBus;

  /**
   * 构造函数
   * @param options 选项
   */
  constructor(options: PermissionManagerOptions = {}) {
    this._options = { ...PermissionManager.DEFAULT_OPTIONS, ...options };
    this._logger = new Logger('PermissionManager');
    this._initializeDefaultRules();
  }

  /**
   * 初始化默认规则
   */
  private _initializeDefaultRules(): void {
    // 可以添加一些默认规则
    // 例如，禁止上传可执行文件
    this.addRule({
      id: 'deny-executable',
      name: '禁止上传可执行文件',
      description: '出于安全原因，禁止上传可执行文件',
      condition: {
        fileExtension: ['exe', 'dll', 'bat', 'cmd', 'sh', 'app', 'msi', 'dmg'],
      },
      level: PermissionLevel.DENY,
      priority: 100,
      enabled: true,
      createdAt: Date.now(),
    });

    // 限制上传文件大小
    this.addRule({
      id: 'file-size-limit',
      name: '文件大小限制',
      description: '限制上传文件大小不超过100MB',
      condition: {
        fileSize: {
          max: 104857600, // 100MB
        },
      },
      level: PermissionLevel.DENY,
      priority: 90,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * 设置事件总线
   * @param eventBus 事件总线实例
   */
  public setEventBus(eventBus: EventBus): void {
    this._eventBus = eventBus;
  }

  /**
   * 添加权限规则
   * @param rule 权限规则
   */
  public addRule(rule: PermissionRule): void {
    // 检查规则是否已存在
    const existingRuleIndex = this._rules.findIndex(r => r.id === rule.id);
    if (existingRuleIndex >= 0) {
      // 更新现有规则
      this._rules[existingRuleIndex] = rule;
    } else {
      // 添加新规则
      this._rules.push(rule);
    }

    // 按优先级排序
    this._sortRules();

    // 清除缓存
    this._clearCache();

    // 触发事件
    if (this._eventBus) {
      this._eventBus.emit('security:ruleAdded', rule);
    }
  }

  /**
   * 删除权限规则
   * @param ruleId 规则ID
   * @returns 是否成功删除
   */
  public removeRule(ruleId: string): boolean {
    const initialLength = this._rules.length;
    this._rules = this._rules.filter(rule => rule.id !== ruleId);
    const removed = initialLength > this._rules.length;

    if (removed) {
      // 清除缓存
      this._clearCache();

      // 触发事件
      if (this._eventBus) {
        this._eventBus.emit('security:ruleRemoved', ruleId);
      }
    }

    return removed;
  }

  /**
   * 启用权限规则
   * @param ruleId 规则ID
   * @returns 是否成功启用
   */
  public enableRule(ruleId: string): boolean {
    const rule = this._rules.find(r => r.id === ruleId);
    if (rule && !rule.enabled) {
      rule.enabled = true;
      this._clearCache();

      // 触发事件
      if (this._eventBus) {
        this._eventBus.emit('security:ruleUpdated', rule);
      }

      return true;
    }
    return false;
  }

  /**
   * 禁用权限规则
   * @param ruleId 规则ID
   * @returns 是否成功禁用
   */
  public disableRule(ruleId: string): boolean {
    const rule = this._rules.find(r => r.id === ruleId);
    if (rule && rule.enabled) {
      rule.enabled = false;
      this._clearCache();

      // 触发事件
      if (this._eventBus) {
        this._eventBus.emit('security:ruleUpdated', rule);
      }

      return true;
    }
    return false;
  }

  /**
   * 获取所有规则
   * @returns 规则列表
   */
  public getRules(): PermissionRule[] {
    return [...this._rules];
  }

  /**
   * 获取规则
   * @param ruleId 规则ID
   * @returns 规则或undefined
   */
  public getRule(ruleId: string): PermissionRule | undefined {
    return this._rules.find(rule => rule.id === ruleId);
  }

  /**
   * 检查权限
   * @param context 权限上下文
   * @returns 权限检查结果
   */
  public async checkPermission(
    context: Partial<PermissionContext>
  ): Promise<PermissionCheckResult> {
    try {
      // 补全上下文信息
      const fullContext = await this._buildFullContext(context);

      // 尝试从缓存获取结果
      const cacheKey = this._generateCacheKey(fullContext);
      if (this._options.enableRuleCache) {
        const cachedResult = this._getCachedResult(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }
      }

      // 设置超时
      const timeoutPromise = new Promise<PermissionCheckResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error('权限检查超时'));
        }, this._options.permissionCheckTimeout);
      });

      // 执行权限检查
      const checkPromise = this._evaluateRules(fullContext);

      // 等待结果或超时
      const result = await Promise.race([checkPromise, timeoutPromise]);

      // 缓存结果
      if (this._options.enableRuleCache) {
        this._cacheResult(cacheKey, result);
      }

      // 记录权限检查
      if (this._options.logPermissionChecks) {
        this._logPermissionCheck(fullContext, result);
      }

      // 触发事件
      if (this._eventBus) {
        this._eventBus.emit('security:permissionChecked', {
          context: fullContext,
          result,
        });
      }

      return result;
    } catch (error) {
      this._logger.error('权限检查失败', error);

      // 返回默认结果
      const defaultResult: PermissionCheckResult = {
        allowed: this._options.defaultPermission !== PermissionLevel.DENY,
        message: `权限检查失败: ${(error as Error).message}`,
        metadata: {
          error: (error as Error).message,
          defaultAction: true,
        },
      };

      return defaultResult;
    }
  }

  /**
   * 构建完整上下文
   */
  private async _buildFullContext(
    context: Partial<PermissionContext>
  ): Promise<PermissionContext> {
    // 设置默认值
    const fullContext: PermissionContext = {
      action: context.action || 'upload',
      timestamp: context.timestamp || Date.now(),
      userId: context.userId,
      userRoles: context.userRoles || [],
      file: context.file,
      ipAddress: context.ipAddress,
      client: context.client,
      extra: context.extra || {},
    };

    // 如果提供了用户解析函数，使用它补充用户信息
    if (
      this._options.userResolver &&
      (!fullContext.userId || !fullContext.userRoles?.length)
    ) {
      try {
        const userInfo = await this._options.userResolver(context);
        fullContext.userId = userInfo.userId || fullContext.userId;
        fullContext.userRoles = userInfo.userRoles || fullContext.userRoles;
      } catch (error) {
        this._logger.warn('用户解析失败', error);
      }
    }

    // 如果有文件，提取文件扩展名
    if (fullContext.file?.name && !fullContext.file.extension) {
      const match = fullContext.file.name.match(/\.([^.]+)$/);
      if (match) {
        fullContext.file.extension = match[1].toLowerCase();
      }
    }

    return fullContext;
  }

  /**
   * 评估规则
   */
  private async _evaluateRules(
    context: PermissionContext
  ): Promise<PermissionCheckResult> {
    // 过滤出启用的规则并按优先级排序
    const activeRules = this._rules.filter(rule => rule.enabled);

    // 检查规则是否过期
    const validRules = activeRules.filter(rule => {
      return !rule.expiresAt || rule.expiresAt > context.timestamp;
    });

    // 按顺序评估规则
    for (const rule of validRules) {
      const matches = await this._matchesCondition(rule.condition, context);
      if (matches) {
        // 如果规则匹配，返回结果
        return {
          allowed: rule.level !== PermissionLevel.DENY,
          appliedRule: rule,
          message:
            rule.level === PermissionLevel.DENY
              ? `操作被规则 "${rule.name}" 拒绝`
              : `操作被规则 "${rule.name}" 允许`,
          metadata: {
            ruleId: rule.id,
            level: rule.level,
          },
        };
      }
    }

    // 如果没有规则匹配，使用默认权限
    return {
      allowed: this._options.defaultPermission !== PermissionLevel.DENY,
      message: `没有匹配的规则，使用默认权限: ${this._options.defaultPermission}`,
      metadata: {
        defaultAction: true,
        level: this._options.defaultPermission,
      },
    };
  }

  /**
   * 检查条件是否匹配
   */
  private async _matchesCondition(
    condition: PermissionCondition,
    context: PermissionContext
  ): Promise<boolean> {
    // 检查自定义条件
    if (condition.customCheck) {
      try {
        const result = condition.customCheck(context);
        if (result instanceof Promise) {
          return await result;
        }
        return result;
      } catch (error) {
        this._logger.error('自定义条件检查失败', error);
        return false;
      }
    }

    // 检查复合条件
    if (condition.allOf && condition.allOf.length > 0) {
      for (const subCondition of condition.allOf) {
        const matches = await this._matchesCondition(subCondition, context);
        if (!matches) {
          return false;
        }
      }
    }

    if (condition.anyOf && condition.anyOf.length > 0) {
      let anyMatched = false;
      for (const subCondition of condition.anyOf) {
        const matches = await this._matchesCondition(subCondition, context);
        if (matches) {
          anyMatched = true;
          break;
        }
      }
      if (!anyMatched) {
        return false;
      }
    }

    if (condition.not) {
      const matches = await this._matchesCondition(condition.not, context);
      if (matches) {
        return false;
      }
    }

    // 检查主题（用户或角色）
    if (condition.subject) {
      const subjects = Array.isArray(condition.subject)
        ? condition.subject
        : [condition.subject];
      const userMatch = context.userId && subjects.includes(context.userId);
      const roleMatch = context.userRoles?.some(role =>
        subjects.includes(role)
      );
      if (!userMatch && !roleMatch) {
        return false;
      }
    }

    // 检查文件扩展名
    if (condition.fileExtension && context.file?.extension) {
      const extensions = Array.isArray(condition.fileExtension)
        ? condition.fileExtension
        : [condition.fileExtension];
      if (!extensions.includes(context.file.extension.toLowerCase())) {
        return false;
      }
    }

    // 检查MIME类型
    if (condition.mimeType && context.file?.type) {
      const mimeTypes = Array.isArray(condition.mimeType)
        ? condition.mimeType
        : [condition.mimeType];

      // 支持通配符匹配，如 "image/*"
      const matches = mimeTypes.some(mimeType => {
        if (mimeType.endsWith('/*')) {
          const prefix = mimeType.slice(0, -2);
          return context.file!.type.startsWith(prefix);
        }
        return context.file!.type === mimeType;
      });

      if (!matches) {
        return false;
      }
    }

    // 检查文件大小
    if (condition.fileSize && context.file?.size !== undefined) {
      if (
        (condition.fileSize.min !== undefined &&
          context.file.size < condition.fileSize.min) ||
        (condition.fileSize.max !== undefined &&
          context.file.size > condition.fileSize.max)
      ) {
        return false;
      }
    }

    // 检查文件名模式
    if (condition.fileNamePattern && context.file?.name) {
      const pattern =
        typeof condition.fileNamePattern === 'string'
          ? new RegExp(condition.fileNamePattern)
          : condition.fileNamePattern;

      if (!pattern.test(context.file.name)) {
        return false;
      }
    }

    // 检查IP地址
    if (condition.ipRange && context.ipAddress) {
      const ipRanges = Array.isArray(condition.ipRange)
        ? condition.ipRange
        : [condition.ipRange];

      // 简单实现，仅支持精确匹配和CIDR
      // 完整实现应当支持IP范围和CIDR表示法
      const matches = ipRanges.some(range => {
        if (range.includes('/')) {
          // CIDR匹配
          return this._ipMatchesCidr(context.ipAddress!, range);
        }
        return context.ipAddress === range;
      });

      if (!matches) {
        return false;
      }
    }

    // 检查时间范围
    if (condition.timeRange) {
      if (
        (condition.timeRange.start !== undefined &&
          context.timestamp < condition.timeRange.start) ||
        (condition.timeRange.end !== undefined &&
          context.timestamp > condition.timeRange.end)
      ) {
        return false;
      }
    }

    // 所有条件都满足
    return true;
  }

  /**
   * 检查IP是否匹配CIDR
   * 简化实现，仅支持IPv4
   */
  private _ipMatchesCidr(ip: string, cidr: string): boolean {
    try {
      // 解析CIDR
      const [range, bits = '32'] = cidr.split('/');
      const mask = ~(2 ** (32 - parseInt(bits)) - 1);

      // 转换IP到数字
      const ipNum = this._ipToNumber(ip);
      const rangeNum = this._ipToNumber(range);

      // 应用掩码并比较
      return (ipNum & mask) === (rangeNum & mask);
    } catch (error) {
      this._logger.warn('CIDR匹配失败', error);
      return false;
    }
  }

  /**
   * 将IPv4地址转换为数字
   */
  private _ipToNumber(ip: string): number {
    return (
      ip
        .split('.')
        .reduce((sum, octet) => (sum << 8) + parseInt(octet, 10), 0) >>> 0
    );
  }

  /**
   * 规则排序，按优先级降序
   */
  private _sortRules(): void {
    this._rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 生成缓存键
   */
  private _generateCacheKey(context: PermissionContext): string {
    // 简单实现，实际应包含更多上下文信息
    const key = {
      userId: context.userId,
      userRoles: context.userRoles,
      action: context.action,
      fileType: context.file?.type,
      fileExtension: context.file?.extension,
      fileSize: context.file?.size,
    };
    return JSON.stringify(key);
  }

  /**
   * 获取缓存结果
   */
  private _getCachedResult(cacheKey: string): PermissionCheckResult | null {
    const cached = this._ruleCache.get(cacheKey);
    if (cached) {
      const now = Date.now();
      if (now - cached.timestamp < (this._options.ruleCacheExpiry || 60000)) {
        return cached.result;
      }
      // 缓存过期，删除
      this._ruleCache.delete(cacheKey);
    }
    return null;
  }

  /**
   * 缓存结果
   */
  private _cacheResult(cacheKey: string, result: PermissionCheckResult): void {
    this._ruleCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 清除缓存
   */
  private _clearCache(): void {
    this._ruleCache.clear();
  }

  /**
   * 记录权限检查
   */
  private _logPermissionCheck(
    context: PermissionContext,
    result: PermissionCheckResult
  ): void {
    const logLevel = result.allowed ? 'info' : 'warn';
    const action = context.action;
    const file = context.file ? `文件 "${context.file.name}"` : '资源';
    const user = context.userId ? `用户 "${context.userId}"` : '匿名用户';
    const message = `${user} 对 ${file} 的 ${action} 操作 ${
      result.allowed ? '被允许' : '被拒绝'
    }`;

    this._logger[logLevel](message, {
      context,
      result,
    });
  }

  /**
   * 更新选项
   * @param options 新选项
   */
  public updateOptions(options: Partial<PermissionManagerOptions>): void {
    this._options = { ...this._options, ...options };

    // 如果缓存配置发生变化，清除缓存
    if (
      options.enableRuleCache === false ||
      options.ruleCacheExpiry !== undefined
    ) {
      this._clearCache();
    }
  }

  /**
   * 销毁实例
   */
  public destroy(): void {
    this._clearCache();
    this._rules = [];
  }
}
