// ============================================================
// 量价参考卡 · 事件领域模型（纯函数层，无副作用）：
// 旧预标迁移 / 预标+补录合并为统一有效事件（EffectiveReferenceEvent）/
// 每面板独立窗口钳制 / 事件时段读数（确定性公式，缺数不造 0）/ 工作区
// schema 校验与迁移 / 颜色对比度提示。
// 边界红线：本层任何输出都只服务本卡的有效视图（图 / 名录 / 编辑器 /
// 回放 / 读数），绝不进入 WorkbenchParams / computeWorkbench；预标
// impactPct 只作「预标参考」标注，绝不参与读数计算，也不写因果词。
// ============================================================
import type { LifecycleEventSeed, LifecycleProductSeed } from './workbenchFixture';

// ------------------------------------------------------------
// 生命周期日历周（2026-11-05 二轮整改：图轴 / 事件周段标签统一同一换算）。
// 换算收编在领域模型层（ReferenceEventComposer 反向 import 会成环），锚点 =
// fixture launchWeekLabel 的真实 ISO 周规则（与 workbenchCalendar 同算法，
// 不新造假日历）；编辑器周历与量价参考图共用，不造第二套。
// ------------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * ISO 周一毫秒（与 workbenchCalendar 同一规则：W1 = 含当年首个周四的周，
 * 周一起算）。仅作周历锚点换算。
 */
export function mondayMsOfIsoWeek(year: number, week: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const day = new Date(jan4).getUTCDay(); // 0 = 周日
  const mondayWeek1 = jan4 - ((day === 0 ? 7 : day) - 1) * DAY_MS;
  return mondayWeek1 + (week - 1) * 7 * DAY_MS;
}

/** 周一毫秒 → 跨年周 ID（YYYYWww；ISO 周四定周年，跨年不串值）。 */
export function weekIdOfMondayMs(mondayMs: number): string {
  const thursday = mondayMs + 3 * DAY_MS;
  const thursdayDate = new Date(thursday);
  const week = Math.round((thursday - mondayMsOfIsoWeek(thursdayDate.getUTCFullYear(), 1)) / (7 * DAY_MS)) + 1;
  return `${thursdayDate.getUTCFullYear()}W${String(week).padStart(2, '0')}`;
}

/**
 * 生命周期全周日历周 ID（YYYYWww；锚点 = launchWeekLabel，真实 ISO 跨年进位）。
 * 量价参考图 X 轴 / 事件周段标签 / 编辑器周历共用同一换算；
 * launchWeekLabel 非法 / 空产品返回 []（调用方安全降级）。
 */
export function lifecycleWeekIdsOf(product: LifecycleProductSeed): string[] {
  const total = product.points.length;
  const match = /^(\d{4})-W(\d{2})$/.exec(product.launchWeekLabel);
  if (total <= 0 || !match) return [];
  const startMs = mondayMsOfIsoWeek(Number(match[1]), Number(match[2]));
  return Array.from({ length: total }, (_, index) => weekIdOfMondayMs(startMs + index * 7 * DAY_MS));
}

// ------------------------------------------------------------
// 类型（规格 §5.1–5.3 草案落地）
// ------------------------------------------------------------

export type ReferenceEventSource = 'fixture' | 'composed';
export type ReferenceDecay = 'decreasing' | 'flat' | 'unspecified';

export const REFERENCE_DECAY_LABEL: Record<ReferenceDecay, string> = {
  decreasing: '递减',
  flat: '恒定',
  unspecified: '未标',
};

/** 参考影响标注（仅历史参考，不进模型）：幅度 % + 影响时长（周）+ 衰减。 */
export interface ReferenceImpactAnnotation {
  magnitudePct: number | null;
  durationWeeks: number | null;
  decay: ReferenceDecay;
}

/** 已提交事件的严格字段（start/end 0 基闭区间；label ≤40、note ≤200 去空白）。 */
export interface ReferenceEventEditableFields {
  typeId: string;
  startWeek: number;
  endWeek: number;
  label: string;
  note: string;
  impact: ReferenceImpactAnnotation | null;
}

/** 统一有效事件：图、名录、编辑器、参考回放、时段读数的唯一数据源。 */
export interface EffectiveReferenceEvent extends ReferenceEventEditableFields {
  id: string;
  productId: string;
  source: ReferenceEventSource;
  /** fixture 预标的稳定 id（source = 'fixture' 时存在）。 */
  sourceEventId?: string;
  /** 存在本地覆写（预标 · 已改）。 */
  overridden: boolean;
  /** 未覆写预标为 0；覆写 / 补录随保存递增。 */
  revision: number;
  /** 纯 fixture 无本地时间；覆写 / 补录才有。 */
  createdAt: string | null;
  updatedAt: string | null;
  /** 预标源已更新（baseFingerprint 与当前 fixture 不符；不静默覆盖）。 */
  sourceChanged?: boolean;
}

/** 编辑器未提交值（起止周允许 null = 未选择；自动保存进 editorDrafts）。 */
export interface ReferenceEventDraftValue {
  typeId: string;
  startWeek: number | null;
  endWeek: number | null;
  label: string;
  note: string;
  impact: ReferenceImpactAnnotation | null;
}

/** 预标覆写记录（键 = productId + sourceEventId，见 ReferenceWorkspace.overrides）。 */
export interface ReferenceEventOverride {
  id: string;
  scopeKey: string;
  productId: string;
  sourceEventId: string;
  /** 保存时的 fixture 预标指纹；不符 = 「源已更新」。 */
  baseFingerprint: string;
  patch: Partial<ReferenceEventEditableFields>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** 本地补录事件（软删除：deletedAt 非空 = 已删除，可撤销恢复）。 */
export interface ComposedReferenceEvent {
  id: string;
  productId: string;
  typeId: string;
  startWeek: number;
  endWeek: number;
  label: string;
  note: string;
  impact: ReferenceImpactAnnotation | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type ReferenceWorkspaceAction =
  | 'create'
  | 'edit'
  | 'delete'
  | 'restore-preset'
  | 'discard-draft'
  | 'clear';

/** 一步变更的 before/after patch（撤销重放用；不回滚整工作区快照）。 */
export interface ReferenceWorkspaceChange {
  composed?: Record<string, ComposedReferenceEvent | null>;
  overrides?: Record<string, ReferenceEventOverride | null>;
  editorDrafts?: Record<string, ReferenceEditorDraft | null>;
}

export interface ReferenceHistoryEntry {
  actionId: string;
  action: ReferenceWorkspaceAction;
  /** 单事件 id；clear 使用 scopeKey。 */
  targetId: string;
  before: ReferenceWorkspaceChange;
  after: ReferenceWorkspaceChange;
  timestamp: string;
}

/** 编辑器未提交草稿（自动保存；id = `${productId}::${eventId ?? 'new'}`）。 */
export interface ReferenceEditorDraft {
  id: string;
  mode: 'create' | 'edit';
  productId: string;
  eventId: string | null;
  value: ReferenceEventDraftValue;
  baseRevision: number | null;
  updatedAt: string;
}

export interface ReferenceWorkspace {
  schemaVersion: 1;
  scopeKey: string;
  revision: number;
  composed: Record<string, ComposedReferenceEvent>;
  overrides: Record<string, ReferenceEventOverride>;
  editorDrafts: Record<string, ReferenceEditorDraft>;
  /** 上限 20（淘汰最旧）；撤销后该步出栈，无 redo。 */
  history: ReferenceHistoryEntry[];
  updatedAt: string;
}

/** 浏览器级事件类型（referenceEventTypeStore 的快照形状）。 */
export interface ReferenceEventType {
  id: string;
  label: string;
  color: string;
  origin: 'builtin' | 'custom';
  order: number;
  updatedAt: string;
}

export const REFERENCE_EVENT_HISTORY_LIMIT = 20;
/** 参考卡独立时间窗最小跨度（周），沿用既有口径。 */
export const REFERENCE_MIN_WINDOW = 8;
/** 聚焦定位窗口跨度（周）。 */
export const FOCUS_SPAN = 16;

export const overrideKeyOf = (productId: string, sourceEventId: string): string =>
  `${productId}::${sourceEventId}`;

// ------------------------------------------------------------
// 预标迁移与指纹
// ------------------------------------------------------------

/**
 * 旧 fixture 预标 → 统一字段：start = end = week，note 初始空，
 * impactPct / impactWeeks 转入 impact，decay = 'unspecified'。
 * 不得把 impactWeeks 变成 endWeek（它描述对同类主品的参考影响，
 * 不是该事件在参考产品上的已发生区间）。
 */
export function migratePresetEvent(product: LifecycleProductSeed, event: LifecycleEventSeed): EffectiveReferenceEvent {
  return {
    id: event.id,
    productId: product.id,
    source: 'fixture',
    sourceEventId: event.id,
    typeId: event.type,
    startWeek: event.week,
    endWeek: event.week,
    label: event.label,
    note: '',
    impact: event.impactPct != null || event.impactWeeks != null
      ? {
          magnitudePct: event.impactPct ?? null,
          durationWeeks: event.impactWeeks ?? null,
          decay: 'unspecified',
        }
      : null,
    overridden: false,
    revision: 0,
    createdAt: null,
    updatedAt: null,
  };
}

/** 预标指纹（identity 字段稳定序列化；fixture 更新后与 baseFingerprint 比对）。 */
export function presetFingerprint(event: LifecycleEventSeed): string {
  return JSON.stringify([event.week, event.type, event.label, event.impactPct ?? null, event.impactWeeks ?? null]);
}

const applyOverridePatch = (base: EffectiveReferenceEvent, patch: Partial<ReferenceEventEditableFields>): EffectiveReferenceEvent => ({
  ...base,
  ...('typeId' in patch ? { typeId: String(patch.typeId) } : null),
  ...('startWeek' in patch ? { startWeek: Number(patch.startWeek) } : null),
  ...('endWeek' in patch ? { endWeek: Number(patch.endWeek) } : null),
  ...('label' in patch ? { label: String(patch.label) } : null),
  ...('note' in patch ? { note: String(patch.note) } : null),
  ...('impact' in patch ? { impact: (patch.impact ?? null) as ReferenceImpactAnnotation | null } : null),
});

/**
 * 合并统一有效事件：有效预标（fixture + override）+ 有效补录（未软删除），
 * 按起周 → 止周 → 创建次序稳定排序。不修改任何输入对象。
 */
export function mergeEffectiveEvents(
  product: LifecycleProductSeed,
  composed: Record<string, ComposedReferenceEvent>,
  overrides: Record<string, ReferenceEventOverride>,
): EffectiveReferenceEvent[] {
  const list: EffectiveReferenceEvent[] = [];
  for (const seed of product.events) {
    let effective = migratePresetEvent(product, seed);
    const ovr = overrides[overrideKeyOf(product.id, seed.id)];
    if (ovr) {
      const changed = ovr.baseFingerprint !== presetFingerprint(seed);
      effective = {
        ...applyOverridePatch(effective, ovr.patch),
        overridden: true,
        revision: ovr.revision,
        createdAt: ovr.createdAt,
        updatedAt: ovr.updatedAt,
        sourceChanged: changed,
      };
    }
    list.push(effective);
  }
  for (const record of Object.values(composed)) {
    if (!record || record.productId !== product.id || record.deletedAt != null) continue;
    list.push({
      typeId: record.typeId,
      startWeek: record.startWeek,
      endWeek: record.endWeek,
      label: record.label,
      note: record.note,
      impact: record.impact,
      id: record.id,
      productId: record.productId,
      source: 'composed',
      overridden: false,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
  return list.sort((a, b) =>
    a.startWeek - b.startWeek
    || a.endWeek - b.endWeek
    || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    || a.id.localeCompare(b.id));
}

// ------------------------------------------------------------
// 窗口 / 区间
// ------------------------------------------------------------

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * 每面板独立窗口钳制：可调域 = [0, points.length - 1]，最短 8 周；
 * 产品不足 8 周时显示全长（缩放禁用由 UI 判断）。
 */
export function clampReferenceWindow(product: LifecycleProductSeed, win: [number, number]): [number, number] {
  const n = product.points.length;
  if (n <= 0) return [0, 0];
  const hi = n - 1;
  if (n < REFERENCE_MIN_WINDOW) return [0, hi];
  let s = clampInt(win[0], 0, hi);
  let e = clampInt(win[1], 0, hi);
  if (s > e) [s, e] = [e, s];
  if (e - s < REFERENCE_MIN_WINDOW - 1) {
    e = Math.min(hi, s + REFERENCE_MIN_WINDOW - 1);
    s = Math.max(0, e - (REFERENCE_MIN_WINDOW - 1));
  }
  return [s, e];
}

/** 全生命周期窗（新面板默认）。 */
export function fullWindowOf(product: LifecycleProductSeed): [number, number] {
  const n = product.points.length;
  return n > 0 ? [0, n - 1] : [0, 0];
}

/** 事件闭区间与时长派生（duration = end − start + 1，不另存可漂移时长）。 */
export const rangeOfEvent = (event: { startWeek: number; endWeek: number }): [number, number] =>
  [event.startWeek, event.endWeek] as [number, number];
export const durationOfEvent = (event: { startWeek: number; endWeek: number }): number =>
  Math.max(1, event.endWeek - event.startWeek + 1);

/**
 * 事件短周段标签（2026-11-05 二轮整改：全卡统一日历周口径，与图轴同形）：
 * - 传产品锚（launchWeekLabel）→ 日历周 ID：单周 = 2025W24；区间 =
 *   2025W24–2025W27（ISO 跨年进位由周历保证）；
 * - 缺省 / 锚非法（标签不符或周序越界）→ 回退生命周期相对周序（W24 形态，
 *   防御路径；生产调用方均传锚）。
 */
export const eventRangeLabel = (
  event: { startWeek: number; endWeek: number },
  anchor?: LifecycleProductSeed,
): string => {
  const relative = event.startWeek === event.endWeek
    ? `W${event.startWeek + 1}`
    : `W${event.startWeek + 1}–W${event.endWeek + 1}`;
  if (!anchor) return relative;
  const weekIds = lifecycleWeekIdsOf(anchor);
  const startId = weekIds[event.startWeek];
  const endId = weekIds[event.endWeek];
  if (!startId || !endId) return relative;
  return startId === endId ? startId : `${startId}–${endId}`;
};

/**
 * 事件定位窗：FOCUS_SPAN 聚焦、事件居中并保证完整起止范围可见。
 */
export function eventFocusWindow(product: LifecycleProductSeed, event: { startWeek: number; endWeek: number }): [number, number] {
  const [s0, e0] = clampReferenceWindow(product, fullWindowOf(product));
  const span = Math.min(FOCUS_SPAN, e0 - s0 + 1);
  const need = event.endWeek - event.startWeek + 1;
  const width = Math.max(span, need);
  const center = (event.startWeek + event.endWeek) / 2;
  let s = Math.round(center - width / 2);
  let e = s + width - 1;
  if (e > e0) {
    e = e0;
    s = Math.max(0, e - width + 1);
  }
  if (s < 0) {
    s = 0;
    e = Math.min(e0, width - 1);
  }
  return [s, Math.max(s, e)];
}

// ------------------------------------------------------------
// 事件时段读数（确定性公式；只读本参考产品量价事实）
// ------------------------------------------------------------

export interface EventRangeReading {
  /** 事件周数 N。 */
  n: number;
  startWeek: number;
  endWeek: number;
  /** 销量有效周（0 基周序）。 */
  salesValidWeeks: number[];
  /** 事件期均周销（台）；有效周为 0 时 null。 */
  salesAvg: number | null;
  /** 实际使用的紧邻等长前段（可用前缀；start = 0 时 null）。 */
  prevRange: [number, number] | null;
  prevValidCount: number;
  prevAvg: number | null;
  /** 销量变化率 %；无法计算时 null（不补 0）。 */
  salesChangePct: number | null;
  salesChangeReason: string | null;
  /** 价格首 / 末有效点（带实际周）。 */
  priceFirst: { week: number; value: number } | null;
  priceLast: { week: number; value: number } | null;
  /** 价格变化率 %；首值 ≤ 0 或缺点时 null（只显示绝对差）。 */
  priceChangePct: number | null;
  priceAbsDiff: number | null;
  /** 覆盖率文本（有效周 / 事件周）。 */
  salesCoverage: string;
  priceCoverage: string;
  /** 计算口径行（前段周段 + 均值比均值；端点取实际有效周）。 */
  formulaNote: string;
}

const isFiniteNum = (v: number | null | undefined): v is number =>
  v != null && typeof v === 'number' && Number.isFinite(v);

/**
 * 事件时段读数：只消费 product.points / pricePoints。
 * - 前段默认取紧邻等长区间 [start−N, start−1]，不足取可用前缀并显示实际周段；
 * - 销量变化率 = (事件期均周销 / 前段均周销 − 1) × 100，前段均值为 0 或任一侧
 *   有效周不足 2 周时「无法计算」，不用 0 补周；
 * - 价格取区间内首个 / 末个有效点（带实际周），首值 ≤ 0 只显示绝对差；
 * - 缺采保持缺失；标题不含因果词（这是共时与前后对比）。
 */
export function computeEventRangeReading(product: LifecycleProductSeed, event: { startWeek: number; endWeek: number }): EventRangeReading {
  const start = Math.max(0, Math.round(event.startWeek));
  const end = Math.max(start, Math.round(event.endWeek));
  const n = end - start + 1;
  const salesValidWeeks: number[] = [];
  let salesSum = 0;
  for (let w = start; w <= end && w < product.points.length; w++) {
    const v = product.points[w];
    if (isFiniteNum(v) && (v as number) >= 0) {
      salesValidWeeks.push(w);
      salesSum += v as number;
    }
  }
  const salesAvg = salesValidWeeks.length > 0 ? salesSum / salesValidWeeks.length : null;

  const idealStart = start - n;
  const prevRange: [number, number] | null = start > 0 && idealStart <= start - 1
    ? [Math.max(0, idealStart), start - 1]
    : null;
  let prevValidCount = 0;
  let prevSum = 0;
  if (prevRange) {
    for (let w = prevRange[0]; w <= prevRange[1] && w < product.points.length; w++) {
      const v = product.points[w];
      if (isFiniteNum(v) && (v as number) >= 0) {
        prevValidCount += 1;
        prevSum += v as number;
      }
    }
  }
  const prevAvg = prevRange && prevValidCount > 0 ? prevSum / prevValidCount : null;

  let salesChangePct: number | null = null;
  let salesChangeReason: string | null = null;
  if (!prevRange) {
    salesChangeReason = '无更早周段可比';
  } else if (salesValidWeeks.length < 2 || prevValidCount < 2) {
    salesChangeReason = '有效周不足 2 周';
  } else if (prevAvg != null && prevAvg <= 0) {
    salesChangeReason = '前段均值为 0';
  } else if (salesAvg == null) {
    salesChangeReason = '事件期无有效销量';
  } else {
    salesChangePct = (salesAvg / (prevAvg as number) - 1) * 100;
  }

  let priceFirst: { week: number; value: number } | null = null;
  let priceLast: { week: number; value: number } | null = null;
  for (let w = start; w <= end && w < product.pricePoints.length; w++) {
    const v = product.pricePoints[w];
    // 0 是有值点（有效事实），百分比只在首值 > 0 时计算（首值为 0 只显示绝对差）
    if (!isFiniteNum(v) || (v as number) < 0) continue;
    if (priceFirst == null) priceFirst = { week: w, value: v as number };
    priceLast = { week: w, value: v as number };
  }
  const priceChangePct = priceFirst && priceLast && priceFirst.value > 0
    ? (priceLast.value / priceFirst.value - 1) * 100
    : null;
  const priceAbsDiff = priceFirst && priceLast && priceFirst.week !== priceLast.week
    ? priceLast.value - priceFirst.value
    : null;

  return {
    n,
    startWeek: start,
    endWeek: end,
    salesValidWeeks,
    salesAvg,
    prevRange,
    prevValidCount,
    prevAvg,
    salesChangePct,
    salesChangeReason,
    priceFirst,
    priceLast,
    priceChangePct,
    priceAbsDiff,
    salesCoverage: `${salesValidWeeks.length}/${n}`,
    priceCoverage: `${countPriceValid(product, start, end)}/${n}`,
    formulaNote: prevRange
      ? `前段 W${prevRange[0] + 1}–W${prevRange[1] + 1} · 均值比均值；端点取实际有效周`
      : '无更早周段 · 端点取实际有效周',
  };
}

function countPriceValid(product: LifecycleProductSeed, start: number, end: number): number {
  let count = 0;
  for (let w = start; w <= end && w < product.pricePoints.length; w++) {
    const v = product.pricePoints[w];
    if (isFiniteNum(v) && (v as number) >= 0) count += 1;
  }
  return count;
}

// ------------------------------------------------------------
// 工作区 schema 校验与迁移（坏记录逐条隔离，不拖垮整卡）
// ------------------------------------------------------------

const DECAYS: ReadonlyArray<ReferenceDecay> = ['decreasing', 'flat', 'unspecified'];

function sanitizeImpact(raw: unknown): ReferenceImpactAnnotation | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const magnitude = typeof r.magnitudePct === 'number' && Number.isFinite(r.magnitudePct) ? r.magnitudePct : null;
  const duration = typeof r.durationWeeks === 'number' && Number.isFinite(r.durationWeeks) && r.durationWeeks > 0
    ? Math.round(r.durationWeeks)
    : null;
  const decay = (DECAYS as ReadonlyArray<string>).includes(r.decay as string) ? (r.decay as ReferenceDecay) : 'unspecified';
  return { magnitudePct: magnitude, durationWeeks: duration, decay };
}

function sanitizeIsoOrNull(raw: unknown, fallback: string | null): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** sanitize 单条补录记录；不合法返回 null（逐条隔离）。 */
export function sanitizeComposedRecord(raw: unknown): ComposedReferenceEvent | null {
  if (!isPlainObject(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.productId !== 'string' || !r.productId) return null;
  if (typeof r.typeId !== 'string' || !r.typeId) return null;
  const start = typeof r.startWeek === 'number' && Number.isFinite(r.startWeek) ? Math.max(0, Math.round(r.startWeek)) : NaN;
  const end = typeof r.endWeek === 'number' && Number.isFinite(r.endWeek) ? Math.max(0, Math.round(r.endWeek)) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const safeEnd = Math.max(start, end);
  return {
    id: r.id,
    productId: r.productId,
    typeId: r.typeId,
    startWeek: start,
    endWeek: safeEnd,
    label: typeof r.label === 'string' ? r.label.slice(0, 200) : '',
    note: typeof r.note === 'string' ? r.note.slice(0, 400) : '',
    impact: sanitizeImpact(r.impact),
    revision: typeof r.revision === 'number' && Number.isFinite(r.revision) ? Math.round(r.revision) : 1,
    createdAt: sanitizeIsoOrNull(r.createdAt, new Date().toISOString()) as string,
    updatedAt: sanitizeIsoOrNull(r.updatedAt, new Date().toISOString()) as string,
    deletedAt: sanitizeIsoOrNull(r.deletedAt, null),
  };
}

/** sanitize 单条预标覆写记录。 */
export function sanitizeOverrideRecord(raw: unknown, scopeKey: string): ReferenceEventOverride | null {
  if (!isPlainObject(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.productId !== 'string' || !r.productId) return null;
  if (typeof r.sourceEventId !== 'string' || !r.sourceEventId) return null;
  if (typeof r.baseFingerprint !== 'string' || !r.baseFingerprint) return null;
  if (!isPlainObject(r.patch)) return null;
  const patchRaw = r.patch as Record<string, unknown>;
  const patch: Partial<ReferenceEventEditableFields> = {};
  if (typeof patchRaw.typeId === 'string' && patchRaw.typeId) patch.typeId = patchRaw.typeId;
  if (typeof patchRaw.startWeek === 'number' && Number.isFinite(patchRaw.startWeek)) patch.startWeek = Math.max(0, Math.round(patchRaw.startWeek));
  if (typeof patchRaw.endWeek === 'number' && Number.isFinite(patchRaw.endWeek)) patch.endWeek = Math.max(0, Math.round(patchRaw.endWeek));
  if (patch.startWeek != null && patch.endWeek != null && patch.endWeek < patch.startWeek) patch.endWeek = patch.startWeek;
  if (typeof patchRaw.label === 'string') patch.label = patchRaw.label.slice(0, 200);
  if (typeof patchRaw.note === 'string') patch.note = patchRaw.note.slice(0, 400);
  if ('impact' in patchRaw) patch.impact = sanitizeImpact(patchRaw.impact);
  const now = new Date().toISOString();
  const id = overrideKeyOf(r.productId as string, r.sourceEventId as string);
  return {
    id,
    scopeKey,
    productId: r.productId as string,
    sourceEventId: r.sourceEventId as string,
    baseFingerprint: r.baseFingerprint as string,
    patch,
    revision: typeof r.revision === 'number' && Number.isFinite(r.revision) ? Math.round(r.revision) : 1,
    createdAt: sanitizeIsoOrNull(r.createdAt, now) as string,
    updatedAt: sanitizeIsoOrNull(r.updatedAt, now) as string,
  };
}

/** sanitize 单条编辑器草稿。 */
export function sanitizeEditorDraft(raw: unknown): ReferenceEditorDraft | null {
  if (!isPlainObject(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.productId !== 'string' || !r.productId) return null;
  const mode = r.mode === 'edit' ? 'edit' : 'create';
  const valueRaw = isPlainObject(r.value) ? r.value : {};
  const v = valueRaw as Record<string, unknown>;
  const start = typeof v.startWeek === 'number' && Number.isFinite(v.startWeek) && v.startWeek >= 0 ? Math.round(v.startWeek) : null;
  const end = typeof v.endWeek === 'number' && Number.isFinite(v.endWeek) && v.endWeek >= 0 ? Math.round(v.endWeek) : null;
  return {
    id: r.id,
    mode,
    productId: r.productId,
    eventId: typeof r.eventId === 'string' && r.eventId ? r.eventId : null,
    value: {
      typeId: typeof v.typeId === 'string' && v.typeId ? v.typeId : 'competitor-launch',
      startWeek: start,
      endWeek: start != null && end != null ? Math.max(start, end) : start != null ? start : end,
      label: typeof v.label === 'string' ? v.label.slice(0, 200) : '',
      note: typeof v.note === 'string' ? v.note.slice(0, 400) : '',
      impact: sanitizeImpact(v.impact),
    },
    baseRevision: typeof r.baseRevision === 'number' && Number.isFinite(r.baseRevision) ? Math.round(r.baseRevision) : null,
    updatedAt: sanitizeIsoOrNull(r.updatedAt, new Date().toISOString()) as string,
  };
}

const HISTORY_ACTIONS: ReadonlyArray<ReferenceWorkspaceAction> =
  ['create', 'edit', 'delete', 'restore-preset', 'discard-draft', 'clear'];

function sanitizeHistory(raw: unknown, scopeKey: string): ReferenceHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ReferenceHistoryEntry[] = [];
  for (const item of raw.slice(-REFERENCE_EVENT_HISTORY_LIMIT)) {
    if (!isPlainObject(item)) continue;
    const r = item as Record<string, unknown>;
    if (!(HISTORY_ACTIONS as ReadonlyArray<string>).includes(r.action as string)) continue;
    const change = (key: 'composed' | 'overrides' | 'editorDrafts'): Record<string, unknown> | undefined => {
      const inner = isPlainObject(r[key]) ? (r[key] as Record<string, unknown>) : undefined;
      if (!inner) return undefined;
      const outInner: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inner)) {
        if (v === null) {
          outInner[k] = null;
          continue;
        }
        if (key === 'composed') {
          const sanitized = sanitizeComposedRecord(v);
          if (sanitized) outInner[k] = sanitized;
        } else if (key === 'overrides') {
          const sanitized = sanitizeOverrideRecord(v, scopeKey);
          if (sanitized) outInner[k] = sanitized;
        } else {
          const sanitized = sanitizeEditorDraft(v);
          if (sanitized) outInner[k] = sanitized;
        }
      }
      return outInner;
    };
    out.push({
      actionId: typeof r.actionId === 'string' && r.actionId ? r.actionId : `h-${out.length}`,
      action: r.action as ReferenceWorkspaceAction,
      targetId: typeof r.targetId === 'string' && r.targetId ? r.targetId : scopeKey,
      before: {
        composed: change('composed') as ReferenceWorkspaceChange['composed'],
        overrides: change('overrides') as ReferenceWorkspaceChange['overrides'],
        editorDrafts: change('editorDrafts') as ReferenceWorkspaceChange['editorDrafts'],
      },
      after: {
        composed: change('composed') as ReferenceWorkspaceChange['composed'],
        overrides: change('overrides') as ReferenceWorkspaceChange['overrides'],
        editorDrafts: change('editorDrafts') as ReferenceWorkspaceChange['editorDrafts'],
      },
      timestamp: sanitizeIsoOrNull(r.timestamp, new Date().toISOString()) as string,
    });
  }
  return out.slice(-REFERENCE_EVENT_HISTORY_LIMIT);
}

export function emptyReferenceWorkspace(scopeKey: string): ReferenceWorkspace {
  return {
    schemaVersion: 1,
    scopeKey,
    revision: 0,
    composed: {},
    overrides: {},
    editorDrafts: {},
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * sanitize + 迁移：schemaVersion ≠ 1 的原始值原样保留到 backup（不销毁）；
 * schemaVersion = 1 时逐条隔离坏记录（badCount > 0 表示有被隔离的条目）。
 */
export function migrateReferenceWorkspace(raw: unknown, scopeKey: string): {
  workspace: ReferenceWorkspace;
  backup: unknown;
  badCount: number;
} {
  const fallback = emptyReferenceWorkspace(scopeKey);
  if (!isPlainObject(raw)) return { workspace: fallback, backup: raw ?? null, badCount: 0 };
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== 1) {
    return { workspace: fallback, backup: raw, badCount: 0 };
  }
  let bad = 0;
  const composed: Record<string, ComposedReferenceEvent> = {};
  if (isPlainObject(r.composed)) {
    for (const [k, v] of Object.entries(r.composed)) {
      const sanitized = sanitizeComposedRecord(v);
      if (sanitized) composed[sanitized.id] = sanitized;
      else bad += 1;
    }
  }
  const overrides: Record<string, ReferenceEventOverride> = {};
  if (isPlainObject(r.overrides)) {
    for (const [, v] of Object.entries(r.overrides)) {
      const sanitized = sanitizeOverrideRecord(v, scopeKey);
      if (sanitized) overrides[sanitized.id] = sanitized;
      else bad += 1;
    }
  }
  const editorDrafts: Record<string, ReferenceEditorDraft> = {};
  if (isPlainObject(r.editorDrafts)) {
    for (const [k, v] of Object.entries(r.editorDrafts)) {
      const sanitized = sanitizeEditorDraft(v);
      if (sanitized) editorDrafts[sanitized.id] = sanitized;
      else bad += 1;
    }
  }
  return {
    workspace: {
      schemaVersion: 1,
      scopeKey,
      revision: typeof r.revision === 'number' && Number.isFinite(r.revision) ? Math.round(r.revision) : 0,
      composed,
      overrides,
      editorDrafts,
      history: sanitizeHistory(r.history, scopeKey),
      updatedAt: sanitizeIsoOrNull(r.updatedAt, new Date().toISOString()) as string,
    },
    backup: null,
    badCount: bad,
  };
}

// ------------------------------------------------------------
// 撤销重放（before/after patch，不回滚整工作区）
// ------------------------------------------------------------

function applyChangeSide(
  workspace: ReferenceWorkspace,
  change: ReferenceWorkspaceChange | undefined,
): ReferenceWorkspace {
  let next = workspace;
  const applyRecord = <K extends 'composed' | 'overrides' | 'editorDrafts'>(
    key: K,
  ): void => {
    const patch = change?.[key];
    if (!patch) return;
    const bag: Record<string, unknown> = { ...next[key] };
    for (const [id, value] of Object.entries(patch)) {
      if (value == null) delete bag[id];
      else bag[id] = value;
    }
    next = { ...next, [key]: bag } as ReferenceWorkspace;
  };
  applyRecord('composed');
  applyRecord('overrides');
  applyRecord('editorDrafts');
  return next;
}

/** 撤销一步：弹出最后一条历史并重放其 before patch，生成新 revision。 */
export function undoLastReferenceAction(workspace: ReferenceWorkspace): ReferenceWorkspace {
  if (workspace.history.length === 0) return workspace;
  const last = workspace.history[workspace.history.length - 1];
  const next = applyChangeSide(workspace, last.before);
  return {
    ...next,
    revision: next.revision + 1,
    history: workspace.history.slice(0, -1),
    updatedAt: new Date().toISOString(),
  };
}

/** 追加一条历史（超出 20 淘汰最旧）。 */
export function pushReferenceHistory(
  workspace: ReferenceWorkspace,
  entry: Omit<ReferenceHistoryEntry, 'actionId' | 'timestamp'> & { actionId?: string },
): ReferenceWorkspace {
  const withChange = applyChangeSide(workspace, entry.after);
  const history = [...withChange.history, {
    ...entry,
    actionId: entry.actionId ?? `h-${workspace.revision + 1}-${entry.action}`,
    timestamp: new Date().toISOString(),
  } as ReferenceHistoryEntry].slice(-REFERENCE_EVENT_HISTORY_LIMIT);
  return {
    ...withChange,
    revision: withChange.revision + 1,
    history,
    updatedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------
// 颜色对比度提示（非阻断；颜色绝不单独承载类型/状态）
// ------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const body = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

function luminanceOf(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number | null {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return null;
  const la = luminanceOf(rgbA);
  const lb = luminanceOf(rgbB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbDistance(a: string, b: string): number | null {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return null;
  return Math.sqrt((rgbA[0] - rgbB[0]) ** 2 + (rgbA[1] - rgbB[1]) ** 2 + (rgbA[2] - rgbB[2]) ** 2);
}

/**
 * 颜色提示（不影响模型）：白底对比不足 / 与量价系列色过近时给非阻断提醒，
 * 正常返回 null。文字标签始终存在，颜色不单独承载类型。
 */
export function contrastHintOf(colorHex: string, seriesColor?: string): string | null {
  const ratio = contrastRatio(colorHex, '#ffffff');
  if (ratio != null && ratio < 2.5) return '白底对比不足，锚点与文字可能难以辨认';
  if (seriesColor) {
    const d = rgbDistance(colorHex, seriesColor);
    if (d != null && d < 48) return '与量柱 / 价格线颜色过近，事件可能被误读为数据系列';
  }
  return null;
}

// ------------------------------------------------------------
// 校验（编辑器提交前）
// ------------------------------------------------------------

export const LABEL_MAX = 40;
export const NOTE_MAX = 200;

export interface DraftValidationResult {
  ok: boolean;
  weekMissing: boolean;
  labelMissing: boolean;
  labelTooLong: boolean;
  noteMissing: boolean;
  noteTooLong: boolean;
}

export function validateReferenceDraftValue(value: ReferenceEventDraftValue): DraftValidationResult {
  const weekMissing = value.startWeek == null || value.endWeek == null;
  const label = value.label.trim();
  const note = value.note.trim();
  return {
    ok: !weekMissing && label.length > 0 && label.length <= LABEL_MAX && note.length > 0 && note.length <= NOTE_MAX,
    weekMissing,
    labelMissing: label.length === 0,
    labelTooLong: label.length > LABEL_MAX,
    noteMissing: note.length === 0,
    noteTooLong: note.length > NOTE_MAX,
  };
}

/** 新补录事件 id（稳定唯一；jsdom/旧环境无 crypto.randomUUID 时回退随机串）。 */
export function newComposedEventId(): string {
  const c = typeof crypto !== 'undefined' ? (crypto as { randomUUID?: () => string }).randomUUID : undefined;
  if (typeof c === 'function') return `ce-${c.call(crypto)}`;
  return `ce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
