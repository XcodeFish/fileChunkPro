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
   * 存储方式：'memory'(仅内存), 'cookie'(安全cookie), 'localStorage'(本地存储)
   * @default 'memory'
   */
  storageMode?: 'memory' | 'cookie' | 'localStorage';

  /**
   * Cookie选项（当storageMode为'cookie'时使用）
   */
  cookieOptions?: {
    /**
     * 是否设置为HttpOnly （推荐，防止XSS攻击）
     * @default true
     */
    httpOnly?: boolean;

    /**
     * 是否设置为Secure（推荐，需要HTTPS）
     * @default true
     */
    secure?: boolean;

    /**
     * 是否设置为SameSite=Strict（推荐，防止CSRF）
     * @default true
     */
    sameSite?: 'Strict' | 'Lax' | 'None';

    /**
     * Cookie路径
     * @default '/'
     */
    path?: string;

    /**
     * Cookie域名
     */
    domain?: string;
  };
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
      storageMode: options.storageMode ?? 'memory',
      cookieOptions: {
        httpOnly: options.cookieOptions?.httpOnly ?? true,
        secure: options.cookieOptions?.secure ?? true,
        sameSite: options.cookieOptions?.sameSite ?? 'Strict',
        path: options.cookieOptions?.path ?? '/',
        domain: options.cookieOptions?.domain,
        ...options.cookieOptions,
      },
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
      cookieOptions: {
        ...this.options.cookieOptions,
        ...options.cookieOptions,
      },
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
      // 添加防止缓存的查询参数
      const timestamp = Date.now();
      const url = this.options.tokenUrl.includes('?')
        ? `${this.options.tokenUrl}&_=${timestamp}`
        : `${this.options.tokenUrl}?_=${timestamp}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: this.options.includeCredentials
          ? 'include'
          : 'same-origin',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
          Pragma: 'no-cache',
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
      console.error('Failed to refresh CSRF token:', error);
      // 如果有现有令牌，继续使用，避免完全中断功能
      if (this.tokenInfo?.token) {
        return this.tokenInfo.token;
      }
      throw error;
    }
  }

  /**
   * 获取CSRF请求头
   * @returns 包含CSRF令牌的请求头对象
   */
  public async getCSRFHeader(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { [this.options.headerName]: token };
  }

  /**
   * 添加CSRF令牌到现有请求头
   * @param headers 现有请求头对象
   * @returns 添加CSRF令牌后的请求头对象
   */
  public async appendToHeaders(
    headers: Record<string, string>
  ): Promise<Record<string, string>> {
    const csrfHeader = await this.getCSRFHeader();
    return { ...headers, ...csrfHeader };
  }

  /**
   * 设置令牌
   * @param token 令牌值
   */
  private setToken(token: string): void {
    // 设置令牌信息
    this.tokenInfo = {
      token,
      expiresAt: Date.now() + this.options.tokenLifetime,
    };

    // 持久化令牌
    this.persistToken();

    // 如果启用自动刷新，设置刷新计时器
    if (this.options.autoRefresh) {
      this.scheduleRefresh();
    }
  }

  /**
   * 清除令牌
   */
  public clearToken(): void {
    // 清除内存中的令牌
    this.tokenInfo = null;

    // 清除刷新计时器
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // 清除持久化的令牌
    this.clearPersistedToken();
  }

  /**
   * 持久化令牌
   */
  private persistToken(): void {
    if (!this.tokenInfo) return;

    try {
      const tokenData = JSON.stringify({
        token: this.tokenInfo.token,
        expiresAt: this.tokenInfo.expiresAt,
      });

      // 根据存储模式选择不同的存储方式
      switch (this.options.storageMode) {
        case 'localStorage':
          // 警告：localStorage方式容易受到XSS攻击
          console.warn(
            'Warning: Using localStorage for CSRF token storage is vulnerable to XSS attacks'
          );
          localStorage.setItem(this.options.storageKey, tokenData);
          break;

        case 'cookie':
          // 使用安全的cookie存储（通过服务端设置）
          this.setSecureCookie(this.options.storageKey, tokenData);
          break;

        case 'memory':
        default:
          // 内存存储（不持久化）
          break;
      }
    } catch (error) {
      console.error('Failed to persist CSRF token:', error);
    }
  }

  /**
   * 从存储中恢复令牌
   */
  private restoreToken(): void {
    try {
      let tokenData: string | null = null;

      // 根据存储模式选择不同的恢复方式
      switch (this.options.storageMode) {
        case 'localStorage':
          tokenData = localStorage.getItem(this.options.storageKey);
          break;

        case 'cookie':
          tokenData = this.getSecureCookie(this.options.storageKey);
          break;

        case 'memory':
        default:
          // 内存存储不需要恢复
          return;
      }

      if (tokenData) {
        const { token, expiresAt } = JSON.parse(tokenData);

        // 检查令牌是否过期
        if (expiresAt && expiresAt > Date.now()) {
          this.tokenInfo = { token, expiresAt };
        } else {
          // 令牌已过期，清除
          this.clearPersistedToken();
        }
      }
    } catch (error) {
      console.error('Failed to restore CSRF token:', error);
    }
  }

  /**
   * 设置安全的CSRF令牌Cookie
   * @param key Cookie键名
   * @param value Cookie值
   */
  private setSecureCookie(key: string, value: string): void {
    // 注意：由于前端设置的cookie无法设置为HttpOnly，这需要服务端配合
    // 这里我们设置客户端能设置的最大安全级别
    const { cookieOptions } = this.options;
    const cookieString = [
      `${key}=${encodeURIComponent(value)}`,
      `path=${cookieOptions.path || '/'}`,
      cookieOptions.domain ? `domain=${cookieOptions.domain}` : '',
      cookieOptions.secure ? 'secure' : '',
      `SameSite=${cookieOptions.sameSite || 'Strict'}`,
      `expires=${new Date(this.tokenInfo!.expiresAt).toUTCString()}`,
    ]
      .filter(Boolean)
      .join('; ');

    // 设置cookie
    document.cookie = cookieString;

    // 添加警告，因为从前端设置的cookie不能为HttpOnly
    if (cookieOptions.httpOnly) {
      console.warn(
        'Warning: HttpOnly flag for CSRF token cookie must be set from server-side. ' +
          'Current cookie is not HttpOnly and might be vulnerable to XSS attacks.'
      );
    }
  }

  /**
   * 获取CSRF令牌Cookie
   * @param key Cookie键名
   * @returns Cookie值
   */
  private getSecureCookie(key: string): string | null {
    const cookiePattern = new RegExp(`(^|;)\\s*${key}\\s*=\\s*([^;]+)`);
    const match = document.cookie.match(cookiePattern);
    return match ? decodeURIComponent(match[2]) : null;
  }

  /**
   * 清除持久化的令牌
   */
  private clearPersistedToken(): void {
    try {
      switch (this.options.storageMode) {
        case 'localStorage':
          localStorage.removeItem(this.options.storageKey);
          break;

        case 'cookie':
          // 通过设置过期时间为过去，删除cookie
          document.cookie = `${this.options.storageKey}=; path=${this.options.cookieOptions.path || '/'}; ${
            this.options.cookieOptions.domain
              ? `domain=${this.options.cookieOptions.domain};`
              : ''
          } expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          break;

        case 'memory':
        default:
          break;
      }
    } catch (error) {
      console.error('Failed to clear persisted CSRF token:', error);
    }
  }

  /**
   * 调度令牌刷新
   */
  private scheduleRefresh(): void {
    // 清除现有的计时器
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }

    if (!this.tokenInfo) return;

    // 计算刷新时间（令牌剩余有效期的80%后刷新）
    const now = Date.now();
    const remainingTime = this.tokenInfo.expiresAt - now;
    const refreshTime = remainingTime * (1 - this.options.refreshThreshold);

    // 设置计时器
    this.refreshTimer = window.setTimeout(() => {
      this.refreshToken().catch(error => {
        console.error('Failed to auto refresh CSRF token:', error);
      });
    }, refreshTime);
  }

  /**
   * 获取一个新的nonce值，用于防止重放攻击
   * @returns 随机生成的nonce
   */
  public generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join(
      ''
    );
  }

  /**
   * 添加防重放nonce和时间戳到请求
   * @param headers 现有请求头对象
   * @returns 添加了防重放参数的请求头
   */
  public async addAntiReplayHeaders(
    headers: Record<string, string>
  ): Promise<Record<string, string>> {
    // 添加CSRF令牌
    const withCsrf = await this.appendToHeaders(headers);

    // 添加nonce和时间戳
    const nonce = this.generateNonce();
    const timestamp = Date.now().toString();

    return {
      ...withCsrf,
      'X-Request-Nonce': nonce,
      'X-Request-Timestamp': timestamp,
    };
  }
}
