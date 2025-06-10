/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MonitoringDashboard - React监控系统可视化组件
 *
 * 提供监控指标的可视化展示，包括：
 * 1. 实时指标展示
 * 2. 历史数据图表
 * 3. 报警事件列表
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  MonitoringMetric,
  AggregationResult,
  AlertEvent,
  AlertStatus,
} from '../../types/monitoring';
import { MonitoringSystem } from '../../core/MonitoringSystem';
import { UploaderCore } from '../../core/UploaderCore';
import { FileInfo, FileUploadStatus } from './components/UploadProgress';

// 定义组件属性
interface MonitoringDashboardProps {
  monitoringSystem: MonitoringSystem;
  refreshInterval?: number; // 数据刷新间隔（毫秒）
  showMetrics?: boolean; // 是否显示原始指标
  showAggregations?: boolean; // 是否显示聚合数据
  showAlerts?: boolean; // 是否显示报警
  maxItems?: number; // 每类数据最多显示项数
  title?: string; // 面板标题
  className?: string; // 自定义CSS类
  style?: React.CSSProperties; // 自定义样式
  uploader: UploaderCore;
  files: FileInfo[];
  showStatusCards?: boolean;
  showSpeedChart?: boolean;
  showSystemStatus?: boolean;
  showLogs?: boolean;
  showPerformance?: boolean;
  compact?: boolean;
  maxLogEntries?: number;
  darkMode?: boolean;
}

/**
 * 监控系统可视化面板组件
 */
const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({
  monitoringSystem,
  refreshInterval = 5000,
  showMetrics = true,
  showAggregations = true,
  showAlerts = true,
  maxItems = 10,
  title = '监控面板',
  className = '',
  style = {},
  uploader,
  files,
  showStatusCards = true,
  showSpeedChart = true,
  showSystemStatus = true,
  showLogs = true,
  showPerformance = true,
  compact = false,
  maxLogEntries = 100,
  darkMode = false,
}) => {
  // 状态管理
  const [metrics, setMetrics] = useState<MonitoringMetric[]>([]);
  const [aggregations, setAggregations] = useState<AggregationResult[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [activeTab, setActiveTab] = useState<
    'metrics' | 'aggregations' | 'alerts'
  >(showMetrics ? 'metrics' : showAggregations ? 'aggregations' : 'alerts');

  // 统计数据
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    activeTasks: 0,
    pendingTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalBytes: 0,
    uploadedBytes: 0,
    averageSpeed: 0,
    peakSpeed: 0,
    systemStatus: SystemStatus.HEALTHY,
    uptime: 0,
    memoryUsage: 0,
    workerCount: 0,
    avgResponseTime: 0,
    successRate: 0,
  });

  // 速度历史
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);

  // 系统日志
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // 启动时间
  const [startTime] = useState<number>(Date.now());

  // 获取最新数据
  const fetchData = useCallback(() => {
    if (showMetrics) {
      const latestMetrics = monitoringSystem.getMetrics();
      setMetrics(latestMetrics.slice(-maxItems));
    }

    if (showAggregations) {
      const latestAggregations = monitoringSystem.getAggregationResults();
      setAggregations(latestAggregations.slice(-maxItems));
    }

    if (showAlerts) {
      const latestAlerts = monitoringSystem.getAlertEvents();
      setAlerts(latestAlerts.slice(-maxItems));
    }
  }, [monitoringSystem, showMetrics, showAggregations, showAlerts, maxItems]);

  // 初始加载和定时刷新
  useEffect(() => {
    // 初始加载
    fetchData();

    // 设置定时刷新
    const intervalId = setInterval(fetchData, refreshInterval);

    // 清理函数
    return () => {
      clearInterval(intervalId);
    };
  }, [fetchData, refreshInterval]);

  // 设置事件监听器
  useEffect(() => {
    // 监听新指标收集事件
    const onMetricCollected = (metric: MonitoringMetric) => {
      if (showMetrics) {
        setMetrics(prev => [...prev.slice(-maxItems + 1), metric]);
      }
    };

    // 监听聚合结果事件
    const onAggregationCompleted = (results: AggregationResult[]) => {
      if (showAggregations && results.length > 0) {
        setAggregations(prev => [
          ...prev.slice(-maxItems + results.length),
          ...results,
        ]);
      }
    };

    // 监听报警事件
    const onAlertTriggered = (alert: AlertEvent) => {
      if (showAlerts) {
        setAlerts(prev => [...prev.slice(-maxItems + 1), alert]);
      }
    };

    // 注册监听器
    monitoringSystem.on('metric_collected', onMetricCollected as any);
    monitoringSystem.on('aggregation_completed', onAggregationCompleted as any);
    monitoringSystem.on('alert_triggered', onAlertTriggered as any);
    monitoringSystem.on('alert_resolved', onAlertTriggered as any);

    // 清理函数，移除监听器
    return () => {
      monitoringSystem.off('metric_collected', onMetricCollected as any);
      monitoringSystem.off(
        'aggregation_completed',
        onAggregationCompleted as any
      );
      monitoringSystem.off('alert_triggered', onAlertTriggered as any);
      monitoringSystem.off('alert_resolved', onAlertTriggered as any);
    };
  }, [monitoringSystem, showMetrics, showAggregations, showAlerts, maxItems]);

  // 监听上传器事件并收集日志
  useEffect(() => {
    if (!uploader) return;

    // 收集日志
    const handleLog = (
      message: string,
      level: LogEntry['level'] = 'info',
      data?: any
    ) => {
      const newLog: LogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: Date.now(),
        level,
        message,
        data,
      };

      setLogs(prevLogs => {
        const updatedLogs = [newLog, ...prevLogs].slice(0, maxLogEntries);
        return updatedLogs;
      });
    };

    // 监听上传进度
    const handleProgress = (data: {
      progress: number;
      uploaded: number;
      total: number;
    }) => {
      handleLog(`上传进度: ${data.progress.toFixed(2)}%`, 'info', data);
    };

    // 监听上传完成
    const handleComplete = (result: any) => {
      handleLog('上传完成', 'info', result);
    };

    // 监听上传错误
    const handleError = (error: Error) => {
      handleLog(`上传错误: ${error.message}`, 'error', error);
    };

    // 注册事件监听
    uploader.on('progress', handleProgress);
    uploader.on('complete', handleComplete);
    uploader.on('error', handleError);

    // 清理事件监听
    return () => {
      uploader.off('progress', handleProgress);
      uploader.off('complete', handleComplete);
      uploader.off('error', handleError);
    };
  }, [uploader, maxLogEntries]);

  // 定期更新统计数据和速度历史
  useEffect(() => {
    if (!files.length) return;

    let lastUploadedBytes = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    let speedCount = 0;

    const updateStats = () => {
      // 任务状态统计
      const pendingTasks = files.filter(
        f => f.status === FileUploadStatus.PENDING
      ).length;
      const activeTasks = files.filter(
        f => f.status === FileUploadStatus.UPLOADING
      ).length;
      const completedTasks = files.filter(
        f => f.status === FileUploadStatus.SUCCESS
      ).length;
      const failedTasks = files.filter(
        f =>
          f.status === FileUploadStatus.ERROR ||
          f.status === FileUploadStatus.CANCELLED
      ).length;

      // 计算总字节数和已上传字节数
      const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
      const uploadedBytes = files.reduce(
        (sum, f) => sum + (f.file.size * f.progress) / 100,
        0
      );

      // 计算上传速度 (字节/秒)
      const bytesDiff = uploadedBytes - lastUploadedBytes;
      const currentSpeed = bytesDiff / (refreshInterval / 1000);
      lastUploadedBytes = uploadedBytes;

      if (currentSpeed > 0) {
        speedSum += currentSpeed;
        speedCount++;
        maxSpeed = Math.max(maxSpeed, currentSpeed);
      }

      const averageSpeed = speedCount > 0 ? speedSum / speedCount : 0;

      // 更新速度历史
      setSpeedHistory(prev => {
        const newHistory = [...prev, currentSpeed];
        // 保留最近20个数据点
        if (newHistory.length > 20) {
          return newHistory.slice(newHistory.length - 20);
        }
        return newHistory;
      });

      // 估算内存使用量和响应时间
      const memoryUsage = Math.random() * 100 * 1024 * 1024; // 模拟数据
      const avgResponseTime = Math.random() * 200; // 模拟数据

      // 确定系统状态
      let systemStatus = SystemStatus.HEALTHY;
      const successRate =
        files.length > 0
          ? (completedTasks / (completedTasks + failedTasks || 1)) * 100
          : 100;

      if (successRate < 50) {
        systemStatus = SystemStatus.ERROR;
      } else if (successRate < 80) {
        systemStatus = SystemStatus.WARNING;
      }

      // 更新统计数据
      setStats({
        totalTasks: files.length,
        activeTasks,
        pendingTasks,
        completedTasks,
        failedTasks,
        totalBytes,
        uploadedBytes,
        averageSpeed,
        peakSpeed: maxSpeed,
        systemStatus,
        uptime: Date.now() - startTime,
        memoryUsage,
        workerCount: 2, // 模拟数据
        avgResponseTime,
        successRate,
      });
    };

    // 定期更新
    const intervalId = setInterval(updateStats, refreshInterval);

    // 首次执行
    updateStats();

    return () => {
      clearInterval(intervalId);
    };
  }, [files, refreshInterval, startTime]);

  // 渲染指标表格
  const renderMetricsTable = () => {
    if (!showMetrics || metrics.length === 0) {
      return <div className="monitoring-empty">暂无指标数据</div>;
    }

    return (
      <table className="monitoring-table">
        <thead>
          <tr>
            <th>指标类型</th>
            <th>值</th>
            <th>时间</th>
            <th>标签</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric, index) => (
            <tr key={`metric-${index}`}>
              <td>{metric.type}</td>
              <td>{metric.value.toFixed(2)}</td>
              <td>{new Date(metric.timestamp).toLocaleString()}</td>
              <td>{renderTags(metric.tags)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // 渲染聚合结果表格
  const renderAggregationsTable = () => {
    if (!showAggregations || aggregations.length === 0) {
      return <div className="monitoring-empty">暂无聚合数据</div>;
    }

    return (
      <table className="monitoring-table">
        <thead>
          <tr>
            <th>指标类型</th>
            <th>聚合类型</th>
            <th>值</th>
            <th>时间范围</th>
            <th>维度</th>
          </tr>
        </thead>
        <tbody>
          {aggregations.map((agg, index) => (
            <tr key={`agg-${index}`}>
              <td>{agg.metricType}</td>
              <td>{agg.aggregationType}</td>
              <td>{agg.value.toFixed(2)}</td>
              <td>
                {new Date(agg.startTime).toLocaleTimeString()} -
                {new Date(agg.endTime).toLocaleTimeString()}
              </td>
              <td>{renderTags(agg.dimensions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // 渲染报警表格
  const renderAlertsTable = () => {
    if (!showAlerts || alerts.length === 0) {
      return <div className="monitoring-empty">暂无报警事件</div>;
    }

    return (
      <table className="monitoring-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>状态</th>
            <th>严重性</th>
            <th>消息</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, index) => (
            <tr
              key={`alert-${index}`}
              className={`alert-severity-${alert.severity} alert-status-${alert.status}`}
            >
              <td>{alert.ruleName}</td>
              <td>{getAlertStatusText(alert.status)}</td>
              <td>{alert.severity}</td>
              <td>{alert.message}</td>
              <td>{new Date(alert.timestamp).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // 渲染标签
  const renderTags = (tags?: Record<string, string>) => {
    if (!tags) return null;

    return (
      <div className="monitoring-tags">
        {Object.entries(tags).map(([key, value], idx) => (
          <span key={idx} className="monitoring-tag">
            {key}: {value}
          </span>
        ))}
      </div>
    );
  };

  // 获取报警状态文本
  const getAlertStatusText = (status: AlertStatus) => {
    switch (status) {
      case AlertStatus.ACTIVE:
        return '活动';
      case AlertStatus.RESOLVED:
        return '已解决';
      case AlertStatus.PENDING:
        return '待处理';
      case AlertStatus.ACKNOWLEDGED:
        return '已确认';
      default:
        return status;
    }
  };

  // 组件样式
  const dashboardStyle: React.CSSProperties = {
    fontFamily: 'Arial, sans-serif',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    ...style,
  };

  // Tab样式
  const getTabStyle = (tab: 'metrics' | 'aggregations' | 'alerts') => ({
    padding: '8px 16px',
    marginRight: '8px',
    cursor: 'pointer',
    backgroundColor: activeTab === tab ? '#ffffff' : '#e9ecef',
    border: '1px solid #dee2e6',
    borderRadius: '4px 4px 0 0',
    borderBottom: activeTab === tab ? '1px solid #ffffff' : '1px solid #dee2e6',
  });

  // 表格容器样式
  const tableContainerStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid #dee2e6',
    borderRadius: '0 4px 4px 4px',
    padding: '16px',
    overflowX: 'auto',
  };

  // 系统状态类型
  enum SystemStatus {
    HEALTHY = 'healthy',
    WARNING = 'warning',
    ERROR = 'error',
    OFFLINE = 'offline',
  }

  // 面板数据统计
  interface DashboardStats {
    // 上传任务统计
    totalTasks: number;
    activeTasks: number;
    pendingTasks: number;
    completedTasks: number;
    failedTasks: number;

    // 上传数据统计
    totalBytes: number;
    uploadedBytes: number;
    averageSpeed: number; // 字节/秒
    peakSpeed: number; // 字节/秒

    // 系统状态
    systemStatus: SystemStatus;
    uptime: number; // 毫秒
    memoryUsage: number; // 字节
    workerCount: number;

    // 性能指标
    avgResponseTime: number; // 毫秒
    successRate: number; // 百分比 (0-100)
  }

  // 日志条目
  interface LogEntry {
    id: string;
    timestamp: number;
    level: 'info' | 'warning' | 'error' | 'debug';
    message: string;
    data?: any;
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化时间
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天 ${hours % 24}小时`;
    if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
    return `${seconds}秒`;
  };

  // 获取系统状态颜色
  const getStatusColor = (status: SystemStatus): string => {
    switch (status) {
      case SystemStatus.HEALTHY:
        return '#52c41a';
      case SystemStatus.WARNING:
        return '#faad14';
      case SystemStatus.ERROR:
        return '#ff4d4f';
      case SystemStatus.OFFLINE:
        return '#d9d9d9';
    }
  };

  // 获取日志级别颜色
  const getLogLevelColor = (level: LogEntry['level']): string => {
    switch (level) {
      case 'info':
        return '#1890ff';
      case 'warning':
        return '#faad14';
      case 'error':
        return '#ff4d4f';
      case 'debug':
        return '#8c8c8c';
    }
  };

  // 渲染状态卡片
  const renderStatusCards = () => {
    if (!showStatusCards) return null;

    const cards = [
      {
        title: '总任务数',
        value: stats.totalTasks,
        color: '#1890ff',
      },
      {
        title: '活跃任务',
        value: stats.activeTasks,
        color: '#faad14',
      },
      {
        title: '待处理任务',
        value: stats.pendingTasks,
        color: '#8c8c8c',
      },
      {
        title: '已完成任务',
        value: stats.completedTasks,
        color: '#52c41a',
      },
      {
        title: '失败任务',
        value: stats.failedTasks,
        color: '#ff4d4f',
      },
    ];

    return (
      <div className="monitor-status-cards">
        {cards.map((card, index) => (
          <div
            key={index}
            className="monitor-card"
            style={{ borderTopColor: card.color }}
          >
            <div className="monitor-card-title">{card.title}</div>
            <div className="monitor-card-value">{card.value}</div>
          </div>
        ))}
      </div>
    );
  };

  // 渲染速度图表
  const renderSpeedChart = () => {
    if (!showSpeedChart) return null;

    const maxValue = Math.max(...speedHistory, 1);

    return (
      <div className="monitor-speed-chart">
        <div className="monitor-chart-header">
          <h3>上传速度历史</h3>
          <div className="monitor-chart-legend">
            <span>
              当前: {formatFileSize(speedHistory[speedHistory.length - 1] || 0)}
              /s
            </span>
            <span>平均: {formatFileSize(stats.averageSpeed)}/s</span>
            <span>峰值: {formatFileSize(stats.peakSpeed)}/s</span>
          </div>
        </div>
        <div className="monitor-chart-container">
          {speedHistory.map((speed, index) => (
            <div
              key={index}
              className="monitor-chart-bar"
              style={{
                height: `${(speed / maxValue) * 100}%`,
                backgroundColor:
                  speed > stats.averageSpeed ? '#52c41a' : '#1890ff',
              }}
              title={`${formatFileSize(speed)}/s`}
            />
          ))}
        </div>
      </div>
    );
  };

  // 渲染系统状态
  const renderSystemStatus = () => {
    if (!showSystemStatus) return null;

    return (
      <div className="monitor-system-status">
        <h3>系统状态</h3>
        <div className="monitor-system-status-content">
          <div className="monitor-status-item">
            <span className="monitor-status-label">状态:</span>
            <span
              className="monitor-status-value"
              style={{ color: getStatusColor(stats.systemStatus) }}
            >
              {stats.systemStatus === SystemStatus.HEALTHY && '健康'}
              {stats.systemStatus === SystemStatus.WARNING && '警告'}
              {stats.systemStatus === SystemStatus.ERROR && '错误'}
              {stats.systemStatus === SystemStatus.OFFLINE && '离线'}
            </span>
          </div>
          <div className="monitor-status-item">
            <span className="monitor-status-label">运行时间:</span>
            <span className="monitor-status-value">
              {formatTime(stats.uptime)}
            </span>
          </div>
          <div className="monitor-status-item">
            <span className="monitor-status-label">内存使用:</span>
            <span className="monitor-status-value">
              {formatFileSize(stats.memoryUsage)}
            </span>
          </div>
          <div className="monitor-status-item">
            <span className="monitor-status-label">Worker数量:</span>
            <span className="monitor-status-value">{stats.workerCount}</span>
          </div>
          <div className="monitor-status-item">
            <span className="monitor-status-label">成功率:</span>
            <span
              className="monitor-status-value"
              style={{
                color:
                  stats.successRate > 90
                    ? '#52c41a'
                    : stats.successRate > 70
                      ? '#faad14'
                      : '#ff4d4f',
              }}
            >
              {stats.successRate.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  // 渲染性能指标
  const renderPerformance = () => {
    if (!showPerformance) return null;

    return (
      <div className="monitor-performance">
        <h3>性能指标</h3>
        <div className="monitor-performance-metrics">
          <div className="monitor-metric">
            <div className="monitor-metric-title">已上传</div>
            <div className="monitor-metric-value">
              {formatFileSize(stats.uploadedBytes)}
            </div>
            <div className="monitor-metric-subtitle">
              共 {formatFileSize(stats.totalBytes)}
            </div>
            <div className="monitor-metric-progress">
              <div
                className="monitor-metric-progress-bar"
                style={{
                  width: `${
                    stats.totalBytes > 0
                      ? (stats.uploadedBytes / stats.totalBytes) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
          <div className="monitor-metric">
            <div className="monitor-metric-title">平均响应时间</div>
            <div className="monitor-metric-value">
              {stats.avgResponseTime.toFixed(2)} ms
            </div>
            <div
              className="monitor-metric-subtitle"
              style={{
                color:
                  stats.avgResponseTime < 100
                    ? '#52c41a'
                    : stats.avgResponseTime < 300
                      ? '#faad14'
                      : '#ff4d4f',
              }}
            >
              {stats.avgResponseTime < 100
                ? '良好'
                : stats.avgResponseTime < 300
                  ? '一般'
                  : '较慢'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 渲染日志
  const renderLogs = () => {
    if (!showLogs) return null;

    return (
      <div className="monitor-logs">
        <div className="monitor-logs-header">
          <h3>系统日志</h3>
          <button className="monitor-logs-clear" onClick={() => setLogs([])}>
            清空
          </button>
        </div>
        <div className="monitor-logs-container">
          {logs.length === 0 ? (
            <div className="monitor-logs-empty">暂无日志</div>
          ) : (
            logs.map(log => (
              <div
                key={log.id}
                className={`monitor-log-entry log-${log.level}`}
              >
                <span className="monitor-log-time">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className="monitor-log-level"
                  style={{ color: getLogLevelColor(log.level) }}
                >
                  [{log.level.toUpperCase()}]
                </span>
                <span className="monitor-log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`monitor-dashboard ${darkMode ? 'dark-mode' : ''} ${
        compact ? 'compact' : ''
      } ${className}`}
      style={style}
    >
      <div className="monitor-header">
        <h2>文件上传监控面板</h2>
        <div className="monitor-header-stats">
          <span>
            {formatFileSize(stats.uploadedBytes)}/
            {formatFileSize(stats.totalBytes)}
          </span>
          <span>
            {stats.completedTasks}/{stats.totalTasks} 完成
          </span>
        </div>
      </div>

      <div className="monitor-grid">
        {renderStatusCards()}
        {renderSpeedChart()}
        {renderSystemStatus()}
        {renderPerformance()}
      </div>

      {renderLogs()}
    </div>
  );
};

export default MonitoringDashboard;
