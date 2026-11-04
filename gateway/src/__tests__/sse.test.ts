import { describe, expect, it } from 'vitest';
import { buildRunEvent, namedSseFrame, responseSsePayload } from '../sse';
import { isAgentEventLike, parseGatewayFrames } from './helpers';

describe('SSE 帧格式契约（client.ts parseSseFrames 可解析）', () => {
  it('emits `event: <name>\\ndata: <json>\\n\\n` with single-line JSON data', () => {
    const raw = namedSseFrame('run.status', { event: buildRunEvent('run-1', 1, 'run.started', 'ok') });
    expect(raw).toMatch(/^event: run\.status\ndata: \{.*\}\n\n$/s);
    const lines = raw.split('\n');
    expect(lines[0]).toBe('event: run.status');
    expect(lines[1]!.startsWith('data: ')).toBe(true);
    expect(lines[2]).toBe('');
    expect(lines.slice(3).join('')).toBe('');
    expect(() => JSON.parse(lines[1]!.slice(6))).not.toThrow();
  });

  it('event bodies satisfy the isAgentEvent shallow contract', () => {
    const event = buildRunEvent('run-9', 2, 'step.updated', 'GLM 叙述生成中：…', { source: 'glm-gateway' }, 'running');
    expect(event.sequence).toBe(2);
    expect(Number.isInteger(event.sequence)).toBe(true);
    expect(new Date(event.timestamp).toString()).not.toBe('Invalid Date');
    expect(isAgentEventLike(event)).toBe(true);
    expect(event.id).toContain('run-9');
    expect(event.provenance).toEqual({ source: 'glm-gateway' });
  });

  it('response payloads use the {type:"response", response} envelope', () => {
    const payload = responseSsePayload({ intent: 'query', summary: 's' });
    expect(payload).toEqual({ type: 'response', response: { intent: 'query', summary: 's' } });
  });

  it('a full frame set round-trips through the client-style parser', () => {
    const runId = 'run-42';
    const raw = [
      namedSseFrame('run.status', { event: buildRunEvent(runId, 1, 'run.started', '开始', undefined, 'running') }),
      namedSseFrame('step.updated', { event: buildRunEvent(runId, 2, 'step.updated', '生成中', undefined, 'running') }),
      namedSseFrame('response', responseSsePayload({ intent: 'query', summary: 's', steps: [], cards: [], citations: [], suggestions: ['a'], contextFingerprint: 'ctx' })),
      namedSseFrame('run.completed', { event: buildRunEvent(runId, 3, 'run.completed', '完成', undefined, 'completed') }),
    ].join('');
    const { events, responses, frameNames } = parseGatewayFrames(raw);
    expect(frameNames).toEqual(['run.status', 'step.updated', 'response', 'run.completed']);
    expect(events).toHaveLength(3);
    expect(events.every(isAgentEventLike)).toBe(true);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ type: 'response', response: { intent: 'query', contextFingerprint: 'ctx' } });
  });
});
