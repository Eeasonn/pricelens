import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePage } from './PageContext';
import { useFilters } from './FiltersContext';
import { useAlerts } from '../components/AlertCenter';
import {
  buildAgentContext,
  defaultAgentClient,
  defaultVoiceAdapter,
  runAgent,
  validateFilterPatch,
  type AgentContextSnapshot,
  type AgentResponse,
  type AgentResultCard,
  type FilterResultCard,
  type VoiceInputAdapter,
} from '../agent';
import type { FiltersState } from './filtersTypes';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  response?: AgentResponse;
  createdAt: string;
  /** 用于把系统提醒与普通对话区分开，旧消息默认仍按 assistant 展示。 */
  kind?: 'conversation' | 'proactive' | 'error';
  unread?: boolean;
  contextFingerprint?: string;
  /** 原始请求，用于错误结果一键重试。 */
  prompt?: string;
}

interface AgentContextValue {
  open: boolean;
  mode: 'dock' | 'full';
  running: boolean;
  voiceListening: boolean;
  voiceAvailable: boolean;
  messages: AgentMessage[];
  draft: string;
  context: AgentContextSnapshot;
  appliedFilterIds: ReadonlySet<string>;
  canUndo: boolean;
  unreadCount: number;
  setDraft: (value: string) => void;
  openAgent: (mode?: 'dock' | 'full', prompt?: string) => void;
  closeAgent: () => void;
  setMode: (mode: 'dock' | 'full') => void;
  send: (text?: string) => Promise<void>;
  stop: () => void;
  newConversation: () => void;
  applyFilter: (card: FilterResultCard) => { ok: boolean; error?: string };
  undoFilter: () => void;
  markRead: () => void;
  startVoice: () => Promise<void>;
}

const Ctx = createContext<AgentContextValue | null>(null);

const messageId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function alertRecords(alerts: ReturnType<typeof useAlerts>) {
  return alerts.map((a) => ({
    key: a.key,
    type: a.type,
    brand: a.brand,
    modelName: a.modelName,
    romram: a.romram,
    weekLabel: a.weekLabel,
    weekId: a.weekId,
    price: a.price ?? 0,
    wowPct: a.wowPct,
    promoDeltaPp: a.promoDeltaPp,
    gapPct: a.gapPct,
    gapLowPlatform: a.gapLowPlatform,
    gapHighPlatform: a.gapHighPlatform,
    gapLowPrice: a.gapLowPrice,
    gapHighPrice: a.gapHighPrice,
    isOwn: a.isOwn,
  }));
}

function alertTypeLabel(type: string): string {
  return ({ 'price-change': '调价', promo: '折扣', 'platform-gap': '平台价差', 'own-gap': '档位间距' } as Record<string, string>)[type] ?? type;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { page } = usePage();
  const { state, actions } = useFilters();
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'dock' | 'full'>('dock');
  const [running, setRunning] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [appliedFilterIds, setAppliedFilterIds] = useState<ReadonlySet<string>>(new Set());
  const [undoSnapshots, setUndoSnapshots] = useState<FiltersState[]>([]);
  const controller = useRef<AbortController | null>(null);
  const cancelRequested = useRef(false);
  const seenProactiveAlerts = useRef<Set<string>>(new Set());
  const agentClient = useMemo(() => defaultAgentClient(), []);
  const voice = useMemo<VoiceInputAdapter>(() => defaultVoiceAdapter(), []);
  const context = useMemo(() => buildAgentContext(page, state, alertRecords(alerts)), [alerts, page, state]);

  // 预警页只对每个事件推送一次轻量提醒；打开 Agent 后可继续追问，避免重复打扰。
  useEffect(() => {
    if (page !== 'alerts') return;
    const latest = alertRecords(alerts)[0];
    if (!latest || seenProactiveAlerts.current.has(latest.key)) return;
    seenProactiveAlerts.current.add(latest.key);
    setMessages((prev) => [...prev, { id: messageId('proactive'), role: 'assistant', text: `检测到新的${alertTypeLabel(latest.type)}预警：${latest.brand} ${latest.modelName} · ${latest.weekLabel}。输入“解释最新预警”查看触发事实和证据。`, kind: 'proactive', unread: !open, contextFingerprint: context.fingerprint, createdAt: new Date().toISOString() }]);
  }, [alerts, context.fingerprint, open, page]);

  const openAgent = useCallback((nextMode: 'dock' | 'full' = 'dock', prompt?: string) => {
    setMode(nextMode); setOpen(true);
    setMessages((prev) => prev.map((message) => message.unread ? { ...message, unread: false } : message));
    if (prompt) setDraft(prompt);
  }, []);
  // 允许运行中折叠面板，查询继续在后台执行；launcher 会保留运行指示。
  const closeAgent = useCallback(() => { setOpen(false); }, []);

  const send = useCallback(async (value?: string) => {
    const text = (value ?? draft).trim();
    if (!text || running) return;
    setDraft('');
    const requestContextFingerprint = context.fingerprint;
    setMessages((prev) => [...prev, { id: messageId('user'), role: 'user', text, prompt: text, kind: 'conversation', unread: false, contextFingerprint: requestContextFingerprint, createdAt: new Date().toISOString() }]);
    const run = new AbortController();
    controller.current = run; cancelRequested.current = false; setRunning(true); setOpen(true);
    try {
      const baseline = await runAgent(text, context, run.signal);
      const response = await agentClient.run({ text, context, clientRequestId: messageId('run'), baseline }, run.signal);
      setMessages((prev) => [...prev, { id: messageId('assistant'), role: 'assistant', text: response.summary, response, prompt: text, kind: 'conversation', unread: true, contextFingerprint: requestContextFingerprint, createdAt: new Date().toISOString() }]);
    } catch (error) {
      const aborted = (error as Error).name === 'AbortError';
      setMessages((prev) => [...prev, { id: messageId('assistant'), role: 'assistant', text: aborted || cancelRequested.current ? '已取消这次查询。' : `这次运行没有完成：${(error as Error).message || 'Agent 服务暂时不可用。'}`, prompt: text, kind: 'error', unread: true, createdAt: new Date().toISOString() }]);
    } finally { controller.current = null; setRunning(false); }
  }, [agentClient, context, draft, running]);

  const stop = useCallback(() => { cancelRequested.current = true; controller.current?.abort(); }, []);
  const newConversation = useCallback(() => { if (!running) { setMessages([]); setDraft(''); setUndoSnapshots([]); setAppliedFilterIds(new Set()); } }, [running]);

  const applyFilter = useCallback((card: FilterResultCard) => {
    const validation = validateFilterPatch(card.patch);
    if (!validation.valid) return { ok: false, error: validation.errors.join('；') };
    setUndoSnapshots((prev) => [...prev, state].slice(-5));
    actions.set(card.patch);
    setAppliedFilterIds((prev) => new Set([...prev, card.id]));
    return { ok: true };
  }, [actions, state]);

  const undoFilter = useCallback(() => {
    const snapshot = undoSnapshots[undoSnapshots.length - 1];
    if (!snapshot) return;
    actions.set(snapshot);
    setUndoSnapshots(undoSnapshots.slice(0, -1));
  }, [actions, undoSnapshots]);

  const markRead = useCallback(() => {
    setMessages((prev) => prev.some((message) => message.unread) ? prev.map((message) => ({ ...message, unread: false })) : prev);
  }, []);

  const startVoice = useCallback(async () => {
    if (!voice.available || voiceListening || running) return;
    setVoiceListening(true);
    try { const result = await voice.listen(); setDraft((prev) => `${prev}${prev ? ' ' : ''}${result.transcript}`); }
    catch (error) { if ((error as Error).name !== 'AbortError') setMessages((prev) => [...prev, { id: messageId('assistant'), role: 'assistant', text: `语音输入失败：${(error as Error).message || '浏览器未返回语音结果。'}`, kind: 'error', unread: true, createdAt: new Date().toISOString() }]); }
    finally { setVoiceListening(false); }
  }, [running, voice, voiceListening]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openAgent('dock'); }
      if (event.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, running, openAgent]);

  const value: AgentContextValue = {
    open, mode, running, voiceListening, voiceAvailable: voice.available, messages, draft, context, appliedFilterIds, canUndo: undoSnapshots.length > 0,
    unreadCount: messages.filter((message) => message.unread).length,
    setDraft, openAgent, closeAgent, setMode, send, stop, newConversation, applyFilter, undoFilter, markRead, startVoice,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAgent(): AgentContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAgent must be used inside AgentProvider');
  return value;
}

export type { AgentResultCard };
