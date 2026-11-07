import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePage } from './PageContext';
import { useFilters } from './FiltersContext';
import { useAlerts } from '../components/AlertCenter';
import {
  buildAgentContext,
  contextFingerprint as agentContextFingerprint,
  defaultAgentClient,
  defaultVoiceAdapter,
  finalizeStepsForTerminalRun,
  runAgent,
  validateFilterPatch,
  type AgentContextSnapshot,
  type AgentIntent,
  type AgentAlertRecord,
  type AgentRun,
  type AgentRunStatus,
  type AgentResponse,
  type AgentResultCard,
  type FilterPatch,
  type ForecastContextInput,
  type ForecastDraftInput,
  type FilterResultCard,
  type VoiceInputAdapter,
} from '../agent';
import type { FiltersState } from './filtersTypes';
import { clampMains } from './mainSelection';
import { STABLE } from '../appChannel';
import { useAgent as useAgentStable } from './AgentContextStable';
import { materializeAlertRecords, alertAgentContextOf, transitionAlertRecord } from '../dataModel/alertLifecycle';
import type { AlertAction, AlertRecord } from '../dataModel/alertLifecycle';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AgentResponse;
  createdAt: string;
  /** 用于把系统提醒与普通对话区分开，旧消息默认仍按 assistant 展示。 */
  kind?: 'conversation' | 'clarification' | 'system' | 'scenario' | 'proactive' | 'error';
  unread?: boolean;
  contextFingerprint?: string;
  /** R8：响应 contextFingerprint 与请求不一致时锁定该消息的全部副作用动作
   *  （卡片 apply/open/query、QuickPill、行级导航），仅只读证据展开豁免。 */
  actionsLocked?: boolean;
  /** 原始请求，用于错误结果一键重试。 */
  prompt?: string;
  alert?: AgentAlertRecord;
}

interface AgentContextValue {
  open: boolean;
  mode: 'dock' | 'drawer' | 'full';
  running: boolean;
  runStatus: AgentRunStatus;
  activeRun: AgentRun | null;
  voiceListening: boolean;
  voiceAvailable: boolean;
  messages: AgentMessage[];
  partialText: string;
  partialCards: AgentResultCard[];
  draft: string;
  context: AgentContextSnapshot;
  appliedFilterIds: ReadonlySet<string>;
  canUndo: boolean;
  canRedo: boolean;
  canUndoAlert: boolean;
  contextStale: boolean;
  unreadCount: number;
  setDraft: (value: string) => void;
  openAgent: (mode?: 'dock' | 'drawer' | 'full', prompt?: string | ({ text: string; intent?: AgentIntent; forecastDraft?: ForecastDraftInput } & ForecastContextInput)) => void;
  closeAgent: () => void;
  setMode: (mode: 'dock' | 'drawer' | 'full') => void;
  send: (text?: string, forecastDraft?: ForecastDraftInput, forecastContext?: ForecastContextInput, intent?: AgentIntent) => Promise<void>;
  /** R4：显式「应用范围并重跑」——先落地 patch（与 applyFilter 同一可撤销通道），
   *  再用合并 patch 后的 context 重跑指定意图，不能退化为纯筛选预览。 */
  rerunWithPatch: (text: string, intent: AgentIntent, patch: FilterPatch) => void;
  stop: () => void;
  newConversation: () => void;
  applyFilter: (card: FilterResultCard) => { ok: boolean; error?: string };
  applyAlertAction: (alertId: string, action: AlertAction) => { ok: boolean; error?: string };
  undoAlertAction: () => void;
  undoFilter: () => void;
  redoFilter: () => void;
  markRead: () => void;
  startVoice: () => Promise<void>;
}

const Ctx = createContext<AgentContextValue | null>(null);

const messageId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const ALERT_RECORDS_STORAGE = 'LPL.alert.records.v1';

function readAlertOverrides(): Record<string, Partial<AlertRecord>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ALERT_RECORDS_STORAGE);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Partial<AlertRecord>> : {};
  } catch { return {}; }
}

function publishAlertOverrides(overrides: Record<string, Partial<AlertRecord>>): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ALERT_RECORDS_STORAGE, JSON.stringify(overrides)); } catch { /* local-only fallback */ }
  window.dispatchEvent(new CustomEvent('pricelens:alert-records-updated'));
}

function alertRecords(alerts: ReturnType<typeof useAlerts>, state: FiltersState, page: string, overrides: Readonly<Record<string, Partial<AlertRecord>>> = {}) {
  const cfg = {
    subs: state.alertSubs,
    enabled: state.alertTypes,
    thresholds: state.alertThresholds,
    products: state.alertProducts,
    currency: state.currency,
    scope: { countryCode: state.countryCode, industry: state.industry },
    platform: state.platform,
  };
  const fingerprint = agentContextFingerprint(state, page);
  return materializeAlertRecords(alerts, cfg, overrides, { contextFingerprint: fingerprint }).map((record) => {
    const structured = alertAgentContextOf(record);
    return {
      key: record.key,
      alertId: structured.alertId,
      seriesKey: record.seriesKey,
      type: record.type,
      brand: record.brand,
      modelName: record.modelName,
      romram: record.romram,
      weekLabel: record.weekLabel,
      weekId: record.weekId,
      // 缺价保持 null；0 是有效的数值语义，不能拿来冒充“暂无价格”。
      price: record.price ?? null,
      wowPct: record.wowPct,
      promoDeltaPp: record.promoDeltaPp,
      gapPct: record.gapPct,
      gapLowPlatform: record.gapLowPlatform,
      gapHighPlatform: record.gapHighPlatform,
      gapLowPrice: record.gapLowPrice,
      gapHighPrice: record.gapHighPrice,
      isOwn: record.isOwn,
      lifecycle: structured.lifecycle,
      priority: structured.priority,
      priorityScore: record.priorityScore,
      threshold: structured.threshold,
      ruleVersion: structured.ruleVersion,
      dataVersion: structured.dataVersion,
      contextFingerprint: structured.contextFingerprint,
      evidenceIds: structured.evidenceIds,
      evidence: record.evidence.map((item) => ({ id: item.id, label: item.label, detail: item.detail, timestamp: item.capturedAt, source: item.kind })),
      evidenceStatus: record.evidenceStatus,
      countryCode: state.countryCode,
    };
  });
}

function alertTypeLabel(type: string): string {
  return ({ 'price-change': '调价', promo: '折扣', 'platform-gap': '平台价差', 'own-gap': '档位间距' } as Record<string, string>)[type] ?? type;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { page } = usePage();
  const { state, actions } = useFilters();
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'dock' | 'drawer' | 'full'>('dock');
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<AgentRunStatus>('idle');
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [partialText, setPartialText] = useState('');
  const [partialCards, setPartialCards] = useState<AgentResultCard[]>([]);
  const [draft, setDraft] = useState('');
  const [appliedFilterIds, setAppliedFilterIds] = useState<ReadonlySet<string>>(new Set());
  const [undoSnapshots, setUndoSnapshots] = useState<FiltersState[]>([]);
  const [redoSnapshots, setRedoSnapshots] = useState<FiltersState[]>([]);
  const [alertOverrides, setAlertOverrides] = useState<Record<string, Partial<AlertRecord>>>(() => readAlertOverrides());
  const [alertUndoSnapshots, setAlertUndoSnapshots] = useState<Record<string, Partial<AlertRecord>>[]>([]);
  const controller = useRef<AbortController | null>(null);
  const contextRef = useRef<AgentContextSnapshot | null>(null);
  // 远端服务即使收到 abort 也可能晚到；序号让旧响应无法覆盖新会话。
  const runSequence = useRef(0);
  const streamSequence = useRef(0);
  const pendingIntent = useRef<AgentIntent | undefined>(undefined);
  const pendingForecastDraft = useRef<ForecastDraftInput | undefined>(undefined);
  const pendingForecastContext = useRef<ForecastContextInput | undefined>(undefined);
  const seenProactiveAlerts = useRef<Set<string>>(new Set());
  const agentClient = useMemo(() => defaultAgentClient(), []);
  const voice = useMemo<VoiceInputAdapter>(() => defaultVoiceAdapter(), []);
  const context = useMemo(() => buildAgentContext(page, state, alertRecords(alerts, state, page, alertOverrides)), [alertOverrides, alerts, page, state]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => {
    const onExternalAlertUpdate = () => setAlertOverrides(readAlertOverrides());
    window.addEventListener('pricelens:alert-records-updated', onExternalAlertUpdate);
    return () => window.removeEventListener('pricelens:alert-records-updated', onExternalAlertUpdate);
  }, []);
  const appendMessage = useCallback((message: AgentMessage) => {
    // 长时间使用面板时保留最近 100 条，避免对话和证据卡无限增长。
    setMessages((prev) => [...prev, message].slice(-100));
  }, []);

  // 任意页面都把每个新事件推送到同一条 Agent 消息流；面板关闭时只增加未读数。
  useEffect(() => {
    const latest = alertRecords(alerts, state, page)[0];
    if (!latest || seenProactiveAlerts.current.has(latest.key)) return;
    seenProactiveAlerts.current.add(latest.key);
    appendMessage({
      id: messageId('proactive'),
      role: 'assistant',
      text: `检测到新的${alertTypeLabel(latest.type)}预警：${latest.brand} ${latest.modelName} · ${latest.weekLabel}。现价 ${latest.price ?? '—'}${latest.threshold != null ? ` · 阈值 ${latest.threshold * 100}%` : ''} · ${latest.evidenceStatus === 'verified' ? '证据已核验' : '证据待核查'}。`,
      kind: 'proactive',
      alert: latest,
      unread: !open,
      contextFingerprint: context.fingerprint,
      createdAt: new Date().toISOString(),
    });
  }, [alerts, appendMessage, context.fingerprint, open, page, state]);

  const openAgent = useCallback((nextMode: 'dock' | 'drawer' | 'full' = 'dock', prompt?: string | ({ text: string; intent?: AgentIntent; forecastDraft?: ForecastDraftInput } & ForecastContextInput)) => {
    setMode(nextMode); setOpen(true);
    setMessages((prev) => prev.map((message) => message.unread ? { ...message, unread: false } : message));
    pendingIntent.current = undefined;
    pendingForecastDraft.current = undefined;
    pendingForecastContext.current = undefined;
    if (prompt) {
      pendingIntent.current = typeof prompt === 'string' ? undefined : prompt.intent;
      pendingForecastDraft.current = typeof prompt === 'string' ? undefined : prompt.forecastDraft;
      pendingForecastContext.current = typeof prompt === 'string' ? undefined : { forecastSnapshot: prompt.forecastSnapshot, forecastDataset: prompt.forecastDataset };
      setDraft(typeof prompt === 'string' ? prompt : prompt.text);
    }
  }, []);
  // 允许运行中折叠面板，查询继续在后台执行；launcher 会保留运行指示。
  const closeAgent = useCallback(() => { setOpen(false); }, []);

  // runSend 允许携带合并 patch 后的 context（R4 重跑路径）；常规 send 仍用当前 context。
  const runSend = useCallback(async (runContext: AgentContextSnapshot, value?: string, forecastDraft?: ForecastDraftInput, forecastContext?: ForecastContextInput, requestedIntent?: AgentIntent) => {
    const text = (value ?? draft).trim();
    if (!text || running) return;
    setDraft('');
    const requestContextFingerprint = runContext.fingerprint;
    appendMessage({ id: messageId('user'), role: 'user', text, prompt: text, kind: 'conversation', unread: false, contextFingerprint: requestContextFingerprint, createdAt: new Date().toISOString() });
    const explicitIntent = requestedIntent ?? pendingIntent.current;
    const explicitForecastDraft = forecastDraft ?? pendingForecastDraft.current;
    const explicitForecastContext = forecastContext ?? pendingForecastContext.current;
    pendingIntent.current = undefined;
    pendingForecastDraft.current = undefined;
    pendingForecastContext.current = undefined;
    const run = new AbortController();
    const runId = ++runSequence.current;
    const agentRunId = messageId('run');
    const startedAt = new Date().toISOString();
    controller.current = run; streamSequence.current = 0; setRunning(true); setOpen(true); setRunStatus('parsing'); setPartialText(''); setPartialCards([]);
    setActiveRun({ id: agentRunId, requestId: messageId('request'), status: 'parsing', startedAt, updatedAt: startedAt, context: runContext, events: [{ id: messageId('event'), runId: agentRunId, sequence: 1, type: 'run.started', status: 'parsing', timestamp: startedAt, message: '已接收请求', provenance: runContext.provenance }] });
    try {
      setRunStatus('tool_running');
      setActiveRun((prev) => prev ? { ...prev, status: 'tool_running', updatedAt: new Date().toISOString(), events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'step.started', status: 'tool_running', timestamp: new Date().toISOString(), message: '正在读取确定性价格工具', tool: 'series.query', provenance: runContext.provenance }] } : prev);
      const baseline = await runAgent(text, runContext, run.signal, explicitIntent, explicitForecastDraft, explicitForecastContext?.forecastSnapshot, explicitForecastContext?.forecastDataset);
      setRunStatus('planning');
      setActiveRun((prev) => prev ? { ...prev, status: 'planning', updatedAt: new Date().toISOString(), events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'run.status', status: 'planning', timestamp: new Date().toISOString(), message: '正在编排确定性工具', provenance: runContext.provenance }] } : prev);
      const raw = await agentClient.run({ text, context: runContext, clientRequestId: messageId('run'), runId: agentRunId, intent: explicitIntent, forecastDraft: explicitForecastDraft, forecastSnapshot: explicitForecastContext?.forecastSnapshot, forecastDataset: explicitForecastContext?.forecastDataset, baseline }, run.signal, (event) => {
        if (runSequence.current !== runId) return;
        if (event.runId !== agentRunId) return;
        if (event.sequence <= streamSequence.current) return;
        streamSequence.current = event.sequence;
        setPartialText((prev) => event.type === 'text.delta' ? `${prev}${event.delta ?? event.text ?? ''}` : prev);
        setPartialCards((prev) => {
          if (event.type === 'card.ready' && event.card) {
            const trusted = baseline.cards.find((card) => card.id === event.card?.id);
            return trusted ? [...prev.filter((card) => card.id !== trusted.id), trusted] : prev;
          }
          if (event.type === 'card.patch' && event.cardId) {
            const trusted = baseline.cards.find((card) => card.id === event.cardId);
            return trusted ? [...prev.filter((card) => card.id !== trusted.id), trusted] : prev;
          }
          return prev;
        });
        setActiveRun((prev) => prev ? { ...prev, status: event.status ?? prev.status, updatedAt: event.timestamp, events: [...prev.events, event] } : prev);
        if (event.status && event.status !== 'completed') setRunStatus(event.status);
      });
      if (runSequence.current !== runId) return;
      const responseFingerprintStale = raw.contextFingerprint !== requestContextFingerprint;
      const requestFingerprintStale = Boolean(contextRef.current && contextRef.current.fingerprint !== requestContextFingerprint);
      const stale = responseFingerprintStale || requestFingerprintStale || raw.factGuard?.status === 'stale_context';
      // 运行成功但零结果卡 → empty：不是失败，也不是口径澄清，UI 提供「调整范围」动作。
      const nextStatus: AgentRunStatus = stale ? 'stale_context' : raw.intent === 'clarify' ? 'clarification_required' : raw.cards.length ? 'completed' : 'empty';
      // R3 终态收敛：远端流式响应可能残留 running/queued/waiting_for_approval 的
      // 工具步骤；进入终态后历史消息里的工具卡必须全部呈现终态，不留「运行中」。
      // R8：响应指纹与请求不一致时 factGuard 强制标 stale_context，结果可查看但动作锁定。
      const response: AgentResponse = {
        ...raw,
        steps: finalizeStepsForTerminalRun(raw.steps, nextStatus),
        ...(responseFingerprintStale ? { factGuard: { status: 'stale_context' as const, message: raw.factGuard?.message ?? '响应的筛选上下文与请求不一致，结果仅供参考，动作已锁定。' } } : {}),
      };
      setRunStatus(nextStatus);
      setActiveRun((prev) => {
        if (!prev) return prev;
        const suppressCompletion = stale || response.intent === 'clarify';
        // R8：指纹不一致 / 需澄清的运行绝不以 run.completed 收尾——远端流里先到的
        // run.completed 事件一并剔除，时间线只保留 run.status(stale_context) 收尾。
        const baseEvents = suppressCompletion ? prev.events.filter((event) => event.type !== 'run.completed') : prev.events;
        const completionEvent = suppressCompletion ? null : { id: messageId('event'), runId: prev.id, sequence: baseEvents.length + 1, type: 'run.completed' as const, status: nextStatus, timestamp: new Date().toISOString(), message: '运行完成', provenance: response.provenance ?? runContext.provenance };
        const events = completionEvent ? (baseEvents.some((event) => event.type === 'run.completed') ? baseEvents : [...baseEvents, completionEvent]) : [...baseEvents, { id: messageId('event'), runId: prev.id, sequence: baseEvents.length + 1, type: 'run.status' as const, status: nextStatus, timestamp: new Date().toISOString(), message: stale ? '筛选上下文已变化，结果可查看但需要重新确认口径' : '需要补充查询口径', provenance: response.provenance ?? runContext.provenance }];
        return { ...prev, status: nextStatus, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), response, events };
      });
      const messageKind: AgentMessage['kind'] = response.intent === 'clarify' ? 'clarification' : /量价预测|预测|情景/.test(text) ? 'scenario' : 'conversation';
      appendMessage({ id: messageId('assistant'), role: 'assistant', text: response.summary, response, prompt: text, kind: messageKind, unread: true, contextFingerprint: requestContextFingerprint, actionsLocked: responseFingerprintStale, createdAt: new Date().toISOString() });
    } catch (error) {
      if (runSequence.current !== runId) return;
      // R3（二审）：只有用户主动 stop（controller.abort / runAgent 对 abort 的
      // 取消）才落 cancelled；普通异常一律 failed——上一轮 stop 残留的标记不再
      // 参与判定，避免把服务故障误标成「已取消」。取消异常在浏览器里是
      // DOMException（不是 Error 子类），必须按 error.name 判定，不能用 instanceof。
      const cancelled = typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
      const rawMessage = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
      const messageText = typeof rawMessage === 'string' && rawMessage ? rawMessage : 'Agent 服务暂时不可用。';
      const nextStatus: AgentRunStatus = cancelled ? 'cancelled' : 'failed';
      setRunStatus(nextStatus);
      // 失败/取消同样收敛终态：activeRun 落 completedAt + 终态事件；该消息不带
      // response（无工具卡可残留），流式残留的 partial 文本/卡在 finally 清空。
      setActiveRun((prev) => prev ? { ...prev, status: nextStatus, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), error: { message: messageText }, events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: cancelled ? 'run.cancelled' : 'run.failed', status: nextStatus, timestamp: new Date().toISOString(), message: messageText, provenance: runContext.provenance }] } : prev);
      appendMessage({ id: messageId('assistant'), role: 'assistant', text: cancelled ? '已取消这次查询。' : `这次运行没有完成：${messageText}`, prompt: text, kind: cancelled ? 'system' : 'error', unread: true, createdAt: new Date().toISOString() });
    } finally {
      // R3：失败/取消终态不留流式残留——partial 文本与卡立即清空（健康终态的消息
      // 已带完整 response，步骤经 finalizeStepsForTerminalRun 收敛）。
      setPartialText('');
      setPartialCards([]);
      if (runSequence.current === runId) { controller.current = null; setRunning(false); }
    }
  }, [agentClient, appendMessage, draft, running]);

  const send = useCallback((value?: string, forecastDraft?: ForecastDraftInput, forecastContext?: ForecastContextInput, requestedIntent?: AgentIntent) => runSend(context, value, forecastDraft, forecastContext, requestedIntent), [context, runSend]);

  /** R4：显式「应用范围并重跑」入口。空结果卡的「调整范围 · 最近 12 周」等动作
   *  必须真正落地新范围并按指定意图重跑（如 price_advantage），不能被误路由成
   *  只生成预览的纯 filter；重跑使用合并 patch 后的 context，既不读旧 state，
   *  也不会因 fingerprint 变化把新结果误标为过期口径。 */
  const rerunWithPatch = useCallback((text: string, intent: AgentIntent, patch: FilterPatch) => {
    if (running) return;
    const validation = validateFilterPatch(patch);
    if (!validation.valid) return;
    const nextPatch = patch.mains ? { ...patch, mains: clampMains(patch.mains) } : patch;
    const mergedState: FiltersState = { ...state, ...nextPatch };
    const mergedContext = buildAgentContext(page, mergedState, alertRecords(alerts, mergedState, page, alertOverrides));
    // 与 applyFilter 同一写入通道：留撤销快照，用户可一键回退。
    setUndoSnapshots((prev) => [...prev, state].slice(-5));
    setRedoSnapshots([]);
    actions.set(nextPatch);
    void runSend(mergedContext, text, undefined, undefined, intent);
  }, [actions, alertOverrides, alerts, page, runSend, running, state]);

  const stop = useCallback(() => {
    runSequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    // 立刻允许下一次提问；被取消的旧响应由 runSequence 丢弃。
    setRunning(false);
    setRunStatus('cancelled');
    setActiveRun((prev) => prev ? {
      ...prev,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      events: [...prev.events, {
        id: messageId('event'),
        runId: prev.id,
        sequence: prev.events.length + 1,
        type: 'run.cancelled' as const,
        status: 'cancelled' as const,
        timestamp: new Date().toISOString(),
        message: '用户取消运行',
        provenance: prev.context.provenance,
      }],
    } : prev);
  }, []);
  const newConversation = useCallback(() => { if (!running) { setMessages([]); setDraft(''); setUndoSnapshots([]); setRedoSnapshots([]); setAlertUndoSnapshots([]); setAppliedFilterIds(new Set()); setActiveRun(null); setRunStatus('idle'); } }, [running]);

  const applyFilter = useCallback((card: FilterResultCard) => {
    const validation = validateFilterPatch(card.patch);
    if (!validation.valid) return { ok: false, error: validation.errors.join('；') };
    if (card.contextFingerprint && card.contextFingerprint !== context.fingerprint) return { ok: false, error: '当前筛选口径已变化，请重新生成预览。' };
    setUndoSnapshots((prev) => [...prev, state].slice(-5));
    setRedoSnapshots([]);
    actions.set(card.patch.mains ? { ...card.patch, mains: clampMains(card.patch.mains) } : card.patch);
    setAppliedFilterIds((prev) => new Set([...prev, card.id]));
    return { ok: true };
  }, [actions, context.fingerprint, state]);

  const applyAlertAction = useCallback((alertId: string, action: AlertAction) => {
    const cfg = {
      subs: state.alertSubs,
      enabled: state.alertTypes,
      thresholds: state.alertThresholds,
      products: state.alertProducts,
      currency: state.currency,
      scope: { countryCode: state.countryCode, industry: state.industry },
      platform: state.platform,
    };
    const record = materializeAlertRecords(alerts, cfg, alertOverrides, { contextFingerprint: context.fingerprint }).find((item) => item.alertId === alertId);
    if (!record) return { ok: false, error: '当前预警已不在此口径，请重新读取。' };
    const next = transitionAlertRecord(record, action);
    if (!next) return { ok: false, error: '当前预警状态已变化，请重新读取后再操作。' };
    const merged = { ...alertOverrides, [alertId]: next };
    setAlertUndoSnapshots((prev) => [...prev, alertOverrides].slice(-5));
    setAlertOverrides(merged);
    publishAlertOverrides(merged);
    return { ok: true };
  }, [alertOverrides, alerts, context.fingerprint, state]);

  const undoAlertAction = useCallback(() => {
    const snapshot = alertUndoSnapshots[alertUndoSnapshots.length - 1];
    if (!snapshot) return;
    setAlertOverrides(snapshot);
    setAlertUndoSnapshots(alertUndoSnapshots.slice(0, -1));
    publishAlertOverrides(snapshot);
  }, [alertUndoSnapshots]);

  const undoFilter = useCallback(() => {
    const snapshot = undoSnapshots[undoSnapshots.length - 1];
    if (!snapshot) return;
    actions.set(snapshot);
    setUndoSnapshots(undoSnapshots.slice(0, -1));
    setRedoSnapshots((prev) => [...prev, state].slice(-5));
  }, [actions, state, undoSnapshots]);

  const redoFilter = useCallback(() => {
    const snapshot = redoSnapshots[redoSnapshots.length - 1];
    if (!snapshot) return;
    setUndoSnapshots((prev) => [...prev, state].slice(-5));
    actions.set(snapshot);
    setRedoSnapshots(redoSnapshots.slice(0, -1));
  }, [actions, redoSnapshots, state]);

  const markRead = useCallback(() => {
    setMessages((prev) => prev.some((message) => message.unread) ? prev.map((message) => ({ ...message, unread: false })) : prev);
  }, []);

  const startVoice = useCallback(async () => {
    if (!voice.available || voiceListening || running) return;
    setVoiceListening(true);
    try { const result = await voice.listen(); setDraft((prev) => `${prev}${prev ? ' ' : ''}${result.transcript}`); }
    catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        const detail = error instanceof Error && error.message ? error.message : '浏览器未返回语音结果。';
        appendMessage({ id: messageId('assistant'), role: 'assistant', text: `语音输入失败：${detail}`, kind: 'error', unread: true, createdAt: new Date().toISOString() });
      }
    }
    finally { setVoiceListening(false); }
  }, [appendMessage, running, voice, voiceListening]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openAgent('dock'); }
      if (event.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, running, openAgent]);

  const value: AgentContextValue = {
    open, mode, running, runStatus, activeRun, voiceListening, voiceAvailable: voice.available, messages, partialText, partialCards, draft, context, appliedFilterIds, canUndo: undoSnapshots.length > 0, canRedo: redoSnapshots.length > 0, canUndoAlert: alertUndoSnapshots.length > 0,
    contextStale: messages.some((message) => Boolean(message.contextFingerprint && message.contextFingerprint !== context.fingerprint)),
    unreadCount: messages.filter((message) => message.unread).length,
    setDraft, openAgent, closeAgent, setMode, send, rerunWithPatch, stop, newConversation, applyFilter, applyAlertAction, undoAlertAction, undoFilter, redoFilter, markRead, startVoice,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
/**
 * 门面公共视图（2026-11-07 整合）：两线 context 值的结构化并集——公共字段取
 * 迭代线形状（本文件 AgentContextValue），迭代线多出的流式呈现/预警撤销/重跑
 * 字段标可选（稳定栈 useAgent 不含这些键，而消费它们的只有迭代 AgentPanel，
 * 稳定构建不渲染）；两线同名方法的参数类型来自各自的 contracts（结构相近但
 * 不是同一类型），门面按「参数取交集语义、返回取并集」以本文件形状声明，
 * TS 结构化兼容各自实现。
 */
export type AgentContextFacade = AgentContextValue & {
  partialText?: AgentContextValue['partialText'];
  partialCards?: AgentContextValue['partialCards'];
  canUndoAlert?: AgentContextValue['canUndoAlert'];
  applyAlertAction?: AgentContextValue['applyAlertAction'];
  undoAlertAction?: AgentContextValue['undoAlertAction'];
  rerunWithPatch?: AgentContextValue['rerunWithPatch'];
};

export function useAgent(): AgentContextFacade {
  // 2026-11-07 整合：稳定构建下 Agent 栈 = 稳定线实现（AgentProviderStable +
  // CopilotStable），页面消费者（ForecastPage / AlertsPage / IntelligenceCenter /
  // 稳定栈自身）统一经本门面取值——转发到稳定栈的 useAgent（同一 context），
  // 页面代码不分通道；迭代构建走本文件自己的 Provider/context。
  if (STABLE) return useAgentStable() as unknown as AgentContextFacade;
  const value = useContext(Ctx);
  if (!value) throw new Error('useAgent must be used inside AgentProvider');
  return value as AgentContextFacade;
}

export type { AgentResultCard };
