// ============================================================
// 第196轮复检整改3（2026-11-05，Eason）：稳定版价格走势页全局平台化。
// vi.mock 把 appChannel 钉在 stable（vitest 本体 = dev 形态 = iterate）——
// ①每线渠道选择 chip（取价平台小药丸弹层）不渲染；
// ②店铺同步按钮不渲染；每线渠道小药丸（平台名）不渲染；
// ③「多平台对比」入口不渲染（PlatformCompareView 代码保留，本测试不涉）；
// ④价格页全部 series group 的 platform = 全局 state.platform（店铺级降级为
//   平台级），每线 sel.platform 覆写失效——改全局平台 → 取数口径真实变化；
// ⑤URL：shop=/seller= 在 stable 忽略（readUrlOverrides 不再吃进 state.platform），
//   plat= 继续驱动；platformLevelForChannel 把店铺级降级为平台级
//   （platformUrlParamsOf 产出的 shop=/seller= 为空 → 写侧剥键）。
// iterate 回归另见 iterateGlobalPlatformRegression.test.tsx（无 mock，锁现状）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { MainProduct, PlatformSelection } from '../../../state/filtersTypes';
import PriceTrend from '../index';

vi.mock('../../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
}));

// ---- 受控桩（hoisted：mock 工厂与用例共享） ----
const harness = vi.hoisted(() => ({
  mains: [] as unknown[],
  /** 全局平台（state.platform）；null = 默认电渠 */
  platform: null as unknown,
  queries: [] as { groups: { modelId: string; platform: unknown }[] }[],
  /** Chart 桩捕获的 props（图层标题 head 版式接线断言用） */
  chartProps: [] as Record<string, unknown>[],
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

// 图主体桩（ECharts 在 jsdom 无 canvas）：本测试只关心平台化接线与图例带 DOM；
// 捕获 props 供图层标题 head 版式接线断言
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
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

const cardOf = (): MainProduct => ({
  id: 'card-stable-platform',
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
  harness.chartProps = [];
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('稳定版价格页：每线渠道/店铺 UI 不渲染', () => {
  it('渠道选择 chip（取价平台小药丸）不存在', () => {
    render(<PriceTrend />);
    expect(screen.queryByLabelText(/点击筛选平台-店铺/)).toBeNull();
  });

  it('店铺同步按钮不存在（iterate 版有，见回归测试）', async () => {
    render(<PriceTrend />);
    expect(screen.queryByRole('button', { name: /^(取消)?店铺同步$/ })).toBeNull();
  });

  it('「多平台对比」入口不存在（PlatformCompareView 代码保留）', async () => {
    render(<PriceTrend />);
    expect(screen.queryByText('多平台对比 →')).toBeNull();
  });

  it('每线渠道小药丸（平台名 badge）不渲染——药丸上不再挂平台/店铺概念', async () => {
    render(<PriceTrend />);
    expect(screen.queryByText('OZON')).toBeNull();
  });
});

describe('稳定版价格页：顶排药丸带整体移除（2026-11-07 Eason 采纳 A）', () => {
  it('顶部产品药丸带不渲染（品牌由名称带悬停展开 + 悬停卡前缀承接）', () => {
    render(<PriceTrend />);
    // 药丸带唯一交互痕迹 = 「点击隐藏该产品」药丸按钮；iterate 版必有
    expect(screen.queryByTitle('点击隐藏该产品')).toBeNull();
  });

});

// 2026-11-07 稳定版三轮（Eason「标题还是不好」）：图层标题 head 版式——价格标题独占图顶行，
// gridTop = 刻度顶带 16 + 标题行 PANE_HEAD_H 20；分离共享轴列与面板头行同源（此前面板头
// 收到 30 而轴列仍按 54 垫，刻度整列低 24px）
describe('稳定版价格页：图层标题 head 版式接线', () => {
  it('合并图：paneLabelLayout = head，gridTop 计入标题行（16 + 20）', () => {
    render(<PriceTrend />);
    const last = harness.chartProps[harness.chartProps.length - 1];
    expect(last.paneLabels).toBe(true);
    expect(last.paneLabelLayout).toBe('head');
    expect(last.gridTop).toBe(36);
  });

  it('分图：面板同版式；共享轴列 paddingTop = 滚动区 10 + 拖柄 14 + 面板头行 10（与面板头行同源）', () => {
    const second: MainProduct = {
      id: 'card-stable-second',
      main: { modelId: 'HUA-Second', romram: '12GB+256GB', skuIds: ['sku-second'], platform: null },
      compares: [],
    };
    harness.mains = [cardOf(), second];
    const { container } = render(<PriceTrend />);
    const panels = harness.chartProps.filter((p) => p.axisChrome === false);
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) {
      expect(p.paneLabelLayout).toBe('head');
      expect(p.gridTop).toBe(36);
    }
    const divs = Array.from(container.querySelectorAll('div')) as HTMLDivElement[];
    // 共享轴列容器（flex 定宽列）：paddingTop 34 = 10 + 14 + 10
    const axisCol = divs.find((d) => d.style.flex.startsWith('0 0 ') && d.style.paddingTop !== '');
    expect(axisCol?.style.paddingTop).toBe('34px');
    // 面板头行（拖柄下、图上）：稳定版 10px，每面板一条
    const headRows = divs.filter((d) => d.style.height === '10px' && d.style.padding === '0px 4px 2px');
    expect(headRows.length).toBe(2);
  });
});

describe('稳定版价格页：取数口径 = 全局平台（每线覆写失效）', () => {
  it('全部 series group 的 platform = 全局平台（店铺级降级为平台级）；每线覆写不生效', async () => {
    // 每线选择钉在 OZON 具体店铺（旧模型残留），全局 = DNS 平台级
    const card = cardOf();
    card.main = { ...card.main!, platform: OZON_SHOP };
    card.compares = [{ ...card.compares[0]!, platform: OZON_SHOP }];
    harness.mains = [card];
    harness.platform = DNS_PLATFORM;
    render(<PriceTrend />);

    expect(harness.queries.length).toBeGreaterThan(0);
    for (const q of harness.queries) {
      for (const g of q.groups) {
        // 覆写失效：既不是每线的 OZON 店铺，也绝不是店铺级形态
        expect(g.platform).toEqual(DNS_PLATFORM);
        expect((g.platform as PlatformSelection).shopIds).toEqual([]);
      }
    }
  });

  it('改全局平台 → 取数口径真实变化（groups.platform 跟随新平台）', async () => {
    harness.platform = { platforms: ['OZON'], shopIds: [] };
    render(<PriceTrend />);
    const before = harness.queries[harness.queries.length - 1];
    expect(before.groups.every((g) => (g.platform as PlatformSelection)?.platforms[0] === 'OZON')).toBe(true);

    cleanup();
    harness.queries = [];
    harness.platform = DNS_PLATFORM;
    render(<PriceTrend />);
    const after = harness.queries[harness.queries.length - 1];
    expect(after.groups.every((g) => (g.platform as PlatformSelection)?.platforms[0] === 'DNS')).toBe(true);
  });

  it('全局平台为默认（null）→ stable 每线覆写同样失效（恒 default 口径，不回落每线）', async () => {
    const card = cardOf();
    card.main = { ...card.main!, platform: OZON_SHOP };
    harness.mains = [card];
    harness.platform = null; // 默认电渠
    render(<PriceTrend />);
    const last = harness.queries[harness.queries.length - 1];
    expect(last.groups.every((g) => g.platform === null)).toBe(true);
  });
});

describe('稳定版 URL：shop=/seller= 忽略并剥离，plat= 继续驱动', () => {
  it('readUrlOverrides 忽略 shop=/seller=（不再吃进 state.platform）', async () => {
    const { readUrlOverrides } = await import('../../../state/urlSync');
    window.history.replaceState(null, '', '/?shop=RU:ozon:3P&seller=X&c=RU');
    expect(readUrlOverrides().filters.platform).toBeUndefined();
  });

  it('plat= 平台级继续驱动 state.platform', async () => {
    const { readUrlOverrides } = await import('../../../state/urlSync');
    window.history.replaceState(null, '', '/?plat=DNS');
    expect(readUrlOverrides().filters.platform).toEqual(DNS_PLATFORM);
  });

  it('platformLevelForChannel：店铺级降级为平台级（渠道反查平台）', async () => {
    const { platformLevelForChannel } = await import('../../../state/urlSync');
    expect(platformLevelForChannel(OZON_SHOP)).toEqual({ platforms: ['OZON'], shopIds: [] });
    expect(platformLevelForChannel(DNS_PLATFORM)).toEqual(DNS_PLATFORM);
    expect(platformLevelForChannel(null)).toBeNull();
  });

  it('写侧：店铺级经降级后只产 plat=（shop=/seller= 为空 → 写 null 剥键）', async () => {
    const { platformUrlParamsOf, platformLevelForChannel } = await import('../../../state/urlSync');
    const out = platformUrlParamsOf(platformLevelForChannel(OZON_SHOP));
    expect(out).toEqual({ plat: 'OZON', shop: null, seller: null });
  });
});
