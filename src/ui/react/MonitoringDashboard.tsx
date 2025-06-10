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
}) => {
  // 状态管理
  const [metrics, setMetrics] = useState<MonitoringMetric[]>([]);
  const [aggregations, setAggregations] = useState<AggregationResult[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [activeTab, setActiveTab] = useState<
    'metrics' | 'aggregations' | 'alerts'
  >(showMetrics ? 'metrics' : showAggregations ? 'aggregations' : 'alerts');

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

  return (
    <div className={`monitoring-dashboard ${className}`} style={dashboardStyle}>
      <h2 style={{ marginTop: 0, marginBottom: '16px' }}>{title}</h2>

      {/* Tab导航 */}
      <div style={{ display: 'flex', marginBottom: '-1px' }}>
        {showMetrics && (
          <div
            style={getTabStyle('metrics')}
            onClick={() => setActiveTab('metrics')}
          >
            指标
          </div>
        )}

        {showAggregations && (
          <div
            style={getTabStyle('aggregations')}
            onClick={() => setActiveTab('aggregations')}
          >
            聚合数据
          </div>
        )}

        {showAlerts && (
          <div
            style={getTabStyle('alerts')}
            onClick={() => setActiveTab('alerts')}
          >
            报警事件
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div style={tableContainerStyle}>
        {activeTab === 'metrics' && renderMetricsTable()}
        {activeTab === 'aggregations' && renderAggregationsTable()}
        {activeTab === 'alerts' && renderAlertsTable()}
      </div>
    </div>
  );
};

export default MonitoringDashboard;
