import { describe, expect, it } from 'vitest';
import {
  alertAgentContextOf,
  alertIdOf,
  alertPriorityOf,
  bulkTransitionAlertRecords,
  materializeAlertRecords,
  summarizeAlertRecords,
  transitionAlertRecord,
  type AlertRecord,
} from '../alertLifecycle';
import { buildAlerts, seriesKeyOfSku, type AlertCfg } from '../alerts';
import { dimProduct } from '../../data';

const sku = dimProduct.find((p) => p.is_own && p.industry === 'phone' && p.countries.includes('RU'))!;
const cfg: AlertCfg = {
  subs: [seriesKeyOfSku(sku.sku_id)],
  enabled: { 'price-change': true, promo: true, 'platform-gap': false, 'own-gap': false },
  thresholds: { 'price-change': 0.02, promo: 0.02, 'platform-gap': 0.02, 'own-gap': 0.15 },
  scope: { countryCode: 'RU', industry: 'phone' },
};

describe('alert lifecycle contracts', () => {
  it('materializes stable ids and keeps rule/evidence snapshots', () => {
    const alert = buildAlerts(cfg)[0];
    expect(alert).toBeTruthy();
    const [record] = materializeAlertRecords([alert], cfg, {}, { now: '2026-11-01T00:00:00.000Z' });
    expect(record.alertId).toBe(alertIdOf(alert));
    expect(record.id).toBe(record.alertId);
    expect(record.ruleSnapshot.threshold).toBe(0.02);
    expect(record.ruleVersion).toContain('price-change');
    expect(record.evidence.length).toBeGreaterThan(0);
    expect(record.activities[0].kind).toBe('triggered');
  });

  it('supports auditable transitions and rejects invalid transition', () => {
    const alert = buildAlerts(cfg)[0];
    const [record] = materializeAlertRecords([alert], cfg, {}, { now: '2026-11-01T00:00:00.000Z' });
    const acknowledged = transitionAlertRecord(record, { kind: 'acknowledge' }, '2026-11-01T01:00:00.000Z')!;
    expect(acknowledged.lifecycle).toBe('acknowledged');
    expect(acknowledged.activities[acknowledged.activities.length - 1]?.to).toBe('acknowledged');
    const investigating = transitionAlertRecord(acknowledged, { kind: 'investigate' }, '2026-11-01T01:30:00.000Z')!;
    const resolved = transitionAlertRecord(investigating, { kind: 'resolve', resolutionCode: 'fixed' }, '2026-11-01T02:00:00.000Z')!;
    expect(resolved.lifecycle).toBe('resolved');
    expect(resolved.resolutionCode).toBe('fixed');
    expect(transitionAlertRecord(resolved, { kind: 'action_required' })).toBeNull();
  });

  it('bulk transitions are partial on conflicts and summarize states', () => {
    const alerts = buildAlerts({ ...cfg, thresholds: { ...cfg.thresholds, 'price-change': 0.05 } }).slice(0, 2);
    const records = materializeAlertRecords(alerts, cfg, {}, { now: '2026-11-01T00:00:00.000Z' });
    const firstResolved = transitionAlertRecord(
      transitionAlertRecord(
        transitionAlertRecord(records[0], { kind: 'acknowledge' }, '2026-11-01T01:00:00.000Z')!,
        { kind: 'investigate' },
        '2026-11-01T01:30:00.000Z',
      )!,
      { kind: 'resolve', resolutionCode: 'fixed' },
      '2026-11-01T01:45:00.000Z',
    )!;
    const result = bulkTransitionAlertRecords([firstResolved, records[1]], { kind: 'acknowledge' }, '2026-11-01T02:00:00.000Z');
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toContain(firstResolved.alertId);
    const summary = summarizeAlertRecords([firstResolved, result.records[0]]);
    expect(summary.resolved).toBe(1);
    expect(summary.pending).toBe(1);
  });

  it('exposes structured Agent context with evidence and rule versions', () => {
    const alert = buildAlerts(cfg)[0];
    const [record] = materializeAlertRecords([alert], cfg, {}, { now: '2026-11-01T00:00:00.000Z' });
    const context = alertAgentContextOf(record);
    expect(context.alertId).toBe(record.alertId);
    expect(context.evidenceIds).toEqual(record.evidence.map((item) => item.id));
    expect(context.ruleVersion).toBe(record.ruleVersion);
    expect(alertPriorityOf(record.priorityScore)).toBe(record.priority);
  });

  it('preserves the trigger-time rule snapshot after a later config change', () => {
    const alert = buildAlerts(cfg)[0];
    const [record] = materializeAlertRecords([alert], cfg, {}, { now: '2026-11-01T00:00:00.000Z' });
    const changedCfg = { ...cfg, thresholds: { ...cfg.thresholds, 'price-change': 0.15 } };
    const [replayed] = materializeAlertRecords([alert], changedCfg, { [record.alertId]: record }, { now: '2026-11-02T00:00:00.000Z' });
    expect(replayed.ruleSnapshot.threshold).toBe(record.ruleSnapshot.threshold);
    expect(replayed.ruleVersion).toBe(record.ruleVersion);
  });
});
