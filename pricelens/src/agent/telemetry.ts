import type { AgentRun } from './contracts';

/**
 * Minimal structural subset of the OpenTelemetry API.  Keeping the adapter
 * structural lets the browser bundle stay dependency-free while a service
 * can pass an `@opentelemetry/api` Tracer without an import boundary change.
 */
export type TelemetryAttribute = string | number | boolean | readonly string[] | readonly number[] | readonly boolean[];

export interface AgentSpan {
  setAttribute(name: string, value: TelemetryAttribute): AgentSpan | void;
  setStatus?(status: { code: 'UNSET' | 'OK' | 'ERROR'; message?: string }): AgentSpan | void;
  addEvent?(name: string, attributes?: Record<string, TelemetryAttribute>): AgentSpan | void;
  recordException?(error: unknown): AgentSpan | void;
  end(endTime?: number | Date): void;
}

export interface AgentTracer {
  startSpan(name: string, options?: { attributes?: Record<string, TelemetryAttribute> }): AgentSpan;
}

export interface AgentTraceContext {
  runId: string;
  requestId: string;
  contextFingerprint: string;
  status: AgentRun['status'];
  dataVersion?: string;
  ruleVersion?: string;
}

/** Stable attribute names to map to OpenTelemetry semantic conventions. */
export const AGENT_TRACE_ATTRIBUTES = {
  runId: 'pricelens.agent.run_id',
  requestId: 'pricelens.agent.request_id',
  contextFingerprint: 'pricelens.agent.context_fingerprint',
  status: 'pricelens.agent.status',
  dataVersion: 'pricelens.agent.data_version',
  ruleVersion: 'pricelens.agent.rule_version',
  tool: 'pricelens.agent.tool',
  stepId: 'pricelens.agent.step_id',
  outcome: 'pricelens.agent.outcome',
} as const;

/**
 * Build span attributes from an AgentRun without copying prompts, messages,
 * alert payloads, or model output into telemetry.  This is the sensitive-data
 * boundary: callers may add only explicit low-cardinality attributes.
 */
export function traceContextOf(run: AgentRun): AgentTraceContext {
  return {
    runId: run.id,
    requestId: run.requestId,
    contextFingerprint: run.context.fingerprint,
    status: run.status,
    dataVersion: run.context.dataVersion ?? run.context.provenance?.dataVersion,
    ruleVersion: run.context.ruleVersion ?? run.context.provenance?.ruleVersion,
  };
}

export function spanAttributesOf(context: AgentTraceContext): Record<string, TelemetryAttribute> {
  const attributes: Record<string, TelemetryAttribute> = {
    [AGENT_TRACE_ATTRIBUTES.runId]: context.runId,
    [AGENT_TRACE_ATTRIBUTES.requestId]: context.requestId,
    [AGENT_TRACE_ATTRIBUTES.contextFingerprint]: context.contextFingerprint,
    [AGENT_TRACE_ATTRIBUTES.status]: context.status,
  };
  if (context.dataVersion) attributes[AGENT_TRACE_ATTRIBUTES.dataVersion] = context.dataVersion;
  if (context.ruleVersion) attributes[AGENT_TRACE_ATTRIBUTES.ruleVersion] = context.ruleVersion;
  return attributes;
}

/** No-op tracer for local/offline mode; instrumentation can stay enabled. */
export function createNoopAgentTracer(): AgentTracer {
  const span: AgentSpan = {
    setAttribute: () => span,
    setStatus: () => span,
    addEvent: () => span,
    recordException: () => span,
    end: () => undefined,
  };
  return { startSpan: () => span };
}

/** Start a run span with safe attributes; caller owns lifecycle and `end()`. */
export function startAgentRunSpan(tracer: AgentTracer, run: AgentRun): AgentSpan {
  return tracer.startSpan('pricelens.agent.run', { attributes: spanAttributesOf(traceContextOf(run)) });
}

