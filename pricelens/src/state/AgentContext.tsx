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
  type AgentEvent,
  type AgentResultCard,
  type ForecastContextInput,
  type ForecastDraftInput,
  type FilterResultCard,
  type VoiceInputAdapter,
} from '../agent';
import type { FiltersState } from './filtersTypes';
import { materializeAlertRecords, alertAgentContextOf } from '../dataModel/alertLifecycle';

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
  /** Incremental assistant output is kept separate from the final response. */
  partialText?: string;
  partialCards?: AgentResultCard[];
  provider?: AgentResponse['provider'];
  fallbackReason?: string;
  applyError?: string;
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
  draft: string;
  context: AgentContextSnapshot;
  appliedFilterIds: ReadonlySet<string>;
  canUndo: boolean;
  canRedo: boolean;
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
  undoFilter: () => void;
  redoFilter: () => void;
  markRead: () => void;
  startVoice: (onTranscript?: (transcript: string) => void) => Promise<void>;
}

const Ctx = createContext<AgentContextValue | null>(null);

const messageId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
type AgentEventLike = AgentEvent & { delta?: string; card?: Partial<AgentResultCard> };

/**
 * R3：终态收敛工具活动卡。流事件创建的工具卡（id = tool-<toolName>）与
 * 完成态步骤卡（id = tool-<stepId>）id 天然对不上——先用稳定 step id / 工具名
 * 合并，再把仍处 queued/running 的残留卡标记完成/取消，任何终态都不再显示「运行中」。
 */
const mergeCompletedToolCards = (cards: AgentResultCard[], completed: AgentResultCard[]): AgentResultCard[] => {
  const next = [...cards];
  for (const toolCard of completed) {
    if (toolCard.kind !== 'tool_call') continue;
    const index = next.findIndex((card) => card.id === toolCard.id
      || (card.kind === 'tool_call' && card.tool === toolCard.tool && card.status !== 'success' && card.status !== 'failed'));
    if (index >= 0) next[index] = toolCard;
    else next.push(toolCard);
  }
  return next;
};

const finalizeLiveToolCards = (cards: AgentResultCard[], outcome: 'success' | 'cancelled'): AgentResultCard[] =>
  cards.map((card) => {
    if (card.kind !== 'tool_call' || (card.status !== 'running' && card.status !== 'queued')) return card;
    return outcome === 'success'
      ? { ...card, status: 'success' as const, outputSummary: card.outputSummary ?? '已随本次运行完成' }
      : { ...card, status: 'cancelled' as const, outputSummary: card.outputSummary ?? '已随本次运行终止' };
  });

function alertRecords(alerts: ReturnType<typeof useAlerts>, state: FiltersState, page: string) {
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
  return materializeAlertRecords(alerts, cfg, {}, { contextFingerprint: fingerprint }).map((record) => {
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
      ownGapPct: record.ownGapPct,
      isOwn: record.isOwn,
      lifecycle: structured.lifecycle,
      priority: structured.priority,
      priorityScore: record.priorityScore,
      threshold: structured.threshold,
      ruleVersion: structured.ruleVersion,
      dataVersion: structured.dataVersion,
      contextFingerprint: structured.contextFingerprint,
      evidenceIds: structured.evidenceIds,
      evidenceStatus: record.evidenceStatus,
      evidence: record.evidence.map((item) => ({
        id: item.id,
        label: item.label,
        detail: item.detail,
        source: item.kind === 'source' ? '平台价格事实' : item.kind === 'product' ? '商品价格事实' : '预警规则快照',
        href: item.href,
        timestamp: item.capturedAt,
      })),
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
  const [draft, setDraft] = useState('');
  const [appliedFilterIds, setAppliedFilterIds] = useState<ReadonlySet<string>>(new Set());
  const [undoSnapshots, setUndoSnapshots] = useState<FiltersState[]>([]);
  const [redoSnapshots, setRedoSnapshots] = useState<FiltersState[]>([]);
  const controller = useRef<AbortController | null>(null);
  const contextRef = useRef<AgentContextSnapshot | null>(null);
  // 远端服务即使收到 abort 也可能晚到；序号让旧响应无法覆盖新会话。
  const runSequence = useRef(0);
  const cancelRequested = useRef(false);
  const pendingIntent = useRef<AgentIntent | undefined>(undefined);
  const pendingForecastDraft = useRef<ForecastDraftInput | undefined>(undefined);
  const pendingForecastContext = useRef<ForecastContextInput | undefined>(undefined);
  const activeMessageId = useRef<string | null>(null);
  const seenProactiveAlerts = useRef<Set<string>>(new Set());
  const agentClient = useMemo(() => defaultAgentClient(), []);
  const voice = useMemo<VoiceInputAdapter>(() => defaultVoiceAdapter(), []);
  const context = useMemo(() => buildAgentContext(page, state, alertRecords(alerts, state, page)), [alerts, page, state]);
  useEffect(() => { contextRef.current = context; }, [context]);
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
    const assistantMessageId = messageId('assistant');
    activeMessageId.current = assistantMessageId;
    appendMessage({ id: assistantMessageId, role: 'assistant', text: '', partialText: '', partialCards: [], kind: 'conversation', unread: false, contextFingerprint: requestContextFingerprint, prompt: text, createdAt: startedAt });
    controller.current = run; cancelRequested.current = false; setRunning(true); setOpen(true); setRunStatus('parsing');
    setActiveRun({ id: agentRunId, requestId: messageId('request'), status: 'parsing', startedAt, updatedAt: startedAt, context, events: [{ id: messageId('event'), runId: agentRunId, sequence: 1, type: 'run.started', status: 'parsing', timestamp: startedAt, message: '已接收请求', provenance: context.provenance }] });
    try {
      setRunStatus('tool_running');
      setActiveRun((prev) => prev ? { ...prev, status: 'tool_running', updatedAt: new Date().toISOString(), events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'step.started', status: 'tool_running', timestamp: new Date().toISOString(), message: '正在读取确定性价格工具', tool: 'series.query', provenance: context.provenance }] } : prev);
      const baseline = await runAgent(text, context, run.signal, explicitIntent, explicitForecastDraft, explicitForecastContext?.forecastSnapshot, explicitForecastContext?.forecastDataset);
      setRunStatus('planning');
      setActiveRun((prev) => prev ? { ...prev, status: 'planning', updatedAt: new Date().toISOString(), events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'run.status', status: 'planning', timestamp: new Date().toISOString(), message: '正在编排确定性工具', provenance: context.provenance }] } : prev);
      const response = await agentClient.run({ text, context, clientRequestId: messageId('run'), runId: agentRunId, intent: explicitIntent, forecastDraft: explicitForecastDraft, forecastSnapshot: explicitForecastContext?.forecastSnapshot, forecastDataset: explicitForecastContext?.forecastDataset, baseline }, run.signal, (event) => {
        if (runSequence.current !== runId) return;
        setActiveRun((prev) => prev ? { ...prev, status: event.status ?? prev.status, updatedAt: event.timestamp, events: [...prev.events, event] } : prev);
        if (event.status && event.status !== 'completed') setRunStatus(event.status);
        const candidate = event as AgentEventLike;
        if (candidate.type === 'text.delta' && typeof candidate.delta === 'string') {
          setMessages((prev) => prev.map((message) => message.id === assistantMessageId ? { ...message, partialText: `${message.partialText ?? ''}${candidate.delta}`, text: `${message.partialText ?? ''}${candidate.delta}` } : message));
        }
        if (candidate.type === 'card.patch' && candidate.card && typeof candidate.card === 'object') {
          setMessages((prev) => prev.map((message) => {
            if (message.id !== assistantMessageId) return message;
            const cards = [...(message.partialCards ?? [])];
            const patch = candidate.card as AgentResultCard;
            const index = cards.findIndex((card) => card.id === patch.id);
            if (index >= 0) cards[index] = { ...cards[index], ...patch } as AgentResultCard;
            else cards.push(patch);
            return { ...message, partialCards: cards };
          }));
        }
        const toolName = candidate.tool ?? (candidate.message?.includes('远端 Agent 服务不可达') ? 'remote.agent' : undefined);
        if (toolName && (candidate.type === 'step.started' || candidate.type === 'step.updated' || candidate.type === 'run.failed')) {
          setMessages((prev) => prev.map((message) => {
            if (message.id !== assistantMessageId) return message;
            const cards = [...(message.partialCards ?? [])];
            const id = `tool-${candidate.stepId ?? toolName}`;
            const status: import('../agent').ToolCallStatus = candidate.message?.includes('远端 Agent 服务不可达') || candidate.type === 'run.failed' || candidate.status === 'failed' ? 'failed' : candidate.status === 'completed' ? 'success' : candidate.type === 'step.updated' ? 'running' : 'queued';
            const inputSummary = candidate.message?.includes('远端 Agent 服务不可达') ? (message.prompt ?? '价格优势') : (candidate.message ?? message.prompt ?? '当前筛选范围');
            const toolCard = { kind: 'tool_call' as const, id, tool: toolName, status, inputSummary, outputSummary: candidate.status === 'completed' ? '已返回结构化结果' : undefined, error: status === 'failed' ? candidate.message : undefined };
            const index = cards.findIndex((card) => card.id === id);
            if (index >= 0) cards[index] = { ...cards[index], ...toolCard } as AgentResultCard;
            else cards.push(toolCard);
            return { ...message, partialCards: cards };
          }));
        }
        if (candidate.provenance?.provider || candidate.message?.includes('回退')) {
          setMessages((prev) => prev.map((message) => message.id === assistantMessageId ? { ...message, provider: candidate.provenance?.provider ? { name: candidate.provenance.provider, model: candidate.provenance.model ?? 'unknown' } : message.provider, fallbackReason: candidate.message?.includes('回退') ? candidate.message : message.fallbackReason } : message));
        }
      });
      if (runSequence.current !== runId) return;
      const stale = contextRef.current ? contextRef.current.fingerprint !== requestContextFingerprint : false;
      const responseFingerprintMismatch = response.contextFingerprint !== requestContextFingerprint;
      const nextStatus: AgentRunStatus = stale || responseFingerprintMismatch ? 'stale_context' : response.intent === 'clarify' ? 'clarification_required' : 'completed';
      setRunStatus(nextStatus);
      setActiveRun((prev) => {
        if (!prev) return prev;
        const completionEvent = stale || response.intent === 'clarify' ? null : { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'run.completed' as const, status: nextStatus, timestamp: new Date().toISOString(), message: '运行完成', provenance: response.provenance ?? context.provenance };
        const events = completionEvent && prev.events.some((event) => event.type === 'run.completed') ? prev.events : completionEvent ? [...prev.events, completionEvent] : [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: 'run.status' as const, status: nextStatus, timestamp: new Date().toISOString(), message: stale ? '筛选上下文已变化，结果可查看但需要重新确认口径' : '需要补充查询口径', provenance: response.provenance ?? context.provenance }];
        return { ...prev, status: nextStatus, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), response, events };
      });
      const messageKind: AgentMessage['kind'] = response.intent === 'clarify' ? 'clarification' : /量价预测|预测|情景/.test(text) ? 'scenario' : 'conversation';
      setMessages((prev) => prev.map((message) => {
        if (message.id !== assistantMessageId) return message;
        const completedTools: AgentResultCard[] = response.steps.map((step) => ({ kind: 'tool_call' as const, id: `tool-${step.id}`, tool: step.tool, status: step.status === 'failed' ? 'failed' as const : 'success' as const, inputSummary: step.label, outputSummary: step.detail, durationMs: step.durationMs, error: step.status === 'failed' ? step.detail : undefined }));
        // R3：响应路径到达即终态——先按稳定 id/工具名合并完成态，再收敛残留
        // running/queued 工具卡，消息里不允许再出现「运行中」的工具活动卡。
        const partialCards = finalizeLiveToolCards(mergeCompletedToolCards(message.partialCards ?? [], completedTools), 'success');
        return { ...message, text: response.summary, response, partialText: undefined, partialCards, provider: response.provider, fallbackReason: response.fallbackReason ?? message.fallbackReason, kind: messageKind, unread: true, contextFingerprint: requestContextFingerprint };
      }));
    } catch (error) {
      if (runSequence.current !== runId) return;
      const aborted = error instanceof Error && error.name === 'AbortError';
      const messageText = error instanceof Error && error.message ? error.message : 'Agent 服务暂时不可用。';
      const nextStatus: AgentRunStatus = aborted || cancelRequested.current ? 'cancelled' : 'failed';
      setRunStatus(nextStatus);
      setActiveRun((prev) => prev ? { ...prev, status: nextStatus, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), error: { message: messageText }, events: [...prev.events, { id: messageId('event'), runId: prev.id, sequence: prev.events.length + 1, type: aborted || cancelRequested.current ? 'run.cancelled' : 'run.failed', status: nextStatus, timestamp: new Date().toISOString(), message: messageText, provenance: context.provenance }] } : prev);
      setMessages((prev) => prev.map((message) => message.id === assistantMessageId ? { ...message, text: aborted || cancelRequested.current ? '已取消这次查询。' : `这次运行没有完成：${messageText}`, partialText: undefined, partialCards: finalizeLiveToolCards(message.partialCards ?? [], 'cancelled'), prompt: text, kind: aborted || cancelRequested.current ? 'system' : 'error', unread: true } : message));
    } finally {
      if (runSequence.current === runId) { controller.current = null; activeMessageId.current = null; setRunning(false); }
    }
  }, [agentClient, appendMessage, context, draft, running]);

  const stop = useCallback(() => {
    cancelRequested.current = true;
    runSequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    // 取消后在途占位消息落成显式「已取消」状态（保留 prompt 供一键重试）；
    // runSequence 已自增，catch 分支不会再覆盖这条消息。
    const cancelledMessageId = activeMessageId.current;
    if (cancelledMessageId) {
      setMessages((prev) => prev.map((message) => message.id === cancelledMessageId && !message.response
        ? { ...message, text: '已取消这次查询。', partialText: undefined, partialCards: finalizeLiveToolCards(message.partialCards ?? [], 'cancelled'), kind: 'system', unread: true }
        : message));
    }
    // 立刻允许下一次提问；被取消的旧响应由 runSequence 丢弃。
    setRunning(false);
    setRunStatus('cancelled');
    activeMessageId.current = null;
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
  const newConversation = useCallback(() => { if (!running) { setMessages([]); setDraft(''); setUndoSnapshots([]); setRedoSnapshots([]); setAppliedFilterIds(new Set()); setActiveRun(null); setRunStatus('idle'); } }, [running]);

  const applyFilter = useCallback((card: FilterResultCard) => {
    const validation = validateFilterPatch(card.patch);
    if (!validation.valid) return { ok: false, error: validation.errors.join('；') };
    setUndoSnapshots((prev) => [...prev, state].slice(-5));
    setRedoSnapshots([]);
    actions.set(card.patch);
    setAppliedFilterIds((prev) => new Set([...prev, card.id]));
    return { ok: true };
  }, [actions, state]);

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

  const startVoice = useCallback(async (onTranscript?: (transcript: string) => void) => {
    if (!voice.available || voiceListening || running) return;
    setVoiceListening(true);
    try {
      const result = await voice.listen();
      if (onTranscript) onTranscript(result.transcript);
      else setDraft((prev) => `${prev}${prev ? ' ' : ''}${result.transcript}`);
    }
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
    open, mode, running, runStatus, activeRun, voiceListening, voiceAvailable: voice.available, messages, draft, context, appliedFilterIds, canUndo: undoSnapshots.length > 0, canRedo: redoSnapshots.length > 0,
    contextStale: messages.some((message) => Boolean(message.contextFingerprint && message.contextFingerprint !== context.fingerprint)),
    unreadCount: messages.filter((message) => message.unread).length,
    setDraft, openAgent, closeAgent, setMode, send, stop, newConversation, applyFilter, undoFilter, redoFilter, markRead, startVoice,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAgent(): AgentContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAgent must be used inside AgentProvider');
  return value;
}

export type { AgentResultCard };
