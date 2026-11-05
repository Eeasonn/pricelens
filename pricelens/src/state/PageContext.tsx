import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { hiddenInStable } from '../appChannel';
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

// 稳定版 / 迭代版双通道收敛（Eason 2026-11-05）：本文件是页状态的唯一写入口
// （?p= 启动解析 + 全站一切 go() 调用，含 Agent 面板跳转、页内按钮），因此在
// 这里统一收敛——稳定版（生产构建）访问大盘走势 / 量价预测 / 情报中心三页的
// 任何页 id 直达一律落回价格走势（dashboard）。三页组件代码保留（迭代版继续
// 使用），稳定版入口不存在（见 appChannel.ts 判定纪律），无任何 URL/开关逃逸口。
function resolveChannelPage(p: Page): Page {
  return hiddenInStable(p) ? 'dashboard' : p;
}

function initialPage(): Page {
  try {
    const p = new URLSearchParams(window.location.search).get('p');
    if (p === 'overview' || p === 'dashboard' || p === 'volume' || p === 'marketboard' || p === 'pricing' || p === 'intelligence' || p === 'forecast' || p === 'config' || p === 'alerts') return resolveChannelPage(p);
  } catch {
    /* 无 window 忽略 */
  }
  return 'dashboard';
}

export function PageProvider({ children }: { children: ReactNode }) {
  const [page, setPageRaw] = useState<Page>(initialPage);
  // go() 的唯一通道：稳定版下三页页 id 落回 dashboard（落回后 URL 的 ?p= 也
  // 会被下方 effect 清除——dashboard 为默认页不写参数）
  const setPage = (p: Page) => setPageRaw(resolveChannelPage(p));

  useEffect(() => {
    writeUrlPatch({ p: page === 'dashboard' ? null : page });
  }, [page]);

  return <Ctx.Provider value={{ page, go: setPage }}>{children}</Ctx.Provider>;
}

export function usePage() {
  return useContext(Ctx);
}
