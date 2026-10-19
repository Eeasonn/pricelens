import type { CurrencyMode, FactPriceWeekly } from './types';
import { getFxRate } from '../state/fx';

/**
 * Convert the canonical local-currency fact fields to the selected display currency.
 * USD facts are intentionally derived from RUB at read time so the configurable
 * reference FX rate is consistent across charts, overview, platform compare and alerts.
 */
export function displayPriceOf(row: FactPriceWeekly, currency: CurrencyMode, fxRate?: number): number | null {
  return displayLocalValue(row.discounted_price_rub, currency, fxRate);
}

export function displayRrpOf(row: FactPriceWeekly, currency: CurrencyMode, fxRate?: number): number | null {
  return displayLocalValue(row.rrp_rub, currency, fxRate);
}

export function displayLocalValue(value: number | null, currency: CurrencyMode, fxRate?: number): number | null {
  if (value == null) return null;
  return currency === 'usd' ? Math.round(value / (fxRate ?? getFxRate())) : value;
}
