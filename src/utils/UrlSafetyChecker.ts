/**
 * UrlSafetyChecker - URL安全性检查工具
 * 负责检查URL的安全性，防止恶意URL、SSRF等攻击
 */

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface UrlSafetyOptions {
  /**
   * 允许的协议列表
   */
  allowedProtocols?: string[];

  /**
   * 允许的域名列表
   */
  allowedDomains?: string[];

  /**
   * 允许的IP地址列表
   */
  allowedIPs?: string[];

  /**
   * 是否允许私有IP地址
   */
  allowPrivateIPs?: boolean;

  /**
   * 是否允许环回地址
   */
  allowLoopback?: boolean;

  /**
   * 是否检查URL路径
   */
  checkPath?: boolean;

  /**
   * 是否检查URL查询参数
   */
  checkQueryParams?: boolean;

  /**
   * 危险的路径模式列表
   */
  dangerousPaths?: RegExp[];

  /**
   * 危险的查询参数列表
   */
  dangerousParams?: string[];
}

/**
 * URL安全检查工具类
 */
export class UrlSafetyChecker {
  private options: UrlSafetyOptions;

  // 常见的危险路径模式
  private static readonly DEFAULT_DANGEROUS_PATHS: RegExp[] = [
    /\.\.\/|\.\.\\/, // 路径遍历
    /\/etc\/passwd/i, // 敏感文件
    /\/proc\//i, // 进程信息
    /\/var\/log/i, // 日志文件
    /\/config/i, // 配置文件
    /\/\.git/i, // .git目录
    /\/\.env/i, // .env文件
    /\/wp-config\.php/i, // WordPress配置
    /\/admin/i, // 管理面板
    /\/login/i, // 登录页面
    /\/phpinfo\.php/i, // PHP信息页
  ];

  // 常见的危险查询参数
  private static readonly DEFAULT_DANGEROUS_PARAMS: string[] = [
    'exec',
    'system',
    'passthru',
    'eval',
    'cmd',
    'command',
    'execute',
    'ping',
    'query',
    'jump',
    'redirect',
    'url',
    'uri',
    'path',
    'continue',
    'return',
    'next',
    'data',
    'reference',
    'site',
    'html',
    'file',
    'document',
    'folder',
    'root',
    'path',
    'pg',
    'style',
    'pdf',
    'template',
    'php_path',
    'load',
    'process',
    'action',
  ];

  // 私有网络IP范围
  private static readonly PRIVATE_IP_RANGES: Array<{
    min: number[];
    max: number[];
  }> = [
    { min: [10, 0, 0, 0], max: [10, 255, 255, 255] }, // 10.0.0.0/8
    { min: [172, 16, 0, 0], max: [172, 31, 255, 255] }, // 172.16.0.0/12
    { min: [192, 168, 0, 0], max: [192, 168, 255, 255] }, // 192.168.0.0/16
    { min: [127, 0, 0, 0], max: [127, 255, 255, 255] }, // 127.0.0.0/8 (环回)
    { min: [0, 0, 0, 0], max: [0, 255, 255, 255] }, // 0.0.0.0/8
    { min: [169, 254, 0, 0], max: [169, 254, 255, 255] }, // 169.254.0.0/16
    { min: [192, 0, 2, 0], max: [192, 0, 2, 255] }, // 192.0.2.0/24 (TEST-NET)
    { min: [192, 88, 99, 0], max: [192, 88, 99, 255] }, // 192.88.99.0/24
    { min: [198, 18, 0, 0], max: [198, 19, 255, 255] }, // 198.18.0.0/15
    { min: [198, 51, 100, 0], max: [198, 51, 100, 255] }, // 198.51.100.0/24 (TEST-NET-2)
    { min: [203, 0, 113, 0], max: [203, 0, 113, 255] }, // 203.0.113.0/24 (TEST-NET-3)
  ];

  /**
   * 创建URL安全检查工具实例
   * @param options 安全选项
   */
  constructor(options: UrlSafetyOptions = {}) {
    this.options = {
      allowedProtocols: ['https:', 'http:'],
      allowedDomains: [],
      allowedIPs: [],
      allowPrivateIPs: false,
      allowLoopback: false,
      checkPath: true,
      checkQueryParams: true,
      dangerousPaths: UrlSafetyChecker.DEFAULT_DANGEROUS_PATHS,
      dangerousParams: UrlSafetyChecker.DEFAULT_DANGEROUS_PARAMS,
      ...options,
    };
  }

  /**
   * 验证URL安全性
   * @param urlString 待验证的URL字符串
   * @returns 验证结果
   */
  public validateUrl(urlString: string): UrlValidationResult {
    try {
      // 步骤1: 基本URL格式验证
      let url: URL;
      try {
        url = new URL(urlString);
      } catch (error) {
        return {
          valid: false,
          reason: '无效的URL格式',
          riskLevel: 'medium',
        };
      }

      // 步骤2: 检查协议
      if (
        this.options.allowedProtocols &&
        this.options.allowedProtocols.length > 0 &&
        !this.options.allowedProtocols.includes(url.protocol)
      ) {
        return {
          valid: false,
          reason: `不允许的协议: ${url.protocol}`,
          riskLevel: 'high',
        };
      }

      // 步骤3: 检查域名/IP
      const hostname = url.hostname;

      // 检查是否为IP地址
      const isIP = this.isIPAddress(hostname);

      if (isIP) {
        // 检查是否为私有IP或环回地址
        if (this.isPrivateIP(hostname)) {
          // 如果是私有IP，检查是否允许
          if (!this.options.allowPrivateIPs) {
            return {
              valid: false,
              reason: `不允许访问私有IP地址: ${hostname}`,
              riskLevel: 'critical',
            };
          }
        }

        // 检查是否为环回地址
        if (this.isLoopbackIP(hostname)) {
          // 如果是环回地址，检查是否允许
          if (!this.options.allowLoopback) {
            return {
              valid: false,
              reason: `不允许访问环回地址: ${hostname}`,
              riskLevel: 'critical',
            };
          }
        }

        // 检查是否在允许的IP列表中
        if (
          this.options.allowedIPs &&
          this.options.allowedIPs.length > 0 &&
          !this.options.allowedIPs.includes(hostname)
        ) {
          return {
            valid: false,
            reason: `IP地址不在允许列表中: ${hostname}`,
            riskLevel: 'high',
          };
        }
      } else {
        // 检查域名是否在允许列表中
        if (
          this.options.allowedDomains &&
          this.options.allowedDomains.length > 0 &&
          !this.isDomainAllowed(hostname, this.options.allowedDomains)
        ) {
          return {
            valid: false,
            reason: `域名不在允许列表中: ${hostname}`,
            riskLevel: 'high',
          };
        }
      }

      // 步骤4: 检查路径
      if (this.options.checkPath && url.pathname) {
        const pathResult = this.validatePath(url.pathname);
        if (!pathResult.valid) {
          return pathResult;
        }
      }

      // 步骤5: 检查查询参数
      if (this.options.checkQueryParams && url.search) {
        const queryResult = this.validateQueryParams(
          url.search,
          url.searchParams
        );
        if (!queryResult.valid) {
          return queryResult;
        }
      }

      // 步骤6: URL构造异常检测 (例如双重URL编码等)
      const urlReconstructionCheck = this.checkUrlReconstruction(
        url,
        urlString
      );
      if (!urlReconstructionCheck.valid) {
        return urlReconstructionCheck;
      }

      // 通过所有检查
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: `URL验证过程中出错: ${error instanceof Error ? error.message : String(error)}`,
        riskLevel: 'medium',
      };
    }
  }

  /**
   * 检查URL重构是否与原始URL匹配
   * 可以检测到某些编码异常和注入尝试
   */
  private checkUrlReconstruction(
    url: URL,
    originalUrl: string
  ): UrlValidationResult {
    // 为了安全起见，我们不使用originalUrl直接比较，而是检查解码后的组件是否存在异常

    // 检查是否包含多重编码 (如%25252f)
    if (/%25[0-9A-Fa-f]{2}/i.test(originalUrl)) {
      return {
        valid: false,
        reason: '检测到可疑的多重URL编码',
        riskLevel: 'high',
      };
    }

    // 检查是否包含 Unicode 编码绕过 (如 \u002f)
    if (/(?:%u|\\u)[0-9A-Fa-f]{4}/i.test(originalUrl)) {
      return {
        valid: false,
        reason: '检测到可疑的Unicode编码',
        riskLevel: 'high',
      };
    }

    // 检查是否包含空字节
    if (/%00/i.test(originalUrl)) {
      return {
        valid: false,
        reason: '检测到空字节',
        riskLevel: 'critical',
      };
    }

    return { valid: true };
  }

  /**
   * 验证URL路径安全性
   */
  private validatePath(path: string): UrlValidationResult {
    // 解码路径以检查隐藏的危险模式
    let decodedPath = path;
    try {
      decodedPath = decodeURIComponent(path);
    } catch (e) {
      // 如果解码失败，可能是恶意构造的URL
      return {
        valid: false,
        reason: '无法解码URL路径，可能包含恶意构造',
        riskLevel: 'high',
      };
    }

    // 检查路径遍历和其他危险模式
    for (const pattern of this.options.dangerousPaths || []) {
      if (pattern.test(decodedPath)) {
        return {
          valid: false,
          reason: '检测到可疑的URL路径模式',
          riskLevel: 'high',
        };
      }
    }

    return { valid: true };
  }

  /**
   * 验证查询参数安全性
   */
  private validateQueryParams(
    search: string,
    params: URLSearchParams
  ): UrlValidationResult {
    // 寻找危险参数名称
    for (const param of this.options.dangerousParams || []) {
      if (params.has(param)) {
        return {
          valid: false,
          reason: `检测到可疑的查询参数: ${param}`,
          riskLevel: 'medium',
        };
      }
    }

    // 检查参数值中的脚本注入尝试
    for (const [key, value] of params.entries()) {
      // 检查XSS注入尝试
      if (/<script|javascript:|on\w+\s*=|alert\s*\(|eval\s*\(/i.test(value)) {
        return {
          valid: false,
          reason: `查询参数${key}中可能包含脚本注入`,
          riskLevel: 'high',
        };
      }

      // 检查SQL注入尝试
      if (
        /['";].*(?:--|select|union|insert|drop|alter|delete|update|create)/i.test(
          value
        )
      ) {
        return {
          valid: false,
          reason: `查询参数${key}中可能包含SQL注入`,
          riskLevel: 'high',
        };
      }

      // 检查命令注入尝试
      if (
        /[;&|`].*(?:cat|ls|pwd|echo|rm|cp|mv|wget|curl|bash|sh)/i.test(value)
      ) {
        return {
          valid: false,
          reason: `查询参数${key}中可能包含命令注入`,
          riskLevel: 'critical',
        };
      }
    }

    return { valid: true };
  }

  /**
   * 判断域名是否在允许列表中
   */
  private isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
    return allowedDomains.some(domain => {
      // 完全匹配
      if (hostname === domain) {
        return true;
      }

      // 子域名匹配 (如 *.example.com)
      if (domain.startsWith('*.') && hostname.endsWith(domain.substr(1))) {
        return true;
      }

      // 域结尾匹配
      if (hostname.endsWith(`.${domain}`)) {
        return true;
      }

      return false;
    });
  }

  /**
   * 判断是否为IP地址
   */
  private isIPAddress(hostname: string): boolean {
    // IPv4地址检查
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Pattern);

    if (match) {
      // 确认每个部分都是有效的数字
      return match.slice(1).every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }

    // IPv6地址检查 (简化版)
    const ipv6Pattern = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
    if (ipv6Pattern.test(hostname)) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否为私有IP
   */
  private isPrivateIP(ip: string): boolean {
    // 只支持IPv4格式检查
    const parts = ip.split('.').map(part => parseInt(part, 10));
    if (parts.length !== 4) return false;

    return UrlSafetyChecker.PRIVATE_IP_RANGES.some(range => {
      for (let i = 0; i < 4; i++) {
        if (parts[i] < range.min[i] || parts[i] > range.max[i]) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * 判断是否为环回地址
   */
  private isLoopbackIP(ip: string): boolean {
    return ip === '127.0.0.1' || ip === 'localhost' || ip === '::1';
  }

  /**
   * 生成白名单
   */
  public static createSafeDomainWhitelist(domains: string[]): string[] {
    const normalized: string[] = [];
    for (const domain of domains) {
      let cleanDomain = domain.trim().toLowerCase();

      // 移除协议部分
      cleanDomain = cleanDomain.replace(/^https?:\/\//i, '');

      // 移除路径和查询部分
      cleanDomain = cleanDomain.split('/')[0];

      // 移除端口部分
      cleanDomain = cleanDomain.split(':')[0];

      if (cleanDomain && !normalized.includes(cleanDomain)) {
        normalized.push(cleanDomain);
      }
    }

    return normalized;
  }

  /**
   * 辅助方法，检查URL是否安全
   */
  public static isSafeUrl(
    url: string,
    options: UrlSafetyOptions = {}
  ): boolean {
    const checker = new UrlSafetyChecker(options);
    return checker.validateUrl(url).valid;
  }

  /**
   * 辅助方法，为URL添加CSRF令牌
   */
  public static addCSRFTokenToUrl(
    url: URL,
    tokenName: string,
    tokenValue: string
  ): string {
    url.searchParams.set(tokenName, tokenValue);
    return url.toString();
  }

  /**
   * 辅助方法，清理可能有风险的URL
   */
  public static sanitizeUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);

      // 强制使用HTTPS
      parsedUrl.protocol = 'https:';

      // 移除任何用户信息
      parsedUrl.username = '';
      parsedUrl.password = '';

      // 清理路径，移除双斜杠、点等
      parsedUrl.pathname = parsedUrl.pathname
        .replace(/\/\.+\//g, '/')
        .replace(/\/+/g, '/')
        .replace(/\/\.\.\//g, '/');

      return parsedUrl.toString();
    } catch (e) {
      // 如果URL无效，返回安全的默认URL
      return '#';
    }
  }
}

export default UrlSafetyChecker;
