// ============================================================
// 量价页 · 稳定版图层标题 head 版式接线（2026-11-07 稳定版三轮，Eason「标题还是不好」）：
// vi.mock 把 appChannel 钉在 stable（vitest 本体 = dev 形态 = iterate，演进版断言见
// volumeChartSkeleton）。面板 Chart 收 paneLabelLayout='head'，gridTop = 刻度顶带 16 +
// 标题行 PANE_HEAD_H 20——价格标题独占图顶一行、不再与 Y 刻度字同行。
// 组装模式照 volumeChartSkeleton（mock buildSeries / FiltersContext / Chart）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { MainProduct } from '../../../state/filtersTypes';

const harness = vi.hoisted(() => ({
  mains: [] as unknown[],
  chartProps: [] as Record<string, unknown>[],
  noop: vi.fn(),
}));

vi.mock('../../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
}));

vi.mock('../../../dataModel/aggregate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../dataModel/aggregate')>();
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

const OWN_CARD = { id: 'card-a', main: { modelId: 'own-huawei-mate-80-pro', romram: '16+512 GB', skuIds: [], platform: null }, compares: [], auto: false };

beforeEach(() => {
  window.history.replaceState(null, '', '/?p=volume');
  sessionStorage.clear();
  harness.chartProps = [];
  harness.mains = [];
});
afterEach(cleanup);

describe('量价页 · 稳定版图层标题 head 版式', () => {
  it('面板 Chart：paneLabelLayout = head，gridTop 计入标题行（16 + 20）', () => {
    harness.mains = [OWN_CARD];
    render(<App />);
    const panels = harness.chartProps.filter((p) => p.paneLabels === true);
    const panel = panels[panels.length - 1];
    expect(panel).toBeTruthy();
    expect(panel?.paneLabelLayout).toBe('head');
    expect(panel?.gridTop).toBe(36);
  });
});
