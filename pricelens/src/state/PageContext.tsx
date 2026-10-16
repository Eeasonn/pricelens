import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { writeUrlPatch } from './urlSync';

// 第三十七轮：国家总览成为默认页（操盘主界面）；看板 = 分析视图、配置 = 主数据。
// 追补⑨：预警中心升为独立页面（多产品阈值/开关便捷配置 + 触发列表）。
// 追补⑩（建议③）：页签同步 URL query（?p=，默认页省略；筛选参数由 FiltersProvider 写）。
export type Page = 'overview' | 'dashboard' | 'config' | 'alerts';

interface PageCtx {
  page: Page;
  go: (p: Page) => void;
}

const Ctx = createContext<PageCtx>({ page: 'overview', go: () => {} });

function initialPage(): Page {
  try {
    const p = new URLSearchParams(window.location.search).get('p');
    if (p === 'overview' || p === 'dashboard' || p === 'config' || p === 'alerts') return p;
  } catch {
    /* 无 window 忽略 */
  }
  return 'overview';
}

export function PageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>(initialPage);

  useEffect(() => {
    writeUrlPatch({ p: page === 'overview' ? null : page });
  }, [page]);

  return <Ctx.Provider value={{ page, go: setPage }}>{children}</Ctx.Provider>;
}

export function usePage() {
  return useContext(Ctx);
}
