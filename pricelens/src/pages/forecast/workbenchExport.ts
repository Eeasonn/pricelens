// ============================================================
// 量价预测 · 推演工作台 v3 关键假设复制（任务 10 · IA 文档 B.5.10 / 任务 10 Step 3）：
// 纯文本构造函数，不调用 Agent、不生成无依据结论、不新增纪要层。
// 输出顺序固定 = 管线顺序（B.5.1 / 任务 10）：
//   【范围与模拟状态】→【① 基线预测】→【② 大盘修正】→【③ 库存修正】→
//   【④ 成本及销毛】→ 其余（上一代参照 / 产品事件 / 手调 / 审核状态）。
// context 固定含 calendar / learning / siConfirmation / marginView /
// intelligenceReview（B.6.2 makeExportContext 同构）：统一预测窗、SI 逐月
// 确认状态、MarginView 销毛与覆盖、情报审核计数全部与页面同源。
// SI 未全部确认或学习回退时输出显式警示（B.5.7 / 任务 10 Step 3）；
// 价格→销量关系未拍板前输出「价格→销量关系未纳入 · 暂不联动销量」。
// 全部数字来自当前 params / result / context（模型常量 DOS_BAND 等直接引用
// 模型导出），不另写常量——与页面展示同源（fmtWan / fmtMillionUsd）。
// 禁词：置信区间 / 无约束需求 / 刚性砍 / 我司（含「因子 / 约束」旧话术）。
// ============================================================
import type { WorkbenchFixture } from './workbenchFixture';
import type { ForecastCalendar } from './workbenchCalendar';
import { siMonthStatusOf } from './useSiConfirmations';
import type { SiConfirmationState } from './useSiConfirmations';
import type { MarginView } from './marginScenarioModel';
import { forecastMarginRateOf } from './marginScenarioModel';
import type { IntelligenceReviewState } from './intelligenceModel';
import {
  DOS_BAND,
  INV_CRASH_HEAVY_PCT,
  INV_CRASH_LIGHT_PCT,
  overrideSourceOf,
  type WorkbenchParams,
  type WorkbenchResult,
} from './workbenchModel';
import { marketEventDisposition } from './workbenchTime';
import { fmtMillionUsd, fmtWan } from './WorkbenchBits';

/** 导出上下文（B.6.2 makeExportContext 同构；页面与测试共用同一形状）。 */
export interface WorkbenchExportContext {
  /** 统一日历（12 个预测月与跨年 WeekId 唯一来源）。 */
  calendar: ForecastCalendar;
  /** ①学习运行（证据 + 参照 + 逐周产品事件乘子；= result.learning）。 */
  learning: WorkbenchResult['learning'];
  /** SI 逐月确认工作区（数值仍以 params.siPlanMonthly 为准）。 */
  siConfirmation: SiConfirmationState;
  /** 统一销毛视图（与④和主图摘要同源）。 */
  marginView: MarginView;
  /** 情报候选审核工作区（来源映射不进 params，只出审核状态）。 */
  intelligenceReview: IntelligenceReviewState;
}

const signedPct = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`;

/** ①学习状态文案（与 PipelineNav 同一映射：自动学习 / 部分样本 / 回退）。 */
function learningStatusText(status: 'completed' | 'partial' | 'fallback'): string {
  if (status === 'completed') return '自动学习';
  return status === 'partial' ? '自动学习 · 部分样本' : '学习回退';
}

/**
 * 「复制关键假设」结构化纯文本（v3 管线顺序）：顺序固定；模拟状态必须在首段；
 * 每个数字都来自当前 params / result / context。
 */
export function buildWorkbenchAssumptionText(
  fixture: WorkbenchFixture,
  params: WorkbenchParams,
  result: WorkbenchResult,
  context: WorkbenchExportContext,
): string {
  const { calendar } = context;
  const lines: string[] = [];

  // 1. 范围与模拟状态（首段必须带模拟状态 + 统一预测窗）
  const firstMonthKey = calendar.forecastMonths[0]?.key ?? '';
  const lastMonthKey = calendar.forecastMonths[calendar.forecastMonths.length - 1]?.key ?? '';
  lines.push(
    `【范围与模拟状态】固定演示样本（不随全局筛选联动）：${fixture.context.country} · ${fixture.context.industry} · `
    + `${fixture.context.channel} · ${fixture.context.product}；模型版本 ${fixture.meta.modelVersion}（来源 ${fixture.meta.source}），`
    + `数据状态 = 模拟（${fixture.meta.status}），全部数值为演示假设，不代表真实市场；`
    + `统一预测窗 ${firstMonthKey}—${lastMonthKey}（${calendar.forecastMonths.length} 个月），`
    + `历史 ${fixture.context.historyRange} 为模拟实际；币种 ${fixture.meta.currency}（固定）。`,
  );

  // 2. 【① 基线预测】自动学习样本与证据（学习回退显式警示）
  const learning = context.learning;
  const firstForecast = result.weeks.find((week) => week.status === 'forecast');
  const referenceConsider = firstForecast?.consider.find((item) => item.kind === 'reference');
  const learningLines = [
    `${learningStatusText(learning.status)}（本地确定性学习，未调用模型服务；切换上一代参照 = 重新学习①）：`
    + `算法 ${learning.algorithm} · 有效样本 ${learning.validSampleCount} 周`
    + `（训练 ${learning.trainCount} / 留出 ${learning.holdoutCount}）`
    + `${learning.holdoutMae != null ? ` · 留出 MAE ${Math.round(learning.holdoutMae)} 台` : ''}`
    + `${learning.holdoutMape != null ? ` · 留出 MAPE ${learning.holdoutMape.toFixed(1)}%` : ''}；`
    + `首预测周 ${firstForecast?.weekId ?? '—'}${referenceConsider ? ` · ${referenceConsider.note}` : ''}。`,
  ];
  if (learning.status !== 'completed') {
    learningLines.push(
      `学习回退警示：${learning.fallbackReasons.join('；') || '有效样本不足'}；`
      + `回退影响 ${learning.fallbackWeekIds.length} 个预测周（显示回退基线，不冒称学习完成）。`,
    );
  }
  lines.push(`【① 基线预测】\n${learningLines.join('\n')}`);

  // 3. 【② 大盘修正】季度基线链 + 12 个月生效值 + 人工调整 + 行业/月度事件
  const forecastQuarters = result.marketQuarters.filter((point) => point.status === 'forecast');
  const forecastMonths = result.marketMonths.filter((point) => point.status === 'forecast');
  const overrideKeys = Object.keys(params.marketMonthOverrides).sort();
  const marketLines = [
    `季度基线链（AI）：${forecastQuarters.map((point) => `${point.key} ${point.value}`).join(' · ') || '不可用'}；`
    + `月生效值来源：${overrideSourceOf(params) === 'human' ? '人工按月调整' : 'AI 基线（含月事件，如有）'}。`,
  ];
  if (forecastMonths.length) {
    marketLines.push(...forecastMonths.map((point) => {
      const override = overrideKeys.includes(point.key) && params.marketMonthOverrides[point.key] != null
        ? `（人工调整 ${params.marketMonthOverrides[point.key]!.value}${params.marketMonthOverrides[point.key]!.reason.trim() ? ` · 原因：${params.marketMonthOverrides[point.key]!.reason.trim()}` : ''}）`
        : '';
      return `- ${point.key}：AI 基线 ${point.baseline} → 生效 ${point.value}${override}`;
    }));
  }
  if (params.marketEvents.length) {
    const rows = params.marketEvents.map((event) => {
      const disposition = marketEventDisposition(calendar, event) === 'historical'
        ? '历史解释（不修正预测周）'
        : '预测窗口内';
      return `- ${event.label || '未命名事件'}：${event.startWeekId}–${event.endWeekId} · 峰值 ${signedPct(event.magnitudePct)} · ${event.decay === 'decreasing' ? '递减' : '恒定'} · ${disposition}`;
    });
    marketLines.push(`行业事件（人工录入假设，共 ${params.marketEvents.length} 条）：\n${rows.join('\n')}`);
  } else {
    marketLines.push('行业事件：无');
  }
  if (params.marketMonthEvents.length) {
    const rows = params.marketMonthEvents.map((event) => {
      const label = event.label.trim() !== '' ? event.label : '未命名事件';
      return `- ${label}：起 ${event.startMonth}-${event.startDay} 日 · 时长 ${event.durationMonths} 个月 · 幅度 ${signedPct(event.magnitudePct)}`;
    });
    marketLines.push(`大盘月度事件（人工录入假设，共 ${params.marketMonthEvents.length} 条；月中起始按日均摊）：\n${rows.join('\n')}`);
  } else {
    marketLines.push('大盘月度事件：无');
  }
  lines.push(`【② 大盘修正】\n${marketLines.join('\n')}`);

  // 4. 【③ 库存修正】SI 十二个月逐月值 + 逐月确认状态 + 库存规则 + 修正事实
  const siStates = calendar.forecastMonths.map((month) => {
    const value = params.siPlanMonthly[month.key] ?? 0;
    const state = siMonthStatusOf(context.siConfirmation.byMonth[month.key], value);
    const stateText = state === 'confirmed' ? '已确认' : state === 'modified' ? '已修改 · 待确认' : '待确认';
    return { month, value, state, stateText };
  });
  const pendingCount = siStates.filter((entry) => entry.state !== 'confirmed').length;
  const totalMonths = calendar.forecastMonths.length;
  const siLines = [
    `SI 待确认 ${pendingCount} / ${totalMonths}`
    + (pendingCount > 0
      ? `（SI 未全部确认：主图当前为 SI 计划参考结果，未经逐月确认，不视作人工确认完成）`
      : '（12 个月已全部确认）'),
    ...siStates.map((entry) => {
      const reason = (params.siReasons[entry.month.key] ?? '').trim();
      return `- ${entry.month.key}：${entry.value.toLocaleString('en-US')} 台 · ${entry.stateText}${reason !== '' ? ` · 原因：${reason}` : ''}`;
    }),
    `库存规则：库存上限修正 min(基线 SO, 可售)，可售 = 期初库存 + SI 补货回写主图；`
    + `健康判定：DOS ${DOS_BAND.min}–${DOS_BAND.max} 天带 · 库存降幅预警 ${INV_CRASH_LIGHT_PCT}%／${INV_CRASH_HEAVY_PCT}%（阈值未核定）；`
    + `修正事实独立保留（手调不覆盖）。`,
    `修正事实：${result.firstAdjustedWeek != null
      ? `首修正周 ${result.firstAdjustedWeek} · 预测期缺口 −${fmtWan(result.summary.gap)}`
      : '当前可售口径覆盖预测需求，未触发修正'}。`,
  ];
  lines.push(`【③ 库存修正】\n${siLines.join('\n')}`);

  // 5. 【④ 成本及销毛】成本/价格情景 + MarginView 结果（与④卡和主图摘要同源）
  const marginView = context.marginView;
  const costMonths = [...new Set(
    marginView.weeks
      .filter((week) => week.status === 'forecast' && week.costOverridden)
      .map((week) => calendar.weekById.get(week.weekId)?.monthKey ?? ''),
  )].filter((monthKey) => monthKey !== '');
  const priceWeekIds = marginView.weeks
    .filter((week) => week.status === 'forecast' && week.priceOverridden)
    .map((week) => week.weekId);
  const marginLines = [
    `成本假设 ${marginView.appliedCostCount} 项${costMonths.length ? `：${costMonths.join('、')}（只进④销毛，不进需求主链）` : ''}；`
    + `价格手调 ${marginView.appliedPriceCount} 周${priceWeekIds.length ? `：${priceWeekIds.join('、')}` : ''}。`,
    `预测期销毛 ${fmtMillionUsd(marginView.forecastMargin)}`
    + `（历史 ${fixture.context.historyRange} ${fmtMillionUsd(marginView.historyMargin)}）；`
    + `销毛率 ${(() => { const rate = forecastMarginRateOf(marginView); return rate != null ? `${(rate * 100).toFixed(1)}%` : '—（无有效收入周）'; })()}（单台销毛额 = 单台收入 − 单台成本；销毛率 = 单台销毛额 ÷ 单台收入）；`
    + `预测覆盖 ${marginView.forecastCoverage.validWeeks}/${marginView.forecastCoverage.totalWeeks} 周`
    + ` · 历史覆盖 ${marginView.historyCoverage.validWeeks}/${marginView.historyCoverage.totalWeeks} 周（缺数周不计 0）。`,
    marginView.priceDemandLinked
      ? '价格→销量关系已联动。'
      : '价格→销量关系未纳入 · 暂不联动销量（成本只是调价参考，不回写主图销量与库存）。',
  ];
  lines.push(`【④ 成本及销毛】\n${marginLines.join('\n')}`);

  // 6. 其余：上一代参照（参照事实与①学习读数，友商仅对照）
  const referenceLabel = fixture.references.prevGenPool.find((series) => series.id === learning.referenceId)?.label;
  lines.push(
    `【上一代参照】${learning.referenceId}${referenceLabel ? `（${referenceLabel}）` : ''} · 同周龄对齐进入①学习器；`
    + `友商参照仅对照，不进主链；${referenceConsider ? referenceConsider.note : '无参考读数（无预测周考量）'}。`,
  );

  // 7. 其余：产品范围事件（v3：一个事件一个范围，不自动拆条）
  if (params.productEvents.length) {
    const rows = params.productEvents.map((event) => {
      const replay = fixture.replayScenarios.find((scenario) => scenario.id === event.replayId);
      return `- ${event.label || '未命名事件'}（${replay?.title ?? event.type}）：${event.startWeekId}–${event.endWeekId} · 幅度 ${signedPct(event.magnitudePct)} · ${event.decay === 'decreasing' ? '递减' : '恒定'}（参考历史回放预填，可改）`;
    });
    lines.push(`【产品事件】（主图范围事件，共 ${params.productEvents.length} 条）\n${rows.join('\n')}`);
  } else {
    lines.push('【产品事件】无');
  }

  // 8. 其余：周销手调（原因选填，空不打印；键 = 预测周 WeekId）
  const manualWeekIds = Object.keys(params.manual).sort();
  if (manualWeekIds.length) {
    const rows = manualWeekIds.map((weekId) => {
      const entry = params.manual[weekId]!;
      const reason = entry.reason.trim() !== '' ? ` · 原因：${entry.reason}` : '';
      return `- ${weekId} → ${entry.value.toLocaleString('en-US')} 台${reason}`;
    });
    lines.push(`【手调】（人工微调，共 ${manualWeekIds.length} 处）\n${rows.join('\n')}`);
  } else {
    lines.push('【手调】无手调');
  }

  // 9. 其余：情报候选审核状态（审核工作区计数；来源映射不进假设文本）
  const reviewEntries = Object.values(context.intelligenceReview.byCandidate).filter((entry) => entry != null);
  const accepted = reviewEntries.filter((entry) => entry?.status === 'accepted').length;
  const dismissed = reviewEntries.filter((entry) => entry?.status === 'rejected' || entry?.status === 'removed').length;
  const pending = reviewEntries.filter((entry) => entry?.status === 'new' || entry?.status === 'editing').length;
  lines.push(
    reviewEntries.length === 0
      ? '【审核状态】候选生成能力待接入 · 无审核记录（情报候选未经人工确认不写入假设）。'
      : `【审核状态】候选 ${reviewEntries.length} 条 · 已应用 ${accepted} · 已拒绝 / 移除 ${dismissed} · 待审核 ${pending}（未经确认的候选不写入假设）。`,
  );

  return lines.join('\n\n');
}
