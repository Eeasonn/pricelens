import type { CurrencyMode, FactPriceWeekly } from './types';

/**
 * 事实行 → 显示币种数值。真实数据每行自带汇率，USD 值已在装载层按行折算（price_usd / rrp_usd），
 * 本币直接取本币列；不再依赖全局参考汇率。
 */
export function displayPriceOf(row: FactPriceWeekly, currency: CurrencyMode): number | null {
  return currency === 'usd' ? row.price_usd : row.price_local;
}

/** RRP = 官网建议零售价；缺官网价时回退平台建议零售价（划线价） */
export function displayRrpOf(row: FactPriceWeekly, currency: CurrencyMode): number | null {
  if (currency === 'usd') {
    if (row.rrp_usd != null) return row.rrp_usd;
    return row.list_price_local == null ? null : Math.round((row.list_price_local / row.fx) * 100) / 100;
  }
  return row.rrp_local ?? row.list_price_local;
}

/** 把一个本币数值按汇率折到显示币种（事实行外的衍生值用） */
export function displayLocalValue(value: number | null, currency: CurrencyMode, perUsd: number): number | null {
  if (value == null) return null;
  return currency === 'usd' ? Math.round(value / perUsd) : value;
}
