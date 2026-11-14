import { dimProduct, factPriceWeekly } from '../data';
import { marketDataProfileOf } from './marketProfile';
import type { DataProvenance } from './provenance';
import type { DataScope, DimProduct, FactPriceWeekly } from './types';

export const weeklyPriceDataVersion = __PRICE_WEEKLY_DATA_VERSION__;
export const monthlyPriceDataVersion = __PRICE_MONTHLY_DATA_VERSION__;

export function priceDataVersionOf(scope: Pick<DataScope, 'countryCode'>): string {
  return marketDataProfileOf(scope.countryCode).sourceKind === 'operator-booklet-monthly'
    ? monthlyPriceDataVersion
    : weeklyPriceDataVersion;
}

const weekLabel = (weekId: string): string => `${weekId.slice(0, 4)}-W${weekId.slice(4)}`;
const scopeKey = (scope: DataScope): string => `${scope.countryCode}|${scope.industry}`;

/**
 * Country/industry source coverage, not a count of alerts or filtered chart points.
 * Use only the runtime's published weekly facts. An empty subscription or a rule
 * that never fires must not make an existing source appear to have no data.
 * No machine-readable ingest timestamp/SLA is available, so freshness is unknown.
 */
export function createWeeklyPriceProvenanceLookup(
  facts: readonly Pick<FactPriceWeekly, 'sku_id' | 'country_code' | 'week_id' | 'price_local' | 'crawl_status'>[],
  products: readonly Pick<DimProduct, 'sku_id' | 'industry'>[],
  dataVersion: string,
): (scope: DataScope) => DataProvenance {
  const industryBySku = new Map(products.map((product) => [product.sku_id, product.industry]));
  const coverage = new Map<string, { from: string; to: string; records: number }>();
  for (const fact of facts) {
    const industry = industryBySku.get(fact.sku_id);
    if (!industry || fact.crawl_status !== 'ok' || fact.price_local == null || !Number.isFinite(fact.price_local)) continue;
    const key = scopeKey({ countryCode: fact.country_code, industry });
    const current = coverage.get(key);
    if (current) {
      if (fact.week_id < current.from) current.from = fact.week_id;
      if (fact.week_id > current.to) current.to = fact.week_id;
      current.records += 1;
    } else coverage.set(key, { from: fact.week_id, to: fact.week_id, records: 1 });
  }
  const cache = new Map<string, DataProvenance>();
  return (scope) => {
    const key = scopeKey(scope);
    const cached = cache.get(key);
    if (cached) return cached;
    const available = coverage.get(key);
    const result: DataProvenance = {
      dataStatus: 'real',
      source: { id: 'fact-price-weekly', label: '周度平台价格事实表', kind: 'internal_fact', version: dataVersion },
      asOf: available ? weekLabel(available.to) : null,
      freshness: available ? 'unknown' : 'missing',
      ...(available ? { coverage: { from: weekLabel(available.from), to: weekLabel(available.to), grain: 'week' as const, records: available.records } } : {}),
      notes: [
        `来源覆盖按 ${scope.countryCode} × ${scope.industry} 的有效周度价格事实统计；不是触发条数或单条预警的输入行数。`,
        '缺价周不插值；未接入可核验的刷新批次时间与时效规则，刷新状态待确认。',
      ],
    };
    cache.set(key, result);
    return result;
  };
}

// Facts are immutable build inputs: aggregate once rather than rescan on every render.
export const weeklyPriceProvenanceOf = createWeeklyPriceProvenanceLookup(factPriceWeekly, dimProduct, weeklyPriceDataVersion);
