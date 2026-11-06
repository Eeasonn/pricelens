// ============================================================
// t428u Round 5 R5-M1 · 稳定版（生产构建）Agent 查询平台口径镜像。
// 稳定版价格走势看板取数每组 platform = 全局平台（PriceTrend 第196轮整改3：
// STABLE ? platformLevelForChannel(state.platform) : 每线覆写）。Agent 的
// 趋势/平台查询此前忽略全局平台（每组 platform=null → 全渠道自动），导致
// 「全局选 OZON 时卡按全渠道算、回看落地却是 OZON」的第二类口径分叉。
// 本文件 vi.mock appChannel 钉在 stable（与 PriceTrend stableGlobalPlatform
// 测试同手法），锁定：seriesQueryOf 在 stable 下每组 platform = 全局平台
//（店铺级降平台级），iterate 行为见 agentux-r5-platform-scope.test.ts。
// R6-M1 修订：稳定版店铺级全局选择（RU:ozon:3P）此前「计算按平台级、补丁却
// 原样保留 shopIds」——第六轮评审以 RU nova14 12+256 黑 W202619 真实数据
// 复现（平台级 333 vs 严格 3P 395）。现在 stable 归一 = normalizePlatformScope
//（国家合法 + 店铺级透明展开平台级）：补丁/落地不再携带 shopIds，卡边界必须
// 透明说明「稳定版仅支持平台级 + 店铺展开为平台」。详细数值证人见
// agentux-r6-stable-platform-normalization.test.ts。
// ============================================================
import { describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, ProductSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { buildAgentContext, runAgent } from '../core';
import type { AgentCardAction, ChartResultCard, TableResultCard } from '../contracts';

vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
}));

const NOVA: ProductSelection = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black'] };

function openActionOf(card: { actions?: AgentCardAction[] }, idOrLabel: string): AgentCardAction {
  const open = card.actions?.find((action) => (action.id === idOrLabel || action.label === idOrLabel) && action.kind === 'open');
  expect(open).toBeTruthy();
  return open!;
}

describe('t428u R5-M1 · stable：Agent 趋势查询服从全局平台（与看板同口径）', () => {
  it('RU 全局选 OZON：摘要表取价口径列 = OZON（不再按全渠道自动算），补丁保留 OZON', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: { platforms: ['OZON'], shopIds: [], seller: null },
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const response = await runAgent('RU价格趋势', buildAgentContext('dashboard', state, []));
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(table).toBeDefined();
    const novaRow = table.rows.find((row) => row[0].includes('nova 14 Pro'));
    expect(novaRow).toBeDefined();
    expect(novaRow![3]).toBe('OZON');
    const patch = openActionOf(table, '回看板下钻').target!.filterPatch!;
    expect(patch.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
  });

  it('店铺级全局选择（RU:ozon:3P）透明展开为平台级：取数/补丁/说明一致，补丁不再保留 shopIds', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: { platforms: [], shopIds: ['RU:ozon:3P'], seller: null },
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const response = await runAgent('RU价格趋势', buildAgentContext('dashboard', state, []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    expect(chart).toBeDefined();
    // 原始输入是店铺级：图注判断边界必须透明说明「稳定版仅支持平台级 + 店铺展开」
    expect(chart.note).toContain('稳定版仅支持平台级');
    expect(chart.note).toContain('OZON 3P');
    expect(chart.note).toContain('OZON');
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    const novaRow = table.rows.find((row) => row[0].includes('nova 14 Pro'));
    expect(novaRow).toBeDefined();
    expect(novaRow![3]).toBe('OZON');
    const patch = openActionOf(table, '回看板下钻').target!.filterPatch!;
    // R6-M1：实际计算按平台级，补丁不得再声称保留店铺口径（shopIds 必须移除）
    expect(patch.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    const chartPatch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    expect(chartPatch.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
  });

  it('AE NOON 跨国问 RU：归一 null → 全渠道自动（DNS 有价事实），补丁 null', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'AE',
      platform: { platforms: ['NOON'], shopIds: [], seller: null },
      mains: buildCards([NOVA]),
    };
    const response = await runAgent('RU价格趋势', buildAgentContext('dashboard', state, []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    expect(chart).toBeDefined();
    expect(chart.note).toContain('NOON');
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    const novaRow = table.rows.find((row) => row[0].includes('nova 14 Pro'));
    expect(novaRow).toBeDefined();
    expect(novaRow![1]).not.toBe('—');
    // 自动态口径徽标 = 最新有价周实际平台（RU nova 数据事实为 DNS），不是 OZON
    expect(novaRow![3]).toBe('DNS');
    const patch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    expect(patch.platform).toBeNull();
    expect(patch.countryCode).toBe('RU');
  });
});
