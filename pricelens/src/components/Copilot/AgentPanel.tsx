import { useEffect, useRef, type CSSProperties } from 'react';
import {
  AudioOutlined,
  CheckOutlined,
  CloseOutlined,
  ExpandOutlined,
  FullscreenExitOutlined,
  LoadingOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, Input, Tooltip } from 'antd';
import { useAgent } from '../../state/AgentContext';
import type { AgentResponse, AgentResultCard, AlertResultCard, ChartResultCard, FilterResultCard, TableResultCard } from '../../agent';
import { color, font, motion, radius, shadow, space } from '../../theme/tokens';

const panelWidth = 440;

function ContextChips() {
  const { context } = useAgent();
  const { state } = context;
  const productCount = state.mains.reduce((n, card) => n + (card.main ? 1 : 0) + card.compares.length, 0);
  const chips = [`当前页 · ${context.pageLabel ?? context.page}`, `${state.countryCode} · ${state.industry === 'phone' ? '手机' : state.industry}`, productCount ? `${productCount} 个产品` : '未选产品', `${state.rangeStart}–${state.rangeEnd}`, state.currency === 'usd' ? 'USD' : '本币', state.priceTypes.rrp ? '含 RRP' : '仅折后价'];
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '9px 16px', borderBottom: `1px solid ${color.hairline}`, background: color.canvasSoft }}>{chips.map((chip) => <span key={chip} style={{ fontSize: 11, color: color.body, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '3px 8px', background: color.canvas }}>{chip}</span>)}</div>;
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

function FilterCard({ card }: { card: FilterResultCard }) {
  const { appliedFilterIds, applyFilter, canUndo, undoFilter, setDraft } = useAgent();
  const applied = appliedFilterIds.has(card.id);
  return <div style={cardStyle}>
    <div style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>只读预览</span></div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      {card.changes.map((change) => <div key={change.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto 1fr', gap: 6, alignItems: 'center', fontSize: 12 }}><span style={{ color: color.mute }}>{change.label}</span><span>{change.before}</span><span style={{ color: color.mute }}>→</span><strong>{change.after}</strong></div>)}
    </div>
    {card.warning && <div style={warningStyle}>{card.warning}</div>}
    <div style={actionRowStyle}>
      {applied ? <><span style={{ color: color.link, fontSize: 12 }}><CheckOutlined /> 已应用</span>{canUndo && <button type="button" onClick={undoFilter} style={textButtonStyle}><UndoOutlined /> 撤销</button>}</> : <><Button size="small" type="primary" onClick={() => applyFilter(card)}>应用到看板</Button><Button size="small" onClick={() => setDraft(card.prompt ?? '')}>继续修改</Button></>}
    </div>
  </div>;
}

function TableCard({ card }: { card: TableResultCard }) {
  return <div style={cardStyle}>
    <div style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>确定性结果</span></div>
    <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}><thead><tr>{card.columns.map((column) => <th key={column} style={tableHeadStyle}>{column}</th>)}</tr></thead><tbody>{card.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} style={tableCellStyle}>{cell}</td>)}</tr>)}</tbody></table></div>
    {card.note && <div style={noteStyle}>{card.note}</div>}
  </div>;
}

function ChartCard({ card }: { card: ChartResultCard }) {
  const max = Math.max(1, ...card.series.flatMap((s) => s.values.map((v) => v.value ?? 0)));
  return <div style={cardStyle}>
    <div style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>图表</span></div>
    <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
      {card.series.slice(0, 5).map((series) => <div key={series.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 116px', gap: 8, alignItems: 'center' }}><span title={series.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: color.body }}>{series.label}</span><div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 28 }}>{series.values.slice(-10).map((point, index) => <span key={`${point.bucket}-${index}`} title={`${point.bucket} · ${point.value ?? '—'}`} style={{ flex: 1, minWidth: 3, height: `${Math.max(3, ((point.value ?? 0) / max) * 24)}px`, background: series.color, opacity: point.value == null ? 0.18 : 0.72, borderRadius: '2px 2px 0 0' }} />)}</div></div>)}
    </div>
    <div style={noteStyle}>{card.note}</div>
  </div>;
}

function AlertCard({ card }: { card: AlertResultCard }) {
  return <div style={{ ...cardStyle, borderColor: color.warning }}>
    <div style={cardTitleStyle}><span>{card.title}</span><span style={{ ...mutedBadge, color: '#805b00', background: color.warningSoft }}>预警解释</span></div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8, fontSize: 12 }}>{card.facts.map((fact) => <div key={fact}>• {fact}</div>)}</div>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: 11, color: color.body }}><strong style={{ color: color.ink }}>建议核查</strong>{card.checks.map((check) => <div key={check} style={{ marginTop: 4 }}>· {check}</div>)}{card.evidence?.length ? <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', color: color.body }}>查看证据关联 · {card.evidence.length}</summary>{card.evidence.map((item) => <div key={item.label} style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${color.warning}` }}>{item.label} · {item.detail}</div>)}</details> : null}</div>
  </div>;
}

function ResultCard({ card }: { card: AgentResultCard }) {
  if (card.kind === 'filter') return <FilterCard card={card} />;
  if (card.kind === 'table') return <TableCard card={card} />;
  if (card.kind === 'chart') return <ChartCard card={card} />;
  return <AlertCard card={card} />;
}

function Citations({ response }: { response: AgentResponse }) {
  if (!response.citations.length) return null;
  return <details style={{ marginTop: 9, fontSize: 11, color: color.mute }}>
    <summary style={{ cursor: 'pointer', color: color.body }}>依据与口径 · {response.citations.length}</summary>
    <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>{response.citations.map((citation) => <div key={citation.id} style={{ padding: '5px 7px', borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>{citation.label} · {citation.detail}</div>)}</div>
  </details>;
}

const cardStyle: CSSProperties = { marginTop: 9, padding: 12, background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card, boxShadow: shadow.l1 };
const cardTitleStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: color.ink };
const mutedBadge: CSSProperties = { fontSize: 10, fontWeight: 400, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '2px 6px', whiteSpace: 'nowrap' };
const actionRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 };
const textButtonStyle: CSSProperties = { color: color.link, cursor: 'pointer', fontSize: 12 };
const warningStyle: CSSProperties = { marginTop: 8, padding: '6px 8px', background: color.warningSoft, color: '#805b00', fontSize: 11, borderRadius: 4 };
const noteStyle: CSSProperties = { marginTop: 8, color: color.mute, fontSize: 10.5, lineHeight: 1.45 };
const tableHeadStyle: CSSProperties = { textAlign: 'left', color: color.mute, fontWeight: 500, padding: '4px 5px', borderBottom: `1px solid ${color.hairline}` };
const tableCellStyle: CSSProperties = { padding: '5px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap', color: color.body };

export default function AgentPanel() {
  const { open, mode, running, voiceListening, voiceAvailable, messages, draft, context, setDraft, closeAgent, setMode, send, stop, newConversation, startVoice, markRead } = useAgent();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (open && !running) markRead(); }, [markRead, open, running, messages.length]);
  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceToBottom < 96) node.scrollTop = node.scrollHeight;
  }, [messages, running]);
  if (!open) return null;
  const full = mode === 'full';
  const pageSuggestions: Record<string, string[]> = { alerts: ['解释最新预警并列出核查证据', '只看最近 8 周的预警', '把最新预警定位到看板'], intelligence: ['总结当前市场情报', '哪些事件最可能影响价格？', '解释汇率对当前价格的影响'], forecast: ['解释量价预测的关键假设', '如果价格下调 5% 会怎样？', '查看预测的不确定性'], volume: ['比较当前产品的销量趋势', '只看最近 8 周', '解释量价变化'] };
  const suggestions = messages.length ? ['只看最近 8 周', '与主竞品比较', '打开依据'] : (pageSuggestions[context.page] ?? ['最近有价周哪个平台最便宜？', '解释当前产品的最新预警', '只看最近 8 周并显示 RRP']);
  return <aside className="lpl-agent-panel" data-agent-mode={mode} role="dialog" aria-modal="true" aria-labelledby="pricelens-agent-title" aria-label="PriceLens Agent" style={{ position: 'fixed', zIndex: 100, top: full ? 0 : 64, right: 0, bottom: 0, width: full ? '100vw' : `min(${panelWidth}px, 100vw)`, maxWidth: '100vw', display: 'flex', flexDirection: 'column', background: color.canvas, boxShadow: full ? 'none' : '-8px 0 24px rgba(0,0,0,.08)', borderLeft: `1px solid ${color.hairline}`, transition: `width ${motion.base}ms ${motion.enter}, top ${motion.base}ms ${motion.enter}` }}>
    <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: `1px solid ${color.hairline}` }}>
      <div><div id="pricelens-agent-title" style={{ fontWeight: 600, fontSize: 14 }}>PriceLens Agent</div><div role="status" aria-live="polite" style={{ fontSize: 10.5, color: running ? color.link : color.mute }}>{running ? '正在查询价格数据…' : '只读分析 · 结果可追溯'}</div></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Tooltip title="新对话"><button type="button" aria-label="新对话" onClick={newConversation} style={iconButtonStyle}><PlusOutlined /></button></Tooltip><Tooltip title={full ? '退出全屏' : '全屏'}><button type="button" aria-label={full ? '退出全屏' : '全屏'} onClick={() => setMode(full ? 'dock' : 'full')} style={iconButtonStyle}>{full ? <FullscreenExitOutlined /> : <ExpandOutlined />}</button></Tooltip><Tooltip title={running ? '关闭面板（后台继续运行）' : '关闭'}><button type="button" aria-label={running ? '关闭 Agent，后台继续运行' : '关闭 Agent'} onClick={closeAgent} style={iconButtonStyle}><CloseOutlined /></button></Tooltip></div>
    </header>
    <ContextChips />
    <div ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text" aria-busy={running} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 20px', background: color.canvasSoft }}>
      {!messages.length && <div style={{ padding: '18px 4px 10px' }}><div style={{ fontSize: 20, fontWeight: 600, color: color.ink }}>问 PriceLens</div><p style={{ margin: '6px 0 16px', color: color.body, fontSize: 13 }}>在当前页面里查询价格、比较平台，或者解释预警。Agent 会先展示口径和证据，再给出结果。</p></div>}
      {messages.map((message) => <div key={message.id} style={{ marginBottom: 16 }}><div style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>{message.kind === 'proactive' && <span style={{ alignSelf: 'flex-start', margin: '3px 6px 0 0', padding: '2px 6px', borderRadius: radius.pill, background: color.warningSoft, color: '#805b00', fontSize: 10 }}>实时预警</span>}<div style={{ maxWidth: '92%', padding: message.role === 'user' ? '8px 11px' : '0', background: message.role === 'user' ? color.ink : 'transparent', color: message.role === 'user' ? color.onPrimary : color.ink, borderRadius: message.role === 'user' ? '12px 12px 3px 12px' : 0, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{message.text}</div></div>{message.kind === 'proactive' && <button type="button" onClick={() => { const prompt = '解释最新预警并列出触发事实、证据关联和下一步核查动作'; setDraft(prompt); void send(prompt); }} style={{ ...textButtonStyle, marginTop: 6 }}>查看预警</button>}{message.kind === 'error' && message.prompt && <button type="button" onClick={() => void send(message.prompt)} style={{ ...textButtonStyle, marginTop: 6 }}>重试</button>}{message.contextFingerprint && message.contextFingerprint !== context.fingerprint && <div style={{ marginTop: 4, fontSize: 10.5, color: color.mute }}>基于较早的筛选快照 · 当前筛选已变化</div>}{message.response && <><StepTimeline response={message.response} />{message.response.cards.map((card) => <ResultCard key={card.id} card={card} />)}<Citations response={message.response} /><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>{message.response.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setDraft(suggestion); void send(suggestion); }} style={{ fontSize: 11, color: color.link, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, padding: '4px 8px', cursor: 'pointer' }}>{suggestion}</button>)}</div></>}</div>)}
      {running && <div style={{ color: color.mute, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><LoadingOutlined spin /> 生成结果中…</div>}
    </div>
    {!messages.length && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 10px', background: color.canvasSoft }}>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void send(suggestion)} style={{ fontSize: 11, color: color.link, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, padding: '5px 8px', cursor: 'pointer' }}>{suggestion}</button>)}</div>}
    <div style={{ flexShrink: 0, padding: '10px 12px 12px', borderTop: `1px solid ${color.hairline}`, background: color.canvas }}><div style={{ display: 'flex', alignItems: 'end', gap: 7 }}><Input.TextArea ref={inputRef} aria-label="向 PriceLens Agent 提问" autoSize={{ minRows: 1, maxRows: 5 }} value={draft} placeholder="问价格、平台或预警…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /> <Tooltip title={voiceAvailable ? '语音输入' : '浏览器不支持语音输入'}><button type="button" aria-label="语音输入" disabled={!voiceAvailable || voiceListening || running} onClick={() => void startVoice()} style={{ ...iconButtonStyle, width: 32, height: 32, color: voiceListening ? color.link : color.body, opacity: voiceAvailable ? 1 : 0.45 }}>{voiceListening ? <LoadingOutlined spin /> : <AudioOutlined />}</button></Tooltip>{running ? <Button aria-label="停止运行" icon={<StopOutlined />} onClick={stop} /> : <Button type="primary" aria-label="发送" icon={<SendOutlined />} onClick={() => void send()} disabled={!draft.trim()} />}</div><div style={{ marginTop: 5, fontSize: 10, color: color.mute }}>Enter 发送 · Shift+Enter 换行 · ⌘/Ctrl+K 打开</div></div>
  </aside>;
}

const iconButtonStyle: CSSProperties = { width: 28, height: 28, display: 'inline-grid', placeItems: 'center', border: `1px solid ${color.hairline}`, borderRadius: 5, background: color.canvas, color: color.body, cursor: 'pointer' };
