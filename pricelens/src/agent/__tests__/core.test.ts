import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import { buildAgentContext, buildFilterCard, buildFilterPatch, clarificationReasonForQuery, classifyIntent, resolveAgentEntities, runAgent } from '../core';
import { isContextStale, validateFilterPatch } from '../contracts';
import { simpleFullDataset } from '../../pages/forecast/forecastDatasetRegistry';
import { createForecastSnapshot } from '../../pages/forecast/forecastSnapshot';

const state = { ...defaultFilters, rangeStart: '202619', rangeEnd: '202642' };

describe('PriceLens Agent deterministic core', () => {
  it('classifies the three MVP intents', () => {
    expect(classifyIntent('最近 8 周显示 USD 和 RRP')).toBe('filter');
    expect(classifyIntent('最近有价周哪个平台最便宜？')).toBe('query');
    expect(classifyIntent('解释当前预警为什么触发')).toBe('alert');
    expect(classifyIntent('我要看 巴西的 Pura 90s 情况')).toBe('query');
    expect(classifyIntent('解释当前简单版预测的关键假设、证据和风险')).toBe('forecast_explain');
  });

  it('resolves an explicit country and product instead of using the page selection', () => {
    const resolved = resolveAgentEntities('我要看 mate x7 价格走势', state);
    expect(resolved.explicitCountry).toBe(false);
    expect(resolved.explicitProduct).toBe(true);
    expect(resolved.productLabels).toEqual(['HUAWEI Mate X7']);
    expect(resolved.selections.every((selection) => selection.modelId === 'own-huawei-mate-x7')).toBe(true);
  });

  it('resolves the dashboard quick-search shorthand R 国 + compact model', () => {
    const resolved = resolveAgentEntities('R 国 pura90spro', state);
    const patch = buildFilterPatch('R 国 pura90spro', state);
    expect(resolved.countryCode).toBe('RU');
    expect(resolved.explicitCountry).toBe(true);
    expect(resolved.explicitProduct).toBe(true);
    expect(resolved.productLabels[0]).toContain('Pura 90s Pro');
    expect(patch.countryCode).toBe('RU');
    expect(patch.mains?.[0]?.main?.modelId).toContain('pura-90s-pro');
  });

  it('returns an explicit no-data result for a known product in an unsupported country', async () => {
    const response = await runAgent('我要看 巴西的 Pura 90s 情况', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    expect(response.summary).toContain('巴西');
    expect(response.summary).toContain('没有可用的价格数据');
    expect(response.cards[0]?.kind).toBe('table');
  });

  it('asks for a product before answering an underspecified cheapest query', async () => {
    expect(clarificationReasonForQuery('最近有价周哪个平台最便宜？', state)).toBe('产品');
    const response = await runAgent('最近有价周哪个平台最便宜？', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('clarify');
    expect(response.summary).toContain('确认产品');
    expect(response.suggestions.map((item) => typeof item === 'string' ? item : item.label)).toEqual(['价格优势', '价格预警', '基础我司快搜']);
  });

  it('asks for an explicit range when the product context exists but time is vague', async () => {
    const currentPage = {
      ...state,
      mains: [{ id: 'current', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'] }, compares: [] }],
    };
    expect(clarificationReasonForQuery('近期价格趋势怎么样？', currentPage)).toBe('时间范围');
    const response = await runAgent('近期价格趋势怎么样？', buildAgentContext('dashboard', currentPage, []));
    expect(response.intent).toBe('clarify');
    expect(response.summary).toContain('时间范围');
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

  it('marks an already-applied filter preview instead of pretending there is a change', () => {
    const card = buildFilterCard('USD', { ...state, currency: 'usd' });
    expect(card?.changes).toHaveLength(0);
    expect(card?.warning).toContain('无需应用');
  });

  it('uses the last week inside the active range for platform comparison', async () => {
    const currentPage = {
      ...state,
      rangeStart: '202619',
      rangeEnd: '202640',
      mains: [{ id: 'current', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'] }, compares: [] }],
    };
    const response = await runAgent('最近有价周哪个平台最便宜？', buildAgentContext('dashboard', currentPage, []));
    const table = response.cards.find((card) => card.kind === 'table');
    expect(table?.kind).toBe('table');
    if (table?.kind === 'table') expect(table.note).toContain('202640');
  });

  it('rejects writes outside the filter allowlist', () => {
    expect(validateFilterPatch({ currency: 'usd', alertThresholds: {} }).valid).toBe(false);
    expect(validateFilterPatch({ currency: 'usd', priceTypes: { discounted: true, rrp: false } }).valid).toBe(true);
    expect(validateFilterPatch({ mains: [{ id: 'bad', main: { modelId: 'x' }, compares: [] }] }).valid).toBe(false);
    expect(validateFilterPatch({ rangeStart: '202642', rangeEnd: '202619' }).valid).toBe(false);
    expect(validateFilterPatch({ platform: { platforms: ['OZON'], shopIds: ['RU:ozon:1P'], seller: 1 } }).valid).toBe(false);
    expect(validateFilterPatch({ platform: { platforms: ['OZON'], shopIds: ['RU:ozon:1P'], seller: null } }).valid).toBe(true);
  });

  it('returns an auditable response with plan steps', async () => {
    const response = await runAgent('最近 8 周并显示 RRP', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('filter');
    expect(response.steps.map((step) => step.tool)).toContain('view.preview');
    expect(response.cards[0]?.kind).toBe('filter');
  });

  it('answers the forecast page with price-demand scenarios', async () => {
    const context = buildAgentContext('forecast', state, []);
    const response = await runAgent('如果价格下调 5% 会怎样？', context);
    expect(response.intent).toBe('query');
    expect(response.cards[0]?.kind).toBe('table');
    expect(response.summary).toContain('5%');
    expect(response.cards[0]?.kind === 'table' && response.cards[0].actions?.every((action) => action.target?.contextFingerprint === context.fingerprint)).toBe(true);
  });

  it('returns a structured forecast explanation backed by the forecast fixture', async () => {
    const context = buildAgentContext('forecast', state, []);
    const response = await runAgent('解释当前简单版预测的关键假设、证据和风险', context);
    expect(response.intent).toBe('forecast_explain');
    const card = response.cards[0];
    expect(card?.kind).toBe('forecast_explanation');
    if (card?.kind === 'forecast_explanation') {
      expect(card.scope.modelVersion).toBe('simple-demo-v1');
      expect(card.contextFingerprint).toBe(context.fingerprint);
      expect(card.fitWindow).toContain('W1–W10');
      expect(card.sampleCount).toBe(7);
      expect(card.dataStatus).toBe('simulated');
      expect(card.fitAppliedToForecast).toBe(false);
      expect(card.intervalCalibrated).toBe(false);
      expect(card.current.week).toBe('W10');
      expect(card.current.unconstrainedDemand).toBeGreaterThan(0);
      expect(card.factors.map((factor) => factor.key)).toEqual(['baseline', 'price', 'promo', 'competitor', 'supply']);
      expect(card.actions?.every((action) => action.target?.contextFingerprint === context.fingerprint)).toBe(true);
    }
    expect(JSON.stringify(response)).not.toContain('4600');
    expect(JSON.stringify(response)).not.toContain('1.85');
    expect(JSON.stringify(response)).not.toContain('7200');
  });

  it('keeps forecast explanation aligned with an active What-if draft', async () => {
    const context = buildAgentContext('forecast', state, []);
    const response = await runAgent('解释当前简单版预测的关键假设、证据和风险', context, undefined, 'forecast_explain', { priceDeltaPct: -5, promoDeltaPct: 0, supplyDeltaPct: 0 });
    const card = response.cards[0];
    expect(card?.kind).toBe('forecast_explanation');
    if (card?.kind === 'forecast_explanation') {
      expect(card.scenario?.active).toBe(true);
      expect(card.scenario?.soDelta).toBeGreaterThan(0);
      expect(card.actions?.every((action) => action.target?.forecastDraft?.priceDeltaPct === -5)).toBe(true);
    }
  });

  it('uses the page-provided forecast snapshot and adapter instead of the demo fallback', async () => {
    const context = buildAgentContext('forecast', state, []);
    const snapshot = createForecastSnapshot(simpleFullDataset, { priceDeltaPct: 0, promoDeltaPct: 0, supplyDeltaPct: 0 }, context.fingerprint);
    const response = await runAgent('解释当前简单版预测的关键假设、证据和风险', context, undefined, 'forecast_explain', undefined, snapshot, simpleFullDataset);
    const card = response.cards[0];
    expect(card?.kind).toBe('forecast_explanation');
    if (card?.kind === 'forecast_explanation') {
      expect(card.scope.modelVersion).toBe('simple-full-v1');
      expect(card.current.week).toBe('W104');
      expect(card.scope.currency).toBe('RUB');
      expect(card.sampleCount).toBe(snapshot.fit.sampleCount);
      expect(card.actions?.every((action) => action.target?.forecastSnapshot?.snapshotId === snapshot.snapshotId)).toBe(true);
    }
  });

  it('covers workbench interface wording in the forecast explanation (A4 sync)', async () => {
    const context = buildAgentContext('forecast', state, []);
    const response = await runAgent('解释当前简单版预测的关键假设、证据和风险', context, undefined, 'forecast_explain');
    const card = response.cards[0];
    expect(card?.kind).toBe('forecast_explanation');
    if (card?.kind === 'forecast_explanation') {
      const capabilityLines = card.assumptions.slice(-4).join('\n');
      // 四条新口径：参照品联动比值校正 / 库存上限修正回写 / 大盘月粒度调整 / 复制关键假设（把握区间带已于 2026-11-04 评审下线）。
      expect(capabilityLines).toContain('上一代参照');
      expect(capabilityLines).toContain('比值校正');
      expect(capabilityLines).toContain('库存上限修正');
      expect(capabilityLines).toContain('min(基线 SO, 可售)');
      expect(capabilityLines).toContain('大盘月粒度');
      expect(capabilityLines).toContain('未来 4 个季度');
      expect(capabilityLines).toContain('点击预测月');
      expect(capabilityLines).toContain('复制关键假设');
      // 新增口径遵循正典禁词（因子 / 约束 / 置信区间 / 无约束需求 / 我司）。
      for (const banned of ['因子', '约束', '置信区间', '无约束需求', '我司']) {
        expect(capabilityLines).not.toContain(banned);
      }
    }
  });

  it('formats mains filter patches as structured product labels, never [object Object]', () => {
    const prompt = '我要看 mate x7 价格走势';
    const patch = buildFilterPatch(prompt, state);
    expect(patch.mains?.length ?? 0).toBeGreaterThan(0);
    const card = buildFilterCard(prompt, state);
    expect(card?.kind).toBe('filter');
    const productChange = card?.changes.find((change) => change.label === '产品');
    expect(productChange).toBeDefined();
    expect(productChange?.after).not.toContain('[object Object]');
    expect(productChange?.after).toContain('Mate X7');
    expect(productChange?.after).toContain('·');
  });

  it('attaches provenance to the context and deterministic response', async () => {
    const context = buildAgentContext('dashboard', state, []);
    expect(context.provenance?.source).toBe('pricelens-context');
    expect(context.dataVersion).toBe('local-data-v1');
    const response = await runAgent('最近有价周哪个平台最便宜？', context);
    expect(response.provenance?.contextFingerprint).toBe(context.fingerprint);
    expect(isContextStale(context, `${context.fingerprint}-new`)).toBe(true);
  });
});
