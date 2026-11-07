// ============================================================
// 量价预测 · 四步推演契约（Batch 2 · 2026-11-07 · batch2-iterate-forecast）：
// 把「①参考产品基线 → ②大盘修正 → ③库存修正 → ④成本及销毛」每步的
// 输入 / 假设 / 修正（含原因）/ 证据 / 数据状态收敛为一份派生只读元数据
// （ForecastStepResult），供页级「步间对比与因果记录」审计卡消费。
// 红线（brief §5）：
// - 只从既有模型派生（WorkbenchParams / WorkbenchResult / MarginView /
//   MarginScenario / SiConfirmationState），不另起第二套预测模型、不算第二
//   套数字——所有读数与主图 / 四卡同源；
// - 证据如实分 real（会话内人工事实）/ simulated（演示样本）/ pending
//   （能力待接入）/ missing；数据版本有值、采集时间缺失时由 UI 写「待确认」；
// - 不编造置信度百分比；预测区间只能写「范围示意 / 待接入」；
// - 口径：单台销毛额 = 单台收入 − 单台成本；销毛率 = 单台销毛额 ÷ 单台收入
//   （销毛率读 marginScenarioModel.forecastMarginRateOf，唯一公式来源）。
// 纯函数：不读时间、不用随机数、不依赖 DOM。
// ============================================================
import { DOS_BAND, INV_CRASH_HEAVY_PCT, INV_CRASH_LIGHT_PCT } from './workbenchModel';
import type { WorkbenchParams, WorkbenchResult } from './workbenchModel';
import type { WorkbenchFixture } from './workbenchFixture';
import type { MarginScenario, MarginView } from './marginScenarioModel';
import { forecastMarginRateOf } from './marginScenarioModel';
import type { SiConfirmationState } from './useSiConfirmations';
import { siMonthStatusOf } from './useSiConfirmations';

/** 证据数据状态（brief §5 ForecastEvidence.status；不得把模拟标成 real）。 */
export type ForecastEvidenceStatus = 'real' | 'simulated' | 'mixed' | 'pending' | 'missing';

/** 单条证据：来源 + 数据状态 + 数据版本 / 采集时间（缺失由 UI 写「待确认」）。 */
export interface ForecastEvidence {
  id: string;
  label: string;
  source: string;
  sourceUrl?: string;
  capturedAt?: string;
  dataVersion?: string;
  status: ForecastEvidenceStatus;
}

/** 本步计算状态（brief §5 calculationStatus；failed 由页级重算守卫单独承载）。 */
export type ForecastStepStatus = 'ready' | 'partial' | 'pending' | 'cannot_compute';

/** 本步人工修正记录：数值 + 内联原因（原因缺失如实显示「未填」）。 */
export interface ForecastStepAdjustment {
  key: string;
  label: string;
  value: number | null;
  reason: string;
}

/** 四步推演元数据（只读派生；数字与主图 / 对应卡同源）。 */
export interface ForecastStepResult {
  step: 1 | 2 | 3 | 4;
  title: string;
  /** 默认露出的本步结论（一行；数字来自 result / marginView）。 */
  conclusion: string;
  /** 结论需要关注的语气（库存截断 = 琥珀）；缺省中性。 */
  tone?: 'amber';
  inputs: string[];
  assumptions: string[];
  adjustments: ForecastStepAdjustment[];
  evidence: ForecastEvidence[];
  status: ForecastStepStatus;
  /** 数据状态读数（「有基线 / 已修正 / 待接入 / 无法计算」等状态词汇的唯一出口）。 */
  statusText: string;
  /** 本步计算关系（取证可复核；④ = 销毛口径铁律文案）。 */
  formula: string;
  /** 待补数据契约 / 缺失字段（如实列出，不伪装已接入）。 */
  missingFields: string[];
}

/** 万台展示（1 位小数；与 WorkbenchBits.fmtWan 同格式，本模块保持 React 无关）。 */
const fmtWanLocal = (units: number | null | undefined): string =>
  units == null ? '—' : `${(units / 10000).toFixed(1)} 万台`;

/** 百万美元展示（与 WorkbenchBits.fmtMillionUsd 同格式）。 */
const fmtMillionUsdLocal = (usd: number): string => `$${(usd / 1e6).toFixed(1)}M`;

/** 学习状态文案（与 PipelineNav.learningStatusText 同口径）。 */
function learningStatusText(status: 'completed' | 'partial' | 'fallback'): string {
  if (status === 'completed') return '自动学习';
  return status === 'partial' ? '自动学习 · 部分样本' : '学习回退';
}

function buildForecastSteps(
  fixture: WorkbenchFixture,
  params: WorkbenchParams,
  result: WorkbenchResult,
  marginView: MarginView,
  scenario: MarginScenario,
  siState: SiConfirmationState,
): ForecastStepResult[] {
  const dataVersion = fixture.meta.modelVersion;
  const evidenceBase = { dataVersion };
  const referenceLabel = fixture.references.prevGenPool.find(
    (series) => series.id === params.prevGenReferenceId,
  )?.label ?? params.prevGenReferenceId;

  const forecastWeeks = result.weeks.filter((week) => week.status === 'forecast');
  const actualWeeks = result.weeks.filter((week) => week.status === 'actual');
  const missingActualWeeks = actualWeeks.filter((week) => week.sales == null).length;
  const baselineTotal = forecastWeeks.reduce((total, week) => total + (week.baselineSales ?? 0), 0);
  const baselineMissingWeeks = forecastWeeks.filter((week) => week.baselineSales == null).length;

  // ②大盘：人工调整 + 月度事件 + 生效值联动月数（全部 12 个预测月都走生效值链）。
  const monthOverrideKeys = Object.keys(params.marketMonthOverrides).sort();
  const forecastMonthCount = forecastWeeks.length
    ? new Set(forecastWeeks.map((week) => week.monthKey)).size
    : 0;

  // ③库存：SI 偏离基准的月（带原因）+ 确认进度 + 截断事实。
  const siAdjustments: ForecastStepAdjustment[] = fixture.forecastMonths
    .map((month): ForecastStepAdjustment | null => {
      const value = params.siPlanMonthly[month.key] ?? 0;
      const baseline = fixture.inventory.siPlanMonthly[month.key] ?? 0;
      if (value === baseline) return null;
      return {
        key: `si-${month.key}`,
        label: `${month.key} SI ${fmtWanLocal(value)}（基准 ${fmtWanLocal(baseline)}）`,
        value,
        reason: params.siReasons[month.key] ?? '未填（历史草稿）',
      };
    })
    .filter((entry): entry is ForecastStepAdjustment => entry != null);
  const siPending = fixture.forecastMonths.filter((month) =>
    siMonthStatusOf(siState.byMonth[month.key], params.siPlanMonthly[month.key] ?? 0) !== 'confirmed').length;
  const lastSiConfirmedAt = fixture.forecastMonths
    .map((month) => siState.byMonth[month.key]?.confirmedAt)
    .filter((iso): iso is string => iso != null)
    .sort()
    .pop();
  const cappedWeeks = forecastWeeks.filter((week) => week.supplyCapped);

  // R2（C3）：周销手调（params.manual）= 链路末端人工修正——final = manual.value
  // ?? 库存修正值，覆盖该周最终 SO 但不参与库存递推与任何自动步骤。纳入第③步
  // adjustments 可见可定位，标签显式「末端人工修正」，不与自动步骤混淆。
  const manualAdjustments: ForecastStepAdjustment[] = Object.keys(params.manual).sort().map((weekId) => {
    const entry = params.manual[weekId]!;
    return {
      key: `manual-${weekId}`,
      label: `${weekId} 周销手调 ${fmtWanLocal(entry.value)}（末端人工修正 · 覆盖该周最终 SO，不参与自动步骤计算）`,
      value: entry.value,
      reason: entry.reason || '未填（历史草稿）',
    };
  });

  // ④成本及销毛：价格手调按批次归并（月展开共享 batchId），成本假设逐月。
  const priceBatches = new Map<string, { weeks: string[]; price: number; reason: string }>();
  for (const [weekId, entry] of Object.entries(scenario.priceOverrides)) {
    const batch = priceBatches.get(entry.batchId) ?? { weeks: [], price: entry.price, reason: entry.reason };
    batch.weeks.push(weekId);
    priceBatches.set(entry.batchId, batch);
  }
  const marginRate = forecastMarginRateOf(marginView);

  const steps: ForecastStepResult[] = [
    {
      step: 1,
      title: '① 参考产品 → 首轮基线',
      conclusion: `基线已生成 · 参考 ${referenceLabel}（${learningStatusText(result.learning.status)}）· 预测期基线合计 ${fmtWanLocal(baselineTotal)}${baselineMissingWeeks > 0 ? ` · ${baselineMissingWeeks} 周缺数不插值` : ''}`,
      inputs: [
        `参考产品：${referenceLabel}（上一代池 · 同周龄对齐，切换 = 重新学习）`,
        `历史量价：${fixture.context.historyRange} 周销 ${actualWeeks.length} 周（缺采 ${missingActualWeeks} 周保留缺失，不插值）· 价格 ${fixture.meta.currency}`,
        `范围：${fixture.context.country} · ${fixture.context.industry} · ${fixture.context.channel}`,
        '输出到②：预测期基线（周粒度，含产品范围事件乘子）',
      ],
      assumptions: [
        `学习算法 ${result.learning.algorithm}（本地确定性规则，未调用模型服务）`,
        '参考匹配：同产业、同国家/地区、相近档位——匹配规则待确认（真实匹配服务待接入）',
        '促销档期形状已含在学习基线内',
        '价格→销量关系未纳入（基线不随价格手调联动）',
      ],
      adjustments: params.productEvents.map((event) => {
        const replay = fixture.replayScenarios.find((item) => item.id === event.replayId);
        return {
          key: event.id,
          label: `${event.startWeekId}–${event.endWeekId} 范围事件 ${event.label || '未命名事件'}`,
          value: event.magnitudePct,
          reason: replay ? `事件名称「${event.label || '未命名'}」· 回放参照：${replay.title}` : `事件名称「${event.label || '未命名'}」`,
        };
      }),
      evidence: [
        {
          ...evidenceBase,
          id: 'learning-evidence',
          label: `学习证据：样本窗 ${result.learning.sampleStart ?? '—'}–${result.learning.sampleEnd ?? '—'} · 有效周 ${result.learning.validSampleCount}（训练 ${result.learning.trainCount} / 留出 ${result.learning.holdoutCount}）`,
          source: 'workbenchLearning.learnWorkbenchBaseline（本地确定性学习器）',
          status: 'simulated',
        },
        {
          ...evidenceBase,
          id: 'reference-series',
          label: `参考产品周销序列（${referenceLabel} · 演示样本）`,
          source: 'workbenchFixture.references.prevGenPool',
          status: 'simulated',
        },
      ],
      status: result.learning.status === 'completed' && baselineMissingWeeks === 0 ? 'ready' : 'partial',
      statusText: result.learning.status === 'completed'
        ? `有基线（自动学习完成${baselineMissingWeeks > 0 ? ` · ${baselineMissingWeeks} 周缺数不插值` : ''}）`
        : `有基线（${learningStatusText(result.learning.status)}${result.learning.fallbackWeekIds.length ? ` · 回退周 ${result.learning.fallbackWeekIds.length} 个` : ''}）`,
      formula: '学习基线 × 产品范围事件乘子 = 预测周基线（baselineSales）',
      missingFields: [
        '真实参考产品匹配服务与可验证的价格 / 周销时间序列（当前为演示样本）',
        '参考匹配规则的正式定义（文案暂写「匹配规则待确认」）',
        '预测区间 / 置信度契约（未接入前不展示任何百分比）',
      ],
    },
    {
      step: 2,
      title: '② 大盘 → 第一轮修正',
      conclusion: monthOverrideKeys.length > 0 || params.marketMonthEvents.length > 0
        ? `已修正：人工调整 ${monthOverrideKeys.length} 个月 · 月度事件 ${params.marketMonthEvents.length} 条 · 生效值链联动 ${forecastMonthCount} 个预测月`
        : `AI 基线（未做人工修正）· 生效值链联动 ${forecastMonthCount} 个预测月`,
      inputs: [
        `历史月序列：${fixture.market.months.length} 个实际月（模拟实际）`,
        `统一预测月序列：${forecastMonthCount} 个月（季度基线链外推 + 去年同季月形）`,
        '①输出：预测期基线（周粒度）',
        '已审核情报事件：候选注入为空（候选生成能力待接入）',
        `人工月度事件：${params.marketMonthEvents.length} 条`,
      ],
      assumptions: [
        '季度基线链外推（8 季窗趋势 + 入位比）+ 去年同季月形分布（缺月回退均等 1/3）',
        '月度事件月中按日均摊（覆盖占比 = 剩余天数 ÷ 当月天数）',
        '人工月调整只写该月生效值，不同步季度改格',
      ],
      adjustments: [
        ...monthOverrideKeys.map((monthKey) => {
          const entry = params.marketMonthOverrides[monthKey]!;
          return {
            key: `mo-${monthKey}`,
            label: `${monthKey} 生效值 ${entry.value}（40–200）`,
            value: entry.value,
            reason: entry.reason || '未填（历史草稿）',
          };
        }),
        ...params.marketMonthEvents.map((event) => ({
          key: `me-${event.id}`,
          label: `${event.startMonth}-${String(event.startDay).padStart(2, '0')} 起 ${event.durationMonths} 个月 · ${event.label || '未命名事件'}`,
          value: event.magnitudePct,
          reason: event.label || '未填说明',
        })),
      ],
      evidence: [
        {
          ...evidenceBase,
          id: 'market-series',
          label: `大盘月度序列（${fixture.market.months[0]?.key ?? '—'}–${fixture.market.months[fixture.market.months.length - 1]?.key ?? '—'} 实际 + 预测外推）`,
          source: 'workbenchModel.computeMarketMonths（季度基线链 · 确定性）',
          status: 'simulated',
        },
        {
          ...evidenceBase,
          id: 'intelligence-candidates',
          label: '已审核情报事件：候选注入为空',
          source: 'useIntelligenceReview（真实抓取待接入）',
          status: 'pending',
        },
      ],
      status: 'ready',
      statusText: monthOverrideKeys.length > 0 ? `已修正（人工 ${monthOverrideKeys.length} 个月）` : '已生成（AI 基线，未做人工修正）',
      formula: '月生效值 = 人工调整 ?? round1(AI 基线 × 事件乘子)；周修正比值 = 月生效值 ÷ 该月 AI 基线',
      missingFields: [
        '真实国家/产业大盘来源（URL / 采集时间 / 数据版本，当前为演示样本）',
        '真实情报候选注入（抓取 / 去重 / 来源 URL / 发布时间）',
      ],
    },
    {
      step: 3,
      title: '③ 库存 → 第二轮修正',
      conclusion: cappedWeeks.length > 0
        ? `已修正：${result.firstAdjustedWeek} 起按可售量修正 · 供给缺口 −${fmtWanLocal(result.summary.gap)} · SI 待确认 ${siPending} / 12${manualAdjustments.length ? ` · 周销手调 ${manualAdjustments.length} 周（末端人工修正）` : ''}`
        : `未触发修正（库存可支撑基线 SO）· SI 待确认 ${siPending} / 12${manualAdjustments.length ? ` · 周销手调 ${manualAdjustments.length} 周（末端人工修正）` : ''}`,
      tone: cappedWeeks.length > 0 ? 'amber' : undefined,
      inputs: [
        '②输出：大盘修正后基线 SO（周粒度）',
        `SI 月计划：12 个月（逐月确认 ${12 - siPending} / 12，确认数值以 params 为准）`,
        `期初渠道库存：${fmtWanLocal(fixture.inventory.initialChannelInv)}`,
        '输出到④：最终 SO（含库存上限修正，修正周琥珀描边）',
      ],
      assumptions: [
        `DOS 合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天与降幅阈值 ${INV_CRASH_LIGHT_PCT}%／${INV_CRASH_HEAVY_PCT}% 为演示规则（待业务核定）`,
        'SI 月计划拆周整数守恒（余数月初起 +1）',
        '手调不进入库存递推（截断事实保留，主图显示手调值）；手调 = 末端人工修正，覆盖该周最终 SO，不改自动步骤',
      ],
      adjustments: [...siAdjustments, ...manualAdjustments],
      evidence: [
        {
          ...evidenceBase,
          id: 'inventory-simulation',
          label: `库存推演：首个修正周 ${result.firstAdjustedWeek ?? '未触发'} · 缺口 ${fmtWanLocal(result.summary.gap)}`,
          source: 'workbenchModel.computeWorkbench 库存递推（确定性）',
          status: 'simulated',
        },
        {
          ...evidenceBase,
          id: 'si-confirmations',
          label: `SI 逐月确认记录（已确认 ${12 - siPending} / 12，会话内事实）`,
          source: 'useSiConfirmations（forecast.siConfirmation.*）',
          status: 'real',
          capturedAt: lastSiConfirmedAt,
        },
      ],
      status: 'ready',
      statusText: cappedWeeks.length > 0
        ? `已修正（${result.firstAdjustedWeek} 起 · ${cappedWeeks.length} 周）`
        : '未触发修正（缺库存数据时显示「无法计算」，不静默补点）',
      formula: '可售 = 期初渠道库存 + SI 补货；修正周销量 = min(基线 SO, 可售)',
      missingFields: [
        '真实库存 / DOS / SI 数据源与来源映射（当前为演示样本）',
        'DOS 合理带与降幅阈值的业务核定值',
        'SI 确认的后端落库与权限边界（当前仅会话存储）',
      ],
    },
    {
      step: 4,
      title: '④ 成本及销毛 → 最终输出',
      conclusion: `预测期销毛 ${fmtMillionUsdLocal(marginView.forecastMargin)} · 销毛率 ${marginRate != null ? `${(marginRate * 100).toFixed(1)}%` : '—（无有效收入周）'} · 覆盖 ${marginView.forecastCoverage.validWeeks}/${marginView.forecastCoverage.totalWeeks} 周`,
      inputs: [
        '③输出：最终 SO（周粒度，含库存上限修正）',
        `价格情景：显示价（价格手调 ${marginView.appliedPriceCount} 周）`,
        `成本：月版本 ${fixture.costVersions.length} 版 + 成本假设 ${marginView.appliedCostCount} 项（按月生效）`,
        '输出：预测期销毛（链路末端独立推测，不回写主图）',
      ],
      assumptions: [
        '价格→销量关系未纳入 · 调价暂不联动销量',
        '成本按月版本生效（该月无版本回退首版）；成本只是是否调价的参考',
        '历史周 / 历史月恒事实值（价格与成本手调不允许美化对照）',
      ],
      adjustments: [
        ...[...priceBatches.entries()].map(([batchId, batch]) => ({
          key: `price-${batchId}`,
          label: `${batchId} · ${batch.weeks.length} 周 → 显示价 $${batch.price}`,
          value: batch.price,
          reason: batch.reason || '未填（历史草稿）',
        })),
        ...Object.entries(scenario.costOverrides).sort(([a], [b]) => a.localeCompare(b)).map(([monthKey, entry]) => ({
          key: `cost-${monthKey}`,
          label: `${monthKey} 成本假设 $${entry.unitCost}`,
          value: entry.unitCost,
          reason: entry.reason || '未填（历史草稿）',
        })),
      ],
      evidence: [
        {
          ...evidenceBase,
          id: 'cost-versions',
          label: `成本月版本阶梯（${fixture.costVersions.map((version) => `${version.monthKey} $${version.unitCost}`).join(' → ')}）`,
          source: 'workbenchFixture.costVersions（演示样本）',
          status: 'simulated',
        },
        {
          ...evidenceBase,
          id: 'margin-view',
          label: `统一销毛视图（历史 ${fmtMillionUsdLocal(marginView.historyMargin)} · 预测 ${fmtMillionUsdLocal(marginView.forecastMargin)}）`,
          source: 'marginScenarioModel.computeMarginView（唯一公式来源）',
          status: 'mixed',
        },
        ...(marginView.appliedPriceCount + marginView.appliedCostCount > 0
          ? [{
              ...evidenceBase,
              id: 'margin-overrides',
              label: `会话内价格 / 成本人工假设（价格 ${marginView.appliedPriceCount} 周 · 成本 ${marginView.appliedCostCount} 项，未落库）`,
              source: 'useMarginScenario（forecast.marginScenario.*）',
              status: 'real' as const,
            }]
          : []),
      ],
      status: marginView.forecastCoverage.validWeeks === marginView.forecastCoverage.totalWeeks ? 'ready' : 'partial',
      statusText: marginView.forecastCoverage.validWeeks === marginView.forecastCoverage.totalWeeks
        ? '可计算（全覆盖）'
        : `部分可算（缺数周 ${marginView.forecastCoverage.totalWeeks - marginView.forecastCoverage.validWeeks} 个不计 0，不掩盖覆盖率）`,
      formula: '单台销毛额 = 单台收入 − 单台成本；销毛率 = 单台销毛额 ÷ 单台收入；周销毛 = 最终 SO × 单台销毛额',
      missingFields: [
        '真实成本版本来源映射与按月版本核价（当前为演示样本）',
        '预测区间校准与置信度契约（无契约不展示百分比，只写「范围示意 / 待接入」）',
        '渠道费率等口径（演示口径不含，接入前不虚构扣减）',
      ],
    },
  ];
  return steps;
}

export default buildForecastSteps;
