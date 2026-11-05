import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import { dimProduct } from '../../data';
import { buildCards } from '../../state/mainSelection';
import { buildAgentContext, runAgent } from '../core';
import { calculatePriceAdvantage } from '../priceAdvantage';

describe('agentux-core price advantage', () => {
  it('uses local deterministic price facts and exposes advantage/lagging rows', async () => {
    const context = buildAgentContext('dashboard', { ...defaultFilters, mains: [] }, []);
    const response = await runAgent('价格优势', context);
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(response.intent).toBe('query');
    expect(response.steps.map((item) => item.label)).toEqual(['解析意图', '读取价格', '计算优势', '生成结论']);
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind === 'price_advantage') {
      expect(card.rows.length).toBeGreaterThan(0);
      expect(card.rows.every((row) => row.ownPrice === row.competitorPrice - row.gap)).toBe(true);
      expect(card.rows.every((row) => row.channel === row.target.platform)).toBe(true);
      expect(card.rows.some((row) => row.direction === 'advantage' || row.direction === 'lagging')).toBe(true);
      expect(card.evidence?.[0]?.source).toBe('统一价格聚合引擎');
    }
  });

  it('keeps the same deterministic result when recomputed from the response scope', async () => {
    const own = dimProduct.find((row) => row.is_own && row.industry === defaultFilters.industry && row.countries.includes(defaultFilters.countryCode));
    expect(own).toBeDefined();
    const state = { ...defaultFilters, mains: buildCards([{ modelId: own!.model_id, romram: own!.romram, skuIds: [own!.sku_id] }], { auto: true }) };
    const first = calculatePriceAdvantage(state, 'ctx');
    const second = calculatePriceAdvantage(state, 'ctx');
    expect(first).toEqual(second);
    expect(first?.rows.length).toBeGreaterThan(0);
  });
});
