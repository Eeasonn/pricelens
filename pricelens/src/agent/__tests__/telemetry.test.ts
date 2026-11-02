import { describe, expect, it } from 'vitest';
import { buildAgentContext } from '../core';
import { createNoopAgentTracer, spanAttributesOf, startAgentRunSpan, traceContextOf } from '../telemetry';
import { defaultFilters } from '../../state/FiltersContext';
import type { AgentRun } from '../contracts';

const run: AgentRun = {
  id: 'run-1',
  requestId: 'req-1',
  status: 'completed',
  startedAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:01.000Z',
  context: buildAgentContext('dashboard', defaultFilters, []),
  events: [],
};

describe('OpenTelemetry-compatible Agent tracing', () => {
  it('maps stable low-cardinality run fields and omits user content', () => {
    const context = traceContextOf(run);
    const attributes = spanAttributesOf(context);
    expect(attributes['pricelens.agent.run_id']).toBe('run-1');
    expect(attributes['pricelens.agent.request_id']).toBe('req-1');
    expect(attributes['pricelens.agent.context_fingerprint']).toBe(run.context.fingerprint);
    expect(Object.keys(attributes).some((key) => /prompt|message|alert|(?:^|[._])state(?:[._]|$)/i.test(key))).toBe(false);
  });

  it('keeps offline mode instrumentable with a no-op tracer', () => {
    const tracer = createNoopAgentTracer();
    const span = startAgentRunSpan(tracer, run);
    expect(span).toBeTruthy();
    expect(() => {
      span.setAttribute('pricelens.agent.outcome', 'ok');
      span.addEvent?.('run.completed');
      span.end();
    }).not.toThrow();
  });

  it('accepts a structural OpenTelemetry tracer without a package dependency', () => {
    const calls: string[] = [];
    const tracer = {
      startSpan(name: string) {
        calls.push(name);
        return {
          setAttribute() { return this; },
          end() { calls.push('end'); },
        };
      },
    };
    const span = startAgentRunSpan(tracer, run);
    span.end();
    expect(calls).toEqual(['pricelens.agent.run', 'end']);
  });
});

