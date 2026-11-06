// ============================================================
// t428u Round 4（四轮返修）M1/M2 · 跨国查询口径与回看 filterPatch。
// 复现（评审真实浏览器报告）：
//  - M1：queryCards 的图表/摘要卡 open 动作不带实际计算口径——AE nova 14 页问
//    「RU价格趋势」，卡按 RU nova 14 计算，点「回看板定位」却停留在 AE 口径。
//  - M2：跨国不带产品名时用 romram 精确过滤，RU Mate X6 12+512 在 ID 无该配置
//    被整条丢弃 → 错误回落 ID 默认 Mate 80 Pro；正确行为是共用 mainSelection
//    同型号合法映射（→ Mate X6 16+512），型号确实缺席才回落并在卡边界说明。
// 契约：所有跨口径结果卡的 open 动作携带完整计算口径 filterPatch（国家、
// mains、平台、粒度、范围、币种、价格类型、agg），点击精确落回计算口径。
// ============================================================
import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, ProductSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { dimTime } from '../../data';
import { buildAgentContext, runAgent } from '../core';
import type { AgentCardAction, ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../contracts';

const NOVA_AE: ProductSelection = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black'] };
const MATE_X6_RU: ProductSelection = { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['own-huawei-mate-x6__12-512gb__black'] };

/** AE 页 + nova 14 Pro 12+512（复制 ?c=AE&main=own-huawei-nova-14-pro__12%2B512GB 的真实初始化态） */
function aeNovaState(): FiltersState {
  return { ...defaultFilters, countryCode: 'AE', mains: buildCards([NOVA_AE]) };
}

/** RU 页 + Mate X6 12+512（auto 匹配竞品开） */
function ruMateX6State(): FiltersState {
  return { ...defaultFilters, countryCode: 'RU', mains: buildCards([MATE_X6_RU], { auto: true, countryCode: 'RU' }) };
}

function openActionOf(card: { actions?: AgentCardAction[] }, label: string): AgentCardAction {
  const open = card.actions?.find((action) => action.label === label && action.kind === 'open');
  expect(open).toBeTruthy();
  expect(open!.target?.filterPatch).toBeTruthy();
  return open!;
}

describe('t428u R4 M1 · 跨国趋势卡 open 动作携带实际计算口径', () => {
  it('AE nova 14 页问「RU价格趋势」：图表卡「回看板定位」与摘要卡「回看板下钻」都带完整 RU filterPatch', async () => {
    const state = aeNovaState();
    const response = await runAgent('RU价格趋势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((item) => item.kind === 'chart');
    expect(chart?.kind).toBe('chart');
    if (chart?.kind !== 'chart') return;
    // 计算确实发生在 RU：系列含 nova 14 Pro 且有真实价格点
    expect(chart.series.some((series) => series.label.includes('nova 14 Pro'))).toBe(true);
    expect(chart.series.some((series) => series.values.some((point) => point.value != null))).toBe(true);
    const chartOpen = openActionOf(chart, '回看板定位');
    const patch = chartOpen.target!.filterPatch!;
    expect(patch.countryCode).toBe('RU');
    expect(patch.mains?.[0].main?.modelId).toBe('own-huawei-nova-14-pro');
    expect(patch.mains?.[0].main?.romram).toBe('12+512 GB');
    expect(patch.granularity).toBe(state.granularity);
    expect(patch.rangeStart).toBe(state.rangeStart);
    expect(patch.rangeEnd).toBe(state.rangeEnd);
    expect(patch.adaptive).toBe(false);
    expect(patch.platform).toBe(state.platform);
    expect(patch.currency).toBe(state.currency);
    expect(patch.industry).toBe(state.industry);
    expect(patch.agg).toBe(state.agg);
    expect(patch.priceTypes).toEqual(state.priceTypes);
    const table = response.cards.find((item) => item.kind === 'table');
    expect(table?.kind).toBe('table');
    if (table?.kind !== 'table') return;
    const tableOpen = openActionOf(table, '回看板下钻');
    expect(tableOpen.target?.filterPatch).toEqual(patch);
    // 摘要表的产品行确实是 RU nova 14 Pro 的真实价格（不是 AE 数据也不是 —）
    const novaRow = table.rows.find((row) => row[0].includes('nova 14 Pro'));
    expect(novaRow).toBeDefined();
    expect(novaRow?.[1]).not.toBe('—');
  });

  it('「最近 8 周」跨国趋势：filterPatch 与卡口径一致（周粒度 + 最近 8 周桶）', async () => {
    const state = aeNovaState();
    const response = await runAgent('RU 最近8周价格趋势', buildAgentContext('dashboard', state, []), undefined, 'query');
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard | undefined;
    expect(chart).toBeDefined();
    if (!chart) return;
    const buckets = dimTime.map((time) => time.week_id);
    const expected = `${buckets[buckets.length - 8]}–${buckets[buckets.length - 1]}`;
    expect(chart.note).toContain(expected);
    const patch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    expect(patch.countryCode).toBe('RU');
    expect(patch.granularity).toBe('week');
    expect(patch.rangeStart).toBe(buckets[buckets.length - 8]);
    expect(patch.rangeEnd).toBe(buckets[buckets.length - 1]);
    expect(patch.mains?.[0].main?.modelId).toBe('own-huawei-nova-14-pro');
  });
});

describe('t428u R4 M2 · 跨国价格优势先同型号合法映射，缺型号才回落并说明', () => {
  it('RU Mate X6 12+512 问「ID 价格优势」：计算与回看口径都是 Mate X6 16+512，绝不回落 Mate 80 Pro', async () => {
    const state = ruMateX6State();
    const response = await runAgent('ID 价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    expect(card.countryCode).toBe('ID');
    // 卡上 SKU 选项是我司 Mate X6 16+512（不是默认 Mate 80 Pro）
    expect(card.skuOptions.length).toBeGreaterThan(0);
    expect(card.skuOptions[0].modelId).toBe('own-huawei-mate-x6');
    expect(card.skuOptions[0].romram).toBe('16+512 GB');
    expect(card.skuOptions.some((option) => option.modelId === 'own-huawei-mate-80-pro')).toBe(false);
    // 对比行全部是我司 Mate X6 16+512（若有共同价格周）
    for (const row of card.rows) {
      expect(row.ownModelId).toBe('own-huawei-mate-x6');
      expect(row.ownRomram).toBe('16+512 GB');
    }
    // 配置映射在卡边界可见（透明说明，不静默换配置）
    expect(card.boundaries?.some((boundary) => boundary.includes('16+512 GB') || boundary.includes('映射'))).toBe(true);
    // 回看动作携带同一口径：ID + Mate X6 16+512 主卡
    const patch = openActionOf(card, '回看价格走势').target!.filterPatch!;
    expect(patch.countryCode).toBe('ID');
    expect(patch.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-mate-x6' && mainCard.main?.romram === '16+512 GB')).toBe(true);
    expect(patch.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-mate-80-pro')).toBe(false);
  });

  it('趋势口径一致：RU Mate X6 12+512 问「ID价格趋势」→ 系列与回看都是 Mate X6 16+512', async () => {
    const state = ruMateX6State();
    const response = await runAgent('ID价格趋势', buildAgentContext('dashboard', state, []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard | undefined;
    expect(chart).toBeDefined();
    if (!chart) return;
    expect(chart.series[0].label).toContain('Mate X6');
    expect(chart.series[0].label).toContain('16+512');
    const patch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    expect(patch.countryCode).toBe('ID');
    expect(patch.mains?.[0].main?.modelId).toBe('own-huawei-mate-x6');
    expect(patch.mains?.[0].main?.romram).toBe('16+512 GB');
  });

  it('型号确实缺席（DE 无 Mate X6）：回落 DE 有数据的我司产品并在卡边界说明原因', async () => {
    const state = ruMateX6State();
    const response = await runAgent('DE 价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    expect(card.countryCode).toBe('DE');
    // 回落 = DE 首个有数据我司产品 nova 14 Pro（数据事实），且边界两条都写清楚
    expect(card.skuOptions[0].modelId).toBe('own-huawei-nova-14-pro');
    expect(card.boundaries?.some((boundary) => boundary.includes('Mate X6') && boundary.includes('德国'))).toBe(true);
    expect(card.boundaries?.some((boundary) => boundary.includes('回落') && boundary.includes('nova 14 Pro'))).toBe(true);
  });

  it('同国价格优势（RU）不产生映射/回落说明，回看口径仍完整（回归）', async () => {
    const state = ruMateX6State();
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    expect(card.countryCode).toBe('RU');
    expect(card.boundaries?.every((boundary) => !boundary.includes('回落') && !boundary.includes('映射'))).toBe(true);
    const patch = openActionOf(card, '回看价格走势').target!.filterPatch!;
    expect(patch.countryCode).toBe('RU');
    expect(patch.currency).toBe(state.currency);
    expect(patch.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-mate-x6' && mainCard.main?.romram === '12+512 GB')).toBe(true);
  });
});

describe('t428u R4 M1 · 平台比较卡的「定位到看板」同样带完整口径', () => {
  it('AE 页问「RU 最低价平台比较」：平台表 open 动作 filterPatch 与计算口径一致', async () => {
    const state = aeNovaState();
    const response = await runAgent('RU nova 14 Pro 最低价平台比较', buildAgentContext('dashboard', state, []), undefined, 'query');
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard | undefined;
    expect(table?.title).toContain('平台比较');
    if (!table) return;
    const patch = openActionOf(table, '定位到看板').target!.filterPatch!;
    expect(patch.countryCode).toBe('RU');
    expect(patch.mains?.[0].main?.modelId).toBe('own-huawei-nova-14-pro');
    expect(patch.granularity).toBe(state.granularity);
    expect(patch.rangeStart).toBe(state.rangeStart);
    expect(patch.rangeEnd).toBe(state.rangeEnd);
  });
});
