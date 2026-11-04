// ============================================================
// 量价预测 · 推演工作台 v2 关键假设复制（WP6 8.4）：
// 纯文本构造函数，不调用 Agent、不生成无依据结论、不新增纪要层。
// 输出顺序固定（正典拍板）：
//   范围与模拟状态 → 模型版本 → 季度基线与人工覆盖 → 行业事件 →
//   上一代参照 → 产品事件 → SI → 手调及原因 → 库存规则 → 结果摘要。
// 全部数字来自当前 params / result / fixture（模型常量 DOS_BAND 等
// 直接引用模型导出），不另写常量——与页面展示同源（fmtWan / fmtMillionUsd）。
// ============================================================
import type { WorkbenchFixture } from './workbenchFixture';
import {
  DOS_BAND,
  INV_CRASH_HEAVY_PCT,
  INV_CRASH_LIGHT_PCT,
  effectiveQuarterIndexes,
  marketSeriesBaseline,
  type WorkbenchParams,
  type WorkbenchResult,
} from './workbenchModel';
import { marketEventDisposition } from './workbenchTime';
import { fmtMillionUsd, fmtWan } from './WorkbenchBits';

const signedPct = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`;

/**
 * 「复制关键假设」结构化纯文本：顺序固定；模拟状态必须在首段；
 * 每个数字都来自当前 params / result / fixture。
 */
export function buildWorkbenchAssumptionText(
  fixture: WorkbenchFixture,
  params: WorkbenchParams,
  result: WorkbenchResult,
): string {
  const lines: string[] = [];

  // 1. 范围与模拟状态（首段必须带模拟状态）
  lines.push(
    `【范围与模拟状态】固定演示样本（不随全局筛选联动）：${fixture.context.country} · ${fixture.context.industry} · `
    + `${fixture.context.channel} · ${fixture.context.product}；数据状态 = 模拟（${fixture.meta.status}），`
    + `全部数值为演示假设，不代表真实市场；历史 ${fixture.context.historyRange} 为模拟实际，`
    + `预测 ${fixture.context.forecastRange} 为模型推演；币种 ${fixture.meta.currency}（固定）。`,
  );

  // 2. 模型版本
  lines.push(`【模型版本】${fixture.meta.modelVersion}（来源 ${fixture.meta.source}，生成 ${fixture.meta.generatedAt}）`);

  // 3. 季度基线与人工覆盖
  const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
  const { q4Index, q1Index } = effectiveQuarterIndexes(fixture, params);
  const forecastQuarters = result.marketQuarters.filter((point) => point.status === 'forecast');
  const q4Key = forecastQuarters[0]?.key ?? '当前季';
  const q1Key = forecastQuarters[1]?.key ?? '下一季';
  lines.push(
    `【季度基线与人工覆盖】AI 时间序列基线（季节 × 趋势）：${q4Key} ${aiQ4} · ${q1Key} ${aiQ1}；`
    + `当前生效：${q4Key} ${q4Index} · ${q1Key} ${q1Index}（来源：${params.overrideSource === 'human' ? '人工覆盖' : 'AI 基线'}）；`
    + `人工改格：${q4Key} ${params.q4Override != null ? params.q4Override : '未改'} · ${q1Key} ${params.q1Override != null ? params.q1Override : '未改'}。`,
  );

  // 4. 行业事件（人工录入假设；historical 只作解释）
  if (params.marketEvents.length) {
    const rows = params.marketEvents.map((event) => {
      const endWeek = event.startWeek + event.durationWeeks - 1;
      const disposition = marketEventDisposition(fixture, event) === 'historical'
        ? '历史解释（不修正预测周）'
        : '预测窗口内';
      return `- ${event.label}：W${event.startWeek}–W${endWeek} · 峰值 ${signedPct(event.magnitudePct)} · ${event.decay === 'decreasing' ? '递减' : '恒定'} · ${disposition}`;
    });
    lines.push(`【行业事件】（人工录入假设，共 ${params.marketEvents.length} 条）\n${rows.join('\n')}`);
  } else {
    lines.push('【行业事件】无');
  }

  // 4b. 大盘月度事件与按月人工调整（月粒度修正段；月中起始按日均摊口径）
  const monthEventRows = params.marketMonthEvents.map((event) => {
    const label = event.label.trim() !== '' ? event.label : '未命名事件';
    return `- ${label}：起 ${event.startMonth}-${event.startDay} 日 · 时长 ${event.durationMonths} 个月 · 幅度 ${signedPct(event.magnitudePct)}`;
  });
  lines.push(params.marketMonthEvents.length
    ? `【大盘月度事件】（人工录入假设，共 ${params.marketMonthEvents.length} 条；月中起始按日均摊，衰减固定递减）\n${monthEventRows.join('\n')}`
    : '【大盘月度事件】无');
  const monthOverrideKeys = Object.keys(params.marketMonthOverrides).sort();
  lines.push(monthOverrideKeys.length
    ? `【大盘按月人工调整】（点击预测月就地调整，共 ${monthOverrideKeys.length} 个月；调整季度经季内三月均值同步主链）\n${monthOverrideKeys.map((key) => {
        const entry = params.marketMonthOverrides[key];
        const reason = entry.reason.trim() !== '' ? ` · 原因：${entry.reason}` : '';
        return `- ${key} → ${entry.value.toLocaleString('en-US')}${reason}`;
      }).join('\n')}`
    : '【大盘按月人工调整】无');

  // 5. 上一代参照（同周龄比值校正进入主链；读数取自模型 consider，不另算）
  const firstForecast = result.weeks.find((week) => week.status === 'forecast');
  const reference = firstForecast?.consider.find((item) => item.kind === 'reference');
  lines.push(`【上一代参照】${reference ? `${reference.label}：${reference.note}` : '未接入（无预测周考量）'}；友商参照仅对照，不进主链。`);

  // 6. 产品事件
  if (params.productEvents.length) {
    const rows = params.productEvents.map((event) => {
      const replay = fixture.replayScenarios.find((scenario) => scenario.id === event.replayId);
      return `- ${event.label}（${replay?.title ?? event.type}）：W${event.week} · 幅度 ${signedPct(event.magnitudePct)}（参考历史回放预填，可改）`;
    });
    lines.push(`【产品事件】（主图小事件，共 ${params.productEvents.length} 条）\n${rows.join('\n')}`);
  } else {
    lines.push('【产品事件】无');
  }

  // 7. SI 月计划（库存验证层唯一人工输入，月内均分到周）
  const siRows = fixture.forecastMonths.map((month) => `- ${month.label}：${(params.siPlanMonthly[month.key] ?? 0).toLocaleString('en-US')} 台`);
  lines.push(`【SI 月计划】（人工输入，月内均分到周）\n${siRows.join('\n')}`);

  // 8. 手调及原因（原因选填，空不打印）
  const manualWeekNumbers = Object.keys(params.manual).map(Number).sort((a, b) => a - b);
  if (manualWeekNumbers.length) {
    const rows = manualWeekNumbers.map((weekNumber) => {
      const entry = params.manual[weekNumber];
      const reason = entry.reason.trim() !== '' ? ` · 原因：${entry.reason}` : '';
      return `- W${weekNumber} → ${entry.value.toLocaleString('en-US')} 台${reason}`;
    });
    lines.push(`【手调】（人工微调，共 ${manualWeekNumbers.length} 处）\n${rows.join('\n')}`);
  } else {
    lines.push('【手调】无手调');
  }

  // 9. 库存规则（阈值未核定；公式与阈值来自模型导出常量）
  lines.push(
    `【库存规则】刚性修正 min(基线 SO, 可售)，可售 = 期初库存 + SI 补货回写主图；`
    + `健康判定：DOS ${DOS_BAND.min}–${DOS_BAND.max} 天带 · 库存降幅预警 ${INV_CRASH_LIGHT_PCT}%／${INV_CRASH_HEAVY_PCT}%（阈值未核定）；`
    + `修正事实独立保留（手调不覆盖）。`,
  );

  // 10. 结果摘要（总销量 / 峰值 / 库存缺口 / 销毛，全部来自 result.summary）
  lines.push(
    `【结果摘要】预测期（${fixture.context.forecastRange}）总销量 ${fmtWan(result.summary.totalSales)}`
    + `（${signedPct(result.summary.vsHistoryPct)} vs ${fixture.context.historyRange}）；`
    + `大促峰 W${result.summary.peak.weekNumber} ${fmtWan(result.summary.peak.value)}（${result.summary.peak.note}）；`
    + `库存上限修正缺口 ${result.summary.gap > 0 ? `−${fmtWan(result.summary.gap)}` : '未触发'}`
    + `（首修正周 ${result.firstAdjustedWeek != null ? `W${result.firstAdjustedWeek}` : '无'}）；`
    + `预测期销毛 ${fmtMillionUsd(result.summary.forecastMargin)}`
    + `（历史 ${fixture.context.historyRange} ${fmtMillionUsd(result.summary.historyMargin)}，链路末端独立推测，不回写主图）。`,
  );

  return lines.join('\n\n');
}
