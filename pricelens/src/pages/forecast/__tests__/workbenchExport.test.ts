// ============================================================
// 推演工作台 v2 · 复制关键假设（WP6 8.4）纯函数测试：
// 输出顺序固定（模拟状态在首段）、必含 手调原因/模型版本/SI/库存规则/
// 结果摘要、数字与当前 params/result 同源（禁常量）、无 UI 禁词。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  computeWorkbench,
  setManualAdjustment,
  withQuarterOverride,
} from '../workbenchModel';
import { buildWorkbenchAssumptionText } from '../workbenchExport';
import { fmtMillionUsd, fmtWan } from '../WorkbenchBits';

const fixture = workbenchFixture;

const SECTION_ORDER = [
  '【范围与模拟状态】',
  '【模型版本】',
  '【季度基线与人工覆盖】',
  '【行业事件】',
  '【大盘月度事件】',
  '【大盘按月人工调整】',
  '【上一代参照】',
  '【产品事件】',
  '【SI 月计划】',
  '【手调】',
  '【库存规则】',
  '【结果摘要】',
] as const;

function sectionHeaders(text: string): string[] {
  return text.split('\n\n').map((section) => {
    const end = section.indexOf('】');
    return end >= 0 ? section.slice(0, end + 1) : section;
  });
}

describe('buildWorkbenchAssumptionText（WP6 8.4）', () => {
  it('段落顺序固定：范围与模拟状态 → 模型版本 → 季度基线与人工覆盖 → 行业事件 → 上一代参照 → 产品事件 → SI → 手调 → 库存规则 → 结果摘要', () => {
    const params = baseWorkbenchParams(fixture);
    const result = computeWorkbench(fixture, params);
    const headers = sectionHeaders(buildWorkbenchAssumptionText(fixture, params, result));
    expect(headers).toEqual([...SECTION_ORDER]);
  });

  it('模拟状态必须在首段；含固定样本口径与不随全局筛选联动', () => {
    const params = baseWorkbenchParams(fixture);
    const result = computeWorkbench(fixture, params);
    const text = buildWorkbenchAssumptionText(fixture, params, result);
    const firstParagraph = text.split('\n\n')[0];
    expect(firstParagraph).toContain('模拟');
    expect(firstParagraph).toContain(fixture.meta.status);
    expect(firstParagraph).toContain('固定演示样本');
    expect(firstParagraph).toContain('不随全局筛选联动');
  });

  it('必含：模型版本、手调原因、SI 月计划、库存规则（DOS 带/降幅/阈值未核定）、结果摘要数字与 result 同源', () => {
    const withManual = setManualAdjustment(baseWorkbenchParams(fixture), 47, 60000, '黑五主峰周，电商资源加投');
    expect(withManual).not.toBeNull();
    const params = withManual as NonNullable<ReturnType<typeof setManualAdjustment>>;
    const result = computeWorkbench(fixture, params);
    const text = buildWorkbenchAssumptionText(fixture, params, result);

    expect(text).toContain(fixture.meta.modelVersion);
    expect(text).toContain('黑五主峰周，电商资源加投');
    expect(text).toContain('220,000 台'); // 2026-11 SI 月计划（基准值）
    expect(text).toContain(`DOS ${70}–${90} 天`);
    expect(text).toContain('阈值未核定');
    // 结果摘要全部来自 result.summary（禁常量）
    expect(text).toContain(fmtWan(result.summary.totalSales));
    expect(text).toContain(`W${result.summary.peak.weekNumber} ${fmtWan(result.summary.peak.value)}`);
    expect(text).toContain(fmtMillionUsd(result.summary.forecastMargin));
    expect(text).toContain(fmtMillionUsd(result.summary.historyMargin));
    // 手调值进手调段
    expect(text).toContain('60,000 台');
  });

  it('季度人工覆盖经 withQuarterOverride 后，来源写「人工覆盖」且数值为改后值；还原回「AI 基线」', () => {
    const edited = withQuarterOverride(baseWorkbenchParams(fixture), 'q4', 130);
    const result = computeWorkbench(fixture, edited);
    const text = buildWorkbenchAssumptionText(fixture, edited, result);
    expect(text).toContain('人工覆盖');
    expect(text).toContain('130');
    const restored = withQuarterOverride(edited, 'q4', null);
    const restoredText = buildWorkbenchAssumptionText(fixture, restored, computeWorkbench(fixture, restored));
    expect(restoredText).toContain('来源：AI 基线');
    expect(restoredText).not.toContain('来源：人工覆盖');
  });

  it('基准参数：手调/产品事件写「无」；上一代参照段含同周龄比值读数（来自 consider，不另算）', () => {
    const params = baseWorkbenchParams(fixture);
    const result = computeWorkbench(fixture, params);
    const text = buildWorkbenchAssumptionText(fixture, params, result);
    expect(text).toContain('【手调】无手调');
    expect(text).toContain('【产品事件】无');
    expect(text).toContain('【行业事件】（人工录入假设，共 2 条）');
    expect(text).toContain('折叠屏阵营扩容');
    expect(text).toContain('内存供应涨价');
    const referenceSection = text.split('【上一代参照】')[1]?.split('\n\n')[0] ?? '';
    expect(referenceSection).toContain(fixture.references.prevGenPool[0].label);
    expect(referenceSection).toContain('同周龄比值');
  });

  it('产品事件列出预填幅度与回放场景；禁词（因子/约束/置信区间/无约束需求/我司）为零', () => {
    const params = baseWorkbenchParams(fixture);
    params.productEvents.push({
      id: 'pe-test-46',
      type: 'competitor-launch',
      label: 'Galaxy S26 Ultra 上市',
      week: 46,
      magnitudePct: -6,
      replayId: 'rp-comp-promo',
    });
    const result = computeWorkbench(fixture, params);
    const text = buildWorkbenchAssumptionText(fixture, params, result);
    expect(text).toContain('Galaxy S26 Ultra 上市');
    expect(text).toContain('−6%');
    expect(text).toContain('友商促销 / 新品上市期');
    for (const banned of ['因子', '约束', '置信区间', '无约束需求', '我司']) {
      expect(text).not.toContain(banned);
    }
  });
});
