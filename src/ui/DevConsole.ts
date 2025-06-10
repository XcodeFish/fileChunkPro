/**
 * DevConsole - 开发者控制台UI组件
 * 提供可视化调试界面，显示日志、错误诊断和性能指标
 */

import { DebugCenter } from '../core/DebugCenter';
import {
  IDevConsoleConfig,
  ILogEntry,
  ILogFilterOptions,
  LogLevel,
} from '../types/debug';

/**
 * 开发者控制台UI组件
 */
export class DevConsole {
  private debugCenter: DebugCenter;
  private config: IDevConsoleConfig;
  private container: HTMLElement | null = null;
  private isVisible = false;
  private selectedTab = 'logs';
  private logFilters: ILogFilterOptions = {};
  private logContainer: HTMLElement | null = null;
  private errorContainer: HTMLElement | null = null;
  private networkContainer: HTMLElement | null = null;
  private performanceContainer: HTMLElement | null = null;
  private configContainer: HTMLElement | null = null;

  // 基本样式
  private readonly styles = {
    console: `
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 300px;
      background-color: rgba(30, 30, 30, 0.95);
      color: #f0f0f0;
      font-family: monospace;
      font-size: 12px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      border-top: 1px solid #555;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
    `,
    header: `
      display: flex;
      justify-content: space-between;
      padding: 5px 10px;
      background-color: #333;
      border-bottom: 1px solid #555;
    `,
    title: `
      font-weight: bold;
      font-size: 14px;
      color: #fff;
    `,
    closeButton: `
      cursor: pointer;
      color: #aaa;
      font-size: 16px;
      margin-left: 10px;
    `,
    tabs: `
      display: flex;
      background-color: #333;
      border-bottom: 1px solid #555;
    `,
    tab: `
      padding: 5px 15px;
      cursor: pointer;
      border-right: 1px solid #555;
    `,
    activeTab: `
      background-color: #444;
      border-bottom: 2px solid #4a9eff;
    `,
    tabContent: `
      flex: 1;
      overflow: auto;
      padding: 5px;
    `,
    toolbar: `
      display: flex;
      padding: 5px;
      background-color: #333;
      border-bottom: 1px solid #555;
    `,
    button: `
      margin-right: 5px;
      padding: 3px 8px;
      background-color: #444;
      border: 1px solid #555;
      color: #fff;
      cursor: pointer;
      border-radius: 3px;
    `,
    filterInput: `
      margin-right: 5px;
      padding: 3px 8px;
      background-color: #444;
      border: 1px solid #555;
      color: #fff;
      border-radius: 3px;
    `,
    logEntry: `
      padding: 2px 5px;
      border-bottom: 1px solid #444;
      word-break: break-word;
    `,
    error: `
      color: #ff5f5f;
    `,
    warn: `
      color: #ffb74d;
    `,
    info: `
      color: #4a9eff;
    `,
    debug: `
      color: #aaa;
    `,
    timestamp: `
      color: #888;
      margin-right: 5px;
    `,
    module: `
      color: #aaa;
      margin-right: 5px;
    `,
    message: `
      color: #fff;
    `,
    expandButton: `
      cursor: pointer;
      color: #aaa;
      margin-right: 5px;
    `,
    expandedContent: `
      margin-left: 20px;
      padding: 5px;
      background-color: #2a2a2a;
      border-radius: 3px;
      margin-top: 3px;
    `,
    resizeHandle: `
      width: 100%;
      height: 5px;
      background-color: #555;
      cursor: ns-resize;
    `,
  };

  /**
   * 创建开发者控制台
   * @param config 控制台配置
   */
  constructor(config: IDevConsoleConfig = {}) {
    this.debugCenter = DebugCenter.getInstance();
    this.config = {
      theme: config.theme || 'dark',
      position: config.position || 'bottom',
      width: config.width || '100%',
      height: config.height || '300px',
      zIndex: config.zIndex || 9999,
      showToolbar: config.showToolbar !== false,
      defaultTab: config.defaultTab || 'logs',
      collapsible: config.collapsible !== false,
      transparent: !!config.transparent,
      shortcutKey: config.shortcutKey || 'F12',
    };
    this.selectedTab = this.config.defaultTab || 'logs';

    // 注册事件处理程序
    this.registerEvents();
  }

  /**
   * 注册事件处理程序
   */
  private registerEvents(): void {
    // 监听调试中心的事件
    this.debugCenter.on('log:new', logEntry => {
      if (this.isVisible && this.selectedTab === 'logs') {
        this.appendLogEntry(logEntry);
      }
    });

    this.debugCenter.on('log:cleared', () => {
      if (this.logContainer) {
        this.logContainer.innerHTML = '';
      }
    });

    this.debugCenter.on('diagnostic:new', _diagnostic => {
      if (this.isVisible && this.selectedTab === 'errors') {
        this.updateErrorsTab();
      }
    });

    this.debugCenter.on('performance:metric', () => {
      if (this.isVisible && this.selectedTab === 'performance') {
        this.updatePerformanceTab();
      }
    });

    // 注册快捷键
    if (typeof window !== 'undefined' && this.config.shortcutKey) {
      window.addEventListener('keydown', event => {
        // 处理快捷键
        if (event.key === this.config.shortcutKey) {
          event.preventDefault();
          this.toggle();
        }
      });
    }
  }

  /**
   * 创建控制台DOM
   */
  private createConsoleDOM(): void {
    if (typeof document === 'undefined') {
      return;
    }

    // 创建控制台容器
    this.container = document.createElement('div');
    this.container.setAttribute('id', 'fileChunkPro-dev-console');
    this.container.setAttribute('style', this.styles.console);

    // 创建控制台头部
    const header = document.createElement('div');
    header.setAttribute('style', this.styles.header);

    const title = document.createElement('div');
    title.setAttribute('style', this.styles.title);
    title.textContent = 'fileChunkPro Developer Console';

    const controls = document.createElement('div');

    const closeButton = document.createElement('span');
    closeButton.setAttribute('style', this.styles.closeButton);
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => this.hide());

    controls.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(controls);

    // 创建标签页
    const tabs = document.createElement('div');
    tabs.setAttribute('style', this.styles.tabs);

    const tabNames = ['logs', 'errors', 'network', 'performance', 'config'];
    const tabLabels = ['日志', '错误', '网络', '性能', '配置'];

    tabNames.forEach((tabName, index) => {
      const tab = document.createElement('div');
      tab.setAttribute(
        'style',
        this.styles.tab +
          (tabName === this.selectedTab ? this.styles.activeTab : '')
      );
      tab.textContent = tabLabels[index];
      tab.addEventListener('click', () => this.switchTab(tabName));
      tabs.appendChild(tab);
    });

    // 创建内容区域
    const content = document.createElement('div');
    content.setAttribute('style', this.styles.tabContent);

    // 创建日志标签页内容
    this.logContainer = document.createElement('div');
    this.logContainer.setAttribute(
      'style',
      'display: ' + (this.selectedTab === 'logs' ? 'block' : 'none')
    );

    // 创建日志工具栏
    const logToolbar = document.createElement('div');
    logToolbar.setAttribute('style', this.styles.toolbar);

    const clearButton = document.createElement('button');
    clearButton.setAttribute('style', this.styles.button);
    clearButton.textContent = '清除';
    clearButton.addEventListener('click', () => this.debugCenter.clearLogs());

    const filterInput = document.createElement('input');
    filterInput.setAttribute('type', 'text');
    filterInput.setAttribute('placeholder', '搜索日志...');
    filterInput.setAttribute('style', this.styles.filterInput);
    filterInput.addEventListener('input', e => {
      this.logFilters.search = (e.target as HTMLInputElement).value;
      this.updateLogsTab();
    });

    const levelSelect = document.createElement('select');
    levelSelect.setAttribute('style', this.styles.button);

    const levels = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
    levels.forEach(level => {
      const option = document.createElement('option');
      option.value = level;
      option.textContent = level;
      if (level === 'INFO') {
        option.selected = true;
      }
      levelSelect.appendChild(option);
    });

    levelSelect.addEventListener('change', e => {
      this.logFilters.level =
        LogLevel[
          (e.target as HTMLSelectElement).value as keyof typeof LogLevel
        ];
      this.updateLogsTab();
    });

    logToolbar.appendChild(clearButton);
    logToolbar.appendChild(filterInput);
    logToolbar.appendChild(levelSelect);

    // 创建其他标签页内容
    this.errorContainer = document.createElement('div');
    this.errorContainer.setAttribute(
      'style',
      'display: ' + (this.selectedTab === 'errors' ? 'block' : 'none')
    );

    this.networkContainer = document.createElement('div');
    this.networkContainer.setAttribute(
      'style',
      'display: ' + (this.selectedTab === 'network' ? 'block' : 'none')
    );

    this.performanceContainer = document.createElement('div');
    this.performanceContainer.setAttribute(
      'style',
      'display: ' + (this.selectedTab === 'performance' ? 'block' : 'none')
    );

    this.configContainer = document.createElement('div');
    this.configContainer.setAttribute(
      'style',
      'display: ' + (this.selectedTab === 'config' ? 'block' : 'none')
    );

    // 组装DOM
    content.appendChild(logToolbar);
    content.appendChild(this.logContainer);
    content.appendChild(this.errorContainer);
    content.appendChild(this.networkContainer);
    content.appendChild(this.performanceContainer);
    content.appendChild(this.configContainer);

    // 创建调整大小的句柄
    const resizeHandle = document.createElement('div');
    resizeHandle.setAttribute('style', this.styles.resizeHandle);

    let startY = 0;
    let startHeight = 0;

    const onMouseDown = (e: MouseEvent) => {
      startY = e.clientY;
      startHeight = parseInt(this.container!.style.height, 10);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.container) return;
      const newHeight = startHeight - (e.clientY - startY);
      if (newHeight > 100) {
        this.container.style.height = newHeight + 'px';
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizeHandle.addEventListener('mousedown', onMouseDown);

    this.container.appendChild(resizeHandle);
    this.container.appendChild(header);
    this.container.appendChild(tabs);
    this.container.appendChild(content);

    // 添加到文档
    document.body.appendChild(this.container);

    // 初始加载日志
    this.updateLogsTab();
  }

  /**
   * 切换标签页
   * @param tabName 标签页名称
   */
  private switchTab(tabName: string): void {
    if (!this.container) return;

    this.selectedTab = tabName;

    // 更新标签页样式
    const tabElements = this.container.querySelectorAll(
      '[style*="' + this.styles.tab + '"]'
    );
    tabElements.forEach((tab, index) => {
      const tabNames = ['logs', 'errors', 'network', 'performance', 'config'];
      if (tabNames[index] === tabName) {
        tab.setAttribute('style', this.styles.tab + this.styles.activeTab);
      } else {
        tab.setAttribute('style', this.styles.tab);
      }
    });

    // 隐藏所有内容区域
    if (this.logContainer) this.logContainer.style.display = 'none';
    if (this.errorContainer) this.errorContainer.style.display = 'none';
    if (this.networkContainer) this.networkContainer.style.display = 'none';
    if (this.performanceContainer)
      this.performanceContainer.style.display = 'none';
    if (this.configContainer) this.configContainer.style.display = 'none';

    // 显示选中的标签页内容
    switch (tabName) {
      case 'logs':
        if (this.logContainer) this.logContainer.style.display = 'block';
        this.updateLogsTab();
        break;
      case 'errors':
        if (this.errorContainer) this.errorContainer.style.display = 'block';
        this.updateErrorsTab();
        break;
      case 'network':
        if (this.networkContainer)
          this.networkContainer.style.display = 'block';
        this.updateNetworkTab();
        break;
      case 'performance':
        if (this.performanceContainer)
          this.performanceContainer.style.display = 'block';
        this.updatePerformanceTab();
        break;
      case 'config':
        if (this.configContainer) this.configContainer.style.display = 'block';
        this.updateConfigTab();
        break;
    }
  }

  /**
   * 更新日志标签页
   */
  private async updateLogsTab(): Promise<void> {
    if (!this.logContainer) return;

    this.logContainer.innerHTML = '';

    // 获取日志并显示
    const logs = await this.debugCenter.getLogs(this.logFilters);
    logs.forEach(log => {
      this.appendLogEntry(log);
    });
  }

  /**
   * 添加单条日志
   * @param log 日志条目
   */
  private appendLogEntry(log: ILogEntry): void {
    if (!this.logContainer) return;

    const logEntry = document.createElement('div');
    logEntry.setAttribute('style', this.styles.logEntry);

    // 根据日志级别设置样式
    let levelStyle = '';
    switch (log.level) {
      case LogLevel.ERROR:
        levelStyle = this.styles.error;
        break;
      case LogLevel.WARN:
        levelStyle = this.styles.warn;
        break;
      case LogLevel.INFO:
        levelStyle = this.styles.info;
        break;
      case LogLevel.DEBUG:
        levelStyle = this.styles.debug;
        break;
    }

    // 格式化时间戳
    const timestamp = new Date(log.timestamp).toISOString().substr(11, 12);

    // 创建日志内容
    const timestampSpan = document.createElement('span');
    timestampSpan.setAttribute('style', this.styles.timestamp);
    timestampSpan.textContent = timestamp;

    const levelSpan = document.createElement('span');
    levelSpan.setAttribute('style', levelStyle);
    levelSpan.textContent = `[${LogLevel[log.level]}]`;

    const moduleSpan = document.createElement('span');
    moduleSpan.setAttribute('style', this.styles.module);
    moduleSpan.textContent = `[${log.module}]`;

    const messageSpan = document.createElement('span');
    messageSpan.setAttribute('style', this.styles.message);
    messageSpan.textContent = log.message;

    logEntry.appendChild(timestampSpan);
    logEntry.appendChild(levelSpan);
    logEntry.appendChild(moduleSpan);
    logEntry.appendChild(messageSpan);

    // 如果有附加数据，添加一个展开按钮
    if (log.data) {
      const expandButton = document.createElement('span');
      expandButton.setAttribute('style', this.styles.expandButton);
      expandButton.textContent = '+';
      expandButton.addEventListener('click', () => {
        const expandedContent = logEntry.querySelector('.expanded-content');
        if (expandedContent) {
          // 切换显示状态
          if (expandedContent.style.display === 'none') {
            expandedContent.style.display = 'block';
            expandButton.textContent = '-';
          } else {
            expandedContent.style.display = 'none';
            expandButton.textContent = '+';
          }
        } else {
          // 创建展开内容
          const content = document.createElement('pre');
          content.className = 'expanded-content';
          content.setAttribute('style', this.styles.expandedContent);
          content.textContent = JSON.stringify(log.data, null, 2);
          logEntry.appendChild(content);
          expandButton.textContent = '-';
        }
      });

      logEntry.insertBefore(expandButton, moduleSpan);
    }

    this.logContainer.appendChild(logEntry);

    // 滚动到底部
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  /**
   * 更新错误标签页
   */
  private updateErrorsTab(): void {
    if (!this.errorContainer) return;

    this.errorContainer.innerHTML = '';

    // 获取诊断结果并显示
    const diagnostics = this.debugCenter.getDiagnosticResults();
    diagnostics.forEach(diagnostic => {
      const errorEntry = document.createElement('div');
      errorEntry.setAttribute(
        'style',
        this.styles.logEntry + this.styles.error
      );

      const timestamp = new Date(diagnostic.timestamp)
        .toISOString()
        .substr(11, 12);

      const header = document.createElement('div');
      header.innerHTML = `
        <span style="${this.styles.timestamp}">${timestamp}</span>
        <span style="${this.styles.error}">[${diagnostic.severity}]</span>
        <span style="${this.styles.module}">[${diagnostic.errorType}]</span>
        <span style="${this.styles.message}">${diagnostic.message}</span>
      `;

      const expandButton = document.createElement('span');
      expandButton.setAttribute('style', this.styles.expandButton);
      expandButton.textContent = '+';
      expandButton.addEventListener('click', () => {
        const expandedContent = errorEntry.querySelector('.expanded-content');
        if (expandedContent) {
          if (expandedContent.style.display === 'none') {
            expandedContent.style.display = 'block';
            expandButton.textContent = '-';
          } else {
            expandedContent.style.display = 'none';
            expandButton.textContent = '+';
          }
        } else {
          const content = document.createElement('div');
          content.className = 'expanded-content';
          content.setAttribute('style', this.styles.expandedContent);

          // 详细内容
          content.innerHTML = `
            <div><strong>错误ID:</strong> ${diagnostic.errorId}</div>
            <div><strong>根本原因:</strong> ${diagnostic.rootCause}</div>
            <div><strong>可恢复:</strong> ${diagnostic.recoverable ? '是' : '否'}</div>
            ${diagnostic.recommendation.length > 0 ? '<div><strong>建议:</strong> ' + diagnostic.recommendation.join('<br>') + '</div>' : ''}
            <div><strong>上下文:</strong> <pre>${JSON.stringify(diagnostic.context, null, 2)}</pre></div>
            ${diagnostic.debugInfo.stack ? '<div><strong>堆栈:</strong> <pre>' + diagnostic.debugInfo.stack + '</pre></div>' : ''}
          `;

          errorEntry.appendChild(content);
          expandButton.textContent = '-';
        }
      });

      header.insertBefore(expandButton, header.firstChild);
      errorEntry.appendChild(header);

      this.errorContainer.appendChild(errorEntry);
    });

    if (diagnostics.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.setAttribute('style', this.styles.logEntry);
      emptyMessage.textContent = '没有错误记录';
      this.errorContainer.appendChild(emptyMessage);
    }
  }

  /**
   * 更新网络标签页
   */
  private updateNetworkTab(): void {
    if (!this.networkContainer) return;

    this.networkContainer.innerHTML =
      '<div style="padding: 10px;">网络监控功能正在开发中...</div>';
  }

  /**
   * 更新性能标签页
   */
  private updatePerformanceTab(): void {
    if (!this.performanceContainer) return;

    this.performanceContainer.innerHTML = '';

    // 获取性能指标
    const metrics = this.debugCenter.getPerformanceMetrics();

    // 按类别分组
    const categories: Record<string, any[]> = {};
    metrics.forEach(metric => {
      if (!categories[metric.category]) {
        categories[metric.category] = [];
      }
      categories[metric.category].push(metric);
    });

    // 创建分类标签页
    const categoryTabs = document.createElement('div');
    categoryTabs.setAttribute('style', this.styles.tabs);

    let first = true;
    for (const category in categories) {
      const tab = document.createElement('div');
      tab.setAttribute(
        'style',
        this.styles.tab + (first ? this.styles.activeTab : '')
      );
      tab.textContent = this.formatCategoryName(category);
      tab.dataset.category = category;
      tab.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        const cat = target.dataset.category;

        // 更新标签样式
        const allTabs = categoryTabs.querySelectorAll('div');
        allTabs.forEach(t => t.setAttribute('style', this.styles.tab));
        target.setAttribute('style', this.styles.tab + this.styles.activeTab);

        // 显示对应类别的指标
        const sections =
          this.performanceContainer!.querySelectorAll('.metrics-section');
        sections.forEach(section => {
          if (section.id === `metrics-${cat}`) {
            (section as HTMLElement).style.display = 'block';
          } else {
            (section as HTMLElement).style.display = 'none';
          }
        });
      });

      categoryTabs.appendChild(tab);
      first = false;
    }

    this.performanceContainer.appendChild(categoryTabs);

    // 创建各类别的指标展示区域
    first = true;
    for (const category in categories) {
      const section = document.createElement('div');
      section.className = 'metrics-section';
      section.id = `metrics-${category}`;
      section.style.display = first ? 'block' : 'none';

      // 指标表格
      const table = document.createElement('table');
      table.setAttribute('style', 'width: 100%; border-collapse: collapse;');

      // 表头
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr style="background-color: #333; text-align: left;">
          <th style="padding: 5px;">名称</th>
          <th style="padding: 5px;">值</th>
          <th style="padding: 5px;">单位</th>
          <th style="padding: 5px;">时间</th>
        </tr>
      `;

      // 表体
      const tbody = document.createElement('tbody');
      categories[category].forEach(metric => {
        const row = document.createElement('tr');
        row.setAttribute('style', 'border-bottom: 1px solid #444;');

        const timestamp = new Date(metric.timestamp)
          .toISOString()
          .substr(11, 12);

        row.innerHTML = `
          <td style="padding: 5px;">${metric.name}</td>
          <td style="padding: 5px;">${metric.value}</td>
          <td style="padding: 5px;">${metric.unit}</td>
          <td style="padding: 5px;">${timestamp}</td>
        `;

        tbody.appendChild(row);
      });

      table.appendChild(thead);
      table.appendChild(tbody);
      section.appendChild(table);

      this.performanceContainer.appendChild(section);
      first = false;
    }

    if (Object.keys(categories).length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.setAttribute('style', this.styles.logEntry);
      emptyMessage.textContent = '没有性能指标记录';
      this.performanceContainer.appendChild(emptyMessage);
    }
  }

  /**
   * 格式化类别名称
   */
  private formatCategoryName(category: string): string {
    const names: Record<string, string> = {
      network: '网络',
      memory: '内存',
      cpu: 'CPU',
      fileOperation: '文件操作',
      rendering: '渲染',
      other: '其他',
    };

    return names[category] || category;
  }

  /**
   * 更新配置标签页
   */
  private updateConfigTab(): void {
    if (!this.configContainer) return;

    this.configContainer.innerHTML =
      '<div style="padding: 10px;">配置验证功能正在开发中...</div>';
  }

  /**
   * 显示控制台
   */
  public show(): void {
    if (this.isVisible) return;

    if (!this.container) {
      this.createConsoleDOM();
    } else if (this.container.parentNode === null) {
      document.body.appendChild(this.container);
    }

    if (this.container) {
      this.container.style.display = 'flex';
    }

    this.isVisible = true;

    // 更新当前标签页
    this.switchTab(this.selectedTab);
  }

  /**
   * 隐藏控制台
   */
  public hide(): void {
    if (!this.isVisible || !this.container) return;

    this.container.style.display = 'none';
    this.isVisible = false;
  }

  /**
   * 切换控制台显示状态
   */
  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 设置过滤选项
   * @param filters 过滤选项
   */
  public setFilters(filters: ILogFilterOptions): void {
    this.logFilters = filters;
    if (this.isVisible && this.selectedTab === 'logs') {
      this.updateLogsTab();
    }
  }

  /**
   * 销毁控制台
   */
  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.isVisible = false;
  }
}
