// ============================================================
// 本币口径注册（2026-10-20 真实数据接入起）：
// 真实事实行自带行内汇率，USD 值在装载层按行折算，不再存在「用户参考汇率」；
// 本模块只维护「当前国家本币」这一个展示态，供图表 Y 轴档位锚定（perUsdOf）与金额格式化
// （formatPrice 本币符号）读取。FiltersProvider 在国家变更时写入。
// ============================================================
import { currencyOfCountry, latestPerUsd } from '../data';

let currentLocalCurrency = 'RUB';

/** 当前国家本币（ISO 4217） */
export function getLocalCurrency(): string {
  return currentLocalCurrency;
}

/** 国家切换时由 FiltersProvider 调用 */
export function setLocalCurrencyByCountry(countryCode: string): void {
  currentLocalCurrency = currencyOfCountry(countryCode);
}

/** 每 1 USD 兑当前本币（最新月份中位数）；USD 本币国家回 1 */
export function getFxRate(): number {
  return latestPerUsd(currentLocalCurrency);
}

/** 指定币种每 1 USD 兑本币 */
export function perUsdOfCurrency(currency: string): number {
  return latestPerUsd(currency);
}
