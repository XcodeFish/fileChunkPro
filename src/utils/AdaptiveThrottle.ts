/**
 * AdaptiveThrottle - 自适应节流控制
 * 根据设备性能和执行耗时动态调整节流频率
 */

/**
 * 自适应节流选项
 */
export interface AdaptiveThrottleOptions {
  /** 最小延迟时间(ms) */
  minDelay?: number;

  /** 最大延迟时间(ms) */
  maxDelay?: number;

  /** 目标帧时间(ms)，通常为16ms（60fps） */
  targetFrameTime?: number;

  /** 性能评估窗口大小 */
  windowSize?: number;

  /** 自适应灵敏度(0-1)，值越高调整越激进 */
  adaptiveSensitivity?: number;

  /** 设备性能系数，根据设备能力调整基础延迟 */
  deviceFactor?: number;

  /** 是否启用自适应功能 */
  adaptiveEnabled?: boolean;

  /** 记录性能数据 */
  logPerformance?: boolean;

  /** 上次执行时的回调函数 */
  onThrottled?: (currentDelay: number, executionTime: number) => void;
}

/**
 * 创建自适应节流函数
 * @param callback 要执行的函数
 * @param options 节流选项
 * @returns 节流包装过的函数
 */
export function createAdaptiveThrottle<T extends (...args: any[]) => any>(
  callback: T,
  options: AdaptiveThrottleOptions = {}
): (...funcArgs: Parameters<T>) => void {
  const {
    minDelay = 100,
    maxDelay = 1000,
    targetFrameTime = 16,
    windowSize = 10,
    adaptiveSensitivity = 0.5,
    deviceFactor = 1,
    adaptiveEnabled = true,
    logPerformance = false,
  } = options;

  // 计算目标设备因子
  const computeDeviceFactor = (): number => {
    // 尝试检测设备性能
    const isLowEndDevice =
      (typeof navigator !== 'undefined' &&
        navigator.hardwareConcurrency !== undefined &&
        navigator.hardwareConcurrency <= 2) ||
      (typeof navigator !== 'undefined' &&
        // @ts-ignore - deviceMemory 属性可能不存在于所有浏览器
        navigator.deviceMemory !== undefined &&
        // @ts-ignore
        navigator.deviceMemory <= 2);

    return isLowEndDevice ? 1.5 : 1;
  };

  // 调整设备因子
  const actualDeviceFactor =
    deviceFactor === 1 ? computeDeviceFactor() : deviceFactor;

  let lastExecTime = 0;
  // 使用设备因子初始化当前延迟
  let currentDelay = Math.min(
    maxDelay,
    Math.max(minDelay, 200 * actualDeviceFactor)
  );
  const executionTimes: number[] = [];
  let scheduled = false;

  // 调整节流延迟
  const adjustDelay = (executionTime: number): void => {
    if (!adaptiveEnabled) return;

    // 保持执行时间历史记录
    executionTimes.push(executionTime);
    if (executionTimes.length > windowSize) {
      executionTimes.shift();
    }

    // 计算平均执行时间
    const avgExecutionTime =
      executionTimes.reduce((sum, time) => sum + time, 0) /
      executionTimes.length;

    // 根据平均执行时间调整延迟
    let newDelay = currentDelay;

    if (avgExecutionTime > targetFrameTime * 1.5) {
      // 执行时间超出目标，增加延迟
      newDelay = Math.min(
        currentDelay * (1 + 0.5 * adaptiveSensitivity),
        maxDelay
      );
    } else if (avgExecutionTime < targetFrameTime * 0.5) {
      // 执行时间远低于目标，适当减少延迟
      newDelay = Math.max(
        currentDelay * (1 - 0.3 * adaptiveSensitivity),
        minDelay
      );
    }

    // 应用新延迟
    currentDelay = Math.round(newDelay);

    if (logPerformance) {
      console.log(
        `[AdaptiveThrottle] 执行时间: ${executionTime.toFixed(2)}ms, 平均: ${avgExecutionTime.toFixed(2)}ms, 延迟调整为: ${currentDelay}ms`
      );
    }

    // 触发回调
    if (options.onThrottled) {
      options.onThrottled(currentDelay, executionTime);
    }
  };

  // 返回节流函数
  return function throttled(...args: Parameters<T>): void {
    const now = Date.now();

    if (scheduled) {
      return; // 已经调度了下一次执行
    }

    if (now - lastExecTime >= currentDelay) {
      const startTime = performance.now();

      try {
        // 执行回调
        callback.apply(this, args);
      } finally {
        // 计算执行时间并调整延迟
        const executionTime = performance.now() - startTime;
        adjustDelay(executionTime);

        // 更新最后执行时间
        lastExecTime = Date.now();
      }
    } else {
      // 调度下一次执行
      scheduled = true;

      const timeToWait = currentDelay - (now - lastExecTime);

      setTimeout(() => {
        scheduled = false;
        throttled.apply(this, args);
      }, timeToWait);
    }
  };
}

/**
 * 检测当前环境的设备性能因子
 * @returns 性能因子(低性能设备 > 1, 高性能设备 < 1)
 */
export function detectDevicePerformanceFactor(): number {
  // 检测硬件并发度(CPU核心数)
  const cpuCores =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;

  // 检测设备内存
  // @ts-ignore - deviceMemory 属性可能不存在于所有浏览器
  const deviceMemory =
    typeof navigator !== 'undefined' && navigator.deviceMemory
      ? // @ts-ignore
        navigator.deviceMemory
      : 4;

  // 计算性能因子
  let performanceFactor = 1;

  // 根据CPU核心数调整
  if (cpuCores <= 2) {
    performanceFactor *= 1.5; // 低端设备
  } else if (cpuCores >= 8) {
    performanceFactor *= 0.8; // 高端设备
  }

  // 根据内存调整
  if (deviceMemory <= 2) {
    performanceFactor *= 1.3; // 低内存设备
  } else if (deviceMemory >= 8) {
    performanceFactor *= 0.9; // 高内存设备
  }

  return performanceFactor;
}
