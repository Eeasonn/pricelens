// 图表呈现切换（筛选栏下方那一行）：价格走势的两个子视图与量价走势。
// 子视图跟「价格看板 / 量价看板」页面正交——切到量价再回来，仍停在上次的
// 多产品对比或多平台对比。会话内保留，键与原先看板内页签同一份。
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import usePageViewState from './usePageViewState';

export type PriceSubview = 'products' | 'platforms';

interface ChartContentCtx {
  priceSubview: PriceSubview;
  setPriceSubview: (v: PriceSubview) => void;
}

const Ctx = createContext<ChartContentCtx>({
  priceSubview: 'products',
  setPriceSubview: () => {},
});

export function ChartContentProvider({ children }: { children: ReactNode }) {
  const [platforms, setPlatforms] = usePageViewState<boolean>('dashboard.compareTab', () => false);
  const setPriceSubview = useCallback((v: PriceSubview) => setPlatforms(v === 'platforms'), [setPlatforms]);
  return (
    <Ctx.Provider value={{ priceSubview: platforms ? 'platforms' : 'products', setPriceSubview }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChartContent(): ChartContentCtx {
  return useContext(Ctx);
}
