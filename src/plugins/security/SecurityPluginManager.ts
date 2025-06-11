/**
 * SecurityPluginManager
 * 安全插件管理器，负责安全级别插件的统一管理、动态升降级
 */

import UploaderCore from '../../core/UploaderCore';
import { SecurityLevel } from '../../types';
import { AbstractSecurityPlugin } from './AbstractSecurityPlugin';
import BasicSecurityPlugin, {
  BasicSecurityPluginOptions,
} from './BasicSecurityPlugin';
import StandardSecurityPlugin, {
  StandardSecurityPluginOptions,
} from './StandardSecurityPlugin';
import AdvancedSecurityPlugin, {
  AdvancedSecurityPluginOptions,
} from './AdvancedSecurityPlugin';
import SecurityConfigValidator from './validator/SecurityConfigValidator';
import { EventBus } from '../../core/EventBus';

/**
 * 环境变化数据接口
 */
interface EnvironmentChangeData {
  environment?: string;
  networkStatus?: NetworkStatus;
  memoryStatus?: MemoryStatus;
  [key: string]: unknown;
}

/**
 * 网络状态接口
 */
interface NetworkStatus {
  online: boolean;
  connectionType?: string;
  downlink?: number;
  rtt?: number;
  [key: string]: unknown;
}

/**
 * 内存状态接口
 */
interface MemoryStatus {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
  [key: string]: unknown;
}

/**
 * 安全威胁数据接口
 */
interface SecurityThreatData {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * 安全级别请求数据接口
 */
interface SecurityLevelRequestData {
  level: SecurityLevel;
  requester?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface SecurityPluginManagerOptions {
  /**
   * 初始安全级别
   */
  initialSecurityLevel?: SecurityLevel;

  /**
   * 基础安全插件选项
   */
  basicOptions?: BasicSecurityPluginOptions;

  /**
   * 标准安全插件选项
   */
  standardOptions?: StandardSecurityPluginOptions;

  /**
   * 高级安全插件选项
   */
  advancedOptions?: AdvancedSecurityPluginOptions;

  /**
   * 是否自动监测环境升降级
   */
  autoDetectEnvironment?: boolean;

  /**
   * 是否启用安全配置验证
   */
  enableConfigValidation?: boolean;

  /**
   * 安全策略检查间隔(毫秒)
   * 用于定期检查环境，决定是否需要升降级
   */
  securityPolicyCheckInterval?: number;

  /**
   * 启用的安全级别，用于限定最高安全级别
   */
  enabledSecurityLevels?: SecurityLevel[];
}

/**
 * 安全插件管理器
 */
export default class SecurityPluginManager {
  /**
   * 当前安全级别
   */
  private _currentSecurityLevel: SecurityLevel;

  /**
   * 当前活跃的安全插件
   */
  private _activePlugin?: AbstractSecurityPlugin;

  /**
   * 安全插件实例映射表
   */
  private _plugins: Map<SecurityLevel, AbstractSecurityPlugin>;

  /**
   * 上传器实例
   */
  private _uploader?: UploaderCore;

  /**
   * 事件总线
   */
  private _eventBus?: EventBus;

  /**
   * 配置验证器
   */
  private _configValidator: SecurityConfigValidator;

  /**
   * 安全策略检查定时器ID
   */
  private _policyCheckTimerId?: number;

  /**
   * 管理器选项
   */
  private _options: SecurityPluginManagerOptions;

  /**
   * 构造函数
   * @param options 安全插件管理器选项
   */
  constructor(options: SecurityPluginManagerOptions = {}) {
    this._options = {
      initialSecurityLevel: SecurityLevel.BASIC,
      autoDetectEnvironment: true,
      enableConfigValidation: true,
      securityPolicyCheckInterval: 30000, // 默认30秒
      enabledSecurityLevels: [
        SecurityLevel.BASIC,
        SecurityLevel.STANDARD,
        SecurityLevel.ADVANCED,
      ],
      ...options,
    };

    this._currentSecurityLevel =
      this._options.initialSecurityLevel || SecurityLevel.BASIC;
    this._plugins = new Map();
    this._configValidator = new SecurityConfigValidator();

    // 创建所有级别的插件实例
    this._initializePlugins();
  }

  /**
   * 安装到上传器
   * @param uploader 上传器实例
   */
  public install(uploader: UploaderCore): void {
    this._uploader = uploader;
    this._eventBus = uploader.getEventBus();

    // 验证配置
    if (this._options.enableConfigValidation) {
      this._validateConfigurations();
    }

    // 注册事件处理
    this._registerEventHandlers();

    // 安装当前级别的插件
    this._installCurrentLevelPlugin();

    // 如果启用了自动检测环境，启动定时检查
    if (this._options.autoDetectEnvironment) {
      this._startEnvironmentDetection();
    }
  }

  /**
   * 升级安全级别
   * @param targetLevel 目标安全级别
   */
  public upgradeSecurityLevel(targetLevel: SecurityLevel): boolean {
    // 如果目标级别不高于当前级别，则不需要升级
    if (
      this._getSecurityLevelValue(targetLevel) <=
      this._getSecurityLevelValue(this._currentSecurityLevel)
    ) {
      console.warn(
        `无需升级: 当前级别(${this._currentSecurityLevel})已不低于目标级别(${targetLevel})`
      );
      return false;
    }

    // 检查目标级别是否在允许的级别范围内
    if (
      this._options.enabledSecurityLevels &&
      !this._options.enabledSecurityLevels.includes(targetLevel)
    ) {
      console.warn(`安全级别升级失败: ${targetLevel} 不在允许的级别范围内`);
      return false;
    }

    // 卸载当前插件
    this._uninstallCurrentPlugin();

    // 更新当前级别
    this._currentSecurityLevel = targetLevel;

    // 安装新级别的插件
    this._installCurrentLevelPlugin();

    // 事件通知
    if (this._eventBus) {
      this._eventBus.emit('security:levelChanged', {
        oldLevel: this._currentSecurityLevel,
        newLevel: targetLevel,
        timestamp: Date.now(),
      });
    }

    console.log(`安全级别已升级到: ${targetLevel}`);
    return true;
  }

  /**
   * 降级安全级别
   * @param targetLevel 目标安全级别
   */
  public downgradeSecurityLevel(targetLevel: SecurityLevel): boolean {
    // 如果目标级别不低于当前级别，则不需要降级
    if (
      this._getSecurityLevelValue(targetLevel) >=
      this._getSecurityLevelValue(this._currentSecurityLevel)
    ) {
      console.warn(
        `无需降级: 当前级别(${this._currentSecurityLevel})已不高于目标级别(${targetLevel})`
      );
      return false;
    }

    // 卸载当前插件
    this._uninstallCurrentPlugin();

    // 更新当前级别
    this._currentSecurityLevel = targetLevel;

    // 安装新级别的插件
    this._installCurrentLevelPlugin();

    // 事件通知
    if (this._eventBus) {
      this._eventBus.emit('security:levelChanged', {
        oldLevel: this._currentSecurityLevel,
        newLevel: targetLevel,
        timestamp: Date.now(),
      });
    }

    console.log(`安全级别已降级到: ${targetLevel}`);
    return true;
  }

  /**
   * 获取当前安全级别
   */
  public getCurrentSecurityLevel(): SecurityLevel {
    return this._currentSecurityLevel;
  }

  /**
   * 获取当前活跃的安全插件
   */
  public getActivePlugin(): AbstractSecurityPlugin | undefined {
    return this._activePlugin;
  }

  /**
   * 获取指定级别的安全插件
   * @param level 安全级别
   */
  public getPluginByLevel(
    level: SecurityLevel
  ): AbstractSecurityPlugin | undefined {
    return this._plugins.get(level);
  }

  /**
   * 卸载
   */
  public uninstall(): void {
    this._uninstallCurrentPlugin();

    // 停止环境检测
    if (this._policyCheckTimerId !== undefined) {
      clearInterval(this._policyCheckTimerId);
      this._policyCheckTimerId = undefined;
    }

    // 移除事件监听
    if (this._eventBus) {
      this._eventBus.off(
        'environment:change',
        this._handleEnvironmentChange.bind(this)
      );
      this._eventBus.off(
        'security:threatDetected',
        this._handleThreatDetected.bind(this)
      );
      this._eventBus.off(
        'security:requestUpgrade',
        this._handleUpgradeRequest.bind(this)
      );
      this._eventBus.off(
        'security:requestDowngrade',
        this._handleDowngradeRequest.bind(this)
      );
    }

    this._uploader = undefined;
    this._eventBus = undefined;
  }

  /**
   * 初始化所有安全插件
   * @private
   */
  private _initializePlugins(): void {
    // 创建基础安全插件
    const basicPlugin = new BasicSecurityPlugin(this._options.basicOptions);
    this._plugins.set(SecurityLevel.BASIC, basicPlugin);

    // 创建标准安全插件
    const standardPlugin = new StandardSecurityPlugin({
      ...this._options.basicOptions,
      ...this._options.standardOptions,
    });
    this._plugins.set(SecurityLevel.STANDARD, standardPlugin);

    // 创建高级安全插件
    const advancedPlugin = new AdvancedSecurityPlugin({
      ...this._options.basicOptions,
      ...this._options.standardOptions,
      ...this._options.advancedOptions,
    });
    this._plugins.set(SecurityLevel.ADVANCED, advancedPlugin);
  }

  /**
   * 验证安全配置
   * @private
   */
  private _validateConfigurations(): void {
    // 验证基础配置
    const basicPlugin = this._plugins.get(SecurityLevel.BASIC);
    if (basicPlugin) {
      const basicValidation = this._configValidator.validateBasicConfig(
        this._options.basicOptions as BasicSecurityPluginOptions
      );
      if (!basicValidation.valid) {
        console.warn('基础安全配置存在问题:', basicValidation.issues);
      }
    }

    // 验证标准配置
    const standardPlugin = this._plugins.get(SecurityLevel.STANDARD);
    if (standardPlugin) {
      const standardValidation = this._configValidator.validateStandardConfig(
        this._options.standardOptions as StandardSecurityPluginOptions
      );
      if (!standardValidation.valid) {
        console.warn('标准安全配置存在问题:', standardValidation.issues);
      }
    }

    // 验证高级配置
    const advancedPlugin = this._plugins.get(SecurityLevel.ADVANCED);
    if (advancedPlugin) {
      const advancedValidation = this._configValidator.validateAdvancedConfig(
        this._options.advancedOptions as AdvancedSecurityPluginOptions
      );
      if (!advancedValidation.valid) {
        console.warn('高级安全配置存在问题:', advancedValidation.issues);
      }
    }
  }

  /**
   * 安装当前级别的安全插件
   * @private
   */
  private _installCurrentLevelPlugin(): void {
    const plugin = this._plugins.get(this._currentSecurityLevel);

    if (plugin && this._uploader) {
      plugin.install(this._uploader);
      this._activePlugin = plugin;

      console.log(
        `已安装 ${this._currentSecurityLevel} 级别安全插件: ${plugin.name} v${plugin.version}`
      );
    } else {
      console.error(`无法安装 ${this._currentSecurityLevel} 级别的安全插件`);
    }
  }

  /**
   * 卸载当前安全插件
   * @private
   */
  private _uninstallCurrentPlugin(): void {
    if (this._activePlugin && this._activePlugin.uninstall) {
      this._activePlugin.uninstall();
      console.log(
        `已卸载 ${this._currentSecurityLevel} 级别安全插件: ${this._activePlugin.name}`
      );
      this._activePlugin = undefined;
    }
  }

  /**
   * 启动环境检测
   * @private
   */
  private _startEnvironmentDetection(): void {
    // 立即执行一次检测
    this._checkSecurityPolicy();

    // 设置定时检测
    this._policyCheckTimerId = window.setInterval(() => {
      this._checkSecurityPolicy();
    }, this._options.securityPolicyCheckInterval);
  }

  /**
   * 检查安全策略，根据环境决定是否需要升降级
   * @private
   */
  private _checkSecurityPolicy(): void {
    if (!this._uploader) return;

    const environment = this._uploader.getEnvironment();
    const networkStatus = this._getNetworkStatus();
    const memoryStatus = this._getMemoryStatus();

    // 根据当前环境状态决定适合的安全级别
    const recommendedLevel = this._determineRecommendedSecurityLevel(
      environment,
      networkStatus,
      memoryStatus
    );

    // 如果推荐级别与当前级别不同，考虑升降级
    if (recommendedLevel !== this._currentSecurityLevel) {
      if (
        this._getSecurityLevelValue(recommendedLevel) >
        this._getSecurityLevelValue(this._currentSecurityLevel)
      ) {
        this.upgradeSecurityLevel(recommendedLevel);
      } else {
        this.downgradeSecurityLevel(recommendedLevel);
      }
    }
  }

  /**
   * 注册事件处理程序
   * @private
   */
  private _registerEventHandlers(): void {
    if (!this._eventBus) return;

    // 监听环境变化
    this._eventBus.on(
      'environment:change',
      this._handleEnvironmentChange.bind(this)
    );

    // 监听安全威胁检测
    this._eventBus.on(
      'security:threatDetected',
      this._handleThreatDetected.bind(this)
    );

    // 监听安全级别升级请求
    this._eventBus.on(
      'security:requestUpgrade',
      this._handleUpgradeRequest.bind(this)
    );

    // 监听安全级别降级请求
    this._eventBus.on(
      'security:requestDowngrade',
      this._handleDowngradeRequest.bind(this)
    );
  }

  /**
   * 处理环境变化事件
   * @param _data 环境变化数据
   * @private
   */
  private _handleEnvironmentChange(_data: EnvironmentChangeData): void {
    if (this._options.autoDetectEnvironment) {
      console.log('检测到环境变化，重新评估安全级别');
      this._checkSecurityPolicy();
    }
  }

  /**
   * 处理安全威胁检测事件
   * @param data 威胁数据
   * @private
   */
  private _handleThreatDetected(data: SecurityThreatData): void {
    // 当检测到威胁时，考虑升级安全级别
    const severity = data.severity || 'medium';

    if (severity === 'critical' || severity === 'high') {
      console.warn(`检测到${severity}级别安全威胁，尝试升级安全级别`);

      if (this._currentSecurityLevel === SecurityLevel.BASIC) {
        this.upgradeSecurityLevel(SecurityLevel.STANDARD);
      } else if (this._currentSecurityLevel === SecurityLevel.STANDARD) {
        this.upgradeSecurityLevel(SecurityLevel.ADVANCED);
      }
    }
  }

  /**
   * 处理安全级别升级请求
   * @param data 请求数据
   * @private
   */
  private _handleUpgradeRequest(data: SecurityLevelRequestData): void {
    const targetLevel = data.level || SecurityLevel.STANDARD;
    const requester = data.requester || 'unknown';

    console.log(`收到来自 ${requester} 的安全级别升级请求: ${targetLevel}`);
    this.upgradeSecurityLevel(targetLevel);
  }

  /**
   * 处理安全级别降级请求
   * @param data 请求数据
   * @private
   */
  private _handleDowngradeRequest(data: SecurityLevelRequestData): void {
    const targetLevel = data.level || SecurityLevel.BASIC;
    const requester = data.requester || 'unknown';

    console.log(`收到来自 ${requester} 的安全级别降级请求: ${targetLevel}`);
    this.downgradeSecurityLevel(targetLevel);
  }

  /**
   * 获取安全级别对应的数值，用于比较
   * @param level 安全级别
   * @returns 对应的数值
   * @private
   */
  private _getSecurityLevelValue(level: SecurityLevel): number {
    switch (level) {
      case SecurityLevel.ADVANCED:
        return 3;
      case SecurityLevel.STANDARD:
        return 2;
      case SecurityLevel.BASIC:
      default:
        return 1;
    }
  }

  /**
   * 获取网络状态
   * @returns 网络状态对象
   * @private
   */
  private _getNetworkStatus(): NetworkStatus {
    // 在实际实现中，应该使用网络信息API或其他方式获取网络状态
    // 这里仅作示例
    return {
      online: navigator.onLine,
      connectionType: (navigator as any).connection?.type || 'unknown',
      downlink: (navigator as any).connection?.downlink || -1,
      rtt: (navigator as any).connection?.rtt || -1,
    };
  }

  /**
   * 获取内存状态
   * @returns 内存状态对象
   * @private
   */
  private _getMemoryStatus(): MemoryStatus {
    // 在实际实现中，应该使用performance API或其他方式获取内存状态
    // 这里仅作示例
    return {
      usedJSHeapSize: (performance as any).memory?.usedJSHeapSize || -1,
      totalJSHeapSize: (performance as any).memory?.totalJSHeapSize || -1,
      jsHeapSizeLimit: (performance as any).memory?.jsHeapSizeLimit || -1,
    };
  }

  /**
   * 根据环境状态确定推荐的安全级别
   * @param environment 运行环境
   * @param networkStatus 网络状态
   * @param memoryStatus 内存状态
   * @returns 推荐的安全级别
   * @private
   */
  private _determineRecommendedSecurityLevel(
    environment: string,
    networkStatus: NetworkStatus,
    memoryStatus: MemoryStatus
  ): SecurityLevel {
    // 网络离线状态下，降低安全级别以保证基本功能
    if (!networkStatus.online) {
      return SecurityLevel.BASIC;
    }

    // 弱网环境下，考虑降级到标准级别
    if (networkStatus.downlink > 0 && networkStatus.downlink < 1) {
      return SecurityLevel.STANDARD;
    }

    // 内存紧张时，降低到基础级别
    if (
      memoryStatus.usedJSHeapSize > 0 &&
      memoryStatus.totalJSHeapSize > 0 &&
      memoryStatus.usedJSHeapSize / memoryStatus.totalJSHeapSize > 0.8
    ) {
      return SecurityLevel.BASIC;
    }

    // 默认推荐使用当前配置的级别
    return this._currentSecurityLevel;
  }
}
