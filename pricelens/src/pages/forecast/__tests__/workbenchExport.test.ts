// ============================================================
// 推演工作台 v3 · 复制关键假设（任务 10 · design-proposals/forecast-global-ia-review
// 「任务 10」Step 1 导出失败测试照抄 + v3 回归补充）：
// - 文档测试（照抄）：统一预测窗 / 自动学习 / SI 待确认 12 / 12 / 价格→销量
//   关系未纳入 / 管线顺序【①基线预测】→【②大盘修正】→【③库存修正】→
//   【④成本及销毛】/ 禁词回归（置信区间 / 无约束需求 / 刚性砍 / 我司）。
// - 补充：上下文工厂收敛（makeExportContext，B.6.2）、SI 逐月确认状态、
//   手调原因、成本/价格情景与 MarginView 同源、审核状态段。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  computeWorkbench,
  setManualAdjustment,
  withMarketMonthOverride,
} from '../workbenchModel';
import { buildWorkbenchAssumptionText } from '../workbenchExport';
import { buildForecastCalendar } from '../workbenchCalendar';
import { makeExportContext, makeParams, makeResult } from './workbenchV3TestFactory';

describe('workbench v3 export', () => {
  it('exports the shared horizon and all human review states in pipeline order', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result = computeWorkbench(workbenchFixture, params);
    const calendar = buildForecastCalendar(workbenchFixture.calendar);
    const text = buildWorkbenchAssumptionText(
      workbenchFixture,
      params,
      result,
      makeExportContext(calendar, result),
    );
    expect(text).toContain('2026-11—2027-10');
    expect(text).toContain('自动学习');
    expect(text).toContain('SI 待确认 12 / 12');
    expect(text).toContain('价格→销量关系未纳入');
    expect(text.indexOf('【① 基线预测】')).toBeLessThan(text.indexOf('【② 大盘修正】'));
    expect(text.indexOf('【② 大盘修正】')).toBeLessThan(text.indexOf('【③ 库存修正】'));
    expect(text.indexOf('【③ 库存修正】')).toBeLessThan(text.indexOf('【④ 成本及销毛】'));
    for (const banned of ['置信区间', '无约束需求', '刚性砍', '我司']) {
      expect(text).not.toContain(banned);
    }
  });

  it('首段保留固定样本口径与模型版本；数字与当前 params/result 同源（禁常量）', () => {
    const params = makeParams();
    const result = makeResult(params);
    const calendar = buildForecastCalendar(workbenchFixture.calendar);
    const text = buildWorkbenchAssumptionText(
      workbenchFixture,
      params,
      result,
      makeExportContext(calendar, result),
    );
    const firstParagraph = text.split('\n\n')[0];
    expect(firstParagraph).toContain('模拟');
    expect(firstParagraph).toContain(workbenchFixture.meta.status);
    expect(firstParagraph).toContain('固定演示样本');
    expect(firstParagraph).toContain('不随全局筛选联动');
    expect(firstParagraph).toContain(workbenchFixture.meta.modelVersion);
    expect(firstParagraph).toContain('12 个月');
    // ①学习证据与 result.learning 同源
    expect(text).toContain(result.learning.algorithm);
    expect(text).toContain(`有效样本 ${result.learning.validSampleCount} 周`);
    // ③SI 逐月数值与 params.siPlanMonthly 同源（2026-11 基准值）
    expect(text).toContain('2026-11：');
    // ④销毛与 MarginView 同源（fmtMillionUsd 输出）
    expect(text).toMatch(/预测期销毛 \$[\d.]+M/);
  });

  it('SI 逐月确认状态进导出：确认后该月标「已确认」，未确认保持「待确认」并保留未全部确认警示', () => {
    const params = makeParams();
    const result = makeResult(params);
    const calendar = buildForecastCalendar(workbenchFixture.calendar);
    const baseText = buildWorkbenchAssumptionText(
      workbenchFixture,
      params,
      result,
      makeExportContext(calendar, result),
    );
    expect(baseText).toContain('SI 未全部确认');
    expect(baseText).toContain('· 待确认');
    const confirmed = makeExportContext(calendar, result);
    const firstMonth = calendar.forecastMonths[0]!.key;
    confirmed.siConfirmation = {
      byMonth: {
        [firstMonth]: { confirmedValue: params.siPlanMonthly[firstMonth] ?? 0, confirmedAt: '2026-11-03T00:00:00Z' },
      },
    };
    const confirmedText = buildWorkbenchAssumptionText(workbenchFixture, params, result, confirmed);
    expect(confirmedText).toContain('SI 待确认 11 / 12');
    expect(confirmedText).toContain('· 已确认');
  });

  it('手调原因、人工月调整、成本/价格情景与审核状态进导出', () => {
    const manual = setManualAdjustment(makeParams(), '2026W47', 60000, '黑五主峰周，电商资源加投');
    expect(manual).not.toBeNull();
    const params = withMarketMonthOverride(manual as NonNullable<ReturnType<typeof setManualAdjustment>>, '2026-11', 120, '投屏会领导上调');
    const result = makeResult(params);
    const calendar = buildForecastCalendar(workbenchFixture.calendar);
    const context = makeExportContext(calendar, result);
    context.marginView = {
      ...context.marginView,
      appliedCostCount: 1,
      appliedPriceCount: 1,
    };
    context.intelligenceReview = {
      byCandidate: {
        'candidate-a': { status: 'accepted', draft: null, appliedEventIds: ['pe-1-2026W45'], batchId: 'batch-1', reviewedAt: '2026-11-03T00:00:00Z' },
        'candidate-b': { status: 'rejected', draft: null, appliedEventIds: [], batchId: null, reviewedAt: null },
      },
    };
    const text = buildWorkbenchAssumptionText(workbenchFixture, params, result, context);
    expect(text).toContain('黑五主峰周，电商资源加投');
    expect(text).toContain('人工按月调整');
    expect(text).toContain('120');
    expect(text).toContain('成本假设 1 项');
    expect(text).toContain('价格手调 1 周');
    expect(text).toContain('已应用 1');
    expect(text).toContain('已拒绝 / 移除 1');
    // 手调段：跨卡手调值同源
    expect(text).toContain('60,000 台');
  });
});
