/**
 * 预警事件生命周期与处理契约。
 *
 * `buildAlerts` 仍然是唯一的确定性触发引擎；本文件只把触发结果包装成
 * 可处理、可审计、可传给 Agent 的事件记录。这样规则阈值变化不会改写历史事件，
 * 页面也能在服务端接入前先使用同一份状态机。
 */
import type { AlertCfg, AlertItem, AlertType } from './alerts';

export type AlertLifecycle =
  | 'new'
  | 'acknowledged'
  | 'investigating'
  | 'action_required'
  | 'resolved'
  | 'snoozed'
  | 'dismissed';

export type AlertPriority = 'P1' | 'P2' | 'P3';
export type AlertResolutionCode = 'fixed' | 'not_applicable' | 'false_positive' | 'data_issue';
export type AlertEvidenceStatus = 'verified' | 'partial' | 'missing' | 'stale';

export interface AlertEvidence {
  id: string;
  kind: 'fact' | 'product' | 'snapshot' | 'source';
  label: string;
  detail: string;
  status: AlertEvidenceStatus;
  capturedAt?: string;
  href?: string;
}

/** 触发时保存的规则与数据上下文；读取历史事件时不得从当前设置重建。 */
export interface AlertRuleSnapshot {
  type: AlertType;
  enabled: boolean;
  threshold: number | null;
  productOverride?: { enabled?: boolean; threshold?: number };
  scope: { countryCode: string; industry: string };
  platform: AlertCfg['platform'] | null;
  currency: AlertCfg['currency'];
  dataVersion: string;
  engineVersion: string;
  capturedAt: string;
}

export interface AlertActivity {
  id: string;
  kind: 'triggered' | 'viewed' | 'status_changed' | 'assigned' | 'snoozed' | 'note' | 'evidence';
  at: string;
  actor: string;
  detail: string;
  from?: AlertLifecycle;
  to?: AlertLifecycle;
}

/**
 * 业务层事件。AlertItem 作为事实快照嵌入，生命周期字段由用户动作驱动。
 * `alertId` 使用稳定的确定性 id，便于 URL 深链、Agent 引用和幂等写入。
 */
export interface AlertRecord extends AlertItem {
  /** API 契约兼容字段；与 alertId 同值。 */
  id: string;
  alertId: string;
  lifecycle: AlertLifecycle;
  priority: AlertPriority;
  priorityScore: number;
  ownerId?: string;
  snoozedUntil?: string;
  resolutionCode?: AlertResolutionCode;
  ruleSnapshot: AlertRuleSnapshot;
  dataVersion: string;
  ruleVersion: string;
  contextFingerprint: string;
  evidence: AlertEvidence[];
  evidenceIds: string[];
  evidenceStatus: AlertEvidenceStatus;
  activities: AlertActivity[];
  createdAt: string;
  updatedAt: string;
  /** 表示本地状态尚未同步服务端；服务端接入后可替换成 revision。 */
  syncState?: 'local' | 'synced' | 'conflict';
}

export interface AlertAgentContext {
  alertId: string;
  key: string;
  seriesKey: string;
  type: AlertType;
  weekId: string;
  beforeValue: number | null;
  currentValue: number | null;
  threshold: number | null;
  ruleVersion: string;
  dataVersion: string;
  contextFingerprint: string;
  evidenceIds: string[];
  lifecycle: AlertLifecycle;
  priority: AlertPriority;
}

export type AlertAction =
  | { kind: 'acknowledge' }
  | { kind: 'investigate' }
  | { kind: 'action_required' }
  | { kind: 'resolve'; resolutionCode?: AlertResolutionCode }
  | { kind: 'dismiss'; resolutionCode?: AlertResolutionCode }
  | { kind: 'snooze'; until: string }
  | { kind: 'unsnooze' }
  | { kind: 'reopen' }
  | { kind: 'assign'; ownerId: string | undefined }
  | { kind: 'note'; detail: string };

export const ALERT_LIFECYCLE_LABEL: Record<AlertLifecycle, string> = {
  new: '待处理',
  acknowledged: '已确认',
  investigating: '核查中',
  action_required: '需行动',
  resolved: '已解决',
  snoozed: '已静默',
  dismissed: '已忽略',
};

export const ALERT_PRIORITY_LABEL: Record<AlertPriority, string> = {
  P1: 'P1 紧急',
  P2: 'P2 重要',
  P3: 'P3 观察',
};

const TYPE_SEVERITY: Record<AlertType, number> = {
  'price-change': 30,
  promo: 22,
  'platform-gap': 26,
  'own-gap': 24,
};

const nowIso = (): string => new Date().toISOString();

/** 稳定 hash，避免把产品名直接放进深链而造成特殊字符问题。 */
function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function alertIdOf(alert: Pick<AlertItem, 'key'>): string {
  return `al_${hash(alert.key)}`;
}

export function alertRuleVersionOf(snapshot: Pick<AlertRuleSnapshot, 'type' | 'threshold' | 'dataVersion' | 'engineVersion'>): string {
  return `rule-${snapshot.engineVersion}-${snapshot.type}-${snapshot.threshold ?? 'off'}-${snapshot.dataVersion}`;
}

/** 由触发幅度、规则严重度和数据可信度组成的可解释评分（0–100）。 */
export function alertPriorityScore(alert: AlertItem, evidenceStatus: AlertEvidenceStatus = 'partial'): number {
  const magnitude = alert.type === 'promo'
    ? Math.abs(alert.promoDeltaPp ?? 0) * 2
    : Math.abs(alert.wowPct ?? alert.gapPct ?? alert.ownGapPct ?? 0) * 100;
  const evidencePenalty = evidenceStatus === 'missing' ? 8 : evidenceStatus === 'stale' ? 5 : 0;
  return Math.max(0, Math.min(100, Math.round(TYPE_SEVERITY[alert.type] + magnitude + (alert.isOwn ? 5 : 0) - evidencePenalty)));
}

export function alertPriorityOf(score: number): AlertPriority {
  return score >= 65 ? 'P1' : score >= 35 ? 'P2' : 'P3';
}

export function contextFingerprintOf(cfg: AlertCfg): string {
  const raw = JSON.stringify({
    scope: cfg.scope ?? { countryCode: 'RU', industry: 'phone' },
    currency: cfg.currency ?? 'usd',
    platform: cfg.platform ?? null,
  });
  return `ctx_${hash(raw)}`;
}

export function ruleSnapshotOf(
  alert: AlertItem,
  cfg: AlertCfg,
  options: { dataVersion?: string; engineVersion?: string; capturedAt?: string } = {},
): AlertRuleSnapshot {
  const dataVersion = options.dataVersion ?? 'local-demo';
  const engineVersion = options.engineVersion ?? 'alerts-v1';
  const productRule = cfg.products?.[alert.seriesKey];
  const type = alert.type;
  const threshold = cfg.thresholds[type] ?? null;
  const enabled = productRule?.types?.[type] ?? cfg.enabled[type];
  const productThreshold = productRule?.thresholds?.[type];
  return {
    type,
    enabled,
    threshold: productThreshold ?? threshold,
    productOverride: productRule
      ? { enabled: productRule.types?.[type], threshold: productThreshold }
      : undefined,
    scope: cfg.scope ?? { countryCode: 'RU', industry: 'phone' },
    platform: cfg.platform ?? null,
    currency: cfg.currency ?? 'usd',
    dataVersion,
    engineVersion,
    capturedAt: options.capturedAt ?? nowIso(),
  };
}

export function evidenceOf(alert: AlertItem, capturedAt = nowIso()): AlertEvidence[] {
  const evidence: AlertEvidence[] = [
    {
      id: `ev_fact_${hash(alert.key)}`,
      kind: 'fact',
      label: '触发事实',
      detail: `${alert.weekLabel}（${alert.weekId}）的${alert.type}规则输入已由确定性引擎计算`,
      status: 'verified',
      capturedAt,
    },
  ];
  if (alert.type === 'platform-gap' && alert.gapLowPlatform && alert.gapHighPlatform) {
    evidence.push({
      id: `ev_platform_${hash(alert.key)}`,
      kind: 'source',
      label: '平台价格覆盖',
      detail: `${alert.gapLowPlatform} ${alert.gapLowPrice ?? '—'} ↔ ${alert.gapHighPlatform} ${alert.gapHighPrice ?? '—'}`,
      status: 'partial',
      capturedAt,
    });
  } else if (alert.type === 'own-gap' && alert.pairLowLabel && alert.pairHighLabel) {
    evidence.push({
      id: `ev_pair_${hash(alert.key)}`,
      kind: 'fact',
      label: '档位价格对',
      detail: `${alert.pairLowLabel} ↔ ${alert.pairHighLabel}`,
      status: 'verified',
      capturedAt,
    });
  } else {
    evidence.push({
      id: `ev_product_${hash(alert.key)}`,
      kind: 'product',
      label: '商品价格事实',
      detail: `${alert.brand} ${alert.modelName} ${alert.romram}`,
      status: alert.price == null ? 'missing' : 'partial',
      capturedAt,
    });
  }
  return evidence;
}

export function toAlertRecord(
  alert: AlertItem,
  cfg: AlertCfg,
  options: {
    existing?: Partial<AlertRecord>;
    now?: string;
    dataVersion?: string;
    engineVersion?: string;
    contextFingerprint?: string;
  } = {},
): AlertRecord {
  const now = options.now ?? nowIso();
  // Once an event has been materialized, preserve its complete trigger-time
  // snapshot.  A later threshold/config change must not rewrite historical
  // evidence or make the same event appear to have used a different rule.
  const ruleSnapshot = options.existing?.ruleSnapshot ?? ruleSnapshotOf(alert, cfg, {
    dataVersion: options.dataVersion,
    engineVersion: options.engineVersion,
    capturedAt: now,
  });
  const evidence = options.existing?.evidence?.length ? options.existing.evidence : evidenceOf(alert, now);
  const evidenceStatus = options.existing?.evidenceStatus ?? (evidence.every((item) => item.status === 'verified') ? 'verified' : 'partial');
  const score = options.existing?.priorityScore ?? alertPriorityScore(alert, evidenceStatus);
  const ruleVersion = options.existing?.ruleVersion ?? alertRuleVersionOf(ruleSnapshot);
  const stableId = options.existing?.alertId ?? options.existing?.id ?? alertIdOf(alert);
  const record: AlertRecord = {
    ...alert,
    id: stableId,
    alertId: stableId,
    lifecycle: options.existing?.lifecycle ?? 'new',
    priority: options.existing?.priority ?? alertPriorityOf(score),
    priorityScore: score,
    ownerId: options.existing?.ownerId,
    snoozedUntil: options.existing?.snoozedUntil,
    resolutionCode: options.existing?.resolutionCode,
    ruleSnapshot,
    dataVersion: options.existing?.dataVersion ?? ruleSnapshot.dataVersion,
    ruleVersion,
    contextFingerprint: options.contextFingerprint ?? options.existing?.contextFingerprint ?? contextFingerprintOf(cfg),
    evidence,
    evidenceIds: options.existing?.evidenceIds?.length ? options.existing.evidenceIds : evidence.map((item) => item.id),
    evidenceStatus,
    activities: options.existing?.activities?.length
      ? options.existing.activities
      : [{ id: `act_${hash(alert.key)}`, kind: 'triggered', at: now, actor: 'system', detail: '规则扫描触发预警', to: 'new' }],
    createdAt: options.existing?.createdAt ?? now,
    updatedAt: now,
    syncState: options.existing?.syncState ?? 'local',
  };
  return record;
}

export function materializeAlertRecords(
  alerts: readonly AlertItem[],
  cfg: AlertCfg,
  existing: Readonly<Record<string, Partial<AlertRecord>>> = {},
  options: { now?: string; dataVersion?: string; engineVersion?: string; contextFingerprint?: string } = {},
): AlertRecord[] {
  return alerts.map((alert) => toAlertRecord(alert, cfg, { ...options, existing: existing[alertIdOf(alert)] })).sort(
    (a, b) => b.priorityScore - a.priorityScore || b.weekId.localeCompare(a.weekId) || a.alertId.localeCompare(b.alertId),
  );
}

const allowedTransitions: Record<AlertLifecycle, AlertLifecycle[]> = {
  new: ['acknowledged', 'snoozed', 'dismissed'],
  acknowledged: ['investigating', 'snoozed', 'dismissed', 'new'],
  investigating: ['action_required', 'resolved', 'snoozed', 'dismissed', 'acknowledged'],
  action_required: ['investigating', 'resolved', 'snoozed', 'dismissed'],
  resolved: ['new', 'investigating', 'snoozed', 'dismissed'],
  snoozed: ['new', 'acknowledged', 'investigating', 'action_required', 'resolved', 'dismissed'],
  dismissed: ['new', 'acknowledged', 'investigating', 'snoozed'],
};

function activity(record: AlertRecord, kind: AlertActivity['kind'], detail: string, now: string, from?: AlertLifecycle, to?: AlertLifecycle): AlertActivity {
  return { id: `act_${hash(`${record.alertId}|${now}|${kind}|${detail}`)}`, kind, at: now, actor: 'local-user', detail, from, to };
}

/** 应用一个可审计用户动作；非法状态迁移返回 null，交由 UI 给出冲突提示。 */
export function transitionAlertRecord(record: AlertRecord, action: AlertAction, now = nowIso()): AlertRecord | null {
  if (action.kind === 'assign') {
    return { ...record, ownerId: action.ownerId, updatedAt: now, syncState: 'local', activities: [...record.activities, activity(record, 'assigned', action.ownerId ? `已分配给 ${action.ownerId}` : '已取消负责人', now)] };
  }
  if (action.kind === 'note') {
    const detail = action.detail.trim();
    if (!detail) return null;
    return { ...record, updatedAt: now, syncState: 'local', activities: [...record.activities, activity(record, 'note', detail, now)] };
  }
  let next: AlertLifecycle = record.lifecycle;
  if (action.kind === 'acknowledge') next = 'acknowledged';
  else if (action.kind === 'investigate') next = 'investigating';
  else if (action.kind === 'action_required') next = 'action_required';
  else if (action.kind === 'resolve') next = 'resolved';
  else if (action.kind === 'dismiss') next = 'dismissed';
  else if (action.kind === 'snooze') next = 'snoozed';
  else if (action.kind === 'unsnooze') next = 'new';
  else if (action.kind === 'reopen') next = 'investigating';
  if (next !== record.lifecycle && !allowedTransitions[record.lifecycle].includes(next)) return null;
  const nextResolution = action.kind === 'resolve' || action.kind === 'dismiss' ? action.resolutionCode : action.kind === 'reopen' ? undefined : record.resolutionCode;
  const detail = action.kind === 'snooze'
    ? `已静默至 ${action.until}`
    : action.kind === 'unsnooze'
      ? '已结束静默'
      : next === 'resolved'
        ? '预警已解决'
        : next === 'dismissed'
          ? '已标记为误报/不适用'
          : next === 'investigating'
            ? '开始核查'
            : next === 'action_required'
              ? '标记为需要行动'
              : next === 'acknowledged'
                ? '已确认收到'
                : '重新打开预警';
  const nextActivity = activity(record, action.kind === 'snooze' || action.kind === 'unsnooze' ? 'snoozed' : 'status_changed', detail, now, record.lifecycle, next);
  return {
    ...record,
    lifecycle: next,
    snoozedUntil: action.kind === 'snooze' ? action.until : action.kind === 'unsnooze' || next !== 'snoozed' ? undefined : record.snoozedUntil,
    resolutionCode: nextResolution,
    updatedAt: now,
    syncState: 'local',
    activities: [...record.activities, nextActivity],
  };
}

export function bulkTransitionAlertRecords(records: readonly AlertRecord[], action: AlertAction, now = nowIso()): { records: AlertRecord[]; skipped: string[] } {
  const next: AlertRecord[] = [];
  const skipped: string[] = [];
  for (const record of records) {
    const updated = transitionAlertRecord(record, action, now);
    if (updated) next.push(updated);
    else skipped.push(record.alertId);
  }
  return { records: next, skipped };
}

export function alertAgentContextOf(record: AlertRecord): AlertAgentContext {
  const beforeValue = record.type === 'promo'
    ? record.price == null || record.promoDeltaPp == null ? null : record.price
    : record.price == null ? null : record.wowPct == null ? null : record.price / (1 + record.wowPct);
  return {
    alertId: record.alertId,
    key: record.key,
    seriesKey: record.seriesKey,
    type: record.type,
    weekId: record.weekId,
    beforeValue,
    currentValue: record.price,
    threshold: record.ruleSnapshot.threshold,
    ruleVersion: record.ruleVersion,
    dataVersion: record.dataVersion,
    contextFingerprint: record.contextFingerprint,
    evidenceIds: record.evidenceIds,
    lifecycle: record.lifecycle,
    priority: record.priority,
  };
}

export interface AlertSummary {
  pending: number;
  observing: number;
  resolved: number;
  stale: number;
}

export function summarizeAlertRecords(records: readonly AlertRecord[]): AlertSummary {
  return records.reduce<AlertSummary>((summary, record) => {
    if (record.lifecycle === 'new' || record.lifecycle === 'acknowledged' || record.lifecycle === 'action_required') summary.pending += 1;
    if (record.lifecycle === 'investigating' || record.lifecycle === 'snoozed') summary.observing += 1;
    if (record.lifecycle === 'resolved' || record.lifecycle === 'dismissed') summary.resolved += 1;
    if (record.evidenceStatus === 'stale' || record.evidenceStatus === 'missing') summary.stale += 1;
    return summary;
  }, { pending: 0, observing: 0, resolved: 0, stale: 0 });
}
