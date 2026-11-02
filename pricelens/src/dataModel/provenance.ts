/**
 * Shared source / freshness contract.
 *
 * Every surface that exposes a derived number should be able to answer four
 * questions without inspecting the implementation: what source produced it,
 * what data quality state it has, what period it is true as of, and whether a
 * refresh is currently usable.  The contract is intentionally small so a real
 * adapter can replace the demo fixtures without changing page components.
 */

export type ProvenanceDataStatus = 'real' | 'simulated' | 'mixed';

export type FreshnessState = 'fresh' | 'stale' | 'missing' | 'error' | 'unknown';

export type DataSourceKind = 'internal_fact' | 'adapter' | 'demo_seed' | 'external' | 'model';

export interface DataSourceDescriptor {
  id: string;
  label: string;
  kind: DataSourceKind;
  /** Human readable source version or batch id when one exists. */
  version?: string;
  /** Optional deep link into a source registry or evidence page. */
  uri?: string;
}

export interface DataCoverage {
  from: string;
  to: string;
  grain?: 'week' | 'day' | 'month' | 'event' | 'snapshot';
  records?: number;
}

export interface DataProvenance {
  dataStatus: ProvenanceDataStatus;
  source: DataSourceDescriptor;
  /** The latest period or observation date represented by the result. */
  asOf: string | null;
  /** Time at which the adapter or ingest job refreshed this result. */
  refreshedAt?: string;
  freshness: FreshnessState;
  coverage?: DataCoverage;
  notes?: string[];
}

export type DataResult<T> =
  | { state: 'ready'; data: T; provenance: DataProvenance }
  | {
      state: 'empty';
      provenance: DataProvenance;
      reason: 'no_data' | 'out_of_scope' | 'invalid_dataset' | 'not_configured';
      message: string;
    }
  | {
      state: 'error';
      provenance: DataProvenance;
      error: { code: string; message: string; retryable: boolean };
    };

/** Adapter boundary shared by forecast, alerts and future intelligence feeds. */
export interface DataAdapter<Query, Payload> {
  readonly id: string;
  load(query?: Query): DataResult<Payload> | Promise<DataResult<Payload>>;
}

export const provenanceDataStatusLabel: Record<ProvenanceDataStatus, string> = {
  real: '真实',
  simulated: '模拟',
  mixed: '混合',
};

export const freshnessLabel: Record<FreshnessState, string> = {
  fresh: '最新',
  stale: '有延迟',
  missing: '缺采',
  error: '读取失败',
  unknown: '状态待确认',
};

/** One compact line suitable for page-level source metadata. */
export function provenanceSummary(provenance: DataProvenance): string {
  const asOf = provenance.asOf ? `截至 ${provenance.asOf}` : '截至 —';
  return `${provenance.source.label} · ${asOf} · ${provenanceDataStatusLabel[provenance.dataStatus]} · ${freshnessLabel[provenance.freshness]}`;
}

export const DEMO_FORECAST_PROVENANCE: DataProvenance = {
  dataStatus: 'simulated',
  source: {
    id: 'forecast-demo-seed',
    label: '量价预测演示种子',
    kind: 'demo_seed',
    version: 'simple-demo-v1',
  },
  asOf: 'W10',
  refreshedAt: '2026-11-01T00:00:00Z',
  freshness: 'unknown',
  coverage: { from: 'W1', to: 'W24', grain: 'week', records: 24 },
  notes: ['历史段为模拟观测，预测窗口为确定性模型点估计。'],
};

export const DEMO_FULL_FORECAST_PROVENANCE: DataProvenance = {
  dataStatus: 'simulated',
  source: {
    id: 'forecast-demo-adapter-seed',
    label: '完整 Adapter 演示种子',
    kind: 'adapter',
    version: 'simple-full-v1',
  },
  asOf: 'W104',
  refreshedAt: '2026-11-02T00:00:00Z',
  freshness: 'unknown',
  coverage: { from: 'W1', to: 'W112', grain: 'week', records: 112 },
  notes: ['用于拟合和验模；学习结果通过质量门槛后才可进入预测。'],
};

/** Price facts are real, but the current batch is intentionally marked delayed. */
export const REAL_ALERT_PROVENANCE: DataProvenance = {
  dataStatus: 'real',
  source: {
    id: 'fact-price-weekly',
    label: '周度平台价格事实表',
    kind: 'internal_fact',
    version: '2026-W42',
  },
  asOf: '2026-W42',
  refreshedAt: '2026-10-15T06:00:00+08:00',
  freshness: 'stale',
  coverage: { from: '2026-W19', to: '2026-W42', grain: 'week', records: 84841 },
  notes: ['价格事实来自采集批次；无价格周保持缺采，不插值。'],
};

export const DEMO_INTELLIGENCE_PROVENANCE: DataProvenance = {
  dataStatus: 'simulated',
  source: {
    id: 'intelligence-demo-seed',
    label: '情报中心演示序列',
    kind: 'demo_seed',
    version: 'intel-demo-v1',
  },
  asOf: '2026-10-30',
  refreshedAt: '2026-10-30T18:00:00+08:00',
  freshness: 'stale',
  coverage: { from: '2026-W19', to: '2026-W42', grain: 'week' },
  notes: ['汇率、市场和成本内容为演示映射，不能作为实时事实。'],
};

export const missingProvenance = (source: DataSourceDescriptor, note: string): DataProvenance => ({
  dataStatus: 'mixed',
  source,
  asOf: null,
  freshness: 'missing',
  notes: [note],
});

export const errorProvenance = (source: DataSourceDescriptor, note: string): DataProvenance => ({
  dataStatus: 'mixed',
  source,
  asOf: null,
  freshness: 'error',
  notes: [note],
});
