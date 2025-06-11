/**
 * PermissionChecker
 * 文件上传权限检查器，提供权限验证和管理功能
 */

/**
 * 权限类型枚举
 */
export enum PermissionType {
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  DELETE = 'delete',
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

/**
 * 权限级别枚举
 */
export enum PermissionLevel {
  NONE = 0,
  BASIC = 1,
  STANDARD = 2,
  ADVANCED = 3,
  ADMIN = 4,
}

/**
 * 用户角色枚举
 */
export enum UserRole {
  GUEST = 'guest',
  USER = 'user',
  EDITOR = 'editor',
  ADMIN = 'admin',
}

/**
 * 权限状态接口
 */
export interface PermissionState {
  authenticated: boolean;
  currentRole: UserRole;
  permissions: Map<PermissionType, boolean>;
  customPermissions: Map<string, boolean>;
  permissionLevel: PermissionLevel;
  expiresAt?: number;
}

/**
 * 权限检查选项
 */
export interface PermissionCheckerOptions {
  /**
   * 是否自动检查网络权限
   * @default true
   */
  checkNetworkPermission?: boolean;

  /**
   * 是否自动检查存储权限
   * @default true
   */
  checkStoragePermission?: boolean;

  /**
   * 默认角色
   * @default UserRole.GUEST
   */
  defaultRole?: UserRole;

  /**
   * 权限令牌
   */
  token?: string;

  /**
   * 验证API URL
   */
  authCheckUrl?: string;

  /**
   * 是否缓存权限状态
   * @default true
   */
  cachePermissions?: boolean;

  /**
   * 权限缓存有效期（毫秒）
   * @default 300000 (5分钟)
   */
  cacheDuration?: number;

  /**
   * 文件大小限制（字节）
   */
  maxFileSize?: number;

  /**
   * 允许的MIME类型
   */
  allowedMimeTypes?: string[];

  /**
   * 文件扩展名限制
   */
  allowedExtensions?: string[];

  /**
   * 是否在会话中持久化权限
   * @default true
   */
  persistPermissions?: boolean;

  /**
   * IP地址白名单
   */
  ipWhitelist?: string[];

  /**
   * 地理位置限制
   */
  geoRestrictions?: string[];
}

/**
 * 权限校验结果
 */
export interface PermissionResult {
  granted: boolean;
  reason?: string;
  details?: Record<string, any>;
}

/**
 * 权限检查器
 * 提供文件上传权限验证和管理
 */
export default class PermissionChecker {
  private static instance: PermissionChecker | null = null;
  private options: Required<PermissionCheckerOptions>;
  private permissionState: PermissionState;

  // 角色到权限级别的映射
  private static readonly ROLE_LEVEL_MAP: Record<UserRole, PermissionLevel> = {
    [UserRole.GUEST]: PermissionLevel.BASIC,
    [UserRole.USER]: PermissionLevel.STANDARD,
    [UserRole.EDITOR]: PermissionLevel.ADVANCED,
    [UserRole.ADMIN]: PermissionLevel.ADMIN,
  };

  // 角色到权限的映射
  private static readonly ROLE_PERMISSIONS: Record<UserRole, PermissionType[]> =
    {
      [UserRole.GUEST]: [PermissionType.READ],
      [UserRole.USER]: [
        PermissionType.READ,
        PermissionType.UPLOAD,
        PermissionType.DOWNLOAD,
      ],
      [UserRole.EDITOR]: [
        PermissionType.READ,
        PermissionType.UPLOAD,
        PermissionType.DOWNLOAD,
        PermissionType.WRITE,
      ],
      [UserRole.ADMIN]: [
        PermissionType.READ,
        PermissionType.UPLOAD,
        PermissionType.DOWNLOAD,
        PermissionType.WRITE,
        PermissionType.DELETE,
        PermissionType.ADMIN,
      ],
    };

  /**
   * 获取PermissionChecker实例
   * @param options 权限检查选项
   * @returns PermissionChecker实例
   */
  public static getInstance(
    options?: PermissionCheckerOptions
  ): PermissionChecker {
    if (!this.instance) {
      this.instance = new PermissionChecker(options || {});
    } else if (options) {
      this.instance.updateOptions(options);
    }
    return this.instance;
  }

  /**
   * 创建权限检查器实例
   * @param options 权限检查选项
   */
  private constructor(options: PermissionCheckerOptions) {
    this.options = {
      checkNetworkPermission: options.checkNetworkPermission ?? true,
      checkStoragePermission: options.checkStoragePermission ?? true,
      defaultRole: options.defaultRole ?? UserRole.GUEST,
      token: options.token ?? '',
      authCheckUrl: options.authCheckUrl ?? '',
      cachePermissions: options.cachePermissions ?? true,
      cacheDuration: options.cacheDuration ?? 5 * 60 * 1000, // 5分钟
      maxFileSize: options.maxFileSize ?? Number.MAX_SAFE_INTEGER,
      allowedMimeTypes: options.allowedMimeTypes ?? [],
      allowedExtensions: options.allowedExtensions ?? [],
      persistPermissions: options.persistPermissions ?? true,
      ipWhitelist: options.ipWhitelist ?? [],
      geoRestrictions: options.geoRestrictions ?? [],
    };

    // 初始化权限状态
    this.permissionState = {
      authenticated: false,
      currentRole: this.options.defaultRole,
      permissions: new Map(),
      customPermissions: new Map(),
      permissionLevel:
        PermissionChecker.ROLE_LEVEL_MAP[this.options.defaultRole],
    };

    // 从存储中恢复权限状态
    if (this.options.persistPermissions) {
      this.restorePermissionState();
    }

    // 初始化默认权限
    this.initializeDefaultPermissions();
  }

  /**
   * 更新选项
   * @param options 新选项
   */
  private updateOptions(options: PermissionCheckerOptions): void {
    this.options = {
      ...this.options,
      ...options,
    };

    // 如果提供了令牌，重新验证权限
    if (options.token) {
      this.validateToken(options.token);
    }
  }

  /**
   * 初始化默认权限
   */
  private initializeDefaultPermissions(): void {
    const role = this.permissionState.currentRole;

    // 根据角色设置默认权限
    Object.values(PermissionType).forEach(permType => {
      const hasPermission = PermissionChecker.ROLE_PERMISSIONS[role].includes(
        permType as PermissionType
      );
      this.permissionState.permissions.set(
        permType as PermissionType,
        hasPermission
      );
    });

    // 设置权限级别
    this.permissionState.permissionLevel =
      PermissionChecker.ROLE_LEVEL_MAP[role];
  }

  /**
   * 验证权限令牌
   * @param token 权限令牌
   * @returns 验证结果Promise
   */
  public async validateToken(token: string): Promise<boolean> {
    try {
      // 如果提供了验证URL，使用远程验证
      if (this.options.authCheckUrl && token) {
        const response = await fetch(this.options.authCheckUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          throw new Error(
            `权限验证失败: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        // 更新权限状态
        this.permissionState.authenticated = true;
        this.permissionState.currentRole =
          data.role || this.options.defaultRole;
        this.permissionState.permissionLevel =
          PermissionChecker.ROLE_LEVEL_MAP[this.permissionState.currentRole];

        // 如果服务器返回了具体权限，更新权限映射
        if (data.permissions && Array.isArray(data.permissions)) {
          data.permissions.forEach((perm: string) => {
            if (perm in PermissionType) {
              this.permissionState.permissions.set(
                perm as PermissionType,
                true
              );
            } else {
              this.permissionState.customPermissions.set(perm, true);
            }
          });
        } else {
          // 否则使用基于角色的默认权限
          this.initializeDefaultPermissions();
        }

        // 设置过期时间
        if (data.expiresIn) {
          this.permissionState.expiresAt = Date.now() + data.expiresIn * 1000;
        }

        // 持久化权限状态
        if (this.options.persistPermissions) {
          this.persistPermissionState();
        }

        return true;
      }

      // 简单令牌验证（适用于无后端场景）
      // 实际项目中应替换为更安全的验证逻辑
      if (token && token.length > 10) {
        this.permissionState.authenticated = true;
        this.permissionState.currentRole = UserRole.USER;
        this.permissionState.permissionLevel = PermissionLevel.STANDARD;
        this.initializeDefaultPermissions();

        // 持久化权限状态
        if (this.options.persistPermissions) {
          this.persistPermissionState();
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('权限验证失败:', error);
      return false;
    }
  }

  /**
   * 检查是否有指定权限
   * @param permissionType 权限类型
   * @returns 检查结果
   */
  public hasPermission(permissionType: PermissionType | string): boolean {
    // 检查权限是否过期
    if (this.isPermissionExpired()) {
      this.logout();
      return false;
    }

    // 管理员拥有所有权限
    if (this.permissionState.currentRole === UserRole.ADMIN) {
      return true;
    }

    // 检查标准权限
    if (
      Object.values(PermissionType).includes(permissionType as PermissionType)
    ) {
      return (
        this.permissionState.permissions.get(
          permissionType as PermissionType
        ) || false
      );
    }

    // 检查自定义权限
    return this.permissionState.customPermissions.get(permissionType) || false;
  }

  /**
   * 检查是否有足够的权限级别
   * @param requiredLevel 所需权限级别
   * @returns 是否满足级别要求
   */
  public hasPermissionLevel(requiredLevel: PermissionLevel): boolean {
    return this.permissionState.permissionLevel >= requiredLevel;
  }

  /**
   * 检查权限是否已过期
   * @returns 是否过期
   */
  private isPermissionExpired(): boolean {
    if (!this.permissionState.expiresAt) return false;
    return Date.now() > this.permissionState.expiresAt;
  }

  /**
   * 检查上传权限
   * @param file 文件对象
   * @returns 权限检查结果
   */
  public async checkUploadPermission(file: File): Promise<PermissionResult> {
    // 首先检查用户是否有上传权限
    if (!this.hasPermission(PermissionType.UPLOAD)) {
      return {
        granted: false,
        reason: '用户无上传权限',
      };
    }

    // 检查文件大小
    if (file.size > this.options.maxFileSize) {
      return {
        granted: false,
        reason: '文件大小超过限制',
        details: {
          fileSize: file.size,
          maxAllowedSize: this.options.maxFileSize,
        },
      };
    }

    // 检查文件类型
    if (
      this.options.allowedMimeTypes.length > 0 &&
      !this.options.allowedMimeTypes.includes(file.type)
    ) {
      return {
        granted: false,
        reason: '文件类型不允许',
        details: {
          fileType: file.type,
          allowedTypes: this.options.allowedMimeTypes,
        },
      };
    }

    // 检查文件扩展名
    const extension = this.getFileExtension(file.name).toLowerCase();
    if (
      this.options.allowedExtensions.length > 0 &&
      !this.options.allowedExtensions.includes(extension)
    ) {
      return {
        granted: false,
        reason: '文件扩展名不允许',
        details: {
          extension,
          allowedExtensions: this.options.allowedExtensions,
        },
      };
    }

    // 检查网络权限
    if (
      this.options.checkNetworkPermission &&
      !(await this.checkNetworkPermission())
    ) {
      return {
        granted: false,
        reason: '网络权限不足',
      };
    }

    // 检查存储权限
    if (
      this.options.checkStoragePermission &&
      !(await this.checkStoragePermission())
    ) {
      return {
        granted: false,
        reason: '存储权限不足',
      };
    }

    // IP白名单检查
    if (this.options.ipWhitelist.length > 0) {
      try {
        const ipCheckResult = await this.checkIpWhitelist();
        if (!ipCheckResult.granted) {
          return ipCheckResult;
        }
      } catch (error) {
        console.warn('IP白名单检查失败:', error);
        // IP检查失败不阻止上传，但记录警告
      }
    }

    // 地理位置限制检查
    if (this.options.geoRestrictions.length > 0) {
      try {
        const geoCheckResult = await this.checkGeoRestrictions();
        if (!geoCheckResult.granted) {
          return geoCheckResult;
        }
      } catch (error) {
        console.warn('地理位置检查失败:', error);
        // 地理位置检查失败不阻止上传，但记录警告
      }
    }

    // 所有检查通过
    return {
      granted: true,
    };
  }

  /**
   * 检查网络权限
   * @returns 是否有网络权限
   */
  private async checkNetworkPermission(): Promise<boolean> {
    // 如果是离线状态，直接返回false
    if (
      typeof navigator !== 'undefined' &&
      'onLine' in navigator &&
      !navigator.onLine
    ) {
      return false;
    }

    // 简单的网络连接测试
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/network-check', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      }).catch(() => null);

      clearTimeout(timeoutId);
      return !!response && response.ok;
    } catch (error) {
      // 网络测试失败，但不一定意味着没有权限
      // 可能是服务端没有实现/network-check端点
      return true;
    }
  }

  /**
   * 检查存储权限
   * @returns 是否有存储权限
   */
  private async checkStoragePermission(): Promise<boolean> {
    // 检查IndexedDB访问权限
    if (typeof indexedDB !== 'undefined') {
      try {
        const dbName = '_permission_test_db';
        const request = indexedDB.open(dbName, 1);

        return new Promise<boolean>(resolve => {
          request.onerror = () => resolve(false);
          request.onsuccess = event => {
            const db = (event.target as IDBOpenDBRequest).result;
            db.close();
            indexedDB.deleteDatabase(dbName);
            resolve(true);
          };
        });
      } catch (error) {
        return false;
      }
    }

    // 检查localStorage访问权限
    if (typeof localStorage !== 'undefined') {
      try {
        const testKey = '_permission_test_key';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        return true;
      } catch (error) {
        return false;
      }
    }

    // 如果以上API都不支持，假设没有存储权限
    return false;
  }

  /**
   * 检查IP白名单
   * @returns IP检查结果
   */
  private async checkIpWhitelist(): Promise<PermissionResult> {
    try {
      // 实际项目中应使用服务端API获取客户端IP
      // 这里使用模拟实现
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      const clientIp = ipData.ip;

      if (!this.options.ipWhitelist.includes(clientIp)) {
        return {
          granted: false,
          reason: 'IP地址不在白名单中',
          details: {
            clientIp,
          },
        };
      }

      return { granted: true };
    } catch (error) {
      console.error('IP检查失败:', error);
      throw error;
    }
  }

  /**
   * 检查地理位置限制
   * @returns 地理位置检查结果
   */
  private async checkGeoRestrictions(): Promise<PermissionResult> {
    try {
      // 实际项目中应使用地理位置API或服务端接口
      // 这里使用模拟实现
      const geoResponse = await fetch('https://ipapi.co/json/');
      const geoData = await geoResponse.json();
      const country = geoData.country_code;

      if (this.options.geoRestrictions.includes(country)) {
        return {
          granted: false,
          reason: '该地区不允许上传',
          details: {
            country,
            restrictedRegions: this.options.geoRestrictions,
          },
        };
      }

      return { granted: true };
    } catch (error) {
      console.error('地理位置检查失败:', error);
      throw error;
    }
  }

  /**
   * 获取文件扩展名
   * @param filename 文件名
   * @returns 扩展名
   */
  private getFileExtension(filename: string): string {
    return filename.split('.').pop() || '';
  }

  /**
   * 获取当前用户角色
   * @returns 用户角色
   */
  public getCurrentRole(): UserRole {
    return this.permissionState.currentRole;
  }

  /**
   * 设置用户角色和对应权限
   * @param role 用户角色
   */
  public setRole(role: UserRole): void {
    this.permissionState.currentRole = role;
    this.permissionState.permissionLevel =
      PermissionChecker.ROLE_LEVEL_MAP[role];
    this.initializeDefaultPermissions();

    // 持久化权限状态
    if (this.options.persistPermissions) {
      this.persistPermissionState();
    }
  }

  /**
   * 授予特定权限
   * @param permissionType 权限类型
   */
  public grantPermission(permissionType: PermissionType | string): void {
    if (
      Object.values(PermissionType).includes(permissionType as PermissionType)
    ) {
      this.permissionState.permissions.set(
        permissionType as PermissionType,
        true
      );
    } else {
      this.permissionState.customPermissions.set(permissionType, true);
    }

    // 持久化权限状态
    if (this.options.persistPermissions) {
      this.persistPermissionState();
    }
  }

  /**
   * 撤销特定权限
   * @param permissionType 权限类型
   */
  public revokePermission(permissionType: PermissionType | string): void {
    if (
      Object.values(PermissionType).includes(permissionType as PermissionType)
    ) {
      this.permissionState.permissions.set(
        permissionType as PermissionType,
        false
      );
    } else {
      this.permissionState.customPermissions.set(permissionType, false);
    }

    // 持久化权限状态
    if (this.options.persistPermissions) {
      this.persistPermissionState();
    }
  }

  /**
   * 用户登出
   * 清除所有权限状态
   */
  public logout(): void {
    // 重置为默认状态
    this.permissionState = {
      authenticated: false,
      currentRole: this.options.defaultRole,
      permissions: new Map(),
      customPermissions: new Map(),
      permissionLevel:
        PermissionChecker.ROLE_LEVEL_MAP[this.options.defaultRole],
    };

    // 初始化默认权限
    this.initializeDefaultPermissions();

    // 清除持久化的权限状态
    if (this.options.persistPermissions) {
      this.clearPersistedState();
    }
  }

  /**
   * 持久化权限状态到存储
   */
  private persistPermissionState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const serializedState = {
          authenticated: this.permissionState.authenticated,
          currentRole: this.permissionState.currentRole,
          permissions: Array.from(this.permissionState.permissions.entries()),
          customPermissions: Array.from(
            this.permissionState.customPermissions.entries()
          ),
          permissionLevel: this.permissionState.permissionLevel,
          expiresAt: this.permissionState.expiresAt,
        };

        localStorage.setItem(
          'permission_state',
          JSON.stringify(serializedState)
        );
      } catch (error) {
        console.error('权限状态持久化失败:', error);
      }
    }
  }

  /**
   * 从存储中恢复权限状态
   */
  private restorePermissionState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const savedState = localStorage.getItem('permission_state');

        if (savedState) {
          const parsedState = JSON.parse(savedState);

          // 检查是否过期
          if (parsedState.expiresAt && Date.now() > parsedState.expiresAt) {
            // 如果过期，清除存储的状态
            this.clearPersistedState();
            return;
          }

          this.permissionState.authenticated = parsedState.authenticated;
          this.permissionState.currentRole = parsedState.currentRole;
          this.permissionState.permissionLevel = parsedState.permissionLevel;
          this.permissionState.expiresAt = parsedState.expiresAt;

          // 恢复权限Map
          this.permissionState.permissions = new Map(parsedState.permissions);
          this.permissionState.customPermissions = new Map(
            parsedState.customPermissions
          );
        }
      } catch (error) {
        console.error('权限状态恢复失败:', error);
        // 恢复失败，初始化默认权限
        this.initializeDefaultPermissions();
      }
    }
  }

  /**
   * 清除持久化的状态
   */
  private clearPersistedState(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('permission_state');
      } catch (error) {
        console.error('清除权限状态失败:', error);
      }
    }
  }
}
