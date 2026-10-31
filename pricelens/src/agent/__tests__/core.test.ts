import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import { buildAgentContext, buildFilterCard, buildFilterPatch, classifyIntent, resolveAgentEntities, runAgent } from '../core';
import { validateFilterPatch } from '../contracts';

const state = { ...defaultFilters, rangeStart: '202619', rangeEnd: '202642' };

describe('PriceLens Agent deterministic core', () => {
  it('classifies the three MVP intents', () => {
    expect(classifyIntent('最近 8 周显示 USD 和 RRP')).toBe('filter');
    expect(classifyIntent('最近有价周哪个平台最便宜？')).toBe('query');
    expect(classifyIntent('解释当前预警为什么触发')).toBe('alert');
    expect(classifyIntent('我要看 巴西的 Pura 90s 情况')).toBe('query');
  });

  it('resolves an explicit country and product instead of using the page selection', () => {
    const resolved = resolveAgentEntities('我要看 mate x7 价格走势', state);
    expect(resolved.explicitCountry).toBe(false);
    expect(resolved.explicitProduct).toBe(true);
    expect(resolved.productLabels).toEqual(['HUAWEI Mate X7']);
    expect(resolved.selections.every((selection) => selection.modelId === 'own-huawei-mate-x7')).toBe(true);
  });

  it('returns an explicit no-data result for a known product in an unsupported country', async () => {
    const response = await runAgent('我要看 巴西的 Pura 90s 情况', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    expect(response.summary).toContain('巴西');
    expect(response.summary).toContain('没有可用的价格数据');
    expect(response.cards[0]?.kind).toBe('table');
  });

  it('queries the requested Mate X7 series rather than current page products', async () => {
    const currentPage = {
      ...state,
      mains: [{ id: 'current', main: { modelId: 'own-huawei-pura-90s-pro-max', romram: '12+256 GB', skuIds: ['own-huawei-pura-90s-pro-max__12+256__black'] }, compares: [] }],
    };
    const response = await runAgent('我要看 mate x7 价格走势', buildAgentContext('dashboard', currentPage, []));
    const chart = response.cards.find((card) => card.kind === 'chart');
    expect(chart?.kind).toBe('chart');
    if (chart?.kind === 'chart') expect(chart.series.every((series) => series.label.includes('Mate X7'))).toBe(true);
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

  it('answers the forecast page with price-demand scenarios', async () => {
    const response = await runAgent('如果价格下调 5% 会怎样？', buildAgentContext('forecast', state, []));
    expect(response.intent).toBe('query');
    expect(response.cards[0]?.kind).toBe('table');
    expect(response.summary).toContain('5%');
  });
});
