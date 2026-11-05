// ============================================================
// 量带归属接线（2026-11-05 复检五件套）：index → Chart 的 volumeOwner / margins。
// Chart 用桩捕获 props（ECharts 在 jsdom 无 canvas，渲染行为由 volumeLayer 覆盖）——
// ①合并图 = 第一张卡主品；②分图 = 每面板各自主品；③主品是竞品时不出销毛（口径 = 我司产品），
// 量带归属仍如实显示其名（药丸说的就是这条量是谁的）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import PriceTrend from '../index';
import type { MainProduct } from '../../../state/filtersTypes';

const harness = vi.hoisted(() => ({
  mains: [] as unknown[],
  ownModels: new Set<string>(),
  chartProps: [] as Record<string, unknown>[],
  noop: vi.fn(),
}));

vi.mock('../../../dataModel/aggregate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../dataModel/aggregate')>();
  const stubBuildSeries = (q: { groups: { modelId: string; romram: string; platform?: unknown }[] }) =>
    q.groups.map((g) => {
      const own = harness.ownModels.has(g.modelId);
      return {
        key: `${g.modelId}__${g.romram.replace(/\s+/g, '')}`,
        isOwn: own,
        brand: own ? 'HUAWEI' : 'APPLE',
        label: `${own ? 'HUAWEI' : 'APPLE'} ${g.modelId} ${g.romram}`,
        skuIds: ['sku'],
        color: own ? '#c7000b' : '#1d1d1f',
        points: [{ bucketId: '202642', xLabel: '10-14', anchorDate: '2026-10-14', rrp: 1000, price: 900, missing: false, offer: null, url: '', shopName: null }],
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
    useFilters: () => ({ state: { ...actual.defaultFilters, mains: harness.mains as MainProduct[] }, actions }),
  };
});

vi.mock('../Chart', () => ({
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

const card = (id: string, modelId: string): MainProduct => ({
  id,
  main: { modelId, romram: '12GB+256GB', skuIds: ['sku'], platform: null },
  compares: [{ modelId: `${modelId}-CMP`, romram: '12GB+256GB', skuIds: ['sku'], platform: null }],
});

/** 每张图最新一轮 props（按 volumeOwner.key 归并） */
const latestByOwner = (): Map<string, Record<string, unknown>> => {
  const out = new Map<string, Record<string, unknown>>();
  for (const p of harness.chartProps) out.set((p.volumeOwner as { key: string } | null)?.key ?? '', p);
  return out;
};

beforeEach(() => {
  sessionStorage.clear();
  harness.chartProps = [];
  harness.ownModels = new Set(['HUA-A', 'HUA-B']);
});
afterEach(cleanup);

describe('量带归属接线', () => {
  it('合并图（单卡）：归属 = 主品（品牌 / 去品牌名），我司主品带销毛', () => {
    harness.mains = [card('c1', 'HUA-A')];
    render(<PriceTrend />);
    const last = harness.chartProps[harness.chartProps.length - 1];
    expect(last.volumeOwner).toEqual({ key: 'HUA-A__12GB+256GB', brand: 'HUAWEI', text: 'HUA-A 12GB+256' });
    expect(last.margins).toBeTruthy();
  });

  it('分图（两卡）：每面板各自主品，归属与本面板系列对得上', () => {
    harness.mains = [card('c1', 'HUA-A'), card('c2', 'HUA-B')];
    render(<PriceTrend />);
    const owners = latestByOwner();
    expect(owners.has('HUA-A__12GB+256GB')).toBe(true);
    expect(owners.has('HUA-B__12GB+256GB')).toBe(true);
    const keysOfB = (owners.get('HUA-B__12GB+256GB')!.series as { key: string }[]).map((s) => s.key);
    expect(keysOfB).toContain('HUA-B__12GB+256GB');
    expect(keysOfB).not.toContain('HUA-A__12GB+256GB');
  });

  it('主品是竞品：销毛卡不出（合并 / 分图都门控），量带归属如实显示其名', () => {
    harness.ownModels = new Set();
    harness.mains = [card('c1', 'IPHONE')];
    render(<PriceTrend />);
    const merged = harness.chartProps[harness.chartProps.length - 1];
    expect(merged.margins).toBeUndefined();
    expect((merged.volumeOwner as { brand: string }).brand).toBe('APPLE');
    cleanup();
    harness.chartProps = [];
    harness.mains = [card('c1', 'IPHONE'), card('c2', 'GALAXY')];
    render(<PriceTrend />);
    const panels = [...latestByOwner().values()];
    expect(panels.length).toBeGreaterThanOrEqual(2);
    for (const p of panels) expect(p.margins).toBeUndefined();
  });
});
