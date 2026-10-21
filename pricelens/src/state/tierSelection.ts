// ============================================================
// 按档位主体模式的有效选择集：档位 → 该档全部华为配置逐配置成卡（第一百二十轮：
// 卡 = 唯一主品），每卡对比区 = 该配置的分国对标（配额收口）。
// 看板与筛选条共用（看板取有效 mains 画图，筛选条取对比数做摘要），
// 纯计算无副作用；配置 skuIds 取最低价颜色，与手动勾选的默认行为一致。
// ============================================================
import { dimProduct } from '../data';
import { getEffectiveBenchmark } from './configStore';
import { lowestPriceColorSku, tierOf } from '../dataModel/aggregate';
import { getCurrentCountry } from './currentScope';
import type { FiltersState, MainProduct, ProductSelection } from './filtersTypes';
import { cardQuota, MAINS_CAP, selKey } from './mainSelection';

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

  // 逐配置成卡（保序，卡数封顶）；卡 id 用确定性键——档位模式不持久化，纯派生
  const bySku = new Map(dimProduct.map((p) => [p.sku_id, p]));
  const bench = getEffectiveBenchmark();
  return configs.slice(0, MAINS_CAP).map((sel) => {
    const card: MainProduct = { id: `tier-${selKey(sel)}`, main: sel, compares: [] };
    const ownKey = selKey(sel);
    const seen = new Set<string>();
    const rows = bench
      .filter((b) => (b.country_code == null || b.country_code === countryCode)
        && `${b.own_model_id}|${b.own_romram}` === `${sel.modelId}|${sel.romram}`)
      .sort((a, b) => a.sort - b.sort);
    for (const b of rows) {
      const p = bySku.get(b.competitor_sku_id);
      if (!p) continue;
      const comp: ProductSelection = { modelId: modelIdOfSku(p.sku_id), romram: p.romram, skuIds: [p.sku_id] };
      const key = selKey(comp);
      if (seen.has(key) || key === ownKey) continue;
      seen.add(key);
      if (card.compares.length >= cardQuota(card)) break;
      const skuId = lowestPriceColorSku(comp.modelId, comp.romram);
      card.compares.push({ ...comp, skuIds: skuId ? [skuId] : [p.sku_id] });
    }
    return card;
  });
}
