import type { FactPriceMonthly, MonthlyPriceType, MonthlyReviewStatus } from './types';
import type { FinancingTerm } from './marketProfile';

export interface MonthlyFactQuery {
  countryCode: string;
  financingTerm: FinancingTerm | null;
  includePrepaid?: boolean;
  includeNoPrice?: boolean;
  reviewStatuses?: readonly MonthlyReviewStatus[];
}

/**
 * Published monthly facts are term-safe by construction. Installment facts
 * require an explicit 24/36 selection. Prepaid and no-price rows remain
 * opt-in so they cannot leak into installment price calculations.
 */
export function monthlyFactsFor(
  rows: readonly FactPriceMonthly[],
  query: MonthlyFactQuery,
): FactPriceMonthly[] {
  const allowedStatuses = query.reviewStatuses ?? ['PASS'];
  return rows.filter((row) => {
    if (row.country_code !== query.countryCode) return false;
    if (!allowedStatuses.includes(row.review_status)) return false;
    if (row.price_type === 'installment') {
      return query.financingTerm != null && row.term_months === query.financingTerm;
    }
    if (row.price_type === 'prepaid') return query.includePrepaid === true;
    return query.includeNoPrice === true;
  });
}

export function monthlyPriceTypeLabel(priceType: MonthlyPriceType): string {
  if (priceType === 'installment') return '月供';
  if (priceType === 'prepaid') return '买断';
  return '无价格';
}

export function publishedMonthlyRangeOf(
  rows: readonly FactPriceMonthly[],
  countryCode: string,
): { start: string; end: string } | null {
  const periods = rows
    .filter((row) => row.country_code === countryCode && row.review_status === 'PASS')
    .map((row) => row.period_id)
    .sort();
  if (!periods.length) return null;
  return { start: periods[0], end: periods[periods.length - 1] };
}
