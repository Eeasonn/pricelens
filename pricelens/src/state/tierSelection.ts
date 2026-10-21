// ============================================================
// 按档位主体模式的有效选择集：档位 → 该档全部华为配置按型号成卡，
// 每卡对比区 = 各自配置的分国对标并集（配额收口）。
// 看板与筛选条共用（看板取有效 mains 画图，筛选条取对比数做摘要），
// 纯计算无副作用；配置 skuIds 取最低价颜色，与手动勾选的默认行为一致。
// ============================================================
import { dimProduct } from '../data';
import { getEffectiveBenchmark } from './configStore';
import { lowestPriceColorSku, tierOf } from '../dataModel/aggregate';
import { getCurrentCountry } from './currentScope';
import type { FiltersState, MainProduct, ProductSelection } from './filtersTypes';
import { cardQuota, selKey } from './mainSelection';

const modelIdOfSku = (skuId: string): string => skuId.split('__')[0];

/** 档位在当前产业下无华为产品时返回 null（调用方回退按产品选择） */
export function tierSubjectSelections(
  industry: FiltersState['industry'],
  tier: string,
  countryCode: string = getCurrentCountry(),
): MainProduct[] | null {
  const configs: ProductSelection[] = [];
  const keys = new Set<string>();
  for (const p of dimProduct) {
    if (!p.is_own || p.industry !== industry || !p.countries.includes(countryCode) || tierOf(p, countryCode) !== tier) continue;
    const key = `${modelIdOfSku(p.sku_id)}|${p.romram}`;
    if (keys.has(key)) continue;
    keys.add(key);
    const skuId = lowestPriceColorSku(modelIdOfSku(p.sku_id), p.romram);
    configs.push({ modelId: modelIdOfSku(p.sku_id), romram: p.romram, skuIds: skuId ? [skuId] : [p.sku_id] });
  }
  if (configs.length === 0) return null;

  // 按型号成卡（保序）
  const cards: MainProduct[] = [];
  const byModel = new Map<string, MainProduct>();
  for (const sel of configs) {
    let card = byModel.get(sel.modelId);
    if (!card) {
      card = { modelId: sel.modelId, configs: [], compares: [] };
      byModel.set(sel.modelId, card);
      cards.push(card);
    }
    card.configs.push(sel);
  }

  // 每卡对比区 = 该卡各配置的分国对标并集（生效矩阵，sort 序），配额截断
  const configKeySet = keys;
  const bySku = new Map(dimProduct.map((p) => [p.sku_id, p]));
  for (const card of cards) {
    const ownKeys = new Set(card.configs.map(selKey));
    const seen = new Set<string>();
    const rows = getEffectiveBenchmark()
      .filter((b) => (b.country_code == null || b.country_code === countryCode)
        && configKeySet.has(`${b.own_model_id}|${b.own_romram}`)
        && ownKeys.has(`${b.own_model_id}|${b.own_romram}`))
      .sort((a, b) => a.sort - b.sort);
    for (const b of rows) {
      const p = bySku.get(b.competitor_sku_id);
      if (!p) continue;
      const key = `${modelIdOfSku(p.sku_id)}|${p.romram}`;
      if (seen.has(key) || ownKeys.has(key)) continue;
      seen.add(key);
      if (card.compares.length >= cardQuota(card)) break;
      const skuId = lowestPriceColorSku(modelIdOfSku(p.sku_id), p.romram);
      card.compares.push({ modelId: modelIdOfSku(p.sku_id), romram: p.romram, skuIds: skuId ? [skuId] : [p.sku_id] });
    }
  }
  return cards;
}
