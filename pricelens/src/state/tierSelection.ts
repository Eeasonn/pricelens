// ============================================================
// 档位批量动作（第一百二十三轮）：顶部「按档位」主体模式退役后，档位的核心
// 价值（一键集结）收进「选择产品」浮窗的树筛选——选中档位后提示带
// 「该档位 {我司品牌} 共 n 个配置 · 全部各成一组」。
// 本文件 = 该动作的纯计算：该档全部我司配置逐配置追加成卡（各按对标矩阵
// 补对比区、配额收口；同型号同配置已有主品的卡跳过；卡数封顶 MAINS_CAP）。
// 无副作用；配置颜色取最低价色，与手动勾选的默认行为一致。
// ============================================================
import { dimProduct } from '../data';
import { lowestPriceColorSku, tierOf } from '../dataModel/aggregate';
import { getCurrentCountry } from './currentScope';
import type { FiltersState, MainProduct, ProductSelection } from './filtersTypes';
import { autoComparesFor, MAINS_CAP, newCardId, selKey } from './mainSelection';

const modelIdOfSku = (skuId: string): string => skuId.split('__')[0];

/** 该国某产业某档位的全部配置（配置级档位去重、保维表序；ownOnly = 只取我司配置）。
 *  主品上下文的「共 n 个配置」计数与成卡、对比上下文的「全部加入对比」共用。 */
export function configsInTier(
  industry: FiltersState['industry'],
  tier: string,
  countryCode: string = getCurrentCountry(),
  ownOnly = false,
): ProductSelection[] {
  const out: ProductSelection[] = [];
  const keys = new Set<string>();
  for (const p of dimProduct) {
    if (p.industry !== industry || !p.countries.includes(countryCode)) continue;
    if (ownOnly && !p.is_own) continue;
    if (tierOf(p, countryCode) !== tier) continue;
    const key = `${modelIdOfSku(p.sku_id)}|${p.romram}`;
    if (keys.has(key)) continue;
    keys.add(key);
    const skuId = lowestPriceColorSku(modelIdOfSku(p.sku_id), p.romram);
    out.push({ modelId: modelIdOfSku(p.sku_id), romram: p.romram, skuIds: skuId ? [skuId] : [p.sku_id] });
  }
  return out;
}

/** 档位批量成卡（追加式）：该档全部我司配置逐配置追加成卡，每卡对比区 =
 *  该配置的分国对标（autoComparesFor，配额收口）；同型号同配置已有主品
 *  （含空对以外的全部现有卡）跳过；总卡数封顶 MAINS_CAP。
 *  返回 = 现有卡 + 新卡 的完整列表（无新增时原引用返回）。 */
export function appendTierCards(
  industry: FiltersState['industry'],
  tier: string,
  countryCode: string,
  existing: MainProduct[],
): MainProduct[] {
  const configs = configsInTier(industry, tier, countryCode, true);
  if (!configs.length) return existing;
  const seen = new Set(existing.flatMap((c) => (c.main ? [selKey(c.main)] : [])));
  const cards: MainProduct[] = [];
  for (const sel of configs) {
    if (existing.length + cards.length >= MAINS_CAP) break;
    const key = selKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    const card: MainProduct = { id: newCardId(), main: sel, compares: [] };
    cards.push({ ...card, compares: autoComparesFor(card) });
  }
  if (!cards.length) return existing;
  return [...existing, ...cards];
}
