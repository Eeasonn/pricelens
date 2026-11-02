import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  AudioOutlined,
  CheckOutlined,
  CloseOutlined,
  CompressOutlined,
  ExpandOutlined,
  FullscreenExitOutlined,
  LoadingOutlined,
  PlusOutlined,
  RedoOutlined,
  SendOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, Input, Tooltip } from 'antd';
import { useAgent } from '../../state/AgentContext';
import { INDUSTRY_LABELS } from '../../dataModel/scope';
import { usePage } from '../../state/PageContext';
import { navBus } from '../../state/navBus';
import type { AgentCardAction, AgentEvidence, AgentResponse, AgentResultCard, AgentRun, AlertResultCard, ChartResultCard, FilterResultCard, ForecastExplanationResultCard, TableResultCard } from '../../agent';
import { color, formatPrice, motion, radius, selectSoft, selectSoftInk, shadow } from '../../theme/tokens';

const panelWidth = 440;

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
  const chips = [`当前页 · ${context.pageLabel ?? context.page}`, `${state.countryCode} · ${INDUSTRY_LABELS[state.industry] ?? state.industry}`, productCount ? `${productCount} 个产品` : '未选产品', `${formatBucket(state.rangeStart)}–${formatBucket(state.rangeEnd)}`, state.currency === 'usd' ? 'USD' : '本币', state.priceTypes.rrp ? '含 RRP' : '仅折后价'];
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '9px 16px', borderBottom: `1px solid ${color.hairline}`, background: color.canvasSoft }}>{chips.map((chip, index) => <span key={chip} style={{ fontSize: 11, color: index === 0 ? selectSoftInk : color.body, border: `1px solid ${index === 0 ? selectSoftInk : color.hairline}`, borderRadius: radius.pill, padding: '3px 8px', background: index === 0 ? selectSoft : color.canvas }}>{chip}</span>)}{contextStale && <span role="status" style={{ fontSize: 11, color: color.warningInk, border: `1px solid ${color.warning}`, borderRadius: radius.pill, padding: '3px 8px', background: color.warningSoft }}>上下文已更新 · 旧结果需重新确认</span>}</div>;
}

function EvidenceList({ evidence }: { evidence?: AgentEvidence[] }) {
  if (!evidence?.length) return null;
  return <details style={{ marginTop: 9, fontSize: 11, color: color.mute }}><summary style={{ cursor: 'pointer', color: color.body }}>证据与来源 · {evidence.length}</summary><div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{evidence.map((item, index) => <div key={`${item.id ?? item.label}-${index}`} style={{ padding: '6px 8px', borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer" style={{ color: color.link }}>{item.label}</a> : <strong style={{ color: color.ink }}>{item.label}</strong>}<div>{item.detail}</div>{item.source && <div style={{ marginTop: 2, fontSize: 10, color: color.mute }}>来源：{item.source}{item.timestamp ? ` · ${item.timestamp}` : ''}</div>}</div>)}</div></details>;
}

function CardActions({ actions }: { actions?: AgentCardAction[] }) {
  const { setDraft, send, context } = useAgent();
  const { go } = usePage();
  if (!actions?.length) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>{actions.map((action) => {
    const stale = Boolean(action.target?.contextFingerprint && action.target.contextFingerprint !== context.fingerprint);
    const disabled = Boolean(action.disabled || stale);
    return <button type="button" key={action.id} disabled={disabled} title={stale ? '当前筛选已变化，请重新运行 Agent' : undefined} aria-label={stale ? `${action.label}（当前口径已变化）` : action.label} onClick={() => {
      if (disabled) return;
      if (action.kind === 'copy' && action.prompt) void navigator.clipboard?.writeText(action.prompt);
      else if (action.prompt) {
        setDraft(action.prompt);
        if (action.kind === 'followup') void send(action.prompt, action.target?.forecastDraft, { forecastSnapshot: action.target?.forecastSnapshot, forecastDataset: action.target?.forecastDataset });
        if (action.kind === 'open') {
          const targetPage = action.target?.page;
          if (targetPage === 'alerts' || targetPage === 'forecast' || targetPage === 'dashboard' || targetPage === 'volume' || targetPage === 'overview' || targetPage === 'pricing' || targetPage === 'intelligence' || targetPage === 'config') go(targetPage);
          else if (/预警/.test(action.prompt)) go('alerts');
          else if (/预测/.test(action.prompt)) go('forecast');
          else go('dashboard');
        }
      }
    }} style={{ ...textButtonStyle, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '4px 8px', background: color.canvas, opacity: disabled ? 0.5 : 1 }}>{stale ? `${action.label} · 需刷新` : action.label}</button>;
  })}</div>;
}

function StepTimeline({ response }: { response: AgentResponse }) {
  if (!response) return null;
  return <details style={{ margin: '7px 0 10px', color: color.mute, fontSize: 11 }}>
    <summary style={{ cursor: 'pointer', color: color.body }}>执行步骤 · {response.steps.filter((s) => s.status === 'success').length}/{response.steps.length} 完成</summary>
    <div style={{ display: 'grid', gap: 5, marginTop: 7, paddingLeft: 4 }}>
      {response.steps.map((s) => <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: s.status === 'failed' ? color.error : s.status === 'warning' ? color.warning : color.link }}>{s.status === 'success' ? '✓' : s.status === 'warning' ? '!' : '×'}</span><span>{s.label}</span><span style={{ color: color.mute }}>· {s.detail}</span></div>)}
    </div>
  </details>;
}

/** Structured run events are deliberately summarized; hidden model reasoning is never rendered. */
function RunTimeline({ run }: { run: AgentRun | null }) {
  if (!run?.events.length) return null;
  return <details open={run.status !== 'completed'} style={{ margin: '7px 0 10px', color: color.mute, fontSize: 11 }}>
    <summary style={{ cursor: 'pointer', color: color.body }}>运行活动 · {run.events.length} 条</summary>
    <div style={{ display: 'grid', gap: 5, marginTop: 7, paddingLeft: 4 }}>
      {run.events.slice(-8).map((event) => <div key={event.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ color: event.status === 'failed' ? color.error : event.status === 'completed' ? color.link : color.mute }}>•</span>
        <span>{event.message ?? event.type}</span>
        {event.tool && <span style={{ color: color.mute }}>· {event.tool}</span>}
      </div>)}
    </div>
  </details>;
}

function FilterCard({ card }: { card: FilterResultCard }) {
  const { appliedFilterIds, applyFilter, canUndo, undoFilter, canRedo, redoFilter, setDraft } = useAgent();
  const applied = appliedFilterIds.has(card.id);
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>只读预览</span></div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      {card.changes.map((change) => <div className="lpl-agent-filter-change" key={change.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto 1fr', gap: 6, alignItems: 'center', fontSize: 12 }}><span style={{ color: color.mute }}>{change.label}</span><span>{change.before}</span><span style={{ color: color.mute }}>→</span><strong>{change.after}</strong></div>)}
    </div>
    {card.warning && <div style={warningStyle}>{card.warning}</div>}
    <div style={actionRowStyle}>
      {applied ? <><span style={{ color: color.link, fontSize: 12 }}><CheckOutlined /> 已应用</span>{canUndo && <button type="button" onClick={undoFilter} style={textButtonStyle}><UndoOutlined /> 撤销</button>}{canRedo && <button type="button" onClick={redoFilter} style={textButtonStyle}><RedoOutlined /> 重做</button>}</> : <><Button size="small" type="primary" onClick={() => applyFilter(card)}>应用到看板</Button><Button size="small" onClick={() => setDraft(card.prompt ?? '')}>继续修改</Button></>}
    </div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function TableCard({ card }: { card: TableResultCard }) {
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>确定性结果</span></div>
    <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}><thead><tr>{card.columns.map((column) => <th key={column} style={tableHeadStyle}>{column}</th>)}</tr></thead><tbody>{card.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} style={tableCellStyle}>{cell}</td>)}</tr>)}</tbody></table></div>
    {card.note && <div style={noteStyle}>{card.note}</div>}
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function ChartCard({ card }: { card: ChartResultCard }) {
  const max = Math.max(1, ...card.series.flatMap((s) => s.values.map((v) => v.value ?? 0)));
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>图表</span></div>
    <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
      {card.series.slice(0, 5).map((series) => <div key={series.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 116px', gap: 8, alignItems: 'center' }}><span title={series.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: color.body }}>{series.label}</span><div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 28 }}>{series.values.slice(-10).map((point, index) => <span key={`${point.bucket}-${index}`} title={`${point.bucket} · ${point.value ?? '—'}`} style={{ flex: 1, minWidth: 3, height: `${Math.max(3, ((point.value ?? 0) / max) * 24)}px`, background: series.color, opacity: point.value == null ? 0.18 : 0.72, borderRadius: '2px 2px 0 0' }} />)}</div></div>)}
    </div>
    <div style={noteStyle}>{card.note}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function AlertCard({ card }: { card: AlertResultCard }) {
  return <div className="lpl-agent-result-card" style={{ ...cardStyle, borderColor: color.warning }}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={{ ...mutedBadge, color: color.warningInk, background: color.warningSoft }}>预警解释</span></div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8, fontSize: 12 }}>{card.facts.map((fact) => <div key={fact}>• {fact}</div>)}</div>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: 11, color: color.body }}><strong style={{ color: color.ink }}>建议核查</strong>{card.checks.map((check) => <div key={check} style={{ marginTop: 4 }}>· {check}</div>)}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function ForecastExplanationCard({ card }: { card: ForecastExplanationResultCard }) {
  return <div className="lpl-agent-result-card" style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>确定性解释</span></div>
    <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 11, color: color.body }}>
      <div><span style={{ color: color.mute }}>范围：</span>{card.scope.country} · {card.scope.channel} · {card.scope.product}</div>
      <div><span style={{ color: color.mute }}>模型：</span>{card.scope.modelVersion} · {card.scope.currency} · 拟合窗口 {card.fitWindow} · 总体有效样本 {card.sampleCount} 周</div>
      {(card.dataStatus || card.provenanceSummary) && <div><span style={{ color: color.mute }}>数据：</span>{card.dataStatus === 'simulated' ? '模拟' : card.dataStatus === 'real' ? '真实' : card.dataStatus === 'mixed' ? '混合' : '—'}{card.provenanceSummary ? ` · ${card.provenanceSummary}` : ''}</div>}
      {(card.fitStatus || card.intervalCalibrated !== undefined) && <div><span style={{ color: color.mute }}>拟合：</span>{card.fitStatus === 'completed' ? '已完成' : card.fitStatus === 'fallback' ? '回退先验' : card.fitStatus === 'insufficient' ? '证据不足' : '—'} · {card.fitAppliedToForecast ? '已应用到预测' : '仅审计'} · 区间{card.intervalCalibrated ? '已校准' : '未校准'}</div>}
      {card.scenario?.active && <div><span style={{ color: color.mute }}>当前 What-if：</span>预测 SO {card.scenario.forecastSo.toLocaleString()} 台（相对基准 {card.scenario.soDelta >= 0 ? '+' : ''}{card.scenario.soDelta.toLocaleString()}），销毛变化 {card.scenario.marginDelta >= 0 ? '+' : ''}{card.scenario.marginDelta.toLocaleString()}</div>}
      <div className="mono" style={{ fontSize: 10, color: color.mute }}><span>上下文 fingerprint：</span>{card.contextFingerprint}</div>
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
      ].map(([label, value]) => <div key={label} style={{ padding: '6px 7px', background: color.canvasSoft, border: `1px solid ${color.hairline}`, borderRadius: radius.control }}><div style={{ color: color.mute, fontSize: 10 }}>{label}</div><strong className="tnum" style={{ display: 'block', marginTop: 2, fontSize: 12, color: color.ink }}>{value}</strong></div>)}
    </div>
    <div style={{ marginTop: 11, fontSize: 11, color: color.body }}><strong style={{ color: color.ink }}>因子与当前周贡献</strong><div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{card.factors.map((factor) => <div key={factor.key} style={{ padding: '6px 7px', borderLeft: `2px solid ${factor.status === '确定性计算' ? color.link : color.hairlineStrong}`, background: color.canvas }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{factor.label}</strong><span className="tnum" style={{ color: color.ink }}>{factor.effect}</span></div><div style={{ marginTop: 2, color: color.mute }}>{factor.status} · {factor.window} · {factor.shape}</div><div style={{ marginTop: 2, color: color.mute }}>证据：{factor.evidence} · 置信度 {factor.confidence}</div></div>)}</div></div>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: 11, color: color.body }}><strong style={{ color: color.ink }}>关键假设</strong>{card.assumptions.map((item) => <div key={item} style={{ marginTop: 4 }}>· {item}</div>)}</div>
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: 11, color: color.body }}><strong style={{ color: color.ink }}>判断边界与风险</strong>{card.boundaries.map((item) => <div key={item} style={{ marginTop: 4 }}>· {item}</div>)}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} />
  </div>;
}

function ResultCard({ card }: { card: AgentResultCard }) {
  if (card.kind === 'filter') return <FilterCard card={card} />;
  if (card.kind === 'table') return <TableCard card={card} />;
  if (card.kind === 'chart') return <ChartCard card={card} />;
  if (card.kind === 'forecast_explanation') return <ForecastExplanationCard card={card} />;
  return <AlertCard card={card} />;
}

function Citations({ response }: { response: AgentResponse }) {
  if (!response.citations.length && !response.provenance) return null;
  return <details style={{ marginTop: 9, fontSize: 11, color: color.mute }}>
    <summary style={{ cursor: 'pointer', color: color.body }}>依据与口径 · {response.citations.length}</summary>
    <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>{response.citations.map((citation) => <div key={citation.id} style={{ padding: '5px 7px', borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>{citation.label} · {citation.detail}</div>)}{response.provenance && <div style={{ padding: '5px 7px', borderLeft: `2px solid ${color.link}`, background: color.canvas }}>运行来源 · {response.provenance.source}{response.provenance.dataVersion ? ` · 数据 ${response.provenance.dataVersion}` : ''}{response.provenance.ruleVersion ? ` · 规则 ${response.provenance.ruleVersion}` : ''}</div>}</div>
  </details>;
}

const cardStyle: CSSProperties = { marginTop: 9, padding: 12, background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card, boxShadow: shadow.l1 };
const cardTitleStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: color.ink };
const mutedBadge: CSSProperties = { fontSize: 10, fontWeight: 400, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '2px 6px', whiteSpace: 'nowrap' };
const actionRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 };
const textButtonStyle: CSSProperties = { color: color.link, cursor: 'pointer', fontSize: 12 };
const warningStyle: CSSProperties = { marginTop: 8, padding: '6px 8px', background: color.warningSoft, color: color.warningInk, fontSize: 11, borderRadius: 4 };
const noteStyle: CSSProperties = { marginTop: 8, color: color.mute, fontSize: 10.5, lineHeight: 1.45 };
const tableHeadStyle: CSSProperties = { textAlign: 'left', color: color.mute, fontWeight: 500, padding: '4px 5px', borderBottom: `1px solid ${color.hairline}` };
const tableCellStyle: CSSProperties = { padding: '5px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap', color: color.body };
  const messageKindLabel: Record<string, string> = { proactive: '实时预警', clarification: '需要澄清', system: '系统状态', scenario: '情景分析', error: '运行异常', conversation: '结论' };

export default function AgentPanel() {
  const { open, mode, running, runStatus, activeRun, voiceListening, voiceAvailable, messages, draft, context, setDraft, closeAgent, setMode, send, stop, newConversation, startVoice, markRead } = useAgent();
  const { go } = usePage();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const modeTransitionTimerRef = useRef<number | null>(null);
  const [modeTransitionMs, setModeTransitionMs] = useState<number>(motion.base);
  const [compactViewport, setCompactViewport] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023.98px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 1023.98px)');
    const onChange = (): void => setCompactViewport(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  const compactModal = compactViewport || mode !== 'dock';
  useEffect(() => {
    if (open && !wasOpenRef.current) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!open && wasOpenRef.current) { openerRef.current?.focus(); openerRef.current = null; }
    wasOpenRef.current = open;
  }, [open]);
  useEffect(() => {
    if (!open || !compactModal) return undefined;
    const node = panelRef.current;
    if (!node) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = [...node.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((item) => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden');
      if (!focusable.length) { event.preventDefault(); node.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [compactModal, open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeAgent();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeAgent, open]);
  useEffect(() => { if (open && !running) markRead(); }, [markRead, open, running, messages.length]);
  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => () => {
    if (modeTransitionTimerRef.current !== null) window.clearTimeout(modeTransitionTimerRef.current);
  }, []);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceToBottom < 96) node.scrollTop = node.scrollHeight;
  }, [messages, running]);
  if (!open) return null;
  const full = mode === 'full';
  const drawer = mode === 'drawer';
  const statusLabel: Record<string, string> = { idle: '只读分析 · 结果可追溯', queued: '已排队 · 即将开始', running: '正在运行…', waiting_input: '等待补充信息…', parsing: '正在理解请求…', planning: '正在规划执行步骤…', tool_running: '正在读取价格数据…', waiting_for_approval: '等待确认后继续…', partial_result: '已生成部分结果…', completed: '运行完成 · 结果可追溯', stale_context: '筛选已变化 · 结果需重新确认', failed: '运行失败 · 可重试', cancelled: '已取消本次运行', clarification_required: '需要补充一个口径' };
  const nextMode = full ? 'dock' : drawer ? 'full' : 'drawer';
  const modeLabel = full ? '退出全屏' : drawer ? '全屏' : '展开抽屉';
  const changeMode = (next: 'dock' | 'drawer' | 'full') => {
    const duration = full || next === 'full' ? motion.agentFull : motion.base;
    setModeTransitionMs(duration);
    if (modeTransitionTimerRef.current !== null) window.clearTimeout(modeTransitionTimerRef.current);
    modeTransitionTimerRef.current = window.setTimeout(() => setModeTransitionMs(motion.base), duration);
    setMode(next);
  };
  const pageSuggestions: Record<string, string[]> = { alerts: ['解释最新预警并列出核查证据', '只看最近 8 周的预警', '把最新预警定位到看板'], intelligence: ['总结当前市场情报', '哪些事件最可能影响价格？', '解释汇率对当前价格的影响'], forecast: ['解释量价预测的关键假设', '如果价格下调 5% 会怎样？', '查看预测的不确定性'], volume: ['比较当前产品的销量趋势', '只看最近 8 周', '解释量价变化'] };
  const suggestions = messages.length ? ['只看最近 8 周', '与主竞品比较', '打开依据'] : (pageSuggestions[context.page] ?? ['最近有价周哪个平台最便宜？', '解释当前产品的最新预警', '只看最近 8 周并显示 RRP']);
  return <aside id="pricelens-agent-panel" ref={panelRef} className="lpl-agent-panel" data-agent-mode={mode} role="dialog" aria-modal={compactModal ? 'true' : undefined} aria-labelledby="pricelens-agent-title" tabIndex={-1} style={{ position: 'fixed', zIndex: 100, top: full || compactViewport ? 0 : 64, right: 0, bottom: 0, width: full ? '100vw' : drawer ? 'min(640px, 100vw)' : `min(${panelWidth}px, 100vw)`, maxWidth: '100vw', display: 'flex', flexDirection: 'column', background: color.canvas, boxShadow: full ? 'none' : shadow.l2, borderLeft: `1px solid ${color.hairline}`, borderTop: `2px solid ${color.link}`, transition: `width ${modeTransitionMs}ms ${motion.enter}, top ${modeTransitionMs}ms ${motion.enter}` }}>
    <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: `1px solid ${color.hairline}`, boxShadow: shadow.l1 }}>
      <div><div id="pricelens-agent-title" style={{ fontWeight: 600, fontSize: 14 }}>PriceLens Agent</div><div role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 10.5, color: running ? color.link : runStatus === 'stale_context' ? color.warningInk : color.mute }}>{statusLabel[runStatus] ?? statusLabel.idle}</div></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Tooltip title="新对话"><button type="button" aria-label="新对话" onClick={newConversation} style={iconButtonStyle}><PlusOutlined /></button></Tooltip><Tooltip title={modeLabel}><button type="button" aria-label={modeLabel} onClick={() => changeMode(nextMode)} style={iconButtonStyle}>{full ? <FullscreenExitOutlined /> : drawer ? <ExpandOutlined /> : <CompressOutlined />}</button></Tooltip><Tooltip title={running ? '关闭面板（后台继续运行）' : '关闭'}><button type="button" aria-label={running ? '关闭 Agent，后台继续运行' : '关闭 Agent'} onClick={closeAgent} style={iconButtonStyle}><CloseOutlined /></button></Tooltip></div>
    </header>
    <ContextChips />
    <div ref={scrollRef} role="log" aria-live="off" aria-relevant="additions text" aria-busy={running} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 20px', background: color.canvasSoft }}>
      {!messages.length && <div style={{ padding: '18px 4px 10px' }}><div style={{ fontSize: 20, fontWeight: 600, color: color.ink }}>问 PriceLens</div><p style={{ margin: '6px 0 16px', color: color.body, fontSize: 13 }}>在当前页面里查询价格、比较平台，或者解释预警。Agent 会先展示口径和证据，再给出结果。</p></div>}
      {messages.map((message) => <div key={message.id} style={{ marginBottom: 16, paddingLeft: message.role === 'assistant' ? 10 : 0, borderLeft: message.role === 'assistant' ? `2px solid ${color.link}` : 'none' }}><div style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>{message.role === 'assistant' && <span style={{ alignSelf: 'flex-start', margin: '3px 6px 0 0', padding: '2px 6px', borderRadius: radius.pill, background: message.kind === 'proactive' ? color.warningSoft : color.canvas, color: message.kind === 'proactive' ? color.warningInk : color.link, fontSize: 10, whiteSpace: 'nowrap' }}>PriceLens · {messageKindLabel[message.kind ?? 'conversation']}</span>}<div style={{ maxWidth: '92%', padding: message.role === 'user' ? '8px 11px' : '0', background: message.role === 'user' ? color.ink : 'transparent', color: message.role === 'user' ? color.onPrimary : color.ink, borderRadius: message.role === 'user' ? '12px 12px 3px 12px' : 0, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{message.text}</div></div>{message.kind === 'proactive' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{message.alert && <span className="tnum" style={{ fontSize: 11, color: color.mute }}>优先级 {message.alert.priority ?? '—'} · {message.alert.weekId} · {formatPrice(message.alert.price, context.state.currency)}</span>}<button type="button" onClick={() => { if (message.alert) navBus.alertsFocus = { alertId: message.alert.alertId, contextFingerprint: message.alert.contextFingerprint, modelId: message.alert.seriesKey?.split('__')[0] ?? '', modelName: message.alert.modelName, seriesKey: message.alert.seriesKey, type: message.alert.type as 'price-change' | 'promo' | 'platform-gap' | 'own-gap', weekId: message.alert.weekId }; go('alerts'); }} style={textButtonStyle}>查看预警</button><button type="button" onClick={() => { if (message.alert) navBus.dashboardFocusWeekId = message.alert.weekId; go('dashboard'); }} style={textButtonStyle}>回看板</button><button type="button" onClick={() => { const prompt = '解释最新预警并列出触发事实、证据关联和下一步核查动作'; setDraft(prompt); void send(prompt); }} style={textButtonStyle}>让 Agent 解释</button></div>}{message.kind === 'error' && message.prompt && <button type="button" onClick={() => void send(message.prompt)} style={{ ...textButtonStyle, marginTop: 6 }}>重试</button>}{message.contextFingerprint && message.contextFingerprint !== context.fingerprint && <div role="status" style={{ marginTop: 4, fontSize: 10.5, color: color.warningInk }}>基于较早筛选快照 · 当前上下文已变化，请重新确认结果口径</div>}{message.response && <><StepTimeline response={message.response} />{message.response.cards.map((card) => <ResultCard key={card.id} card={card} />)}<Citations response={message.response} /><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>{message.response.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setDraft(suggestion); void send(suggestion); }} style={{ fontSize: 11, color: color.link, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, padding: '4px 8px', cursor: 'pointer' }}>{suggestion}</button>)}</div></>}</div>)}
      {running && <div role="status" aria-live="polite" aria-atomic="true" style={{ color: color.mute, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><LoadingOutlined spin /> {statusLabel[runStatus] ?? '生成结果中…'}</div>}
      <RunTimeline run={activeRun} />
    </div>
    {!messages.length && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 10px', background: color.canvasSoft }}>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void send(suggestion)} style={{ fontSize: 11, color: color.link, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, padding: '5px 8px', cursor: 'pointer' }}>{suggestion}</button>)}</div>}
    <div style={{ flexShrink: 0, padding: '10px 12px 12px', borderTop: `1px solid ${color.hairline}`, background: color.canvas }}><div style={{ display: 'flex', alignItems: 'end', gap: 7 }}><Input.TextArea ref={inputRef} aria-label="向 PriceLens Agent 提问" autoSize={{ minRows: 1, maxRows: 5 }} value={draft} placeholder="问价格、平台或预警…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /> <Tooltip title={voiceAvailable ? '语音输入' : '浏览器不支持语音输入'}><button type="button" aria-label="语音输入" disabled={!voiceAvailable || voiceListening || running} onClick={() => void startVoice()} style={{ ...iconButtonStyle, width: 32, height: 32, color: voiceListening ? color.link : color.body, opacity: voiceAvailable ? 1 : 0.45 }}>{voiceListening ? <LoadingOutlined spin /> : <AudioOutlined />}</button></Tooltip>{running ? <Button aria-label="停止运行" icon={<StopOutlined />} onClick={stop} /> : <Button type="primary" aria-label="发送" icon={<SendOutlined />} onClick={() => void send()} disabled={!draft.trim()} />}</div><div style={{ marginTop: 5, fontSize: 10, color: color.mute }}>Enter 发送 · Shift+Enter 换行 · ⌘/Ctrl+K 打开</div></div>
  </aside>;
}

const iconButtonStyle: CSSProperties = { width: 28, height: 28, display: 'inline-grid', placeItems: 'center', border: `1px solid ${color.hairline}`, borderRadius: 5, background: color.canvas, color: color.body, cursor: 'pointer' };
