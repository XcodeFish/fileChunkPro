/* eslint-disable */
/**
 * fileChunkPro微信小程序环境使用示例
 */

// 导入小程序环境包
import {
  FileChunkPro,
  PerformanceCollector,
} from '../../dist/miniprogram/wechat/index.js';

// 初始化性能监控
const performanceCollector = PerformanceCollector.getInstance({
  enabled: true,
  samplingRate: 1.0, // 100%采样
  reportInterval: 30000, // 30秒自动上报
  onReport: metrics => {
    // 上报性能数据
    console.log('Performance metrics:', metrics);

    // 发送到服务器
    wx.request({
      url: 'https://api.example.com/metrics',
      method: 'POST',
      data: { metrics },
      fail: err => {
        console.error('指标上报失败:', err);
        // 失败时保存到本地
        wx.setStorage({
          key: 'pendingMetrics',
          data: JSON.stringify(metrics),
        });
      },
    });
  },
});

// 小程序App实例
App({
  // 全局数据
  globalData: {
    uploader: null,
  },

  // 小程序启动时
  onLaunch() {
    // 初始化上传器
    this.globalData.uploader = new FileChunkPro({
      // 基本配置
      target: 'https://api.example.com/upload',
      chunkSize: 1 * 1024 * 1024, // 小程序环境使用较小分片
      concurrency: 2, // 降低并发

      // 高级配置
      retryCount: 3,
      retryDelay: 1000,
      timeout: 30000,
      headers: { Authorization: 'Bearer token' },

      // 开启性能监控
      performanceMonitoring: true,
      performanceCollector: performanceCollector,

      // 回调函数设置为通用方法，具体UI更新在页面中处理
      onProgress: (progress, file) => {
        // 触发全局事件，让页面订阅
        this.triggerEvent('uploadProgress', { progress, file });
      },
      onSuccess: (response, file) => {
        console.log('上传成功:', response, file);
        this.triggerEvent('uploadSuccess', { response, file });
      },
      onError: (error, file) => {
        console.error('上传失败:', error, file);
        this.triggerEvent('uploadError', { error, file });
      },
      onComplete: (successful, failed) => {
        console.log('上传完成', { successful, failed });
        this.triggerEvent('uploadComplete', { successful, failed });
      },
    });

    // 尝试从本地存储恢复未上报的性能指标
    this.recoverPendingMetrics();
  },

  // 自定义事件系统
  _eventListeners: {},

  // 触发事件
  triggerEvent(eventName, data) {
    const listeners = this._eventListeners[eventName] || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`事件处理器错误(${eventName}):`, error);
      }
    });
  },

  // 监听事件
  on(eventName, callback) {
    if (!this._eventListeners[eventName]) {
      this._eventListeners[eventName] = [];
    }
    this._eventListeners[eventName].push(callback);
  },

  // 移除事件监听
  off(eventName, callback) {
    if (!this._eventListeners[eventName]) return;

    if (callback) {
      this._eventListeners[eventName] = this._eventListeners[eventName].filter(
        cb => cb !== callback
      );
    } else {
      this._eventListeners[eventName] = [];
    }
  },

  // 恢复未上报的性能指标
  recoverPendingMetrics() {
    wx.getStorage({
      key: 'pendingMetrics',
      success: res => {
        try {
          const metrics = JSON.parse(res.data);
          if (Array.isArray(metrics) && metrics.length > 0) {
            console.log(`恢复 ${metrics.length} 条未上报的性能指标`);
            performanceCollector.onReport(metrics);

            // 上报后清除本地存储
            wx.removeStorage({ key: 'pendingMetrics' });
          }
        } catch (error) {
          console.error('恢复性能指标失败:', error);
          // 清除可能损坏的数据
          wx.removeStorage({ key: 'pendingMetrics' });
        }
      },
    });
  },
});
