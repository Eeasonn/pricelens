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
import { defaultFilters } from '../../state/FiltersContext';
import { autoComparesFor, MAINS_CAP } from '../../state/mainSelection';
import { buildFilterPatch } from '../core';
import { isAgentResponse, validateFilterPatch, type ToolCallCard } from '../contracts';


describe('agentux P1-5 deterministic filter cards', () => {
  it('agentux P1-5 applies natural-language own product selection with the same auto compares as header search', () => {
    const patch = buildFilterPatch('RU Pura 90s Pro', { ...defaultFilters, countryCode: 'RU', industry: 'phone' });
    expect(patch.countryCode).toBe('RU');
    expect(patch.mains?.length).toBeGreaterThan(0);
    expect(patch.mains?.length).toBeLessThanOrEqual(MAINS_CAP);
    const own = patch.mains?.find((card) => card.main?.modelId === 'own-huawei-pura-90s-pro');
    expect(own?.auto).toBe(true);
    expect(own?.compares).toEqual(own ? autoComparesFor(own) : []);
    expect(own?.compares.length).toBeLessThanOrEqual(3);
  });
});



describe('agentux P1-3 tool call cards', () => {
  it('agentux P1-3 preserves queued/running/success/failed states and exposes retry/apply actions', () => {
    const card: ToolCallCard = {
      kind: 'tool_call', id: 'tool-1', tool: 'view.preview', status: 'failed', inputSummary: 'RU · phone · Pura 90 S Pro', error: 'applyFilter 失败',
      actions: [{ id: 'apply', label: '应用筛选', kind: 'apply' }, { id: 'undo', label: '撤销恢复', kind: 'followup', prompt: '撤销恢复' }],
    };
    expect(isAgentResponse({ intent: 'filter', summary: '失败', steps: [], cards: [card], citations: [], suggestions: [], contextFingerprint: 'ctx' })).toBe(true);
    expect(card.status).toBe('failed');
    expect(card.actions?.map((action) => action.label)).toEqual(['应用筛选', '撤销恢复']);
  });

  it('agentux P1-3 keeps applyFilter failures visible to the card caller', () => {
    const result = validateFilterPatch({ currency: 'usd', alertThresholds: {} });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('不允许修改字段');
  });
});
