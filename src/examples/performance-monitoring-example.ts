/* eslint-disable */
/**
 * 性能监控点集成示例
 * 演示不同环境下的性能监控点使用方法
 */

import {
  PerformanceCollector,
  PerformanceMetricType,
} from '../utils/PerformanceCollector';

/**
 * 初始化性能监控
 */
export function initPerformanceMonitoring(options = {}) {
  // 初始化性能收集器
  const collector = PerformanceCollector.getInstance({
    enabled: true,
    samplingRate: 1.0,
    maxMetrics: 1000,
    reportInterval: 30000, // 30秒自动上报一次
    onReport: metrics => {
      // 这里实现上报逻辑，可根据不同环境使用不同的上报方式
      /* #if ENV === 'browser' */
      // 浏览器环境使用Beacon API上报
      reportMetricsThroughBeacon(metrics);
      /* #else */
      // 其他环境使用普通HTTP请求上报
      reportMetricsThroughHttp(metrics);
      /* #endif */
    },
    ...options,
  });

  // 设置全局错误处理以捕获性能问题
  /* #if ENV === 'browser' */
  if (typeof window !== 'undefined') {
    window.addEventListener('error', event => {
      collector.errorOccur('js_error', event.message);
    });
  }
  /* #endif */

  return collector;
}

/**
 * 浏览器环境下通过Beacon API上报
 */
/* #if ENV === 'browser' */
function reportMetricsThroughBeacon(metrics: any[]) {
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({ metrics })], {
      type: 'application/json',
    });
    navigator.sendBeacon('/api/metrics', blob);
  } else {
    reportMetricsThroughHttp(metrics);
  }
}
/* #endif */

/**
 * 通过HTTP请求上报
 */
function reportMetricsThroughHttp(metrics: any[]) {
  /* #if ENV === 'browser' */
  // 浏览器环境使用fetch API
  if (typeof fetch !== 'undefined') {
    fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics }),
      // 使用keepalive确保页面关闭时仍能发送
      keepalive: true,
    }).catch(() => {
      // 失败时保存到本地存储
      saveMetricsToLocalStorage(metrics);
    });
  }
  /* #elif ENV === 'wechat' */
  // 微信小程序环境
  wx.request({
    url: 'https://api.example.com/metrics',
    method: 'POST',
    data: { metrics },
    fail: () => {
      // 失败时保存到本地存储
      wx.setStorage({
        key: 'pendingMetrics',
        data: JSON.stringify(metrics),
      });
    },
  });
  /* #elif ENV === 'alipay' */
  // 支付宝小程序环境
  my.request({
    url: 'https://api.example.com/metrics',
    method: 'POST',
    data: { metrics },
    fail: () => {
      // 失败时保存到本地存储
      my.setStorage({
        key: 'pendingMetrics',
        data: JSON.stringify(metrics),
      });
    },
  });
  /* #elif ENV === 'bytedance' */
  // 字节跳动小程序环境
  tt.request({
    url: 'https://api.example.com/metrics',
    method: 'POST',
    data: { metrics },
    fail: () => {
      // 失败时保存到本地存储
      tt.setStorage({
        key: 'pendingMetrics',
        data: JSON.stringify(metrics),
      });
    },
  });
  /* #elif ENV === 'taro' */
  // Taro环境
  import Taro from '@tarojs/taro';
  Taro.request({
    url: 'https://api.example.com/metrics',
    method: 'POST',
    data: { metrics },
    fail: () => {
      Taro.setStorage({
        key: 'pendingMetrics',
        data: JSON.stringify(metrics),
      });
    },
  });
  /* #elif ENV === 'uni-app' */
  // uni-app环境
  uni.request({
    url: 'https://api.example.com/metrics',
    method: 'POST',
    data: { metrics },
    fail: () => {
      uni.setStorage({
        key: 'pendingMetrics',
        data: JSON.stringify(metrics),
      });
    },
  });
  /* #else */
  // 其他环境，例如Node.js
  console.log(
    'Metrics reporting not implemented for this environment',
    metrics
  );
  /* #endif */
}

/**
 * 保存指标到本地存储（浏览器环境）
 */
/* #if ENV === 'browser' */
function saveMetricsToLocalStorage(metrics: any[]) {
  try {
    // 获取已有的待发送指标
    const pendingMetricsStr = localStorage.getItem('pendingMetrics');
    let pendingMetrics = pendingMetricsStr ? JSON.parse(pendingMetricsStr) : [];

    // 合并新指标
    pendingMetrics = [...pendingMetrics, ...metrics];

    // 如果数量过多，保留最新的1000条
    if (pendingMetrics.length > 1000) {
      pendingMetrics = pendingMetrics.slice(-1000);
    }

    // 保存回本地存储
    localStorage.setItem('pendingMetrics', JSON.stringify(pendingMetrics));
  } catch (e) {
    console.error('Failed to save metrics to local storage', e);
  }
}
/* #endif */

/**
 * 示例：如何使用性能监控
 */
export function performanceMonitoringExample() {
  const collector = initPerformanceMonitoring();

  // 模拟上传文件
  const fileId = 'file_' + Date.now();
  const fileSize = 1024 * 1024 * 10; // 10MB

  // 记录上传开始
  collector.uploadStart(fileId, fileSize);

  // 模拟分片上传
  const startTime = Date.now();
  const chunkSize = 1024 * 1024; // 1MB
  const chunkCount = Math.ceil(fileSize / chunkSize);

  for (let i = 0; i < chunkCount; i++) {
    // 记录分片准备
    collector.chunkPrepare(fileId, i, chunkSize);

    // 记录分片开始
    collector.chunkStart(fileId, i);

    // 模拟上传时间
    const chunkUploadTime = Math.random() * 500 + 100; // 100-600ms

    // 记录分片结束
    collector.chunkEnd(fileId, i, chunkUploadTime);
  }

  // 记录上传结束
  const totalTime = Date.now() - startTime;
  collector.uploadEnd(fileId, totalTime);

  // 手动触发上报
  collector.report();
}

export default {
  initPerformanceMonitoring,
  performanceMonitoringExample,
};
