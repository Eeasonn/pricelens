import { describe, expect, it } from 'vitest';
import { buildMonthlySeries } from '../aggregate';
import { monthlyFactsFor, monthlyPriceTypeLabel, publishedMonthlyRangeOf } from '../monthlyFacts';
import type { FactPriceMonthly } from '../types';

const row = (overrides: Partial<FactPriceMonthly> = {}): FactPriceMonthly => ({
  offer_id: 'offer-1',
  period_id: '202601',
  country_code: 'ZA',
  platform: 'VODACOM SHOP',
  store_type: '1P',
  brand: 'HUAWEI',
  model: 'Nova',
  sku_spec: '12+256',
  price_type: 'installment',
  price_local: 100,
  currency: 'ZAR',
  fx_rate: 18,
  price_usd: 5.56,
  rrp_local: null,
  term_months: 24,
  source_document: 'booklet.xlsx',
  source_page: 'p1',
  source_sha256: 'sha',
  review_status: 'PASS',
  gate_reasons: [],
  match_status: 'matched-spec-complete',
  ...overrides,
});

describe('monthly booklet facts', () => {
  it('requires an explicit matching installment term', () => {
    const facts = [row(), row({ offer_id: 'offer-2', term_months: 36 })];
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: 'installment', financingTerms: [] })).toHaveLength(2);
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: 'installment', financingTerms: [24] }).map((x) => x.offer_id)).toEqual(['offer-1']);
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: 'installment', financingTerms: [36] }).map((x) => x.offer_id)).toEqual(['offer-2']);
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: 'installment', financingTerms: [24, 36] })).toHaveLength(2);
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: 'prepaid', financingTerms: [] })).toEqual([]);
  });

  it('keeps prepaid and no-price rows out unless explicitly requested', () => {
    const facts = [row({ price_type: 'prepaid', term_months: null }), row({ offer_id: 'offer-3', price_type: 'no-price', price_local: null, price_usd: null, term_months: null })];
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: 'installment', financingTerms: [24] })).toEqual([]);
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: 'prepaid', financingTerms: [] })).toHaveLength(1);
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: null, financingTerms: [], includePrepaid: true })).toHaveLength(1);
    expect(monthlyFactsFor(facts, { countryCode: 'ZA', financingType: null, financingTerms: [], includeNoPrice: true })).toHaveLength(1);
  });

  it('defaults to published review status only', () => {
    expect(monthlyFactsFor([row({ review_status: 'PENDING' })], { countryCode: 'ZA', financingType: 'installment', financingTerms: [24] })).toEqual([]);
    expect(monthlyFactsFor([row({ review_status: 'PENDING' })], { countryCode: 'ZA', financingType: 'installment', financingTerms: [24], reviewStatuses: ['PENDING'] })).toHaveLength(1);
  });

  it('labels the three price types', () => {
    expect(monthlyPriceTypeLabel('installment')).toBe('月供');
    expect(monthlyPriceTypeLabel('prepaid')).toBe('买断');
    expect(monthlyPriceTypeLabel('no-price')).toBe('无价格');
  });

  it('derives the published month window without inventing missing periods', () => {
    expect(publishedMonthlyRangeOf([row({ period_id: '202601' }), row({ period_id: '202603' })], 'ZA')).toEqual({ start: '202601', end: '202603' });
    expect(publishedMonthlyRangeOf([row({ country_code: 'RU' })], 'ZA')).toBeNull();
  });

  it('builds a monthly series from the selected term without weekly interpolation', () => {
    const source = [row({
      period_id: '202605',
      sku_id: 'own-huawei-nova-14__12-256gb__black',
      model: 'nova 14',
      sku_spec: '12+256 GB',
      price_local: 100,
    })];
    const [series] = buildMonthlySeries({
      scope: { countryCode: 'ZA', industry: 'phone' },
      groups: [{ modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'], isOwn: true }],
      granularity: 'month',
      startBucket: '202605',
      endBucket: '202606',
      currency: 'local',
      agg: 'avg',
      financingType: 'installment',
      financingTerms: [24],
    }, source);
    expect(series.points.map((point) => point.price)).toEqual([100, null]);
    expect(series.points.map((point) => point.bucketId)).toEqual(['202605', '202606']);
  });
});
