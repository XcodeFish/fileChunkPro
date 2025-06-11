/**
 * 性能日志关联系统
 * 提供日志与性能数据关联的高效实现
 */

// 导出主模块
export { default as PerformanceLogAssociator } from './PerformanceLogAssociator';
export type { PerformanceLogAssociatorConfig } from './PerformanceLogAssociator';

// 导出算法模块
export { default as AssociationAlgorithm } from './AssociationAlgorithm';
export type { AssociationWeightConfig } from './AssociationAlgorithm';

// 导出存储模块
export { default as AssociationStorage } from './AssociationStorage';
export type { AssociationStorageOptions } from './AssociationStorage';

// 向后兼容 - 从原目录导出
import PerformanceLogAssociator from './PerformanceLogAssociator';
export default PerformanceLogAssociator;
