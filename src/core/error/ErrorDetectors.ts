/**
 * 错误检测器模块
 * 使用策略模式封装各种错误类型的检测逻辑
 */
import { UploadErrorType } from '../../types/errors';

/**
 * 错误检测器接口
 */
export interface IErrorDetector {
  /**
   * 检测错误类型
   * @param error 原始错误对象
   * @returns 是否匹配该错误类型
   */
  detect(error: any): boolean;

  /**
   * 获取错误类型
   */
  getErrorType(): UploadErrorType;

  /**
   * 获取友好的错误消息
   * @param error 原始错误对象
   * @returns 用户友好的错误消息
   */
  getMessage(error: any): string;
}

/**
 * 网络错误检测器
 */
export class NetworkErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.name === 'NetworkError' ||
      error.message?.includes('network') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNABORTED' ||
      (typeof error.status === 'number' && error.status === 0) ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('Network request failed') ||
      (error instanceof TypeError && error.message?.includes('network'))
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.NETWORK_ERROR;
  }

  getMessage(_error: any): string {
    return '网络连接失败，请检查网络设置';
  }
}

/**
 * 服务器不可达错误检测器
 */
export class ServerUnreachableErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.code === 'ENOTFOUND' ||
      error.code === 'EHOSTDOWN' ||
      error.code === 'EHOSTUNREACH' ||
      error.message?.includes('server unreachable') ||
      error.message?.includes('cannot connect to host') ||
      error.message?.includes('unable to connect') ||
      error.message?.includes('无法连接到服务器') ||
      error.status === 503 ||
      error.statusCode === 503
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.SERVER_UNREACHABLE_ERROR;
  }

  getMessage(_error: any): string {
    return '无法连接到服务器，请检查网络连接或服务器地址';
  }
}

/**
 * DNS错误检测器
 */
export class DNSErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.code === 'ENOTFOUND' ||
      error.code === 'ESERVFAIL' ||
      error.message?.includes('DNS') ||
      error.message?.includes('域名解析') ||
      error.message?.includes('host not found') ||
      error.message?.includes('name resolution') ||
      (error.name === 'TypeError' && error.message?.includes('Failed to fetch'))
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.DNS_RESOLUTION_ERROR;
  }

  getMessage(_error: any): string {
    return '域名解析失败，请检查网络连接或服务器地址';
  }
}

/**
 * 连接重置错误检测器
 */
export class ConnectionResetErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.code === 'ECONNRESET' ||
      error.message?.includes('connection reset') ||
      error.message?.includes('连接重置') ||
      error.message?.includes('socket hang up') ||
      error.message?.includes('network reset') ||
      error.message?.includes('aborted') ||
      error.message?.includes('broken pipe')
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.CONNECTION_RESET_ERROR;
  }

  getMessage(_error: any): string {
    return '连接被重置，请检查网络连接并重试';
  }
}

/**
 * 超时错误检测器
 */
export class TimeoutErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.code === 'ETIMEDOUT' ||
      error.code === 'ESOCKETTIMEDOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out') ||
      error.message?.includes('超时') ||
      (typeof error.timeout === 'number' && error.timeout > 0)
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.TIMEOUT_ERROR;
  }

  getMessage(_error: any): string {
    return '请求超时，请检查网络状况或服务器响应';
  }
}

/**
 * 速率限制错误检测器
 */
export class RateLimitErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.status === 429 ||
      error.statusCode === 429 ||
      error.message?.includes('rate limit') ||
      error.message?.includes('too many requests') ||
      error.message?.includes('请求频率过高') ||
      error.message?.includes('API calls quota exceeded') ||
      error.code === 'ELIMIT'
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.RATE_LIMIT_ERROR;
  }

  getMessage(_error: any): string {
    return '请求频率过高，请稍后再试';
  }
}

/**
 * 服务器错误检测器
 */
export class ServerErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      (error.status >= 500 && error.status < 600) ||
      (error.statusCode >= 500 && error.statusCode < 600) ||
      error.message?.includes('server error') ||
      error.message?.includes('服务器错误') ||
      error.message?.includes('internal server error') ||
      error.code === 'ESERVERR'
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.SERVER_ERROR;
  }

  getMessage(error: any): string {
    return `服务器错误(${error.status || error.statusCode || 'unknown'})，请稍后重试`;
  }
}

/**
 * 认证错误检测器
 */
export class AuthenticationErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.status === 401 ||
      error.statusCode === 401 ||
      error.message?.includes('authentication') ||
      error.message?.includes('unauthorized') ||
      error.message?.includes('授权失败') ||
      error.message?.includes('认证失败') ||
      error.message?.includes('token expired') ||
      error.message?.includes('invalid token') ||
      error.code === 'EAUTH'
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.AUTHENTICATION_ERROR;
  }

  getMessage(_error: any): string {
    return '认证失败，请重新登录或检查权限设置';
  }
}

/**
 * 文件错误检测器
 */
export class FileErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.message?.includes('file ') ||
      error.message?.includes('文件') ||
      error.code === 'ENOENT' ||
      error.code === 'EISDIR' ||
      error.code === 'EACCES' ||
      error.code === 'EPERM' ||
      error.name === 'FileError'
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.FILE_ERROR;
  }

  getMessage(_error: any): string {
    return '文件访问失败，请确认文件存在且可读';
  }
}

/**
 * 安全错误检测器
 */
export class SecurityErrorDetector implements IErrorDetector {
  detect(error: any): boolean {
    return (
      error.message?.includes('security') ||
      error.message?.includes('安全') ||
      error.message?.includes('crypto') ||
      error.message?.includes('unsafe') ||
      error.message?.includes('cross-origin') ||
      error.message?.includes('CORS') ||
      error.code === 'ESECURITY'
    );
  }

  getErrorType(): UploadErrorType {
    return UploadErrorType.SECURITY_ERROR;
  }

  getMessage(_error: any): string {
    return '安全检查失败，无法继续上传';
  }
}

/**
 * 错误检测器工厂
 */
export class ErrorDetectorFactory {
  private static detectors: IErrorDetector[] = [
    new NetworkErrorDetector(),
    new ServerUnreachableErrorDetector(),
    new DNSErrorDetector(),
    new ConnectionResetErrorDetector(),
    new TimeoutErrorDetector(),
    new RateLimitErrorDetector(),
    new ServerErrorDetector(),
    new AuthenticationErrorDetector(),
    new FileErrorDetector(),
    new SecurityErrorDetector(),
    // 可以根据需要添加更多检测器
  ];

  /**
   * 根据原始错误检测错误类型
   * @param error 原始错误
   * @returns 错误类型和消息
   */
  public static detect(error: any): { type: UploadErrorType; message: string } {
    for (const detector of this.detectors) {
      if (detector.detect(error)) {
        return {
          type: detector.getErrorType(),
          message: detector.getMessage(error),
        };
      }
    }

    // 默认为未知错误
    return {
      type: UploadErrorType.UNKNOWN_ERROR,
      message: error.message || '发生未知错误',
    };
  }

  /**
   * 注册新的错误检测器
   * @param detector 错误检测器
   */
  public static registerDetector(detector: IErrorDetector): void {
    this.detectors.push(detector);
  }
}
