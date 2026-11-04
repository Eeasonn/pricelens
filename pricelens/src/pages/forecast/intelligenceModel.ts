// ============================================================
// 量价预测 · v3 情报转化纯函数（forecast-global-ia-review 附录 B.4.3 / B.4.8 /
// 任务 8）：AI 情报事实（IntelligenceItem）与转化建议（EventRecommendation）
// 分离；本模块只做三件事——
//   1. validateRecommendation：目标参数合法性（范围外 / 范围不符形态 / 缺参 /
//      起止倒置 = blocking；名称永远不 blocking，field='label' 不产出）；
//   2. buildEventPreview：在内存构造「临时完整 params」（只 market-month /
//      product-range 两目标；cost-reference 不进 WorkbenchParams，另出
//      buildCostScenarioPreview 构造临时 MarginScenario 形状记录）；
//   3. findDuplicateImpacts：按「目标 + 类型 + 范围交集」找已有事件中的重复
//      落点（同一候选刚构造的事件也在内——UI 层用原始 params 查询即可只报
//      其他事件；同一 intelligenceId 的提醒由审核工作区 appliedEventIds 承担）。
// 范围匹配（国家/产业/渠道/产品是否属于当前工作台）由候选接入层负责——本函数
// 签名（B.4.8 契约）不含当前 scope，生产者必须只投递范围相符候选。
// 预览计算链：preview params → 页面用同一 computeWorkbench 只读计算（不新增
// 第二条计算链）；确认前绝不调用页面 setter。
// MarginScenario 类型在本模块过渡定义（B.4.3 形状）；任务 9 marginScenarioModel
// 落地后由该模块作为唯一出口，本模块改为引用（任务 10 收敛）。
// 全部为纯函数：不读时间、不用随机数、不改入参。
// ============================================================
import type { ForecastCalendar, MonthKey, WeekId } from './workbenchCalendar';
import type { MarketMonthEventSeed, ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { MarginScenario } from './marginScenarioModel';
import type { WorkbenchParams } from './workbenchModel';

/**
 * 成本/价格情景（B.4.3）：唯一出口 = marginScenarioModel.ts（任务 9 交付，
 * 形状与 B.4.3 一致）；本模块只作类型再出口供面板/调用方引用。cost-reference
 * 候选只构造 costOverrides 临时记录（buildCostScenarioPreview），绝不自动改价。
 */
export type { MarginScenario };

// ------------------------------------------------------------
// B.4.3 契约类型（情报事实 / 转化建议 / 审核状态）
// ------------------------------------------------------------

/** 建议落点目标（B.4.3）：决定②大盘、主图或④成本的落点。 */
export type IntelligenceTarget = 'market-month' | 'product-range' | 'cost-reference';

/** 转换置信（B.4.3）：只描述「情报能否完整、明确地转换为事件参数」，
 *  不是预测发生概率；UI 主文案统一用「依据状态」（依据齐全/部分待核/需人工补参）。 */
export type EvidenceState = 'supported' | 'partial' | 'insufficient';

/** 情报事实（B.4.3）：只读；接受建议不会修改原文；来源映射不进 WorkbenchParams。 */
export interface IntelligenceItem {
  intelligenceId: string;
  title: string;
  summary: string;
  /** 原文摘录（审核弹层只读事实区）。 */
  excerpt: string;
  sourceName: string;
  /** 无链接时为 null（UI 显示「暂无来源链接」）。 */
  sourceUrl: string | null;
  publishedAt: string;
  capturedAt: string;
  dataStatus: 'real' | 'simulated' | 'mixed';
  scope: { country: string; industry: string; channel: string; product: string | null };
}

/** 转化建议（B.4.3）：全部为「可改假设」；名称选填（空串合法）。 */
export interface EventRecommendation {
  candidateId: string;
  intelligenceId: string;
  target: IntelligenceTarget;
  /** 主图三类事件类型；非 product-range 为 null。 */
  eventType: ProductEventSeed['type'] | null;
  label: string;
  /** 主图建议起止周闭区间（跨年 WeekId）；范围外/倒置在 validate 标 blocking。 */
  range: { startWeekId: WeekId; endWeekId: WeekId } | null;
  /** market-month / cost-reference 起始月（YYYY-MM）。 */
  startMonth: MonthKey | null;
  /** market-month 起始日（1–31）。 */
  startDay: number | null;
  /** market-month 时长（月，1–12）。 */
  durationMonths: number | null;
  /** 幅度建议（%，正抬升负压低）；只作可改假设。 */
  magnitudePct: number | null;
  /** 主图范围形状：递减 / 恒定。 */
  decay: 'decreasing' | 'flat' | null;
  /** cost-reference 单台成本（有限非负）。 */
  unitCost: number | null;
  evidenceState: EvidenceState;
  /** 缺失字段清单（候选接入层产出；行内逐项展示，缺参不允许空参应用）。 */
  missingFields: string[];
  rationale: string;
  /** 历史类比回放 id（product-range 必填且须与回放库匹配——存在性校验在接入层）。 */
  replayId: string | null;
}

/** 审核状态（B.4.3）：new/removed/editing/accepted/rejected + 编辑草稿 +
 *  已应用事件链接 + 批次号；持久化于审核工作区（useIntelligenceReview）。 */
export interface CandidateReview {
  status: 'new' | 'removed' | 'editing' | 'accepted' | 'rejected';
  draft: EventRecommendation | null;
  appliedEventIds: string[];
  batchId: string | null;
  reviewedAt: string | null;
}

/** 审核工作区状态（B.4.3）：按 candidateId 索引；来源映射不进 WorkbenchParams。 */
export interface IntelligenceReviewState {
  byCandidate: Record<string, CandidateReview | undefined>;
}

/** 校验问题（B.4.8）：blocking = 阻止应用；名称问题永不产出。 */
export interface ValidationIssue {
  field: string;
  message: string;
  blocking: boolean;
}

/** 重复落点（B.4.8）：同目标 + 类型 + 范围交集的已有事件及其覆盖交集周。 */
export interface DuplicateImpact {
  eventId: string;
  overlapWeekIds: WeekId[];
}

/** 应用回报元数据（任务 8 Interfaces 契约）：面板回调第二参，固定含三项。 */
export interface ReviewMeta {
  candidateIds: string[];
  batchId: string;
  appliedEventIds: string[];
}

/** 幅度建议合法带（B.4.8：market-month −30…30%）。 */
const MAGNITUDE_MIN = -30;
const MAGNITUDE_MAX = 30;
/** market-month 时长上限（月；B.4.3 字段映射表 1–12）。 */
const DURATION_MONTHS_MAX = 12;

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PRODUCT_EVENT_TYPES: ReadonlyArray<ProductEventSeed['type']> = ['competitor-launch', 'own-promo', 'cannibalization'];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** 月键在预测范围内。 */
function monthInHorizon(monthKey: string | null, calendar: ForecastCalendar): boolean {
  if (monthKey == null || !MONTH_KEY_PATTERN.test(monthKey)) return false;
  return calendar.monthByKey.has(monthKey);
}

/** 候选覆盖的月键清单（起始月..起始月+时长−1；越出 horizon 的月截去）。 */
function coveredMonthsOf(startMonth: string, durationMonths: number, calendar: ForecastCalendar): MonthKey[] {
  const match = MONTH_KEY_PATTERN.exec(startMonth);
  if (!match || durationMonths < 1) return [];
  const months: MonthKey[] = [];
  let year = Number(match[1]);
  let month = Number(match[2]);
  for (let index = 0; index < durationMonths; index += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (calendar.monthByKey.has(key)) months.push(key);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return months;
}

// ------------------------------------------------------------
// validateRecommendation（B.4.8）
// ------------------------------------------------------------

/**
 * 目标参数合法性校验（B.4.8 逐条）：
 * - market-month：合法起始月（horizon 内）+ 起始日 1–31 + 时长 1–12 +
 *   幅度 −30…30%；覆盖越出 horizon 终月也 blocking（不静默截断）；
 * - product-range：合法起止周（同一日历、倒置 blocking、范围外 blocking）+
 *   三类事件类型之一 + 有限幅度 + 形状 + 非空回放 id；
 * - cost-reference：horizon 内月份 + 有限非负成本；
 * - 范围外、缺参、起止倒置均 blocking；名称（label）永不 blocking——
 *   本函数对 field='label' 不产出任何问题（含空名称）。
 */
export function validateRecommendation(
  item: IntelligenceItem,
  recommendation: EventRecommendation,
  calendar: ForecastCalendar,
): ValidationIssue[] {
  void item; // 契约占位：范围相符性由候选接入层负责（签名不含当前 scope）
  const issues: ValidationIssue[] = [];
  const push = (field: string, message: string, blocking = true) => issues.push({ field, message, blocking });

  if (recommendation.target === 'market-month') {
    if (recommendation.startMonth == null || !MONTH_KEY_PATTERN.test(recommendation.startMonth)) {
      push('startMonth', '缺少合法起始月（YYYY-MM）');
    } else if (!monthInHorizon(recommendation.startMonth, calendar)) {
      push('startMonth', `起始月 ${recommendation.startMonth} 超出预测范围 ${calendar.horizonStart}—${calendar.horizonEnd}`);
    }
    const day = recommendation.startDay;
    if (!isFiniteNumber(day) || day < 1 || day > 31) push('startDay', '缺少合法起始日（1–31）');
    const duration = recommendation.durationMonths;
    if (!isFiniteNumber(duration) || duration < 1 || duration > DURATION_MONTHS_MAX) {
      push('durationMonths', `时长须为 1–${DURATION_MONTHS_MAX} 个月`);
    } else if (
      isFiniteNumber(recommendation.startDay) && recommendation.startDay != null
      && recommendation.startMonth != null && monthInHorizon(recommendation.startMonth, calendar)
    ) {
      // 覆盖越出 horizon 终月（尾月截断会静默丢影响）→ blocking，要求人工改参。
      const covered = coveredMonthsOf(recommendation.startMonth, duration, calendar);
      if (covered.length < duration) {
        push('durationMonths', `覆盖超出预测范围（${calendar.horizonEnd} 后无预测月），请缩短时长或前移起始月`);
      }
    }
    const magnitude = recommendation.magnitudePct;
    if (!isFiniteNumber(magnitude) || magnitude < MAGNITUDE_MIN || magnitude > MAGNITUDE_MAX) {
      push('magnitudePct', `幅度须为 ${MAGNITUDE_MIN}…${MAGNITUDE_MAX}%`);
    }
    return issues;
  }

  if (recommendation.target === 'product-range') {
    const range = recommendation.range;
    const start = range != null ? calendar.weekById.get(range.startWeekId) : undefined;
    const end = range != null ? calendar.weekById.get(range.endWeekId) : undefined;
    if (range == null || start == null || end == null) {
      push('range', '缺少合法起止周（须在预测范围内）');
    } else if (start.index > end.index) {
      push('range', `起止周倒置（${range.startWeekId} 晚于 ${range.endWeekId}）`);
    }
    if (recommendation.eventType == null || !PRODUCT_EVENT_TYPES.includes(recommendation.eventType)) {
      push('eventType', '缺少事件类型（竞品上市 / 营销价促 / 自家品挤兑 之一）');
    }
    if (!isFiniteNumber(recommendation.magnitudePct)) push('magnitudePct', '缺少有限的影响幅度（%）');
    if (recommendation.decay !== 'decreasing' && recommendation.decay !== 'flat') {
      push('decay', '缺少形状（递减 / 恒定）');
    }
    if (recommendation.replayId == null || recommendation.replayId.trim() === '') {
      push('replayId', '缺少历史回放 id（回放库匹配在候选接入层校验）');
    }
    return issues;
  }

  if (recommendation.target === 'cost-reference') {
    if (!monthInHorizon(recommendation.startMonth, calendar)) {
      push('startMonth', recommendation.startMonth == null
        ? '缺少成本版本月份'
        : `月份 ${recommendation.startMonth} 超出预测范围 ${calendar.horizonStart}—${calendar.horizonEnd}`);
    }
    const cost = recommendation.unitCost;
    if (!isFiniteNumber(cost) || cost < 0) push('unitCost', '缺少有限非负的单台成本');
    return issues;
  }

  push('target', '未知建议目标，禁止应用');
  return issues;
}

// ------------------------------------------------------------
// buildEventPreview / buildCostScenarioPreview（B.4.8：临时完整 params）
// ------------------------------------------------------------

/** 临时事件 id（确定性，禁随机）：同候选重复构造不产生第二形态。 */
export function previewEventIdOf(recommendation: EventRecommendation): string {
  return recommendation.target === 'market-month' ? `me-from-${recommendation.candidateId}` : `pe-from-${recommendation.candidateId}`;
}

/**
 * 在内存构造「临时完整 params」（B.4.8：仅 market-month / product-range）：
 * 原参数不变（返回新对象）；所需字段缺失时返回原 params 内容（不造数——
 * 调用方先用 validateRecommendation 拦截）。cost-reference 不写 WorkbenchParams，
 * 用 buildCostScenarioPreview 另构临时 MarginScenario。
 */
export function buildEventPreview(recommendation: EventRecommendation, params: WorkbenchParams): WorkbenchParams {
  if (recommendation.target === 'market-month'
    && recommendation.startMonth != null && recommendation.startDay != null
    && recommendation.durationMonths != null && recommendation.magnitudePct != null) {
    const seed: MarketMonthEventSeed = {
      id: previewEventIdOf(recommendation),
      label: recommendation.label,
      startMonth: recommendation.startMonth,
      startDay: Math.max(1, Math.min(31, Math.round(recommendation.startDay))),
      durationMonths: Math.max(1, Math.min(DURATION_MONTHS_MAX, Math.round(recommendation.durationMonths))),
      magnitudePct: recommendation.magnitudePct,
    };
    return { ...params, marketMonthEvents: [...params.marketMonthEvents, seed] };
  }
  if (recommendation.target === 'product-range'
    && recommendation.range != null && recommendation.eventType != null
    && isFiniteNumber(recommendation.magnitudePct)
    && (recommendation.decay === 'decreasing' || recommendation.decay === 'flat')
    && recommendation.replayId != null) {
    const seed: ProductEventSeed = {
      id: previewEventIdOf(recommendation),
      type: recommendation.eventType,
      label: recommendation.label,
      startWeekId: recommendation.range.startWeekId,
      endWeekId: recommendation.range.endWeekId,
      magnitudePct: recommendation.magnitudePct,
      decay: recommendation.decay,
      replayId: recommendation.replayId,
    };
    return { ...params, productEvents: [...params.productEvents, seed] };
  }
  return params;
}

/**
 * 成本候选临时 MarginScenario 形状记录（B.4.8：cost 只构造临时情景）：
 * 只写 costOverrides（月份 → 单台成本 + 理由），priceOverrides 原样保留——
 * 成本候选不自动改价。单位成本非法时返回原 scenario 内容。
 */
export function buildCostScenarioPreview(recommendation: EventRecommendation, scenario: MarginScenario): MarginScenario {
  if (recommendation.target !== 'cost-reference' || recommendation.startMonth == null || !isFiniteNumber(recommendation.unitCost) || recommendation.unitCost < 0) {
    return scenario;
  }
  const reason = recommendation.rationale.trim() !== '' ? recommendation.rationale : `情报候选 ${recommendation.candidateId}`;
  return {
    ...scenario,
    costOverrides: {
      ...scenario.costOverrides,
      [recommendation.startMonth]: { unitCost: recommendation.unitCost, reason },
    },
  };
}

// ------------------------------------------------------------
// findDuplicateImpacts（B.4.8：目标 + 类型 + 范围交集）
// ------------------------------------------------------------

/**
 * 重复落点检测（B.4.8）：同目标 + 类型 + 范围交集的已有事件清单。
 * - product-range：params.productEvents 中同类型且周区间交集非空者，
 *   overlapWeekIds = 交集周（按日历绝对序，跨年不串值）；
 * - market-month：params.marketMonthEvents 覆盖月交集非空者，
 *   overlapWeekIds = 交集月内全部日历周；market-month 事件无类型分野，
 *   类型条件恒成立（月度事件同质）；
 * - cost-reference：无参数落点域，恒返回 []（同情报提醒由工作区承担）；
 * - 候选范围非法（范围外/倒置）返回 []（无法计算交集，不造数）。
 * 传入含「本候选刚构造事件」的 preview 时会报出该事件本身（测试以此验证
 * 交集计算）；UI 预览传原始 params 即只报其他事件。
 */
export function findDuplicateImpacts(
  recommendation: EventRecommendation,
  params: WorkbenchParams,
  calendar: ForecastCalendar,
): DuplicateImpact[] {
  if (recommendation.target === 'product-range') {
    const range = recommendation.range;
    if (range == null) return [];
    const recStart = calendar.weekById.get(range.startWeekId);
    const recEnd = calendar.weekById.get(range.endWeekId);
    if (recStart == null || recEnd == null || recStart.index > recEnd.index) return [];
    const impacts: DuplicateImpact[] = [];
    for (const event of params.productEvents) {
      if (event.type !== recommendation.eventType) continue;
      const start = calendar.weekById.get(event.startWeekId);
      const end = calendar.weekById.get(event.endWeekId);
      if (start == null || end == null || start.index > end.index) continue;
      const from = Math.max(recStart.index, start.index);
      const to = Math.min(recEnd.index, end.index);
      if (from > to) continue;
      impacts.push({
        eventId: event.id,
        overlapWeekIds: calendar.weeks.slice(from, to + 1).map((week) => week.id),
      });
    }
    return impacts;
  }
  if (recommendation.target === 'market-month') {
    if (recommendation.startMonth == null || recommendation.durationMonths == null) return [];
    const recMonths = new Set(coveredMonthsOf(recommendation.startMonth, recommendation.durationMonths, calendar));
    if (recMonths.size === 0) return [];
    const impacts: DuplicateImpact[] = [];
    for (const event of params.marketMonthEvents) {
      const eventMonths = coveredMonthsOf(event.startMonth, event.durationMonths, calendar);
      const overlapMonths = eventMonths.filter((month) => recMonths.has(month));
      if (overlapMonths.length === 0) continue;
      const overlapMonthSet = new Set(overlapMonths);
      impacts.push({
        eventId: event.id,
        overlapWeekIds: calendar.weeks.filter((week) => overlapMonthSet.has(week.monthKey)).map((week) => week.id),
      });
    }
    return impacts;
  }
  return [];
}

/** fixture 类型再出口（面板预览签名用；避免面板直接依赖 fixture 内部路径）。 */
export type WorkbenchFixtureLike = WorkbenchFixture;
