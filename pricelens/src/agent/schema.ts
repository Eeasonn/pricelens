import { isAgentResponse, type AgentEvent, type AgentRun, type AgentResponse } from './contracts';

/**
 * JSON Schema is kept as plain data so a server can export the same contract
 * without taking a runtime dependency on a particular validator.  Consumers
 * may feed these values to Ajv, Valibot, or a JSON Schema aware gateway.
 */
export const AGENT_SCHEMA_VERSION = '1.0.0';
export const AGENT_SCHEMA_BASE_URI = 'https://pricelens.local/schemas/';

type JsonSchema = Record<string, unknown>;

const provenanceSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source'],
  properties: {
    source: { type: 'string', minLength: 1 },
    provider: { type: 'string' },
    model: { type: 'string' },
    dataVersion: { type: 'string' },
    ruleVersion: { type: 'string' },
    contextFingerprint: { type: 'string' },
    generatedAt: { type: 'string', format: 'date-time' },
  },
};

const evidenceSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'detail'],
  properties: {
    id: { type: 'string' },
    label: { type: 'string', minLength: 1 },
    detail: { type: 'string' },
    source: { type: 'string' },
    href: { type: 'string', format: 'uri-reference' },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

const agentStatusSchema: JsonSchema = {
  type: 'string',
  enum: [
    'idle',
    'queued',
    'running',
    'waiting_input',
    'parsing',
    'clarification_required',
    'planning',
    'tool_running',
    'waiting_for_approval',
    'partial_result',
    'completed',
    'failed',
    'cancelled',
    'stale_context',
  ],
};

const agentEventTypeSchema: JsonSchema = {
  type: 'string',
  enum: [
    'run.started',
    'run.status',
    'step.started',
    'step.updated',
    'text.delta',
    'card.patch',
    'approval.required',
    'clarification.required',
    'warning',
    'card.ready',
    'evidence.ready',
    'run.completed',
    'run.failed',
    'run.cancelled',
  ],
};

const toolSchema: JsonSchema = {
  type: 'string',
  enum: [
    'catalog.resolve',
    'series.query',
    'series.compare',
    'alerts.query',
    'alerts.explain',
    'view.preview',
  ],
};

const contextSnapshotSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['page', 'state', 'alerts', 'createdAt', 'fingerprint'],
  properties: {
    page: { type: 'string', minLength: 1 },
    pageLabel: { type: 'string' },
    // FiltersState is owned by the UI state layer.  Keep its complete payload
    // opaque here while enforcing that it is an object; the state layer owns
    // the more specific filter patch validator.
    state: { type: 'object' },
    alerts: { type: 'array', items: { type: 'object' } },
    createdAt: { type: 'string', format: 'date-time' },
    fingerprint: { type: 'string', minLength: 1 },
    provenance: { $ref: '#/$defs/provenance' },
    dataVersion: { type: 'string' },
    ruleVersion: { type: 'string' },
  },
};

const responseSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'summary', 'steps', 'cards', 'citations', 'suggestions', 'contextFingerprint'],
  properties: {
    intent: { type: 'string', enum: ['filter', 'query', 'forecast_explain', 'alert', 'clarify'] },
    summary: { type: 'string' },
    steps: { type: 'array', items: { type: 'object' } },
    cards: { type: 'array', items: { type: 'object' } },
    citations: { type: 'array', items: { type: 'object' } },
    suggestions: {
      type: 'array',
      items: {
        anyOf: [
          { type: 'string' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'prompt', 'intent'],
            properties: {
              label: { type: 'string' },
              prompt: { type: 'string' },
              intent: { type: 'string', enum: ['filter', 'query', 'forecast_explain', 'alert', 'clarify'] },
              target: { type: 'string', enum: ['comparison', 'evidence', 'filter_preview', 'query'] },
            },
          },
        ],
      },
    },
    contextFingerprint: { type: 'string', minLength: 1 },
    provider: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'model'],
      properties: { name: { type: 'string' }, model: { type: 'string' } },
    },
    fallbackReason: { type: 'string' },
    provenance: { $ref: '#/$defs/provenance' },
    coverage: {
      type: 'object',
      additionalProperties: false,
      required: ['covered', 'total'],
      properties: {
        covered: { type: 'integer', minimum: 0 },
        total: { type: 'integer', minimum: 0 },
        missing: { type: 'integer', minimum: 0 },
        stale: { type: 'integer', minimum: 0 },
        note: { type: 'string' },
      },
    },
    factGuard: {
      type: 'object',
      additionalProperties: false,
      required: ['calibrated', 'message'],
      properties: {
        calibrated: { type: 'boolean' },
        message: { type: 'string' },
        rejectedFields: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

const approvalSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'action', 'scope', 'idempotencyKey', 'contextFingerprint'],
  properties: {
    id: { type: 'string', minLength: 1 },
    action: { type: 'string', minLength: 1 },
    scope: { type: 'string', minLength: 1 },
    impactCount: { type: 'integer', minimum: 0 },
    idempotencyKey: { type: 'string', minLength: 1 },
    contextFingerprint: { type: 'string', minLength: 1 },
    expiresAt: { type: 'string', format: 'date-time' },
    reason: { type: 'string' },
  },
};

const eventSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${AGENT_SCHEMA_BASE_URI}agent-event-${AGENT_SCHEMA_VERSION}.json`,
  type: 'object',
  additionalProperties: false,
  required: ['id', 'runId', 'sequence', 'type', 'timestamp'],
  properties: {
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    sequence: { type: 'integer', minimum: 0 },
    type: agentEventTypeSchema,
    status: agentStatusSchema,
    timestamp: { type: 'string', format: 'date-time' },
    message: { type: 'string' },
    tool: toolSchema,
    stepId: { type: 'string' },
    cardId: { type: 'string' },
    delta: { type: 'string' },
    card: { type: 'object' },
    cardPatch: { type: 'object' },
    evidence: { type: 'array', items: { $ref: '#/$defs/evidence' } },
    approval: { $ref: '#/$defs/approval' },
    provenance: { $ref: '#/$defs/provenance' },
  },
  $defs: { provenance: provenanceSchema, evidence: evidenceSchema, approval: approvalSchema },
};

const runSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${AGENT_SCHEMA_BASE_URI}agent-run-${AGENT_SCHEMA_VERSION}.json`,
  type: 'object',
  additionalProperties: false,
  required: ['id', 'requestId', 'status', 'startedAt', 'updatedAt', 'context', 'events'],
  properties: {
    id: { type: 'string', minLength: 1 },
    requestId: { type: 'string', minLength: 1 },
    status: agentStatusSchema,
    startedAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
    context: { $ref: '#/$defs/context' },
    events: { type: 'array', items: { $ref: '#/$defs/event' } },
    response: { $ref: '#/$defs/response' },
    approval: { $ref: '#/$defs/approval' },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['message'],
      properties: { code: { type: 'string' }, message: { type: 'string', minLength: 1 } },
    },
  },
  $defs: {
    provenance: provenanceSchema,
    evidence: evidenceSchema,
    context: contextSnapshotSchema,
    event: eventSchema,
    response: responseSchema,
    approval: approvalSchema,
  },
};

export const AGENT_EVENT_JSON_SCHEMA = eventSchema;
export const AGENT_RUN_JSON_SCHEMA = runSchema;
export const AGENT_RESPONSE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${AGENT_SCHEMA_BASE_URI}agent-response-${AGENT_SCHEMA_VERSION}.json`,
  ...responseSchema,
  $defs: { provenance: provenanceSchema },
};
export const APPROVAL_REQUEST_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${AGENT_SCHEMA_BASE_URI}approval-request-${AGENT_SCHEMA_VERSION}.json`,
  ...approvalSchema,
};

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isDateTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isAgentStatus = (value: unknown): boolean => typeof value === 'string' && (agentStatusSchema.enum as string[]).includes(value);
const isAgentEventType = (value: unknown): boolean => typeof value === 'string' && (agentEventTypeSchema.enum as string[]).includes(value);
const isTool = (value: unknown): boolean => typeof value === 'string' && (toolSchema.enum as string[]).includes(value);

function validateProvenance(value: unknown, path: string, errors: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) { errors.push(`${path} 必须是对象`); return false; }
  if (typeof value.source !== 'string' || !value.source) errors.push(`${path}.source 必须是非空文本`);
  if (value.generatedAt !== undefined && !isDateTime(value.generatedAt)) errors.push(`${path}.generatedAt 必须是 ISO 日期`);
  return true;
}

function validateEvent(value: unknown, path: string, errors: string[]): value is AgentEvent {
  if (!isRecord(value)) { errors.push(`${path} 必须是对象`); return false; }
  for (const key of ['id', 'runId', 'type', 'timestamp']) if (typeof value[key] !== 'string' || !value[key]) errors.push(`${path}.${key} 必须是非空文本`);
  if (!Number.isInteger(value.sequence) || Number(value.sequence) < 0) errors.push(`${path}.sequence 必须是非负整数`);
  if (!isAgentEventType(value.type)) errors.push(`${path}.type 不是已知事件类型`);
  if (!isDateTime(value.timestamp)) errors.push(`${path}.timestamp 必须是 ISO 日期`);
  if (value.status !== undefined && !isAgentStatus(value.status)) errors.push(`${path}.status 不是已知运行状态`);
  if (value.tool !== undefined && !isTool(value.tool)) errors.push(`${path}.tool 不是白名单工具`);
  if (value.evidence !== undefined && (!Array.isArray(value.evidence) || value.evidence.some((item) => !isRecord(item) || typeof item.label !== 'string' || typeof item.detail !== 'string'))) errors.push(`${path}.evidence 格式无效`);
  if (value.delta !== undefined && typeof value.delta !== 'string') errors.push(`${path}.delta 必须是文本`);
  if (value.card !== undefined && !isRecord(value.card)) errors.push(`${path}.card 必须是对象`);
  if (value.cardPatch !== undefined && !isRecord(value.cardPatch)) errors.push(`${path}.cardPatch 必须是对象`);
  if (value.provenance !== undefined) validateProvenance(value.provenance, `${path}.provenance`, errors);
  return errors.length === 0;
}

/** Runtime guard for approval envelopes before they reach a write-capable adapter. */
export function validateApprovalRequest(value: unknown): SchemaValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['approval 必须是对象'] };
  for (const key of ['id', 'action', 'scope', 'idempotencyKey', 'contextFingerprint']) {
    if (typeof value[key] !== 'string' || !value[key]) errors.push(`approval.${key} 必须是非空文本`);
  }
  if (value.impactCount !== undefined && (!Number.isInteger(value.impactCount) || Number(value.impactCount) < 0)) errors.push('approval.impactCount 必须是非负整数');
  if (value.expiresAt !== undefined && !isDateTime(value.expiresAt)) errors.push('approval.expiresAt 必须是 ISO 日期');
  return { valid: errors.length === 0, errors };
}

/** Runtime boundary guard for SSE/MCP event envelopes. */
export function validateAgentEvent(value: unknown): SchemaValidationResult {
  const errors: string[] = [];
  validateEvent(value, 'event', errors);
  return { valid: errors.length === 0, errors };
}

/** Runtime guard for a persisted/replayed AgentRun. */
export function validateAgentRun(value: unknown): SchemaValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['run 必须是对象'] };
  for (const key of ['id', 'requestId']) if (typeof value[key] !== 'string' || !value[key]) errors.push(`run.${key} 必须是非空文本`);
  if (!isAgentStatus(value.status)) errors.push('run.status 不是已知运行状态');
  for (const key of ['startedAt', 'updatedAt']) if (!isDateTime(value[key])) errors.push(`run.${key} 必须是 ISO 日期`);
  if (!isRecord(value.context)) errors.push('run.context 必须是对象');
  const events = value.events;
  if (!Array.isArray(events)) errors.push('run.events 必须是数组');
  else events.forEach((event, index) => {
    validateEvent(event, `run.events[${index}]`, errors);
    if (isRecord(event) && event.runId !== value.id) errors.push(`run.events[${index}].runId 必须与 run.id 一致`);
    if (isRecord(event) && Number.isInteger(event.sequence) && index > 0) {
      const previous = events[index - 1];
      if (isRecord(previous) && Number.isInteger(previous.sequence) && Number(event.sequence) <= Number(previous.sequence)) errors.push(`run.events[${index}].sequence 必须递增`);
    }
  });
  if (value.response !== undefined && !isAgentResponse(value.response)) errors.push('run.response 不符合 AgentResponse 契约');
  if (value.approval !== undefined && !validateApprovalRequest(value.approval).valid) errors.push('run.approval 不符合 ApprovalRequest 契约');
  if (value.error !== undefined && (!isRecord(value.error) || typeof value.error.message !== 'string' || !value.error.message)) errors.push('run.error 格式无效');
  return { valid: errors.length === 0, errors };
}

/** Response guard with a stable result shape for server and UI callers. */
export function validateAgentResponse(value: unknown): SchemaValidationResult {
  return isAgentResponse(value) ? { valid: true, errors: [] } : { valid: false, errors: ['response 不符合 AgentResponse 契约'] };
}

