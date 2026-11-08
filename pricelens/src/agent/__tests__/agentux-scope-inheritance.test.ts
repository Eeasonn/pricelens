import { describe, expect, it } from 'vitest';
import { defaultFilters } from '../../state/FiltersContext';
import { buildCards } from '../../state/mainSelection';
import type { FiltersState } from '../../state/filtersTypes';
import { buildAgentContext, runAgent } from '../core';
import { buildAgentContext as buildStableAgentContext, runAgent as runStableAgent } from '../../agent-stable/core';

const NOVA = {
  modelId: 'own-huawei-nova-14-pro',
  romram: '12+512 GB',
  skuIds: ['own-huawei-nova-14-pro__12-512gb__black'],
};

describe('iterate Agent followup scope envelope', () => {
  it('把跨国结果卡追问绑定到生成时的国家、产品、平台和时间范围', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'AE',
      platform: { platforms: ['NOON'], shopIds: [], seller: null },
      granularity: 'week',
      adaptive: false,
      rangeStart: '202635',
      rangeEnd: '202642',
      mains: buildCards([NOVA]),
    };
    const response = await runAgent('RU nova 14 Pro 最近 8 周价格趋势', buildAgentContext('dashboard', state, []));
    const chart = response.cards.find((card) => card.kind === 'chart');
    expect(chart?.kind).toBe('chart');
    if (chart?.kind !== 'chart') return;
    const followup = chart.actions?.find((action) => action.kind === 'followup');
    expect(followup?.filterPatch?.countryCode).toBe('RU');
    expect(followup?.filterPatch?.mains?.[0]?.main?.modelId).toBe('own-huawei-nova-14-pro');
    expect(followup?.filterPatch?.platform).toBeNull();
    expect(followup?.filterPatch?.granularity).toBe('week');
    expect(followup?.filterPatch?.rangeStart).toBe('202638');
    expect(followup?.filterPatch?.rangeEnd).toBe('202645');
    expect(followup?.target?.filterPatch).toEqual(followup?.filterPatch);
  });

  it('摘要表追问与图表追问共享同一份生成时 scope', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: { platforms: ['OZON'], shopIds: [], seller: null },
      granularity: 'week',
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const response = await runAgent('价格趋势', buildAgentContext('dashboard', state, []));
    const chart = response.cards.find((card) => card.kind === 'chart');
    const table = response.cards.find((card) => card.kind === 'table');
    expect(chart?.kind).toBe('chart');
    expect(table?.kind).toBe('table');
    if (chart?.kind !== 'chart' || table?.kind !== 'table') return;
    const chartFollowup = chart.actions?.find((action) => action.kind === 'followup');
    const tableFollowup = table.actions?.find((action) => action.kind === 'followup');
    expect(chartFollowup?.filterPatch).toEqual(tableFollowup?.filterPatch);
    expect(chartFollowup?.target?.filterPatch).toEqual(tableFollowup?.target?.filterPatch);
    expect(chartFollowup?.filterPatch?.platform).toEqual(state.platform);
    expect(chartFollowup?.filterPatch?.rangeStart).toBe('202619');
    expect(chartFollowup?.filterPatch?.rangeEnd).toBe('202619');
  });

  it('多轮追问沿用结果 scope，但用户新指定国家和产品后覆盖旧 scope', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      granularity: 'week',
      adaptive: false,
      rangeStart: '202635',
      rangeEnd: '202642',
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const first = await runAgent('FR nova 14 Pro 最近 8 周价格趋势', buildAgentContext('dashboard', state, []));
    expect(first.scopeLabel).toContain('法国');
    const chart = first.cards.find((card) => card.kind === 'chart');
    if (chart?.kind !== 'chart') throw new Error('missing chart');
    const followup = chart.actions?.find((action) => action.kind === 'followup');
    expect(followup?.filterPatch?.countryCode).toBe('FR');
    const inheritedState = { ...state, ...followup?.filterPatch };
    const inherited = await runAgent(followup?.prompt ?? '解释趋势变化', buildAgentContext('dashboard', inheritedState, []));
    expect(inherited.scopeLabel).toContain('法国');
    const explicit = await runAgent('RU nova 14 Pro 价格趋势', buildAgentContext('dashboard', inheritedState, []));
    expect(explicit.scopeLabel).toContain('R国');
    expect(explicit.scopeLabel).not.toContain('法国');
  });

  it('稳定线追问也携带生成时 scope，避免稳定面板回到当前页口径', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'AE',
      platform: { platforms: ['NOON'], shopIds: [], seller: null },
      granularity: 'week',
      adaptive: false,
      rangeStart: '202635',
      rangeEnd: '202642',
      mains: buildCards([NOVA], { auto: true, countryCode: 'AE' }),
    };
    const response = await runStableAgent('RU nova 14 Pro 价格趋势', buildStableAgentContext('dashboard', state, []));
    const chart = response.cards.find((card) => card.kind === 'chart');
    expect(chart?.kind).toBe('chart');
    if (chart?.kind !== 'chart') return;
    const followup = chart.actions?.find((action) => action.kind === 'followup');
    expect(followup?.target?.filterPatch?.countryCode).toBe('RU');
    expect(followup?.target?.filterPatch?.mains?.[0]?.main?.modelId).toBe('own-huawei-nova-14-pro');
    expect(followup?.target?.filterPatch?.rangeStart).toBe('202635');
    expect(followup?.target?.filterPatch?.rangeEnd).toBe('202642');
  });
});
