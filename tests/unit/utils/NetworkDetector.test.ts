import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkDetector } from '../../../src/utils/NetworkDetector';

// 模拟NetworkDetector依赖
vi.mock('../../../src/utils/NetworkDetector', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/utils/NetworkDetector')
  >('../../../src/utils/NetworkDetector');
  return {
    ...actual,
    // 不需要覆盖方法，使用实际实现
  };
});

// 模拟依赖
vi.mock('../../../src/evaluators/NetworkQualityEvaluator', () => ({
  NetworkQualityEvaluator: vi.fn().mockImplementation(() => ({
    evaluateNetworkQuality: vi.fn().mockReturnValue(0.8),
    analyzeQualityTrend: vi.fn(),
  })),
}));

vi.mock('../../../src/monitors/NetworkSpeedMonitor', () => ({
  NetworkSpeedMonitor: vi.fn().mockImplementation(() => ({
    measureDownloadSpeed: vi.fn().mockResolvedValue(10.5),
    measureUploadSpeed: vi.fn().mockResolvedValue(5.2),
  })),
}));

vi.mock('../../../src/analyzers/NetworkStabilityAnalyzer', () => ({
  NetworkStabilityAnalyzer: vi.fn().mockImplementation(() => ({
    recordConnectionEvent: vi.fn(),
    getStabilityScore: vi.fn().mockReturnValue(0.9),
    getDisconnectionFrequency: vi.fn().mockReturnValue(0.1),
  })),
}));

vi.mock('../../../src/predictors/NetworkTrendPredictor', () => ({
  NetworkTrendPredictor: vi.fn().mockImplementation(() => ({
    predictQualityChange: vi.fn().mockReturnValue('stable'),
    getFuturePrediction: vi.fn(),
  })),
}));

vi.mock('../../../src/core/EventBus', () => ({
  EventBus: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/Logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('NetworkDetector', () => {
  let networkDetector: NetworkDetector;
  let mockAddEventListener: any;
  let mockRemoveEventListener: any;
  let navigatorOnLineSpy: any;

  beforeEach(() => {
    // 模拟navigator.onLine属性
    navigatorOnLineSpy = vi.spyOn(navigator, 'onLine', 'get');
    navigatorOnLineSpy.mockReturnValue(true);

    // 模拟window的事件监听器
    mockAddEventListener = vi.fn();
    mockRemoveEventListener = vi.fn();
    vi.spyOn(window, 'addEventListener').mockImplementation(
      mockAddEventListener
    );
    vi.spyOn(window, 'removeEventListener').mockImplementation(
      mockRemoveEventListener
    );

    // 创建网络检测器实例
    networkDetector = new NetworkDetector();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should initialize with correct status', () => {
    expect(networkDetector).toBeDefined();
    expect(networkDetector.getStatus()).toBe('online');
  });

  it('should add event listeners on start', () => {
    networkDetector.start();

    expect(mockAddEventListener).toHaveBeenCalledTimes(2);
    expect(mockAddEventListener).toHaveBeenCalledWith(
      'online',
      expect.any(Function)
    );
    expect(mockAddEventListener).toHaveBeenCalledWith(
      'offline',
      expect.any(Function)
    );
  });

  it('should remove event listeners on stop', () => {
    networkDetector.start();
    networkDetector.stop();

    expect(mockRemoveEventListener).toHaveBeenCalledTimes(2);
    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'online',
      expect.any(Function)
    );
    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'offline',
      expect.any(Function)
    );
  });

  it('should return offline status when offline', () => {
    navigatorOnLineSpy.mockReturnValue(false);
    expect(networkDetector.getStatus()).toBe('offline');
  });

  it('should notify listeners on status change', () => {
    const mockCallback = vi.fn();
    networkDetector.addStatusChangeListener(mockCallback);

    // 触发网络状态变化
    networkDetector.start();
    const onlineHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'online'
    )[1];
    const offlineHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'offline'
    )[1];

    // 模拟离线事件
    navigatorOnLineSpy.mockReturnValue(false);
    offlineHandler();

    expect(mockCallback).toHaveBeenCalledWith('offline');

    // 模拟在线事件
    navigatorOnLineSpy.mockReturnValue(true);
    onlineHandler();

    expect(mockCallback).toHaveBeenCalledWith('online');
  });

  it('should remove status change listener', () => {
    const mockCallback = vi.fn();
    networkDetector.addStatusChangeListener(mockCallback);
    networkDetector.removeStatusChangeListener(mockCallback);

    // 触发网络状态变化
    networkDetector.start();
    const offlineHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'offline'
    )[1];

    // 模拟离线事件
    navigatorOnLineSpy.mockReturnValue(false);
    offlineHandler();

    // 由于已移除监听器，回调不应该被调用
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('should provide current connection quality information', () => {
    const quality = networkDetector.getConnectionQuality();

    expect(quality).toHaveProperty('type');
    expect(quality).toHaveProperty('speed');
    expect(quality).toHaveProperty('latency');
    expect(quality).toHaveProperty('reliability');
  });

  it('should detect network quality changes', () => {
    const initialQuality = networkDetector.getConnectionQuality();

    // 模拟网络质量变化
    networkDetector.setConnectionQualityOverride({
      type: '4g',
      speed: 'high',
      latency: 'low',
      reliability: 'high',
    });

    const updatedQuality = networkDetector.getConnectionQuality();

    expect(updatedQuality).not.toEqual(initialQuality);
    expect(updatedQuality.type).toBe('4g');
    expect(updatedQuality.speed).toBe('high');
  });

  it('should test connection with a ping', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true }),
    });

    vi.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const result = await networkDetector.testConnection();

    expect(result).toEqual({
      success: true,
      latency: expect.any(Number),
      status: 200,
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it('should handle failed connection test', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));

    vi.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const result = await networkDetector.testConnection();

    expect(result).toEqual({
      success: false,
      error: expect.any(Error),
      latency: null,
      status: null,
    });
  });
});
