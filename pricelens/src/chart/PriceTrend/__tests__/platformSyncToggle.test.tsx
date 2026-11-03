// ============================================================
// 店铺同步开关接线测试（本轮重定口径，Eason：同步只让对比品跟随主品，主品
// 自身永不改写）：渲染真实 PriceTrend（价格页），buildSeries 与 useFilters 用
// 受控桩——
// ① 开启：主品口径不变（main 对象与 platform 引用原样进 setMains，未被写入），
//    对比品 platform 已写（主品显式 = 透传；主品自动 = 按最新有价周 badge 钉平台）；
// ② 解析不出（主品无数据，badge 占位）：不写任何选择项、不开启同步态，轻提示；
// ③ 刷新态恢复：开关与快照落 LPL3.view.price.platformSync（usePageViewState
//    会话存储），重挂载按钮仍按下，取消整组还原到真原始（含主品）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { message } from 'antd';
import type { MockInstance } from 'vitest';
import PriceTrend from '../index';
import { VIEW_STATE_PREFIX } from '../../../state/usePageViewState';
import type { FiltersActions, MainProduct, PlatformSelection } from '../../../state/filtersTypes';

// ---- 受控桩（hoisted：mock 工厂与用例共享） ----
const harness = vi.hoisted(() => ({
  mains: [] as unknown[],
  /** 主品系列 badge（单卡桩首组 = 主品）；null = 主品无数据（占位「自动」） */
  badge: null as { label: string; auto: boolean; platforms: string[] } | null,
  set: vi.fn(),
  setMains: vi.fn(),
  setSelectionPlatform: vi.fn(),
  toggleAlertSub: vi.fn(),
  noop: vi.fn(),
}));

const SYNC_STORE_KEY = `${VIEW_STATE_PREFIX}price.platformSync`;
const dns: PlatformSelection = { platforms: ['DNS'], shopIds: ['RU:DNS:STORE'] };

// buildSeries 桩：每组一条单点序列；badge 受用例控制
vi.mock('../../../dataModel/aggregate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../dataModel/aggregate')>();
  const { dimTime } = await import('../../../data');
  const stubBuildSeries = (q: {
    groups: { modelId: string; romram: string; skuIds: string[]; isOwn: boolean; platform?: unknown }[];
  }) => {
    const wk = dimTime[dimTime.length - 1];
    const point = {
      bucketId: wk.week_id,
      xLabel: '12-31',
      anchorDate: '2026-12-30',
      rrp: 1000,
      price: 900,
      missing: false,
      offer: null,
      url: '',
      shopName: null,
    };
    return q.groups.map((g, i) => ({
      key: `${g.modelId}__${g.romram.replace(/\s+/g, '')}`,
      isOwn: g.isOwn,
      brand: 'X',
      label: `${g.modelId} ${g.romram}`,
      skuIds: g.skuIds,
      color: '#4C6EF5',
      points: [point],
      platform: (g.platform ?? null) as typeof g.platform,
      channelBadge: i === 0 ? harness.badge : { label: 'OZON', auto: true, platforms: ['OZON'] },
    }));
  };
  return { ...actual, buildSeries: stubBuildSeries };
});

// useFilters 桩：静态 state（mains = harness.mains），动作全部记录
vi.mock('../../../state/FiltersContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../state/FiltersContext')>();
  const actions = {
    set: harness.set,
    setMains: harness.setMains,
    setSelectionPlatform: harness.setSelectionPlatform,
    toggleAlertSub: harness.toggleAlertSub,
    reset: harness.noop,
    setCardCompares: harness.noop,
    autoMatchCard: harness.noop,
    autoMatchAll: harness.noop,
    setGranularity: harness.noop,
    setAlertSubs: harness.noop,
    setAlertTypes: harness.noop,
    setAlertThresholds: harness.noop,
    setAlertProductRule: harness.noop,
  } as unknown as FiltersActions;
  return {
    ...actual,
    useFilters: () => ({
      state: { ...actual.defaultFilters, mains: harness.mains as MainProduct[] },
      actions,
    }),
  };
});

// 图主体桩（ECharts 在 jsdom 无 canvas）：本测试只关心同步接线，不画图
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
  id: 'card-sync-test',
  main: { modelId: 'HUA-Main', romram: '12GB+256GB', skuIds: ['sku-main'], platform: null },
  compares: [
    { modelId: 'COMP-A', romram: '12GB+256GB', skuIds: ['sku-a'], platform: dns },
    { modelId: 'COMP-B', romram: '8GB+128GB', skuIds: ['sku-b'], platform: null },
  ],
});

// 按钮可及名随态切换：未同步 = 「店铺同步」、已同步 = 「取消店铺同步」
const syncButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /^(取消)?店铺同步$/ }) as HTMLButtonElement;
const store = (): Record<string, { on: boolean; snap: { cardId: string; entries: { key: string; platform: PlatformSelection | null }[] }[] | null }> => {
  const raw = sessionStorage.getItem(SYNC_STORE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, never>) : {};
};

describe('价格页 店铺同步接线（togglePlatformSyncOf × syncComparesWithMain）', () => {
  let infoSpy: MockInstance<typeof message.info>;

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    infoSpy = vi.spyOn(message, 'info').mockImplementation((() => undefined) as never);
    harness.mains = [cardOf()];
    harness.badge = null;
  });

  afterEach(cleanup);

  it('开启：主品显式选择原样写给对比品；主品对象与 platform 引用不变；开关态落会话存储', () => {
    const original = cardOf();
    original.main = { ...original.main!, platform: dns };
    harness.mains = [original];
    render(<PriceTrend />);

    expect(syncButton().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(syncButton());

    expect(harness.setMains).toHaveBeenCalledTimes(1);
    const out = harness.setMains.mock.calls[0][0] as MainProduct[];
    expect(out[0].main).toBe(original.main); // 主品对象原样（口径未被写入）
    expect(out[0].compares[0].platform).toBe(dns); // 同一引用透传
    expect(out[0].compares[1].platform).toBe(dns);
    expect(out[0].compares[0].modelId).toBe('COMP-A');
    // 开关态 + 快照持久
    const stored = store();
    expect(stored['card-sync-test']?.on).toBe(true);
    expect(stored['card-sync-test']?.snap?.[0]?.entries[0]).toEqual({ key: 'HUA-Main|12GB+256GB', platform: dns });
    expect(syncButton().getAttribute('aria-pressed')).toBe('true');
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('开启：主品自动 = 按最新有价周 badge 钉平台写给对比品；主品保持自动口径', () => {
    harness.badge = { label: 'Mvideo', auto: true, platforms: ['Mvideo'] };
    render(<PriceTrend />);
    fireEvent.click(syncButton());

    const out = harness.setMains.mock.calls[0][0] as MainProduct[];
    expect(out[0].main).toBe((harness.mains[0] as MainProduct).main); // 主品引用原样
    expect(out[0].main!.platform).toBeNull(); // 自动口径未被改写
    expect(out[0].compares[0].platform).toEqual({ platforms: ['Mvideo'], shopIds: [] });
    expect(out[0].compares[1].platform).toEqual({ platforms: ['Mvideo'], shopIds: [] });
    expect(store()['card-sync-test']?.on).toBe(true);
  });

  it('解析不出（主品无数据）：不写任何选择项、不开启同步态、轻提示一句', () => {
    render(<PriceTrend />);
    expect((harness.mains[0] as MainProduct).main!.platform).toBeNull(); // 主品自动、无 badge

    fireEvent.click(syncButton());

    expect(harness.setMains).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(store()['card-sync-test']?.on).toBeUndefined(); // 未开启
    expect(syncButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('刷新恢复：重挂载按钮仍按下（会话态读回）；取消整组还原真原始（含主品）', () => {
    harness.badge = { label: 'Mvideo', auto: true, platforms: ['Mvideo'] };
    render(<PriceTrend />);
    fireEvent.click(syncButton()); // 开启（写入钉定平台 + 快照落会话存储）

    // 「刷新」：卸载重挂，数据 = LPL3.filters 里已钉定的 mains（开启时 setMains 的产物）
    const syncedCard = (harness.setMains.mock.calls[0][0] as MainProduct[])[0];
    harness.mains = [syncedCard];
    cleanup();
    render(<PriceTrend />);

    expect(syncButton().getAttribute('aria-pressed')).toBe('true'); // 刷新后按钮态与数据一致

    fireEvent.click(syncButton()); // 取消
    const back = harness.setMains.mock.calls[1][0] as MainProduct[];
    expect(back[0].main!.platform).toBeNull(); // 主品自动（同步从未写过，取消也不动它）
    expect(back[0].compares[0].platform).toEqual(dns); // 回到真原始
    expect(back[0].compares[1].platform).toBeNull();
    expect(store()['card-sync-test']).toEqual({ on: false, snap: null });
    expect(syncButton().getAttribute('aria-pressed')).toBe('false');
  });
});
