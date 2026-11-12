import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ActionBarPrimitive, AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive,
  ThreadPrimitive, useExternalStoreRuntime, type ThreadMessageLike,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import {
  ArrowDownOutlined, ArrowUpOutlined, AudioOutlined, CheckOutlined, CloseOutlined,
  CopyOutlined, EditOutlined, ExpandOutlined, FullscreenExitOutlined, PlusOutlined,
  ReloadOutlined, StopOutlined,
} from '@ant-design/icons';
import { color, font, fontSize, motion, radius, selectAccent, shadow, space } from '../../theme/tokens';
import './agent-thread.css';

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  prompt?: string;
  kind?: string;
  streaming?: boolean;
  failed?: boolean;
  cancelled?: boolean;
  actionsLocked?: boolean;
}

interface ThreadController {
  open: boolean;
  mode: 'dock' | 'drawer' | 'full';
  running: boolean;
  draft: string;
  voiceAvailable: boolean;
  voiceListening: boolean;
  setDraft: (value: string) => void;
  send: (text?: string) => Promise<void>;
  stop: () => void;
  newConversation: () => void;
  closeAgent: () => void;
  setMode: (mode: 'dock' | 'drawer' | 'full') => void;
  markRead: () => void;
  startVoice: () => Promise<void>;
}

interface ThreadSuggestion { label: string; prompt?: string; draftOnly?: boolean }
interface MessageHelpers { focusComposer: () => void }

export interface AgentThreadProps<M extends ThreadMessage, S extends ThreadSuggestion> {
  controller: ThreadController;
  messages: readonly M[];
  statusLabel: string;
  context: ReactNode;
  suggestions?: readonly S[];
  onSuggestion?: (suggestion: S, focusComposer: () => void) => void;
  renderHeader?: (message: M) => ReactNode;
  renderMessage: (message: M, helpers: MessageHelpers) => ReactNode;
}

/** Domain state stays in the channel provider; assistant-ui owns conversation mechanics. */
export function toThreadMessage(message: ThreadMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.text }],
    createdAt: new Date(message.createdAt),
    ...(message.role === 'assistant' ? {
      status: message.streaming ? { type: 'running' as const }
        : message.failed ? { type: 'incomplete' as const, reason: 'error' as const, error: message.text }
          : message.cancelled ? { type: 'incomplete' as const, reason: 'cancelled' as const }
            : { type: 'complete' as const, reason: 'stop' as const },
    } : {}),
  };
}

const tokenStyle = {
  '--aui-canvas': color.canvas, '--aui-soft': color.canvasSoft, '--aui-hover': color.canvasSoft2,
  '--aui-line': color.hairline, '--aui-line-strong': color.hairlineStrong,
  '--aui-ink': color.ink, '--aui-body': color.body, '--aui-mute': color.mute,
  '--aui-link': color.link, '--aui-focus': selectAccent, '--aui-on-primary': color.onPrimary,
  '--aui-warning': color.warningInk, '--aui-warning-soft': color.warningSoft, '--aui-error': color.error,
  '--aui-font': font.family, '--aui-mono': font.mono,
  '--aui-caption': `${fontSize.caption}px`, '--aui-body-size': `${fontSize.bodySm}px`,
  '--aui-heading': `${fontSize.displaySm}px`, '--aui-xs': `${space.xs}px`, '--aui-sm': `${space.sm}px`,
  '--aui-md': `${space.md}px`, '--aui-base': `${space.base}px`, '--aui-lg': `${space.lg}px`,
  '--aui-xl': `${space.xl}px`, '--aui-xxl': `${space.xxl}px`, '--aui-header': `${space.xxxl}px`,
  '--aui-control-radius': `${radius.control}px`, '--aui-card-radius': `${radius.card}px`,
  '--aui-shadow': shadow.l2, '--aui-motion': `${motion.fast}ms`,
} as CSSProperties;

function MarkdownText() {
  return <MarkdownTextPrimitive className="aui-markdown" smooth={false} components={{
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    // The assistant can describe sources; it cannot fetch arbitrary remote images.
    img: ({ alt }) => <span>{alt ? `[图片：${alt}]` : '[图片]'}</span>,
  }} />;
}

function MessageActions({ message, controller, focusComposer }: {
  message: ThreadMessage; controller: ThreadController; focusComposer: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  if (message.streaming) return null;
  return <>
    <ActionBarPrimitive.Root className="aui-actions" autohide="never">
      <ActionBarPrimitive.Copy className="aui-text-button" aria-label={copied ? '已复制' : '复制消息'} onClick={(event) => {
        // Explicit feedback also covers offline/insecure contexts without Clipboard API.
        event.preventDefault();
        setError('');
        if (!navigator.clipboard?.writeText) { setError('无法访问剪贴板，请选中文字复制。'); return; }
        void navigator.clipboard.writeText(message.text).then(() => setCopied(true)).catch(() => setError('复制失败，请选中文字复制。'));
      }}>{copied ? <CheckOutlined aria-hidden /> : <CopyOutlined aria-hidden />} {copied ? '已复制' : '复制'}</ActionBarPrimitive.Copy>
      {message.role === 'user' && <button type="button" className="aui-text-button" onClick={() => {
        controller.setDraft(message.text); focusComposer();
      }}><EditOutlined aria-hidden /> 修改后重问</button>}
      {message.role === 'assistant' && message.prompt && <button type="button" className="aui-text-button" disabled={controller.running}
        title="用当前看板范围重新查询，保留本条历史结果" onClick={() => void controller.send(message.prompt)}>
        <ReloadOutlined aria-hidden /> 按当前范围重试
      </button>}
    </ActionBarPrimitive.Root>
    {error && <div role="alert" className="aui-copy-error">{error}</div>}
  </>;
}

export function AgentThread<M extends ThreadMessage, S extends ThreadSuggestion>({
  controller, messages, statusLabel, context, suggestions = [], onSuggestion, renderHeader, renderMessage,
}: AgentThreadProps<M, S>) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023.98px)').matches);
  const modal = compact || controller.mode !== 'dock';
  const full = compact || controller.mode === 'full';
  const focusComposer = () => inputRef.current?.focus();
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messages,
    isRunning: controller.running,
    convertMessage: toThreadMessage,
    onNew: async (message) => {
      const text = message.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n').trim();
      if (text && !controller.running) await controller.send(text);
    },
    onCancel: async () => controller.stop(),
  });

  useEffect(() => {
    const composer = runtime.thread.composer;
    if (composer.getState().text !== controller.draft) composer.setText(controller.draft);
  }, [controller.draft, runtime]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 1023.98px)');
    const change = () => setCompact(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!controller.open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    // Inert siblings are restored by the modal effect's cleanup in this commit.
    return () => queueMicrotask(() => { if (opener?.isConnected) opener.focus(); });
  }, [controller.open]);
  useEffect(() => {
    if (controller.open && !controller.running) controller.markRead();
  }, [controller.open, controller.running, controller.markRead, messages.length]);
  useEffect(() => {
    if (!controller.open || !modal) return;
    const panel = panelRef.current;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== panel);
    const previous = siblings.map((node) => [node, node.inert] as const);
    siblings.forEach((node) => { node.inert = true; });
    return () => previous.forEach(([node, inert]) => { node.inert = inert; });
  }, [controller.open, modal]);
  useEffect(() => {
    if (!controller.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); controller.closeAgent(); return; }
      if (event.key !== 'Tab' || !modal) return;
      const panel = panelRef.current;
      if (!panel) return;
      const targets = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input:not(:disabled), summary, a[href], [tabindex="0"]'))
        .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      const first = targets[0]; const last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [controller.open, controller.closeAgent, modal]);

  if (!controller.open) return null;
  const nextMode = controller.mode === 'full' ? 'dock' : controller.mode === 'drawer' ? 'full' : 'drawer';
  const modeLabel = controller.mode === 'full' ? '退出全屏' : controller.mode === 'drawer' ? '全屏' : '展开抽屉';
  return createPortal(<aside ref={panelRef} id="pricelens-agent-panel" className="lpl-agent-panel aui-panel" style={tokenStyle}
    data-agent-mode={full ? 'full' : controller.mode} data-assistant-ui="true" role="dialog" aria-modal={modal || undefined}
    aria-labelledby="pricelens-agent-title" tabIndex={-1}>
    <header className="aui-header">
      <div><h2 id="pricelens-agent-title">PriceLens Agent</h2><div className="aui-status" data-agent-live-status role="status" aria-live="polite" aria-atomic="true">{statusLabel}</div></div>
      <div className="aui-header-actions">
        <button type="button" className="aui-icon-button" aria-label="新对话" disabled={controller.running}
          title={controller.running ? '请先停止当前运行，再开始新对话' : '新对话'} onClick={() => { controller.newConversation(); focusComposer(); }}><PlusOutlined /></button>
        {!compact && <button type="button" className="aui-icon-button" aria-label={modeLabel} title={modeLabel} onClick={() => controller.setMode(nextMode)}>{controller.mode === 'full' ? <FullscreenExitOutlined /> : <ExpandOutlined />}</button>}
        <button type="button" className="aui-icon-button" aria-label={controller.running ? '关闭 Agent，后台继续运行' : '关闭 Agent'}
          title={controller.running ? '关闭面板，后台继续运行' : '关闭 · Esc'} onClick={controller.closeAgent}><CloseOutlined /></button>
      </div>
    </header>
    <div className="aui-context">{context}</div>
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="aui-thread">
        <ThreadPrimitive.Viewport className="aui-viewport" role="log" aria-label="Agent 对话" aria-live="off" aria-busy={controller.running}>
          <div className="aui-conversation">
            {!messages.length && <section className="aui-welcome">
              <h3>从当前数据开始</h3><p>查询价格、比较平台，或核对预警。每次回答都会保留分析范围与证据。</p>
              <div className="aui-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion.label} disabled={controller.running}
                onClick={() => onSuggestion ? onSuggestion(suggestion, focusComposer) : void controller.send(suggestion.prompt ?? suggestion.label)}>
                <span>{suggestion.label}</span><ArrowUpOutlined aria-hidden />
              </button>)}</div>
            </section>}
            <ThreadPrimitive.Messages>{({ message }) => {
              const original = messages.find((entry) => entry.id === message.id);
              if (!original) return null;
              return <MessagePrimitive.Root className={`aui-message aui-message-${original.role}`} data-agent-message data-message-locked={original.actionsLocked || undefined}>
                {original.role === 'assistant' && <div className="aui-message-heading"><strong>PriceLens</strong>{renderHeader?.(original)}</div>}
                <div className="aui-message-text" data-streaming-text={original.streaming || undefined}>
                  <MessagePrimitive.Parts components={{ Text: original.role === 'assistant' ? MarkdownText : undefined }} />
                </div>
                {original.streaming && <div className="aui-stream-status"><span className="aui-progress-mark" aria-hidden />{statusLabel}</div>}
                {renderMessage(original, { focusComposer })}
                <MessageActions message={original} controller={controller} focusComposer={focusComposer} />
              </MessagePrimitive.Root>;
            }}</ThreadPrimitive.Messages>
            {messages.length > 0 && suggestions.length > 0 && <div className="aui-suggestions" aria-label="继续提问">
              {suggestions.map((suggestion) => <button type="button" key={suggestion.label} disabled={controller.running}
                onClick={() => onSuggestion ? onSuggestion(suggestion, focusComposer) : void controller.send(suggestion.prompt ?? suggestion.label)}>
                <span>{suggestion.label}</span><ArrowUpOutlined aria-hidden />
              </button>)}
            </div>}
          </div>
          <div className="aui-scroll-anchor"><ThreadPrimitive.ScrollToBottom className="aui-jump" aria-label="回到最新消息"><ArrowDownOutlined aria-hidden /> 回到最新消息</ThreadPrimitive.ScrollToBottom></div>
        </ThreadPrimitive.Viewport>
        <div className="aui-composer-region">
          <ComposerPrimitive.Root className="aui-composer">
            <ComposerPrimitive.Input ref={inputRef} className="aui-input" aria-label="向 PriceLens Agent 提问" placeholder="问价格、平台或预警…"
              minRows={2} maxRows={6} submitMode={controller.running ? 'none' : 'enter'} cancelOnEscape={false}
              addAttachmentOnPaste={false} onChange={(event) => controller.setDraft(event.target.value)} />
            <div className="aui-composer-toolbar">
              <span className="aui-composer-hint">{controller.running ? '正在查询 · 可先写下一个问题' : 'Enter 发送 · Shift+Enter 换行'}</span>
              <div className="aui-header-actions">
                {controller.voiceAvailable && <button type="button" className="aui-icon-button" aria-label="语音输入" title="语音输入" disabled={controller.running || controller.voiceListening} onClick={() => void controller.startVoice()}><AudioOutlined /></button>}
                {controller.running ? <ComposerPrimitive.Cancel className="aui-send" aria-label="停止运行"><StopOutlined /></ComposerPrimitive.Cancel>
                  : <ComposerPrimitive.Send className="aui-send" aria-label="发送"><ArrowUpOutlined /></ComposerPrimitive.Send>}
              </div>
            </div>
          </ComposerPrimitive.Root>
          <p className="aui-composer-note">{controller.voiceListening ? '正在听，请说出问题…' : '查询不会自动修改看板，应用筛选前会请你确认。'}</p>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  </aside>, document.body);
}
