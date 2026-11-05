import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePage } from './PageContext';
import { useFilters } from './FiltersContext';
import { useAlerts } from '../components/AlertCenter';
import {
  buildAgentContext,
  contextFingerprint as agentContextFingerprint,
  defaultAgentClient,
  defaultVoiceAdapter,
  runAgent,
  validateFilterPatch,
  type AgentContextSnapshot,
  type AgentIntent,
  type AgentAlertRecord,
  type AgentRun,
  type AgentRunStatus,
  type AgentResponse,
  type AgentResultCard,
  type ForecastContextInput,
  type ForecastDraftInput,
  type FilterResultCard,
  type VoiceInputAdapter,
} from '../agent';
import type { FiltersState } from './filtersTypes';
import { clampMains } from './mainSelection';
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
  const cancelRequested = useRef(false);
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

  const send = useCallback(async (value?: string, forecastDraft?: ForecastDraftInput, forecastContext?: ForecastContextInput, requestedIntent?: AgentIntent) => {
    const text = (value ?? draft).trim();
    if (!text || running) return;
    setDraft('');
    const requestContextFingerprint = context.fingerprint;
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
    controller.current = run; cancelRequested.current = false; streamSequence.current = 0; setRunning(true); setOpen(true); setRunStatus('parsing'); setPartialText(''); setPartialCards([]);
    setActiveRun({ id: agentRunId, requestId: messageId('request'), status: 'parsing', startedAt, updatedAt: startedAt, context, events: [{ id: messageId('event'), runId: agentRunId, sequence: 1, type: 'run.started', status: 'parsing', timestamp: startedAt, message: '已接收请求', provenance: context.provenance }] });
    try {
      setRunStatus('tool_running');
      setActiveRun((prev) => prev ? { ...prev, status: 'tool_running', updatedAt: new Date().toISOString(), events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'step.started', status: 'tool_running', timestamp: new Date().toISOString(), message: '正在读取确定性价格工具', tool: 'series.query', provenance: context.provenance }] } : prev);
      const baseline = await runAgent(text, context, run.signal, explicitIntent, explicitForecastDraft, explicitForecastContext?.forecastSnapshot, explicitForecastContext?.forecastDataset);
      setRunStatus('planning');
      setActiveRun((prev) => prev ? { ...prev, status: 'planning', updatedAt: new Date().toISOString(), events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'run.status', status: 'planning', timestamp: new Date().toISOString(), message: '正在编排确定性工具', provenance: context.provenance }] } : prev);
      const response = await agentClient.run({ text, context, clientRequestId: messageId('run'), runId: agentRunId, intent: explicitIntent, forecastDraft: explicitForecastDraft, forecastSnapshot: explicitForecastContext?.forecastSnapshot, forecastDataset: explicitForecastContext?.forecastDataset, baseline }, run.signal, (event) => {
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
      const responseFingerprintStale = response.contextFingerprint !== requestContextFingerprint;
      const requestFingerprintStale = Boolean(contextRef.current && contextRef.current.fingerprint !== requestContextFingerprint);
      const stale = responseFingerprintStale || requestFingerprintStale || response.factGuard?.status === 'stale_context';
      const nextStatus: AgentRunStatus = stale ? 'stale_context' : response.intent === 'clarify' ? 'clarification_required' : 'completed';
      setRunStatus(nextStatus);
      setActiveRun((prev) => {
        if (!prev) return prev;
        const completionEvent = stale || response.intent === 'clarify' ? null : { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'run.completed' as const, status: nextStatus, timestamp: new Date().toISOString(), message: '运行完成', provenance: response.provenance ?? context.provenance };
        const events = completionEvent && prev.events.some((event) => event.type === 'run.completed') ? prev.events : completionEvent ? [...prev.events, completionEvent] : [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'run.status' as const, status: nextStatus, timestamp: new Date().toISOString(), message: stale ? '筛选上下文已变化，结果可查看但需要重新确认口径' : '需要补充查询口径', provenance: response.provenance ?? context.provenance }];
        return { ...prev, status: nextStatus, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), response, events };
      });
      const messageKind: AgentMessage['kind'] = response.intent === 'clarify' ? 'clarification' : /量价预测|预测|情景/.test(text) ? 'scenario' : 'conversation';
      appendMessage({ id: messageId('assistant'), role: 'assistant', text: response.summary, response, prompt: text, kind: messageKind, unread: true, contextFingerprint: requestContextFingerprint, createdAt: new Date().toISOString() });
    } catch (error) {
      if (runSequence.current !== runId) return;
      const aborted = error instanceof Error && error.name === 'AbortError';
      const messageText = error instanceof Error && error.message ? error.message : 'Agent 服务暂时不可用。';
      const nextStatus: AgentRunStatus = aborted || cancelRequested.current ? 'cancelled' : 'failed';
      setRunStatus(nextStatus);
      setActiveRun((prev) => prev ? { ...prev, status: nextStatus, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), error: { message: messageText }, events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: aborted || cancelRequested.current ? 'run.cancelled' : 'run.failed', status: nextStatus, timestamp: new Date().toISOString(), message: messageText, provenance: context.provenance }] } : prev);
      appendMessage({ id: messageId('assistant'), role: 'assistant', text: aborted || cancelRequested.current ? '已取消这次查询。' : `这次运行没有完成：${messageText}`, prompt: text, kind: aborted || cancelRequested.current ? 'system' : 'error', unread: true, createdAt: new Date().toISOString() });
    } finally {
      if (runSequence.current === runId) { controller.current = null; setRunning(false); }
    }
  }, [agentClient, appendMessage, context, draft, running]);

  const stop = useCallback(() => {
    cancelRequested.current = true;
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
    setDraft, openAgent, closeAgent, setMode, send, stop, newConversation, applyFilter, applyAlertAction, undoAlertAction, undoFilter, redoFilter, markRead, startVoice,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAgent(): AgentContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAgent must be used inside AgentProvider');
  return value;
}

export type { AgentResultCard };
