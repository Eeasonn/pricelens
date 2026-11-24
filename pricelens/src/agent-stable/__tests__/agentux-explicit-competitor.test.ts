import { describe, expect, it, vi } from 'vitest';

vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { defaultFilters } from '../../state/FiltersContext';
import { buildAgentContext, resolveAgentEntities, runAgent } from '../core';

describe('价格优势 · 显式竞品约束', () => {
  it('Pura 对比 Samsung 时只返回 Samsung，不回退默认 Apple 竞品', async () => {
    expect(resolveAgentEntities('Pura 90s Pro Max 相比 Samsung S26 Ultra 的价格优势如何？', defaultFilters).productLabels).toContain('SAMSUNG S26 Ultra');
    const response = await runAgent('Pura 90s Pro Max 相比 Samsung S26 Ultra 的价格优势如何？', buildAgentContext('dashboard', defaultFilters, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    expect(card.rows.length).toBeGreaterThan(0);
    expect(card.rows.every((row) => row.competitorBrand === 'SAMSUNG')).toBe(true);
    expect(card.rows.every((row) => row.competitorModelName === 'S26 Ultra')).toBe(true);
    expect(response.summary).toContain('SAMSUNG S26 Ultra');
    expect(response.summary).not.toContain('APPLE');
  });
});
