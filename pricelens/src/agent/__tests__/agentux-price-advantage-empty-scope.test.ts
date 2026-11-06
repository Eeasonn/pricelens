// ============================================================
// t428u R2（本轮返修）m2 · 空结果价格优势卡的回看口径一致性。
// 复现（稳定线 7edadc6 同源问题）：DE 季粒度 2025Q1–2025Q2（数据实际覆盖
// 2026-W19–W42）问「价格优势」产出空卡；回看/跳 GTM 的 scopePatch 无条件写
// granularity='week' 却回退 state 的季桶（rs=2025Q1/re=2025Q2）——回看后
// URL 出现 week + 2025Q1 的错配口径。
// 契约：粒度与范围桶必须同形——空结果保持原粒度+原桶；非空结果按实际参与
// 对比的周给真实周桶+周粒度，并携带完整主品口径（R5 既有行为不回归）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { buildAgentContext, runAgent } from '../core';
import { advantageScopePatch } from '../priceAdvantage';
import type { PriceAdvantageResultCard } from '../contracts';

const NOVA: FiltersState['mains'][number]['main'] = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black'] };

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

async function advantageCardOf(state: FiltersState): Promise<PriceAdvantageResultCard> {
  const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
  const card = response.cards.find((item) => item.kind === 'price_advantage');
  expect(card?.kind).toBe('price_advantage');
  return card as PriceAdvantageResultCard;
}

describe('t428u R2 m2 · 空价格优势卡回看口径（粒度×范围桶同形）', () => {
  it('DE 季粒度 2025Q1–2025Q2 空卡：scopePatch 保持 quarter + 原季桶，不再 week + 季桶错配', async () => {
    const state = deEmptyQuarterState();
    const card = await advantageCardOf(state);
    // 数据范围外的季 → 确为空结果卡
    expect(card.rows).toHaveLength(0);
    const patch = advantageScopePatch(state, card.rows);
    expect(patch.granularity).toBe('quarter');
    expect(patch.rangeStart).toBe('2025Q1');
    expect(patch.rangeEnd).toBe('2025Q2');
    // 错配反例：粒度 week 时范围桶绝不能是季/月形状
    if (patch.granularity === 'week') {
      expect(patch.rangeStart).toMatch(/^\d{6}$/);
      expect(patch.rangeEnd).toMatch(/^\d{6}$/);
    }
    // 空结果不带 mains——跨国回看由目标国快照/默认卡安全落地，不冒充计算口径
    expect(patch.mains).toBeUndefined();
  });

  it('非空卡（RU nova 14 Pro 默认周范围）：scopePatch 仍是周粒度 + 真实参与对比的周桶 + 完整主品口径', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      mains: buildCards([NOVA!], { auto: true, countryCode: 'RU' }),
    };
    const card = await advantageCardOf(state);
    expect(card.rows.length).toBeGreaterThan(0);
    const patch = advantageScopePatch(state, card.rows);
    expect(patch.granularity).toBe('week');
    expect(patch.rangeStart).toMatch(/^\d{6}$/);
    expect(patch.rangeEnd).toMatch(/^\d{6}$/);
    // 范围 = 实际参与对比的周（rows 已按周倒序）
    const weekIds = [...new Set(card.rows.map((row) => row.weekId))].sort();
    expect(patch.rangeStart).toBe(weekIds[0]);
    expect(patch.rangeEnd).toBe(weekIds[weekIds.length - 1]);
    // 非空卡携带完整主品口径（R5：回看与卡不脱节）
    expect(patch.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
  });

  it('月粒度 2026-01–2026-02（数据范围前）空卡同样保持 month + 月桶', async () => {
    const state: FiltersState = {
      ...deEmptyQuarterState(),
      granularity: 'month',
      rangeStart: '202601',
      rangeEnd: '202602',
    };
    const card = await advantageCardOf(state);
    expect(card.rows).toHaveLength(0);
    const patch = advantageScopePatch(state, card.rows);
    expect(patch.granularity).toBe('month');
    expect(patch.rangeStart).toBe('202601');
    expect(patch.rangeEnd).toBe('202602');
  });
});
