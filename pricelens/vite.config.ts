import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
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

// 版本通道构建期烙定（appChannel.ts 唯一判定源）：只有 npm run build:iterate 会设
// VITE_APP_CHANNEL=iterate（在线演进版 /iterate/）；默认构建恒为 ''（稳定版）。
const APP_CHANNEL_ENV = process.env.VITE_APP_CHANNEL ?? '';

// 单文件离线交付：数据 JSON 构建时内嵌（§1 / §14.1）
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      // 演进版标签页标题带「演进版」：与稳定版区分，同时作为 CI 产物自检锚点
      name: 'pricelens-iterate-title',
      transformIndexHtml(html) {
        const channel = APP_CHANNEL_ENV === 'iterate' ? 'iterate' : 'stable';
        const marker = `<meta name="pricelens-channel" content="${channel}">`;
        const marked = html.includes('name="pricelens-channel"')
          ? html
          : html.replace('</head>', `${marker}</head>`);
        return channel === 'iterate'
          ? marked.replace('<title>PriceLens</title>', '<title>PriceLens · 演进版</title>')
          : marked;
      },
    },
  ],
  define: {
    'import.meta.env.VITE_APP_CHANNEL': JSON.stringify(APP_CHANNEL_ENV),
    __PRICE_WEEKLY_DATA_VERSION__: JSON.stringify(dataVersion('weekly', ['fact_pack_gzip.b64.txt', 'dim_time.json', ...sharedDataFiles])),
    __PRICE_MONTHLY_DATA_VERSION__: JSON.stringify(dataVersion('monthly', ['fact_price_monthly.json', ...sharedDataFiles])),
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
      '/api/agent': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
