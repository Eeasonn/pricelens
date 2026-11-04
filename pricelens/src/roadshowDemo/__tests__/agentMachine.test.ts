import { describe, expect, it } from 'vitest';
import { canApplyFilters, transitionAgent } from '../agentMachine';

describe('Agent 全屏到 dock 状态机', () => {
  it('按全屏语音、预览、应用、收窄、看板就绪顺序转换', () => {
    let state = 'agent-fullscreen-empty';
    state = transitionAgent(state, 'START_VOICE');
    expect(state).toBe('agent-fullscreen-listening');
    state = transitionAgent(state, 'TRANSCRIPT_READY');
    expect(state).toBe('transcript-confirmed');
    state = transitionAgent(state, 'PREVIEW_READY');
    expect(state).toBe('filter-preview-ready');
    expect(canApplyFilters(state)).toBe(true);
    state = transitionAgent(state, 'APPLY');
    expect(state).toBe('user-applies');
    state = transitionAgent(state, 'TRANSITION_COMPLETE');
    expect(state).toBe('split-view-ready');
  });

  it('预览完成前不能应用筛选，未知事件不改变状态', () => {
    expect(canApplyFilters('agent-fullscreen-listening')).toBe(false);
    expect(transitionAgent('agent-fullscreen-empty', 'APPLY')).toBe('agent-fullscreen-empty');
    expect(transitionAgent('filter-preview-ready', 'UNKNOWN')).toBe('filter-preview-ready');
  });
});
