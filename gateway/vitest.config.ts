import { defineConfig } from 'vitest/config';

// gateway 独立的测试配置：node 环境 + 零网络（上游 fetch 一律 mock）。
// 不要动 pricelens 自己的 vitest 配置，两边互不影响。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
