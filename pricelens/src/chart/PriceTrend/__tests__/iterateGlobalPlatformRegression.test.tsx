// ============================================================
// 第196轮复检整改3 iterate 回归（Eason：iterate 版行为完全不动）：
// 本文件不 mock appChannel（vitest = dev 形态 = iterate，appChannel.test.ts 锁定
// STABLE=false 基线）——
// ①每线渠道选择 chip / 店铺同步按钮 / 渠道小药丸照常渲染；
// ②「多平台对比」入口照常渲染；
// ③取数仍按每线 sel.platform（全局 state.platform 不覆写价格页）；
// ④URL shop=/seller= 照常吃进 state.platform；platformLevelForChannel 原样透传。
// 稳定版行为见 stableGlobalPlatform.test.tsx（vi.mock 钉 stable）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PriceTrend from '../index';
import { platformLevelForChannel, platformUrlParamsOf, readUrlOverrides } from '../../../state/urlSync';
import { STABLE } from '../../../appChannel';
import type { MainProduct, PlatformSelection } from '../../../state/filtersTypes';

// ---- 受控桩（hoisted：mock 工厂与用例共享；同 stableGlobalPlatform 骨架） ----
const harness = vi.hoisted(() => ({
  mains: [] as unknown[],
  platform: null as unknown,
  queries: [] as { groups: { modelId: string; platform: unknown }[] }[],
  set: vi.fn(),
  noop: vi.fn(),
}));

vi.mock('../../../dataModel/aggregate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../dataModel/aggregate')>();
  const stubBuildSeries = (q: { groups: { modelId: string; platform: unknown }[] }) => {
    harness.queries.push(q);
    return q.groups.map((g, i) => ({
      key: `${g.modelId}__12GB+256GB`,
      isOwn: i === 0,
      brand: 'X',
      label: `${g.modelId} 12GB+256GB`,
      skuIds: ['sku'],
      color: '#4C6EF5',
      points: [{
        bucketId: '202642',
        xLabel: '12-31',
        anchorDate: '2026-12-30',
        rrp: 1000,
        price: 900,
        missing: false,
        offer: null,
        url: '',
        shopName: null,
      }],
      platform: g.platform as never,
      channelBadge: { label: 'OZON', auto: true, platforms: ['OZON'] },
    }));
  };
  return { ...actual, buildSeries: stubBuildSeries };
});

vi.mock('../../../state/FiltersContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../state/FiltersContext')>();
  const actions = {
    set: harness.set,
    reset: harness.noop,
    setMains: harness.noop,
    setCardCompares: harness.noop,
    autoMatchCard: harness.noop,
    autoMatchAll: harness.noop,
    setSelectionPlatform: harness.noop,
    setGranularity: harness.noop,
    toggleAlertSub: harness.noop,
    setAlertSubs: harness.noop,
    setAlertTypes: harness.noop,
    setAlertThresholds: harness.noop,
    setAlertProductRule: harness.noop,
  } as unknown as import('../../../state/filtersTypes').FiltersActions;
  return {
    ...actual,
    useFilters: () => ({
      state: { ...actual.defaultFilters, mains: harness.mains as MainProduct[], platform: harness.platform as never },
      actions,
    }),
  };
});

vi.mock('../Chart', () => ({ default: () => null }));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

const cardOf = (): MainProduct => ({
  id: 'card-iterate-platform',
  main: { modelId: 'HUA-Main', romram: '12GB+256GB', skuIds: ['sku-main'], platform: null },
  compares: [{ modelId: 'COMP-A', romram: '12GB+256GB', skuIds: ['sku-a'], platform: null }],
});

const OZON_SHOP: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'] };
const DNS_PLATFORM: PlatformSelection = { platforms: ['DNS'], shopIds: [] };

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  harness.mains = [cardOf()];
  harness.platform = null;
  harness.queries = [];
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('iterate 回归：每线平台/店铺 UI 与入口现状不动', () => {
  it('基线锁定：本文件运行于 iterate（STABLE=false）', () => {
    expect(STABLE).toBe(false);
  });

  it('渠道选择 chip 照常渲染（药丸上方平台小药丸可点开弹层）', () => {
    render(<PriceTrend />);
    expect(screen.getAllByLabelText(/点击筛选平台-店铺/).length).toBeGreaterThanOrEqual(1); // 主品 + 对比各一颗
  });

  it('店铺同步按钮照常渲染', () => {
    render(<PriceTrend />);
    expect(screen.getByRole('button', { name: /^店铺同步$/ })).toBeTruthy();
  });

  it('每线渠道小药丸（平台名 badge）照常渲染', () => {
    render(<PriceTrend />);
    expect(screen.getAllByText('OZON').length).toBeGreaterThanOrEqual(1); // 主品 + 对比各一枚渠道小药丸
  });

  it('「多平台对比」入口照常渲染', () => {
    render(<PriceTrend />);
    expect(screen.getByText('多平台对比 →')).toBeTruthy();
  });
});

describe('iterate 回归：取数仍按每线 sel.platform（全局不覆写价格页）', () => {
  it('groups.platform = 每线选择（全局 platform 与每线不同时以每线为准）', () => {
    const card = cardOf();
    card.main = { ...card.main!, platform: OZON_SHOP };
    card.compares = [{ ...card.compares[0]!, platform: OZON_SHOP }];
    harness.mains = [card];
    harness.platform = DNS_PLATFORM; // 全局（量价页口径），价格页不消费
    render(<PriceTrend />);
    expect(harness.queries.length).toBeGreaterThan(0);
    for (const q of harness.queries) {
      for (const g of q.groups) {
        expect(g.platform).toEqual(OZON_SHOP);
      }
    }
  });

  it('每线未选（null）= 自动口径，不受全局 platform 影响', () => {
    render(<PriceTrend />); // mains 默认全部 platform: null，全局 = null
    const last = harness.queries[harness.queries.length - 1];
    expect(last.groups.every((g) => g.platform === null)).toBe(true);
  });
});

describe('iterate 回归：URL shop=/seller= 照常、platformLevelForChannel 透传', () => {
  it('readUrlOverrides 照常吃 shop=/seller=（店铺级单选）', () => {
    window.history.replaceState(null, '', '/?shop=RU:ozon:3P&seller=X&c=RU');
    expect(readUrlOverrides().filters.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:3P'], seller: 'X' });
  });

  it('platformLevelForChannel 原样透传（店铺级不降级）', () => {
    expect(platformLevelForChannel(OZON_SHOP)).toBe(OZON_SHOP);
    expect(platformLevelForChannel(DNS_PLATFORM)).toBe(DNS_PLATFORM);
    expect(platformLevelForChannel(null)).toBeNull();
  });

  it('写侧照常产出 shop=/seller=（店铺级选择入链语义不变）', () => {
    expect(platformUrlParamsOf(OZON_SHOP)).toEqual({ plat: 'OZON', shop: 'RU:ozon:3P', seller: null });
  });
});
