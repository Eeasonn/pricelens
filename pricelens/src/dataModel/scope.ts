import { dimProduct, dimRegion } from '../data';
import type { DataScope } from './types';

export const DEFAULT_DATA_SCOPE: DataScope = { countryCode: 'RU', industry: 'phone' };

export function isDataScopeSupported(scope: DataScope): boolean {
  return dimRegion.some((r) => r.country_code === scope.countryCode && r.enabled)
    && dimProduct.some((p) => p.industry === scope.industry);
}

export function normalizeDataScope(scope: DataScope): DataScope {
  return isDataScopeSupported(scope) ? { countryCode: scope.countryCode, industry: scope.industry } : DEFAULT_DATA_SCOPE;
}

export function scopeLabels(scope: DataScope): { region: string; country: string; industry: string } {
  const country = dimRegion.find((r) => r.country_code === scope.countryCode);
  return {
    region: country?.region_name ?? '',
    country: country?.country_name ?? scope.countryCode,
    industry: scope.industry === 'phone' ? '手机' : scope.industry,
  };
}
