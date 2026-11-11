/**
 * Country-specific collection semantics shared by stable and iterate.
 * ZA is sourced from operator booklets rather than weekly e-commerce pages.
 */
export type FinancingTerm = 24 | 36 | 48;
/** 付费口径：'prepaid'=先付（买断价）；'installment'=后付合约月供 */
export type FinancingType = 'prepaid' | 'installment';
/** 付费口径：数值 = 后付合约期数；'prepaid' = 先付（买断价） */
export type FinancingPlan = FinancingTerm | 'prepaid';

export interface MarketDataProfile {
  countryCode: string;
  sourceKind: 'ecommerce-weekly' | 'operator-booklet-monthly';
  evidenceStatus: 'ready' | 'pending-review';
  granularity: 'week' | 'month';
  granularityLocked: boolean;
  financingTerms: readonly FinancingTerm[];
  fixedPlatform?: string;
}

const ZA_PROFILE: MarketDataProfile = {
  countryCode: 'ZA',
  sourceKind: 'operator-booklet-monthly',
  evidenceStatus: 'ready',
  granularity: 'month',
  granularityLocked: true,
  financingTerms: [24, 36, 48],
  fixedPlatform: 'VODACOM SHOP',
};

const DEFAULT_PROFILE = (countryCode: string): MarketDataProfile => ({
  countryCode,
  sourceKind: 'ecommerce-weekly',
  evidenceStatus: 'ready',
  granularity: 'week',
  granularityLocked: false,
  financingTerms: [],
});

export function marketDataProfileOf(countryCode: string): MarketDataProfile {
  return countryCode === 'ZA' ? ZA_PROFILE : DEFAULT_PROFILE(countryCode);
}

export function isOperatorBookletMarket(countryCode: string): boolean {
  return marketDataProfileOf(countryCode).sourceKind === 'operator-booklet-monthly';
}
