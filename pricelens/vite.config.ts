import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Content identity follows the actual build inputs, including a frozen data copy.
// This is a version, not an ingest/collection timestamp or a freshness claim.
const dataVersion = (kind: 'weekly' | 'monthly', files: string[]): string => {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file).update('\0').update(readFileSync(new URL(`./src/data/${file}`, import.meta.url))).update('\0');
  }
  return `${kind}-sha256-${hash.digest('hex')}`;
};
const sharedDataFiles = ['dim_product.json', 'dim_channel.json', 'dim_default_channel.json', 'dim_benchmark.json'];

// 单文件离线交付：数据 JSON 构建时内嵌（§1 / §14.1）
export default defineConfig({
  // 相对 base（2026-11-27，离线单文件退役）：产物是 index.html + 分离的 js / css，同一份 dist
  // 既要落在 GitHub Pages 项目子路径（/pricelens/），也要被本机 Python 服务器在根路径直接托管；
  // 应用状态全在查询串里、没有路径路由，相对引用没有副作用。dev 下 Vite 把相对 base 当 '/' 处理。
  base: './',
  plugins: [react()],
  define: {
    __PRICE_WEEKLY_DATA_VERSION__: JSON.stringify(dataVersion('weekly', ['fact_pack_gzip.b64.txt', 'dim_time.json', ...sharedDataFiles])),
    __PRICE_MONTHLY_DATA_VERSION__: JSON.stringify(dataVersion('monthly', ['fact_price_monthly.json', ...sharedDataFiles])),
    // 构建墙钟时间（2026-11-17）：数据版本哈希只随数据变，代码变了哈希不变——
    // 配置页显示构建时间用于分辨「两台机器打开的是不是同一份单文件」（Windows 缓存旧 HTML 类问题）
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 8000,
  },
  test: {
    setupFiles: ['./src/test/browserSetup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.consolidation-backup-*/**'],
  },
  server: {
    proxy: {
      // 精确规则在前：/api/agent → Node Agent 网关（8787），其余 /api/* →
      // Python 本机数据服务器（8321，server/server.py——2026-11-18 前后端分离）
      '/api/agent': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8321',
        changeOrigin: true,
      },
    },
  },
});
