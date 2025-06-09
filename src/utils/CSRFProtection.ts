/**
 * CSRFProtection
 * CSRF防护工具，用于管理CSRF令牌，自动刷新和添加到请求中
 */

/**
 * CSRF防护选项
 */
export interface CSRFProtectionOptions {
  /**
   * CSRF令牌获取URL
   */
  tokenUrl: string;

  /**
   * 令牌头名称
   */
  headerName: string;

  /**
   * 包含凭证（cookies）
   */
  includeCredentials?: boolean;

  /**
   * 令牌生命周期（毫秒）
   */
  tokenLifetime?: number;

  /**
   * 是否自动刷新令牌
   */
  autoRefresh?: boolean;

  /**
   * 刷新阈值（剩余有效期百分比，0-1）
   */
  refreshThreshold?: number;

  /**
   * 存储键名
   */
  storageKey?: string;

  /**
   * 是否使用本地存储持久化令牌
   */
  useLocalStorage?: boolean;
}

/**
 * CSRF令牌信息
 */
interface TokenInfo {
  /**
   * 令牌值
   */
  token: string;

  /**
   * 过期时间（时间戳）
   */
  expiresAt: number;
}

/**
 * CSRF防护类，使用单例模式
 */
export class CSRFProtection {
  private static instance: CSRFProtection | null = null;

  // 默认选项
  private readonly options: Required<CSRFProtectionOptions>;
  private tokenInfo: TokenInfo | null = null;
  private refreshTimer: number | null = null;

  /**
   * 获取CSRFProtection实例
   * @param options 配置选项
   * @returns CSRFProtection实例
   */
  public static getInstance(options?: CSRFProtectionOptions): CSRFProtection {
    if (!this.instance) {
      this.instance = new CSRFProtection(
        options || { tokenUrl: '', headerName: '' }
      );
    } else if (options) {
      // 更新现有实例的选项
      this.instance.updateOptions(options);
    }
    return this.instance;
  }

  /**
   * 创建CSRFProtection实例
   * @param options 配置选项
   */
  private constructor(options: CSRFProtectionOptions) {
    // 设置默认选项
    this.options = {
      tokenUrl: options.tokenUrl,
      headerName: options.headerName,
      includeCredentials: options.includeCredentials ?? true,
      tokenLifetime: options.tokenLifetime ?? 30 * 60 * 1000, // 默认30分钟
      autoRefresh: options.autoRefresh ?? true,
      refreshThreshold: options.refreshThreshold ?? 0.2, // 剩余20%有效期时刷新
      storageKey: options.storageKey ?? 'csrf_token_info',
      useLocalStorage: options.useLocalStorage ?? true,
    };

    // 从存储中恢复令牌
    this.restoreToken();

    // 如果启用自动刷新，检查是否需要刷新令牌
    if (this.options.autoRefresh && this.tokenInfo) {
      this.scheduleRefresh();
    }
  }

  /**
   * 更新选项
   * @param options 新选项
   */
  private updateOptions(options: CSRFProtectionOptions): void {
    // 更新选项
    this.options = {
      ...this.options,
      ...options,
    };

    // 如果URL或头名称发生变化，清除现有令牌
    if (
      options.tokenUrl !== undefined &&
      options.tokenUrl !== this.options.tokenUrl
    ) {
      this.clearToken();
    }

    // 如果启用自动刷新，重新调度
    if (this.options.autoRefresh && this.tokenInfo) {
      this.scheduleRefresh();
    }
  }

  /**
   * 获取CSRF令牌
   * @returns 令牌值Promise
   */
  public async getToken(): Promise<string> {
    // 检查令牌是否存在且有效
    const now = Date.now();

    if (this.tokenInfo && this.tokenInfo.expiresAt > now) {
      // 如果启用自动刷新且接近过期，刷新令牌
      const remainingTime = this.tokenInfo.expiresAt - now;
      const threshold =
        this.options.tokenLifetime * this.options.refreshThreshold;

      if (this.options.autoRefresh && remainingTime < threshold) {
        return this.refreshToken();
      }

      return this.tokenInfo.token;
    }

    // 如果令牌不存在或已过期，获取新令牌
    return this.refreshToken();
  }

  /**
   * 刷新CSRF令牌
   * @returns 新令牌值Promise
   */
  public async refreshToken(): Promise<string> {
    try {
      const response = await fetch(this.options.tokenUrl, {
        method: 'GET',
        credentials: this.options.includeCredentials
          ? 'include'
          : 'same-origin',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch CSRF token: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const token = data.token ?? data.csrf ?? data.csrfToken;

      if (!token) {
        throw new Error('CSRF token not found in response');
      }

      // 设置令牌并返回
      this.setToken(token);
      return token;
    } catch (error) {
      // 如果仍有有效令牌，则继续使用
      if (this.tokenInfo?.token && this.tokenInfo.expiresAt > Date.now()) {
        return this.tokenInfo.token;
      }

      throw error;
    }
  }

  /**
   * 获取包含CSRF令牌的请求头
   * @returns 请求头对象Promise
   */
  public async getCSRFHeader(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { [this.options.headerName]: token };
  }

  /**
   * 将CSRF令牌添加到现有请求头
   * @param headers 现有请求头
   * @returns 合并后的请求头Promise
   */
  public async appendToHeaders(
    headers: Record<string, string>
  ): Promise<Record<string, string>> {
    const csrfHeader = await this.getCSRFHeader();
    return { ...headers, ...csrfHeader };
  }

  /**
   * 设置CSRF令牌
   * @param token 令牌值
   */
  private setToken(token: string): void {
    const expiresAt = Date.now() + this.options.tokenLifetime;

    this.tokenInfo = { token, expiresAt };

    // 如果启用本地存储，则保存令牌
    if (this.options.useLocalStorage) {
      this.persistToken();
    }

    // 如果启用自动刷新，则调度刷新
    if (this.options.autoRefresh) {
      this.scheduleRefresh();
    }
  }

  /**
   * 清除CSRF令牌
   */
  public clearToken(): void {
    this.tokenInfo = null;

    // 清除存储中的令牌
    if (this.options.useLocalStorage && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.options.storageKey);
    }

    // 清除刷新定时器
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * 将令牌持久化到本地存储
   */
  private persistToken(): void {
    if (
      this.options.useLocalStorage &&
      typeof localStorage !== 'undefined' &&
      this.tokenInfo
    ) {
      try {
        localStorage.setItem(
          this.options.storageKey,
          JSON.stringify(this.tokenInfo)
        );
      } catch (error) {
        // 忽略存储错误
        console.warn('Failed to persist CSRF token:', error);
      }
    }
  }

  /**
   * 从本地存储恢复令牌
   */
  private restoreToken(): void {
    if (this.options.useLocalStorage && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(this.options.storageKey);

        if (stored) {
          const parsed = JSON.parse(stored) as TokenInfo;

          // 仅在令牌未过期时恢复
          if (parsed && parsed.expiresAt > Date.now()) {
            this.tokenInfo = parsed;
          } else {
            // 如果令牌已过期，则清除存储
            localStorage.removeItem(this.options.storageKey);
          }
        }
      } catch (error) {
        // 忽略解析错误
        console.warn('Failed to restore CSRF token:', error);
      }
    }
  }

  /**
   * 调度令牌刷新
   */
  private scheduleRefresh(): void {
    if (!this.options.autoRefresh || !this.tokenInfo) {
      return;
    }

    // 清除现有定时器
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const now = Date.now();
    const expiresAt = this.tokenInfo.expiresAt;

    // 计算刷新时间（在剩余有效期达到阈值时刷新）
    const refreshThreshold =
      this.options.tokenLifetime * this.options.refreshThreshold;
    const refreshAt = expiresAt - refreshThreshold;

    // 如果已经到了刷新时间，立即刷新
    if (refreshAt <= now) {
      this.refreshToken().catch(() => {
        // 如果刷新失败，稍后重试
        setTimeout(() => this.scheduleRefresh(), 5000);
      });
      return;
    }

    // 设置定时器在适当时间刷新令牌
    const delay = refreshAt - now;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshToken().catch(() => {
        // 如果刷新失败，稍后重试
        setTimeout(() => this.scheduleRefresh(), 5000);
      });
    }, delay);
  }
}
