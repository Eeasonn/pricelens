// ============================================================
// 第196轮整改4（Eason）：销毛迷你卡测试。
// 悬停浮层上方再浮一张迷你卡（我司主品销毛）：标题行带「模拟」数据状态徽标
// （PRODUCT.md：simulated 必须文字标注）、销毛率大数字 + 单台毛利/成本小字；
// 该桶无销毛数据显「—」（marginCostOf 月版本模型按桶映射，无有效价月 = null）；
// margins 未传（量价/下钻等调用方）不渲染。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { waitForGeom } from './chartTestUtils';
import Chart from '../Chart';
import type { MarginCostPoint } from '../../../pages/volume/marginCost';
import type { Series } from '../../../dataModel/types';

vi.mock('echarts/core', async () => await import('./echartsStub'));
vi.mock('echarts/charts', () => ({ LineChart: class {}, ScatterChart: class {} }));
vi.mock('echarts/components', () => ({ GridComponent: class {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: class {} }));

class ResizeObserverStub {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    setTimeout(() => this.cb([{ target: el, contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver), 0);
  }
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

const pts = (prices: (number | null)[]) =>
  prices.map((p, i) => ({
    bucketId: `2026${20 + i}`,
    xLabel: '05-06',
    anchorDate: '2026-05-06',
    rrp: p != null ? p + 100 : null,
    price: p,
    missing: p == null,
    offer: null,
    url: '',
    shopName: null,
  }));

const OWN = 'OWN__12GB';
const series: Series[] = [
  {
    key: OWN,
    isOwn: true,
    brand: 'HUAWEI',
    label: 'HUAWEI Mate 70 12GB',
    skuIds: ['sku-1'],
    color: '#c7000b',
    points: pts([1000, 990, 980, 970, 960]),
    platform: null,
    channelBadge: null,
  },
];

const baseProps = {
  series,
  granularity: 'week' as const,
  currency: 'usd' as const,
  priceTypes: { discounted: true, rrp: false },
  gridLeft: 60,
  gridTop: 36,
  tipMode: 'wow' as const,
};

const mp = (over: Partial<MarginCostPoint>): MarginCostPoint => ({
  bucketId: '2026-06',
  monthId: '2026-06',
  unitRevenue: 990,
  unitCost: 620,
  unitMargin: 370,
  marginRate: 0.374,
  simulated: true,
  ...over,
});

function hoverColumn(container: HTMLElement, col: number, n = 5): void {
  const plotLeft = 60;
  const plotWidth = 900 - 60 - 24;
  const colW = plotWidth / n;
  fireEvent.mouseMove(container.firstElementChild as Element, { clientX: plotLeft + colW * (col + 0.5), clientY: 200 });
}



beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('第196轮整改4：销毛迷你卡（悬停小卡上方；2026-11-05 复检只留销毛率）', () => {
  it('有数据桶：出「销毛率 + 模拟徽标 + 大数字销毛率」卡（不含毛利/成本段）', async () => {
    const margins: (MarginCostPoint | null)[] = [null, mp({}), null, null, null];
    const { container } = render(<Chart {...baseProps} margins={margins} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 1);
    // 价格小卡（周环比表头）与迷你卡同时在场
    expect(screen.getByText('周环比')).toBeTruthy();
    expect(screen.getByText('销毛率')).toBeTruthy();
    // 数据状态显性：模拟徽标（simulated 必须文字标注，不能只靠颜色）
    expect(screen.getByText('模拟')).toBeTruthy();
    // 销毛率大数字（marginRate × 100 保留 1 位小数）
    expect(screen.getByText('37.4%')).toBeTruthy();
    // 复检收敛：单台毛利/成本小字段不再出现
    expect(screen.queryByText('毛利 $370 · 成本 $620')).toBeNull();
  });

  it('该桶无销毛数据（月模型无有效价月 → null）→ 销毛率显「—」，卡仍在', async () => {
    const margins: (MarginCostPoint | null)[] = [null, null, null, null, null];
    const { container } = render(<Chart {...baseProps} margins={margins} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 0);
    expect(screen.getByText('销毛率')).toBeTruthy();
    // 大数字格「—」（仅此一处：毛利/成本段已随复检删除）
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('margins 未传（量价/下钻等调用方）→ 不渲染迷你卡', async () => {
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 1);
    expect(screen.queryByText('销毛率')).toBeNull();
  });

  it('迷你卡位于价格小卡上方 8px、左缘对齐（左右对齐 + 上下间距 8px）', async () => {
    const margins: (MarginCostPoint | null)[] = [mp({}), null, null, null, null];
    const { container } = render(<Chart {...baseProps} margins={margins} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 0);
    // 迷你卡 = 含「销毛率」标题的绝对定位卡；价格小卡 = 含「周环比」表头的卡
    const mini = screen.getByText('销毛率').closest('div[style*="z-index"]') as HTMLElement;
    const tip = screen.getByText('周环比').closest('div[style*="z-index"]') as HTMLElement;
    const miniStyle = mini.style;
    const tipStyle = tip.style;
    // 左缘对齐
    expect(miniStyle.left).toBe(tipStyle.left);
    // 上间距 = 价格卡 top − 迷你卡 top − 迷你卡高 = 8px
    const gap = Number(tipStyle.top.replace('px', '')) - Number(miniStyle.top.replace('px', '')) - Number(miniStyle.height.replace('px', ''));
    expect(gap).toBe(8);
    // 迷你卡在价格卡上方（top 更小）
    expect(Number(miniStyle.top.replace('px', ''))).toBeLessThan(Number(tipStyle.top.replace('px', '')));
  });
});
