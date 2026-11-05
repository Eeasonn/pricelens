import { describe, expect, it } from 'vitest';
import { agentProviderLabel } from '../../components/Copilot/agentCopy';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import { buildCards } from '../../state/mainSelection';
import { buildAgentContext, runAgent } from '../core';
import { AGENT_FOLLOWUP_SUGGESTIONS, PRICE_TREND_AI_SUGGESTIONS, agentSuggestionsForPage } from '../../components/Copilot/agentCopy';

describe('agentux P1-7 preset intents', () => {
  it('agentux-core every visible preset chip carries an explicit core intent and a non-empty prompt', () => {
    const all = [
      ...PRICE_TREND_AI_SUGGESTIONS,
      ...AGENT_FOLLOWUP_SUGGESTIONS,
      ...['dashboard', 'alerts', 'volume', 'pricing', 'overview', 'config'].flatMap((page) => agentSuggestionsForPage(page)),
    ];
    expect(all.length).toBeGreaterThan(0);
    const labels = new Set(all.map((item) => item.label));
    expect(labels).toEqual(new Set(['价格优势', '价格预警', '基础我司快搜']));
    for (const item of all) {
      expect(item.prompt.trim()).not.toBe('');
      expect(item.intent).not.toBe('clarify');
      expect(['comparison', 'evidence', 'query']).toContain(item.target);
    }
  });

  it('agentux-core core chip intents do not fall into clarification', async () => {
    const product = dimProduct.find((row) => row.is_own && row.countries.includes('RU') && row.industry === 'phone');
    expect(product).toBeDefined();
    if (!product) return;
    const modelId = product.model_id;
    const state = {
      ...defaultFilters,
      mains: buildCards([{ modelId, romram: product.romram, skuIds: [product.sku_id] }]),
    };
    const context = buildAgentContext('dashboard', state, []);
    const chips = PRICE_TREND_AI_SUGGESTIONS;
    const results = await Promise.all(chips.map((item) => runAgent(item.prompt, context, undefined, item.intent)));
    expect(results.map((result) => result.intent)).toEqual(['query', 'alert', 'query']);
    expect(results[0]?.cards.some((card) => card.kind === 'price_advantage')).toBe(true);
    expect(results[2]?.cards.length).toBeGreaterThan(0);
  });
});


describe('agentux P1-4 provider badges', () => {
  it('agentux P1-4 labels remote, local, timeout/non-2xx fallback, and simulated output', () => {
    expect(agentProviderLabel({ name: 'GLM', model: 'x' })).toBe('远端 AI 流式');
    expect(agentProviderLabel()).toBe('本地确定性');
    expect(agentProviderLabel({ name: '本地确定性回退', model: 'local' }, '远端服务响应超时')).toContain('本地回退');
    expect(agentProviderLabel({ name: '本地确定性回退', model: 'local' }, '远端服务返回 502')).toContain('502');
    expect(agentProviderLabel(undefined, undefined, true)).toContain('演示数据');
  });
});
