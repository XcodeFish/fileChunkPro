/**
 * environmentDetectionExample.ts
 *
 * 展示如何使用重构后的环境检测系统
 */

import { EnvironmentDetectorFactory } from '../utils/EnvironmentDetectorFactory';
import { IEnvironmentDetector } from '../types/environment-detection';
import { BrowserFeature, MiniProgramFeature } from '../types/environment';
import { Logger } from '../utils/Logger';

/**
 * 环境检测示例类
 */
class EnvironmentDetectionExample {
  private logger: Logger;
  private detector: IEnvironmentDetector;

  constructor() {
    this.logger = new Logger('EnvironmentDetectionExample');

    // 使用环境检测器工厂创建检测器
    const detectorFactory = EnvironmentDetectorFactory.getInstance();

    // 创建轻量级检测器 - 适用于简单检测
    // this.detector = detectorFactory.createLightDetector();

    // 创建完整检测器 - 适用于需要全面环境评估的场景
    // this.detector = detectorFactory.createFullDetector();

    // 创建调试检测器 - 包含详细日志
    this.detector = detectorFactory.createDebugDetector();
  }

  /**
   * 运行基本环境检测
   */
  public async detectBasicEnvironment(): Promise<void> {
    try {
      // 执行环境检测
      const result = await this.detector.detect();

      this.logger.debug('环境检测结果', {
        environment: result.environment,
        environmentType: result.environmentType,
        runtime: result.runtime,
        version: result.version,
      });

      // 输出浏览器信息(如在浏览器环境中)
      if (result.browser) {
        this.logger.debug('浏览器信息', result.browser);
      }

      // 输出WebView信息(如在WebView中)
      if (result.webViewInfo && result.webViewInfo.isWebView) {
        this.logger.debug('WebView信息', result.webViewInfo);
      }

      // 输出设备信息
      if (result.deviceProfile) {
        this.logger.debug('设备信息', result.deviceProfile);
      }
    } catch (error) {
      this.logger.error('环境检测失败', error);
    }
  }

  /**
   * 检测特定特性
   */
  public async detectFeatures(): Promise<void> {
    try {
      const result = await this.detector.detect();

      const browserFeatures = [
        BrowserFeature.FILE_API,
        BrowserFeature.WEB_WORKER,
        BrowserFeature.SERVICE_WORKER,
        BrowserFeature.INDEXED_DB,
        BrowserFeature.STREAMS_API,
        BrowserFeature.WEB_CRYPTO,
      ];

      const miniProgramFeatures = [
        MiniProgramFeature.UPLOAD_FILE,
        MiniProgramFeature.DOWNLOAD_FILE,
        MiniProgramFeature.FILE_SYSTEM,
        MiniProgramFeature.WORKER,
      ];

      const featuresToCheck =
        result.environment === 'browser'
          ? browserFeatures
          : miniProgramFeatures;

      this.logger.debug('检测特性支持情况');

      for (const feature of featuresToCheck) {
        const supported = this.detector.supportsFeature(feature);
        this.logger.debug(`特性 ${feature}: ${supported ? '支持' : '不支持'}`);
      }

      // 输出推荐配置
      this.logger.debug(
        '根据环境推荐的配置',
        await this.detector.getRecommendedConfig()
      );

      // 输出环境限制
      this.logger.debug('环境限制', await this.detector.getLimitations());
    } catch (error) {
      this.logger.error('特性检测失败', error);
    }
  }

  /**
   * 检查环境需求
   */
  public async checkEnvironmentRequirements(): Promise<void> {
    try {
      // 定义需求
      const requirements = {
        features: [BrowserFeature.FILE_API, BrowserFeature.WEB_WORKER],
        capabilities: ['localStorage', 'fetch'],
        minMemory: 2048, // 至少2GB内存
        minCpu: 2, // 至少2个CPU核心
      };

      // 检查需求
      const checkResult = await this.detector.checkRequirements(requirements);

      if (checkResult.satisfied) {
        this.logger.debug('环境满足所有需求');
      } else {
        this.logger.warn('环境不满足需求', {
          missing: checkResult.missing,
          recommendations: checkResult.recommendations,
        });
      }
    } catch (error) {
      this.logger.error('需求检查失败', error);
    }
  }
}

/**
 * 运行示例
 */
async function runExample(): Promise<void> {
  const example = new EnvironmentDetectionExample();

  // 执行基本环境检测
  await example.detectBasicEnvironment();

  // 检测特定特性
  await example.detectFeatures();

  // 检查环境需求
  await example.checkEnvironmentRequirements();
}

// 运行示例
runExample().catch(console.error);

export default EnvironmentDetectionExample;
