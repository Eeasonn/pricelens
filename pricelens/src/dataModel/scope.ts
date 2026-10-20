import { dimProduct, dimRegion } from '../data';
import type { DataScope, Industry } from './types';

export const INDUSTRY_LABELS: Record<Industry, string> = {
  phone: '手机',
  tablet: '平板',
  wearable: '穿戴',
  audio: '音频',
  iot: 'IoT',
  pc: 'PC',
};

/** 筛选器可选产业（2026-10-20 评审：IoT/PC 暂不关注——数据保留在事实表，不进产业选项） */
export const INDUSTRY_ORDER: Industry[] = ['phone', 'tablet', 'wearable', 'audio'];

export const DEFAULT_DATA_SCOPE: DataScope = { countryCode: 'RU', industry: 'phone' };

/** 国家启用（有事实行）且该国存在该产业的我司产品 */
export function isDataScopeSupported(scope: DataScope): boolean {
  return (
    dimRegion.some((r) => r.country_code === scope.countryCode && r.enabled) &&
    dimProduct.some((p) => p.is_own && p.industry === scope.industry && p.countries.includes(scope.countryCode))
  );
}

/** 国家内有我司产品的产业列表（按固定顺序） */
export function industriesOfCountry(countryCode: string): Industry[] {
  const set = new Set<Industry>();
  for (const p of dimProduct) if (p.is_own && p.countries.includes(countryCode)) set.add(p.industry);
  return INDUSTRY_ORDER.filter((i) => set.has(i));
}

export function normalizeDataScope(scope: DataScope): DataScope {
  if (isDataScopeSupported(scope)) return { countryCode: scope.countryCode, industry: scope.industry };
  const inds = industriesOfCountry(scope.countryCode);
  if (inds.length) return { countryCode: scope.countryCode, industry: inds[0] };
  return DEFAULT_DATA_SCOPE;
}

export function scopeLabels(scope: DataScope): { region: string; country: string; industry: string } {
  const country = dimRegion.find((r) => r.country_code === scope.countryCode);
  return {
    region: country?.region_name ?? '',
    country: country?.country_name ?? scope.countryCode,
    industry: INDUSTRY_LABELS[scope.industry] ?? scope.industry,
  };
}
