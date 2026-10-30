import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import { buildAgentContext, buildFilterCard, buildFilterPatch, classifyIntent, runAgent } from '../core';
import { validateFilterPatch } from '../contracts';

const state = { ...defaultFilters, rangeStart: '202619', rangeEnd: '202642' };

describe('PriceLens Agent deterministic core', () => {
  it('classifies the three MVP intents', () => {
    expect(classifyIntent('最近 8 周显示 USD 和 RRP')).toBe('filter');
    expect(classifyIntent('最近有价周哪个平台最便宜？')).toBe('query');
    expect(classifyIntent('解释当前预警为什么触发')).toBe('alert');
  });

  it('builds a read-only filter patch without changing state', () => {
    const patch = buildFilterPatch('最近 8 周，USD，带上 RRP', state);
    expect(patch.currency).toBe('usd');
    expect(patch.priceTypes?.rrp).toBe(true);
    expect(patch.adaptive).toBe(false);
    expect(state.rangeStart).toBe('202619');
    expect(buildFilterCard('最近 8 周，USD，带上 RRP', state)?.kind).toBe('filter');
  });

  it('rejects writes outside the filter allowlist', () => {
    expect(validateFilterPatch({ currency: 'usd', alertThresholds: {} }).valid).toBe(false);
    expect(validateFilterPatch({ currency: 'usd', priceTypes: { discounted: true, rrp: false } }).valid).toBe(true);
    expect(validateFilterPatch({ mains: [{ id: 'bad', main: { modelId: 'x' }, compares: [] }] }).valid).toBe(false);
  });

  it('returns an auditable response with plan steps', async () => {
    const response = await runAgent('最近 8 周并显示 RRP', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('filter');
    expect(response.steps.map((step) => step.tool)).toContain('view.preview');
    expect(response.cards[0]?.kind).toBe('filter');
  });
});
