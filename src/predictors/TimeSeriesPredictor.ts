/**
 * TimeSeriesPredictor - 时间序列预测工具
 *
 * 功能：
 * 1. 提供多种时间序列预测算法
 * 2. 支持指数平滑、移动平均、ARIMA模型的简化实现
 * 3. 支持季节性和周期性模式检测
 * 4. 提供预测精度评估
 */

export interface DataPoint {
  value: number;
  timestamp: number;
}

export interface PredictionOptions {
  method: 'exponential_smoothing' | 'moving_average' | 'arima' | 'auto';
  horizon: number; // 预测未来多少个点
  seasonalPeriod?: number; // 季节性周期长度
  alpha?: number; // 指数平滑系数 (0-1)
  beta?: number; // 趋势平滑系数 (0-1)
  gamma?: number; // 季节性平滑系数 (0-1)
  order?: number; // 移动平均窗口大小
  confidenceInterval?: boolean; // 是否计算置信区间
}

export interface PredictionResult {
  predictions: Array<{
    timestamp: number;
    value: number;
    confidenceLow?: number;
    confidenceHigh?: number;
  }>;
  method: string;
  accuracy: {
    mse?: number; // 均方误差
    mape?: number; // 平均绝对百分比误差
  };
  seasonalityDetected: boolean;
  dominantPeriod?: number; // 主要周期（如果检测到）
}

export class TimeSeriesPredictor {
  /**
   * 预测时间序列未来值
   * @param data 历史数据点
   * @param options 预测选项
   * @returns 预测结果
   */
  public predict(
    data: DataPoint[],
    options: PredictionOptions
  ): PredictionResult {
    // 如果数据不足，无法进行有效预测
    if (data.length < 3) {
      return this.createEmptyPrediction(data, options.horizon);
    }

    // 按时间戳排序
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);

    // 自动选择方法
    if (options.method === 'auto') {
      options.method = this.selectBestMethod(sortedData);
    }

    // 检测季节性
    const seasonalityAnalysis = this.detectSeasonality(sortedData);

    // 如果检测到季节性但未指定周期，则使用检测到的周期
    if (
      seasonalityAnalysis.isSeasonality &&
      !options.seasonalPeriod &&
      seasonalityAnalysis.period
    ) {
      options.seasonalPeriod = seasonalityAnalysis.period;
    }

    // 根据选择的方法进行预测
    let result: PredictionResult;

    switch (options.method) {
      case 'exponential_smoothing':
        result = this.exponentialSmoothingPredict(sortedData, options);
        break;
      case 'moving_average':
        result = this.movingAveragePredict(sortedData, options);
        break;
      case 'arima':
        result = this.arimaPredict(sortedData, options);
        break;
      default:
        result = this.exponentialSmoothingPredict(sortedData, options);
    }

    // 添加季节性信息
    result.seasonalityDetected = seasonalityAnalysis.isSeasonality;
    if (seasonalityAnalysis.period) {
      result.dominantPeriod = seasonalityAnalysis.period;
    }

    return result;
  }

  /**
   * 创建空预测结果（当数据不足时）
   */
  private createEmptyPrediction(
    data: DataPoint[],
    horizon: number
  ): PredictionResult {
    const lastPoint =
      data.length > 0
        ? data[data.length - 1]
        : { value: 0, timestamp: Date.now() };
    const predictions = [];

    // 对于没有足够数据的情况，简单地重复最后一个值
    for (let i = 0; i < horizon; i++) {
      const timestamp =
        lastPoint.timestamp + (i + 1) * this.getAverageTimeDiff(data);
      predictions.push({
        timestamp,
        value: lastPoint.value,
      });
    }

    return {
      predictions,
      method: 'simple_repeat',
      accuracy: {},
      seasonalityDetected: false,
    };
  }

  /**
   * 获取数据点之间的平均时间差
   */
  private getAverageTimeDiff(data: DataPoint[]): number {
    if (data.length < 2) return 60000; // 默认1分钟

    let sum = 0;
    for (let i = 1; i < data.length; i++) {
      sum += data[i].timestamp - data[i - 1].timestamp;
    }

    return sum / (data.length - 1);
  }

  /**
   * 自动选择最佳预测方法
   */
  private selectBestMethod(
    data: DataPoint[]
  ): 'exponential_smoothing' | 'moving_average' | 'arima' {
    // 简单启发式方法选择:
    // - 对于有明显季节性的数据，使用指数平滑
    // - 对于噪声较大的数据，使用移动平均
    // - 对于更复杂的时间序列，尝试ARIMA模型

    const seasonalityAnalysis = this.detectSeasonality(data);

    if (seasonalityAnalysis.isSeasonality) {
      return 'exponential_smoothing';
    }

    // 计算数据的变化率方差
    const variability = this.calculateVariability(data);

    // 噪声大，使用移动平均平滑
    if (variability > 0.2) {
      return 'moving_average';
    }

    // 对于较复杂的数据集，默认使用指数平滑
    // 注：完整ARIMA模型相对复杂，此处仅为简化实现
    return 'exponential_smoothing';
  }

  /**
   * 计算数据变化率的波动性
   */
  private calculateVariability(data: DataPoint[]): number {
    if (data.length < 3) return 0;

    // 计算相邻点的变化率
    const changes = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].value;
      const curr = data[i].value;

      // 避免除零
      if (prev !== 0) {
        changes.push(Math.abs((curr - prev) / prev));
      }
    }

    if (changes.length === 0) return 0;

    // 计算变化率的平均值和方差
    const mean = changes.reduce((sum, val) => sum + val, 0) / changes.length;
    const variance =
      changes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      changes.length;

    return variance;
  }

  /**
   * 检测时间序列的季节性
   */
  private detectSeasonality(data: DataPoint[]): {
    isSeasonality: boolean;
    period?: number;
  } {
    if (data.length < 10) {
      return { isSeasonality: false };
    }

    // 提取值序列
    const values = data.map(point => point.value);

    // 检查可能的周期长度
    const possiblePeriods = [24, 12, 7, 31, 365]; // 小时、半天、周、月、年的常见周期
    let bestPeriod = null;
    let bestAutocorrelation = 0;

    for (const period of possiblePeriods) {
      if (data.length < period * 2) continue;

      const autocorrelation = this.calculateAutocorrelation(values, period);

      // 如果自相关系数够高，认为存在季节性
      if (autocorrelation > 0.5 && autocorrelation > bestAutocorrelation) {
        bestAutocorrelation = autocorrelation;
        bestPeriod = period;
      }
    }

    if (bestPeriod) {
      return { isSeasonality: true, period: bestPeriod };
    } else {
      // 如果没有明显周期，尝试自动检测（简化实现）
      const detectedPeriod = this.detectPeriodByAutocorrelation(values);
      if (detectedPeriod > 1) {
        return { isSeasonality: true, period: detectedPeriod };
      }
    }

    return { isSeasonality: false };
  }

  /**
   * 计算自相关系数
   */
  private calculateAutocorrelation(values: number[], lag: number): number {
    if (values.length <= lag) return 0;

    // 计算均值
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

    // 计算分母（方差）
    let denominator = 0;
    for (const val of values) {
      denominator += Math.pow(val - mean, 2);
    }

    // 避免除零
    if (denominator === 0) return 0;

    // 计算自相关
    let numerator = 0;
    for (let i = 0; i < values.length - lag; i++) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }

    return numerator / denominator;
  }

  /**
   * 通过自相关分析检测周期
   */
  private detectPeriodByAutocorrelation(values: number[]): number {
    // 简化的周期检测
    const maxLag = Math.min(50, Math.floor(values.length / 3));
    let bestLag = 0;
    let bestCorrelation = 0;

    for (let lag = 2; lag <= maxLag; lag++) {
      const correlation = this.calculateAutocorrelation(values, lag);
      if (correlation > 0.4 && correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    return bestLag;
  }

  /**
   * 指数平滑预测
   */
  private exponentialSmoothingPredict(
    data: DataPoint[],
    options: PredictionOptions
  ): PredictionResult {
    const values = data.map(point => point.value);
    const timestamps = data.map(point => point.timestamp);

    // 设置默认平滑系数
    const alpha = options.alpha || 0.3;
    const beta = options.beta || 0.1;
    const gamma = options.gamma || 0.1;

    // 季节性周期长度
    const seasonalPeriod = options.seasonalPeriod || 1;
    const hasSeasonal = seasonalPeriod > 1;

    // 初始化水平、趋势和季节性因子
    let level = values[0];
    let trend = hasSeasonal
      ? (values[seasonalPeriod] - values[0]) / seasonalPeriod
      : values[1] - values[0];

    // 初始化季节性因子
    const seasonal: number[] = [];
    if (hasSeasonal) {
      // 计算初始季节性因子
      for (let i = 0; i < Math.min(seasonalPeriod, values.length); i++) {
        seasonal[i] = values[i] / level;
      }

      // 如果数据长度不足一个完整周期，使用默认值
      for (let i = values.length; i < seasonalPeriod; i++) {
        seasonal[i] = 1.0;
      }
    } else {
      // 无季节性时使用1
      seasonal[0] = 1.0;
    }

    // 应用Holt-Winters算法计算预测值
    const predictions = [];

    // 计算评估指标用
    let sumSquaredError = 0;
    let sumAbsPercentError = 0;

    // 首先通过历史数据计算模型参数
    for (let i = 1; i < values.length; i++) {
      const seasonIdx = hasSeasonal ? i % seasonalPeriod : 0;
      const lastLevel = level;

      // 更新水平、趋势和季节性因子
      level =
        alpha * (values[i] / seasonal[seasonIdx]) +
        (1 - alpha) * (level + trend);
      trend = beta * (level - lastLevel) + (1 - beta) * trend;

      if (hasSeasonal) {
        seasonal[seasonIdx] =
          gamma * (values[i] / level) + (1 - gamma) * seasonal[seasonIdx];
      }

      // 计算预测值
      const forecast = (level + trend) * seasonal[seasonIdx];

      // 计算误差（用于评估模型）
      const error = values[i] - forecast;
      sumSquaredError += error * error;

      // 计算绝对百分比误差
      if (values[i] !== 0) {
        sumAbsPercentError += Math.abs(error / values[i]);
      }
    }

    // 计算MSE和MAPE
    const mse = sumSquaredError / (values.length - 1);
    const mape = (sumAbsPercentError / (values.length - 1)) * 100;

    // 预测未来值
    const intervalStep = this.getAverageTimeDiff(data);
    const lastTimestamp = timestamps[timestamps.length - 1];

    for (let i = 0; i < options.horizon; i++) {
      const futureTimestamp = lastTimestamp + (i + 1) * intervalStep;
      const seasonIdx = hasSeasonal ? (values.length + i) % seasonalPeriod : 0;
      const forecastValue = (level + (i + 1) * trend) * seasonal[seasonIdx];

      // 计算简单的置信区间
      const confidenceInterval = Math.sqrt(mse) * 1.96; // 95%置信区间

      predictions.push({
        timestamp: futureTimestamp,
        value: forecastValue,
        confidenceLow: options.confidenceInterval
          ? forecastValue - confidenceInterval
          : undefined,
        confidenceHigh: options.confidenceInterval
          ? forecastValue + confidenceInterval
          : undefined,
      });
    }

    return {
      predictions,
      method: 'exponential_smoothing',
      accuracy: {
        mse,
        mape,
      },
      seasonalityDetected: hasSeasonal,
      dominantPeriod: hasSeasonal ? seasonalPeriod : undefined,
    };
  }

  /**
   * 移动平均预测
   */
  private movingAveragePredict(
    data: DataPoint[],
    options: PredictionOptions
  ): PredictionResult {
    const values = data.map(point => point.value);
    const timestamps = data.map(point => point.timestamp);

    // 设置移动平均窗口大小
    const order = options.order || Math.min(5, Math.floor(values.length / 3));

    // 历史数据不足时自动调整窗口大小
    const actualOrder = Math.min(order, values.length - 1);

    if (actualOrder < 1) {
      return this.createEmptyPrediction(data, options.horizon);
    }

    // 计算移动平均
    const movingAverages: number[] = [];
    let sumSquaredError = 0;
    let sumAbsPercentError = 0;
    let count = 0;

    for (let i = actualOrder; i < values.length; i++) {
      let sum = 0;
      for (let j = 0; j < actualOrder; j++) {
        sum += values[i - j - 1];
      }

      const average = sum / actualOrder;
      movingAverages.push(average);

      // 计算误差
      const error = values[i] - average;
      sumSquaredError += error * error;

      if (values[i] !== 0) {
        sumAbsPercentError += Math.abs(error / values[i]);
        count++;
      }
    }

    // 计算MSE和MAPE
    const mse = count > 0 ? sumSquaredError / count : 0;
    const mape = count > 0 ? (sumAbsPercentError / count) * 100 : 0;

    // 预测未来值（使用最近的actualOrder个值的平均）
    const recentValues = values.slice(-actualOrder);
    const predictedValue =
      recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;

    // 计算预测的置信区间
    const confidenceInterval = Math.sqrt(mse) * 1.96; // 95%置信区间

    const predictions = [];
    const intervalStep = this.getAverageTimeDiff(data);
    const lastTimestamp = timestamps[timestamps.length - 1];

    for (let i = 0; i < options.horizon; i++) {
      predictions.push({
        timestamp: lastTimestamp + (i + 1) * intervalStep,
        value: predictedValue,
        confidenceLow: options.confidenceInterval
          ? predictedValue - confidenceInterval
          : undefined,
        confidenceHigh: options.confidenceInterval
          ? predictedValue + confidenceInterval
          : undefined,
      });
    }

    return {
      predictions,
      method: 'moving_average',
      accuracy: {
        mse,
        mape,
      },
      seasonalityDetected: false,
    };
  }

  /**
   * ARIMA预测（简化实现）
   */
  private arimaPredict(
    data: DataPoint[],
    options: PredictionOptions
  ): PredictionResult {
    // 注：由于ARIMA模型较为复杂，这里提供一个简化版实现
    // 实际生产环境可能需要使用专业的统计库

    // 这个简化版本实际上是AR(1)模型，即一阶自回归模型
    const values = data.map(point => point.value);
    const timestamps = data.map(point => point.timestamp);

    if (values.length < 3) {
      return this.createEmptyPrediction(data, options.horizon);
    }

    // 计算一阶差分（消除趋势）
    const differenced: number[] = [];
    for (let i = 1; i < values.length; i++) {
      differenced.push(values[i] - values[i - 1]);
    }

    // 计算自相关系数（滞后1期）
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 1; i < differenced.length; i++) {
      sumXY += differenced[i] * differenced[i - 1];
      sumX2 += differenced[i - 1] * differenced[i - 1];
    }

    // 计算AR系数
    const phi = sumX2 !== 0 ? sumXY / sumX2 : 0;

    // 预测差分序列未来值
    const lastDiff = differenced[differenced.length - 1];
    const predictions = [];

    let predictedDiff = lastDiff;
    let currentValue = values[values.length - 1];

    const intervalStep = this.getAverageTimeDiff(data);
    const lastTimestamp = timestamps[timestamps.length - 1];

    // 计算MSE（用于置信区间）
    let sumSquaredError = 0;
    for (let i = 1; i < differenced.length; i++) {
      const predicted = differenced[i - 1] * phi;
      const error = differenced[i] - predicted;
      sumSquaredError += error * error;
    }

    const mse = sumSquaredError / (differenced.length - 1);
    const confidenceInterval = Math.sqrt(mse) * 1.96; // 95%置信区间

    // 预测未来值
    for (let i = 0; i < options.horizon; i++) {
      // AR模型预测差分
      predictedDiff = predictedDiff * phi;

      // 计算预测值（累加差分）
      currentValue += predictedDiff;

      predictions.push({
        timestamp: lastTimestamp + (i + 1) * intervalStep,
        value: currentValue,
        confidenceLow: options.confidenceInterval
          ? currentValue - confidenceInterval
          : undefined,
        confidenceHigh: options.confidenceInterval
          ? currentValue + confidenceInterval
          : undefined,
      });
    }

    return {
      predictions,
      method: 'arima_simplified',
      accuracy: {
        mse,
      },
      seasonalityDetected: false,
    };
  }
}

export default TimeSeriesPredictor;
