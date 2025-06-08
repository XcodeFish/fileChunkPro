/**
 * MemoryManager - 内存管理工具
 * 用于估计可用内存和优化分片大小
 */

// 可以尝试导入EnvUtils，但为了避免循环依赖风险，复制了简单版本的环境检测
enum SimpleEnvironment {
  Browser,
  WechatMP,
  AlipayMP,
  BytedanceMP,
  BaiduMP,
  Other,
}

/**
 * 内存管理工具类
 * 用于优化上传过程中的内存使用
 */
export class MemoryManager {
  /**
   * 估计当前可用内存
   * @returns 估计的可用内存(字节)
   */
  static estimateAvailableMemory(): number {
    // 浏览器环境尝试使用performance API
    if (
      typeof performance !== 'undefined' &&
      'memory' in performance &&
      performance.memory &&
      'jsHeapSizeLimit' in performance.memory &&
      'usedJSHeapSize' in performance.memory
    ) {
      const memory = performance.memory as {
        jsHeapSizeLimit: number;
        usedJSHeapSize: number;
      };
      const used = memory.usedJSHeapSize;
      const total = memory.jsHeapSizeLimit;
      return total - used;
    }

    // 回退到保守估计
    const env = this.detectSimpleEnvironment();
    switch (env) {
      case SimpleEnvironment.WechatMP:
      case SimpleEnvironment.AlipayMP:
      case SimpleEnvironment.BytedanceMP:
        return 100 * 1024 * 1024; // 小程序环境假设 100MB
      case SimpleEnvironment.Browser:
        return 500 * 1024 * 1024; // 浏览器环境假设 500MB
      default:
        return 200 * 1024 * 1024; // 默认假设 200MB
    }
  }

  /**
   * 获取最优分片大小
   * @param fileSize 文件大小
   * @param preferredSize 用户指定的分片大小(如有)
   * @returns 最优分片大小(字节)
   */
  static getOptimalChunkSize(fileSize: number, preferredSize: number): number {
    // 基于文件大小的基础策略
    let baseSize: number;
    if (fileSize <= 10 * 1024 * 1024) {
      baseSize = 1024 * 1024; // <10MB: 1MB分片
    } else if (fileSize <= 100 * 1024 * 1024) {
      baseSize = 5 * 1024 * 1024; // <100MB: 5MB分片
    } else if (fileSize <= 1024 * 1024 * 1024) {
      baseSize = 10 * 1024 * 1024; // <1GB: 10MB分片
    } else {
      baseSize = 20 * 1024 * 1024; // >1GB: 20MB分片
    }

    // 如果指定了优先大小
    if (preferredSize > 0) {
      baseSize = preferredSize;
    }

    // 内存安全检查
    const availableMemory = this.estimateAvailableMemory();
    const safeMemorySize = availableMemory / 4; // 使用1/4可用内存作为安全上限

    // 环境特定限制
    const env = this.detectSimpleEnvironment();
    let envLimit = Number.MAX_SAFE_INTEGER;

    switch (env) {
      case SimpleEnvironment.WechatMP:
        envLimit = 10 * 1024 * 1024; // 微信小程序文件操作限制10MB
        break;
      case SimpleEnvironment.AlipayMP:
        envLimit = 10 * 1024 * 1024; // 支付宝小程序限制
        break;
      case SimpleEnvironment.BytedanceMP:
        envLimit = 10 * 1024 * 1024; // 字节跳动小程序限制
        break;
    }

    // 取三者的最小值
    return Math.min(baseSize, safeMemorySize, envLimit);
  }

  /**
   * 检查是否需要释放内存
   * @returns 是否需要进行内存清理
   */
  static needsMemoryCleanup(): boolean {
    if (
      typeof performance !== 'undefined' &&
      'memory' in performance &&
      performance.memory &&
      'jsHeapSizeLimit' in performance.memory &&
      'usedJSHeapSize' in performance.memory
    ) {
      const memory = performance.memory as {
        jsHeapSizeLimit: number;
        usedJSHeapSize: number;
      };
      const used = memory.usedJSHeapSize;
      const total = memory.jsHeapSizeLimit;
      // 当使用超过80%时建议清理
      return used / total > 0.8;
    }
    return false;
  }

  /**
   * 简易环境检测
   * @returns 检测到的环境类型
   */
  private static detectSimpleEnvironment(): SimpleEnvironment {
    // 浏览器环境
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return SimpleEnvironment.Browser;
    }

    // 微信小程序
    if (
      typeof wx !== 'undefined' &&
      typeof wx.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.WechatMP;
    }

    // 支付宝小程序
    if (
      typeof my !== 'undefined' &&
      typeof my.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.AlipayMP;
    }

    // 字节跳动小程序
    if (
      typeof tt !== 'undefined' &&
      typeof tt.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.BytedanceMP;
    }

    // 百度小程序
    if (
      typeof swan !== 'undefined' &&
      typeof swan.getFileSystemManager === 'function'
    ) {
      return SimpleEnvironment.BaiduMP;
    }

    return SimpleEnvironment.Other;
  }
}

export default MemoryManager;
