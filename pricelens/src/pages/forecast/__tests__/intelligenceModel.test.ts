// ============================================================
// 任务 8（AI 情报转化与人工审核）Step 1：纯函数失败测试。
// 覆盖：目标校验（market-month / product-range / cost-reference）、
// 范围外 / 倒置 blocking、名称永不 blocking、预览隔离（不写主链 params）、
// 重复检测（目标 + 类型 + 范围交集；同一情报已生成事件必提醒）、
// 成本候选只构造临时 MarginScenario（不进 WorkbenchParams）。
// 测试工厂（makeProductIntelligence / makeProductRecommendation）按任务分工
// 本地定义（B.6.2 形态；任务 10 收敛回共享 workbenchV3TestFactory）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams } from '../workbenchModel';
import { buildForecastCalendar } from '../workbenchCalendar';
import {
  buildCostScenarioPreview,
  buildEventPreview,
  findDuplicateImpacts,
  validateRecommendation,
  type EventRecommendation,
  type IntelligenceItem,
} from '../intelligenceModel';

/** B.6.2 makeProductIntelligence 本地化：模拟来源 + 当前工作台范围。 */
function makeProductIntelligence(): IntelligenceItem {
  return {
    intelligenceId: 'intelligence-sim-promo',
    title: '官方价促',
    summary: '模拟官方价促情报',
    excerpt: '模拟摘录，仅用于审核界面测试',
    sourceName: '模拟情报源',
    sourceUrl: null,
    publishedAt: '2026-11-01T00:00:00Z',
    capturedAt: '2026-11-02T00:00:00Z',
    dataStatus: 'simulated',
    scope: {
      country: workbenchFixture.context.country,
      industry: workbenchFixture.context.industry,
      channel: workbenchFixture.context.channel,
      product: workbenchFixture.context.product,
    },
  };
}

/** B.6.2 makeProductRecommendation 本地化：own-promo + 8% + 恒定 + 合法回放 id。 */
function makeProductRecommendation(startWeekId: string, endWeekId: string): EventRecommendation {
  return {
    candidateId: 'candidate-sim-promo',
    intelligenceId: 'intelligence-sim-promo',
    target: 'product-range',
    eventType: 'own-promo',
    label: '',
    range: { startWeekId, endWeekId },
    startMonth: null,
    startDay: null,
    durationMonths: null,
    magnitudePct: 8,
    decay: 'flat',
    unitCost: null,
    evidenceState: 'supported',
    missingFields: [],
    rationale: '模拟历史回放参考',
    replayId: 'rp-own-marketing',
  };
}

/** 月度大盘目标建议（本地扩展：B.4.8 market-month 校验用）。 */
function makeMarketMonthRecommendation(): EventRecommendation {
  return {
    candidateId: 'candidate-sim-market',
    intelligenceId: 'intelligence-sim-market',
    target: 'market-month',
    eventType: null,
    label: '',
    range: null,
    startMonth: '2026-11',
    startDay: 15,
    durationMonths: 2,
    magnitudePct: -6,
    decay: null,
    unitCost: null,
    evidenceState: 'partial',
    missingFields: [],
    rationale: '模拟大盘行业事件参考',
    replayId: null,
  };
}

/** 成本参考目标建议（B.6.2 makeCostRecommendation 同形态，本地化）。 */
function makeCostRecommendation(): EventRecommendation {
  return {
    candidateId: 'candidate-sim-cost',
    intelligenceId: 'intelligence-sim-cost',
    target: 'cost-reference',
    eventType: null,
    label: '',
    range: null,
    startMonth: '2026-12',
    startDay: null,
    durationMonths: null,
    magnitudePct: null,
    decay: null,
    unitCost: 600,
    evidenceState: 'supported',
    missingFields: [],
    rationale: '模拟成本版本参考',
    replayId: null,
  };
}

const calendar = buildForecastCalendar(workbenchFixture.calendar);

describe('intelligence conversion', () => {
  it('validates a product range and builds a detached preview', () => {
    const item = makeProductIntelligence();
    const recommendation = makeProductRecommendation(calendar.forecastWeeks[0].id, calendar.forecastWeeks[3].id);
    const params = baseWorkbenchParams(workbenchFixture);
    expect(validateRecommendation(item, recommendation, calendar).filter((issue) => issue.blocking)).toEqual([]);
    const preview = buildEventPreview(recommendation, params);
    expect(preview.productEvents).toHaveLength(1);
    expect(params.productEvents).toHaveLength(0);
    expect(findDuplicateImpacts(recommendation, preview, calendar)[0]?.overlapWeekIds).toHaveLength(4);
  });

  it('blocks an out-of-horizon range without requiring a name', () => {
    const item = makeProductIntelligence();
    const recommendation = { ...makeProductRecommendation('2028W01', '2028W02'), label: '' };
    const issues = validateRecommendation(item, recommendation, calendar);
    expect(issues.some((issue) => issue.field === 'range' && issue.blocking)).toBe(true);
    expect(issues.some((issue) => issue.field === 'label')).toBe(false);
  });

  it('validates market-month: 缺参 / 超时长 / 幅度越带 / 起始月范围外均 blocking', () => {
    const item = makeProductIntelligence();
    const base = makeMarketMonthRecommendation();
    expect(validateRecommendation(item, base, calendar).filter((issue) => issue.blocking)).toEqual([]);
    const missingDay = { ...base, startDay: null };
    expect(validateRecommendation(item, missingDay, calendar).some((issue) => issue.field === 'startDay' && issue.blocking)).toBe(true);
    const overDuration = { ...base, durationMonths: 13 };
    expect(validateRecommendation(item, overDuration, calendar).some((issue) => issue.field === 'durationMonths' && issue.blocking)).toBe(true);
    const overMagnitude = { ...base, magnitudePct: 45 };
    expect(validateRecommendation(item, overMagnitude, calendar).some((issue) => issue.field === 'magnitudePct' && issue.blocking)).toBe(true);
    const outOfHorizon = { ...base, startMonth: '2028-01' };
    expect(validateRecommendation(item, outOfHorizon, calendar).some((issue) => issue.blocking)).toBe(true);
  });

  it('validates cost-reference: 月份范围外 / 缺成本 / 负成本均 blocking', () => {
    const item = makeProductIntelligence();
    const base = makeCostRecommendation();
    expect(validateRecommendation(item, base, calendar).filter((issue) => issue.blocking)).toEqual([]);
    const negative = { ...base, unitCost: -1 };
    expect(validateRecommendation(item, negative, calendar).some((issue) => issue.field === 'unitCost' && issue.blocking)).toBe(true);
    const missingCost = { ...base, unitCost: null };
    expect(validateRecommendation(item, missingCost, calendar).some((issue) => issue.field === 'unitCost' && issue.blocking)).toBe(true);
    const outOfMonth = { ...base, startMonth: '2028-03' };
    expect(validateRecommendation(item, outOfMonth, calendar).some((issue) => issue.blocking)).toBe(true);
  });

  it('blocks an inverted week range (起止倒置) on field range', () => {
    const item = makeProductIntelligence();
    const start = calendar.forecastWeeks[4].id;
    const end = calendar.forecastWeeks[1].id;
    const issues = validateRecommendation(item, makeProductRecommendation(start, end), calendar);
    expect(issues.some((issue) => issue.field === 'range' && issue.blocking)).toBe(true);
  });

  it('product-range 缺类型 / 缺形状 / 缺回放 id 均 blocking；名称不 blocking', () => {
    const item = makeProductIntelligence();
    const base = makeProductRecommendation(calendar.forecastWeeks[0].id, calendar.forecastWeeks[3].id);
    const noType = { ...base, eventType: null };
    expect(validateRecommendation(item, noType, calendar).some((issue) => issue.field === 'eventType' && issue.blocking)).toBe(true);
    const noDecay = { ...base, decay: null };
    expect(validateRecommendation(item, noDecay, calendar).some((issue) => issue.field === 'decay' && issue.blocking)).toBe(true);
    const noReplay = { ...base, replayId: null };
    expect(validateRecommendation(item, noReplay, calendar).some((issue) => issue.field === 'replayId' && issue.blocking)).toBe(true);
    const named = { ...base, label: '人工命名' };
    expect(validateRecommendation(item, named, calendar).some((issue) => issue.field === 'label')).toBe(false);
  });

  it('buildEventPreview market-month：临时追加月事件且不动原 params；id 确定性', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const preview = buildEventPreview(makeMarketMonthRecommendation(), params);
    expect(preview.marketMonthEvents).toHaveLength(1);
    expect(preview.marketMonthEvents[0].id).toBe(buildEventPreview(makeMarketMonthRecommendation(), params).marketMonthEvents[0].id);
    expect(params.marketMonthEvents).toHaveLength(0);
    expect(preview.siPlanMonthly).toBe(params.siPlanMonthly);
  });

  it('buildEventPreview cost-reference：不写主链 params（返回原 params 内容不变）', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const preview = buildEventPreview(makeCostRecommendation(), params);
    expect(preview.productEvents).toHaveLength(0);
    expect(preview.marketMonthEvents).toHaveLength(0);
    expect(preview.marketMonthOverrides).toBe(params.marketMonthOverrides);
  });

  it('buildCostScenarioPreview：只构造临时 MarginScenario 成本记录，不改价格侧', () => {
    const scenario = buildCostScenarioPreview(makeCostRecommendation(), { costOverrides: {}, priceOverrides: {} });
    expect(Object.keys(scenario.costOverrides)).toEqual(['2026-12']);
    expect(scenario.costOverrides['2026-12'].unitCost).toBe(600);
    expect(scenario.priceOverrides).toEqual({});
  });

  it('findDuplicateImpacts：同目标同类型范围交集才提醒；干净 params 无重复', () => {
    const recommendation = makeProductRecommendation(calendar.forecastWeeks[0].id, calendar.forecastWeeks[3].id);
    const clean = baseWorkbenchParams(workbenchFixture);
    expect(findDuplicateImpacts(recommendation, clean, calendar)).toEqual([]);
    // 同类型不同范围（不重叠）不提醒。
    const otherRange = {
      ...clean,
      productEvents: [{
        id: 'pe-existing', type: 'own-promo' as const, label: '', startWeekId: calendar.forecastWeeks[8].id,
        endWeekId: calendar.forecastWeeks[9].id, magnitudePct: 5, decay: 'flat' as const, replayId: 'rp-own-marketing',
      }],
    };
    expect(findDuplicateImpacts(recommendation, otherRange, calendar)).toEqual([]);
    // 同类型重叠范围提醒（含交集周清单）。
    const overlapping = {
      ...clean,
      productEvents: [{
        id: 'pe-overlap', type: 'own-promo' as const, label: '', startWeekId: calendar.forecastWeeks[2].id,
        endWeekId: calendar.forecastWeeks[5].id, magnitudePct: 5, decay: 'flat' as const, replayId: 'rp-own-marketing',
      }],
    };
    const impacts = findDuplicateImpacts(recommendation, overlapping, calendar);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].eventId).toBe('pe-overlap');
    // 交集 = 候选 [0..3] ∩ 已有 [2..5] = [2..3]。
    expect(impacts[0].overlapWeekIds).toEqual([
      calendar.forecastWeeks[2].id,
      calendar.forecastWeeks[3].id,
    ]);
    // 不同类型重叠不提醒（目标 + 类型 + 范围交集三条件同时成立才提醒）。
    const otherType = { ...overlapping, productEvents: [{ ...overlapping.productEvents[0], type: 'competitor-launch' as const }] };
    expect(findDuplicateImpacts(recommendation, otherType, calendar)).toEqual([]);
  });

  it('findDuplicateImpacts market-month：覆盖月交集提醒，落点为交集月预测周', () => {
    const recommendation = makeMarketMonthRecommendation();
    const withEvent = {
      ...baseWorkbenchParams(workbenchFixture),
      marketMonthEvents: [{
        id: 'me-existing', label: '', startMonth: '2026-12', startDay: 1, durationMonths: 2, magnitudePct: 4,
      }],
    };
    const impacts = findDuplicateImpacts(recommendation, withEvent, calendar);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].eventId).toBe('me-existing');
    expect(impacts[0].overlapWeekIds.length).toBeGreaterThan(0);
    const overlapMonths = new Set(impacts[0].overlapWeekIds.map((weekId) => calendar.weekById.get(weekId)?.monthKey));
    expect(overlapMonths.has('2026-12')).toBe(true);
    expect(findDuplicateImpacts(recommendation, baseWorkbenchParams(workbenchFixture), calendar)).toEqual([]);
  });
});
