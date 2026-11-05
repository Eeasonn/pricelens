// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentProviderBadge, ToolCallCard } from '../../components/Copilot/AgentPanel';
import type { AgentResponse, AgentStep } from '../contracts';

const step: AgentStep = {
  id: 'step-filter',
  tool: 'view.preview',
  label: '生成筛选预览',
  status: 'success',
  detail: '最近 8 周 · USD',
  durationMs: 18,
};

describe('agentux P1-3/P1-4 tool cards', () => {
  it('shows applyFilter failure inside the tool card', () => {
    render(<ToolCallCard step={step} onApply={() => ({ ok: false, error: '当前筛选口径已变化，请重新生成预览。' })} />);
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
    expect(screen.getByRole('alert').textContent).toContain('当前筛选口径已变化');
  });

  it('shows explicit provider labels for remote and fallback results', () => {
    const remote: AgentResponse = { intent: 'query', summary: '远端', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: 'ctx-1', provider: { name: '远端 AI 流式', model: 'remote' } };
    const fallback: AgentResponse = { ...remote, provider: { name: '本地确定性回退', model: 'local' } };
    const { rerender } = render(<AgentProviderBadge response={remote} />);
    expect(screen.getByText('远端 AI 流式')).toBeTruthy();
    rerender(<AgentProviderBadge response={fallback} />);
    expect(screen.getByText(/本地回退/)).toBeTruthy();
  });
});
