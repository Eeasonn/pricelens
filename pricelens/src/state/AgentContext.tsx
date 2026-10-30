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
  setDraft: (value: string) => void;
  openAgent: (mode?: 'dock' | 'full', prompt?: string) => void;
  closeAgent: () => void;
  setMode: (mode: 'dock' | 'full') => void;
  send: (text?: string) => Promise<void>;
  stop: () => void;
  newConversation: () => void;
  applyFilter: (card: FilterResultCard) => { ok: boolean; error?: string };
  undoFilter: () => void;
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
  const [undoSnapshot, setUndoSnapshot] = useState<FiltersState | null>(null);
  const controller = useRef<AbortController | null>(null);
  const agentClient = useMemo(() => defaultAgentClient(), []);
  const voice = useMemo<VoiceInputAdapter>(() => defaultVoiceAdapter(), []);
  const context = useMemo(() => buildAgentContext(page, state, alertRecords(alerts)), [alerts, page, state]);

  const openAgent = useCallback((nextMode: 'dock' | 'full' = 'dock', prompt?: string) => {
    setMode(nextMode); setOpen(true);
    if (prompt) setDraft(prompt);
  }, []);
  const closeAgent = useCallback(() => { if (!running) setOpen(false); }, [running]);

  const send = useCallback(async (value?: string) => {
    const text = (value ?? draft).trim();
    if (!text || running) return;
    setDraft('');
    setMessages((prev) => [...prev, { id: messageId('user'), role: 'user', text, createdAt: new Date().toISOString() }]);
    const run = new AbortController();
    controller.current = run; setRunning(true); setOpen(true);
    try {
      const baseline = await runAgent(text, context, run.signal);
      const response = await agentClient.run({ text, context, clientRequestId: messageId('run'), baseline }, run.signal);
      setMessages((prev) => [...prev, { id: messageId('assistant'), role: 'assistant', text: response.summary, response, createdAt: new Date().toISOString() }]);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setMessages((prev) => [...prev, { id: messageId('assistant'), role: 'assistant', text: '这次运行没有完成，请重试。', createdAt: new Date().toISOString() }]);
    } finally { controller.current = null; setRunning(false); }
  }, [agentClient, context, draft, running]);

  const stop = useCallback(() => controller.current?.abort(), []);
  const newConversation = useCallback(() => { if (!running) { setMessages([]); setDraft(''); setUndoSnapshot(null); setAppliedFilterIds(new Set()); } }, [running]);

  const applyFilter = useCallback((card: FilterResultCard) => {
    const validation = validateFilterPatch(card.patch);
    if (!validation.valid) return { ok: false, error: validation.errors.join('；') };
    setUndoSnapshot(state);
    actions.set(card.patch);
    setAppliedFilterIds((prev) => new Set([...prev, card.id]));
    return { ok: true };
  }, [actions, state]);

  const undoFilter = useCallback(() => {
    if (!undoSnapshot) return;
    actions.set(undoSnapshot);
    setUndoSnapshot(null);
  }, [actions, undoSnapshot]);

  const startVoice = useCallback(async () => {
    if (!voice.available || voiceListening || running) return;
    setVoiceListening(true);
    try { const result = await voice.listen(); setDraft((prev) => `${prev}${prev ? ' ' : ''}${result.transcript}`); }
    catch (error) { if ((error as Error).name !== 'AbortError') setMessages((prev) => [...prev, { id: messageId('assistant'), role: 'assistant', text: `语音输入失败：${(error as Error).message}`, createdAt: new Date().toISOString() }]); }
    finally { setVoiceListening(false); }
  }, [running, voice, voiceListening]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openAgent('dock'); }
      if (event.key === 'Escape' && open && !running) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, running, openAgent]);

  const value: AgentContextValue = {
    open, mode, running, voiceListening, voiceAvailable: voice.available, messages, draft, context, appliedFilterIds, canUndo: undoSnapshot != null,
    setDraft, openAgent, closeAgent, setMode, send, stop, newConversation, applyFilter, undoFilter, startVoice,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAgent(): AgentContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAgent must be used inside AgentProvider');
  return value;
}

export type { AgentResultCard };
