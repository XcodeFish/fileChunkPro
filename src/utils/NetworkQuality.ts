/**
 * 网络质量枚举
 * 用于表示当前网络连接质量
 */
export enum NetworkQuality {
  /** 未知网络质量 */
  UNKNOWN = 'unknown',

  /** 网络断开 */
  OFFLINE = 'offline',

  /** 非常差的网络质量 */
  POOR = 'poor',

  /** 较差的网络质量 */
  LOW = 'low',

  /** 中等网络质量 */
  MEDIUM = 'medium',

  /** 良好网络质量 */
  GOOD = 'good',

  /** 优秀网络质量 */
  EXCELLENT = 'excellent',
}
