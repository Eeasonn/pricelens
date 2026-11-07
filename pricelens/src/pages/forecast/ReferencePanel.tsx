// ============================================================
// 推演工作台 v2 · 层②「量价参考产品」卡（作业化重设计）：
// 统一有效事件视图 + 独立本地工作区 + 每面板独立时间窗。
// - 卡头只留「仅历史」「模拟历史」两个状态标；无长 hint、无 IoBar、无
//   常驻教程（§3.5 文案清单）。
// - 面板体系：默认 2 面板（上一代 + 友商对照）、「＋ 添加参考」下拉
//   （上一代 · 主链 / 友商 · 对照）、面板头 × 删除（至少 1 个；删除上一代
//   面板 = 主链回退默认参照）；≤2 均分、>2 单一横滚容器（minWidth 880）。
// - 每面板窗口存会话视图态 forecast.referenceView.<scopeHash>
//   （usePageViewState：panelIds / windows / syncAge（默认关）/ 锁定表）；
//   悬停与拖动瞬态不持久化。窗口只决定查看范围，不裁剪模型输入、
//   不重算同周龄比值；主链仍由页面受控 prevGenReferenceId 写入。
// - 卡级「同周龄同步」开启后，任一未锁定面板驱动其余未锁定面板按同周龄
//   （数值周龄）钳制；锁定面板的轨道与窗口预设禁用，同步 / 回放定位 /
//   名录定位均不改写它。
// - 事件作业：fixture 预标（稳定 id + 覆写层）+ 本地补录（软删除）→ 统一
//   EffectiveReferenceEvent 供图 / 名录 / 编辑器 / 回放 / 读数消费；工作区
//   localStorage 持久化（刷新 / 重开页签可恢复，删除面板不清草稿），编辑器
//   草稿自动保存（刷新后「未完成」点击恢复，不自动抢开弹层），撤销 =
//   20 步 before/after patch 重放；写失败显式「未持久化」+ 重试。
// - 参考回放（§4.5）：信号带可选 eventType（映射自主图产品事件），候选按
//   「与面板窗口中心距离 → 起周 → id」稳定排序每面板 1 条；不 8 秒自动
//   消失（手动关 / 下一信号替换）；补录条目带「草稿」标；无匹配显
//   「无可回放事件」。
// - 红线：补录 / 覆写 / 窗口 / 颜色绝不进入 WorkbenchParams / computeWorkbench；
//   prevGenReferenceId 受控语义原样；fixture 原始对象不被修改。
// 2026-11-05 视觉精简二轮（六条反馈）：
// - 首预测周读数行（B.5.5 同周龄证据）默认收起为共享 CollapsibleSection
//   「首预测周读数」（卡头「① 基线预测 · 历史参照」保留）。
// - 关闭行为：保存成功 → 编辑浮层自动收起 + 名录自动展开并 0.6s 高亮淡出；
//   点弹层外空白 / Esc → 收起（草稿不丢）；「未完成」chip 删除（草稿经
//   ＋事件 / 名录「编辑」恢复）。
// - 预标 / 补录统一：删除一切来源标注（浮框头 tag、名录行标、锚点形态
//   差异）；能力差异隐形保留——预标 × = 恢复基准，补录 × = 软删除。
// - 名录默认收起为一根「事件 N ▸」细条（组件态记忆展开），不再分来源组；
//   「主链 · 同周龄校正」「窗内」chip 删除；「仅历史」「模拟历史」合并为
//   单个「模拟历史」；参考回放条目不带「草稿」标。
// 2026-11-05 二轮收尾：
// - 卡头「模拟历史」chip 退役为 ？说明图标（HintInfo，全局 #7 同规则），
//   title 合并模拟语境；「仅对照」为产品身份语义 chip，保留。
// - 周段标签统一日历周：名录行 / 证据浮框 / 参考回放条目经 eventRangeLabel
//   传产品锚（2025W24 形态，与图 X 轴同口径；换算收编在 referenceEventModel）。
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Dropdown, Popover } from 'antd';
import { brandColorOf, color, motion, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import usePageViewState from '../../state/usePageViewState';
import type { LifecycleProductSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { CollapsibleSection, HintInfo, SectionHead, workbenchCardStyle } from './WorkbenchBits';
import ReferenceVolumeChart from './ReferenceVolumeChart';
import ReferenceTimeTrack, { type ReferenceWindowPreset } from './ReferenceTimeTrack';
import ReferenceEventComposer from './ReferenceEventComposer';
import {
  clampReferenceWindow,
  eventFocusWindow,
  eventRangeLabel,
  fullWindowOf,
  mergeEffectiveEvents,
  REFERENCE_DECAY_LABEL,
  type EffectiveReferenceEvent,
  type ReferenceEditorDraft,
  type ReferenceEventDraftValue,
  type ReferenceEventEditableFields,
} from './referenceEventModel';
import {
  referenceEventColorOf,
  referenceEventLabelOf,
  useReferenceEventTypes,
} from './referenceEventTypeStore';
import {
  discardReferenceEditorDraft,
  referenceScopeHash,
  referenceUndoLabel,
  useReferenceWorkspace,
} from './useReferenceWorkspace';

/** 主图输入信号（页面接线）：手调 / 产品事件变化时 seq 递增，驱动参考回放条。 */
export interface ReferenceInputSignal {
  seq: number;
  kind: 'manual' | 'event';
  /** 变化涉及的周标签（如 W47），可缺省。 */
  weekLabel?: string;
  /**
   * 产品事件类型（映射后）：competitor-launch / promo / cannibalization。
   * 新增事件时传新增项类型；删除事件与手动微调为 undefined（展示当前有效
   * 事件，不声称「类似时间」精准匹配）。
   */
  eventType?: 'competitor-launch' | 'promo' | 'cannibalization';
}

/** 会话视图态（切页 / 刷新恢复；瞬态不进这里）。 */
interface ReferenceViewState {
  panelIds: string[];
  windows: Record<string, [number, number]>;
  syncAge: boolean;
  lockedByProduct: Record<string, boolean>;
}

const TRACK_MIN_WIDTH = 880;

const shortLabelOf = (product: LifecycleProductSeed): string => product.label.replace(/（[^）]*）/g, '').trim();

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

const smallChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 20,
  padding: '0 8px',
  borderRadius: radius.pill,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
};

/** 面板头小按钮（＋事件 / × 删除共用语言）。 */
function headButtonStyle(danger: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    height: 24,
    padding: '0 8px',
    borderRadius: radius.control,
    border: `1px solid ${danger ? color.hairlineStrong : color.hairline}`,
    background: color.canvas,
    color: danger ? color.error : color.body,
    font: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

// ------------------------------------------------------------
// 参考回放条目（§4.5）：与面板窗口中心距离 → 起周 → id 稳定排序，每面板 1 条。
// 2026-11-05 视觉精简二轮：无来源标注（不再区分补录 / 预标条目形态）。
// ------------------------------------------------------------
interface ReplayEntry {
  productId: string;
  eventId: string;
  startWeek: number;
  endWeek: number;
  text: string;
}

function replayEntryFor(
  product: LifecycleProductSeed,
  events: EffectiveReferenceEvent[],
  win: [number, number],
  eventType: ReferenceInputSignal['eventType'],
): ReplayEntry | null {
  const candidates = eventType ? events.filter((ev) => ev.typeId === eventType) : events;
  if (candidates.length === 0) return null;
  const center = (win[0] + win[1]) / 2;
  const ranked = [...candidates].sort((a, b) =>
    Math.abs((a.startWeek + a.endWeek) / 2 - center) - Math.abs((b.startWeek + b.endWeek) / 2 - center)
    || a.startWeek - b.startWeek
    || a.id.localeCompare(b.id));
  const ev = ranked[0];
  return {
    productId: product.id,
    eventId: ev.id,
    startWeek: ev.startWeek,
    endWeek: ev.endWeek,
    text: `${shortLabelOf(product)} · ${eventRangeLabel(ev, product)} · ${ev.label}`,
  };
}

// ------------------------------------------------------------
// 统一事件名录（2026-11-05 视觉精简二轮，替代 ReferenceEventList 常驻列表）：
// - 默认收起为一根纯文字细条「事件 N ▸」（共享 CollapsibleSection；会话内
//   组件态记忆展开，刷新回默认收起）；展开 = 全量统一列表（按起周排序，
//   不再分「预标 / 补录」组，无任何来源标注）。
// - 行：类型色点 + 起止周 + 标题（点击 = 选中详情）+ 幅度 · 衰减 +
//   [编辑] [×]；能力差异隐形保留：补录 × = 软删除，预标 × = 恢复基准
//   （回 fixture 值，可撤销），编辑入口两者一致。
// - 保存成功 → 自动展开 + 新行 0.6s 高亮淡出（saveFlash）。
// - 双向联动：hover 行 → 图上区间临时高亮；图上 +N 聚合筛选（onlyIds）
//   自动展开并可清；focusReq（图锚 / 定位）展开态下滚动定位 + 短暂强调。
// ------------------------------------------------------------
function ReferenceRoster(props: {
  /** 参照产品（事件周段标签的日历周锚点 = launchWeekLabel）。 */
  product: LifecycleProductSeed;
  events: EffectiveReferenceEvent[];
  selectedEventId: string | null;
  hoverEventId: string | null;
  onHoverEvent: (id: string | null) => void;
  onSelectEvent: (id: string | null) => void;
  onEditEvent: (id: string) => void;
  onRestorePreset: (sourceEventId: string) => void;
  onDeleteComposed: (id: string) => void;
  labelOf: (typeId: string) => string;
  colorOf: (typeId: string) => string;
  /** 图上 +N 聚合点击后的只看集合（null = 无此筛选）。 */
  onlyIds: string[] | null;
  onClearOnly: () => void;
  /** 图锚 / 定位请求：展开态下滚动到该行并短暂强调（key 递增触发）。 */
  focusReq: { id: string; key: number } | null;
  /** 保存成功闪强（父层 { eventId, key }；key 递增触发展开 + 0.6s 高亮）。 */
  saveFlash: { eventId: string; key: number } | null;
}) {
  const {
    product, events, selectedEventId, hoverEventId, onHoverEvent, onSelectEvent,
    onEditEvent, onRestorePreset, onDeleteComposed, labelOf, colorOf,
    onlyIds, onClearOnly, focusReq, saveFlash,
  } = props;
  const [open, setOpen] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const [emphasizedId, setEmphasizedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // 保存成功 → 自动展开名录并短暂强调新行（0.6s 高亮淡出）
  useEffect(() => {
    if (!saveFlash) return;
    setOpen(true);
    setFlashId(saveFlash.eventId);
    rowRefs.current.get(saveFlash.eventId)?.scrollIntoView({ block: 'nearest' });
    const timer = window.setTimeout(() => setFlashId((prev) => (prev === saveFlash.eventId ? null : prev)), 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFlash?.key]);

  // 图锚 / 定位：展开态下滚动到行并短暂强调（收起时不打扰）
  useEffect(() => {
    if (!focusReq || !open) return;
    setEmphasizedId(focusReq.id);
    rowRefs.current.get(focusReq.id)?.scrollIntoView({ block: 'nearest' });
    const timer = window.setTimeout(() => setEmphasizedId((prev) => (prev === focusReq.id ? null : prev)), 1600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq?.key, focusReq?.id, open]);

  // 图上 +N 聚合筛选：自动展开名录（筛选结果需要可见）
  useEffect(() => {
    if (onlyIds != null) setOpen(true);
  }, [onlyIds]);

  const filtered = useMemo(
    () => (onlyIds ? events.filter((ev) => onlyIds.includes(ev.id)) : events),
    [events, onlyIds],
  );

  if (events.length === 0 && onlyIds == null) return null;

  return (
    <div style={{ marginTop: space.sm, minWidth: 0 }}>
      <CollapsibleSection
        label={`事件 ${events.length}`}
        open={open}
        onToggle={setOpen}
      >
        {onlyIds != null && (
          <div style={{ display: 'flex', marginBottom: 6 }}>
            <button
              type="button"
              onClick={onClearOnly}
              title="清除图上事件聚合筛选，恢复完整名录"
              style={{
                height: 20,
                padding: '0 8px',
                borderRadius: radius.pill,
                fontSize: 12,
                fontWeight: 600,
                font: 'inherit',
                cursor: 'pointer',
                border: `1px solid ${selectAccent}`,
                background: selectSoft,
                color: selectSoftInk,
                whiteSpace: 'nowrap',
              }}
            >
              {`图上聚合 ${onlyIds.length} 条 ×`}
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gap: 4, maxHeight: filtered.length > 8 ? 176 : undefined, overflowY: filtered.length > 8 ? 'auto' : undefined }}>
          {filtered.map((ev) => {
            const selected = selectedEventId === ev.id;
            // 行短周段标签 = 日历周 ID（2025W24，与图轴同口径；锚 = launchWeekLabel）
            const rangeLabel = eventRangeLabel(ev, product);
            const rowLabel = `${rangeLabel} ${ev.label}`;
            const impact = ev.impact;
            return (
              <div
                key={ev.id}
                ref={(el) => { if (el) rowRefs.current.set(ev.id, el); else rowRefs.current.delete(ev.id); }}
                onMouseEnter={() => onHoverEvent(ev.id)}
                onMouseLeave={() => onHoverEvent(null)}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '3px 8px',
                  padding: '3px 6px',
                  borderRadius: radius.control,
                  background: flashId === ev.id
                    ? selectSoft
                    : (emphasizedId === ev.id || selected)
                      ? color.canvasSoft2
                      : 'transparent',
                  outline: selected ? `1px solid ${color.hairlineStrong}` : 'none',
                  transition: `background ${motion.fast}ms`,
                  minWidth: 0,
                }}
              >
                <button
                  type="button"
                  className="tnum"
                  aria-pressed={selected}
                  aria-label={`查看事件读数 ${rowLabel}`}
                  title="点击查看事件详情；再次点击关闭"
                  onClick={() => onSelectEvent(selected ? null : ev.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 12, color: color.body, cursor: 'pointer', minWidth: 0, textAlign: 'left' }}
                >
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(ev.typeId), flex: 'none' }} />
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: color.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>{rangeLabel}</span>
                  <span style={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
                </button>
                {impact && (impact.magnitudePct != null || impact.decay !== 'unspecified') && (
                  <span className="tnum" style={{ fontSize: 12, color: color.mute, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {`${impact.magnitudePct != null ? `${impact.magnitudePct > 0 ? '+' : impact.magnitudePct < 0 ? '−' : '±'}${Math.abs(impact.magnitudePct)}%` : '—'} · ${REFERENCE_DECAY_LABEL[impact.decay]}`}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                  <button
                    type="button"
                    aria-label={`编辑事件 ${rowLabel}`}
                    title={`编辑事件（类型 ${labelOf(ev.typeId)}）`}
                    onClick={() => onEditEvent(ev.id)}
                    style={rosterActionButtonStyle(false)}
                  >
                    编辑
                  </button>
                  {/* 无来源标注：同形 ×；能力差异隐形保留——补录 = 软删除，预标 = 恢复基准 */}
                  <button
                    type="button"
                    aria-label={ev.source === 'composed' ? `删除事件 ${rowLabel}` : `恢复事件基准 ${rowLabel}`}
                    title={ev.source === 'composed'
                      ? '删除该事件（可撤销）'
                      : ev.overridden
                        ? '恢复到基准值（可撤销）'
                        : '已为基准值'}
                    onClick={() => {
                      if (ev.source === 'composed') onDeleteComposed(ev.id);
                      else if (ev.overridden && ev.sourceEventId) onRestorePreset(ev.sourceEventId);
                    }}
                    style={rosterActionButtonStyle(true)}
                  >
                    ×
                  </button>
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div role="status" style={{ fontSize: 12, color: color.mute, padding: '4px 0' }}>无匹配事件</div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function rosterActionButtonStyle(danger: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    padding: '0 7px',
    borderRadius: radius.control,
    border: `1px solid ${danger ? color.hairlineStrong : color.hairline}`,
    background: color.canvas,
    color: danger ? color.error : color.body,
    font: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

// ------------------------------------------------------------
// 参考面板卡：面板头（身份 + 对照标 + 草稿标 + 动作）→ 拖选操作条 →
// 量价图（左量右价 + 图顶小标轨）→ 本面板时间轨 → 事件名录（默认收起）→ 主链读数。
// ------------------------------------------------------------
function ReferenceChartCard({
  product,
  isInChain,
  panelCount,
  onRemove,
  win,
  onWindowChange,
  windowLocked,
  onToggleLock,
  events,
  selectedEvent,
  labelOf,
  colorOf,
  draftCount,
  editorOpen,
  picking,
  draft,
  saveState,
  onRetryPersist,
  onOpenCreate,
  onComposerChange,
  onPickRange,
  onSelectRange,
  onSubmitDraft,
  onCollapseComposer,
  onDiscardDraft,
  composerRestore,
  onRestorePreset,
  onSelectEvent,
  onEditEvent,
  onDeleteComposed,
  onHoverEvent,
  hoverEventId,
  onOverflowEvents,
  onlyIds,
  onClearOnly,
  rosterFocus,
  saveFlash,
  onPreset,
  focusWeek,
  focusKey,
  footNote,
}: {
  product: LifecycleProductSeed;
  /** 该面板产品当前是否主链参照（决定首预测周读数与主链回退语义）。 */
  isInChain: boolean;
  panelCount: number;
  onRemove: () => void;
  win: [number, number];
  onWindowChange: (s: number, e: number) => void;
  windowLocked: boolean;
  onToggleLock: () => void;
  /** 统一有效事件（已合并排序；无来源标注，预标与补录同形）。 */
  events: EffectiveReferenceEvent[];
  selectedEvent: EffectiveReferenceEvent | null;
  labelOf: (typeId: string) => string;
  colorOf: (typeId: string) => string;
  /** 本地事件 / 覆写数（草稿 N 条件显示）。 */
  draftCount: number;
  editorOpen: boolean;
  /** 拖选事件时段模式（弹层收起、面板顶操作条）。 */
  picking: boolean;
  /** 当前编辑器草稿（弹层内容；null = 不渲染）。 */
  draft: ReferenceEditorDraft | null;
  saveState: 'saved' | 'unpersisted';
  onRetryPersist: () => void;
  onOpenCreate: () => void;
  onComposerChange: (patch: Partial<ReferenceEventDraftValue>) => void;
  onPickRange: () => void;
  onSelectRange: (startWeek: number, endWeek: number) => void;
  onSubmitDraft: () => void;
  onCollapseComposer: () => void;
  onDiscardDraft: () => void;
  /** 编辑且存在本地覆写时提供「恢复基准」。 */
  composerRestore: (() => void) | null;
  onRestorePreset: (sourceEventId: string) => void;
  onSelectEvent: (id: string | null) => void;
  onEditEvent: (id: string) => void;
  onDeleteComposed: (id: string) => void;
  onHoverEvent: (id: string | null) => void;
  hoverEventId: string | null;
  onOverflowEvents: (ids: string[]) => void;
  onlyIds: string[] | null;
  onClearOnly: () => void;
  rosterFocus: { id: string; key: number } | null;
  /** 保存成功闪强（0.6s 名录高亮淡出 + 自动展开）。 */
  saveFlash: { eventId: string; key: number } | null;
  onPreset: (preset: Exclude<ReferenceWindowPreset, 'custom'>) => void;
  focusWeek: number | null;
  focusKey: number;
  footNote?: string;
}) {
  const tone = brandColorOf(product.brand);
  return (
    <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
      {/* 面板头：品牌色点 + 产品名胶囊 + 对照标 + 草稿标 + ＋事件 / × */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.pill, background: tone, flex: 'none' }} />
        <span
          title={product.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 9px',
            borderRadius: radius.pill,
            border: `1px solid ${color.hairline}`,
            background: color.canvasSoft,
            color: color.ink,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          {product.label}
        </span>
        {!isInChain && (
          <span
            title="对照查看：不写入主链、不影响主图基线，仅用于核对量价节奏"
            style={{
              ...smallChipStyle,
              background: color.canvasSoft2,
              color: color.mute,
              border: `1px solid ${color.hairline}`,
            }}
          >
            仅对照
          </span>
        )}
        {draftCount > 0 && (
          <span
            title={`本产品有 ${draftCount} 条本地事件 / 覆写：保存在本浏览器，刷新、重开页签后仍可恢复`}
            style={{ ...smallChipStyle, background: selectSoft, color: selectSoftInk, border: `1px solid ${selectAccent}` }}
          >
            {`草稿 ${draftCount}`}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Popover
            open={editorOpen && !picking}
            onOpenChange={(open) => { if (open) onOpenCreate(); else onCollapseComposer(); }}
            trigger="click"
            placement="bottomRight"
            content={editorOpen && !picking && draft ? (
              <ReferenceEventComposer
                product={product}
                mode={draft.mode}
                value={draft.value}
                onChange={onComposerChange}
                onPickRange={onPickRange}
                onSubmit={onSubmitDraft}
                onCollapse={onCollapseComposer}
                onDiscard={onDiscardDraft}
                onRestorePreset={composerRestore ?? undefined}
                saveState={saveState}
                onRetryPersist={onRetryPersist}
              />
            ) : null}
          >
            {/* data-ref-composer-trigger：点本钮不触发「空白收起」（开关交给 antd trigger） */}
            <button
              type="button"
              data-ref-composer-trigger={product.id}
              aria-label={`为 ${product.label} 新增事件`}
              title="新增 / 恢复事件编辑（本地草稿，自动保存；点弹层外空白或 Esc 收起，草稿不丢）"
              onClick={onOpenCreate}
              style={headButtonStyle(false)}
            >
              ＋事件
            </button>
          </Popover>
          <button
            type="button"
            aria-label={`删除参考面板：${product.label}`}
            title={panelCount <= 1 ? '至少保留一个参考面板' : '删除该参考面板（本地事件与覆写保留，重新添加后恢复显示）'}
            onClick={onRemove}
            disabled={panelCount <= 1}
            aria-disabled={panelCount <= 1}
            style={{ ...headButtonStyle(true), cursor: panelCount <= 1 ? 'not-allowed' : 'pointer', opacity: panelCount <= 1 ? 0.45 : 1, width: 24, justifyContent: 'center', padding: 0 }}
          >
            ×
          </button>
        </span>
      </div>
      {/* 拖选事件时段操作条：弹层收起，按下—拖动—松手回填起止周，Esc 取消 */}
      {picking && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space.sm,
            padding: '6px 10px',
            borderRadius: radius.control,
            background: '#e8f1ff',
            border: '1px solid #0070f3',
            marginBottom: space.sm,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: '#0053c2' }}>拖选事件时段 · Esc 取消</span>
          <button
            type="button"
            aria-label="取消拖选"
            onClick={onCollapseComposer}
            style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#0053c2', font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            取消
          </button>
        </div>
      )}
      {product.points.length > 0 ? (
        <ReferenceVolumeChart
          product={product}
          win={win}
          events={events}
          labelOf={labelOf}
          colorOf={colorOf}
          selectedEventId={selectedEvent?.id ?? null}
          onSelectEvent={onSelectEvent}
          onEditEvent={onEditEvent}
          hoverEventId={hoverEventId}
          onHoverEvent={onHoverEvent}
          onOverflowEvents={onOverflowEvents}
          rangePickMode={picking}
          onSelectRange={onSelectRange}
          focusWeek={focusWeek}
          focusKey={focusKey}
        />
      ) : (
        <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>
      )}
      {/* 本面板时间轨（窗口预设 + 拖柄 + 锁定）；刻度 = 生命周期周龄 W1…W末周 */}
      <ReferenceTimeTrack
        productLabel={product.label}
        total={product.points.length}
        win={win}
        onChange={onWindowChange}
        locked={windowLocked}
        onToggleLock={onToggleLock}
        eventRange={selectedEvent ? [selectedEvent.startWeek, selectedEvent.endWeek] : null}
        onPreset={onPreset}
      />
      {/* 统一事件名录（默认收起「事件 N ▸」；无来源标注；保存成功 0.6s 闪强） */}
      <ReferenceRoster
        product={product}
        events={events}
        selectedEventId={selectedEvent?.id ?? null}
        hoverEventId={hoverEventId}
        onHoverEvent={onHoverEvent}
        onSelectEvent={onSelectEvent}
        onEditEvent={onEditEvent}
        onRestorePreset={onRestorePreset}
        onDeleteComposed={onDeleteComposed}
        labelOf={labelOf}
        colorOf={colorOf}
        onlyIds={onlyIds}
        onClearOnly={onClearOnly}
        focusReq={rosterFocus}
        saveFlash={saveFlash}
      />
      {/* 首预测周读数（B.5.5 同周龄证据）：2026-11-05 视觉精简二轮默认收起
          （共享 CollapsibleSection，组件内存态），卡头「① 基线预测 · 历史参照」保留 */}
      {footNote && (
        <div style={{ marginTop: space.sm, minWidth: 0 }}>
          <CollapsibleSection label="首预测周读数">
            <div className="tnum" style={{ fontSize: 12, color: color.mute, minWidth: 0 }}>{footNote}</div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

/** ①跨卡定位请求（B.5.5 · 任务 7）：主图学习证据「定位」跳来；seq 递增触发。 */
export interface ReferenceLocateRequest {
  seq: number;
  /** 主图证据周（同周龄段定位）；null = 只定位面板不改段。 */
  weekId: string | null;
}

export interface ReferencePanelProps {
  fixture: WorkbenchFixture;
  result: WorkbenchResult;
  /** 受控：params.prevGenReferenceId（状态由页面持有）；基准 = prevGenPool[0]。 */
  prevGenReferenceId: string;
  /** 选择回调：写入 params.prevGenReferenceId，经模型同周龄比值校正主图基线。 */
  onPrevGenReferenceChange: (id: string) => void;
  /** 主图输入信号（手调应用 / 产品事件录入）：seq 递增触发参考回放条。 */
  inputSignal?: ReferenceInputSignal | null;
  /** ①跨卡定位入口（主图学习证据 → 定位当前主链面板同周龄段；锁定面板只展开详情不改窗）。 */
  locateRequest?: ReferenceLocateRequest | null;
}

export default function ReferencePanel({
  fixture,
  result,
  // 受控值；页面（接线）回退基准参照，保证渲染安全。
  prevGenReferenceId = fixture.references.prevGenPool[0]?.id ?? '',
  onPrevGenReferenceChange,
  inputSignal,
  locateRequest,
}: ReferencePanelProps) {
  const pool = useMemo(() => fixture.references.lifecyclePool ?? [], [fixture]);
  const defaultChainRef = fixture.references.prevGenPool[0]?.id ?? '';
  const poolKey = pool.map((p) => p.id).join(',');

  // ---- 工作区（localStorage：补录 / 覆写 / 编辑器草稿 / 撤销历史） ----
  const scopeHash = useMemo(
    () => referenceScopeHash([fixture.meta.modelVersion, fixture.context.country, fixture.context.industry, fixture.context.channel, fixture.context.product]),
    [fixture],
  );
  const ws = useReferenceWorkspace(scopeHash);
  const typeLib = useReferenceEventTypes();
  const labelOf = useCallback((typeId: string) => referenceEventLabelOf(typeLib, typeId), [typeLib]);
  const colorOf = useCallback((typeId: string) => referenceEventColorOf(typeLib, typeId), [typeLib]);

  // ---- 面板构成 / 窗口 / 同步 / 锁定（会话视图态，刷新与切页恢复） ----
  const [view, setView] = usePageViewState<ReferenceViewState>(
    `forecast.referenceView.${scopeHash}`,
    () => {
      const chain = pool.find((p) => p.chainRefId === prevGenReferenceId)?.id
        ?? pool.find((p) => p.chainRefId != null)?.id;
      const contrast = pool.find((p) => p.chainRefId == null)?.id;
      return {
        panelIds: [chain, contrast].filter((x): x is string => !!x),
        windows: {},
        syncAge: false,
        lockedByProduct: {},
      };
    },
  );
  const panelIds = view.panelIds;
  const syncAge = view.syncAge;

  const panelProducts = useMemo(
    () => panelIds
      .map((id) => pool.find((p) => p.id === id))
      .filter((p): p is LifecycleProductSeed => p != null),
    [pool, panelIds, poolKey],
  );
  // 面板数变化（增删）→ 无效面板 id 清理（产品池失义时视图自愈）
  useEffect(() => {
    const valid = panelIds.filter((id) => pool.some((p) => p.id === id));
    if (valid.length !== panelIds.length) setView((prev) => ({ ...prev, panelIds: valid }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelIds, poolKey]);

  // ---- 页面侧受控 prevGenReferenceId 变化（如重置基准）→ 面板视图跟随主链 ----
  const prevGenSeenRef = useRef(prevGenReferenceId);
  useEffect(() => {
    if (prevGenSeenRef.current === prevGenReferenceId) return;
    prevGenSeenRef.current = prevGenReferenceId;
    setView((prev) => {
      const showsTarget = prev.panelIds.some((id) => pool.find((p) => p.id === id)?.chainRefId === prevGenReferenceId);
      if (showsTarget) return prev;
      const target = pool.find((p) => p.chainRefId === prevGenReferenceId);
      if (!target) return prev;
      const idx = prev.panelIds.findIndex((id) => pool.find((p) => p.id === id)?.chainRefId != null);
      if (idx === -1) return prev;
      return { ...prev, panelIds: prev.panelIds.map((pid, i) => (i === idx ? target.id : pid)) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevGenReferenceId, poolKey]);

  const windowOf = useCallback((product: LifecycleProductSeed): [number, number] =>
    clampReferenceWindow(product, view.windows[product.id] ?? fullWindowOf(product)),
  [view.windows]);

  const lockedOf = useCallback((product: LifecycleProductSeed): boolean =>
    view.lockedByProduct[product.id] ?? false,
  [view.lockedByProduct]);

  /** 设置本面板窗口；同步开启时以本面板为来源，其余未锁定面板按同周龄钳制。 */
  const setPanelWindow = useCallback((productId: string, s: number, e: number): void => {
    const product = pool.find((p) => p.id === productId);
    if (!product) return;
    const clamped = clampReferenceWindow(product, [s, e]);
    setView((prev) => {
      const nextWindows: Record<string, [number, number]> = { ...prev.windows, [productId]: clamped };
      if (prev.syncAge) {
        for (const other of pool) {
          if (other.id === productId) continue;
          if (!prev.panelIds.includes(other.id)) continue;
          if (prev.lockedByProduct[other.id] ?? false) continue;
          nextWindows[other.id] = clampReferenceWindow(other, clamped);
        }
      }
      return { ...prev, windows: nextWindows };
    });
  }, [pool, setView]);

  const toggleLock = useCallback((productId: string): void => {
    setView((prev) => ({
      ...prev,
      lockedByProduct: { ...prev.lockedByProduct, [productId]: !(prev.lockedByProduct[productId] ?? false) },
    }));
  }, [setView]);

  const addPanel = useCallback((id: string): void => {
    if (panelIds.includes(id)) return;
    const product = pool.find((p) => p.id === id);
    if (!product) return;
    setView((prev) => (prev.panelIds.includes(id) ? prev : {
      ...prev,
      panelIds: [...prev.panelIds, id],
      windows: { ...prev.windows, [id]: fullWindowOf(product) },
    }));
    // 上一代（有主链映射）面板加入 → 写 prevGenReferenceId 进主链；对照面板不改基线
    if (product.chainRefId) onPrevGenReferenceChange?.(product.chainRefId);
  }, [panelIds, pool, setView, onPrevGenReferenceChange]);

  // ---- 统一有效事件（图 / 名录 / 编辑器 / 回放 / 读数唯一数据源） ----
  const eventsByProduct = useMemo(() => {
    const map = new Map<string, EffectiveReferenceEvent[]>();
    for (const p of pool) {
      map.set(p.id, mergeEffectiveEvents(p, ws.workspace.composed, ws.workspace.overrides));
    }
    return map;
  }, [pool, ws.workspace.composed, ws.workspace.overrides]);

  // ---- 选中 / 悬停 / 名录定位 / 图上聚合筛选 ----
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEventIdRef = useRef<string | null>(null);
  selectedEventIdRef.current = selectedEventId;
  /** 保存成功闪强（名录自动展开 + 新行 0.6s 高亮淡出；key 递增触发）。 */
  const [saveFlash, setSaveFlash] = useState<{ productId: string; eventId: string; key: number } | null>(null);
  const saveFlashKeyRef = useRef(0);

  const selectedEventOf = useCallback((product: LifecycleProductSeed): EffectiveReferenceEvent | null =>
    eventsByProduct.get(product.id)?.find((ev) => ev.id === selectedEventIdRef.current) ?? null,
  [eventsByProduct]);
  const [hoverEventId, setHoverEventId] = useState<string | null>(null);
  const [onlyIds, setOnlyIds] = useState<string[] | null>(null);
  const [rosterFocus, setRosterFocus] = useState<{ id: string; key: number } | null>(null);
  const rosterFocusKey = useRef(0);

  const selectEvent = useCallback((product: LifecycleProductSeed, id: string | null): void => {
    setSelectedEventId(id);
    if (id == null) {
      setRosterFocus(null);
      return;
    }
    rosterFocusKey.current += 1;
    setRosterFocus({ id, key: rosterFocusKey.current });
    const ev = eventsByProduct.get(product.id)?.find((e) => e.id === id);
    if (ev && !lockedOf(product)) {
      const win = windowOf(product);
      if (ev.startWeek < win[0] || ev.endWeek > win[1]) {
        // 事件不在窗内：按事件范围扩展（16 周聚焦，事件完整可见）；锁定面板不改窗
        setPanelWindow(product.id, ...eventFocusWindow(product, ev));
      }
    }
  }, [eventsByProduct, lockedOf, windowOf, setPanelWindow]);

  // ---- 编辑器（弹层受控；草稿自动保存在工作区 editorDrafts） ----
  const [editorOpenId, setEditorOpenId] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const drafts = ws.workspace.editorDrafts;

  const draftFor = useCallback((productId: string): ReferenceEditorDraft | null => {
    let latest: ReferenceEditorDraft | null = null;
    for (const draft of Object.values(drafts)) {
      if (draft.productId !== productId) continue;
      if (latest == null || draft.updatedAt > latest.updatedAt) latest = draft;
    }
    return latest;
  }, [drafts]);

  const openComposerCreate = useCallback((product: LifecycleProductSeed): void => {
    setPickingId(null);
    const id = `${product.id}::new`;
    if (!drafts[id]) {
      ws.setEditorDraft({
        id,
        mode: 'create',
        productId: product.id,
        eventId: null,
        value: { typeId: 'competitor-launch', startWeek: null, endWeek: null, label: '', note: '', impact: null },
        baseRevision: null,
        updatedAt: new Date().toISOString(),
      });
    }
    setEditorOpenId(product.id);
  }, [drafts, ws]);

  const openEditorEvent = useCallback((product: LifecycleProductSeed, eventId: string): void => {
    setPickingId(null);
    const id = `${product.id}::${eventId}`;
    const existing = drafts[id];
    if (existing) {
      setEditorOpenId(product.id);
      return;
    }
    const ev = eventsByProduct.get(product.id)?.find((e) => e.id === eventId);
    if (!ev) return;
    ws.setEditorDraft({
      id,
      mode: 'edit',
      productId: product.id,
      eventId,
      value: { typeId: ev.typeId, startWeek: ev.startWeek, endWeek: ev.endWeek, label: ev.label, note: ev.note, impact: ev.impact },
      baseRevision: ev.revision,
      updatedAt: new Date().toISOString(),
    });
    setEditorOpenId(product.id);
  }, [drafts, eventsByProduct, ws]);

  const changeDraft = useCallback((productId: string, patch: Partial<ReferenceEventDraftValue>): void => {
    const draft = draftFor(productId);
    if (!draft) return;
    ws.setEditorDraft({ ...draft, value: { ...draft.value, ...patch }, updatedAt: new Date().toISOString() });
  }, [draftFor, ws]);

  // 面板级收起：只清自己面板的弹层 / 拖选态——A 面板弹层离场动画中的外点
  // 关闭回调不得清掉刚打开的 B 面板草稿（先开 B 后收 A 的竞态）
  const closeComposerFor = useCallback((productId: string): void => {
    setEditorOpenId((prev) => (prev === productId ? null : prev));
    setPickingId((prev) => (prev === productId ? null : prev));
  }, []);

  const submitDraftFor = useCallback((product: LifecycleProductSeed): void => {
    const draft = draftFor(product.id);
    if (!draft || draft.value.startWeek == null || draft.value.endWeek == null) return;
    const fields: ReferenceEventEditableFields = {
      typeId: draft.value.typeId,
      startWeek: draft.value.startWeek,
      endWeek: draft.value.endWeek,
      label: draft.value.label.trim(),
      note: draft.value.note.trim(),
      impact: draft.value.impact,
    };
    let savedEventId: string;
    if (draft.eventId == null) {
      savedEventId = ws.createComposed(product.id, fields).id;
    } else if (product.events.some((ev) => ev.id === draft.eventId)) {
      // 预标覆写：键 = productId + sourceEventId；不物理删除预标（× = 恢复基准）
      ws.savePresetOverride(product, draft.eventId, fields);
      savedEventId = draft.eventId;
    } else {
      ws.editComposed(draft.eventId, fields);
      savedEventId = draft.eventId;
    }
    ws.clearEditorDraft(draft.id);
    // 保存成功：编辑浮层自动收起 + 名录自动展开并短暂强调该行（0.6s 高亮淡出）
    saveFlashKeyRef.current += 1;
    setSaveFlash({ productId: product.id, eventId: savedEventId, key: saveFlashKeyRef.current });
    setEditorOpenId(null);
    setPickingId(null);
  }, [draftFor, ws]);

  const discardDraftFor = useCallback((product: LifecycleProductSeed): void => {
    const draft = draftFor(product.id);
    if (!draft) return;
    if (typeof window !== 'undefined' && !window.confirm('丢弃未提交草稿？（可撤销）')) return;
    discardReferenceEditorDraft(scopeHash, draft.id);
    closeComposerFor(product.id);
  }, [draftFor, scopeHash, closeComposerFor]);

  const deleteComposedFor = useCallback((product: LifecycleProductSeed, eventId: string): void => {
    const current = eventsByProduct.get(product.id) ?? [];
    const removed = current.find((ev) => ev.id === eventId) ?? null;
    ws.deleteComposed(eventId);
    // 删除后选择下一最近事件（按起周距离），无事件则清空
    if (selectedEventIdRef.current === eventId) {
      const rest = current.filter((ev) => ev.id !== eventId);
      const next = rest.length > 0
        ? [...rest].sort((a, b) =>
          Math.abs(a.startWeek - (removed?.startWeek ?? 0)) - Math.abs(b.startWeek - (removed?.startWeek ?? 0))
          || a.startWeek - b.startWeek
          || a.id.localeCompare(b.id))[0]
        : null;
      setSelectedEventId(next?.id ?? null);
    }
  }, [eventsByProduct, ws]);

  // ---- Esc 分级：先退拖选，再关事件详情，再收起编辑器（草稿保留） ----
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (pickingId != null) {
        setPickingId(null);
        return;
      }
      if (selectedEventIdRef.current != null) {
        setSelectedEventId(null);
        setRosterFocus(null);
        return;
      }
      if (editorOpenId != null) setEditorOpenId(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [pickingId, editorOpenId]);

  // ---- 点弹层外空白收起编辑器（草稿不丢；与 antd Popover outside-click 双保险）----
  // 排除：编辑器弹层内部（含其下拉 portal）、「＋事件」触发钮（开关语义交给
  // antd trigger，避免 mousedown 收起 + click 重开的竞态）。
  useEffect(() => {
    if (editorOpenId == null) return;
    const onDocMouseDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.ant-popover')) return;
      if (target.closest('.ant-select-dropdown')) return;
      if (target.closest('[data-ref-composer-trigger]')) return;
      closeComposerFor(editorOpenId);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [editorOpenId, closeComposerFor]);

  // ---- 「＋ 添加参考」下拉：池内未添加产品，分组 上一代 · 主链 / 友商 · 对照 ----
  const addMenuItems = useMemo(() => {
    const remaining = pool.filter((p) => !panelIds.includes(p.id));
    const groupOf = (label: string, items: LifecycleProductSeed[]) =>
      items.length > 0
        ? { key: `group-${label}`, type: 'group' as const, label, children: items.map((p) => ({ key: p.id, label: p.label })) }
        : null;
    const groups = [
      groupOf('上一代 · 主链', remaining.filter((p) => p.chainRefId != null)),
      groupOf('友商 · 对照', remaining.filter((p) => p.chainRefId == null)),
    ].filter((group) => group != null);
    if (groups.length === 0) {
      return [{ key: 'add-empty', label: pool.length === 0 ? '参考池为空' : '已全部添加', disabled: true }];
    }
    return groups;
  }, [pool, panelIds]);

  // ---- 参考回放（transient 顶部条）：信号驱动；不 8 秒自动消失 ----
  const [hint, setHint] = useState<{ kind: 'manual' | 'event'; entries: ReplayEntry[] } | null>(null);
  const seenSeqRef = useRef(0);
  const seq = inputSignal?.seq ?? 0;
  useEffect(() => {
    if (!inputSignal || inputSignal.seq <= seenSeqRef.current) return;
    seenSeqRef.current = inputSignal.seq;
    const entries = panelProducts
      .map((product) => replayEntryFor(
        product,
        eventsByProduct.get(product.id) ?? [],
        windowOf(product),
        inputSignal.eventType,
      ))
      .filter((entry): entry is ReplayEntry => entry != null);
    setHint({ kind: inputSignal.kind, entries });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, poolKey]);

  const [focus, setFocus] = useState<{ panelId: string; week: number; key: number } | null>(null);
  const focusKeyRef = useRef(0);

  const locateReplayEntry = useCallback((entry: ReplayEntry): void => {
    const product = pool.find((p) => p.id === entry.productId);
    if (!product) return;
    setSelectedEventId(entry.eventId);
    rosterFocusKey.current += 1;
    setRosterFocus({ id: entry.eventId, key: rosterFocusKey.current });
    // 目标面板锁定 → 只展开详情不改窗；未锁定 → 聚焦事件（同步开启时其余未锁定面板同动）
    if (!lockedOf(product)) {
      setPanelWindow(product.id, ...eventFocusWindow(product, { startWeek: entry.startWeek, endWeek: entry.endWeek }));
    }
    focusKeyRef.current += 1;
    setFocus({ panelId: product.id, week: clampInt(entry.startWeek, 0, Math.max(0, product.points.length - 1)), key: focusKeyRef.current });
  }, [pool, lockedOf, setPanelWindow]);

  // ---- ①跨卡定位（B.5.5 · 任务 7）：主图学习证据跳来 → 定位当前主链面板同周龄段。
  // 锁定面板只展开详情（聚焦高亮），不改窗口；未锁定 → 16 周聚焦该周龄段。
  const locateSeq = locateRequest?.seq ?? 0;
  useEffect(() => {
    if (locateSeq <= 0 || !locateRequest) return;
    const product = pool.find((p) => p.chainRefId === prevGenReferenceId);
    if (!product) return;
    const age = locateRequest.weekId != null
      ? fixture.weeks.find((week) => week.id === locateRequest.weekId)?.lifecycleIndex ?? null
      : null;
    if (age == null) return;
    setView((prev) => (prev.panelIds.includes(product.id)
      ? prev
      : { ...prev, panelIds: [...prev.panelIds, product.id], windows: { ...prev.windows, [product.id]: fullWindowOf(product) } }));
    if (!lockedOf(product)) {
      setPanelWindow(product.id, ...eventFocusWindow(product, { startWeek: age, endWeek: age }));
    }
    focusKeyRef.current += 1;
    setFocus({ panelId: product.id, week: clampInt(age, 0, Math.max(0, product.points.length - 1)), key: focusKeyRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateSeq, poolKey]);

  // 模型比值行（①学习参照读数）：只消费推演模型考量，卡内不另算比值。
  // B.5.5：首预测周比值行升级为「首预测周 YYYYWww · 同周龄证据」。
  const firstForecastWeek = result.weeks.find((week) => week.status === 'forecast');
  const referenceConsider = firstForecastWeek?.consider.find((item) => item.kind === 'reference');
  const prevGenFootnote = firstForecastWeek && referenceConsider
    ? `首预测周 ${firstForecastWeek.weekId} · 同周龄证据 · ${referenceConsider.note}`
    : undefined;

  const emptyPool = pool.length === 0;
  const panelCount = panelProducts.length;
  // 并排上限 2（量价页同款轨道宽度策略）：≤2 均分一行；>2 不折行横滚
  const trackWidth = panelCount > 2
    ? `calc(${panelCount / 2} * 100% + ${(panelCount / 2 - 1) * space.md}px)`
    : '100%';

  const undoLabel = referenceUndoLabel(ws.lastAction);

  const applyPreset = useCallback((product: LifecycleProductSeed, preset: Exclude<ReferenceWindowPreset, 'custom'>): void => {
    const n = product.points.length;
    if (n <= 0) return;
    if (preset === 'full') setPanelWindow(product.id, 0, n - 1);
    else if (preset === 'last16') setPanelWindow(product.id, Math.max(0, n - 16), n - 1);
    else {
      const ev = selectedEventOf(product);
      if (ev) setPanelWindow(product.id, ...eventFocusWindow(product, ev));
    }
  }, [setPanelWindow, selectedEventOf]);

  const composerRestoreFor = (product: LifecycleProductSeed, draft: ReferenceEditorDraft | null): (() => void) | null => {
    if (!draft || draft.mode !== 'edit' || draft.eventId == null) return null;
    const isPreset = product.events.some((ev) => ev.id === draft.eventId);
    if (!isPreset) return null;
    const ev = eventsByProduct.get(product.id)?.find((e) => e.id === draft.eventId);
    if (!ev?.overridden) return null;
    return () => ws.restorePreset(product, draft.eventId as string);
  };

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="量价参考产品"
        extra={(
          <>
            {/* ①阶段标（B.5.1 卡头语言：参考 = ① 基线预测 · 历史参照） */}
            <span
              title="本卡为①自动学习基线提供历史参照：上一代同周龄对齐进入①学习器，切换参照 = 重新学习"
              style={{ ...smallChipStyle, background: selectSoft, color: selectSoftInk, border: `1px solid ${selectAccent}` }}
            >
              ① 基线预测 · 历史参照
            </span>
            {/* 2026-11-05 二轮收尾（全局 #7）：模拟历史 chip 退役为 ？说明图标
                （HintInfo），title 合并模拟语境；「仅对照」为产品身份语义 chip 保留 */}
            <HintInfo
              label="量价参考卡说明"
              text="模拟历史 · 演示样本回放：参照产品历史序列为纯历史的模拟样本（仅历史、无预测段），量价与事件不代表真实市场；仅作历史参照，不写入主链、不进模型推演。"
            />
          </>
        )}
      />
      {/* 参考回放（非 Modal，顶部条）：下一信号替换或手动关闭，不自动消失 */}
      {hint && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 10px',
            padding: '8px 12px',
            borderRadius: radius.control,
            background: color.canvasSoft2,
            border: `1px solid ${color.hairline}`,
            marginBottom: space.md,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>参考回放</span>
          {hint.entries.map((entry) => (
            <button
              key={`${entry.productId}-${entry.eventId}`}
              type="button"
              className="tnum"
              title="点击定位到该事件（锁定面板只展开详情，不改窗口）"
              onClick={() => locateReplayEntry(entry)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                lineHeight: '16px',
                padding: '3px 9px',
                borderRadius: radius.pill,
                border: `1px solid ${color.hairlineStrong}`,
                background: color.canvas,
                color: color.body,
                cursor: 'pointer',
                font: 'inherit',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.text}
            </button>
          ))}
          {hint.entries.length === 0 && (
            <span style={{ fontSize: 12, color: color.mute }}>无可回放事件</span>
          )}
          <button
            type="button"
            aria-label="关闭参考回放"
            onClick={() => setHint(null)}
            style={{
              marginLeft: 'auto',
              display: 'inline-grid',
              placeItems: 'center',
              width: 20,
              height: 20,
              padding: 0,
              border: 'none',
              borderRadius: radius.pill,
              background: 'transparent',
              color: color.mute,
              fontSize: 13,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}
      {emptyPool ? (
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
          <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>
        </div>
      ) : (
        <>
          {/* 卡级工具行：同周龄同步（默认关）+ ＋ 添加参考 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginBottom: space.sm, minWidth: 0 }}>
            <label
              title="开启后，调整任一未锁定面板窗口时，其余未锁定面板按相同周龄同步（各面板按自身长度与最小窗口钳制）；锁定面板不动；同步的是周龄，不是日历日期，也不是纵轴"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={syncAge}
                onChange={(event) => setView((prev) => ({ ...prev, syncAge: event.target.checked }))}
                style={{ margin: 0, accentColor: color.ink }}
              />
              同周龄同步
            </label>
            {ws.saveState === 'unpersisted' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: color.warningInk }}>
                未持久化 · 未能保存到浏览器，仅当前页面有效
                <button
                  type="button"
                  aria-label="重试保存工作区"
                  onClick={ws.retryPersist}
                  style={{ border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, background: color.canvas, color: color.body, font: 'inherit', fontSize: 12, padding: '1px 8px', cursor: 'pointer' }}
                >
                  重试
                </button>
              </span>
            )}
            <span style={{ marginLeft: 'auto', flex: 'none' }}>
              <Dropdown
                trigger={['click']}
                menu={{ items: addMenuItems, onClick: ({ key }) => addPanel(key) }}
                placement="bottomRight"
              >
                <button
                  type="button"
                  aria-label="添加参考面板"
                  title="从参考池添加参照产品面板（上一代进主链 / 友商对照）"
                  style={{
                    height: 26,
                    padding: '0 10px',
                    borderRadius: radius.control,
                    border: `1px solid ${color.hairlineStrong}`,
                    background: color.canvas,
                    color: color.ink,
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ＋ 添加参考
                </button>
              </Dropdown>
            </span>
          </div>
          {/* 单一横滚容器：面板网格（>2 面板不折行，每格恒为可视宽 1/2） */}
          <div className="lpl-card-scroll" style={{ overflowX: 'auto', marginBottom: space.sm }}>
            <div style={{ minWidth: TRACK_MIN_WIDTH, width: trackWidth }}>
              {panelCount === 0 ? (
                <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute, border: `1px dashed ${color.hairline}`, borderRadius: radius.card }}>
                  暂无可参照历史
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${panelCount}, minmax(0, 1fr))`, gap: space.md, alignItems: 'start' }}>
                  {panelProducts.map((product) => {
                    const events = eventsByProduct.get(product.id) ?? [];
                    const draft = draftFor(product.id);
                    const isChainPanel = product.chainRefId != null && product.chainRefId === prevGenReferenceId;
                    // 草稿 N = 本地补录（未删除）+ 预标覆写
                    const localCount = Object.values(ws.workspace.composed)
                      .filter((record) => record.productId === product.id && record.deletedAt == null).length
                      + Object.values(ws.workspace.overrides)
                        .filter((record) => record.productId === product.id).length;
                    return (
                      <ReferenceChartCard
                        key={product.id}
                        product={product}
                        isInChain={isChainPanel}
                        panelCount={panelCount}
                        onRemove={() => {
                          if (panelCount <= 1) return;
                          const removed = pool.find((p) => p.id === product.id);
                          const next = panelIds.filter((x) => x !== product.id);
                          setView((prev) => ({ ...prev, panelIds: next }));
                          closeComposerFor(product.id);
                          // 删除面板不清事件：工作区补录 / 覆写原样保留（重加恢复显示）
                          if (selectedEventId && events.some((ev) => ev.id === selectedEventId)) {
                            setSelectedEventId(null);
                            setRosterFocus(null);
                          }
                          if (onlyIds != null && events.some((ev) => onlyIds.includes(ev.id))) {
                            setOnlyIds(null);
                          }
                          // 删除的是当前主链面板 → 主链回退：下一个链内面板优先，否则回默认参照
                          const wasChain = removed?.chainRefId != null && removed.chainRefId === prevGenReferenceId;
                          if (wasChain) {
                            const nextChain = next
                              .map((pid) => pool.find((p) => p.id === pid))
                              .find((p) => p?.chainRefId != null);
                            onPrevGenReferenceChange?.(nextChain?.chainRefId ?? defaultChainRef);
                          }
                        }}
                        win={windowOf(product)}
                        onWindowChange={(s, e) => setPanelWindow(product.id, s, e)}
                        windowLocked={lockedOf(product)}
                        onToggleLock={() => toggleLock(product.id)}
                        events={events}
                        selectedEvent={events.find((ev) => ev.id === selectedEventId) ?? null}
                        labelOf={labelOf}
                        colorOf={colorOf}
                        draftCount={localCount}
                        editorOpen={editorOpenId === product.id}
                        picking={pickingId === product.id}
                        draft={draft}
                        saveState={ws.saveState === 'unpersisted' ? 'unpersisted' : 'saved'}
                        onRetryPersist={ws.retryPersist}
                        onOpenCreate={() => openComposerCreate(product)}
                        onComposerChange={(patch) => changeDraft(product.id, patch)}
                        onPickRange={() => setPickingId(product.id)}
                        onSelectRange={(startWeek, endWeek) => {
                          changeDraft(product.id, { startWeek, endWeek: startWeek > endWeek ? startWeek : endWeek });
                          setPickingId(null);
                        }}
                        onSubmitDraft={() => submitDraftFor(product)}
                        onCollapseComposer={() => closeComposerFor(product.id)}
                        onDiscardDraft={() => discardDraftFor(product)}
                        composerRestore={composerRestoreFor(product, draft)}
                        onRestorePreset={(sourceEventId) => ws.restorePreset(product, sourceEventId)}
                        onSelectEvent={(id) => selectEvent(product, id)}
                        onEditEvent={(id) => openEditorEvent(product, id)}
                        onDeleteComposed={(id) => deleteComposedFor(product, id)}
                        onHoverEvent={setHoverEventId}
                        hoverEventId={hoverEventId}
                        onOverflowEvents={(ids) => setOnlyIds(ids)}
                        onlyIds={onlyIds}
                        onClearOnly={() => setOnlyIds(null)}
                        rosterFocus={rosterFocus}
                        saveFlash={saveFlash?.productId === product.id
                          ? { eventId: saveFlash.eventId, key: saveFlash.key }
                          : null}
                        onPreset={(preset) => applyPreset(product, preset)}
                        focusWeek={focus?.panelId === product.id ? focus.week : null}
                        focusKey={focus?.panelId === product.id ? focus.key : 0}
                        footNote={isChainPanel ? prevGenFootnote : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {/* 撤销操作条（轻量）：最近一步可撤销（20 步 before/after patch 重放） */}
          {ws.canUndo && undoLabel && (
            <div
              role="status"
              aria-live="polite"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: space.sm, padding: '4px 10px', borderRadius: radius.control, border: `1px solid ${color.hairline}`, background: color.canvasSoft2 }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: color.body }}>{undoLabel}</span>
              <button
                type="button"
                aria-label={`撤销：${undoLabel}`}
                onClick={ws.undo}
                style={{ border: 'none', background: 'transparent', color: color.link, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                撤销
              </button>
            </div>
          )}
          {/* 模型比值行（主图基线校正）：上一代面板存在时面板内同文显示，此处兜底。
              2026-11-05 视觉精简二轮：随「首预测周读数」收起区默认收起 */}
          {prevGenFootnote && !panelProducts.some((p) => p.chainRefId != null && p.chainRefId === prevGenReferenceId) && (
            <CollapsibleSection label="首预测周读数">
              <div className="tnum" style={{ fontSize: 12, color: color.mute, minWidth: 0 }}>{prevGenFootnote}</div>
            </CollapsibleSection>
          )}
        </>
      )}
    </section>
  );
}
