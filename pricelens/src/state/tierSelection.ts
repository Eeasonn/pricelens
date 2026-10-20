// ============================================================
// 按档位主体模式的有效选择集：档位 → 该档全部我司配置 + 各自对标竞品。
// 看板与筛选条共用（看板取有效 own/competitors 画图，筛选条取竞品数做摘要），
// 纯计算无副作用；配置 skuIds 取最低价颜色，与手动勾选的默认行为一致。
// ============================================================
import { dimProduct } from '../data';
import { getEffectiveBenchmark } from './configStore';
import { lowestPriceColorSku, tierOf } from '../dataModel/aggregate';
import { getCurrentCountry } from './currentScope';
import type { FiltersState, ProductSelection } from './filtersTypes';

const modelIdOfSku = (skuId: string): string => skuId.split('__')[0];

/** 档位在当前产业下无我司产品时返回 null（调用方回退按产品选择） */
export function tierSubjectSelections(
  industry: FiltersState['industry'],
  tier: string,
  countryCode: string = getCurrentCountry(),
): { own: ProductSelection[]; competitors: ProductSelection[] } | null {
  const own: ProductSelection[] = [];
  const ownKeys = new Set<string>();
  for (const p of dimProduct) {
    if (!p.is_own || p.industry !== industry || !p.countries.includes(countryCode) || tierOf(p, countryCode) !== tier) continue;
    const key = `${modelIdOfSku(p.sku_id)}|${p.romram}`;
    if (ownKeys.has(key)) continue;
    ownKeys.add(key);
    const skuId = lowestPriceColorSku(modelIdOfSku(p.sku_id), p.romram);
    own.push({ modelId: modelIdOfSku(p.sku_id), romram: p.romram, skuIds: skuId ? [skuId] : [p.sku_id] });
  }
  if (own.length === 0) return null;

  const ownKeySet = new Set(ownKeys);
  const competitors: ProductSelection[] = [];
  const compKeys = new Set<string>();
  for (const b of getEffectiveBenchmark()) {
    if (b.country_code != null && b.country_code !== countryCode) continue;
    if (!ownKeySet.has(`${b.own_model_id}|${b.own_romram}`)) continue;
    const p = dimProduct.find((r) => r.sku_id === b.competitor_sku_id);
    if (!p) continue;
    const key = `${modelIdOfSku(p.sku_id)}|${p.romram}`;
    if (compKeys.has(key)) continue;
    compKeys.add(key);
    const skuId = lowestPriceColorSku(modelIdOfSku(p.sku_id), p.romram);
    competitors.push({ modelId: modelIdOfSku(p.sku_id), romram: p.romram, skuIds: skuId ? [skuId] : [p.sku_id] });
  }
  return { own, competitors };
}
