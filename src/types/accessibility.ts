/**
 * 无障碍相关类型定义
 */

/**
 * 无障碍选项接口
 */
export interface IAccessibilityOptions {
  /** 是否启用无障碍支持 */
  enabled: boolean;
  /** 是否启用键盘导航 */
  keyboardNavigation: boolean;
  /** 是否启用屏幕阅读器支持 */
  screenReaderSupport: boolean;
  /** 自定义ARIA标签 */
  ariaLabels?: Record<string, string>;
  /** 焦点管理策略 */
  focusManagement?: 'auto' | 'manual';
  /** 无障碍事件处理器 */
  handlers?: IAccessibilityEventHandlers;
}

/**
 * 无障碍事件处理器接口
 */
export interface IAccessibilityEventHandlers {
  /** 键盘事件处理 */
  onKeyDown?: (event: KeyboardEvent) => void;
  /** 焦点获取事件 */
  onFocus?: (event: FocusEvent) => void;
  /** 焦点失去事件 */
  onBlur?: (event: FocusEvent) => void;
}

/**
 * 无障碍元素角色类型
 */
export type AccessibilityRole = 
  | 'button'
  | 'link'
  | 'checkbox'
  | 'menuitem'
  | 'menubar'
  | 'progressbar'
  | 'status'
  | 'alert'
  | 'alertdialog'
  | 'dialog'
  | 'region';

/**
 * 无障碍元素属性接口
 */
export interface IAccessibilityProps {
  /** 元素角色 */
  role?: AccessibilityRole;
  /** 是否可聚焦 */
  tabIndex?: number;
  /** 无障碍标签 */
  'aria-label'?: string;
  /** 无障碍描述 */
  'aria-description'?: string;
  /** 是否禁用 */
  'aria-disabled'?: boolean;
  /** 是否展开 */
  'aria-expanded'?: boolean;
  /** 是否选中 */
  'aria-selected'?: boolean;
  /** 是否按下 */
  'aria-pressed'?: boolean;
  /** 是否必填 */
  'aria-required'?: boolean;
  /** 是否隐藏 */
  'aria-hidden'?: boolean;
  /** 无障碍错误信息 */
  'aria-errormessage'?: string;
  /** 是否有错误 */
  'aria-invalid'?: boolean;
  /** 控制元素ID */
  'aria-controls'?: string;
  /** 关联元素ID */
  'aria-owns'?: string;
  /** 标签元素ID */
  'aria-labelledby'?: string;
  /** 描述元素ID */
  'aria-describedby'?: string;
  /** 当前值 */
  'aria-valuenow'?: number;
  /** 最小值 */
  'aria-valuemin'?: number;
  /** 最大值 */
  'aria-valuemax'?: number;
  /** 值文本 */
  'aria-valuetext'?: string;
} 