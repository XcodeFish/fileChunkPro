/**
 * 配置系统相关类型定义
 */

/**
 * 配置管理器选项
 */
export interface ConfigManagerOptions {
  /**
   * 是否允许配置热更新
   */
  allowHotUpdate?: boolean;
  
  /**
   * 配置变更时的回调函数
   */
  onChange?: (changes: ConfigChanges) => void;
  
  /**
   * 是否持久化配置
   */
  persistConfig?: boolean;
  
  /**
   * 持久化存储键
   */
  storageKey?: string;
  
  /**
   * 配置验证器
   */
  validator?: (config: any) => { valid: boolean; errors?: string[] };
}

/**
 * 配置变更信息
 */
export interface ConfigChanges {
  /**
   * 已添加的配置键
   */
  added: Record<string, any>;
  
  /**
   * 已更新的配置键
   */
  updated: Record<string, { oldValue: any; newValue: any }>;
  
  /**
   * 已删除的配置键
   */
  deleted: string[];
  
  /**
   * 变更时间戳
   */
  timestamp: number;
}

/**
 * 配置架构描述
 */
export interface ConfigSchema {
  /**
   * 配置键
   */
  key: string;
  
  /**
   * 数据类型
   */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  
  /**
   * 默认值
   */
  default?: any;
  
  /**
   * 是否必需
   */
  required?: boolean;
  
  /**
   * 是否已废弃
   */
  deprecated?: boolean;
  
  /**
   * 验证规则
   */
  validation?: {
    /**
     * 最小长度/值
     */
    min?: number;
    
    /**
     * 最大长度/值
     */
    max?: number;
    
    /**
     * 正则表达式模式
     */
    pattern?: string;
    
    /**
     * 允许的值列表
     */
    enum?: any[];
    
    /**
     * 自定义验证函数
     */
    validator?: (value: any) => { valid: boolean; message?: string };
  };
  
  /**
   * 配置描述
   */
  description?: string;
  
  /**
   * 配置分组
   */
  group?: string;
  
  /**
   * 嵌套配置项（用于对象类型）
   */
  properties?: Record<string, ConfigSchema>;
  
  /**
   * 项目配置（用于数组类型）
   */
  items?: ConfigSchema;
}

/**
 * 预设配置类型
 */
export interface ConfigPreset {
  /**
   * 预设名称
   */
  name: string;
  
  /**
   * 预设描述
   */
  description: string;
  
  /**
   * 配置值
   */
  config: Record<string, any>;
  
  /**
   * 预设标签
   */
  tags?: string[];
  
  /**
   * 预设是否为只读
   */
  readonly?: boolean;
  
  /**
   * 预设优先级（数值越大优先级越高）
   */
  priority?: number;
}

/**
 * 配置合并策略
 */
export enum ConfigMergeStrategy {
  /**
   * 完全覆盖现有配置
   */
  OVERWRITE = 'overwrite',
  
  /**
   * 深度合并配置
   */
  DEEP_MERGE = 'deepMerge',
  
  /**
   * 仅合并不存在的键
   */
  MERGE_MISSING = 'mergeMissing',
  
  /**
   * 使用自定义合并函数
   */
  CUSTOM = 'custom'
}

/**
 * 配置管理器接口
 */
export interface ConfigManager {
  /**
   * 获取配置值
   */
  get<T = any>(key: string, defaultValue?: T): T;
  
  /**
   * 设置配置值
   */
  set<T = any>(key: string, value: T): void;
  
  /**
   * 检查配置键是否存在
   */
  has(key: string): boolean;
  
  /**
   * 删除配置键
   */
  remove(key: string): void;
  
  /**
   * 获取所有配置
   */
  getAll(): Record<string, any>;
  
  /**
   * 重置配置为默认值
   */
  resetToDefaults(): void;
  
  /**
   * 应用预设配置
   */
  applyPreset(presetName: string): void;
  
  /**
   * 导出配置
   */
  export(): string;
  
  /**
   * 导入配置
   */
  import(configData: string): boolean;
  
  /**
   * 验证配置
   */
  validate(): { valid: boolean; errors?: string[] };
} 