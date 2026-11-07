// ============================================================
// t428u Batch1（稳定线）：结果卡 / 状态 / 证据合约测试。
// 固定结构（结论→事实→计算/规则→判断边界→动作）、药丸动作真实可执行
// （open=导航、evidence=卡内展开、followup=带上下文重跑）、空态给调整范围
// 动作、上下文不足给可操作补齐建议；无证据不虚构（时间未知=待确认）。
// ============================================================
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
import { dimProduct, dimTime } from '../../data';
import { buildCards } from '../../state/mainSelection';
import { buildAgentContext, clarificationReasonForQuery, classifyIntent, runAgent } from '../core';
import { calculatePriceAdvantage } from '../priceAdvantage';
import { isAgentResponse, type AgentAlertRecord } from '../contracts';

const EMPTY_MAINS = { ...defaultFilters, mains: [] };

describe('t428u 稳定线 · 价格优势结果卡固定结构与真实动作', () => {
  it('药丸动作绑定真实能力：回看价格走势(dashboard)/打开价格预警(alerts)/查看证据(卡内)', async () => {
    const response = await runAgent('价格优势', buildAgentContext('dashboard', EMPTY_MAINS, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    const labels = (card.actions ?? []).map((action) => action.label);
    expect(labels).toContain('回看价格走势');
    expect(labels).toContain('打开价格预警');
    expect(labels).toContain('查看证据');
    const trend = card.actions!.find((action) => action.label === '回看价格走势')!;
    const alerts = card.actions!.find((action) => action.label === '打开价格预警')!;
    const evidence = card.actions!.find((action) => action.label === '查看证据')!;
    expect(trend.kind).toBe('open');
    expect(trend.target?.page).toBe('dashboard');
    expect(trend.target?.contextFingerprint).toBe(response.contextFingerprint);
    expect(alerts.kind).toBe('open');
    expect(alerts.target?.page).toBe('alerts');
    expect(evidence.kind).toBe('evidence');
  });

  it('判断边界随卡提供且不出现编造的置信度百分比', async () => {
    const response = await runAgent('价格优势', buildAgentContext('dashboard', EMPTY_MAINS, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    expect(card.boundaries?.length).toBeGreaterThan(0);
    for (const boundary of card.boundaries ?? []) expect(/置信|信心/.test(boundary)).toBe(false);
    expect(card.note).toContain('折后价');
  });

  it('空结果提供可执行的调整范围动作（followup 重跑，只读）', () => {
    const card = calculatePriceAdvantage(EMPTY_MAINS, 'ctx-empty');
    expect(card).toBeDefined();
    if (!card) return;
    expect(card.rows).toHaveLength(0);
    const adjust = (card.actions ?? []).find((action) => action.label.includes('调整范围'));
    expect(adjust?.kind).toBe('followup');
    expect(adjust?.prompt).toContain('重新计算价格优势');
  });

  it('证据来源真实；无采集时间时不伪造时间戳（UI 显示待确认）', async () => {
    const response = await runAgent('价格优势', buildAgentContext('dashboard', EMPTY_MAINS, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    expect(card.evidence?.[0]?.source).toBe('统一价格聚合引擎');
    expect(card.evidence?.[0]?.timestamp).toBeUndefined();
  });
});

describe('t428u 稳定线 · 预警结果卡动作与边界', () => {
  const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'));
  const alertRecord: AgentAlertRecord | undefined = own
    ? {
        key: 'alert-test-1',
        alertId: 'alert-test-1',
        seriesKey: `${own.model_id}__${own.romram.replace(/\s+/g, '')}`,
        type: 'price-change',
        brand: own.brand,
        modelName: own.model_name,
        romram: own.romram,
        weekLabel: '示例周',
        weekId: '202628',
        price: 79990,
        wowPct: -0.031,
        promoDeltaPp: null,
        gapPct: null,
        gapLowPlatform: null,
        gapHighPlatform: null,
        gapLowPrice: null,
        gapHighPrice: null,
        isOwn: true,
        ruleVersion: 'alerts-v1',
        dataVersion: 'real-alert-v1',
        evidenceStatus: 'verified',
        evidence: [{ id: 'ev-1', label: '触发事实', detail: '202628 · 本地规则', source: '预警引擎' }],
      }
    : undefined;

  it('卡级动作真实：查看证据(evidence) + 打开价格预警(open alerts)；判断边界不推断因果', async () => {
    expect(alertRecord).toBeDefined();
    if (!alertRecord) return;
    const response = await runAgent('价格预警', buildAgentContext('alerts', EMPTY_MAINS, [alertRecord]), undefined, 'alert');
    const card = response.cards.find((item) => item.kind === 'alert');
    expect(card?.kind).toBe('alert');
    if (card?.kind !== 'alert') return;
    const evidence = (card.actions ?? []).find((action) => action.label === '查看证据');
    const open = (card.actions ?? []).find((action) => action.label === '打开价格预警');
    expect(evidence?.kind).toBe('evidence');
    expect(open?.kind).toBe('open');
    expect(open?.target?.page).toBe('alerts');
    expect(card.boundaries?.length).toBeGreaterThan(0);
    expect(card.boundaries?.some((boundary) => boundary.includes('不推断唯一因果'))).toBe(true);
    expect(card.facts.length).toBeGreaterThan(0);
  });

  it('无预警时诚实空态：不编造事件，动作指向真实预警中心', async () => {
    const response = await runAgent('价格预警', buildAgentContext('alerts', EMPTY_MAINS, []), undefined, 'alert');
    const card = response.cards[0];
    expect(card.kind).toBe('table');
    if (card.kind !== 'table') return;
    expect(card.title).toContain('没有触发事件');
    expect(card.note).toContain('不编造事件');
    expect(card.actions?.[0]?.kind).toBe('open');
    expect(card.actions?.[0]?.target?.page).toBe('alerts');
  });
});

describe('t428u 稳定线 · 上下文不足与无数据的可操作状态', () => {
  it('clarify 给出能直接补齐口径的建议，且建议提示词不再落入 clarify', async () => {
    const context = buildAgentContext('dashboard', EMPTY_MAINS, []);
    const response = await runAgent('最便宜', context);
    expect(response.intent).toBe('clarify');
    const suggestion = response.suggestions.find((item) => typeof item !== 'string' && item.label.includes('补齐产品'));
    expect(suggestion).toBeDefined();
    if (typeof suggestion === 'string' || !suggestion) return;
    // 建议必须是真实可执行的：按同一状态重问不会再触发同一个澄清。
    expect(clarificationReasonForQuery(suggestion.prompt, EMPTY_MAINS)).toBeNull();
    expect(response.summary).toContain('确认产品');
  });

  it('时间范围不足时给出补齐时间的建议', async () => {
    const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes(defaultFilters.countryCode));
    expect(own).toBeDefined();
    if (!own) return;
    const state = { ...defaultFilters, mains: buildCards([{ modelId: own.model_id, romram: own.romram, skuIds: [own.sku_id] }], { auto: true }) };
    const response = await runAgent(`${own.model_name} 最近价格怎么样`, buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('clarify');
    const suggestion = response.suggestions.find((item) => typeof item !== 'string' && item.label.includes('补齐时间'));
    expect(suggestion).toBeDefined();
    if (typeof suggestion === 'string' || !suggestion) return;
    expect(clarificationReasonForQuery(suggestion.prompt, state)).toBeNull();
  });

  it('目标国家无数据时返回无数据结果并附调整范围动作', async () => {
    // 选整个型号（所有 SKU 行）都不在 RU 销售的手机，保证查询必然无数据。
    const notInRu = dimProduct.find((row) => row.industry === 'phone'
      && !dimProduct.some((other) => other.model_id === row.model_id && other.countries.includes('RU')));
    expect(notInRu).toBeDefined();
    if (!notInRu) return;
    // 「多少钱」不触发 targeted 关键词的自动带出兜底，保证走无数据分支。
    const response = await runAgent(`RU ${notInRu.model_name} 多少钱`, buildAgentContext('dashboard', EMPTY_MAINS, []));
    const card = response.cards[0];
    expect(card.kind).toBe('table');
    if (card.kind !== 'table') return;
    expect(card.rows[0][2]).toBe('无可用价格数据');
    expect(card.actions?.some((action) => action.kind === 'followup' && action.label.includes('调整范围'))).toBe(true);
    expect(response.summary).toContain('没有可用的价格数据');
  });
});

describe('t428u 稳定线 · 合约向后兼容', () => {
  it('新增 evidence 动作与 boundaries 字段后，远端边界校验仍接受本地响应（含卡校验）', async () => {
    const response = await runAgent('价格优势', buildAgentContext('dashboard', EMPTY_MAINS, []));
    expect(isAgentResponse(response)).toBe(true);
    const alert = await runAgent('价格预警', buildAgentContext('alerts', EMPTY_MAINS, []), undefined, 'alert');
    expect(isAgentResponse(alert)).toBe(true);
  });
});

// ============================================================
// t428u Batch1 返修 R1–R8：stale gate 豁免、空卡固定结构、
// 范围建议重算、跨国回看 filterPatch、时间建议先并口径。
// ============================================================
describe('t428u 返修 R1 · evidence 动作不受 stale gate 影响', () => {
  it('scopeCardActions 不给 evidence 动作挂 target，导航类动作仍带 target 受保护', async () => {
    const response = await runAgent('价格优势', buildAgentContext('dashboard', EMPTY_MAINS, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    const evidence = card.actions!.find((action) => action.kind === 'evidence')!;
    expect(evidence.label).toBe('查看证据');
    expect(evidence.target).toBeUndefined();
    const open = card.actions!.find((action) => action.label === '回看价格走势')!;
    expect(open.kind).toBe('open');
    expect(open.target?.contextFingerprint).toBe(response.contextFingerprint);
  });

  it('真实预警卡的「查看证据」动作同样不携带 target', async () => {
    const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'));
    expect(own).toBeDefined();
    if (!own) return;
    const record: AgentAlertRecord = {
      key: 'alert-r1', alertId: 'alert-r1', seriesKey: `${own.model_id}__${own.romram.replace(/\s+/g, '')}`,
      type: 'price-change', brand: own.brand, modelName: own.model_name, romram: own.romram,
      weekLabel: '示例周', weekId: '202628', price: 79990, wowPct: -0.031, promoDeltaPp: null,
      gapPct: null, gapLowPlatform: null, gapHighPlatform: null, gapLowPrice: null, gapHighPrice: null,
      isOwn: true, ruleVersion: 'alerts-v1', dataVersion: 'real-alert-v1', evidenceStatus: 'verified',
      evidence: [{ id: 'ev-r1', label: '触发事实', detail: '202628 · 本地规则', source: '预警引擎' }],
    };
    const response = await runAgent('价格预警', buildAgentContext('alerts', EMPTY_MAINS, [record]), undefined, 'alert');
    const card = response.cards.find((item) => item.kind === 'alert');
    if (card?.kind !== 'alert') throw new Error('missing alert card');
    const evidence = card.actions!.find((action) => action.kind === 'evidence')!;
    expect(evidence.target).toBeUndefined();
    const open = card.actions!.find((action) => action.label === '打开价格预警')!;
    expect(open.target?.contextFingerprint).toBe(response.contextFingerprint);
  });
});

describe('t428u 返修 R2 · 空预警/未监控卡补齐固定结构', () => {
  it('空预警卡显式给出 计算/规则（查了哪些规则/口径）与判断边界（订阅/缺数）', async () => {
    const response = await runAgent('价格预警', buildAgentContext('alerts', EMPTY_MAINS, []), undefined, 'alert');
    const card = response.cards[0];
    expect(card.kind).toBe('table');
    if (card.kind !== 'table') return;
    expect(card.rules).toBeDefined();
    expect(card.rules).toContain('调价');
    expect(card.rules).toContain('平台价差');
    expect(card.rules).toContain('0 个订阅系列');
    expect(card.boundaries?.length).toBeGreaterThanOrEqual(2);
    expect(card.boundaries?.some((item) => item.includes('未订阅'))).toBe(true);
    expect(card.boundaries?.some((item) => item.includes('缺采周'))).toBe(true);
    // 动作仍真实可执行（open 指向预警中心）
    expect(card.actions?.[0]?.kind).toBe('open');
    expect(card.actions?.[0]?.target?.page).toBe('alerts');
  });
});

describe('t428u 返修 R4 · 「调整范围 · 最近 12 周」必须重算价格优势', () => {
  it('调整范围提示词命中 query 意图并以最近 12 周重跑 price_advantage（不是只改筛选）', async () => {
    // 数据期之前的范围 → 无共同价格事实 → 空优势卡带「调整范围 · 最近 12 周」动作
    const state = { ...EMPTY_MAINS, adaptive: false, rangeStart: '202601', rangeEnd: '202604' };
    const context = buildAgentContext('dashboard', state, []);
    const first = await runAgent('价格优势', context);
    const emptyCard = first.cards.find((item) => item.kind === 'price_advantage');
    if (emptyCard?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    expect(emptyCard.rows).toHaveLength(0);
    const adjust = emptyCard.actions!.find((action) => action.label.includes('调整范围'))!;
    expect(adjust.prompt).toContain('最近 12 周');
    expect(classifyIntent(adjust.prompt!)).toBe('query');
    const second = await runAgent(adjust.prompt!, context);
    expect(second.intent).toBe('query');
    expect(second.cards.some((item) => item.kind === 'filter')).toBe(false);
    const card = second.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing recomputed price_advantage card');
    const buckets = dimTime.map((time) => time.week_id);
    const expectedRange = `${buckets[buckets.length - 12]}–${buckets[buckets.length - 1]}`;
    expect(card.evidence?.[0]?.detail).toContain(expectedRange);
    expect(card.rows.length).toBeGreaterThan(0);
  });
});

describe('t428u 返修 R5 · 跨国回看导航带请求国家 filterPatch', () => {
  it('AE 页问「RU 价格优势」→ 回看动作携带 RU 国家与实际对比周范围', async () => {
    const aeState = { ...defaultFilters, countryCode: 'AE', mains: [] };
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', aeState, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    expect(card.countryCode).toBe('RU');
    const back = card.actions!.find((action) => action.label === '回看价格走势')!;
    expect(back.kind).toBe('open');
    expect(back.target?.page).toBe('dashboard');
    expect(back.target?.filterPatch?.countryCode).toBe('RU');
    expect(back.target?.filterPatch?.granularity).toBe('week');
    if (card.rows.length) {
      expect(back.target?.filterPatch?.rangeEnd).toBe(card.rows[0].weekId);
      expect(back.target?.filterPatch?.rangeStart).toBe(card.rows[card.rows.length - 1].weekId);
    }
  });
});

describe('t428u 返修 R6 · 「最近 8 周」建议先并入新范围再查询', () => {
  it('forced query 的「查看最近 8 周的价格趋势」输出卡反映最近 8 周口径', async () => {
    const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes(defaultFilters.countryCode));
    expect(own).toBeDefined();
    if (!own) return;
    const state = {
      ...defaultFilters,
      mains: buildCards([{ modelId: own.model_id, romram: own.romram, skuIds: [own.sku_id] }], { auto: true, countryCode: defaultFilters.countryCode }),
      adaptive: false,
      rangeStart: dimTime[0].week_id,
      rangeEnd: dimTime[dimTime.length - 1].week_id,
    };
    // 面板点击「补齐时间 · 最近 8 周」建议 = 以显式 query 意图发送该提示词
    const response = await runAgent('查看最近 8 周的价格趋势', buildAgentContext('dashboard', state, []), undefined, 'query');
    const chart = response.cards.find((item) => item.kind === 'chart');
    if (chart?.kind !== 'chart') throw new Error('missing chart card');
    const buckets = dimTime.map((time) => time.week_id);
    const expectedRange = `${buckets[buckets.length - 8]}–${buckets[buckets.length - 1]}`;
    expect(chart.note).toContain(expectedRange);
  });
});
