import { describe, expect, it } from 'vitest';
import { factPriceMonthly, factPriceWeekly } from '../../data';
import { marketDataProfileOf } from '../marketProfile';

describe('market data profiles', () => {
  it('ZA uses monthly operator-booklet facts and requires an explicit term', () => {
    expect(marketDataProfileOf('ZA')).toMatchObject({
      sourceKind: 'operator-booklet-monthly',
      evidenceStatus: 'ready',
      granularity: 'month',
      granularityLocked: true,
      financingTerms: [24, 36, 48],
    });
  });

  it('other countries retain the weekly ecommerce profile', () => {
    expect(marketDataProfileOf('RU')).toMatchObject({
      sourceKind: 'ecommerce-weekly',
      evidenceStatus: 'ready',
      granularity: 'week',
      granularityLocked: false,
      financingTerms: [],
    });
  });

  it('does not expose legacy ZA weekly facts after booklet publication', () => {
    expect(factPriceWeekly.some((row) => row.country_code === 'ZA')).toBe(false);
  });

  it('exposes only PASS monthly facts to runtime consumers', () => {
    expect(factPriceMonthly.every((row) => row.review_status === 'PASS')).toBe(true);
  });
});
