import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 单文件离线交付：数据 JSON 构建时内嵌（§1 / §14.1）
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 8000,
  },
});
