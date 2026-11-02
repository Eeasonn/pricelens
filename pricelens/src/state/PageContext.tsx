import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { writeUrlPatch } from './urlSync';

// 2026-10-20 起：价格看板为默认页（聚焦看板呈现）；保留总览和定价推演的 URL 兼容，避免旧书签静默落到另一页。
// 2026-10-23（第一百三十九轮）：预警中心恢复可达（订阅/阈值/明细闭环）。
// 页签同步 URL query（?p=，默认页省略；筛选参数由 FiltersProvider 写）。
// 第112轮：新增 'volume'（量价看板，价格 × 估算销量三面板对比）。
// 第一百六十五轮：新增 'pricing'（定价推演——上市定价 what-if 玻璃盒，全模拟数据）。
// 2026-11-03：新增 'marketboard'（大盘走势——GFK 看板复刻三图，marketboard/ 目录组件）。
export type Page = 'overview' | 'dashboard' | 'volume' | 'marketboard' | 'pricing' | 'intelligence' | 'forecast' | 'config' | 'alerts';

interface PageCtx {
  page: Page;
  go: (p: Page) => void;
}

const Ctx = createContext<PageCtx>({ page: 'dashboard', go: () => {} });

function initialPage(): Page {
  try {
    const p = new URLSearchParams(window.location.search).get('p');
    if (p === 'overview' || p === 'dashboard' || p === 'volume' || p === 'marketboard' || p === 'pricing' || p === 'intelligence' || p === 'forecast' || p === 'config' || p === 'alerts') return p;
  } catch {
    /* 无 window 忽略 */
  }
  return 'dashboard';
}

export function PageProvider({ children }: { children: ReactNode }) {
  const [page, setPageRaw] = useState<Page>(initialPage);
  const setPage = (p: Page) => setPageRaw(p);

  useEffect(() => {
    writeUrlPatch({ p: page === 'dashboard' ? null : page });
  }, [page]);

  return <Ctx.Provider value={{ page, go: setPage }}>{children}</Ctx.Provider>;
}

export function usePage() {
  return useContext(Ctx);
}
