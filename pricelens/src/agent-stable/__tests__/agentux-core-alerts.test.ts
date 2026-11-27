import { describe, expect, it } from 'vitest';
import { buildAlerts } from '../../dataModel/alerts';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import { buildCards } from '../../state/mainSelection';
import { buildAgentContext, runAgent } from '../core';
import type { AgentAlertRecord } from '../contracts';

describe('agentux-core price alerts', () => {
  it('agentux-core returns deterministic alert rows with evidence and reversible navigation targets', async () => {
    const product = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'));
    expect(product).toBeDefined();
    if (!product) return;
    const state = {
      ...defaultFilters,
      countryCode: 'RU',
      industry: 'phone' as const,
      mains: buildCards([{ modelId: product.model_id, romram: product.romram, skuIds: [product.sku_id] }], { auto: true }),
    };
    const seriesKey = `${product.model_id}__${product.romram.replace(/\s+/g, '')}`;
    const source = buildAlerts({
      subs: [seriesKey],
      enabled: defaultFilters.alertTypes,
      thresholds: defaultFilters.alertThresholds,
      products: {},
      currency: state.currency,
      scope: { countryCode: state.countryCode, industry: state.industry },
      platform: state.platform,
    })[0];
    expect(source).toBeDefined();
    if (!source) return;
    const context = buildAgentContext('alerts', state, [{
      ...source,
      alertId: source.key,
      priority: 'P2',
      priorityScore: 40,
      threshold: defaultFilters.alertThresholds[source.type],
      ruleVersion: 'alerts-v1',
      dataVersion: 'real-alert-v1',
      contextFingerprint: buildAgentContext('alerts', state, []).fingerprint,
      evidenceIds: ['ev-fact'],
      evidenceStatus: 'verified',
      evidence: [{ id: 'ev-fact', label: '触发事实', detail: `${source.weekId} · 本地规则`, source: '预警引擎' }],
    } as AgentAlertRecord]);

    const response = await runAgent('价格预警', context, undefined, 'alert');
    expect(response.intent).toBe('alert');
    const card = response.cards.find((item) => item.kind === 'alert');
    expect(card?.kind).toBe('alert');
    if (!card || card.kind !== 'alert') return;
    expect(card.alerts?.length).toBe(1);
    expect(card.alerts?.[0]?.evidence?.[0]?.detail).toContain(source.weekId);
    const actions = card.alerts?.[0]?.actions ?? [];
    const apply = actions.find((item) => item.kind === 'apply');
    const dashboard = actions.find((item) => item.target?.page === 'dashboard');
    expect(apply?.target?.filterPatch?.countryCode).toBe('RU');
    expect(apply?.target?.filterPatch?.rangeStart).toBe(source.weekId);
    expect(apply?.target?.filterPatch?.mains?.[0]?.auto).toBe(true);
    expect(dashboard?.target?.alertId).toBe(source.key);
  });
});
