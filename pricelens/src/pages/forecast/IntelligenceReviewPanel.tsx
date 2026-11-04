// ============================================================
// 量价预测 · v3 情报候选审核面板（forecast-global-ia-review 3.3 / B.5.9 /
// 任务 8）：②大盘卡右 1/3 的真实候选容器。闭环固定为——候选区（只读事实）
// → 逐条 接受 / 改参 / 拒绝 / 移除出列表 → 审核弹层（事实 → 转化建议 →
// 影响预览）→ 确认应用 → 已应用行「已应用 · 查看落点」。红线：
// - availability 非 ready 只画空态 + 禁用按钮，不画五条假候选；
// - 无「一键全部接受」；无预览的批量应用不做；跨目标候选只允许批量移除/拒绝；
// - 预览 = buildEventPreview 临时 params（fixture 在位时另调一次
//   computeWorkbench 只读复算前后差），确认前绝不调用页面 setter；
// - 成本候选只构造临时 MarginScenario（onApplyMargin），不自动改价；
// - 依据状态统一「依据齐全 / 部分待核 / 需人工补参」文案，不给概率分；
// - 名称永远不 blocking；「已改」字段与「建议」字段逐项标注；
// - 移除/拒绝收折叠区可撤销（整批一个撤销动作）；来源更新不静默改已应用参数；
// - 同一情报已有落点必提醒（即使改了幅度）。
// 审核状态经 reviewState + onReviewChange 受控（页面级持久化与 20 步撤销见
// useIntelligenceReview）；面板内部持有等形状态与轻量撤销栈，使本组件在
// 页级接线（任务 10）前即可独立审核与撤销。
// 视觉沿用 WorkbenchBits / 弹层既有语言：白卡 + hairline + 中性灰 chip，
// 无 AI 专属色、无概率表达、无新增 token。
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Button, Input, InputNumber, Modal, Select } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { ForecastCalendar, WeekId } from './workbenchCalendar';
import type { MarketMonthEventSeed, ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import { computeWorkbench, marketMonthEventFactor, rangeEventFactorAt, type WorkbenchParams, type WorkbenchResult } from './workbenchModel';
import {
  buildCostScenarioPreview,
  buildEventPreview,
  findDuplicateImpacts,
  previewEventIdOf,
  validateRecommendation,
  type CandidateReview,
  type EventRecommendation,
  type IntelligenceItem,
  type IntelligenceReviewState,
  type IntelligenceTarget,
  type MarginScenario,
  type ReviewMeta,
  type ValidationIssue,
} from './intelligenceModel';

// ---------------- 可用性与常量 ----------------

/** 候选生成能力状态（B.5.9 G 表收敛）：非 ready 一律空态 + 禁用按钮。 */
export type IntelligenceAvailability = 'pending' | 'loading' | 'ready';

/** Top5 语义：主列表一次最多列出的待审核候选数。 */
const TOP_N = 5;
/** 面板内轻量撤销栈深度（与工作区 20 步同参）。 */
const PANEL_HISTORY_MAX = 20;

const EMPTY_SCENARIO: MarginScenario = { costOverrides: {}, priceOverrides: {} };

const TARGET_LABEL: Record<IntelligenceTarget, string> = {
  'market-month': '②大盘',
  'product-range': '主图',
  'cost-reference': '④成本',
};

const EVIDENCE_LABEL = { supported: '依据齐全', partial: '部分待核', insufficient: '需人工补参' } as const;

const DATA_STATUS_LABEL = { real: '真实', simulated: '模拟', mixed: '混合' } as const;

const EVENT_TYPE_LABEL: Record<ProductEventSeed['type'], string> = {
  'competitor-launch': '竞品上市',
  'own-promo': '营销价促',
  'cannibalization': '自家品挤兑',
};

/** 缺字段 / 校验 field → 中文列名（缺字段行列出缺什么）。 */
const FIELD_LABEL: Record<string, string> = {
  target: '目标',
  range: '起止周',
  startMonth: '起始月',
  startDay: '起始日',
  durationMonths: '时长',
  magnitudePct: '幅度',
  eventType: '事件类型',
  decay: '形状',
  replayId: '回放 id',
  unitCost: '单台成本',
};

const fmtSignedPct = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`;
const fmtUnit = (units: number): string => `${Math.round(units).toLocaleString('en-US')} 台`;
const fmtUsd = (usd: number): string => `$${Math.round(usd).toLocaleString('en-US')}`;

/** chip（中性灰；状态文字 + 色双通道，无 AI 专属色）。 */
function chipStyle(ink: string = color.body, bg: string = color.canvasSoft2): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 6px', borderRadius: radius.pill,
    fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap', background: bg, color: ink, border: `1px solid ${color.hairline}`,
  };
}

const rowStyle: React.CSSProperties = {
  display: 'grid', gap: 3, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
  padding: `${space.sm}px ${space.md - 2}px`, background: color.canvas,
};

/** 默认候选审核状态（B.4.3）。 */
function newCandidateReview(): CandidateReview {
  return { status: 'new', draft: null, appliedEventIds: [], batchId: null, reviewedAt: null };
}

let batchSeq = 0;
/** 批次号（UI 层生成，禁随机模型禁令不适用；单调递增防同毫秒串号）。 */
function nextBatchId(): string {
  batchSeq += 1;
  return `ib-${Date.now().toString(36)}-${batchSeq}`;
}

/** 两条候选的范围是否重叠（批量预览「互不重复」校验；纯日历计算）。 */
function recommendationsOverlap(a: EventRecommendation, b: EventRecommendation, calendar: ForecastCalendar): boolean {
  if (a.target !== b.target) return false;
  if (a.target === 'product-range' && b.target === 'product-range') {
    if (a.eventType !== b.eventType || a.range == null || b.range == null) return false;
    const aStart = calendar.weekById.get(a.range.startWeekId);
    const aEnd = calendar.weekById.get(a.range.endWeekId);
    const bStart = calendar.weekById.get(b.range.startWeekId);
    const bEnd = calendar.weekById.get(b.range.endWeekId);
    if (!aStart || !aEnd || !bStart || !bEnd || aStart.index > aEnd.index || bStart.index > bEnd.index) return false;
    return Math.max(aStart.index, bStart.index) <= Math.min(aEnd.index, bEnd.index);
  }
  if (a.target === 'market-month' && b.target === 'market-month') {
    if (a.startMonth == null || a.durationMonths == null || b.startMonth == null || b.durationMonths == null) return false;
    const monthsOf = (startMonth: string, duration: number): string[] => {
      const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(startMonth);
      if (!match) return [];
      const months: string[] = [];
      let year = Number(match[1]);
      let month = Number(match[2]);
      for (let index = 0; index < duration; index += 1) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
      }
      return months;
    };
    const bMonths = new Set(monthsOf(b.startMonth, b.durationMonths));
    return monthsOf(a.startMonth, a.durationMonths).some((month) => bMonths.has(month));
  }
  return false;
}

// ---------------- 面板 ----------------

export interface IntelligenceReviewPanelProps {
  availability: IntelligenceAvailability;
  /** 情报事实（只读；不进 WorkbenchParams）。 */
  items?: IntelligenceItem[];
  /** 转化建议（任务 8：由测试/未来适配器注入；默认候选生成不可用）。 */
  recommendations?: EventRecommendation[];
  calendar?: ForecastCalendar;
  params?: WorkbenchParams;
  result?: WorkbenchResult;
  /** 选填：在位时影响预览追加 computeWorkbench 只读复算前后差（任务 10 页级传入）。 */
  fixture?: WorkbenchFixture;
  marginScenario?: MarginScenario;
  reviewState?: IntelligenceReviewState;
  onReviewChange?: (next: IntelligenceReviewState) => void;
  onApplyParams?: (nextParams: WorkbenchParams, reviewMeta: ReviewMeta) => void;
  onApplyMargin?: (nextScenario: MarginScenario, reviewMeta: ReviewMeta) => void;
  /** 已应用行「查看落点」跨卡定位（任务 6/10 页级接线；缺省按钮禁用）。 */
  onLocate?: (candidateId: string) => void;
}

export default function IntelligenceReviewPanel({
  availability,
  items = [],
  recommendations = [],
  calendar,
  params,
  result,
  fixture,
  marginScenario,
  reviewState,
  onReviewChange,
  onApplyParams,
  onApplyMargin,
  onLocate,
}: IntelligenceReviewPanelProps) {
  const [review, setReview] = useState<IntelligenceReviewState>(() => reviewState ?? { byCandidate: {} });
  const [past, setPast] = useState<IntelligenceReviewState[]>([]);
  const [lastBatchMessage, setLastBatchMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [modal, setModal] = useState<{ candidateId: string; mode: 'accept' | 'edit' } | null>(null);
  const [draft, setDraft] = useState<EventRecommendation | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  /** eventId → 是否存在于当前 params（undefined = 视为在位；false = 确认已随重置移除）。 */
  const [eventPresence, setEventPresence] = useState<Record<string, boolean>>({});
  const paramsRef = useRef<WorkbenchParams | undefined>(undefined);

  // 页级 reviewState 变更（hook 持久化回写）同步本地受控副本。
  useEffect(() => {
    if (reviewState != null) setReview(reviewState);
  }, [reviewState]);

  // params 身份变化时复核已应用事件在位性：消失 = 「事件已随重置移除」。
  // （页级 setter 回写 params 前，本面板按「在位」显示已应用——与父组件刷新时序解耦。）
  useEffect(() => {
    if (params === paramsRef.current) return;
    paramsRef.current = params;
    const ids = new Set<string>([
      ...(params?.productEvents ?? []).map((event) => event.id),
      ...(params?.marketMonthEvents ?? []).map((event) => event.id),
    ]);
    setEventPresence((prev) => {
      const next: Record<string, boolean> = {};
      for (const [eventId] of Object.entries(prev)) next[eventId] = ids.has(eventId);
      return next;
    });
  }, [params]);

  // ---------------- 审核状态机（本地 + onReviewChange 上报） ----------------

  const statusOf = (candidateId: string): CandidateReview['status'] => review.byCandidate[candidateId]?.status ?? 'new';

  const commit = (next: IntelligenceReviewState, batchMessage?: string): void => {
    setPast((prev) => [...prev, review].slice(-PANEL_HISTORY_MAX));
    setReview(next);
    setLastBatchMessage(batchMessage ?? null);
    onReviewChange?.(next);
  };

  const undo = (): void => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setReview(previous);
    setLastBatchMessage(null);
    onReviewChange?.(previous);
  };

  const patchCandidate = (candidateId: string, next: CandidateReview, batchMessage?: string): void => {
    commit({ ...review, byCandidate: { ...review.byCandidate, [candidateId]: next } }, batchMessage);
  };

  const itemOf = (intelligenceId: string): IntelligenceItem | undefined =>
    items.find((item) => item.intelligenceId === intelligenceId);

  /** 生效建议 = 编辑草稿（有）否则原建议。 */
  const effectiveOf = (rec: EventRecommendation): EventRecommendation =>
    review.byCandidate[rec.candidateId]?.draft ?? rec;

  // ---------------- 行级派生 ----------------

  const pendingRows = recommendations.filter((rec) => {
    const status = statusOf(rec.candidateId);
    return status === 'new' || status === 'editing';
  });
  const appliedRows = recommendations.filter((rec) => statusOf(rec.candidateId) === 'accepted');
  const dismissedRows = recommendations.filter((rec) => {
    const status = statusOf(rec.candidateId);
    return status === 'removed' || status === 'rejected';
  });
  const visibleRows = [...pendingRows, ...appliedRows].slice(0, TOP_N);
  const pendingCount = pendingRows.length;
  const selectableIds = pendingRows.slice(0, TOP_N).map((rec) => rec.candidateId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const selectedRecs = recommendations.filter((rec) => selected.has(rec.candidateId));

  /** 批量预览可用性（B.5.9：依据齐全 + 目标相同 + 逐项合法 + 互不重复）。 */
  const batchReasons: string[] = [];
  let batchPreviewReady = selectedRecs.length > 0;
  const batchTargets = new Set(selectedRecs.map((rec) => rec.target));
  if (selectedRecs.length > 0 && batchTargets.size > 1) {
    batchPreviewReady = false;
    batchReasons.push('跨目标候选不可批量生效：仅可批量移除 / 批量拒绝，或按目标分组分别预览');
  }
  for (const rec of selectedRecs) {
    const title = itemOf(rec.intelligenceId)?.title ?? rec.candidateId;
    if (rec.evidenceState !== 'supported') {
      batchPreviewReady = false;
      batchReasons.push(`${title}：依据未齐全（${EVIDENCE_LABEL[rec.evidenceState]}）`);
    }
    if (calendar != null) {
      const blocking = validateRecommendation(itemOf(rec.intelligenceId) ?? ({
        intelligenceId: rec.intelligenceId, title: '', summary: '', excerpt: '', sourceName: '', sourceUrl: null,
        publishedAt: '', capturedAt: '', dataStatus: 'simulated', scope: { country: '', industry: '', channel: '', product: null },
      } satisfies IntelligenceItem), effectiveOf(rec), calendar).filter((issue) => issue.blocking);
      if (blocking.length > 0) {
        batchPreviewReady = false;
        batchReasons.push(`${title}：${blocking[0].message}`);
      }
    }
  }
  for (let i = 0; i < selectedRecs.length && calendar != null; i += 1) {
    for (let j = i + 1; j < selectedRecs.length; j += 1) {
      const a = effectiveOf(selectedRecs[i]);
      const b = effectiveOf(selectedRecs[j]);
      if (recommendationsOverlap(a, b, calendar)) {
        batchPreviewReady = false;
        const titleA = itemOf(a.intelligenceId)?.title ?? a.candidateId;
        const titleB = itemOf(b.intelligenceId)?.title ?? b.candidateId;
        batchReasons.push(`${titleA} 与 ${titleB}：范围重叠可能重复计入`);
      }
    }
  }

  // ---------------- 动作 ----------------

  const openReview = (rec: EventRecommendation, mode: 'accept' | 'edit'): void => {
    const stored = review.byCandidate[rec.candidateId];
    setDraft(stored?.draft ?? rec);
    setModal({ candidateId: rec.candidateId, mode });
  };

  /** 关闭弹层：有未保存修改时不丢草稿（转 editing 留存）；未改动则不留痕。 */
  const closeReview = (): void => {
    if (modal != null && draft != null) {
      const original = recommendations.find((rec) => rec.candidateId === modal.candidateId) ?? null;
      const unchanged = original != null && JSON.stringify(draft) === JSON.stringify(original);
      const current = review.byCandidate[modal.candidateId] ?? newCandidateReview();
      if (!unchanged && current.draft !== draft) {
        patchCandidate(modal.candidateId, { ...current, status: 'editing', draft });
      }
    }
    setModal(null);
    setDraft(null);
  };

  const markApplied = (candidateIds: string[], eventIds: string[], batchId: string, drafts: Array<EventRecommendation | null>): void => {
    const byCandidate = { ...review.byCandidate };
    const now = new Date().toISOString();
    candidateIds.forEach((candidateId, index) => {
      const current = byCandidate[candidateId] ?? newCandidateReview();
      byCandidate[candidateId] = {
        status: 'accepted',
        draft: drafts[index] ?? current.draft,
        appliedEventIds: [...current.appliedEventIds, ...(eventIds.length ? eventIds : [])],
        batchId,
        reviewedAt: now,
      };
    });
    commit({ ...review, byCandidate });
    for (const eventId of eventIds) {
      setEventPresence((prev) => ({ ...prev, [eventId]: true }));
    }
  };

  const confirmApply = (): void => {
    if (modal == null || draft == null || calendar == null) return;
    const item = itemOf(draft.intelligenceId);
    const blocking = validateRecommendation(item ?? {
      intelligenceId: draft.intelligenceId, title: '', summary: '', excerpt: '', sourceName: '', sourceUrl: null,
      publishedAt: '', capturedAt: '', dataStatus: 'simulated', scope: { country: '', industry: '', channel: '', product: null },
    }, draft, calendar).filter((issue) => issue.blocking);
    if (blocking.length > 0) return;
    const batchId = nextBatchId();
    const eventIds = draft.target === 'cost-reference' ? [] : [previewEventIdOf(draft)];
    const meta: ReviewMeta = { candidateIds: [modal.candidateId], batchId, appliedEventIds: eventIds };
    if (draft.target === 'cost-reference') {
      onApplyMargin?.(buildCostScenarioPreview(draft, marginScenario ?? EMPTY_SCENARIO), meta);
    } else {
      if (params == null) return; // 无 params 无法构造临时参数，不写
      onApplyParams?.(buildEventPreview(draft, params), meta);
    }
    markApplied([modal.candidateId], eventIds, batchId, [draft]);
    setModal(null);
    setDraft(null);
  };

  const confirmBatchApply = (): void => {
    if (!batchPreviewReady) return;
    const recs = selectedRecs.map((rec) => effectiveOf(rec));
    const candidateIds = selectedRecs.map((rec) => rec.candidateId);
    const batchId = nextBatchId();
    const eventIds = recs.filter((rec) => rec.target !== 'cost-reference').map(previewEventIdOf);
    const meta: ReviewMeta = { candidateIds, batchId, appliedEventIds: eventIds };
    if (recs.every((rec) => rec.target === 'cost-reference')) {
      // 同目标 = ④成本批次：一次 onApplyMargin 原子写入合并后的临时 MarginScenario。
      let scenario = marginScenario ?? EMPTY_SCENARIO;
      for (const rec of recs) scenario = buildCostScenarioPreview(rec, scenario);
      onApplyMargin?.(scenario, meta);
    } else {
      // 同目标 = ②/主图批次：先逐项 buildEventPreview 合成一个临时 params，一次 setter 写入。
      if (params == null) return;
      let merged = params;
      for (const rec of recs) merged = buildEventPreview(rec, merged);
      onApplyParams?.(merged, meta);
    }
    markApplied(candidateIds, eventIds, batchId, recs.map((rec) => review.byCandidate[rec.candidateId]?.draft ?? null));
    setBatchModalOpen(false);
    setSelected(new Set());
  };

  const toggleAll = (): void => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const batchRemove = (): void => {
    const ids = selectedRecs.map((rec) => rec.candidateId);
    if (ids.length === 0) return;
    const byCandidate = { ...review.byCandidate };
    for (const id of ids) {
      byCandidate[id] = { ...(byCandidate[id] ?? newCandidateReview()), status: 'removed' };
    }
    commit({ ...review, byCandidate }, `已移除 ${ids.length} 条 · 撤销`);
    setSelected(new Set());
  };

  const batchReject = (): void => {
    const ids = selectedRecs.map((rec) => rec.candidateId);
    if (ids.length === 0) return;
    const byCandidate = { ...review.byCandidate };
    for (const id of ids) {
      byCandidate[id] = { ...(byCandidate[id] ?? newCandidateReview()), status: 'rejected' };
    }
    commit({ ...review, byCandidate }, `已拒绝 ${ids.length} 条 · 撤销`);
    setSelected(new Set());
  };

  const removeOne = (rec: EventRecommendation): void => {
    patchCandidate(rec.candidateId, { ...(review.byCandidate[rec.candidateId] ?? newCandidateReview()), status: 'removed' });
  };

  const rejectOne = (rec: EventRecommendation): void => {
    const reason = rejectReasons[rec.candidateId]?.trim() ?? '';
    const current = review.byCandidate[rec.candidateId] ?? newCandidateReview();
    patchCandidate(rec.candidateId, {
      ...current,
      status: 'rejected',
      draft: reason !== '' && current.draft != null ? { ...current.draft, rationale: reason } : current.draft,
    });
  };

  const restoreOne = (candidateId: string): void => {
    patchCandidate(candidateId, { ...(review.byCandidate[candidateId] ?? newCandidateReview()), status: 'new' });
  };

  // ---------------- 渲染 ----------------

  if (availability !== 'ready') {
    return (
      <div data-lpl-intelligence-panel data-lpl-intelligence-availability={availability} style={{ display: 'grid', gap: space.sm, paddingBottom: space.md, borderBottom: `1px solid ${color.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>情报候选 · 待审核 0</span>
          <Button size="small" disabled title="候选生成能力待接入，抓取逻辑另议">更新候选</Button>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: color.body }}>候选生成能力待接入</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.6, color: color.mute }}>
          抓取与排序逻辑另议；接入后在此先列后审（接受 / 改参 / 拒绝 / 移除出列表），不自动写入事件。
        </div>
      </div>
    );
  }

  return (
    <div data-lpl-intelligence-panel data-lpl-intelligence-availability="ready" style={{ display: 'grid', gap: space.sm, paddingBottom: space.md, borderBottom: `1px solid ${color.hairline}` }}>
      {/* 标题 + [更新候选] 禁用位（候选生成未接入；Top5 数量语义） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <span data-lpl-intelligence-title style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{`情报候选 · 待审核 ${pendingCount}`}</span>
        <Button size="small" disabled title="候选生成能力待接入，抓取逻辑另议">更新候选</Button>
      </div>

      {recommendations.length === 0 && (
        <>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: color.body }}>当前情报没有可转化事件</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, color: color.mute }}>人工事件仍可在下方事件区录入。</div>
        </>
      )}

      {/* 批量操作条：复选框默认不勾；跨目标只允许整理（批量移除 / 批量拒绝） */}
      {selectableIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: color.body }}>
            <input
              type="checkbox"
              aria-label="选择当前 Top5"
              checked={allSelected}
              onChange={toggleAll}
            />
            全选
          </label>
          <span style={{ fontSize: 11, color: color.mute }}>{`已选 ${selected.size} 条`}</span>
          <Button size="small" disabled={selected.size === 0} onClick={batchRemove}>批量移除</Button>
          <Button size="small" disabled={selected.size === 0} onClick={batchReject}>批量拒绝</Button>
          <Button size="small" disabled={!batchPreviewReady} onClick={() => setBatchModalOpen(true)}>批量预览</Button>
        </div>
      )}
      {selected.size > 0 && batchReasons.length > 0 && (
        <div data-lpl-batch-reasons style={{ fontSize: 11, lineHeight: 1.6, color: color.warningInk }}>
          {batchReasons.map((reason) => <div key={reason}>{reason}</div>)}
        </div>
      )}

      {/* 候选行（先列后删；已应用行保留不消失） */}
      <div role="list" aria-label="情报候选列表" style={{ display: 'grid', gap: space.sm }}>
        {visibleRows.map((rec) => (
          <CandidateRow
            key={rec.candidateId}
            rec={effectiveOf(rec)}
            item={itemOf(rec.intelligenceId)}
            status={statusOf(rec.candidateId)}
            reviewEntry={review.byCandidate[rec.candidateId]}
            eventPresence={eventPresence}
            calendar={calendar}
            params={params}
            selected={selected.has(rec.candidateId)}
            onToggleSelect={() => {
              const next = new Set(selected);
              if (next.has(rec.candidateId)) next.delete(rec.candidateId);
              else next.add(rec.candidateId);
              setSelected(next);
            }}
            onAccept={() => openReview(rec, 'accept')}
            onEdit={() => openReview(rec, 'edit')}
            onReject={() => rejectOne(rec)}
            onRemove={() => removeOne(rec)}
            onLocate={onLocate}
          />
        ))}
      </div>

      {/* 整组撤销（批量移除 / 批量拒绝一个撤销动作） */}
      {lastBatchMessage != null && (
        <button
          type="button"
          data-lpl-batch-undo
          onClick={undo}
          style={{
            border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, padding: '3px 10px',
            background: color.canvas, color: color.link, fontSize: 11.5, cursor: 'pointer', textAlign: 'left',
          }}
        >
          {lastBatchMessage}
        </button>
      )}

      {/* 已移除 / 已拒绝折叠区（可撤销恢复） */}
      {dismissedRows.length > 0 && (
        <details data-lpl-dismissed-region>
          <summary style={{ fontSize: 11.5, color: color.mute, cursor: 'pointer' }}>{`已移除 / 已拒绝（${dismissedRows.length} · 可撤销）`}</summary>
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.sm }}>
            {dismissedRows.map((rec) => {
              const title = itemOf(rec.intelligenceId)?.title ?? rec.candidateId;
              const status = statusOf(rec.candidateId);
              return (
                <div key={rec.candidateId} style={{ ...rowStyle, background: color.canvasSoft2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: color.body }}>{title}</span>
                    <span style={chipStyle()}>{status === 'removed' ? '已移除' : '已拒绝'}</span>
                    <Button size="small" aria-label={`恢复 ${title}`} onClick={() => restoreOne(rec.candidateId)}>恢复</Button>
                  </div>
                  {status === 'rejected' && (
                    <Input
                      size="small"
                      aria-label={`拒绝原因（选填） ${title}`}
                      placeholder="拒绝原因（选填）"
                      value={rejectReasons[rec.candidateId] ?? ''}
                      onChange={(event) => setRejectReasons((prev) => ({ ...prev, [rec.candidateId]: event.target.value }))}
                      onBlur={() => {
                        const reason = rejectReasons[rec.candidateId]?.trim() ?? '';
                        const current = review.byCandidate[rec.candidateId];
                        if (reason !== '' && current != null && current.draft != null) {
                          patchCandidate(rec.candidateId, { ...current, draft: { ...current.draft, rationale: reason } });
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* 审核弹层：事实 → 转化建议 → 影响预览 → 动作（单弹层，不新增工作台） */}
      {modal != null && draft != null && calendar != null && (
        <ReviewModal
          draft={draft}
          original={recommendations.find((rec) => rec.candidateId === modal.candidateId) ?? draft}
          item={itemOf(draft.intelligenceId)}
          recommendations={recommendations}
          calendar={calendar}
          params={params}
          result={result}
          fixture={fixture}
          review={review}
          onDraftChange={setDraft}
          onClose={closeReview}
          onConfirm={confirmApply}
        />
      )}

      {/* 批量预览弹层：共同范围 → 每条参数 → 合并影响 → 重复计入（确认应用 N 条） */}
      {batchModalOpen && calendar != null && params != null && (
        <BatchPreviewModal
          recs={selectedRecs.map((rec) => effectiveOf(rec))}
          itemOf={itemOf}
          calendar={calendar}
          params={params}
          result={result}
          fixture={fixture}
          onClose={() => setBatchModalOpen(false)}
          onConfirm={confirmBatchApply}
        />
      )}
    </div>
  );
}

// ---------------- 候选行 ----------------

function CandidateRow({
  rec,
  item,
  status,
  reviewEntry,
  eventPresence,
  calendar,
  params,
  selected,
  onToggleSelect,
  onAccept,
  onEdit,
  onReject,
  onRemove,
  onLocate,
}: {
  rec: EventRecommendation;
  item: IntelligenceItem | undefined;
  status: CandidateReview['status'];
  reviewEntry: CandidateReview | undefined;
  eventPresence: Record<string, boolean>;
  calendar?: ForecastCalendar;
  params?: WorkbenchParams;
  selected: boolean;
  onToggleSelect: () => void;
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
  onRemove: () => void;
  onLocate?: (candidateId: string) => void;
}) {
  const title = item?.title ?? rec.candidateId;
  const editing = status === 'editing';
  // 「事件已随重置移除」：accepted 且事件链接确认已不在 params（eventPresence === false）。
  const resetRemoved = status === 'accepted'
    && reviewEntry != null && reviewEntry.appliedEventIds.length > 0
    && reviewEntry.appliedEventIds.every((eventId) => eventPresence[eventId] === false);
  const applied = status === 'accepted' && !resetRemoved;
  // 「来源已更新」：已审核后情报又有新抓取（不静默改已应用参数）。
  const sourceUpdated = status === 'accepted'
    && reviewEntry?.reviewedAt != null && item != null && item.capturedAt > reviewEntry.reviewedAt;
  const blocking: ValidationIssue[] = calendar != null
    ? validateRecommendation(item ?? {
      intelligenceId: rec.intelligenceId, title: '', summary: '', excerpt: '', sourceName: '', sourceUrl: null,
      publishedAt: '', capturedAt: '', dataStatus: 'simulated', scope: { country: '', industry: '', channel: '', product: null },
    }, rec, calendar).filter((issue) => issue.blocking)
    : [];
  const rangeText = describeRecommendation(rec, calendar);
  const missingText = rec.missingFields.length > 0
    ? `缺字段：${rec.missingFields.map((field) => FIELD_LABEL[field] ?? field).join('、')}`
    : (blocking.length > 0 ? `缺字段：${blocking.map((issue) => FIELD_LABEL[issue.field] ?? issue.field).join('、')}` : '');

  return (
    <div role="listitem" data-lpl-candidate-row={rec.candidateId} data-lpl-candidate-status={status} style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        {status !== 'accepted' && (
          <input type="checkbox" aria-label={`选择 ${title}`} checked={selected} onChange={onToggleSelect} />
        )}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={chipStyle()}>{`${TARGET_LABEL[rec.target]} · ${rec.target === 'cost-reference' ? '成本参考' : rec.target === 'market-month' ? '月事件' : '范围事件'}`}</span>
        <span style={chipStyle()}>{EVIDENCE_LABEL[rec.evidenceState]}</span>
      </div>
      {item != null && (
        <div className="tnum" style={{ fontSize: 11, color: color.mute }}>
          {`${item.sourceName} · ${item.publishedAt.slice(0, 10)} · ${DATA_STATUS_LABEL[item.dataStatus]}`}
          {item.sourceUrl == null ? ' · 暂无来源链接' : ''}
        </div>
      )}
      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: color.body }}>{item?.summary ?? rec.rationale}</div>
      <div className="tnum" style={{ fontSize: 11.5, color: color.ink }}>{rangeText}</div>
      {(missingText !== '' || editing) && (
        <div style={{ fontSize: 11, lineHeight: 1.6, color: color.warningInk }}>
          {missingText !== '' ? missingText : '草稿编辑中（未应用）'}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', paddingTop: 2 }}>
        {applied ? (
          <>
            <span style={chipStyle(color.onPrimary, color.ink)}>已应用</span>
            {sourceUpdated && <span style={chipStyle(color.warningInk, color.warningSoft)}>来源已更新（保留现值）</span>}
            <Button
              size="small"
              aria-label={`查看落点 ${title}`}
              disabled={onLocate == null}
              title={onLocate == null ? '跨卡定位在页级接线（任务 10）后可用' : undefined}
              onClick={() => onLocate?.(rec.candidateId)}
            >
              已应用 · 查看落点
            </Button>
          </>
        ) : resetRemoved ? (
          <>
            <span style={chipStyle(color.warningInk, color.warningSoft)}>事件已随重置移除</span>
            <Button size="small" aria-label={`接受 ${title}`} onClick={onAccept}>接受</Button>
            <Button size="small" aria-label={`改参 ${title}`} onClick={onEdit}>改参</Button>
          </>
        ) : (
          <>
            {editing && <span style={chipStyle()}>草稿已存</span>}
            <Button size="small" type="primary" aria-label={`接受 ${title}`} onClick={onAccept}>接受</Button>
            <Button size="small" aria-label={`改参 ${title}`} onClick={onEdit}>改参</Button>
            <Button size="small" aria-label={`拒绝 ${title}`} onClick={onReject}>拒绝</Button>
            <span style={{ marginLeft: 'auto' }}>
              <Button size="small" type="text" aria-label={`移除出列表 ${title}`} onClick={onRemove}>移除出列表</Button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** 建议行文案（B.5.9：起始/时长/幅度建议 或 成本建议；缺参写「待补参」）。 */
function describeRecommendation(rec: EventRecommendation, calendar?: ForecastCalendar): string {
  if (rec.target === 'cost-reference') {
    const cost = rec.unitCost != null ? fmtUsd(rec.unitCost) : '待补参';
    return `建议：${rec.startMonth ?? '待补参'} 起成本参考 ${cost}（只入④，不自动改价）`;
  }
  if (rec.target === 'market-month') {
    const start = rec.startMonth != null && rec.startDay != null ? `${rec.startMonth}-${String(rec.startDay).padStart(2, '0')}` : '待补参';
    const duration = rec.durationMonths != null ? `${rec.durationMonths} 个月` : '时长待补参';
    const magnitude = rec.magnitudePct != null ? fmtSignedPct(rec.magnitudePct) : '幅度待补参';
    return `建议：${start} 起 · ${duration} · ${magnitude}（需求侧假设，待确认）`;
  }
  if (rec.range != null && calendar != null) {
    const start = calendar.weekById.get(rec.range.startWeekId);
    const end = calendar.weekById.get(rec.range.endWeekId);
    const weeks = start != null && end != null ? end.index - start.index + 1 : null;
    const magnitude = rec.magnitudePct != null ? fmtSignedPct(rec.magnitudePct) : '幅度待补参';
    return `建议：${rec.range.startWeekId}–${rec.range.endWeekId}${weeks != null ? ` · ${weeks} 周` : ''} · ${magnitude} · ${rec.decay === 'flat' ? '恒定' : '递减'}（${EVENT_TYPE_LABEL[rec.eventType ?? 'own-promo']}）`;
  }
  return '建议：起止周待补参';
}

// ---------------- 审核弹层（事实 → 转化建议 → 影响预览 → 动作） ----------------

/** 各目标的字段聚焦顺序（「改参」聚焦首个缺参字段）。 */
function fieldOrderOf(target: IntelligenceTarget): string[] {
  if (target === 'market-month') return ['startMonth', 'startDay', 'durationMonths', 'magnitudePct', 'label'];
  if (target === 'product-range') return ['range', 'eventType', 'magnitudePct', 'decay', 'replayId', 'label'];
  return ['startMonth', 'unitCost'];
}

function ReviewModal({
  draft,
  original,
  item,
  recommendations,
  calendar,
  params,
  result,
  fixture,
  review,
  onDraftChange,
  onClose,
  onConfirm,
}: {
  draft: EventRecommendation;
  original: EventRecommendation;
  item: IntelligenceItem | undefined;
  /** 全部转化建议：用于「同一 intelligenceId 已有落点」提醒（改幅也不消除）。 */
  recommendations: EventRecommendation[];
  calendar: ForecastCalendar;
  params?: WorkbenchParams;
  result?: WorkbenchResult;
  fixture?: WorkbenchFixture;
  review: IntelligenceReviewState;
  onDraftChange: (next: EventRecommendation) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title = item?.title ?? draft.candidateId;
  const issues = validateRecommendation(item ?? {
    intelligenceId: draft.intelligenceId, title: '', summary: '', excerpt: '', sourceName: '', sourceUrl: null,
    publishedAt: '', capturedAt: '', dataStatus: 'simulated', scope: { country: '', industry: '', channel: '', product: null },
  }, draft, calendar);
  const blocking = issues.filter((issue) => issue.blocking);
  const firstBlockingField = fieldOrderOf(draft.target).find((field) => blocking.some((issue) => issue.field === field));

  // 「改参」打开时聚焦首个缺参字段；名称选填永不阻塞。
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (firstBlockingField == null) return;
    const timer = window.setTimeout(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-intel-field="${firstBlockingField}"] input, [data-intel-field="${firstBlockingField}"] .ant-select-selector`);
      el?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [firstBlockingField]);

  // AI 预填「建议」/ 人工改动「已改」：与原建议逐字段比对派生，不另存脏位。
  const changedOf = (field: keyof EventRecommendation): boolean => draft[field] !== original[field];

  // 影响预览：临时 params（原 params 不动）；fixture 在位时另调一次 computeWorkbench 只读复算。
  const previewParams = params != null ? buildEventPreview(draft, params) : null;
  const previewResult = fixture != null && previewParams != null && previewParams !== params
    ? computeWorkbenchQuiet(fixture, previewParams)
    : null;
  const duplicates = params != null
    ? findDuplicateImpacts(draft, params, calendar).filter((impact) => impact.eventId !== previewEventIdOf(draft))
    : [];
  // 同一 intelligenceId 的其他已应用候选（改幅也不消除提醒；B.4.8）。
  const sameIntelligenceApplied = recommendations
    .filter((rec) => rec.intelligenceId === draft.intelligenceId && rec.candidateId !== draft.candidateId)
    .filter((rec) => {
      const entry = review.byCandidate[rec.candidateId];
      return entry?.status === 'accepted' && entry.appliedEventIds.length > 0;
    })
    .map((rec) => rec.candidateId);
  const seedEvent = previewParams != null && draft.target === 'product-range'
    ? previewParams.productEvents.find((event) => event.id === previewEventIdOf(draft)) ?? null
    : null;
  const seedMonthEvent = previewParams != null && draft.target === 'market-month'
    ? previewParams.marketMonthEvents.find((event) => event.id === previewEventIdOf(draft)) ?? null
    : null;
  const costOrigin = result?.weeks.find((week) => week.monthKey === draft.startMonth)?.unitCost ?? null;

  const fieldLabel = (field: keyof EventRecommendation, label: string, node: React.ReactNode, key: string) => (
    <label data-intel-field={key} style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 600, color: color.body, minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {label}
        <span style={chipStyle(changedOf(field) ? color.onPrimary : color.mute, changedOf(field) ? color.ink : color.canvasSoft2)}>
          {changedOf(field) ? '已改' : '建议'}
        </span>
      </span>
      {node}
    </label>
  );

  const monthOptions = calendar.forecastMonths.map((month) => ({ value: month.key, label: month.key }));
  const weekOptions = calendar.forecastWeeks.map((week) => ({ value: week.id, label: `${week.id}（${week.date}）` }));
  const patch = (next: Partial<EventRecommendation>): void => onDraftChange({ ...draft, ...next });

  return (
    <Modal
      title={`审核转化建议 · ${title}`}
      open
      onCancel={onClose}
      width={760}
      style={{ maxWidth: 'calc(100vw - 24px)' }}
      footer={
        <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button onClick={onClose}>返回候选</Button>
          <Button type="primary" disabled={blocking.length > 0} onClick={onConfirm}>确认应用事件</Button>
        </div>
      }
    >
      <div ref={rootRef} style={{ display: 'grid', gap: space.md, paddingTop: space.sm, minWidth: 0 }}>
        {/* ① 情报事实（只读；编辑事件不改写情报原文） */}
        <section data-lpl-intel-facts style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, background: color.canvasSoft, display: 'grid', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, color: color.ink }}>{title}</b>
            <span style={chipStyle()}>{`情报事实 · ${DATA_STATUS_LABEL[item?.dataStatus ?? 'simulated']}`}</span>
            {item?.sourceUrl != null && (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, marginLeft: 'auto' }}>查看原文</a>
            )}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.7, color: color.body }}>{item?.excerpt ?? '（无原文摘录）'}</div>
          <div className="tnum" style={{ fontSize: 11, color: color.mute }}>
            {`来源 ${item?.sourceName ?? '—'} · 发布 ${item?.publishedAt.slice(0, 10) ?? '—'} · 抓取 ${item?.capturedAt.slice(0, 10) ?? '—'}${item?.sourceUrl == null ? ' · 暂无来源链接' : ''}`}
          </div>
          <div style={{ fontSize: 11, color: color.mute }}>
            {`适用范围：${item?.scope.country ?? '—'} / ${item?.scope.industry ?? '—'} / ${item?.scope.channel ?? '—'}${item?.scope.product != null ? ` / ${item.scope.product}` : ''}`}
          </div>
        </section>

        {/* ② 转化建议（可编辑；AI 预填标「建议」，人工改标「已改」） */}
        <section data-lpl-intel-draft style={{ display: 'grid', gap: space.sm, minWidth: 0 }}>
          <b style={{ fontSize: 13, color: color.ink }}>转化建议（均可改）</b>
          <label data-intel-field="target" style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 600, color: color.body, maxWidth: 220 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              目标
              <span style={chipStyle(changedOf('target') ? color.onPrimary : color.mute, changedOf('target') ? color.ink : color.canvasSoft2)}>
                {changedOf('target') ? '已改' : '建议'}
              </span>
            </span>
            <Select
              aria-label="建议目标"
              value={draft.target}
              onChange={(value: IntelligenceTarget) => patch({ target: value })}
              options={[
                { value: 'market-month', label: '② 大盘月事件' },
                { value: 'product-range', label: '主图范围事件' },
                { value: 'cost-reference', label: '④ 成本参考' },
              ]}
            />
          </label>

          {draft.target === 'market-month' && (
            <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>
              {fieldLabel('startMonth', '起始月', (
                <Select aria-label="起始月" value={draft.startMonth ?? monthOptions[0]?.value} onChange={(value: string) => patch({ startMonth: value })} options={monthOptions} style={{ width: 120 }} />
              ), 'startMonth')}
              {fieldLabel('startDay', '起始日', (
                <InputNumber aria-label="起始日（1–31）" min={1} max={31} precision={0} value={draft.startDay} onChange={(value) => patch({ startDay: value == null ? null : Math.round(value) })} style={{ width: 90 }} />
              ), 'startDay')}
              {fieldLabel('durationMonths', '时长（月）', (
                <InputNumber aria-label="时长（月）" min={1} max={12} precision={0} value={draft.durationMonths} onChange={(value) => patch({ durationMonths: value == null ? null : Math.round(value) })} style={{ width: 90 }} />
              ), 'durationMonths')}
              {fieldLabel('magnitudePct', '幅度（%）', (
                <InputNumber aria-label="幅度（%）" min={-30} max={30} precision={0} value={draft.magnitudePct} onChange={(value) => patch({ magnitudePct: value == null ? null : Math.round(value) })} style={{ width: 90 }} />
              ), 'magnitudePct')}
            </div>
          )}

          {draft.target === 'product-range' && (
            <div style={{ display: 'grid', gap: space.sm }}>
              <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>
                {fieldLabel('range', '起始周', (
                  <Select aria-label="起始周" value={draft.range?.startWeekId ?? weekOptions[0]?.value} onChange={(value: string) => patch({ range: { startWeekId: value, endWeekId: draft.range?.endWeekId ?? value } })} options={weekOptions} style={{ width: 190 }} />
                ), 'range')}
                <span data-intel-field="range-end" style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 600, color: color.body }}>
                  结束周
                  <Select aria-label="结束周" value={draft.range?.endWeekId ?? weekOptions[0]?.value} onChange={(value: string) => patch({ range: { startWeekId: draft.range?.startWeekId ?? value, endWeekId: value } })} options={weekOptions} style={{ width: 190 }} />
                </span>
              </div>
              <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>
                {fieldLabel('eventType', '事件类型', (
                  <Select aria-label="事件类型" value={draft.eventType ?? 'competitor-launch'} onChange={(value: ProductEventSeed['type']) => patch({ eventType: value })} options={Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => ({ value, label }))} style={{ width: 140 }} />
                ), 'eventType')}
                {fieldLabel('magnitudePct', '幅度（%）', (
                  <InputNumber aria-label="幅度（%）" min={-30} max={60} precision={0} value={draft.magnitudePct} onChange={(value) => patch({ magnitudePct: value == null ? null : Math.round(value) })} style={{ width: 90 }} />
                ), 'magnitudePct')}
                {fieldLabel('decay', '形状', (
                  <Select aria-label="形状" value={draft.decay ?? 'decreasing'} onChange={(value: 'decreasing' | 'flat') => patch({ decay: value })} options={[{ value: 'decreasing', label: '递减' }, { value: 'flat', label: '恒定' }]} style={{ width: 100 }} />
                ), 'decay')}
              </div>
              {fieldLabel('replayId', '历史回放 id', (
                <Input aria-label="历史回放 id" value={draft.replayId ?? ''} onChange={(event) => patch({ replayId: event.target.value })} style={{ width: 220 }} />
              ), 'replayId')}
            </div>
          )}

          {draft.target === 'cost-reference' && (
            <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>
              {fieldLabel('startMonth', '成本月份', (
                <Select aria-label="成本月份" value={draft.startMonth ?? monthOptions[0]?.value} onChange={(value: string) => patch({ startMonth: value })} options={monthOptions} style={{ width: 120 }} />
              ), 'startMonth')}
              {fieldLabel('unitCost', '单台成本（USD）', (
                <InputNumber aria-label="单台成本（USD）" min={0} precision={0} value={draft.unitCost} onChange={(value) => patch({ unitCost: value == null ? null : Math.round(value) })} style={{ width: 110 }} />
              ), 'unitCost')}
            </div>
          )}

          {fieldLabel('label', '事件名称（选填）', (
            <Input aria-label="事件名称（选填）" value={draft.label} onChange={(event) => patch({ label: event.target.value })} style={{ width: 240 }} />
          ), 'label')}

          {/* 依据不足仍可人工完成，但必须明示人工假设 */}
          {draft.evidenceState !== 'supported' && draft.magnitudePct != null && (
            <div data-lpl-manual-assumption style={{ display: 'grid', gap: 2, fontSize: 11.5, lineHeight: 1.6, color: color.warningInk }}>
              <span>该幅度为人工假设</span>
              <span>{`依据状态：${EVIDENCE_LABEL[draft.evidenceState]}${draft.missingFields.length > 0 ? `；缺 ${draft.missingFields.map((field) => FIELD_LABEL[field] ?? field).join('、')}` : ''}`}</span>
            </div>
          )}
          {blocking.length > 0 && (
            <div data-lpl-blocking-issues style={{ fontSize: 11.5, lineHeight: 1.7, color: color.warningInk }}>
              {blocking.map((issue) => <div key={`${issue.field}:${issue.message}`}>{`缺参 · ${FIELD_LABEL[issue.field] ?? issue.field}：${issue.message}`}</div>)}
            </div>
          )}
        </section>

        {/* ③ 影响预览（临时 params 只读复算；确认前不调 setter） */}
        <section data-lpl-intel-preview style={{ borderTop: `1px solid ${color.hairline}`, paddingTop: space.md, display: 'grid', gap: 6, minWidth: 0 }}>
          <b style={{ fontSize: 13, color: color.ink }}>影响预览</b>
          {draft.target === 'cost-reference' ? (
            <div className="tnum" style={{ fontSize: 12, lineHeight: 1.8, color: color.body }}>
              {`④成本参考：${draft.startMonth ?? '—'} 单台成本 ${draft.unitCost != null ? fmtUsd(draft.unitCost) : '待补参'}${costOrigin != null ? `（现值 ${fmtUsd(costOrigin)}）` : ''} · 只新增成本参考记录，不自动改价`}
            </div>
          ) : (
            <>
              {seedEvent != null && (
                <div className="tnum" style={{ fontSize: 12, lineHeight: 1.8, color: color.body }}>
                  {`落点：主图范围事件 ${seedEvent.startWeekId}–${seedEvent.endWeekId} · 逐周乘子 ${describeWeekFactors(calendar, seedEvent)}`}
                </div>
              )}
              {seedMonthEvent != null && (
                <div className="tnum" style={{ fontSize: 12, lineHeight: 1.8, color: color.body }}>
                  {`落点：②大盘月事件 ${seedMonthEvent.startMonth}-${String(seedMonthEvent.startDay).padStart(2, '0')} 起 ${seedMonthEvent.durationMonths} 个月 · 逐月乘子 ${describeMonthFactors(calendar, seedMonthEvent)}`}
                </div>
              )}
            </>
          )}
          {duplicates.length > 0 && (
            <div data-lpl-duplicate-warning style={{ fontSize: 11.5, lineHeight: 1.7, color: color.warningInk }}>
              可能重复计入：{duplicates.map((impact) => `${impact.eventId}（${impact.overlapWeekIds.length} 周重叠：${impact.overlapWeekIds[0]}…${impact.overlapWeekIds[impact.overlapWeekIds.length - 1]}）`).join('、')}
            </div>
          )}
          {sameIntelligenceApplied.length > 0 && (
            <div data-lpl-same-intel-warning style={{ fontSize: 11.5, color: color.warningInk }}>
              同一情报已有落点（改幅不消除提醒）：{sameIntelligenceApplied.join('、')}
            </div>
          )}
          {previewResult != null && result != null ? (
            <div data-lpl-preview-delta className="tnum" style={{ fontSize: 12, lineHeight: 1.9, color: color.body }}>
              {`预测总销量 ${fmtUnit(result.summary.totalSales)} → ${fmtUnit(previewResult.summary.totalSales)}（${fmtSignedPct(Math.round(((previewResult.summary.totalSales / Math.max(1, result.summary.totalSales)) - 1) * 1000) / 10)}）`}
              <br />
              {`首个库存修正周 ${result.firstAdjustedWeek ?? '无'} → ${previewResult.firstAdjustedWeek ?? '无'}`}
              <br />
              {`预测期销毛 ${fmtUsd(result.summary.forecastMargin)} → ${fmtUsd(previewResult.summary.forecastMargin)}`}
            </div>
          ) : draft.target !== 'cost-reference' && (
            <div style={{ fontSize: 11, color: color.mute }}>
              完整前后差复算将在页级数据接线（任务 10）后可用；本预览已按主链同源公式列出落点与乘子，确认前不更新页面。
            </div>
          )}
          <div style={{ fontSize: 11, color: color.mute }}>预览为只读临时计算；只有「确认应用事件」才写入既有事件集合（可撤销）。</div>
        </section>
      </div>
    </Modal>
  );
}

// ---------------- 批量预览弹层（共同范围 → 每条参数 → 合并影响 → 重复计入） ----------------

function BatchPreviewModal({
  recs,
  itemOf,
  calendar,
  params,
  result,
  fixture,
  onClose,
  onConfirm,
}: {
  recs: EventRecommendation[];
  itemOf: (intelligenceId: string) => IntelligenceItem | undefined;
  calendar: ForecastCalendar;
  params: WorkbenchParams;
  result?: WorkbenchResult;
  fixture?: WorkbenchFixture;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const targets = new Set(recs.map((rec) => rec.target));
  const sameTarget = targets.size === 1;
  const allCost = sameTarget && recs.every((rec) => rec.target === 'cost-reference');
  let merged = params;
  for (const rec of recs) merged = buildEventPreview(rec, merged);
  const previewResult = fixture != null && !allCost && merged !== params ? computeWorkbenchQuiet(fixture, merged) : null;
  const overlaps: string[] = [];
  for (let i = 0; i < recs.length; i += 1) {
    for (let j = i + 1; j < recs.length; j += 1) {
      if (recommendationsOverlap(recs[i], recs[j], calendar)) {
        overlaps.push(`${itemOf(recs[i].intelligenceId)?.title ?? recs[i].candidateId} × ${itemOf(recs[j].intelligenceId)?.title ?? recs[j].candidateId}`);
      }
    }
  }

  return (
    <Modal
      title={`批量预览 · ${recs.length} 条`}
      open
      onCancel={onClose}
      width={720}
      style={{ maxWidth: 'calc(100vw - 24px)' }}
      footer={
        <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button onClick={onClose}>返回候选</Button>
          <Button type="primary" disabled={!sameTarget} onClick={onConfirm}>{`确认应用 ${recs.length} 条`}</Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: space.md, paddingTop: space.sm, minWidth: 0, fontSize: 12, color: color.body }}>
        <div>
          共同情报范围：{sameTarget ? `${TARGET_LABEL[[...targets][0]]}（${[...targets][0]}）` : '跨目标候选（禁止批量生效，仅可按目标分组）'}
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {recs.map((rec) => (
            <div key={rec.candidateId} className="tnum" style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
              <b style={{ color: color.ink }}>{itemOf(rec.intelligenceId)?.title ?? rec.candidateId}</b>
              <span style={{ marginLeft: space.sm }}>{describeRecommendation(rec, calendar)}</span>
            </div>
          ))}
        </div>
        <div className="tnum">
          合并影响：{allCost
            ? `成本参考批次：${recs.map((rec) => `${rec.startMonth ?? '—'} ${rec.unitCost != null ? fmtUsd(rec.unitCost) : '待补参'}`).join('、')} · 只入④，不自动改价`
            : previewResult != null && result != null
              ? `预测总销量 ${fmtUnit(result.summary.totalSales)} → ${fmtUnit(previewResult.summary.totalSales)}；预测期销毛 ${fmtUsd(result.summary.forecastMargin)} → ${fmtUsd(previewResult.summary.forecastMargin)}`
              : '合并复算将在页级数据接线（任务 10）后可用；本页已按逐条校验放行'}
        </div>
        <div className="tnum" style={{ color: overlaps.length > 0 ? color.warningInk : color.mute }}>
          重复计入：{overlaps.length > 0 ? overlaps.join('、') : '未发现范围重叠'}
        </div>
        <div style={{ fontSize: 11, color: color.mute }}>
          确认后作为一个审核批次原子写入并生成同一批次号；撤销以批次为单位。任一条改参即退出批量确认，回到逐条审核。
        </div>
      </div>
    </Modal>
  );
}

// ---------------- 预览乘子与只读复算 ----------------

/** 逐周乘子读数（主链同源公式 rangeEventFactorAt，不新增第二套计算）。 */
function describeWeekFactors(calendar: ForecastCalendar, seed: ProductEventSeed): string {
  const start = calendar.weekById.get(seed.startWeekId);
  const end = calendar.weekById.get(seed.endWeekId);
  if (start == null || end == null || start.index > end.index) return '范围无效';
  const parts: string[] = [];
  for (let index = start.index; index <= end.index && parts.length < 8; index += 1) {
    const week = calendar.weeks[index];
    if (week == null) continue;
    const factor = rangeEventFactorAt(calendar, [seed], week.id as WeekId);
    parts.push(`${week.id} ×${fmtSignedPct(Math.round((factor - 1) * 1000) / 10)}`);
  }
  if (end.index - start.index + 1 > 8) parts.push('…');
  return parts.join(' · ');
}

/** 逐月乘子读数（主链同源公式 marketMonthEventFactor；首月月中均摊）。 */
function describeMonthFactors(calendar: ForecastCalendar, seed: MarketMonthEventSeed): string {
  const parts: string[] = [];
  for (const month of calendar.forecastMonths) {
    const factor = marketMonthEventFactor(seed, month.key);
    if (factor == null) continue;
    parts.push(`${month.key} ×${fmtSignedPct(Math.round((factor - 1) * 1000) / 10)}`);
    if (parts.length >= 12) break;
  }
  return parts.length > 0 ? parts.join(' · ') : '覆盖范围外（无预测月）';
}

/** computeWorkbench 只读包装：预览复算失败不致面板崩溃（返回 null 走降级文案）。 */
function computeWorkbenchQuiet(fixture: WorkbenchFixture, params: WorkbenchParams): WorkbenchResult | null {
  try {
    return computeWorkbench(fixture, params);
  } catch {
    return null;
  }
}
