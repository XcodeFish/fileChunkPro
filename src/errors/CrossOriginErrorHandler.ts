/**
 * CrossOriginErrorHandler - 跨域错误处理器
 *
 * 功能：
 * 1. 提供详细的跨域错误分析与诊断
 * 2. 生成用户友好的错误信息
 * 3. 提供针对性解决方案建议
 * 4. 支持自动检测和分析CORS配置
 */

import { Logger } from '../utils/Logger';
import { ErrorContext } from '../core/ErrorCenter';
import { NetworkError } from '../types/errors';

export interface CORSErrorDetails {
  type:
    | 'cors'
    | 'credentials'
    | 'preflight'
    | 'method_not_allowed'
    | 'header_not_allowed'
    | 'origin_not_allowed'
    | 'unknown';
  message: string;
  origin?: string;
  targetUrl?: string;
  statusCode?: number;
  requestMethod?: string;
  missingHeaders?: string[];
  requestHeaders?: Record<string, string>;
  serverInfo?: {
    server?: string;
    accessControlAllowOrigin?: string;
    accessControlAllowMethods?: string;
    accessControlAllowHeaders?: string;
    accessControlAllowCredentials?: string;
  };
}

export interface CORSSolution {
  title: string;
  description: string;
  serverConfig?: {
    nginx?: string;
    apache?: string;
    express?: string;
    iis?: string;
  };
  clientConfig?: string;
  links: Array<{
    title: string;
    url: string;
  }>;
}

export class CrossOriginErrorHandler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('CrossOriginErrorHandler');
  }

  /**
   * 分析跨域错误
   * @param error 原始错误对象
   * @param context 错误上下文
   * @returns 分析结果，如果非CORS错误则为null
   */
  public analyzeError(
    error: Error | NetworkError,
    context: ErrorContext
  ): CORSErrorDetails | null {
    // 如果没有明确的网络错误信息，尝试从错误消息解析
    const isNetworkError = error instanceof NetworkError;
    const errorMessage = error.message || '';

    // 检查是否为跨域错误
    if (!this.isCORSError(error, context)) {
      return null;
    }

    // 从上下文中提取关键信息
    const origin = this.extractOrigin(context);
    const targetUrl = context.url || '';
    const statusCode = isNetworkError
      ? (error as NetworkError).statusCode
      : context.statusCode || this.extractStatusCode(errorMessage);
    const requestMethod = context.method || this.extractMethod(context);
    const requestHeaders = context.headers || {};

    // 标准化错误消息
    const normalizedMessage = errorMessage.toLowerCase();

    // 根据特征识别错误类型
    const details: CORSErrorDetails = {
      type: 'unknown',
      message: '',
      origin,
      targetUrl,
      statusCode,
      requestMethod,
      requestHeaders,
    };

    // 解析不同类型的CORS错误
    if (
      statusCode === 0 ||
      normalizedMessage.includes('access') ||
      normalizedMessage.includes('cors') ||
      normalizedMessage.includes('origin')
    ) {
      details.type = 'cors';
      details.message =
        '跨域资源共享(CORS)错误: 服务器未允许来自当前源的请求访问';
    } else if (
      statusCode === 401 ||
      statusCode === 403 ||
      normalizedMessage.includes('credentials') ||
      normalizedMessage.includes('cookie')
    ) {
      details.type = 'credentials';
      details.message = '跨域凭证错误: 跨域请求的凭证(credentials)设置不正确';
    } else if (
      statusCode === 405 ||
      normalizedMessage.includes('method not allowed')
    ) {
      details.type = 'method_not_allowed';
      details.message = `请求方法错误: 服务器不允许使用 ${requestMethod} 方法进行跨域请求`;
    } else if (
      statusCode === 400 ||
      normalizedMessage.includes('headers') ||
      normalizedMessage.includes('header')
    ) {
      details.type = 'header_not_allowed';
      details.message = '请求头错误: 某些自定义请求头未被服务器允许';

      // 尝试识别问题的请求头
      const problematicHeaders = this.identifyProblematicHeaders(
        requestHeaders,
        normalizedMessage
      );
      if (problematicHeaders.length > 0) {
        details.missingHeaders = problematicHeaders;
      }
    }

    // 检查预检请求(Preflight)错误
    if (
      (requestMethod !== 'GET' &&
        requestMethod !== 'HEAD' &&
        requestMethod !== 'POST') ||
      this.hasNonStandardHeaders(requestHeaders)
    ) {
      if (statusCode === 0 || statusCode === 405 || statusCode === 501) {
        details.type = 'preflight';
        details.message =
          '预检请求错误: OPTIONS 预检请求未通过或未被服务器正确响应';
      }
    }

    // 提取服务器信息（如果有）
    if (context.responseHeaders) {
      details.serverInfo = {
        server:
          context.responseHeaders['server'] ||
          context.responseHeaders['Server'],
        accessControlAllowOrigin:
          context.responseHeaders['access-control-allow-origin'],
        accessControlAllowMethods:
          context.responseHeaders['access-control-allow-methods'],
        accessControlAllowHeaders:
          context.responseHeaders['access-control-allow-headers'],
        accessControlAllowCredentials:
          context.responseHeaders['access-control-allow-credentials'],
      };
    }

    // 记录详细错误信息
    this.logger.debug('CORS错误分析结果', details);

    return details;
  }

  /**
   * 判断是否为CORS错误
   * @param error 错误对象
   * @param context 错误上下文
   */
  private isCORSError(
    error: Error | NetworkError,
    context: ErrorContext
  ): boolean {
    const errorMessage = error.message || '';
    const lowerErrorMsg = errorMessage.toLowerCase();

    // 检查错误消息中的CORS关键字
    const hasCORSKeywords =
      lowerErrorMsg.includes('cors') ||
      lowerErrorMsg.includes('cross') ||
      lowerErrorMsg.includes('origin') ||
      lowerErrorMsg.includes('access-control');

    // 检查异常状态码
    const suspiciousStatusCode =
      context.statusCode === 0 ||
      context.statusCode === 401 ||
      context.statusCode === 403;

    // 检查错误名称
    const errorName = error.name || '';
    const isCORSErrorType =
      errorName.includes('SecurityError') ||
      errorName.includes('AccessControl') ||
      errorName.includes('CORS');

    // 综合判断
    return hasCORSKeywords || suspiciousStatusCode || isCORSErrorType;
  }

  /**
   * 从上下文提取源(Origin)信息
   */
  private extractOrigin(context: ErrorContext): string {
    // 优先使用上下文中的origin
    if (context.origin) {
      return context.origin;
    }

    // 如果在浏览器环境中，尝试获取当前源
    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin;
    }

    // 尝试从请求头中提取
    if (context.headers && context.headers['Origin']) {
      return context.headers['Origin'];
    }

    return 'unknown';
  }

  /**
   * 从错误消息提取状态码
   */
  private extractStatusCode(message: string): number | undefined {
    const statusCodeMatch = message.match(/status(?:[ -])?code:?\s*(\d{3})/i);
    if (statusCodeMatch && statusCodeMatch[1]) {
      return parseInt(statusCodeMatch[1], 10);
    }
    return undefined;
  }

  /**
   * 从上下文提取HTTP方法
   */
  private extractMethod(context: ErrorContext): string {
    if (context.method) {
      return context.method.toUpperCase();
    }

    // 默认为GET
    return 'GET';
  }

  /**
   * 检查是否包含非标准请求头
   */
  private hasNonStandardHeaders(
    headers: Record<string, string> | undefined
  ): boolean {
    if (!headers) return false;

    const standardHeaders = [
      'accept',
      'accept-language',
      'content-language',
      'content-type',
      'dpr',
      'downlink',
      'save-data',
      'viewport-width',
      'width',
    ];

    return Object.keys(headers).some(
      header =>
        !standardHeaders.includes(header.toLowerCase()) &&
        !header.toLowerCase().startsWith('sec-')
    );
  }

  /**
   * 识别可能有问题的请求头
   */
  private identifyProblematicHeaders(
    headers: Record<string, string> | undefined,
    errorMessage: string
  ): string[] {
    if (!headers) return [];

    const problematicHeaders: string[] = [];

    // 检查错误消息中是否明确提到某个请求头
    for (const header of Object.keys(headers)) {
      if (errorMessage.toLowerCase().includes(header.toLowerCase())) {
        problematicHeaders.push(header);
      }
    }

    // 如果没有明确提到的请求头，返回所有非标准请求头
    if (problematicHeaders.length === 0) {
      return Object.keys(headers).filter(header => {
        const lowerHeader = header.toLowerCase();
        const standardHeaders = [
          'accept',
          'accept-language',
          'content-language',
          'content-type',
        ];
        return (
          !standardHeaders.includes(lowerHeader) &&
          !lowerHeader.startsWith('sec-')
        );
      });
    }

    return problematicHeaders;
  }

  /**
   * 根据错误详情生成用户友好的错误信息
   * @param details 错误详情
   * @returns 用户友好的错误信息
   */
  public generateUserFriendlyMessage(details: CORSErrorDetails): string {
    const baseMessage = '跨域请求失败: ';

    switch (details.type) {
      case 'cors':
        return `${baseMessage}服务器不允许从 '${details.origin}' 访问资源。请确保服务器配置了正确的CORS响应头。`;

      case 'credentials':
        return `${baseMessage}无法携带身份凭证(如Cookie)进行跨域请求。请检查服务器是否设置了'Access-Control-Allow-Credentials: true'响应头，以及请求是否设置了'withCredentials: true'。`;

      case 'preflight':
        return `${baseMessage}预检请求(OPTIONS)失败。服务器需要正确响应OPTIONS请求，并返回适当的CORS响应头。`;

      case 'method_not_allowed':
        return `${baseMessage}服务器不允许使用 '${details.requestMethod}' 方法进行跨域请求。请确保服务器配置了'Access-Control-Allow-Methods'响应头并包含该方法。`;

      case 'header_not_allowed': {
        const headerList =
          details.missingHeaders && details.missingHeaders.length > 0
            ? details.missingHeaders.join(', ')
            : '自定义请求头';
        return `${baseMessage}服务器不允许请求中包含 '${headerList}'。请确保服务器配置了'Access-Control-Allow-Headers'响应头并包含这些请求头。`;
      }

      case 'origin_not_allowed':
        return `${baseMessage}服务器明确拒绝了来自 '${details.origin}' 的请求。请联系API提供方确认访问权限。`;

      default:
        return `${baseMessage}无法完成跨域请求。可能是服务器未配置正确的CORS响应头，或者当前源无访问权限。`;
    }
  }

  /**
   * 生成解决方案建议
   * @param details 错误详情
   * @returns 解决方案建议
   */
  public generateSolutions(details: CORSErrorDetails): CORSSolution[] {
    const solutions: CORSSolution[] = [];

    // 通用解决方案
    solutions.push({
      title: '确保服务器配置了正确的CORS响应头',
      description:
        '跨域资源共享(CORS)是一种安全机制，要求服务器明确允许来自特定源的请求。服务器需要设置正确的响应头来允许跨域请求。',
      serverConfig: {
        nginx: `
# Nginx配置示例
location /api/ {
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '${details.origin}';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
        add_header 'Access-Control-Max-Age' '1728000';
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        add_header 'Content-Length' '0';
        return 204;
    }
    add_header 'Access-Control-Allow-Origin' '${details.origin}';
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
    
    # 如果需要发送凭证
    add_header 'Access-Control-Allow-Credentials' 'true';
}`,
        apache: `
# Apache配置示例
<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "${details.origin}"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    
    # 如果需要发送凭证
    Header set Access-Control-Allow-Credentials "true"
    
    # 对于OPTIONS请求特殊处理
    SetEnvIf Request_Method OPTIONS HeaderReplace=1
    Header set Content-Length "0" env=HeaderReplace
    Header set Content-Type "text/plain" env=HeaderReplace
</IfModule>`,
        express: `
// Express.js配置示例
const express = require('express');
const cors = require('cors');
const app = express();

const corsOptions = {
  origin: '${details.origin}',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));`,
        iis: `
<!-- IIS web.config配置示例 -->
<system.webServer>
  <httpProtocol>
    <customHeaders>
      <add name="Access-Control-Allow-Origin" value="${details.origin}" />
      <add name="Access-Control-Allow-Methods" value="GET, POST, OPTIONS, PUT, DELETE" />
      <add name="Access-Control-Allow-Headers" value="Content-Type, Authorization" />
      <add name="Access-Control-Allow-Credentials" value="true" />
    </customHeaders>
  </httpProtocol>
</system.webServer>`,
      },
      clientConfig: `
// 前端配置示例
fetch('${details.targetUrl}', {
  method: '${details.requestMethod || 'GET'}',
  headers: {
    'Content-Type': 'application/json',
    // 其他必要的请求头
  },
  credentials: 'include', // 如果需要发送凭证
})
.then(response => response.json())
.catch(error => console.error('Error:', error));`,
      links: [
        {
          title: 'MDN Web文档: 跨源资源共享(CORS)',
          url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS',
        },
        {
          title: '跨域资源共享(CORS)详解',
          url: 'https://www.ruanyifeng.com/blog/2016/04/cors.html',
        },
      ],
    });

    // 针对特定错误类型的解决方案
    switch (details.type) {
      case 'credentials':
        solutions.push({
          title: '配置跨域凭证',
          description:
            '要发送跨域请求并携带凭证(如Cookie)，需要在客户端和服务器端都进行特定配置。',
          clientConfig: `
// 前端配置 - 设置凭证标志
fetch('${details.targetUrl}', {
  credentials: 'include', // 关键设置
  method: '${details.requestMethod || 'GET'}',
  // 其他配置...
});

// 或者使用XMLHttpRequest
const xhr = new XMLHttpRequest();
xhr.open('${details.requestMethod || 'GET'}', '${details.targetUrl}');
xhr.withCredentials = true; // 关键设置
xhr.send();`,
          serverConfig: {
            express: `
// 服务器配置 - Express.js
const corsOptions = {
  origin: '${details.origin}',
  credentials: true // 关键设置
};
app.use(cors(corsOptions));`,
            nginx: `
# Nginx配置 - 允许凭证
location /api/ {
  add_header 'Access-Control-Allow-Credentials' 'true'; # 关键设置
  add_header 'Access-Control-Allow-Origin' '${details.origin}'; # 注意：使用凭证时，此处不能为通配符*
  # 其他配置...
}`,
          },
          links: [
            {
              title: '使用带凭据的请求',
              url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS#%E9%99%84%E5%B8%A6%E8%BA%AB%E4%BB%BD%E5%87%AD%E8%AF%81%E7%9A%84%E8%AF%B7%E6%B1%82',
            },
          ],
        });
        break;

      case 'preflight':
        solutions.push({
          title: '正确处理预检请求',
          description:
            '复杂跨域请求会先发送一个OPTIONS方法的预检请求，服务器需要正确响应这类请求。',
          serverConfig: {
            express: `
// Express.js处理预检请求
app.options('*', cors()); // 使所有路由响应OPTIONS请求`,
            nginx: `
# Nginx处理预检请求
location /api/ {
  if ($request_method = 'OPTIONS') {
    add_header 'Access-Control-Allow-Origin' '${details.origin}';
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
    add_header 'Access-Control-Allow-Headers' '${details.missingHeaders ? details.missingHeaders.join(', ') : 'Content-Type, Authorization'}';
    add_header 'Access-Control-Max-Age' '1728000'; # 缓存预检结果20天
    add_header 'Content-Type' 'text/plain charset=UTF-8';
    add_header 'Content-Length' '0';
    return 204; # 成功但无内容
  }
  # 其他配置...
}`,
          },
          links: [
            {
              title: '预检请求',
              url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS#%E9%A2%84%E6%A3%80%E8%AF%B7%E6%B1%82',
            },
          ],
        });
        break;

      case 'method_not_allowed':
        solutions.push({
          title: '允许特定HTTP方法',
          description: `服务器需要明确允许 '${details.requestMethod}' 方法的跨域请求。`,
          serverConfig: {
            express: `
// Express.js配置允许的方法
const corsOptions = {
  methods: '${details.requestMethod},GET,HEAD,PUT,PATCH,POST,DELETE'
};
app.use(cors(corsOptions));`,
            nginx: `
# Nginx配置允许的方法
location /api/ {
  add_header 'Access-Control-Allow-Methods' '${details.requestMethod}, GET, POST, OPTIONS, PUT, DELETE';
  # 其他配置...
}`,
          },
          links: [
            {
              title: 'HTTP访问控制(CORS) - 访问控制-允许方法',
              url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Allow-Methods',
            },
          ],
        });
        break;

      case 'header_not_allowed': {
        const headerList =
          details.missingHeaders && details.missingHeaders.length > 0
            ? details.missingHeaders.join(', ')
            : 'Content-Type, Authorization';

        solutions.push({
          title: '允许自定义请求头',
          description:
            '服务器需要在Access-Control-Allow-Headers头中明确列出允许的请求头。',
          serverConfig: {
            express: `
// Express.js配置允许的请求头
const corsOptions = {
  allowedHeaders: '${headerList}'
};
app.use(cors(corsOptions));`,
            nginx: `
# Nginx配置允许的请求头
location /api/ {
  add_header 'Access-Control-Allow-Headers' '${headerList}';
  # 其他配置...
}`,
          },
          links: [
            {
              title: 'HTTP访问控制(CORS) - 访问控制-允许头',
              url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Access-Control-Allow-Headers',
            },
          ],
        });
        break;
      }
    }

    // 代理服务器解决方案（备选）
    solutions.push({
      title: '使用代理服务器绕过CORS限制',
      description:
        '如果无法修改目标服务器配置，可以设置自己的代理服务器转发请求，避免跨域问题。',
      serverConfig: {
        express: `
// Node.js代理服务器示例
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

app.use('/api', createProxyMiddleware({
  target: '${details.targetUrl?.split('/').slice(0, 3).join('/') || 'https://api.example.com'}',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // 移除/api前缀
  },
}));

app.listen(3000, () => {
  console.log('代理服务器运行在http://localhost:3000');
});`,
      },
      clientConfig: `
// 前端请求改为访问代理服务器
fetch('/api/endpoint', { // 不再直接请求${details.targetUrl}
  method: '${details.requestMethod || 'GET'}',
  // 其他配置...
})`,
      links: [
        {
          title: '使用http-proxy-middleware设置代理',
          url: 'https://github.com/chimurai/http-proxy-middleware',
        },
        {
          title: '在开发环境中配置代理',
          url: 'https://create-react-app.dev/docs/proxying-api-requests-in-development/',
        },
      ],
    });

    return solutions;
  }
}

export default CrossOriginErrorHandler;
