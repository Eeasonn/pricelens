import type { CurrencyMode, FactPriceWeekly } from './types';

/**
 * 事实行 → 显示币种数值。真实数据每行自带汇率，USD 值已在装载层按行折算（price_usd / rrp_usd），
 * 本币直接取本币列；不再依赖全局参考汇率。
 */
export function displayPriceOf(row: FactPriceWeekly, currency: CurrencyMode): number | null {
  return currency === 'usd' ? row.price_usd : row.price_local;
}

/** RRP = 平台划线价（2026-10-27 源表清洗后官网模拟价退役，rrp 即唯一账面价口径） */
export function displayRrpOf(row: FactPriceWeekly, currency: CurrencyMode): number | null {
  if (currency === 'usd') return row.rrp_usd;
  return row.rrp_local;
}

/** 把一个本币数值按汇率折到显示币种（事实行外的衍生值用） */
export function displayLocalValue(value: number | null, currency: CurrencyMode, perUsd: number): number | null {
  if (value == null) return null;
  return currency === 'usd' ? Math.round(value / perUsd) : value;
}
