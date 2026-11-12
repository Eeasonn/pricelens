// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentThread, type ThreadMessage } from './AgentThread';

const ask = vi.fn();
const stop = vi.fn();
let finish: () => void;

function Harness({ initialMessages = [], initialDraft = '', mode = 'dock' }: {
  initialMessages?: ThreadMessage[]; initialDraft?: string; mode?: 'dock' | 'drawer';
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(initialDraft);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  finish = () => setRunning(false);
  return <AgentThread
    controller={{ open, mode, draft, running, voiceAvailable: false, voiceListening: false,
      setDraft, setMode: vi.fn(), closeAgent: () => setOpen(false), markRead: vi.fn(), startVoice: vi.fn(),
      send: async (text) => {
        ask(text); setDraft(''); setRunning(true);
        setMessages((current) => [...current, { id: 'user-new', role: 'user', text: text ?? '', createdAt: new Date().toISOString() }]);
      },
      stop: () => { stop(); setRunning(false); },
      newConversation: () => { setMessages([]); setDraft(''); },
    }}
    messages={messages} statusLabel={running ? '正在读取价格' : '可以提问'} context={<div>俄罗斯 · 手机</div>}
    suggestions={[{ label: '比较价格' }]} renderMessage={() => null}
  />;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('shared assistant-ui conversation', () => {
  it('uses external drafts and sends one trimmed query from the composer', async () => {
    render(<Harness initialDraft="  比较当前价格  " />);
    const input = screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' });
    expect((input as HTMLTextAreaElement).value).toBe('  比较当前价格  ');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(ask).toHaveBeenCalledOnce());
    expect(ask).toHaveBeenCalledWith('比较当前价格');
    expect((input as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('button', { name: '新对话' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '停止运行' })).toBeTruthy();
  });

  it('does not submit IME composition or Shift+Enter', () => {
    render(<Harness initialDraft="俄罗斯价格" />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(ask).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(ask).toHaveBeenCalledOnce();
  });

  it('keeps the next draft while stopping and prevents submission during a run', async () => {
    render(<Harness initialDraft="第一问" />);
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '下一问草稿' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(ask).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '停止运行' }));
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(input.value).toBe('下一问草稿');
    expect(screen.getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps a draft when a run completes', () => {
    render(<Harness initialDraft="第一问" />);
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '完成前写的草稿' } });
    act(() => finish());
    expect(input.value).toBe('完成前写的草稿');
  });

  it('modifies a prior question as a new draft without changing history', () => {
    render(<Harness initialMessages={[{ id: 'old', role: 'user', text: '旧问题', createdAt: new Date().toISOString() }]} />);
    fireEvent.click(screen.getByRole('button', { name: '修改后重问' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('旧问题');
    expect(document.querySelectorAll('[data-agent-message]')).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it('renders safe Markdown and reports clipboard rejection without claiming success', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<Harness initialMessages={[{ id: 'answer', role: 'assistant', text: '**结论** [证据](https://example.com) <script>bad()</script>', createdAt: new Date().toISOString() }]} />);
    expect(screen.getByText('结论').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: '证据' }).getAttribute('rel')).toBe('noreferrer');
    expect(document.querySelector('.aui-markdown script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '复制消息' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('复制失败'));
    expect(screen.queryByRole('button', { name: '已复制' })).toBeNull();
  });

  it('closes the modal with Escape, restores background interaction and opener focus', async () => {
    const opener = document.createElement('button'); opener.textContent = '打开'; document.body.append(opener); opener.focus();
    render(<Harness mode="drawer" />);
    expect(opener.inert).toBe(true);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(opener.inert).not.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    opener.remove();
  });
});
