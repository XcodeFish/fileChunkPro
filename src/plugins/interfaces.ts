import UploaderCore from '../core/UploaderCore';

/**
 * 插件接口
 * 所有插件必须实现此接口
 */
export interface IPlugin {
  /**
   * 插件名称
   */
  name: string;

  /**
   * 安装插件
   * @param core UploaderCore实例
   */
  install(core: UploaderCore): void;

  /**
   * 卸载插件
   */
  uninstall?(): void;
}
