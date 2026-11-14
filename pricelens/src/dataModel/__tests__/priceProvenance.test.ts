import { describe, expect, it } from 'vitest';
import { dimProduct, factPriceWeekly } from '../../data';
import { createWeeklyPriceProvenanceLookup, monthlyPriceDataVersion, priceDataVersionOf, weeklyPriceDataVersion, weeklyPriceProvenanceOf } from '../priceProvenance';
import type { DimProduct, FactPriceWeekly } from '../types';

const products: Pick<DimProduct, 'sku_id' | 'industry'>[] = [
  { sku_id: 'phone', industry: 'phone' },
  { sku_id: 'tablet', industry: 'tablet' },
];
const facts: Pick<FactPriceWeekly, 'sku_id' | 'country_code' | 'week_id' | 'price_local' | 'crawl_status'>[] = [
  { sku_id: 'phone', country_code: 'RU', week_id: '202638', price_local: 100, crawl_status: 'ok' },
  { sku_id: 'phone', country_code: 'RU', week_id: '202645', price_local: 90, crawl_status: 'ok' },
  { sku_id: 'phone', country_code: 'RU', week_id: '202646', price_local: null, crawl_status: 'ok' },
  { sku_id: 'phone', country_code: 'PL', week_id: '202646', price_local: 110, crawl_status: 'ok' },
  { sku_id: 'phone', country_code: 'PL', week_id: '202645', price_local: 112, crawl_status: 'ok' },
  { sku_id: 'tablet', country_code: 'RU', week_id: '202642', price_local: 150, crawl_status: 'ok' },
];

describe('weekly price source provenance', () => {
  it('keeps country/industry coverage separate and does not count missing prices', () => {
    const lookup = createWeeklyPriceProvenanceLookup(facts, products, 'batch-a');
    expect(lookup({ countryCode: 'RU', industry: 'phone' })).toMatchObject({
      source: { version: 'batch-a' }, asOf: '2026-W45', freshness: 'unknown',
      coverage: { from: '2026-W38', to: '2026-W45', records: 2 },
    });
    expect(lookup({ countryCode: 'PL', industry: 'phone' }).asOf).toBe('2026-W46');
    expect(lookup({ countryCode: 'RU', industry: 'tablet' }).asOf).toBe('2026-W42');
    expect(lookup({ countryCode: 'RU', industry: 'phone' }).refreshedAt).toBeUndefined();
  });

  it('follows a W45 frozen fact copy without relabeling the full source', () => {
    const current = createWeeklyPriceProvenanceLookup(facts, products, 'full-hash');
    const frozen = createWeeklyPriceProvenanceLookup(facts.filter((row) => row.week_id <= '202645'), products, 'frozen-hash');
    const scope = { countryCode: 'PL', industry: 'phone' as const };
    expect(current(scope).asOf).toBe('2026-W46');
    expect(frozen(scope)).toMatchObject({ source: { version: 'frozen-hash' }, asOf: '2026-W45', coverage: { records: 1 } });
    expect(frozen(scope).freshness).toBe('unknown');
  });

  it('reports a genuinely empty source without a made-up date, coverage or freshness', () => {
    const source = createWeeklyPriceProvenanceLookup(facts, products, 'batch-a')({ countryCode: 'CN', industry: 'phone' });
    expect(source).toMatchObject({ asOf: null, freshness: 'missing', dataStatus: 'real' });
    expect(source.coverage).toBeUndefined();
    expect(source.refreshedAt).toBeUndefined();
  });

  it('uses the runtime published facts and content versions rather than a global latest week', () => {
    const phoneIds = new Set(dimProduct.filter((row) => row.industry === 'phone').map((row) => row.sku_id));
    const ru = factPriceWeekly.filter((row) => row.country_code === 'RU' && phoneIds.has(row.sku_id) && row.price_local != null && Number.isFinite(row.price_local));
    const weeks = ru.map((row) => row.week_id).sort();
    const latest = weeks[weeks.length - 1];
    const source = weeklyPriceProvenanceOf({ countryCode: 'RU', industry: 'phone' });
    expect(source.coverage?.records).toBe(ru.length);
    expect(source.asOf).toBe(`${latest.slice(0, 4)}-W${latest.slice(4)}`);
    expect(source.source.version).toMatch(/^weekly-sha256-[a-f0-9]{64}$/);
    expect(priceDataVersionOf({ countryCode: 'RU' })).toBe(weeklyPriceDataVersion);
    expect(priceDataVersionOf({ countryCode: 'ZA' })).toBe(monthlyPriceDataVersion);
    expect(monthlyPriceDataVersion).toMatch(/^monthly-sha256-[a-f0-9]{64}$/);
    expect(weeklyPriceProvenanceOf({ countryCode: 'ZA', industry: 'phone' }).freshness).toBe('missing');
  });
});
