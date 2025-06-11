/**
 * PerformanceLogAssociator - 性能日志关联器
 *
 * @deprecated 使用新的模块化实现 import { PerformanceLogAssociator } from './performance-logger'
 */

import { LogStorage } from './LogStorage';
import { PerformanceCollector } from './PerformanceCollector';
import PerformanceLogAssociatorImpl, {
  PerformanceLogAssociatorConfig,
} from './performance-logger/PerformanceLogAssociator';

/**
 * 向后兼容的性能日志关联器
 * 重定向到新的模块化实现
 */
class PerformanceLogAssociator extends PerformanceLogAssociatorImpl {
  constructor(
    logStorage: LogStorage,
    performanceCollector?: PerformanceCollector,
    config?: PerformanceLogAssociatorConfig
  ) {
    super(logStorage, performanceCollector, config);

    console.warn(
      '[性能优化警告] PerformanceLogAssociator 已移至 ./performance-logger 目录，' +
        '请直接从新目录导入以获得更好的性能和代码组织'
    );
  }
}

export default PerformanceLogAssociator;
