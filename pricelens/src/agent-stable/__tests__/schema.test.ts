import { vi, describe, expect, it } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { buildAgentContext } from '../core';
import {
  AGENT_EVENT_JSON_SCHEMA,
  AGENT_RUN_JSON_SCHEMA,
  validateApprovalRequest,
  validateAgentEvent,
  validateAgentResponse,
  validateAgentRun,
} from '../schema';
import { defaultFilters } from '../../state/FiltersContext';

const now = '2026-11-01T00:00:00.000Z';
const context = buildAgentContext('dashboard', defaultFilters, []);

describe('Agent JSON Schema boundary', () => {
  it('exports registry-ready draft 2020-12 schemas without undefined values', () => {
    expect(AGENT_EVENT_JSON_SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(AGENT_RUN_JSON_SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(JSON.stringify(AGENT_EVENT_JSON_SCHEMA)).not.toContain('undefined');
    expect(JSON.stringify(AGENT_RUN_JSON_SCHEMA)).not.toContain('undefined');
  });

  it('accepts a complete event and rejects unregistered tool/status values', () => {
    const event = { id: 'event-1', runId: 'run-1', sequence: 0, type: 'run.started', status: 'planning', timestamp: now, message: '开始' };
    expect(validateAgentEvent(event)).toEqual({ valid: true, errors: [] });
    expect(validateAgentEvent({ ...event, tool: 'shell.exec' })).toMatchObject({ valid: false });
    expect(validateAgentEvent({ ...event, status: 'thinking' })).toMatchObject({ valid: false });
    expect(validateAgentEvent({ ...event, sequence: -1 })).toMatchObject({ valid: false });
  });

  it('validates persisted runs and catches malformed event history', () => {
    const run = {
      id: 'run-1',
      requestId: 'req-1',
      status: 'completed',
      startedAt: now,
      updatedAt: now,
      completedAt: now,
      context,
      events: [{ id: 'event-1', runId: 'run-1', sequence: 0, type: 'run.started', timestamp: now }],
    };
    expect(validateAgentRun(run)).toEqual({ valid: true, errors: [] });
    expect(validateAgentRun({ ...run, events: [{ ...run.events[0], runId: 'other-run' }] })).toMatchObject({ valid: false });
    expect(validateAgentRun({ ...run, events: [run.events[0], { ...run.events[0], id: 'event-2', sequence: 0 }] })).toMatchObject({ valid: false });
    expect(validateAgentRun({ ...run, status: 'thinking' })).toMatchObject({ valid: false });
    expect(validateAgentRun({ ...run, context: null })).toMatchObject({ valid: false });
  });

  it('uses the existing response guard at the remote output boundary', () => {
    const valid = { intent: 'query', summary: '已完成', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: 'ctx-1' };
    expect(validateAgentResponse(valid)).toEqual({ valid: true, errors: [] });
    expect(validateAgentResponse({ ...valid, suggestions: [1] })).toMatchObject({ valid: false });
  });

  it('requires an explicit, scoped approval envelope for write adapters', () => {
    const approval = {
      id: 'approval-1',
      action: 'alert.resolve',
      scope: 'alert:al_123',
      impactCount: 1,
      idempotencyKey: 'idem-1',
      contextFingerprint: context.fingerprint,
      expiresAt: now,
    };
    expect(validateApprovalRequest(approval)).toEqual({ valid: true, errors: [] });
    expect(validateApprovalRequest({ ...approval, idempotencyKey: '' })).toMatchObject({ valid: false });
  });
});

