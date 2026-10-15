import { createContext, useContext, useState, type ReactNode } from 'react';

// 第三十七轮：国家总览成为默认页（操盘主界面）；看板 = 分析视图、配置 = 主数据。
export type Page = 'overview' | 'dashboard' | 'config';

interface PageCtx {
  page: Page;
  go: (p: Page) => void;
}

const Ctx = createContext<PageCtx>({ page: 'overview', go: () => {} });

export function PageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('overview');
  return <Ctx.Provider value={{ page, go: setPage }}>{children}</Ctx.Provider>;
}

export function usePage() {
  return useContext(Ctx);
}
