import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { writeUrlPatch } from './urlSync';

// 2026-10-20 起：价格看板为默认页（聚焦看板呈现）；总览/预警页置灰待重构，URL 直达也回落看板。
// 页签同步 URL query（?p=，默认页省略；筛选参数由 FiltersProvider 写）。
export type Page = 'overview' | 'dashboard' | 'config' | 'alerts';

const DISABLED_PAGES: Page[] = ['overview', 'alerts'];

interface PageCtx {
  page: Page;
  go: (p: Page) => void;
}

const Ctx = createContext<PageCtx>({ page: 'dashboard', go: () => {} });

function initialPage(): Page {
  try {
    const p = new URLSearchParams(window.location.search).get('p');
    if (p === 'dashboard' || p === 'config') return p;
  } catch {
    /* 无 window 忽略 */
  }
  return 'dashboard';
}

export function PageProvider({ children }: { children: ReactNode }) {
  const [page, setPageRaw] = useState<Page>(initialPage);
  const setPage = (p: Page) => setPageRaw(DISABLED_PAGES.includes(p) ? 'dashboard' : p);

  useEffect(() => {
    writeUrlPatch({ p: page === 'dashboard' ? null : page });
  }, [page]);

  return <Ctx.Provider value={{ page, go: setPage }}>{children}</Ctx.Provider>;
}

export function usePage() {
  return useContext(Ctx);
}
