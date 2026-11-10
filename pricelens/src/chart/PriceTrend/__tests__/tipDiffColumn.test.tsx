// ============================================================
// 第196轮整改1（Eason）：悬停小卡「价差」列测试。
// 同源断言核心：浮层价差格文案必须与 helpers.diffPct（TrendTables 宽表价差区
// 渲染与复制 TSV 的同一函数）输出逐字一致；主品基准行留空；任一侧缺价「—」；
// 未传 tipDiffBaseKey（量价/下钻等调用方）不出列，宽度语义不变。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { waitForGeom } from './chartTestUtils';
import Chart from '../Chart';
import { diffPct } from '../helpers';
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
    // jsdom 无布局：异步派发一次固定宽度，让 Chart 拿到非零 geom
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

const mk = (key: string, brand: string, label: string, prices: (number | null)[]): Series => ({
  key,
  isOwn: key.startsWith('OWN'),
  brand,
  label,
  skuIds: ['sku-1'],
  color: key.startsWith('OWN') ? '#c7000b' : '#1d1d1f',
  points: pts(prices),
  platform: null,
  channelBadge: null,
});

const OWN = 'OWN__12GB';
const COMP = 'COMP__12GB';
const baseProps = {
  series: [mk(OWN, 'HUAWEI', 'HUAWEI Mate 70 12GB', [1000, 990, 980, 970, 960]), mk(COMP, 'APPLE', 'iPhone 17 128GB', [1100, 1080, 1060, 1040, 1020])],
  granularity: 'week' as const,
  currency: 'usd' as const,
  priceTypes: { discounted: true, rrp: false },
  gridLeft: 60,
  gridTop: 36,
  tipMode: 'wow' as const,
};

/** 悬停第 col 列（列中点）：wrapper 是 render 容器首个 div（onMouseMove 载体） */
function hoverColumn(container: HTMLElement, col: number, n = 5): void {
  const plotLeft = 60;
  const plotWidth = 900 - 60 - 24;
  const colW = plotWidth / n;
  const x = plotLeft + colW * (col + 0.5);
  fireEvent.mouseMove(container.firstElementChild as Element, { clientX: x, clientY: 200 });
}

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('第196轮整改1：悬停小卡价差列（与明细表 diffPct 同源）', () => {
  it('对比产品行的价差格 = diffPct(对比价, 主品价).text（同一函数逐字一致），主品行留空', async () => {
    const { container } = render(<Chart {...baseProps} tipDiffBaseKey={OWN} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 1);
    // 表头出列
    expect(screen.getByText('价差')).toBeTruthy();
    // 同源断言：主品 990 / 对比 1080 → 宽表价差区同款文案
    const expected = diffPct(1080, 990)!.text;
    expect(expected).toBe('+9.1%');
    // 浮层里必须出现与明细表完全相同的文案
    expect(screen.getByText(expected)).toBeTruthy();
    // 主品行（第一行 = 基准）价差格留空：两行数据格中只有 1 个非空
    const nonEmpty = screen.getAllByText(expected);
    expect(nonEmpty.length).toBe(1);
  });

  it('任一侧缺价 → 与明细表同款「—」（hairlineStrong 空格语义）', async () => {
    const series = [mk(OWN, 'HUAWEI', 'HUAWEI Mate 70 12GB', [1000, null, 980, 970, 960]), mk(COMP, 'APPLE', 'iPhone 17 128GB', [1100, 1080, 1060, 1040, 1020])];
    const { container } = render(<Chart {...baseProps} series={series} tipDiffBaseKey={OWN} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 1); // 主品该列缺价
    expect(screen.getByText('价差')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('未传 tipDiffBaseKey（量价/下钻等调用方）→ 不出价差列', async () => {
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    expect(screen.queryByText('价差')).toBeNull();
  });

  it('主品 key 不在图上（无数据/被屏蔽）→ 不出价差列（与宽表 hasDiff=false 同语义）', async () => {
    const { container } = render(<Chart {...baseProps} tipDiffBaseKey="GONE__1" /> as ReactElement);
    await waitForGeom(container);
    expect(screen.queryByText('价差')).toBeNull();
  });
});

// ============================================================
// 2026-11-10 UI 审计修：悬停卡三处收敛——
// ① RRP/折后价钱数读数改 formatPrice（与图下明细表同口径，USD = $990）；
// ② 周粒度卡头「周 ID · 日期」双标识；③ 基准（我司）当周无数据时文字说明，
// 不再只留一列空破折号。
// ============================================================
describe('2026-11-10 审计修：悬停卡（formatPrice 读数 / 周 ID 双标识 / 基准缺席说明）', () => {
  it('RRP/折后价列 = formatPrice 读数（USD $ 前缀千分位，与明细表一致）', async () => {
    const { container } = render(<Chart {...baseProps} tipDiffBaseKey={OWN} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 1);
    expect(screen.getByText('$990')).toBeTruthy(); // 主品折后价 990
    expect(screen.getByText('$1,090')).toBeTruthy(); // 主品 RRP = price + 100
    expect(screen.getByText('$1,080')).toBeTruthy(); // 对比行折后价
    // 旧裸数格式不再出现（钱数一律带币种前缀）
    expect(screen.queryByText('990')).toBeNull();
  });

  it('周粒度卡头 = 「周 ID · 日期」双标识（2026W21 · 05-06）', async () => {
    const { container } = render(<Chart {...baseProps} tipDiffBaseKey={OWN} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 1);
    // 周号（等宽 mute 前缀）+ 原日期都在卡头
    expect(screen.getByText('2026W21 ·')).toBeTruthy();
    expect(screen.getByText('05-06')).toBeTruthy();
  });

  it('基准（我司）当周无数据：卡内出 12px mute 说明行；有数据的列不出', async () => {
    const gappy = [mk(OWN, 'HUAWEI', 'HUAWEI Mate 70 12GB', [1000, null, 980, 970, 960]), mk(COMP, 'APPLE', 'iPhone 17 128GB', [1100, 1080, 1060, 1040, 1020])];
    const { container } = render(<Chart {...baseProps} series={gappy} tipDiffBaseKey={OWN} /> as ReactElement);
    await waitForGeom(container);
    hoverColumn(container, 1); // 主品该列缺价：价差列全「—」+ 说明行
    const note = document.querySelector('[data-testid="tip-base-absent"]') as HTMLElement | null;
    expect(note?.textContent).toBe('基准（我司）当周无数据，价差不可比');
    expect(note?.style.fontSize).toBe('12px');
    cleanup();
    const ok = render(<Chart {...baseProps} tipDiffBaseKey={OWN} /> as ReactElement);
    await waitForGeom(ok.container);
    hoverColumn(ok.container, 1);
    expect(document.querySelector('[data-testid="tip-base-absent"]')).toBeNull();
  });
});
