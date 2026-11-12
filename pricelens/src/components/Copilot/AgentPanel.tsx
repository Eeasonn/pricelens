// Channel-specific business cards; conversation behavior lives in Assistant/AgentThread.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { CheckOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { AgentThread } from '../Assistant/AgentThread';
import { useAgent, type AgentMessage } from '../../state/AgentContext';
import { buildCards } from '../../state/mainSelection';
import { dimProduct } from '../../data';
import { INDUSTRY_LABELS } from '../../dataModel/scope';
import { platformSelectionForCountry } from '../../dataModel/aggregate';
import { usePage } from '../../state/PageContext';
import { navBus } from '../../state/navBus';
import type { AgentCardAction, AgentEvidence, AgentIntent, AgentResponse, AgentResultCard, AgentRunStatus, AgentStep, AlertListResultCard, AlertResultCard, ChartResultCard, FilterResultCard, ForecastExplanationResultCard, PriceAdvantageResultCard, PriceAdvantageRow, TableResultCard, AgentSuggestionAction } from '../../agent';
import { advantageScopePatch, classifyIntent, recentRangePatch } from '../../agent';
import { AGENT_FOLLOWUP_ACTIONS, AGENT_STATUS_LABELS, agentSuggestionsForPage } from './agentCopy';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { modelNameOf } from '../ProductCascader/tree';
import { APP_CHANNEL } from '../../appChannel';

/** 工作台捷径药丸只在迭代渠道渲染：stable 渠道 intelligence/forecast 不可达
 *  （go() 会落回 dashboard），渲染出来就是假捷径。 */
const ITERATE = APP_CHANNEL === 'iterate';

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
  // Default scope is readable; the technical SKU identifier stays in the tooltip.
  const skuLabel = skuChip ? `口径 · ${modelNameOf(skuChip.modelId)} · ${skuChip.romram}` : '未选产品';
  const chips = [`当前页 · ${context.pageLabel ?? context.page}`, `${state.countryCode} · ${INDUSTRY_LABELS[state.industry] ?? state.industry}`, productCount ? `${productCount} 个产品` : '未选产品', ...(skuChip ? [skuLabel] : []), `${formatBucket(state.rangeStart)}–${formatBucket(state.rangeEnd)}`, state.currency === 'usd' ? 'USD' : '本币', state.priceTypes.rrp ? '含 RRP' : '仅折后价'];
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: `${space.sm}px ${space.base}px`, borderBottom: `1px solid ${color.hairline}`, background: color.canvasSoft }}>{chips.map((chip, index) => <span key={chip} title={chip === skuLabel ? skuChip?.skuIds[0] : undefined} style={{ fontSize: 12, color: index === 0 ? selectSoftInk : color.body, border: `1px solid ${index === 0 ? selectSoftInk : color.hairline}`, borderRadius: radius.pill, padding: '3px 8px', background: index === 0 ? selectSoft : color.canvas }}>{chip}</span>)}{contextStale && <span role="status" style={{ fontSize: 12, color: color.warningInk, border: `1px solid ${color.warning}`, borderRadius: radius.pill, padding: '3px 8px', background: color.warningSoft }}>上下文已更新 · 旧结果需重新确认</span>}</div>;
}

export function AgentProviderBadge({ response }: { response?: AgentResponse }) {
  const name = response?.provider?.name ?? '本地确定性';
  const fallback = /回退|fallback/i.test(name);
  const remote = /远端|remote|glm|ai/i.test(name) && !fallback;
  const label = fallback ? '本地数据结果 · 在线分析暂不可用' : remote ? '在线分析' : '本地数据结果';
  return <span data-provider-badge style={{ ...mutedBadge, color: fallback ? color.warningInk : remote ? color.link : color.body, background: fallback ? color.warningSoft : color.canvas }}>{label}</span>;
}

/** R1：「查看证据」是原地只读展开本卡自带证据，与当前上下文无关——
 *  绝不参与 contextFingerprint stale 门控；无证据时按 DESIGN.md 明说「暂无快照」。 */
function EvidenceList({ evidence, emptyHint = '暂无快照 · 该结果暂无可打开的证据' }: { evidence?: AgentEvidence[]; emptyHint?: string }) {
  const [open, setOpen] = useState(false);
  if (!evidence?.length) return <div style={{ marginTop: space.sm, fontSize: fontSize.caption, color: color.mute }} role="note">{emptyHint}</div>;
  return <div data-agent-evidence style={{ marginTop: space.sm }}>
    <button type="button" className="lpl-agent-evidence-toggle" aria-expanded={open} aria-label={`查看证据 · 共 ${evidence.length} 条`} onClick={() => setOpen((value) => !value)} style={{ ...textButtonStyle, fontSize: fontSize.caption, padding: 0 }}>{open ? `收起证据 · ${evidence.length}` : `查看证据 · ${evidence.length}`}</button>
    {open && <div role="region" aria-label="证据与来源" style={{ display: 'grid', gap: space.xs, marginTop: space.xs, fontSize: fontSize.caption, color: color.mute }}>{evidence.map((item, index) => <div key={`${item.id ?? item.label}-${index}`} style={{ padding: `${space.xs}px ${space.sm}px`, borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer" style={{ color: color.link }}>{item.label}</a> : <strong style={{ color: color.ink }}>{item.label}</strong>}<div>{item.detail}</div>{item.source && <div style={{ marginTop: 2, color: color.mute }}>来源：{item.source}{item.timestamp ? ` · ${item.timestamp}` : ''}</div>}</div>)}</div>}
  </div>;
}

/** R8：结果卡统一分段（事实 / 计算·规则 / 判断边界）。间距与字号只取
 *  tokens（space.* / fontSize.*），不允许 marginTop:9 / fontSize:12 之类非标值。 */
function CardSection({ label, children }: { label: string; children: ReactNode }) {
  return <div className="lpl-agent-card-section" data-agent-card-section={label} style={{ marginTop: space.sm, fontSize: fontSize.caption, color: color.body, lineHeight: 1.45 }}><strong style={{ color: color.ink }}>{label}：</strong>{children}</div>;
}

function CardActions({ actions, locked }: { actions?: AgentCardAction[]; locked?: boolean }) {
  const { setDraft, send, rerunWithPatch, context, applyFilter } = useAgent();
  const { go } = usePage();
  const [actionError, setActionError] = useState<string | undefined>();
  if (!actions?.length) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>{actions.map((action) => {
    // R1：stale 门控只保护会改看板口径的动作（open 导航 / apply 应用筛选）；
    // followup 是自包含重跑、copy 是剪贴板，不依赖当前上下文，历史卡始终可用。
    const guarded = action.kind === 'open' || action.kind === 'apply';
    const stale = guarded && Boolean(action.target?.contextFingerprint && action.target.contextFingerprint !== context.fingerprint);
    // R8：响应指纹不一致的消息级动作锁——apply/open/query（followup）类副作用
    // 动作全部禁用，仅 copy（剪贴板）这类无上下文副作用的动作豁免。
    const lockedHere = Boolean(locked && action.kind !== 'copy');
    const disabled = Boolean(action.disabled || stale || lockedHere);
    return <button type="button" key={action.id} disabled={disabled} title={lockedHere ? '响应口径与请求不一致，该动作已锁定' : stale ? '当前筛选已变化，请重新运行 Agent' : undefined} aria-label={lockedHere ? `${action.label}（响应口径不一致，已锁定）` : stale ? `${action.label}（当前口径已变化）` : action.label} onClick={() => {
      if (disabled) return;
      if (action.kind === 'copy' && action.prompt) void navigator.clipboard?.writeText(action.prompt);
      else if (action.prompt) {
        setDraft(action.prompt);
        if (action.kind === 'followup') {
          const scopePatch = action.filterPatch ?? action.target?.filterPatch;
          if (scopePatch && rerunWithPatch) {
            // 追问复用结果卡生成时的完整口径；用户在输入框手动改写的
            // 新范围仍走普通 send，由后续显式词句覆盖旧 patch。
            rerunWithPatch(action.prompt, classifyIntent(action.prompt), scopePatch);
          } else {
            void send(action.prompt, action.target?.forecastDraft, { forecastSnapshot: action.target?.forecastSnapshot, forecastDataset: action.target?.forecastDataset });
          }
        }
        if (action.kind === 'open') {
          // R4（M1，同步稳定线四审）：回看类 open 动作携带 filterPatch（生成卡时的
          // 完整查询口径）——先经 applyFilter 可撤销通道落地（国家/主品/平台/粒度/
          // 时间范围），失败不导航；AE 页问「RU nova 趋势」回看必须落 RU + nova。
          if (action.filterPatch) {
            const result = applyFilter({ kind: 'filter', id: `open-scope-${action.id}`, title: '回看定位口径', contextFingerprint: context.fingerprint, patch: action.filterPatch, changes: [] });
            if (!result.ok) { setActionError(result.error); return; }
          }
          const targetPage = action.target?.page;
          if (targetPage === 'alerts' || targetPage === 'forecast' || targetPage === 'dashboard' || targetPage === 'volume' || targetPage === 'marketboard' || targetPage === 'overview' || targetPage === 'pricing' || targetPage === 'intelligence' || targetPage === 'config') go(targetPage);
          else if (/预警/.test(action.prompt)) go('alerts');
          else if (/预测/.test(action.prompt)) go('forecast');
          else go('dashboard');
        }
      }
    }} style={{ ...textButtonStyle, fontSize: fontSize.caption, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: `${space.xs}px ${space.sm}px`, background: color.canvas, opacity: disabled ? 0.5 : 1 }}>{stale ? `${action.label} · 需刷新` : action.label}</button>;
  })}
  {actionError && <div role="alert" style={warningStyle}>{actionError}</div>}</div>;
}

const quickPillStyle: CSSProperties = { fontSize: 12, color: color.link, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, padding: '4px 8px', cursor: 'pointer' };

/** 药丸快捷动作：DESIGN.md 规定胶囊圆角仅用于标签/快捷动作；每个药丸必须绑定
 *  真实 handler（跳页面 / 定位行 / 触发意图），禁止摆设按钮。R8：locked 消息上
 *  的副作用药丸不可用（disabled + 视觉降透明）。 */
function QuickPill({ label, onAction, title, disabled }: { label: string; onAction: () => void; title?: string; disabled?: boolean }) {
  return <button type="button" className="lpl-agent-quick-pill" title={title ?? label} aria-label={label} disabled={disabled} onClick={onAction} style={{ ...quickPillStyle, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{label}</button>;
}

/** 无结果（empty）状态卡：运行成功但当前口径没有可展示的结果——不是失败，
 *  提供可操作的调整范围动作，不用其他范围的数据冒充结果。
 *  R2：空结果卡同样按「结论 → 事实 → 计算/规则 → 判断边界 → 动作」显式分段。
 *  R2（A M1）：两个动作都是发起当前上下文新查询的纯 prompt（调整范围 = 生成
 *  筛选预览消息；重新描述 = 聚焦输入框），不随消息锁定。 */
function EmptyResultCard({ onNarrowRange, onRefine }: { onNarrowRange: () => void; onRefine: () => void }) {
  return <div className="lpl-agent-result-card" data-agent-empty-card style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>无结果 · 当前口径没有可展示的结果</span><span style={mutedBadge}>empty</span></div>
    <CardSection label="事实">已按当前国家、产品与时间范围查询；没有可对齐的事实，也没有用其他范围的数据填充。</CardSection>
    <CardSection label="计算 / 规则">本地确定性引擎按当前国家 × 产品 × 时间范围逐周对齐价格事实；「无结果」判定为范围内没有任何可对齐的事实行，不以其他范围数据代替。</CardSection>
    <CardSection label="判断边界">可能原因：范围内缺采、产品未在架或筛选口径过窄；缩小时间范围或补充产品口径后重试，仍为空时应先核对数据覆盖与订阅口径。</CardSection>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
      <QuickPill label="缩小到最近 8 周" title="生成「只看最近 8 周」筛选预览" onAction={onNarrowRange} />
      <QuickPill label="重新描述问题" title="回到输入框补充国家 / 产品 / 时间口径" onAction={onRefine} />
    </div>
    <EvidenceList evidence={[]} emptyHint="暂无快照 · 本次查询没有可打开的证据" />
  </div>;
}

/** 快问意图映射：forecast 页的解释类快问交给 classifyIntent 自行路由（命中
 *  forecast_explain，得到真实解释卡），其余维持显式意图，保证药丸行为可预期。 */
function suggestionSendIntent(suggestion: AgentSuggestionAction): AgentIntent | undefined {
  if (suggestion.intent === 'query' && suggestion.target === 'forecast') return undefined;
  if (suggestion.intent === 'filter') return 'filter';
  if (suggestion.intent === 'clarify') return 'clarify';
  if (suggestion.intent === 'price_advantage') return 'price_advantage';
  if (suggestion.intent === 'price_alert') return 'price_alert';
  return 'query';
}

export function ToolCallCard({ step, onApply, onRetry, applyError }: { step: AgentStep; onApply?: () => { ok: boolean; error?: string }; onRetry?: () => void; applyError?: string }) {
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  // R3：历史消息的响应都已进入终态；防御性把远端可能残留的
  // running/queued/waiting_for_approval 步骤收敛为终态（AgentContext 也会在
  // 终态时收敛一次），历史卡绝不呈现「运行中」工具步骤。
  const status: AgentStep['status'] = step.status === 'success' || step.status === 'warning' || step.status === 'failed' ? step.status : 'success';
  const failed = status === 'failed';
  const statusLabel = status === 'success' ? '已完成' : status === 'warning' ? '已完成 · 注意' : '失败';
  const apply = () => { if (onApply) { const result = onApply(); setActionError(result.ok ? undefined : result.error ?? '应用筛选失败'); } };
  return <div data-tool-call-card style={{ margin: `${space.xs}px 0`, padding: space.sm, border: `1px solid ${failed ? color.error : color.hairline}`, borderRadius: radius.control, background: color.canvas }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: fontSize.caption }}><span aria-hidden style={{ color: failed ? color.error : status === 'warning' ? color.warning : color.link }}>{status === 'failed' ? '×' : status === 'warning' ? '!' : '✓'}</span><strong style={{ color: color.ink }}>{step.label}</strong><span style={{ color: color.mute }}>{statusLabel}</span><span style={{ marginLeft: 'auto', color: color.mute }}>{step.durationMs}ms</span></div>
    <div style={{ marginTop: space.xs, fontSize: fontSize.caption, color: color.body }}>{step.detail}</div>
    <div style={{ display: 'flex', gap: 7, marginTop: 6 }}><button type="button" onClick={() => setOpen((value) => !value)} style={textButtonStyle}>{open ? '收起明细' : '展开明细'}</button>{onApply && <button type="button" onClick={apply} style={textButtonStyle}>应用筛选</button>}{failed && onRetry && <button type="button" onClick={onRetry} style={textButtonStyle}>重新运行查询</button>}</div>
    {open && <div role="region" style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${color.hairline}`, color: color.mute, fontSize: fontSize.caption }}>工具：{step.tool} · request 可追溯 · 只读确定性数据</div>}
    {(applyError ?? actionError) && <div role="alert" style={{ marginTop: 6, color: color.error, fontSize: fontSize.caption }}>{applyError ?? actionError}</div>}
  </div>;
}

function FilterCard({ card, locked, hardLocked = locked }: { card: FilterResultCard; locked?: boolean; hardLocked?: boolean }) {
  const { appliedFilterIds, applyFilter, canUndo, undoFilter, canRedo, redoFilter, setDraft } = useAgent();
  const applied = appliedFilterIds.has(card.id);
  const [applyError, setApplyError] = useState<string | undefined>();
  const apply = () => { if (locked) return; const result = applyFilter(card); setApplyError(result.ok ? undefined : result.error ?? '应用筛选失败'); };
  return <div className="lpl-agent-result-card" data-agent-result-card style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>只读预览</span></div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      {card.changes.map((change) => <div className="lpl-agent-filter-change" key={change.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto 1fr', gap: 6, alignItems: 'center', fontSize: 12 }}><span style={{ color: color.mute }}>{change.label}</span><span>{change.before}</span><span style={{ color: color.mute }}>→</span><strong>{change.after}</strong></div>)}
    </div>
    {card.warning && <div style={warningStyle}>{card.warning}</div>}
    <div style={actionRowStyle}>
      {/* Applying this validated preview changes its own scope fingerprint.
          Keep its reversible controls available; malformed/streaming responses
          remain hard-locked even when another message applied the same card id. */}
      {applied ? <><span style={{ color: color.link, fontSize: 12 }}><CheckOutlined /> 已应用</span>{canUndo && <button type="button" disabled={hardLocked} aria-disabled={hardLocked} title={hardLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (hardLocked) return; undoFilter(); }} style={{ ...textButtonStyle, opacity: hardLocked ? 0.5 : 1, cursor: hardLocked ? 'not-allowed' : 'pointer' }}><UndoOutlined /> 撤销</button>}{canRedo && <button type="button" disabled={hardLocked} aria-disabled={hardLocked} title={hardLocked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (hardLocked) return; redoFilter(); }} style={{ ...textButtonStyle, opacity: hardLocked ? 0.5 : 1, cursor: hardLocked ? 'not-allowed' : 'pointer' }}><RedoOutlined /> 重做</button>}</> : <><Button size="small" type="primary" disabled={locked} title={locked ? '响应口径与请求不一致，该动作已锁定' : undefined} onClick={apply}>应用到看板</Button><Button size="small" onClick={() => setDraft(card.prompt ?? '')}>继续修改</Button></>}
    </div>
    {applyError && <div role="alert" style={warningStyle}>应用失败：{applyError}</div>}
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} locked={locked} />
  </div>;
}

function TableCard({ card, locked }: { card: TableResultCard; locked?: boolean }) {
  return <div className="lpl-agent-result-card" data-agent-result-card style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>确定性结果</span></div>
    <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{card.columns.map((column) => <th key={column} style={tableHeadStyle}>{column}</th>)}</tr></thead><tbody>{card.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} style={tableCellStyle}>{cell}</td>)}</tr>)}</tbody></table></div>
    {card.note && <div style={noteStyle}>{card.note}</div>}
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} locked={locked} />
  </div>;
}

function ChartCard({ card, locked }: { card: ChartResultCard; locked?: boolean }) {
  const max = Math.max(1, ...card.series.flatMap((s) => s.values.map((v) => v.value ?? 0)));
  return <div className="lpl-agent-result-card" data-agent-result-card style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>图表</span></div>
    <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
      {card.series.slice(0, 5).map((series) => <div key={series.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 116px', gap: 8, alignItems: 'center' }}><span title={series.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: color.body }}>{series.label}</span><div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 28 }}>{series.values.slice(-10).map((point, index) => <span key={`${point.bucket}-${index}`} title={`${point.bucket} · ${point.value ?? '—'}`} style={{ flex: 1, minWidth: 3, height: `${Math.max(3, ((point.value ?? 0) / max) * 24)}px`, background: series.color, opacity: point.value == null ? 0.18 : 0.72, borderRadius: '2px 2px 0 0' }} />)}</div></div>)}
    </div>
    <div style={noteStyle}>{card.note}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} locked={locked} />
  </div>;
}

function relationLabel(relation: PriceAdvantageRow['relation']): string {
  return relation === 'advantage' ? '我司占优' : relation === 'behind' ? '我司落后' : '持平';
}

function AdvantageCard({ card, locked }: { card: PriceAdvantageResultCard; locked?: boolean }) {
  const { context, applyFilter, canUndo, canRedo, undoFilter, redoFilter, send, rerunWithPatch } = useAgent();
  const { go } = usePage();
  const [relation, setRelation] = useState<'all' | 'advantage' | 'behind'>('all');
  const [skuId, setSkuId] = useState('all');
  const [actionError, setActionError] = useState<string | undefined>();
  const rows = card.rows.filter((row) => (relation === 'all' || row.relation === relation) && (skuId === 'all' || row.own.skuId === skuId));
  const currency = card.currency === 'usd' ? 'usd' : 'local';
  // R8：指纹不一致的消息上，行级定位（写看板口径 + 导航）是副作用动作，锁定不可点。
  const jump = (row: PriceAdvantageRow) => {
    if (locked) return;
    const result = applyFilter({
      kind: 'filter',
      id: `advantage-focus-${row.id}`,
      title: '定位价格优势',
      contextFingerprint: context.fingerprint,
      // R4（三审 M1）：行级定位落地 = 复刻该行计算时每条线的真实生效口径——
      // 全局层 = 参与计算的 state.platform（按行所在国过共享规则归一，含 URL
      // shop= 店铺级，绝不明细里是 OZON 3P 395、落地却变平台池 333 的换算）；
      // 每线层 = row.ownSelection 自带的 selection.platform 原样随 mains 落地
      // （R6 的「按行渠道名改写全局平台」在店铺级/每线口径下会换成另一口径，
      // 已由共享作用域解析取代）。
      patch: { countryCode: row.countryCode, platform: platformSelectionForCountry(context.state.platform, row.countryCode), granularity: 'week', adaptive: false, rangeStart: row.weekId, rangeEnd: row.weekId, mains: buildCards([row.ownSelection], { auto: true, countryCode: row.countryCode }) },
      changes: [],
    });
    if (!result.ok) { setActionError(result.error); return; }
    navBus.dashboardFocusWeekId = row.weekId;
    go('dashboard');
  };
  // 药丸全部绑定真实动作：定位到最新对齐周回看走势 / 触发 price_alert 意图 /
  // 迭代渠道跳 GTM 情报工作台（stable 渠道该页不可达，不渲染假捷径）。
  const latestWeek = card.rows[0]?.weekId;
  // R2（本轮返修 M2 + m2）：跨国自然语言查询（AE 页问「RU 价格优势」）的结果卡，
  // 「回看价格走势」与「跳 GTM 情报」共用同一 scopePatch 落地——目标 countryCode +
  // 完整主品/SKU 口径（显式 mains，nova 跨国合法保留/重映射）+ 平台 + 实际参与
  // 对比的周范围（空结果保持原粒度/原桶，见 advantageScopePatch）。同国卡片不
  // 重放 patch，只按最新对齐周聚焦跳页。
  const cardCountry = card.rows[0]?.countryCode ?? context.state.countryCode;
  const jumpTo = (page: 'dashboard' | 'intelligence') => {
    if (locked) return;
    if (cardCountry !== context.state.countryCode) {
      const result = applyFilter({ kind: 'filter', id: `advantage-scope-${cardCountry}`, title: '同步结果卡国家', contextFingerprint: context.fingerprint, patch: advantageScopePatch(context.state, card.rows), changes: [] });
      if (!result.ok) { setActionError(result.error); return; }
    }
    if (latestWeek) navBus.dashboardFocusWeekId = latestWeek;
    go(page);
  };
  return <div className="lpl-agent-result-card" data-agent-result-card style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={{ ...mutedBadge, color: color.link }}>本地确定性 · real</span></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: space.sm, alignItems: 'center' }}>
      {(['all', 'advantage', 'behind'] as const).map((value) => <button key={value} type="button" aria-pressed={relation === value} onClick={() => setRelation(value)} style={{ ...textButtonStyle, border: `1px solid ${relation === value ? selectAccent : color.hairline}`, borderRadius: radius.pill, padding: '4px 8px', background: relation === value ? selectSoft : color.canvas }}>{value === 'all' ? '全部' : value === 'advantage' ? '只看占优' : '只看落后'}</button>)}
      {card.skuOptions.length > 1 && <span style={{ color: color.mute, fontSize: fontSize.caption, marginLeft: 3 }}>规格</span>}
      {card.skuOptions.length > 1 && <button type="button" aria-pressed={skuId === 'all'} onClick={() => setSkuId('all')} style={{ ...textButtonStyle, border: `1px solid ${skuId === 'all' ? selectAccent : color.hairline}`, borderRadius: radius.pill, padding: '4px 8px', background: skuId === 'all' ? selectSoft : color.canvas }}>全部</button>}
      {card.skuOptions.map((option) => <button key={option.skuId} type="button" aria-pressed={skuId === option.skuId} onClick={() => setSkuId(option.skuId)} style={{ ...textButtonStyle, border: `1px solid ${skuId === option.skuId ? selectAccent : color.hairline}`, borderRadius: radius.pill, padding: '4px 8px', background: skuId === option.skuId ? selectSoft : color.canvas }}>{option.label}</button>)}
    </div>
    <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.caption }}><thead><tr>{['周', '我司', '竞品', '价差', '渠道', '状态'].map((column) => <th key={column} style={tableHeadStyle}>{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} data-advantage-row={row.id} onClick={() => jump(row)} style={{ cursor: locked ? 'not-allowed' : 'pointer' }}><td style={tableCellStyle}><button type="button" disabled={locked} onClick={(event) => { event.stopPropagation(); jump(row); }} style={{ ...textButtonStyle, padding: 0 }} aria-label={`定位 ${row.own.modelName} 与 ${row.competitor.modelName} ${row.weekId}`}>{row.weekLabel} · {row.weekId}</button></td><td className="tnum" style={tableCellStyle}>{row.own.modelName} · {formatPrice(row.own.price, currency)}</td><td className="tnum" style={tableCellStyle}>{row.competitor.modelName} · {formatPrice(row.competitor.price, currency)}</td><td className="tnum" style={{ ...tableCellStyle, color: row.relation === 'advantage' ? color.link : row.relation === 'behind' ? color.error : color.body }}>{row.priceDiff >= 0 ? '+' : ''}{formatPrice(row.priceDiff, currency)} · {row.priceDiffPct >= 0 ? '+' : ''}{(row.priceDiffPct * 100).toFixed(1)}%</td><td style={tableCellStyle}>{row.channelLabel}</td><td style={tableCellStyle}>{relationLabel(row.relation)}</td></tr>)}</tbody></table></div>
    {!rows.length && <div style={noteStyle}>当前筛选下没有可同时对齐的周度事实。</div>}
    <CardSection label="规则 · 计算边界">{card.note}</CardSection>
    <CardSection label="判断边界">比较限于当前国家的自动匹配竞品矩阵与可对齐周；缺采周不插值、不造点；价差方向只说明相对水位，不构成调价的因果结论。</CardSection>
    {actionError && <div role="alert" style={warningStyle}>{actionError}</div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
      {!card.rows.length && <QuickPill label="调整范围 · 最近 12 周" title="显式应用最近 12 周范围并重跑价格优势" disabled={locked} onAction={() => { rerunWithPatch('价格优势', 'price_advantage', recentRangePatch(context.state, 12)); }} />}
      <QuickPill label="回看价格走势" title={latestWeek ? `回到价格走势并聚焦 ${latestWeek}` : '回到价格走势'} disabled={locked} onAction={() => jumpTo('dashboard')} />
      {/* R2 M1：纯 prompt 快问（发起新查询）不随消息锁定——它按当前上下文重新运行 */}
      <QuickPill label="打开价格预警" title="读取当前口径的价格预警事件" onAction={() => { void send('价格预警', undefined, undefined, 'price_alert'); }} />
      {ITERATE && <QuickPill label="跳 GTM 情报" title="先落地结果卡国家与口径，再打开 GTM 情报工作台核对竞品动态（迭代渠道）" disabled={locked} onAction={() => jumpTo('intelligence')} />}
    </div>
    {/* R2（B m3）：撤销/恢复筛选 = 改回全局筛选的副作用动作，锁定消息上禁用 + 回调守卫 */}
    <div style={actionRowStyle}>{canUndo && <button type="button" disabled={locked} aria-disabled={locked} title={locked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (locked) return; undoFilter(); }} style={{ ...textButtonStyle, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}><UndoOutlined /> 撤销筛选</button>}{canRedo && <button type="button" disabled={locked} aria-disabled={locked} title={locked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (locked) return; redoFilter(); }} style={{ ...textButtonStyle, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}><RedoOutlined /> 恢复筛选</button>}</div>
    <EvidenceList evidence={card.evidence} />
  </div>;
}

function seriesSelectionOf(seriesKey: string) {
  const [modelId, romram] = seriesKey.split('__');
  const row = dimProduct.find((item) => item.model_id === modelId && item.romram.replace(/\s+/g, '') === romram);
  return row ? { modelId, romram: row.romram, skuIds: [row.sku_id] } : null;
}

function AlertListCard({ card, locked }: { card: AlertListResultCard; locked?: boolean }) {
  const { context, applyFilter, canUndo, canRedo, undoFilter, redoFilter, applyAlertAction, canUndoAlert, undoAlertAction } = useAgent();
  const { go } = usePage();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | undefined>();
  const toggle = (id: string) => setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  // R8：锁定消息上仅行内证据展开（toggle）可用；看板定位 / 预警中心导航 /
  // 状态流转都是副作用动作，一律禁用。
  const dashboard = (alert: AlertListResultCard['alerts'][number]) => {
    if (locked) return;
    const selection = seriesSelectionOf(alert.seriesKey ?? '');
    if (selection) {
      const countryCode = alert.countryCode ?? context.state.countryCode;
      const result = applyFilter({ kind: 'filter', id: `alert-focus-${alert.alertId ?? alert.key}`, title: '定位预警', contextFingerprint: context.fingerprint, patch: { countryCode, platform: context.state.platform, granularity: 'week', adaptive: false, rangeStart: alert.weekId, rangeEnd: alert.weekId, mains: buildCards([selection], { auto: true, countryCode }) }, changes: [] });
      if (!result.ok) { setActionError(result.error); return; }
    }
    navBus.dashboardFocusWeekId = alert.weekId;
    go('dashboard');
  };
  const alertsPage = (alert: AlertListResultCard['alerts'][number]) => {
    if (locked) return;
    const modelId = alert.seriesKey?.split('__')[0] ?? '';
    navBus.alertsFocus = { alertId: alert.alertId, contextFingerprint: alert.contextFingerprint, modelId, modelName: alert.modelName, seriesKey: alert.seriesKey, type: alert.type as 'price-change' | 'promo' | 'platform-gap' | 'own-gap', weekId: alert.weekId };
    go('alerts');
  };
  const mark = (alert: AlertListResultCard['alerts'][number]) => {
    if (locked) return;
    const alertId = alert.alertId ?? alert.key;
    const action = alert.lifecycle === 'new' ? { kind: 'acknowledge' as const } : alert.lifecycle === 'acknowledged' ? { kind: 'investigate' as const } : { kind: 'action_required' as const };
    const result = applyAlertAction(alertId, action);
    if (!result.ok) setActionError(result.error);
  };
  return <div className="lpl-agent-result-card" data-agent-result-card style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={{ ...mutedBadge, color: color.warningInk, background: color.warningSoft }}>规则结果 · real</span></div>
    {/* R2：空/未监控预警卡同样显式分段「事实 → 计算/规则 → 判断边界」，动作永远在边界之后。 */}
    <CardSection label="事实">{card.alerts.length ? `当前口径读取到 ${card.alerts.length} 条可处理事件，展开每条可见触发事实、规则版本与来源。` : '当前国家、产业、订阅和平台口径下没有触发事件。'}</CardSection>
    <CardSection label="计算 / 规则">预警由调价、折扣、平台价差、档位间距四类规则在当前口径上确定性计算（{context.state.alertSubs.length ? `${context.state.alertSubs.length} 个系列已订阅` : '当前无订阅（未监控）'} · 阈值 调价 {(context.state.alertThresholds['price-change'] * 100).toFixed(1)}% / 折扣 {(context.state.alertThresholds.promo * 100).toFixed(1)}% / 平台价差 {(context.state.alertThresholds['platform-gap'] * 100).toFixed(1)}% / 档位间距 {(context.state.alertThresholds['own-gap'] * 100).toFixed(0)}% · {context.ruleVersion ?? 'price-rules-v1'}）。</CardSection>
    <CardSection label="判断边界">{card.alerts.length ? '事件基于规则与数据版本快照计算；每条证据状态以展开行为准，解释不推断唯一因果。' : '未订阅或关闭的类型不会产生事件；本卡不用其他范围的数据填充，需到预警中心核对订阅与阈值。'}</CardSection>
    <div style={{ display: 'grid', gap: 7, marginTop: space.sm }}>{card.alerts.map((alert) => { const id = alert.alertId ?? alert.key; const isOpen = expanded.has(id); const markLabel = alert.lifecycle === 'new' ? '标记已确认' : alert.lifecycle === 'acknowledged' ? '开始核查' : '标记需行动'; return <div key={id} data-alert-row={id} style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvas }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: space.sm }}>{/* R2（本轮返修 M5）：折叠行头只留信息与展开触发器——看板定位 / 预警中心
              导航 / 状态流转是行级副作用动作，前置按钮会让「先看触发事实与判断边界，
              再决定动作」的阅读次序失效；全部动作后置到展开区的判断边界之后。 */}<button type="button" onClick={() => toggle(id)} aria-expanded={isOpen} data-alert-row-toggle style={{ ...textButtonStyle, padding: 0, textAlign: 'left', flex: 1 }}><strong>{alert.brand} {alert.modelName}</strong><span style={{ color: color.mute }}> · {alert.weekLabel} · {alert.type}</span></button></div>{isOpen && <div style={{ padding: `0 ${space.sm}px ${space.sm}px`, borderTop: `1px solid ${color.hairline}`, fontSize: fontSize.caption, color: color.body }}><div style={{ marginTop: 7 }}>触发事实：{alert.weekLabel} · {alert.type} · 当前价 {formatPrice(alert.price, context.state.currency)}</div><div style={{ marginTop: space.xs }}>规则：{alert.ruleVersion ?? 'price-rules-v1'} · 数据：{alert.dataVersion ?? 'local-data-v1'} · 状态：{alert.lifecycle ?? 'new'}</div>{alert.evidence?.map((item) => <div key={item.id ?? item.label} style={{ marginTop: 5, padding: `${space.xs}px 7px`, background: color.canvasSoft, borderLeft: `2px solid ${color.hairlineStrong}` }}>{item.label} · {item.detail}{item.source ? ` · ${item.source}` : ''}</div>)}<div data-alert-row-boundary style={{ marginTop: 5, color: color.mute }}>判断边界：证据{alert.evidenceStatus === 'verified' ? '已核验' : '待核查'} · 阈值 {alert.threshold != null ? `${(alert.threshold * 100).toFixed(1)}%` : '—'} · 解释不推断唯一因果，需回商品页或快照核对。</div>{/* M5：行级动作全部在 触发事实 → 规则/证据 → 判断边界 之后呈现（锁态沿用消息级锁） */}<div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 7 }}><button type="button" disabled={locked} onClick={() => dashboard(alert)} style={{ ...textButtonStyle, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1 }}>应用预警筛选</button><button type="button" disabled={locked} onClick={() => alertsPage(alert)} style={{ ...textButtonStyle, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1 }}>查看完整证据</button><button type="button" disabled={locked} onClick={() => mark(alert)} style={{ ...textButtonStyle, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1 }}>{markLabel}</button></div></div>}</div>; })}</div>
    {!card.alerts.length && <div style={noteStyle}>当前口径没有可处理事件。</div>}
    {actionError && <div role="alert" style={warningStyle}>{actionError}</div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
      <QuickPill label="打开预警中心" title="到预警中心处理订阅与状态" disabled={locked} onAction={() => go('alerts')} />
      <QuickPill label="回看价格走势" title={card.alerts[0] ? `回到价格走势并聚焦 ${card.alerts[0].weekId}` : '回到价格走势'} disabled={locked} onAction={() => { const first = card.alerts[0]; if (first) navBus.dashboardFocusWeekId = first.weekId; go('dashboard'); }} />
      {/* R2 C4：跳预测文案统一为固定样本口径——量价预测是俄罗斯 HUAWEI Mate 90
          固定样本推演，不随预警机型/全局筛选联动，不冒称任意机型联动。 */}
      {ITERATE && <QuickPill label="查看量价预测示例（固定样本）" title="打开量价预测示例（固定样本 · 俄罗斯 HUAWEI Mate 90，不随本预警机型联动）" disabled={locked} onAction={() => go('forecast')} />}
    </div>
    {/* R2（B m3）：撤销筛选/恢复/撤销状态变更都是改回全局状态的副作用，锁定消息上禁用 + 回调守卫 */}
    <div style={actionRowStyle}>{canUndo && <button type="button" disabled={locked} aria-disabled={locked} title={locked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (locked) return; undoFilter(); }} style={{ ...textButtonStyle, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}><UndoOutlined /> 撤销筛选</button>}{canRedo && <button type="button" disabled={locked} aria-disabled={locked} title={locked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (locked) return; redoFilter(); }} style={{ ...textButtonStyle, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}><RedoOutlined /> 恢复筛选</button>}</div>
    {canUndoAlert && <div style={actionRowStyle}><button type="button" disabled={locked} aria-disabled={locked} title={locked ? '响应口径与当前上下文不一致，动作已锁定' : undefined} onClick={() => { if (locked) return; undoAlertAction(); }} style={{ ...textButtonStyle, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}><UndoOutlined /> 撤销状态变更</button></div>}
    <EvidenceList evidence={card.evidence} />
  </div>;
}

function AlertCard({ card, locked }: { card: AlertResultCard; locked?: boolean }) {
  return <div className="lpl-agent-result-card" data-agent-result-card style={{ ...cardStyle, borderColor: color.warning }}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={{ ...mutedBadge, color: color.warningInk, background: color.warningSoft }}>预警解释</span></div>
    <div style={{ display: 'grid', gap: 5, marginTop: 8, fontSize: 12 }}>{card.facts.map((fact) => <div key={fact}>• {fact}</div>)}</div>
    <CardSection label="计算 / 规则">规则 {card.alert.ruleVersion ?? 'price-rules-v1'} · 数据 {card.alert.dataVersion ?? 'local-data-v1'}{card.alert.threshold != null ? ` · 阈值 ${(card.alert.threshold * 100).toFixed(1)}%` : ''} · 数据状态 real。</CardSection>
    <div style={{ marginTop: space.sm, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: fontSize.caption, color: color.body }}><strong style={{ color: color.ink }}>判断边界 · 建议核查</strong>{card.checks.map((check) => <div key={check} style={{ marginTop: space.xs }}>· {check}</div>)}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} locked={locked} />
  </div>;
}

function ForecastExplanationCard({ card, locked }: { card: ForecastExplanationResultCard; locked?: boolean }) {
  return <div className="lpl-agent-result-card" data-agent-result-card style={cardStyle}>
    <div className="lpl-agent-card-title" style={cardTitleStyle}><span>{card.title}</span><span style={mutedBadge}>确定性解释</span></div>
    <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 12, color: color.body }}>
      <div><span style={{ color: color.mute }}>范围：</span>{card.scope.country} · {card.scope.channel} · {card.scope.product}</div>
      <div><span style={{ color: color.mute }}>模型：</span>{card.scope.modelVersion} · {card.scope.currency} · 拟合窗口 {card.fitWindow} · 总体有效样本 {card.sampleCount} 周</div>
      {(card.dataStatus || card.provenanceSummary) && <div><span style={{ color: color.mute }}>数据：</span>{card.dataStatus === 'simulated' ? '模拟' : card.dataStatus === 'real' ? '真实' : card.dataStatus === 'mixed' ? '混合' : '—'}{card.provenanceSummary ? ` · ${card.provenanceSummary}` : ''}</div>}
      {(card.fitStatus || card.intervalCalibrated !== undefined) && <div><span style={{ color: color.mute }}>拟合：</span>{card.fitStatus === 'completed' ? '已完成' : card.fitStatus === 'fallback' ? '回退先验' : card.fitStatus === 'insufficient' ? '证据不足' : '—'} · {card.fitAppliedToForecast ? '已应用到预测' : '仅审计'} · 区间{card.intervalCalibrated ? '已校准' : '未校准'}</div>}
      {card.scenario?.active && <div><span style={{ color: color.mute }}>当前 What-if：</span>预测 SO {card.scenario.forecastSo.toLocaleString()} 台（相对基准 {card.scenario.soDelta >= 0 ? '+' : ''}{card.scenario.soDelta.toLocaleString()}），销毛变化 {card.scenario.marginDelta >= 0 ? '+' : ''}{card.scenario.marginDelta.toLocaleString()}</div>}
      <div className="mono" style={{ fontSize: 12, color: color.mute }}><span>上下文 fingerprint：</span>{card.contextFingerprint}</div>
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
      ].map(([label, value]) => <div key={label} style={{ padding: '6px 7px', background: color.canvasSoft, border: `1px solid ${color.hairline}`, borderRadius: radius.control }}><div style={{ color: color.mute, fontSize: 12 }}>{label}</div><strong className="tnum" style={{ display: 'block', marginTop: 2, fontSize: 12, color: color.ink }}>{value}</strong></div>)}
    </div>
    <div style={{ marginTop: 11, fontSize: 12, color: color.body }}><strong style={{ color: color.ink }}>因子与当前周贡献</strong><div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{card.factors.map((factor) => <div key={factor.key} style={{ padding: '6px 7px', borderLeft: `2px solid ${factor.status === '确定性计算' ? color.link : color.hairlineStrong}`, background: color.canvas }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{factor.label}</strong><span className="tnum" style={{ color: color.ink }}>{factor.effect}</span></div><div style={{ marginTop: 2, color: color.mute }}>{factor.status} · {factor.window} · {factor.shape}</div><div style={{ marginTop: 2, color: color.mute }}>证据：{factor.evidence} · 置信度 {factor.confidence}</div></div>)}</div></div>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: 12, color: color.body }}><strong style={{ color: color.ink }}>关键假设</strong>{card.assumptions.map((item) => <div key={item} style={{ marginTop: 4 }}>· {item}</div>)}</div>
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, fontSize: 12, color: color.body }}><strong style={{ color: color.ink }}>判断边界与风险</strong>{card.boundaries.map((item) => <div key={item} style={{ marginTop: 4 }}>· {item}</div>)}</div>
    <EvidenceList evidence={card.evidence} />
    <CardActions actions={card.actions} locked={locked} />
  </div>;
}

function ResultCard({ card, locked, hardLocked }: { card: AgentResultCard; locked?: boolean; hardLocked?: boolean }) {
  if (card.kind === 'filter') return <FilterCard card={card} locked={locked} hardLocked={hardLocked} />;
  if (card.kind === 'table') return <TableCard card={card} locked={locked} />;
  if (card.kind === 'chart') return <ChartCard card={card} locked={locked} />;
  if (card.kind === 'price_advantage') return <AdvantageCard card={card} locked={locked} />;
  if (card.kind === 'alert_list') return <AlertListCard card={card} locked={locked} />;
  if (card.kind === 'forecast_explanation') return <ForecastExplanationCard card={card} locked={locked} />;
  return <AlertCard card={card} locked={locked} />;
}

function Citations({ response }: { response: AgentResponse }) {
  if (!response.citations.length && !response.provenance && !response.provider) return null;
  return <details style={{ marginTop: space.sm, fontSize: 12, color: color.mute }}>
    <summary style={{ cursor: 'pointer', color: color.body }}>依据与口径 · {response.citations.length}</summary>
    <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>{response.provider && <div>分析方式：{response.provider.name}{response.provider.reason ? ` · ${response.provider.reason}` : ''}</div>}{response.citations.map((citation) => <div key={citation.id} style={{ padding: '5px 7px', borderLeft: `2px solid ${color.hairlineStrong}`, background: color.canvas }}>{citation.label} · {citation.detail}</div>)}{response.provenance && <div style={{ padding: '5px 7px', borderLeft: `2px solid ${color.link}`, background: color.canvas }}>运行来源 · {response.provenance.source}{response.provenance.dataVersion ? ` · 数据 ${response.provenance.dataVersion}` : ''}{response.provenance.ruleVersion ? ` · 规则 ${response.provenance.ruleVersion}` : ''}</div>}</div>
  </details>;
}

const cardStyle: CSSProperties = { marginTop: space.sm, padding: 12, background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card, boxShadow: shadow.l1 };
const cardTitleStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: color.ink };
const mutedBadge: CSSProperties = { fontSize: 12, fontWeight: 400, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '2px 6px', whiteSpace: 'nowrap' };
const actionRowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 };
const textButtonStyle: CSSProperties = { color: color.link, cursor: 'pointer', fontSize: 12 };
const warningStyle: CSSProperties = { marginTop: 8, padding: '6px 8px', background: color.warningSoft, color: color.warningInk, fontSize: 12, borderRadius: radius.control };
const noteStyle: CSSProperties = { marginTop: 8, color: color.mute, fontSize: fontSize.caption, lineHeight: 1.45 };
const tableHeadStyle: CSSProperties = { textAlign: 'left', color: color.mute, fontWeight: 500, padding: '4px 5px', borderBottom: `1px solid ${color.hairline}` };
const tableCellStyle: CSSProperties = { padding: '5px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap', color: color.body };
const messageKindLabel: Record<string, string> = { proactive: '实时预警', clarification: '需要澄清', system: '系统状态', scenario: '情景分析', error: '运行异常', conversation: '结论' };

type ConversationMessage = AgentMessage & {
  status?: AgentRunStatus;
  partialText?: string;
  partialCards?: AgentResultCard[];
  streaming: boolean;
  failed: boolean;
  cancelled: boolean;
  isContextStale: boolean;
  hardLocked: boolean;
};

/** The channel adapter owns facts and scope guards, never composer or scrolling state. */
export default function AgentPanel() {
  const agent = useAgent();
  const { running, runStatus, activeRun, partialText, partialCards, messages, context, setDraft, send, applyFilter } = agent;
  const { go } = usePage();
  const threadMessages = useMemo(() => {
    const source: AgentMessage[] = [...messages];
    // Legacy consumers may still provide global partials. The current provider keeps
    // one assistant message ID from run start through completion/cancellation.
    const last = source[source.length - 1];
    const activeMessage = source.find((message) => message.role === 'assistant' && message.status && !['idle', 'completed', 'empty', 'failed', 'cancelled', 'stale_context', 'clarification_required'].includes(message.status));
    if (running && !activeMessage && (!last || last.role !== 'assistant' || last.response || last.kind === 'proactive')) {
      source.push({
        id: `stream-${activeRun?.id ?? 'pending'}`,
        role: 'assistant',
        text: partialText ?? '',
        createdAt: activeRun?.startedAt ?? last?.createdAt ?? new Date(0).toISOString(),
        kind: 'conversation',
        prompt: last?.prompt ?? last?.text,
        contextFingerprint: context.fingerprint,
        actionsLocked: true,
      });
    }
    return source.map((original, index): ConversationMessage => {
      const message = original as AgentMessage & { status?: AgentRunStatus; partialText?: string; partialCards?: AgentResultCard[] };
      const streaming = running && (activeMessage ? message.id === activeMessage.id : index === source.length - 1) && message.role === 'assistant' && !message.response && message.kind !== 'proactive';
      const isContextStale = Boolean(message.contextFingerprint && message.contextFingerprint !== context.fingerprint);
      return {
        ...message,
        text: streaming ? message.partialText || partialText || message.text : message.text,
        partialCards: message.partialCards ?? (streaming ? partialCards : undefined),
        actionsLocked: Boolean(message.actionsLocked || isContextStale || streaming),
        hardLocked: Boolean(message.actionsLocked || streaming),
        streaming,
        failed: message.status === 'failed' || message.kind === 'error',
        cancelled: message.status === 'cancelled',
        isContextStale,
      };
    });
  }, [messages, running, activeRun?.id, activeRun?.startedAt, partialText, partialCards, context.fingerprint]);
  const suggestions: readonly AgentSuggestionAction[] = messages.length ? AGENT_FOLLOWUP_ACTIONS : agentSuggestionsForPage(context.page);
  const showSuggestions = !messages.length || (!running && !messages.some((message) => message.response));

  return <AgentThread
    controller={agent}
    messages={threadMessages}
    statusLabel={AGENT_STATUS_LABELS[runStatus] ?? AGENT_STATUS_LABELS.idle}
    context={<ContextChips />}
    suggestions={showSuggestions ? suggestions : []}
    onSuggestion={(suggestion, focusComposer) => {
      if (running) return;
      if (suggestion.draftOnly) {
        setDraft(suggestion.prompt ?? suggestion.label);
        focusComposer();
      } else {
        void send(suggestion.prompt ?? suggestion.label, undefined, undefined, suggestionSendIntent(suggestion));
      }
    }}
    renderHeader={(message) => message.role === 'assistant' ? <>
      <span>{messageKindLabel[message.kind ?? 'conversation']}</span>
      {message.response && <AgentProviderBadge response={message.response} />}
    </> : null}
    renderMessage={(message, { focusComposer }) => {
      if (message.role === 'user') return null;
      const locked = Boolean(message.actionsLocked);
      const response = message.response;
      return <>
        {message.kind === 'proactive' && <div style={actionRowStyle}>
          {message.alert && <span className="tnum" style={noteStyle}>优先级 {message.alert.priority ?? '—'} · {message.alert.weekId} · {formatPrice(message.alert.price, context.state.currency)}</span>}
          <button type="button" disabled={locked} aria-disabled={locked} onClick={() => {
            if (locked || !message.alert) return;
            navBus.alertsFocus = {
              alertId: message.alert.alertId, contextFingerprint: message.alert.contextFingerprint,
              modelId: message.alert.seriesKey?.split('__')[0] ?? '', modelName: message.alert.modelName,
              seriesKey: message.alert.seriesKey, type: message.alert.type as 'price-change' | 'promo' | 'platform-gap' | 'own-gap', weekId: message.alert.weekId,
            };
            go('alerts');
          }} style={textButtonStyle}>查看预警</button>
          <button type="button" disabled={locked} aria-disabled={locked} onClick={() => {
            if (locked || !message.alert) return;
            navBus.dashboardFocusWeekId = message.alert.weekId;
            go('dashboard');
          }} style={textButtonStyle}>回看板</button>
          <button type="button" disabled={running} onClick={() => { void send('价格预警', undefined, undefined, 'price_alert'); }} style={textButtonStyle}>让 Agent 解释</button>
        </div>}
        {message.isContextStale && <div role="note" style={warningStyle}>基于较早筛选快照 · 当前上下文已变化，请重新确认结果口径</div>}
        {response && <>
          <div role="note" style={{ ...noteStyle, color: response.factGuard?.status === 'stale_context' ? color.warningInk : color.mute }}>
            事实来源：本地确定性引擎{response.provider?.name.includes('远端') && !response.provider.name.includes('回退') ? ' · 远端叙述' : ''}{response.factGuard?.message ? ` · ${response.factGuard.message}` : ''}
          </div>
          {response.scopeLabel && <div data-agent-scope role="note" style={{ ...noteStyle, color: color.body }}>本次结果口径：{response.scopeLabel}</div>}
          {response.cards.map((card) => <ResultCard key={card.id} card={card} locked={locked} hardLocked={message.hardLocked} />)}
          {response.cards.length === 0 && response.intent !== 'clarify' && <EmptyResultCard
            onNarrowRange={() => { if (!running) void send('只看最近 8 周', undefined, undefined, 'filter'); }}
            onRefine={() => { setDraft(''); focusComposer(); }}
          />}
          {response.steps.length > 0 && <details style={noteStyle}>
            <summary style={{ cursor: 'pointer', color: color.body }}>执行记录 · {response.steps.length} 项</summary>
            {response.steps.map((step) => <ToolCallCard
              key={step.id}
              step={step}
              onApply={!locked && step.tool === 'view.preview' ? () => {
                const filter = response.cards.find((card): card is FilterResultCard => card.kind === 'filter');
                return filter ? applyFilter(filter) : { ok: false, error: '没有可应用的筛选预览' };
              } : undefined}
              onRetry={!running && message.prompt ? () => { void send(message.prompt); } : undefined}
            />)}
          </details>}
          <Citations response={response} />
          {response.provider?.name.includes('回退') && message.prompt && <button type="button" disabled={running} onClick={() => { if (!running) void send(message.prompt); }} title="按当前范围重新查询并重试远端叙述" style={{ ...textButtonStyle, marginTop: space.sm }}>重试远端</button>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            {(response.suggestionActions ?? response.suggestions.map((label) => ({ label, intent: 'query' as const, prompt: label, draftOnly: undefined }))).map((suggestion) => <button
              type="button" key={suggestion.label} disabled={running}
              title={suggestion.draftOnly ? '填入输入框，确认后再发送' : '在当前上下文发起一次新查询'}
              onClick={() => {
                if (running) return;
                if (suggestion.draftOnly) { setDraft(suggestion.prompt ?? suggestion.label); focusComposer(); }
                else void send(suggestion.prompt ?? suggestion.label, undefined, undefined, suggestionSendIntent(suggestion));
              }}
              style={quickPillStyle}
            >{suggestion.label}</button>)}
          </div>
        </>}
        {!response && message.partialCards?.map((card) => <ResultCard key={card.id} card={card} locked hardLocked />)}
      </>;
    }}
  />;
}
