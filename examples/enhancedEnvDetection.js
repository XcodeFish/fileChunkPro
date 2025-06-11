/**
 * 增强环境检测系统示例
 * 展示如何使用WebView检测、低配置设备识别和环境特性数据库
 */

import {
  WebViewDetector,
  DeviceCapabilityDetector,
  EnvironmentFeatureDatabase,
  EnvironmentDetectionSystem,
} from '../src/utils';

/**
 * 完整演示如何使用增强的环境检测系统
 */
async function demonstrateEnhancedEnvironmentDetection() {
  console.log('开始环境检测演示...');

  // 1. 使用WebView检测器
  const webViewDetector = WebViewDetector.getInstance();
  const webViewInfo = webViewDetector.detectWebView();

  console.log('WebView检测结果:', {
    isWebView: webViewInfo.isWebView,
    type: webViewInfo.type,
    engine: webViewInfo.engine,
    limitations: webViewInfo.limitations,
  });

  // 如果是WebView环境，获取推荐配置
  if (webViewInfo.isWebView) {
    const webViewConfig = webViewDetector.getRecommendedConfig();
    console.log('WebView环境推荐配置:', webViewConfig);
  }

  // 2. 使用设备能力检测器
  const deviceDetector = DeviceCapabilityDetector.getInstance();
  const deviceProfile = await deviceDetector.detectDeviceProfile();

  console.log('设备能力检测结果:', {
    memoryTier: deviceProfile.memory.estimatedTier,
    processorTier: deviceProfile.processor.estimatedTier,
    isLowEndDevice: deviceProfile.lowEndDevice,
    hardwareConcurrency: deviceProfile.processor.hardwareConcurrency,
    screenInfo: deviceProfile.screenInfo,
  });

  // 根据设备能力和文件大小获取优化设置
  const largeFileSize = 200 * 1024 * 1024; // 200MB文件
  const optimizedSettings =
    await deviceDetector.getOptimizedSettingsForFile(largeFileSize);
  console.log(
    `针对 ${largeFileSize / (1024 * 1024)}MB 文件的优化设置:`,
    optimizedSettings
  );

  // 3. 使用环境特性数据库
  const featureDB = EnvironmentFeatureDatabase.getInstance();

  // 获取当前环境数据
  const currentEnvData = featureDB.getCurrentEnvironmentData();

  if (currentEnvData) {
    console.log('当前环境特性:', {
      name: currentEnvData.name,
      description: currentEnvData.description,
      supportedFeatures: Object.entries(currentEnvData.features)
        .filter(([_, supported]) =>
          typeof supported === 'boolean' ? supported : supported.supported
        )
        .map(([key]) => key),
      limitations: currentEnvData.limitations.map(
        l => `${l.type}: ${l.description}`
      ),
    });

    // 获取最佳实践
    const bestPractices = featureDB.getBestPractices(currentEnvData.type);
    console.log(
      '环境最佳实践:',
      bestPractices.map(p => p.name)
    );
  } else {
    console.log('未能识别当前环境特性');
  }

  // 4. 使用完整的环境检测系统
  const envSystem = EnvironmentDetectionSystem.getInstance();
  const envResult = await envSystem.detectEnvironment();

  console.log('综合环境检测结果:', {
    environment: envResult.environment,
    environmentType: envResult.environmentType,
    browser: envResult.browser,
    osInfo: envResult.osInfo,
    webView: envResult.webViewInfo ? '是' : '否',
    lowEndDevice: envResult.deviceProfile?.lowEndDevice ? '是' : '否',
  });

  console.log('检测到的功能限制:', envResult.limitations);
  console.log('推荐配置设置:', envResult.recommendedSettings);

  // 检查环境是否满足特定要求
  const requirements = {
    features: ['WEB_WORKER', 'INDEXED_DB'],
    capabilities: ['localStorage', 'fileSystem'],
    minMemory: 1024, // 至少1GB内存
    minCpu: 2, // 至少2核CPU
  };

  const checkResult =
    await envSystem.checkEnvironmentRequirements(requirements);

  if (checkResult.satisfied) {
    console.log('当前环境满足所有要求');
  } else {
    console.log('当前环境不满足部分要求:');
    console.log('- 缺失:', checkResult.missing);

    if (checkResult.recommendations.length > 0) {
      console.log('- 建议:', checkResult.recommendations);
    }
  }
}

// 执行演示
demonstrateEnhancedEnvironmentDetection().catch(error => {
  console.error('环境检测演示失败:', error);
});

/**
 * 使用环境检测系统优化上传配置的示例
 */
async function optimizeUploadConfiguration(initialConfig) {
  const envSystem = EnvironmentDetectionSystem.getInstance();
  const envResult = await envSystem.detectEnvironment();

  // 合并初始配置与环境推荐配置
  const optimizedConfig = {
    ...initialConfig,
    ...envResult.recommendedSettings,
  };

  // 对于特定环境的特殊处理
  if (envResult.webViewInfo?.isWebView) {
    // 为WebView环境添加特殊处理
    optimizedConfig.transport = 'chunked';
    optimizedConfig.retryStrategy = 'aggressive';
  }

  // 为低端设备添加特殊处理
  if (envResult.deviceProfile?.lowEndDevice) {
    optimizedConfig.useHashVerification = false; // 禁用哈希验证以节省CPU
    optimizedConfig.progressUpdateInterval = 1000; // 降低进度更新频率
  }

  return optimizedConfig;
}

// 使用示例
const initialConfig = {
  parallelUploads: 3,
  chunkSize: 4 * 1024 * 1024,
  retryCount: 3,
  timeout: 30000,
};

optimizeUploadConfiguration(initialConfig).then(config => {
  console.log('环境优化后的上传配置:', config);
});
