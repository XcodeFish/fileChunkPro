import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/integration/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 30000, // 增加超时时间，因为集成测试可能需要更长时间
    pool: 'forks', // 使用fork池以确保每个测试文件独立运行
    isolate: true,
    setupTimeout: 10000, // 增加设置超时时间
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/tests/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
