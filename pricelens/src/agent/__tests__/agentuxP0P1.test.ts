import { describe, expect, it } from 'vitest';
import { applyAgentStreamEvent, mergeRemoteResponse, parseSseFrames, withLocalFallback, type AgentClient, type AgentStreamState } from '../client';
import { buildAgentContext, buildFilterPatch } from '../core';
import { isAgentResponse, type AgentResponse } from '../contracts';
import { defaultFilters } from '../../state/FiltersContext';
import { agentSuggestionsForPage } from '../../components/Copilot/agentCopy';
import { productHits } from '../../components/PriceTrendSearch';

const context = buildAgentContext('dashboard', defaultFilters, []);
const baseCard = {
  kind: 'filter' as const,
  id: 'filter-1',
  title: '筛选预览',
  patch: { currency: 'usd' as const },
  changes: [{ label: '币种', before: '本币', after: 'USD' }],
};
const baseline: AgentResponse = {
  intent: 'filter',
  summary: '本地确定性结果：USD',
  steps: [],
  cards: [baseCard],
  citations: [{ id: 'fact-1', kind: 'fact', label: '本地价格', detail: '确定性价格事实' }],
  suggestions: ['只看最近 8 周'],
  contextFingerprint: context.fingerprint,
  coverage: { covered: 1, total: 1 },
  provider: { name: '本地确定性', model: 'local' },
};

describe('agentux P0-1 streaming protocol', () => {
  it('逐帧累加 text.delta、upsert card.ready，并丢弃重复/乱序 sequence', () => {
    let state: AgentStreamState = { text: '', cards: [], events: [], lastSequence: 0 };
    state = applyAgentStreamEvent(state, { id: 'e1', runId: 'run-1', sequence: 1, type: 'text.delta', delta: '解析', timestamp: new Date().toISOString() }, 'run-1');
    state = applyAgentStreamEvent(state, { id: 'e2', runId: 'run-1', sequence: 2, type: 'text.delta', delta: '完成', timestamp: new Date().toISOString() }, 'run-1');
    state = applyAgentStreamEvent(state, { id: 'e2-dup', runId: 'run-1', sequence: 2, type: 'text.delta', delta: '不应写入', timestamp: new Date().toISOString() }, 'run-1');
    state = applyAgentStreamEvent(state, { id: 'e0', runId: 'run-1', sequence: 0, type: 'text.delta', delta: '不应写入', timestamp: new Date().toISOString() }, 'run-1');
    state = applyAgentStreamEvent(state, { id: 'other', runId: 'other-run', sequence: 3, type: 'text.delta', delta: '不应写入', timestamp: new Date().toISOString() }, 'run-1');
    state = applyAgentStreamEvent(state, { id: 'card-1', runId: 'run-1', sequence: 3, type: 'card.ready', card: baseCard, timestamp: new Date().toISOString() }, 'run-1');
    expect(state.text).toBe('解析完成');
    expect(state.cards).toEqual([baseCard]);
    expect(state.events).toHaveLength(3);
    expect(state.lastSequence).toBe(3);
  });

  it('parses fake SSE text.delta frames before the final response', () => {
    const parsed = parseSseFrames([
      `event: text.delta\ndata: ${JSON.stringify({ event: { id: 'e1', runId: 'run-1', sequence: 1, type: 'text.delta', delta: '解析', timestamp: new Date().toISOString() } })}`,
      `event: text.delta\ndata: ${JSON.stringify({ event: { id: 'e2', runId: 'run-1', sequence: 2, type: 'text.delta', delta: '中', timestamp: new Date().toISOString() } })}`,
      `event: run.completed\ndata: ${JSON.stringify({ response: baseline })}`,
    ].join('\n\n') + '\n\n', true);
    expect(parsed.events.map((event) => event.type)).toEqual(['text.delta', 'text.delta']);
    expect(parsed.responses[0]?.summary).toContain('USD');
  });
});

describe('agentux P0-2 deterministic fact guard', () => {
  it('保留 baseline cards/steps/citations/coverage 并标注远端价格篡改已校准', () => {
    const remote: AgentResponse = {
      ...baseline,
      summary: '远端说价格是 99999，SKU fake-sku',
      cards: [{ ...baseCard, patch: { currency: 'local' }, changes: [{ label: '币种', before: '本币', after: '本币' }] }],
      steps: [{ id: 'remote-step', tool: 'series.query', label: '远端改写', status: 'success', detail: 'tampered', durationMs: 1 }],
      contextFingerprint: context.fingerprint,
      provider: { name: '远端 AI 流式', model: 'remote' },
    };
    const merged = mergeRemoteResponse(baseline, remote, context.fingerprint);
    expect(merged.cards).toEqual(baseline.cards);
    expect(merged.steps).toEqual(baseline.steps);
    expect(merged.citations).toEqual(baseline.citations);
    expect(merged.coverage).toEqual(baseline.coverage);
    expect(merged.factGuard?.status).toBe('calibrated');
    expect(merged.factGuard?.message).toContain('本地数据校准');
  });

  it('fingerprint 不一致时返回 stale_context，不标记 completed', () => {
    const merged = mergeRemoteResponse(baseline, { ...baseline, contextFingerprint: 'ctx-other' }, context.fingerprint);
    expect(merged.factGuard?.status).toBe('stale_context');
    expect(merged.contextFingerprint).toBe('ctx-other');
  });
});

describe('agentux P1-5/P1-7 deterministic actions', () => {
  it('Agent 产品筛选 patch 保留 Huawei 自动竞品并受卡/对比上限约束', () => {
    const patch = buildFilterPatch('我要看 mate x7 价格走势', defaultFilters);
    expect(patch.mains?.length).toBeGreaterThan(0);
    expect(patch.mains?.length).toBeLessThanOrEqual(8);
    expect(patch.mains?.every((card) => card.auto === true)).toBe(true);
    expect(patch.mains?.every((card) => card.compares.length <= 3)).toBe(true);
  });

  it('遍历 dashboard/forecast/alerts/volume 预设 chip，均携带 intent/label/prompt', () => {
    for (const page of ['dashboard', 'forecast', 'alerts', 'volume']) {
      const actions = agentSuggestionsForPage(page);
      expect(actions.length, page).toBeGreaterThan(0);
      expect(actions.every((action) => action.label && action.intent !== 'clarify' && action.prompt), page).toBe(true);
    }
  });
});

describe('agentux P1-6 SKU disambiguation', () => {
  it('groups one model while exposing each ROM/RAM + SKU variant for switching', () => {
    const hits = productHits('Pura 90s Pro', 'RU', 'phone');
    const hit = hits.find((item) => item.modelId === 'own-huawei-pura-90s-pro');
    expect(hit).toBeDefined();
    expect(hit?.romram).toBe('12+256 GB');
    expect(hit?.variants.some((variant) => variant.romram === '12+512 GB')).toBe(true);
    expect(hit?.variants.every((variant) => variant.skuId)).toBe(true);
  });
});

describe('agentux P0-2 response deep validation', () => {
  it('rejects a malformed remote card instead of accepting it as a response', () => {
    expect(isAgentResponse({ ...baseline, cards: [{ kind: 'filter', id: 'bad', title: 'bad', patch: 'price=99999', changes: [] }] })).toBe(false);
  });
});

describe('agentux P1-4 provider badges and retry source', () => {
  it('keeps remote success and local fallback provider labels distinguishable', async () => {
    const remoteResponse = mergeRemoteResponse(baseline, { ...baseline, summary: '远端叙述', provider: { name: '远端 AI 流式', model: 'remote' } }, context.fingerprint);
    expect(remoteResponse.provider?.name).toBe('远端 AI 流式');
    const remote: AgentClient = { run: () => Promise.reject(new Error('Agent 服务异常（504）')) };
    const local: AgentClient = { run: async () => baseline };
    const fallback = await withLocalFallback(remote, local).run({ text: '查询价格', context, clientRequestId: 'req-provider', baseline });
    expect(fallback.provider?.name).toBe('本地确定性回退');
  });
});
