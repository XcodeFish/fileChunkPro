/**
 * 无障碍插件 - 提供ARIA标签支持、键盘导航和屏幕阅读器兼容
 */
import {
  IAccessibilityOptions,
  IAccessibilityProps,
} from '../types/accessibility';
import { IPlugin, PluginType } from '../types/plugins';
import { UploaderCore } from '../core/UploaderCore';
import { EventBus } from '../core/EventBus';

/**
 * 默认无障碍配置
 */
const DEFAULT_ACCESSIBILITY_OPTIONS: IAccessibilityOptions = {
  enabled: true,
  keyboardNavigation: true,
  screenReaderSupport: true,
  focusManagement: 'auto',
  ariaLabels: {
    uploader: '文件上传器',
    dropZone: '拖放区域，可以将文件拖放到此处上传',
    fileList: '已上传文件列表',
    fileItem: '文件项',
    uploadButton: '选择文件',
    removeButton: '移除文件',
    cancelButton: '取消上传',
    retryButton: '重试上传',
    progress: '上传进度',
  },
};

/**
 * 无障碍插件类
 */
export class AccessibilityPlugin implements IPlugin {
  /** 插件名称 */
  public readonly name: string = 'AccessibilityPlugin';
  /** 插件类型 */
  public readonly type: PluginType = PluginType.UI;
  /** 插件版本 */
  public readonly version: string = '1.0.0';
  /** 插件依赖 */
  public readonly dependencies: string[] = [];

  /** 无障碍配置选项 */
  private _options: IAccessibilityOptions;
  /** 核心实例引用 */
  private _core: UploaderCore | null = null;
  /** 事件总线引用 */
  private _eventBus: EventBus | null = null;
  /** 键盘事件处理器 */
  private _keyboardEventHandler: ((event: KeyboardEvent) => void) | null = null;
  /** 焦点管理计时器ID */
  private _focusTimerId: number | null = null;
  /** 上次聚焦的元素 */
  private _lastFocusedElement: HTMLElement | null = null;

  /**
   * 构造函数
   * @param options 无障碍配置选项
   */
  constructor(options?: Partial<IAccessibilityOptions>) {
    this._options = {
      ...DEFAULT_ACCESSIBILITY_OPTIONS,
      ...options,
    };
  }

  /**
   * 安装插件
   * @param core 上传核心实例
   */
  public install(core: UploaderCore): void {
    if (!this._options.enabled) return;

    this._core = core;
    this._eventBus = core.getEventBus();

    // 注册事件处理
    this._registerEventHandlers();

    // 添加ARIA属性注入功能
    core.addHook('beforeRender', this._injectAriaAttributes.bind(this));

    // 添加键盘导航支持
    if (this._options.keyboardNavigation) {
      this._setupKeyboardNavigation();
    }

    // 添加屏幕阅读器支持
    if (this._options.screenReaderSupport) {
      this._setupScreenReaderSupport();
    }

    // 设置焦点管理
    if (this._options.focusManagement === 'auto') {
      this._setupFocusManagement();
    }
  }

  /**
   * 卸载插件
   */
  public uninstall(): void {
    if (!this._core || !this._eventBus) return;

    // 移除键盘事件监听
    if (this._keyboardEventHandler) {
      document.removeEventListener('keydown', this._keyboardEventHandler);
      this._keyboardEventHandler = null;
    }

    // 清除焦点管理计时器
    if (this._focusTimerId !== null) {
      window.clearInterval(this._focusTimerId);
      this._focusTimerId = null;
    }

    // 移除事件监听
    this._unregisterEventHandlers();

    this._core = null;
    this._eventBus = null;
  }

  /**
   * 获取无障碍配置
   */
  public getOptions(): IAccessibilityOptions {
    return { ...this._options };
  }

  /**
   * 更新无障碍配置
   * @param options 新的配置选项
   */
  public updateOptions(options: Partial<IAccessibilityOptions>): void {
    this._options = {
      ...this._options,
      ...options,
    };

    // 如果插件已安装，则重新应用配置
    if (this._core) {
      this.uninstall();
      this.install(this._core);
    }
  }

  /**
   * 获取无障碍属性
   * @param elementType 元素类型
   * @param additionalProps 附加属性
   */
  public getAccessibilityProps(
    elementType: keyof (typeof DEFAULT_ACCESSIBILITY_OPTIONS)['ariaLabels'],
    additionalProps: Partial<IAccessibilityProps> = {}
  ): IAccessibilityProps {
    const baseProps: IAccessibilityProps = {};

    // 添加ARIA标签
    if (this._options.ariaLabels && this._options.ariaLabels[elementType]) {
      baseProps['aria-label'] = this._options.ariaLabels[elementType];
    }

    // 根据元素类型设置角色
    switch (elementType) {
      case 'uploader':
        baseProps.role = 'region';
        break;
      case 'dropZone':
        baseProps.role = 'button';
        baseProps.tabIndex = 0;
        break;
      case 'fileList':
        baseProps.role = 'region';
        break;
      case 'fileItem':
        baseProps.role = 'listitem';
        break;
      case 'uploadButton':
      case 'removeButton':
      case 'cancelButton':
      case 'retryButton':
        baseProps.role = 'button';
        baseProps.tabIndex = 0;
        break;
      case 'progress':
        baseProps.role = 'progressbar';
        baseProps['aria-valuemin'] = 0;
        baseProps['aria-valuemax'] = 100;
        break;
    }

    // 合并附加属性
    return {
      ...baseProps,
      ...additionalProps,
    };
  }

  /**
   * 设置元素为无障碍元素
   * @param element DOM元素
   * @param props 无障碍属性
   */
  public setAccessibleElement(
    element: HTMLElement,
    props: IAccessibilityProps
  ): void {
    if (!element) return;

    // 设置角色
    if (props.role) {
      element.setAttribute('role', props.role);
    }

    // 设置tabIndex
    if (typeof props.tabIndex === 'number') {
      element.tabIndex = props.tabIndex;
    }

    // 设置ARIA属性
    Object.entries(props).forEach(([key, value]) => {
      if (key.startsWith('aria-') && value !== undefined) {
        element.setAttribute(key, String(value));
      }
    });
  }

  /**
   * 设置活动元素的焦点
   * @param element 要聚焦的元素
   */
  public focusElement(element: HTMLElement | null): void {
    if (!element) return;

    try {
      this._lastFocusedElement = element;
      element.focus();
    } catch (error) {
      console.error('无法设置元素焦点:', error);
    }
  }

  /**
   * 注册事件处理器
   */
  private _registerEventHandlers(): void {
    if (!this._eventBus) return;

    // 上传开始时发布无障碍通知
    this._eventBus.on('upload:start', ({ file }) => {
      this._announceToScreenReader(`开始上传文件: ${file.name}`);
    });

    // 上传完成时发布无障碍通知
    this._eventBus.on('upload:success', ({ file }) => {
      this._announceToScreenReader(`文件上传成功: ${file.name}`);
    });

    // 上传错误时发布无障碍通知
    this._eventBus.on('upload:error', ({ file, error }) => {
      this._announceToScreenReader(
        `文件上传失败: ${file.name}, 错误: ${error.message}`
      );
    });

    // 上传进度更新时更新ARIA属性
    this._eventBus.on('upload:progress', ({ file, progress }) => {
      this._updateProgressAriaAttributes(file.id, progress);
    });

    // 文件添加时发布无障碍通知
    this._eventBus.on('file:add', ({ file }) => {
      this._announceToScreenReader(`添加文件: ${file.name}`);
    });

    // 文件删除时发布无障碍通知
    this._eventBus.on('file:remove', ({ file }) => {
      this._announceToScreenReader(`移除文件: ${file.name}`);
    });
  }

  /**
   * 取消注册事件处理器
   */
  private _unregisterEventHandlers(): void {
    if (!this._eventBus) return;

    this._eventBus.off('upload:start');
    this._eventBus.off('upload:success');
    this._eventBus.off('upload:error');
    this._eventBus.off('upload:progress');
    this._eventBus.off('file:add');
    this._eventBus.off('file:remove');
  }

  /**
   * 注入ARIA属性
   * @param elements 渲染元素
   */
  private _injectAriaAttributes(elements: Record<string, HTMLElement>): void {
    // 为每个元素添加对应的ARIA属性
    Object.entries(elements).forEach(([key, element]) => {
      const elementType =
        key as keyof (typeof DEFAULT_ACCESSIBILITY_OPTIONS)['ariaLabels'];
      const props = this.getAccessibilityProps(elementType);
      this.setAccessibleElement(element, props);
    });
  }

  /**
   * 设置键盘导航支持
   */
  private _setupKeyboardNavigation(): void {
    this._keyboardEventHandler = (event: KeyboardEvent) => {
      // 空格键或回车键激活当前聚焦的元素
      if (
        (event.code === 'Space' || event.code === 'Enter') &&
        document.activeElement
      ) {
        const element = document.activeElement as HTMLElement;
        const role = element.getAttribute('role');

        if (role === 'button') {
          event.preventDefault();
          element.click();
        }
      }

      // 处理自定义键盘事件
      if (this._options.handlers?.onKeyDown) {
        this._options.handlers.onKeyDown(event);
      }
    };

    document.addEventListener('keydown', this._keyboardEventHandler);
  }

  /**
   * 设置屏幕阅读器支持
   */
  private _setupScreenReaderSupport(): void {
    // 创建或获取屏幕阅读器通知区域
    this._getOrCreateScreenReaderElement();
  }

  /**
   * 设置焦点管理
   */
  private _setupFocusManagement(): void {
    if (!this._eventBus) return;

    // 文件添加后聚焦到相应元素
    this._eventBus.on('file:add', ({ file }) => {
      setTimeout(() => {
        const fileElement = document.getElementById(`file-item-${file.id}`);
        if (fileElement) {
          this.focusElement(fileElement);
        }
      }, 100);
    });

    // 错误发生时聚焦到重试按钮
    this._eventBus.on('upload:error', ({ file }) => {
      setTimeout(() => {
        const retryButton = document.getElementById(`retry-button-${file.id}`);
        if (retryButton) {
          this.focusElement(retryButton);
        }
      }, 100);
    });
  }

  /**
   * 更新进度条的ARIA属性
   * @param fileId 文件ID
   * @param progress 上传进度
   */
  private _updateProgressAriaAttributes(
    fileId: string,
    progress: number
  ): void {
    const progressElement = document.getElementById(`progress-${fileId}`);
    if (!progressElement) return;

    const valueNow = Math.round(progress);
    progressElement.setAttribute('aria-valuenow', String(valueNow));
    progressElement.setAttribute('aria-valuetext', `${valueNow}%已上传`);
  }

  /**
   * 向屏幕阅读器宣告消息
   * @param message 要宣告的消息
   */
  private _announceToScreenReader(message: string): void {
    const srElement = this._getOrCreateScreenReaderElement();

    // 清空当前内容
    srElement.textContent = '';

    // 使用setTimeout确保屏幕阅读器能够检测到内容变化
    setTimeout(() => {
      srElement.textContent = message;
    }, 50);
  }

  /**
   * 获取或创建屏幕阅读器宣告元素
   */
  private _getOrCreateScreenReaderElement(): HTMLElement {
    const elementId = 'file-chunk-pro-sr-announcer';
    let element = document.getElementById(elementId);

    if (!element) {
      element = document.createElement('div');
      element.id = elementId;
      element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true');
      element.style.position = 'absolute';
      element.style.width = '1px';
      element.style.height = '1px';
      element.style.margin = '-1px';
      element.style.padding = '0';
      element.style.overflow = 'hidden';
      element.style.clip = 'rect(0, 0, 0, 0)';
      element.style.border = '0';

      document.body.appendChild(element);
    }

    return element;
  }
}
