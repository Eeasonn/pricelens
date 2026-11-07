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
import { dimProduct } from '../../data';
import { buildAgentContext, runAgent } from '../core';
import { defaultFilters } from '../../state/FiltersContext';
import { buildCards } from '../../state/mainSelection';
import { AGENT_FOLLOWUP_SUGGESTIONS, PRICE_TREND_AI_SUGGESTIONS, agentSuggestionsForPage } from '../../components/CopilotStable/agentCopy';
import { buildAlerts } from '../../dataModel/alerts';
import type { AgentAlertRecord } from '../contracts';

const visiblePages = ['dashboard', 'alerts', 'volume', 'pricing', 'overview', 'config'] as const;
const coreLabels = ['价格优势', '价格预警', '基础我司快搜'];

describe('agentux-core visible preset chips', () => {
  it('agentux-core keeps only the three stable-line core chips in empty and follow-up states', () => {
    expect(PRICE_TREND_AI_SUGGESTIONS.map((item) => item.label)).toEqual(coreLabels);
    expect(AGENT_FOLLOWUP_SUGGESTIONS.map((item) => item.label)).toEqual(coreLabels);
    for (const page of visiblePages) {
      expect(agentSuggestionsForPage(page).map((item) => item.label), page).toEqual(coreLabels);
    }
  });

  it('agentux-core gives every visible core chip an explicit intent and a data-backed result', async () => {
    const product = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'));
    expect(product).toBeDefined();
    if (!product) return;
    const state = {
      ...defaultFilters,
      countryCode: 'RU',
      industry: 'phone' as const,
      mains: buildCards([{ modelId: product.model_id, romram: product.romram, skuIds: [product.sku_id] }], { auto: true }),
    };
    const contextWithoutAlerts = buildAgentContext('dashboard', state, []);
    const seriesKey = `${product.model_id}__${product.romram.replace(/\s+/g, '')}`;
    const sourceAlert = buildAlerts({
      subs: [seriesKey],
      enabled: defaultFilters.alertTypes,
      thresholds: defaultFilters.alertThresholds,
      products: {},
      currency: state.currency,
      scope: { countryCode: state.countryCode, industry: state.industry },
      platform: state.platform,
    })[0];
    expect(sourceAlert, '价格预警').toBeDefined();
    if (!sourceAlert) return;
    const alert: AgentAlertRecord = {
      ...sourceAlert,
      alertId: sourceAlert.key,
      priority: 'P1',
      priorityScore: 1,
      threshold: defaultFilters.alertThresholds[sourceAlert.type],
      ruleVersion: 'alerts-v1',
      dataVersion: 'real-alert-v1',
      contextFingerprint: contextWithoutAlerts.fingerprint,
      evidenceIds: [],
      evidenceStatus: 'verified',
    };
    const context = { ...contextWithoutAlerts, alerts: [alert] };
    const chips = [...PRICE_TREND_AI_SUGGESTIONS, ...AGENT_FOLLOWUP_SUGGESTIONS]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label) === index);
    for (const chip of chips) {
      expect(chip.intent, chip.label).toBeDefined();
      expect(chip.prompt.trim(), chip.label).not.toBe('');
      const result = await runAgent(chip.prompt, context, undefined, chip.intent);
      expect(result.intent, chip.label).not.toBe('clarify');
      expect(result.cards.length, chip.label).toBeGreaterThan(0);
    }
  });
});
