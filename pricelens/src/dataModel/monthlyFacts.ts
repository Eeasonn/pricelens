import type { FactPriceMonthly, MonthlyPriceType, MonthlyReviewStatus } from './types';
import type { FinancingPlan, FinancingTerm } from './marketProfile';

export interface MonthlyFactQuery {
  countryCode: string;
  /** 付费口径：'prepaid' = 只吃先付行；'installment' = 只吃后付行（按期数集过滤） */
  financingType: 'prepaid' | 'installment' | null;
  /** 后付期数多选（空数组 = 不限期数）；先付口径下忽略 */
  financingTerms: FinancingTerm[];
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
      return query.financingType === 'installment'
        && (query.financingTerms.length === 0
          || (row.term_months != null && query.financingTerms.includes(row.term_months)));
    }
    if (row.price_type === 'prepaid') return query.financingType === 'prepaid' || query.includePrepaid === true;
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
