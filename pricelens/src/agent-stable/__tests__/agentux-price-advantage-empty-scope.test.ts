// ============================================================
// t428u Round 3（三轮返修）m2 · 空结果价格优势卡的回看口径一致性。
// 复现：DE 季粒度 2025Q1–2025Q2（数据实际覆盖 2026-W19–W42）问「价格优势」
// 产出空卡；scopePatch 无条件写 granularity='week' 却回退 state 的季桶
// （rs=2025Q1/re=2025Q2）——回看后 URL 出现 week + 2025Q1 的错配口径。
// 契约：粒度与范围桶必须同形——空结果保持原粒度+原桶；非空结果按实际参与
// 对比的周给真实周桶+周粒度（R5 既有行为不回归）。
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
import { buildAgentContext, runAgent } from '../core';
import type { AgentCardAction, PriceAdvantageResultCard } from '../contracts';

const NOVA: FiltersState['mains'][number]['main'] = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black'] };
// matrix-only（2026-11-10）：非空卡主品改用矩阵有覆盖的 RU nova 15 12+256
// （旧锚 nova 14 Pro 无矩阵对比位，优势恒 0 行）；DE 空卡用例保留 nova 14 Pro。
const NOVA15: FiltersState['mains'][number]['main'] = { modelId: 'own-huawei-nova-15', romram: '12+256 GB', skuIds: ['own-huawei-nova-15__12-256gb__black'] };

/** DE · 季粒度 · 2025Q1–2025Q2（数据范围外 → 空结果）· nova 14 Pro 主品 */
function deEmptyQuarterState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'DE',
    granularity: 'quarter',
    adaptive: false,
    rangeStart: '2025Q1',
    rangeEnd: '2025Q2',
    mains: buildCards([NOVA!], { auto: true, countryCode: 'DE' }),
  };
}

function openActionOf(card: PriceAdvantageResultCard): AgentCardAction {
  const open = card.actions?.find((action) => action.id === 'price-advantage-open');
  expect(open).toBeTruthy();
  expect(open!.target?.filterPatch).toBeTruthy();
  return open!;
}

describe('t428u R3 m2 · 空价格优势卡回看口径（粒度×范围桶同形）', () => {
  it('DE 季粒度 2025Q1–2025Q2 空卡：filterPatch 保持 quarter + 原季桶，不再 week + 季桶错配', async () => {
    const state = deEmptyQuarterState();
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    // 数据范围外的季 → 确为空结果卡（空卡追问动作在场）
    expect(card.rows).toHaveLength(0);
    expect(card.actions?.some((action) => action.id === 'price-advantage-adjust-range')).toBe(true);
    const patch = openActionOf(card).target!.filterPatch!;
    expect(patch.granularity).toBe('quarter');
    expect(patch.rangeStart).toBe('2025Q1');
    expect(patch.rangeEnd).toBe('2025Q2');
    // 错配反例：粒度 week 时范围桶绝不能是季/月形状
    if (patch.granularity === 'week') {
      expect(patch.rangeStart).toMatch(/^\d{6}$/);
      expect(patch.rangeEnd).toMatch(/^\d{6}$/);
    }
    // 空卡也携带完整主品口径（R5：回看与卡不脱节）
    expect(patch.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
  });

  it('非空卡（RU nova 15 12+256 默认周范围）：filterPatch 仍是周粒度 + 真实参与对比的周桶', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      mains: buildCards([NOVA15!], { auto: true, countryCode: 'RU' }),
    };
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    expect(card.rows.length).toBeGreaterThan(0);
    const patch = openActionOf(card).target!.filterPatch!;
    expect(patch.granularity).toBe('week');
    expect(patch.rangeStart).toMatch(/^\d{6}$/);
    expect(patch.rangeEnd).toMatch(/^\d{6}$/);
    // 范围 = 实际参与对比的周（rows 已按周倒序）
    const weekIds = [...new Set(card.rows.map((row) => row.weekId))].sort();
    expect(patch.rangeStart).toBe(weekIds[0]);
    expect(patch.rangeEnd).toBe(weekIds[weekIds.length - 1]);
  });

  it('月粒度 2026-01–2026-02（数据范围前）空卡同样保持 month + 月桶', async () => {
    const state: FiltersState = {
      ...deEmptyQuarterState(),
      granularity: 'month',
      rangeStart: '202601',
      rangeEnd: '202602',
    };
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    expect(card.rows).toHaveLength(0);
    const patch = openActionOf(card).target!.filterPatch!;
    expect(patch.granularity).toBe('month');
    expect(patch.rangeStart).toBe('202601');
    expect(patch.rangeEnd).toBe('202602');
  });
});
