/**
 * 复制WebAssembly模块文件到dist目录
 *
 * 在实际项目中，这些文件应该由wasm-pack从Rust源码编译而来
 * 这个脚本仅用于开发环境，提供基本的WebAssembly文件
 */

const fs = require('fs');
const path = require('path');

// 确保目标目录存在
const wasmDir = path.resolve(__dirname, '../dist/wasm');
if (!fs.existsSync(wasmDir)) {
  fs.mkdirSync(wasmDir, { recursive: true });
}

// 基本的WebAssembly二进制魔数和版本号
// 这只是一个最小的有效WebAssembly模块，实际使用时应该用Rust编译的真实文件
const wasmHeaderBytes = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d, // WASM_BINARY_MAGIC
  0x01,
  0x00,
  0x00,
  0x00, // WASM_BINARY_VERSION

  // 以下是一个最小WebAssembly模块结构
  // 类型段
  0x01,
  0x04,
  0x01,
  0x60,
  0x00,
  0x00,
  // 函数段
  0x03,
  0x02,
  0x01,
  0x00,
  // 导出段
  0x07,
  0x08,
  0x01,
  0x04,
  0x6d,
  0x61,
  0x69,
  0x6e,
  0x00,
  0x00,
  // 代码段
  0x0a,
  0x04,
  0x01,
  0x02,
  0x00,
  0x0b,
]);

// 需要创建的WebAssembly文件
const wasmFiles = [
  'md5.wasm',
  'sha1.wasm',
  'sha256.wasm',
  'binary_processor.wasm',
];

// 创建每个WebAssembly文件
wasmFiles.forEach(filename => {
  const filePath = path.join(wasmDir, filename);
  fs.writeFileSync(filePath, wasmHeaderBytes);
  console.log(`Created ${filename}`);
});

console.log('WebAssembly模块文件已创建');
