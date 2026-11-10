// ============================================================
// t428u Batch1 返修 R6（二轮）：「最近 N 周」必须对齐 granularity='week'。
// 复现：月/季粒度下点「补齐时间 · 最近 8 周」，recentRange 给的是周桶，
// 但粒度仍停在 month/quarter——周桶 id 塞进月查询，产出
// `USD · month · 202636–202643` 且真实机型最新价/环比全「—」。
// 契约：显式应用「最近 N 周」范围 patch（buildFilterPatch、forced query
// 合并、Filters 收到周级 recentRange）时同步设 granularity='week'；
// 覆盖 month / quarter → 最近 8 周、空优势「调整范围 · 最近 12 周」全部路径。
// ============================================================
import { vi, describe, expect, it } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { buildAgentContext, buildFilterPatch, runAgent } from '../core';
import type { ChartResultCard, TableResultCard } from '../contracts';

// matrix-only（2026-11-10）：主品改用矩阵有覆盖的 nova 15 12+256（旧锚
// nova 14 Pro 在 RU 无矩阵对比位，「最近 12 周」优势重跑恒 0 行假空卡）。
const NOVA: FiltersState['mains'][number]['main'] = { modelId: 'own-huawei-nova-15', romram: '12+256 GB', skuIds: ['own-huawei-nova-15__12-256gb__black'] };

/** 月/季粒度下的真实看板状态（手动范围桶与粒度自洽，nova 15 主品 + RU 矩阵对比区） */
function stateWithGranularity(granularity: 'month' | 'quarter'): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    granularity,
    adaptive: false,
    rangeStart: granularity === 'month' ? '202605' : '2026Q2',
    rangeEnd: granularity === 'month' ? '202610' : '2026Q3',
    mains: buildCards([NOVA!], { auto: true, countryCode: 'RU' }),
  };
}

describe('t428u 返修 R6（二轮）· 「最近 N 周」对齐周粒度', () => {
  for (const granularity of ['month', 'quarter'] as const) {
    it(`${granularity} 粒度下「查看最近 8 周的价格趋势」：patch 与产出卡都是周粒度，真实机型价格非空`, async () => {
      const state = stateWithGranularity(granularity);
      const patch = buildFilterPatch('查看最近 8 周的价格趋势', state);
      // 周桶范围必须伴随周粒度（forced query 合并与 Filters 应用共用此 patch）
      expect(patch.granularity).toBe('week');
      expect(patch.rangeStart).toMatch(/^2026\d{2}$/);
      expect(patch.rangeEnd).toBe('202646');
      // 建议词条带 intent='query'，与「补齐时间 · 最近 8 周」同一强制查询路径
      const response = await runAgent('查看最近 8 周的价格趋势', buildAgentContext('dashboard', state, []), undefined, 'query');
      const chart = response.cards.find((card) => card.kind === 'chart');
      expect(chart?.kind).toBe('chart');
      if (chart?.kind === 'chart') {
        expect(chart.note).toContain('· week · 202639–202646');
        expect(chart.note).not.toContain(`· ${granularity} ·`);
        // 周桶落进周查询：真实机型有点位，不再整列空值
        expect(chart.series.some((series) => series.values.some((point) => point.value != null))).toBe(true);
      }
      const table = response.cards.find((card) => card.kind === 'table');
      expect(table?.kind).toBe('table');
      if (table?.kind === 'table') {
        const ownRow = table.rows.find((row) => row[0].includes('nova 15'));
        expect(ownRow).toBeDefined();
        expect(ownRow?.[1]).toBeDefined();
        expect(ownRow?.[1]).not.toBe('—');
        expect(ownRow?.[1]).not.toBe('');
      }
    });
  }

  it('筛选预览路径同步：月粒度下「最近 8 周」的变更清单含 时间粒度 月 → 周', () => {
    const state = stateWithGranularity('month');
    const patch = buildFilterPatch('最近 8 周显示 USD', state);
    expect(patch.granularity).toBe('week');
    expect(patch.currency).toBe('usd');
  });

  it('空优势「调整范围 · 最近 12 周」重跑：查询口径对齐周粒度且结果卡有真实对比行', async () => {
    const state = stateWithGranularity('month');
    // 空优势卡上的追问提示词（priceAdvantage 空结果动作）原样重跑
    const prompt = '用最近 12 周重新计算价格优势';
    const patch = buildFilterPatch(prompt, state);
    expect(patch.granularity).toBe('week');
    expect(patch.rangeStart).toBe('202635');
    expect(patch.rangeEnd).toBe('202646');
    const response = await runAgent(prompt, buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind === 'price_advantage') {
      // 周桶 × 周粒度能对齐出真实对比（月粒度错配时这里会是空 rows / 全 —）
      expect(card.rows.length).toBeGreaterThan(0);
      expect(card.rows.every((row) => row.ownPrice > 0 && row.competitorPrice > 0)).toBe(true);
      // 回看动作的 filterPatch 同样保持周粒度并携带主品口径（R5）
      const openAction = card.actions?.find((action) => action.id === 'price-advantage-open');
      expect(openAction?.target?.filterPatch?.granularity).toBe('week');
      expect(openAction?.target?.filterPatch?.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-nova-15')).toBe(true);
    }
    // 产出卡图表侧（若同轮带出图表）粒度不再回退月桶
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard | undefined;
    if (chart) expect(chart.note).not.toContain('· month ·');
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard | undefined;
    if (table) {
      const ownRow = table.rows.find((row) => row[0].includes('nova 15'));
      expect(ownRow?.[1]).not.toBe('—');
    }
  });
});
