/**
 * Worker构建配置
 * 使用esbuild构建Worker文件，可以独立于主构建过程运行
 */

const { build } = require('esbuild');
const { resolve, join } = require('path');
const fs = require('fs');

// 项目根目录
const ROOT = resolve(__dirname, '..');

// Worker源文件目录
const WORKERS_SRC = resolve(ROOT, 'src/workers');

// Worker输出目录
const WORKERS_DIST = resolve(ROOT, 'workers/default');

// 确保输出目录存在
if (!fs.existsSync(WORKERS_DIST)) {
  fs.mkdirSync(WORKERS_DIST, { recursive: true });
}

// 读取所有Worker文件
const workerFiles = fs
  .readdirSync(WORKERS_SRC)
  .filter(file => file.endsWith('.ts'));

/**
 * 构建单个Worker文件
 * @param {string} file Worker文件名
 * @param {boolean} minify 是否压缩
 */
async function buildWorker(file, minify = true) {
  const inputFile = join(WORKERS_SRC, file);
  const outputFile = join(WORKERS_DIST, file.replace('.ts', '.js'));

  try {
    await build({
      entryPoints: [inputFile],
      outfile: outputFile,
      bundle: true,
      minify,
      format: 'iife',
      target: 'es2018',
      platform: 'browser',
    });

    console.log(`✅ Built worker: ${file}`);
  } catch (error) {
    console.error(`❌ Error building worker ${file}:`, error);
    process.exit(1);
  }
}

/**
 * 构建所有Worker文件
 * @param {boolean} minify 是否压缩
 */
async function buildAllWorkers(minify = true) {
  console.log(`Building ${workerFiles.length} worker files...`);

  try {
    const promises = workerFiles.map(file => buildWorker(file, minify));
    await Promise.all(promises);
    console.log('✅ All workers built successfully!');
  } catch (error) {
    console.error('❌ Worker build failed:', error);
    process.exit(1);
  }
}

// 从命令行参数获取是否为生产环境
const isProd = process.argv.includes('--prod');

// 执行构建，生产环境压缩代码
buildAllWorkers(isProd);
