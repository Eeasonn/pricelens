import { describe, expect, it } from 'vitest';
import { AGENT_INSTRUCTIONS, GLM_MAX_TOKENS, GLM_TEMPERATURE, buildGlmMessages, compactContext } from '../prompt';
import { VALID_BASELINE } from './helpers';

describe('buildGlmMessages（服务端固定提示词，不接受客户端覆盖）', () => {
  it('puts the fixed system prompt first and the compact context second', () => {
    const messages = buildGlmMessages({
      text: '均价如何？',
      baseline: VALID_BASELINE,
      context: { page: 'overview', state: { countryCode: 'DE', mains: [] }, alerts: [] },
      runId: 'run-1',
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toBe(AGENT_INSTRUCTIONS);
    expect(messages[1]!.role).toBe('user');
    const parsed = JSON.parse(messages[1]!.content) as Record<string, unknown>;
    expect(parsed.userText).toBe('均价如何？');
    expect(parsed.baseline).toEqual(VALID_BASELINE);
    expect((parsed.state as Record<string, unknown>).countryCode).toBe('DE');
  });

  it('clamps user text, mains and alerts before sending upstream', () => {
    const context = compactContext({
      text: 'x'.repeat(5_000),
      baseline: VALID_BASELINE,
      context: {
        page: 'overview',
        state: { mains: Array.from({ length: 80 }, (_, i) => ({ id: `m${i}` })) },
        alerts: Array.from({ length: 40 }, (_, i) => ({ key: `a${i}` })),
      },
      runId: 'run-2',
    });
    expect((context.userText as string).length).toBeLessThanOrEqual(4_000);
    expect((context.state as Record<string, unknown>).mains).toHaveLength(50);
    expect(context.alerts).toHaveLength(20);
  });

  it('keeps the sampling parameters server-owned (max_tokens covers thinking tokens)', () => {
    expect(GLM_TEMPERATURE).toBe(0.2);
    expect(GLM_MAX_TOKENS).toBeGreaterThanOrEqual(1024);
    expect(AGENT_INSTRUCTIONS).toContain('只输出一个 JSON 对象');
    expect(AGENT_INSTRUCTIONS).toContain('不得编造、修改或补算数字');
  });
});
