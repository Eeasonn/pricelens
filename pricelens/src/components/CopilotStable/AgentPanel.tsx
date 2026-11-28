import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CheckOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { AgentContextDisclosure, AgentThread, type AgentToolPart } from '../Assistant/AgentThread';
import { useAgent } from '../../state/AgentContext';
import { INDUSTRY_LABELS } from '../../dataModel/scope';
import { modelNameOf } from '../ProductCascader/tree';
import { usePage } from '../../state/PageContext';
import { navBus } from '../../state/navBus';
import { buildCards } from '../../state/mainSelection';
import { buildFilterChanges } from '../../agent-stable';
import type { AgentCardAction, AgentEvidence, AgentResponse, AgentResultCard, AlertResultCard, ChartResultCard, FilterPatch, FilterResultCard, ForecastExplanationResultCard, PriceAdvantageResultCard, TableResultCard, ToolCallCard } from '../../agent-stable';
import { AGENT_FOLLOWUP_SUGGESTIONS, AGENT_STATUS_LABELS, agentSuggestionsForPage } from './agentCopy';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';

/**
 * R8（二轮返修）：错指纹响应的消息级动作锁。响应 contextFingerprint 与请求
 * 不一致的消息（AgentMessage.staleMismatch）渲染结果卡时，所有有副作用/导航/
 * 改筛选动作（apply/open/followup/copy 及行级定位）一律禁用，仅原地只读
 * evidence 豁免；建议词条不锁（发起的是全新运行，正是修复动作）。
 * R3（三轮返修 m3）：applied 撤销/重做、工具卡撤销恢复、定位撤销同样消费本
 * Context——导出给回归测试直接验证锁定态（组件本身仍是内部实现）。
 */
export const CardActionsLockedContext = createContext(false);
// Stale previews cannot write forward, but an intentional application must
// retain its undo path. Mismatched/unvalidated messages lock both directions.
const ResultContextStaleContext = createContext(false);
const suggestionStyle: CSSProperties = { padding: '4px 7px', border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, color: color.body, cursor: 'pointer', fontSize: fontSize.caption, textAlign: 'left' };
const suggestionLabel = (item: string | { label: string }): string => typeof item === 'string' ? item : item.label;
const suggestionPrompt = (item: string | { prompt: string }): string => typeof item === 'string' ? item : item.prompt;
const suggestionIntent = (item: string | { intent?: import('../../agent-stable').AgentIntent }): import('../../agent-stable').AgentIntent | undefined => {
  if (typeof item !== 'string') return item.intent;
  if (/只看|带上|显示|去掉|最近\s*\d+\s*(周|月)/.test(item)) return 'filter';
  if (/预警|阈值/.test(item)) return 'alert';
  if (/预测|假设|风险|不确定/.test(item)) return 'forecast_explain';
  return 'query';
};

function ContextChips() {
  const { context, contextStale } = useAgent();
  const { state } = context;
  const productCount = state.mains.reduce((n, card) => n + (card.main ? 1 : 0) + card.compares.length, 0);
  // 桶 id 显示格式随粒度（周 2026W19 / 月 2026-05；季 id 本身带 Q 原样）——
  // 与 AnomalyQualityChip.anomalyBucketTextOf 同口径，月粒度不再裸显 202605
  const formatBucket = (id: string): string => {
    if (!/^\d{6}$/.test(id)) return id;
    if (state.granularity === 'week') return `${id.slice(0, 4)}W${id.slice(4)}`;
    if (state.granularity === 'month') return `${id.slice(0, 4)}-${id.slice(4)}`;
    return id;
  };
  const skuChip = state.mains.find((card) => card.main)?.main;
  // Show the business product/spec here; internal SKU ids belong to evidence.
  const skuLabel = skuChip ? `口径 · ${modelNameOf(skuChip.modelId)} · ${skuChip.romram}` : '未选产品';
  const chips = [`当前页 · ${context.pageLabel ?? context.page}`, `${state.countryCode} · ${INDUSTRY_LABELS[state.industry] ?? state.industry}`, productCount ? `${productCount} 个产品` : '未选产品', ...(skuChip ? [skuLabel] : []), `${formatBucket(state.rangeStart)}–${formatBucket(state.rangeEnd)}`, state.currency === 'usd' ? 'USD' : '本币', state.priceTypes.rrp ? '含 RRP' : '仅折后价'];
  return <AgentContextDisclosure
    page={context.pageLabel ?? context.page}
    summary={`${state.countryCode} · ${INDUSTRY_LABELS[state.industry] ?? state.industry} · ${productCount ? `${productCount} 个产品` : '未选产品'}`}
    range={`${formatBucket(state.rangeStart)}–${formatBucket(state.rangeEnd)} · ${state.currency === 'usd' ? 'USD' : '本币'}`}
    details={chips.map((chip, index) => ({ id: chip, label: chip, active: index === 0, title: chip === skuLabel ? skuChip?.skuIds[0] : undefined }))}
    stale={contextStale}
  />;
}

/**
 * 证据区（B3 契约）：永远真实——来源状态、范围、采集/快照时间未知时明确
 * 「待确认」；无证据写「暂无快照 · 待接入」，不渲染虚构链接或数字。
 * revealSignal 由「查看证据」动作递增：原地展开并把焦点移到可聚焦标题。
 */
function EvidenceList({ evidence, revealSignal = 0 }: { evidence?: AgentEvidence[]; revealSignal?: number }) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    if (!revealSignal) return;
    const node = detailsRef.current;
    if (!node) return;
    node.open = true;
    const summary = node.querySelector('summary');
    if (summary instanceof HTMLElement) summary.focus();
  }, [revealSignal]);
  const items = evidence ?? [];
  return <details ref={detailsRef} style={{ marginTop: space.sm, fontSize: fontSize.caption, color: color.mute }}><summary tabIndex={0} style={{ cursor: 'pointer', color: color.body }}>证据与来源 · {items.length}</summary>{items.length
    ? <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{items.map((item, index) => <div key={`${item.id ?? item.label}-${index}`} style={{ padding: '6px 8px', borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer" style={{ color: color.link }}>{item.label}</a> : <strong style={{ color: color.ink }}>{item.label}</strong>}<div>{item.detail}</div><div style={{ marginTop: 2, fontSize: fontSize.caption, color: color.mute }}>来源：{item.source || '待确认'} · 快照：{item.timestamp || '待确认'}</div></div>)}</div>
    : <div style={{ marginTop: 6, padding: '6px 8px', borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>暂无快照 · 待接入（无证据时不展示链接或数字）</div>}</details>;
}

/**
 * B1 固定结构分节：结论在气泡文本，卡内按 事实 → 计算/规则 → 判断边界 →
 * 动作 的顺序呈现；分节只做标签化，不引入新容器样式。
 * 间距/字号引用运行时 token（R8：不落非标 9px / 10.5px 硬编码）。
 */
function CardSection({ label, children }: { label: string; children: ReactNode }) {
  return <div className="lpl-agent-card-section" data-agent-card-section={label} style={{ marginTop: space.sm }}>
    <div style={{ fontSize: fontSize.caption, fontWeight: 600, color: color.mute, marginBottom: space.xs }}>{label}</div>
    {children}
  </div>;
}

function FilterWriteConfirmation({ title, changes, error, confirmDisabled = false, onConfirm, onCancel }: {
  title: string;
  changes: FilterResultCard['changes'];
  error?: string | null;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmRef.current?.focus(); }, []);
  return <div role="group" aria-label="确认调整看板筛选" style={{ ...warningStyle, background: color.canvasSoft, border: `1px solid ${color.warning}` }}>
    <strong style={{ display: 'block', fontSize: fontSize.caption, color: color.ink }}>{title}</strong>
    <div style={{ display: 'grid', gap: space.xs, marginTop: space.sm }}>{changes.map((change) => <div key={change.label} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) auto minmax(0, 1fr)', gap: 6, fontSize: fontSize.caption }}>
      <span style={{ color: color.mute }}>{change.label}</span><span style={{ overflowWrap: 'anywhere' }}>{change.before}</span><span style={{ color: color.mute }}>→</span><strong style={{ overflowWrap: 'anywhere' }}>{change.after}</strong>
    </div>)}</div>
    <div style={actionRowStyle}>
      <Button ref={confirmRef} size="small" type="primary" disabled={confirmDisabled} onClick={onConfirm}>确认并继续</Button>
      <Button size="small" aria-label="取消" onClick={onCancel}>取消</Button>
    </div>
    {error && <div role="alert" style={{ ...warningStyle, color: color.error, background: color.canvas }}>{error}</div>}
  </div>;
}

function CardActions({ actions, onEvidence }: { actions?: AgentCardAction[]; onEvidence?: () => void }) {
  const { setDraft, send, context, appliedFilterIds, applyFilter, undoFilter } = useAgent();
  const { go } = usePage();
  const actionsLocked = useContext(CardActionsLockedContext);
  const contextStale = useContext(ResultContextStaleContext);
  const [appliedTransactions, setAppliedTransactions] = useState<ReadonlyMap<string, string>>(new Map());
  const [pendingAction, setPendingAction] = useState<AgentCardAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pendingTrigger = useRef<HTMLButtonElement | null>(null);
  if (!actions?.length) return null;
  const pendingChanges = pendingAction?.target?.filterPatch ? buildFilterChanges(context.state, pendingAction.target.filterPatch) : [];
  const cancelPending = () => {
    setPendingAction(null);
    setActionError(null);
    queueMicrotask(() => pendingTrigger.current?.focus());
  };
  const executeOpen = (action: AgentCardAction, shouldApply: boolean) => {
    if (actionsLocked || contextStale) {
      setActionError('当前结果口径已变化，请重新运行 Agent 后再定位。');
      return;
    }
    if (shouldApply && action.target?.filterPatch) {
      const result = applyFilter({ kind: 'filter', id: `alert-nav-filter-${action.id}`, title: '定位筛选', patch: action.target.filterPatch, changes: pendingChanges });
      if (!result.ok) {
        setActionError(result.error ?? '当前筛选无法应用，请重新生成定位预览。');
        return;
      }
      setAppliedTransactions((prev) => new Map(prev).set(action.id, result.transactionId));
    }
    setPendingAction(null);
    setActionError(null);
    const target = action.target;
    if (target?.alertId && target.page === 'alerts') {
      navBus.alertsFocus = {
        alertId: target.alertId,
        contextFingerprint: target.contextFingerprint,
        modelId: target.modelId ?? '',
        seriesKey: target.alertSeriesKey ?? target.seriesKey,
        type: target.alertType as 'price-change' | 'promo' | 'platform-gap' | 'own-gap' | undefined,
        weekId: target.weekId,
      };
      window.dispatchEvent(new Event('pricelens:alerts-focus'));
    }
    if (target?.page === 'dashboard' && target.weekId) navBus.dashboardFocusWeekId = target.weekId;
    const targetPage = target?.page;
    if (targetPage === 'alerts' || targetPage === 'dashboard' || targetPage === 'volume' || targetPage === 'overview' || targetPage === 'pricing' || targetPage === 'config') go(targetPage);
    // 已下线页（forecast / marketboard / intelligence）的动作目标：2026-11-27 演进版退场
    // 后页类型收敛，一律落回价格走势（与退场前 PageContext 对这三页的落回一致）
    else if (targetPage === 'forecast' || targetPage === 'marketboard' || targetPage === 'intelligence') go('dashboard');
    else if (/预警/.test(action.prompt ?? '')) go('alerts');
    else go('dashboard');
  };
  return <>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>{actions.map((action) => {
      const readonlyEvidence = action.kind === 'evidence';
      const stale = !readonlyEvidence && (contextStale || Boolean(action.target?.contextFingerprint && action.target.contextFingerprint !== context.fingerprint));
      const transactionId = appliedTransactions.get(action.id);
      const applied = transactionId ? appliedFilterIds.has(transactionId) : false;
      const disabled = Boolean(action.disabled) || (stale && !applied) || (actionsLocked && !readonlyEvidence);
      const label = applied ? `${action.label} · 撤销` : stale ? `${action.label} · 需刷新` : action.label;
      return <button type="button" key={action.id} disabled={disabled} title={stale && !applied ? '当前筛选已变化，请重新运行 Agent' : actionsLocked && !readonlyEvidence ? '响应口径与当前上下文不一致，动作已锁定' : undefined} aria-label={applied ? label : stale && !applied ? `${action.label}（当前口径已变化）` : actionsLocked && !readonlyEvidence ? `${action.label}（结果口径未确认）` : label} onClick={(event) => {
        if (disabled) return;
        if (action.kind === 'evidence') { onEvidence?.(); return; }
        if (applied && (action.kind === 'apply' || action.kind === 'open')) {
          if (!transactionId) { setActionError('此次定位尚未应用或已被撤销。'); return; }
          const undone = undoFilter(transactionId);
          if (!undone) { setActionError('已有更新的筛选变更，请先撤销最新变更。'); return; }
          setAppliedTransactions((prev) => { const next = new Map(prev); next.delete(action.id); return next; });
          setActionError(null);
          return;
        }
        if (action.kind === 'apply' && action.target?.filterPatch) {
          const result = applyFilter({ kind: 'filter', id: `alert-filter-${action.id}`, title: '预警筛选', patch: action.target.filterPatch, changes: [] });
          if (!result.ok) { setActionError(result.error ?? '当前筛选无法应用。'); return; }
          setAppliedTransactions((prev) => new Map(prev).set(action.id, result.transactionId));
          setActionError(null);
          return;
        }
        if (action.kind === 'copy' && action.prompt) void navigator.clipboard?.writeText(action.prompt);
        else if (action.prompt) {
          setDraft(action.prompt);
          if (action.kind === 'followup') void send(action.prompt, action.target?.forecastDraft, { forecastSnapshot: action.target?.forecastSnapshot, forecastDataset: action.target?.forecastDataset }, undefined, action.target?.filterPatch);
          if (action.kind === 'open') {
            const changes = action.target?.filterPatch ? buildFilterChanges(context.state, action.target.filterPatch) : [];
            if (changes.length) {
              pendingTrigger.current = event.currentTarget;
              setActionError(null);
              setPendingAction(action);
              return;
            }
            executeOpen(action, false);
          }
        }
      }} style={{ ...textButtonStyle, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '4px 8px', background: color.canvas, opacity: disabled ? 0.5 : 1 }}>{label}</button>;
    })}</div>
    {pendingAction && <FilterWriteConfirmation title={`${pendingAction.label}将调整当前看板口径`} changes={pendingChanges} error={actionError} confirmDisabled={actionsLocked || contextStale} onConfirm={() => executeOpen(pendingAction, pendingChanges.length > 0)} onCancel={cancelPending} />}
    {actionError && !pendingAction && <div role="alert" style={{ ...warningStyle, color: color.error, background: color.canvasSoft2 }}>{actionError}</div>}
  </>;
}

export function FilterCard({ card }: { card: FilterResultCard }) {
  const { appliedFilterIds, filterTransactions, applyFilter, canUndo, undoFilter, redoFilterIds, redoFilter, setDraft } = useAgent();
  const actionsLocked = useContext(CardActionsLockedContext);
  const [applyError, setApplyError] = useState<string | null>(null);
  const transactionId = filterTransactions.get(card.id) ?? null;
  const applied = transactionId ? appliedFilterIds.has(transactionId) : false;
  const contextStale = useContext(ResultContextStaleContext);
  const applyDisabled = actionsLocked || contextStale;
  const redoAvailable = transactionId ? redoFilterIds.has(transactionId) : false;
  const undoCard = () => {
    if (actionsLocked || !transactionId) return;
    const undone = undoFilter(transactionId);
    setApplyError(undone ? null : '已有更新的筛选变更，请先撤销最新变更。');
  };
  const redoCard = () => {
    if (actionsLocked || !transactionId) return;
    const redone = redoFilter(transactionId);
    setApplyError(redone ? null : '请先处理较新的撤销记录。');
  };
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>只读预览</span></div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      {card.changes.map((change) => <div className="lpl-agent-filter-change" key={change.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto 1fr', gap: 6, alignItems: 'center', fontSize: fontSize.caption }}><span style={{ color: color.mute }}>{change.label}</span><span>{change.before}</span><span style={{ color: color.mute }}>→</span><strong>{change.after}</strong></div>)}
    </div>
    {card.warning && <div style={warningStyle}>{card.warning}</div>}
    <div style={actionRowStyle}>
      {applied ? <><span style={{ color: color.link, fontSize: fontSize.caption }}><CheckOutlined /> 已应用</span>{canUndo && <button type="button" disabled={actionsLocked} title={actionsLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} aria-disabled={actionsLocked} onClick={undoCard} style={{ ...textButtonStyle, opacity: actionsLocked ? 0.5 : 1, cursor: actionsLocked ? 'not-allowed' : 'pointer' }}><UndoOutlined /> 撤销</button>}</> : redoAvailable ? <><span style={{ color: color.mute, fontSize: fontSize.caption }}>已撤销</span><button type="button" disabled={actionsLocked} title={actionsLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} aria-disabled={actionsLocked} onClick={redoCard} style={{ ...textButtonStyle, opacity: actionsLocked ? 0.5 : 1, cursor: actionsLocked ? 'not-allowed' : 'pointer' }}><RedoOutlined /> 重做</button></> : <><Button size="small" type="primary" disabled={applyDisabled} title={contextStale ? '当前筛选已变化，请重新生成预览' : actionsLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (applyDisabled) return; const result = applyFilter(card); setApplyError(result.ok ? null : result.error ?? '当前筛选无法应用，请重新生成预览。'); }}>应用到看板</Button><Button size="small" onClick={() => setDraft(card.prompt ?? '')}>继续修改</Button></>}
    </div>
    {applyError && <div role="alert" style={{ ...warningStyle, color: color.error, background: color.canvasSoft2 }}>应用失败：{applyError}</div>}
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function TableCard({ card }: { card: TableResultCard }) {
  const table = <div className="lpl-card-scroll aui-table-scroll" tabIndex={0} role="region" aria-label={`${card.title}，可横向滚动`} style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.caption }}><thead><tr>{card.columns.map((column) => <th key={column} style={tableHeadStyle}>{column}</th>)}</tr></thead><tbody>{card.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} style={tableCellStyle}>{cell}</td>)}</tr>)}</tbody></table></div>;
  // R2：带显式 计算/规则 或 判断边界 的表卡（空预警/未监控卡）同样按 B1 固定
  // 结构呈现：事实(表) → 计算/规则 → 判断边界 → 动作；普通表卡保持原渲染。
  const structured = Boolean(card.rules || card.boundaries?.length);
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>确定性结果</span></div>
    {structured ? <CardSection label="事实">{table}</CardSection> : table}
    {card.note && <div style={noteStyle}>{card.note}</div>}
    {card.rules && <CardSection label="计算与规则">{card.rules}</CardSection>}
    {card.boundaries?.length ? <CardSection label="判断边界">{card.boundaries.map((item) => <div key={item} style={{ ...noteStyle, marginTop: 2 }}>· {item}</div>)}</CardSection> : null}
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function ChartCard({ card }: { card: ChartResultCard }) {
  const max = Math.max(1, ...card.series.flatMap((s) => s.values.map((v) => v.value ?? 0)));
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>图表</span></div>
    <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
      {card.series.slice(0, 5).map((series) => <div key={series.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 116px', gap: 8, alignItems: 'center' }}><span title={series.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: fontSize.caption, color: color.body }}>{series.label}</span><div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 28 }}>{series.values.slice(-10).map((point, index) => <span key={`${point.bucket}-${index}`} title={`${point.bucket} · ${point.value ?? '—'}`} style={{ flex: 1, minWidth: 3, height: `${Math.max(3, ((point.value ?? 0) / max) * 24)}px`, background: series.color, opacity: point.value == null ? 0.18 : 0.72, borderRadius: '2px 2px 0 0' }} />)}</div></div>)}
    </div>
    <div style={noteStyle}>{card.note}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

export function PriceAdvantageCard({ card }: { card: PriceAdvantageResultCard }) {
  const { appliedFilterIds, applyFilter, undoFilter, context } = useAgent();
  const { go } = usePage();
  const actionsLocked = useContext(CardActionsLockedContext);
  const [filter, setFilter] = useState<PriceAdvantageResultCard['filter']>(card.filter);
  const [filterHistory, setFilterHistory] = useState<PriceAdvantageResultCard['filter'][]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState(card.selectedSkuId ?? card.skuOptions[0]?.skuId);
  const [locatedRowId, setLocatedRowId] = useState<string | null>(null);
  const [locationTransactionId, setLocationTransactionId] = useState<string | null>(null);
  const locationApplied = locationTransactionId ? appliedFilterIds.has(locationTransactionId) : false;
  const [pendingLocate, setPendingLocate] = useState<{ row: PriceAdvantageResultCard['rows'][number]; patch: FilterPatch; changes: FilterResultCard['changes'] } | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const locateTrigger = useRef<HTMLButtonElement | null>(null);
  const [evidenceReveal, setEvidenceReveal] = useState(0);
  const contextStale = useContext(ResultContextStaleContext);
  const stale = contextStale || Boolean(card.target?.contextFingerprint && card.target.contextFingerprint !== context.fingerprint);
  // R8：错指纹消息的行级定位同样属于副作用动作（改筛选 + 跳页），一并锁定。
  const locateBlocked = stale || actionsLocked;
  const rows = card.rows.filter((row) => (filter === 'all' || row.direction === filter) && (!selectedSkuId || row.ownSkuId === selectedSkuId));
  const pushFilter = (next: PriceAdvantageResultCard['filter']) => {
    if (next === filter) return;
    setFilterHistory((prev) => [...prev, filter].slice(-5));
    setFilter(next);
  };
  const undoView = () => {
    const previous = filterHistory[filterHistory.length - 1];
    if (!previous) return;
    setFilter(previous);
    setFilterHistory((prev) => prev.slice(0, -1));
  };
  const locate = (row: PriceAdvantageResultCard['rows'][number], confirmed = false) => {
    if (locateBlocked) {
      setLocateError('当前结果口径已变化，请重新运行价格优势后再定位。');
      return;
    }
    const patch = {
      countryCode: row.countryCode,
      platform: row.target.platform ? { platforms: [row.target.platform], shopIds: [], seller: null } : null,
      granularity: 'week' as const,
      adaptive: false,
      rangeStart: row.weekId,
      rangeEnd: row.weekId,
      mains: buildCards([{ modelId: row.ownModelId, romram: row.ownRomram, skuIds: [row.ownSkuId] }], { auto: true, countryCode: row.countryCode }),
    };
    const changes = buildFilterChanges(context.state, patch);
    if (!confirmed && changes.length) {
      setLocateError(null);
      setPendingLocate({ row, patch, changes });
      return;
    }
    if (changes.length) {
      const result = applyFilter({ kind: 'filter', id: `price-advantage-locate-${row.id}`, title: '价格优势定位', patch, changes });
      if (!result.ok) {
        setLocateError(result.error ?? '当前筛选无法应用，请重新生成定位预览。');
        return;
      }
      setLocationTransactionId(result.transactionId);
    }
    navBus.dashboardFocusWeekId = row.weekId;
    setLocatedRowId(row.id);
    setPendingLocate(null);
    setLocateError(null);
    go('dashboard');
  };
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={{ ...mutedBadge, color: color.link }}>本地确定性</span></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: space.sm, alignItems: 'center' }}>
      <span style={{ color: color.mute, fontSize: fontSize.caption }}>视图</span>
      {(['all', 'advantage', 'lagging'] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => pushFilter(value)} style={{ ...suggestionStyle, color: filter === value ? selectSoftInk : color.body, background: filter === value ? selectSoft : color.canvas }}>{value === 'all' ? '全部' : value === 'advantage' ? '只看占优机型' : '只看落后机型'}</button>)}
      {filterHistory.length > 0 && <button type="button" onClick={undoView} style={textButtonStyle}>撤销筛选</button>}
    </div>
    {card.skuOptions.length > 1 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}><span style={{ color: color.mute, fontSize: fontSize.caption }}>SKU</span>{card.skuOptions.map((option) => <button key={option.skuId} type="button" aria-pressed={selectedSkuId === option.skuId} onClick={() => setSelectedSkuId(option.skuId)} style={{ ...suggestionStyle, color: selectedSkuId === option.skuId ? selectSoftInk : color.body, background: selectedSkuId === option.skuId ? selectSoft : color.canvas }}>{option.label}</button>)}</div>}
    {locateBlocked && <div role="status" style={warningStyle}>{stale ? '当前筛选已变化，定位动作需重新运行价格优势。' : '响应口径与当前上下文不一致，定位动作已锁定，请重新运行确认。'}</div>}
    {pendingLocate && <FilterWriteConfirmation title="定位到看板将调整当前口径" changes={pendingLocate.changes} error={locateError} confirmDisabled={locateBlocked} onConfirm={() => locate(pendingLocate.row, true)} onCancel={() => { setPendingLocate(null); setLocateError(null); queueMicrotask(() => locateTrigger.current?.focus()); }} />}
    {locateError && !pendingLocate && <div role="alert" style={{ ...warningStyle, color: color.error, background: color.canvasSoft2 }}>{locateError}</div>}
    <CardSection label="事实">
      <div className="aui-advantage-mobile">{rows.map((row) => {
        const direction = row.direction === 'advantage' ? '占优' : row.direction === 'lagging' ? '落后' : '持平';
        return <div key={row.id} className="aui-advantage-mobile-row" data-agent-advantage-mobile-row>
          <div className="aui-advantage-mobile-head"><strong>{row.weekLabel}</strong><span data-direction={row.direction}>{direction}</span></div>
          <div className="aui-advantage-mobile-channel">{row.channel}</div>
          <dl className="aui-advantage-mobile-comparison">
            <div><dt>我司</dt><dd><span>{row.ownModelName} · {row.ownRomram}</span><strong>{formatPrice(row.ownPrice, card.currency)}</strong></dd></div>
            <div><dt>竞品</dt><dd><span>{row.competitorBrand} {row.competitorModelName} · {row.competitorRomram}</span><strong>{formatPrice(row.competitorPrice, card.currency)}</strong></dd></div>
          </dl>
          <div className="aui-advantage-mobile-footer"><span>价差 <strong>{row.gap >= 0 ? '+' : ''}{formatPrice(row.gap, card.currency)}{row.gapPct != null ? ` · ${row.gapPct >= 0 ? '+' : ''}${(row.gapPct * 100).toFixed(1)}%` : ''}</strong></span><button type="button" disabled={locateBlocked} aria-label={`定位 ${row.ownModelName} 与 ${row.competitorBrand} ${row.competitorModelName} ${row.weekId}`} onClick={(event) => { locateTrigger.current = event.currentTarget; locate(row); }} style={textButtonStyle}>看板</button></div>
        </div>;
      })}</div>
      <div className="lpl-card-scroll aui-table-scroll aui-advantage-table" tabIndex={0} role="region" aria-label="价格优势明细，可横向滚动" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.caption }}><thead><tr>{['周', '渠道', '我司', '竞品', '价差', '方向', '定位'].map((column) => <th key={column} style={tableHeadStyle}>{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} data-price-advantage-row={row.id}>{[row.weekLabel, row.channel, formatPrice(row.ownPrice, card.currency), formatPrice(row.competitorPrice, card.currency), `${row.gap >= 0 ? '+' : ''}${formatPrice(row.gap, card.currency)}`, row.direction === 'advantage' ? '占优' : row.direction === 'lagging' ? '落后' : '持平'].map((cell, index) => <td key={`${row.id}-${index}`} style={{ ...tableCellStyle, color: index === 5 ? (row.direction === 'advantage' ? color.link : row.direction === 'lagging' ? color.error : color.body) : tableCellStyle.color }}>{cell}</td>)}<td style={tableCellStyle}><button type="button" disabled={locateBlocked} aria-label={`定位 ${row.ownModelName} 与 ${row.competitorBrand} ${row.competitorModelName} ${row.weekId}`} onClick={(event) => { event.stopPropagation(); locateTrigger.current = event.currentTarget; locate(row); }} style={textButtonStyle}>看板</button></td></tr>)}</tbody></table></div>
      {!rows.length && <div style={noteStyle}>当前 SKU 与筛选下没有同时具备我司和竞品价格事实。</div>}
    </CardSection>
    <CardSection label="计算与规则">{card.note}</CardSection>
    {card.boundaries?.length ? <CardSection label="判断边界">{card.boundaries.map((item) => <div key={item} style={{ ...noteStyle, marginTop: 2 }}>· {item}</div>)}</CardSection> : null}
    {/* R3（三轮返修 m3）：撤销定位 = 改回全局筛选的副作用动作，锁定消息上禁用 + 回调守卫 */}
    {locatedRowId && <div style={{ ...noteStyle, color: color.link }}>已定位到看板{locationApplied && <> · <button type="button" disabled={actionsLocked} title={actionsLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} aria-disabled={actionsLocked} onClick={() => { if (actionsLocked || !locationTransactionId) return; const undone = undoFilter(locationTransactionId); setLocateError(undone ? null : '已有更新的筛选变更，请先撤销最新变更。'); }} style={{ ...textButtonStyle, opacity: actionsLocked ? 0.5 : 1, cursor: actionsLocked ? 'not-allowed' : 'pointer' }}>撤销定位</button></>}</div>}
    <EvidenceList evidence={card.evidence} revealSignal={evidenceReveal} />
    <CardActions actions={card.actions} onEvidence={() => setEvidenceReveal((n) => n + 1)} />
  </div>;
}

export function ToolCallCardView({ card, actionOnly = false }: { card: ToolCallCard; actionOnly?: boolean }) {
  const { appliedFilterIds, filterTransactions, applyFilter, undoFilter } = useAgent();
  const actionsLocked = useContext(CardActionsLockedContext);
  const contextStale = useContext(ResultContextStaleContext);
  const applyDisabled = actionsLocked || contextStale;
  const [applyError, setApplyError] = useState<string | null>(null);
  const transactionId = card.filterCard ? filterTransactions.get(card.filterCard.id) ?? null : null;
  const applied = transactionId ? appliedFilterIds.has(transactionId) : false;
  const undoDisabled = actionsLocked || !applied;
  const label = ({ queued: '排队中', running: '运行中', success: '已完成', failed: '失败', waiting_for_approval: '等待确认', cancelled: '已取消' } as Record<string, string>)[card.status];
  const filterActions = <>
    {card.filterCard && <div style={actionRowStyle}><button type="button" disabled={applyDisabled} title={contextStale ? '当前筛选已变化，请重新生成预览' : actionsLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} aria-disabled={applyDisabled} style={{ ...textButtonStyle, opacity: applyDisabled ? 0.5 : 1, cursor: applyDisabled ? 'not-allowed' : 'pointer' }} onClick={() => { if (applyDisabled) return; const result = applyFilter(card.filterCard!); setApplyError(result.ok ? null : result.error ?? '请重新生成预览'); }}>应用筛选</button><button type="button" disabled={undoDisabled} title={actionsLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} aria-disabled={undoDisabled} onClick={() => { if (undoDisabled || !transactionId) return; const undone = undoFilter(transactionId); setApplyError(undone ? null : '已有更新的筛选变更，请先撤销最新变更。'); }} style={{ ...textButtonStyle, opacity: undoDisabled ? 0.5 : 1, cursor: undoDisabled ? 'not-allowed' : 'pointer' }}>撤销恢复</button></div>}
    {applyError && <div role="alert" style={{ ...warningStyle, color: color.error, background: color.canvasSoft2 }}>应用失败：{applyError}</div>}
  </>;
  if (actionOnly) return <div className="aui-tool-filter-result" data-agent-tool-filter={card.id}>{filterActions}<CardActions actions={card.actions} /></div>;
  return <div className="lpl-agent-result-card" style={cardStyle} data-tool-status={card.status}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.tool}</span><span style={mutedBadge}>{label}</span></div>
    <div style={{ marginTop: 7, fontSize: fontSize.caption, color: color.body }}>输入：{card.inputSummary}</div>
    {card.outputSummary && <div style={{ marginTop: 4, fontSize: fontSize.caption, color: color.body }}>输出：{card.outputSummary}</div>}
    {card.error && <div role="alert" style={{ ...warningStyle, color: color.error, background: color.canvasSoft2 }}>工具失败：{card.error}</div>}
    {filterActions}
    <details style={{ marginTop: 8, fontSize: fontSize.caption, color: color.mute }}><summary tabIndex={0} style={{ cursor: 'pointer' }}>展开明细</summary><div style={{ marginTop: 5 }}>请求工具：{card.tool} · 状态：{card.status}{card.durationMs != null ? ` · 耗时 ${card.durationMs}ms` : ''}</div></details>
    <CardActions actions={card.actions} />
  </div>;
}

function AlertCard({ card }: { card: AlertResultCard }) {
  const { context } = useAgent();
  const [evidenceReveal, setEvidenceReveal] = useState(0);
  // R7：行级展开用受控 details；动作统一收束在判断边界（与证据区块）之后，
  // 不再出现在记录行内部，保证 结论 → 事实 → 计算/规则 → 判断边界 → 动作。
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const records = card.alerts?.length ? card.alerts : [card.alert];
  const keyOf = (item: AlertResultCard['alert']): string => item.alertId ?? item.key;
  const toggleExpanded = (key: string): void => {
    setExpandedKeys((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  };
  const alertSummary = (item: AlertResultCard['alert']): string => {
    if (item.gapPct != null) return `平台价差 ${(item.gapPct * 100).toFixed(1)}%`;
    if (item.ownGapPct != null) return `档位间距 ${(item.ownGapPct * 100).toFixed(1)}%`;
    if (item.promoDeltaPp != null) return `促销变化 ${item.promoDeltaPp > 0 ? '+' : ''}${item.promoDeltaPp.toFixed(1)}pp`;
    if (item.wowPct != null) return `较前有价周 ${item.wowPct > 0 ? '+' : ''}${(item.wowPct * 100).toFixed(1)}%`;
    return '已触发规则';
  };
  return <div className="lpl-agent-result-card" style={{ ...cardStyle, borderColor: color.warning }}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={{ ...mutedBadge, color: color.warningInk, background: color.warningSoft }}>真实预警 · 可操作</span></div>
    <CardSection label="事实">
      <div style={{ display: 'grid', gap: 5, fontSize: fontSize.caption }}>{card.facts.map((fact) => <div key={fact}>• {fact}</div>)}</div>
    </CardSection>
    <CardSection label="计算与规则">
      <div style={{ fontSize: fontSize.caption, color: color.body }}>触发规则由本地预警引擎按当前阈值与折后价口径计算 · 规则版本 {card.alert.ruleVersion ?? '待确认'} · 数据 {card.alert.dataVersion ?? '待确认'}</div>
    </CardSection>
    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      {records.map((item) => <details key={keyOf(item)} data-agent-alert-id={keyOf(item)} open={expandedKeys.includes(keyOf(item))} style={{ borderTop: `1px solid ${color.hairline}`, paddingTop: 7 }}>
        <summary tabIndex={0} role="button" aria-expanded={expandedKeys.includes(keyOf(item))} onClick={(event) => { event.preventDefault(); toggleExpanded(keyOf(item)); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: fontSize.caption, color: color.ink }}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.brand} {item.modelName}</strong>
          <span style={{ color: color.body }}>{item.romram}</span>
          <span className="tnum" style={{ marginLeft: 'auto', color: color.mute }}>{item.weekId} · {alertSummary(item)}</span>
        </summary>
        <div style={{ display: 'grid', gap: 5, marginTop: 7, fontSize: fontSize.caption, color: color.body }}>
          <div>触发规则：{item.type} · 当前价 {formatPrice(item.price, context.state.currency)} · 数据 {item.dataVersion ?? '待确认'}</div>
          <div>状态：{item.lifecycle ?? 'new'} · 证据：{item.evidenceStatus === 'verified' ? '已核验' : item.evidenceStatus === 'missing' ? '缺失' : '部分覆盖'}</div>
          <EvidenceList evidence={item.evidence} />
        </div>
      </details>)}
    </div>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: fontSize.caption, color: color.body }}><strong style={{ color: color.ink }}>建议核查</strong>{card.checks.map((check) => <div key={check} style={{ marginTop: 4 }}>· {check}</div>)}</div>
    {card.boundaries?.length ? <CardSection label="判断边界">{card.boundaries.map((item) => <div key={item} style={{ ...noteStyle, marginTop: 2 }}>· {item}</div>)}</CardSection> : null}
    <EvidenceList evidence={card.evidence} revealSignal={evidenceReveal} />
    <CardActions actions={card.actions} onEvidence={() => setEvidenceReveal((n) => n + 1)} />
    {/* R7：展开行的动作统一在判断边界与证据区块之后渲染（结论→事实→计算/规则→判断边界→动作）。 */}
    {expandedKeys.map((key) => {
      const item = records.find((record) => keyOf(record) === key);
      return item ? <CardActions key={`row-actions-${key}`} actions={item.actions ?? card.actions} /> : null;
    })}
  </div>;
}

function ForecastExplanationCard({ card }: { card: ForecastExplanationResultCard }) {
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>确定性解释</span></div>
    <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: fontSize.caption, color: color.body }}>
      <div><span style={{ color: color.mute }}>范围：</span>{card.scope.country} · {card.scope.channel} · {card.scope.product}</div>
      <div><span style={{ color: color.mute }}>模型：</span>{card.scope.modelVersion} · {card.scope.currency} · 拟合窗口 {card.fitWindow} · 总体有效样本 {card.sampleCount} 周</div>
      {(card.dataStatus || card.provenanceSummary) && <div><span style={{ color: color.mute }}>数据：</span>{card.dataStatus === 'simulated' ? '模拟' : card.dataStatus === 'real' ? '真实' : card.dataStatus === 'mixed' ? '混合' : '—'}{card.provenanceSummary ? ` · ${card.provenanceSummary}` : ''}</div>}
      {(card.fitStatus || card.intervalCalibrated !== undefined) && <div><span style={{ color: color.mute }}>拟合：</span>{card.fitStatus === 'completed' ? '已完成' : card.fitStatus === 'fallback' ? '回退先验' : card.fitStatus === 'insufficient' ? '证据不足' : '—'} · {card.fitAppliedToForecast ? '已应用到预测' : '仅审计'} · 区间{card.intervalCalibrated ? '已校准' : '未校准'}</div>}
      {card.scenario?.active && <div><span style={{ color: color.mute }}>当前 What-if：</span>预测 SO {card.scenario.forecastSo.toLocaleString()} 台（相对基准 {card.scenario.soDelta >= 0 ? '+' : ''}{card.scenario.soDelta.toLocaleString()}），销毛变化 {card.scenario.marginDelta >= 0 ? '+' : ''}{card.scenario.marginDelta.toLocaleString()}</div>}
      <div className="mono" style={{ fontSize: fontSize.caption, color: color.mute }}><span>上下文 fingerprint：</span>{card.contextFingerprint}</div>
    </div>
    <div className="lpl-agent-explanation-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
      {[
        ['当前周', card.current.week],
        ['价格', formatPrice(card.current.price, card.scope.currency === 'USD' ? 'usd' : 'local')],
        ['基线需求', `${card.current.baseDemand.toLocaleString()} 台`],
        ['无约束需求', `${card.current.unconstrainedDemand.toLocaleString()} 台`],
        ['可供量', `${card.current.available.toLocaleString()} 台`],
        ['SO', `${card.current.so.toLocaleString()} 台`],
        ['期末库存', `${card.current.inventory.toLocaleString()} 台`],
        ['主要风险', card.current.risk],
      ].map(([label, value]) => <div key={label} style={{ padding: '6px 7px', background: color.canvasSoft, border: `1px solid ${color.hairline}`, borderRadius: radius.control }}><div style={{ color: color.mute, fontSize: fontSize.caption }}>{label}</div><strong className="tnum" style={{ display: 'block', marginTop: 2, fontSize: fontSize.caption, color: color.ink }}>{value}</strong></div>)}
    </div>
    <div style={{ marginTop: 11, fontSize: fontSize.caption, color: color.body }}><strong style={{ color: color.ink }}>因子与当前周贡献</strong><div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{card.factors.map((factor) => <div key={factor.key} style={{ padding: '6px 7px', borderLeft: `2px solid ${factor.status === '确定性计算' ? color.link : color.hairlineStrong}`, background: color.canvas }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{factor.label}</strong><span className="tnum" style={{ color: color.ink }}>{factor.effect}</span></div><div style={{ marginTop: 2, color: color.mute }}>{factor.status} · {factor.window} · {factor.shape}</div><div style={{ marginTop: 2, color: color.mute }}>证据：{factor.evidence} · 置信度 {factor.confidence}</div></div>)}</div></div>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: fontSize.caption, color: color.body }}><strong style={{ color: color.ink }}>关键假设</strong>{card.assumptions.map((item) => <div key={item} style={{ marginTop: 4 }}>· {item}</div>)}</div>
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: fontSize.caption, color: color.body }}><strong style={{ color: color.ink }}>判断边界与风险</strong>{card.boundaries.map((item) => <div key={item} style={{ marginTop: 4 }}>· {item}</div>)}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function ResultCard({ card }: { card: AgentResultCard }) {
  if (card.kind === 'filter') return <FilterCard card={card} />;
  if (card.kind === 'table') return <TableCard card={card} />;
  if (card.kind === 'chart') return <ChartCard card={card} />;
  if (card.kind === 'forecast_explanation') return <ForecastExplanationCard card={card} />;
  if (card.kind === 'tool_call') return <ToolCallCardView card={card} />;
  if (card.kind === 'price_advantage') return <PriceAdvantageCard card={card} />;
  if (card.kind === 'alert') return <AlertCard card={card} />;
  return null;
}

function Citations({ response }: { response: AgentResponse }) {
  if (!response.citations.length && !response.provenance) return null;
  return <details style={{ marginTop: space.sm, fontSize: fontSize.caption, color: color.mute }}>
    <summary style={{ cursor: 'pointer', color: color.body }}>依据与口径 · {response.citations.length}</summary>
    <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>{response.citations.map((citation) => <div key={citation.id} style={{ padding: '5px 7px', borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>{citation.label} · {citation.detail}</div>)}{response.provenance && <div style={{ padding: '5px 7px', borderLeft: `2px solid ${color.link}`, background: color.canvas }}>运行来源 · {response.provenance.source}{response.provenance.dataVersion ? ` · 数据 ${response.provenance.dataVersion}` : ''}{response.provenance.ruleVersion ? ` · 规则 ${response.provenance.ruleVersion}` : ''}</div>}</div>
  </details>;
}

function ProviderBadge({ response }: { response: AgentResponse }) {
  const simulated = response.provenance?.source.includes('simulated')
    || response.cards.some((card) => card.kind === 'forecast_explanation' && card.dataStatus === 'simulated');
  return <span data-provider-badge style={{ ...mutedBadge, fontSize: fontSize.caption, color: simulated ? color.warningInk : color.mute }}>
    {simulated ? '演示数据' : '价格数据分析'}{response.factGuard?.calibrated ? ' · 数值已核对' : ''}
  </span>;
}

function FallbackNotice({ reason }: { reason: string }) {
  return <details data-agent-fallback className="aui-fallback-notice" style={{ ...warningStyle, marginTop: space.sm, fontSize: fontSize.caption, lineHeight: 1.5 }}>
    <summary><strong>本地回退结果</strong> · {reason}</summary>
    <div role="note">当前仅保证本地确定性查询与规则核对；开放原因分析可能不可用，请按事实与证据核查。</div>
  </details>;
}

const cardStyle: CSSProperties = { marginTop: space.md, padding: 12, background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card, boxShadow: shadow.l1 };
const cardTitleStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink };
const mutedBadge: CSSProperties = { fontSize: fontSize.caption, fontWeight: 400, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '2px 6px', whiteSpace: 'nowrap' };
const actionRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 };
const textButtonStyle: CSSProperties = { color: color.link, cursor: 'pointer', fontSize: fontSize.caption };
const warningStyle: CSSProperties = { marginTop: 8, padding: '6px 8px', background: color.warningSoft, color: color.warningInk, fontSize: fontSize.caption, borderRadius: radius.control };
const noteStyle: CSSProperties = { marginTop: 8, color: color.mute, fontSize: fontSize.caption, lineHeight: 1.45 };
const tableHeadStyle: CSSProperties = { textAlign: 'left', color: color.mute, fontWeight: 500, padding: '4px 5px', borderBottom: `1px solid ${color.hairline}` };
const tableCellStyle: CSSProperties = { padding: '5px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap', color: color.body };
function cardsOfMessage(message: import('../../state/AgentContext').AgentMessage): AgentResultCard[] {
  const cardsById = new Map((message.partialCards ?? [])
    .filter((card) => !message.response || card.kind === 'tool_call')
    .map((card) => [card.id, card]));
  for (const card of message.response?.cards ?? []) cardsById.set(card.id, card);
  return [...cardsById.values()];
}

function toolPartsOf(cards: ToolCallCard[]): AgentToolPart[] {
  return cards.map((card) => ({
    id: card.id,
    name: card.tool,
    input: { status: card.status },
    result: card.outputSummary ?? card.error,
    status: card.status,
  }));
}

export default function AgentPanel() {
  const agent = useAgent();
  const { messages, context, running, setDraft, send } = agent;
  const { go } = usePage();
  const threadMessages = messages.map((message, index) => {
    const tools = cardsOfMessage(message).filter((card): card is ToolCallCard => card.kind === 'tool_call');
    return {
      ...message,
      toolParts: toolPartsOf(tools),
    // The stable store owns one placeholder per request. Keep its identity while
    // streaming, completing, cancelling and retrying so the transcript never jumps.
    streaming: running && message.role === 'assistant' && !message.response
      && (message.status != null
        ? !['completed', 'failed', 'cancelled', 'stale_context', 'clarification_required', 'idle'].includes(message.status)
        : index === messages.length - 1 && message.kind !== 'proactive' && Boolean(message.prompt)),
    failed: message.status === 'failed' || message.kind === 'error',
    cancelled: message.status === 'cancelled',
    };
  });
  const suggestions = messages.some((message) => message.response) ? []
    : messages.length ? AGENT_FOLLOWUP_SUGGESTIONS : agentSuggestionsForPage(context.page);

  return <AgentThread
    controller={agent}
    messages={threadMessages}
    statusLabel={AGENT_STATUS_LABELS[agent.runStatus] ?? AGENT_STATUS_LABELS.idle}
    context={<ContextChips />}
    suggestions={suggestions}
    onSuggestion={(suggestion) => void send(suggestion.prompt, undefined, undefined, suggestion.intent)}
    renderHeader={(message) => message.role === 'assistant' && <>
      {message.kind === 'proactive' && <span style={{ ...mutedBadge, color: color.warningInk }}>实时预警</span>}
      {message.response && <ProviderBadge response={message.response} />}
    </>}
    renderMessage={(message) => {
      if (message.role !== 'assistant') return null;
      // Final cards replace streamed previews with the same id. Tool activity is
      // a single disclosure, after the answer; it never repeats the transcript.
      const cards = cardsOfMessage(message);
      const locked = message.staleMismatch === true || message.actionsLocked === true || message.streaming;
      const stale = Boolean(message.contextFingerprint && message.contextFingerprint !== context.fingerprint);
      const fallbackReason = message.fallbackReason ?? message.response?.fallbackReason;
      return <>
        {fallbackReason && <FallbackNotice reason={fallbackReason} />}
        {message.response?.scopeLabel && <details className="aui-result-context"><summary><span>结果口径与来源</span><span className="aui-result-context-preview">{message.response.scopeLabel}</span></summary><div data-agent-scope role="note" style={{ marginTop: 0, fontSize: fontSize.caption, color: color.body }}>本次口径：{message.response.scopeLabel}</div></details>}
        {message.kind === 'proactive' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
          {message.alert && <span className="tnum" style={{ fontSize: fontSize.caption, color: color.mute }}>优先级 {message.alert.priority ?? '—'} · {message.alert.weekId} · {formatPrice(message.alert.price, context.state.currency)}</span>}
          <button type="button" disabled={stale || locked} onClick={() => {
            if (stale || locked) return;
            if (message.alert) navBus.alertsFocus = { alertId: message.alert.alertId, contextFingerprint: message.alert.contextFingerprint, modelId: message.alert.seriesKey?.split('__')[0] ?? '', modelName: message.alert.modelName, seriesKey: message.alert.seriesKey, type: message.alert.type as 'price-change' | 'promo' | 'platform-gap' | 'own-gap', weekId: message.alert.weekId };
            // B2：同页深链即时消费（见 target?.alertId 处注释）
            window.dispatchEvent(new Event('pricelens:alerts-focus'));
            go('alerts');
          }} style={textButtonStyle}>查看预警</button>
          <button type="button" disabled={stale || locked} onClick={() => {
            if (stale || locked) return;
            if (message.alert) navBus.dashboardFocusWeekId = message.alert.weekId;
            go('dashboard');
          }} style={textButtonStyle}>回看板</button>
          <button type="button" disabled={running} onClick={() => {
            const prompt = '解释最新预警并列出触发事实、证据关联和下一步核查动作';
            setDraft(prompt);
            void send(prompt);
          }} style={textButtonStyle}>让 Agent 解释</button>
        </div>}
        {stale && <div style={warningStyle}>基于较早筛选快照 · 当前上下文已变化，请重新确认结果口径</div>}
        {message.staleMismatch && <div style={warningStyle}>响应口径与当前上下文不一致 · 结果可查看，动作已锁定，请重新运行确认</div>}
        {!message.staleMismatch && message.actionsLocked && cards.some((card) => card.kind !== 'tool_call') && <div style={warningStyle}>部分结果 · 尚未完成核对，暂不可应用到看板</div>}
        <ResultContextStaleContext.Provider value={stale}><CardActionsLockedContext.Provider value={locked}>
          {cards.filter((card) => card.kind !== 'tool_call').map((card) => <div data-agent-result-card key={card.id}><ResultCard card={card} /></div>)}
          {cards.filter((card): card is ToolCallCard => card.kind === 'tool_call' && Boolean(card.filterCard || card.actions?.length)).map((card) => <div data-agent-result-card key={card.id}><ToolCallCardView card={card} actionOnly /></div>)}
          {message.response && <Citations response={message.response} />}
          {message.response && <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            {message.response.suggestions.map((suggestion) => {
              const label = suggestionLabel(suggestion);
              const prompt = suggestionPrompt(suggestion);
              return <button type="button" key={label} disabled={running} onClick={() => {
                setDraft(prompt);
                void send(prompt, undefined, undefined, suggestionIntent(suggestion));
              }} style={{ ...suggestionStyle, fontSize: fontSize.caption, padding: `${space.xs}px ${space.sm}px` }}>{label}</button>;
            })}
          </div>}
        </CardActionsLockedContext.Provider></ResultContextStaleContext.Provider>
      </>;
    }}
  />;
}
