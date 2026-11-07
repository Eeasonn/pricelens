// ============================================================
// 量价页 · 量价同骨架接线（2026-11-06 Eason 拍板，
// .impeccable/surfaces/range-ruler-volume-skeleton.md「量价走势」节）：
// 每个面板渲染价格走势同款 <Chart>，本测试用 Chart 桩捕获 props 钉住接线契约：
// ①量带恒开恒柱（volumeOn + volumeMode="bar"）+ paneLabels 图层标注 + 量带归属
//   （volumeOwner）+ 量尺入参（rangeMode/onRangeMode/rulerKey/brush/onBrushChange）；
// ②「销毛成本」开：我司面板传 costs（marginCostOf().unitCost，与窗口点对齐）+
//   margins（悬停销毛率迷你卡），竞品面板两个都不传；关：我司面板也不传；
// ③档位带不画（showTiers=false）、不下钻（enableDrill=false）、名称带自适应宽。
// 组装模式照 ../../chart/PriceTrend/__tests__/volumeOwnerWiring.test.tsx
// （mock buildSeries / FiltersContext / Chart；页面其余取数走真实模型）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { MainProduct } from '../../../state/filtersTypes';

const harness = vi.hoisted(() => ({
  mains: [] as unknown[],
  chartProps: [] as Record<string, unknown>[],
  noop: vi.fn(),
}));

vi.mock('../../../dataModel/aggregate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../dataModel/aggregate')>();
  // 逐桶有价（周中段缓变）：marginCostOf 需要有效价 + anchorDate 才能造出月度成本
  const helpers = await import('../../../chart/PriceTrend/helpers');
  const stubBuildSeries = (q: {
    groups: { modelId: string; romram: string }[];
    granularity: 'week' | 'month' | 'quarter';
    startBucket: string;
    endBucket: string;
  }) =>
    q.groups.map((g, gi) => {
      const buckets = helpers.enumerateBuckets(q.granularity, q.startBucket, q.endBucket);
      return {
        key: `${g.modelId}__${g.romram.replace(/\s+/g, '')}`,
        isOwn: g.modelId.startsWith('own-'),
        brand: g.modelId.startsWith('own-') ? 'HUAWEI' : 'APPLE',
        label: `${g.modelId} ${g.romram}`,
        skuIds: ['sku'],
        color: g.modelId.startsWith('own-') ? '#c7000b' : '#1d1d1f',
        points: buckets.map((b, i) => ({
          bucketId: b.id,
          xLabel: b.xLabel,
          anchorDate: helpers.bucketAnchorDate(q.granularity, b.id) ?? '2026-08-05',
          rrp: 1000 + gi,
          price: 880 + (i % 5) * 5 + gi * 10,
          missing: false,
          offer: null,
          url: '',
          shopName: null,
        })),
        platform: null,
        channelBadge: null,
      };
    });
  return { ...actual, buildSeries: stubBuildSeries };
});

vi.mock('../../../state/FiltersContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../state/FiltersContext')>();
  const actions = new Proxy({}, { get: () => harness.noop });
  return {
    ...actual,
    useFilters: () => ({
      state: {
        ...actual.defaultFilters,
        granularity: 'week' as const,
        rangeStart: '202619',
        rangeEnd: '202642',
        currency: 'usd' as const,
        priceTypes: { discounted: true, rrp: false },
        mains: harness.mains as MainProduct[],
      },
      actions,
    }),
  };
});

vi.mock('../../../chart/PriceTrend/Chart', () => ({
  default: (p: Record<string, unknown>) => {
    harness.chartProps.push(p);
    return null;
  },
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../../App';

/** 最新一轮面板 props（每面板一图；按 volumeOwner.key 归并去重后取每键最后一次） */
const latestPanels = (): Record<string, Record<string, unknown>> => {
  const out = new Map<string, Record<string, unknown>>();
  for (const p of harness.chartProps) {
    const owner = p.volumeOwner as { key: string } | null;
    if (owner) out.set(owner.key, p);
  }
  return Object.fromEntries(out);
};

const OWN_CARD = { id: 'card-a', main: { modelId: 'own-huawei-mate-80-pro', romram: '16+512 GB', skuIds: [], platform: null }, compares: [], auto: false };
const CMP_CARD = { id: 'card-b', main: { modelId: 'cmp-apple-iphone-16-pro', romram: '256 GB', skuIds: [], platform: null }, compares: [], auto: false };

beforeEach(() => {
  window.history.replaceState(null, '', '/?p=volume');
  sessionStorage.clear();
  harness.chartProps = [];
  harness.mains = [];
});
afterEach(cleanup);

describe('量价页 · 量价同骨架接线（2026-11-06）', () => {
  it('面板 Chart：量带恒开恒柱 + paneLabels + 名称带宽 + 量尺入参；档位带不画、不下钻', () => {
    harness.mains = [OWN_CARD];
    render(<App />);
    const panel = harness.chartProps[harness.chartProps.length - 1];
    // 量带：恒开、恒为柱（本页无「量」开关）
    expect(panel.volumeOn).toBe(true);
    expect(panel.volumeMode).toBe('bar');
    expect(panel.volumeHeight).toBeGreaterThan(0);
    expect(Array.isArray(panel.volumes)).toBe(true);
    expect((panel.volumeOwner as { key: string }).key).toContain('own-huawei-mate-80-pro');
    // 图层标注 + 名称带
    expect(panel.paneLabels).toBe(true);
    // 演进版（vitest = dev 形态）标题版式不变：pill，gridTop 不含标题行（稳定版见 volumeStablePaneHead）
    expect(panel.paneLabelLayout).toBe('pill');
    expect(panel.gridTop).toBe(16);
    expect(typeof panel.nameZoneWidth).toBe('number');
    expect(panel.nameZoneWidth as number).toBeGreaterThan(0);
    // 区间量尺入参：读数方式 + 清除回调 + 价格量尺量本面板产品线；初始无选区
    expect(panel.rangeMode).toBe('extreme');
    expect(typeof panel.onRangeMode).toBe('function');
    expect(panel.rulerKey).toBe((panel.series as { key: string }[])[0]?.key);
    expect(panel.brush).toBeNull();
    expect(typeof panel.onBrushChange).toBe('function');
    // 档位带不画、不下钻
    expect(panel.showTiers).toBe(false);
    expect(panel.enableDrill).toBe(false);
  });

  it('销毛成本开：我司面板传 costs + margins（unitCost 数值、与窗口点对齐）；竞品面板都不传', () => {
    harness.mains = [OWN_CARD, CMP_CARD];
    render(<App />);
    fireEvent.click(
      document.querySelector('button[aria-label="显示销毛成本"]') as HTMLButtonElement,
    );
    const panels = latestPanels();
    const ownKey = Object.keys(panels).find((k) => k.startsWith('own-'));
    const cmpKey = Object.keys(panels).find((k) => k.startsWith('cmp-'));
    expect(ownKey).toBeTruthy();
    expect(cmpKey).toBeTruthy();

    const own = panels[ownKey as string];
    const cmp = panels[cmpKey as string];
    // 我司：成本面积（unitCost 数值）+ 销毛迷你卡数据，长度与销量/点序列一致
    const costs = own.costs as (number | null)[];
    const margins = own.margins as ({ marginRate: number } | null)[];
    expect(Array.isArray(costs)).toBe(true);
    expect(costs.some((v) => v != null && Number.isFinite(v) && v > 0)).toBe(true);
    expect(Array.isArray(margins)).toBe(true);
    expect(margins.some((m) => m != null && m.marginRate > 0 && m.marginRate < 1)).toBe(true);
    expect(costs).toHaveLength((own.volumes as unknown[]).length);
    // 竞品：无成本、无销毛（口径 = 我司产品）
    expect(cmp.costs).toBeUndefined();
    expect(cmp.margins).toBeUndefined();
    // 图层标注随成本出现：价格行写「价格 / 成本」（Chart 内部渲染，这里钉数据入参）
    expect(own.costs).toBeDefined();
  });

  it('销毛成本关（默认）：我司面板也不传 costs / margins', () => {
    harness.mains = [OWN_CARD];
    render(<App />);
    const panel = harness.chartProps[harness.chartProps.length - 1];
    expect(panel.costs).toBeUndefined();
    expect(panel.margins).toBeUndefined();
  });
});
